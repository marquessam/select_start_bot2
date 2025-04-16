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
        this.maxAnnouncementsPerUser = 10; // Increased from 5 to 10
        
        // Maximum size of announcedAchievements array
        this.maxAnnouncedAchievements = 500; // Increased from 200 to 500
        
        // In-memory set to prevent duplicate announcements during a session
        this.sessionAnnouncementHistory = new Set();
        
        // Achievements to fetch per user (increased from 50)
        this.achievementsToFetch = 100;
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
                
                // Get user's recent achievements (increased from 50 to 100)
                const recentAchievements = await retroAPI.getUserRecentAchievements(user.raUsername, this.achievementsToFetch);
                
                if (!recentAchievements || !Array.isArray(recentAchievements) || recentAchievements.length === 0) {
                    console.log(`No recent achievements found for ${user.raUsername}`);
                    continue;
                }
                
                console.log(`Found ${recentAchievements.length} recent achievements for ${user.raUsername}`);
                
                // Filter for new achievements since last check
                const newAchievements = recentAchievements.filter(achievement => {
                    const achievementDate = new Date(achievement.DateEarned || achievement.dateEarned || 0);
                    // Add a 1-second buffer to avoid boundary issues
                    return achievementDate.getTime() > (lastCheckTime - 1000);
                });
                
                // Now sort the new achievements by date (oldest first)
                newAchievements.sort((a, b) => {
                    const dateA = new Date(a.DateEarned || a.dateEarned || 0);
                    const dateB = new Date(b.DateEarned || b.dateEarned || 0);
                    return dateA.getTime() - dateB.getTime();
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
                    
                    // Create a unique identifier for this achievement that includes the timestamp
                    // This helps prevent duplicate announcements even if the service restarts
                    const achievementIdentifier = `${achievementType}:${gameId}:${achievementId}:${achievementDate.getTime()}`;
                    
                    // Check if this achievement is already in the in-memory session history
                    if (this.sessionAnnouncementHistory.has(achievementIdentifier)) {
                        console.log(`Achievement ${achievementTitle} already in session history for ${user.raUsername}, skipping`);
                        continue;
                    }
                    
                    // Create a more precise identifier for checking persistent history
                    const achievementPersistentIdentifier = `${achievementType}:${gameId}:${achievementId}`;
                    
                    // Check if this achievement ID is in the saved history
                    if (achievementId !== "unknown" && user.announcedAchievements.some(id => {
                        // Split the stored ID to get just the type:gameId:achievementId part
                        const parts = id.split(':');
                        if (parts.length >= 3) {
                            return `${parts[0]}:${parts[1]}:${parts[2]}` === achievementPersistentIdentifier;
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
                    
                    // Queue the achievement for announcement using our enhanced rate limiter
                    this.queueRateLimitedAnnouncement(
                        announcementChannel,
                        user,
                        gameInfo,
                        achievement,
                        achievementType,
                        gameId
                    );
                    
                    // Add to temporary list of new announcements
                    newAnnouncementsIdentifiers.push(achievementIdentifier);
                    // Also add to session history
                    this.sessionAnnouncementHistory.add(achievementIdentifier);
                    announcementsQueuedForUser++;
                }
                
                // Update user's lastAchievementCheck timestamp
                // Add a small buffer (2 seconds) to avoid boundary issues
                user.lastAchievementCheck = new Date(latestAchievementDate.getTime() + 2000);
                
                // Only update the database AFTER the announcements have been successfully queued
                if (newAnnouncementsIdentifiers.length > 0) {
                    console.log(`Adding ${newAnnouncementsIdentifiers.length} new announcements to ${user.raUsername}'s record`);
                    user.announcedAchievements = [...user.announcedAchievements, ...newAnnouncementsIdentifiers];
                    await user.save();
                } else if (latestAchievementDate > user.lastAchievementCheck) {
                    // If we updated the lastAchievementCheck but didn't add new announcements,
                    // we still need to save the user
                    await user.save();
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
                        // Extract the base identifier (type:gameId:achievementId) without timestamp
                        const parts = achievement.split(':');
                        if (parts.length >= 3) {
                            const baseIdentifier = `${parts[0]}:${parts[1]}:${parts[2]}`;
                            this.sessionAnnouncementHistory.add(baseIdentifier);
                            entriesAdded++;
                        }
                    }
                }
            }
            
            console.log(`Initialized session history with ${entriesAdded} entries from persistent storage`);
        } catch (error) {
            console.error('Error initializing session history:', error);
        }
    }

    // Queue an announcement using the enhanced rate limiter
    async queueRateLimitedAnnouncement(channel, user, gameInfo, achievement, achievementType, gameId) {
        return this.announcementRateLimiter.add(async () => {
            try {
                await this.announceAchievement(channel, user, gameInfo, achievement, achievementType, gameId);
                return true;
            } catch (error) {
                console.error('Error in rate-limited announcement:', error);
                return false;
            }
        });
    }

    async checkForGameAwards(user, channel, challenge, gameId, isShadow) {
        const gameIdString = String(gameId);
        console.log(`Checking for awards for ${user.raUsername} in ${isShadow ? 'shadow' : 'monthly'} game ${gameIdString}`);
        
        // Skip if already processed
        const awardIdentifierPrefix = isShadow ? 'shadow:award' : 'monthly:award';
        
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
        
        // Check if this award is in the session history
        if (this.sessionAnnouncementHistory.has(awardTypeIdentifier)) {
            console.log(`Award ${currentAward} already in session history for ${user.raUsername}, skipping`);
            return;
        }
        
        // Check if this award is in the persistent history
        if (user.announcedAchievements.some(id => {
            const parts = id.split(':');
            if (parts.length >= 3) {
                return `${parts[0]}:${parts[1]}:${parts[2]}` === awardTypeIdentifier;
            }
            return false;
        })) {
            console.log(`Award ${currentAward} already announced for ${user.raUsername}, skipping`);
            return;
        }
        
        console.log(`Announcing ${currentAward} award for ${user.raUsername} in ${isShadow ? 'shadow' : 'monthly'} challenge`);
        
        // Generate award identifier with timestamp
        const now = Date.now();
        const awardIdentifier = `${awardTypeIdentifier}:${now}`;
        
        // User has reached a new award level, announce it using rate limiter
        const announced = await this.queueRateLimitedAnnouncement(
            channel,
            user,
            gameInfo,
            { // Construct a fake achievement for the award
                Title: `${currentAward} Award`,
                Description: `${currentAward} award for ${isShadow ? 'shadow' : 'monthly'} challenge`,
                Points: 0
            },
            'award',
            gameId
        );
        
        if (announced) {
            // Add to session history first (using the base identifier without timestamp)
            this.sessionAnnouncementHistory.add(awardTypeIdentifier);
            
            // Add to persistent history (with timestamp)
            user.announcedAchievements.push(awardIdentifier);
            await user.save();
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

    // Debug method to clear achievement history for a user
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
}

// Create singleton instance
const achievementFeedService = new AchievementFeedService();
export default achievementFeedService;
