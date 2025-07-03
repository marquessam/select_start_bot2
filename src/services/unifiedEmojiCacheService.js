// src/services/unifiedEmojiCacheService.js - UNIFIED HIGH-PERFORMANCE EMOJI CACHING
import mongoose from 'mongoose';
import { GachaItem, TrophyEmoji, safeQuery } from '../models/index.js';

class UnifiedEmojiCacheService {
    constructor() {
        // Multi-tier caching system
        this.gachaEmojiCache = new Map();
        this.trophyEmojiCache = new Map();
        this.formattedEmojiCache = new Map(); // Cache formatted emoji strings
        this.itemLookupCache = new Map(); // Cache reverse lookups
        
        // Cache metadata
        this.lastGachaRefresh = 0;
        this.lastTrophyRefresh = 0;
        this.isRefreshing = false;
        this.initializationComplete = false;
        
        // PERFORMANCE: Configurable cache settings
        this.config = {
            gachaCacheTTL: 30 * 60 * 1000,        // 30 minutes for gacha emojis
            trophyCacheTTL: 60 * 60 * 1000,       // 1 hour for trophy emojis
            formattedCacheTTL: 2 * 60 * 60 * 1000, // 2 hours for formatted strings
            maxCacheSize: 2000,                    // Maximum entries per cache
            refreshTimeout: 20000,                 // 20 seconds max for refresh
            queryTimeout: 10000,                   // 10 seconds max for individual queries
            backgroundRefreshThreshold: 0.8        // Refresh when 80% of TTL elapsed
        };
        
        // Performance metrics
        this.stats = {
            gachaHits: 0,
            gachaMisses: 0,
            trophyHits: 0,
            trophyMisses: 0,
            formattedHits: 0,
            formattedMisses: 0,
            refreshCount: 0,
            errorCount: 0
        };
        
        // Auto-initialize
        this.initialize();
    }

    /**
     * PERFORMANCE: Safe initialization with progressive enhancement
     */
    async initialize() {
        try {
            console.log('🎭 Initializing Unified Emoji Cache Service...');
            
            if (mongoose.connection.readyState === 1) {
                await this.performInitialLoad();
            } else {
                // Wait for database connection with timeout
                this.waitForDatabaseConnection();
            }
            
            // Start background refresh scheduler
            this.startBackgroundRefresh();
            
            // Start periodic cleanup
            this.startPeriodicCleanup();
            
            console.log('✅ Unified Emoji Cache Service initialized');
            
        } catch (error) {
            console.error('❌ Error initializing emoji cache service:', error);
            this.initializationComplete = true; // Continue with fallbacks
        }
    }

    /**
     * PERFORMANCE: Non-blocking database connection waiting
     */
    waitForDatabaseConnection() {
        const checkConnection = () => {
            if (mongoose.connection.readyState === 1) {
                console.log('📦 Database connected, performing initial emoji cache load...');
                this.performInitialLoad().catch(error => {
                    console.warn('⚠️ Initial emoji cache load failed:', error.message);
                });
            } else {
                setTimeout(checkConnection, 1000);
            }
        };
        
        setTimeout(checkConnection, 1000);
    }

    /**
     * PERFORMANCE: Parallel initial data loading
     */
    async performInitialLoad() {
        try {
            const [gachaResult, trophyResult] = await Promise.allSettled([
                this.refreshGachaEmojis(),
                this.refreshTrophyEmojis()
            ]);
            
            if (gachaResult.status === 'fulfilled' && gachaResult.value.success) {
                console.log(`✅ Gacha emojis loaded: ${gachaResult.value.count} items`);
            } else {
                console.warn('⚠️ Gacha emoji loading failed, using fallbacks');
            }
            
            if (trophyResult.status === 'fulfilled' && trophyResult.value.success) {
                console.log(`✅ Trophy emojis loaded: ${trophyResult.value.count} items`);
            } else {
                console.warn('⚠️ Trophy emoji loading failed, using fallbacks');
            }
            
            this.initializationComplete = true;
            
        } catch (error) {
            console.error('❌ Error in initial emoji load:', error);
            this.initializationComplete = true;
        }
    }

    /**
     * PERFORMANCE: Optimized gacha emoji refresh with connection checking
     */
    async refreshGachaEmojis() {
        if (this.isRefreshing) {
            return { success: true, cached: true };
        }

        if (mongoose.connection.readyState !== 1) {
            return { success: false, error: 'Database not connected' };
        }

        this.isRefreshing = true;
        
        try {
            console.log('🔄 Refreshing gacha emoji cache...');
            
            const gachaItems = await safeQuery(
                () => GachaItem.find({})
                    .select('itemId emojiId emojiName isAnimated itemName rarity')
                    .lean(),
                this.config.queryTimeout,
                []
            );
            
            if (!gachaItems || gachaItems.length === 0) {
                console.warn('⚠️ No gacha items found for emoji cache');
                return { success: false, error: 'No items found' };
            }
            
            console.log(`📦 Processing ${gachaItems.length} gacha items for emoji cache`);
            
            // Clear and rebuild cache efficiently
            this.gachaEmojiCache.clear();
            this.itemLookupCache.clear();
            
            let cached = 0;
            for (const item of gachaItems) {
                // Cache by emoji ID
                if (item.emojiId && item.emojiName) {
                    this.gachaEmojiCache.set(item.emojiId, {
                        name: item.emojiName,
                        isAnimated: item.isAnimated || false,
                        itemName: item.itemName,
                        itemId: item.itemId,
                        rarity: item.rarity,
                        timestamp: Date.now()
                    });
                    cached++;
                }
                
                // Cache by item ID for reverse lookups
                this.itemLookupCache.set(`item_${item.itemId}`, {
                    emojiId: item.emojiId,
                    emojiName: item.emojiName,
                    isAnimated: item.isAnimated || false,
                    itemName: item.itemName,
                    rarity: item.rarity,
                    timestamp: Date.now()
                });
            }
            
            this.lastGachaRefresh = Date.now();
            this.stats.refreshCount++;
            
            console.log(`✅ Gacha emoji cache refreshed: ${cached} entries cached`);
            
            return { success: true, count: cached };
            
        } catch (error) {
            console.error('❌ Error refreshing gacha emoji cache:', error.message);
            this.stats.errorCount++;
            return { success: false, error: error.message };
            
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * PERFORMANCE: Optimized trophy emoji refresh
     */
    async refreshTrophyEmojis() {
        if (mongoose.connection.readyState !== 1) {
            return { success: false, error: 'Database not connected' };
        }

        try {
            console.log('🏆 Refreshing trophy emoji cache...');
            
            const trophyEmojis = await safeQuery(
                () => TrophyEmoji.find({})
                    .select('challengeType monthKey emojiId emojiName isAnimated')
                    .lean(),
                this.config.queryTimeout,
                []
            );
            
            if (!trophyEmojis || trophyEmojis.length === 0) {
                console.warn('⚠️ No trophy emojis found for cache');
                return { success: false, error: 'No trophies found' };
            }
            
            console.log(`🏆 Processing ${trophyEmojis.length} trophy emojis for cache`);
            
            // Clear and rebuild cache
            this.trophyEmojiCache.clear();
            
            let cached = 0;
            for (const emoji of trophyEmojis) {
                const key = `${emoji.challengeType}_${emoji.monthKey}`;
                this.trophyEmojiCache.set(key, {
                    emojiId: emoji.emojiId,
                    emojiName: emoji.emojiName,
                    isAnimated: emoji.isAnimated || false,
                    challengeType: emoji.challengeType,
                    monthKey: emoji.monthKey,
                    timestamp: Date.now()
                });
                cached++;
            }
            
            this.lastTrophyRefresh = Date.now();
            
            console.log(`✅ Trophy emoji cache refreshed: ${cached} entries cached`);
            
            return { success: true, count: cached };
            
        } catch (error) {
            console.error('❌ Error refreshing trophy emoji cache:', error.message);
            this.stats.errorCount++;
            return { success: false, error: error.message };
        }
    }

    /**
     * PERFORMANCE: High-speed emoji formatting with multi-tier caching
     */
    formatEmoji(emojiId, emojiName, isAnimated = false) {
        // Fast path: check formatted emoji cache first
        const formatKey = `${emojiId || 'no-id'}_${emojiName || 'no-name'}_${isAnimated}`;
        const cachedFormatted = this.formattedEmojiCache.get(formatKey);
        
        if (cachedFormatted && Date.now() - cachedFormatted.timestamp < this.config.formattedCacheTTL) {
            this.stats.formattedHits++;
            return cachedFormatted.formatted;
        }
        
        this.stats.formattedMisses++;
        
        // Format the emoji
        let formatted;
        if (emojiId && emojiName) {
            const prefix = isAnimated ? 'a' : '';
            formatted = `<${prefix}:${emojiName}:${emojiId}>`;
        } else if (emojiName) {
            formatted = emojiName;
        } else {
            formatted = '❓';
        }
        
        // Cache the formatted result
        this.formattedEmojiCache.set(formatKey, {
            formatted,
            timestamp: Date.now()
        });
        
        return formatted;
    }

    /**
     * PERFORMANCE: Optimized gacha emoji retrieval with fallbacks
     */
    getGachaEmoji(emojiId) {
        if (!emojiId) {
            this.stats.gachaMisses++;
            return this.getFallbackGachaEmoji();
        }
        
        const cached = this.gachaEmojiCache.get(emojiId);
        if (cached && Date.now() - cached.timestamp < this.config.gachaCacheTTL) {
            this.stats.gachaHits++;
            return {
                emojiId: emojiId,
                emojiName: cached.name,
                isAnimated: cached.isAnimated,
                itemName: cached.itemName,
                itemId: cached.itemId,
                rarity: cached.rarity
            };
        }
        
        this.stats.gachaMisses++;
        
        // Background refresh if cache is stale
        this.scheduleBackgroundRefresh('gacha');
        
        return this.getFallbackGachaEmoji();
    }

    /**
     * PERFORMANCE: Optimized gacha emoji by item ID
     */
    getGachaEmojiByItemId(itemId) {
        if (!itemId) {
            this.stats.gachaMisses++;
            return this.getFallbackGachaEmoji();
        }
        
        const cached = this.itemLookupCache.get(`item_${itemId}`);
        if (cached && Date.now() - cached.timestamp < this.config.gachaCacheTTL) {
            this.stats.gachaHits++;
            return {
                emojiId: cached.emojiId,
                emojiName: cached.emojiName,
                isAnimated: cached.isAnimated,
                itemName: cached.itemName,
                rarity: cached.rarity
            };
        }
        
        this.stats.gachaMisses++;
        this.scheduleBackgroundRefresh('gacha');
        return this.getFallbackGachaEmoji();
    }

    /**
     * PERFORMANCE: Optimized trophy emoji retrieval
     */
    getTrophyEmoji(challengeType, monthKey) {
        const key = `${challengeType}_${monthKey}`;
        const cached = this.trophyEmojiCache.get(key);
        
        if (cached && Date.now() - cached.timestamp < this.config.trophyCacheTTL) {
            this.stats.trophyHits++;
            return {
                emojiId: cached.emojiId,
                emojiName: cached.emojiName,
                isAnimated: cached.isAnimated,
                challengeType: cached.challengeType,
                monthKey: cached.monthKey
            };
        }
        
        this.stats.trophyMisses++;
        this.scheduleBackgroundRefresh('trophy');
        
        // Fallback emoji based on challenge type
        const fallbacks = {
            monthly: '🏆',
            shadow: '👤',
            community: '🌟'
        };
        
        return {
            emojiId: null,
            emojiName: fallbacks[challengeType] || '❓',
            isAnimated: false,
            challengeType,
            monthKey
        };
    }

    /**
     * Get fallback gacha emoji
     */
    getFallbackGachaEmoji() {
        return {
            emojiId: null,
            emojiName: '❓',
            isAnimated: false,
            itemName: 'Unknown Item',
            itemId: 'unknown',
            rarity: 'common'
        };
    }

    /**
     * PERFORMANCE: Smart background refresh scheduling
     */
    scheduleBackgroundRefresh(type) {
        const refreshKey = `${type}_refresh_scheduled`;
        
        // Prevent multiple scheduled refreshes
        if (this[refreshKey]) return;
        this[refreshKey] = true;
        
        // Schedule background refresh
        setTimeout(async () => {
            try {
                if (type === 'gacha') {
                    await this.refreshGachaEmojis();
                } else if (type === 'trophy') {
                    await this.refreshTrophyEmojis();
                }
            } catch (error) {
                console.error(`Background ${type} emoji refresh failed:`, error.message);
            } finally {
                this[refreshKey] = false;
            }
        }, 1000); // Small delay to batch requests
    }

    /**
     * PERFORMANCE: Start background refresh scheduler
     */
    startBackgroundRefresh() {
        setInterval(() => {
            const now = Date.now();
            
            // Check if gacha cache needs refresh
            if (now - this.lastGachaRefresh > this.config.gachaCacheTTL * this.config.backgroundRefreshThreshold) {
                this.scheduleBackgroundRefresh('gacha');
            }
            
            // Check if trophy cache needs refresh
            if (now - this.lastTrophyRefresh > this.config.trophyCacheTTL * this.config.backgroundRefreshThreshold) {
                this.scheduleBackgroundRefresh('trophy');
            }
            
        }, 60000); // Check every minute
    }

    /**
     * PERFORMANCE: Periodic cache cleanup with size management
     */
    startPeriodicCleanup() {
        setInterval(() => {
            this.cleanupExpiredEntries();
            this.enforceCacheSizeLimits();
        }, 5 * 60 * 1000); // Clean every 5 minutes
    }

    /**
     * Clean up expired cache entries
     */
    cleanupExpiredEntries() {
        const now = Date.now();
        let cleaned = 0;
        
        // Clean formatted emoji cache
        for (const [key, value] of this.formattedEmojiCache.entries()) {
            if (now - value.timestamp > this.config.formattedCacheTTL) {
                this.formattedEmojiCache.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} expired emoji cache entries`);
        }
    }

    /**
     * Enforce cache size limits using LRU strategy
     */
    enforceCacheSizeLimits() {
        const caches = [
            { cache: this.gachaEmojiCache, name: 'gacha' },
            { cache: this.trophyEmojiCache, name: 'trophy' },
            { cache: this.formattedEmojiCache, name: 'formatted' },
            { cache: this.itemLookupCache, name: 'lookup' }
        ];
        
        for (const { cache, name } of caches) {
            if (cache.size > this.config.maxCacheSize) {
                // Convert to array and sort by timestamp (oldest first)
                const entries = Array.from(cache.entries())
                    .sort(([,a], [,b]) => (a.timestamp || 0) - (b.timestamp || 0));
                
                // Remove oldest entries
                const toRemove = cache.size - this.config.maxCacheSize;
                for (let i = 0; i < toRemove; i++) {
                    cache.delete(entries[i][0]);
                }
                
                console.log(`📏 Enforced size limit on ${name} cache: removed ${toRemove} entries`);
            }
        }
    }

    /**
     * PERFORMANCE: Manual cache refresh for admin use
     */
    async refreshAll() {
        console.log('🔄 Manual refresh of all emoji caches...');
        
        const [gachaResult, trophyResult] = await Promise.allSettled([
            this.refreshGachaEmojis(),
            this.refreshTrophyEmojis()
        ]);
        
        // Clear formatted cache to ensure fresh formatting
        this.formattedEmojiCache.clear();
        
        return {
            gacha: gachaResult.status === 'fulfilled' ? gachaResult.value : { success: false, error: gachaResult.reason.message },
            trophy: trophyResult.status === 'fulfilled' ? trophyResult.value : { success: false, error: trophyResult.reason.message }
        };
    }

    /**
     * Get comprehensive cache statistics
     */
    getCacheStats() {
        const now = Date.now();
        
        return {
            gacha: {
                size: this.gachaEmojiCache.size,
                lastRefresh: this.lastGachaRefresh,
                age: now - this.lastGachaRefresh,
                needsRefresh: now - this.lastGachaRefresh > this.config.gachaCacheTTL,
                hits: this.stats.gachaHits,
                misses: this.stats.gachaMisses,
                hitRate: this.stats.gachaHits / (this.stats.gachaHits + this.stats.gachaMisses) * 100 || 0
            },
            trophy: {
                size: this.trophyEmojiCache.size,
                lastRefresh: this.lastTrophyRefresh,
                age: now - this.lastTrophyRefresh,
                needsRefresh: now - this.lastTrophyRefresh > this.config.trophyCacheTTL,
                hits: this.stats.trophyHits,
                misses: this.stats.trophyMisses,
                hitRate: this.stats.trophyHits / (this.stats.trophyHits + this.stats.trophyMisses) * 100 || 0
            },
            formatted: {
                size: this.formattedEmojiCache.size,
                hits: this.stats.formattedHits,
                misses: this.stats.formattedMisses,
                hitRate: this.stats.formattedHits / (this.stats.formattedHits + this.stats.formattedMisses) * 100 || 0
            },
            lookup: {
                size: this.itemLookupCache.size
            },
            overall: {
                refreshCount: this.stats.refreshCount,
                errorCount: this.stats.errorCount,
                isRefreshing: this.isRefreshing,
                initializationComplete: this.initializationComplete,
                databaseConnected: mongoose.connection.readyState === 1
            }
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            gachaHits: 0,
            gachaMisses: 0,
            trophyHits: 0,
            trophyMisses: 0,
            formattedHits: 0,
            formattedMisses: 0,
            refreshCount: 0,
            errorCount: 0
        };
        console.log('📊 Emoji cache statistics reset');
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        console.log('⚙️ Emoji cache configuration updated:', newConfig);
    }
}

// Export singleton instance
export const unifiedEmojiCache = new UnifiedEmojiCacheService();
export default unifiedEmojiCache;
