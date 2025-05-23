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
                }
                
                if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                    const shadowGameId = String(currentChallenge.shadow_challange_gameid);
                    this.gameSystemMap.set(shadowGameId, 'shadow');
                }
            }
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
        this.sessionAwardHistory.clear();
        
        try {
            // Get all users
            const users = await User.find({});
            
            // Add all announced awards to session history
            for (const user of users) {
                if (user.announcedAwards && Array.isArray(user.announcedAwards)) {
                    for (const award of user.announcedAwards) {
                        this.sessionAwardHistory.add(award);
                    }
                }
            }
        } catch (error) {
            console.error('Error initializing session award history:', error);
        }
    }

    /**
     * Normalize award kind strings to handle API variations
     */
    normalizeAwardKind(awardKind) {
        if (!awardKind) return null;
        
        const normalized = awardKind.toString().toLowerCase().trim();
        
        // Map various API responses to standard values
        const mappings = {
            'mastered': 'mastery',
            'mastery': 'mastery',
            'master': 'mastery',
            'completed': 'completion',
            'completion': 'completion',
            'beaten': 'completion',
            'complete': 'completion',
            'participated': 'participation',
            'participation': 'participation'
        };
        
        return mappings[normalized] || normalized;
    }

    /**
     * Parse completion percentage with multiple fallback methods
     */
    parseCompletionPercentage(completionString) {
        if (!completionString) return 0;
        
        // Convert to string if it isn't already
        const str = completionString.toString().trim();
        
        // Try multiple parsing approaches
        const approaches = [
            // Direct number (for cases where it's already a number)
            () => typeof completionString === 'number' ? completionString : NaN,
            
            // Strip % symbol and parse
            () => parseFloat(str.replace('%', '')),
            
            // Strip all non-numeric characters except decimal point
            () => parseFloat(str.replace(/[^\d.-]/g, '')),
            
            // Extract first number using regex
            () => {
                const match = str.match(/[\d.-]+/);
                return match ? parseFloat(match[0]) : NaN;
            },
            
            // Handle fraction format (like "85/85")
            () => {
                const fractionMatch = str.match(/(\d+)\/(\d+)/);
                if (fractionMatch) {
                    const numerator = parseInt(fractionMatch[1]);
                    const denominator = parseInt(fractionMatch[2]);
                    return denominator > 0 ? (numerator / denominator) * 100 : NaN;
                }
                return NaN;
            }
        ];
        
        // Try each approach until we get a valid number
        for (const approach of approaches) {
            try {
                const result = approach();
                if (!isNaN(result) && isFinite(result)) {
                    return Math.max(0, Math.min(100, result)); // Clamp between 0 and 100
                }
            } catch (error) {
                // Continue to next approach
            }
        }
        
        return 0;
    }

    /**
     * Check if a user has mastered a game and announce if so
     */
    async checkForGameMastery(user, gameId, achievement) {
        try {
            if (!user || !gameId) return false;
            
            // Determine which system this game belongs to
            const systemType = this.getGameSystemType(gameId);
            
            // For monthly/shadow games, we handle these separately
            if (systemType !== 'regular') {
                return await this.checkForGameAwards(user, gameId, systemType === 'shadow');
            }
            
            // Get the user's game progress with awards
            const progress = await RetroAPIUtils.getUserGameProgressWithAwards(user.raUsername, gameId);
            
            if (!progress) {
                return false;
            }
            
            // Normalize the award kind
            const normalizedAwardKind = this.normalizeAwardKind(progress.HighestAwardKind);
            
            if (!normalizedAwardKind || (normalizedAwardKind !== 'mastery' && normalizedAwardKind !== 'completion')) {
                return false;
            }
            
            const isMastery = normalizedAwardKind === 'mastery';
            const isBeaten = normalizedAwardKind === 'completion';
            
            // Create a unique identifier for this award
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${normalizedAwardKind}`;
            
            // Check if we've already announced this award
            if (this.sessionAwardHistory.has(awardIdentifier) || 
                (user.announcedAwards && user.announcedAwards.includes(awardIdentifier))) {
                return false;
            }
            
            // Verify completion requirements
            if (isMastery) {
                const hardcoreCompletion = this.parseCompletionPercentage(progress.UserCompletionHardcore);
                if (hardcoreCompletion < 100) {
                    return false;
                }
            }
            
            if (isBeaten) {
                const regularCompletion = this.parseCompletionPercentage(progress.UserCompletion);
                if (regularCompletion < 100) {
                    return false;
                }
            }
            
            // Get game info
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            
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
            
            // Announce the award
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
                color: isMastery ? '#FFD700' : '#C0C0C0',
                isMastery: isMastery,
                isBeaten: isBeaten
            }, ALERT_TYPES.MASTERY);
            
            console.log(`Announced ${isMastery ? 'mastery' : 'beaten'} award for ${user.raUsername} on ${gameInfo.title}`);
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
            
            // Get the user's game progress with awards
            const progress = await RetroAPIUtils.getUserGameProgressWithAwards(user.raUsername, gameId);
            
            // Check if the user has any award for this game
            if (!progress || !progress.HighestAwardKind) {
                return false;
            }
            
            // Normalize the award kind
            const normalizedAwardKind = this.normalizeAwardKind(progress.HighestAwardKind);
            
            // Create a unique identifier for this award
            const systemType = isShadow ? 'shadow' : 'monthly';
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${normalizedAwardKind}`;
            
            // Check if we've already announced this award
            if (this.sessionAwardHistory.has(awardIdentifier) || 
                (user.announcedAwards && user.announcedAwards.includes(awardIdentifier))) {
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
            
            if (normalizedAwardKind === 'mastery') {
                awardType = 'mastery';
                awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Mastery`;
                awardDescription = `${user.raUsername} has mastered the ${systemType} challenge game ${gameInfo.title}!`;
                awardEmoji = AWARD_EMOJIS.MASTERY;
                awardColor = '#FFD700'; // Gold for mastery
            } else if (normalizedAwardKind === 'completion') {
                awardType = 'beaten';
                awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Beaten`;
                awardDescription = `${user.raUsername} has beaten the ${systemType} challenge game ${gameInfo.title}!`;
                awardEmoji = AWARD_EMOJIS.BEATEN;
                awardColor = '#C0C0C0'; // Silver for beaten
            } else if (normalizedAwardKind === 'participation') {
                awardType = 'participation';
                awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Participation`;
                awardDescription = `${user.raUsername} has participated in the ${systemType} challenge with ${gameInfo.title}!`;
                awardEmoji = AWARD_EMOJIS.PARTICIPATION;
                awardColor = '#CD7F32'; // Bronze for participation
            } else {
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
            
            // Announce the award
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
            }, alertType);
            
            console.log(`Announced ${awardType} award for ${user.raUsername} on ${systemType} game ${gameInfo.title}`);
            return true;
            
        } catch (error) {
            console.error(`Error checking for ${isShadow ? 'shadow' : 'monthly'} game awards for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    }

    /**
     * Debug mastery detection with detailed logging
     */
    async debugCheckForGameMastery(user, gameId) {
        try {
            if (!user || !gameId) return false;
            
            console.log(`\n=== DEBUG MASTERY CHECK FOR ${user.raUsername} ON GAME ${gameId} ===`);
            
            // Get the user's game progress with awards
            const progress = await RetroAPIUtils.getUserGameProgressWithAwards(user.raUsername, gameId);
            
            console.log('=== RAW API RESPONSE ===');
            console.log(JSON.stringify(progress, null, 2));
            
            if (!progress) {
                console.log('❌ No progress data returned from API');
                return false;
            }
            
            // Log all top-level fields
            console.log('\n=== TOP-LEVEL FIELDS ===');
            console.log('Available fields:', Object.keys(progress));
            
            // Check for various possible award-related fields
            const possibleAwardFields = [
                'HighestAwardKind',
                'UserAward',
                'Award',
                'AwardKind', 
                'UserAwardKind',
                'MasteryStatus',
                'CompletionStatus',
                'UserCompletion',
                'UserCompletionHardcore',
                'HardcoreCompletion',
                'NumAwardedToUser',
                'NumAchievements',
                'MaxPossible',
                'PossibleScore',
                'ScoreAchieved',
                'ScoreAchievedHardcore'
            ];
            
            console.log('\n=== AWARD-RELATED FIELDS ===');
            for (const field of possibleAwardFields) {
                if (progress.hasOwnProperty(field)) {
                    console.log(`✅ ${field}:`, progress[field]);
                } else {
                    console.log(`❌ ${field}: NOT FOUND`);
                }
            }
            
            // Check if there's a nested user object
            if (progress.User) {
                console.log('\n=== USER OBJECT ===');
                console.log('User object:', JSON.stringify(progress.User, null, 2));
            }
            
            // Parse completion percentages with multiple methods
            console.log('\n=== COMPLETION PARSING ===');
            
            const userCompletion = progress.UserCompletion;
            const userCompletionHardcore = progress.UserCompletionHardcore;
            
            console.log('Raw UserCompletion:', userCompletion, '(type:', typeof userCompletion, ')');
            console.log('Raw UserCompletionHardcore:', userCompletionHardcore, '(type:', typeof userCompletionHardcore, ')');
            
            // Try different parsing methods
            const parseAttempts = [
                { method: 'direct_number', normal: userCompletion, hardcore: userCompletionHardcore },
                { method: 'parseFloat', normal: parseFloat(userCompletion), hardcore: parseFloat(userCompletionHardcore) },
                { method: 'parseInt', normal: parseInt(userCompletion), hardcore: parseInt(userCompletionHardcore) },
                { method: 'percentage_strip', normal: this.parseCompletionPercentage(userCompletion), hardcore: this.parseCompletionPercentage(userCompletionHardcore) }
            ];
            
            for (const attempt of parseAttempts) {
                console.log(`${attempt.method}:`, 
                    `normal=${attempt.normal} (${typeof attempt.normal})`, 
                    `hardcore=${attempt.hardcore} (${typeof attempt.hardcore})`);
            }
            
            console.log('=== END DEBUG ===\n');
            return false; // Don't actually announce during debug
            
        } catch (error) {
            console.error('Error in debug mastery check:', error);
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
