// src/services/combinationService.js - COMPLETE with animated emoji support and recipe book
import { GachaItem, CombinationRule } from '../models/GachaItem.js';
import { Challenge } from '../models/Challenge.js';
import { config } from '../config/config.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { formatGachaEmoji } from '../config/gachaEmojis.js';
import { COLORS } from '../utils/FeedUtils.js';

// UPDATED: Use gacha trade channel for all combination alerts
const GACHA_TRADE_CHANNEL_ID = '1379402075120730185';

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
        const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
        const rarityEmoji = this.getRarityEmoji(resultItem.rarity);

        // Build ingredients text
        let ingredientsText = '';
        for (const ing of ingredients) {
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

        const selectOptions = limitedCombinations.map((combo) => {
            const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName, combo.resultItem.isAnimated);
            const ingredientNames = combo.ingredients.map(ing => ing.item?.itemName || ing.itemId).join(' + ');
            const isShadowUnlock = this.isShadowUnlockItem(combo.resultItem);
            
            const option = {
                label: `${combo.resultQuantity}x ${combo.resultItem.itemName}${isShadowUnlock ? ' 🌙' : ''}`.slice(0, 100),
                value: `combo_select_${combo.ruleId}`,
                description: `${ingredientNames} (max: ${combo.maxCombinations})${isShadowUnlock ? ' - SHADOW!' : ''}`.slice(0, 100)
            };

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

    // UPDATED: Modified performCombination to mark as discovered
    async performCombination(user, ruleId, quantity = 1) {
        try {
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

            // NEW: Mark combination as discovered
            const wasNewDiscovery = await this.markCombinationDiscovered(ruleId, user.raUsername);

            const result = {
                success: true,
                ruleId: ruleId,
                resultItem: resultItem,
                resultQuantity: totalResultQuantity,
                addResult: addResult,
                rule: rule,
                ingredients: rule.ingredients,
                removedIngredients: removedIngredients,
                wasNewDiscovery: wasNewDiscovery // NEW: Include discovery status
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

    // UPDATED: Use gacha trade channel instead of gacha machine channel
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
                const guild = await this.client.guilds.cache.first();
                const channel = await guild.channels.fetch(GACHA_TRADE_CHANNEL_ID);
                
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
                                const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName, combo.resultItem.isAnimated);
                                const isShadowUnlock = this.isShadowUnlockItem(combo.resultItem);
                                return `${resultEmoji} ${combo.resultItem.itemName}${isShadowUnlock ? ' 🌙' : ''}`;
                            }).join('\n') + (possibleCombinations.length > 3 ? '\n*...and more!*' : ''),
                            inline: false
                        })
                        .setTimestamp();

                    // NEW: Schedule message deletion after 5 minutes
                    const message = await channel.send({ embeds: [publicEmbed] });
                    setTimeout(async () => {
                        try {
                            await message.delete();
                        } catch (deleteError) {
                            console.log('Combination alert message already deleted or inaccessible');
                        }
                    }, 5 * 60 * 1000); // 5 minutes
                }

                return { 
                    hasCombinations: true, 
                    combinationCount: possibleCombinations.length,
                    publicAnnouncementSent: true
                };

            } catch (channelError) {
                console.error('Error sending to gacha trade channel:', channelError);
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

    // UPDATED: Use gacha trade channel for admin gifts
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
                const guild = await this.client.guilds.fetch(adminInteraction.guildId);
                const channel = await guild.channels.fetch(GACHA_TRADE_CHANNEL_ID);
                
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
                                const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName, combo.resultItem.isAnimated);
                                const isShadowUnlock = this.isShadowUnlockItem(combo.resultItem);
                                return `${resultEmoji} ${combo.resultItem.itemName}${isShadowUnlock ? ' 🌙' : ''}`;
                            }).join('\n') + (possibleCombinations.length > 3 ? '\n*...and more!*' : ''),
                            inline: false
                        })
                        .setTimestamp();

                    // NEW: Schedule message deletion after 5 minutes
                    const message = await channel.send({ embeds: [publicEmbed] });
                    setTimeout(async () => {
                        try {
                            await message.delete();
                        } catch (deleteError) {
                            console.log('Admin gift combination alert message already deleted or inaccessible');
                        }
                    }, 5 * 60 * 1000); // 5 minutes
                }

                return { 
                    hasCombinations: true, 
                    combinationCount: possibleCombinations.length,
                    publicAnnouncementSent: true
                };

            } catch (channelError) {
                console.error('Error sending to gacha trade channel:', channelError);
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
                        await collectionCommand.showCollection(interaction, user, 'all', 0);
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

            // NEW: Handle recipe book button
            if (interaction.customId === 'combo_to_recipes') {
                await interaction.deferUpdate();
                await this.showRecipeBook(interaction, 0);
                return true;
            }

            await interaction.deferUpdate();

            const parts = interaction.customId.split('_');
            const action = parts[1];
            
            if (action === 'confirm') {
                let ruleId;
                let quantity;
                
                if (parts[parts.length - 1] === 'all') {
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
                const ruleId = parts.slice(2).join('_');

                const user = await this.getUserForInteraction(interaction);
                if (!user) return true;

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
                    const selectedParts = selectedValue.split('_');
                    const selectedRuleId = selectedParts.slice(2).join('_');
                    
                    const user = await this.getUserForInteraction(interaction);
                    if (!user) return true;

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

    // UPDATED: Show combination success with discovery notifications
    async showCombinationSuccess(interaction, result, quantity) {
        const { resultItem, resultQuantity, addResult, wasNewDiscovery } = result;
        const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
        const rarityEmoji = this.getRarityEmoji(resultItem.rarity);
        const isShadowUnlock = this.isShadowUnlockItem(resultItem);

        let title = '✨ Combination Successful!';
        let color = COLORS.SUCCESS;
        
        if (isShadowUnlock) {
            title = '🌙 SHADOW UNLOCKED!';
            color = '#9932CC';
        } else if (wasNewDiscovery) {
            title = '🎉 NEW RECIPE DISCOVERED!';
            color = '#FFD700'; // Gold for discoveries
        }

        let description = `You created ${isShadowUnlock ? '**the Shadow Unlock item**' : 'a new item'}!\n\n` +
                         `${resultEmoji} ${rarityEmoji} **${resultQuantity}x ${resultItem.itemName}**\n\n` +
                         `*${resultItem.description}*`;
        
        if (isShadowUnlock) {
            description += '\n\n🔓 **The shadow challenge has been revealed to the server!**';
        } else if (wasNewDiscovery) {
            description += '\n\n📖 **This recipe has been added to the community recipe book for everyone to see!**\n💡 Use `/recipes` to view all discovered combinations!';
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setDescription(description)
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

        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('combo_to_collection')
                    .setLabel('← View Collection')
                    .setStyle(ButtonStyle.Primary)
            )
        ];

        // Add recipe book button if it was a new discovery
        if (wasNewDiscovery) {
            components[0].addComponents(
                new ButtonBuilder()
                    .setCustomId('combo_to_recipes')
                    .setLabel('📖 View Recipe Book')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        await interaction.editReply({
            embeds: [embed],
            components: components
        });
    }

    // UPDATED: Use gacha trade channel and schedule deletion
    async sendCombinationAlert(user, combinationResult) {
        if (!this.client) return;

        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            const channel = await guild.channels.fetch(GACHA_TRADE_CHANNEL_ID);
            
            if (!channel) return;

            const { ruleId, resultItem, resultQuantity, wasNewDiscovery } = combinationResult;
            
            const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
            const rarityEmoji = this.getRarityEmoji(resultItem.rarity);
            const isShadowUnlock = this.isShadowUnlockItem(resultItem);
            
            let title = '⚗️ Combination Created!';
            let color = COLORS.SUCCESS;
            
            if (isShadowUnlock) {
                title = '🌙 SHADOW UNLOCK COMBINATION!';
                color = '#9932CC';
            } else if (wasNewDiscovery) {
                title = '🎉 NEW RECIPE DISCOVERED!';
                color = '#FFD700';
            }
            
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor(color)
                .setDescription(
                    `${user.raUsername} ${isShadowUnlock ? 'unlocked the shadow!' : (wasNewDiscovery ? 'discovered a new recipe!' : 'created a combination!')}\n\n` +
                    `${resultEmoji} **${resultQuantity}x ${resultItem.itemName}** ${rarityEmoji}\n\n` +
                    `*${resultItem.description || 'A mysterious creation...'}*` +
                    (isShadowUnlock ? '\n\n🔓 **The shadow challenge has been revealed!**' : '') +
                    (wasNewDiscovery ? '\n\n📖 **This recipe is now in the community recipe book!**' : '')
                )
                .setTimestamp();

            if (combinationResult.ingredients) {
                let ingredientsText = '';
                for (const ingredient of combinationResult.ingredients) {
                    const ingredientItem = await GachaItem.findOne({ itemId: ingredient.itemId });
                    if (ingredientItem) {
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
                text: `Combination ID: ${ruleId} • Player confirmed this combination • Message expires in 5 minutes` 
            });

            // NEW: Schedule message deletion after 5 minutes
            const message = await channel.send({ embeds: [embed] });
            setTimeout(async () => {
                try {
                    await message.delete();
                } catch (deleteError) {
                    console.log('Combination alert message already deleted or inaccessible');
                }
            }, 5 * 60 * 1000); // 5 minutes

        } catch (error) {
            console.error('Error sending combination alert:', error);
        }
    }

    // NEW: Mark a combination as discovered
    async markCombinationDiscovered(ruleId, discoveredBy) {
        try {
            const rule = await CombinationRule.findOne({ ruleId: ruleId });
            if (rule && !rule.discovered) {
                rule.discovered = true;
                rule.discoveredAt = new Date();
                rule.discoveredBy = discoveredBy;
                await rule.save();
                
                console.log(`🔍 New combination discovered: ${ruleId} by ${discoveredBy}`);
                
                // Announce the discovery to the trade channel
                await this.announceNewRecipeDiscovery(rule, discoveredBy);
                
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error marking combination as discovered:', error);
            return false;
        }
    }

    // NEW: Announce new recipe discovery
    async announceNewRecipeDiscovery(rule, discoveredBy) {
        if (!this.client) return;

        try {
            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            if (!resultItem) return;

            const guild = await this.client.guilds.fetch(config.discord.guildId);
            const channel = await guild.channels.fetch(GACHA_TRADE_CHANNEL_ID);
            
            if (!channel) return;

            // Format the recipe
            const recipeText = await this.formatSingleRecipe(rule, resultItem);
            const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
            const rarityEmoji = this.getRarityEmoji(resultItem.rarity);

            const embed = new EmbedBuilder()
                .setTitle('📖 NEW RECIPE DISCOVERED!')
                .setColor('#FFD700') // Gold for discoveries
                .setDescription(
                    `**${discoveredBy}** has discovered a new combination recipe!\n\n` +
                    `**New Recipe:**\n${recipeText}\n\n` +
                    `${resultEmoji} **${resultItem.itemName}** ${rarityEmoji}\n` +
                    `*${resultItem.description || 'A mysterious creation...'}*\n\n` +
                    `💡 Use \`/recipes\` to view all discovered combinations!`
                )
                .setTimestamp();

            // Schedule message deletion after 10 minutes (longer for discoveries)
            const message = await channel.send({ embeds: [embed] });
            setTimeout(async () => {
                try {
                    await message.delete();
                } catch (deleteError) {
                    console.log('Recipe discovery message already deleted or inaccessible');
                }
            }, 10 * 60 * 1000); // 10 minutes

        } catch (error) {
            console.error('Error announcing new recipe discovery:', error);
        }
    }

    // NEW: Get all discovered recipes for the community recipe book
    async getDiscoveredRecipes() {
        try {
            const discoveredRules = await CombinationRule.find({ 
                isActive: true, 
                discovered: true 
            }).sort({ discoveredAt: 1 }); // Oldest discoveries first

            const recipes = [];

            for (const rule of discoveredRules) {
                const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
                if (!resultItem) continue;

                const ingredientItems = [];
                for (const ingredient of rule.ingredients) {
                    const item = await GachaItem.findOne({ itemId: ingredient.itemId });
                    if (item) {
                        ingredientItems.push({
                            ...item.toObject(),
                            quantity: ingredient.quantity
                        });
                    }
                }

                if (ingredientItems.length === rule.ingredients.length) {
                    recipes.push({
                        rule: rule,
                        resultItem: resultItem,
                        ingredients: ingredientItems,
                        discoveredBy: rule.discoveredBy,
                        discoveredAt: rule.discoveredAt
                    });
                }
            }

            // Sort by rarity > series > alphabetically (like collection)
            const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
            recipes.sort((a, b) => {
                // First by result rarity
                const aRarityIndex = rarityOrder.indexOf(a.resultItem.rarity);
                const bRarityIndex = rarityOrder.indexOf(b.resultItem.rarity);
                if (aRarityIndex !== bRarityIndex) return aRarityIndex - bRarityIndex;
                
                // Then by series
                const aSeriesId = a.resultItem.seriesId || 'zzz_individual';
                const bSeriesId = b.resultItem.seriesId || 'zzz_individual';
                const seriesCompare = aSeriesId.localeCompare(bSeriesId);
                if (seriesCompare !== 0) return seriesCompare;
                
                // Finally alphabetically by result name
                return a.resultItem.itemName.localeCompare(b.resultItem.itemName);
            });

            return recipes;

        } catch (error) {
            console.error('Error getting discovered recipes:', error);
            return [];
        }
    }

    // NEW: Format a single recipe for display
    async formatSingleRecipe(rule, resultItem) {
        const ingredients = [];
        
        for (const ingredient of rule.ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                const emoji = formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
                if (ingredient.quantity > 1) {
                    ingredients.push(`${emoji} x${ingredient.quantity}`);
                } else {
                    ingredients.push(emoji);
                }
            }
        }

        const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
        const resultQuantity = rule.result.quantity > 1 ? ` x${rule.result.quantity}` : '';
        
        return `${ingredients.join(' + ')} = ${resultEmoji}${resultQuantity}`;
    }

    // NEW: Show the community recipe book
    async showRecipeBook(interaction, page = 0) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }

            const allRecipes = await this.getDiscoveredRecipes();
            
            if (allRecipes.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('📖 Community Recipe Book')
                    .setColor(COLORS.INFO)
                    .setDescription(
                        '🔍 **No recipes discovered yet!**\n\n' +
                        'Be the first to discover a combination recipe!\n' +
                        'When you successfully perform a combination, it will be added to this community recipe book for everyone to see.\n\n' +
                        '💡 **Tip:** Experiment with different item combinations in `/collection`!'
                    )
                    .setFooter({ text: 'The recipe book updates automatically when new combinations are discovered!' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed], components: [] });
            }

            // Pagination
            const RECIPES_PER_PAGE = 15; // Conservative to stay under Discord limits
            const totalPages = Math.ceil(allRecipes.length / RECIPES_PER_PAGE);
            const startIndex = page * RECIPES_PER_PAGE;
            const pageRecipes = allRecipes.slice(startIndex, startIndex + RECIPES_PER_PAGE);

            const embed = new EmbedBuilder()
                .setTitle('📖 Community Recipe Book')
                .setColor(COLORS.INFO)
                .setTimestamp();

            // Group recipes by rarity for better organization
            const rarityGroups = {};
            const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
            
            for (const recipe of pageRecipes) {
                const rarity = recipe.resultItem.rarity;
                if (!rarityGroups[rarity]) rarityGroups[rarity] = [];
                rarityGroups[rarity].push(recipe);
            }

            let description = `**Discovered Combinations:** ${allRecipes.length}\n\n`;
            let totalCharacters = description.length;

            for (const rarity of rarityOrder) {
                const recipes = rarityGroups[rarity];
                if (!recipes?.length) continue;

                const rarityEmoji = this.getRarityEmoji(rarity);
                const rarityName = this.getRarityDisplayName(rarity);
                const rarityHeader = `${rarityEmoji} **${rarityName}**\n`;
                
                // Check if we have space for this rarity section
                if (totalCharacters + rarityHeader.length > 3800) break; // Leave some buffer

                description += rarityHeader;
                totalCharacters += rarityHeader.length;

                for (const recipe of recipes) {
                    const recipeText = await this.formatSingleRecipe(recipe.rule, recipe.resultItem);
                    const recipeLine = `${recipeText}\n`;
                    
                    // Check if we have space for this recipe
                    if (totalCharacters + recipeLine.length > 3800) {
                        description += '*...more recipes on next page*\n';
                        break;
                    }
                    
                    description += recipeLine;
                    totalCharacters += recipeLine.length;
                }
                
                description += '\n';
                totalCharacters += 1;
            }

            embed.setDescription(description.trim());

            // Footer with pagination info
            let footerText = totalPages > 1 
                ? `Page ${page + 1}/${totalPages} • ${startIndex + 1}-${Math.min(startIndex + RECIPES_PER_PAGE, allRecipes.length)} of ${allRecipes.length} recipes`
                : `${allRecipes.length} discovered recipes`;
            
            footerText += ' • Recipes update automatically when discovered!';
            embed.setFooter({ text: footerText });

            // Create components
            const components = [];

            // Pagination if needed
            if (totalPages > 1) {
                const paginationRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`recipes_prev_${page}`)
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('recipes_page_indicator')
                        .setLabel(`${page + 1}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`recipes_next_${page}`)
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages - 1)
                );
                components.push(paginationRow);
            }

            // Action buttons
            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('recipes_refresh')
                    .setLabel('🔄 Refresh')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('recipes_to_collection')
                    .setLabel('📦 My Collection')
                    .setStyle(ButtonStyle.Secondary)
            );
            components.push(actionRow);

            await interaction.editReply({ embeds: [embed], components });

        } catch (error) {
            console.error('Error showing recipe book:', error);
            await interaction.editReply({ 
                content: '❌ An error occurred while loading the recipe book. Please try again later.',
                embeds: [],
                components: []
            });
        }
    }

    // NEW: Handle recipe book interactions
    async handleRecipeBookInteraction(interaction) {
        if (!interaction.customId.startsWith('recipes_')) return false;

        try {
            await interaction.deferUpdate();

            if (interaction.customId === 'recipes_refresh') {
                await this.showRecipeBook(interaction, 0);
                return true;
            }

            if (interaction.customId === 'recipes_to_collection') {
                // Redirect to collection command
                const user = await this.getUserForInteraction(interaction);
                if (user) {
                    const { default: collectionCommand } = await import('../commands/user/collection.js');
                    await collectionCommand.showCollection(interaction, user, 'all', 0);
                } else {
                    await interaction.editReply({
                        content: '❌ Could not load your collection.',
                        embeds: [],
                        components: []
                    });
                }
                return true;
            }

            if (interaction.customId.startsWith('recipes_prev_') || interaction.customId.startsWith('recipes_next_')) {
                const parts = interaction.customId.split('_');
                const direction = parts[1]; // prev or next
                const currentPage = parseInt(parts[2]);
                
                const newPage = direction === 'prev' ? currentPage - 1 : currentPage + 1;
                await this.showRecipeBook(interaction, newPage);
                return true;
            }

        } catch (error) {
            console.error('Error handling recipe book interaction:', error);
            await interaction.editReply({
                content: '❌ An error occurred while processing your request.',
                embeds: [],
                components: []
            });
        }

        return false;
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
                            isAnimated: resultItem.isAnimated,
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
