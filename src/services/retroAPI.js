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
            interval: 1200,             // 1.2 seconds (slightly more than 1 second for safety margin)
            maxRetries: 3,              // Retry up to 3 times for rate limit errors
            retryDelay: 3000            // Start with a 3-second delay between retries
        });
        
        // Cache for responses to reduce API calls
        this.cache = new Map();
        // TTL for cache in milliseconds (5 minutes)
        this.cacheTTL = 5 * 60 * 1000;
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
            // Use the rate limiter to make the API call
            const progress = await this.rateLimiter.add(() => 
                getGameInfoAndUserProgress(this.authorization, {
                    gameId: gameId,
                    userName: username
                })
            );

            // Cache the result
            this.setCachedItem(cacheKey, progress);

            return progress;
        } catch (error) {
            console.error(`Error fetching game progress for ${username} in game ${gameId}:`, error);
            
            // Return a minimal valid response structure to prevent further errors
            return {
                numAwardedToUser: 0,
                achievements: {},
                title: `Game ${gameId}`
            };
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
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(() => 
                getGameExtended(this.authorization, {
                    gameId: parseInt(gameId)
                })
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, game);
            
            return game;
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
        const cacheKey = `achievement_count_${gameId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData !== undefined) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(() => 
                getAchievementCount(this.authorization, {
                    gameId: parseInt(gameId)
                })
            );
            
            const count = game.achievementIds.length;
            
            // Cache the result
            this.setCachedItem(cacheKey, count);
            
            return count;
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
        // For recent achievements, we use a shorter cache period
        const cacheKey = `recent_achievements_${username}_${count}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        // Recent achievements should have a shorter TTL (1 minute)
        if (cachedData && (Date.now() - this.cache.get(cacheKey).timestamp) < 60000) {
            return cachedData;
        }
        
        try {
            // Use the rate limiter to make the API call
            const achievements = await this.rateLimiter.add(() => 
                getUserRecentAchievements(this.authorization, {
                    userName: username, // Make sure to use the correct parameter name (userName, not username)
                    count
                })
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, achievements);
            
            return achievements;
        } catch (error) {
            console.error(`Error fetching recent achievements for ${username}:`, error);
            // Return empty array instead of throwing to prevent cascading failures
            return [];
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
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(() => 
                getGame(this.authorization, {
                    gameId: parseInt(gameId)
                })
            );
            
            // Cache the result
            this.setCachedItem(cacheKey, game);
            
            return game;
        } catch (error) {
            console.error(`Error fetching game info for ${gameId}:`, error);
            
            // Return a minimal valid response structure to prevent further errors
            return {
                id: gameId,
                title: `Game ${gameId}`,
                consoleName: "Unknown",
                imageIcon: ""
            };
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
            // Use the rate limiter for each API call
            const summary = await this.rateLimiter.add(() => 
                getUserSummary(this.authorization, { userName: username })
            );
            
            const profile = await this.rateLimiter.add(() => 
                getUserProfile(this.authorization, { userName: username })
            );
            
            const awards = await this.rateLimiter.add(() => 
                getUserAwards(this.authorization, { userName: username })
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
            
            // Return a minimal valid response structure to prevent further errors
            return {
                profileImageUrl: `https://retroachievements.org/UserPic/${username}.png`
            };
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
            // Use the rate limiter to make the API call
            const rankings = await this.rateLimiter.add(() => 
                getGameRankAndScore(this.authorization, {
                    gameId: parseInt(gameId),
                    type: 'high-scores'
                })
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
            // Use the rate limiter to make the API call
            const games = await this.rateLimiter.add(() => 
                getGameList(this.authorization, {
                    consoleId: parseInt(consoleId)
                })
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
            // Use the rate limiter to make the API call
            const consoles = await this.rateLimiter.add(() => 
                getConsoleIds(this.authorization)
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
            // Use the rate limiter to make the API call
            const completed = await this.rateLimiter.add(() => 
                getUserCompletedGames(this.authorization, {
                    userName: username  // Make sure to use the correct parameter name (userName, not username)
                })
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
            // User validation results can be cached for longer periods
            const cacheKey = `user_exists_${username.toLowerCase()}`;
            const cachedResult = this.getCachedItem(cacheKey);
            
            if (cachedResult !== undefined) {
                return cachedResult;
            }
            
            // Use the rate limiter to make the API call
            await this.rateLimiter.add(() => 
                getUserProfile(this.authorization, { userName: username })
            );
            
            // Cache the positive result
            this.setCachedItem(cacheKey, true);
            
            return true;
        } catch (error) {
            console.log(error);
            // Cache the negative result too
            this.setCachedItem(`user_exists_${username.toLowerCase()}`, false);
            return false;
        }
    }

/**
 * Get leaderboard entries using direct API request
 * @param {number} leaderboardId - RetroAchievements leaderboard ID
 * @returns {Promise<Object>} Leaderboard data object with Results array
 */
async getLeaderboardEntriesDirect(leaderboardId) {
    try {
        const cacheKey = `direct_leaderboard_${leaderboardId}`;
        const cachedData = this.getCachedItem(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }
        
        // Make direct API request to the RetroAchievements leaderboard endpoint
        const url = `https://retroachievements.org/API/API_GetLeaderboardEntries.php?i=${leaderboardId}&o=0&c=100&z=${process.env.RA_USERNAME}&y=${process.env.RA_API_KEY}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        
        // Safely log the raw data for debugging
        try {
            if (data) {
                // Check if data is an object with Results or an array
                const structureType = Array.isArray(data) ? "array" : 
                    (data.Results && Array.isArray(data.Results) ? "object with Results array" : "other structure");
                
                // Log sample data
                if (Array.isArray(data) && data.length > 0) {
                    const sampleJson = JSON.stringify(data[0]);
                    console.log(`Raw leaderboard data for ${leaderboardId} (${structureType}, sample):`, 
                        sampleJson.substring(0, 300) + '...');
                } else if (data.Results && data.Results.length > 0) {
                    const sampleJson = JSON.stringify(data.Results[0]);
                    console.log(`Raw leaderboard data for ${leaderboardId} (${structureType}, sample):`, 
                        sampleJson.substring(0, 300) + '...');
                } else {
                    console.log(`Raw leaderboard data for ${leaderboardId} (${structureType}):`, 
                        JSON.stringify(data).substring(0, 300) + '...');
                }
            }
        } catch (logError) {
            console.log(`Could not log leaderboard data for ${leaderboardId}:`, logError.message);
        }
        
        // Cache the result
        this.setCachedItem(cacheKey, data);
        
        return data;
    } catch (error) {
        console.error(`Error fetching direct leaderboard entries for ${leaderboardId}:`, error);
        return { Results: [] }; // Return empty Results array for consistent structure
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
            // For leaderboards, use a shorter cache TTL
            const cacheKey = `leaderboard_entries_${leaderboardId}_${offset}_${count}`;
            const cachedData = this.getCachedItem(cacheKey);
            
            // Use a shorter TTL for leaderboard data (2 minutes)
            if (cachedData && (Date.now() - this.cache.get(cacheKey).timestamp) < 120000) {
                return cachedData;
            }
            
            // Use direct API method instead
            const entries = await this.getLeaderboardEntriesDirect(leaderboardId);

            // Process and standardize the entries
            const processedEntries = this.processLeaderboardEntries(entries);
            
            // Cache the processed entries
            this.setCachedItem(cacheKey, processedEntries);
            
            return processedEntries;
        } catch (error) {
            console.error(`Error fetching leaderboard entries for leaderboard ${leaderboardId}:`, error);
            return [];
        }
    }

    /**
     * Process leaderboard entries to standardize the format
     * @param {Object|Array} data - Raw API response
     * @returns {Array} Standardized leaderboard entries
     */
    processLeaderboardEntries(data) {
        if (!data || !Array.isArray(data)) {
            return [];
        }
        
        // Log a sample of the data to understand its structure
        if (data.length > 0) {
            console.log(`Sample leaderboard entry:`, JSON.stringify(data[0]).substring(0, 300));
        }
        
        // Convert entries to a standard format
        return data.map(entry => {
            // Handle different API response formats
            const user = entry.User || entry.user || '';
            const apiRank = entry.Rank || entry.rank || '0';
            
            // For scores, check all possible properties
            let score = null;
            
            // Check for numeric scores first (points-based leaderboards)
            if (entry.Score !== undefined) score = entry.Score;
            else if (entry.score !== undefined) score = entry.score;
            else if (entry.Value !== undefined) score = entry.Value;
            else if (entry.value !== undefined) score = entry.value;
            
            // Get the formatted version if available
            let formattedScore = null;
            if (entry.FormattedScore) formattedScore = entry.FormattedScore;
            else if (entry.formattedScore) formattedScore = entry.formattedScore;
            else if (entry.ScoreFormatted) formattedScore = entry.ScoreFormatted;
            else if (entry.scoreFormatted) formattedScore = entry.scoreFormatted;
            
            // Use the appropriate score representation
            let trackTime;
            if (formattedScore !== null) {
                trackTime = formattedScore;
            } else if (score !== null) {
                trackTime = score.toString();
            } else {
                // Last resort fallback
                trackTime = "No Score";
            }
            
            return {
                ApiRank: parseInt(apiRank, 10),
                User: user.trim(),
                TrackTime: trackTime.toString().trim(),
                DateSubmitted: entry.DateSubmitted || entry.dateSubmitted || null,
            };
        }).filter(entry => entry.User.length > 0);
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
                }
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
