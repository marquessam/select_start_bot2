import { buildAuthorization, getGame, getGameExtended, getUserProfile, getUserRecentAchievements, 
    getUserSummary, getGameInfoAndUserProgress } from '@retroachievements/api';
import { config } from '../config/config.js';

class RetroAchievementsService {
    constructor() {
        this.authorization = buildAuthorization({
            username: process.env.RA_USERNAME,
            webApiKey: config.retroAchievements.apiKey
        });
    }

    /**
     * Get user's progress for a specific game
     * @param {string} username - RetroAchievements username
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} User's progress data
     */
    async getUserGameProgress(username, gameId) {
        try {
            const progress = await getGameInfoAndUserProgress(this.authorization, {
                username,
                gameId: parseInt(gameId)
            });

            return progress;
        } catch (error) {
            console.error(`Error fetching game progress for ${username} in game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get all achievements for a game
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} Game data including achievements
     */
    async getGameAchievements(gameId) {
        try {
            const game = await getGameExtended(this.authorization, {
                gameId: parseInt(gameId)
            });

            return game.achievements;
        } catch (error) {
            console.error(`Error fetching achievements for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get user's recently earned achievements
     * @param {string} username - RetroAchievements username
     * @param {number} count - Number of achievements to fetch (default: 50)
     * @returns {Promise<Array>} Array of recent achievements
     */
    async getUserRecentAchievements(username, count = 50) {
        try {
            const achievements = await getUserRecentAchievements(this.authorization, {
                username,
                count
            });

            return achievements;
        } catch (error) {
            console.error(`Error fetching recent achievements for ${username}:`, error);
            throw error;
        }
    }

    /**
     * Get game information
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Object>} Game information
     */
    async getGameInfo(gameId) {
        try {
            const game = await getGame(this.authorization, {
                gameId: parseInt(gameId)
            });

            return game;
        } catch (error) {
            console.error(`Error fetching game info for ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get user information
     * @param {string} username - RetroAchievements username
     * @returns {Promise<Object>} User information
     */
    async getUserInfo(username) {
        try {
            const user = await getUserSummary(this.authorization, {
                username
            });

            return user;
        } catch (error) {
            console.error(`Error fetching user info for ${username}:`, error);
            throw error;
        }
    }

    /**
     * Get user profile information
     * @param {string} username - RetroAchievements username
     * @returns {Promise<Object>} User profile information
     */
    async getUserProfile(username) {
        try {
            const profile = await getUserProfile(this.authorization, {
                username
            });

            return profile;
        } catch (error) {
            console.error(`Error fetching profile for ${username}:`, error);
            throw error;
        }
    }

    /**
     * Validate that a user exists
     * @param {string} username - RetroAchievements username
     * @returns {Promise<boolean>} Whether the user exists
     */
    async validateUser(username) {
        try {
            await this.getUserProfile(username);
            return true;
        } catch (error) {
            return false;
        }
    }
}

// Create and export a singleton instance
const retroAPI = new RetroAchievementsService();
export default retroAPI;
