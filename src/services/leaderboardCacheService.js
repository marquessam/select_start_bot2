// Add this to your src/services/leaderboardCacheService.js

import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '../..', 'cache');
const MONTHLY_CACHE_FILE = join(CACHE_DIR, 'monthly-leaderboard.json');
const YEARLY_CACHE_FILE = join(CACHE_DIR, 'yearly-leaderboard.json');
const NOMINATIONS_CACHE_FILE = join(CACHE_DIR, 'nominations.json');

class LeaderboardCacheService {
  constructor() {
    this.ensureCacheDirectory();
    
    // Cache stats
    this.stats = {
      monthlyUpdated: null,
      yearlyUpdated: null,
      nominationsUpdated: null
    };
  }
  
  /**
   * Ensure cache directory exists
   */
  async ensureCacheDirectory() {
    try {
      if (!existsSync(CACHE_DIR)) {
        await mkdir(CACHE_DIR, { recursive: true });
        console.log(`Created cache directory: ${CACHE_DIR}`);
      }
    } catch (error) {
      console.error('Error creating cache directory:', error);
    }
  }
  
  /**
   * Update monthly leaderboard cache
   * Called whenever the Discord bot calculates a leaderboard
   * @param {Object} leaderboardData - Formatted leaderboard data
   */
  async updateMonthlyLeaderboard(leaderboardData) {
    try {
      const cacheData = {
        leaderboard: leaderboardData,
        lastUpdated: new Date().toISOString()
      };
      
      await writeFile(MONTHLY_CACHE_FILE, JSON.stringify(cacheData, null, 2));
      this.stats.monthlyUpdated = new Date();
      console.log('Monthly leaderboard cache updated');
    } catch (error) {
      console.error('Error updating monthly leaderboard cache:', error);
    }
  }
  
  /**
   * Update yearly leaderboard cache
   * Called whenever the Discord bot calculates a yearly leaderboard
   * @param {Object} leaderboardData - Formatted leaderboard data
   */
  async updateYearlyLeaderboard(leaderboardData) {
    try {
      const cacheData = {
        leaderboard: leaderboardData,
        lastUpdated: new Date().toISOString()
      };
      
      await writeFile(YEARLY_CACHE_FILE, JSON.stringify(cacheData, null, 2));
      this.stats.yearlyUpdated = new Date();
      console.log('Yearly leaderboard cache updated');
    } catch (error) {
      console.error('Error updating yearly leaderboard cache:', error);
    }
  }
  
  /**
   * Update nominations cache
   * Called whenever the Discord bot processes nominations
   * @param {Object} nominationsData - Formatted nominations data
   */
  async updateNominations(nominationsData) {
    try {
      const cacheData = {
        nominations: nominationsData,
        isOpen: true, // You can update this based on your configuration
        lastUpdated: new Date().toISOString()
      };
      
      await writeFile(NOMINATIONS_CACHE_FILE, JSON.stringify(cacheData, null, 2));
      this.stats.nominationsUpdated = new Date();
      console.log('Nominations cache updated');
    } catch (error) {
      console.error('Error updating nominations cache:', error);
    }
  }
  
  /**
   * Get cache stats
   */
  getStats() {
    return {
      ...this.stats,
      monthlyExists: existsSync(MONTHLY_CACHE_FILE),
      yearlyExists: existsSync(YEARLY_CACHE_FILE),
      nominationsExists: existsSync(NOMINATIONS_CACHE_FILE)
    };
  }
}

// Create singleton instance
const leaderboardCacheService = new LeaderboardCacheService();
export default leaderboardCacheService;
