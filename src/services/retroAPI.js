// services/retroAPI.js
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
        
        // Create an enhanced rate limiter
        this.rateLimiter = new EnhancedRateLimiter({
            requestsPerInterval: 1,     // 1 request per interval
            interval: 1100,             // Slightly more than 1 second (1.1s) for safety margin
            maxRetries: 5,              // Try up to 5 times
            retryDelay: 3000,           // Start with a 3-second delay
            exponentialBackoff: true    // Double the delay for each retry
        });
        
        // Cache for responses to reduce API calls
        this.cache = new Map();
        // TTL for cache in milliseconds (10 minutes)
        this.cacheTTL = 10 * 60 * 1000;
    }

    /**
     * Get item from cache if valid
     * @param {string} key - Cache key
     * @returns {any} Cached item or undefined if not found/expired
     */
    getCachedItem(key) {
        if (!this.cache.has(key)) return undefined;
        
        const { data, timestamp } = this.cache.get(key);
        const now = Date.now();
        
        // Check if cached item is still valid
        if (now - timestamp > this.cacheTTL) {
            this.cache.delete(key);
            return undefined;
        }
        
        return data;
    }

    /**
     * Store item in cache
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     */
    setCachedItem(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Get user's progress for a specific game
     * @param {string} username - RetroAchievements username
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} User's progress data
     */
    async getUserGameProgress(username, gameId) {
        const cacheKey = `progress_${username}_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            console.log(`Fetching game progress for ${username} in game ${gameId}...`);
            
            // Use the rate limiter to make the API call
            const progress = await this.rateLimiter.add(
                () => getGameInfoAndUserProgress(this.authorization, {
                    gameId: gameId,
                    userName: username
                }),
                `Get game progress for ${username} in game ${gameId}`
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, progress);
            
            return progress;
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
        const cacheKey = `game_extended_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            console.log(`Fetching extended info for game ${gameId}...`);
            
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(
                () => getGameExtended(this.authorization, {
                    gameId: parseInt(gameId)
                }),
                `Get extended info for game ${gameId}`
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, game);
            
            return game;
        } catch (error) {
            console.error(`Error fetching extended info for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get the number of achievements for a game
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<number>} Game achievements count
     */
    async getGameAchievementCount(gameId) {
        const cacheKey = `achievement_count_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData !== undefined) {
            return cachedData;
        }
        
        try {
            console.log(`Fetching achievement count for game ${gameId}...`);
            
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(
                () => getAchievementCount(this.authorization, {
                    gameId: parseInt(gameId)
                }),
                `Get achievement count for game ${gameId}`
            );
            
            const count = game.achievementIds.length;
            
            // Cache the result
            this.setCachedItem(cacheKey, count);
            
            return count;
        } catch (error) {
            console.error(`Error fetching achievement count for game ${gameId}:`, error);
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
        // For recent achievements, we use a shorter cache period (2 minutes)
        const cacheKey = `recent_achievements_${username}_${count}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData && Date.now() - this.cache.get(cacheKey).timestamp < 2 * 60 * 1000) {
            return cachedData;
        }
        
        try {
            console.log(`Fetching recent achievements for ${username}...`);
            
            // Use the rate limiter to make the API call
            const achievements = await this.rateLimiter.add(
                () => getUserRecentAchievements(this.authorization, {
                    username,
                    count
                }),
                `Get recent achievements for ${username}`
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, achievements);
            
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
        const cacheKey = `game_info_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            console.log(`Fetching game info for ${gameId}...`);
            
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(
                () => getGame(this.authorization, {
                    gameId: parseInt(gameId)
                }),
                `Get info for game ${gameId}`
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, game);
            
            return game;
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
        const cacheKey = `user_info_${username}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            console.log(`Fetching user info for ${username}...`);
            
            // Use the rate limiter for each API call
            const summary = await this.rateLimiter.add(
                () => getUserSummary(this.authorization, { userName: username }),
                `Get summary for user ${username}`
            );
            
            const profile = await this.rateLimiter.add(
                () => getUserProfile(this.authorization, { userName: username }),
                `Get profile for user ${username}`
            );
            
            const awards = await this.rateLimiter.add(
                () => getUserAwards(this.authorization, { userName: username }),
                `Get awards for user ${username}`
            );

            const result = {
                ...summary,
                ...profile,
                awards,
                profileImageUrl: `https://retroachievements.org${profile.userPic}`
            };
            
            // Cache the result
            this.setCachedItem(cacheKey, result);
            
            return result;
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
        const cacheKey = `rankings_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            console.log(`Fetching rankings for game ${gameId}...`);
            
            // Use the rate limiter to make the API call
            const rankings = await this.rateLimiter.add(
                () => getGameRankAndScore(this.authorization, {
                    gameId: parseInt(gameId),
                    type: 'high-scores'
                }),
                `Get rankings for game ${gameId}`
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, rankings);
            
            return rankings;
        } catch (error) {
            console.error(`Error fetching rankings for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of games for a console
     * @param {number} consoleId - RetroAchievements console ID
     * @returns {Promise<Array>} List of games
     */
    async getConsoleGames(consoleId) {
        const cacheKey = `console_games_${consoleId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            console.log(`Fetching games for console ${consoleId}...`);
            
            // Use the rate limiter to make the API call
            const games = await this.rateLimiter.add(
                () => getGameList(this.authorization, {
                    consoleId: parseInt(consoleId)
                }),
                `Get games for console ${consoleId}`
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, games);
            
            return games;
        } catch (error) {
            console.error(`Error fetching games for console ${consoleId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of all consoles
     * @returns {Promise<Array>} List of consoles
     */
    async getConsoles() {
        const cacheKey = 'consoles';
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            console.log('Fetching console list...');
            
            // Use the rate limiter to make the API call
            const consoles = await this.rateLimiter.add(
                () => getConsoleIds(this.authorization),
                'Get console list'
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, consoles);
            
            return consoles;
        } catch (error) {
            console.error('Error fetching console list:', error);
            throw error;
        }
    }

    /**
     * Get user's completed games
     * @param {string} username - RetroAchievements username
     * @returns {Promise<Array>} List of completed games
     */
    async getUserCompletedGames(username) {
        const cacheKey = `completed_games_${username}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        try {
            console.log(`Fetching completed games for ${username}...`);
            
            // Use the rate limiter to make the API call
            const completed = await this.rateLimiter.add(
                () => getUserCompletedGames(this.authorization, {
                    username
                }),
                `Get completed games for ${username}`
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, completed);
            
            return completed;
        } catch (error) {
            console.error(`Error fetching completed games for ${username}:`, error);
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
            console.log(`Validating user ${username}...`);
            
            // Use the rate limiter to make the API call
            await this.rateLimiter.add(
                () => getUserProfile(this.authorization, { userName: username }),
                `Validate user ${username}`
            );
            
            return true;
        } catch (error) {
            console.log(`User validation failed for ${username}:`, error);
            return false;
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
        const cacheKey = `leaderboard_entries_${leaderboardId}_${offset}_${count}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        // For leaderboards, use a shorter cache TTL (5 minutes)
        if (cachedData && Date.now() - this.cache.get(cacheKey).timestamp < 5 * 60 * 1000) {
            return cachedData;
        }
        
        try {
            console.log(`Fetching leaderboard entries for leaderboard ${leaderboardId}...`);
            
            // Use the rate limiter to make the API call
            const entries = await this.rateLimiter.add(
                () => this.apiRequest(`API_GetLeaderboardEntries.php?i=${leaderboardId}&o=${offset}&c=${count}`),
                `Get leaderboard entries for leaderboard ${leaderboardId}`
            );
            
            // Process and standardize the entries
            const processedEntries = this.processLeaderboardEntries(entries);
            
            // Cache the result
            this.setCachedItem(cacheKey, processedEntries);
            
            return processedEntries;
        } catch (error) {
            console.error(`Error fetching leaderboard entries for leaderboard ${leaderboardId}:`, error);
            throw error;
        }
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
     * Make a direct API request to the RetroAchievements API
     * @param {string} endpoint - API endpoint
     * @returns {Promise<Object>} API response
     */
    async apiRequest(endpoint) {
        const baseUrl = 'https://retroachievements.org/API/';
        const url = `${baseUrl}${endpoint}&z=${this.authorization.userName}&y=${this.authorization.webApiKey}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Select-Start-Bot/1.0',
                },
                timeout: 15000 // 15 seconds timeout
            });
            
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
        console.log('Cache cleared');
    }
}

// Create and export a singleton instance
const retroAPI = new RetroAchievementsService();
export default retroAPI;
