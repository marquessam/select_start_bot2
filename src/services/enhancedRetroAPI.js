// src/services/enhancedRetroAPI.js

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class EnhancedRetroAPI {
    constructor() {
        this.baseURL = 'https://retroachievements.org/API';
        this.username = process.env.RA_USERNAME;
        this.apiKey = process.env.RA_API_KEY;
        
        if (!this.username || !this.apiKey) {
            console.warn('RA_USERNAME or RA_API_KEY not set in environment variables');
        }
    }

    /**
     * Get detailed game information including publisher, developer, genre, etc.
     */
    async getGameDetails(gameId) {
        try {
            const response = await axios.get(`${this.baseURL}/API_GetGame.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    i: gameId
                },
                timeout: 10000
            });

            if (!response.data) {
                throw new Error('No data received from API');
            }

            // Transform the API response to our standard format
            const gameData = {
                id: gameId,
                title: response.data.title || response.data.gameTitle,
                consoleName: response.data.consoleName || response.data.console,
                consoleId: response.data.consoleId,
                publisher: response.data.publisher,
                developer: response.data.developer,
                genre: response.data.genre,
                released: response.data.released,
                releasedAtGranularity: response.data.releasedAtGranularity,
                imageIcon: response.data.imageIcon || response.data.gameIcon,
                imageTitle: response.data.imageTitle,
                imageIngame: response.data.imageIngame,
                imageBoxArt: response.data.imageBoxArt,
                forumTopicId: response.data.forumTopicId,
                flags: response.data.flags
            };

            // Validate essential fields
            if (!gameData.title || !gameData.consoleName) {
                throw new Error('Incomplete game data received from API');
            }

            return gameData;

        } catch (error) {
            console.error(`Error fetching detailed game info for gameId ${gameId}:`, error);
            
            // If the enhanced API fails, try to fall back to basic info
            try {
                return await this.getBasicGameInfo(gameId);
            } catch (fallbackError) {
                console.error(`Fallback API also failed for gameId ${gameId}:`, fallbackError);
                throw new Error(`Unable to retrieve game information for ID ${gameId}`);
            }
        }
    }

    /**
     * Fallback method using the original API endpoint
     */
    async getBasicGameInfo(gameId) {
        try {
            const response = await axios.get(`${this.baseURL}/API_GetGameInfoAndUserProgress.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    g: gameId,
                    u: this.username
                },
                timeout: 10000
            });

            if (!response.data) {
                throw new Error('No data received from fallback API');
            }

            // Transform basic response
            return {
                id: gameId,
                title: response.data.Title,
                consoleName: response.data.ConsoleName,
                consoleId: response.data.ConsoleID,
                publisher: null, // Not available in basic API
                developer: null, // Not available in basic API
                genre: null, // Not available in basic API
                released: null, // Not available in basic API
                imageIcon: response.data.ImageIcon,
                imageTitle: response.data.ImageTitle,
                imageIngame: response.data.ImageIngame,
                imageBoxArt: response.data.ImageBoxArt
            };

        } catch (error) {
            console.error(`Fallback API failed for gameId ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get game achievement count (existing method)
     */
    async getGameAchievementCount(gameId) {
        try {
            const response = await axios.get(`${this.baseURL}/API_GetGameInfoAndUserProgress.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    g: gameId,
                    u: this.username
                },
                timeout: 10000
            });

            if (!response.data || !response.data.Achievements) {
                return 0;
            }

            return Object.keys(response.data.Achievements).length;

        } catch (error) {
            console.error(`Error fetching achievement count for gameId ${gameId}:`, error);
            return 0;
        }
    }

    /**
     * Batch fetch multiple games (for testing or bulk operations)
     */
    async getMultipleGameDetails(gameIds, batchSize = 5) {
        const results = [];
        const errors = [];

        // Process in batches to avoid rate limiting
        for (let i = 0; i < gameIds.length; i += batchSize) {
            const batch = gameIds.slice(i, i + batchSize);
            const batchPromises = batch.map(async (gameId) => {
                try {
                    const gameData = await this.getGameDetails(gameId);
                    return { gameId, data: gameData, success: true };
                } catch (error) {
                    return { gameId, error: error.message, success: false };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            
            batchResults.forEach(result => {
                if (result.success) {
                    results.push(result.data);
                } else {
                    errors.push({ gameId: result.gameId, error: result.error });
                }
            });

            // Add delay between batches
            if (i + batchSize < gameIds.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return { results, errors };
    }

    /**
     * Test game against restriction rules
     */
    async testGameRestrictions(gameId, rules) {
        try {
            const gameData = await this.getGameDetails(gameId);
            const { RestrictionRuleEngine } = await import('../config/consoleGroups.js');
            
            const passes = RestrictionRuleEngine.evaluateGame(gameData, rules);
            
            return {
                gameData,
                passes,
                rules
            };
        } catch (error) {
            console.error(`Error testing game ${gameId} against restrictions:`, error);
            throw error;
        }
    }

    /**
     * Search for games by various criteria (if API supports it)
     */
    async searchGames(criteria) {
        // This would use a search endpoint if available
        // For now, return empty as most RA APIs don't support search
        console.warn('Game search not implemented - RetroAchievements API limitation');
        return [];
    }

    /**
     * Get console information
     */
    async getConsoleList() {
        try {
            const response = await axios.get(`${this.baseURL}/API_GetConsoleIDs.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey
                },
                timeout: 10000
            });

            return response.data || [];
        } catch (error) {
            console.error('Error fetching console list:', error);
            return [];
        }
    }

    /**
     * Validate API credentials
     */
    async validateCredentials() {
        try {
            const response = await axios.get(`${this.baseURL}/API_GetUserSummary.php`, {
                params: {
                    z: this.username,
                    y: this.apiKey,
                    u: this.username
                },
                timeout: 5000
            });

            return !!response.data && !!response.data.User;
        } catch (error) {
            console.error('API credential validation failed:', error);
            return false;
        }
    }

    /**
     * Get example games for testing restrictions
     */
    getTestGameIds() {
        return {
            // SEGA games
            sega: [1, 10, 11], // Genesis/Saturn/Dreamcast games
            
            // Nintendo games  
            nintendo: [7, 3, 2], // NES/SNES/N64 games
            
            // Sony games
            sony: [12, 21], // PlayStation games
            
            // Handheld games
            handheld: [4, 6, 13], // Game Boy games
            
            // Different publishers
            capcom: [14402], // Known Capcom game
            konami: [14403], // Known Konami game
            
            // Different genres
            rpg: [14404], // Known RPG
            action: [14405], // Known action game
            puzzle: [14406] // Known puzzle game
        };
    }
}

// Create singleton instance
const enhancedRetroAPI = new EnhancedRetroAPI();

// Export both the instance and the class
export default enhancedRetroAPI;
export { EnhancedRetroAPI };
