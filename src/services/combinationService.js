// src/services/combinationService.js - UPDATED with Shadow Unlock integration
import { GachaItem, CombinationRule } from '../models/GachaItem.js';
import { Challenge } from '../models/Challenge.js';
import { config } from '../config/config.js';
import { EmbedBuilder } from 'discord.js';
import { formatGachaEmoji } from '../config/gachaEmojis.js';
import { COLORS } from '../utils/FeedUtils.js';

class CombinationService {
    constructor() {
        this.isInitialized = false;
        this.client = null;
    }

    // Method to set Discord client for alerts
    setClient(client) {
        this.client = client;
        console.log('✅ Combination service client set for alerts');
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
                            
                            // NEW: Check for shadow unlock and toggle reveal
                            await this.checkForShadowUnlock(user, result);
                            
                            // Send alert for this combination
                            await this.sendCombinationAlert(user, result);
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
     * NEW: Check if the combination result is a shadow unlock item and toggle reveal
     */
    async checkForShadowUnlock(user, combinationResult) {
        try {
            const { resultItem } = combinationResult;
            
            // Check if this is the shadow unlock item (ID "999" or name "Shadow Unlock")
            if (this.isShadowUnlockItem(resultItem)) {
                console.log(`🌙 Shadow unlock detected for user ${user.raUsername}!`);
                
                // Get current month and year
                const now = new Date();
                const currentMonth = now.getMonth() + 1; // JS months are 0-indexed
                const currentYear = now.getFullYear();
                
                // Find current month's challenge
                const monthStart = new Date(currentYear, currentMonth - 1, 1);
                const nextMonthStart = new Date(currentYear, currentMonth, 1);
                
                const currentChallenge = await Challenge.findOne({
                    date: {
                        $gte: monthStart,
                        $lt: nextMonthStart
                    }
                });
                
                if (!currentChallenge) {
                    console.log(`No challenge found for ${currentMonth}/${currentYear}`);
                    return;
                }
                
                if (!currentChallenge.shadow_challange_gameid) {
                    console.log(`No shadow challenge set for ${currentMonth}/${currentYear}`);
                    return;
                }
                
                // Check if shadow is already revealed
                if (currentChallenge.shadow_challange_revealed) {
                    console.log(`Shadow challenge for ${currentMonth}/${currentYear} is already revealed`);
                    return;
                }
                
                // REVEAL THE SHADOW CHALLENGE!
                currentChallenge.shadow_challange_revealed = true;
                await currentChallenge.save();
                
                console.log(`✅ Shadow challenge revealed for ${currentMonth}/${currentYear} by ${user.raUsername}!`);
                
                // Send special shadow unlock alert
                await this.sendShadowUnlockAlert(user, currentChallenge, currentMonth, currentYear);
                
            }
        } catch (error) {
            console.error('Error checking for shadow unlock:', error);
        }
    }

    /**
     * NEW: Check if an item is the shadow unlock item
     */
    isShadowUnlockItem(item) {
        // Check by item ID (999) or by name (Shadow Unlock)
        return item.itemId === '999' || 
               item.itemName?.toLowerCase().includes('shadow unlock') ||
               item.itemName?.toLowerCase().includes('shadow_unlock');
    }

    /**
     * NEW: Send special alert when shadow is unlocked
     */
    async sendShadowUnlockAlert(user, challenge, month, year) {
        if (!this.client) {
            console.log('No client set for shadow unlock alert');
            return;
        }

        try {
            // Get the general channel for major announcements
            const generalChannelId = config.discord.generalChannelId || '1224834039804334121'; // Fallback to general
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            const channel = await guild.channels.fetch(generalChannelId);
            
            if (!channel) {
                console.error('General channel not found for shadow unlock alert');
                return;
            }

            // Get month name
            const monthNames = ["January", "February", "March", "April", "May", "June",
                              "July", "August", "September", "October", "November", "December"];
            const monthName = monthNames[month - 1];

            // Create dramatic shadow unlock embed
            const embed = new EmbedBuilder()
                .setTitle('🌙 SHADOW CHALLENGE REVEALED!')
                .setColor('#9932CC') // Dark purple
                .setDescription(
                    `**${user.raUsername}** has unlocked the secrets!\n\n` +
                    `🔓 The shadow challenge for **${monthName} ${year}** has been revealed!\n\n` +
                    `**Shadow Game:** ${challenge.shadow_game_title || 'Mystery Game'}\n\n` +
                    `*The hidden challenge emerges from the darkness...*`
                )
                .setTimestamp();

            // Add shadow game thumbnail if available
            if (challenge.shadow_game_icon_url) {
                embed.setThumbnail(`https://retroachievements.org${challenge.shadow_game_icon_url}`);
            }

            // Add some dramatic flair
            embed.addFields({
                name: '🎯 How to Participate',
                value: `Use \`/challenge\` to view the newly revealed shadow challenge details!`,
                inline: false
            });

            embed.setFooter({ 
                text: `Unlocked by ${user.raUsername} through item combination • The shadow awaits...` 
            });

            // Send the dramatic announcement
            await channel.send({ 
                content: `🌙 **BREAKING:** The shadow has been unveiled! 🌙`,
                embeds: [embed] 
            });
            
            console.log(`✅ Sent shadow unlock alert for ${user.raUsername}`);

        } catch (error) {
            console.error('Error sending shadow unlock alert:', error);
        }
    }

    /**
     * Send combination alert to gacha channel
     */
    async sendCombinationAlert(user, combinationResult) {
        if (!this.client) {
            console.log('No client set for combination alerts');
            return;
        }

        try {
            // Get the gacha channel
            const gachaChannelId = '1377092881885696022'; // Gacha channel
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            const channel = await guild.channels.fetch(gachaChannelId);
            
            if (!channel) {
                console.error('Gacha channel not found for combination alert');
                return;
            }

            const { ruleId, resultItem, resultQuantity } = combinationResult;
            
            // Create a beautiful alert embed
            const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName);
            const rarityEmoji = this.getRarityEmoji(resultItem.rarity);
            
            // Check if this is a shadow unlock for special formatting
            const isShadowUnlock = this.isShadowUnlockItem(resultItem);
            
            const embed = new EmbedBuilder()
                .setTitle(isShadowUnlock ? '🌙 SHADOW UNLOCK COMBINATION!' : '⚡ Auto-Combination Triggered!')
                .setColor(isShadowUnlock ? '#9932CC' : COLORS.SUCCESS)
                .setDescription(
                    `${user.raUsername} ${isShadowUnlock ? 'unlocked the shadow!' : 'discovered a combination!'}\n\n` +
                    `${resultEmoji} **${resultQuantity}x ${resultItem.itemName}** ${rarityEmoji}\n\n` +
                    `*${resultItem.description || 'A mysterious creation...'}*` +
                    (isShadowUnlock ? '\n\n🔓 **The shadow challenge has been revealed!**' : '')
                )
                .setTimestamp();

            // Show the ingredients used if available
            if (combinationResult.ingredients) {
                let ingredientsText = '';
                for (const ingredient of combinationResult.ingredients) {
                    const ingredientItem = await GachaItem.findOne({ itemId: ingredient.itemId });
                    if (ingredientItem) {
                        const emoji = formatGachaEmoji(ingredientItem.emojiId, ingredientItem.emojiName);
                        ingredientsText += `${emoji} ${ingredient.quantity}x ${ingredientItem.itemName}\n`;
                    }
                }

                if (ingredientsText) {
                    embed.addFields({ 
                        name: 'Ingredients Used', 
                        value: ingredientsText,
                        inline: true 
                    });
                }
            }

            // Add result info
            embed.addFields({ 
                name: 'Result', 
                value: `${resultEmoji} ${resultQuantity}x **${resultItem.itemName}**`,
                inline: true 
            });

            // Add some flavor
            if (resultItem.flavorText) {
                embed.addFields({
                    name: 'Flavor Text',
                    value: `*"${resultItem.flavorText}"*`,
                    inline: false
                });
            }

            embed.setFooter({ 
                text: `Combination ID: ${ruleId} • All combinations happen automatically!` 
            });

            // Send the alert
            await channel.send({ embeds: [embed] });
            
            console.log(`✅ Sent combination alert for ${user.raUsername}: ${ruleId}`);

        } catch (error) {
            console.error('Error sending combination alert:', error);
        }
    }

    /**
     * Get rarity emoji for combinations
     */
    getRarityEmoji(rarity) {
        const emojis = {
            common: '⚪',
            uncommon: '🟢',
            rare: '🔵',
            epic: '🟣',
            legendary: '🟡',
            mythic: '🌟'
        };
        return emojis[rarity] || '❓';
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
                    emojiId: resultGachaItem.emojiId,
                    emojiName: resultGachaItem.emojiName,
                    rarity: resultGachaItem.rarity,
                    description: resultGachaItem.description,
                    flavorText: resultGachaItem.flavorText
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
                // Check for shadow unlock
                await this.checkForShadowUnlock(user, result);
                await user.save();
                // Send alert for manual combinations too
                await this.sendCombinationAlert(user, result);
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
