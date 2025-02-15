import { buildAuthorization, getGame, getGameExtended, getUserProfile, getUserRecentAchievements, 
    getUserSummary, getGameInfoAndUserProgress, getGameRankAndScore, getUserCompletedGames,
    getUserAwards, getGameList, getConsoleIds } from '@retroachievements/api';
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
     * Get user information including profile image and stats
     * @param {string} username - RetroAchievements username
     * @returns {Promise<Object>} User information
     */
    async getUserInfo(username) {
        try {
            const [summary, profile, awards] = await Promise.all([
                getUserSummary(this.authorization, { username }),
                getUserProfile(this.authorization, { username }),
                getUserAwards(this.authorization, { username })
            ]);

            return {
                ...summary,
                ...profile,
                awards,
                profileImageUrl: `https://retroachievements.org${profile.userPic}`
            };
        } catch (error) {
            console.error(`Error fetching user info for ${username}:`, error);
            throw error;
        }
    }

    /**
     * Get game leaderboard rankings
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Array>} Leaderboard entries
     */
    async getGameRankAndScore(gameId) {
        try {
            const rankings = await getGameRankAndScore(this.authorization, {
                gameId: parseInt(gameId),
                type: 'score' // or 'hardcore' based on your needs
            });

            return rankings;
        } catch (error) {
            console.error(`Error fetching rankings for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of games for a console
     * @param {number} consoleId - RetroAchievements console ID
     * @returns {Promise<Array>} List of games
     */
    async getConsoleGames(consoleId) {
        try {
            const games = await getGameList(this.authorization, {
                consoleId: parseInt(consoleId)
            });

            return games;
        } catch (error) {
            console.error(`Error fetching games for console ${consoleId}:`, error);
            throw error;
        }
    }

    /**
     * Get list of all consoles
     * @returns {Promise<Array>} List of consoles
     */
    async getConsoles() {
        try {
            const consoles = await getConsoleIds(this.authorization);
            return consoles;
        } catch (error) {
            console.error('Error fetching console list:', error);
            throw error;
        }
    }

    /**
     * Get user's completed games
     * @param {string} username - RetroAchievements username
     * @returns {Promise<Array>} List of completed games
     */
    async getUserCompletedGames(username) {
        try {
            const completed = await getUserCompletedGames(this.authorization, {
                username
            });

            return completed;
        } catch (error) {
            console.error(`Error fetching completed games for ${username}:`, error);
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
