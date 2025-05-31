// src/config/gachaEmojis.js - NEW FILE - Copy the trophy emoji formatting approach
import { GachaItem } from '../models/GachaItem.js';

// Cache for emoji data to avoid repeated database calls
let emojiCache = new Map();
let cacheLastUpdated = 0;
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

// Helper function to get gacha emoji - EXACTLY like trophy system
async function getGachaEmoji(itemId) {
    try {
        // Check if we need to refresh cache
        const now = Date.now();
        if (now - cacheLastUpdated > CACHE_DURATION) {
            await refreshGachaEmojiCache();
        }

        // Try to get emoji from cache first
        const emoji = emojiCache.get(itemId);
        
        if (emoji && emoji.emojiId) {
            return {
                emojiId: emoji.emojiId,
                emojiName: emoji.emojiName
            };
        }
        
        // If not in cache, get directly from database
        const gachaItem = await GachaItem.findOne({ itemId });
        if (gachaItem && gachaItem.emojiId) {
            return {
                emojiId: gachaItem.emojiId,
                emojiName: gachaItem.emojiName
            };
        }
        
        // Fall back to default emoji
        return {
            emojiId: null,
            emojiName: '❓'
        };
    } catch (error) {
        console.error('Error getting gacha emoji:', error);
        // Always provide fallback on error
        return {
            emojiId: null,
            emojiName: '❓'
        };
    }
}

// Utility function to format emoji for display - EXACTLY like trophy system
function formatGachaEmoji(emojiId, emojiName) {
    if (emojiId) {
        return `<:${emojiName}:${emojiId}>`;
    }
    return emojiName || '❓';
}

// Function to refresh emoji cache from database
async function refreshGachaEmojiCache() {
    try {
        const allItems = await GachaItem.find({ isActive: true });
        
        // Clear existing cache
        emojiCache.clear();
        
        // Populate cache
        allItems.forEach(item => {
            if (item.emojiId) {
                emojiCache.set(item.itemId, {
                    emojiId: item.emojiId,
                    emojiName: item.emojiName
                });
            }
        });
        
        cacheLastUpdated = Date.now();
        console.log(`Gacha emoji cache refreshed with ${allItems.length} items`);
    } catch (error) {
        console.error('Error refreshing gacha emoji cache:', error);
    }
}

// Function to manually clear cache (useful after updates)
function clearGachaEmojiCache() {
    emojiCache.clear();
    cacheLastUpdated = 0;
}

// Initialize cache on module load
refreshGachaEmojiCache().catch(console.error);

// Export all functions
export {
    DEFAULT_GACHA_EMOJIS,
    getGachaEmoji,
    formatGachaEmoji,
    clearGachaEmojiCache,
    refreshGachaEmojiCache
};
