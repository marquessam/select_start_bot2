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
        this.minRequestInterval = 3000; // Increased to 3 seconds
        this.retryDelay = 5000; // 5 seconds before retry
        this.maxRetries = 3;

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
            delete safeParams.z;
            delete safeParams.y;
            console.info(`Making request to ${endpoint}`);

            const response = await this.axiosInstance.get(`/${endpoint}`, { params: fullParams });
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
            throw error;
        }
    }

    // Rest of your methods remain the same
    async getGameInfo(gameId) {
        return this.makeRequest('API_GetGame.php', { i: gameId });
    }

    async getUserGameProgress(username, gameId) {
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
        return this.makeRequest('API_GetGameList.php', {
            f: searchTerm,
            h: 1,
        });
    }

    async getUserRecentAchievements(username, count = 50) {
        return this.makeRequest('API_GetUserRecentAchievements.php', {
            u: username,
            c: count,
        });
    }

    async getUserProfile(username) {
        return this.makeRequest('API_GetUserProfile.php', { u: username });
    }
}

module.exports = RetroAchievementsAPI;
