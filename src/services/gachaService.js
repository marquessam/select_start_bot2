// src/services/gachaService.js - DEPLOYMENT-SAFE VERSION with FIXED cache invalidation
import { User } from '../models/User.js';
import { GachaItem } from '../models/GachaItem.js';
import combinationService from './combinationService.js';

// FIXED: Import cache invalidation function
let invalidateUserCollectionCache = null;

// Lazy load cache invalidation to avoid circular imports
async function getInvalidateFunction() {
    if (!invalidateUserCollectionCache) {
        try {
            const collectionModule = await import('../commands/user/collection.js');
            invalidateUserCollectionCache = collectionModule.invalidateUserCollectionCache;
        } catch (error) {
            console.warn('Could not import cache invalidation function:', error.message);
            invalidateUserCollectionCache = () => {}; // No-op fallback
        }
    }
    return invalidateUserCollectionCache;
}

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

// PERFORMANCE: Advanced caching system with deployment safety
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
        
        // DEPLOYMENT SAFETY: Simplified initialization state
        this.isInitialized = false;
        this.initializationInProgress = false;
        this.hasAttemptedInit = false;
        
        console.log('🎰 GachaService constructed (lazy initialization)');
    }

    /**
     * DEPLOYMENT SAFETY: Simple, non-blocking initialization
     */
    async safeInitialize() {
        // Prevent multiple simultaneous calls
        if (this.initializationInProgress) {
            console.log('🎰 GachaService initialization already in progress, skipping');
            return { success: false, reason: 'already_in_progress' };
        }

        // If already attempted and failed, don't retry immediately
        if (this.hasAttemptedInit && !this.isInitialized) {
            console.log('🎰 GachaService initialization previously failed, using fallback mode');
            return { success: false, reason: 'previous_attempt_failed' };
        }

        this.initializationInProgress = true;
        this.hasAttemptedInit = true;

        try {
            console.log('🎰 Attempting GachaService initialization...');
            
            // Simple database connection check
            const mongoose = await import('mongoose');
            if (mongoose.default.connection.readyState !== 1) {
                console.log('🎰 Database not ready, initialization will be retried later');
                this.initializationInProgress = false;
                return { success: false, reason: 'database_not_ready' };
            }

            // Try to refresh cache with aggressive timeout
            const success = await this.tryRefreshPool();
            
            if (success) {
                this.isInitialized = true;
                console.log('✅ GachaService initialized successfully');
                return { success: true, reason: 'initialized' };
            } else {
                console.warn('⚠️ GachaService initialization failed, will use fallback mode');
                return { success: false, reason: 'cache_refresh_failed' };
            }
            
        } catch (error) {
            console.error(`❌ GachaService initialization error:`, error.message);
            return { success: false, reason: error.message };
        } finally {
            this.initializationInProgress = false;
        }
    }

    /**
     * DEPLOYMENT SAFETY: Simple pool refresh with aggressive timeout
     */
    async tryRefreshPool() {
        try {
            // Create a very aggressive timeout (5 seconds max)
            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => resolve(null), 5000);
            });

            // Simple query with limit for safety
            const queryPromise = GachaItem.find({
                isActive: true,
                dropRate: { $gt: 0 }
            }).limit(200).lean().exec();

            // Race with timeout
            const availableItems = await Promise.race([queryPromise, timeoutPromise]);
            
            if (!availableItems || availableItems.length === 0) {
                console.warn('⚠️ No items returned from database query');
                return false;
            }

            console.log(`🎰 Found ${availableItems.length} gacha items, building cache...`);

            // Clear and rebuild caches quickly
            gachaItemPoolCache.clear();
            rarityPoolsCache.clear();
            
            // Group items by rarity
            const itemsByRarity = {};
            for (const item of availableItems) {
                if (!itemsByRarity[item.rarity]) {
                    itemsByRarity[item.rarity] = [];
                }
                itemsByRarity[item.rarity].push(item);
                gachaItemPoolCache.set(item.itemId, item);
            }
            
            // Cache rarity pools
            for (const [rarity, items] of Object.entries(itemsByRarity)) {
                rarityPoolsCache.set(rarity, items);
            }
            
            lastPoolRefresh = Date.now();
            
            console.log(`✅ Gacha pool cached successfully: ${availableItems.length} items`);
            return true;
            
        } catch (error) {
            console.error('❌ Error in tryRefreshPool:', error.message);
            return false;
        }
    }

    /**
     * DEPLOYMENT SAFETY: Lazy initialization check
     */
    async ensureInitialized() {
        if (this.isInitialized) {
            return true;
        }

        // Try to initialize once if we haven't attempted yet
        if (!this.hasAttemptedInit && !this.initializationInProgress) {
            const result = await this.safeInitialize();
            return result.success;
        }

        // Don't wait for initialization if it's in progress or failed
        return this.isInitialized;
    }

    /**
     * DEPLOYMENT SAFETY: Simple fallback item selection
     */
    async selectRandomItemFallback() {
        try {
            console.log('🎲 Using fallback item selection (direct DB query)');
            
            // Ultra-simple fallback with timeout
            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => resolve(null), 3000);
            });

            const queryPromise = GachaItem.findOne({
                isActive: true,
                dropRate: { $gt: 0 }
            }).lean().exec();

            const item = await Promise.race([queryPromise, timeoutPromise]);

            if (item) {
                console.log(`🎯 Fallback selection: ${item.itemName} (${item.rarity})`);
                return item;
            } else {
                console.error('❌ Fallback selection failed - no items found');
                return null;
            }
            
        } catch (error) {
            console.error('❌ Fallback item selection error:', error.message);
            return null;
        }
    }

    /**
     * DEPLOYMENT SAFETY: Robust item selection with multiple fallbacks
     */
    async selectRandomItem() {
        try {
            // Try cache-based selection first
            if (this.isInitialized && rarityPoolsCache.size > 0) {
                return await this.selectFromCache();
            }

            // If not initialized, try lazy initialization
            if (!this.isInitialized) {
                console.log('🎰 Attempting lazy initialization for item selection...');
                const initialized = await this.ensureInitialized();
                
                if (initialized && rarityPoolsCache.size > 0) {
                    return await this.selectFromCache();
                }
            }

            // Fall back to direct database query
            console.warn('⚠️ Cache unavailable, using fallback selection');
            return await this.selectRandomItemFallback();

        } catch (error) {
            console.error('❌ Error in selectRandomItem:', error.message);
            return await this.selectRandomItemFallback();
        }
    }

    /**
     * DEPLOYMENT SAFETY: Cache-based selection with validation
     */
    async selectFromCache() {
        try {
            // Validate cache freshness
            if (Date.now() - lastPoolRefresh > POOL_CACHE_TTL) {
                console.log('🔄 Cache expired, attempting refresh...');
                const refreshed = await this.tryRefreshPool();
                if (!refreshed) {
                    console.warn('⚠️ Cache refresh failed, using stale cache');
                }
            }

            if (rarityPoolsCache.size === 0) {
                throw new Error('No rarity pools available in cache');
            }

            // Select rarity based on percentages
            const rarityRoll = Math.random() * 100;
            let cumulativePercent = 0;
            let selectedRarity = null;

            const sortedRarities = Object.entries(RARITY_PERCENTAGES)
                .sort(([,a], [,b]) => b - a);

            for (const [rarity, percentage] of sortedRarities) {
                cumulativePercent += percentage;
                
                if (!rarityPoolsCache.has(rarity)) {
                    continue;
                }

                if (rarityRoll <= cumulativePercent) {
                    selectedRarity = rarity;
                    break;
                }
            }

            // Fallback to any available rarity
            if (!selectedRarity) {
                for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']) {
                    if (rarityPoolsCache.has(rarity)) {
                        selectedRarity = rarity;
                        break;
                    }
                }
            }

            if (!selectedRarity || !rarityPoolsCache.has(selectedRarity)) {
                throw new Error('No valid rarity found in cache');
            }

            // Select random item from rarity pool
            const rarityItems = rarityPoolsCache.get(selectedRarity);
            const randomIndex = Math.floor(Math.random() * rarityItems.length);
            const selectedItem = rarityItems[randomIndex];

            console.log(`🎯 Cache selection: ${selectedItem.itemName} (${selectedRarity})`);
            return selectedItem;

        } catch (error) {
            console.error('❌ Error in selectFromCache:', error.message);
            throw error;
        }
    }

    /**
     * DEPLOYMENT SAFETY: Simplified pull performance with better error handling
     */
    async performPull(user, pullType = 'single') {
        const maxRetries = 2; // Reduced from 3 for faster failure
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🎰 Gacha pull attempt ${attempt}/${maxRetries} for user ${user.raUsername}`);
                return await this.performPullInternal(user, pullType, attempt);
            } catch (error) {
                lastError = error;
                
                if (error.name === 'VersionError' && attempt < maxRetries) {
                    console.warn(`⚠️ Version conflict on attempt ${attempt}, retrying...`);
                    
                    // Shorter delay for retries
                    await new Promise(resolve => setTimeout(resolve, 50 * attempt));
                    
                    try {
                        const freshUser = await User.findById(user._id);
                        if (!freshUser) {
                            throw new Error('User not found during retry');
                        }
                        
                        Object.assign(user, freshUser.toObject());
                        user._doc = freshUser._doc;
                        user.__v = freshUser.__v;
                        user.isNew = false;
                        
                        console.log(`🔄 Refetched user data for retry ${attempt + 1}`);
                    } catch (refetchError) {
                        console.error('❌ Error refetching user for retry:', refetchError);
                        throw refetchError;
                    }
                    
                    continue;
                } else {
                    console.error(`❌ Pull error on attempt ${attempt}:`, error);
                    throw error;
                }
            }
        }

        console.error(`❌ All ${maxRetries} attempts failed for user ${user.raUsername}`);
        throw new Error(`Gacha pull failed after ${maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * DEPLOYMENT SAFETY: Streamlined pull internal logic
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

        // Get items (with fallback protection)
        const results = [];
        const newItemIds = [];
        
        for (let i = 0; i < pullCount; i++) {
            try {
                const item = await this.selectRandomItem();
                if (item) {
                    const result = this.addItemToUser(user, item);
                    results.push(result);
                    newItemIds.push(item.itemId);
                } else {
                    // Create a fallback result if item selection fails
                    console.warn(`⚠️ Failed to select item ${i + 1}/${pullCount}, skipping`);
                }
            } catch (itemError) {
                console.error(`❌ Error selecting item ${i + 1}/${pullCount}:`, itemError);
                // Continue with other items rather than failing the entire pull
            }
        }

        if (results.length === 0) {
            throw new Error('Failed to select any items for this pull');
        }

        console.log(`📦 Added ${results.length} items to collection`);

        // Save user first
        await user.save();
        console.log(`💾 User saved successfully`);

        // Check series completions (simplified)
        let completions = [];
        try {
            completions = await this.checkSeriesCompletions(user, results);
        } catch (completionError) {
            console.error('❌ Error checking series completions:', completionError);
        }

        // Check combinations (simplified with timeout)
        let possibleCombinations = [];
        try {
            const freshUser = await User.findById(user._id);
            if (freshUser) {
                possibleCombinations = await Promise.race([
                    combinationService.checkPossibleCombinations(freshUser),
                    new Promise((resolve) => setTimeout(() => resolve([]), 5000))
                ]);
                
                // Filter for relevant combinations
                possibleCombinations = possibleCombinations.filter(combo => 
                    combo.ingredients.some(ingredient => newItemIds.includes(ingredient.itemId))
                );
            }
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
     * Simplified series completion checking
     */
    async checkSeriesCompletions(user, newItems) {
        const completions = [];
        
        try {
            const seriesIds = [...new Set(newItems
                .filter(item => item.seriesId)
                .map(item => item.seriesId))];

            if (seriesIds.length === 0) return completions;

            // Process series one by one with timeout protection
            for (const seriesId of seriesIds) {
                try {
                    const completion = await Promise.race([
                        this.checkSingleSeriesCompletion(user, seriesId),
                        new Promise((resolve) => setTimeout(() => resolve(null), 3000))
                    ]);
                    
                    if (completion) {
                        completions.push(completion);
                    }
                } catch (seriesError) {
                    console.error(`❌ Error checking series ${seriesId}:`, seriesError);
                }
            }
        } catch (error) {
            console.error('❌ Error in checkSeriesCompletions:', error);
        }

        return completions;
    }

    /**
     * DEPLOYMENT SAFETY: Simplified series completion checking with FIXED cache invalidation
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
                // Quick query with timeout
                const timeoutPromise = new Promise((resolve) => 
                    setTimeout(() => resolve([]), 2000)
                );
                
                const queryPromise = GachaItem.find({ seriesId, isActive: true }).lean().exec();
                seriesItems = await Promise.race([queryPromise, timeoutPromise]);
                
                if (seriesItems.length > 0) {
                    seriesItemsCache.set(cacheKey, { data: seriesItems, timestamp: Date.now() });
                }
            }
            
            if (seriesItems.length === 0) return null;

            // Check completion logic
            const userItems = user.gachaCollection.filter(item => item.seriesId === seriesId);
            const userItemIds = userItems.map(item => item.itemId);
            const requiredItemIds = seriesItems.map(item => item.itemId);
            const hasAllItems = requiredItemIds.every(id => userItemIds.includes(id));

            if (!hasAllItems) return null;

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
            
            // FIXED: Invalidate caches after adding series completion reward
            this.invalidateUserCaches(user);

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
     * DEPLOYMENT SAFETY: Simplified collection summary
     */
    getUserCollectionSummary(user) {
        const cacheKey = `summary_${user._id}_${user.gachaCollection?.length || 0}`;
        const cached = collectionSummaryCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < SUMMARY_CACHE_TTL) {
            return cached.data;
        }

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

        // Simplified summary generation
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
            
            if (rarityCount[item.rarity] !== undefined) {
                rarityCount[item.rarity] += quantity;
            }
            
            const source = item.source || 'gacha';
            if (sourceBreakdown[source] !== undefined) {
                sourceBreakdown[source] += quantity;
            } else {
                sourceBreakdown[source] = quantity;
            }

            const series = item.seriesId || 'Individual Items';
            if (!seriesBreakdown[series]) {
                seriesBreakdown[series] = [];
            }
            seriesBreakdown[series].push(item);
        }

        const recentItems = user.gachaCollection
            .slice()
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

        collectionSummaryCache.set(cacheKey, { data: summary, timestamp: Date.now() });
        return summary;
    }

    /**
     * FIXED: Enhanced item addition with comprehensive cache invalidation
     */
    addItemToUser(user, gachaItem) {
        const addResult = user.addGachaItem(gachaItem, 1, 'gacha');

        // FIXED: Invalidate ALL user caches when collection changes
        this.invalidateUserCaches(user);

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
     * FIXED: Comprehensive cache invalidation for user
     */
    invalidateUserCaches(user) {
        try {
            // Invalidate collection summary cache
            for (const [key] of collectionSummaryCache.entries()) {
                if (key.includes(user._id)) {
                    collectionSummaryCache.delete(key);
                }
            }
            
            // FIXED: Invalidate collection command caches using async function
            setImmediate(async () => {
                try {
                    const invalidateFn = await getInvalidateFunction();
                    if (invalidateFn && typeof invalidateFn === 'function') {
                        invalidateFn(user);
                        console.log(`🗑️ Invalidated collection caches for ${user.raUsername}`);
                    }
                } catch (error) {
                    console.warn('Error invalidating collection cache:', error.message);
                }
            });
        } catch (error) {
            console.error('❌ Error invalidating user caches:', error);
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
     * DEPLOYMENT SAFETY: Simple cache refresh for admin use
     */
    async refreshAllCaches() {
        console.log('🔄 Manual refresh of all gacha service caches...');
        
        const success = await this.tryRefreshPool();
        
        // Clear other caches regardless of pool refresh success
        collectionSummaryCache.clear();
        seriesItemsCache.clear();
        
        if (success) {
            this.isInitialized = true;
            console.log('✅ All gacha service caches refreshed successfully');
        } else {
            console.warn('⚠️ Pool refresh failed, but other caches cleared');
        }
    }

    /**
     * Get simplified cache statistics
     */
    getCacheStats() {
        return {
            initialization: {
                isInitialized: this.isInitialized,
                initializationInProgress: this.initializationInProgress,
                hasAttemptedInit: this.hasAttemptedInit
            },
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

    /**
     * Get initialization status
     */
    getInitializationStatus() {
        return {
            isInitialized: this.isInitialized,
            initializationInProgress: this.initializationInProgress,
            hasAttemptedInit: this.hasAttemptedInit
        };
    }
}

// DEPLOYMENT SAFETY: Simplified cache cleanup
setInterval(() => {
    const now = Date.now();
    
    // Clean expired collection summaries
    let cleaned = 0;
    for (const [key, value] of collectionSummaryCache.entries()) {
        if (now - value.timestamp > SUMMARY_CACHE_TTL) {
            collectionSummaryCache.delete(key);
            cleaned++;
        }
    }
    
    // Clean expired series data
    for (const [key, value] of seriesItemsCache.entries()) {
        if (now - value.timestamp > SERIES_CACHE_TTL) {
            seriesItemsCache.delete(key);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
    }
    
}, 60000); // Clean every minute

export default new GachaService();
