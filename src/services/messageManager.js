import { MESSAGE_MANAGER, RATE_LIMITS } from '../config/rateLimit.js';

class MessageManager {
    constructor() {
        this.messages = new Map();
        this.updateQueue = new Map();
        this.rateLimit = {
            edits: new Map(),
            lastCleanup: Date.now()
        };

        // Start cleanup interval
        setInterval(() => this.cleanup(), MESSAGE_MANAGER.CLEANUP_INTERVAL);
    }

    /**
     * Track a message for updates
     * @param {string} channelId - Discord channel ID
     * @param {string} messageId - Discord message ID
     * @param {string} type - Message type (e.g., 'monthly-leaderboard', 'yearly-leaderboard')
     */
    trackMessage(channelId, messageId, type) {
        const key = `${channelId}:${messageId}`;
        this.messages.set(key, {
            channelId,
            messageId,
            type,
            lastUpdate: Date.now()
        });
    }

    /**
     * Queue a message update
     * @param {string} channelId - Discord channel ID
     * @param {string} messageId - Discord message ID
     * @param {Object} content - New message content
     * @returns {Promise<boolean>} Whether the update was queued
     */
    async queueUpdate(channelId, messageId, content) {
        const key = `${channelId}:${messageId}`;
        const message = this.messages.get(key);

        if (!message) {
            console.warn(`Attempted to update untracked message: ${key}`);
            return false;
        }

        // Check rate limits
        if (!this.canUpdate(channelId)) {
            console.warn(`Rate limit exceeded for channel: ${channelId}`);
            return false;
        }

        // Add to update queue
        this.updateQueue.set(key, {
            content,
            attempts: 0,
            lastAttempt: null
        });

        return true;
    }

    /**
     * Process update queue
     * @returns {Promise<void>}
     */
    async processQueue() {
        for (const [key, update] of this.updateQueue.entries()) {
            const [channelId, messageId] = key.split(':');
            const message = this.messages.get(key);

            if (!message) {
                this.updateQueue.delete(key);
                continue;
            }

            try {
                // Update the message
                const channel = await this.client.channels.fetch(channelId);
                const discordMessage = await channel.messages.fetch(messageId);
                await discordMessage.edit(update.content);

                // Update tracking info
                message.lastUpdate = Date.now();
                this.messages.set(key, message);
                this.updateQueue.delete(key);

                // Update rate limit tracking
                this.trackRateLimit(channelId);
            } catch (error) {
                console.error(`Error updating message ${key}:`, error);
                update.attempts++;
                update.lastAttempt = Date.now();

                // Remove from queue if max attempts reached
                if (update.attempts >= MESSAGE_MANAGER.RETRY.MAX_ATTEMPTS) {
                    console.error(`Max retry attempts reached for message ${key}`);
                    this.updateQueue.delete(key);
                }
            }
        }
    }

    /**
     * Check if a channel can be updated based on rate limits
     * @param {string} channelId - Discord channel ID
     * @returns {boolean} Whether the channel can be updated
     */
    canUpdate(channelId) {
        const now = Date.now();
        const edits = this.rateLimit.edits.get(channelId) || [];
        
        // Remove old entries
        const recentEdits = edits.filter(time => 
            now - time < 60000 // Within last minute
        );
        
        // Check if under rate limit
        if (recentEdits.length >= RATE_LIMITS.CHANNEL.EDITS_PER_MINUTE) {
            return false;
        }

        // Update rate limit tracking
        this.rateLimit.edits.set(channelId, recentEdits);
        return true;
    }

    /**
     * Track rate limit for a channel
     * @param {string} channelId - Discord channel ID
     */
    trackRateLimit(channelId) {
        const now = Date.now();
        const edits = this.rateLimit.edits.get(channelId) || [];
        edits.push(now);
        this.rateLimit.edits.set(channelId, edits);
    }

    /**
     * Clean up old messages and rate limit data
     */
    cleanup() {
        const now = Date.now();

        // Clean up old messages
        for (const [key, message] of this.messages.entries()) {
            if (now - message.lastUpdate > MESSAGE_MANAGER.MESSAGE_TTL) {
                this.messages.delete(key);
            }
        }

        // Clean up rate limit data
        for (const [channelId, edits] of this.rateLimit.edits.entries()) {
            const recentEdits = edits.filter(time => 
                now - time < 60000 // Within last minute
            );
            
            if (recentEdits.length === 0) {
                this.rateLimit.edits.delete(channelId);
            } else {
                this.rateLimit.edits.set(channelId, recentEdits);
            }
        }

        this.rateLimit.lastCleanup = now;
    }

    /**
     * Set Discord client
     * @param {Discord.Client} client - Discord.js client
     */
    setClient(client) {
        this.client = client;
    }
}

// Create and export singleton instance
const messageManager = new MessageManager();
export default messageManager;
