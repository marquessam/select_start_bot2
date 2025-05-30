// src/config/trophyEmojis.js - Database-driven trophy emoji configuration
import { TrophyEmoji } from '../models/TrophyEmoji.js';

// Default fallback emojis by award level
export const DEFAULT_EMOJIS = {
    mastery: '✨',
    beaten: '⭐', 
    participation: '🏁',
    special: '🎖️'
};

// Cache for emoji data to avoid repeated database calls
let emojiCache = new Map();
let cacheLastUpdated = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper function to get trophy emoji from database
export async function getTrophyEmoji(challengeType, monthKey, awardLevel) {
    try {
        // Check if we need to refresh cache
        const now = Date.now();
        if (now - cacheLastUpdated > CACHE_DURATION) {
            await refreshEmojiCache();
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
        console.error('Error getting trophy emoji:', error);
        // Always provide fallback on error
        return {
            emojiId: null,
            emojiName: DEFAULT_EMOJIS[awardLevel] || '🏆'
        };
    }
}

// Utility function to format emoji for display
export function formatTrophyEmoji(emojiId, emojiName) {
    if (emojiId) {
        return `<:${emojiName}:${emojiId}>`;
    }
    return emojiName || '🏆';
}

// Function to refresh emoji cache from database
async function refreshEmojiCache() {
    try {
        const allEmojis = await TrophyEmoji.getAllEmojis();
        
        // Clear existing cache
        emojiCache.clear();
        
        // Populate cache
        allEmojis.forEach(emoji => {
            const cacheKey = `${emoji.challengeType}_${emoji.monthKey}`;
            emojiCache.set(cacheKey, {
                emojiId: emoji.emojiId,
                emojiName: emoji.emojiName
            });
        });
        
        cacheLastUpdated = Date.now();
        console.log(`Trophy emoji cache refreshed with ${allEmojis.length} emojis`);
    } catch (error) {
        console.error('Error refreshing emoji cache:', error);
    }
}

// Function to manually clear cache (useful after updates)
export function clearEmojiCache() {
    emojiCache.clear();
    cacheLastUpdated = 0;
}

// Function to get cached emoji count (for debugging)
export function getEmojiCacheInfo() {
    return {
        size: emojiCache.size,
        lastUpdated: new Date(cacheLastUpdated).toISOString(),
        entries: Array.from(emojiCache.entries())
    };
}

// Initialize cache on module load
refreshEmojiCache().catch(console.error);

// Export all functions
export {
    getTrophyEmoji,
    formatTrophyEmoji,
    clearEmojiCache,
    getEmojiCacheInfo,
    refreshEmojiCache
};
