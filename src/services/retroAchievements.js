// File: src/services/retroAchievements.js
const axios = require('axios');

class RetroAchievementsAPI {
    constructor(username, apiKey) {
        this.username = username;
        this.apiKey = apiKey;
        this.baseUrl = 'https://retroachievements.org/API';
        this.lastRequestTime = 0;
        this.minRequestInterval = 2000; // Minimum 2 seconds between requests
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
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

    async getUserProgress(username, gameIds) {
        // Convert single gameId to array if necessary
        const ids = Array.isArray(gameIds) ? gameIds : [gameIds];
        console.log(`Fetching progress for ${username} in games: ${ids.join(', ')}`);
        
        return this.makeRequest('API_GetUserProgress.php', {
            u: username,
            i: ids.join(',')
        });
    }

    async getUserProfile(username) {
        console.log(`Fetching profile for ${username}`);
        return this.makeRequest('API_GetUserProfile.php', {
            u: username
        });
    }

    async getGameInfoAndUserProgress(username, gameId) {
        console.log(`Fetching game info and progress for ${username} in game ${gameId}`);
        return this.makeRequest('API_GetGameInfoAndUserProgress.php', {
            u: username,
            g: gameId
        });
    }

    async getUserRecentAchievements(username, count = 50) {
        console.log(`Fetching recent achievements for ${username}`);
        return this.makeRequest('API_GetUserRecentAchievements.php', {
            u: username,
            c: count
        });
    }

    /**
     * Utility method to get formatted user progress for a game
     */
    async getFormattedUserProgress(username, gameId) {
        const progress = await this.getUserProgress(username, gameId);
        const gameProgress = progress[gameId];
        
        if (!gameProgress) {
            return {
                achievementCount: 0,
                totalAchievements: 0,
                userCompletion: "0.00%",
                hardcoreCompletion: "0.00%"
            };
        }

        const completion = ((gameProgress.numAchieved / gameProgress.numPossibleAchievements) * 100).toFixed(2);
        const hardcoreCompletion = ((gameProgress.numAchievedHardcore / gameProgress.numPossibleAchievements) * 100).toFixed(2);

        return {
            achievementCount: gameProgress.numAchieved,
            totalAchievements: gameProgress.numPossibleAchievements,
            userCompletion: `${completion}%`,
            hardcoreCompletion: `${hardcoreCompletion}%`,
            scoreAchieved: gameProgress.scoreAchieved,
            possibleScore: gameProgress.possibleScore
        };
    }

    /**
     * Utility method to check if a game exists
     */
    async gameExists(gameId) {
        try {
            const game = await this.getGameInfo(gameId);
            return !!game && !!game.title;
        } catch (error) {
            return false;
        }
    }

    /**
     * Utility method to format game info
     */
    formatGameInfo(gameInfo) {
        return {
            title: gameInfo.title || gameInfo.gameTitle,
            gameId: gameInfo.id,
            console: gameInfo.console || gameInfo.consoleName,
            consoleId: gameInfo.consoleId,
            developer: gameInfo.developer,
            publisher: gameInfo.publisher,
            genre: gameInfo.genre,
            released: gameInfo.released,
            imageIcon: gameInfo.imageIcon,
            imageTitle: gameInfo.imageTitle,
            imageIngame: gameInfo.imageIngame,
            imageBoxArt: gameInfo.imageBoxArt
        };
    }
}

module.exports = RetroAchievementsAPI;
