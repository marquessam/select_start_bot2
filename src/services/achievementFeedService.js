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
            console.log('Starting achievement feed service check...');
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

    async checkForNewAchievements() {
        console.log('Checking for new achievements...');
        
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

    // Improved session history initialization with backward compatibility
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

    async checkForGameAwards(user, channel, challenge, gameId, isShadow) {
        const gameIdString = String(gameId);
        console.log(`Checking for awards for ${user.raUsername} in ${isShadow ? 'shadow' : 'monthly'} game ${gameIdString}`);
        
        // CRITICAL FIX: Check if user has ANY award for this game already
        // This simple prefix check will catch all awards for this user/game combination
        const simpleCheckPrefix = `${user.raUsername}:${isShadow ? 'shadow:award' : 'monthly:award'}:${gameIdString}`;
        
        // Check in session history first
        let hasAnyAwardInSession = false;
        for (const entry of this.sessionAnnouncementHistory) {
            if (entry.startsWith(simpleCheckPrefix)) {
                console.log(`User ${user.raUsername} already has award in session history for ${isShadow ? 'shadow' : 'monthly'} game ${gameIdString}`);
                hasAnyAwardInSession = true;
                break;
            }
        }
        
        if (hasAnyAwardInSession) {
            return;
        }
        
        // Then check in database records
        const hasAnyAwardInDb = user.announcedAchievements.some(id => {
            // Check if this is a new format identifier (has username)
            if (id.startsWith(simpleCheckPrefix)) {
                return true;
            }
            
            // Check if this is an old format identifier (without username)
            const oldFormatPrefix = `${isShadow ? 'shadow:award' : 'monthly:award'}:${gameIdString}`;
            return id.startsWith(oldFormatPrefix);
        });
        
        if (hasAnyAwardInDb) {
            console.log(`User ${user.raUsername} already has award in database for ${isShadow ? 'shadow' : 'monthly'} game ${gameIdString}`);
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
        
        console.log(`Determined award level for ${user.raUsername}: ${currentAward}`);
        
        const awardIdentifierPrefix = isShadow ? 'shadow:award' : 'monthly:award';
        
        // Create award base identifier for checking
        const awardBaseIdentifier = `${user.raUsername}:${awardIdentifierPrefix}:${gameIdString}:${currentAward}`;
        
        // Generate award identifier with timestamp
        const now = Date.now();
        const awardIdentifier = `${awardBaseIdentifier}:${now}`;
        
        console.log(`Announcing ${currentAward} award for ${user.raUsername} in ${isShadow ? 'shadow' : 'monthly'} challenge`);
        
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
                // CRITICAL: Add to session history FIRST to prevent double announcements
                // if multiple instances are processed before the database update completes
                this.sessionAnnouncementHistory.add(awardBaseIdentifier);
                
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
        
        // Set color based on achievement type
        let color = '#4CAF50';  // Green for regular achievements
        let emoji = "🎮";
        
        if (achievementType === 'monthly') {
            color = '#FFD700';  // Yellow for monthly
            emoji = "🏆";
        } else if (achievementType === 'shadow') {
            color = '#9B59B6';  // Purple for shadow
            emoji = "👥";
        } else if (achievementType === 'award') {
            color = '#3498DB';  // Blue for awards
            emoji = AWARD_EMOJIS[achievement.Title.split(' ')[0]] || '🏅';
        }
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTimestamp();
        
        // Set title at the top: "Achievement Unlocked"
        embed.setTitle(`${emoji} Achievement Unlocked ${emoji}`);
        
        // For monthly/shadow challenges, use the special logo
        if (achievementType === 'monthly' || achievementType === 'shadow') {
            // Use logo for the thumbnail if monthly/shadow challenge
            embed.setThumbnail('assets/logo_simple.png');
        } else if (achievement.BadgeName) {
            // Use achievement badge for thumbnail if available
            const badgeUrl = `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`;
            embed.setThumbnail(badgeUrl);
        } else if (gameInfo?.imageIcon) {
            // Fallback to game icon if no achievement badge
            const gameIconUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
            embed.setThumbnail(gameIconUrl);
        }
        
        // Get user's profile image URL for footer
        const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
        
        // Create user link
        const userLink = `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})`;
        
        // Create game link
        const gameLink = `[${gameInfo?.title || 'Unknown Game'} • ${gameInfo?.consoleName || ''}](https://retroachievements.org/game/${gameId})`;
        
        // Build description per format
        let description = `${gameLink}\n`;
        description += `${userLink} unlocked **${achievement.Title || 'Unknown Achievement'}**\n\n`;
        
        // Add achievement description if available (in italics)
        if (achievement.Description) {
            description += `*${achievement.Description}*`;
        }
        
        embed.setDescription(description);

        // Add points and user info at the bottom
        let footerText = "";
        if (achievement.Points) {
            footerText = `Points: ${achievement.Points}`;
        }
        
        embed.setFooter({
            text: `Earned by ${user.raUsername} • ${footerText}`,
            iconURL: profileImageUrl
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
        
        // Get emoji for award level
        const emoji = AWARD_EMOJIS[awardLevel] || '🏅';
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor(this.getColorForAward(awardLevel, isShadow))
            .setTimestamp();

        // Set title at the top
        const challengeType = isShadow ? 'Shadow Challenge' : 'Monthly Challenge';
        embed.setTitle(`${emoji} ${challengeType} Award ${emoji}`);
        
        // Use logo for the thumbnail
        embed.setThumbnail('assets/logo_simple.png');
        
        // Get user's profile image URL for footer
        const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
        
        // Create user link
        const userLink = `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})`;
        
        // Create game link
        const gameLink = `[${gameInfo?.title || 'Unknown Game'} • ${gameInfo?.consoleName || ''}](https://retroachievements.org/game/${gameId})`;
        
        // Build description per format
        let description = `${gameLink}\n`;
        description += `${userLink} earned **${awardLevel}**\n\n`;
        
        // Add award explanation based on level
        switch (awardLevel) {
            case 'MASTERY':
                description += `*All achievements completed!*\n`;
                break;
            case 'BEATEN':
                description += `*Game beaten with all required achievements.*\n`;
                break;
            case 'PARTICIPATION':
                description += `*Started participating in the challenge.*\n`;
                break;
        }
        
        embed.setDescription(description);

        // Add progress info and user info at the bottom
        const progressText = `Progress: ${achieved}/${total} (${Math.round(achieved/total*100)}%)`;
        
        embed.setFooter({
            text: `Earned by ${user.raUsername} • ${progressText}`,
            iconURL: profileImageUrl
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
                const fallbackText = `${emoji} **${user.raUsername}** has earned ${awardLevel} award in ${gameInfo?.title || 'a game'}!`;
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
