import { Game } from '../models/index.js';

/**
 * Game Configuration Helper
 * Provides a simplified interface for setting up monthly and shadow games
 */
class GameConfig {
    /**
     * Create a new monthly game configuration
     * @param {Object} config Game configuration object
     * @param {string} config.gameId RetroAchievements game ID
     * @param {string} config.title Game title
     * @param {number} config.month Month number (1-12)
     * @param {number} config.year Year
     * @param {Object} config.requirements Achievement requirements
     * @param {string[]} config.requirements.progression Achievement IDs for progression (optional)
     * @param {string[]} config.requirements.completion Achievement IDs needed to beat the game
     * @param {boolean} config.requirements.requireAllCompletion Whether all completion achievements are needed
     * @param {boolean} config.requirements.allowMastery Whether mastery is available for this game
     * @returns {Promise<Game>} Created game document
     */
    static async createMonthlyGame(config) {
        const {
            gameId,
            title,
            month,
            year,
            requirements
        } = config;

        // Validate month and year
        const now = new Date();
        const gameMonth = new Date(year, month - 1);
        const currentMonth = new Date(now.getFullYear(), now.getMonth());
        
        if (gameMonth < currentMonth) {
            throw new Error('Cannot create games for past months');
        }

        // Create game document
        const game = new Game({
            gameId: gameId.toString(),
            title,
            type: 'MONTHLY',
            month,
            year,
            progression: requirements.progression || [],
            winCondition: requirements.completion,
            requireProgression: requirements.progression?.length > 0,
            requireAllWinConditions: requirements.requireAllCompletion,
            masteryCheck: requirements.allowMastery,
            active: gameMonth.getTime() === currentMonth.getTime() // Only activate if it's current month
        });

        await game.save();
        return game;
    }

    /**
     * Create a new shadow game configuration
     * @param {Object} config Game configuration object
     * @param {string} config.gameId RetroAchievements game ID
     * @param {string} config.title Game title
     * @param {number} config.month Month number (1-12)
     * @param {number} config.year Year
     * @param {Object} config.requirements Achievement requirements
     * @param {string[]} config.requirements.progression Achievement IDs for progression (optional)
     * @param {string[]} config.requirements.completion Achievement IDs needed to beat the game
     * @param {boolean} config.requirements.requireAllCompletion Whether all completion achievements are needed
     * @param {Object} config.meta Meta challenge configuration
     * @param {Array} config.meta.conditions Array of condition objects
     * @param {string} config.meta.description Meta challenge description
     * @returns {Promise<Game>} Created game document
     */
    static async createShadowGame(config) {
        const {
            gameId,
            title,
            month,
            year,
            requirements,
            meta
        } = config;

        // Validate month and year
        const now = new Date();
        const gameMonth = new Date(year, month - 1);
        const currentMonth = new Date(now.getFullYear(), now.getMonth());
        
        if (gameMonth < currentMonth) {
            throw new Error('Cannot create games for past months');
        }

        // Create game document
        const game = new Game({
            gameId: gameId.toString(),
            title,
            type: 'SHADOW',
            month,
            year,
            progression: requirements.progression || [],
            winCondition: requirements.completion,
            requireProgression: requirements.progression?.length > 0,
            requireAllWinConditions: requirements.requireAllCompletion,
            active: false, // Shadow games start inactive
            meta: {
                pieces: meta.conditions.map(c => c.id),
                description: meta.description,
                revealed: false
            }
        });

        await game.save();
        return game;
    }

    /**
     * Example usage:
     * 
     * // Create a monthly game
     * await GameConfig.createMonthlyGame({
     *     gameId: "12345",
     *     title: "Chrono Trigger",
     *     month: 1,
     *     year: 2025,
     *     requirements: {
     *         progression: ["1234", "5678"], // Optional progression achievements
     *         completion: ["91011", "121314"], // Required completion achievements
     *         requireAllCompletion: true, // Need all completion achievements
     *         allowMastery: true // Allow mastery awards
     *     }
     * });
     * 
     * // Create a shadow game
     * await GameConfig.createShadowGame({
     *     gameId: "67890",
     *     title: "Secret Game",
     *     month: 1,
     *     year: 2025,
     *     requirements: {
     *         completion: ["12345"], // Single achievement needed to beat
     *         requireAllCompletion: false // Only need one completion achievement
     *     },
     *     meta: {
     *         conditions: [
     *             { id: "piece1", type: "EXACT_MATCH", value: "1955" },
     *             { id: "piece2", type: "REGEX", value: "^courage$" }
     *         ],
     *         description: "Fix the timeline by finding the correct years"
     *     }
     * });
     */
}

export default GameConfig;
