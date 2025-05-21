// src/services/gameAwardService.js
import { EmbedBuilder } from 'discord.js';
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';
import { COLORS, EMOJIS } from '../utils/FeedUtils.js';
import EnhancedRateLimiter from './EnhancedRateLimiter.js';

// Award emojis - same as in AchievementFeedService
const AWARD_EMOJIS = {
    MASTERY: '✨',
    BEATEN: '⭐',
    PARTICIPATION: '🏁'
};

class GameAwardService {
    constructor() {
        this.client = null;
        this.channelCache = new Map(); // Cache channels by ID
        this.channelIds = {
            monthlyChallenge: '1313640664356880445',
            shadowGame: '1300941091335438470',
            retroachievement: '1362227906343997583'
        };
        
        // In-memory tracking to prevent duplicates
        this.sessionAnnouncementHistory = new Set();
        
        // Cache to store user profile image URLs 
        this.profileImageCache = new Map();
        this.cacheTTL = 30 * 60 * 1000; // 30 minutes
        
        // Rate limiter for award announcements (2 per second)
        this.announcementRateLimiter = new EnhancedRateLimiter({
            requestsPerInterval: 2,
            interval: 1000,
            maxRetries: 3,
            retryDelay: 1000
        });
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for game award service');
    }

    async initialize() {
        if (!this.client) {
            console.error('Discord client not set for game award service');
            return;
        }
        
        // Pre-cache channels to improve performance
        for (const [key, channelId] of Object.entries(this.channelIds)) {
            try {
                const channel = await this.getChannel(channelId);
                if (channel) {
                    this.channelCache.set(channelId, channel);
                    console.log(`Cached ${key} channel: ${channel.name}`);
                }
            } catch (error) {
                console.error(`Failed to cache ${key} channel:`, error);
            }
        }
        
        // Load existing announcements to prevent duplicates
        await this.initializeSessionHistory();
        
        console.log('Game award service initialized');
    }

    async getChannel(channelId) {
        if (this.channelCache.has(channelId)) {
            return this.channelCache.get(channelId);
        }

        if (!this.client) {
            console.error('Discord client not set for game award service');
            return null;
        }

        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) return null;

            const channel = await guild.channels.fetch(channelId);
            if (channel) {
                this.channelCache.set(channelId, channel);
            }
            return channel;
        } catch (error) {
            console.error(`Error getting channel ${channelId}:`, error);
            return null;
        }
    }

    // Initialize session history from persistent storage
    async initializeSessionHistory() {
        console.log('Initializing game award session history from persistent storage...');
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
                        // Extract the parts for easier filtering (username:type:gameId:achievementId:timestamp)
                        const parts = achievement.split(':');
                        
                        if (parts.length >= 4) {
                            // Check if it's an award (monthly:award, shadow:award, or mastery)
                            if (parts[1] === 'monthly' || parts[1] === 'shadow' || parts[1] === 'mastery') {
                                const baseIdentifier = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}`;
                                this.sessionAnnouncementHistory.add(baseIdentifier);
                                entriesAdded++;
                            }
                        }
                    }
                }
                
                // Check masteredGames if it exists
                if (user.masteredGames && Array.isArray(user.masteredGames)) {
                    for (const masteredGame of user.masteredGames) {
                        const baseIdentifier = `${user.raUsername}:mastery:${masteredGame.gameId}`;
                        this.sessionAnnouncementHistory.add(baseIdentifier);
                        entriesAdded++;
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

    // Process monthly and shadow game awards
    async checkForGameAwards(user, gameId, isShadow) {
        const gameIdString = String(gameId);
        console.log(`Checking for awards for ${user.raUsername} in ${isShadow ? 'shadow' : 'monthly'} game ${gameIdString}`);
        
        // Get the appropriate channel for announcement
        const channelId = isShadow ? this.channelIds.shadowGame : this.channelIds.monthlyChallenge;
        const channel = await this.getChannel(channelId);
        
        if (!channel) {
            console.error(`Cannot find channel for ${isShadow ? 'shadow' : 'monthly'} game awards`);
            return;
        }
        
        // Get current challenge to access progression/win requirements
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
        const challenge = await Challenge.findOne({
            date: {
                $gte: currentMonthStart,
                $lt: nextMonthStart
            }
        });
        
        if (!challenge) {
            console.log('No active challenge found for award checks');
            return;
        }
        
        // Check if user has ANY award for this game already
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
        const timestamp = Date.now();
        const awardIdentifier = `${awardBaseIdentifier}:${timestamp}`;
        
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
                // Add to session history FIRST to prevent double announcements
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

    // Check if a game has been mastered
    async checkForGameMastery(user, gameId, achievement) {
        const gameIdString = String(gameId);
        console.log(`Checking for game mastery for ${user.raUsername} in game ${gameIdString}`);
        
        // Skip if this is already in the session history 
        const masteryIdentifier = `${user.raUsername}:mastery:${gameIdString}`;
        if (this.sessionAnnouncementHistory.has(masteryIdentifier)) {
            return false;
        }

        // Check if already in the database
        const hasMasteryInDb = user.announcedAchievements.some(id => 
            id.startsWith(masteryIdentifier)
        );
        
        if (hasMasteryInDb) {
            console.log(`User ${user.raUsername} already has mastery in database for game ${gameIdString}`);
            return false;
        }
        
        // Also check in masteredGames array if it exists
        if (user.masteredGames && user.masteredGames.some(game => game.gameId === gameIdString)) {
            console.log(`User ${user.raUsername} already has mastery in masteredGames for game ${gameIdString}`);
            return false;
        }

        try {
            // Get game info and user progress
            const gameInfo = await retroAPI.getGameInfo(gameId);
            const progress = await retroAPI.getUserGameProgress(user.raUsername, gameId);
            
            // Skip if game info is missing or has 0 achievements
            if (!gameInfo || !gameInfo.numAchievements || gameInfo.numAchievements <= 0) {
                console.log(`Game ${gameIdString} has no achievements, skipping mastery check`);
                return false;
            }
            
            console.log(`Game ${gameIdString} has ${gameInfo.numAchievements} achievements, user has earned ${progress.numAwardedToUser}`);
            
            // Check if user has earned all achievements
            const allAchievements = gameInfo.numAchievements;
            if (progress.numAwardedToUser === allAchievements) {
                // Get mastery channel
                const channel = await this.getChannel(this.channelIds.retroachievement);
                if (!channel) {
                    console.error(`Cannot find channel for game mastery announcements`);
                    return false;
                }
                
                console.log(`User ${user.raUsername} has mastered game ${gameInfo.title} with ${allAchievements} achievements!`);
                
                // Announce mastery
                const announced = await this.announcementRateLimiter.add(async () => {
                    try {
                        return await this.announceMastery(
                            channel,
                            user,
                            gameInfo,
                            allAchievements,
                            gameIdString
                        );
                    } catch (error) {
                        console.error('Error in rate-limited mastery announcement:', error);
                        return false;
                    }
                });
                
                if (announced) {
                    try {
                        // Add to session history first
                        this.sessionAnnouncementHistory.add(masteryIdentifier);
                        
                        // Add to user's announced achievements
                        const masteryIdentifierWithTimestamp = `${masteryIdentifier}:${Date.now()}`;
                        
                        // Update both fields atomically
                        await User.findOneAndUpdate(
                            { _id: user._id },
                            { 
                                $push: { 
                                    announcedAchievements: masteryIdentifierWithTimestamp,
                                    masteredGames: {
                                        gameId: gameIdString,
                                        gameTitle: gameInfo.title || `Game ${gameIdString}`,
                                        consoleName: gameInfo.consoleName || 'Unknown',
                                        totalAchievements: allAchievements
                                    }
                                }
                            },
                            { new: true, runValidators: true }
                        );
                        
                        console.log(`Successfully added mastery for ${gameInfo.title} to ${user.raUsername}'s record`);
                        return true;
                    } catch (updateError) {
                        console.error(`Error updating user ${user.raUsername} with mastery:`, updateError);
                    }
                }
            }
        } catch (error) {
            console.error(`Error checking for game mastery for ${user.raUsername} on ${gameId}:`, error);
        }
        
        return false;
    }

    // Announce game award
    async announceGameAward(channel, user, gameInfo, awardLevel, achieved, total, isShadow, hasAllProgression, hasWinCondition, gameId) {
        try {
            console.log(`Creating embed for ${awardLevel} award announcement for ${user.raUsername}`);
            
            // Get emoji for award level
            const emoji = AWARD_EMOJIS[awardLevel] || '🏅';
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(this.getColorForAward(awardLevel, isShadow))
                .setTimestamp();

            // Set game name and platform as the title with clickable link to game page
            const platformText = gameInfo?.consoleName ? ` • ${gameInfo.consoleName}` : '';
            embed.setTitle(`${gameInfo?.title || 'Unknown Game'}${platformText}`);
            embed.setURL(`https://retroachievements.org/game/${gameId}`);
            
            // Raw GitHub URL for logo
            const logoUrl = 'https://raw.githubusercontent.com/marquessam/select_start_bot2/a58a4136ff0597217bb9fb181115de3f152b71e4/assets/logo_simple.png';
            
            // Set challenge award type as the author (top line)
            const challengeType = isShadow ? 'Shadow Challenge' : 'Monthly Challenge';
            const authorEmoji = isShadow ? ' 👥' : ''; // Add busts in silhouette emoji for shadow
            embed.setAuthor({
                name: `${challengeType} Award${authorEmoji}`,
                iconURL: logoUrl
            });
            
            // Set thumbnail (right side) - use game icon for awards
            if (gameInfo?.imageIcon) {
                const gameIconUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                embed.setThumbnail(gameIconUrl);
            }
            
            // Get user's profile image URL for footer
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
            
            // Create user link
            const userLink = `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})`;
            
            // Build description
            let description = '';
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

            // Simplified footer - just progress info and user icon
            const progressText = `Progress: ${achieved}/${total} (${Math.round(achieved/total*100)}%)`;
            
            embed.setFooter({
                text: progressText,
                iconURL: profileImageUrl
            });

            console.log(`Sending award announcement to channel ${channel.name}`);
            
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

    // Announce game mastery
    async announceMastery(channel, user, gameInfo, totalAchievements, gameId) {
        try {
            console.log(`Creating embed for game mastery: ${user.raUsername} mastered ${gameInfo.title}`);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(COLORS.GOLD)  // Gold for masteries
                .setTimestamp();
            
            // Set game name and platform as the title with clickable link to game page
            const platformText = gameInfo?.consoleName ? ` • ${gameInfo.consoleName}` : '';
            embed.setTitle(`${gameInfo?.title || 'Unknown Game'}${platformText}`);
            embed.setURL(`https://retroachievements.org/game/${gameId}`);
            
            // Set author with ✨ emoji
            embed.setAuthor({
                name: `Game Mastery ${EMOJIS.MASTERY}`,
                iconURL: 'https://raw.githubusercontent.com/marquessam/select_start_bot2/a58a4136ff0597217bb9fb181115de3f152b71e4/assets/logo_simple.png'
            });
            
            // Set thumbnail to game icon
            if (gameInfo?.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }
            
            // Get user's profile image URL for footer
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
            
            // Create user link
            const userLink = `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})`;
            
            // Build description
            let description = '';
            description += `${userLink} has **MASTERED** this game!\n\n`;
            description += `*All ${totalAchievements} achievements completed!*`;
            
            embed.setDescription(description);

            // Footer - just points and user icon
            embed.setFooter({
                text: `Total Achievements: ${totalAchievements}`,
                iconURL: profileImageUrl
            });

            console.log(`Sending mastery announcement to channel ${channel.name}`);
            
            // Send the announcement
            const sentMessage = await channel.send({ embeds: [embed] });
            console.log(`Successfully sent mastery announcement, message ID: ${sentMessage.id}`);
            return true;
        } catch (error) {
            console.error('Error announcing mastery:', error);
            return false;
        }
    }

    // Get color for award level
    getColorForAward(awardLevel, isShadow) {
        // Use different colors based on if it's a shadow or monthly challenge
        if (isShadow) {
            return '#000000'; // Black for shadow challenges
        } else {
            return '#9B59B6'; // Purple for monthly challenges
        }
    }
}

// Create singleton instance
const gameAwardService = new GameAwardService();
export default gameAwardService;
