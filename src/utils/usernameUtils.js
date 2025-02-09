// File: src/utils/usernameUtils.js
const User = require('../models/User');
const Cache = require('./cache');

class UsernameUtils {
    constructor(raAPI) {
        this.raAPI = raAPI;
        this.cache = new Cache(300000); // 5 minute cache
    }

    /**
     * Get canonical username from RetroAchievements
     * This maintains the original case from the RA profile
     */
    async getCanonicalUsername(username) {
        if (!username) return null;

        const normalizedUsername = username.toLowerCase();
        
        // Check cache first
        const cachedUsername = this.cache.get(normalizedUsername);
        if (cachedUsername) {
            return cachedUsername;
        }

        try {
            // Try RetroAchievements API first
            const profile = await this.raAPI.getUserProfile(username);
            if (profile && profile.Username) {
                this.cache.set(normalizedUsername, profile.Username);
                return profile.Username;
            }
        } catch (error) {
            console.error(`Error getting canonical username from RA for ${username}:`, error);
        }

        try {
            // Fallback to database
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${normalizedUsername}$`, 'i') }
            });
            
            if (user) {
                this.cache.set(normalizedUsername, user.raUsername);
                return user.raUsername;
            }
        } catch (error) {
            console.error(`Error getting username from database for ${username}:`, error);
        }

        // If all else fails, return original
        return username;
    }

    /**
     * Compare two usernames case-insensitively
     */
    compareUsernames(username1, username2) {
        if (!username1 || !username2) return false;
        return username1.toLowerCase() === username2.toLowerCase();
    }

    /**
     * Get normalized (lowercase) version of username for database operations
     */
    getNormalizedUsername(username) {
        return username ? username.toLowerCase() : null;
    }

    /**
     * Clear the username cache
     */
    clearCache() {
        this.cache.clear();
    }
}

module.exports = UsernameUtils;
