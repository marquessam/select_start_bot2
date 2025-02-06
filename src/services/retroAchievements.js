// File: src/services/retroAchievements.js
const axios = require('axios');

class RetroAchievementsAPI {
    constructor(username, apiKey) {
        this.username = username;
        this.apiKey = apiKey;
        this.baseUrl = 'https://retroachievements.org/API';
    }

    async getGameInfo(gameId) {
        try {
            console.log(`Fetching game info for game ${gameId}`);
            
            const response = await axios.get(`${this.baseUrl}/API_GetGame.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    i: gameId
                },
            });

            console.log('API Response:', response.data);
            
            if (!response.data) {
                throw new Error(`No data received for game ${gameId}`);
            }

            return response.data;
        } catch (error) {
            console.error('Error fetching game info:', error);
            throw error;
        }
    }

    async getUserProgress(raUsername, gameId) {
        try {
            console.log(`Fetching progress for ${raUsername} in game ${gameId}`);
            const response = await axios.get(`${this.baseUrl}/API_GetGameInfoAndUserProgress.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    u: raUsername,
                    g: gameId
                },
            });
            
            if (!response.data) {
                throw new Error(`No data received for user ${raUsername} game ${gameId}`);
            }

            // Log some useful information
            console.log(`User completion: ${response.data.UserCompletion}`);
            console.log(`Achievements earned: ${response.data.NumAwardedToUser}/${response.data.NumAchievements}`);

            return {
                numAchievements: response.data.NumAchievements,
                earnedAchievements: response.data.NumAwardedToUser,
                achievements: response.data.Achievements || {},
                userCompletion: response.data.UserCompletion,
                highestAwardKind: response.data.HighestAwardKind
            };
        } catch (error) {
            console.error(`Error fetching user progress for ${raUsername} game ${gameId}:`, error);
            throw error;
        }
    }

    async getUserRecentAchievements(raUsername) {
        try {
            console.log(`Fetching recent achievements for ${raUsername}`);
            const response = await axios.get(`${this.baseUrl}/API_GetUserRecentAchievements.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    u: raUsername,
                    c: 50  // Get last 50 achievements
                },
            });
            
            if (!response.data) {
                throw new Error(`No data received for user ${raUsername}`);
            }

            console.log(`Found ${response.data.length} recent achievements for ${raUsername}`);
            return response.data;

        } catch (error) {
            console.error(`Error fetching recent achievements for ${raUsername}:`, error);
            throw error;
        }
    }

    async getGameInfoFull(gameId) {
        try {
            console.log(`Fetching full game info for game ${gameId}`);
            
            const response = await axios.get(`${this.baseUrl}/API_GetGameExtended.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    i: gameId
                },
            });

            if (!response.data) {
                throw new Error(`No extended data received for game ${gameId}`);
            }

            return response.data;
        } catch (error) {
            console.error('Error fetching extended game info:', error);
            throw error;
        }
    }
}

module.exports = RetroAchievementsAPI;
