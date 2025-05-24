// src/services/enhancedRetroAPI.js

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
            const url = new URL(`${this.baseURL}/API_GetGame.php`);
            url.searchParams.append('z', this.username);
            url.searchParams.append('y', this.apiKey);
            url.searchParams.append('i', gameId);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'User-Agent': 'RetroBot/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (!data) {
                throw new Error('No data received from API');
            }

            // Transform the API response to our standard format
            const gameData = {
                id: gameId,
                title: data.title || data.gameTitle,
                consoleName: data.consoleName || data.console,
                consoleId: data.consoleId,
                publisher: data.publisher,
                developer: data.developer,
                genre: data.genre,
                released: data.released,
                releasedAtGranularity: data.releasedAtGranularity,
                imageIcon: data.imageIcon || data.gameIcon,
                imageTitle: data.imageTitle,
                imageIngame: data.imageIngame,
                imageBoxArt: data.imageBoxArt,
                forumTopicId: data.forumTopicId,
                flags: data.flags
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
            const url = new URL(`${this.baseURL}/API_GetGameInfoAndUserProgress.php`);
            url.searchParams.append('z', this.username);
            url.searchParams.append('y', this.apiKey);
            url.searchParams.append('g', gameId);
            url.searchParams.append('u', this.username);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'User-Agent': 'RetroBot/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (!data) {
                throw new Error('No data received from fallback API');
            }

            // Transform basic response
            return {
                id: gameId,
                title: data.Title,
                consoleName: data.ConsoleName,
                consoleId: data.ConsoleID,
                publisher: null, // Not available in basic API
                developer: null, // Not available in basic API
                genre: null, // Not available in basic API
                released: null, // Not available in basic API
                imageIcon: data.ImageIcon,
                imageTitle: data.ImageTitle,
                imageIngame: data.ImageIngame,
                imageBoxArt: data.ImageBoxArt
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
            const url = new URL(`${this.baseURL}/API_GetGameInfoAndUserProgress.php`);
            url.searchParams.append('z', this.username);
            url.searchParams.append('y', this.apiKey);
            url.searchParams.append('g', gameId);
            url.searchParams.append('u', this.username);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'User-Agent': 'RetroBot/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (!data || !data.Achievements) {
                return 0;
            }

            return Object.keys(data.Achievements).length;

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
     * Get console information
     */
    async getConsoleList() {
        try {
            const url = new URL(`${this.baseURL}/API_GetConsoleIDs.php`);
            url.searchParams.append('z', this.username);
            url.searchParams.append('y', this.apiKey);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'User-Agent': 'RetroBot/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data || [];
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
            const url = new URL(`${this.baseURL}/API_GetUserSummary.php`);
            url.searchParams.append('z', this.username);
            url.searchParams.append('y', this.apiKey);
            url.searchParams.append('u', this.username);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'User-Agent': 'RetroBot/1.0'
                }
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            return !!data && !!data.User;
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
