// File: src/services/userTracker.js
const { addUser, getActiveUsers } = require('../utils/initializeUsers');

class UserTracker {
    constructor(usernameUtils) {
        if (!usernameUtils) {
            throw new Error('Username utils is required');
        }

        this.usernameUtils = usernameUtils;
        this.validUsers = new Map(); // Map of lowercase -> canonical usernames
        this.cache = {
            lastUpdate: null,
            updateInterval: 5 * 60 * 1000, // 5 minutes
            // Pattern to extract username from RetroAchievements profile URLs
            profileUrlPattern: /(?:retroachievements\.org\/user\/|ra\.org\/user\/)([^\/\s]+)/i
        };
        
        // Define the channel ID from which to process RetroAchievements profile URLs
        this.trackedChannelId = process.env.REGISTRATION_CHANNEL_ID;
        console.log('User Tracker initialized');
    }

    async initialize() {
        try {
            console.log('[USER TRACKER] Initializing...');
            await this.refreshUserCache();
            return true;
        } catch (error) {
            console.error('[USER TRACKER] Error initializing:', error);
            this.validUsers.clear();
            return false;
        }
    }

    async refreshUserCache() {
        try {
            // Get all active users from database
            const users = await getActiveUsers();
            this.validUsers.clear();
            
            for (const user of users) {
                try {
                    // Get canonical username for each user
                    const canonicalUsername = await this.usernameUtils.getCanonicalUsername(user.raUsername);
                    if (canonicalUsername) {
                        // Store with lowercase key for case-insensitive lookups
                        this.validUsers.set(canonicalUsername.toLowerCase(), canonicalUsername);
                    }
                } catch (error) {
                    console.error(`[USER TRACKER] Error getting canonical username for ${user.raUsername}:`, error);
                }
            }
            
            this.cache.lastUpdate = Date.now();
            console.log('[USER TRACKER] User cache refreshed. Valid users:', Array.from(this.validUsers.values()));
            return true;
        } catch (error) {
            console.error('[USER TRACKER] Error refreshing cache:', error);
            return false;
        }
    }

    shouldRefreshCache() {
        return !this.cache.lastUpdate || (Date.now() - this.cache.lastUpdate) > this.cache.updateInterval;
    }

    extractUsername(url) {
        try {
            const match = url.match(this.cache.profileUrlPattern);
            return match ? match[1] : null;
        } catch (error) {
            console.error('[USER TRACKER] Error extracting username:', error);
            return null;
        }
    }

    /**
     * Process messages from the registration channel
     */
    async processMessage(message) {
        if (message.channel.id !== this.trackedChannelId) return;
        if (message.author.bot) return;

        try {
            if (this.shouldRefreshCache()) {
                await this.refreshUserCache();
            }

            const words = message.content.split(/\s+/);
            let updatedAny = false;

            for (const word of words) {
                if (word.includes('retroachievements.org/user/') || word.includes('ra.org/user/')) {
                    const extractedUsername = this.extractUsername(word);
                    if (extractedUsername) {
                        // Get canonical username before adding
                        const canonicalUsername = await this.usernameUtils.getCanonicalUsername(extractedUsername);
                        if (canonicalUsername) {
                            const added = await addUser(canonicalUsername, this.usernameUtils);
                            if (added) {
                                updatedAny = true;
                                // Update cache with new user
                                this.validUsers.set(canonicalUsername.toLowerCase(), canonicalUsername);
                                await message.reply(`Successfully registered user: ${canonicalUsername}`);
                            } else {
                                await message.reply(`User ${canonicalUsername} is already registered.`);
                            }
                        } else {
                            await message.reply(`Could not find RetroAchievements user: ${extractedUsername}`);
                        }
                    }
                }
            }

            if (updatedAny) {
                await message.react('✅');
                await this.refreshUserCache();
            }
        } catch (error) {
            console.error('[USER TRACKER] Error processing message:', error);
            await message.reply('There was an error processing your registration. Please try again later.');
        }
    }

    /**
     * Check if a username is valid and registered
     */
    async isValidUser(username) {
        if (this.shouldRefreshCache()) {
            await this.refreshUserCache();
        }

        if (!username) return false;
        
        try {
            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(username);
            return canonicalUsername ? this.validUsers.has(canonicalUsername.toLowerCase()) : false;
        } catch (error) {
            console.error(`[USER TRACKER] Error checking username validity for ${username}:`, error);
            return false;
        }
    }

    /**
     * Get canonical username for a given username
     */
    async getCanonicalUsername(username) {
        if (!username) return null;

        try {
            // First check our cache
            const lowercaseUsername = username.toLowerCase();
            if (this.validUsers.has(lowercaseUsername)) {
                return this.validUsers.get(lowercaseUsername);
            }

            // If not in cache, try to get from RetroAchievements
            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(username);
            if (canonicalUsername && await this.isValidUser(canonicalUsername)) {
                return canonicalUsername;
            }

            return null;
        } catch (error) {
            console.error(`[USER TRACKER] Error getting canonical username for ${username}:`, error);
            return null;
        }
    }

    /**
     * Returns an array of valid users in their canonical form
     */
    getValidUsers() {
        return Array.from(this.validUsers.values());
    }

    /**
     * Clear the cache and force a refresh
     */
    async clearCache() {
        this.validUsers.clear();
        this.cache.lastUpdate = null;
        await this.refreshUserCache();
    }
}

module.exports = UserTracker;
