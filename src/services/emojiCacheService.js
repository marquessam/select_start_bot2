// src/services/emojiCacheService.js - NEW FILE to replace problematic emoji caching
import { GachaItem, TrophyEmoji, safeQuery } from '../models/index.js';

class EmojiCacheService {
    constructor() {
        this.gachaEmojiCache = new Map();
        this.trophyEmojiCache = new Map();
        this.lastGachaRefresh = 0;
        this.lastTrophyRefresh = 0;
        this.refreshInterval = 300000; // 5 minutes
        this.isRefreshing = false;
    }

    // FIXED: Gacha emoji refresh with proper timeout handling
    async refreshGachaEmojis() {
        if (this.isRefreshing) {
            console.log('📦 Gacha emoji refresh already in progress, skipping...');
            return { success: true, cached: true };
        }

        this.isRefreshing = true;
        const maxRetries = 3;
        
        try {
            console.log('🔄 Refreshing gacha emoji cache...');
            
            // Use safeQuery with timeout and retries
            const gachaItems = await safeQuery(
                () => GachaItem.find({})
                    .select('itemId emojiId emojiName itemName rarity')
                    .lean()
                    .timeout(20000),
                25000, // 25 second overall timeout
                [] // Return empty array on failure
            );
            
            if (!gachaItems) {
                console.warn('⚠️ Gacha emoji query returned null, using empty cache');
                return { success: false, error: 'Query failed' };
            }
            
            console.log(`📦 Found ${gachaItems.length} gacha items for emoji cache`);
            
            // Clear and rebuild cache
            this.gachaEmojiCache.clear();
            
            for (const item of gachaItems) {
                if (item.emojiId && item.emojiName) {
                    this.gachaEmojiCache.set(item.emojiId, {
                        name: item.emojiName,
                        itemName: item.itemName,
                        itemId: item.itemId,
                        rarity: item.rarity
                    });
                }
                
                // Also cache by itemId for reverse lookups
                if (item.itemId) {
                    this.gachaEmojiCache.set(`item_${item.itemId}`, {
                        emojiId: item.emojiId,
                        name: item.emojiName,
                        itemName: item.itemName,
                        rarity: item.rarity
                    });
                }
            }
            
            this.lastGachaRefresh = Date.now();
            console.log(`✅ Gacha emoji cache refreshed successfully (${this.gachaEmojiCache.size} entries)`);
            
            return { success: true, count: gachaItems.length };
            
        } catch (error) {
            console.error('❌ Error refreshing gacha emoji cache:', error.message);
            
            // Don't throw error, just return failure status
            return { success: false, error: error.message };
            
        } finally {
            this.isRefreshing = false;
        }
    }

    // FIXED: Trophy emoji refresh with proper timeout handling  
    async refreshTrophyEmojis() {
        try {
            console.log('🏆 Refreshing trophy emoji cache...');
            
            // Use safeQuery with timeout
            const trophyEmojis = await safeQuery(
                () => TrophyEmoji.find({})
                    .select('challengeType monthKey emojiId emojiName')
                    .lean()
                    .timeout(20000),
                25000,
                []
            );
            
            if (!trophyEmojis) {
                console.warn('⚠️ Trophy emoji query returned null, using empty cache');
                return { success: false, error: 'Query failed' };
            }
            
            console.log(`🏆 Found ${trophyEmojis.length} trophy emojis for cache`);
            
            // Clear and rebuild cache
            this.trophyEmojiCache.clear();
            
            for (const emoji of trophyEmojis) {
                const key = `${emoji.challengeType}_${emoji.monthKey}`;
                this.trophyEmojiCache.set(key, {
                    emojiId: emoji.emojiId,
                    emojiName: emoji.emojiName,
                    challengeType: emoji.challengeType,
                    monthKey: emoji.monthKey
                });
            }
            
            this.lastTrophyRefresh = Date.now();
            console.log(`✅ Trophy emoji cache refreshed successfully (${this.trophyEmojiCache.size} entries)`);
            
            return { success: true, count: trophyEmojis.length };
            
        } catch (error) {
            console.error('❌ Error refreshing trophy emoji cache:', error.message);
            return { success: false, error: error.message };
        }
    }

    // Get gacha emoji by ID with fallback
    getGachaEmoji(emojiId) {
        const cached = this.gachaEmojiCache.get(emojiId);
        if (cached) return cached;
        
        // Fallback emoji
        return {
            name: '❓',
            itemName: 'Unknown Item',
            itemId: 'unknown',
            rarity: 'common'
        };
    }

    // Get gacha emoji by item ID
    getGachaEmojiByItemId(itemId) {
        const cached = this.gachaEmojiCache.get(`item_${itemId}`);
        if (cached) return cached;
        
        return {
            emojiId: null,
            name: '❓',
            itemName: 'Unknown Item',
            rarity: 'common'
        };
    }

    // Get trophy emoji with fallback
    getTrophyEmoji(challengeType, monthKey) {
        const key = `${challengeType}_${monthKey}`;
        const cached = this.trophyEmojiCache.get(key);
        if (cached) return cached;
        
        // Fallback emoji based on challenge type
        const fallbacks = {
            monthly: '🏆',
            shadow: '👤', 
            community: '🌟'
        };
        
        return {
            emojiId: null,
            emojiName: fallbacks[challengeType] || '❓',
            challengeType,
            monthKey
        };
    }

    // Check if caches need refresh
    needsGachaRefresh() {
        return Date.now() - this.lastGachaRefresh > this.refreshInterval;
    }

    needsTrophyRefresh() {
        return Date.now() - this.lastTrophyRefresh > this.refreshInterval;
    }

    // Auto-refresh if needed (non-blocking)
    async autoRefreshIfNeeded() {
        // Don't block on refresh operations
        if (this.needsGachaRefresh() && !this.isRefreshing) {
            this.refreshGachaEmojis().catch(error => {
                console.error('Auto-refresh gacha emojis failed:', error.message);
            });
        }
        
        if (this.needsTrophyRefresh()) {
            this.refreshTrophyEmojis().catch(error => {
                console.error('Auto-refresh trophy emojis failed:', error.message);
            });
        }
    }

    // Get cache statistics
    getCacheStats() {
        return {
            gacha: {
                size: this.gachaEmojiCache.size,
                lastRefresh: this.lastGachaRefresh,
                needsRefresh: this.needsGachaRefresh()
            },
            trophy: {
                size: this.trophyEmojiCache.size,
                lastRefresh: this.lastTrophyRefresh,
                needsRefresh: this.needsTrophyRefresh()
            },
            isRefreshing: this.isRefreshing
        };
    }

    // Manual refresh all (for admin commands)
    async refreshAll() {
        console.log('🔄 Manual refresh of all emoji caches...');
        
        const [gachaResult, trophyResult] = await Promise.allSettled([
            this.refreshGachaEmojis(),
            this.refreshTrophyEmojis()
        ]);
        
        return {
            gacha: gachaResult.status === 'fulfilled' ? gachaResult.value : { success: false, error: gachaResult.reason.message },
            trophy: trophyResult.status === 'fulfilled' ? trophyResult.value : { success: false, error: trophyResult.reason.message }
        };
    }
}

// Export singleton instance
export const emojiCacheService = new EmojiCacheService();
export default emojiCacheService;

// Usage example for replacing existing emoji cache functions:
/*
// OLD (causing timeouts):
const gachaItems = await GachaItem.find({}).timeout(10000);

// NEW (safe):
import emojiCacheService from './services/emojiCacheService.js';

// Get emoji safely
const emoji = emojiCacheService.getGachaEmoji(emojiId);

// Refresh if needed (non-blocking)
emojiCacheService.autoRefreshIfNeeded();
*/
