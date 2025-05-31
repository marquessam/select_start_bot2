// src/services/combinationService.js - UPDATED with proper emoji handling
import { GachaItem, CombinationRule } from '../models/GachaItem.js';

class CombinationService {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Check for automatic combinations after user gets new items
     */
    async checkAutoCombinations(user) {
        try {
            if (!user.gachaCollection || user.gachaCollection.length === 0) {
                return [];
            }

            // Get all automatic combination rules
            const autoRules = await CombinationRule.find({ 
                isAutomatic: true, 
                isActive: true 
            }).sort({ priority: -1 }); // Higher priority first

            const combinationsPerformed = [];

            // Process each rule
            for (const rule of autoRules) {
                let canPerform = true;
                
                // Keep checking if we can perform this combination
                while (canPerform) {
                    // Check if user has all required ingredients
                    const hasIngredients = this.checkIngredients(user, rule.ingredients);
                    
                    if (hasIngredients) {
                        // Perform the combination
                        const result = await this.performCombination(user, rule);
                        if (result.success) {
                            combinationsPerformed.push(result);
                            console.log(`Auto-combination performed: ${rule.ruleId}`);
                        } else {
                            canPerform = false;
                        }
                    } else {
                        canPerform = false;
                    }
                }
            }

            if (combinationsPerformed.length > 0) {
                await user.save();
            }

            return combinationsPerformed;
        } catch (error) {
            console.error('Error checking auto-combinations:', error);
            return [];
        }
    }

    /**
     * Check if user has required ingredients
     */
    checkIngredients(user, ingredients) {
        for (const ingredient of ingredients) {
            const userItem = user.gachaCollection.find(item => item.itemId === ingredient.itemId);
            const userQuantity = userItem ? (userItem.quantity || 1) : 0;
            
            if (userQuantity < ingredient.quantity) {
                return false;
            }
        }
        return true;
    }

    /**
     * Perform a combination
     */
    async performCombination(user, rule) {
        try {
            // Validate ingredients
            if (!this.checkIngredients(user, rule.ingredients)) {
                return { 
                    success: false, 
                    error: 'Insufficient ingredients' 
                };
            }

            // Get result item from database
            const resultGachaItem = await GachaItem.findOne({ 
                itemId: rule.result.itemId, 
                isActive: true 
            });

            if (!resultGachaItem) {
                return { 
                    success: false, 
                    error: 'Result item not found' 
                };
            }

            // Consume ingredients
            for (const ingredient of rule.ingredients) {
                const userItem = user.gachaCollection.find(item => item.itemId === ingredient.itemId);
                if (userItem) {
                    userItem.quantity -= ingredient.quantity;
                    
                    // Remove item if quantity reaches 0
                    if (userItem.quantity <= 0) {
                        user.gachaCollection = user.gachaCollection.filter(item => item.itemId !== ingredient.itemId);
                    }
                }
            }

            // Add result item using the User model method
            const addResult = user.addGachaItem(resultGachaItem, rule.result.quantity, 'combined');

            console.log(`Combination successful: ${rule.ruleId} -> ${resultGachaItem.itemName} x${rule.result.quantity}`);

            return {
                success: true,
                ruleId: rule.ruleId,
                ingredients: rule.ingredients,
                resultItem: {
                    itemId: resultGachaItem.itemId,
                    itemName: resultGachaItem.itemName,
                    emojiId: resultGachaItem.emojiId, // Ensure emoji data is preserved
                    emojiName: resultGachaItem.emojiName,
                    rarity: resultGachaItem.rarity
                },
                resultQuantity: rule.result.quantity,
                isAutomatic: rule.isAutomatic
            };

        } catch (error) {
            console.error('Error performing combination:', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    /**
     * Get possible combinations for a user
     */
    async getPossibleCombinations(user) {
        try {
            const rules = await CombinationRule.find({ isActive: true });
            const possibleCombinations = [];

            for (const rule of rules) {
                const canMake = this.checkIngredients(user, rule.ingredients);
                const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
                
                if (resultItem) {
                    possibleCombinations.push({
                        ruleId: rule.ruleId,
                        rule: rule,
                        resultItem: {
                            itemId: resultItem.itemId,
                            itemName: resultItem.itemName,
                            emojiId: resultItem.emojiId,
                            emojiName: resultItem.emojiName,
                            rarity: resultItem.rarity,
                            description: resultItem.description,
                            flavorText: resultItem.flavorText
                        },
                        ingredients: rule.ingredients,
                        result: rule.result,
                        canMake: canMake,
                        isAutomatic: rule.isAutomatic,
                        priority: rule.priority
                    });
                }
            }

            return possibleCombinations.sort((a, b) => {
                // Sort by: can make first, then by priority, then by rule ID
                if (a.canMake !== b.canMake) return b.canMake - a.canMake;
                if (a.priority !== b.priority) return b.priority - a.priority;
                return a.ruleId.localeCompare(b.ruleId);
            });

        } catch (error) {
            console.error('Error getting possible combinations:', error);
            return [];
        }
    }

    /**
     * Preview a combination without performing it
     */
    async previewCombination(user, ruleId) {
        try {
            const rule = await CombinationRule.findOne({ ruleId, isActive: true });
            if (!rule) {
                return { success: false, error: 'Combination rule not found' };
            }

            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            if (!resultItem) {
                return { success: false, error: 'Result item not found' };
            }

            const canMake = this.checkIngredients(user, rule.ingredients);
            const missing = [];

            if (!canMake) {
                for (const ingredient of rule.ingredients) {
                    const userItem = user.gachaCollection.find(item => item.itemId === ingredient.itemId);
                    const userQuantity = userItem ? (userItem.quantity || 1) : 0;
                    
                    if (userQuantity < ingredient.quantity) {
                        missing.push({
                            itemId: ingredient.itemId,
                            required: ingredient.quantity,
                            have: userQuantity,
                            shortage: ingredient.quantity - userQuantity
                        });
                    }
                }
            }

            return {
                success: true,
                rule: rule,
                resultItem: {
                    itemId: resultItem.itemId,
                    itemName: resultItem.itemName,
                    emojiId: resultItem.emojiId,
                    emojiName: resultItem.emojiName,
                    rarity: resultItem.rarity,
                    description: resultItem.description,
                    flavorText: resultItem.flavorText
                },
                canMake: canMake,
                missing: missing,
                isAutomatic: rule.isAutomatic
            };

        } catch (error) {
            console.error('Error previewing combination:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Attempt a manual combination
     */
    async attemptCombination(user, ruleId) {
        try {
            const rule = await CombinationRule.findOne({ ruleId, isActive: true });
            if (!rule) {
                return { success: false, error: 'Combination rule not found' };
            }

            // Don't allow manual triggering of automatic rules
            if (rule.isAutomatic) {
                return { success: false, error: 'This combination happens automatically' };
            }

            const result = await this.performCombination(user, rule);
            
            if (result.success) {
                await user.save();
            }

            return result;

        } catch (error) {
            console.error('Error attempting combination:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Add item to user's collection (helper for combinations)
     */
    addItemToUser(user, gachaItem, quantity = 1, source = 'combined') {
        // Use the User model's addGachaItem method
        return user.addGachaItem(gachaItem, quantity, source);
    }

    /**
     * Get combination statistics for a user
     */
    getCombinationStats(user) {
        if (!user.gachaCollection) {
            return {
                totalCombined: 0,
                uniqueCombined: 0
            };
        }

        const combinedItems = user.gachaCollection.filter(item => item.source === 'combined');
        const totalCombined = combinedItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

        return {
            totalCombined: totalCombined,
            uniqueCombined: combinedItems.length
        };
    }
}

export default new CombinationService();
