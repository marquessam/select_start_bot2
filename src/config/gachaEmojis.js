// src/config/gachaEmojis.js - FIXED VERSION with proper connection handling
import mongoose from 'mongoose';
import { GachaItem } from '../models/GachaItem.js';

// Cache for emoji data to avoid repeated database calls
let emojiCache = new Map();
let cacheLastUpdated = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let isRefreshing = false;

// Default fallback emojis by rarity
const DEFAULT_GACHA_EMOJIS = {
    common: '⚪',
    uncommon: '🟢',
    rare: '🔵',
    epic: '🟣',
    legendary: '🟡',
    mythic: '🌈'
};

// DISABLE OLD CACHING MECHANISMS
export const disableOldEmojiCaching = () => {
    console.log('🔧 Disabling any old emoji caching mechanisms...');
    
    // Clear any existing intervals that might be calling emoji refresh
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
    
    // Clear any pending timeouts
    if (global.emojiCacheTimeout) {
        clearTimeout(global.emojiCacheTimeout);
        global.emojiCacheTimeout = null;
        console.log('✅ Cleared emoji cache timeout');
    }
    
    console.log('✅ Old emoji caching mechanisms disabled');
};

// Helper function to check if database is connected
function isDatabaseConnected() {
    return mongoose.connection.readyState === 1;
}

// Helper function to get gacha emoji - WITH CONNECTION CHECKS
async function getGachaEmoji(itemId) {
    try {
        // Check database connection first
        if (!isDatabaseConnected()) {
            console.warn('⚠️ Database not connected, using fallback emoji for', itemId);
            return {
                emojiId: null,
                emojiName: '❓'
            };
        }

        // Check if we need to refresh cache
        const now = Date.now();
        if (now - cacheLastUpdated > CACHE_DURATION && !isRefreshing) {
            // Don't await to avoid blocking
            refreshGachaEmojiCacheInternal().catch(error => {
                console.error('Background emoji cache refresh failed:', error.message);
            });
        }

        // Try to get emoji from cache first
        const emoji = emojiCache.get(itemId);
        
        if (emoji && emoji.emojiId) {
            return {
                emojiId: emoji.emojiId,
                emojiName: emoji.emojiName
            };
        }
        
        // If not in cache, get directly from database (with timeout protection)
        try {
            const gachaItem = await Promise.race([
                GachaItem.findOne({ itemId }).select('emojiId emojiName').lean(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 5000))
            ]);
            
            if (gachaItem && gachaItem.emojiId) {
                // Cache the result
                emojiCache.set(itemId, {
                    emojiId: gachaItem.emojiId,
                    emojiName: gachaItem.emojiName
                });
                
                return {
                    emojiId: gachaItem.emojiId,
                    emojiName: gachaItem.emojiName
                };
            }
        } catch (dbError) {
            console.warn('Database query failed for emoji, using fallback:', dbError.message);
        }
        
        // Fall back to default emoji
        return {
            emojiId: null,
            emojiName: '❓'
        };
    } catch (error) {
        console.error('Error getting gacha emoji:', error.message);
        // Always provide fallback on error
        return {
            emojiId: null,
            emojiName: '❓'
        };
    }
}

// Utility function to format emoji for display
function formatGachaEmoji(emojiId, emojiName) {
    if (emojiId && emojiName) {
        return `<:${emojiName}:${emojiId}>`;
    }
    return emojiName || '❓';
}

// Function to refresh emoji cache from database - WITH SAFETY CHECKS
async function refreshGachaEmojiCacheInternal() {
    if (isRefreshing) {
        console.log('📦 Gacha emoji cache refresh already in progress, skipping...');
        return;
    }

    if (!isDatabaseConnected()) {
        console.warn('⚠️ Database not connected, skipping gacha emoji cache refresh');
        return;
    }

    isRefreshing = true;
    
    try {
        console.log('🔄 Refreshing gacha emoji cache...');
        
        // Use Promise.race for timeout protection
        const allItems = await Promise.race([
            GachaItem.find({ isActive: true }).select('itemId emojiId emojiName').lean(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Cache refresh timeout')), 15000))
        ]);
        
        // Clear existing cache
        emojiCache.clear();
        
        // Populate cache
        let cachedCount = 0;
        allItems.forEach(item => {
            if (item.emojiId && item.emojiName) {
                emojiCache.set(item.itemId, {
                    emojiId: item.emojiId,
                    emojiName: item.emojiName
                });
                cachedCount++;
            }
        });
        
        cacheLastUpdated = Date.now();
        console.log(`✅ Gacha emoji cache refreshed with ${cachedCount} items (${allItems.length} total)`);
        
    } catch (error) {
        console.error('❌ Error refreshing gacha emoji cache:', error.message);
        
        // If cache is empty and refresh failed, at least we have fallbacks
        if (emojiCache.size === 0) {
            console.log('🔄 Cache refresh failed, but fallback emojis available');
        }
    } finally {
        isRefreshing = false;
    }
}

// SAFE version for old code compatibility
export const refreshGachaEmojiCache = async () => {
    if (!isDatabaseConnected()) {
        console.log('⚠️ Old gacha emoji cache function called - database not connected');
        return;
    }
    console.log('🔄 Old gacha emoji cache function called - delegating to new safe version');
    return refreshGachaEmojiCacheInternal();
};

// Function to manually clear cache (useful after updates)
function clearGachaEmojiCache() {
    emojiCache.clear();
    cacheLastUpdated = 0;
    console.log('🗑️ Gacha emoji cache cleared');
}

// Function to get cache info for debugging
function getGachaEmojiCacheInfo() {
    return {
        size: emojiCache.size,
        lastUpdated: cacheLastUpdated ? new Date(cacheLastUpdated).toISOString() : 'Never',
        isRefreshing,
        databaseConnected: isDatabaseConnected(),
        entries: Array.from(emojiCache.entries()).slice(0, 5) // First 5 for debugging
    };
}

// Safe initialization - only if database is connected
function initializeCache() {
    if (isDatabaseConnected()) {
        console.log('📦 Database connected, initializing gacha emoji cache...');
        refreshGachaEmojiCacheInternal().catch(error => {
            console.error('Initial gacha emoji cache failed:', error.message);
        });
    } else {
        console.log('⏳ Database not ready, gacha emoji cache will initialize later...');
        
        // Set up a one-time listener for when connection is ready
        if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 2) {
            const connectionHandler = () => {
                console.log('📦 Database connected, late-initializing gacha emoji cache...');
                refreshGachaEmojiCacheInternal().catch(error => {
                    console.error('Late gacha emoji cache init failed:', error.message);
                });
                mongoose.connection.off('connected', connectionHandler);
            };
            mongoose.connection.on('connected', connectionHandler);
        }
    }
}

// Call disable function immediately
disableOldEmojiCaching();

// Initialize cache safely (not on module load)
setTimeout(initializeCache, 100);

// Export all functions
export {
    DEFAULT_GACHA_EMOJIS,
    getGachaEmoji,
    formatGachaEmoji,
    clearGachaEmojiCache,
    getGachaEmojiCacheInfo,
    refreshGachaEmojiCacheInternal as safeCacheRefresh
};
