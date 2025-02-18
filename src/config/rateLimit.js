/**
 * Discord API rate limits
 * https://discord.com/developers/docs/topics/rate-limits
 */
export const RATE_LIMITS = {
    // Global rate limits
    GLOBAL: {
        REQUESTS_PER_SECOND: 50
    },
    
    // Channel message rate limits
    CHANNEL: {
        MESSAGES_PER_SECOND: 5,
        EDITS_PER_MINUTE: 30
    },
    
    // Reaction rate limits
    REACTIONS: {
        PER_MESSAGE_PER_SECOND: 1,
        REMOVE_ALL_PER_SECOND: 1
    }
};

/**
 * Live leaderboard update configuration
 */
export const LIVE_LEADERBOARD = {
    // Update interval configuration
    UPDATE_INTERVAL: {
        BASE: 5 * 60 * 1000,     // 5 minutes base interval
        ACTIVE_HOURS: {          // More frequent updates during active hours
            START: 8,            // 8 AM
            END: 23,            // 11 PM
            INTERVAL: 3 * 60 * 1000  // 3 minutes during active hours
        },
        JITTER: 30 * 1000       // Random delay up to 30 seconds to prevent thundering herd
    },
    
    // Concurrency and rate limiting
    MAX_CONCURRENT_UPDATES: 3,   // Increased from 2
    RATE_LIMIT: {
        UPDATES_PER_MINUTE: 20,
        BURST_SIZE: 5
    },
    
    // WebSocket configuration
    WEBSOCKET: {
        HEARTBEAT_INTERVAL: 30000,    // 30 seconds
        HEARTBEAT_TIMEOUT: 60000,     // 60 seconds
        RECONNECT_DELAY: 5000,        // 5 seconds
        MAX_RECONNECT_ATTEMPTS: 5
    },
    
    // Queue processing
    QUEUE: {
        MAX_PROCESS_TIME: 15000,      // 15 seconds (increased from 10)
        PROCESS_DELAY: 1000,          // 1 second between batches
        BATCH_SIZE: 5,                // Process 5 updates per batch
        MAX_QUEUE_SIZE: 100           // Maximum items in queue
    },
    
    // Retry configuration
    RETRY: {
        MAX_ATTEMPTS: 3,
        BASE_DELAY: 5000,             // 5 seconds
        MAX_DELAY: 30000,             // 30 seconds
        JITTER: true,                 // Add randomness to retry delays
        BACKOFF_FACTOR: 2             // Exponential backoff multiplier
    },
    
    // Cache configuration
    CACHE: {
        TTL: 2 * 60 * 1000,          // 2 minutes (increased from 1)
        STALE_TTL: 5 * 60 * 1000,    // Keep stale data for 5 minutes
        STALE_WHILE_REVALIDATE: true,
        MAX_ITEMS: 1000,              // Maximum items in cache
        PRUNE_INTERVAL: 60 * 1000,    // Cleanup every minute
        STORAGE: {
            TYPE: 'memory',           // Could be extended to support Redis
            COMPRESSION: true         // Compress cached data
        }
    }
};

/**
 * Message manager configuration
 */
export const MESSAGE_MANAGER = {
    // Message tracking
    MAX_MESSAGES_PER_CHANNEL: 20,     // Increased from 10
    MESSAGE_TTL: 24 * 60 * 60 * 1000, // 24 hours
    
    // Cleanup configuration
    CLEANUP: {
        INTERVAL: 60 * 60 * 1000,     // Run cleanup every hour
        BATCH_SIZE: 100,              // Process 100 messages per cleanup
        MAX_PROCESS_TIME: 5000        // Maximum cleanup time per batch
    },
    
    // Update batching
    BATCH: {
        MAX_SIZE: 10,                 // Maximum updates to batch together
        DELAY: 1000,                  // Wait 1 second to batch updates
        MAX_DELAY: 5000              // Maximum time to wait for batching
    }
};
