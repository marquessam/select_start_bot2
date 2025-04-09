// src/services/leaderboardCacheService.js
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');

class LeaderboardCacheService {
    constructor() {
        this.cache = {
            monthly: {
                data: null,
                lastUpdated: null
            },
            yearly: {
                data: null,
                lastUpdated: null
            },
            updateInterval: 15 * 60 * 1000, // 15 minutes in milliseconds
            currentYear: new Date().getFullYear()
        };
        this.isUpdating = false;
        
        // Ensure cache directory exists
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
    }

    /**
     * Initialize the leaderboard cache service
     */
    async initialize() {
        console.log('Initializing leaderboard cache service...');
        
        // Try to load cached data from disk
        this.loadFromDisk();
        
        // Perform initial update
        await this.updateLeaderboards();
        
        // Set up periodic updates
        setInterval(() => this.updateLeaderboards(), this.cache.updateInterval);
        
        console.log('Leaderboard cache service initialized.');
    }
    
    /**
     * Update the leaderboard data
     */
    async updateLeaderboards() {
        if (this.isUpdating) {
            console.log('Leaderboard update already in progress, skipping...');
            return;
        }
        
        this.isUpdating = true;
        
        try {
            console.log('Updating leaderboards...');
            
            // Update monthly leaderboard
            await this.updateMonthlyLeaderboard();
            
            // Update yearly leaderboard
            await this.updateYearlyLeaderboard();
            
            // Save to disk
            this.saveToDisk();
            
            console.log('Leaderboards updated successfully.');
        } catch (error) {
            console.error('Error updating leaderboards:', error);
        } finally {
            this.isUpdating = false;
        }
    }
    
    /**
     * Update the monthly leaderboard
     */
    async updateMonthlyLeaderboard() {
        try {
            // Get current month's challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });
            
            if (!currentChallenge) {
                console.log('No current challenge found.');
                return;
            }
            
            // Get all users
            const users = await User.find({});
            
            // Get the month key
            const monthKey = User.formatDateKey(currentChallenge.date);
            
            // Build leaderboard
            const leaderboard = [];
            
            for (const user of users) {
                // Get monthly points
                const monthlyPoints = user.monthlyChallenges.get(monthKey)?.progress || 0;
                
                // Get shadow points if revealed
                let shadowPoints = 0;
                if (currentChallenge.shadow_challange_revealed) {
                    shadowPoints = user.shadowChallenges.get(monthKey)?.progress || 0;
                }
                
                // Get game progress data if available
                let monthlyProgress = null;
                let shadowProgress = null;
                
                try {
                    // Add game progress data
                    if (currentChallenge.monthly_challange_gameid) {
                        monthlyProgress = await retroAPI.getUserGameProgress(
                            user.raUsername,
                            currentChallenge.monthly_challange_gameid
                        );
                    }
                    
                    if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                        shadowProgress = await retroAPI.getUserGameProgress(
                            user.raUsername,
                            currentChallenge.shadow_challange_gameid
                        );
                    }
                } catch (error) {
                    console.error(`Error fetching game progress for ${user.raUsername}:`, error);
                }
                
                // Add to leaderboard
                leaderboard.push({
                    username: user.raUsername,
                    discordId: user.discordId,
                    monthlyPoints,
                    shadowPoints,
                    totalPoints: monthlyPoints + shadowPoints,
                    monthlyProgress: monthlyProgress ? {
                        completion: monthlyProgress.numAwardedToUser,
                        total: currentChallenge.monthly_challange_game_total,
                        percentage: monthlyProgress.numAwardedToUser / currentChallenge.monthly_challange_game_total * 100
                    } : null,
                    shadowProgress: shadowProgress ? {
                        completion: shadowProgress.numAwardedToUser,
                        total: currentChallenge.shadow_challange_game_total,
                        percentage: shadowProgress.numAwardedToUser / currentChallenge.shadow_challange_game_total * 100
                    } : null
                });
            }
            
            // Sort by total points
            leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
            
            // Update cache
            this.cache.monthly.data = {
                leaderboard,
                challenge: {
                    monthYear: new Date(currentChallenge.date).toLocaleString('default', { month: 'long', year: 'numeric' }),
                    monthlyGame: currentChallenge.monthly_challange_gameid,
                    shadowGame: currentChallenge.shadow_challange_revealed ? currentChallenge.shadow_challange_gameid : null,
                    shadowRevealed: currentChallenge.shadow_challange_revealed
                },
                lastUpdated: new Date().toISOString()
            };
            
            this.cache.monthly.lastUpdated = Date.now();
            
            console.log(`Monthly leaderboard updated with ${leaderboard.length} entries.`);
        } catch (error) {
            console.error('Error updating monthly leaderboard:', error);
        }
    }
    
    /**
     * Update the yearly leaderboard
     */
    async updateYearlyLeaderboard() {
        try {
            // Get all users
            const users = await User.find({});
            
            // Build leaderboard
            const leaderboard = [];
            
            for (const user of users) {
                // Calculate yearly points from monthly challenges
                let yearlyPoints = 0;
                
                // Go through monthly challenges
                for (const [key, value] of user.monthlyChallenges.entries()) {
                    // Only count challenges from current year
                    if (key.startsWith(this.cache.currentYear.toString())) {
                        yearlyPoints += value.progress || 0;
                    }
                }
                
                // Add shadow challenges
                for (const [key, value] of user.shadowChallenges.entries()) {
                    // Only count challenges from current year
                    if (key.startsWith(this.cache.currentYear.toString())) {
                        yearlyPoints += value.progress || 0;
                    }
                }
                
                // Add community awards from current year
                const communityPoints = user.getCommunityPointsForYear(this.cache.currentYear);
                yearlyPoints += communityPoints;
                
                // Add to leaderboard
                leaderboard.push({
                    username: user.raUsername,
                    discordId: user.discordId,
                    yearlyPoints,
                    communityPoints,
                    challengePoints: yearlyPoints - communityPoints
                });
            }
            
            // Sort by yearly points
            leaderboard.sort((a, b) => b.yearlyPoints - a.yearlyPoints);
            
            // Update cache
            this.cache.yearly.data = {
                leaderboard,
                year: this.cache.currentYear,
                lastUpdated: new Date().toISOString()
            };
            
            this.cache.yearly.lastUpdated = Date.now();
            
            console.log(`Yearly leaderboard updated with ${leaderboard.length} entries.`);
        } catch (error) {
            console.error('Error updating yearly leaderboard:', error);
        }
    }
    
    /**
     * Save cache to disk
     */
    saveToDisk() {
        try {
            // Save monthly leaderboard
            if (this.cache.monthly.data) {
                fs.writeFileSync(
                    path.join(CACHE_DIR, 'monthly-leaderboard.json'),
                    JSON.stringify(this.cache.monthly.data, null, 2)
                );
            }
            
            // Save yearly leaderboard
            if (this.cache.yearly.data) {
                fs.writeFileSync(
                    path.join(CACHE_DIR, 'yearly-leaderboard.json'),
                    JSON.stringify(this.cache.yearly.data, null, 2)
                );
            }
            
            console.log('Leaderboard cache saved to disk.');
        } catch (error) {
            console.error('Error saving leaderboard cache to disk:', error);
        }
    }
    
    /**
     * Load cache from disk
     */
    loadFromDisk() {
        try {
            // Load monthly leaderboard
            const monthlyPath = path.join(CACHE_DIR, 'monthly-leaderboard.json');
            if (fs.existsSync(monthlyPath)) {
                const data = JSON.parse(fs.readFileSync(monthlyPath, 'utf8'));
                this.cache.monthly.data = data;
                this.cache.monthly.lastUpdated = new Date(data.lastUpdated).getTime();
                console.log('Loaded monthly leaderboard from disk.');
            }
            
            // Load yearly leaderboard
            const yearlyPath = path.join(CACHE_DIR, 'yearly-leaderboard.json');
            if (fs.existsSync(yearlyPath)) {
                const data = JSON.parse(fs.readFileSync(yearlyPath, 'utf8'));
                this.cache.yearly.data = data;
                this.cache.yearly.lastUpdated = new Date(data.lastUpdated).getTime();
                console.log('Loaded yearly leaderboard from disk.');
            }
        } catch (error) {
            console.error('Error loading leaderboard cache from disk:', error);
        }
    }
    
    /**
     * Get the monthly leaderboard
     */
    getMonthlyLeaderboard() {
        return this.cache.monthly.data;
    }
    
    /**
     * Get the yearly leaderboard
     */
    getYearlyLeaderboard() {
        return this.cache.yearly.data;
    }
    
    /**
     * Force an update of the leaderboards
     */
    async forceUpdate() {
        console.log('Forcing leaderboard update...');
        await this.updateLeaderboards();
        return {
            monthly: this.cache.monthly.data,
            yearly: this.cache.yearly.data,
            lastUpdated: new Date().toISOString()
        };
    }
}

// Create singleton instance
const leaderboardCacheService = new LeaderboardCacheService();
export default leaderboardCacheService;
