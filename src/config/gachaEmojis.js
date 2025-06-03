// src/config/gachaEmojis.js - CLEAN REWRITE
import mongoose from 'mongoose';
import { GachaItem } from '../models/GachaItem.js';

// Cache for emoji data
let emojiCache = new Map();
let cacheLastUpdated = 0;
let isRefreshing = false;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

// DISABLE OLD CACHING
function disableOldEmojiCaching() {
    console.log('🔧 Disabling old emoji caching mechanisms...');
    
    if (global.gachaEmojiInterval) {
        clearInterval(global.gachaEmojiInterval);
        global.gachaEmojiInterval = null;
        console.log('✅ Cleared old gacha emoji interval');
    }
    
    if (global.trophyEmojiInterval) {
        clearInterval(global.trophyEmojiInterval);
        global.trophyEmojiInterval = null;
        console.log('✅ Cleared old trophy emoji interval');
    }
    
    if (global.emojiCacheTimeout) {
        clearTimeout(global.emojiCacheTimeout);
        global.emojiCacheTimeout = null;
        console.log('✅ Cleared emoji cache timeout');
    }
    
    console.log('✅ Old emoji caching mechanisms disabled');
}

// MAIN: Get gacha emoji
async function getGachaEmoji(itemId) {
    try {
        if (!isDatabaseConnected()) {
            return { emojiId: null, emojiName: '❓' };
        }

        // Auto-refresh cache if needed (background)
        const now = Date.now();
        if (now - cacheLastUpdated > CACHE_DURATION && !isRefreshing) {
            refreshCache().catch(console.error);
        }

        // Try cache first
        const cached = emojiCache.get(itemId);
        if (cached?.emojiId) {
            return { emojiId: cached.emojiId, emojiName: cached.emojiName };
        }

        // Try database
        try {
            const item = await Promise.race([
                GachaItem.findOne({ itemId }).select('emojiId emojiName').lean(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);
            
            if (item?.emojiId) {
                emojiCache.set(itemId, { emojiId: item.emojiId, emojiName: item.emojiName });
                return { emojiId: item.emojiId, emojiName: item.emojiName };
            }
        } catch (dbError) {
            console.warn('DB query failed for gacha emoji:', dbError.message);
        }

        return { emojiId: null, emojiName: '❓' };
    } catch (error) {
        console.error('Error getting gacha emoji:', error.message);
        return { emojiId: null, emojiName: '❓' };
    }
}

// UTILITY: Format emoji for display
function formatGachaEmoji(emojiId, emojiName) {
    if (emojiId && emojiName) {
        return `<:${emojiName}:${emojiId}>`;
    }
    return emojiName || '❓';
}

// INTERNAL: Refresh cache
async function refreshCache() {
    if (isRefreshing || !isDatabaseConnected()) {
        return;
    }

    isRefreshing = true;
    
    try {
        console.log('🔄 Refreshing gacha emoji cache...');
        
        const items = await Promise.race([
            GachaItem.find({ isActive: true }).select('itemId emojiId emojiName').lean(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
        ]);
        
        emojiCache.clear();
        let cached = 0;
        
        items.forEach(item => {
            if (item.emojiId && item.emojiName) {
                emojiCache.set(item.itemId, {
                    emojiId: item.emojiId,
                    emojiName: item.emojiName
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
        databaseConnected: isDatabaseConnected()
    };
}

// INIT: Safe initialization
function initCache() {
    if (isDatabaseConnected()) {
        console.log('📦 Initializing gacha emoji cache...');
        refreshCache().catch(console.error);
    } else {
        console.log('⏳ Waiting for database connection for gacha emoji cache...');
        
        const onConnect = () => {
            console.log('📦 Database ready, initializing gacha emoji cache...');
            refreshCache().catch(console.error);
            mongoose.connection.off('connected', onConnect);
        };
        
        if (mongoose.connection.readyState === 2) {
            mongoose.connection.on('connected', onConnect);
        }
    }
}

// Disable old caching immediately
disableOldEmojiCaching();

// Initialize after a short delay
setTimeout(initCache, 100);

// EXPORTS
export {
    DEFAULT_GACHA_EMOJIS,
    getGachaEmoji,
    formatGachaEmoji,
    refreshGachaEmojiCache,
    clearGachaEmojiCache,
    getGachaEmojiCacheInfo,
    disableOldEmojiCaching
};

export const safeCacheRefresh = refreshCache;
