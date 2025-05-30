// src/services/combinationService.js - Simple combination system
import { GachaItem, CombinationRule } from '../models/GachaItem.js';
import { User } from '../models/User.js';

class CombinationService {
    
    /**
     * Check and execute automatic combinations after user gets new items
     */
    async checkAutoCombinations(user) {
        if (!user.gachaCollection) return [];
        
        const autoCombinations = [];
        const autoRules = await CombinationRule.find({ 
            isActive: true, 
            isAutomatic: true 
        }).sort({ priority: -1 }); // Higher priority first
        
        let madeChanges = true;
        while (madeChanges) {
            madeChanges = false;
            
            for (const rule of autoRules) {
                const combination = await this.attemptCombination(user, rule.ruleId, false);
                if (combination.success) {
                    autoCombinations.push(combination);
                    madeChanges = true;
                    // Keep checking as new combinations might unlock more auto-combinations
                }
            }
        }
        
        if (autoCombinations.length > 0) {
            await user.save();
        }
        
        return autoCombinations;
    }
    
    /**
     * Attempt to perform a specific combination
     */
    async attemptCombination(user, ruleId, saveUser = true) {
        try {
            const rule = await CombinationRule.findOne({ ruleId, isActive: true });
            if (!rule) {
                return { success: false, error: 'Combination not found' };
            }
            
            // Check if user has all required ingredients
            const hasIngredients = this.checkIngredients(user, rule);
            if (!hasIngredients.success) {
                return { success: false, error: hasIngredients.error, missing: hasIngredients.missing };
            }
            
            // Get result item info
            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            if (!resultItem) {
                return { success: false, error: 'Result item not found' };
            }
            
            // Consume ingredients
            this.consumeIngredients(user, rule);
            
            // Add result
            this.addItemToUser(user, resultItem, rule.result.quantity);
            
            if (saveUser) {
                await user.save();
            }
            
            return {
                success: true,
                rule,
                resultItem,
                resultQuantity: rule.result.quantity,
                ingredients: rule.ingredients
            };
            
        } catch (error) {
            console.error('Error in combination:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Check if user has required ingredients
     */
    checkIngredients(user, rule) {
        const missing = [];
        
        for (const ingredient of rule.ingredients) {
            const userItem = user.gachaCollection.find(item => item.itemId === ingredient.itemId);
            const have = userItem ? (userItem.quantity || 1) : 0;
            const need = ingredient.quantity;
            
            if (have < need) {
                missing.push({
                    itemId: ingredient.itemId,
                    need,
                    have,
                    shortage: need - have
                });
            }
        }
        
        if (missing.length > 0) {
            return { success: false, error: 'Not enough ingredients', missing };
        }
        
        return { success: true };
    }
    
    /**
     * Consume ingredients from user's collection
     */
    consumeIngredients(user, rule) {
        for (const ingredient of rule.ingredients) {
            const userItem = user.gachaCollection.find(item => item.itemId === ingredient.itemId);
            if (userItem) {
                userItem.quantity = (userItem.quantity || 1) - ingredient.quantity;
                
                // Remove item if quantity reaches 0
                if (userItem.quantity <= 0) {
                    const index = user.gachaCollection.findIndex(item => item.itemId === ingredient.itemId);
                    if (index > -1) {
                        user.gachaCollection.splice(index, 1);
                    }
                }
            }
        }
    }
    
    /**
     * Add result item to user's collection
     */
    addItemToUser(user, gachaItem, quantity) {
        if (!user.gachaCollection) {
            user.gachaCollection = [];
        }
        
        const existingItem = user.gachaCollection.find(item => item.itemId === gachaItem.itemId);
        
        if (existingItem && gachaItem.maxStack > 1) {
            // Stack the item
            const newQuantity = Math.min(existingItem.quantity + quantity, gachaItem.maxStack);
            existingItem.quantity = newQuantity;
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
                quantity: quantity,
                source: 'combined'
            });
        }
    }
    
    /**
     * Get all possible combinations for user's current items
     */
    async getPossibleCombinations(user) {
        if (!user.gachaCollection) return [];
        
        const allRules = await CombinationRule.find({ isActive: true });
        const possible = [];
        
        for (const rule of allRules) {
            const hasIngredients = this.checkIngredients(user, rule);
            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            
            possible.push({
                ruleId: rule.ruleId,
                canMake: hasIngredients.success,
                ingredients: rule.ingredients,
                result: rule.result,
                resultItem,
                isAutomatic: rule.isAutomatic,
                missing: hasIngredients.missing || []
            });
        }
        
        return possible.sort((a, b) => {
            // Sort: can make first, then by automatic status
            if (a.canMake && !b.canMake) return -1;
            if (!a.canMake && b.canMake) return 1;
            if (a.isAutomatic && !b.isAutomatic) return -1;
            if (!a.isAutomatic && b.isAutomatic) return 1;
            return 0;
        });
    }
    
    /**
     * Get all items user could theoretically get through combinations
     */
    async getAllPossibleResults(user) {
        const rules = await CombinationRule.find({ isActive: true });
        const resultIds = [...new Set(rules.map(rule => rule.result.itemId))];
        
        const results = [];
        for (const itemId of resultIds) {
            const item = await GachaItem.findOne({ itemId });
            if (item) {
                const userHas = user.gachaCollection.some(userItem => userItem.itemId === itemId);
                results.push({
                    item,
                    owned: userHas
                });
            }
        }
        
        return results;
    }
    
    /**
     * Get user's combination statistics
     */
    getCombinationStats(user) {
        if (!user.gachaCollection) {
            return {
                totalCombined: 0,
                combinedItems: 0,
                uniqueCombined: 0
            };
        }
        
        const combinedItems = user.gachaCollection.filter(item => item.source === 'combined');
        const totalCombined = combinedItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
        
        return {
            totalCombined,
            combinedItems: combinedItems.length,
            uniqueCombined: combinedItems.length
        };
    }
    
    /**
     * Preview what a combination would produce
     */
    async previewCombination(user, ruleId) {
        const rule = await CombinationRule.findOne({ ruleId, isActive: true });
        if (!rule) {
            return { success: false, error: 'Combination not found' };
        }
        
        const hasIngredients = this.checkIngredients(user, rule);
        const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
        
        return {
            success: true,
            rule,
            resultItem,
            canMake: hasIngredients.success,
            missing: hasIngredients.missing || [],
            isAutomatic: rule.isAutomatic
        };
    }
}

export default new CombinationService();
