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
     * ENHANCED: Refresh the mapping of game IDs to their system types with better logging
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
            
            if (!currentChallenge) {
                console.log('No current challenge found for this month');
                return;
            }
            
            console.log('Current challenge found:', {
                monthly_gameid: currentChallenge.monthly_challange_gameid,
                shadow_gameid: currentChallenge.shadow_challange_gameid,
                shadow_revealed: currentChallenge.shadow_challange_revealed
            });
            
            // Add monthly and shadow game IDs to the map
            if (currentChallenge.monthly_challange_gameid) {
                const monthlyGameId = String(currentChallenge.monthly_challange_gameid);
                this.gameSystemMap.set(monthlyGameId, 'monthly');
                console.log(`✅ Mapped game ID ${monthlyGameId} to monthly challenge`);
            }
            
            if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                const shadowGameId = String(currentChallenge.shadow_challange_gameid);
                this.gameSystemMap.set(shadowGameId, 'shadow');
                console.log(`✅ Mapped game ID ${shadowGameId} to shadow challenge`);
            }
            
            // ENHANCED: Also check for unrevealed shadow games if we have the ID
            if (!currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                const shadowGameId = String(currentChallenge.shadow_challange_gameid);
                this.gameSystemMap.set(shadowGameId, 'shadow');
                console.log(`✅ Mapped unrevealed shadow game ID ${shadowGameId} to shadow challenge`);
            }
            
            console.log(`Game system map refreshed with ${this.gameSystemMap.size} entries:`, 
                       Array.from(this.gameSystemMap.entries()));
            
        } catch (error) {
            console.error('Error refreshing game system map:', error);
        }
    }
    
    /**
     * ENHANCED: Get the system type for a game ID with better detection
     */
    getGameSystemType(gameId) {
        if (!gameId) return 'regular';
        
        const gameIdStr = String(gameId);
        
        // Check if in system map
        if (this.gameSystemMap.has(gameIdStr)) {
            const systemType = this.gameSystemMap.get(gameIdStr);
            console.log(`Game ${gameId} identified as ${systemType} from system map`);
            return systemType;
        }
        
        // If not found, it's a regular game
        console.log(`Game ${gameId} not found in system map, treating as regular game`);
        return 'regular';
    }
    
    /**
     * ENHANCED: Initialize session history with better cleanup
     */
    async initializeSessionHistory() {
        console.log('Initializing session award history...');
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
            
            console.log(`Initialized session award history with ${totalEntries} entries from ${users.length} users`);
            
            // ENHANCED: Clean up very old entries from session history
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
            
            if (removedOldEntries > 0) {
                console.log(`Cleaned up ${removedOldEntries} old entries from session history`);
            }
            
            console.log(`Final session history size: ${this.sessionAwardHistory.size} entries`);
            
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
     * FIXED: Check if a user has mastered a game with improved system detection and routing
     */
    async checkForGameMastery(user, gameId, achievement) {
        try {
            if (!user || !gameId) return false;
            
            console.log(`=== Checking game mastery for ${user.raUsername} on game ${gameId} ===`);
            
            // ENHANCED: Force refresh of game system map to ensure we have latest data
            await this.refreshGameSystemMap();
            
            // Determine which system this game belongs to
            const systemType = this.getGameSystemType(gameId);
            console.log(`Game ${gameId} system type determined as: ${systemType}`);
            
            // For monthly/shadow games, we handle these separately
            if (systemType !== 'regular') {
                console.log(`Routing to checkForGameAwards for ${systemType} game`);
                return await this.checkForGameAwards(user, gameId, systemType === 'shadow');
            }
            
            // Continue with regular game logic...
            const userAwards = await this.getUserAwards(user.raUsername);
            
            if (!userAwards || !userAwards.visibleUserAwards) {
                console.log(`No user awards found for ${user.raUsername}`);
                return false;
            }
            
            // Find awards for this specific game
            const gameAwards = userAwards.visibleUserAwards.filter(award => {
                return String(award.awardData || award.AwardData) === String(gameId);
            });
            
            if (gameAwards.length === 0) {
                console.log(`No awards found for regular game ${gameId}`);
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
                console.log(`No mastery or beaten award found for regular game ${gameId}`);
                return false;
            }
            
            // Check award age to prevent announcing old awards
            const awardDate = new Date(highestAward.awardedAt || highestAward.AwardedAt);
            const now = new Date();
            const ageInMs = now - awardDate;
            
            if (ageInMs > this.maxAwardAge) {
                console.log(`Award for regular game ${gameId} is too old, skipping`);
                return false;
            }
            
            // Create a unique identifier for this award with timestamp
            const awardType = isMastery ? 'mastery' : 'completion';
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${awardType}:${awardDate.getTime()}`;
            
            // Check for duplicates
            if (this.isDuplicateAward(awardIdentifier, user)) {
                console.log(`Duplicate award detected for regular game ${gameId}, skipping`);
                return false;
            }
            
            // Get game info
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            
            // Add award to history
            await this.addAwardToHistory(awardIdentifier, user);
            
            // FIXED: Always use MASTERY alert type for regular games (mastery and beaten)
            console.log(`Announcing ${awardType} for regular game ${gameId} to MASTERY channel`);
            await this.announceRegularAward(user, gameInfo, gameId, isMastery, isBeaten);
            
            console.log(`✅ Successfully announced ${awardType} award for ${user.raUsername} on regular game ${gameInfo.title}`);
            return true;
            
        } catch (error) {
            console.error(`Error checking for game mastery for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    }

    /**
     * FIXED: Check for monthly/shadow game awards with proper alert routing
     */
    async checkForGameAwards(user, gameId, isShadow) {
        try {
            if (!user || !gameId) return false;
            
            const systemType = isShadow ? 'shadow' : 'monthly';
            console.log(`=== Checking ${systemType} game awards for ${user.raUsername} on game ${gameId} ===`);
            
            // Get user's awards using the proper API endpoint
            const userAwards = await this.getUserAwards(user.raUsername);
            
            if (!userAwards || !userAwards.visibleUserAwards) {
                console.log(`No user awards found for ${user.raUsername}`);
                return false;
            }
            
            // Find awards for this specific game
            const gameAwards = userAwards.visibleUserAwards.filter(award => {
                return String(award.awardData || award.AwardData) === String(gameId);
            });
            
            if (gameAwards.length === 0) {
                console.log(`No awards found for ${systemType} game ${gameId}`);
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
                console.log(`No qualifying award found for ${systemType} game ${gameId}`);
                return false;
            }
            
            // Check award age
            const awardDate = new Date(highestAward.awardedAt || highestAward.AwardedAt);
            const now = new Date();
            const ageInMs = now - awardDate;
            
            if (ageInMs > this.maxAwardAge) {
                console.log(`Award for ${systemType} game ${gameId} is too old, skipping`);
                return false;
            }
            
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${awardType}:${awardDate.getTime()}`;
            
            if (this.isDuplicateAward(awardIdentifier, user)) {
                console.log(`Duplicate award detected for ${systemType} game ${gameId}, skipping`);
                return false;
            }
            
            // Get game info and announce
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            await this.addAwardToHistory(awardIdentifier, user);
            
            // FIXED: Use correct alert type based on system type
            console.log(`Announcing ${awardType} for ${systemType} game ${gameId} to ${systemType.toUpperCase()} channel`);
            await this.announceMonthlyAward(user, gameInfo, gameId, awardType, systemType);
            
            console.log(`✅ Successfully announced ${awardType} award for ${user.raUsername} on ${systemType} game ${gameInfo.title}`);
            return true;
            
        } catch (error) {
            console.error(`Error checking for ${isShadow ? 'shadow' : 'monthly'} game awards for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    }

    /**
     * ENHANCED: Check if an award is a duplicate with improved logic
     */
    isDuplicateAward(awardIdentifier, user) {
        // Check session history first
        if (this.sessionAwardHistory.has(awardIdentifier)) {
            console.log(`Award ${awardIdentifier} found in session history, skipping`);
            return true;
        }
        
        // Extract components for flexible matching
        const parts = awardIdentifier.split(':');
        if (parts.length < 4) {
            console.log(`Invalid award identifier format: ${awardIdentifier}`);
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
                        
                        console.log(`Found matching award in user's history: ${existingAward}`);
                        
                        // For exact duplicates, always skip
                        if (existingAward === awardIdentifier) {
                            console.log(`Exact duplicate found, skipping`);
                            return true;
                        }
                        
                        // ENHANCED: More robust timestamp comparison
                        if (existingTimestamp && newTimestamp) {
                            const timeDiff = Math.abs(newTimestamp - existingTimestamp);
                            const maxTimeDiff = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
                            
                            if (timeDiff < maxTimeDiff) {
                                console.log(`Award within ${Math.floor(timeDiff / (60 * 60 * 1000))} hours of existing award, treating as duplicate`);
                                return true;
                            }
                        } else {
                            // If no timestamps, treat any matching award as duplicate
                            console.log(`No timestamps available, treating matching award as duplicate`);
                            return true;
                        }
                    }
                }
            }
        }
        
        // ENHANCED: Check for similar awards in session history (without exact timestamp match)
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
                            console.log(`Similar award found in session history within 24 hours, treating as duplicate`);
                            return true;
                        }
                    } else {
                        // If no timestamps, be more conservative
                        console.log(`Similar award found in session history without timestamps, treating as duplicate`);
                        return true;
                    }
                }
            }
        }
        
        console.log(`Award ${awardIdentifier} is not a duplicate, proceeding with announcement`);
        return false;
    }

    /**
     * ENHANCED: Add award to history with better deduplication
     */
    async addAwardToHistory(awardIdentifier, user) {
        console.log(`Adding award to history: ${awardIdentifier}`);
        
        // Add to session history
        this.sessionAwardHistory.add(awardIdentifier);
        
        // Add to user's announced awards
        if (!user.announcedAwards) {
            user.announcedAwards = [];
        }
        
        // ENHANCED: Check if already exists before adding
        if (!user.announcedAwards.includes(awardIdentifier)) {
            user.announcedAwards.push(awardIdentifier);
            console.log(`Added to user's announced awards: ${awardIdentifier}`);
        } else {
            console.log(`Award already exists in user's announced awards: ${awardIdentifier}`);
        }
        
        // Clean up old entries (keep only last 100 per user instead of 50 for better tracking)
        if (user.announcedAwards.length > 100) {
            const removedCount = user.announcedAwards.length - 100;
            user.announcedAwards = user.announcedAwards.slice(-100);
            console.log(`Cleaned up ${removedCount} old award entries for ${user.raUsername}`);
        }
        
        await user.save();
        console.log(`User data saved for ${user.raUsername}`);
    }

    /**
     * FIXED: Announce regular game award (always goes to mastery channel)
     */
    async announceRegularAward(user, gameInfo, gameId, isMastery, isBeaten) {
        const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
        const thumbnailUrl = gameInfo?.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null;
        
        // FIXED: Always use MASTERY alert type for regular games
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
        }, ALERT_TYPES.MASTERY); // Always use MASTERY channel for regular games
    }

    /**
     * FIXED: Announce monthly/shadow award (goes to appropriate channel)
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
            console.error(`Unknown award type: ${awardType} for ${systemType} game`);
            return;
        }
        
        const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);
        const thumbnailUrl = gameInfo?.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null;
        
        // FIXED: Use correct alert type based on system type
        const alertType = systemType === 'shadow' ? ALERT_TYPES.SHADOW : ALERT_TYPES.MONTHLY;
        
        console.log(`Sending ${systemType} award alert with type: ${alertType}`);
        
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
        }, alertType); // Use the correct alert type for proper channel routing
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
            
            // Force refresh game system map first
            await this.refreshGameSystemMap();
            
            // Check game system type
            const systemType = this.getGameSystemType(gameId);
            console.log(`Game system type: ${systemType}`);
            
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
