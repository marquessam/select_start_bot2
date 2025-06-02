// src/services/combinationService.js - COMPLETE FIXED VERSION with confirmation system and debug logging
import { GachaItem, CombinationRule } from '../models/GachaItem.js';
import { Challenge } from '../models/Challenge.js';
import { config } from '../config/config.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
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
     * UPDATED: Check for possible combinations but DON'T perform them automatically
     * Returns possible combinations that can be confirmed by the user
     */
    async checkPossibleCombinations(user, triggerItemId = null) {
        try {
            if (!user.gachaCollection || user.gachaCollection.length === 0) {
                return [];
            }

            // Get all combination rules (both automatic and manual)
            const rules = await CombinationRule.find({ isActive: true });
            const possibleCombinations = [];

            for (const rule of rules) {
                const combinations = await this.findPossibleCombinationsForRule(user, rule, triggerItemId);
                possibleCombinations.push(...combinations);
            }

            // Sort by priority (higher priority first)
            possibleCombinations.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0));

            console.log(`Found ${possibleCombinations.length} possible combinations for ${user.raUsername}`);
            return possibleCombinations;

        } catch (error) {
            console.error('Error checking possible combinations:', error);
            return [];
        }
    }

    /**
     * Find all possible combinations for a specific rule
     * If triggerItemId is provided, only return combinations that use that item
     */
    async findPossibleCombinationsForRule(user, rule, triggerItemId = null) {
        const combinations = [];

        try {
            // Get user's items grouped by itemId
            const userItemMap = new Map();
            user.gachaCollection.forEach(item => {
                const existing = userItemMap.get(item.itemId) || { quantity: 0, item: item };
                existing.quantity += (item.quantity || 1);
                userItemMap.set(item.itemId, existing);
            });

            // Check if user has ingredients for this rule
            const requiredIngredients = rule.ingredients;
            const availableQuantities = [];

            for (const ingredient of requiredIngredients) {
                const userItem = userItemMap.get(ingredient.itemId);
                if (!userItem || userItem.quantity < ingredient.quantity) {
                    return []; // Missing ingredient, can't make this combination
                }
                availableQuantities.push(Math.floor(userItem.quantity / ingredient.quantity));
            }

            // If triggerItemId is specified, make sure this combination uses it
            if (triggerItemId) {
                const usesTriggerItem = requiredIngredients.some(ing => ing.itemId === triggerItemId);
                if (!usesTriggerItem) {
                    return []; // This combination doesn't use the trigger item
                }
            }

            // Calculate how many times this combination can be made
            const maxCombinations = Math.min(...availableQuantities);

            if (maxCombinations > 0) {
                // Get the result item info
                const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
                if (resultItem) {
                    // Create combination entry
                    combinations.push({
                        ruleId: rule.ruleId,
                        rule: rule,
                        resultItem: resultItem,
                        resultQuantity: rule.result.quantity || 1,
                        maxCombinations: maxCombinations,
                        ingredients: requiredIngredients.map(ing => ({
                            itemId: ing.itemId,
                            quantity: ing.quantity,
                            available: userItemMap.get(ing.itemId)?.quantity || 0,
                            item: userItemMap.get(ing.itemId)?.item
                        }))
                    });
                }
            }

        } catch (error) {
            console.error(`Error processing rule ${rule.ruleId}:`, error);
        }

        return combinations;
    }

    /**
     * UPDATED: Show combination confirmation UI instead of auto-performing
     * If multiple combinations possible, show selection menu
     * If single combination, show direct confirmation
     */
    async showCombinationAlert(interaction, user, possibleCombinations) {
        try {
            if (possibleCombinations.length === 0) {
                return; // No combinations to show
            }

            if (possibleCombinations.length === 1) {
                // Single combination - show direct confirmation
                await this.showSingleCombinationConfirmation(interaction, user, possibleCombinations[0]);
            } else {
                // Multiple combinations - show selection menu
                await this.showMultipleCombinationSelection(interaction, user, possibleCombinations);
            }

        } catch (error) {
            console.error('Error showing combination alert:', error);
        }
    }

    /**
     * Show confirmation for a single possible combination
     */
    async showSingleCombinationConfirmation(interaction, user, combination) {
        const { resultItem, resultQuantity, ingredients, maxCombinations } = combination;
        
        const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName);
        const rarityEmoji = this.getRarityEmoji(resultItem.rarity);

        // Build ingredients display
        let ingredientsText = '';
        for (const ingredient of ingredients) {
            const ingredientEmoji = formatGachaEmoji(ingredient.item.emojiId, ingredient.item.emojiName);
            ingredientsText += `${ingredientEmoji} ${ingredient.quantity}x ${ingredient.item.itemName}\n`;
        }

        // Check if this is a shadow unlock item for special messaging
        const isShadowUnlock = this.isShadowUnlockItem(resultItem);

        const embed = new EmbedBuilder()
            .setTitle(isShadowUnlock ? '🌙 SHADOW UNLOCK AVAILABLE!' : '⚗️ Combination Available!')
            .setColor(isShadowUnlock ? '#9932CC' : COLORS.WARNING)
            .setDescription(
                `You can create ${isShadowUnlock ? '**the Shadow Unlock item**' : 'a new item'} by combining ingredients!\n\n` +
                `**Recipe:**\n${ingredientsText}\n` +
                `**Creates:**\n${resultEmoji} ${rarityEmoji} **${resultQuantity}x ${resultItem.itemName}**\n\n` +
                `**Available combinations:** ${maxCombinations}\n\n` +
                `⚠️ **This will consume the ingredients!**` +
                (isShadowUnlock ? '\n\n🔓 **This will reveal this month\'s shadow challenge!**' : '')
            )
            .addFields(
                { name: 'Result Description', value: resultItem.description || 'No description', inline: false }
            )
            .setFooter({ text: 'Choose how many combinations to perform, or cancel.' })
            .setTimestamp();

        // Create buttons for different quantities
        const actionRow = new ActionRowBuilder();
        
        if (maxCombinations >= 1) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_1_${user.raUsername}`)
                    .setLabel(isShadowUnlock ? 'Unlock Shadow!' : 'Make 1')
                    .setStyle(isShadowUnlock ? ButtonStyle.Danger : ButtonStyle.Primary)
                    .setEmoji(isShadowUnlock ? '🌙' : '⚗️')
            );
        }
        
        if (maxCombinations >= 5 && !isShadowUnlock) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_5_${user.raUsername}`)
                    .setLabel('Make 5')
                    .setStyle(ButtonStyle.Primary)
            );
        }
        
        if (maxCombinations >= 10 && !isShadowUnlock) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_${maxCombinations}_${user.raUsername}`)
                    .setLabel(`Make All (${maxCombinations})`)
                    .setStyle(ButtonStyle.Success)
            );
        } else if (maxCombinations > 1 && !isShadowUnlock) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_${maxCombinations}_${user.raUsername}`)
                    .setLabel(`Make All (${maxCombinations})`)
                    .setStyle(ButtonStyle.Success)
            );
        }

        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`combo_cancel_${user.raUsername}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.followUp({
            embeds: [embed],
            components: [actionRow],
            ephemeral: true
        });
    }

    /**
     * Show selection menu for multiple possible combinations
     */
    async showMultipleCombinationSelection(interaction, user, combinations) {
        // Limit to 25 options for Discord select menu
        const limitedCombinations = combinations.slice(0, 25);

        // Check if any combinations are shadow unlocks
        const hasShadowUnlock = limitedCombinations.some(combo => this.isShadowUnlockItem(combo.resultItem));

        const embed = new EmbedBuilder()
            .setTitle(hasShadowUnlock ? '🌙 SHADOW UNLOCK + MORE AVAILABLE!' : '⚗️ Multiple Combinations Available!')
            .setColor(hasShadowUnlock ? '#9932CC' : COLORS.INFO)
            .setDescription(
                `You have ingredients for multiple combinations!\n` +
                `Choose which one you'd like to make:\n\n` +
                `⚠️ **Combinations will consume ingredients!**` +
                (hasShadowUnlock ? '\n\n🌙 **One option will unlock the shadow challenge!**' : '')
            )
            .setFooter({ text: 'Select a combination from the menu below, or cancel.' })
            .setTimestamp();

        // Create select menu options
        const selectOptions = limitedCombinations.map((combo, index) => {
            const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName);
            const ingredientNames = combo.ingredients.map(ing => ing.item.itemName).join(' + ');
            const isShadowUnlock = this.isShadowUnlockItem(combo.resultItem);
            
            return {
                label: `${combo.resultQuantity}x ${combo.resultItem.itemName}${isShadowUnlock ? ' 🌙' : ''}`.slice(0, 100),
                value: `combo_select_${combo.ruleId}_${user.raUsername}`,
                description: `${ingredientNames} (max: ${combo.maxCombinations})${isShadowUnlock ? ' - SHADOW!' : ''}`.slice(0, 100),
                emoji: combo.resultItem.emojiId ? 
                    { id: combo.resultItem.emojiId, name: combo.resultItem.emojiName } : 
                    combo.resultItem.emojiName
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`combo_selection_${user.raUsername}`)
            .setPlaceholder('Choose a combination...')
            .addOptions(selectOptions);

        const cancelButton = new ButtonBuilder()
            .setCustomId(`combo_cancel_${user.raUsername}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const components = [
            new ActionRowBuilder().addComponents(selectMenu),
            new ActionRowBuilder().addComponents(cancelButton)
        ];

        await interaction.followUp({
            embeds: [embed],
            components: components,
            ephemeral: true
        });
    }

    /**
     * UPDATED: Perform a specific combination after confirmation with FIXED ingredient removal
     */
    async performCombination(user, ruleId, quantity = 1) {
        try {
            const rule = await CombinationRule.findOne({ ruleId, isActive: true });
            if (!rule) {
                throw new Error('Combination rule not found');
            }

            // Verify user still has the required ingredients
            const possibleCombinations = await this.findPossibleCombinationsForRule(user, rule);
            if (possibleCombinations.length === 0) {
                throw new Error('You no longer have the required ingredients');
            }

            const combination = possibleCombinations[0];
            if (combination.maxCombinations < quantity) {
                throw new Error(`You can only make ${combination.maxCombinations} of this combination`);
            }

            // Get result item
            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            if (!resultItem) {
                throw new Error('Result item not found');
            }

            // ENHANCED DEBUGGING: Log before removal
            console.log('🔧 COMBINATION DEBUG - Before removal:');
            console.log('Rule ingredients:', rule.ingredients);
            console.log('User collection before:', user.gachaCollection.map(item => ({
                itemId: item.itemId,
                itemName: item.itemName,
                quantity: item.quantity
            })));

            // FIXED: Remove ingredients from user's collection with better error handling
            const removedIngredients = [];
            for (const ingredient of rule.ingredients) {
                const totalToRemove = ingredient.quantity * quantity;
                
                console.log(`🗑️ Attempting to remove: ${totalToRemove}x ${ingredient.itemId}`);
                
                // Find the item in user's collection
                const userItem = user.gachaCollection.find(item => item.itemId === ingredient.itemId);
                if (!userItem) {
                    throw new Error(`Ingredient not found in collection: ${ingredient.itemId}`);
                }
                
                console.log(`📦 Found user item: ${userItem.itemName} (quantity: ${userItem.quantity})`);
                
                if ((userItem.quantity || 1) < totalToRemove) {
                    throw new Error(`Insufficient quantity of ${ingredient.itemId}. Need ${totalToRemove}, have ${userItem.quantity || 1}`);
                }

                // FIXED: Use the correct removeGachaItem method
                const removeSuccess = user.removeGachaItem(ingredient.itemId, totalToRemove);
                if (!removeSuccess) {
                    throw new Error(`Failed to remove ingredient: ${ingredient.itemId}`);
                }
                
                removedIngredients.push({
                    itemId: ingredient.itemId,
                    itemName: userItem.itemName,
                    quantityRemoved: totalToRemove
                });
                
                console.log(`✅ Successfully removed: ${totalToRemove}x ${ingredient.itemId}`);
            }

            // ENHANCED DEBUGGING: Log after removal
            console.log('🔧 COMBINATION DEBUG - After removal:');
            console.log('User collection after:', user.gachaCollection.map(item => ({
                itemId: item.itemId,
                itemName: item.itemName,
                quantity: item.quantity
            })));
            console.log('Removed ingredients:', removedIngredients);

            // Add result item(s) to user's collection
            const totalResultQuantity = (rule.result.quantity || 1) * quantity;
            const addResult = user.addGachaItem(resultItem, totalResultQuantity, 'combined');

            console.log(`✅ Combination successful: ${user.raUsername} made ${quantity}x ${rule.ruleId}`);
            console.log(`📦 Added result: ${totalResultQuantity}x ${resultItem.itemName}`);

            const result = {
                success: true,
                ruleId: rule.ruleId,
                resultItem: resultItem,
                resultQuantity: totalResultQuantity,
                addResult: addResult,
                rule: rule,
                ingredients: rule.ingredients,
                removedIngredients: removedIngredients // NEW: Track what was actually removed
            };

            // Check for shadow unlock after confirmation
            await this.checkForShadowUnlock(user, result);

            return result;

        } catch (error) {
            console.error('❌ Error performing combination:', error);
            console.error('Error stack:', error.stack);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * NEW: Trigger combination alerts for player-to-player transfers
     * Similar to admin gifts but with different messaging
     */
    async triggerCombinationAlertsForPlayerTransfer(recipient, giftedItemId, giverUsername) {
        try {
            // Check for possible combinations with the newly given item
            const possibleCombinations = await this.checkPossibleCombinations(recipient, giftedItemId);
            
            if (possibleCombinations.length === 0) {
                return { hasCombinations: false };
            }

            if (!this.client) {
                console.log('No client set for combination alerts');
                return { hasCombinations: false, error: 'No Discord client available' };
            }

            // Send combination alert to gacha channel for the RECIPIENT
            try {
                const gachaChannelId = '1377092881885696022'; // Gacha channel
                const guild = await this.client.guilds.cache.first(); // Get the main guild
                const channel = await guild.channels.fetch(gachaChannelId);
                
                if (!channel) {
                    console.error('Gacha channel not found for player transfer combination alert');
                    return { hasCombinations: false, error: 'Gacha channel not found' };
                }

                // Create a mock interaction that sends to the gacha channel for the RECIPIENT
                const mockInteraction = {
                    followUp: async (options) => {
                        // Get the recipient's Discord member for tagging
                        let memberTag = `**${recipient.raUsername}**`;
                        try {
                            const member = await guild.members.fetch(recipient.discordId);
                            memberTag = `<@${recipient.discordId}>`;
                        } catch (error) {
                            console.log('Could not fetch member for tagging, using username');
                        }

                        // Send to gacha channel with recipient tagged
                        await channel.send({
                            content: `🎁 **Player Gift Alert!** ${memberTag} received an item from **${giverUsername}** and has combination options!`,
                            ...options,
                            ephemeral: false // Make sure it's visible in the channel
                        });
                    },
                    user: { id: recipient.discordId, username: recipient.raUsername } // Use RECIPIENT's info
                };

                // Show the combination alert using our existing system
                await this.showCombinationAlert(mockInteraction, recipient, possibleCombinations);
                
                return { 
                    hasCombinations: true, 
                    combinationCount: possibleCombinations.length 
                };

            } catch (channelError) {
                console.error('Error sending to gacha channel, trying DM fallback:', channelError);
                
                // Fallback: Try to DM the recipient directly
                try {
                    const guild = await this.client.guilds.cache.first();
                    const member = await guild.members.fetch(recipient.discordId);
                    
                    const mockDMInteraction = {
                        followUp: async (options) => {
                            await member.send({
                                content: `🎁 **Player Gift + Combinations Available!**\n**${giverUsername}** gave you an item!`,
                                ...options
                            });
                        },
                        user: { id: recipient.discordId, username: recipient.raUsername }
                    };

                    await this.showCombinationAlert(mockDMInteraction, recipient, possibleCombinations);
                    
                    return { 
                        hasCombinations: true, 
                        combinationCount: possibleCombinations.length,
                        sentViaDM: true
                    };

                } catch (dmError) {
                    console.error('Error sending DM combination alert:', dmError);
                    return { 
                        hasCombinations: true, 
                        combinationCount: possibleCombinations.length,
                        error: 'Could not deliver combination alert to recipient'
                    };
                }
            }

        } catch (error) {
            console.error('Error triggering combination alerts for player transfer:', error);
            return { hasCombinations: false, error: error.message };
        }
    }

    /**
     * FIXED: Trigger combination alerts for admin-given items - Send to RECIPIENT not admin
     */
    async triggerCombinationAlertsForAdminGift(user, giftedItemId, adminInteraction) {
        try {
            // Check for possible combinations with the newly given item
            const possibleCombinations = await this.checkPossibleCombinations(user, giftedItemId);
            
            if (possibleCombinations.length === 0) {
                return { hasCombinations: false };
            }

            if (!this.client) {
                console.log('No client set for combination alerts');
                return { hasCombinations: false, error: 'No Discord client available' };
            }

            // FIXED: Send combination alert to gacha channel for the RECIPIENT, not as admin follow-up
            try {
                const gachaChannelId = '1377092881885696022'; // Gacha channel
                const guild = await this.client.guilds.fetch(adminInteraction.guildId);
                const channel = await guild.channels.fetch(gachaChannelId);
                
                if (!channel) {
                    console.error('Gacha channel not found for admin gift combination alert');
                    return { hasCombinations: false, error: 'Gacha channel not found' };
                }

                // Create a mock interaction that sends to the gacha channel for the RECIPIENT
                const mockInteraction = {
                    followUp: async (options) => {
                        // Get the recipient's Discord member for tagging
                        let memberTag = `**${user.raUsername}**`;
                        try {
                            const member = await guild.members.fetch(user.discordId);
                            memberTag = `<@${user.discordId}>`;
                        } catch (error) {
                            console.log('Could not fetch member for tagging, using username');
                        }

                        // Send to gacha channel with recipient tagged
                        await channel.send({
                            content: `🎁 **Admin Gift Alert!** ${memberTag} received an item and has combination options!`,
                            ...options,
                            ephemeral: false // Make sure it's visible in the channel
                        });
                    },
                    user: { id: user.discordId, username: user.raUsername } // Use RECIPIENT's info
                };

                // Show the combination alert using our existing system
                await this.showCombinationAlert(mockInteraction, user, possibleCombinations);
                
                return { 
                    hasCombinations: true, 
                    combinationCount: possibleCombinations.length 
                };

            } catch (channelError) {
                console.error('Error sending to gacha channel, trying DM fallback:', channelError);
                
                // Fallback: Try to DM the recipient directly
                try {
                    const guild = await this.client.guilds.fetch(adminInteraction.guildId);
                    const member = await guild.members.fetch(user.discordId);
                    
                    const mockDMInteraction = {
                        followUp: async (options) => {
                            await member.send({
                                content: '🎁 **Admin Gift + Combinations Available!**',
                                ...options
                            });
                        },
                        user: { id: user.discordId, username: user.raUsername }
                    };

                    await this.showCombinationAlert(mockDMInteraction, user, possibleCombinations);
                    
                    return { 
                        hasCombinations: true, 
                        combinationCount: possibleCombinations.length,
                        sentViaDM: true
                    };

                } catch (dmError) {
                    console.error('Error sending DM combination alert:', dmError);
                    return { 
                        hasCombinations: true, 
                        combinationCount: possibleCombinations.length,
                        error: 'Could not deliver combination alert to recipient'
                    };
                }
            }

        } catch (error) {
            console.error('Error triggering combination alerts for admin gift:', error);
            return { hasCombinations: false, error: error.message };
        }
    }

    /**
     * UPDATED: Check if the combination result is a shadow unlock item and toggle reveal
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
     * Check if an item is the shadow unlock item
     */
    isShadowUnlockItem(item) {
        // Check by item ID (999) or by name (Shadow Unlock)
        return item.itemId === '999' || 
               item.itemName?.toLowerCase().includes('shadow unlock') ||
               item.itemName?.toLowerCase().includes('shadow_unlock');
    }

    /**
     * Send special alert when shadow is unlocked
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
     * UPDATED: Handle combination button and select menu interactions
     */
    async handleCombinationInteraction(interaction) {
        try {
            if (!interaction.customId.startsWith('combo_')) return false;

            // Don't defer update for cancellation buttons
            if (interaction.customId.includes('_cancel_')) {
                await interaction.deferUpdate();
                await interaction.editReply({
                    content: '❌ Combination cancelled.',
                    embeds: [],
                    components: []
                });
                return true;
            }

            await interaction.deferUpdate();

            const parts = interaction.customId.split('_');
            const action = parts[1]; // confirm, cancel, select, selection
            
            if (action === 'confirm') {
                const ruleId = parts[2];
                const quantity = parseInt(parts[3]);
                const username = parts[4];

                // Verify user
                const user = await this.getUserForInteraction(interaction, username);
                if (!user) return true;

                // Perform the combination
                const result = await this.performCombination(user, ruleId, quantity);
                
                if (result.success) {
                    await user.save();
                    await this.showCombinationSuccess(interaction, result, quantity);
                    
                    // Send public alert for successful combinations
                    await this.sendCombinationAlert(user, result);
                } else {
                    await interaction.editReply({
                        content: `❌ Combination failed: ${result.error}`,
                        embeds: [],
                        components: []
                    });
                }
                return true;
            }

            if (action === 'select') {
                const ruleId = parts[2];
                const username = parts[3];

                // Get the specific combination and show confirmation
                const user = await this.getUserForInteraction(interaction, username);
                if (!user) return true;

                const rule = await CombinationRule.findOne({ ruleId });
                const possibleCombinations = await this.findPossibleCombinationsForRule(user, rule);
                
                if (possibleCombinations.length > 0) {
                    await this.showSingleCombinationConfirmation(interaction, user, possibleCombinations[0]);
                } else {
                    await interaction.editReply({
                        content: '❌ This combination is no longer available.',
                        embeds: [],
                        components: []
                    });
                }
                return true;
            }

        } catch (error) {
            console.error('Error handling combination interaction:', error);
            await interaction.editReply({
                content: '❌ An error occurred while processing the combination.',
                embeds: [],
                components: []
            });
        }
        return false;
    }

    /**
     * Show combination success message
     */
    async showCombinationSuccess(interaction, result, quantity) {
        const { resultItem, resultQuantity, addResult } = result;
        const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName);
        const rarityEmoji = this.getRarityEmoji(resultItem.rarity);
        const isShadowUnlock = this.isShadowUnlockItem(resultItem);

        const embed = new EmbedBuilder()
            .setTitle(isShadowUnlock ? '🌙 SHADOW UNLOCKED!' : '✨ Combination Successful!')
            .setColor(isShadowUnlock ? '#9932CC' : COLORS.SUCCESS)
            .setDescription(
                `You created ${isShadowUnlock ? '**the Shadow Unlock item**' : 'a new item'}!\n\n` +
                `${resultEmoji} ${rarityEmoji} **${resultQuantity}x ${resultItem.itemName}**\n\n` +
                `*${resultItem.description}*` +
                (isShadowUnlock ? '\n\n🔓 **The shadow challenge has been revealed to the server!**' : '')
            )
            .setFooter({ text: 'The new item has been added to your collection!' })
            .setTimestamp();

        if (addResult && addResult.wasStacked) {
            embed.addFields({
                name: '📚 Stacked',
                value: `Added to existing stack`,
                inline: true
            });
        }

        if (addResult && addResult.isNew) {
            embed.addFields({
                name: '✨ New Item',
                value: `First time obtaining this item!`,
                inline: true
            });
        }

        await interaction.editReply({
            embeds: [embed],
            components: []
        });
    }

    /**
     * Send combination alert to gacha channel (public announcement)
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
                .setTitle(isShadowUnlock ? '🌙 SHADOW UNLOCK COMBINATION!' : '⚗️ Combination Created!')
                .setColor(isShadowUnlock ? '#9932CC' : COLORS.SUCCESS)
                .setDescription(
                    `${user.raUsername} ${isShadowUnlock ? 'unlocked the shadow!' : 'created a combination!'}\n\n` +
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
                text: `Combination ID: ${ruleId} • Player confirmed this combination` 
            });

            // Send the alert
            await channel.send({ embeds: [embed] });
            
            console.log(`✅ Sent combination alert for ${user.raUsername}: ${ruleId}`);

        } catch (error) {
            console.error('Error sending combination alert:', error);
        }
    }

    /**
     * Helper to get user and verify permissions
     */
    async getUserForInteraction(interaction, username) {
        const { User } = await import('../models/User.js');
        const user = await User.findOne({ 
            raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
        });

        if (!user || user.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: '❌ You can only perform combinations on your own collection.',
                embeds: [],
                components: []
            });
            return null;
        }

        return user;
    }

    /**
     * LEGACY: Kept for backwards compatibility in old code
     */
    async checkAutoCombinations(user) {
        // Return empty array since we no longer auto-combine
        // This prevents old code from breaking
        return [];
    }

    /**
     * Helper methods
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
        return emojis[rarity] || emojis.common;
    }

    /**
     * Get combination stats for display (keep for backwards compatibility)
     */
    getCombinationStats(user) {
        if (!user.gachaCollection) {
            return { totalCombined: 0 };
        }

        const combinedItems = user.gachaCollection.filter(item => item.source === 'combined');
        const totalCombined = combinedItems.reduce((total, item) => total + (item.quantity || 1), 0);

        return { totalCombined };
    }

    /**
     * Get possible combinations for a user (used by collection command)
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
}

export default new CombinationService(
