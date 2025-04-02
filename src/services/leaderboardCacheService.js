// src/services/leaderboardCacheService.js
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';

// Award points constants - needed for points calculation in leaderboards
const POINTS = {
    MASTERY: 7,         // Mastery: 7 points (1 + 3 + 3)
    BEATEN: 4,          // Beaten: 4 points (1 + 3)
    PARTICIPATION: 1    // Participation: 1 point
};

// Shadow games are limited to beaten status maximum
const SHADOW_MAX_POINTS = POINTS.BEATEN;

class LeaderboardCacheService {
    constructor() {
        this.client = null;
        
        // Concurrency control flags
        this.isInitializing = false;
        this._initPromise = null;
        this._updating = false;
        this._updatePromise = null;
        
        // Status tracking
        this.initializationComplete = false;
        this.lastError = null;
        
        // Cache structure
        this.cache = {
            validUsers: new Set(),
            yearlyLeaderboard: new Map(), // year -> leaderboard
            monthlyLeaderboard: null,
            lastUpdated: null,
            updateInterval: 10 * 60 * 1000 // 10 minutes
        };
    }

    setClient(client) {
        this.client = client;
    }

    async initialize(skipInitialFetch = false) {
        // If already initializing, return existing promise
        if (this.isInitializing) {
            console.log('[LEADERBOARD CACHE] Already initializing, returning existing promise...');
            return this._initPromise;
        }

        this.isInitializing = true;
        
        // Create a shared promise for initialization
        this._initPromise = (async () => {
            try {
                console.log('[LEADERBOARD CACHE] Initializing...');
                
                // Get all valid users
                await this.updateValidUsers();
                
                // Skip initial fetch if requested
                if (!skipInitialFetch) {
                    await this.updateLeaderboards(true);
                }

                this.initializationComplete = true;
                console.log('[LEADERBOARD CACHE] Initialization complete');
                return true;
            } catch (error) {
                console.error('[LEADERBOARD CACHE] Initialization error:', error);
                this.lastError = error;
                return false;
            } finally {
                this.isInitializing = false;
            }
        })();

        return this._initPromise;
    }

    async updateValidUsers() {
        try {
            // Get all users from database
            const users = await User.find({});
            
            // Store usernames (lowercase for case-insensitive lookups)
            this.cache.validUsers = new Set(
                users.map(user => user.raUsername.toLowerCase())
            );
            
            console.log(`[LEADERBOARD CACHE] Updated valid users: ${this.cache.validUsers.size} users`);
            return true;
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating valid users:', error);
            throw error;
        }
    }

    /**
     * Check if user is in the valid users set
     * @param {string} username 
     * @returns {boolean}
     */
    isValidUser(username) {
        return username && this.cache.validUsers.has(username.toLowerCase());
    }

    /**
     * Determine if the cache needs updating
     * @returns {boolean}
     */
    _shouldUpdate() {
        return !this.cache.lastUpdated ||
               (Date.now() - this.cache.lastUpdated) > this.cache.updateInterval;
    }

    /**
     * Update leaderboards - handles concurrency to prevent multiple simultaneous updates
     * @param {boolean} force Force update even if cache is fresh
     * @returns {Promise<Object>} Leaderboard data
     */
    async updateLeaderboards(force = false) {
        // If update already in progress, return existing promise
        if (this._updating) {
            console.log('[LEADERBOARD CACHE] Update already in progress, returning existing promise...');
            return this._updatePromise;
        }

        // If not forcing and cache is fresh, return cached data
        if (!force && !this._shouldUpdate()) {
            return this._getLatestData();
        }

        this._updating = true;
        
        // Create shared promise for the update operation
        this._updatePromise = (async () => {
            try {
                console.log('[LEADERBOARD CACHE] Updating leaderboards...');
                
                // Ensure valid users are loaded
                if (this.cache.validUsers.size === 0) {
                    await this.updateValidUsers();
                }
                
                // Update both yearly and monthly leaderboards
                await Promise.all([
                    this.updateYearlyLeaderboard(),
                    this.updateMonthlyLeaderboard()
                ]);
                
                // Update timestamp
                this.cache.lastUpdated = Date.now();
                
                console.log('[LEADERBOARD CACHE] Leaderboards updated successfully');
                return this._getLatestData();
            } catch (error) {
                console.error('[LEADERBOARD CACHE] Error updating leaderboards:', error);
                // Return existing data if available
                return this._getLatestData();
            } finally {
                this._updating = false;
            }
        })();
        
        return this._updatePromise;
    }

    /**
     * Get the current cached data
     * @returns {Object} Leaderboard data
     */
    _getLatestData() {
        const lastUpdatedStr = this.cache.lastUpdated
            ? new Date(this.cache.lastUpdated).toISOString()
            : 'never';
        
        console.log(`[LEADERBOARD CACHE] Returning cached data from: ${lastUpdatedStr}`);
        
        return {
            monthly: this.cache.monthlyLeaderboard || [],
            yearly: this.getCurrentYearLeaderboard() || [],
            lastUpdated: this.cache.lastUpdated
        };
    }

    /**
     * Update the yearly leaderboard for all users
     * @returns {Promise<void>}
     */
    async updateYearlyLeaderboard() {
        try {
            const currentYear = new Date().getFullYear();
            
            // Get all challenges from the current year for proper points calculation
            const yearStart = new Date(currentYear, 0, 1);
            const yearEnd = new Date(currentYear + 1, 0, 1);
            
            const challenges = await Challenge.find({
                date: {
                    $gte: yearStart,
                    $lt: yearEnd
                }
            });
            
            // Convert to a map for easy lookup by month key
            const challengeMap = new Map();
            for (const challenge of challenges) {
                const monthKey = User.formatDateKey(challenge.date);
                challengeMap.set(monthKey, challenge);
            }
            
            // Get all users
            const users = await User.find({});
            
            // Calculate points for each user
            const userPoints = [];
            
            for (const user of users) {
                // Calculate total challenge points
                let totalPoints = 0;
                let monthlyMasteryCount = 0;
                let monthlyBeatenCount = 0;
                let monthlyParticipationCount = 0;
                let shadowBeatenCount = 0;
                let shadowParticipationCount = 0;
                
                // Check each monthly challenge the user has participated in
                for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                    // Only count challenges from current year
                    const challengeDate = new Date(monthKey);
                    if (challengeDate.getFullYear() !== currentYear) continue;
                    
                    // Get progress value
                    const progress = data.progress || 0;
                    
                    // Award points based on progress level
                    if (progress === 3) {
                        // Mastery - 7 points
                        monthlyMasteryCount++;
                        totalPoints += POINTS.MASTERY;
                    } else if (progress === 2) {
                        // Beaten - 4 points
                        monthlyBeatenCount++;
                        totalPoints += POINTS.BEATEN;
                    } else if (progress === 1) {
                        // Participation - 1 point
                        monthlyParticipationCount++;
                        totalPoints += POINTS.PARTICIPATION;
                    }
                }
                
                // Also check shadow challenges
                for (const [monthKey, data] of user.shadowChallenges.entries()) {
                    // Only count challenges from current year
                    const challengeDate = new Date(monthKey);
                    if (challengeDate.getFullYear() !== currentYear) continue;
                    
                    // Get progress value
                    const progress = data.progress || 0;
                    
                    // Award points based on progress level (shadow max is beaten)
                    if (progress === 2) {
                        // Beaten - 4 points
                        shadowBeatenCount++;
                        totalPoints += SHADOW_MAX_POINTS;
                    } else if (progress === 1) {
                        // Participation - 1 point
                        shadowParticipationCount++;
                        totalPoints += POINTS.PARTICIPATION;
                    }
                }
                
                // Add community awards points
                const communityPoints = user.getCommunityPointsForYear(currentYear);
                totalPoints += communityPoints;
                
                // If user has any points, add to leaderboard
                if (totalPoints > 0) {
                    userPoints.push({
                        username: user.raUsername,
                        totalPoints,
                        challengePoints: totalPoints - communityPoints,
                        communityPoints,
                        stats: {
                            mastery: monthlyMasteryCount,
                            beaten: monthlyBeatenCount,
                            participation: monthlyParticipationCount,
                            shadowBeaten: shadowBeatenCount,
                            shadowParticipation: shadowParticipationCount
                        }
                    });
                }
            }
            
            // Sort by total points descending
            userPoints.sort((a, b) => b.totalPoints - a.totalPoints);
            
            // Assign ranks with proper handling of ties
            let currentRank = 1;
            let currentPoints = userPoints.length > 0 ? userPoints[0].totalPoints : 0;
            let usersProcessed = 0;
            
            for (let i = 0; i < userPoints.length; i++) {
                if (userPoints[i].totalPoints < currentPoints) {
                    currentRank = usersProcessed + 1;
                    currentPoints = userPoints[i].totalPoints;
                }
                userPoints[i].rank = currentRank;
                usersProcessed++;
            }
            
            // Store in cache
            this.cache.yearlyLeaderboard.set(currentYear.toString(), userPoints);
            
            console.log(`[LEADERBOARD CACHE] Updated yearly leaderboard for ${currentYear}: ${userPoints.length} users`);
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating yearly leaderboard:', error);
            throw error;
        }
    }
    
    /**
     * Update the monthly leaderboard for the current challenge
     * @returns {Promise<void>}
     */
    async updateMonthlyLeaderboard() {
        try {
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
            
            if (!currentChallenge) {
                console.log('[LEADERBOARD CACHE] No active challenge found for monthly leaderboard');
                return;
            }
            
            // Get all users
            const users = await User.find({});
            
            // Batch progress data for all users for both monthly and shadow games
            const gameIds = [currentChallenge.monthly_challange_gameid];
            
            // Add shadow game if it exists and is revealed
            if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                gameIds.push(currentChallenge.shadow_challange_gameid);
            }
            
            // Get monthly and shadow game info
            const monthlyGameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);
            let shadowGameInfo = null;
            
            if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                shadowGameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
            }
            
            // Process batch of users to avoid rate limiting
            const BATCH_SIZE = 5;
            const usersProgress = [];
            
            for (let i = 0; i < users.length; i += BATCH_SIZE) {
                const batch = users.slice(i, i + BATCH_SIZE);
                
                // Process users in parallel
                const batchPromises = batch.map(async (user) => {
                    try {
                        // Get monthly and shadow game progress for this user
                        const monthlyProgress = await retroAPI.getUserGameProgress(
                            user.raUsername,
                            currentChallenge.monthly_challange_gameid
                        );
                        
                        // Initialize with monthly game data
                        const userProgress = {
                            username: user.raUsername,
                            monthlyGame: {
                                title: monthlyGameInfo.title,
                                achievementsEarned: monthlyProgress.numAwardedToUser || 0,
                                totalAchievements: currentChallenge.monthly_challange_game_total || 0,
                                percentage: monthlyProgress.numAwardedToUser > 0 && currentChallenge.monthly_challange_game_total > 0
                                    ? ((monthlyProgress.numAwardedToUser / currentChallenge.monthly_challange_game_total) * 100).toFixed(1)
                                    : '0.0'
                            },
                            shadowGame: null,
                            totalPoints: 0
                        };
                        
                        // Calculate monthly points based on progress
                        let monthlyPoints = 0;
                        
                        // Get month key for database lookup
                        const monthKey = User.formatDateKey(currentChallenge.date);
                        const userMonthlyRecord = user.monthlyChallenges.get(monthKey);
                        
                        if (userMonthlyRecord) {
                            const progressLevel = userMonthlyRecord.progress || 0;
                            
                            // Map progress level to points
                            if (progressLevel === 3) {
                                monthlyPoints = POINTS.MASTERY;
                                userProgress.monthlyGame.award = 'Mastery';
                            } else if (progressLevel === 2) {
                                monthlyPoints = POINTS.BEATEN;
                                userProgress.monthlyGame.award = 'Beaten';
                            } else if (progressLevel === 1) {
                                monthlyPoints = POINTS.PARTICIPATION;
                                userProgress.monthlyGame.award = 'Participation';
                            }
                        }
                        
                        userProgress.totalPoints += monthlyPoints;
                        
                        // Add shadow game if available
                        if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                            const shadowProgress = await retroAPI.getUserGameProgress(
                                user.raUsername,
                                currentChallenge.shadow_challange_gameid
                            );
                            
                            userProgress.shadowGame = {
                                title: shadowGameInfo.title,
                                achievementsEarned: shadowProgress.numAwardedToUser || 0,
                                totalAchievements: currentChallenge.shadow_challange_game_total || 0,
                                percentage: shadowProgress.numAwardedToUser > 0 && currentChallenge.shadow_challange_game_total > 0
                                    ? ((shadowProgress.numAwardedToUser / currentChallenge.shadow_challange_game_total) * 100).toFixed(1)
                                    : '0.0'
                            };
                            
                            // Calculate shadow points based on progress
                            let shadowPoints = 0;
                            
                            const userShadowRecord = user.shadowChallenges.get(monthKey);
                            
                            if (userShadowRecord) {
                                const progressLevel = userShadowRecord.progress || 0;
                                
                                // Map progress level to points (shadow max is beaten)
                                if (progressLevel === 2) {
                                    shadowPoints = SHADOW_MAX_POINTS;
                                    userProgress.shadowGame.award = 'Beaten';
                                } else if (progressLevel === 1) {
                                    shadowPoints = POINTS.PARTICIPATION;
                                    userProgress.shadowGame.award = 'Participation';
                                }
                            }
                            
                            userProgress.totalPoints += shadowPoints;
                        }
                        
                        return userProgress;
                    } catch (error) {
                        console.error(`[LEADERBOARD CACHE] Error getting progress for ${user.raUsername}:`, error);
                        return null;
                    }
                });
                
                // Wait for all users in batch to complete
                const batchResults = await Promise.all(batchPromises);
                
                // Filter out null results and add to overall progress
                usersProgress.push(...batchResults.filter(result => result !== null));
                
                // Add a delay between batches to respect rate limits
                if (i + BATCH_SIZE < users.length) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            // Sort by total points descending
            usersProgress.sort((a, b) => b.totalPoints - a.totalPoints);
            
            // Assign ranks with proper handling of ties
            let currentRank = 1;
            let currentPoints = usersProgress.length > 0 ? usersProgress[0].totalPoints : 0;
            let usersProcessed = 0;
            
            for (let i = 0; i < usersProgress.length; i++) {
                if (usersProgress[i].totalPoints < currentPoints) {
                    currentRank = usersProcessed + 1;
                    currentPoints = usersProgress[i].totalPoints;
                }
                usersProgress[i].rank = currentRank;
                usersProcessed++;
            }
            
            // Store in cache
            this.cache.monthlyLeaderboard = {
                challenge: {
                    monthName: new Date(currentChallenge.date).toLocaleString('default', { month: 'long' }),
                    year: new Date(currentChallenge.date).getFullYear(),
                    monthlyGame: monthlyGameInfo.title,
                    shadowGame: shadowGameInfo?.title
                },
                users: usersProgress
            };
            
            console.log(`[LEADERBOARD CACHE] Updated monthly leaderboard: ${usersProgress.length} users`);
        } catch (error) {
            console.error('[LEADERBOARD CACHE] Error updating monthly leaderboard:', error);
            throw error;
        }
    }
    
    /**
     * Get the yearly leaderboard for the current year
     * @returns {Array} Yearly leaderboard
     */
    getCurrentYearLeaderboard() {
        const currentYear = new Date().getFullYear().toString();
        return this.cache.yearlyLeaderboard.get(currentYear) || [];
    }
    
    /**
     * Get the yearly leaderboard for a specific year
     * @param {string|number} year 
     * @returns {Array} Yearly leaderboard
     */
    getYearlyLeaderboard(year) {
        const yearKey = year.toString();
        return this.cache.yearlyLeaderboard.get(yearKey) || [];
    }
    
    /**
     * Get the monthly leaderboard
     * @returns {Object} Monthly leaderboard
     */
    getMonthlyLeaderboard() {
        return this.cache.monthlyLeaderboard;
    }
    
    /**
     * Force an immediate refresh of all leaderboards
     * @returns {Promise<Object>} Updated leaderboard data
     */
    async refreshLeaderboards() {
        console.log('[LEADERBOARD CACHE] Forcing full leaderboard refresh...');
        return await this.updateLeaderboards(true);
    }
}

// Create singleton instance
const leaderboardCacheService = new LeaderboardCacheService();
export default leaderboardCacheService;
