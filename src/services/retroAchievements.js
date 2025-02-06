// File: src/services/retroAchievements.js
const axios = require('axios');

class RetroAchievementsAPI {
    constructor(username, apiKey) {
        this.username = username;
        this.apiKey = apiKey;
        this.baseUrl = 'https://retroachievements.org/API';
        this.lastRequestTime = 0;
        this.minRequestInterval = 2000;
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

    async makeRequest(endpoint, params) {
        await this.waitForRateLimit();

        try {
            const url = `${this.baseUrl}/${endpoint}`;
            console.log(`Making request to: ${url} with params:`, params);
            
            const response = await axios.get(url, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    ...params
                }
            });

            return response.data;
        } catch (error) {
            console.error('API request error:', error.message);
            throw error;
        }
    }

    async getGameInfo(gameId) {
        console.log(`Fetching game info for game ${gameId}`);
        return this.makeRequest('API_GetGame.php', { i: gameId });
    }

    async getUserGameProgress(username, gameId) {
        console.log(`Fetching progress for ${username} in game ${gameId}`);
        const data = await this.makeRequest('API_GetGameInfoAndUserProgress.php', {
            u: username,
            g: gameId
        });

        // Format the response to match what our system expects
        return {
            numAchievements: data.NumAchievements,
            earnedAchievements: data.NumAwardedToUser,
            totalAchievements: data.NumAchievements,
            achievements: data.Achievements || {},
            userCompletion: data.UserCompletion,
            gameTitle: data.GameTitle,
            console: data.ConsoleName,
            gameIcon: data.ImageIcon,
            points: data.Points,
            possibleScore: data.PossibleScore
        };
    }

    async getGameList(searchTerm) {
        console.log(`Searching for games matching: ${searchTerm}`);
        return this.makeRequest('API_GetGameList.php', {
            f: searchTerm,
            h: 1
        });
    }

    async getUserRecentAchievements(username, count = 50) {
        console.log(`Fetching recent achievements for ${username}`);
        return this.makeRequest('API_GetUserRecentAchievements.php', {
            u: username,
            c: count
        });
    }

    async getUserProfile(username) {
        console.log(`Fetching profile for ${username}`);
        return this.makeRequest('API_GetUserProfile.php', {
            u: username
        });
    }
}

module.exports = RetroAchievementsAPI;
