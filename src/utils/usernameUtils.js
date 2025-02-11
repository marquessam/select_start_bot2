// File: src/utils/usernameUtils.js
const User = require('../models/User');
const Cache = require('./cache');

class UsernameUtils {
    constructor(raAPI) {
        if (!raAPI) {
            throw new Error('RetroAchievements API client is required');
        }
        this.raAPI = raAPI;
        // Cache duration: 1 hour for canonical usernames
        this.canonicalCache = new Cache(3600000);
    }

    /**
     * Get canonical username (proper case) from RetroAchievements or database
     * @param {string} username - Username in any case
     * @returns {Promise<string>} - Canonical username
     */
    async getCanonicalUsername(username) {
        if (!username) return null;

        const normalizedUsername = username.toLowerCase();
        
        // Check cache first
        const cachedUsername = this.canonicalCache.get(normalizedUsername);
        if (cachedUsername) {
            return cachedUsername;
        }

        try {
            // Try RetroAchievements API first
            const profile = await this.raAPI.getUserProfile(username);
            if (profile && profile.Username) {
                this.canonicalCache.set(normalizedUsername, profile.Username);
                console.log(`Canonical username found from RA API: ${profile.Username}`);
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
            
            if (user && user.raUsername) {
                // Try to get canonical form from RA one more time
                try {
                    const profile = await this.raAPI.getUserProfile(user.raUsername);
                    if (profile && profile.Username) {
                        this.canonicalCache.set(normalizedUsername, profile.Username);
                        console.log(`Canonical username found from second RA API attempt: ${profile.Username}`);
                        return profile.Username;
                    }
                } catch (error) {
                    console.error(`Error getting canonical username from RA for ${user.raUsername}:`, error);
                }
                
                // If RA lookup fails, use the stored username
                this.canonicalCache.set(normalizedUsername, user.raUsername);
                console.log(`Using stored username as canonical: ${user.raUsername}`);
                return user.raUsername;
            }
        } catch (error) {
            console.error(`Error getting username from database for ${username}:`, error);
        }

        // If all else fails, return null instead of the original username
        // This ensures we don't accidentally use an incorrect case
        console.log(`No canonical username found for ${username}`);
        return null;
    }

    /**
     * Get RetroAchievements profile URL with canonical username
     * @param {string} username - Username in any case
     * @returns {Promise<string>} - Profile URL with canonical username
     */
    async getProfileUrl(username) {
        const canonicalName = await this.getCanonicalUsername(username);
        return canonicalName ? 
            `https://retroachievements.org/user/${canonicalName}` :
            null;
    }

    /**
     * Get RetroAchievements profile picture URL with canonical username
     * @param {string} username - Username in any case
     * @returns {Promise<string>} - Profile picture URL with canonical username
     */
    async getProfilePicUrl(username) {
        const canonicalName = await this.getCanonicalUsername(username);
        return canonicalName ? 
            `https://retroachievements.org/UserPic/${canonicalName}.png` :
            null;
    }

    /**
     * Compare two usernames case-insensitively
     * @param {string} username1 - First username
     * @param {string} username2 - Second username
     * @returns {boolean} - True if usernames match case-insensitively
     */
    compareUsernames(username1, username2) {
        if (!username1 || !username2) return false;
        return username1.toLowerCase() === username2.toLowerCase();
    }

    /**
     * Clear the username cache
     */
    clearCache() {
        this.canonicalCache.clear();
        console.log('Username cache cleared');
    }
}

module.exports = UsernameUtils;
