// src/services/combinationService.js - Streamlined with deduplicate fix
import { GachaItem, CombinationRule } from '../models/GachaItem.js';
import { Challenge } from '../models/Challenge.js';
import { config } from '../config/config.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { formatGachaEmoji } from '../config/gachaEmojis.js';
import { COLORS } from '../utils/FeedUtils.js';
import alertService, { ALERT_TYPES } from '../utils/AlertService.js';

class CombinationService {
    constructor() {
        this.isInitialized = false;
        this.client = null;
    }

    setClient(client) {
        this.client = client;
        alertService.setClient(client);
    }

    // Core combination checking logic
    async checkPossibleCombinations(user, triggerItemId = null) {
        try {
            if (!user.gachaCollection?.length) return [];

            const rules = await CombinationRule.find({ isActive: true });
            const possibleCombinations = [];

            for (const rule of rules) {
                const combinations = await this.findPossibleCombinationsForRule(user, rule, triggerItemId);
                possibleCombinations.push(...combinations);
            }

            return possibleCombinations.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0));
        } catch (error) {
            console.error('Error checking possible combinations:', error);
            return [];
        }
    }

    async findPossibleCombinationsForRule(user, rule, triggerItemId = null) {
        const combinations = [];

        try {
            const userItemMap = this.buildUserItemMap(user);

            // Skip non-destructive combinations if user already has result
            if (rule.isNonDestructive && userItemMap.has(rule.result.itemId)) {
                return [];
            }

            const requiredIngredients = rule.ingredients;
            const availableQuantities = [];

            for (const ingredient of requiredIngredients) {
                const userItem = userItemMap.get(ingredient.itemId);
                if (!userItem || userItem.quantity < ingredient.quantity) {
                    return [];
                }
                availableQuantities.push(Math.floor(userItem.quantity / ingredient.quantity));
            }

            if (triggerItemId && !requiredIngredients.some(ing => ing.itemId === triggerItemId)) {
                return [];
            }

            const maxCombinations = Math.min(...availableQuantities);
            if (maxCombinations > 0) {
                const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
                if (resultItem) {
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
            console.error('Error processing combination rule:', error);
        }

        return combinations;
    }

    // UI Display Methods
    async showCombinationAlert(interaction, user, possibleCombinations) {
        try {
            if (!possibleCombinations.length) return;

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
        const { resultItem, resultQuantity, ingredients, maxCombinations, rule } = combination;
        
        const isShadowUnlock = this.isShadowUnlockItem(resultItem);
        const isNonDestructive = rule.isNonDestructive;
        const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
        const rarityEmoji = this.getRarityEmoji(resultItem.rarity);

        const ingredientsText = ingredients.map(ing => {
            const emoji = ing.item ? formatGachaEmoji(ing.item.emojiId, ing.item.emojiName, ing.item.isAnimated) : '❓';
            const name = ing.item ? ing.item.itemName : ing.itemId;
            return `${emoji} ${ing.quantity}x ${name}`;
        }).join('\n');

        const { title, color, warningText } = this.getCombinationDisplayData(isShadowUnlock, isNonDestructive);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setDescription(
                `You can create ${isShadowUnlock ? '**the Shadow Unlock item**' : (isNonDestructive ? '**a collection bonus**' : 'a new item')} by combining ingredients!\n\n` +
                `**Recipe:**\n${ingredientsText}\n\n` +
                `**Creates:**\n${resultEmoji} ${rarityEmoji} **${resultQuantity}x ${resultItem.itemName}**\n\n` +
                `**Available combinations:** ${maxCombinations}\n\n` +
                warningText
            )
            .addFields({ name: 'Result Description', value: resultItem.description || 'No description', inline: false })
            .setFooter({ 
                text: isNonDestructive 
                    ? 'Choose how many combinations to perform - your ingredients will be kept!'
                    : 'Choose how many combinations to perform, or cancel.' 
            })
            .setTimestamp();

        const actionRow = this.buildCombinationButtons(combination, maxCombinations, isShadowUnlock, isNonDestructive);

        await interaction.followUp({
            embeds: [embed],
            components: [actionRow],
            ephemeral: true
        });
    }

    async showMultipleCombinationSelection(interaction, user, combinations) {
        const limitedCombinations = combinations.slice(0, 25);
        const hasShadowUnlock = limitedCombinations.some(combo => this.isShadowUnlockItem(combo.resultItem));
        const hasNonDestructive = limitedCombinations.some(combo => combo.rule.isNonDestructive);

        const { title, color } = this.getMultiCombinationDisplayData(hasShadowUnlock, hasNonDestructive);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setDescription(
                `You have ingredients for multiple combinations!\nChoose which one you'd like to make:\n\n` +
                `⚠️ **Standard combinations will consume ingredients!**\n` +
                (hasNonDestructive ? `🔄 **Non-destructive combinations will keep ingredients!**\n` : '') +
                (hasShadowUnlock ? `🌙 **One option will unlock the shadow challenge!**` : '')
            )
            .setFooter({ text: 'Select a combination from the menu below, or cancel.' })
            .setTimestamp();

        const selectOptions = this.buildCombinationSelectOptions(limitedCombinations);
        const components = this.buildMultiCombinationComponents(selectOptions);

        await interaction.followUp({
            embeds: [embed],
            components: components,
            ephemeral: true
        });
    }

    // Core combination execution
    async performCombination(user, ruleId, quantity = 1) {
        try {
            const rule = await CombinationRule.findOne({ ruleId: ruleId, isActive: true });
            if (!rule) throw new Error(`Combination rule not found for ID: ${ruleId}`);

            const possibleCombinations = await this.findPossibleCombinationsForRule(user, rule);
            if (!possibleCombinations.length) throw new Error('You no longer have the required ingredients');

            const combination = possibleCombinations[0];
            if (combination.maxCombinations < quantity) {
                throw new Error(`You can only make ${combination.maxCombinations} of this combination`);
            }

            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            if (!resultItem) throw new Error('Result item not found');

            const removedIngredients = await this.processIngredients(user, rule, quantity);
            const totalResultQuantity = (rule.result.quantity || 1) * quantity;
            const addResult = user.addGachaItem(resultItem, totalResultQuantity, 'combined');
            const wasNewDiscovery = await this.markCombinationDiscovered(ruleId, user.raUsername);

            const result = {
                success: true,
                ruleId,
                resultItem,
                resultQuantity: totalResultQuantity,
                addResult,
                rule,
                ingredients: rule.ingredients,
                removedIngredients,
                wasNewDiscovery,
                isNonDestructive: rule.isNonDestructive
            };

            await this.checkForShadowUnlock(user, result);
            return result;
        } catch (error) {
            console.error('Error performing combination:', error);
            return { success: false, error: error.message };
        }
    }

    // Transfer and gift alert methods
    async triggerCombinationAlertsForPlayerTransfer(recipient, giftedItemId, giverUsername) {
        try {
            const possibleCombinations = await this.checkPossibleCombinations(recipient, giftedItemId);
            if (!possibleCombinations.length) return { hasCombinations: false };

            const { memberTag, alertData } = await this.buildTransferAlertData(recipient, possibleCombinations, giverUsername);

            await alertService.sendCombinationTransferAlert({
                ...alertData,
                description: `${memberTag} received an item from **${giverUsername}** and now has **${possibleCombinations.length}** combination option(s) available!\n\n💡 **${recipient.raUsername}**, use \`/collection\` to confirm your combinations!`,
            });

            return { 
                hasCombinations: true, 
                combinationCount: possibleCombinations.length,
                publicAnnouncementSent: true
            };
        } catch (error) {
            console.error('Error triggering combination alerts for player transfer:', error);
            return { hasCombinations: false, error: error.message };
        }
    }

    async triggerCombinationAlertsForAdminGift(user, giftedItemId, adminInteraction) {
        try {
            const possibleCombinations = await this.checkPossibleCombinations(user, giftedItemId);
            if (!possibleCombinations.length) return { hasCombinations: false };

            const { memberTag, alertData } = await this.buildAdminGiftAlertData(user, possibleCombinations, adminInteraction);

            await alertService.sendCombinationAdminGiftAlert({
                ...alertData,
                description: `${memberTag} received an admin gift and now has **${possibleCombinations.length}** combination option(s) available!\n\n💡 **${user.raUsername}**, use \`/collection\` to confirm your combinations!`,
            });

            return { 
                hasCombinations: true, 
                combinationCount: possibleCombinations.length,
                publicAnnouncementSent: true
            };
        } catch (error) {
            console.error('Error triggering combination alerts for admin gift:', error);
            return { hasCombinations: false, error: error.message };
        }
    }

    // Shadow unlock handling
    async checkForShadowUnlock(user, combinationResult) {
        try {
            const { resultItem } = combinationResult;
            
            if (this.isShadowUnlockItem(resultItem)) {
                const currentChallenge = await this.getCurrentChallenge();
                
                if (currentChallenge?.shadow_challange_gameid && !currentChallenge.shadow_challange_revealed) {
                    currentChallenge.shadow_challange_revealed = true;
                    await currentChallenge.save();
                    
                    const now = new Date();
                    await this.sendShadowUnlockAlert(user, currentChallenge, now.getMonth() + 1, now.getFullYear());
                }
            }
        } catch (error) {
            console.error('Error checking for shadow unlock:', error);
        }
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

    // Interaction handling
    async handleCombinationInteraction(interaction) {
        try {
            if (!interaction.customId.startsWith('combo_')) return false;

            const { action, actionData } = this.parseInteractionCustomId(interaction.customId);

            if (action === 'cancel' || action === 'to_collection') {
                await interaction.deferUpdate();
                return await this.handleCancelOrCollection(interaction, action);
            }

            if (action === 'to_recipes') {
                await interaction.deferUpdate();
                await this.showRecipeBook(interaction, 0);
                return true;
            }

            await interaction.deferUpdate();

            switch (action) {
                case 'confirm':
                    return await this.handleConfirmInteraction(interaction, actionData);
                case 'select':
                    return await this.handleSelectInteraction(interaction, actionData);
                case 'selection':
                    return await this.handleSelectionInteraction(interaction);
                default:
                    return false;
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
        const { resultItem, resultQuantity, addResult, wasNewDiscovery, isNonDestructive } = result;
        const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
        const rarityEmoji = this.getRarityEmoji(resultItem.rarity);
        const isShadowUnlock = this.isShadowUnlockItem(resultItem);

        const { title, color, description } = this.buildSuccessDisplayData(
            resultEmoji, rarityEmoji, resultItem, resultQuantity, 
            isShadowUnlock, wasNewDiscovery, isNonDestructive
        );

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setDescription(description)
            .setFooter({ 
                text: isNonDestructive 
                    ? 'The new item has been added to your collection and you kept your ingredients!'
                    : 'The new item has been added to your collection!' 
            })
            .setTimestamp();

        this.addSuccessFields(embed, addResult, isNonDestructive);
        const components = this.buildSuccessComponents(wasNewDiscovery);

        await interaction.editReply({ embeds: [embed], components });
    }

    // FIXED: Single alert for combinations, no duplicates
    async sendCombinationAlert(user, combinationResult) {
        try {
            const { ruleId, resultItem, resultQuantity, wasNewDiscovery, isNonDestructive, ingredients } = combinationResult;
            const isShadowUnlock = this.isShadowUnlockItem(resultItem);
            
            const characterNames = await this.getIngredientNames(ingredients);
            const thumbnail = resultItem.imageUrl || null;

            if (wasNewDiscovery) {
                const recipeText = await this.formatSingleRecipe(combinationResult.rule, resultItem);
                await alertService.sendRecipeDiscoveryAlert({
                    combinationType: 'Recipe Discovery',
                    ruleId,
                    username: user.raUsername,
                    characterNames,
                    resultCharacterName: resultItem.itemName,
                    thumbnail,
                    isSuccess: true,
                    isPlayerConfirmed: false,
                    description: `**${user.raUsername}** discovered a new combination recipe!\n\n**New Recipe:**\n${recipeText}\n\n💡 Use \`/recipes\` to view all discovered combinations!`,
                    fields: [
                        { name: 'Discovery Type', value: 'New Recipe', inline: true },
                        { name: 'Discoverer', value: user.raUsername, inline: true },
                        ...(resultItem.flavorText ? [{ name: 'Flavor Text', value: `*"${resultItem.flavorText}"*`, inline: false }] : [])
                    ]
                });
            } else {
                await alertService.sendCombinationAlert({
                    alertType: ALERT_TYPES.COMBINATION_COMPLETE,
                    combinationType: isNonDestructive ? 'Non-Destructive' : 'Standard',
                    ruleId,
                    username: user.raUsername,
                    characterNames,
                    resultCharacterName: resultItem.itemName,
                    thumbnail,
                    isSuccess: true,
                    isPlayerConfirmed: true,
                    description: `${user.raUsername} ${isShadowUnlock ? 'unlocked the shadow!' : (isNonDestructive ? 'completed a non-destructive combination!' : 'created a combination!')}`,
                    fields: [
                        {
                            name: 'Result',
                            value: `${formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated)} ${resultQuantity}x **${resultItem.itemName}**`,
                            inline: true
                        },
                        ...(resultItem.flavorText ? [{ name: 'Flavor Text', value: `*"${resultItem.flavorText}"*`, inline: false }] : [])
                    ]
                });
            }
        } catch (error) {
            console.error('Error sending combination alert via AlertService:', error);
        }
    }

    // FIXED: Mark discovery without duplicate alerts
    async markCombinationDiscovered(ruleId, discoveredBy) {
        try {
            const rule = await CombinationRule.findOne({ ruleId });
            if (rule && !rule.discovered) {
                rule.discovered = true;
                rule.discoveredAt = new Date();
                rule.discoveredBy = discoveredBy;
                await rule.save();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error marking combination as discovered:', error);
            return false;
        }
    }

    // Recipe book methods
    async getDiscoveredRecipes() {
        try {
            const discoveredRules = await CombinationRule.find({ 
                isActive: true, 
                discovered: true 
            }).sort({ discoveredAt: 1 });

            const recipes = [];
            for (const rule of discoveredRules) {
                const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
                if (!resultItem) continue;

                const ingredientItems = await this.getIngredientItems(rule.ingredients);
                if (ingredientItems.length === rule.ingredients.length) {
                    recipes.push({
                        rule,
                        resultItem,
                        ingredients: ingredientItems,
                        discoveredBy: rule.discoveredBy,
                        discoveredAt: rule.discoveredAt
                    });
                }
            }

            return this.sortRecipes(recipes);
        } catch (error) {
            console.error('Error getting discovered recipes:', error);
            return [];
        }
    }

    async formatSingleRecipe(rule, resultItem) {
        const ingredients = [];
        
        for (const ingredient of rule.ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                const emoji = formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
                ingredients.push(ingredient.quantity > 1 ? `${emoji} x${ingredient.quantity}` : emoji);
            }
        }

        const resultEmoji = formatGachaEmoji(resultItem.emojiId, resultItem.emojiName, resultItem.isAnimated);
        const resultQuantity = rule.result.quantity > 1 ? ` x${rule.result.quantity}` : '';
        const ingredientsPart = rule.isNonDestructive ? `(${ingredients.join(' + ')})` : ingredients.join(' + ');
        
        return `${ingredientsPart} = ${resultEmoji}${resultQuantity}${rule.isNonDestructive ? ' 🔄' : ''}`;
    }

    async showRecipeBook(interaction, page = 0) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }

            const allRecipes = await this.getDiscoveredRecipes();
            
            if (!allRecipes.length) {
                return interaction.editReply({ 
                    embeds: [this.buildEmptyRecipeBookEmbed()], 
                    components: [] 
                });
            }

            const { embed, components } = await this.buildRecipeBookDisplay(allRecipes, page);
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

    async handleRecipeBookInteraction(interaction) {
        if (!interaction.customId.startsWith('recipes_')) return false;

        try {
            await interaction.deferUpdate();

            const action = interaction.customId.split('_')[1];

            switch (action) {
                case 'refresh':
                    await this.showRecipeBook(interaction, 0);
                    return true;
                case 'to':
                    if (interaction.customId === 'recipes_to_collection') {
                        return await this.handleRecipeToCollection(interaction);
                    }
                    break;
                case 'prev':
                case 'next':
                    return await this.handleRecipePagination(interaction, action);
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

    // Utility methods
    buildUserItemMap(user) {
        const userItemMap = new Map();
        user.gachaCollection.forEach(item => {
            const existing = userItemMap.get(item.itemId) || { quantity: 0, item };
            existing.quantity += (item.quantity || 1);
            userItemMap.set(item.itemId, existing);
        });
        return userItemMap;
    }

    getCombinationDisplayData(isShadowUnlock, isNonDestructive) {
        if (isShadowUnlock) {
            return {
                title: '🌙 SHADOW UNLOCK AVAILABLE!',
                color: '#9932CC',
                warningText: isNonDestructive 
                    ? '🔄 **This will keep your ingredients!**\n🔓 **This will reveal this month\'s shadow challenge!**'
                    : '⚠️ **This will consume the ingredients!**\n🔓 **This will reveal this month\'s shadow challenge!**'
            };
        } else if (isNonDestructive) {
            return {
                title: '🔄 Non-Destructive Combination Available!',
                color: COLORS.SUCCESS,
                warningText: '🔄 **This will keep your ingredients - perfect for series completion rewards!**'
            };
        } else {
            return {
                title: '⚗️ Combination Available!',
                color: COLORS.WARNING,
                warningText: '⚠️ **This will consume the ingredients!**'
            };
        }
    }

    getMultiCombinationDisplayData(hasShadowUnlock, hasNonDestructive) {
        if (hasShadowUnlock) {
            return { title: '🌙 SHADOW UNLOCK + MORE AVAILABLE!', color: '#9932CC' };
        } else if (hasNonDestructive) {
            return { title: '🔄 Multiple Combinations Available!', color: COLORS.SUCCESS };
        } else {
            return { title: '⚗️ Multiple Combinations Available!', color: COLORS.INFO };
        }
    }

    buildCombinationButtons(combination, maxCombinations, isShadowUnlock, isNonDestructive) {
        const actionRow = new ActionRowBuilder();
        
        if (maxCombinations >= 1) {
            const buttonData = this.getButtonData(isShadowUnlock, isNonDestructive);
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_1`)
                    .setLabel(buttonData.label)
                    .setStyle(buttonData.style)
                    .setEmoji(buttonData.emoji)
            );
        }
        
        if (maxCombinations >= 5 && maxCombinations !== 5 && !isShadowUnlock) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_5`)
                    .setLabel(isNonDestructive ? 'Create 5 🔄' : 'Make 5')
                    .setStyle(isNonDestructive ? ButtonStyle.Success : ButtonStyle.Primary)
            );
        }
        
        if (maxCombinations > 1 && !isShadowUnlock) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_all`)
                    .setLabel(isNonDestructive ? `Create All (${maxCombinations}) 🔄` : `Make All (${maxCombinations})`)
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

        return actionRow;
    }

    buildCombinationSelectOptions(combinations) {
        return combinations.map((combo) => {
            const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName, combo.resultItem.isAnimated);
            const ingredientNames = combo.ingredients.map(ing => ing.item?.itemName || ing.itemId).join(' + ');
            const isShadowUnlock = this.isShadowUnlockItem(combo.resultItem);
            const isNonDestructive = combo.rule.isNonDestructive;
            
            let label = `${combo.resultQuantity}x ${combo.resultItem.itemName}`;
            let description = `${ingredientNames} (max: ${combo.maxCombinations})`;
            
            if (isShadowUnlock) {
                label += ' 🌙';
                description += ' - SHADOW!';
            } else if (isNonDestructive) {
                label += ' 🔄';
                description += ' - KEEPS INGREDIENTS!';
            }
            
            const option = {
                label: label.slice(0, 100),
                value: `combo_select_${combo.ruleId}`,
                description: description.slice(0, 100)
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
    }

    buildMultiCombinationComponents(selectOptions) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('combo_selection')
            .setPlaceholder('Choose a combination...')
            .addOptions(selectOptions);

        return [
            new ActionRowBuilder().addComponents(selectMenu),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('combo_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('combo_to_collection')
                    .setLabel('← View Collection')
                    .setStyle(ButtonStyle.Secondary)
            )
        ];
    }

    async processIngredients(user, rule, quantity) {
        const removedIngredients = [];
        
        if (!rule.isNonDestructive) {
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
        } else {
            for (const ingredient of rule.ingredients) {
                const totalRequired = ingredient.quantity * quantity;
                const userItem = user.gachaCollection.find(item => item.itemId === ingredient.itemId);
                
                if (!userItem || (userItem.quantity || 1) < totalRequired) {
                    throw new Error(`Insufficient quantity of ${ingredient.itemId}`);
                }
                
                removedIngredients.push({
                    itemId: ingredient.itemId,
                    itemName: userItem.itemName,
                    quantityUsed: totalRequired,
                    kept: true
                });
            }
        }
        
        return removedIngredients;
    }

    async buildTransferAlertData(recipient, possibleCombinations, giverUsername) {
        let memberTag = `**${recipient.raUsername}**`;
        try {
            if (this.client) {
                const guild = await this.client.guilds.cache.first();
                const member = await guild.members.fetch(recipient.discordId);
                memberTag = `<@${recipient.discordId}>`;
            }
        } catch (error) {
            // Use username fallback
        }

        const { characterNames, resultCharacterName, thumbnail } = this.extractCombinationData(possibleCombinations);

        return {
            memberTag,
            alertData: {
                combinationType: 'Player Transfer',
                ruleId: possibleCombinations[0]?.ruleId || 'multiple',
                username: recipient.raUsername,
                characterNames,
                resultCharacterName,
                thumbnail,
                isSuccess: true,
                isPlayerConfirmed: false,
                fields: [{
                    name: '🎯 Available Combinations',
                    value: this.formatAvailableCombinations(possibleCombinations),
                    inline: false
                }]
            }
        };
    }

    async buildAdminGiftAlertData(user, possibleCombinations, adminInteraction) {
        let memberTag = `**${user.raUsername}**`;
        try {
            if (this.client && adminInteraction.guildId) {
                const guild = await this.client.guilds.fetch(adminInteraction.guildId);
                const member = await guild.members.fetch(user.discordId);
                memberTag = `<@${user.discordId}>`;
            }
        } catch (error) {
            // Use username fallback
        }

        const { characterNames, resultCharacterName, thumbnail } = this.extractCombinationData(possibleCombinations);

        return {
            memberTag,
            alertData: {
                combinationType: 'Admin Gift',
                ruleId: possibleCombinations[0]?.ruleId || 'multiple',
                username: user.raUsername,
                characterNames,
                resultCharacterName,
                thumbnail,
                isSuccess: true,
                isPlayerConfirmed: false,
                fields: [{
                    name: '🎯 Available Combinations',
                    value: this.formatAvailableCombinations(possibleCombinations),
                    inline: false
                }]
            }
        };
    }

    extractCombinationData(possibleCombinations) {
        const characterNames = [];
        let resultCharacterName = 'Multiple Options';
        let thumbnail = null;

        if (possibleCombinations.length === 1) {
            const combo = possibleCombinations[0];
            characterNames.push(...combo.ingredients.map(ing => ing.item?.itemName || ing.itemId));
            resultCharacterName = combo.resultItem.itemName;
            thumbnail = combo.resultItem.imageUrl;
        }

        return { characterNames, resultCharacterName, thumbnail };
    }

    formatAvailableCombinations(possibleCombinations) {
        const formatted = possibleCombinations.slice(0, 3).map(combo => {
            const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName, combo.resultItem.isAnimated);
            const isShadowUnlock = this.isShadowUnlockItem(combo.resultItem);
            const isNonDestructive = combo.rule.isNonDestructive;
            let suffix = '';
            if (isShadowUnlock) suffix = ' 🌙';
            else if (isNonDestructive) suffix = ' 🔄';
            return `${resultEmoji} ${combo.resultItem.itemName}${suffix}`;
        }).join('\n');
        
        return formatted + (possibleCombinations.length > 3 ? '\n*...and more!*' : '');
    }

    async getCurrentChallenge() {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
        return await Challenge.findOne({
            date: { $gte: currentMonthStart, $lt: nextMonthStart }
        });
    }

    parseInteractionCustomId(customId) {
        const parts = customId.split('_');
        const action = parts[1];
        const actionData = parts.slice(2);
        return { action, actionData };
    }

    async handleCancelOrCollection(interaction, action) {
        if (action === 'to_collection') {
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

    async handleConfirmInteraction(interaction, actionData) {
        const user = await this.getUserForInteraction(interaction);
        if (!user) return true;

        const { ruleId, quantity } = this.parseConfirmAction(actionData);
        
        if (quantity === 'all') {
            const rule = await CombinationRule.findOne({ ruleId, isActive: true });
            if (!rule) {
                await interaction.editReply({
                    content: `❌ Combination rule not found.`,
                    embeds: [],
                    components: []
                });
                return true;
            }
            
            const possibleCombinations = await this.findPossibleCombinationsForRule(user, rule);
            if (!possibleCombinations.length) {
                await interaction.editReply({
                    content: '❌ This combination is no longer available.',
                    embeds: [],
                    components: []
                });
                return true;
            }
            
            const actualQuantity = possibleCombinations[0].maxCombinations;
            return await this.executeConfirmCombination(interaction, user, ruleId, actualQuantity);
        } else {
            return await this.executeConfirmCombination(interaction, user, ruleId, parseInt(quantity));
        }
    }

    async handleSelectInteraction(interaction, actionData) {
        const ruleId = actionData.join('_');
        const user = await this.getUserForInteraction(interaction);
        if (!user) return true;

        const rule = await CombinationRule.findOne({ ruleId, isActive: true });
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

    async handleSelectionInteraction(interaction) {
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

    parseConfirmAction(actionData) {
        const quantityPart = actionData[actionData.length - 1];
        const ruleId = actionData.slice(0, -1).join('_');
        return { ruleId, quantity: quantityPart };
    }

    async executeConfirmCombination(interaction, user, ruleId, quantity) {
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

    buildSuccessDisplayData(resultEmoji, rarityEmoji, resultItem, resultQuantity, isShadowUnlock, wasNewDiscovery, isNonDestructive) {
        let title = '✨ Combination Successful!';
        let color = COLORS.SUCCESS;
        
        if (isShadowUnlock) {
            title = '🌙 SHADOW UNLOCKED!';
            color = '#9932CC';
        } else if (wasNewDiscovery) {
            title = '🎉 NEW RECIPE DISCOVERED!';
            color = '#FFD700';
        } else if (isNonDestructive) {
            title = '🔄 Non-Destructive Combination Successful!';
            color = '#00FF00';
        }

        let description = `You created ${isShadowUnlock ? '**the Shadow Unlock item**' : (isNonDestructive ? '**a collection bonus**' : 'a new item')}!\n\n` +
                         `${resultEmoji} ${rarityEmoji} **${resultQuantity}x ${resultItem.itemName}**\n\n` +
                         `*${resultItem.description}*`;
        
        if (isShadowUnlock) {
            description += '\n\n🔓 **The shadow challenge has been revealed to the server!**';
        } else if (wasNewDiscovery) {
            description += '\n\n📖 **This recipe has been added to the community recipe book for everyone to see!**\n💡 Use `/recipes` to view all discovered combinations!';
        }
        
        if (isNonDestructive) {
            description += '\n\n🔄 **Your ingredients were kept!** Perfect for series completion rewards!';
        }

        return { title, color, description };
    }

    addSuccessFields(embed, addResult, isNonDestructive) {
        if (addResult?.wasStacked) {
            embed.addFields({ name: '📚 Stacked', value: `Added to existing stack`, inline: true });
        }

        if (addResult?.isNew) {
            embed.addFields({ name: '✨ New Item', value: `First time obtaining this item!`, inline: true });
        }
        
        if (isNonDestructive) {
            embed.addFields({ name: '🔄 Ingredients Status', value: `All ingredients kept in your collection!`, inline: true });
        }
    }

    buildSuccessComponents(wasNewDiscovery) {
        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('combo_to_collection')
                    .setLabel('← View Collection')
                    .setStyle(ButtonStyle.Primary)
            )
        ];

        if (wasNewDiscovery) {
            components[0].addComponents(
                new ButtonBuilder()
                    .setCustomId('combo_to_recipes')
                    .setLabel('📖 View Recipe Book')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        return components;
    }

    async getIngredientNames(ingredients) {
        const characterNames = [];
        for (const ingredient of ingredients) {
            const ingredientItem = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (ingredientItem) {
                characterNames.push(ingredientItem.itemName);
            }
        }
        return characterNames;
    }

    async getIngredientItems(ingredients) {
        const ingredientItems = [];
        for (const ingredient of ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                ingredientItems.push({
                    ...item.toObject(),
                    quantity: ingredient.quantity
                });
            }
        }
        return ingredientItems;
    }

    sortRecipes(recipes) {
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        return recipes.sort((a, b) => {
            const aRarityIndex = rarityOrder.indexOf(a.resultItem.rarity);
            const bRarityIndex = rarityOrder.indexOf(b.resultItem.rarity);
            if (aRarityIndex !== bRarityIndex) return aRarityIndex - bRarityIndex;
            
            const aSeriesId = a.resultItem.seriesId || 'zzz_individual';
            const bSeriesId = b.resultItem.seriesId || 'zzz_individual';
            const seriesCompare = aSeriesId.localeCompare(bSeriesId);
            if (seriesCompare !== 0) return seriesCompare;
            
            return a.resultItem.itemName.localeCompare(b.resultItem.itemName);
        });
    }

    buildEmptyRecipeBookEmbed() {
        return new EmbedBuilder()
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
    }

    async buildRecipeBookDisplay(allRecipes, page) {
        const RECIPES_PER_PAGE = 15;
        const totalPages = Math.ceil(allRecipes.length / RECIPES_PER_PAGE);
        const startIndex = page * RECIPES_PER_PAGE;
        const pageRecipes = allRecipes.slice(startIndex, startIndex + RECIPES_PER_PAGE);

        const embed = new EmbedBuilder()
            .setTitle('📖 Community Recipe Book')
            .setColor(COLORS.INFO)
            .setTimestamp();

        const rarityGroups = this.groupRecipesByRarity(pageRecipes);
        const description = await this.buildRecipeDescription(rarityGroups, allRecipes.length);
        
        embed.setDescription(description);

        const footerText = this.buildRecipeFooter(totalPages, page, startIndex, allRecipes.length, RECIPES_PER_PAGE);
        embed.setFooter({ text: footerText });

        const components = this.buildRecipeBookComponents(totalPages, page);

        return { embed, components };
    }

    groupRecipesByRarity(recipes) {
        const rarityGroups = {};
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        
        for (const recipe of recipes) {
            const rarity = recipe.resultItem.rarity;
            if (!rarityGroups[rarity]) rarityGroups[rarity] = [];
            rarityGroups[rarity].push(recipe);
        }

        return { groups: rarityGroups, order: rarityOrder };
    }

    async buildRecipeDescription(rarityGroups, totalRecipes) {
        let description = `**Discovered Combinations:** ${totalRecipes}\n\n`;
        let totalCharacters = description.length;

        for (const rarity of rarityGroups.order) {
            const recipes = rarityGroups.groups[rarity];
            if (!recipes?.length) continue;

            const rarityEmoji = this.getRarityEmoji(rarity);
            const rarityName = this.getRarityDisplayName(rarity);
            const rarityHeader = `${rarityEmoji} **${rarityName}**\n`;
            
            if (totalCharacters + rarityHeader.length > 3800) break;

            description += rarityHeader;
            totalCharacters += rarityHeader.length;

            for (const recipe of recipes) {
                const recipeText = await this.formatSingleRecipe(recipe.rule, recipe.resultItem);
                const recipeLine = `${recipeText}\n`;
                
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

        return description.trim();
    }

    buildRecipeFooter(totalPages, page, startIndex, totalRecipes, recipesPerPage) {
        let footerText = totalPages > 1 
            ? `Page ${page + 1}/${totalPages} • ${startIndex + 1}-${Math.min(startIndex + recipesPerPage, totalRecipes)} of ${totalRecipes} recipes`
            : `${totalRecipes} discovered recipes`;
        
        return footerText + ' • 🔄 = Non-Destructive (keeps ingredients) • Recipes update automatically!';
    }

    buildRecipeBookComponents(totalPages, page) {
        const components = [];

        if (totalPages > 1) {
            components.push(new ActionRowBuilder().addComponents(
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
            ));
        }

        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('recipes_refresh')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('recipes_to_collection')
                .setLabel('📦 My Collection')
                .setStyle(ButtonStyle.Secondary)
        ));

        return components;
    }

    async handleRecipeToCollection(interaction) {
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

    async handleRecipePagination(interaction, direction) {
        const parts = interaction.customId.split('_');
        const currentPage = parseInt(parts[2]);
        const newPage = direction === 'prev' ? currentPage - 1 : currentPage + 1;
        await this.showRecipeBook(interaction, newPage);
        return true;
    }

    getButtonData(isShadowUnlock, isNonDestructive) {
        if (isShadowUnlock) {
            return { label: 'Unlock Shadow!', style: ButtonStyle.Danger, emoji: '🌙' };
        } else if (isNonDestructive) {
            return { label: 'Create 1 🔄', style: ButtonStyle.Success, emoji: '🎁' };
        } else {
            return { label: 'Make 1', style: ButtonStyle.Primary, emoji: '⚗️' };
        }
    }

    // Legacy and utility methods
    isShadowUnlockItem(item) {
        return item.itemId === '999' || 
               item.itemName?.toLowerCase().includes('shadow unlock') ||
               item.itemName?.toLowerCase().includes('shadow_unlock');
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
                if (rule.isNonDestructive) {
                    const userHasResult = user.gachaCollection?.some(item => item.itemId === rule.result.itemId);
                    if (userHasResult) continue;
                }

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
                        isNonDestructive: rule.isNonDestructive,
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

    // Legacy methods for backwards compatibility
    async checkAutoCombinations(user) {
        return [];
    }
}

export default new CombinationService();
