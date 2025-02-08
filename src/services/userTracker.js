// File: src/services/UserTracker.js
class UserTracker {
    constructor(database, userStats) {
        this.database = database;
        this.userStats = userStats;
        this.services = null; // Store services for potential extension
        // Map to store valid users where the key is the lowercase username and the value is the preserved case
        this.validUsers = new Map(); 
        this.cache = {
            lastUpdate: null,
            updateInterval: 5 * 60 * 1000, // 5 minutes
            // Pattern to extract username from RetroAchievements profile URLs
            profileUrlPattern: /(?:retroachievements\.org\/user\/|ra\.org\/user\/)([^\/\s]+)/i
        };
        // Define the channel ID from which to process RetroAchievements profile URLs
        this.trackedChannelId = '1337758757895012453';
    }

    setServices(services) {
        this.services = services;
        console.log('[USER TRACKER] Services linked:', Object.keys(services));
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
            // Assume database.getValidUsers returns an array of valid usernames (strings)
            const users = await this.database.getValidUsers();
            this.validUsers.clear();
            for (const user of users) {
                this.validUsers.set(user.toLowerCase(), user);
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
     * Process messages only from the designated channel.
     * If a RetroAchievements profile URL is found, extract the username and add it.
     */
    async processMessage(message) {
        // Only process messages from the tracked channel
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
                    const username = this.extractUsername(word);
                    if (username) {
                        const added = await this.addUser(username);
                        if (added) {
                            updatedAny = true;
                        }
                    }
                }
            }

            if (updatedAny) {
                await message.react('✅');
                await this.refreshUserCache(); // Refresh cache after changes
            }
        } catch (error) {
            console.error('[USER TRACKER] Error processing message:', error);
        }
    }

    /**
     * Add or update a user in the valid users list and persist changes using database.manageUser.
     * @param {string} username - The username extracted from the post.
     * @returns {Promise<boolean>} - Returns true if a user was added or updated.
     */
    async addUser(username) {
        try {
            if (!username) return false;

            const originalCase = username.trim();
            const lowercaseKey = originalCase.toLowerCase();

            if (!originalCase) return false;

            // Check if the user already exists in the cache
            const existingUser = this.validUsers.get(lowercaseKey);

            if (!existingUser) {
                // Add the new user to the database
                await this.database.manageUser('add', originalCase);
                this.validUsers.set(lowercaseKey, originalCase);

                if (this.userStats) {
                    await this.userStats.initializeUserIfNeeded(originalCase);
                }

                if (global.leaderboardCache && typeof global.leaderboardCache.updateValidUsers === 'function') {
                    await global.leaderboardCache.updateValidUsers();
                }

                console.log(`[USER TRACKER] Added new user: ${originalCase}`);
                return true;
            } else if (existingUser !== originalCase) {
                // Update the user's case if needed in the database
                await this.database.manageUser('update', existingUser, originalCase);
                this.validUsers.set(lowercaseKey, originalCase);
                console.log(`[USER TRACKER] Updated user: ${existingUser} to ${originalCase}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error('[USER TRACKER] Error adding user:', error);
            return false;
        }
    }

    /**
     * Scans historical messages in the designated channel up to the specified limit.
     * Useful for bootstrapping the user cache.
     */
    async scanHistoricalMessages(channel, limit = 100) {
        // Ensure we only scan on the designated channel
        if (channel.id !== this.trackedChannelId) {
            console.log(`[USER TRACKER] Skipping channel ${channel.name} (ID: ${channel.id}).`);
            return;
        }
        try {
            console.log(`[USER TRACKER] Scanning historical messages in ${channel.name}...`);
            const messages = await channel.messages.fetch({ limit });
            
            let processedCount = 0;
            let addedUsers = 0;

            for (const message of messages.values()) {
                const words = message.content.split(/\s+/);
                for (const word of words) {
                    if (word.includes('retroachievements.org/user/') || word.includes('ra.org/user/')) {
                        const username = this.extractUsername(word);
                        if (username) {
                            const added = await this.addUser(username);
                            if (added) addedUsers++;
                        }
                    }
                }
                processedCount++;
            }
            
            console.log(`[USER TRACKER] Processed ${processedCount} messages, found ${addedUsers} new users.`);
            if (addedUsers > 0) {
                await this.refreshUserCache();
            }
        } catch (error) {
            console.error('[USER TRACKER] Error scanning historical messages:', error);
            throw error;
        }
    }

    /**
     * Remove a user from the valid users list.
     * @param {string} username - The username to remove.
     * @returns {Promise<boolean>} - Returns true if the user was removed.
     */
    async removeUser(username) {
        try {
            const lowercaseKey = username.toLowerCase();
            const originalCase = this.validUsers.get(lowercaseKey);

            if (originalCase) {
                await this.database.manageUser('remove', originalCase);
                this.validUsers.delete(lowercaseKey);

                if (this.userStats) {
                    await this.userStats.removeUser(originalCase);
                }

                if (global.leaderboardCache && typeof global.leaderboardCache.updateValidUsers === 'function') {
                    await global.leaderboardCache.updateValidUsers();
                }

                console.log(`[USER TRACKER] Removed user: ${originalCase}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('[USER TRACKER] Error removing user:', error);
            return false;
        }
    }

    /**
     * Returns an array of valid users in their preserved case.
     */
    getValidUsers() {
        return Array.from(this.validUsers.values());
    }
}

module.exports = UserTracker;
