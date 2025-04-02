import { buildAuthorization, getGame, getGameExtended, getUserProfile, getUserRecentAchievements, 
    getUserSummary, getGameInfoAndUserProgress, getGameRankAndScore, getUserCompletedGames,
    getUserAwards, getGameList, getConsoleIds, getAchievementCount } from '@retroachievements/api';
import { config } from '../config/config.js';
import EnhancedRateLimiter from './EnhancedRateLimiter.js';

class RetroAchievementsService {
    constructor() {
        this.authorization = buildAuthorization({
            userName: process.env.RA_USERNAME,
            webApiKey: config.retroAchievements.apiKey
        });
        
        // Create an enhanced rate limiter with conservative settings
        this.rateLimiter = new EnhancedRateLimiter({
            requestsPerMinute: 30,     // Lower than the recommended 40/min
            baseDelayMs: 2000,         // 2 seconds between requests
            maxRetries: 3,             // Retry up to 3 times
            retryBackoffMultiplier: 2  // Double wait time after each failure
        });
        
        // Cache for API responses
        this.cache = new Map();
        this.cacheLifetime = 15 * 60 * 1000; // 15 minutes
    }
    
    /**
     * Try to get response from cache before making an API request
     * @param {string} cacheKey - Unique identifier for the cache entry
     * @param {Function} fetchFn - Function to fetch data if not in cache
     * @param {string} endpointName - Name for tracking purposes
     * @returns {Promise<any>} Response data
     */
    async getWithCache(cacheKey, fetchFn, endpointName) {
        // Check if we have a valid cache entry
        const cachedItem = this.cache.get(cacheKey);
        if (cachedItem && (Date.now() - cachedItem.timestamp) < this.cacheLifetime) {
            console.log(`Cache hit for ${endpointName}: ${cacheKey}`);
            return cachedItem.data;
        }
        
        // Not in cache, use rate limiter to fetch
        console.log(`Cache miss for ${endpointName}: ${cacheKey}`);
        const data = await this.rateLimiter.add(fetchFn, endpointName);
        
        // Store in cache
        this.cache.set(cacheKey, {
            timestamp: Date.now(),
            data
        });
        
        return data;
    }

    /**
     * Get user's progress for a specific game
     * @param {string} username - RetroAchievements username
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} User's progress data
     */
    async getUserGameProgress(username, gameId) {
        try {
            const cacheKey = `progress:${username}:${gameId}`;
            const endpointName = 'getUserGameProgress';
            
            return await this.getWithCache(
                cacheKey,
                () => getGameInfoAndUserProgress(this.authorization, {
                    gameId: gameId,
                    userName: username
                }),
                endpointName
            );
        } catch (error) {
            console.error(`Error fetching game progress for ${username} in game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get a bunch of info about a game
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} Game data including achievements and more
     */
    async getGameInfoExtended(gameId) {
        try {
            const cacheKey = `gameExtended:${gameId}`;
            const endpointName = 'getGameInfoExtended';
            
            return await this.getWithCache(
                cacheKey,
                () => getGameExtended(this.authorization, {
                    gameId: parseInt(gameId)
                }),
                endpointName
            );
        } catch (error) {
            console.error(`Error fetching achievements for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get the number of achievements for a game
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} Game data including achievement count
     */
    async getGameAchievementCount(gameId) {
        try {
            const cacheKey = `achievementCount:${gameId}`;
            const endpointName = 'getGameAchievementCount';
            
            const game = await this.getWithCache(
                cacheKey,
                () => getAchievementCount(this.authorization, {
                    gameId: parseInt(gameId)
                }),
                endpointName
            );

            return game.achievementIds.length;
        } catch (error) {
            console.error(`Error fetching achievements for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get user's recently earned achievements
     * @param {string} username - RetroAchievements username
     * @param {number} count - Number of achievements to fetch (default: 50)
     * @returns {Promise<Array>} Array of recent achievements
     */
    async getUserRecentAchievements(username, count = 50) {
        try {
            const cacheKey = `recentAchievements:${username}:${count}`;
            const endpointName = 'getUserRecentAchievements';
            
            // Use a shorter cache lifetime for recent achievements
            const cachedItem = this.cache.get(cacheKey);
            if (cachedItem && (Date.now() - cachedItem.timestamp) < (5 * 60 * 1000)) { // 5 minutes
                console.log(`Cache hit for ${endpointName}: ${cacheKey}`);
                return cachedItem.data;
            }
            
            const achievements = await this.rateLimiter.add(
                () => getUserRecentAchievements(this.authorization, {
                    username,
                    count
                }),
                endpointName
            );
            
            // Store in cache
            this.cache.set(cacheKey, {
                timestamp: Date.now(),
                data: achievements
            });
            
            return achievements;
        } catch (error) {
            console.error(`Error fetching recent achievements for ${username}:`, error);
            throw error;
        }
    }

    /**
     * Get game information
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} Game information
     */
    async getGameInfo(gameId) {
        try {
            const cacheKey = `game:${gameId}`;
            const endpointName = 'getGameInfo';
            
            return await this.getWithCache(
                cacheKey,
                () => getGame(this.authorization, {
                    gameId: parseInt(gameId)
                }),
                endpointName
            );
        } catch (error) {
            console.error(`Error fetching game info for ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get user information including profile image and stats
     * @param {string} username - RetroAchievements username
     * @returns {Promise<Object>} User information
     */
    async getUserInfo(username) {
        try {
            const cacheKey = `userInfo:${username}`;
            const endpointName = 'getUserInfo';
            
            return await this.getWithCache(
                cacheKey,
                async () => {
                    // Make API calls sequentially with rate limiting between each
                    const summary = await this.rateLimiter.add(
                        () => getUserSummary(this.authorization, { userName: username }),
                        'getUserSummary'
                    );
                    
                    const profile = await this.rateLimiter.add(
                        () => getUserProfile(this.authorization, { userName: username }),
                        'getUserProfile'
                    );
                    
                    const awards = await this.rateLimiter.add(
                        () => getUserAwards(this.authorization, { userName: username }),
                        'getUserAwards'
                    );
        
                    return {
                        ...summary,
                        ...profile,
                        awards,
                        profileImageUrl: `https://retroachievements.org${profile.userPic}`
                    };
                },
                endpointName
            );
        } catch (error) {
            console.error(`Error fetching user info for ${username}:`, error);
            throw error;
        }
    }

    /**
     * Get game leaderboard rankings
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Array>} Leaderboard entries
     */
    async getGameRankAndScore(gameId) {
        try {
            const cacheKey = `rankings:${gameId}`;
            const endpointName = 'getGameRankAndScore';
            
            return await this.getWithCache(
                cacheKey,
                () => getGameRankAndScore(this.authorization, {
                    gameId: parseInt(gameId),
                    type: 'high-scores'
                }),
                endpointName
            );
        } catch (error) {
            console.error(`Error fetching rankings for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get leaderboard entries for a specific leaderboard
     * @param {number} leaderboardId - RetroAchievements leaderboard ID
     * @param {number} offset - Starting position (0-based)
     * @param {number} count - Number of entries to retrieve
     * @returns {Promise<Array>} List of leaderboard entries
     */
    async getLeaderboardEntries(leaderboardId, offset = 0, count = 100) {
        try {
            const cacheKey = `leaderboard:${leaderboardId}:${offset}:${count}`;
            const endpointName = 'getLeaderboardEntries';
            
            const entries = await this.getWithCache(
                cacheKey,
                () => this.apiRequest(`API_GetLeaderboardEntries.php?i=${leaderboardId}&o=${offset}&c=${count}`),
                endpointName
            );

            // Process and standardize the entries
            return this.processLeaderboardEntries(entries);
        } catch (error) {
            console.error(`Error fetching leaderboard entries for leaderboard ${leaderboardId}:`, error);
            throw error;
        }
    }

    /**
     * Validate that a user exists
     * @param {string} username - RetroAchievements username
     * @returns {Promise<boolean>} Whether the user exists
     */
    async validateUser(username) {
        try {
            // Use direct call without caching for validation
            await this.rateLimiter.add(
                () => getUserProfile(this.authorization, { userName: username }),
                'validateUser'
            );
            return true;
        } catch (error) {
            console.log(`User validation failed for ${username}:`, error.message);
            return false;
        }
    }

    /**
     * Clear cache entries
     * @param {string} prefix - Optional prefix to clear only specific entries
     */
    clearCache(prefix = null) {
        if (prefix) {
            // Clear entries that start with the prefix
            const keysToDelete = [];
            for (const key of this.cache.keys()) {
                if (key.startsWith(prefix)) {
                    keysToDelete.push(key);
                }
            }
            
            keysToDelete.forEach(key => this.cache.delete(key));
            console.log(`Cleared ${keysToDelete.length} cache entries with prefix ${prefix}`);
        } else {
            // Clear all cache
            const count = this.cache.size;
            this.cache.clear();
            console.log(`Cleared all ${count} cache entries`);
        }
    }

    /**
     * Make a direct API request to the RetroAchievements API
     * @param {string} endpoint - API endpoint
     * @returns {Promise<Object>} API response
     */
    async apiRequest(endpoint) {
        const baseUrl = 'https://retroachievements.org/API/';
        const url = `${baseUrl}${endpoint}&z=${this.authorization.userName}&y=${this.authorization.webApiKey}`;
        
        return this.rateLimiter.add(async () => {
            const response = await fetch(url);
            
            if (!response.ok) {
                const error = new Error(`API request failed with status ${response.status}`);
                error.status = response.status;
                throw error;
            }
            
            return await response.json();
        }, `apiRequest:${endpoint.split('?')[0]}`);
    }
    
    /**
     * Process leaderboard entries to standardize the format
     * @param {Object|Array} data - Raw API response
     * @returns {Array} Standardized leaderboard entries
     */
    processLeaderboardEntries(data) {
        // Handle different API response formats
        let entries = [];
        
        if (data.Results && Array.isArray(data.Results)) {
            entries = data.Results.map(result => result.UserEntry || result);
        } else if (Array.isArray(data)) {
            entries = data;
        } else if (data.Entries && Array.isArray(data.Entries)) {
            entries = data.Entries;
        } else if (typeof data === 'object') {
            entries = Object.values(data);
        }

        // Convert entries to a standard format
        return entries
            .filter(entry => {
                // Filter out invalid entries
                const hasUser = Boolean(entry && (entry.User || entry.user));
                const hasScore = Boolean(entry && (entry.Score || entry.score || entry.FormattedScore || entry.formattedScore));
                return hasUser && hasScore;
            })
            .map(entry => {
                // Standardize entry format
                const rawUser = entry.User || entry.user || '';
                const apiRank = entry.Rank || entry.rank || '0';
                const formattedScore = entry.FormattedScore || entry.formattedScore;
                const fallbackScore = entry.Score || entry.score || '0';
                const trackTime = formattedScore ? formattedScore.trim() : fallbackScore.toString();
                
                return {
                    ApiRank: parseInt(apiRank, 10),
                    User: rawUser.trim(),
                    TrackTime: trackTime,
                    DateSubmitted: entry.DateSubmitted || entry.dateSubmitted || null,
                };
            })
            .filter(entry => !isNaN(entry.ApiRank) && entry.User.length > 0);
    }
    
    /**
     * Get rate limiter statistics
     */
    getRateLimiterStats() {
        return this.rateLimiter.getStats();
    }
}

// Create and export a singleton instance
const retroAPI = new RetroAchievementsService();
export default retroAPI;
