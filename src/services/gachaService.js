// src/services/gachaService.js - UPDATED with flat rarity percentage system
import { User } from '../models/User.js';
import { GachaItem } from '../models/GachaItem.js';
import combinationService from './combinationService.js';

// Pull costs
const PULL_COSTS = {
    single: 50,
    multi: 150
};

// UPDATED: Flat rarity percentages (ignores individual dropRate fields)
const RARITY_PERCENTAGES = {
    common: 45,      // 45%
    uncommon: 35,    // 35%
    rare: 15,        // 15%
    epic: 4,         // 4%
    legendary: 1,    // 1%
    mythic: 0        // 0% - special events only
};

class GachaService {
    constructor() {
        // Keep the old weights for reference, but they're not used anymore
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
     * UPDATED: Check for possible combinations instead of auto-combining
     */
    async performPull(user, pullType = 'single') {
        const cost = PULL_COSTS[pullType];
        const pullCount = pullType === 'multi' ? 4 : 1;

        // Check if user has enough GP
        if (!user.hasEnoughGp(cost)) {
            throw new Error(`Insufficient GP! You need ${cost} GP but only have ${user.gpBalance} GP.`);
        }

        // Deduct GP
        user.addGpTransaction('gacha_pull', -cost, `Gacha ${pullType} pull (${pullCount} items)`);

        // Initialize collection if it doesn't exist
        if (!user.gachaCollection) {
            user.gachaCollection = [];
            console.log('Initialized empty gacha collection for user:', user.raUsername);
        }

        // Perform the pulls
        const results = [];
        const newItemIds = []; // Track newly obtained items for combination checking
        
        for (let i = 0; i < pullCount; i++) {
            const item = await this.selectRandomItem();
            if (item) {
                console.log(`Selected item for pull ${i + 1}:`, {
                    itemId: item.itemId,
                    itemName: item.itemName,
                    rarity: item.rarity,
                    emojiId: item.emojiId,
                    emojiName: item.emojiName,
                    isAnimated: item.isAnimated
                });
                const result = this.addItemToUser(user, item);
                results.push(result);
                newItemIds.push(item.itemId);
            }
        }

        console.log(`Added ${results.length} items to collection. Collection size: ${user.gachaCollection.length}`);

        // Check for series completions
        const completions = await this.checkSeriesCompletions(user, results);

        // Save user BEFORE checking combinations (important!)
        await user.save();
        console.log('User saved successfully after pull');

        // UPDATED: Check for possible combinations instead of auto-combining
        const possibleCombinations = await combinationService.checkPossibleCombinations(user);
        
        // Filter combinations that use newly obtained items
        const relevantCombinations = possibleCombinations.filter(combo => 
            combo.ingredients.some(ingredient => newItemIds.includes(ingredient.itemId))
        );

        console.log(`Found ${relevantCombinations.length} relevant combinations for newly obtained items`);

        return {
            results,
            completions,
            possibleCombinations: relevantCombinations, // Return possible combinations instead of performed ones
            newBalance: user.gpBalance,
            cost,
            pullType
        };
    }

    /**
     * COMPLETELY REWRITTEN: Flat rarity percentage system
     * Select a random item based on flat rarity percentages (ignores individual dropRate)
     */
    async selectRandomItem() {
        try {
            // Get all items that can be pulled (dropRate > 0 still excludes special items)
            const availableItems = await GachaItem.find({
                isActive: true,
                dropRate: { $gt: 0 } // Still respect 0 = not available in gacha
            });
            
            if (availableItems.length === 0) {
                console.error('No available gacha items found');
                return null;
            }

            // Group items by rarity
            const itemsByRarity = {};
            for (const item of availableItems) {
                if (!itemsByRarity[item.rarity]) {
                    itemsByRarity[item.rarity] = [];
                }
                itemsByRarity[item.rarity].push(item);
            }

            // Log current distribution for debugging
            console.log('Available items by rarity:');
            for (const [rarity, items] of Object.entries(itemsByRarity)) {
                console.log(`  ${rarity}: ${items.length} items`);
            }

            // Calculate cumulative percentages for rarity selection
            const rarityRoll = Math.random() * 100; // 0-100
            let cumulativePercent = 0;
            let selectedRarity = null;

            // Go through rarities in order of percentage
            const sortedRarities = Object.entries(RARITY_PERCENTAGES)
                .sort(([,a], [,b]) => b - a); // Sort by percentage descending

            for (const [rarity, percentage] of sortedRarities) {
                cumulativePercent += percentage;
                
                // Skip if no items of this rarity exist
                if (!itemsByRarity[rarity] || itemsByRarity[rarity].length === 0) {
                    continue;
                }

                if (rarityRoll <= cumulativePercent) {
                    selectedRarity = rarity;
                    break;
                }
            }

            // Fallback: if no rarity selected (shouldn't happen), pick common
            if (!selectedRarity || !itemsByRarity[selectedRarity]) {
                // Find the most common rarity that has items
                for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']) {
                    if (itemsByRarity[rarity] && itemsByRarity[rarity].length > 0) {
                        selectedRarity = rarity;
                        break;
                    }
                }
            }

            if (!selectedRarity || !itemsByRarity[selectedRarity]) {
                console.error('No valid rarity found with available items');
                return availableItems[0]; // Ultimate fallback
            }

            // Randomly select an item from the chosen rarity
            const rarityItems = itemsByRarity[selectedRarity];
            const randomIndex = Math.floor(Math.random() * rarityItems.length);
            const selectedItem = rarityItems[randomIndex];

            console.log(`Rarity roll: ${rarityRoll.toFixed(2)}% → Selected: ${selectedRarity} (${RARITY_PERCENTAGES[selectedRarity]}% chance)`);
            console.log(`Selected item: ${selectedItem.itemName} from ${rarityItems.length} available ${selectedRarity} items`);

            return selectedItem;
        } catch (error) {
            console.error('Error selecting random item:', error);
            return null;
        }
    }

    /**
     * Get current rarity distribution statistics (for debugging/balancing)
     */
    async analyzeRarityDistribution() {
        try {
            const availableItems = await GachaItem.find({
                isActive: true,
                dropRate: { $gt: 0 }
            });

            const distribution = {};
            for (const item of availableItems) {
                if (!distribution[item.rarity]) {
                    distribution[item.rarity] = 0;
                }
                distribution[item.rarity]++;
            }

            console.log('\n=== GACHA RARITY DISTRIBUTION ===');
            console.log('Configured percentages vs Available items:');
            
            let totalItems = availableItems.length;
            for (const [rarity, percentage] of Object.entries(RARITY_PERCENTAGES)) {
                const itemCount = distribution[rarity] || 0;
                const actualChancePerItem = itemCount > 0 ? (percentage / itemCount).toFixed(3) : 0;
                console.log(`${rarity}: ${percentage}% chance → ${itemCount} items (${actualChancePerItem}% per item)`);
            }
            console.log(`Total items in gacha: ${totalItems}`);
            console.log('===================================\n');

            return distribution;
        } catch (error) {
            console.error('Error analyzing rarity distribution:', error);
            return {};
        }
    }

    /**
     * Simulate pulls to test rarity percentages
     */
    async simulatePulls(count = 1000) {
        try {
            console.log(`\nSimulating ${count} pulls to test rarity distribution...`);
            
            const results = {
                common: 0,
                uncommon: 0,
                rare: 0,
                epic: 0,
                legendary: 0,
                mythic: 0
            };

            for (let i = 0; i < count; i++) {
                const item = await this.selectRandomItem();
                if (item && results[item.rarity] !== undefined) {
                    results[item.rarity]++;
                }
            }

            console.log('\n=== SIMULATION RESULTS ===');
            console.log('Expected vs Actual percentages:');
            for (const [rarity, expectedPercent] of Object.entries(RARITY_PERCENTAGES)) {
                const actualCount = results[rarity] || 0;
                const actualPercent = ((actualCount / count) * 100).toFixed(2);
                const diff = (actualPercent - expectedPercent).toFixed(2);
                console.log(`${rarity}: Expected ${expectedPercent}% | Actual ${actualPercent}% | Diff: ${diff > 0 ? '+' : ''}${diff}%`);
            }
            console.log('==========================\n');

            return results;
        } catch (error) {
            console.error('Error simulating pulls:', error);
            return {};
        }
    }

    /**
     * Add an item to user's collection with proper emoji data transfer
     */
    addItemToUser(user, gachaItem) {
        console.log('BEFORE addItemToUser - GachaItem emoji data:', {
            itemId: gachaItem.itemId,
            itemName: gachaItem.itemName,
            emojiId: gachaItem.emojiId,
            emojiName: gachaItem.emojiName,
            isAnimated: gachaItem.isAnimated
        });

        // CRITICAL: Ensure we pass the complete gachaItem with all emoji data including isAnimated
        const addResult = user.addGachaItem(gachaItem, 1, 'gacha');

        console.log('AFTER addGachaItem - Result item emoji data:', {
            itemId: addResult.item.itemId,
            itemName: addResult.item.itemName,
            emojiId: addResult.item.emojiId,
            emojiName: addResult.item.emojiName,
            isAnimated: addResult.item.isAnimated
        });

        // Verify emoji data was transferred correctly
        if (gachaItem.emojiId && !addResult.item.emojiId) {
            console.error('❌ EMOJI DATA LOST! emojiId was not transferred correctly');
            console.error('Source emojiId:', gachaItem.emojiId);
            console.error('Result emojiId:', addResult.item.emojiId);
        }

        if (gachaItem.emojiName && !addResult.item.emojiName) {
            console.error('❌ EMOJI DATA LOST! emojiName was not transferred correctly');
            console.error('Source emojiName:', gachaItem.emojiName);
            console.error('Result emojiName:', addResult.item.emojiName);
        }

        if (gachaItem.isAnimated !== undefined && gachaItem.isAnimated !== addResult.item.isAnimated) {
            console.error('❌ ANIMATED FLAG LOST! isAnimated was not transferred correctly');
            console.error('Source isAnimated:', gachaItem.isAnimated);
            console.error('Result isAnimated:', addResult.item.isAnimated);
        }

        // Format result for the UI
        return {
            itemId: gachaItem.itemId,
            itemName: gachaItem.itemName,
            rarity: gachaItem.rarity,
            emojiName: addResult.item.emojiName, // Use the actual saved data
            emojiId: addResult.item.emojiId,     // Use the actual saved data
            isAnimated: addResult.item.isAnimated, // Use the actual saved data
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

            // Award the completion reward using the User model method
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
            console.error(`Error checking series completion for ${seriesId}:`, error);
            return null;
        }
    }

    /**
     * UPDATED: Get user's collection summary with store_purchase integration
     */
    getUserCollectionSummary(user) {
        console.log('Getting collection summary for user:', user.raUsername);
        console.log('Collection exists:', !!user.gachaCollection);
        console.log('Collection length:', user.gachaCollection?.length || 0);

        if (!user.gachaCollection || user.gachaCollection.length === 0) {
            console.log('User has empty collection');
            return {
                totalItems: 0,
                uniqueItems: 0,
                rarityCount: {},
                recentItems: [],
                sourceBreakdown: {},
                seriesBreakdown: {}
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

        // UPDATED: Include store_purchase in source breakdown
        const sourceBreakdown = {
            gacha: 0,
            combined: 0,
            series_completion: 0,
            player_transfer: 0,
            store_purchase: 0  // ADDED store_purchase tracking
        };

        const seriesBreakdown = {};

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
            } else {
                // Handle any unknown sources
                sourceBreakdown[source] = quantity;
            }

            // Track series
            const series = item.seriesId || 'Individual Items';
            if (!seriesBreakdown[series]) {
                seriesBreakdown[series] = [];
            }
            seriesBreakdown[series].push(item);
        });

        const recentItems = user.gachaCollection
            .sort((a, b) => new Date(b.obtainedAt) - new Date(a.obtainedAt))
            .slice(0, 5);

        console.log('Collection summary:', {
            totalItems,
            uniqueItems: user.gachaCollection.length,
            rarityCount,
            sourceBreakdown,
            seriesCount: Object.keys(seriesBreakdown).length
        });

        return {
            totalItems,
            uniqueItems: user.gachaCollection.length,
            rarityCount,
            recentItems,
            sourceBreakdown,
            seriesBreakdown
        };
    }

    /**
     * Rarity system methods
     */
    getRarityEmoji(rarity) {
        const emojis = {
            common: '⚪',      // White circle
            uncommon: '🟢',   // Green circle  
            rare: '🔵',       // Blue circle
            epic: '🟣',       // Purple circle
            legendary: '🟡',  // Yellow circle
            mythic: '🌟'      // Star
        };
        return emojis[rarity] || emojis.common;
    }

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

    getRarityDisplayName(rarity) {
        const names = {
            common: 'Common',
            uncommon: 'Uncommon',
            rare: 'Rare',
            epic: 'Epic',
            legendary: 'Legendary',
            mythic: 'Mythic'
        };
        return names[rarity] || 'Unknown';
    }

    /**
     * UPDATED: Format emoji for display (handles animated emojis)
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

    /**
     * UPDATED: Format collection item emoji (handles animated emojis)
     */
    formatCollectionItemEmoji(item) {
        return this.formatEmoji(item.emojiId, item.emojiName, item.isAnimated);
    }

    /**
     * NEW: Format emoji from item object (convenience method)
     */
    formatItemEmoji(item) {
        if (!item) return '❓';
        return this.formatEmoji(item.emojiId, item.emojiName, item.isAnimated);
    }

    /**
     * NEW: Get emoji data from item
     */
    getEmojiData(item) {
        if (!item) return { emojiId: null, emojiName: '❓', isAnimated: false };
        return {
            emojiId: item.emojiId || null,
            emojiName: item.emojiName || '❓',
            isAnimated: item.isAnimated || false
        };
    }

    /**
     * NEW: Get current rarity configuration
     */
    getRarityPercentages() {
        return { ...RARITY_PERCENTAGES };
    }

    /**
     * NEW: Update rarity percentages (for admin use)
     */
    updateRarityPercentages(newPercentages) {
        Object.assign(RARITY_PERCENTAGES, newPercentages);
        console.log('Updated rarity percentages:', RARITY_PERCENTAGES);
    }
}

export default new GachaService();