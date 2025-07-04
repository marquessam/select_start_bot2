// src/services/gameAwardService.js - UPDATED WITH IMPROVED AWARD DETECTION
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
// UPDATED: Import new AlertService with correct routing
import alertService, { ALERT_TYPES } from '../utils/AlertService.js';

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
        // UPDATED: Set client for new AlertService
        alertService.setClient(client);
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
     * IMPROVED: Check if a user has mastered a game - announces ALL recent awards
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
            
            // IMPROVED: Instead of finding just the highest award, 
            // find ALL recent awards and announce each one separately
            const recentAwards = [];
            const now = new Date();
            
            for (const award of gameAwards) {
                const awardType = award.awardType || award.AwardType || '';
                const awardExtra = award.awardDataExtra || award.AwardDataExtra || 0;
                const awardDate = new Date(award.awardedAt || award.AwardedAt);
                const ageInMs = now - awardDate;
                
                // Skip old awards
                if (ageInMs > this.maxAwardAge) {
                    continue;
                }
                
                const normalizedType = this.normalizeAwardKind(awardType);
                
                // Only process hardcore awards
                if (awardExtra === 1) {
                    if (normalizedType === 'mastery') {
                        recentAwards.push({
                            award,
                            type: 'mastery',
                            date: awardDate,
                            age: ageInMs
                        });
                    } else if (normalizedType === 'completion') {
                        recentAwards.push({
                            award,
                            type: 'completion',
                            date: awardDate,
                            age: ageInMs
                        });
                    }
                }
            }
            
            if (recentAwards.length === 0) {
                return false;
            }
            
            // Sort by date (oldest first) to announce in chronological order
            recentAwards.sort((a, b) => a.date - b.date);
            
            // Get game info once for all announcements
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            
            let announcedCount = 0;
            
            // IMPROVED: Announce each recent award separately
            for (const recentAward of recentAwards) {
                const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${recentAward.type}:${recentAward.date.getTime()}`;
                
                // Check for duplicates
                if (this.isDuplicateAward(awardIdentifier, user)) {
                    console.log(`Skipping duplicate award: ${awardIdentifier}`);
                    continue;
                }
                
                // Add award to history
                await this.addAwardToHistory(awardIdentifier, user);
                
                // Announce the award
                const isMastery = recentAward.type === 'mastery';
                const isBeaten = recentAward.type === 'completion';
                
                await this.announceRegularAward(user, gameInfo, gameId, isMastery, isBeaten);
                
                console.log(`✅ Successfully announced ${recentAward.type} award for ${user.raUsername} on regular game ${gameInfo.title} (awarded ${recentAward.date.toISOString()})`);
                announcedCount++;
            }
            
            return announcedCount > 0;
            
        } catch (error) {
            console.error(`Error checking for game mastery for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    }

    /**
     * IMPROVED: Check for monthly/shadow game awards - announces ALL recent awards
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
            
            // IMPROVED: Find ALL recent awards and announce each one separately
            const recentAwards = [];
            const now = new Date();
            
            for (const award of gameAwards) {
                const type = award.awardType || award.AwardType || '';
                const extra = award.awardDataExtra || award.AwardDataExtra || 0;
                const awardDate = new Date(award.awardedAt || award.AwardedAt);
                const ageInMs = now - awardDate;
                
                // Skip old awards
                if (ageInMs > this.maxAwardAge) {
                    continue;
                }
                
                const normalizedType = this.normalizeAwardKind(type);
                
                // Process different award types
                if (normalizedType === 'mastery' && extra === 1) {
                    recentAwards.push({
                        award,
                        type: 'mastery',
                        date: awardDate,
                        age: ageInMs
                    });
                } else if (normalizedType === 'completion' && extra === 1) {
                    recentAwards.push({
                        award,
                        type: 'beaten',
                        date: awardDate,
                        age: ageInMs
                    });
                } else if (normalizedType === 'participation') {
                    recentAwards.push({
                        award,
                        type: 'participation',
                        date: awardDate,
                        age: ageInMs
                    });
                }
            }
            
            if (recentAwards.length === 0) {
                return false;
            }
            
            // Sort by date (oldest first) to announce in chronological order
            recentAwards.sort((a, b) => a.date - b.date);
            
            // Get game info once for all announcements
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            
            let announcedCount = 0;
            
            // IMPROVED: Announce each recent award separately
            for (const recentAward of recentAwards) {
                const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${recentAward.type}:${recentAward.date.getTime()}`;
                
                // Check for duplicates
                if (this.isDuplicateAward(awardIdentifier, user)) {
                    console.log(`Skipping duplicate ${systemType} award: ${awardIdentifier}`);
                    continue;
                }
                
                // Add to history and announce
                await this.addAwardToHistory(awardIdentifier, user);
                await this.announceMonthlyAward(user, gameInfo, gameId, recentAward.type, systemType);
                
                console.log(`✅ Successfully announced ${recentAward.type} award for ${user.raUsername} on ${systemType} game ${gameInfo.title} (awarded ${recentAward.date.toISOString()})`);
                announcedCount++;
            }
            
            return announcedCount > 0;
            
        } catch (error) {
            console.error(`Error checking for ${isShadow ? 'shadow' : 'monthly'} game awards for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    }

    /**
     * ENHANCED: More robust duplicate detection with better logging
     */
    isDuplicateAward(awardIdentifier, user) {
        // Check session history first
        if (this.sessionAwardHistory.has(awardIdentifier)) {
            console.log(`Duplicate found in session history: ${awardIdentifier}`);
            return true;
        }
        
        // Extract components for flexible matching
        const parts = awardIdentifier.split(':');
        if (parts.length < 4) {
            return false;
        }
        
        const [username, systemType, gameId, awardType] = parts;
        const newTimestamp = parts.length >= 5 ? parseInt(parts[4]) : null;
        
        // Check user's announced awards with more precise matching
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
                            console.log(`Exact duplicate found: ${awardIdentifier}`);
                            return true;
                        }
                        
                        // Check timestamp difference - be more lenient for different award types
                        if (existingTimestamp && newTimestamp) {
                            const timeDiff = Math.abs(newTimestamp - existingTimestamp);
                            // Reduce time window for same award type to 24 hours instead of 7 days
                            const maxTimeDiff = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
                            
                            if (timeDiff < maxTimeDiff) {
                                console.log(`Time-based duplicate found (${timeDiff}ms apart): ${awardIdentifier}`);
                                return true;
                            }
                        } else {
                            // If no timestamps, be more conservative and treat as duplicate
                            console.log(`Timestamp-less duplicate found: ${awardIdentifier}`);
                            return true;
                        }
                    }
                }
            }
        }
        
        // Check for similar awards in session history with more precise matching
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
                        const maxTimeDiff = 12 * 60 * 60 * 1000; // 12 hours for session history
                        
                        if (timeDiff < maxTimeDiff) {
                            console.log(`Session duplicate found (${timeDiff}ms apart): ${awardIdentifier}`);
                            return true;
                        }
                    } else {
                        console.log(`Session duplicate found (no timestamps): ${awardIdentifier}`);
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
     * HELPER: Manual check for potentially missed awards for a specific user/game
     * Useful for debugging or fixing missed announcements
     */
    async checkMissedAwards(username, gameId, maxDaysBack = 30) {
        try {
            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp('^' + username + '$', 'i') }
            });
            
            if (!user) {
                throw new Error(`User ${username} not found`);
            }
            
            const userAwards = await this.getUserAwards(username);
            if (!userAwards || !userAwards.visibleUserAwards) {
                return { found: false, message: 'No awards found' };
            }
            
            const gameAwards = userAwards.visibleUserAwards.filter(award => {
                return String(award.awardData || award.AwardData) === String(gameId);
            });
            
            if (gameAwards.length === 0) {
                return { found: false, message: 'No awards for this game' };
            }
            
            const now = new Date();
            const maxAge = maxDaysBack * 24 * 60 * 60 * 1000;
            const results = [];
            
            for (const award of gameAwards) {
                const awardType = award.awardType || award.AwardType || '';
                const awardExtra = award.awardDataExtra || award.AwardDataExtra || 0;
                const awardDate = new Date(award.awardedAt || award.AwardedAt);
                const ageInMs = now - awardDate;
                
                if (ageInMs > maxAge || awardExtra !== 1) continue;
                
                const normalizedType = this.normalizeAwardKind(awardType);
                if (!['mastery', 'completion', 'participation'].includes(normalizedType)) continue;
                
                const systemType = this.getGameSystemType(gameId);
                const awardTypeForId = normalizedType === 'completion' ? 'completion' : normalizedType;
                const awardIdentifier = `${username}:${systemType}:${gameId}:${awardTypeForId}:${awardDate.getTime()}`;
                
                const isDuplicate = this.isDuplicateAward(awardIdentifier, user);
                
                results.push({
                    awardType: normalizedType,
                    awardDate: awardDate,
                    awardIdentifier,
                    isDuplicate,
                    ageInDays: Math.floor(ageInMs / (24 * 60 * 60 * 1000)),
                    wouldAnnounce: !isDuplicate && ageInMs <= this.maxAwardAge
                });
            }
            
            return {
                found: true,
                gameId,
                username,
                awards: results,
                summary: {
                    total: results.length,
                    duplicates: results.filter(r => r.isDuplicate).length,
                    wouldAnnounce: results.filter(r => r.wouldAnnounce).length,
                    tooOld: results.filter(r => !r.wouldAnnounce && !r.isDuplicate).length
                }
            };
            
        } catch (error) {
            console.error(`Error checking missed awards for ${username} on game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * CLEANED UP: Just pass raw data to AlertService - no embed building here
     */
    async announceRegularAward(user, gameInfo, gameId, isMastery, isBeaten) {
        // Ensure GP service is loaded
        await loadGPService();
        
        // Award GP for regular game completion
        if (gpRewardService && GP_REWARDS) {
            try {
                await gpRewardService.awardRegularGameGP(user, gameInfo.title, isMastery);
            } catch (gpError) {
                console.error(`Error awarding regular game GP to ${user.raUsername}:`, gpError);
            }
        }

        // Get profile image and game thumbnail
        const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
        const thumbnailUrl = gameInfo?.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null;
        
        // Determine system type for any special styling
        const systemType = this.getGameSystemType(gameId);
        
        // Calculate GP earned (hardcoded values matching UI)
        const gpEarned = isMastery ? 50 : 25;
        
        // CLEANED UP: Just pass data to AlertService - let it handle ALL embed logic
        await alertService.sendAchievementAlert({
            alertType: isMastery ? ALERT_TYPES.MASTERY : ALERT_TYPES.BEATEN,
            username: user.raUsername,
            gameTitle: gameInfo.title,
            gameId: gameId,
            thumbnail: thumbnailUrl,
            userProfileImageUrl: profileImageUrl,
            gpEarned: gpEarned,
            systemType: systemType // Pass system type for special styling if needed
        });
    }

    /**
     * CLEANED UP: Just pass raw data to AlertService - no embed building here
     */
    async announceMonthlyAward(user, gameInfo, gameId, awardType, systemType) {
        // Ensure GP service is loaded
        await loadGPService();
        
        // Award GP for challenge completion
        if (gpRewardService) {
            try {
                await gpRewardService.awardChallengeGP(user, gameInfo.title, awardType, systemType);
            } catch (gpError) {
                console.error(`Error awarding challenge GP to ${user.raUsername}:`, gpError);
            }
        }

        // Get profile image and game thumbnail
        const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
        const thumbnailUrl = gameInfo?.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null;
        
        // Calculate GP earned (hardcoded values matching UI)
        let gpEarned = 0;
        if (awardType === 'mastery') {
            gpEarned = 100; // Both shadow and monthly mastery = 100
        } else if (awardType === 'beaten') {
            gpEarned = 50; // Both shadow and monthly beaten = 50
        } else if (awardType === 'participation') {
            gpEarned = 25; // Both shadow and monthly participation = 25
        }
        
        // CLEANED UP: Just pass data to AlertService - let it handle ALL embed logic
        const alertType = systemType === 'shadow' ? ALERT_TYPES.SHADOW_AWARD : ALERT_TYPES.MONTHLY_AWARD;
        
        await alertService.sendAchievementAlert({
            alertType: alertType,
            username: user.raUsername,
            gameTitle: gameInfo.title,
            gameId: gameId,
            thumbnail: thumbnailUrl,
            userProfileImageUrl: profileImageUrl,
            gpEarned: gpEarned,
            awardType: awardType, // mastery, beaten, participation
            systemType: systemType // monthly, shadow
        });
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
