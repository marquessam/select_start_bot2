// src/services/gameAwardService.js - Streamlined with hardcoded GP display
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';
import { EmbedBuilder } from 'discord.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertUtils, { ALERT_TYPES } from '../utils/AlertUtils.js';

// Lazy loading of GP service to prevent module loading issues
let gpRewardService = null;
let GP_REWARDS = null;
let gpServiceLoaded = false;
let gpServiceLoading = false;

// Lazy load GP service
async function loadGPService() {
    if (gpServiceLoaded || gpServiceLoading) return;
    
    gpServiceLoading = true;
    
    try {
        const gpModule = await import('./gpRewardService.js');
        gpRewardService = gpModule.default;
        GP_REWARDS = gpModule.GP_REWARDS;
        gpServiceLoaded = true;
        console.log('✅ GP reward service loaded successfully');
    } catch (gpError) {
        console.warn('⚠️ GP reward service not available:', gpError.message);
        // Define fallback GP_REWARDS to prevent errors
        GP_REWARDS = {
            REGULAR_MASTERY: 50,
            MONTHLY_MASTERY: 100,
            MONTHLY_BEATEN: 50,
            MONTHLY_PARTICIPATION: 25,
            SHADOW_MASTERY: 100,
            SHADOW_BEATEN: 50,
            SHADOW_PARTICIPATION: 25
        };
        gpServiceLoaded = true;
    }
    
    gpServiceLoading = false;
}

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
        
        // Award announcement cutoff
        this.maxAwardAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for game award service');
        AlertUtils.setClient(client);
    }

    async initialize() {
        if (!this.client) {
            console.error('Discord client not set for game award service');
            return;
        }

        try {
            console.log('Initializing game award service...');
            
            // Load GP service during initialization
            await loadGPService();
            
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
            
            if (!currentChallenge) {
                return;
            }
            
            // Add monthly and shadow game IDs to the map
            if (currentChallenge.monthly_challange_gameid) {
                const monthlyGameId = String(currentChallenge.monthly_challange_gameid);
                this.gameSystemMap.set(monthlyGameId, 'monthly');
            }
            
            if (currentChallenge.shadow_challange_gameid) {
                const shadowGameId = String(currentChallenge.shadow_challange_gameid);
                this.gameSystemMap.set(shadowGameId, 'shadow');
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
        
        return 'regular';
    }
    
    /**
     * Initialize session history
     */
    async initializeSessionHistory() {
        this.sessionAwardHistory.clear();
        
        try {
            // Get all users
            const users = await User.find({});
            let totalEntries = 0;
            
            // Add all announced awards to session history
            for (const user of users) {
                if (user.announcedAwards && Array.isArray(user.announcedAwards)) {
                    for (const award of user.announcedAwards) {
                        this.sessionAwardHistory.add(award);
                        totalEntries++;
                    }
                }
            }
            
            // Clean up very old entries from session history
            const now = Date.now();
            const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            let removedOldEntries = 0;
            
            for (const award of this.sessionAwardHistory) {
                const parts = award.split(':');
                if (parts.length >= 5) {
                    const timestamp = parseInt(parts[4]);
                    if (!isNaN(timestamp) && (now - timestamp) > maxAge) {
                        this.sessionAwardHistory.delete(award);
                        removedOldEntries++;
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
     * Get user awards using the getUserAwards API endpoint
     */
    async getUserAwards(username) {
        try {
            return await retroAPI.getUserAwards(username);
        } catch (error) {
            console.error(`Error fetching user awards for ${username}:`, error);
            return null;
        }
    }

    /**
     * Check if a user has mastered a game
     */
    async checkForGameMastery(user, gameId, achievement) {
        try {
            if (!user || !gameId) return false;
            
            // Force refresh of game system map to ensure we have latest data
            await this.refreshGameSystemMap();
            
            // Determine which system this game belongs to
            const systemType = this.getGameSystemType(gameId);
            
            // For monthly/shadow games, we handle these separately
            if (systemType !== 'regular') {
                return await this.checkForGameAwards(user, gameId, systemType === 'shadow');
            }
            
            // Continue with regular game logic...
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
            
            console.log(`✅ Successfully announced ${awardType} award for ${user.raUsername} on regular game ${gameInfo.title}`);
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
            
            const systemType = isShadow ? 'shadow' : 'monthly';
            
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
            
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${awardType}:${awardDate.getTime()}`;
            
            if (this.isDuplicateAward(awardIdentifier, user)) {
                return false;
            }
            
            // Get game info and announce
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            await this.addAwardToHistory(awardIdentifier, user);
            
            // Announce the award
            await this.announceMonthlyAward(user, gameInfo, gameId, awardType, systemType);
            
            console.log(`✅ Successfully announced ${awardType} award for ${user.raUsername} on ${systemType} game ${gameInfo.title}`);
            return true;
            
        } catch (error) {
            console.error(`Error checking for ${isShadow ? 'shadow' : 'monthly'} game awards for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    }

    /**
     * Check for duplicate awards
     */
    isDuplicateAward(awardIdentifier, user) {
        // Check session history first
        if (this.sessionAwardHistory.has(awardIdentifier)) {
            return true;
        }
        
        // Extract components for flexible matching
        const parts = awardIdentifier.split(':');
        if (parts.length < 4) {
            return false;
        }
        
        const [username, systemType, gameId, awardType] = parts;
        const newTimestamp = parts.length >= 5 ? parseInt(parts[4]) : null;
        
        // Check user's announced awards with flexible matching
        if (user.announcedAwards && Array.isArray(user.announcedAwards)) {
            for (const existingAward of user.announcedAwards) {
                const existingParts = existingAward.split(':');
                if (existingParts.length >= 4) {
                    const [existingUsername, existingSystem, existingGameId, existingType] = existingParts;
                    const existingTimestamp = existingParts.length >= 5 ? parseInt(existingParts[4]) : null;
                    
                    // Match if same user, system, game, and award type
                    if (existingUsername === username && 
                        existingSystem === systemType && 
                        existingGameId === gameId && 
                        existingType === awardType) {
                        
                        // For exact duplicates, always skip
                        if (existingAward === awardIdentifier) {
                            return true;
                        }
                        
                        // Check timestamp difference
                        if (existingTimestamp && newTimestamp) {
                            const timeDiff = Math.abs(newTimestamp - existingTimestamp);
                            const maxTimeDiff = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
                            
                            if (timeDiff < maxTimeDiff) {
                                return true;
                            }
                        } else {
                            // If no timestamps, treat any matching award as duplicate
                            return true;
                        }
                    }
                }
            }
        }
        
        // Check for similar awards in session history
        for (const sessionAward of this.sessionAwardHistory) {
            const sessionParts = sessionAward.split(':');
            if (sessionParts.length >= 4) {
                const [sessionUsername, sessionSystem, sessionGameId, sessionType] = sessionParts;
                const sessionTimestamp = sessionParts.length >= 5 ? parseInt(sessionParts[4]) : null;
                
                if (sessionUsername === username && 
                    sessionSystem === systemType && 
                    sessionGameId === gameId && 
                    sessionType === awardType) {
                    
                    // If we have timestamps, check if they're within a reasonable timeframe
                    if (sessionTimestamp && newTimestamp) {
                        const timeDiff = Math.abs(newTimestamp - sessionTimestamp);
                        const maxTimeDiff = 24 * 60 * 60 * 1000; // 24 hours
                        
                        if (timeDiff < maxTimeDiff) {
                            return true;
                        }
                    } else {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    /**
     * Add award to history
     */
    async addAwardToHistory(awardIdentifier, user) {
        // Add to session history
        this.sessionAwardHistory.add(awardIdentifier);
        
        // Add to user's announced awards
        if (!user.announcedAwards) {
            user.announcedAwards = [];
        }
        
        // Check if already exists before adding
        if (!user.announcedAwards.includes(awardIdentifier)) {
            user.announcedAwards.push(awardIdentifier);
        }
        
        // Clean up old entries (keep only last 100 per user)
        if (user.announcedAwards.length > 100) {
            user.announcedAwards = user.announcedAwards.slice(-100);
        }
        
        await user.save();
    }

    /**
     * Announce regular game award with hardcoded GP display
     */
    async announceRegularAward(user, gameInfo, gameId, isMastery, isBeaten) {
        // Ensure GP service is loaded
        await loadGPService();
        
        const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
        const thumbnailUrl = gameInfo?.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null;
        
        // Award GP for regular game completion
        if (gpRewardService && GP_REWARDS) {
            try {
                await gpRewardService.awardRegularGameGP(user, gameInfo.title, isMastery);
            } catch (gpError) {
                console.error(`Error awarding regular game GP to ${user.raUsername}:`, gpError);
            }
        }

        // Create description with hardcoded GP display
        const userLink = `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})`;
        const gameLink = `[${gameInfo.title}](https://retroachievements.org/game/${gameId})`;
        
        let description = '';
        if (isMastery) {
            description = `${userLink} has mastered ${gameLink}!\n` +
                         `They've earned every achievement in the game.`;
        } else {
            description = `${userLink} has beaten ${gameLink}!\n` +
                         `They've completed the core achievements.`;
        }

        // Add hardcoded GP display at the bottom
        const gpDisplay = isMastery ? 50 : 25;
        description += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🏆 **+${gpDisplay} GP** earned!`;
        
        await AlertUtils.sendAchievementAlert({
            username: user.raUsername,
            achievementTitle: isMastery ? `Mastery of ${gameInfo.title}` : `Beaten ${gameInfo.title}`,
            achievementDescription: description,
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
     * Announce monthly/shadow award with hardcoded GP display
     */
    async announceMonthlyAward(user, gameInfo, gameId, awardType, systemType) {
        // Ensure GP service is loaded
        await loadGPService();
        
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
            console.error(`Unknown award type: ${awardType} for ${systemType} game`);
            return;
        }
        
        const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
        const thumbnailUrl = gameInfo?.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null;
        
        // Award GP for challenge completion
        if (gpRewardService) {
            try {
                await gpRewardService.awardChallengeGP(user, gameInfo.title, awardType, systemType);
            } catch (gpError) {
                console.error(`Error awarding challenge GP to ${user.raUsername}:`, gpError);
            }
        }

        // Create description with hardcoded GP display
        const userLink = `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})`;
        const gameLink = `[${gameInfo.title}](https://retroachievements.org/game/${gameId})`;
        
        let description = `${userLink} has earned ${awardTitle.toLowerCase()} for ${gameLink}!`;
        
        // Add hardcoded GP display at the bottom based on award type
        let gpDisplay = 0;
        if (awardType === 'mastery') {
            gpDisplay = 100; // Both shadow and monthly mastery = 100
        } else if (awardType === 'beaten') {
            gpDisplay = 50; // Both shadow and monthly beaten = 50
        } else if (awardType === 'participation') {
            gpDisplay = 25; // Both shadow and monthly participation = 25
        }
        
        description += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n🏆 **+${gpDisplay} GP** earned!`;
        
        // Use correct alert type based on system type
        const alertType = systemType === 'shadow' ? ALERT_TYPES.SHADOW : ALERT_TYPES.MONTHLY;
        
        await AlertUtils.sendAchievementAlert({
            username: user.raUsername,
            achievementTitle: awardTitle,
            achievementDescription: description,
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
        this.sessionAwardHistory.clear();
        this.initializeSessionHistory();
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
