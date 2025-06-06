// src/config/gachaEmojis.js - UPDATED with animated emoji support
import mongoose from 'mongoose';
import { GachaItem } from '../models/GachaItem.js';

// Cache for emoji data
let emojiCache = new Map();
let cacheLastUpdated = 0;
let isRefreshing = false;
let initializationComplete = false;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_DB_WAIT_TIME = 30000; // 30 seconds max wait for database
const REFRESH_TIMEOUT = 15000; // 15 seconds max for refresh operations

// Default fallback emojis by rarity
const DEFAULT_GACHA_EMOJIS = {
    common: '⚪',
    uncommon: '🟢',
    rare: '🔵',
    epic: '🟣',
    legendary: '🟡',
    mythic: '🌈'
};

// UTILITY: Check if database is connected
function isDatabaseConnected() {
    return mongoose.connection.readyState === 1;
}

// DISABLE OLD CACHING - Enhanced to prevent conflicts
function disableOldEmojiCaching() {
    console.log('🔧 Disabling old gacha emoji caching mechanisms...');
    
    // Clear any existing intervals
    if (global.gachaEmojiInterval) {
        clearInterval(global.gachaEmojiInterval);
        global.gachaEmojiInterval = null;
        console.log('✅ Cleared old gacha emoji interval');
    }
    
    if (global.emojiCacheTimeout) {
        clearTimeout(global.emojiCacheTimeout);
        global.emojiCacheTimeout = null;
        console.log('✅ Cleared emoji cache timeout');
    }
    
    // Clear any global emoji cache variables
    if (global.gachaEmojiCache) {
        global.gachaEmojiCache = null;
        console.log('✅ Cleared global gacha emoji cache');
    }
    
    console.log('✅ Old gacha emoji caching mechanisms disabled');
}

// MAIN: Get gacha emoji with timeout protection
async function getGachaEmoji(itemId) {
    try {
        if (!isDatabaseConnected()) {
            return { emojiId: null, emojiName: '❓', isAnimated: false };
        }

        // Auto-refresh cache if needed (background, non-blocking)
        const now = Date.now();
        if (now - cacheLastUpdated > CACHE_DURATION && !isRefreshing) {
            refreshCache().catch(error => {
                console.warn('Background gacha emoji cache refresh failed:', error.message);
            });
        }

        // Try cache first
        const cached = emojiCache.get(itemId);
        if (cached?.emojiId) {
            return { 
                emojiId: cached.emojiId, 
                emojiName: cached.emojiName,
                isAnimated: cached.isAnimated || false
            };
        }

        // Try database with timeout protection
        try {
            const item = await Promise.race([
                GachaItem.findOne({ itemId }).select('emojiId emojiName isAnimated').lean(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Database query timeout')), 5000)
                )
            ]);
            
            if (item?.emojiId) {
                const emojiData = {
                    emojiId: item.emojiId,
                    emojiName: item.emojiName,
                    isAnimated: item.isAnimated || false
                };
                emojiCache.set(itemId, emojiData);
                return emojiData;
            }
        } catch (dbError) {
            console.warn('DB query failed for gacha emoji:', dbError.message);
        }

        return { emojiId: null, emojiName: '❓', isAnimated: false };
    } catch (error) {
        console.error('Error getting gacha emoji:', error.message);
        return { emojiId: null, emojiName: '❓', isAnimated: false };
    }
}

// UPDATED: Format emoji for display (handles animated emojis)
function formatGachaEmoji(emojiId, emojiName, isAnimated = false) {
    if (emojiId && emojiName) {
        const prefix = isAnimated ? 'a' : '';
        return `<${prefix}:${emojiName}:${emojiId}>`;
    }
    return emojiName || '❓';
}

// NEW: Format emoji from emoji data object
function formatGachaEmojiFromData(emojiData) {
    if (!emojiData) return '❓';
    return formatGachaEmoji(emojiData.emojiId, emojiData.emojiName, emojiData.isAnimated);
}

// INTERNAL: Refresh cache with timeout protection
async function refreshCache() {
    if (isRefreshing || !isDatabaseConnected()) {
        return;
    }

    isRefreshing = true;
    
    try {
        console.log('🔄 Refreshing gacha emoji cache...');
        
        const items = await Promise.race([
            GachaItem.find({ isActive: true }).select('itemId emojiId emojiName isAnimated').lean(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Refresh timeout')), REFRESH_TIMEOUT)
            )
        ]);
        
        emojiCache.clear();
        let cached = 0;
        
        items.forEach(item => {
            if (item.emojiId && item.emojiName) {
                emojiCache.set(item.itemId, {
                    emojiId: item.emojiId,
                    emojiName: item.emojiName,
                    isAnimated: item.isAnimated || false
                });
                cached++;
            }
        });
        
        cacheLastUpdated = Date.now();
        console.log(`✅ Gacha emoji cache: ${cached} items cached`);
        
    } catch (error) {
        console.error('❌ Gacha emoji cache refresh failed:', error.message);
    } finally {
        isRefreshing = false;
    }
}

// PUBLIC: For old code compatibility
async function refreshGachaEmojiCache() {
    if (!isDatabaseConnected()) {
        console.log('⚠️ Cannot refresh gacha emoji cache - database not connected');
        return;
    }
    return refreshCache();
}

// UTILITY: Clear cache
function clearGachaEmojiCache() {
    emojiCache.clear();
    cacheLastUpdated = 0;
    console.log('🗑️ Gacha emoji cache cleared');
}

// UTILITY: Cache info
function getGachaEmojiCacheInfo() {
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

    console.log('📦 Starting gacha emoji cache initialization...');
    
    if (isDatabaseConnected()) {
        console.log('📦 Database connected, initializing gacha emoji cache...');
        await refreshCache().catch(error => {
            console.warn('Initial gacha emoji cache refresh failed:', error.message);
        });
        initializationComplete = true;
    } else {
        console.log('⏳ Waiting for database connection for gacha emoji cache...');
        
        // Wait for database connection with timeout
        const waitForConnection = new Promise((resolve) => {
            let elapsedTime = 0;
            const checkInterval = 1000; // Check every second
            
            const checkConnection = () => {
                if (isDatabaseConnected()) {
                    console.log('📦 Database connected, initializing gacha emoji cache...');
                    refreshCache().catch(error => {
                        console.warn('Initial gacha emoji cache refresh failed:', error.message);
                    });
                    initializationComplete = true;
                    resolve();
                } else if (elapsedTime >= MAX_DB_WAIT_TIME) {
                    console.warn('⚠️ Database connection timeout for gacha emoji cache, using fallbacks');
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
    
    console.log('✅ Gacha emoji cache initialization complete');
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
            console.log('🔄 Gacha emoji cache refreshed');
        } else {
            console.log('ℹ️ Database not connected, skipping gacha emoji refresh');
        }
    } catch (error) {
        console.warn('Gacha emoji cache refresh failed:', error.message);
    }
}

// Disable old caching immediately
disableOldEmojiCaching();

// FIXED: Initialize with timeout protection (non-blocking)
(async () => {
    try {
        await initCache();
    } catch (error) {
        console.error('Failed to initialize gacha emoji cache:', error.message);
        console.log('   Continuing with fallback emojis...');
        initializationComplete = true;
    }
})();

// EXPORTS
export {
    DEFAULT_GACHA_EMOJIS,
    getGachaEmoji,
    formatGachaEmoji,
    formatGachaEmojiFromData,
    refreshGachaEmojiCache,
    clearGachaEmojiCache,
    getGachaEmojiCacheInfo,
    disableOldEmojiCaching,
    safeCacheRefresh
};

// Default export for compatibility
export default {
    DEFAULT_GACHA_EMOJIS,
    getGachaEmoji,
    formatGachaEmoji,
    formatGachaEmojiFromData,
    refreshGachaEmojiCache,
    clearGachaEmojiCache,
    getGachaEmojiCacheInfo,
    disableOldEmojiCaching,
    safeCacheRefresh
};
