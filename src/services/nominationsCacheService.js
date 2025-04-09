// src/services/nominationsCacheService.js
import { User } from '../models/User.js';
import retroAPI from './retroAPI.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');

class NominationsCacheService {
    constructor() {
        this.cache = {
            nominations: {
                data: null,
                lastUpdated: null
            },
            updateInterval: 10 * 60 * 1000, // 10 minutes in milliseconds
        };
        this.isUpdating = false;
        
        // Ensure cache directory exists
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
    }

    /**
     * Initialize the nominations cache service
     */
    async initialize() {
        console.log('Initializing nominations cache service...');
        
        // Try to load cached data from disk
        this.loadFromDisk();
        
        // Perform initial update
        await this.updateNominations();
        
        // Set up periodic updates
        setInterval(() => this.updateNominations(), this.cache.updateInterval);
        
        console.log('Nominations cache service initialized.');
    }
    
    /**
     * Update the nominations data
     */
    async updateNominations() {
        if (this.isUpdating) {
            console.log('Nominations update already in progress, skipping...');
            return;
        }
        
        this.isUpdating = true;
        
        try {
            console.log('Updating nominations...');
            
            // Get all users
            const users = await User.find({});
            
            // Get current month/year
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            // Build nominations list
            const nominations = [];
            const nominationsByGame = new Map();
            
            for (const user of users) {
                // Get current nominations
                const userNominations = user.nominations.filter(nom => {
                    const nomMonth = nom.nominatedAt.getMonth();
                    const nomYear = nom.nominatedAt.getFullYear();
                    return nomMonth === currentMonth && nomYear === currentYear;
                });
                
                for (const nomination of userNominations) {
                    // Try to get additional game info if not already present
                    let gameInfo = {
                        gameId: nomination.gameId,
                        gameTitle: nomination.gameTitle || 'Unknown Game',
                        consoleName: nomination.consoleName || 'Unknown Console'
                    };
                    
                    // Fetch game info from API if needed
                    if (!nomination.gameTitle || !nomination.consoleName) {
                        try {
                            const fetchedGameInfo = await retroAPI.getGameInfo(nomination.gameId);
                            if (fetchedGameInfo) {
                                gameInfo.gameTitle = fetchedGameInfo.title || gameInfo.gameTitle;
                                gameInfo.consoleName = fetchedGameInfo.consoleName || gameInfo.consoleName;
                            }
                        } catch (error) {
                            console.error(`Error fetching game info for ${nomination.gameId}:`, error);
                        }
                    }
                    
                    // Add to nominations list
                    nominations.push({
                        username: user.raUsername,
                        gameId: nomination.gameId,
                        gameTitle: gameInfo.gameTitle,
                        consoleName: gameInfo.consoleName,
                        nominatedAt: nomination.nominatedAt
                    });
                    
                    // Track games for popularity counting
                    if (!nominationsByGame.has(nomination.gameId)) {
                        nominationsByGame.set(nomination.gameId, {
                            gameId: nomination.gameId,
                            gameTitle: gameInfo.gameTitle,
                            consoleName: gameInfo.consoleName,
                            count: 0,
                            nominatedBy: []
                        });
                    }
                    
                    const gameNomination = nominationsByGame.get(nomination.gameId);
                    gameNomination.count++;
                    if (!gameNomination.nominatedBy.includes(user.raUsername)) {
                        gameNomination.nominatedBy.push(user.raUsername);
                    }
                }
            }
            
            // Convert map to array and sort by popularity
            const gamesList = Array.from(nominationsByGame.values())
                .sort((a, b) => b.count - a.count);
            
            // Update cache
            this.cache.nominations.data = {
                nominations,
                gamesList,
                monthYear: `${now.toLocaleString('default', { month: 'long' })} ${currentYear}`,
                lastUpdated: new Date().toISOString()
            };
            
            this.cache.nominations.lastUpdated = Date.now();
            
            // Save to disk
            this.saveToDisk();
            
            console.log(`Nominations updated with ${nominations.length} entries for ${gamesList.length} games.`);
        } catch (error) {
            console.error('Error updating nominations:', error);
        } finally {
            this.isUpdating = false;
        }
    }
    
    /**
     * Save cache to disk
     */
    saveToDisk() {
        try {
            // Save nominations
            if (this.cache.nominations.data) {
                fs.writeFileSync(
                    path.join(CACHE_DIR, 'nominations.json'),
                    JSON.stringify(this.cache.nominations.data, null, 2)
                );
            }
            
            console.log('Nominations cache saved to disk.');
        } catch (error) {
            console.error('Error saving nominations cache to disk:', error);
        }
    }
    
    /**
     * Load cache from disk
     */
    loadFromDisk() {
        try {
            // Load nominations
            const nominationsPath = path.join(CACHE_DIR, 'nominations.json');
            if (fs.existsSync(nominationsPath)) {
                const data = JSON.parse(fs.readFileSync(nominationsPath, 'utf8'));
                this.cache.nominations.data = data;
                this.cache.nominations.lastUpdated = new Date(data.lastUpdated).getTime();
                console.log('Loaded nominations from disk.');
            }
        } catch (error) {
            console.error('Error loading nominations cache from disk:', error);
        }
    }
    
    /**
     * Get the nominations
     */
    getNominations() {
        return this.cache.nominations.data;
    }
    
    /**
     * Force an update of the nominations
     */
    async forceUpdate() {
        console.log('Forcing nominations update...');
        await this.updateNominations();
        return this.cache.nominations.data;
    }
}

// Create singleton instance
const nominationsCacheService = new NominationsCacheService();
export default nominationsCacheService;
