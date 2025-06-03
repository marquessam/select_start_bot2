// src/config/trophyEmojis.js - CLEAN REWRITE
import mongoose from 'mongoose';
import { TrophyEmoji } from '../models/TrophyEmoji.js';

// Cache for emoji data
let emojiCache = new Map();
let cacheLastUpdated = 0;
let isRefreshing = false;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Default fallback emojis by award level
const DEFAULT_EMOJIS = {
    mastery: '✨',
    beaten: '⭐', 
    participation: '🏁',
    special: '🎖️'
};

// UTILITY: Check if database is connected
function isDatabaseConnected() {
    return mongoose.connection.readyState === 1;
}

// MAIN: Get trophy emoji
async function getTrophyEmoji(challengeType, monthKey, awardLevel) {
    try {
        if (!isDatabaseConnected()) {
            return { emojiId: null, emojiName: DEFAULT_EMOJIS[awardLevel] || '🏆' };
        }

        // Auto-refresh cache if needed (background)
        const now = Date.now();
        if (now - cacheLastUpdated > CACHE_DURATION && !isRefreshing) {
            refreshCache().catch(console.error);
        }

        // Try cache for monthly/shadow challenges
        if (challengeType === 'monthly' || challengeType === 'shadow') {
            const cacheKey = `${challengeType}_${monthKey}`;
            const cached = emojiCache.get(cacheKey);
            
            if (cached?.emojiId) {
                return { emojiId: cached.emojiId, emojiName: cached.emojiName };
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

// INTERNAL: Refresh cache
async function refreshCache() {
    if (isRefreshing || !isDatabaseConnected()) {
        return;
    }

    isRefreshing = true;
    
    try {
        console.log('🔄 Refreshing trophy emoji cache...');
        
        const emojis = await Promise.race([
            TrophyEmoji.find({}).select('challengeType monthKey emojiId emojiName').lean(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000))
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
        databaseConnected: isDatabaseConnected()
    };
}

// INIT: Safe initialization
function initCache() {
    if (isDatabaseConnected()) {
        console.log('🏆 Initializing trophy emoji cache...');
        refreshCache().catch(console.error);
    } else {
        console.log('⏳ Waiting for database connection for trophy emoji cache...');
        
        const onConnect = () => {
            console.log('🏆 Database ready, initializing trophy emoji cache...');
            refreshCache().catch(console.error);
            mongoose.connection.off('connected', onConnect);
        };
        
        if (mongoose.connection.readyState === 2) {
            mongoose.connection.on('connected', onConnect);
        }
    }
}

// Initialize after a short delay
setTimeout(initCache, 100);

// EXPORTS
export {
    DEFAULT_EMOJIS,
    getTrophyEmoji,
    formatTrophyEmoji,
    refreshTrophyEmojiCache,
    clearEmojiCache,
    getEmojiCacheInfo
};

export const safeCacheRefresh = refreshCache;
