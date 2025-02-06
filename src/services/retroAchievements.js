// File: src/services/retroAchievements.js
const axios = require('axios');

class RetroAchievementsAPI {
    constructor(username, apiKey) {
        this.username = username;
        this.apiKey = apiKey;
        this.baseUrl = 'https://retroachievements.org';
        this.lastRequestTime = 0;
        this.minRequestInterval = 2000; // Minimum 2 seconds between requests
        this.maxRetries = 3;
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

            const url = `${this.baseUrl}/API/${endpoint}`;
            console.log(`Making request to: ${url}`);
            
            const response = await axios.get(url, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    ...params
                },
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 10000 // 10 second timeout
            });

            if (!response.data) {
                throw new Error('No data received from API');
            }

            return response.data;
        } catch (error) {
            console.error(`API request error (attempt ${retryCount + 1}/${this.maxRetries}):`, error.message);
            console.error('Failed URL:', error.config?.url);
            console.error('Error response:', error.response?.data);

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

    async getGameInfo(gameId) {
        console.log(`Fetching game info for game ${gameId}`);
        return this.makeRequest('API_GetGame.php', { i: gameId });
    }

    async getGameInfoExtended(gameId) {
        console.log(`Fetching extended game info for game ${gameId}`);
        return this.makeRequest('API_GetGameExtended.php', { i: gameId });
    }

    async searchGame(searchTerm) {
        console.log(`Searching for game: ${searchTerm}`);
        const data = await this.makeRequest('API_GetGameList.php', { 
            f: searchTerm,
            h: 1
        });

        if (!data) {
            return [];
        }

        // Convert the object response to an array of games
        return Object.entries(data).map(([id, game]) => ({
            gameId: id,
            title: game.Title,
            consoleId: game.ConsoleID,
            consoleName: game.ConsoleName,
            imageIcon: game.ImageIcon,
            numAchievements: game.NumAchievements
        }));
    }

    async getUserProgress(raUsername, gameId) {
        console.log(`Fetching progress for ${raUsername} in game ${gameId}`);
        const data = await this.makeRequest('API_GetGameInfoAndUserProgress.php', {
            u: raUsername,
            g: gameId
        });

        return {
            numAchievements: data.NumAchievements,
            earnedAchievements: data.NumAwardedToUser,
            achievements: data.Achievements || {},
            userCompletion: data.UserCompletion,
            highestAwardKind: data.HighestAwardKind
        };
    }

    async getUserRecentAchievements(raUsername, count = 50) {
        console.log(`Fetching recent achievements for ${raUsername}`);
        return this.makeRequest('API_GetUserRecentAchievements.php', {
            u: raUsername,
            c: count
        });
    }

    async getUserCompletedGames(raUsername) {
        console.log(`Fetching completed games for ${raUsername}`);
        return this.makeRequest('API_GetUserCompletedGames.php', {
            u: raUsername
        });
    }

    async getUserSummary(raUsername) {
        console.log(`Fetching user summary for ${raUsername}`);
        return this.makeRequest('API_GetUserSummary.php', {
            u: raUsername
        });
    }

    async getGameAchievementDistribution(gameId) {
        console.log(`Fetching achievement distribution for game ${gameId}`);
        return this.makeRequest('API_GetAchievementDistribution.php', {
            i: gameId
        });
    }
}

module.exports = RetroAchievementsAPI;
