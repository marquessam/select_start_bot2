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
            // Use API_GetGameExtended.php instead of API_GetGame.php to get release dates
            const url = new URL(`${this.baseURL}/API_GetGameExtended.php`);
            url.searchParams.append('z', this.username);
            url.searchParams.append('y', this.apiKey);
            url.searchParams.append('i', gameId);
            url.searchParams.append('f', '3'); // Standard achievements only

            console.log(`🔍 Fetching extended game details for ID ${gameId} from: ${url.toString()}`);

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

            // DEBUG: Log the raw API response to see all available fields
            console.log(`📊 Raw API_GetGameExtended response for game ${gameId}:`, JSON.stringify(data, null, 2));

            // Transform the API response to our standard format
            const gameData = {
                id: gameId,
                title: data.title || data.Title,
                consoleName: data.consoleName || data.ConsoleName,
                consoleId: data.consoleId || data.ConsoleID,
                publisher: data.publisher || data.Publisher,
                developer: data.developer || data.Developer,
                genre: data.genre || data.Genre,
                // Use the proper field name from the API documentation
                released: data.Released || data.released,
                releasedAtGranularity: data.ReleasedAtGranularity || data.releasedAtGranularity,
                imageIcon: data.imageIcon || data.ImageIcon,
                imageTitle: data.imageTitle || data.ImageTitle,
                imageIngame: data.imageIngame || data.ImageIngame,
                imageBoxArt: data.imageBoxArt || data.ImageBoxArt,
                forumTopicId: data.forumTopicId,
                flags: data.flags,
                isFinal: data.isFinal,
                numAchievements: data.numAchievements
            };

            // DEBUG: Log what we extracted
            console.log(`🎮 Processed game data for ${gameData.title}:`);
            console.log(`   Released: "${gameData.released}" (type: ${typeof gameData.released})`);
            console.log(`   Publisher: "${gameData.publisher}"`);
            console.log(`   Developer: "${gameData.developer}"`);
            console.log(`   Genre: "${gameData.genre}"`);

            // Validate essential fields
            if (!gameData.title || !gameData.consoleName) {
                throw new Error('Incomplete game data received from API');
            }

            return gameData;

        } catch (error) {
            console.error(`❌ Error fetching detailed game info for gameId ${gameId}:`, error);
            
            // If the enhanced API fails, try to fall back to basic info
            try {
                console.log(`🔄 Falling back to basic API for game ${gameId}`);
                return await this.getBasicGameInfo(gameId);
            } catch (fallbackError) {
                console.error(`❌ Fallback API also failed for gameId ${gameId}:`, fallbackError);
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

            console.log(`🔍 Fetching basic game info for ID ${gameId} from: ${url.toString()}`);

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

            // DEBUG: Log the fallback API response
            console.log(`📊 Fallback API response for game ${gameId}:`, JSON.stringify(data, null, 2));

            // Transform basic response
            const gameData = {
                id: gameId,
                title: data.Title,
                consoleName: data.ConsoleName,
                consoleId: data.ConsoleID,
                publisher: data.Publisher || null,
                developer: data.Developer || null,
                genre: data.Genre || null,
                // Try to get release date from basic API too
                released: data.Released || data.released || data.ReleaseDate || data.releaseDate || null,
                imageIcon: data.ImageIcon,
                imageTitle: data.ImageTitle,
                imageIngame: data.ImageIngame,
                imageBoxArt: data.ImageBoxArt
            };

            console.log(`🎮 Fallback processed game data for ${gameData.title}:`);
            console.log(`   Released: "${gameData.released}" (type: ${typeof gameData.released})`);

            return gameData;

        } catch (error) {
            console.error(`❌ Fallback API failed for gameId ${gameId}:`, error);
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
     * Test a specific game to debug its data
     */
    async debugGameData(gameId) {
        console.log(`🔧 DEBUG: Testing multiple API endpoints for game ${gameId}`);
        
        // Test API_GetGameExtended.php (the correct one for release dates)
        try {
            const extendedUrl = new URL(`${this.baseURL}/API_GetGameExtended.php`);
            extendedUrl.searchParams.append('z', this.username);
            extendedUrl.searchParams.append('y', this.apiKey);
            extendedUrl.searchParams.append('i', gameId);
            extendedUrl.searchParams.append('f', '3');

            const extendedResponse = await fetch(extendedUrl.toString());
            const extendedData = await extendedResponse.json();
            
            console.log('📊 API_GetGameExtended.php response:', JSON.stringify(extendedData, null, 2));
        } catch (error) {
            console.error('❌ API_GetGameExtended.php failed:', error);
        }

        // Test API_GetGame.php (the old one we were using)
        try {
            const gameUrl = new URL(`${this.baseURL}/API_GetGame.php`);
            gameUrl.searchParams.append('z', this.username);
            gameUrl.searchParams.append('y', this.apiKey);
            gameUrl.searchParams.append('i', gameId);

            const gameResponse = await fetch(gameUrl.toString());
            const gameData = await gameResponse.json();
            
            console.log('📊 API_GetGame.php response:', JSON.stringify(gameData, null, 2));
        } catch (error) {
            console.error('❌ API_GetGame.php failed:', error);
        }

        // Test API_GetGameInfoAndUserProgress.php
        try {
            const progressUrl = new URL(`${this.baseURL}/API_GetGameInfoAndUserProgress.php`);
            progressUrl.searchParams.append('z', this.username);
            progressUrl.searchParams.append('y', this.apiKey);
            progressUrl.searchParams.append('g', gameId);
            progressUrl.searchParams.append('u', this.username);

            const progressResponse = await fetch(progressUrl.toString());
            const progressData = await progressResponse.json();
            
            console.log('📊 API_GetGameInfoAndUserProgress.php response:', JSON.stringify(progressData, null, 2));
        } catch (error) {
            console.error('❌ API_GetGameInfoAndUserProgress.php failed:', error);
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
            nintendo: [355, 3, 2], // SNES/NES/N64 games (355 is Link to the Past)
            
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
            puzzle: [14406], // Known puzzle game
            
            // Different years
            retro: [355], // 1991 - A Link to the Past
            modern: [14402] // More recent game
        };
    }

    /**
     * Parse release date from various formats
     */
    parseReleaseDate(released) {
        if (!released) return null;
        
        try {
            // Handle different date formats
            if (typeof released === 'string') {
                // Format: "1992-06-02 00:00:00" or "1992-06-02"
                const datePart = released.split(' ')[0];
                const [year, month, day] = datePart.split('-').map(Number);
                
                if (year && !isNaN(year)) {
                    return {
                        year,
                        month: month || 1,
                        day: day || 1,
                        full: new Date(year, (month || 1) - 1, day || 1)
                    };
                }
            }
        } catch (error) {
            console.error('Error parsing release date:', released, error);
        }
        
        return null;
    }

    /**
     * Get games by console
     */
    async getGamesByConsole(consoleId, offset = 0, count = 100) {
        try {
            const url = new URL(`${this.baseURL}/API_GetGameList.php`);
            url.searchParams.append('z', this.username);
            url.searchParams.append('y', this.apiKey);
            url.searchParams.append('i', consoleId);
            url.searchParams.append('o', offset);
            url.searchParams.append('c', count);

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
            console.error(`Error fetching games for console ${consoleId}:`, error);
            return [];
        }
    }

    /**
     * Search for games by title
     */
    async searchGames(searchTerm, maxResults = 10) {
        try {
            // This might need to be implemented differently based on available API endpoints
            // For now, this is a placeholder
            console.log(`Searching for games with term: ${searchTerm}`);
            
            // Would need to implement actual search logic here
            // RetroAchievements API might not have a direct search endpoint
            
            return [];
        } catch (error) {
            console.error(`Error searching for games with term "${searchTerm}":`, error);
            return [];
        }
    }
}

// Create singleton instance
const enhancedRetroAPI = new EnhancedRetroAPI();

// Export both the instance and the class
export default enhancedRetroAPI;
export { EnhancedRetroAPI };
