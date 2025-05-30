// src/services/gachaService.js - Updated with auto-combination support
import { User } from '../models/User.js';
import { GachaItem } from '../models/GachaItem.js';
import combinationService from './combinationService.js';

// Pull costs
const PULL_COSTS = {
    single: 10,
    multi: 100    // 11 pulls for 100 GP (10% discount)
};

class GachaService {
    constructor() {
        this.rarityWeights = {
            common: 50,
            uncommon: 30,
            rare: 15,
            epic: 4,
            legendary: 1
        };
    }

    /**
     * Perform a gacha pull for a user
     */
    async performPull(user, pullType = 'single') {
        const cost = PULL_COSTS[pullType];
        const pullCount = pullType === 'multi' ? 11 : 1;

        // Check if user has enough GP
        if (!user.hasEnoughGp(cost)) {
            throw new Error(`Insufficient GP! You need ${cost} GP but only have ${user.gpBalance} GP.`);
        }

        // Deduct GP
        user.addGpTransaction('gacha_pull', -cost, `Gacha ${pullType} pull (${pullCount} items)`);

        // Perform the pulls
        const results = [];
        for (let i = 0; i < pullCount; i++) {
            const item = await this.selectRandomItem();
            if (item) {
                const result = await this.addItemToUser(user, item);
                results.push(result);
            }
        }

        // Check for series completions
        const completions = await this.checkSeriesCompletions(user, results);

        // NEW: Check for automatic combinations after adding items
        const autoCombinations = await combinationService.checkAutoCombinations(user);

        await user.save();

        return {
            results,
            completions,
            autoCombinations, // NEW: Include auto-combinations in results
            newBalance: user.gpBalance,
            cost
        };
    }

    /**
     * Select a random item based on drop rates (only items with dropRate > 0)
     */
    async selectRandomItem() {
        try {
            // Only get items that can actually be pulled from gacha
            const availableItems = await GachaItem.getGachaPool();
            
            if (availableItems.length === 0) {
                console.error('No available gacha items found');
                return null;
            }

            // Calculate total weight
            const totalWeight = availableItems.reduce((total, item) => total + item.dropRate, 0);
            
            // Generate random number
            const random = Math.random() * totalWeight;
            
            // Find the selected item
            let currentWeight = 0;
            for (const item of availableItems) {
                currentWeight += item.dropRate;
                if (random <= currentWeight) {
                    return item;
                }
            }
            
            // Fallback to last item
            return availableItems[availableItems.length - 1];
        } catch (error) {
            console.error('Error selecting random item:', error);
            return null;
        }
    }

    /**
     * Add an item to user's collection
     */
    async addItemToUser(user, gachaItem) {
        if (!user.gachaCollection) {
            user.gachaCollection = [];
        }

        // Check if user already has this item
        const existingItem = user.gachaCollection.find(item => item.itemId === gachaItem.itemId);

        if (existingItem && gachaItem.maxStack > 1) {
            // Stack the item
            const newQuantity = Math.min(existingItem.quantity + 1, gachaItem.maxStack);
            const wasAtMax = existingItem.quantity >= gachaItem.maxStack;
            
            existingItem.quantity = newQuantity;
            
            return {
                itemId: gachaItem.itemId,
                itemName: gachaItem.itemName,
                rarity: gachaItem.rarity,
                emojiName: gachaItem.emojiName,
                emojiId: gachaItem.emojiId,
                description: gachaItem.description,
                flavorText: gachaItem.flavorText,
                quantity: newQuantity,
                maxStack: gachaItem.maxStack,
                isNew: false,
                wasAtMax,
                itemType: gachaItem.itemType,
                seriesId: gachaItem.seriesId,
                source: 'gacha' // Track source
            };
        } else if (!existingItem) {
            // Add new item
            user.gachaCollection.push({
                itemId: gachaItem.itemId,
                itemName: gachaItem.itemName,
                itemType: gachaItem.itemType,
                seriesId: gachaItem.seriesId,
                rarity: gachaItem.rarity,
                emojiId: gachaItem.emojiId,
                emojiName: gachaItem.emojiName,
                obtainedAt: new Date(),
                quantity: 1,
                source: 'gacha' // Track source
            });

            return {
                itemId: gachaItem.itemId,
                itemName: gachaItem.itemName,
                rarity: gachaItem.rarity,
                emojiName: gachaItem.emojiName,
                emojiId: gachaItem.emojiId,
                description: gachaItem.description,
                flavorText: gachaItem.flavorText,
                quantity: 1,
                maxStack: gachaItem.maxStack,
                isNew: true,
                itemType: gachaItem.itemType,
                seriesId: gachaItem.seriesId,
                source: 'gacha'
            };
        } else {
            // Item exists but can't stack more
            return {
                itemId: gachaItem.itemId,
                itemName: gachaItem.itemName,
                rarity: gachaItem.rarity,
                emojiName: gachaItem.emojiName,
                emojiId: gachaItem.emojiId,
                description: gachaItem.description,
                flavorText: gachaItem.flavorText,
                quantity: existingItem.quantity,
                maxStack: gachaItem.maxStack,
                isNew: false,
                wasAtMax: true,
                itemType: gachaItem.itemType,
                seriesId: gachaItem.seriesId,
                source: 'gacha'
            };
        }
    }

    /**
     * Check for series completions
     */
    async checkSeriesCompletions(user, newItems) {
        const completions = [];
        
        // Get unique series from new items
        const seriesIds = [...new Set(newItems
            .filter(item => item.seriesId)
            .map(item => item.seriesId))];

        for (const seriesId of seriesIds) {
            const completion = await this.checkSingleSeriesCompletion(user, seriesId);
            if (completion) {
                completions.push(completion);
            }
        }

        return completions;
    }

    /**
     * Check if a specific series is completed
     */
    async checkSingleSeriesCompletion(user, seriesId) {
        try {
            // Get all items in this series
            const seriesItems = await GachaItem.find({ seriesId, isActive: true });
            
            if (seriesItems.length === 0) return null;

            // Check if user has all items in the series
            const userItems = user.gachaCollection.filter(item => item.seriesId === seriesId);
            const userItemIds = userItems.map(item => item.itemId);
            
            const requiredItemIds = seriesItems.map(item => item.itemId);
            const hasAllItems = requiredItemIds.every(id => userItemIds.includes(id));

            if (!hasAllItems) return null;

            // Check if user already has the completion reward
            const seriesInfo = seriesItems[0]; // Get series info from first item
            const completionReward = seriesInfo.completionReward;
            
            if (!completionReward) return null;

            const hasReward = user.gachaCollection.some(item => item.itemId === completionReward.itemId);
            if (hasReward) return null; // Already completed

            // Award the completion reward
            user.gachaCollection.push({
                itemId: completionReward.itemId,
                itemName: completionReward.itemName,
                itemType: 'special',
                seriesId: null, // Completion rewards don't belong to series
                rarity: 'legendary',
                emojiId: completionReward.emojiId,
                emojiName: completionReward.emojiName,
                obtainedAt: new Date(),
                quantity: 1,
                source: 'series_completion' // Track source
            });

            return {
                seriesId,
                seriesName: `${seriesId.charAt(0).toUpperCase()}${seriesId.slice(1)} Collection`,
                rewardItem: completionReward,
                completedItems: requiredItemIds.length
            };
        } catch (error) {
            console.error(`Error checking series completion for ${seriesId}:`, error);
            return null;
        }
    }

    /**
     * Get user's collection summary with combination stats
     */
    getUserCollectionSummary(user) {
        if (!user.gachaCollection || user.gachaCollection.length === 0) {
            return {
                totalItems: 0,
                uniqueItems: 0,
                rarityCount: {},
                recentItems: [],
                sourceBreakdown: {}
            };
        }

        const rarityCount = {
            common: 0,
            uncommon: 0,
            rare: 0,
            epic: 0,
            legendary: 0,
            mythic: 0
        };

        const sourceBreakdown = {
            gacha: 0,
            combined: 0,
            series_completion: 0
        };

        let totalItems = 0;
        
        user.gachaCollection.forEach(item => {
            const quantity = item.quantity || 1;
            totalItems += quantity;
            
            if (rarityCount[item.rarity] !== undefined) {
                rarityCount[item.rarity] += quantity;
            }
            
            const source = item.source || 'gacha';
            if (sourceBreakdown[source] !== undefined) {
                sourceBreakdown[source] += quantity;
            }
        });

        const recentItems = user.gachaCollection
            .sort((a, b) => new Date(b.obtainedAt) - new Date(a.obtainedAt))
            .slice(0, 5);

        return {
            totalItems,
            uniqueItems: user.gachaCollection.length,
            rarityCount,
            recentItems,
            sourceBreakdown
        };
    }

    /**
     * Format emoji for display
     */
    formatEmoji(emojiId, emojiName) {
        if (emojiId) {
            return `<:${emojiName}:${emojiId}>`;
        }
        return emojiName; // Fallback to name if no custom emoji
    }

    /**
     * Get rarity color
     */
    getRarityColor(rarity) {
        const colors = {
            common: '#95A5A6',     // Gray
            uncommon: '#2ECC71',   // Green  
            rare: '#3498DB',       // Blue
            epic: '#9B59B6',       // Purple
            legendary: '#F1C40F',  // Gold
            mythic: '#E91E63'      // Pink
        };
        return colors[rarity] || colors.common;
    }

    /**
     * Get rarity emoji
     */
    getRarityEmoji(rarity) {
        const emojis = {
            common: '⚪',
            uncommon: '🟢', 
            rare: '🔵',
            epic: '🟣',
            legendary: '🟡',
            mythic: '🌈'
        };
        return emojis[rarity] || emojis.common;
    }
}

export default new GachaService();
