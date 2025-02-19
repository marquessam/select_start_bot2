import { User } from '../models/index.js';

class ActivityTracker {
    constructor() {
        this.updateIntervals = new Map();
    }

    /**
     * Start tracking a user's activity
     * @param {string} username - RetroAchievements username
     */
    async startTracking(username) {
        const user = await User.findByRAUsername(username);
        if (!user) return;

        // Clear any existing interval
        this.stopTracking(username);

        // Set up interval based on user's activity tier
        const interval = setInterval(
            () => this.updateUserActivity(username),
            user.getApiCallFrequency()
        );

        this.updateIntervals.set(username, interval);
    }

    /**
     * Stop tracking a user's activity
     * @param {string} username - RetroAchievements username
     */
    stopTracking(username) {
        const interval = this.updateIntervals.get(username);
        if (interval) {
            clearInterval(interval);
            this.updateIntervals.delete(username);
        }
    }

    /**
     * Update a user's activity status
     * @param {string} username - RetroAchievements username
     */
    async updateUserActivity(username) {
        try {
            const user = await User.findByRAUsername(username);
            if (!user) {
                this.stopTracking(username);
                return;
            }

            // Update activity tier
            user.updateActivityTier();

            // If activity tier changed, update tracking interval
            const newFrequency = user.getApiCallFrequency();
            const currentInterval = this.updateIntervals.get(username);
            
            if (currentInterval) {
                clearInterval(currentInterval);
                const newInterval = setInterval(
                    () => this.updateUserActivity(username),
                    newFrequency
                );
                this.updateIntervals.set(username, newInterval);
            }

            await user.save();
        } catch (error) {
            console.error(`Error updating activity for ${username}:`, error);
        }
    }

    /**
     * Record an achievement for a user
     * @param {string} username - RetroAchievements username
     */
    async recordAchievement(username) {
        try {
            const user = await User.findByRAUsername(username);
            if (!user) return;

            user.recordAchievement();
            await user.save();

            // Start tracking if not already tracking
            if (!this.updateIntervals.has(username)) {
                await this.startTracking(username);
            }
        } catch (error) {
            console.error(`Error recording achievement for ${username}:`, error);
        }
    }

    /**
     * Get active users for achievement checking
     * @returns {Promise<Array>} Array of usernames to check
     */
    async getActiveUsers() {
        try {
            const users = await User.find({
                activityTier: { $in: ['VERY_ACTIVE', 'ACTIVE'] }
            }).select('raUsername');

            return users.map(user => user.raUsername);
        } catch (error) {
            console.error('Error getting active users:', error);
            return [];
        }
    }

    /**
     * Clean up inactive users
     */
    async cleanupInactiveUsers() {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const inactiveUsers = await User.find({
                activityTier: 'INACTIVE',
                lastActivity: { $lt: thirtyDaysAgo }
            });

            for (const user of inactiveUsers) {
                this.stopTracking(user.raUsername);
            }
        } catch (error) {
            console.error('Error cleaning up inactive users:', error);
        }
    }

    /**
     * Initialize activity tracking for all active users
     */
    async initializeTracking() {
        try {
            const activeUsers = await this.getActiveUsers();
            for (const username of activeUsers) {
                await this.startTracking(username);
            }

            // Set up cleanup interval
            setInterval(() => this.cleanupInactiveUsers(), 24 * 60 * 60 * 1000); // Daily cleanup
        } catch (error) {
            console.error('Error initializing activity tracking:', error);
        }
    }

    /**
     * Clean up resources
     */
    cleanup() {
        for (const interval of this.updateIntervals.values()) {
            clearInterval(interval);
        }
        this.updateIntervals.clear();
    }
}

// Create and export singleton instance
const activityTracker = new ActivityTracker();
export default activityTracker;
