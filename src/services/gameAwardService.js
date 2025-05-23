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
     * ENHANCED: Parse completion percentage with multiple fallback methods
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
        
        console.warn(`Could not parse completion percentage: "${completionString}"`);
        return 0;
    }

    /**
     * DEBUG: Enhanced mastery checking with detailed logging
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
            
            // Check achievements count
            console.log('\n=== ACHIEVEMENT COUNTS ===');
            console.log('NumAwardedToUser:', progress.NumAwardedToUser);
            console.log('NumAchievements:', progress.NumAchievements);
            
            if (progress.NumAwardedToUser && progress.NumAchievements) {
                const completionRatio = progress.NumAwardedToUser / progress.NumAchievements;
                console.log('Completion ratio:', completionRatio, '(', (completionRatio * 100).toFixed(2), '%)');
            }
            
            // Check for achievement data
            if (progress.Achievements) {
                console.log('\n=== ACHIEVEMENTS DATA ===');
                console.log('Achievements object exists, keys:', Object.keys(progress.Achievements).length);
                
                // Sample a few achievements to see their structure
                const achievementIds = Object.keys(progress.Achievements).slice(0, 3);
                for (const id of achievementIds) {
                    console.log(`Sample achievement ${id}:`, JSON.stringify(progress.Achievements[id], null, 2));
                }
            }
            
            // Try alternative API endpoints
            console.log('\n=== TRYING ALTERNATIVE API CALLS ===');
            
            try {
                // Try getUserInfo to see if it has award information
                const userInfo = await retroAPI.getUserInfo(user.raUsername);
                console.log('UserInfo awards field:', userInfo.awards);
                
                // Try getGameInfo to see game structure
                const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
                console.log('Game info title:', gameInfo.title);
                
            } catch (altError) {
                console.log('Error with alternative API calls:', altError.message);
            }
            
            console.log('=== END DEBUG ===\n');
            return false; // Don't actually announce during debug
            
        } catch (error) {
            console.error('Error in debug mastery check:', error);
            return false;
        }
    }

    /**
     * COMPREHENSIVE FIX: Check if a user has mastered a game and announce if so
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
            
            // ENHANCED: Try multiple API approaches to get award information
            let progress = null;
            let masteryInfo = null;
            
            // Approach 1: Try the getUserGameProgressWithAwards method
            try {
                progress = await RetroAPIUtils.getUserGameProgressWithAwards(user.raUsername, gameId);
                console.log(`Progress API response keys:`, Object.keys(progress || {}));
                console.log(`HighestAwardKind:`, progress?.HighestAwardKind);
                console.log(`UserCompletion:`, progress?.UserCompletion);
                console.log(`UserCompletionHardcore:`, progress?.UserCompletionHardcore);
            } catch (error) {
                console.error('Error with getUserGameProgressWithAwards:', error);
            }
            
            // Approach 2: Try to get user info which might have awards data
            try {
                const userInfo = await retroAPI.getUserInfo(user.raUsername);
                if (userInfo.awards && Array.isArray(userInfo.awards)) {
                    // Look for this specific game in the awards
                    const gameAward = userInfo.awards.find(award => 
                        award.AwardData === gameId || 
                        award.GameID === gameId ||
                        award.gameId === gameId
                    );
                    
                    if (gameAward) {
                        console.log(`Found game award in user info:`, gameAward);
                        masteryInfo = {
                            hasAward: true,
                            awardType: gameAward.AwardType || gameAward.Type,
                            awardDate: gameAward.AwardedAt || gameAward.Date,
                            gameTitle: gameAward.Title || gameAward.GameTitle
                        };
                    }
                }
            } catch (error) {
                console.error('Error getting user info for awards:', error);
            }
            
            // Approach 3: Use standard game progress and infer mastery from completion
            if (!progress) {
                try {
                    progress = await RetroAPIUtils.getUserGameProgress(user.raUsername, gameId);
                    console.log(`Standard progress API response:`, {
                        numAwardedToUser: progress?.numAwardedToUser,
                        achievements: Object.keys(progress?.achievements || {}).length
                    });
                } catch (error) {
                    console.error('Error with standard getUserGameProgress:', error);
                }
            }
            
            if (!progress) {
                console.log(`No progress data available for ${user.raUsername} on game ${gameId}`);
                return false;
            }
            
            // ENHANCED: Multiple ways to detect mastery/completion
            let isMastery = false;
            let isBeaten = false;
            let awardType = null;
            
            // Method 1: Check HighestAwardKind field (if available)
            if (progress.HighestAwardKind) {
                awardType = progress.HighestAwardKind.toLowerCase();
                console.log(`Award type from HighestAwardKind: ${awardType}`);
            }
            
            // Method 2: Check alternative award fields
            const alternativeAwardFields = [
                'UserAward', 'Award', 'AwardKind', 'UserAwardKind', 
                'HighestAward', 'CompletionStatus', 'MasteryStatus'
            ];
            
            for (const field of alternativeAwardFields) {
                if (progress[field]) {
                    awardType = progress[field].toString().toLowerCase();
                    console.log(`Award type from ${field}: ${awardType}`);
                    break;
                }
            }
            
            // Method 3: Infer from completion percentages and achievement counts
            if (!awardType) {
                const numAwarded = progress.NumAwardedToUser || progress.numAwardedToUser || 0;
                const totalAchievements = progress.NumAchievements || Object.keys(progress.achievements || {}).length;
                
                console.log(`Achievement count check: ${numAwarded}/${totalAchievements}`);
                
                if (numAwarded > 0 && totalAchievements > 0) {
                    const completionRatio = numAwarded / totalAchievements;
                    console.log(`Completion ratio: ${completionRatio} (${(completionRatio * 100).toFixed(1)}%)`);
                    
                    if (completionRatio >= 1.0) {
                        // User has all achievements - now check if hardcore
                        const hardcoreCompletion = this.parseCompletionPercentage(
                            progress.UserCompletionHardcore || progress.HardcoreCompletion || '0'
                        );
                        
                        console.log(`Hardcore completion: ${hardcoreCompletion}%`);
                        
                        if (hardcoreCompletion >= 100) {
                            awardType = 'mastery';
                            console.log('Inferred mastery from 100% hardcore completion');
                        } else {
                            awardType = 'completion';
                            console.log('Inferred beaten from 100% regular completion');
                        }
                    }
                }
            }
            
            // Method 4: Use masteryInfo from user awards if available
            if (!awardType && masteryInfo && masteryInfo.hasAward) {
                awardType = masteryInfo.awardType?.toLowerCase() || 'completion';
                console.log(`Award type from user info: ${awardType}`);
            }
            
            // Determine final award status
            if (awardType) {
                if (awardType.includes('mastery') || awardType.includes('master')) {
                    isMastery = true;
                } else if (awardType.includes('completion') || awardType.includes('beaten') || awardType.includes('complete')) {
                    isBeaten = true;
                }
            }
            
            console.log(`Final determination: mastery=${isMastery}, beaten=${isBeaten}, awardType=${awardType}`);
            
            if (!isMastery && !isBeaten) {
                console.log(`No mastery or beaten status found for ${user.raUsername} on game ${gameId}`);
                return false;
            }
            
            // Create a unique identifier for this award
            const finalAwardType = isMastery ? 'mastery' : 'completion';
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${finalAwardType}`;
            
            // Check if we've already announced this award
            if (this.sessionAwardHistory.has(awardIdentifier) || 
                (user.announcedAwards && user.announcedAwards.includes(awardIdentifier))) {
                console.log(`Award ${awardIdentifier} already announced for ${user.raUsername}, skipping`);
                return false;
            }
            
            // ENHANCED: Double-check completion requirements
            if (isMastery) {
                // For mastery, verify hardcore completion
                const hardcoreCompletion = this.parseCompletionPercentage(
                    progress.UserCompletionHardcore || progress.HardcoreCompletion || '0'
                );
                
                if (hardcoreCompletion < 100) {
                    console.log(`User ${user.raUsername} doesn't have 100% hardcore completion for mastery (${hardcoreCompletion}%), skipping`);
                    return false;
                }
            }
            
            if (isBeaten) {
                // For beaten, verify regular completion
                const regularCompletion = this.parseCompletionPercentage(
                    progress.UserCompletion || progress.Completion || '0'
                );
                
                if (regularCompletion < 100) {
                    console.log(`User ${user.raUsername} doesn't have 100% completion for beaten status (${regularCompletion}%), skipping`);
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
            
            console.log(`✅ Successfully announced ${isMastery ? 'mastery' : 'beaten'} award for ${user.raUsername} on game ${gameInfo.title}`);
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
