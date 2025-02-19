import { EmbedBuilder } from 'discord.js';
import { LIVE_LEADERBOARD } from '../config/rateLimit.js';
import messageManager from './messageManager.js';
import leaderboardService from './leaderboardService.js';

class LiveLeaderboard {
    constructor() {
        this.updateIntervals = new Map();
        this.cache = new Map();
        this.wsConnections = new Map();
        this.messageQueue = [];
        this.isProcessingQueue = false;
        this.rateLimiter = {
            count: 0,
            lastReset: Date.now(),
            queue: []
        };
        this.updateCount = 0;
        this.lastUpdateTime = Date.now();
    }

    /**
     * Initialize rate limiter
     * @private
     */
    _resetRateLimiter() {
        const now = Date.now();
        if (now - this.rateLimiter.lastReset >= 60000) { // 1 minute
            this.rateLimiter.count = 0;
            this.rateLimiter.lastReset = now;
            // Process queued updates if any
            while (this.rateLimiter.queue.length > 0 && 
                   this.rateLimiter.count < LIVE_LEADERBOARD.RATE_LIMIT.UPDATES_PER_MINUTE) {
                const update = this.rateLimiter.queue.shift();
                this._processUpdate(update);
            }
        }
    }

    /**
     * Check if update is allowed by rate limiter
     * @private
     * @returns {boolean}
     */
    _checkRateLimit() {
        this._resetRateLimiter();
        return this.rateLimiter.count < LIVE_LEADERBOARD.RATE_LIMIT.UPDATES_PER_MINUTE;
    }

    /**
     * Get update interval based on time of day
     * @private
     * @returns {number} Interval in milliseconds
     */
    _getUpdateInterval() {
        const hour = new Date().getHours();
        const isActiveHours = hour >= LIVE_LEADERBOARD.UPDATE_INTERVAL.ACTIVE_HOURS.START && 
                            hour <= LIVE_LEADERBOARD.UPDATE_INTERVAL.ACTIVE_HOURS.END;
        
        const baseInterval = isActiveHours ? 
            LIVE_LEADERBOARD.UPDATE_INTERVAL.ACTIVE_HOURS.INTERVAL : 
            LIVE_LEADERBOARD.UPDATE_INTERVAL.BASE;
        
        // Add jitter to prevent thundering herd
        const jitter = Math.floor(Math.random() * LIVE_LEADERBOARD.UPDATE_INTERVAL.JITTER);
        return baseInterval + jitter;
    }

    /**
     * Initialize WebSocket connection for a channel with improved error handling
     * @param {string} channelId - Discord channel ID
     * @returns {Promise<void>}
     */
    async initializeWebSocket(channelId) {
        try {
            // Clean up existing connection if any
            await this.cleanupWebSocket(channelId);

            const channel = await this.client.channels.fetch(channelId);
            if (!channel.isText()) {
                throw new Error('Channel must be a text channel');
            }

            const wsConnection = {
                channelId,
                lastPing: Date.now(),
                isAlive: true,
                reconnectAttempts: 0,
                errors: [],
                lastError: null
            };

            this.wsConnections.set(channelId, wsConnection);
            
            // Start heartbeat with improved configuration
            const heartbeatInterval = setInterval(() => {
                this.checkConnection(channelId);
            }, LIVE_LEADERBOARD.WEBSOCKET.HEARTBEAT_INTERVAL);

            wsConnection.heartbeatInterval = heartbeatInterval;

            // Set up error tracking cleanup
            setInterval(() => {
                if (wsConnection.errors.length > 0) {
                    // Keep only errors from the last hour
                    const oneHourAgo = Date.now() - (60 * 60 * 1000);
                    wsConnection.errors = wsConnection.errors.filter(e => e.timestamp > oneHourAgo);
                }
            }, 60 * 60 * 1000); // Clean up every hour

        } catch (error) {
            console.error(`Error initializing WebSocket for channel ${channelId}:`, error);
            throw error;
        }
    }

    /**
     * Clean up WebSocket connection
     * @param {string} channelId - Discord channel ID
     */
    async cleanupWebSocket(channelId) {
        const connection = this.wsConnections.get(channelId);
        if (connection) {
            clearInterval(connection.heartbeatInterval);
            this.wsConnections.delete(channelId);
        }
    }

    /**
     * Check WebSocket connection health
     * @param {string} channelId - Discord channel ID
     */
    async checkConnection(channelId) {
        const connection = this.wsConnections.get(channelId);
        if (!connection) return;

        const now = Date.now();
        if (now - connection.lastPing > LIVE_LEADERBOARD.HEARTBEAT_TIMEOUT) {
            connection.isAlive = false;
            await this.handleReconnect(channelId);
        }
    }

    /**
     * Handle WebSocket reconnection
     * @param {string} channelId - Discord channel ID
     */
    async handleReconnect(channelId) {
        const connection = this.wsConnections.get(channelId);
        if (!connection) return;

        if (connection.reconnectAttempts >= LIVE_LEADERBOARD.RETRY.MAX_ATTEMPTS) {
            console.error(`Max reconnection attempts reached for channel ${channelId}`);
            await this.cleanupWebSocket(channelId);
            return;
        }

        try {
            connection.reconnectAttempts++;
            await this.initializeWebSocket(channelId);
            console.log(`Reconnected to channel ${channelId}`);
        } catch (error) {
            console.error(`Error reconnecting to channel ${channelId}:`, error);
            
            // Exponential backoff
            const delay = LIVE_LEADERBOARD.RETRY.DELAY * Math.pow(2, connection.reconnectAttempts - 1);
            setTimeout(() => this.handleReconnect(channelId), delay);
        }
    }

    /**
     * Start a live leaderboard in a channel
     * @param {string} channelId - Discord channel ID
     * @param {string} type - Leaderboard type (monthly/yearly)
     * @returns {Promise<boolean>} Whether the leaderboard was started
     */
    async startLeaderboard(channelId, type) {
        try {
            // Create initial leaderboard message
            const embed = await this.createLeaderboardEmbed(type);
            const channel = await this.client.channels.fetch(channelId);
            const message = await channel.send({ embeds: [embed] });

            // Initialize WebSocket connection
            await this.initializeWebSocket(channelId);

            // Track message for updates
            messageManager.trackMessage(channelId, message.id, `${type}-leaderboard`);

            // Set up update interval with jitter to prevent thundering herd
            const jitter = Math.floor(Math.random() * 1000); // Random delay up to 1 second
            const intervalId = setInterval(
                () => this.queueUpdate(channelId, message.id, type),
                LIVE_LEADERBOARD.UPDATE_INTERVAL + jitter
            );

            this.updateIntervals.set(`${channelId}:${message.id}`, intervalId);
            return true;
        } catch (error) {
            console.error('Error starting live leaderboard:', error);
            return false;
        }
    }

    /**
     * Stop a live leaderboard
     * @param {string} channelId - Discord channel ID
     * @param {string} messageId - Discord message ID
     */
    stopLeaderboard(channelId, messageId) {
        const key = `${channelId}:${messageId}`;
        const intervalId = this.updateIntervals.get(key);
        
        if (intervalId) {
            clearInterval(intervalId);
            this.updateIntervals.delete(key);
        }
    }

    /**
     * Queue a leaderboard update
     * @param {string} channelId - Discord channel ID
     * @param {string} messageId - Discord message ID
     * @param {string} type - Leaderboard type (monthly/yearly)
     */
    async queueUpdate(channelId, messageId, type) {
        this.messageQueue.push({ channelId, messageId, type });
        if (!this.isProcessingQueue) {
            await this.processQueue();
        }
    }

    /**
     * Process queued updates
     */
    async processQueue() {
        if (this.isProcessingQueue || this.messageQueue.length === 0) return;

        this.isProcessingQueue = true;
        const processStart = Date.now();

        try {
            while (this.messageQueue.length > 0 && 
                   Date.now() - processStart < LIVE_LEADERBOARD.MAX_PROCESS_TIME) {
                const update = this.messageQueue.shift();
                await this.updateLeaderboard(update.channelId, update.messageId, update.type);
                
                // Rate limiting delay
                await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.CHANNEL.EDITS_PER_MINUTE));
            }
        } catch (error) {
            console.error('Error processing leaderboard update queue:', error);
        } finally {
            this.isProcessingQueue = false;
            
            // If there are remaining updates, schedule next processing
            if (this.messageQueue.length > 0) {
                setTimeout(() => this.processQueue(), LIVE_LEADERBOARD.QUEUE_PROCESS_DELAY);
            }
        }
    }

    /**
     * Update a leaderboard message
     * @param {string} channelId - Discord channel ID
     * @param {string} messageId - Discord message ID
     * @param {string} type - Leaderboard type (monthly/yearly)
     */
    async updateLeaderboard(channelId, messageId, type) {
        const connection = this.wsConnections.get(channelId);
        if (!connection || !connection.isAlive) {
            console.warn(`WebSocket connection not alive for channel ${channelId}`);
            return;
        }

        try {
            const embed = await this.createLeaderboardEmbed(type);
            await messageManager.queueUpdate(channelId, messageId, { embeds: [embed] });
            connection.lastPing = Date.now();
        } catch (error) {
            console.error('Error updating live leaderboard:', error);
            connection.isAlive = false;
            await this.handleReconnect(channelId);
        }
    }

    /**
     * Create leaderboard embed with improved caching
     * @param {string} type - Leaderboard type (monthly/yearly)
     * @returns {Promise<EmbedBuilder>} Discord embed
     */
    async createLeaderboardEmbed(type) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        // Check cache with stale-while-revalidate support
        const cacheKey = `${type}-${month}-${year}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached) {
            const age = now.getTime() - cached.timestamp;
            
            // If data is fresh, return it
            if (age < LIVE_LEADERBOARD.CACHE.TTL) {
                return cached.embed;
            }
            
            // If stale but within stale TTL, revalidate in background
            if (age < LIVE_LEADERBOARD.CACHE.STALE_TTL && 
                LIVE_LEADERBOARD.CACHE.STALE_WHILE_REVALIDATE) {
                // Revalidate in background
                this._revalidateCache(type, cacheKey).catch(console.error);
                return cached.embed;
            }
        }

        // Generate new embed
        const embed = await this._generateEmbed(type, month, year);

        // Compress and cache the result if compression is enabled
        if (LIVE_LEADERBOARD.CACHE.STORAGE.COMPRESSION) {
            this._compressAndCache(cacheKey, embed);
        } else {
            this.cache.set(cacheKey, {
                embed,
                timestamp: now.getTime()
            });
        }

        // Prune cache if needed
        if (this.cache.size > LIVE_LEADERBOARD.CACHE.MAX_ITEMS) {
            this._pruneCache();
        }

        return embed;
    }

    /**
     * Generate new embed
     * @private
     */
    async _generateEmbed(type, month, year) {
        const embed = type.toLowerCase() === 'monthly'
            ? await leaderboardService.generateMonthlyLeaderboard(month, year)
            : await leaderboardService.generateYearlyLeaderboard(year);

        const now = new Date();
        embed.setFooter({ 
            text: `🔴 Live • Last updated: ${now.toLocaleString()}`
        });

        return embed;
    }

    /**
     * Revalidate cached data
     * @private
     */
    async _revalidateCache(type, cacheKey) {
        const [month, year] = [new Date().getMonth() + 1, new Date().getFullYear()];
        const embed = await this._generateEmbed(type, month, year);
        
        if (LIVE_LEADERBOARD.CACHE.STORAGE.COMPRESSION) {
            await this._compressAndCache(cacheKey, embed);
        } else {
            this.cache.set(cacheKey, {
                embed,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Compress and cache embed data
     * @private
     */
    _compressAndCache(key, embed) {
        // Simple compression by removing unnecessary whitespace
        const compressed = JSON.stringify(embed.toJSON()).replace(/\s+/g, ' ');
        this.cache.set(key, {
            compressed,
            timestamp: Date.now()
        });
    }

    /**
     * Prune old items from cache
     * @private
     */
    _pruneCache() {
        const entries = Array.from(this.cache.entries());
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        
        // Keep only the newest items up to MAX_ITEMS
        const toDelete = entries.slice(LIVE_LEADERBOARD.CACHE.MAX_ITEMS);
        for (const [key] of toDelete) {
            this.cache.delete(key);
        }
    }

    /**
     * Set Discord client
     * @param {Discord.Client} client - Discord.js client
     */
    setClient(client) {
        this.client = client;
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        // Clear all update intervals
        for (const intervalId of this.updateIntervals.values()) {
            clearInterval(intervalId);
        }
        this.updateIntervals.clear();

        // Clean up all WebSocket connections
        for (const channelId of this.wsConnections.keys()) {
            await this.cleanupWebSocket(channelId);
        }

        // Clear queues and cache
        this.messageQueue = [];
        this.cache.clear();
        this.isProcessingQueue = false;
    }
}

// Create and export singleton instance
const liveLeaderboard = new LiveLeaderboard();
export default liveLeaderboard;
