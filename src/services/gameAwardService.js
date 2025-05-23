// src/services/gameAwardService.js
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';
import { EmbedBuilder } from 'discord.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertUtils, { ALERT_TYPES } from '../utils/AlertUtils.js';

const AWARD_EMOJIS = {
    MASTERY: '✨',
    BEATEN: '⭐',
    PARTICIPATION: '🏁'
};

class GameAwardService {
    constructor() {
        this.client = null;
        this.profileImageCache = new Map();
        this.cacheTTL = 30 * 60 * 1000; // 30 minutes
        
        // In-memory session history to prevent duplicate announcements
        this.sessionAwardHistory = new Set();
        
        // Map to track game IDs to system types (monthly, shadow, etc.)
        this.gameSystemMap = new Map();
        
        // Cache refresh interval
        this.cacheRefreshInterval = 30 * 60 * 1000; // 30 minutes
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for game award service');
        
        // Make sure AlertUtils also has the client
        AlertUtils.setClient(client);
    }

    async initialize() {
        if (!this.client) {
            console.error('Discord client not set for game award service');
            return;
        }

        try {
            console.log('Initializing game award service...');
            
            // Refresh the game system map
            await this.refreshGameSystemMap();
            
            // Initialize session history
            await this.initializeSessionHistory();
            
            // Set up periodic refresh of the game system map
            setInterval(() => this.refreshGameSystemMap(), this.cacheRefreshInterval);
            
            console.log('Game award service initialized successfully');
        } catch (error) {
            console.error('Error initializing game award service:', error);
        }
    }
    
    /**
     * Refresh the mapping of game IDs to their system types
     */
    async refreshGameSystemMap() {
        try {
            console.log('Refreshing game system map...');
            
            // Clear current map
            this.gameSystemMap.clear();
            
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
            
            // Add monthly and shadow game IDs to the map
            if (currentChallenge) {
                if (currentChallenge.monthly_challange_gameid) {
                    const monthlyGameId = String(currentChallenge.monthly_challange_gameid);
                    this.gameSystemMap.set(monthlyGameId, 'monthly');
                    console.log(`Mapped game ID ${monthlyGameId} to monthly challenge`);
                }
                
                if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                    const shadowGameId = String(currentChallenge.shadow_challange_gameid);
                    this.gameSystemMap.set(shadowGameId, 'shadow');
                    console.log(`Mapped game ID ${shadowGameId} to shadow challenge`);
                }
            }
            
            console.log(`Game system map refreshed with ${this.gameSystemMap.size} entries`);
        } catch (error) {
            console.error('Error refreshing game system map:', error);
        }
    }
    
    /**
     * Get the system type for a game ID
     */
    getGameSystemType(gameId) {
        if (!gameId) return 'regular';
        
        const gameIdStr = String(gameId);
        
        // Check if in system map
        if (this.gameSystemMap.has(gameIdStr)) {
            return this.gameSystemMap.get(gameIdStr);
        }
        
        // If not found, it's a regular game
        return 'regular';
    }
    
    /**
     * Initialize the session award history
     */
    async initializeSessionHistory() {
        console.log('Initializing session award history...');
        this.sessionAwardHistory.clear();
        
        try {
            // Get all users
            const users = await User.find({});
            
            // Track how many entries we're adding to session history
            let entriesAdded = 0;
            
            // Add all announced awards to session history
            for (const user of users) {
                if (user.announcedAwards && Array.isArray(user.announcedAwards)) {
                    for (const award of user.announcedAwards) {
                        this.sessionAwardHistory.add(award);
                        entriesAdded++;
                    }
                }
            }
            
            console.log(`Initialized session award history with ${entriesAdded} entries`);
            
        } catch (error) {
            console.error('Error initializing session award history:', error);
        }
    }

    /**
     * FIXED: Helper function to parse completion percentage safely
     */
    parseCompletionPercentage(completionString) {
        if (!completionString) return 0;
        
        // Remove % symbol and any other non-numeric characters except decimal point
        const cleanString = completionString.toString().replace(/[^\d.]/g, '');
        const percentage = parseFloat(cleanString);
        
        return isNaN(percentage) ? 0 : percentage;
    }

    /**
     * Check if a user has mastered a game and announce if so
     */
    async checkForGameMastery(user, gameId, achievement) {
        try {
            if (!user || !gameId) return false;
            
            console.log(`Checking game mastery for ${user.raUsername} on game ${gameId}`);
            
            // Determine which system this game belongs to
            const systemType = this.getGameSystemType(gameId);
            
            // For monthly/shadow games, we handle these separately
            if (systemType !== 'regular') {
                return await this.checkForGameAwards(user, gameId, systemType === 'shadow');
            }
            
            // Get the user's game progress with awards
            const progress = await RetroAPIUtils.getUserGameProgressWithAwards(user.raUsername, gameId);
            
            console.log(`Progress data for ${user.raUsername} on game ${gameId}:`, {
                HighestAwardKind: progress?.HighestAwardKind,
                UserCompletion: progress?.UserCompletion,
                UserCompletionHardcore: progress?.UserCompletionHardcore,
                NumAwardedToUser: progress?.NumAwardedToUser,
                NumAchievements: progress?.NumAchievements
            });
            
            // Check if the user has any award for this game
            if (!progress || !progress.HighestAwardKind) {
                console.log(`No award found for ${user.raUsername} on game ${gameId}`);
                return false;
            }
            
            // Create a unique identifier for this award
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${progress.HighestAwardKind}`;
            
            // Check if we've already announced this award
            if (this.sessionAwardHistory.has(awardIdentifier) || 
                (user.announcedAwards && user.announcedAwards.includes(awardIdentifier))) {
                console.log(`Award ${awardIdentifier} already announced for ${user.raUsername}, skipping`);
                return false;
            }
            
            // Get game info
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            
            // Determine award type and prepare announcement
            let isMastery = false;
            let isBeaten = false;
            
            if (progress.HighestAwardKind === 'mastery') {
                isMastery = true;
            } else if (progress.HighestAwardKind === 'completion') {
                isBeaten = true;
            } else {
                console.log(`Award type ${progress.HighestAwardKind} not announced for regular games`);
                return false;
            }
            
            // FIXED: Parse completion percentages correctly
            const userCompletion = this.parseCompletionPercentage(progress.UserCompletion);
            const userCompletionHardcore = this.parseCompletionPercentage(progress.UserCompletionHardcore);
            
            console.log(`Completion check for ${user.raUsername}: completion=${userCompletion}%, hardcore=${userCompletionHardcore}%`);
            
            // Verify the user actually has the award with proper completion
            if (isMastery && userCompletionHardcore < 100) {
                console.log(`User ${user.raUsername} doesn't have 100% hardcore mastery for game ${gameId} (${userCompletionHardcore}%), skipping announcement`);
                return false;
            }
            
            if (isBeaten && userCompletion < 100) {
                console.log(`User ${user.raUsername} doesn't have 100% completion for game ${gameId} (${userCompletion}%), skipping announcement`);
                return false;
            }
            
            // Get user's profile image
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
            
            // Prepare thumbnail URL
            const thumbnailUrl = gameInfo?.imageIcon ? 
                `https://retroachievements.org${gameInfo.imageIcon}` : null;
            
            // Add award to session history
            this.sessionAwardHistory.add(awardIdentifier);
            
            // Add to user's announced awards
            if (!user.announcedAwards) {
                user.announcedAwards = [];
            }
            user.announcedAwards.push(awardIdentifier);
            
            // Limit the size of the announcedAwards array
            if (user.announcedAwards.length > 100) {
                user.announcedAwards = user.announcedAwards.slice(-100);
            }
            
            // Save the user
            await user.save();
            
            // Now announce the award using AlertUtils with the appropriate alert type
            await AlertUtils.sendAchievementAlert({
                username: user.raUsername,
                achievementTitle: isMastery ? `Mastery of ${gameInfo.title}` : `Beaten ${gameInfo.title}`,
                achievementDescription: isMastery ? 
                    `${user.raUsername} has mastered ${gameInfo.title} by earning all achievements in hardcore mode!` :
                    `${user.raUsername} has beaten ${gameInfo.title} by completing all core achievements!`,
                gameTitle: gameInfo.title,
                gameId: gameId,
                thumbnail: thumbnailUrl,
                badgeUrl: profileImageUrl,
                color: isMastery ? '#FFD700' : '#C0C0C0', // Gold for mastery, silver for beaten
                isMastery: isMastery,
                isBeaten: isBeaten
            }, ALERT_TYPES.MASTERY); // Use MASTERY alert type for proper channel routing
            
            console.log(`Announced ${isMastery ? 'mastery' : 'beaten'} award for ${user.raUsername} on game ${gameInfo.title}`);
            return true;
            
        } catch (error) {
            console.error(`Error checking for game mastery for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    }

    /**
     * Check for monthly/shadow game awards
     */
    async checkForGameAwards(user, gameId, isShadow) {
        try {
            if (!user || !gameId) return false;
            
            console.log(`Checking game awards for ${user.raUsername} on ${isShadow ? 'shadow' : 'monthly'} game ${gameId}`);
            
            // Get the user's game progress with awards
            const progress = await RetroAPIUtils.getUserGameProgressWithAwards(user.raUsername, gameId);
            
            console.log(`Progress data for ${user.raUsername} on ${isShadow ? 'shadow' : 'monthly'} game ${gameId}:`, {
                HighestAwardKind: progress?.HighestAwardKind,
                UserCompletion: progress?.UserCompletion,
                UserCompletionHardcore: progress?.UserCompletionHardcore
            });
            
            // Check if the user has any award for this game
            if (!progress || !progress.HighestAwardKind) {
                console.log(`No award found for ${user.raUsername} on ${isShadow ? 'shadow' : 'monthly'} game ${gameId}`);
                return false;
            }
            
            // Create a unique identifier for this award
            const systemType = isShadow ? 'shadow' : 'monthly';
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${progress.HighestAwardKind}`;
            
            // Check if we've already announced this award
            if (this.sessionAwardHistory.has(awardIdentifier) || 
                (user.announcedAwards && user.announcedAwards.includes(awardIdentifier))) {
                console.log(`Award ${awardIdentifier} already announced for ${user.raUsername}, skipping`);
                return false;
            }
            
            // Get game info
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            
            // Determine award type
            let awardType = '';
            let awardTitle = '';
            let awardDescription = '';
            let awardEmoji = '';
            let awardColor = '';
            
            if (progress.HighestAwardKind === 'mastery') {
                awardType = 'mastery';
                awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Mastery`;
                awardDescription = `${user.raUsername} has mastered the ${systemType} challenge game ${gameInfo.title}!`;
                awardEmoji = AWARD_EMOJIS.MASTERY;
                awardColor = '#FFD700'; // Gold for mastery
            } else if (progress.HighestAwardKind === 'completion') {
                awardType = 'beaten';
                awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Beaten`;
                awardDescription = `${user.raUsername} has beaten the ${systemType} challenge game ${gameInfo.title}!`;
                awardEmoji = AWARD_EMOJIS.BEATEN;
                awardColor = '#C0C0C0'; // Silver for beaten
            } else if (progress.HighestAwardKind === 'participation') {
                awardType = 'participation';
                awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Participation`;
                awardDescription = `${user.raUsername} has participated in the ${systemType} challenge with ${gameInfo.title}!`;
                awardEmoji = AWARD_EMOJIS.PARTICIPATION;
                awardColor = '#CD7F32'; // Bronze for participation
            } else {
                console.log(`Award type ${progress.HighestAwardKind} not announced for ${systemType} games`);
                return false;
            }
            
            // Get user's profile image
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
            
            // Prepare thumbnail URL
            const thumbnailUrl = gameInfo?.imageIcon ? 
                `https://retroachievements.org${gameInfo.imageIcon}` : null;
            
            // Add award to session history
            this.sessionAwardHistory.add(awardIdentifier);
            
            // Add to user's announced awards
            if (!user.announcedAwards) {
                user.announcedAwards = [];
            }
            user.announcedAwards.push(awardIdentifier);
            
            // Limit the size of the announcedAwards array
            if (user.announcedAwards.length > 100) {
                user.announcedAwards = user.announcedAwards.slice(-100);
            }
            
            // Save the user
            await user.save();
            
            // Determine which alert type to use
            const alertType = isShadow ? ALERT_TYPES.SHADOW : ALERT_TYPES.MONTHLY;
            
            // Now announce the award using AlertUtils with the appropriate alert type
            await AlertUtils.sendAchievementAlert({
                username: user.raUsername,
                achievementTitle: awardTitle,
                achievementDescription: awardDescription,
                gameTitle: gameInfo.title,
                gameId: gameId,
                thumbnail: thumbnailUrl,
                badgeUrl: profileImageUrl,
                color: awardColor,
                isAward: true
            }, alertType); // Use appropriate alert type for correct channel routing
            
            console.log(`Announced ${awardType} award for ${user.raUsername} on ${systemType} game ${gameInfo.title}`);
            return true;
            
        } catch (error) {
            console.error(`Error checking for ${isShadow ? 'shadow' : 'monthly'} game awards for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    }

    /**
     * Get user's profile image URL with caching
     */
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
}

// Create singleton instance
const gameAwardService = new GameAwardService();
export default gameAwardService;
