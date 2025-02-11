// File: src/services/userTracker.js
const { addUser, getActiveUsers } = require('../utils/initializeUsers');

class UserTracker {
    constructor(usernameUtils) {
        if (!usernameUtils) {
            throw new Error('Username utils is required');
        }

        this.usernameUtils = usernameUtils;
        this.services = null;
        // Map to store valid users where the key is the lowercase username and the value is the canonical form
        this.validUsers = new Map(); 
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
            // Get all active users from database
            const users = await getActiveUsers();
            this.validUsers.clear();
            
            for (const user of users) {
                // Get canonical username for each user
                const canonicalUsername = await this.usernameUtils.getCanonicalUsername(user.raUsername);
                if (canonicalUsername) {
                    // Store with lowercase key for case-insensitive lookups
                    this.validUsers.set(canonicalUsername.toLowerCase(), canonicalUsername);
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
                    const extractedUsername = this.extractUsername(word);
                    if (extractedUsername) {
                        // Get canonical username before adding
                        const canonicalUsername = await this.usernameUtils.getCanonicalUsername(extractedUsername);
                        if (canonicalUsername) {
                            const added = await this.addUser(canonicalUsername);
                            if (added) {
                                updatedAny = true;
                            }
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
     * Add a new user to the system using the database functions
     */
    async addUser(username) {
        try {
            if (!username) return false;

            // Get canonical form before checking or adding
            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(username);
            if (!canonicalUsername) return false;

            const normalizedUsername = canonicalUsername.toLowerCase();
            
            // Check if user already exists in cache
            if (this.validUsers.has(normalizedUsername)) {
                return false;
            }

            // Add user to database with canonical username
            const newUser = await addUser(canonicalUsername);
            if (newUser) {
                // Update cache with the canonical username
                this.validUsers.set(normalizedUsername, canonicalUsername);
                console.log(`[USER TRACKER] Added new user: ${canonicalUsername}`);
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
                        const extractedUsername = this.extractUsername(word);
                        if (extractedUsername) {
                            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(extractedUsername);
                            if (canonicalUsername) {
                                const added = await this.addUser(canonicalUsername);
                                if (added) addedUsers++;
                            }
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
     * Returns an array of valid users in their canonical form
     */
    getValidUsers() {
        return Array.from(this.validUsers.values());
    }

    /**
     * Check if a username is valid and registered
     */
    async isValidUser(username) {
        if (this.shouldRefreshCache()) {
            await this.refreshUserCache();
        }
        
        const canonicalUsername = await this.usernameUtils.getCanonicalUsername(username);
        return canonicalUsername ? this.validUsers.has(canonicalUsername.toLowerCase()) : false;
    }
}

module.exports = UserTracker;
