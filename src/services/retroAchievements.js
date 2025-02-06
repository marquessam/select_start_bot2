// File: src/services/retroAchievements.js
const axios = require('axios');

class RetroAchievementsAPI {
    constructor(username, apiKey) {
        this.username = username;
        this.apiKey = apiKey;
        this.baseUrl = 'https://retroachievements.org/API';
        this.lastRequestTime = 0;
        this.minRequestInterval = 2000; // Minimum 2 seconds between requests
        this.maxRetries = 3;
        this.timeout = 10000; // 10 second timeout
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            console.log(`Rate limiting: waiting ${waitTime}ms before next request`);
            await this.sleep(waitTime);
        }
        
        this.lastRequestTime = Date.now();
    }

    async makeRequest(endpoint, params, retryCount = 0) {
        try {
            await this.waitForRateLimit();

            const url = `${this.baseUrl}/${endpoint}`;
            console.log(`Making request to: ${url} with params:`, params);
            
            const response = await axios.get(url, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    ...params
                },
                headers: {
                    'Accept': 'application/json'
                },
                timeout: this.timeout
            });

            if (!response.data) {
                throw new Error('No data received from API');
            }

            return response.data;
        } catch (error) {
            console.error(`API request error (attempt ${retryCount + 1}/${this.maxRetries}):`, error.message);
            console.error('Failed URL:', error.config?.url);
            
            if (error.response) {
                console.error('Error response:', error.response.status, error.response.data);
            }

            // Handle rate limiting specifically
            if (error.response && error.response.status === 429) {
                const waitTime = 5000 * (retryCount + 1); // Progressive backoff
                console.log(`Rate limit hit, waiting ${waitTime}ms before retry`);
                await this.sleep(waitTime);
            }

            // Retry logic
            if (retryCount < this.maxRetries) {
                console.log(`Retrying request (attempt ${retryCount + 1}/${this.maxRetries})`);
                await this.sleep(2000 * (retryCount + 1)); // Progressive backoff
                return this.makeRequest(endpoint, params, retryCount + 1);
            }

            throw error;
        }
    }

    /**
     * Get basic game information
     */
    async getGameInfo(gameId) {
        console.log(`Fetching game info for game ${gameId}`);
        return this.makeRequest('API_GetGame.php', { i: gameId });
    }

    /**
     * Get extended game information including rich presence
     */
    async getGameInfoExtended(gameId) {
        console.log(`Fetching extended game info for game ${gameId}`);
        return this.makeRequest('API_GetGameExtended.php', { i: gameId });
    }

    /**
     * Search for games
     */
    async getGameList(searchTerm) {
        console.log(`Searching for games matching: ${searchTerm}`);
        return this.makeRequest('API_GetGameList.php', {
            f: searchTerm,
            h: 1  // Include metadata
        });
    }

    /**
     * Get achievement information for a specific achievement
     */
    async getAchievementInfo(achievementId) {
        console.log(`Fetching achievement info for ID ${achievementId}`);
        return this.makeRequest('API_GetAchievement.php', { i: achievementId });
    }

    /**
     * Get user's progress for one or more games
     */
    async getUserProgress(username, gameIds) {
        const ids = Array.isArray(gameIds) ? gameIds : [gameIds];
        console.log(`Fetching progress for ${username} in games: ${ids.join(', ')}`);
        
        return this.makeRequest('API_GetUserProgress.php', {
            u: username,
            i: ids.join(',')
        });
    }

    /**
     * Get game information and user progress
     */
    async getGameInfoAndUserProgress(username, gameId) {
        console.log(`Fetching game info and progress for ${username} in game ${gameId}`);
        return this.makeRequest('API_GetGameInfoAndUserProgress.php', {
            u: username,
            g: gameId
        });
    }

    /**
     * Get user's recent achievements
     */
    async getUserRecentAchievements(username, count = 50, offset = 0) {
        console.log(`Fetching recent achievements for ${username}`);
        return this.makeRequest('API_GetUserRecentAchievements.php', {
            u: username,
            c: count,
            o: offset
        });
    }

    /**
     * Get user's completed games
     */
    async getUserCompletedGames(username) {
        console.log(`Fetching completed games for ${username}`);
        return this.makeRequest('API_GetUserCompletedGames.php', {
            u: username
        });
    }

    /**
     * Get user's profile information
     */
    async getUserProfile(username) {
        console.log(`Fetching profile for ${username}`);
        return this.makeRequest('API_GetUserProfile.php', {
            u: username
        });
    }

    /**
     * Get user's summary information
     */
    async getUserSummary(username) {
        console.log(`Fetching user summary for ${username}`);
        return this.makeRequest('API_GetUserSummary.php', {
            u: username
        });
    }

    /**
     * Get game's achievement distribution
     */
    async getGameAchievementDistribution(gameId) {
        console.log(`Fetching achievement distribution for game ${gameId}`);
        return this.makeRequest('API_GetAchievementDistribution.php', {
            i: gameId
        });
    }

    /**
     * Utility method to format game info responses
     */
    formatGameInfo(gameInfo) {
        return {
            title: gameInfo.Title || gameInfo.GameTitle || 'Unknown',
            gameId: gameInfo.ID || gameInfo.GameID,
            console: gameInfo.Console || gameInfo.ConsoleName,
            consoleId: gameInfo.ConsoleID,
            developer: gameInfo.Developer,
            publisher: gameInfo.Publisher,
            genre: gameInfo.Genre,
            released: gameInfo.Released,
            imageIcon: gameInfo.ImageIcon,
            imageTitle: gameInfo.ImageTitle,
            imageIngame: gameInfo.ImageIngame,
            imageBoxArt: gameInfo.ImageBoxArt,
            numAchievements: gameInfo.NumAchievements,
            points: gameInfo.Points,
            dateModified: gameInfo.DateModified,
            forumTopicId: gameInfo.ForumTopicID
        };
    }

    /**
     * Utility method to format achievement progress
     */
    formatProgress(progress) {
        if (!progress) return null;
        
        return {
            earnedAchievements: progress.numAchieved || 0,
            totalAchievements: progress.numPossibleAchievements || 0,
            earnedPoints: progress.scoreAchieved || 0,
            totalPoints: progress.possibleScore || 0,
            completionPercentage: progress.numPossibleAchievements 
                ? ((progress.numAchieved / progress.numPossibleAchievements) * 100).toFixed(2)
                : '0.00'
        };
    }
}

module.exports = RetroAchievementsAPI;