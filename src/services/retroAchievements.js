// File: src/services/retroAchievements.js
const axios = require('axios');
const Cache = require('../utils/cache');

class RetroAchievementsAPI {
    constructor(username, apiKey) {
        if (!username || !apiKey) {
            throw new Error('Username and API key are required.');
        }
        this.username = username;
        this.apiKey = apiKey;
        this.baseUrl = 'https://retroachievements.org/API';
        this.lastRequestTime = Date.now();
        this.minRequestInterval = 3000; // 3 seconds between requests
        this.retryDelay = 5000; // 5 seconds before retry on rate limit
        this.maxRetries = 3;

        // Initialize caches with different TTLs
        this.progressCache = new Cache(300000);    // 5 minutes for progress and similar data
        this.gameInfoCache = new Cache(3600000);     // 1 hour for game info
        this.achievementCache = new Cache(60000);    // 1 minute for achievements
        this.leaderboardCache = new Cache(300000);   // 5 minutes for leaderboards
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            console.info(`Rate limiting: waiting ${waitTime}ms before next request`);
            await this.sleep(waitTime);
        }

        this.lastRequestTime = Date.now();
    }

    async makeRequest(endpoint, params = {}, retryCount = 0) {
        await this.waitForRateLimit();

        const fullParams = {
            ...params,
            z: this.username,
            y: this.apiKey,
        };

        try {
            // Log request without sensitive data
            const safeParams = { ...params };
            console.info(`Making request to ${endpoint} with params:`, safeParams);

            const response = await axios.get(`${this.baseUrl}/${endpoint}`, { params: fullParams });
            return response.data;
        } catch (error) {
            // Handle rate limiting
            if (error.response && error.response.status === 429) {
                if (retryCount < this.maxRetries) {
                    console.log(`Rate limited, attempt ${retryCount + 1}/${this.maxRetries}. Waiting ${this.retryDelay}ms...`);
                    await this.sleep(this.retryDelay);
                    return this.makeRequest(endpoint, params, retryCount + 1);
                }
            }

            console.error(`API request to ${endpoint} failed: ${error.message}`);
            if (error.response) {
                console.error('Response status:', error.response.status);
            }
            throw error;
        }
    }

    async getGameInfo(gameId) {
        const cacheKey = `game-${gameId}`;
        const cachedData = this.gameInfoCache.get(cacheKey);

        if (cachedData) {
            console.log(`Using cached game info for game ${gameId}`);
            return cachedData;
        }

        console.info(`Fetching game info for game ${gameId}`);
        const data = await this.makeRequest('API_GetGame.php', { i: gameId });
        this.gameInfoCache.set(cacheKey, data);
        return data;
    }

    async getUserGameProgress(username, gameId) {
        const cacheKey = `progress-${username}-${gameId}`;
        const cachedData = this.progressCache.get(cacheKey);

        if (cachedData) {
            console.log(`Using cached progress data for ${username} in game ${gameId}`);
            return cachedData;
        }

        console.info(`Fetching progress for ${username} in game ${gameId}`);
        const data = await this.makeRequest('API_GetGameInfoAndUserProgress.php', {
            u: username,
            g: gameId,
        });

        const progressData = {
            numAchievements: data.NumAchievements,
            earnedAchievements: data.NumAwardedToUser,
            totalAchievements: data.NumAchievements,
            achievements: data.Achievements || [],
            userCompletion: data.UserCompletion,
            gameTitle: data.GameTitle,
            console: data.ConsoleName,
            gameIcon: data.ImageIcon,
            points: data.Points,
            possibleScore: data.PossibleScore,
        };

        this.progressCache.set(cacheKey, progressData);
        return progressData;
    }

    async getUserRecentAchievements(username, count = 50) {
        const cacheKey = `recent-${username}`;
        const cachedData = this.achievementCache.get(cacheKey);

        if (cachedData) {
            console.log(`Using cached recent achievements for ${username}`);
            return cachedData;
        }

        console.info(`Fetching recent achievements for ${username}`);
        const data = await this.makeRequest('API_GetUserRecentAchievements.php', {
            u: username,
            c: count,
        });

        this.achievementCache.set(cacheKey, data);
        return data;
    }
    
    async getGameList(searchTerm) {
        const cacheKey = `search-${searchTerm}`;
        const cachedData = this.gameInfoCache.get(cacheKey);

        if (cachedData) {
            console.log(`Using cached search results for "${searchTerm}"`);
            return cachedData;
        }

        console.info(`Searching for games matching: ${searchTerm}`);
        const data = await this.makeRequest('API_GetGameList.php', {
            f: searchTerm,
            h: 1,
        });

        this.gameInfoCache.set(cacheKey, data);
        return data;
    }

    async getUserProfile(username) {
        const cacheKey = `profile-${username}`;
        const cachedData = this.progressCache.get(cacheKey);

        if (cachedData) {
            console.log(`Using cached profile data for ${username}`);
            return cachedData;
        }

        console.info(`Fetching profile for ${username}`);
        const data = await this.makeRequest('API_GetUserProfile.php', { u: username });
        this.progressCache.set(cacheKey, data);
        return data;
    }

    async getLeaderboardInfo(leaderboardId) {
        const cacheKey = `leaderboard-${leaderboardId}`;
        const cachedData = this.leaderboardCache.get(cacheKey);

        if (cachedData) {
            console.log(`Using cached leaderboard data for ID ${leaderboardId}`);
            return cachedData;
        }

        console.info(`Fetching leaderboard info for ID ${leaderboardId}`);
        try {
            const data = await this.makeRequest('API_GetLeaderboardEntries.php', {
                i: leaderboardId,
                c: 50  // Get top 50 entries
            });

            if (data) {
                this.leaderboardCache.set(cacheKey, data);
                console.log(`Successfully fetched leaderboard ${leaderboardId}`);
            }

            return data;
        } catch (error) {
            console.error(`Error fetching leaderboard ${leaderboardId}:`, error);
            throw error;
        }
    }

    // New method for retrieving a user's game leaderboards.
    // This endpoint returns the leaderboards for the given game that the user has submitted scores for.
    async getUserGameLeaderboards(gameId, username, count = 200, offset = 0) {
        const cacheKey = `userLeaderboards-${username}-${gameId}-${count}-${offset}`;
        const cachedData = this.progressCache.get(cacheKey);

        if (cachedData) {
            console.log(`Using cached user game leaderboards for ${username} and game ${gameId}`);
            return cachedData;
        }

        console.info(`Fetching user game leaderboards for user ${username}, game ${gameId}`);
        const data = await this.makeRequest('API_GetUserGameLeaderboards.php', {
            i: gameId,
            u: username,
            c: count,
            o: offset,
        });
        
        // The expected response is a JSON object:
        // {
        //   "Count": <number>,
        //   "Total": <number>,
        //   "Results": [
        //     {
        //       "ID": <number>,
        //       "RankAsc": <boolean>,
        //       "Title": <string>,
        //       "Description": <string>,
        //       "Format": <string>,
        //       "UserEntry": {
        //         "User": <string>,
        //         "Score": <number>,
        //         "FormattedScore": <string>,
        //         "Rank": <number>,
        //         "DateSubmitted": <string>
        //       }
        //     },
        //     ...
        //   ]
        // }
        this.progressCache.set(cacheKey, data);
        return data;
    }

    // Force refresh methods to bypass cache.
    async refreshUserGameProgress(username, gameId) {
        const cacheKey = `progress-${username}-${gameId}`;
        this.progressCache.delete(cacheKey);
        return this.getUserGameProgress(username, gameId);
    }

    async refreshGameInfo(gameId) {
        const cacheKey = `game-${gameId}`;
        this.gameInfoCache.delete(cacheKey);
        return this.getGameInfo(gameId);
    }

    async refreshUserProfile(username) {
        const cacheKey = `profile-${username}`;
        this.progressCache.delete(cacheKey);
        return this.getUserProfile(username);
    }

    async refreshLeaderboard(leaderboardId) {
        const cacheKey = `leaderboard-${leaderboardId}`;
        this.leaderboardCache.delete(cacheKey);
        return this.getLeaderboardInfo(leaderboardId);
    }
}

module.exports = RetroAchievementsAPI;