// src/services/achievementFeedService.js - CORRECTED CHANNEL ROUTING
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import retroAPI from './retroAPI.js';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';
import EnhancedRateLimiter from './EnhancedRateLimiter.js';
import gameAwardService from './gameAwardService.js';
// UPDATED: Use AlertService with correct routing
import alertService, { ALERT_TYPES } from '../utils/AlertService.js';

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
            interval: 1000,
            maxRetries: 3,
            retryDelay: 1000
        });
        // Maximum announcements per user per check
        this.maxAnnouncementsPerUser = 5;
        // Maximum size of announcedAchievements array
        this.maxAnnouncedAchievements = 200;
        // In-memory set to prevent duplicate announcements during a session
        this.sessionAnnouncementHistory = new Set();
        // Flag to track if this is the first run after a restart
        this.isFirstRunAfterRestart = true;
        
        // NEW: Cache mappings of game IDs to systems
        this.gameSystemCache = {
            arcade: new Set(),
            arena: new Set(),
            monthly: null, // Will store the current monthly game ID
            shadow: null   // Will store the current shadow game ID
        };
        
        // Cache refresh interval (every 30 minutes)
        this.cacheRefreshInterval = 30 * 60 * 1000;
    }

    setClient(client) {
        this.client = client;
        // NEW: Also set client for gameAwardService
        gameAwardService.setClient(client);
        // UPDATED: Set client for AlertService
        alertService.setClient(client);
        console.log('Discord client set for achievement feed service');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for achievement feed service');
            return;
        }

        try {
            console.log('Starting achievement feed service...');
            
            // NEW: Initialize game award service first
            await gameAwardService.initialize();
            
            // NEW: Initialize game system mappings
            await this.refreshGameSystemCache();
            
            // Set up periodic refresh of game mappings
            setInterval(() => this.refreshGameSystemCache(), this.cacheRefreshInterval);
            
            // Initialize session history from persistent storage
            await this.initializeSessionHistory();
            
            if (this.isFirstRunAfterRestart) {
                console.log('First run after restart - using careful processing mode');
                this.isFirstRunAfterRestart = false;
            }
            
            await this.checkForNewAchievements();
        } catch (error) {
            console.error('Error in achievement feed service:', error);
        }
    }
    
    // NEW: Refresh the cache of game systems
    async refreshGameSystemCache() {
        console.log('Refreshing game system cache...');
        
        try {
            // Clear current cache
            this.gameSystemCache.arcade.clear();
            this.gameSystemCache.arena.clear();
            
            // Get current monthly/shadow challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });
            
            // Update monthly and shadow game IDs
            if (currentChallenge) {
                this.gameSystemCache.monthly = currentChallenge.monthly_challange_gameid ? 
                    String(currentChallenge.monthly_challange_gameid) : null;
                    
                this.gameSystemCache.shadow = (currentChallenge.shadow_challange_revealed && 
                    currentChallenge.shadow_challange_gameid) ? 
                    String(currentChallenge.shadow_challange_gameid) : null;
            }
            
            // Load all arcade boards (no need to filter by active/inactive)
            const arcadeBoards = await ArcadeBoard.find({}, 'gameId');
            arcadeBoards.forEach(board => {
                if (board.gameId) {
                    this.gameSystemCache.arcade.add(String(board.gameId));
                }
            });
            
            // Load all arena challenges (no need to filter by active/inactive)
            const arenaChallenges = await ArenaChallenge.find({}, 'gameId');
            arenaChallenges.forEach(challenge => {
                if (challenge.gameId) {
                    this.gameSystemCache.arena.add(String(challenge.gameId));
                }
            });
            
            console.log(`Game system cache refreshed. Monthly: ${this.gameSystemCache.monthly}, Shadow: ${this.gameSystemCache.shadow}, Arcade: ${this.gameSystemCache.arcade.size} games, Arena: ${this.gameSystemCache.arena.size} games`);
            
        } catch (error) {
            console.error('Error refreshing game system cache:', error);
        }
    }
    
    // NEW: Get the system type for a game ID
    getGameSystemType(gameId) {
        if (!gameId) return 'regular';
        
        const gameIdStr = String(gameId);
        
        // Check systems in order of priority
        if (gameIdStr === this.gameSystemCache.monthly) {
            return 'monthly';
        }
        
        if (gameIdStr === this.gameSystemCache.shadow) {
            return 'shadow';
        }
        
        if (this.gameSystemCache.arcade.has(gameIdStr)) {
            return 'arcade';
        }
        
        if (this.gameSystemCache.arena.has(gameIdStr)) {
            return 'arena';
        }
        
        return 'regular';
    }

    async testAchievementChannel() {
        if (!this.client) {
            console.error('Discord client not set');
            return false;
        }

        try {
            // Test the regular achievement channel
            const channels = await alertService.getChannelsForAlert(ALERT_TYPES.ACHIEVEMENT);
            if (!channels || channels.length === 0) {
                console.error('Could not get achievement announcement channels');
                return false;
            }

            const channel = channels[0];
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

    async checkForNewAchievements() {
        console.log('Checking for new achievements...');

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
                    
                    // NEW: Determine achievement type using the cache
                    const achievementType = this.getGameSystemType(gameId);
                    console.log(`Game ${gameId} identified as ${achievementType} type`);
                    
                    // Create unique identifiers for this achievement - include username for per-user uniqueness
                    const achievementBaseIdentifier = `${user.raUsername}:${achievementType}:${gameId}:${achievementId}`;
                    
                    // Check if this achievement is already in the in-memory session history
                    if (this.sessionAnnouncementHistory.has(achievementBaseIdentifier)) {
                        console.log(`Achievement ${achievementTitle} already in session history for ${user.raUsername}, skipping`);
                        continue;
                    }
                    
                    // Check if this achievement ID is in the saved history - handle both old and new formats
                    if (achievementId !== "unknown" && user.announcedAchievements.some(id => {
                        const parts = id.split(':');
                        
                        // New format (with username as first part)
                        if (parts.length >= 4 && parts[0] === user.raUsername) {
                            return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}` === achievementBaseIdentifier;
                        }
                        
                        // Old format (without username)
                        if (parts.length >= 3) {
                            return `${user.raUsername}:${parts[0]}:${parts[1]}:${parts[2]}` === achievementBaseIdentifier;
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
                            const announced = await this.announceAchievement(
                                user, 
                                gameInfo, 
                                achievement, 
                                achievementType, 
                                gameId
                            );
                            
                            // NEW: If this is a regular achievement, check for game mastery
                            if (announced && achievementType === 'regular') {
                                await gameAwardService.checkForGameMastery(user, gameId, achievement);
                            }
                            
                            return announced;
                        } catch (error) {
                            console.error('Error in rate-limited announcement:', error);
                            return false;
                        }
                    });
                    
                    // Add to temporary list of new announcements with timestamp
                    const achievementIdentifier = `${achievementBaseIdentifier}:${achievementDate.getTime()}`;
                    newAnnouncementsIdentifiers.push(achievementIdentifier);
                    
                    // Add to session history - AFTER announcement logic
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
                if (this.gameSystemCache.monthly) {
                    // NEW: Delegate to gameAwardService
                    await gameAwardService.checkForGameAwards(user, this.gameSystemCache.monthly, false);
                }
                
                if (this.gameSystemCache.shadow) {
                    // NEW: Delegate to gameAwardService
                    await gameAwardService.checkForGameAwards(user, this.gameSystemCache.shadow, true);
                }
                
                // Add a delay between users to prevent rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error processing user ${user.raUsername}:`, error);
            }
        }
        
        console.log('Finished checking for achievements');
    }

    // UPDATED: Delegate to gameAwardService
    async checkForGameAwards(user, gameId, isShadow) {
        return gameAwardService.checkForGameAwards(user, gameId, isShadow);
    }

    // Initialize session history from persistent storage
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
                        // Extract the parts - expecting username:type:gameId:achievementId:timestamp
                        // or older format: type:gameId:achievementId:timestamp
                        const parts = achievement.split(':');
                        
                        // For backward compatibility, handle both formats
                        if (parts.length >= 4) {
                            // If username is not the first part (old format), construct with username
                            if (parts[0] !== user.raUsername) {
                                const baseIdentifier = `${user.raUsername}:${parts[0]}:${parts[1]}:${parts[2]}`;
                                this.sessionAnnouncementHistory.add(baseIdentifier);
                            } else {
                                // New format already has username as first part
                                const baseIdentifier = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}`;
                                this.sessionAnnouncementHistory.add(baseIdentifier);
                            }
                            entriesAdded++;
                        } else if (parts.length >= 3) {
                            // Handle very old format
                            const baseIdentifier = `${user.raUsername}:${parts[0]}:${parts[1]}:${parts[2]}`;
                            this.sessionAnnouncementHistory.add(baseIdentifier);
                            entriesAdded++;
                        }
                    }
                }
            }
            
            console.log(`Initialized session history with ${entriesAdded} entries from persistent storage`);
            console.log(`Session history size: ${this.sessionAnnouncementHistory.size} entries`);
        } catch (error) {
            console.error('Error initializing session history:', error);
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

    // UPDATED: Achievement announcement with CORRECT channel routing based on game type
    async announceAchievement(user, gameInfo, achievement, achievementType, gameId) {
        try {
            console.log(`Creating achievement announcement: ${achievement.Title || 'Unknown Achievement'} (${achievementType})`);
            
            // FIXED: Determine the correct alert type based on achievement type
            let alertType;
            let color = '#808080';  // Default to grey for regular achievements
            let customTitle = 'Achievement Unlocked';
            
            // Raw GitHub URL for logo (SAME as original)
            const logoUrl = 'https://raw.githubusercontent.com/marquessam/select_start_bot2/a58a4136ff0597217bb9fb181115de3f152b71e4/assets/logo_simple.png';
            
            // CORRECTED: Route based on achievement type but arcade/arena go to achievement feed with styling
            if (achievementType === 'monthly') {
                alertType = ALERT_TYPES.MONTHLY_AWARD; // → 1313640664356880445 (monthly channel)
                color = '#9B59B6';  // Purple for monthly challenge
                customTitle = 'Monthly Challenge';
            } else if (achievementType === 'shadow') {
                alertType = ALERT_TYPES.SHADOW_AWARD; // → 1300941091335438470 (shadow channel)
                color = '#000000';  // Black for shadow challenge
                customTitle = 'Shadow Challenge 👥';
            } else if (achievementType === 'arcade') {
                alertType = ALERT_TYPES.ACHIEVEMENT; // → 1326199972059680778 (achievement feed with arcade styling)
                color = '#3498DB';  // Blue for arcade
                customTitle = 'Arcade Challenge 🕹️';
            } else if (achievementType === 'arena') {
                alertType = ALERT_TYPES.ACHIEVEMENT; // → 1326199972059680778 (achievement feed with arena styling)
                color = '#FF5722';  // Red for arena
                customTitle = 'Arena Challenge ⚔️';
            } else {
                // Regular achievements
                alertType = ALERT_TYPES.ACHIEVEMENT; // → 1326199972059680778 (achievement feed)
                customTitle = 'Achievement Unlocked';
            }
            
            // Get user's profile image URL for footer (SAME as original)
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
            
            // Set the thumbnail to be the achievement badge (SAME as original)
            let badgeUrl = null;
            if (achievement.BadgeName) {
                badgeUrl = `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`;
            }
            
            // Build description (SAME as original)
            let description = `**${achievement.Title || 'Unknown Achievement'}**\n\n`;
            
            // Add achievement description if available (SAME as original)
            if (achievement.Description) {
                description += `*${achievement.Description}*`;
            }

            console.log(`Sending achievement announcement via AlertService to ${achievementType} channel`);
            
            // FIXED: Use correct alert type for proper channel routing
            await alertService.sendAchievementAlert({
                alertType: alertType, // Routes to correct channel based on achievement type
                username: user.raUsername,
                achievementTitle: achievement.Title || 'Unknown Achievement',
                achievementDescription: description,
                gameTitle: gameInfo?.title || 'Unknown Game',
                gameId: gameId,
                points: achievement.Points,
                thumbnail: badgeUrl, // Achievement badge as thumbnail
                badgeUrl: profileImageUrl, // User profile as footer icon
                customTitle: customTitle, // Custom title based on achievement type
                customDescription: description, // Custom description
                color: color // Custom color based on achievement type
            });
            
            console.log(`Successfully sent achievement announcement via AlertService`);
            return true;

        } catch (error) {
            console.error('Error announcing achievement:', error);
            return false;
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
                // Handle both old and new formats
                let baseIdentifier;
                
                if (parts.length >= 4 && parts[0] === user.raUsername) {
                    // New format (username:type:gameId:achievementId)
                    baseIdentifier = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}`;
                } else if (parts.length >= 3) {
                    // Old format (type:gameId:achievementId)
                    baseIdentifier = `${user.raUsername}:${parts[0]}:${parts[1]}:${parts[2]}`;
                } else {
                    // Invalid format, keep it as-is
                    uniqueAchievements.push(achievement);
                    continue;
                }
                
                if (seen.has(baseIdentifier)) {
                    // This is a duplicate
                    console.log(`Found duplicate: ${achievement}`);
                } else {
                    // New unique achievement
                    seen.add(baseIdentifier);
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
