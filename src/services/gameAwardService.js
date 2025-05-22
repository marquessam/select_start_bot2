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

    /**
     * Get user's game progress with award metadata
     */
    async getUserGameProgressWithAwards(username, gameId) {
        try {
            // Use retroAPI's new method for getting progress with awards
            return await retroAPI.getUserGameProgressWithAwards(username, gameId);
        } catch (error) {
            console.error(`Error getting game progress with awards for ${username} in game ${gameId}:`, error);
            // Return minimal structure to prevent crashes
            return {
                NumAwardedToUser: 0,
                NumAchievements: 0,
                UserCompletion: '0%',
                UserCompletionHardcore: '0%',
                HighestAwardKind: null,
                HighestAwardDate: null,
                Achievements: {}
            };
        }
    }

    /**
     * Determine award status using official RetroAchievements data
     */
    async checkAwardStatus(username, gameId, manualConfig = null) {
        try {
            // Get user's progress including official award status
            const progress = await this.getUserGameProgressWithAwards(username, gameId);
            
            // Check for official award status first
            if (progress.HighestAwardKind) {
                return this.processOfficialAward(progress);
            }
            
            // Fallback to manual config if no official award but some progress exists
            if (manualConfig && progress.NumAwardedToUser > 0) {
                return this.checkManualAward(progress, manualConfig);
            }
            
            // Check for participation (any achievements earned)
            if (progress.NumAwardedToUser > 0) {
                return {
                    currentAward: 'PARTICIPATION',
                    isBeaten: false,
                    isMastered: false,
                    method: 'participation',
                    details: {
                        earned: progress.NumAwardedToUser,
                        total: progress.NumAchievements,
                        completion: progress.UserCompletion || '0%',
                        hardcoreCompletion: progress.UserCompletionHardcore || '0%'
                    }
                };
            }
            
            // No progress
            return {
                currentAward: null,
                isBeaten: false,
                isMastered: false,
                method: 'no_progress',
                details: {
                    earned: 0,
                    total: progress.NumAchievements || 0
                }
            };
            
        } catch (error) {
            console.error(`Error checking award status for ${username} in game ${gameId}:`, error);
            return {
                currentAward: null,
                isBeaten: false,
                isMastered: false,
                method: 'error',
                details: { error: error.message }
            };
        }
    }

    /**
     * Process official RetroAchievements award status
     */
    processOfficialAward(progress) {
        const awardKind = progress.HighestAwardKind.toLowerCase();
        let currentAward = null;
        let isBeaten = false;
        let isMastered = false;

        // Map official award kinds to our award levels
        switch (awardKind) {
            case 'mastered':
                currentAward = 'MASTERY';
                isBeaten = true;
                isMastered = true;
                break;
            case 'beaten':
                currentAward = 'BEATEN';
                isBeaten = true;
                isMastered = false;
                break;
            case 'completed':
                // Some games might use "completed" instead of "beaten"
                currentAward = 'BEATEN';
                isBeaten = true;
                isMastered = false;
                break;
            default:
                // Unknown award kind, but user has some progress
                if (progress.NumAwardedToUser > 0) {
                    currentAward = 'PARTICIPATION';
                }
                break;
        }

        return {
            currentAward,
            isBeaten,
            isMastered,
            method: 'official_retroachievements',
            confidence: 1.0, // 100% confidence in official data
            details: {
                officialAward: progress.HighestAwardKind,
                awardDate: progress.HighestAwardDate,
                earned: progress.NumAwardedToUser,
                total: progress.NumAchievements,
                completion: progress.UserCompletion || '0%',
                hardcoreCompletion: progress.UserCompletionHardcore || '0%',
                earnedHardcore: progress.NumAwardedToUserHardcore || 0
            }
        };
    }

    /**
     * Fallback to manual award detection (existing logic)
     */
    checkManualAward(progress, manualConfig) {
        const userAchievements = progress.Achievements || {};
        
        // Get the user's earned achievements
        const userEarnedAchievements = Object.entries(userAchievements)
            .filter(([id, data]) => data.hasOwnProperty('DateEarned') || data.hasOwnProperty('dateEarned'))
            .map(([id]) => id);
        
        const progressionAchievements = manualConfig.progressionAchievements || [];
        const winAchievements = manualConfig.winAchievements || [];
        
        // Check if user has completed all progression achievements
        const hasAllProgressionAchievements = progressionAchievements.every(id => 
            userEarnedAchievements.includes(String(id))
        );
        
        // Check if user has at least one win condition (if any exist)
        const hasWinCondition = winAchievements.length === 0 || 
            winAchievements.some(id => userEarnedAchievements.includes(String(id)));
        
        // Check for mastery (all achievements)
        const hasAllAchievements = progress.NumAwardedToUser === progress.NumAchievements;
        
        let currentAward = null;
        let isBeaten = false;
        let isMastered = false;
        
        if (hasAllAchievements) {
            currentAward = 'MASTERY';
            isBeaten = true;
            isMastered = true;
        } else if (hasAllProgressionAchievements && hasWinCondition) {
            currentAward = 'BEATEN';
            isBeaten = true;
            isMastered = false;
        } else if (progress.NumAwardedToUser > 0) {
            currentAward = 'PARTICIPATION';
        }
        
        return {
            currentAward,
            isBeaten,
            isMastered,
            method: 'manual_config',
            confidence: 0.9, // High confidence in manual config
            details: {
                hasAllProgression: hasAllProgressionAchievements,
                hasWinCondition,
                progressionCount: progressionAchievements.length,
                winCount: winAchievements.length,
                earned: progress.NumAwardedToUser,
                total: progress.NumAchievements,
                completion: progress.UserCompletion || '0%'
            }
        };
    }

    /**
     * Check if user has achieved mastery for any game (for mastery announcements)
     */
    async checkGameMasteryStatus(username, gameId) {
        try {
            const result = await this.checkAwardStatus(username, gameId);
            return result.isMastered;
        } catch (error) {
            console.error(`Error checking mastery for ${username} in game ${gameId}:`, error);
            return false;
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
        const progress = await this.getUserGameProgressWithAwards(user.raUsername, gameId);
        
        // Get game info
        const gameInfo = await retroAPI.getGameInfo(gameId);
        
        // Get relevant achievement lists for manual configuration (if they exist)
        const progressionAchievements = isShadow 
            ? challenge.shadow_challange_progression_achievements 
            : challenge.monthly_challange_progression_achievements;
            
        const winAchievements = isShadow
            ? challenge.shadow_challange_win_achievements
            : challenge.monthly_challange_win_achievements;
            
        const totalAchievements = isShadow
            ? challenge.shadow_challange_game_total
            : challenge.monthly_challange_game_total;
        
        // Determine current award level using official RetroAchievements data
        let currentAward = null;
        let awardDetails = null;
        
        // Check award status using official RA data with manual config as fallback
        const manualConfig = (progressionAchievements && progressionAchievements.length > 0) ? {
            progressionAchievements,
            winAchievements
        } : null;
        
        const awardResult = await this.checkAwardStatus(
            user.raUsername, 
            gameId, 
            manualConfig
        );
        
        console.log(`Official award detection result for ${user.raUsername}:`, awardResult);
        
        // For shadow challenges, mastery is not available (beaten is the highest)
        if (isShadow && awardResult.currentAward === 'MASTERY') {
            currentAward = 'BEATEN';
            awardDetails = {
                ...awardResult,
                currentAward: 'BEATEN',
                method: awardResult.method + '_shadow_adjusted'
            };
        } else {
            currentAward = awardResult.currentAward;
            awardDetails = awardResult;
        }

        // Skip if no award achieved
        if (!currentAward) {
            return;
        }
        
        console.log(`Determined award level for ${user.raUsername}: ${currentAward} (method: ${awardDetails.method})`);
        
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
                    progress.NumAwardedToUser,
                    totalAchievements,
                    isShadow,
                    awardDetails, // Pass the detection details
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

    // Check if a game has been mastered using official RA data
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
            // Check mastery using official RA data
            const hasMastery = await this.checkGameMasteryStatus(user.raUsername, gameId);
            
            if (!hasMastery) {
                return false;
            }
            
            // Get detailed award info for the announcement
            const awardDetails = await this.checkAwardStatus(user.raUsername, gameId);
            
            // Get game info
            const gameInfo = await retroAPI.getGameInfo(gameId);
            
            // Skip if game info is missing
            if (!gameInfo || !gameInfo.numAchievements || gameInfo.numAchievements <= 0) {
                console.log(`Game ${gameIdString} has no achievements, skipping mastery check`);
                return false;
            }
            
            console.log(`User ${user.raUsername} has mastered game ${gameInfo.title} with ${gameInfo.numAchievements} achievements!`);
            
            // Get mastery channel
            const channel = await this.getChannel(this.channelIds.retroachievement);
            if (!channel) {
                console.error(`Cannot find channel for game mastery announcements`);
                return false;
            }
            
            // Announce mastery
            const announced = await this.announcementRateLimiter.add(async () => {
                try {
                    return await this.announceMastery(
                        channel,
                        user,
                        gameInfo,
                        gameInfo.numAchievements,
                        gameIdString,
                        awardDetails
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
                                    totalAchievements: gameInfo.numAchievements
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
        } catch (error) {
            console.error(`Error checking for game mastery for ${user.raUsername} on ${gameId}:`, error);
        }
        
        return false;
    }

    // Announce game award with official detection details
    async announceGameAward(channel, user, gameInfo, awardLevel, achieved, total, isShadow, awardDetails, gameId) {
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
            
            // Add award explanation based on level and detection method
            switch (awardLevel) {
                case 'MASTERY':
                    if (awardDetails.method === 'official_retroachievements') {
                        description += `*Officially mastered by RetroAchievements!*\n`;
                    } else {
                        description += `*All achievements completed!*\n`;
                    }
                    break;
                case 'BEATEN':
                    if (awardDetails.method === 'official_retroachievements') {
                        description += `*Officially beaten by RetroAchievements!*\n`;
                    } else if (awardDetails.method.includes('shadow_adjusted')) {
                        description += `*Game beaten (mastery adjusted for shadow challenge).*\n`;
                    } else if (awardDetails.method === 'manual_config') {
                        description += `*Game beaten with all required achievements.*\n`;
                    } else {
                        description += `*Game beaten!*\n`;
                    }
                    break;
                case 'PARTICIPATION':
                    description += `*Started participating in the challenge.*\n`;
                    break;
            }
            
            embed.setDescription(description);

            // Enhanced footer with detection details
            let footerText = `Progress: ${achieved}/${total} (${Math.round(achieved/total*100)}%)`;
            
            if (awardDetails.method === 'official_retroachievements' && awardDetails.details.awardDate) {
                const awardDate = new Date(awardDetails.details.awardDate);
                footerText += ` • Achieved: ${awardDate.toLocaleDateString()}`;
            } else if (awardDetails.method === 'manual_config') {
                footerText += ` • Manual config`;
            }
            
            // Show hardcore completion if different from regular completion
            if (awardDetails.details?.hardcoreCompletion && awardDetails.details.hardcoreCompletion !== awardDetails.details.completion) {
                footerText += ` • Hardcore: ${awardDetails.details.hardcoreCompletion}`;
            }
            
            embed.setFooter({
                text: footerText,
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

    // Announce game mastery with official detection details
    async announceMastery(channel, user, gameInfo, totalAchievements, gameId, awardDetails) {
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
            
            // Add detection method info
            if (awardDetails.method === 'official_retroachievements') {
                description += `*Officially mastered by RetroAchievements!*`;
            } else {
                description += `*All ${totalAchievements} achievements completed!*`;
            }
            
            embed.setDescription(description);

            // Footer with achievement info and award date if available
            let footerText = `Total Achievements: ${totalAchievements}`;
            
            if (awardDetails.method === 'official_retroachievements' && awardDetails.details.awardDate) {
                const awardDate = new Date(awardDetails.details.awardDate);
                footerText += ` • Mastered: ${awardDate.toLocaleDateString()}`;
            }
            
            embed.setFooter({
                text: footerText,
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

    /**
     * Clear progress cache
     */
    clearProgressCache() {
        // Clear the retroAPI cache which handles progress caching
        retroAPI.clearCache();
        console.log('Game award service cleared retroAPI cache');
    }

    /**
     * Get cache statistics
     */
    getProgressCacheStats() {
        // Since we're using retroAPI's cache, return a placeholder
        return {
            size: 'Managed by retroAPI',
            entries: ['Progress cache managed by retroAPI service']
        };
    }

    /**
     * Get color for award level
     */
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
