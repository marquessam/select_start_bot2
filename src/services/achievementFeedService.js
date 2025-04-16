// src/services/achievementFeedService.js
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';
import EnhancedRateLimiter from './EnhancedRateLimiter.js';

const AWARD_EMOJIS = {
    MASTERY: '✨',
    BEATEN: '⭐',
    PARTICIPATION: '🏁'
};

class AchievementFeedService {
    constructor() {
        this.client = null;
        // Cache to store user profile image URLs to reduce API calls
        this.profileImageCache = new Map();
        // Cache TTL in milliseconds (30 minutes)
        this.cacheTTL = 30 * 60 * 1000;
        // Enhanced rate limiter for announcements (2 per second)
        this.announcementRateLimiter = new EnhancedRateLimiter({
            requestsPerInterval: 2,
            interval: 1500,         // Increased to 1.5 seconds between announcements (was 1000)
            maxRetries: 3,
            retryDelay: 2000        // Increased initial retry delay to 2 seconds (was 1000)
        });
        // Maximum announcements per user per check
        this.maxAnnouncementsPerUser = 5;
        // Maximum size of announcedAchievements array
        this.maxAnnouncedAchievements = 200;
        // In-memory set to prevent duplicate announcements during a session
        this.sessionAnnouncementHistory = new Set();
        // Add a flag to track if this is the first run after a restart
        this.isFirstRunAfterRestart = true;
        // Maximum number of users to process in first run after restart
        this.maxUsersAfterRestart = 10;
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for achievement feed service');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for achievement feed service');
            return;
        }

        try {
            // Check if we're in recovery mode
            const recoveryMode = config.discord?.achievementFeed?.recoveryMode === true;
            
            if (recoveryMode) {
                console.log('⚠️ RUNNING IN RECOVERY MODE - Limited processing enabled');
                // In recovery mode, process fewer users and skip award checks
                await this.checkForNewAchievementsInRecoveryMode();
            } else if (this.isFirstRunAfterRestart) {
                console.log('First run after restart - using careful processing mode');
                await this.checkForNewAchievementsAfterRestart();
                this.isFirstRunAfterRestart = false;
            } else {
                console.log('Starting normal achievement feed service check...');
                await this.checkForNewAchievements();
            }
        } catch (error) {
            console.error('Error in achievement feed service:', error);
        }
    }

    async testAchievementChannel() {
        if (!this.client) {
            console.error('Discord client not set');
            return false;
        }

        try {
            // Get the channel
            const channel = await this.getAnnouncementChannel();
            if (!channel) {
                console.error('Could not get announcement channel');
                return false;
            }

            console.log(`Found announcement channel: ${channel.name} (ID: ${channel.id})`);
            
            // Test sending a message
            try {
                const testMessage = await channel.send('🔍 Achievement feed test message - please delete');
                console.log(`Successfully sent test message to channel ${channel.name}, message ID: ${testMessage.id}`);
                
                // Delete the test message after a moment
                setTimeout(async () => {
                    try {
                        await testMessage.delete();
                        console.log('Test message deleted');
                    } catch (deleteError) {
                        console.log('Could not delete test message:', deleteError.message);
                    }
                }, 5000);
                
                return true;
            } catch (sendError) {
                console.error(`Failed to send test message to channel: ${sendError.message}`);
                console.error('This indicates a permissions issue!');
                
                // Check permissions explicitly
                const botUser = this.client.user;
                if (botUser) {
                    const permissions = channel.permissionsFor(botUser);
                    console.log('Bot permissions in channel:');
                    console.log('- Send Messages:', permissions?.has('SendMessages') ? 'YES' : 'NO');
                    console.log('- Embed Links:', permissions?.has('EmbedLinks') ? 'YES' : 'NO');
                    console.log('- View Channel:', permissions?.has('ViewChannel') ? 'YES' : 'NO');
                }
                
                return false;
            }
        } catch (error) {
            console.error('Error testing achievement channel:', error);
            return false;
        }
    }

    // Recovery mode check - more conservative processing
    async checkForNewAchievementsInRecoveryMode() {
        console.log('Running achievement check in RECOVERY MODE...');
        
        // Initialize session history from persistent storage
        await this.initializeSessionHistory();
        
        // Get current challenge
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const currentChallenge = await Challenge.findOne({
            date: {
                $gte: currentMonthStart,
                $lt: nextMonthStart
            }
        });

        // Store monthly and shadow game IDs for quick lookup
        let monthlyGameId = null;
        let shadowGameId = null;
        
        if (currentChallenge) {
            monthlyGameId = currentChallenge.monthly_challange_gameid;
            if (currentChallenge.shadow_challange_revealed) {
                shadowGameId = currentChallenge.shadow_challange_gameid;
            }
            console.log(`Current monthly game: ${monthlyGameId}, shadow game: ${shadowGameId || 'Not revealed'}`);
        } else {
            console.log('No active challenge found for the current month.');
        }
        
        // Get announcement channel
        const announcementChannel = await this.getAnnouncementChannel();
        if (!announcementChannel) {
            console.error('Announcement channel not found or inaccessible');
            return;
        }
        
        // Get max users to process in recovery mode
        const maxUsers = config.discord?.achievementFeed?.maxUsersInRecovery || 5;
        const skipAwards = config.discord?.achievementFeed?.skipAwardsInRecovery === true;
        
        // Get all users, but only process a limited number in recovery mode
        const users = await User.find({});
        console.log(`Found ${users.length} users, but will only process up to ${maxUsers} in recovery mode`);
        
        // Sort users by lastAchievementCheck to prioritize users that haven't been checked recently
        users.sort((a, b) => {
            const timeA = a.lastAchievementCheck ? a.lastAchievementCheck.getTime() : 0;
            const timeB = b.lastAchievementCheck ? b.lastAchievementCheck.getTime() : 0;
            return timeA - timeB; // Oldest first
        });
        
        // Process only the first batch of users
        const usersToProcess = users.slice(0, maxUsers);
        console.log(`Processing ${usersToProcess.length} users in recovery mode`);

        for (const user of usersToProcess) {
            try {
                // Verify user is a guild member
                const isMember = await this.isGuildMember(user.discordId);
                if (!isMember) {
                    // Skip non-members silently
                    continue;
                }
                
                // Initialize user's lastAchievementCheck if it doesn't exist
                if (!user.lastAchievementCheck) {
                    user.lastAchievementCheck = new Date(0); // Start of the epoch
                }
                
                // Initialize announcedAchievements if it doesn't exist
                if (!user.announcedAchievements) {
                    user.announcedAchievements = [];
                }
                
                const lastCheckTime = user.lastAchievementCheck.getTime();
                console.log(`[RECOVERY MODE] Checking achievements for user: ${user.raUsername} (last check: ${user.lastAchievementCheck.toISOString()})`);
                
                // Get user's recent achievements (last 20 - reduced in recovery mode)
                const recentAchievements = await retroAPI.getUserRecentAchievements(user.raUsername, 20);
                
                if (!recentAchievements || !Array.isArray(recentAchievements) || recentAchievements.length === 0) {
                    console.log(`No recent achievements found for ${user.raUsername}`);
                    continue;
                }
                
                console.log(`Found ${recentAchievements.length} recent achievements for ${user.raUsername}`);
                
                // Sort achievements by date earned (oldest first)
                recentAchievements.sort((a, b) => {
                    const dateA = new Date(a.DateEarned || a.dateEarned || 0);
                    const dateB = new Date(b.DateEarned || b.dateEarned || 0);
                    return dateA.getTime() - dateB.getTime();
                });
                
                // Filter for new achievements since last check
                const newAchievements = recentAchievements.filter(achievement => {
                    const achievementDate = new Date(achievement.DateEarned || achievement.dateEarned || 0);
                    // Consider it new if it was earned after our last check
                    return achievementDate.getTime() > lastCheckTime;
                });
                
                console.log(`Found ${newAchievements.length} new achievements since last check for ${user.raUsername}`);
                
                // Limit the size of the announcedAchievements array
                if (user.announcedAchievements.length > this.maxAnnouncedAchievements) {
                    // Keep only the most recent announcements
                    user.announcedAchievements = user.announcedAchievements.slice(-this.maxAnnouncedAchievements);
                }
                
                // Track new announcements for this user
                const newAnnouncementsIdentifiers = [];
                let announcementsQueuedForUser = 0;
                
                // Keep track of the latest achievement date to update lastAchievementCheck
                let latestAchievementDate = user.lastAchievementCheck;
                
                // Process each new achievement
                for (const achievement of newAchievements) {
                    // Limit announcements per user per check
                    if (announcementsQueuedForUser >= this.maxAnnouncementsPerUser) {
                        console.log(`Reached max announcements for ${user.raUsername}, skipping remaining achievements`);
                        break;
                    }
                    
                    // Basic null check only
                    if (!achievement) {
                        console.log('Skipping null achievement entry');
                        continue;
                    }
                    
                    // Extract achievement info with safe fallbacks
                    const gameId = achievement.GameID ? String(achievement.GameID) : "unknown";
                    const achievementId = achievement.ID || "unknown";
                    const achievementTitle = achievement.Title || "Unknown Achievement";
                    const achievementDate = new Date(achievement.DateEarned || achievement.dateEarned || 0);
                    
                    // Update the latest achievement date if this one is newer
                    if (achievementDate > latestAchievementDate) {
                        latestAchievementDate = new Date(achievementDate);
                    }
                    
                    // Enhanced logging for achievement details
                    console.log(`[RECOVERY MODE] Processing achievement: ${achievementTitle} (ID: ${achievementId}) in game ${gameId}, earned at ${achievementDate.toISOString()}`);
                    
                    // Determine achievement type (monthly, shadow, or regular)
                    let achievementType = 'regular';
                    if (gameId === String(monthlyGameId)) {
                        achievementType = 'monthly';
                    } else if (gameId === String(shadowGameId)) {
                        achievementType = 'shadow';
                    }
                    
                    // Create unique identifiers for this achievement
                    const achievementBaseIdentifier = `${achievementType}:${gameId}:${achievementId}`;
                    const achievementIdentifier = `${achievementBaseIdentifier}:${achievementDate.getTime()}`;

                    // Check if this achievement is already in the in-memory session history
                    // Check both the full identifier and the base identifier
                    if (this.sessionAnnouncementHistory.has(achievementIdentifier) || 
                        this.sessionAnnouncementHistory.has(achievementBaseIdentifier)) {
                        console.log(`Achievement ${achievementTitle} already in session history for ${user.raUsername}, skipping`);
                        continue;
                    }

                    // Add enhanced logging to track identification process
                    console.log(`Checking achievement: ${achievementBaseIdentifier} for ${user.raUsername}`);

                    // Check if this achievement ID is in the saved history with a more precise method
                    if (achievementId !== "unknown" && user.announcedAchievements.some(id => {
                        // Split the stored ID to get the parts
                        const parts = id.split(':');
                        if (parts.length >= 3) {
                            const storedBaseId = `${parts[0]}:${parts[1]}:${parts[2]}`;
                            const isMatch = storedBaseId === achievementBaseIdentifier;
                            if (isMatch) {
                                console.log(`Found matching base identifier in persistent storage: ${storedBaseId}`);
                            }
                            return isMatch;
                        }
                        return false;
                    })) {
                        console.log(`Achievement ${achievementTitle} already announced (by ID) for ${user.raUsername}, skipping`);
                        continue;
                    }

                    console.log(`New achievement for ${user.raUsername}: ${achievementTitle} (${achievementType})`);
                    
                    // Get game info
                    let gameInfo;
                    try {
                        gameInfo = await retroAPI.getGameInfo(gameId);
                        console.log(`Retrieved game info for ${gameId}: ${gameInfo.title}`);
                    } catch (gameInfoError) {
                        console.error(`Failed to get game info for ${gameId}: ${gameInfoError.message}`);
                        // Create fallback game info
                        gameInfo = {
                            id: gameId,
                            title: achievement.GameTitle || `Game ${gameId}`,
                            consoleName: achievement.ConsoleName || "Unknown",
                            imageIcon: ""
                        };
                    }
                    
                    // Queue the achievement for announcement with rate limiter
                    await this.announcementRateLimiter.add(async () => {
                        try {
                            await this.announceAchievement(
                                announcementChannel, 
                                user, 
                                gameInfo, 
                                achievement, 
                                achievementType, 
                                gameId
                            );
                            return true;
                        } catch (error) {
                            console.error('Error in rate-limited announcement:', error);
                            return false;
                        }
                    });
                    
                    // Add to temporary list of new announcements - store both forms for robustness
                    newAnnouncementsIdentifiers.push(achievementIdentifier);
                    // Also add to session history - both forms
                    this.sessionAnnouncementHistory.add(achievementIdentifier);
                    this.sessionAnnouncementHistory.add(achievementBaseIdentifier);
                    announcementsQueuedForUser++;
                }
                
                // Update user's lastAchievementCheck timestamp
                // Add a small buffer (2 seconds) to avoid boundary issues
                const updatedLastCheckTime = new Date(latestAchievementDate.getTime() + 2000);

                // Only update the database AFTER the announcements have been successfully queued
                if (newAnnouncementsIdentifiers.length > 0 || latestAchievementDate > user.lastAchievementCheck) {
                    try {
                        if (newAnnouncementsIdentifiers.length > 0) {
                            console.log(`Adding ${newAnnouncementsIdentifiers.length} new announcements to ${user.raUsername}'s record`);
                        }
                        
                        // Use findOneAndUpdate instead of directly modifying and saving the user object
                        // This avoids version conflicts when multiple operations try to update the same document
                        const updateResult = await User.findOneAndUpdate(
                            { _id: user._id },
                            { 
                                $set: { lastAchievementCheck: updatedLastCheckTime },
                                $push: { 
                                    announcedAchievements: { 
                                        $each: newAnnouncementsIdentifiers,
                                        // Limit the array size by slicing if it gets too big 
                                        $slice: -this.maxAnnouncedAchievements
                                    } 
                                }
                            },
                            { 
                                new: true, // Return the updated document
                                runValidators: true // Run validators on update
                            }
                        );
                        
                        if (updateResult) {
                            console.log(`Successfully updated ${user.raUsername}'s record`);
                        } else {
                            console.error(`Failed to update ${user.raUsername}'s record - user may have been deleted`);
                        }
                    } catch (updateError) {
                        console.error(`Error updating user ${user.raUsername}:`, updateError);
                        // Continue processing other users
                    }
                }
                
                // Skip award checks in recovery mode if configured
                if (!skipAwards && currentChallenge) {
                    console.log(`[RECOVERY MODE] Checking awards for ${user.raUsername}`);
                    
                    if (monthlyGameId) {
                        await this.checkForGameAwards(user, announcementChannel, currentChallenge, monthlyGameId, false);
                    }
                    
                    if (shadowGameId) {
                        await this.checkForGameAwards(user, announcementChannel, currentChallenge, shadowGameId, true);
                    }
                } else if (skipAwards) {
                    console.log(`[RECOVERY MODE] Skipping award checks for ${user.raUsername} as configured`);
                }
                
                // Add a longer delay between users in recovery mode
                await new Promise(resolve => setTimeout(resolve, 5000));
                
            } catch (error) {
                console.error(`Error processing user ${user.raUsername} in recovery mode:`, error);
            }
        }
        
        console.log('Finished recovery mode check. Set ACHIEVEMENT_RECOVERY_MODE=false to return to normal operation.');
    }

    // Special method for first run after restart
    async checkForNewAchievementsAfterRestart() {
        console.log('Checking for new achievements (post-restart mode)...');
        
        // Initialize session history from persistent storage
        await this.initializeSessionHistory();
        
        // Get current challenge
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const currentChallenge = await Challenge.findOne({
            date: {
                $gte: currentMonthStart,
                $lt: nextMonthStart
            }
        });

        // Store monthly and shadow game IDs for quick lookup
        let monthlyGameId = null;
        let shadowGameId = null;
        
        if (currentChallenge) {
            monthlyGameId = currentChallenge.monthly_challange_gameid;
            if (currentChallenge.shadow_challange_revealed) {
                shadowGameId = currentChallenge.shadow_challange_gameid;
            }
            console.log(`Current monthly game: ${monthlyGameId}, shadow game: ${shadowGameId || 'Not revealed'}`);
        } else {
            console.log('No active challenge found for the current month.');
        }
        
        // Get announcement channel
        const announcementChannel = await this.getAnnouncementChannel();
        if (!announcementChannel) {
            console.error('Announcement channel not found or inaccessible');
            return;
        }
        
        // Get all users, but only process a limited number after restart
        const users = await User.find({});
        console.log(`Found ${users.length} users, but will only process up to ${this.maxUsersAfterRestart} after restart`);
        
        // Sort users by lastAchievementCheck to prioritize users that haven't been checked recently
        users.sort((a, b) => {
            const timeA = a.lastAchievementCheck ? a.lastAchievementCheck.getTime() : 0;
            const timeB = b.lastAchievementCheck ? b.lastAchievementCheck.getTime() : 0;
            return timeA - timeB; // Oldest first
        });
        
        // Process only the first batch of users
        const usersToProcess = users.slice(0, this.maxUsersAfterRestart);
        console.log(`Processing ${usersToProcess.length} users in first batch after restart`);

        for (const user of usersToProcess) {
            try {
                // Verify user is a guild member
                const isMember = await this.isGuildMember(user.discordId);
                if (!isMember) {
                    // Skip non-members silently
                    continue;
                }
                
                // Initialize user's lastAchievementCheck if it doesn't exist
                if (!user.lastAchievementCheck) {
                    user.lastAchievementCheck = new Date(0); // Start of the epoch
                }
                
                // Initialize announcedAchievements if it doesn't exist
                if (!user.announcedAchievements) {
                    user.announcedAchievements = [];
                }
                
                const lastCheckTime = user.lastAchievementCheck.getTime();
                console.log(`[POST-RESTART] Checking achievements for user: ${user.raUsername} (last check: ${user.lastAchievementCheck.toISOString()})`);
                
                // Get user's recent achievements (last 30 - reduced after restart)
                const recentAchievements = await retroAPI.getUserRecentAchievements(user.raUsername, 30);
                
                if (!recentAchievements || !Array.isArray(recentAchievements) || recentAchievements.length === 0) {
                    console.log(`No recent achievements found for ${user.raUsername}`);
                    continue;
                }
                
                console.log(`Found ${recentAchievements.length} recent achievements for ${user.raUsername}`);
                
                // Sort achievements by date earned (oldest first)
                recentAchievements.sort((a, b) => {
                    const dateA = new Date(a.DateEarned || a.dateEarned || 0);
                    const dateB = new Date(b.DateEarned || b.dateEarned || 0);
                    return dateA.getTime() - dateB.getTime();
                });
                
                // Filter for new achievements since last check
                const newAchievements = recentAchievements.filter(achievement => {
                    const achievementDate = new Date(achievement.DateEarned || achievement.dateEarned || 0);
                    // Consider it new if it was earned after our last check
                    return achievementDate.getTime() > lastCheckTime;
                });
                
                console.log(`Found ${newAchievements.length} new achievements since last check for ${user.raUsername}`);
                
                // Limit the size of the announcedAchievements array
                if (user.announcedAchievements.length > this.maxAnnouncedAchievements) {
                    // Keep only the most recent announcements
                    user.announcedAchievements = user.announcedAchievements.slice(-this.maxAnnouncedAchievements);
                }
                
                // Track new announcements for this user
                const newAnnouncementsIdentifiers = [];
                let announcementsQueuedForUser = 0;
                
                // Keep track of the latest achievement date to update lastAchievementCheck
                let latestAchievementDate = user.lastAchievementCheck;
                
                // Process each new achievement
                for (const achievement of newAchievements) {
                    // Limit announcements per user per check
                    if (announcementsQueuedForUser >= this.maxAnnouncementsPerUser) {
                        console.log(`Reached max announcements for ${user.raUsername}, skipping remaining achievements`);
                        break;
                    }
                    
                    // Basic null check only
                    if (!achievement) {
                        console.log('Skipping null achievement entry');
                        continue;
                    }
                    
                    // Extract achievement info with safe fallbacks
                    const gameId = achievement.GameID ? String(achievement.GameID) : "unknown";
                    const achievementId = achievement.ID || "unknown";
                    const achievementTitle = achievement.Title || "Unknown Achievement";
                    const achievementDate = new Date(achievement.DateEarned || achievement.dateEarned || 0);
                    
                    // Update the latest achievement date if this one is newer
                    if (achievementDate > latestAchievementDate) {
                        latestAchievementDate = new Date(achievementDate);
                    }
                    
                    // Enhanced logging for achievement details
                    console.log(`[POST-RESTART] Processing achievement: ${achievementTitle} (ID: ${achievementId}) in game ${gameId}, earned at ${achievementDate.toISOString()}`);
                    
                    // Determine achievement type (monthly, shadow, or regular)
                    let achievementType = 'regular';
                    if (gameId === String(monthlyGameId)) {
                        achievementType = 'monthly';
                    } else if (gameId === String(shadowGameId)) {
                        achievementType = 'shadow';
                    }
                    
                    // Create unique identifiers for this achievement
                    const achievementBaseIdentifier = `${achievementType}:${gameId}:${achievementId}`;
                    const achievementIdentifier = `${achievementBaseIdentifier}:${achievementDate.getTime()}`;

                    // Check if this achievement is already in the in-memory session history
                    // Check both the full identifier and the base identifier
                    if (this.sessionAnnouncementHistory.has(achievementIdentifier) || 
                        this.sessionAnnouncementHistory.has(achievementBaseIdentifier)) {
                        console.log(`Achievement ${achievementTitle} already in session history for ${user.raUsername}, skipping`);
                        continue;
                    }

                    // Add enhanced logging to track identification process
                    console.log(`Checking achievement: ${achievementBaseIdentifier} for ${user.raUsername}`);

                    // Check if this achievement ID is in the saved history with a more precise method
                    if (achievementId !== "unknown" && user.announcedAchievements.some(id => {
                        // Split the stored ID to get the parts
                        const parts = id.split(':');
                        if (parts.length >= 3) {
                            const storedBaseId = `${parts[0]}:${parts[1]}:${parts[2]}`;
                            const isMatch = storedBaseId === achievementBaseIdentifier;
                            if (isMatch) {
                                console.log(`Found matching base identifier in persistent storage: ${storedBaseId}`);
                            }
                            return isMatch;
                        }
                        return false;
                    })) {
                        console.log(`Achievement ${achievementTitle} already announced (by ID) for ${user.raUsername}, skipping`);
                        continue;
                    }

                    console.log(`New achievement for ${user.raUsername}: ${achievementTitle} (${achievementType})`);
                    
                    // Get game info
                    let gameInfo;
                    try {
                        gameInfo = await retroAPI.getGameInfo(gameId);
                        console.log(`Retrieved game info for ${gameId}: ${gameInfo.title}`);
                    } catch (gameInfoError) {
                        console.error(`Failed to get game info for ${gameId}: ${gameInfoError.message}`);
                        // Create fallback game info
                        gameInfo = {
                            id: gameId,
                            title: achievement.GameTitle || `Game ${gameId}`,
                            consoleName: achievement.ConsoleName || "Unknown",
                            imageIcon: ""
                        };
                    }
                    
                    // Queue the achievement for announcement with rate limiter
                    await this.announcementRateLimiter.add(async () => {
                        try {
                            await this.announceAchievement(
                                announcementChannel, 
                                user, 
                                gameInfo, 
                                achievement, 
                                achievementType, 
                                gameId
                            );
                            return true;
                        } catch (error) {
                            console.error('Error in rate-limited announcement:', error);
                            return false;
                        }
                    });
                    
                    // Add to temporary list of new announcements - store both forms for robustness
                    newAnnouncementsIdentifiers.push(achievementIdentifier);
                    // Also add to session history - both forms
                    this.sessionAnnouncementHistory.add(achievementIdentifier);
                    this.sessionAnnouncementHistory.add(achievementBaseIdentifier);
                    announcementsQueuedForUser++;
                }
                
                // Update user's lastAchievementCheck timestamp
                // Add a small buffer (2 seconds) to avoid boundary issues
                const updatedLastCheckTime = new Date(latestAchievementDate.getTime() + 2000);

                // Only update the database AFTER the announcements have been successfully queued
                if (newAnnouncementsIdentifiers.length > 0 || latestAchievementDate > user.lastAchievementCheck) {
                    try {
                        if (newAnnouncementsIdentifiers.length > 0) {
                            console.log(`Adding ${newAnnouncementsIdentifiers.length} new announcements to ${user.raUsername}'s record`);
                        }
                        
                        // Use findOneAndUpdate instead of directly modifying and saving the user object
                        // This avoids version conflicts when multiple operations try to update the same document
                        const updateResult = await User.findOneAndUpdate(
                            { _id: user._id },
                            { 
                                $set: { lastAchievementCheck: updatedLastCheckTime },
                                $push: { 
                                    announcedAchievements: { 
                                        $each: newAnnouncementsIdentifiers,
                                        // Limit the array size by slicing if it gets too big 
                                        $slice: -this.maxAnnouncedAchievements
                                    } 
                                }
                            },
                            { 
                                new: true, // Return the updated document
                                runValidators: true // Run validators on update
                            }
                        );
                        
                        if (updateResult) {
                            console.log(`Successfully updated ${user.raUsername}'s record`);
                        } else {
                            console.error(`Failed to update ${user.raUsername}'s record - user may have been deleted`);
                        }
                    } catch (updateError) {
                        console.error(`Error updating user ${user.raUsername}:`, updateError);
                        // Continue processing other users
                    }
                }
                
                // Also check for awards for monthly and shadow challenges
                // In post-restart mode, we still check awards but with special logging
                if (currentChallenge) {
                    console.log(`[POST-RESTART] Checking awards for ${user.raUsername}`);
                    
                    if (monthlyGameId) {
                        await this.checkForGameAwards(user, announcementChannel, currentChallenge, monthlyGameId, false);
                    }
                    
                    if (shadowGameId) {
                        await this.checkForGameAwards(user, announcementChannel, currentChallenge, shadowGameId, true);
                    }
                }
                
                // Add a longer delay between users after restart
                await new Promise(resolve => setTimeout(resolve, 3000)); // Longer delay after restart
                
            } catch (error) {
                console.error(`Error processing user ${user.raUsername} after restart:`, error);
            }
        }
        
        console.log('Finished post-restart achievement check. Normal operation will resume on next run.');
    }

    async checkForNewAchievements() {
        console.log('Checking for new achievements...');
        
        // Initialize session history from persistent storage
        await this.initializeSessionHistory();
        
        // Get current challenge
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const currentChallenge = await Challenge.findOne({
            date: {
                $gte: currentMonthStart,
                $lt: nextMonthStart
            }
        });

        // Store monthly and shadow game IDs for quick lookup
        let monthlyGameId = null;
        let shadowGameId = null;
        
        if (currentChallenge) {
            monthlyGameId = currentChallenge.monthly_challange_gameid;
            if (currentChallenge.shadow_challange_revealed) {
                shadowGameId = currentChallenge.shadow_challange_gameid;
            }
            console.log(`Current monthly game: ${monthlyGameId}, shadow game: ${shadowGameId || 'Not revealed'}`);
        } else {
            console.log('No active challenge found for the current month.');
        }
        
        // Get announcement channel
        const announcementChannel = await this.getAnnouncementChannel();
        if (!announcementChannel) {
            console.error('Announcement channel not found or inaccessible');
            return;
        }
        
        console.log(`Successfully found announcement channel: ${announcementChannel.name}`);

        // Get all users
        const users = await User.find({});
        console.log(`Processing ${users.length} users for achievements`);

        for (const user of users) {
            try {
                // Verify user is a guild member
                const isMember = await this.isGuildMember(user.discordId);
                if (!isMember) {
                    // Skip non-members silently
                    continue;
                }
                
                // Initialize user's lastAchievementCheck if it doesn't exist
                if (!user.lastAchievementCheck) {
                    user.lastAchievementCheck = new Date(0); // Start of the epoch
                }
                
                // Initialize announcedAchievements if it doesn't exist
                if (!user.announcedAchievements) {
                    user.announcedAchievements = [];
                }
                
                const lastCheckTime = user.lastAchievementCheck.getTime();
                console.log(`Checking achievements for user: ${user.raUsername} (last check: ${user.lastAchievementCheck.toISOString()})`);
                
                // Get user's recent achievements (last 50)
                const recentAchievements = await retroAPI.getUserRecentAchievements(user.raUsername, 50);
                
                if (!recentAchievements || !Array.isArray(recentAchievements) || recentAchievements.length === 0) {
                    console.log(`No recent achievements found for ${user.raUsername}`);
                    continue;
                }
                
                console.log(`Found ${recentAchievements.length} recent achievements for ${user.raUsername}`);
                
                // Sort achievements by date earned (oldest first)
                recentAchievements.sort((a, b) => {
                    const dateA = new Date(a.DateEarned || a.dateEarned || 0);
                    const dateB = new Date(b.DateEarned || b.dateEarned || 0);
                    return dateA.getTime() - dateB.getTime();
                });
                
                // Filter for new achievements since last check
                const newAchievements = recentAchievements.filter(achievement => {
                    const achievementDate = new Date(achievement.DateEarned || achievement.dateEarned || 0);
                    // Consider it new if it was earned after our last check
                    return achievementDate.getTime() > lastCheckTime;
                });
                
                console.log(`Found ${newAchievements.length} new achievements since last check for ${user.raUsername}`);
                
                // Limit the size of the announcedAchievements array
                if (user.announcedAchievements.length > this.maxAnnouncedAchievements) {
                    // Keep only the most recent announcements
                    user.announcedAchievements = user.announcedAchievements.slice(-this.maxAnnouncedAchievements);
                }
                
                // Track new announcements for this user
                const newAnnouncementsIdentifiers = [];
                let announcementsQueuedForUser = 0;
                
                // Keep track of the latest achievement date to update lastAchievementCheck
                let latestAchievementDate = user.lastAchievementCheck;
                
                // Process each new achievement
                for (const achievement of newAchievements) {
                    // Limit announcements per user per check
                    if (announcementsQueuedForUser >= this.maxAnnouncementsPerUser) {
                        console.log(`Reached max announcements for ${user.raUsername}, skipping remaining achievements`);
                        break;
                    }
                    
                    // Basic null check only
                    if (!achievement) {
                        console.log('Skipping null achievement entry');
                        continue;
                    }
                    
                    // Extract achievement info with safe fallbacks
                    const gameId = achievement.GameID ? String(achievement.GameID) : "unknown";
                    const achievementId = achievement.ID || "unknown";
                    const achievementTitle = achievement.Title || "Unknown Achievement";
                    const achievementDate = new Date(achievement.DateEarned || achievement.dateEarned || 0);
                    
                    // Update the latest achievement date if this one is newer
                    if (achievementDate > latestAchievementDate) {
                        latestAchievementDate = new Date(achievementDate);
                    }
                    
                    // Enhanced logging for achievement details
                    console.log(`Processing achievement: ${achievementTitle} (ID: ${achievementId}) in game ${gameId}, earned at ${achievementDate.toISOString()}`);
                    
                    // Determine achievement type (monthly, shadow, or regular)
                    let achievementType = 'regular';
                    if (gameId === String(monthlyGameId)) {
                        achievementType = 'monthly';
                    } else if (gameId === String(shadowGameId)) {
                        achievementType = 'shadow';
                    }
                    
                    // Create unique identifiers for this achievement
                    const achievementBaseIdentifier = `${achievementType}:${gameId}:${achievementId}`;
                    const achievementIdentifier = `${achievementBaseIdentifier}:${achievementDate.getTime()}`;

                    // Check if this achievement is already in the in-memory session history
                    // Check both the full identifier and the base identifier
                    if (this.sessionAnnouncementHistory.has(achievementIdentifier) || 
                        this.sessionAnnouncementHistory.has(achievementBaseIdentifier)) {
                        console.log(`Achievement ${achievementTitle} already in session history for ${user.raUsername}, skipping`);
                        continue;
                    }

                    // Add enhanced logging to track identification process
                    console.log(`Checking achievement: ${achievementBaseIdentifier} for ${user.raUsername}`);

                    // Check if this achievement ID is in the saved history with a more precise method
                    if (achievementId !== "unknown" && user.announcedAchievements.some(id => {
                        // Split the stored ID to get the parts
                        const parts = id.split(':');
                        if (parts.length >= 3) {
                            const storedBaseId = `${parts[0]}:${parts[1]}:${parts[2]}`;
                            const isMatch = storedBaseId === achievementBaseIdentifier;
                            if (isMatch) {
                                console.log(`Found matching base identifier in persistent storage: ${storedBaseId}`);
                            }
                            return isMatch;
                        }
                        return false;
                    })) {
                        console.log(`Achievement ${achievementTitle} already announced (by ID) for ${user.raUsername}, skipping`);
                        continue;
                    }

                    console.log(`New achievement for ${user.raUsername}: ${achievementTitle} (${achievementType})`);
                    
                    // Get game info
                    let gameInfo;
                    try {
                        gameInfo = await retroAPI.getGameInfo(gameId);
                        console.log(`Retrieved game info for ${gameId}: ${gameInfo.title}`);
                    } catch (gameInfoError) {
                        console.error(`Failed to get game info for ${gameId}: ${gameInfoError.message}`);
                        // Create fallback game info
                        gameInfo = {
                            id: gameId,
                            title: achievement.GameTitle || `Game ${gameId}`,
                            consoleName: achievement.ConsoleName || "Unknown",
                            imageIcon: ""
                        };
                    }
                    
                    // Queue the achievement for announcement with rate limiter
                    await this.announcementRateLimiter.add(async () => {
                        try {
                            await this.announceAchievement(
                                announcementChannel, 
                                user, 
                                gameInfo, 
                                achievement, 
                                achievementType, 
                                gameId
                            );
                            return true;
                        } catch (error) {
                            console.error('Error in rate-limited announcement:', error);
                            return false;
                        }
                    });
                    
                    // Add to temporary list of new announcements - store both forms for robustness
                    newAnnouncementsIdentifiers.push(achievementIdentifier);
                    // Also add to session history - both forms
                    this.sessionAnnouncementHistory.add(achievementIdentifier);
                    this.sessionAnnouncementHistory.add(achievementBaseIdentifier);
                    announcementsQueuedForUser++;
                }
                
                // Update user's lastAchievementCheck timestamp
                // Add a small buffer (2 seconds) to avoid boundary issues
                const updatedLastCheckTime = new Date(latestAchievementDate.getTime() + 2000);

                // Only update the database AFTER the announcements have been successfully queued
                if (newAnnouncementsIdentifiers.length > 0 || latestAchievementDate > user.lastAchievementCheck) {
                    try {
                        if (newAnnouncementsIdentifiers.length > 0) {
                            console.log(`Adding ${newAnnouncementsIdentifiers.length} new announcements to ${user.raUsername}'s record`);
                        }
                        
                        // Use findOneAndUpdate instead of directly modifying and saving the user object
                        // This avoids version conflicts when multiple operations try to update the same document
                        const updateResult = await User.findOneAndUpdate(
                            { _id: user._id },
                            { 
                                $set: { lastAchievementCheck: updatedLastCheckTime },
                                $push: { 
                                    announcedAchievements: { 
                                        $each: newAnnouncementsIdentifiers,
                                        // Limit the array size by slicing if it gets too big 
                                        $slice: -this.maxAnnouncedAchievements
                                    } 
                                }
                            },
                            { 
                                new: true, // Return the updated document
                                runValidators: true // Run validators on update
                            }
                        );
                        
                        if (updateResult) {
                            console.log(`Successfully updated ${user.raUsername}'s record`);
                        } else {
                            console.error(`Failed to update ${user.raUsername}'s record - user may have been deleted`);
                        }
                    } catch (updateError) {
                        console.error(`Error updating user ${user.raUsername}:`, updateError);
                        // Continue processing other users
                    }
                }
                
                // Also check for awards for monthly and shadow challenges
                if (currentChallenge) {
                    if (monthlyGameId) {
                        await this.checkForGameAwards(user, announcementChannel, currentChallenge, monthlyGameId, false);
                    }
                    
                    if (shadowGameId) {
                        await this.checkForGameAwards(user, announcementChannel, currentChallenge, shadowGameId, true);
                    }
                }
                
                // Add a delay between users to prevent rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error processing user ${user.raUsername}:`, error);
            }
        }
        
        console.log('Finished checking for achievements');
    }

    // Initialize session history from persistent storage with improved accuracy
    async initializeSessionHistory() {
        console.log('Initializing session announcement history from persistent storage...');
        this.sessionAnnouncementHistory.clear();
        
        try {
            // Get all users
            const users = await User.find({});
            
            // Track how many entries we're adding to session history
            let entriesAdded = 0;
            
            // Add all announced achievements to session history
            for (const user of users) {
                if (user.announcedAchievements && Array.isArray(user.announcedAchievements)) {
                    for (const achievement of user.announcedAchievements) {
                        // Extract the parts of the identifier
                        const parts = achievement.split(':');
                        
                        // Store both the complete identifier and the base identifier without timestamp
                        // This ensures we catch all variations during checks
                        if (parts.length >= 3) {
                            // Add the full original identifier
                            this.sessionAnnouncementHistory.add(achievement);
                            entriesAdded++;
                            
                            // Also add the base identifier (type:gameId:achievementId) for more robust checking
                            const baseIdentifier = `${parts[0]}:${parts[1]}:${parts[2]}`;
                            this.sessionAnnouncementHistory.add(baseIdentifier);
                            
                            // If this is an award, also add a more specific identifier with the award type
                            if (parts[0] === 'monthly' && parts[1] === 'award' || 
                                parts[0] === 'shadow' && parts[1] === 'award') {
                                if (parts.length >= 4) {
                                    // Add specific award type identifier (e.g., "monthly:award:gameId:MASTERY")
                                    const awardTypeIdentifier = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}`;
                                    this.sessionAnnouncementHistory.add(awardTypeIdentifier);
                                }
                            }
                        }
                    }
                }
            }
            
            console.log(`Initialized session history with ${entriesAdded} unique entries from persistent storage`);
            console.log(`Total session history size: ${this.sessionAnnouncementHistory.size} entries`);
        } catch (error) {
            console.error('Error initializing session history:', error);
        }
    }

    async checkForGameAwards(user, channel, challenge, gameId, isShadow) {
        const gameIdString = String(gameId);
        console.log(`=== Award check for ${user.raUsername} - Game: ${gameIdString} (${isShadow ? 'Shadow' : 'Monthly'}) ===`);
        
        // Skip if already processed - improved check for specific award types
        const awardIdentifierPrefix = isShadow ? 'shadow:award' : 'monthly:award';

        // Check each award type specifically
        const existingAwardsByType = {
            MASTERY: false,
            BEATEN: false,
            PARTICIPATION: false
        };

        // Check for each award type in the user's history
        for (const award of ['MASTERY', 'BEATEN', 'PARTICIPATION']) {
            const specificAwardIdentifier = `${awardIdentifierPrefix}:${gameIdString}:${award}`;
            
            // Check session history first
            if (this.sessionAnnouncementHistory.has(specificAwardIdentifier)) {
                console.log(`Award ${award} already in session history for ${user.raUsername}`);
                existingAwardsByType[award] = true;
                continue;
            }
            
            // Check persistent storage
            const hasThisAward = user.announcedAchievements.some(id => {
                const parts = id.split(':');
                if (parts.length >= 4) {
                    // Match specific award type
                    return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}` === specificAwardIdentifier;
                }
                return false;
            });
            
            if (hasThisAward) {
                console.log(`Award ${award} found in persistent storage for ${user.raUsername}`);
                existingAwardsByType[award] = true;
            }
        }

        // Log the overall award status
        console.log(`Current award status for ${user.raUsername} in game ${gameIdString}:`);
        console.log(`  - MASTERY: ${existingAwardsByType.MASTERY ? 'Already earned' : 'Not earned'}`);
        console.log(`  - BEATEN: ${existingAwardsByType.BEATEN ? 'Already earned' : 'Not earned'}`);
        console.log(`  - PARTICIPATION: ${existingAwardsByType.PARTICIPATION ? 'Already earned' : 'Not earned'}`);

        // Enhanced check for all awards being processed already
        if (existingAwardsByType.MASTERY && existingAwardsByType.BEATEN && existingAwardsByType.PARTICIPATION) {
            console.log(`All possible awards already processed for ${user.raUsername} in game ${gameIdString}`);
            return;
        }
        
        // Get user's game progress
        const progress = await retroAPI.getUserGameProgress(user.raUsername, gameId);
        
        // Get game info
        const gameInfo = await retroAPI.getGameInfo(gameId);
        
        // Get relevant achievement lists
        const progressionAchievements = isShadow 
            ? challenge.shadow_challange_progression_achievements 
            : challenge.monthly_challange_progression_achievements;
            
        const winAchievements = isShadow
            ? challenge.shadow_challange_win_achievements
            : challenge.monthly_challange_win_achievements;
            
        const totalAchievements = isShadow
            ? challenge.shadow_challange_game_total
            : challenge.monthly_challange_game_total;
        
        // Get the user's earned achievements
        const userEarnedAchievements = Object.entries(progress.achievements || {})
            .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
            .map(([id]) => id);
        
        // Determine current award level
        let currentAward = null;
        
        // Check if user has all achievements (Mastery) - only for monthly, not shadow
        const hasAllAchievements = progress.numAwardedToUser === totalAchievements;
        
        // Check if user has completed all progression achievements
        const hasAllProgressionAchievements = progressionAchievements.every(id => 
            userEarnedAchievements.includes(id)
        );
        
        // Check if user has at least one win condition (if any exist)
        const hasWinCondition = winAchievements.length === 0 || 
            winAchievements.some(id => userEarnedAchievements.includes(id));
        
        // Determine the award
        if (hasAllAchievements && !isShadow) {
            // Mastery is only for monthly challenges, not shadow
            currentAward = 'MASTERY';
        } else if (hasAllProgressionAchievements && hasWinCondition) {
            currentAward = 'BEATEN';
        } else if (progress.numAwardedToUser > 0) {
            currentAward = 'PARTICIPATION';
        }

        // Skip if no award achieved
        if (!currentAward) {
            return;
        }
        
        // Create a more precise award identifier for checking
        const awardTypeIdentifier = `${awardIdentifierPrefix}:${gameIdString}:${currentAward}`;

        // Skip if this specific award is already in the session history or persistently stored
        if (existingAwardsByType[currentAward]) {
            console.log(`Award ${currentAward} already processed for ${user.raUsername}, skipping`);
            return;
        }

        console.log(`Announcing ${currentAward} award for ${user.raUsername} in ${isShadow ? 'shadow' : 'monthly'} challenge - This is a NEW award`);

        // Generate award identifier with timestamp
        const now = Date.now();
        const awardIdentifier = `${awardTypeIdentifier}:${now}`;
        
        // User has reached a new award level, announce it using rate limiter
        const announced = await this.announcementRateLimiter.add(async () => {
            try {
                return await this.announceGameAward(
                    channel,
                    user,
                    gameInfo,
                    currentAward,
                    progress.numAwardedToUser,
                    totalAchievements,
                    isShadow,
                    hasAllProgressionAchievements,
                    hasWinCondition,
                    gameId
                );
            } catch (error) {
                console.error('Error in rate-limited award announcement:', error);
                return false;
            }
        });
        
        if (announced) {
            try {
                // Add to session history - both forms
                this.sessionAnnouncementHistory.add(awardTypeIdentifier);
                this.sessionAnnouncementHistory.add(awardIdentifier);
                
                // Add to persistent history with atomic update to avoid version conflicts
                await User.findOneAndUpdate(
                    { _id: user._id },
                    { 
                        $push: { 
                            announcedAchievements: awardIdentifier
                        }
                    },
                    { 
                        new: true,
                        runValidators: true
                    }
                );
                
                console.log(`Successfully added award ${currentAward} to ${user.raUsername}'s record`);
            } catch (updateError) {
                console.error(`Error updating user ${user.raUsername} with award:`, updateError);
            }
        }
    }

    // Get user's profile image URL with caching
    async getUserProfileImageUrl(username) {
        // Check if we have a cached entry
        const now = Date.now();
        if (this.profileImageCache.has(username)) {
            const { url, timestamp } = this.profileImageCache.get(username);
            // If cache is still valid, return the cached URL
            if (now - timestamp < this.cacheTTL) {
                return url;
            }
        }
        
        try {
            // Get user info from RetroAPI
            const userInfo = await retroAPI.getUserInfo(username);
            // Store in cache
            this.profileImageCache.set(username, {
                url: userInfo.profileImageUrl,
                timestamp: now
            });
            return userInfo.profileImageUrl;
        } catch (error) {
            console.error(`Error fetching profile image for ${username}:`, error);
            // Fallback to legacy URL format if API call fails
            return `https://retroachievements.org/UserPic/${username}.png`;
        }
    }

    async announceAchievement(channel, user, gameInfo, achievement, achievementType, gameId) {
        try {
            console.log(`Creating embed for achievement announcement: ${achievement.Title || 'Unknown Achievement'} (${achievementType})`);
            
            // Set color and title based on achievement type - UPDATED COLORS
            let color = '#4CAF50';  // Green for regular achievements
            let challengeTypeText = "Achievement";
            let emoji = "🎮";
            
            if (achievementType === 'monthly') {
                color = '#FFD700';  // Yellow for monthly
                challengeTypeText = "Monthly Challenge";
                emoji = "🏆";
            } else if (achievementType === 'shadow') {
                color = '#9B59B6';  // Purple for shadow
                challengeTypeText = "Shadow Challenge";
                emoji = "👥";
            } else if (achievementType === 'award') {
                color = '#3498DB';  // Blue for awards
                challengeTypeText = "Award";
                emoji = AWARD_EMOJIS[achievement.Title.split(' ')[0]] || '🏅';
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`${emoji} ${achievementType === 'award' ? 'Award Achieved!' : 'Achievement Unlocked!'}`)
                .setColor(color)
                .setTimestamp();

            // Get user's profile image URL
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);

            // Use RetroAchievements username as the author
            embed.setAuthor({
                name: user.raUsername,
                iconURL: profileImageUrl,
                url: `https://retroachievements.org/user/${user.raUsername}`
            });

            // Set thumbnail to achievement image if available, otherwise use game image
            if (achievement.BadgeName) {
                // Ensure badge URL is correctly formatted
                const badgeUrl = `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`;
                embed.setThumbnail(badgeUrl);
                console.log(`Using badge thumbnail: ${badgeUrl}`);
            } else if (gameInfo?.imageIcon) {
                const gameIconUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                embed.setThumbnail(gameIconUrl);
                console.log(`Using game icon thumbnail: ${gameIconUrl}`);
            }

            // Build description
            let description = '';
            if (achievementType === 'monthly' || achievementType === 'shadow') {
                description = `**${user.raUsername}** has earned a new achievement in ${achievementType === 'shadow' ? 'the shadow challenge' : 'this month\'s challenge'}!\n\n`;
            } else if (achievementType === 'award') {
                description = `**${user.raUsername}** has earned an award in ${gameInfo?.title || 'a game'}!\n\n`;
            } else {
                description = `**${user.raUsername}** has earned a new achievement!\n\n`;
            }
            
            description += `**${achievement.Title || 'Unknown Achievement'}**\n`;
            
            if (achievement.Description) {
                description += `*${achievement.Description}*\n`;
            }
            
            // Add points if available
            if (achievement.Points) {
                description += `\nPoints: **${achievement.Points}**`;
            }
            
            embed.setDescription(description);

            // Add game info
            const fields = [
                { name: 'Game', value: gameInfo?.title || 'Unknown Game', inline: true }
            ];
            
            // Add console name if available (especially useful for regular games)
            if (gameInfo?.consoleName) {
                fields.push({
                    name: 'Console',
                    value: gameInfo.consoleName,
                    inline: true
                });
            }
            
            // Only add challenge type field for challenge games
            if (achievementType === 'monthly' || achievementType === 'shadow') {
                fields.push({ 
                    name: 'Challenge Type', 
                    value: challengeTypeText, 
                    inline: true 
                });
            }
            
            embed.addFields(fields);

            // Add links
            embed.addFields({
                name: 'Links',
                value: `[Game Page](https://retroachievements.org/game/${gameId}) | [User Profile](https://retroachievements.org/user/${user.raUsername})`
            });

            console.log(`Sending achievement announcement to channel`);
            
            // Send the announcement
            try {
                const sentMessage = await channel.send({ embeds: [embed] });
                console.log(`Successfully sent achievement announcement, message ID: ${sentMessage.id}`);
                return true;
            } catch (sendError) {
                console.error(`Failed to send announcement: ${sendError.message}`);
                
                // Try a plain text fallback
                try {
                    const fallbackText = `${emoji} **${user.raUsername}** earned "${achievement.Title || 'an achievement'}" in ${gameInfo?.title || 'a game'}`;
                    await channel.send(fallbackText);
                    console.log('Sent plain text fallback message');
                    return true;
                } catch (fallbackError) {
                    console.error(`Even fallback message failed: ${fallbackError.message}`);
                    return false;
                }
            }

        } catch (error) {
            console.error('Error announcing achievement:', error);
            return false;
        }
    }

    async announceGameAward(channel, user, gameInfo, awardLevel, achieved, total, isShadow, hasAllProgression, hasWinCondition, gameId) {
        try {
            console.log(`Creating embed for ${awardLevel} award announcement for ${user.raUsername}`);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`${AWARD_EMOJIS[awardLevel]} Challenge Complete!`)
                .setColor(this.getColorForAward(awardLevel, isShadow))
                .setTimestamp();

            // Get user's profile image URL
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);

            // Use RetroAchievements username as the author
            embed.setAuthor({
                name: user.raUsername,
                iconURL: profileImageUrl,
                url: `https://retroachievements.org/user/${user.raUsername}`
            });

            // Set thumbnail to game image if available
            if (gameInfo?.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Build description
            let description = `**${user.raUsername}** has earned `;
            
            switch (awardLevel) {
                case 'MASTERY':
                    description += `**MASTERY** status in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!\n`;
                    description += `They completed all achievements in the game!`;
                    break;
                case 'BEATEN':
                    description += `**BEATEN** status in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!\n`;
                    description += `They completed all progression achievements and ${hasWinCondition ? 'at least one win condition' : 'no win conditions were required'}!`;
                    break;
                case 'PARTICIPATION':
                    description += `**PARTICIPATION** in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!`;
                    break;
            }

            embed.setDescription(description);

            // Add game info
            embed.addFields(
                { name: 'Game', value: gameInfo?.title || 'Unknown Game', inline: true },
                { name: 'Progress', value: `${achieved}/${total} (${Math.round(achieved/total*100)}%)`, inline: true },
                { name: 'Challenge Type', value: isShadow ? 'Shadow Challenge' : 'Monthly Challenge', inline: true }
            );

            // Add links
            embed.addFields({
                name: 'Links',
                value: `[Game Page](https://retroachievements.org/game/${gameId}) | [User Profile](https://retroachievements.org/user/${user.raUsername})`
            });

            console.log(`Sending award announcement to channel`);
            
            // Send the announcement
            try {
                const sentMessage = await channel.send({ embeds: [embed] });
                console.log(`Successfully sent award announcement, message ID: ${sentMessage.id}`);
                return true;
            } catch (sendError) {
                console.error(`Failed to send award announcement: ${sendError.message}`);
                
                // Try a plain text fallback
                try {
                    const emoji = AWARD_EMOJIS[awardLevel];
                    const fallbackText = `${emoji} **${user.raUsername}** has earned ${awardLevel} status in ${gameInfo?.title || 'a game'}!`;
                    await channel.send(fallbackText);
                    console.log('Sent plain text fallback message for award');
                    return true;
                } catch (fallbackError) {
                    console.error(`Even fallback message failed: ${fallbackError.message}`);
                    return false;
                }
            }

        } catch (error) {
            console.error('Error announcing award:', error);
            return false;
        }
    }

    getColorForAward(awardLevel, isShadow) {
        // Use different colors based on if it's a shadow or monthly challenge
        if (isShadow) {
            // Shadow challenge colors
            switch (awardLevel) {
                case 'MASTERY': // Not possible for shadow games, but included for completeness
                    return '#9B59B6'; // Purple
                case 'BEATEN':
                    return '#9B59B6'; // Purple
                case 'PARTICIPATION':
                    return '#9B59B6'; // Purple
                default:
                    return '#9B59B6'; // Purple
            }
        } else {
            // Monthly challenge colors
            switch (awardLevel) {
                case 'MASTERY':
                    return '#FFD700'; // Yellow/Gold
                case 'BEATEN':
                    return '#FFD700'; // Yellow/Gold
                case 'PARTICIPATION':
                    return '#FFD700'; // Yellow/Gold
                default:
                    return '#FFD700'; // Yellow/Gold
            }
        }
    }

    async getAnnouncementChannel() {
        if (!this.client) {
            console.error('Discord client not set');
            return null;
        }

        try {
            // Get the configuration
            const channelId = config.discord.achievementChannelId;
            const guildId = config.discord.guildId;
            
            console.log(`Looking for channel ID ${channelId} in guild ${guildId}`);
            
            // Get the guild
            const guild = await this.client.guilds.fetch(guildId);
            if (!guild) {
                console.error(`Guild not found: ${guildId}`);
                return null;
            }

            // Get the channel
            const channel = await guild.channels.fetch(channelId);
            if (!channel) {
                console.error(`Channel not found: ${channelId}`);
                return null;
            }
            
            // Log channel details
            console.log(`Found channel: ${channel.name} (${channel.type})`);
            
            return channel;
        } catch (error) {
            console.error('Error getting announcement channel:', error);
            
            // More specific error handling
            if (error.code === 10003) {
                console.error('Channel not found - check ACHIEVEMENT_CHANNEL environment variable');
            } else if (error.code === 50001) {
                console.error('Missing access to channel - check bot permissions');
            }
            
            return null;
        }
    }

    async isGuildMember(discordId) {
        if (!discordId) return false;
        
        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) return false;
            
            try {
                const member = await guild.members.fetch(discordId);
                return !!member;
            } catch (memberError) {
                // Member not found
                return false;
            }
        } catch (error) {
            console.error('Error checking guild membership:', error);
            return false;
        }
    }

    // Add this debug command to clear achievement history for a user
    async clearUserAchievements(username) {
        try {
            const user = await User.findOne({ raUsername: username });
            if (!user) {
                console.log(`User ${username} not found`);
                return false;
            }
            
            console.log(`Clearing achievement history for ${username}`);
            user.announcedAchievements = [];
            user.lastAchievementCheck = new Date(0); // Reset to epoch start
            await user.save();
            console.log(`Achievement history cleared for ${username}`);
            return true;
        } catch (error) {
            console.error(`Error clearing achievements for ${username}:`, error);
            return false;
        }
    }

    // Add a helper method to deduplicate a user's achievements
    async deduplicateUserAchievements(username) {
        try {
            const user = await User.findOne({ raUsername: username });
            if (!user) {
                console.log(`User ${username} not found`);
                return false;
            }
            
            if (!user.announcedAchievements || !Array.isArray(user.announcedAchievements)) {
                console.log(`User ${username} has no achievements to deduplicate`);
                return false;
            }
            
            console.log(`Deduplicating achievements for ${username}`);
            console.log(`Before: ${user.announcedAchievements.length} achievements`);
            
            // Keep track of base identifiers we've seen
            const seen = new Set();
            const uniqueAchievements = [];
            
            for (const achievement of user.announcedAchievements) {
                const parts = achievement.split(':');
                if (parts.length >= 3) {
                    const baseIdentifier = `${parts[0]}:${parts[1]}:${parts[2]}`;
                    
                    if (seen.has(baseIdentifier)) {
                        // This is a duplicate
                        console.log(`Found duplicate: ${achievement}`);
                    } else {
                        // New unique achievement
                        seen.add(baseIdentifier);
                        uniqueAchievements.push(achievement);
                    }
                } else {
                    // Malformed identifier, keep it anyway
                    uniqueAchievements.push(achievement);
                }
            }
            
            const removed = user.announcedAchievements.length - uniqueAchievements.length;
            console.log(`Removed ${removed} duplicates, ${uniqueAchievements.length} unique achievements remain`);
            
            // Update user's achievements with deduplicated list
            user.announcedAchievements = uniqueAchievements;
            await user.save();
            
            return true;
        } catch (error) {
            console.error(`Error deduplicating achievements for ${username}:`, error);
            return false;
        }
    }
}

// Create singleton instance
const achievementFeedService = new AchievementFeedService();
export default achievementFeedService;
