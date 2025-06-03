// src/config/trophyEmojis.js - FIXED VERSION with proper connection handling
import mongoose from 'mongoose';
import { TrophyEmoji } from '../models/TrophyEmoji.js';

// Default fallback emojis by award level
const DEFAULT_EMOJIS = {
    mastery: '✨',
    beaten: '⭐', 
    participation: '🏁',
    special: '🎖️'
};

// Cache for emoji data to avoid repeated database calls
let emojiCache = new Map();
let cacheLastUpdated = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let isRefreshing = false;

// Helper function to check if database is connected
function isDatabaseConnected() {
    return mongoose.connection.readyState === 1;
}

// Helper function to get trophy emoji from database - WITH CONNECTION CHECKS
async function getTrophyEmoji(challengeType, monthKey, awardLevel) {
    try {
        // Check database connection first
        if (!isDatabaseConnected()) {
            console.warn('⚠️ Database not connected, using fallback trophy emoji');
            return {
                emojiId: null,
                emojiName: DEFAULT_EMOJIS[awardLevel] || '🏆'
            };
        }

        // Check if we need to refresh cache
        const now = Date.now();
        if (now - cacheLastUpdated > CACHE_DURATION && !isRefreshing) {
            // Don't await to avoid blocking
            refreshEmojiCacheInternal().catch(error => {
                console.error('Background trophy emoji cache refresh failed:', error.message);
            });
        }

        // Try to get custom emoji from cache first
        if (challengeType === 'monthly' || challengeType === 'shadow') {
            const cacheKey = `${challengeType}_${monthKey}`;
            const emoji = emojiCache.get(cacheKey);
            
            if (emoji && emoji.emojiId) {
                return {
                    emojiId: emoji.emojiId,
                    emojiName: emoji.emojiName
                };
            }
        }
        
        // Fall back to default emoji
        return {
            emojiId: null,
            emojiName: DEFAULT_EMOJIS[awardLevel] || '🏆'
        };
    } catch (error) {
        console.error('Error getting trophy emoji:', error.message);
        // Always provide fallback on error
        return {
            emojiId: null,
            emojiName: DEFAULT_EMOJIS[awardLevel] || '🏆'
        };
    }
}

// Utility function to format emoji for display
function formatTrophyEmoji(emojiId, emojiName) {
    if (emojiId && emojiName) {
        return `<:${emojiName}:${emojiId}>`;
    }
    return emojiName || '🏆';
}

// Function to refresh emoji cache from database - WITH SAFETY CHECKS
async function refreshEmojiCacheInternal() {
    if (isRefreshing) {
        console.log('🏆 Trophy emoji cache refresh already in progress, skipping...');
        return;
    }

    if (!isDatabaseConnected()) {
        console.warn('⚠️ Database not connected, skipping trophy emoji cache refresh');
        return;
    }

    isRefreshing = true;
    
    try {
        console.log('🔄 Refreshing trophy emoji cache...');
        
        // Use Promise.race for timeout protection
        const allEmojis = await Promise.race([
            TrophyEmoji.find({}).select('challengeType monthKey emojiId emojiName').lean(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Trophy cache refresh timeout')), 15000))
        ]);
        
        // Clear existing cache
        emojiCache.clear();
        
        // Populate cache
        let cachedCount = 0;
        allEmojis.forEach(emoji => {
            if (emoji.emojiId && emoji.emojiName) {
                const cacheKey = `${emoji.challengeType}_${emoji.monthKey}`;
                emojiCache.set(cacheKey, {
                    emojiId: emoji.emojiId,
                    emojiName: emoji.emojiName
                });
                cachedCount++;
            }
        });
        
        cacheLastUpdated = Date.now();
        console.log(`✅ Trophy emoji cache refreshed with ${cachedCount} emojis (${allEmojis.length} total)`);
        
    } catch (error) {
        console.error('❌ Error refreshing trophy emoji cache:', error.message);
        
        // If cache is empty and refresh failed, at least we have fallbacks
        if (emojiCache.size === 0) {
            console.log('🔄 Trophy cache refresh failed, but fallback emojis available');
        }
    } finally {
        isRefreshing = false;
    }
}

// SAFE version for old code compatibility
export const refreshTrophyEmojiCache = async () => {
    if (!isDatabaseConnected()) {
        console.log('⚠️ Old trophy emoji cache function called - database not connected');
        return;
    }
    console.log('🔄 Old trophy emoji cache function called - delegating to new safe version');
    return refreshEmojiCacheInternal();
};

// Function to manually clear cache (useful after updates)
function clearEmojiCache() {
    emojiCache.clear();
    cacheLastUpdated = 0;
    console.log('🗑️ Trophy emoji cache cleared');
}

// Function to get cached emoji count (for debugging)
function getEmojiCacheInfo() {
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
        console.log('🏆 Database connected, initializing trophy emoji cache...');
        refreshEmojiCacheInternal().catch(error => {
            console.error('Initial trophy emoji cache failed:', error.message);
        });
    } else {
        console.log('⏳ Database not ready, trophy emoji cache will initialize later...');
        
        // Set up a one-time listener for when connection is ready
        if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 2) {
            const connectionHandler = () => {
                console.log('🏆 Database connected, late-initializing trophy emoji cache...');
                refreshEmojiCacheInternal().catch(error => {
                    console.error('Late trophy emoji cache init failed:', error.message);
                });
                mongoose.connection.off('connected', connectionHandler);
            };
            mongoose.connection.on('connected', connectionHandler);
        }
    }
}

// Initialize cache safely (not on module load)
setTimeout(initializeCache, 100);

// Export all functions
export {
    DEFAULT_EMOJIS,
    getTrophyEmoji,
    formatTrophyEmoji,
    clearEmojiCache,
    getEmojiCacheInfo,
    refreshEmojiCacheInternal as safeCacheRefresh,
    refreshTrophyEmojiCache
};
