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
        
        // Award announcement cutoff (don't announce awards older than this)
        this.maxAwardAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
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
            'mastery/completion': 'mastery',
            'completed': 'completion',
            'completion': 'completion',
            'beaten': 'completion',
            'complete': 'completion',
            'game beaten': 'completion',
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
     * Get user awards using the getUserAwards API endpoint
     */
    async getUserAwards(username) {
        try {
            // Use the getUserAwards endpoint to get actual award data
            return await retroAPI.getUserAwards(username);
        } catch (error) {
            console.error(`Error fetching user awards for ${username}:`, error);
            return null;
        }
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
            
            // Get user's awards using the proper API endpoint
            const userAwards = await this.getUserAwards(user.raUsername);
            
            if (!userAwards || !userAwards.visibleUserAwards) {
                return false;
            }
            
            // Find awards for this specific game
            const gameAwards = userAwards.visibleUserAwards.filter(award => {
                return String(award.awardData || award.AwardData) === String(gameId);
            });
            
            if (gameAwards.length === 0) {
                return false;
            }
            
            // Find the highest award for this game
            let highestAward = null;
            let isMastery = false;
            let isBeaten = false;
            
            for (const award of gameAwards) {
                const awardType = award.awardType || award.AwardType || '';
                const awardExtra = award.awardDataExtra || award.AwardDataExtra || 0;
                
                const normalizedType = this.normalizeAwardKind(awardType);
                
                if (normalizedType === 'mastery') {
                    if (awardExtra === 1) { // Hardcore
                        isMastery = true;
                        highestAward = award;
                        break; // Mastery is highest, stop looking
                    }
                }
                
                if (normalizedType === 'completion') {
                    if (awardExtra === 1) { // Hardcore beaten
                        isBeaten = true;
                        if (!highestAward) highestAward = award;
                    }
                }
            }
            
            if (!highestAward) {
                return false;
            }
            
            // Check award age to prevent announcing old awards
            const awardDate = new Date(highestAward.awardedAt || highestAward.AwardedAt);
            const now = new Date();
            const ageInMs = now - awardDate;
            
            if (ageInMs > this.maxAwardAge) {
                return false;
            }
            
            // Create a unique identifier for this award with timestamp
            const awardType = isMastery ? 'mastery' : 'completion';
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${awardType}:${awardDate.getTime()}`;
            
            // Check for duplicates
            if (this.isDuplicateAward(awardIdentifier, user)) {
                return false;
            }
            
            // Get game info
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            
            // Add award to history
            await this.addAwardToHistory(awardIdentifier, user);
            
            // Announce the award
            await this.announceRegularAward(user, gameInfo, gameId, isMastery, isBeaten);
            
            console.log(`Announced ${awardType} award for ${user.raUsername} on ${gameInfo.title}`);
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
            
            // Get user's awards using the proper API endpoint
            const userAwards = await this.getUserAwards(user.raUsername);
            
            if (!userAwards || !userAwards.visibleUserAwards) {
                return false;
            }
            
            // Find awards for this specific game
            const gameAwards = userAwards.visibleUserAwards.filter(award => {
                return String(award.awardData || award.AwardData) === String(gameId);
            });
            
            if (gameAwards.length === 0) {
                return false;
            }
            
            // Find the highest award for this game
            let highestAward = null;
            let awardType = '';
            
            for (const award of gameAwards) {
                const type = award.awardType || award.AwardType || '';
                const extra = award.awardDataExtra || award.AwardDataExtra || 0;
                
                const normalizedType = this.normalizeAwardKind(type);
                
                if (normalizedType === 'mastery') {
                    if (extra === 1) { // Hardcore
                        awardType = 'mastery';
                        highestAward = award;
                        break;
                    }
                }
                
                if (normalizedType === 'completion') {
                    if (extra === 1) { // Hardcore
                        awardType = 'beaten';
                        if (!highestAward) highestAward = award;
                    }
                }
                
                if (normalizedType === 'participation') {
                    awardType = 'participation';
                    if (!highestAward) highestAward = award;
                }
            }
            
            if (!highestAward) {
                return false;
            }
            
            // Check award age
            const awardDate = new Date(highestAward.awardedAt || highestAward.AwardedAt);
            const now = new Date();
            const ageInMs = now - awardDate;
            
            if (ageInMs > this.maxAwardAge) {
                return false;
            }
            
            const systemType = isShadow ? 'shadow' : 'monthly';
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${awardType}:${awardDate.getTime()}`;
            
            if (this.isDuplicateAward(awardIdentifier, user)) {
                return false;
            }
            
            // Get game info and announce
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            await this.addAwardToHistory(awardIdentifier, user);
            
            await this.announceMonthlyAward(user, gameInfo, gameId, awardType, systemType);
            
            console.log(`Announced ${awardType} award for ${user.raUsername} on ${systemType} game ${gameInfo.title}`);
            return true;
            
        } catch (error) {
            console.error(`Error checking for ${isShadow ? 'shadow' : 'monthly'} game awards for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    }

    /**
     * Check if an award is a duplicate
     */
    isDuplicateAward(awardIdentifier, user) {
        // Check session history
        if (this.sessionAwardHistory.has(awardIdentifier)) {
            return true;
        }
        
        // Extract components for flexible matching
        const parts = awardIdentifier.split(':');
        if (parts.length < 4) return false;
        
        const [username, systemType, gameId, awardType] = parts;
        
        // Check user's announced awards with flexible matching
        if (user.announcedAwards && Array.isArray(user.announcedAwards)) {
            for (const existingAward of user.announcedAwards) {
                const existingParts = existingAward.split(':');
                if (existingParts.length >= 4) {
                    const [existingUsername, existingSystem, existingGameId, existingType] = existingParts;
                    
                    // Match if same user, system, game, and award type
                    if (existingUsername === username && 
                        existingSystem === systemType && 
                        existingGameId === gameId && 
                        existingType === awardType) {
                        
                        // For exact duplicates, always skip
                        if (existingAward === awardIdentifier) {
                            return true;
                        }
                        
                        // For same award but different timestamp, check if recent
                        if (existingParts.length >= 5 && parts.length >= 5) {
                            const existingTimestamp = parseInt(existingParts[4]);
                            const newTimestamp = parseInt(parts[4]);
                            
                            // If the existing award is within 24 hours of the new one, consider it a duplicate
                            if (Math.abs(newTimestamp - existingTimestamp) < 24 * 60 * 60 * 1000) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
        
        return false;
    }

    /**
     * Add award to history with proper cleanup
     */
    async addAwardToHistory(awardIdentifier, user) {
        // Add to session history
        this.sessionAwardHistory.add(awardIdentifier);
        
        // Add to user's announced awards
        if (!user.announcedAwards) {
            user.announcedAwards = [];
        }
        
        user.announcedAwards.push(awardIdentifier);
        
        // Clean up old entries (keep only last 50 per user)
        if (user.announcedAwards.length > 50) {
            user.announcedAwards = user.announcedAwards.slice(-50);
        }
        
        await user.save();
    }

    /**
     * Announce regular game award
     */
    async announceRegularAward(user, gameInfo, gameId, isMastery, isBeaten) {
        const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
        const thumbnailUrl = gameInfo?.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null;
        
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
    }

    /**
     * Announce monthly/shadow award
     */
    async announceMonthlyAward(user, gameInfo, gameId, awardType, systemType) {
        let awardTitle = '';
        let awardColor = '';
        let awardEmoji = '';
        
        if (awardType === 'mastery') {
            awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Mastery`;
            awardColor = '#FFD700'; // Gold for mastery
            awardEmoji = AWARD_EMOJIS.MASTERY;
        } else if (awardType === 'beaten') {
            awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Beaten`;
            awardColor = '#C0C0C0'; // Silver for beaten
            awardEmoji = AWARD_EMOJIS.BEATEN;
        } else if (awardType === 'participation') {
            awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Participation`;
            awardColor = '#CD7F32'; // Bronze for participation
            awardEmoji = AWARD_EMOJIS.PARTICIPATION;
        } else {
            return;
        }
        
        const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
        const thumbnailUrl = gameInfo?.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null;
        const alertType = systemType === 'shadow' ? ALERT_TYPES.SHADOW : ALERT_TYPES.MONTHLY;
        
        await AlertUtils.sendAchievementAlert({
            username: user.raUsername,
            achievementTitle: awardTitle,
            achievementDescription: `${user.raUsername} has earned ${awardTitle.toLowerCase()} for ${gameInfo.title}!`,
            gameTitle: gameInfo.title,
            gameId: gameId,
            thumbnail: thumbnailUrl,
            badgeUrl: profileImageUrl,
            color: awardColor,
            isAward: true
        }, alertType);
    }

    /**
     * Clean up old session history periodically
     */
    cleanupSessionHistory() {
        // This should be called periodically to prevent memory buildup
        // For now, just clear it completely as it will rebuild from database
        this.sessionAwardHistory.clear();
        this.initializeSessionHistory();
    }

    /**
     * Debug mastery detection with detailed logging
     */
    async debugCheckForGameMastery(user, gameId) {
        try {
            if (!user || !gameId) return false;
            
            console.log(`\n=== DEBUG MASTERY CHECK FOR ${user.raUsername} ON GAME ${gameId} ===`);
            
            // Get user's awards using the proper API endpoint
            const userAwards = await this.getUserAwards(user.raUsername);
            
            console.log('=== USER AWARDS API RESPONSE ===');
            if (userAwards) {
                console.log('Top-level keys:', Object.keys(userAwards));
                console.log('Total awards count:', userAwards.totalAwardsCount || userAwards.TotalAwardsCount);
                console.log('Visible awards count:', userAwards.visibleUserAwards?.length || 0);
                
                if (userAwards.visibleUserAwards && userAwards.visibleUserAwards.length > 0) {
                    // Find awards for this game
                    const gameAwards = userAwards.visibleUserAwards.filter(award => {
                        return String(award.awardData || award.AwardData) === String(gameId);
                    });
                    
                    console.log(`\n=== AWARDS FOR GAME ${gameId} ===`);
                    console.log(`Found ${gameAwards.length} awards for this game:`);
                    
                    gameAwards.forEach((award, index) => {
                        console.log(`Award ${index + 1}:`);
                        console.log('  - Type:', award.awardType || award.AwardType);
                        console.log('  - Data:', award.awardData || award.AwardData);
                        console.log('  - Extra:', award.awardDataExtra || award.AwardDataExtra);
                        console.log('  - Date:', award.awardedAt || award.AwardedAt);
                        console.log('  - Title:', award.title || award.Title);
                        console.log('  - Normalized Type:', this.normalizeAwardKind(award.awardType || award.AwardType));
                    });
                    
                    if (gameAwards.length === 0) {
                        console.log('❌ No awards found for this specific game');
                        
                        // Show some sample awards for reference
                        console.log('\n=== SAMPLE OF ALL AWARDS (first 3) ===');
                        userAwards.visibleUserAwards.slice(0, 3).forEach((award, index) => {
                            console.log(`Sample ${index + 1}:`);
                            console.log('  - Game ID:', award.awardData || award.AwardData);
                            console.log('  - Type:', award.awardType || award.AwardType);
                            console.log('  - Title:', award.title || award.Title);
                        });
                    }
                } else {
                    console.log('❌ No visible user awards found');
                }
            } else {
                console.log('❌ No user awards data returned from API');
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
