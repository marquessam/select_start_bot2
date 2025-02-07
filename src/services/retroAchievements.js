// File: src/services/retroAchievements.js
const axios = require('axios');

class RetroAchievementsAPI {
    constructor(username, apiKey) {
        if (!username || !apiKey) {
            throw new Error('Username and API key are required.');
        }
        this.username = username;
        this.apiKey = apiKey;
        this.baseUrl = 'https://retroachievements.org/API';
        this.lastRequestTime = Date.now();
        this.minRequestInterval = 2000;

        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
        });
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

    async makeRequest(endpoint, params = {}) {
        await this.waitForRateLimit();

        const fullParams = {
            ...params,
            z: this.username,
            y: this.apiKey,
        };

        try {
            // Log request without sensitive data
            const safeParams = { ...params };
            delete safeParams.z;  // Remove username
            delete safeParams.y;  // Remove API key
            console.info(`Making request to ${endpoint} with params:`, safeParams);

            const response = await this.axiosInstance.get(`/${endpoint}`, { params: fullParams });
            return response.data;
        } catch (error) {
            console.error(`API request to ${endpoint} failed: ${error.message}`);
            if (error.response) {
                console.error('Response status:', error.response.status);
                // Don't log response data as it might contain sensitive info
            }
            throw error;
        }
    }

    async getGameInfo(gameId) {
        console.info(`Fetching game info for game ${gameId}`);
        return this.makeRequest('API_GetGame.php', { i: gameId });
    }

    async getUserGameProgress(username, gameId) {
        console.info(`Fetching progress for ${username} in game ${gameId}`);
        const data = await this.makeRequest('API_GetGameInfoAndUserProgress.php', {
            u: username,
            g: gameId,
        });

        return {
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
    }

    async getGameList(searchTerm) {
        console.info(`Searching for games matching: ${searchTerm}`);
        return this.makeRequest('API_GetGameList.php', {
            f: searchTerm,
            h: 1,
        });
    }

    async getUserRecentAchievements(username, count = 50) {
        console.info(`Fetching recent achievements for ${username}`);
        return this.makeRequest('API_GetUserRecentAchievements.php', {
            u: username,
            c: count,
        });
    }

    async getUserProfile(username) {
        console.info(`Fetching profile for ${username}`);
        return this.makeRequest('API_GetUserProfile.php', { u: username });
    }
}

module.exports = RetroAchievementsAPI;
