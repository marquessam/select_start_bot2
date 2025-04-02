// src/services/leaderboardCacheService.js
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';

class LeaderboardCacheService {
    constructor() {
        this.client = null;
        this._updating = false;
        this._updatePromise = null;
        
        this.cache = {
            validUsers: new Set(),
            yearlyLeaderboard: [],
            monthlyLeaderboard: [],
            lastUpdated: null,
            updateInterval: 600000 // 10 minutes
        };
    }

    setClient(client) {
        this.client = client;
    }

    async initialize(skipInitialFetch = false) {
        try {
            console.log('Initializing leaderboard cache...');
            await this.updateValidUsers();

            if (!skipInitialFetch) {
                await this.updateLeaderboards(true);
            }

            return true;
        } catch (error) {
            console.error('Initialization error:', error);
            return false;
        }
    }

    async updateValidUsers() {
        try {
            const users = await User.find({});
            this.cache.validUsers = new Set(users.map(u => u.raUsername.toLowerCase()));
            console.log(`Updated valid users: ${users.length} users`);
            return true;
        } catch (error) {
            console.error('Error updating valid users:', error);
            return false;
        }
    }

    _shouldUpdate() {
        return !this.cache.lastUpdated ||
               (Date.now() - this.cache.lastUpdated) > this.cache.updateInterval;
    }

    async updateLeaderboards(force = false) {
        // If an update is already in progress, return the existing promise
        if (this._updating) {
            return this._updatePromise;
        }

        // If we're not forcing and cache is fresh, return cached data
        if (!force && !this._shouldUpdate()) {
            return this._getLatestData();
        }

        this._updating = true;
        this._updatePromise = this._doUpdateLeaderboards(force);
        return this._updatePromise;
    }

    async _doUpdateLeaderboards(force) {
        try {
            // Implementation details...
            // Update yearly and monthly leaderboards
            
            this.cache.lastUpdated = Date.now();
            return this._getLatestData();
        } catch (error) {
            console.error('Error updating leaderboards:', error);
            return this._getLatestData();
        } finally {
            this._updating = false;
        }
    }
}

// Create singleton instance
const leaderboardCacheService = new LeaderboardCacheService();
export default leaderboardCacheService;
