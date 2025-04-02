import { buildAuthorization, getGame, getGameExtended, getUserProfile, getUserRecentAchievements, 
    getUserSummary, getGameInfoAndUserProgress, getGameRankAndScore, getUserCompletedGames,
    getUserAwards, getGameList, getConsoleIds, getAchievementCount } from '@retroachievements/api';
import { config } from '../config/config.js';

/**
 * Simple rate limiter to prevent exceeding API rate limits
 */
class RateLimiter {
    constructor(rateLimitSeconds = 3) {
        this.rateLimitSeconds = rateLimitSeconds;
        this.queue = [];
        this.processing = false;
    }

    /**
     * Add a function to the rate limiter queue
     * @param {Function} fn - Function to execute
     * @returns {Promise<any>} Result of the function
     */
    async add(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.process();
        });
    }

    /**
     * Process the queue
     */
    async process() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        const { fn, resolve, reject } = this.queue.shift();
        
        try {
            const result = await fn();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.processing = false;
            
            // Wait for the rate limit before processing the next item
            setTimeout(() => {
                this.process();
            }, 1000 * this.rateLimitSeconds);
        }
    }
}

class RetroAchievementsService {
    constructor() {
        this.authorization = buildAuthorization({
            userName: process.env.RA_USERNAME,
            webApiKey: config.retroAchievements.apiKey
        });
        
        // Create a rate limiter with 1 request per second
        this.rateLimiter = new RateLimiter(1);
    }

    /**
     * Get user's progress for a specific game
     * @param {string} username - RetroAchievements username
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} User's progress data
     */
    async getUserGameProgress(username, gameId) {
        try {
            // Use the rate limiter to make the API call
            const progress = await this.rateLimiter.add(() => 
                getGameInfoAndUserProgress(this.authorization, {
                    gameId: gameId,
                    userName: username
                })
            );

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
        try {
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(() => 
                getGameExtended(this.authorization, {
                    gameId: parseInt(gameId)
                })
            );

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
        try {
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(() => 
                getAchievementCount(this.authorization, {
                    gameId: parseInt(gameId)
                })
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
            // Use the rate limiter to make the API call
            const achievements = await this.rateLimiter.add(() => 
                getUserRecentAchievements(this.authorization, {
                    username,
                    count
                })
            );

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
            // Use the rate limiter to make the API call
            const game = await this.rateLimiter.add(() => 
                getGame(this.authorization, {
                    gameId: parseInt(gameId)
                })
            );

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

            return {
                ...summary,
                ...profile,
                awards,
                profileImageUrl: `https://retroachievements.org${profile.userPic}`
            };
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
            // Use the rate limiter to make the API call
            const rankings = await this.rateLimiter.add(() => 
                getGameRankAndScore(this.authorization, {
                    gameId: parseInt(gameId),
                    type: 'high-scores'
                })
            );

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
        try {
            // Use the rate limiter to make the API call
            const games = await this.rateLimiter.add(() => 
                getGameList(this.authorization, {
                    consoleId: parseInt(consoleId)
                })
            );

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
        try {
            // Use the rate limiter to make the API call
            const consoles = await this.rateLimiter.add(() => 
                getConsoleIds(this.authorization)
            );
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
        try {
            // Use the rate limiter to make the API call
            const completed = await this.rateLimiter.add(() => 
                getUserCompletedGames(this.authorization, {
                    username
                })
            );

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
            // Use the rate limiter to make the API call
            await this.rateLimiter.add(() => 
                getUserProfile(this.authorization, { userName: username })
            );
            return true;
        } catch (error) {
            console.log(error);
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
        try {
            // Use the rate limiter to make the API call
            const entries = await this.rateLimiter.add(() => 
                this.apiRequest(`API_GetLeaderboardEntries.php?i=${leaderboardId}&o=${offset}&c=${count}`)
            );

            // Process and standardize the entries
            return this.processLeaderboardEntries(entries);
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
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${error.message}`);
            throw error;
        }
    }
}

// Create and export a singleton instance
const retroAPI = new RetroAchievementsService();
export default retroAPI;
