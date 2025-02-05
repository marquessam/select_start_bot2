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
            const response = await axios.get(`${this.baseUrl}/API_GetGame.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    i: gameId
                },
            });
            
            if (!response.data || !response.data.NumAchievements) {
                throw new Error(`Invalid game data received for game ${gameId}`);
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

    async getUserProfile(raUsername) {
        try {
            const response = await axios.get(`${this.baseUrl}/API_GetUserProfile.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    u: raUsername
                },
            });
            
            if (!response.data) {
                throw new Error(`No profile data received for user ${raUsername}`);
            }
            
            return response.data;
        } catch (error) {
            console.error(`Error fetching user profile for ${raUsername}:`, error);
            throw error;
        }
    }
}

module.exports = RetroAchievementsAPI;
