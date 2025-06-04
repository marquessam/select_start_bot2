// src/config/trophyEmojis.js - COMPLETE FIXED VERSION with timeout protection
import mongoose from 'mongoose';
import { TrophyEmoji } from '../models/TrophyEmoji.js';

// Cache for emoji data
let emojiCache = new Map();
let cacheLastUpdated = 0;
let isRefreshing = false;
let initializationComplete = false;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_DB_WAIT_TIME = 30000; // 30 seconds max wait for database
const REFRESH_TIMEOUT = 15000; // 15 seconds max for refresh operations

// Default fallback emojis by award level
const DEFAULT_EMOJIS = {
    mastery: '✨',
    beaten: '⭐', 
    participation: '🏁',
    special: '🎖️',
    monthly: '🗓️',
    shadow: '👥',
    gold: '🥇',
    silver: '🥈',
    bronze: '🥉'
};

// UTILITY: Check if database is connected
function isDatabaseConnected() {
    return mongoose.connection.readyState === 1;
}

// DISABLE OLD CACHING - Enhanced to prevent conflicts
function disableOldTrophyEmojiCaching() {
    console.log('🔧 Disabling old trophy emoji caching mechanisms...');
    
    // Clear any existing intervals
    if (global.trophyEmojiInterval) {
        clearInterval(global.trophyEmojiInterval);
        global.trophyEmojiInterval = null;
        console.log('✅ Cleared old trophy emoji interval');
    }
    
    if (global.trophyEmojiTimeout) {
        clearTimeout(global.trophyEmojiTimeout);
        global.trophyEmojiTimeout = null;
        console.log('✅ Cleared trophy emoji timeout');
    }
    
    // Clear any global emoji cache variables
    if (global.trophyEmojiCache) {
        global.trophyEmojiCache = null;
        console.log('✅ Cleared global trophy emoji cache');
    }
    
    console.log('✅ Old trophy emoji caching mechanisms disabled');
}

// MAIN: Get trophy emoji with timeout protection
async function getTrophyEmoji(challengeType, monthKey, awardLevel) {
    try {
        if (!isDatabaseConnected()) {
            return { emojiId: null, emojiName: DEFAULT_EMOJIS[awardLevel] || '🏆' };
        }

        // Auto-refresh cache if needed (background, non-blocking)
        const now = Date.now();
        if (now - cacheLastUpdated > CACHE_DURATION && !isRefreshing) {
            refreshCache().catch(error => {
                console.warn('Background trophy emoji cache refresh failed:', error.message);
            });
        }

        // Try cache for monthly/shadow challenges
        if (challengeType === 'monthly' || challengeType === 'shadow') {
            const cacheKey = `${challengeType}_${monthKey}`;
            const cached = emojiCache.get(cacheKey);
            
            if (cached?.emojiId) {
                return { emojiId: cached.emojiId, emojiName: cached.emojiName };
            }

            // Try database with timeout protection
            try {
                const emoji = await Promise.race([
                    TrophyEmoji.findOne({ challengeType, monthKey }).select('emojiId emojiName').lean(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Database query timeout')), 5000)
                    )
                ]);
                
                if (emoji?.emojiId) {
                    emojiCache.set(cacheKey, { emojiId: emoji.emojiId, emojiName: emoji.emojiName });
                    return { emojiId: emoji.emojiId, emojiName: emoji.emojiName };
                }
            } catch (dbError) {
                console.warn('DB query failed for trophy emoji:', dbError.message);
            }
        }
        
        // Fall back to default
        return { emojiId: null, emojiName: DEFAULT_EMOJIS[awardLevel] || '🏆' };
    } catch (error) {
        console.error('Error getting trophy emoji:', error.message);
        return { emojiId: null, emojiName: DEFAULT_EMOJIS[awardLevel] || '🏆' };
    }
}

// UTILITY: Format emoji for display
function formatTrophyEmoji(emojiId, emojiName) {
    if (emojiId && emojiName) {
        return `<:${emojiName}:${emojiId}>`;
    }
    return emojiName || '🏆';
}

// INTERNAL: Refresh cache with timeout protection
async function refreshCache() {
    if (isRefreshing || !isDatabaseConnected()) {
        return;
    }

    isRefreshing = true;
    
    try {
        console.log('🔄 Refreshing trophy emoji cache...');
        
        const emojis = await Promise.race([
            TrophyEmoji.find({}).select('challengeType monthKey emojiId emojiName').lean(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Refresh timeout')), REFRESH_TIMEOUT)
            )
        ]);
        
        emojiCache.clear();
        let cached = 0;
        
        emojis.forEach(emoji => {
            if (emoji.emojiId && emoji.emojiName) {
                const cacheKey = `${emoji.challengeType}_${emoji.monthKey}`;
                emojiCache.set(cacheKey, {
                    emojiId: emoji.emojiId,
                    emojiName: emoji.emojiName
                });
                cached++;
            }
        });
        
        cacheLastUpdated = Date.now();
        console.log(`✅ Trophy emoji cache: ${cached} emojis cached`);
        
    } catch (error) {
        console.error('❌ Trophy emoji cache refresh failed:', error.message);
    } finally {
        isRefreshing = false;
    }
}

// PUBLIC: For old code compatibility
async function refreshTrophyEmojiCache() {
    if (!isDatabaseConnected()) {
        console.log('⚠️ Cannot refresh trophy emoji cache - database not connected');
        return;
    }
    return refreshCache();
}

// UTILITY: Clear cache
function clearEmojiCache() {
    emojiCache.clear();
    cacheLastUpdated = 0;
    console.log('🗑️ Trophy emoji cache cleared');
}

// UTILITY: Cache info
function getEmojiCacheInfo() {
    return {
        size: emojiCache.size,
        lastUpdated: cacheLastUpdated ? new Date(cacheLastUpdated).toISOString() : 'Never',
        isRefreshing,
        databaseConnected: isDatabaseConnected(),
        initializationComplete
    };
}

// FIXED: Safe initialization with timeout protection
async function initCache() {
    if (initializationComplete) {
        return; // Prevent multiple initializations
    }

    console.log('🏆 Starting trophy emoji cache initialization...');
    
    if (isDatabaseConnected()) {
        console.log('🏆 Database connected, initializing trophy emoji cache...');
        await refreshCache().catch(error => {
            console.warn('Initial trophy emoji cache refresh failed:', error.message);
        });
        initializationComplete = true;
    } else {
        console.log('⏳ Waiting for database connection for trophy emoji cache...');
        
        // Wait for database connection with timeout
        const waitForConnection = new Promise((resolve) => {
            let elapsedTime = 0;
            const checkInterval = 1000; // Check every second
            
            const checkConnection = () => {
                if (isDatabaseConnected()) {
                    console.log('🏆 Database connected, initializing trophy emoji cache...');
                    refreshCache().catch(error => {
                        console.warn('Initial trophy emoji cache refresh failed:', error.message);
                    });
                    initializationComplete = true;
                    resolve();
                } else if (elapsedTime >= MAX_DB_WAIT_TIME) {
                    console.warn('⚠️ Database connection timeout for trophy emoji cache, using fallbacks');
                    initializationComplete = true;
                    resolve();
                } else {
                    elapsedTime += checkInterval;
                    setTimeout(checkConnection, checkInterval);
                }
            };
            
            checkConnection();
        });
        
        await waitForConnection;
    }
    
    console.log('✅ Trophy emoji cache initialization complete');
}

// ENHANCED: Safe cache refresh for external calls
async function safeCacheRefresh() {
    try {
        if (!initializationComplete) {
            await initCache();
            return;
        }

        // Only refresh if database is connected
        if (isDatabaseConnected()) {
            await refreshCache();
            console.log('🔄 Trophy emoji cache refreshed');
        } else {
            console.log('ℹ️ Database not connected, skipping trophy emoji refresh');
        }
    } catch (error) {
        console.warn('Trophy emoji cache refresh failed:', error.message);
    }
}

// Disable old caching immediately
disableOldTrophyEmojiCaching();

// FIXED: Initialize with timeout protection (non-blocking)
(async () => {
    try {
        await initCache();
    } catch (error) {
        console.error('Failed to initialize trophy emoji cache:', error.message);
        console.log('   Continuing with fallback emojis...');
        initializationComplete = true;
    }
})();

// EXPORTS
export {
    DEFAULT_EMOJIS,
    getTrophyEmoji,
    formatTrophyEmoji,
    refreshTrophyEmojiCache,
    clearEmojiCache,
    getEmojiCacheInfo,
    disableOldTrophyEmojiCaching,
    safeCacheRefresh
};

// Default export for compatibility
export default {
    DEFAULT_EMOJIS,
    getTrophyEmoji,
    formatTrophyEmoji,
    refreshTrophyEmojiCache,
    clearEmojiCache,
    getEmojiCacheInfo,
    disableOldTrophyEmojiCaching,
    safeCacheRefresh
};
