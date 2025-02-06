// File: src/services/retroAchievements.js
const axios = require('axios');

class RetroAchievementsAPI {
    constructor(username, apiKey) {
        this.username = username;
        this.apiKey = apiKey;
        this.baseUrl = 'https://retroachievements.org/API';
    }

    /**
     * Get game information by ID
     */
    async getGameInfo(gameId) {
        try {
            console.log(`Fetching game info for game ${gameId}`);
            
            const response = await axios.get(`${this.baseUrl}/GetGame.php`, {
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

    /**
     * Get extended game information including rich presence and other metadata
     */
    async getGameInfoExtended(gameId) {
        try {
            console.log(`Fetching extended game info for game ${gameId}`);
            
            const response = await axios.get(`${this.baseUrl}/GetGameExtended.php`, {
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

    /**
     * Search for games by name
     */
    async searchGame(searchTerm) {
        try {
            console.log(`Searching for game: ${searchTerm}`);
            const response = await axios.get(`${this.baseUrl}/GetGameList.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    f: searchTerm,
                    h: 1  // Return metadata
                },
            });
            
            if (!response.data) {
                throw new Error(`No search results for "${searchTerm}"`);
            }

            console.log(`Found ${Object.keys(response.data).length} results`);
            
            // Convert the object response to an array of games
            const games = Object.entries(response.data).map(([id, game]) => ({
                gameId: id,
                title: game.Title,
                consoleId: game.ConsoleID,
                consoleName: game.ConsoleName,
                imageIcon: game.ImageIcon,
                numAchievements: game.NumAchievements
            }));

            return games;
        } catch (error) {
            console.error('Error searching for game:', error);
            throw error;
        }
    }

    /**
     * Get user's progress for a specific game
     */
    async getUserProgress(raUsername, gameId) {
        try {
            console.log(`Fetching progress for ${raUsername} in game ${gameId}`);
            const response = await axios.get(`${this.baseUrl}/GetGameInfoAndUserProgress.php`, {
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

    /**
     * Get user's recent achievements
     */
    async getUserRecentAchievements(raUsername, count = 50) {
        try {
            console.log(`Fetching recent achievements for ${raUsername}`);
            const response = await axios.get(`${this.baseUrl}/GetUserRecentAchievements.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    u: raUsername,
                    c: count
                },
            });
            
            if (!response.data) {
                throw new Error(`No achievements data received for user ${raUsername}`);
            }

            console.log(`Found ${response.data.length} recent achievements for ${raUsername}`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching recent achievements for ${raUsername}:`, error);
            throw error;
        }
    }

    /**
     * Get user's completed games
     */
    async getUserCompletedGames(raUsername) {
        try {
            console.log(`Fetching completed games for ${raUsername}`);
            const response = await axios.get(`${this.baseUrl}/GetUserCompletedGames.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    u: raUsername
                },
            });
            
            if (!response.data) {
                throw new Error(`No completed games data received for user ${raUsername}`);
            }

            return response.data;
        } catch (error) {
            console.error(`Error fetching completed games for ${raUsername}:`, error);
            throw error;
        }
    }

    /**
     * Get user's summary information
     */
    async getUserSummary(raUsername) {
        try {
            console.log(`Fetching user summary for ${raUsername}`);
            const response = await axios.get(`${this.baseUrl}/GetUserSummary.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    u: raUsername
                },
            });
            
            if (!response.data) {
                throw new Error(`No summary data received for user ${raUsername}`);
            }

            return response.data;
        } catch (error) {
            console.error(`Error fetching user summary for ${raUsername}:`, error);
            throw error;
        }
    }

    /**
     * Get game's achievement distribution
     */
    async getGameAchievementDistribution(gameId) {
        try {
            console.log(`Fetching achievement distribution for game ${gameId}`);
            const response = await axios.get(`${this.baseUrl}/GetAchievementDistribution.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    i: gameId
                },
            });
            
            if (!response.data) {
                throw new Error(`No achievement distribution data received for game ${gameId}`);
            }

            return response.data;
        } catch (error) {
            console.error(`Error fetching achievement distribution for game ${gameId}:`, error);
            throw error;
        }
    }
}

module.exports = RetroAchievementsAPI;
