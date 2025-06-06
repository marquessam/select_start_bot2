// src/services/combinationService.js - UPDATED with animated emoji support
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

    setClient(client) {
        this.client = client;
    }

    async checkPossibleCombinations(user, triggerItemId = null) {
        try {
            if (!user.gachaCollection || user.gachaCollection.length === 0) {
                return [];
            }

            const rules = await CombinationRule.find({ isActive: true });
            const possibleCombinations = [];

            for (const rule of rules) {
                const combinations = await this.findPossibleCombinationsForRule(user, rule, triggerItemId);
                possibleCombinations.push(...combinations);
            }

            possibleCombinations.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0));
            return possibleCombinations;

        } catch (error) {
            console.error('Error checking possible combinations:', error);
            return [];
        }
    }

    async findPossibleCombinationsForRule(user, rule, triggerItemId = null) {
        const combinations = [];

        try {
            const userItemMap = new Map();
            user.gachaCollection.forEach(item => {
                const existing = userItemMap.get(item.itemId) || { quantity: 0, item: item };
                existing.quantity += (item.quantity || 1);
                userItemMap.set(item.itemId, existing);
            });

            const requiredIngredients = rule.ingredients;
            const availableQuantities = [];

            for (const ingredient of requiredIngredients) {
                const userItem = userItemMap.get(ingredient.itemId);
                if (!userItem || userItem.quantity < ingredient.quantity) {
                    return [];
                }
                availableQuantities.push(Math.floor(userItem.quantity / ingredient.quantity));
            }

            if (triggerItemId) {
                const usesTriggerItem = requiredIngredients.some(ing => ing.itemId === triggerItemId);
                if (!usesTriggerItem) {
                    return [];
                }
            }

            const maxCombinations = Math.min(...availableQuantities);

            if (maxCombinations > 0) {
                const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
                if (resultItem) {
                    const combinationObj = {
                        ruleId: rule.ruleId, // Use ruleId consistently
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
                    };
                    
                    combinations.push(combinationObj);
                }
            }

        } catch (error) {
            console.error(`Error processing rule:`, error);
        }

        return combinations;
    }

    async showCombinationAlert(interaction, user, possibleCombinations) {
        try {
            if (possibleCombinations.length === 0) {
                return;
            }

            if (possibleCombinations.length === 1) {
                await this.showSingleCombinationConfirmation(interaction, user, possibleCombinations[0]);
            } else {
                await this.showMultipleCombinationSelection(interaction, user, possibleCombinations);
            }

        } catch (error) {
            console.error('Error showing combination alert:', error);
        }
    }

    async showSingleCombinationConfirmation(interaction, user, combination) {
        const { resultItem, resultQuantity, ingredients, maxCombinations } = combination;
        
        const isShadowUnlock = this.isShadowUnlockItem(resultItem);
        // UPDATED: Pass isAnimated parameter
        const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
        const rarityEmoji = this.getRarityEmoji(resultItem.rarity);

        // Build ingredients text
        let ingredientsText = '';
        for (const ing of ingredients) {
            // UPDATED: Pass isAnimated parameter for ingredient emojis
            const emoji = ing.item ? formatGachaEmoji(ing.item.emojiId, ing.item.emojiName, ing.item.isAnimated) : '❓';
            const name = ing.item ? ing.item.itemName : ing.itemId;
            ingredientsText += `${emoji} ${ing.quantity}x ${name}\n`;
        }

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

        const actionRow = new ActionRowBuilder();
        
        // Always add Make 1 button
        if (maxCombinations >= 1) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_1`)
                    .setLabel(isShadowUnlock ? 'Unlock Shadow!' : 'Make 1')
                    .setStyle(isShadowUnlock ? ButtonStyle.Danger : ButtonStyle.Primary)
                    .setEmoji(isShadowUnlock ? '🌙' : '⚗️')
            );
        }
        
        // Add Make 5 button only if not shadow unlock and max is at least 5 but not exactly 5
        if (maxCombinations >= 5 && maxCombinations !== 5 && !isShadowUnlock) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_5`)
                    .setLabel('Make 5')
                    .setStyle(ButtonStyle.Primary)
            );
        }
        
        // Add Make All button if more than 1 combination possible and not shadow unlock
        if (maxCombinations > 1 && !isShadowUnlock) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_all`)
                    .setLabel(`Make All (${maxCombinations})`)
                    .setStyle(ButtonStyle.Success)
            );
        }

        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId('combo_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('combo_to_collection')
                .setLabel('← View Collection')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.followUp({
            embeds: [embed],
            components: [actionRow],
            ephemeral: true
        });
    }

    async showMultipleCombinationSelection(interaction, user, combinations) {
        const limitedCombinations = combinations.slice(0, 25);
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

        // Use ruleId directly instead of temporary keys
        const selectOptions = limitedCombinations.map((combo) => {
            // UPDATED: Pass isAnimated parameter
            const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName, combo.resultItem.isAnimated);
            const ingredientNames = combo.ingredients.map(ing => ing.item?.itemName || ing.itemId).join(' + ');
            const isShadowUnlock = this.isShadowUnlockItem(combo.resultItem);
            
            const option = {
                label: `${combo.resultQuantity}x ${combo.resultItem.itemName}${isShadowUnlock ? ' 🌙' : ''}`.slice(0, 100),
                value: `combo_select_${combo.ruleId}`, // Use ruleId directly
                description: `${ingredientNames} (max: ${combo.maxCombinations})${isShadowUnlock ? ' - SHADOW!' : ''}`.slice(0, 100)
            };

            // UPDATED: Handle animated emojis in select menu
            if (combo.resultItem.emojiId && combo.resultItem.emojiName) {
                option.emoji = { 
                    id: combo.resultItem.emojiId, 
                    name: combo.resultItem.emojiName,
                    animated: combo.resultItem.isAnimated || false
                };
            } else if (combo.resultItem.emojiName) {
                option.emoji = combo.resultItem.emojiName;
            }
            
            return option;
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('combo_selection')
            .setPlaceholder('Choose a combination...')
            .addOptions(selectOptions);

        const cancelButton = new ButtonBuilder()
            .setCustomId('combo_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const collectionButton = new ButtonBuilder()
            .setCustomId('combo_to_collection')
            .setLabel('← View Collection')
            .setStyle(ButtonStyle.Secondary);

        const components = [
            new ActionRowBuilder().addComponents(selectMenu),
            new ActionRowBuilder().addComponents(cancelButton, collectionButton)
        ];

        await interaction.followUp({
            embeds: [embed],
            components: components,
            ephemeral: true
        });
    }

    async performCombination(user, ruleId, quantity = 1) {
        try {
            // Always use ruleId lookup
            const rule = await CombinationRule.findOne({ ruleId: ruleId, isActive: true });
            
            if (!rule) {
                throw new Error(`Combination rule not found for ID: ${ruleId}`);
            }

            const possibleCombinations = await this.findPossibleCombinationsForRule(user, rule);
            if (possibleCombinations.length === 0) {
                throw new Error('You no longer have the required ingredients');
            }

            const combination = possibleCombinations[0];
            if (combination.maxCombinations < quantity) {
                throw new Error(`You can only make ${combination.maxCombinations} of this combination`);
            }

            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            if (!resultItem) {
                throw new Error('Result item not found');
            }

            const removedIngredients = [];
            for (const ingredient of rule.ingredients) {
                const totalToRemove = ingredient.quantity * quantity;
                const userItem = user.gachaCollection.find(item => item.itemId === ingredient.itemId);
                
                if (!userItem || (userItem.quantity || 1) < totalToRemove) {
                    throw new Error(`Insufficient quantity of ${ingredient.itemId}`);
                }

                const removeSuccess = user.removeGachaItem(ingredient.itemId, totalToRemove);
                if (!removeSuccess) {
                    throw new Error(`Failed to remove ingredient: ${ingredient.itemId}`);
                }
                
                removedIngredients.push({
                    itemId: ingredient.itemId,
                    itemName: userItem.itemName,
                    quantityRemoved: totalToRemove
                });
            }

            const totalResultQuantity = (rule.result.quantity || 1) * quantity;
            const addResult = user.addGachaItem(resultItem, totalResultQuantity, 'combined');

            const result = {
                success: true,
                ruleId: ruleId,
                resultItem: resultItem,
                resultQuantity: totalResultQuantity,
                addResult: addResult,
                rule: rule,
                ingredients: rule.ingredients,
                removedIngredients: removedIngredients
            };

            await this.checkForShadowUnlock(user, result);
            return result;

        } catch (error) {
            console.error('❌ Error performing combination:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async triggerCombinationAlertsForPlayerTransfer(recipient, giftedItemId, giverUsername) {
        try {
            const possibleCombinations = await this.checkPossibleCombinations(recipient, giftedItemId);
            
            if (possibleCombinations.length === 0) {
                return { hasCombinations: false };
            }

            if (!this.client) {
                return { hasCombinations: false, error: 'No Discord client available' };
            }

            try {
                const gachaChannelId = '1377092881885696022';
                const guild = await this.client.guilds.cache.first();
                const channel = await guild.channels.fetch(gachaChannelId);
                
                if (channel) {
                    let memberTag = `**${recipient.raUsername}**`;
                    try {
                        const member = await guild.members.fetch(recipient.discordId);
                        memberTag = `<@${recipient.discordId}>`;
                    } catch (error) {
                        // Use username fallback
                    }

                    const publicEmbed = new EmbedBuilder()
                        .setTitle('🎁⚗️ Player Gift + Combinations Available!')
                        .setColor(COLORS.SUCCESS)
                        .setDescription(
                            `${memberTag} received an item from **${giverUsername}** and now has **${possibleCombinations.length}** combination option(s) available!\n\n` +
                            `💡 **${recipient.raUsername}**, use \`/collection\` to confirm your combinations!`
                        )
                        .addFields({
                            name: '🎯 Available Combinations',
                            value: possibleCombinations.slice(0, 3).map(combo => {
                                // UPDATED: Pass isAnimated parameter
                                const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName, combo.resultItem.isAnimated);
                                const isShadowUnlock = this.isShadowUnlockItem(combo.resultItem);
                                return `${resultEmoji} ${combo.resultItem.itemName}${isShadowUnlock ? ' 🌙' : ''}`;
                            }).join('\n') + (possibleCombinations.length > 3 ? '\n*...and more!*' : ''),
                            inline: false
                        })
                        .setTimestamp();

                    await channel.send({ embeds: [publicEmbed] });
                }

                return { 
                    hasCombinations: true, 
                    combinationCount: possibleCombinations.length,
                    publicAnnouncementSent: true
                };

            } catch (channelError) {
                console.error('Error sending to gacha channel:', channelError);
                return { 
                    hasCombinations: true, 
                    combinationCount: possibleCombinations.length,
                    error: 'Could not send public announcement'
                };
            }

        } catch (error) {
            console.error('Error triggering combination alerts for player transfer:', error);
            return { hasCombinations: false, error: error.message };
        }
    }

    async triggerCombinationAlertsForAdminGift(user, giftedItemId, adminInteraction) {
        try {
            const possibleCombinations = await this.checkPossibleCombinations(user, giftedItemId);
            
            if (possibleCombinations.length === 0) {
                return { hasCombinations: false };
            }

            if (!this.client) {
                return { hasCombinations: false, error: 'No Discord client available' };
            }

            try {
                const gachaChannelId = '1377092881885696022';
                const guild = await this.client.guilds.fetch(adminInteraction.guildId);
                const channel = await guild.channels.fetch(gachaChannelId);
                
                if (channel) {
                    let memberTag = `**${user.raUsername}**`;
                    try {
                        const member = await guild.members.fetch(user.discordId);
                        memberTag = `<@${user.discordId}>`;
                    } catch (error) {
                        // Use username fallback
                    }

                    const publicEmbed = new EmbedBuilder()
                        .setTitle('🎁⚗️ Admin Gift + Combinations Available!')
                        .setColor(COLORS.SUCCESS)
                        .setDescription(
                            `${memberTag} received an admin gift and now has **${possibleCombinations.length}** combination option(s) available!\n\n` +
                            `💡 **${user.raUsername}**, use \`/collection\` to confirm your combinations!`
                        )
                        .addFields({
                            name: '🎯 Available Combinations',
                            value: possibleCombinations.slice(0, 3).map(combo => {
                                // UPDATED: Pass isAnimated parameter
                                const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName, combo.resultItem.isAnimated);
                                const isShadowUnlock = this.isShadowUnlockItem(combo.resultItem);
                                return `${resultEmoji} ${combo.resultItem.itemName}${isShadowUnlock ? ' 🌙' : ''}`;
                            }).join('\n') + (possibleCombinations.length > 3 ? '\n*...and more!*' : ''),
                            inline: false
                        })
                        .setTimestamp();

                    await channel.send({ embeds: [publicEmbed] });
                }

                return { 
                    hasCombinations: true, 
                    combinationCount: possibleCombinations.length,
                    publicAnnouncementSent: true
                };

            } catch (channelError) {
                console.error('Error sending to gacha channel:', channelError);
                return { 
                    hasCombinations: true, 
                    combinationCount: possibleCombinations.length,
                    error: 'Could not send public announcement'
                };
            }

        } catch (error) {
            console.error('Error triggering combination alerts for admin gift:', error);
            return { hasCombinations: false, error: error.message };
        }
    }

    async checkForShadowUnlock(user, combinationResult) {
        try {
            const { resultItem } = combinationResult;
            
            if (this.isShadowUnlockItem(resultItem)) {
                const now = new Date();
                const currentMonth = now.getMonth() + 1;
                const currentYear = now.getFullYear();
                
                const monthStart = new Date(currentYear, currentMonth - 1, 1);
                const nextMonthStart = new Date(currentYear, currentMonth, 1);
                
                const currentChallenge = await Challenge.findOne({
                    date: {
                        $gte: monthStart,
                        $lt: nextMonthStart
                    }
                });
                
                if (currentChallenge && currentChallenge.shadow_challange_gameid && !currentChallenge.shadow_challange_revealed) {
                    currentChallenge.shadow_challange_revealed = true;
                    await currentChallenge.save();
                    
                    await this.sendShadowUnlockAlert(user, currentChallenge, currentMonth, currentYear);
                }
            }
        } catch (error) {
            console.error('Error checking for shadow unlock:', error);
        }
    }

    isShadowUnlockItem(item) {
        return item.itemId === '999' || 
               item.itemName?.toLowerCase().includes('shadow unlock') ||
               item.itemName?.toLowerCase().includes('shadow_unlock');
    }

    async sendShadowUnlockAlert(user, challenge, month, year) {
        if (!this.client) return;

        try {
            const generalChannelId = config.discord.generalChannelId || '1224834039804334121';
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            const channel = await guild.channels.fetch(generalChannelId);
            
            if (!channel) return;

            const monthNames = ["January", "February", "March", "April", "May", "June",
                              "July", "August", "September", "October", "November", "December"];
            const monthName = monthNames[month - 1];

            const embed = new EmbedBuilder()
                .setTitle('🌙 SHADOW CHALLENGE REVEALED!')
                .setColor('#9932CC')
                .setDescription(
                    `**${user.raUsername}** has unlocked the secrets!\n\n` +
                    `🔓 The shadow challenge for **${monthName} ${year}** has been revealed!\n\n` +
                    `**Shadow Game:** ${challenge.shadow_game_title || 'Mystery Game'}\n\n` +
                    `*The hidden challenge emerges from the darkness...*`
                )
                .addFields({
                    name: '🎯 How to Participate',
                    value: `Use \`/challenge\` to view the newly revealed shadow challenge details!`,
                    inline: false
                })
                .setFooter({ 
                    text: `Unlocked by ${user.raUsername} through item combination • The shadow awaits...` 
                })
                .setTimestamp();

            if (challenge.shadow_game_icon_url) {
                embed.setThumbnail(`https://retroachievements.org${challenge.shadow_game_icon_url}`);
            }

            await channel.send({ 
                content: `🌙 **BREAKING:** The shadow has been unveiled! 🌙`,
                embeds: [embed] 
            });

        } catch (error) {
            console.error('Error sending shadow unlock alert:', error);
        }
    }

    async handleCombinationInteraction(interaction) {
        try {
            if (!interaction.customId.startsWith('combo_')) return false;

            if (interaction.customId.includes('_cancel') || interaction.customId === 'combo_to_collection') {
                await interaction.deferUpdate();
                
                if (interaction.customId === 'combo_to_collection') {
                    // Return to collection view
                    const user = await this.getUserForInteraction(interaction);
                    if (user) {
                        const { default: collectionCommand } = await import('../commands/user/collection.js');
                        await collectionCommand.showItemsPage(interaction, user, 'all', 0);
                    } else {
                        await interaction.editReply({
                            content: '❌ Could not load your collection.',
                            embeds: [],
                            components: []
                        });
                    }
                } else {
                    await interaction.editReply({
                        content: '❌ Combination cancelled.',
                        embeds: [],
                        components: []
                    });
                }
                return true;
            }

            await interaction.deferUpdate();

            const parts = interaction.customId.split('_');
            const action = parts[1];
            
            if (action === 'confirm') {
                // Parse: combo_confirm_RULEID_QUANTITY
                let ruleId;
                let quantity;
                
                if (parts[parts.length - 1] === 'all') {
                    // combo_confirm_RULEID_all
                    ruleId = parts.slice(2, -1).join('_');
                    
                    const user = await this.getUserForInteraction(interaction);
                    if (!user) return true;

                    const rule = await CombinationRule.findOne({ ruleId: ruleId, isActive: true });
                    if (!rule) {
                        await interaction.editReply({
                            content: `❌ Combination rule not found.`,
                            embeds: [],
                            components: []
                        });
                        return true;
                    }
                    
                    const possibleCombinations = await this.findPossibleCombinationsForRule(user, rule);
                    if (possibleCombinations.length === 0) {
                        await interaction.editReply({
                            content: '❌ This combination is no longer available.',
                            embeds: [],
                            components: []
                        });
                        return true;
                    }
                    
                    quantity = possibleCombinations[0].maxCombinations;
                } else {
                    // combo_confirm_RULEID_NUMBER
                    const quantityPart = parts[parts.length - 1];
                    const quantityValue = parseInt(quantityPart);
                    
                    if (isNaN(quantityValue) || quantityValue <= 0) {
                        await interaction.editReply({
                            content: '❌ Invalid combination button format.',
                            embeds: [],
                            components: []
                        });
                        return true;
                    }
                    
                    ruleId = parts.slice(2, -1).join('_');
                    quantity = quantityValue;
                }

                const user = await this.getUserForInteraction(interaction);
                if (!user) return true;

                // Pass ruleId string directly
                const result = await this.performCombination(user, ruleId, quantity);
                
                if (result.success) {
                    await user.save();
                    await this.showCombinationSuccess(interaction, result, quantity);
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
                // Parse: combo_select_RULEID
                const ruleId = parts.slice(2).join('_');

                const user = await this.getUserForInteraction(interaction);
                if (!user) return true;

                // Use ruleId lookup instead of _id
                const rule = await CombinationRule.findOne({ ruleId: ruleId, isActive: true });
                if (!rule) {
                    await interaction.editReply({
                        content: '❌ Combination rule not found.',
                        embeds: [],
                        components: []
                    });
                    return true;
                }

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

            if (action === 'selection') {
                if (interaction.isStringSelectMenu()) {
                    const selectedValue = interaction.values[0];
                    // Parse: combo_select_RULEID
                    const selectedParts = selectedValue.split('_');
                    const selectedRuleId = selectedParts.slice(2).join('_');
                    
                    const user = await this.getUserForInteraction(interaction);
                    if (!user) return true;

                    // Use ruleId lookup instead of _id
                    const rule = await CombinationRule.findOne({ ruleId: selectedRuleId, isActive: true });
                    if (!rule) {
                        await interaction.editReply({
                            content: '❌ Combination rule not found.',
                            embeds: [],
                            components: []
                        });
                        return true;
                    }

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

    async showCombinationSuccess(interaction, result, quantity) {
        const { resultItem, resultQuantity, addResult } = result;
        // UPDATED: Pass isAnimated parameter
        const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
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
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('combo_to_collection')
                        .setLabel('← View Collection')
                        .setStyle(ButtonStyle.Primary)
                )
            ]
        });
    }

    async sendCombinationAlert(user, combinationResult) {
        if (!this.client) return;

        try {
            const gachaChannelId = '1377092881885696022';
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            const channel = await guild.channels.fetch(gachaChannelId);
            
            if (!channel) return;

            const { ruleId, resultItem, resultQuantity } = combinationResult;
            
            // UPDATED: Pass isAnimated parameter
            const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
            const rarityEmoji = this.getRarityEmoji(resultItem.rarity);
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

            if (combinationResult.ingredients) {
                let ingredientsText = '';
                for (const ingredient of combinationResult.ingredients) {
                    const ingredientItem = await GachaItem.findOne({ itemId: ingredient.itemId });
                    if (ingredientItem) {
                        // UPDATED: Pass isAnimated parameter
                        const emoji = formatGachaEmoji(ingredientItem.emojiId, ingredientItem.emojiName, ingredientItem.isAnimated);
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

            embed.addFields({ 
                name: 'Result', 
                value: `${resultEmoji} ${resultQuantity}x **${resultItem.itemName}**`,
                inline: true 
            });

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

            await channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error sending combination alert:', error);
        }
    }

    async getUserForInteraction(interaction) {
        const { User } = await import('../models/User.js');
        
        const user = await User.findOne({ discordId: interaction.user.id });
        
        if (!user) {
            await interaction.editReply({
                content: '❌ You are not registered in the system. Please contact an admin.',
                embeds: [],
                components: []
            });
            return null;
        }

        return user;
    }

    // Legacy methods for backwards compatibility
    async checkAutoCombinations(user) {
        return [];
    }

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

    getCombinationStats(user) {
        if (!user.gachaCollection) {
            return { totalCombined: 0 };
        }

        const combinedItems = user.gachaCollection.filter(item => item.source === 'combined');
        const totalCombined = combinedItems.reduce((total, item) => total + (item.quantity || 1), 0);

        return { totalCombined };
    }

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
                            isAnimated: resultItem.isAnimated, // NEW: Include animation flag
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
                if (a.canMake !== b.canMake) return b.canMake - a.canMake;
                if (a.priority !== b.priority) return b.priority - a.priority;
                return a.ruleId.localeCompare(b.ruleId);
            });

        } catch (error) {
            console.error('Error getting possible combinations:', error);
            return [];
        }
    }

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

export default new CombinationService();
