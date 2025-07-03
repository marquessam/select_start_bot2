// src/services/gachaService.js - PERFORMANCE OPTIMIZED VERSION
import { User } from '../models/User.js';
import { GachaItem } from '../models/GachaItem.js';
import combinationService from './combinationService.js';

// Pull costs
const PULL_COSTS = {
    single: 50,
    multi: 150
};

// UPDATED: Flat rarity percentages
const RARITY_PERCENTAGES = {
    common: 45,      // 45%
    uncommon: 35,    // 35%
    rare: 15,        // 15%
    epic: 4,         // 4%
    legendary: 1,    // 1%
    mythic: 0        // 0% - special events only
};

// PERFORMANCE: Advanced caching system
const gachaItemPoolCache = new Map();
const rarityPoolsCache = new Map();
const collectionSummaryCache = new Map();
const seriesItemsCache = new Map();
let lastPoolRefresh = 0;
const POOL_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for item pools
const SUMMARY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for summaries
const SERIES_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for series data

class GachaService {
    constructor() {
        this.rarityWeights = {
            common: 50,
            uncommon: 30,
            rare: 15,
            epic: 4,
            legendary: 1
        };
        
        // PERFORMANCE: Pre-computed rarity data for fast access
        this.rarityData = {
            common: { emoji: '⚪', name: 'Common', color: '#95A5A6' },
            uncommon: { emoji: '🟢', name: 'Uncommon', color: '#2ECC71' },
            rare: { emoji: '🔵', name: 'Rare', color: '#3498DB' },
            epic: { emoji: '🟣', name: 'Epic', color: '#9B59B6' },
            legendary: { emoji: '🟡', name: 'Legendary', color: '#F1C40F' },
            mythic: { emoji: '🌟', name: 'Mythic', color: '#E91E63' }
        };
        
        // Initialize item pool cache on startup
        this.initializeCache();
    }

    /**
     * PERFORMANCE: Initialize cache on startup
     */
    async initializeCache() {
        try {
            await this.refreshGachaItemPool();
            console.log('✅ Gacha service cache initialized');
        } catch (error) {
            console.error('❌ Failed to initialize gacha service cache:', error);
        }
    }

    /**
     * PERFORMANCE: Cached gacha item pool management
     */
    async refreshGachaItemPool() {
        try {
            console.log('🔄 Refreshing gacha item pool cache...');
            
            // Fetch all active gacha items once
            const availableItems = await GachaItem.find({
                isActive: true,
                dropRate: { $gt: 0 }
            }).lean(); // Use lean() for better performance
            
            if (availableItems.length === 0) {
                console.warn('⚠️ No available gacha items found');
                return;
            }

            // Clear and rebuild caches
            gachaItemPoolCache.clear();
            rarityPoolsCache.clear();
            
            // Group items by rarity for efficient selection
            const itemsByRarity = {};
            for (const item of availableItems) {
                if (!itemsByRarity[item.rarity]) {
                    itemsByRarity[item.rarity] = [];
                }
                itemsByRarity[item.rarity].push(item);
                
                // Cache individual items for quick lookup
                gachaItemPoolCache.set(item.itemId, item);
            }
            
            // Cache rarity pools for efficient random selection
            for (const [rarity, items] of Object.entries(itemsByRarity)) {
                rarityPoolsCache.set(rarity, items);
            }
            
            lastPoolRefresh = Date.now();
            
            console.log(`✅ Gacha pool cached: ${availableItems.length} items across ${Object.keys(itemsByRarity).length} rarities`);
            console.log('Rarity distribution:', Object.fromEntries(
                Object.entries(itemsByRarity).map(([rarity, items]) => [rarity, items.length])
            ));
            
        } catch (error) {
            console.error('❌ Error refreshing gacha item pool:', error);
        }
    }

    /**
     * PERFORMANCE: Check if cache needs refresh
     */
    async ensurePoolCacheValid() {
        if (Date.now() - lastPoolRefresh > POOL_CACHE_TTL || rarityPoolsCache.size === 0) {
            await this.refreshGachaItemPool();
        }
    }

    /**
     * PERFORMANCE: Optimized random item selection using cached pools
     */
    async selectRandomItem() {
        try {
            // Ensure cache is valid
            await this.ensurePoolCacheValid();
            
            if (rarityPoolsCache.size === 0) {
                console.error('No rarity pools available');
                return null;
            }

            // Calculate cumulative percentages for rarity selection
            const rarityRoll = Math.random() * 100;
            let cumulativePercent = 0;
            let selectedRarity = null;

            // Go through rarities in order of percentage (high to low)
            const sortedRarities = Object.entries(RARITY_PERCENTAGES)
                .sort(([,a], [,b]) => b - a);

            for (const [rarity, percentage] of sortedRarities) {
                cumulativePercent += percentage;
                
                // Skip if no items of this rarity exist in cache
                if (!rarityPoolsCache.has(rarity)) {
                    continue;
                }

                if (rarityRoll <= cumulativePercent) {
                    selectedRarity = rarity;
                    break;
                }
            }

            // Fallback: if no rarity selected, pick the first available
            if (!selectedRarity) {
                for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']) {
                    if (rarityPoolsCache.has(rarity)) {
                        selectedRarity = rarity;
                        break;
                    }
                }
            }

            if (!selectedRarity || !rarityPoolsCache.has(selectedRarity)) {
                console.error('No valid rarity found with available items');
                return null;
            }

            // Randomly select an item from the cached rarity pool
            const rarityItems = rarityPoolsCache.get(selectedRarity);
            const randomIndex = Math.floor(Math.random() * rarityItems.length);
            const selectedItem = rarityItems[randomIndex];

            console.log(`🎲 Rarity roll: ${rarityRoll.toFixed(2)}% → Selected: ${selectedRarity} (${RARITY_PERCENTAGES[selectedRarity]}% chance)`);
            console.log(`🎯 Selected item: ${selectedItem.itemName} from ${rarityItems.length} available ${selectedRarity} items`);

            return selectedItem;
        } catch (error) {
            console.error('Error selecting random item:', error);
            return null;
        }
    }

    /**
     * FIXED: Perform a gacha pull with enhanced retry logic and caching
     */
    async performPull(user, pullType = 'single') {
        const maxRetries = 3;
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🎰 Gacha pull attempt ${attempt}/${maxRetries} for user ${user.raUsername}`);
                return await this.performPullInternal(user, pullType, attempt);
            } catch (error) {
                lastError = error;
                
                if (error.name === 'VersionError') {
                    console.warn(`⚠️ Version conflict on attempt ${attempt}/${maxRetries}, retrying...`);
                    
                    if (attempt < maxRetries) {
                        // Progressive delay and user refresh
                        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
                        
                        try {
                            const freshUser = await User.findById(user._id);
                            if (!freshUser) {
                                throw new Error('User not found during retry');
                            }
                            
                            // Update user object with fresh data
                            Object.assign(user, freshUser.toObject());
                            user._doc = freshUser._doc;
                            user.__v = freshUser.__v;
                            user.isNew = false;
                            
                            console.log(`🔄 Refetched user data for retry ${attempt + 1}, version: ${user.__v}`);
                        } catch (refetchError) {
                            console.error('❌ Error refetching user for retry:', refetchError);
                            throw refetchError;
                        }
                        
                        continue;
                    }
                } else {
                    console.error(`❌ Non-retryable error on attempt ${attempt}:`, error);
                    throw error;
                }
            }
        }

        console.error(`❌ All ${maxRetries} attempts failed for user ${user.raUsername}`);
        throw new Error(`Gacha pull failed after ${maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * PERFORMANCE: Optimized pull internal logic with parallel operations
     */
    async performPullInternal(user, pullType, attemptNumber) {
        const cost = PULL_COSTS[pullType];
        const pullCount = pullType === 'multi' ? 4 : 1;

        console.log(`🎮 Performing ${pullType} pull for ${user.raUsername} (attempt ${attemptNumber})`);

        // Check GP
        if (!user.hasEnoughGp(cost)) {
            throw new Error(`Insufficient GP! You need ${cost} GP but only have ${user.gpBalance} GP.`);
        }

        // Deduct GP
        user.addGpTransaction('gacha_pull', -cost, `Gacha ${pullType} pull (${pullCount} items)`);

        // Initialize collection if needed
        if (!user.gachaCollection) {
            user.gachaCollection = [];
        }

        // PERFORMANCE: Parallel item selection for multi-pulls
        const itemPromises = [];
        for (let i = 0; i < pullCount; i++) {
            itemPromises.push(this.selectRandomItem());
        }
        
        const selectedItems = await Promise.all(itemPromises);
        
        // Process results
        const results = [];
        const newItemIds = [];
        
        for (const item of selectedItems) {
            if (item) {
                const result = this.addItemToUser(user, item);
                results.push(result);
                newItemIds.push(item.itemId);
            }
        }

        console.log(`📦 Added ${results.length} items to collection. Total size: ${user.gachaCollection.length}`);

        // PERFORMANCE: Parallel operations for completions and save
        const [completions] = await Promise.all([
            this.checkSeriesCompletions(user, results),
            user.save()
        ]);

        console.log(`💾 User saved successfully (version: ${user.__v})`);

        // PERFORMANCE: Check combinations with fresh data to avoid stale references
        let possibleCombinations = [];
        try {
            const freshUser = await User.findById(user._id);
            possibleCombinations = await combinationService.checkPossibleCombinations(freshUser);
            
            // Filter for relevant combinations
            const relevantCombinations = possibleCombinations.filter(combo => 
                combo.ingredients.some(ingredient => newItemIds.includes(ingredient.itemId))
            );

            possibleCombinations = relevantCombinations;
            console.log(`⚗️ Found ${relevantCombinations.length} relevant combinations`);
        } catch (combinationError) {
            console.error('❌ Error checking combinations:', combinationError);
            possibleCombinations = [];
        }

        return {
            results,
            completions,
            possibleCombinations,
            newBalance: user.gpBalance,
            cost,
            pullType
        };
    }

    /**
     * PERFORMANCE: Enhanced series completion checking with caching
     */
    async checkSeriesCompletions(user, newItems) {
        const completions = [];
        
        // Get unique series from new items
        const seriesIds = [...new Set(newItems
            .filter(item => item.seriesId)
            .map(item => item.seriesId))];

        if (seriesIds.length === 0) return completions;

        // PERFORMANCE: Parallel series completion checks
        const completionPromises = seriesIds.map(seriesId => 
            this.checkSingleSeriesCompletion(user, seriesId)
        );
        
        const completionResults = await Promise.all(completionPromises);
        
        for (const completion of completionResults) {
            if (completion) {
                completions.push(completion);
            }
        }

        return completions;
    }

    /**
     * PERFORMANCE: Cached series completion checking
     */
    async checkSingleSeriesCompletion(user, seriesId) {
        try {
            // Check cache first
            const cacheKey = `series_${seriesId}`;
            const cached = seriesItemsCache.get(cacheKey);
            let seriesItems;
            
            if (cached && Date.now() - cached.timestamp < SERIES_CACHE_TTL) {
                seriesItems = cached.data;
            } else {
                seriesItems = await GachaItem.find({ seriesId, isActive: true }).lean();
                seriesItemsCache.set(cacheKey, { data: seriesItems, timestamp: Date.now() });
            }
            
            if (seriesItems.length === 0) return null;

            // Check if user has all items in the series
            const userItems = user.gachaCollection.filter(item => item.seriesId === seriesId);
            const userItemIds = userItems.map(item => item.itemId);
            const requiredItemIds = seriesItems.map(item => item.itemId);
            const hasAllItems = requiredItemIds.every(id => userItemIds.includes(id));

            if (!hasAllItems) return null;

            // Check completion reward
            const seriesInfo = seriesItems[0];
            const completionReward = seriesInfo.completionReward;
            
            if (!completionReward) return null;

            const hasReward = user.gachaCollection.some(item => item.itemId === completionReward.itemId);
            if (hasReward) return null;

            // Award completion reward
            const rewardGachaItem = {
                itemId: completionReward.itemId,
                itemName: completionReward.itemName,
                itemType: 'special',
                seriesId: null,
                rarity: 'legendary',
                emojiId: completionReward.emojiId,
                emojiName: completionReward.emojiName,
                isAnimated: completionReward.isAnimated || false,
                maxStack: 1
            };

            user.addGachaItem(rewardGachaItem, 1, 'series_completion');

            return {
                seriesId,
                seriesName: `${seriesId.charAt(0).toUpperCase()}${seriesId.slice(1)} Collection`,
                rewardItem: completionReward,
                completedItems: requiredItemIds.length
            };
        } catch (error) {
            console.error(`❌ Error checking series completion for ${seriesId}:`, error);
            return null;
        }
    }

    /**
     * PERFORMANCE: Cached collection summary with optimized processing
     */
    getUserCollectionSummary(user) {
        const cacheKey = `summary_${user._id}_${user.gachaCollection?.length || 0}`;
        const cached = collectionSummaryCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < SUMMARY_CACHE_TTL) {
            return cached.data;
        }

        console.log('📊 Generating collection summary for user:', user.raUsername);

        if (!user.gachaCollection || user.gachaCollection.length === 0) {
            const summary = {
                totalItems: 0,
                uniqueItems: 0,
                rarityCount: {},
                recentItems: [],
                sourceBreakdown: {},
                seriesBreakdown: {}
            };
            collectionSummaryCache.set(cacheKey, { data: summary, timestamp: Date.now() });
            return summary;
        }

        // PERFORMANCE: Single pass through collection with efficient counting
        const rarityCount = Object.fromEntries(
            Object.keys(this.rarityData).map(rarity => [rarity, 0])
        );
        
        const sourceBreakdown = {
            gacha: 0,
            combined: 0,
            series_completion: 0,
            player_transfer: 0,
            store_purchase: 0
        };

        const seriesBreakdown = {};
        let totalItems = 0;
        
        for (const item of user.gachaCollection) {
            const quantity = item.quantity || 1;
            totalItems += quantity;
            
            // Count by rarity
            if (rarityCount[item.rarity] !== undefined) {
                rarityCount[item.rarity] += quantity;
            }
            
            // Count by source
            const source = item.source || 'gacha';
            if (sourceBreakdown[source] !== undefined) {
                sourceBreakdown[source] += quantity;
            } else {
                sourceBreakdown[source] = quantity;
            }

            // Track series
            const series = item.seriesId || 'Individual Items';
            if (!seriesBreakdown[series]) {
                seriesBreakdown[series] = [];
            }
            seriesBreakdown[series].push(item);
        }

        // Get recent items efficiently
        const recentItems = user.gachaCollection
            .slice() // Copy to avoid mutating original
            .sort((a, b) => new Date(b.obtainedAt) - new Date(a.obtainedAt))
            .slice(0, 5);

        const summary = {
            totalItems,
            uniqueItems: user.gachaCollection.length,
            rarityCount,
            recentItems,
            sourceBreakdown,
            seriesBreakdown
        };

        // Cache the result
        collectionSummaryCache.set(cacheKey, { data: summary, timestamp: Date.now() });

        console.log('📊 Collection summary cached:', {
            totalItems,
            uniqueItems: user.gachaCollection.length,
            seriesCount: Object.keys(seriesBreakdown).length
        });

        return summary;
    }

    /**
     * Enhanced item addition with better emoji data handling
     */
    addItemToUser(user, gachaItem) {
        console.log('🔧 Adding item to user:', {
            itemId: gachaItem.itemId,
            itemName: gachaItem.itemName,
            emojiData: {
                emojiId: gachaItem.emojiId,
                emojiName: gachaItem.emojiName,
                isAnimated: gachaItem.isAnimated
            }
        });

        const addResult = user.addGachaItem(gachaItem, 1, 'gacha');

        // Invalidate summary cache for this user
        for (const [key] of collectionSummaryCache.entries()) {
            if (key.includes(user._id)) {
                collectionSummaryCache.delete(key);
            }
        }

        return {
            itemId: gachaItem.itemId,
            itemName: gachaItem.itemName,
            rarity: gachaItem.rarity,
            emojiName: addResult.item.emojiName,
            emojiId: addResult.item.emojiId,
            isAnimated: addResult.item.isAnimated,
            description: gachaItem.description,
            flavorText: gachaItem.flavorText,
            quantity: addResult.item.quantity,
            maxStack: gachaItem.maxStack,
            isNew: addResult.isNew,
            wasStacked: addResult.wasStacked,
            atMaxStack: addResult.atMaxStack,
            itemType: gachaItem.itemType,
            seriesId: gachaItem.seriesId,
            source: 'gacha'
        };
    }

    /**
     * PERFORMANCE: Cached rarity distribution analysis
     */
    async analyzeRarityDistribution() {
        try {
            await this.ensurePoolCacheValid();
            
            const distribution = {};
            let totalItems = 0;
            
            for (const [rarity, items] of rarityPoolsCache.entries()) {
                distribution[rarity] = items.length;
                totalItems += items.length;
            }

            console.log('\n=== CACHED GACHA RARITY DISTRIBUTION ===');
            console.log('Configured percentages vs Available items:');
            
            for (const [rarity, percentage] of Object.entries(RARITY_PERCENTAGES)) {
                const itemCount = distribution[rarity] || 0;
                const actualChancePerItem = itemCount > 0 ? (percentage / itemCount).toFixed(3) : 0;
                console.log(`${rarity}: ${percentage}% chance → ${itemCount} items (${actualChancePerItem}% per item)`);
            }
            console.log(`Total items in gacha: ${totalItems}`);
            console.log('=========================================\n');

            return distribution;
        } catch (error) {
            console.error('Error analyzing rarity distribution:', error);
            return {};
        }
    }

    // Rarity system methods with cached data
    getRarityEmoji(rarity) {
        return this.rarityData[rarity]?.emoji || this.rarityData.common.emoji;
    }

    getRarityColor(rarity) {
        return this.rarityData[rarity]?.color || this.rarityData.common.color;
    }

    getRarityDisplayName(rarity) {
        return this.rarityData[rarity]?.name || 'Unknown';
    }

    /**
     * Enhanced emoji formatting methods
     */
    formatEmoji(emojiId, emojiName, isAnimated = false) {
        if (emojiId && emojiName) {
            const prefix = isAnimated ? 'a' : '';
            return `<${prefix}:${emojiName}:${emojiId}>`;
        } else if (emojiName) {
            return emojiName;
        }
        return '❓';
    }

    formatCollectionItemEmoji(item) {
        return this.formatEmoji(item.emojiId, item.emojiName, item.isAnimated);
    }

    formatItemEmoji(item) {
        if (!item) return '❓';
        return this.formatEmoji(item.emojiId, item.emojiName, item.isAnimated);
    }

    getEmojiData(item) {
        if (!item) return { emojiId: null, emojiName: '❓', isAnimated: false };
        return {
            emojiId: item.emojiId || null,
            emojiName: item.emojiName || '❓',
            isAnimated: item.isAnimated || false
        };
    }

    getRarityPercentages() {
        return { ...RARITY_PERCENTAGES };
    }

    updateRarityPercentages(newPercentages) {
        Object.assign(RARITY_PERCENTAGES, newPercentages);
        console.log('Updated rarity percentages:', RARITY_PERCENTAGES);
    }

    /**
     * PERFORMANCE: Manual cache refresh for admin use
     */
    async refreshAllCaches() {
        console.log('🔄 Manual refresh of all gacha service caches...');
        
        await this.refreshGachaItemPool();
        
        // Clear other caches
        collectionSummaryCache.clear();
        seriesItemsCache.clear();
        
        console.log('✅ All gacha service caches refreshed');
    }

    /**
     * Get cache statistics for monitoring
     */
    getCacheStats() {
        return {
            gachaPool: {
                size: gachaItemPoolCache.size,
                lastRefresh: lastPoolRefresh,
                age: Date.now() - lastPoolRefresh
            },
            rarityPools: {
                size: rarityPoolsCache.size,
                rarities: Array.from(rarityPoolsCache.keys())
            },
            summaries: {
                size: collectionSummaryCache.size
            },
            series: {
                size: seriesItemsCache.size
            }
        };
    }
}

// PERFORMANCE: Periodic cache cleanup
setInterval(() => {
    const now = Date.now();
    
    // Clean expired collection summaries
    for (const [key, value] of collectionSummaryCache.entries()) {
        if (now - value.timestamp > SUMMARY_CACHE_TTL) {
            collectionSummaryCache.delete(key);
        }
    }
    
    // Clean expired series data
    for (const [key, value] of seriesItemsCache.entries()) {
        if (now - value.timestamp > SERIES_CACHE_TTL) {
            seriesItemsCache.delete(key);
        }
    }
    
}, 60000); // Clean every minute

export default new GachaService();
