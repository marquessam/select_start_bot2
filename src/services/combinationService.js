// src/services/combinationService.js - FIXED: Proper emoji display throughout
import { GachaItem, CombinationRule } from '../models/GachaItem.js';
import { Challenge } from '../models/Challenge.js';
import { config } from '../config/config.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { formatGachaEmoji } from '../config/gachaEmojis.js';
import { COLORS } from '../utils/FeedUtils.js';
import alertService, { ALERT_TYPES } from '../utils/AlertService.js';

const RESULT_TYPE_CONFIG = {
    single: { emoji: '⚗️', label: 'Standard' },
    choice: { emoji: '🎯', label: 'Choice' },
    random: { emoji: '🎲', label: 'Random' }
};

const COMBINATION_COLORS = {
    standard: COLORS.WARNING,
    nondestructive: COLORS.SUCCESS,
    shadow: '#9932CC',
    choice: '#4A90E2',
    random: '#FF6B35',
    discovery: '#FFD700'
};

class CombinationService {
    constructor() {
        this.isInitialized = false;
        this.client = null;
    }

    setClient(client) {
        this.client = client;
        alertService.setClient(client);
    }

    /**
     * FIXED: Enhanced emoji formatting for items (prioritizes custom emojis)
     */
    formatItemEmoji(item) {
        if (!item) return '❓';
        
        // If we have custom emoji data, use it
        if (item.emojiId && item.emojiName) {
            const prefix = item.isAnimated ? 'a' : '';
            return `<${prefix}:${item.emojiName}:${item.emojiId}>`;
        }
        
        // Fallback to formatGachaEmoji function
        return formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
    }

    /**
     * FIXED: Create proper emoji object for Discord components
     */
    createEmojiObject(item) {
        if (!item) return null;
        
        if (item.emojiId && item.emojiName) {
            return {
                id: item.emojiId,
                name: item.emojiName,
                animated: item.isAnimated || false
            };
        }
        
        return null; // Let Discord use the fallback emoji name
    }

    // Core combination logic
    async checkPossibleCombinations(user, triggerItemId = null) {
        if (!user.gachaCollection?.length) return [];

        const rules = await CombinationRule.find({ isActive: true });
        const combinations = [];

        for (const rule of rules) {
            const ruleCombinations = await this.findPossibleCombinationsForRule(user, rule, triggerItemId);
            combinations.push(...ruleCombinations);
        }

        return combinations.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0));
    }

    async findPossibleCombinationsForRule(user, rule, triggerItemId = null) {
        const userItemMap = this.buildUserItemMap(user);
        const possibleResults = await this.getPossibleResultItems(rule);
        
        // Skip non-destructive if user already has any result
        if (rule.isNonDestructive && possibleResults.some(item => userItemMap.has(item.itemId))) {
            return [];
        }

        const availableQuantities = rule.ingredients.map(ingredient => {
            const userItem = userItemMap.get(ingredient.itemId);
            return userItem && userItem.quantity >= ingredient.quantity 
                ? Math.floor(userItem.quantity / ingredient.quantity) 
                : 0;
        });

        if (availableQuantities.some(qty => qty === 0)) return [];
        if (triggerItemId && !rule.ingredients.some(ing => ing.itemId === triggerItemId)) return [];

        const maxCombinations = Math.min(...availableQuantities);
        
        return [{
            ruleId: rule.ruleId,
            rule,
            resultType: rule.resultType || 'single',
            possibleResults,
            maxCombinations,
            ingredients: rule.ingredients.map(ing => ({
                itemId: ing.itemId,
                quantity: ing.quantity,
                available: userItemMap.get(ing.itemId)?.quantity || 0,
                item: userItemMap.get(ing.itemId)?.item
            }))
        }];
    }

    async getPossibleResultItems(rule) {
        const resultConfigs = this.getResultConfigs(rule);
        const resultItems = [];

        for (const config of resultConfigs) {
            const item = await GachaItem.findOne({ itemId: config.itemId });
            if (item) {
                resultItems.push({ ...item.toObject(), resultQuantity: config.quantity || 1 });
            }
        }

        return resultItems;
    }

    getResultConfigs(rule) {
        switch (rule.resultType) {
            case 'choice':
            case 'random':
                return rule.results || [];
            default:
                return rule.result?.itemId ? [rule.result] : [];
        }
    }

    buildUserItemMap(user) {
        const map = new Map();
        user.gachaCollection.forEach(item => {
            const existing = map.get(item.itemId) || { quantity: 0, item };
            existing.quantity += (item.quantity || 1);
            map.set(item.itemId, existing);
        });
        return map;
    }

    // UI Display system
    async showCombinationAlert(interaction, user, possibleCombinations) {
        if (!possibleCombinations.length) return;

        const choiceCombinations = possibleCombinations.filter(combo => combo.resultType === 'choice');
        if (choiceCombinations.length > 0) {
            return this.showChoiceCombinationSelection(interaction, user, choiceCombinations[0]);
        }

        return possibleCombinations.length === 1 
            ? this.showSingleCombinationConfirmation(interaction, user, possibleCombinations[0])
            : this.showMultipleCombinationSelection(interaction, user, possibleCombinations);
    }

    async showChoiceCombinationSelection(interaction, user, combination) {
        const { rule, possibleResults, ingredients, maxCombinations } = combination;
        const ingredientsText = this.formatIngredients(ingredients);

        const embed = this.createEmbed('🎯 Choice Combination Available!', COMBINATION_COLORS.choice)
            .setDescription(
                `Choose which item to create from this combination!\n\n` +
                `**Recipe:**\n${ingredientsText}\n\n` +
                `**Available:** ${maxCombinations} combinations\n\n` +
                this.getWarningText(rule.isNonDestructive)
            )
            .setFooter({ text: 'Select which item you want to create from the dropdown below' });

        const selectMenu = this.createResultSelectMenu(combination);
        const components = [
            new ActionRowBuilder().addComponents(selectMenu),
            this.createCancelButtons()
        ];

        await interaction.followUp({ embeds: [embed], components, ephemeral: true });
    }

    async showSingleCombinationConfirmation(interaction, user, combination) {
        const { rule, possibleResults, ingredients, maxCombinations, resultType } = combination;
        const ingredientsText = this.formatIngredients(ingredients);
        const { title, color, description } = this.buildCombinationDisplay(rule, possibleResults, ingredientsText, maxCombinations, resultType);

        const embed = this.createEmbed(title, color, description)
            .setFooter({ 
                text: rule.isNonDestructive 
                    ? 'Choose how many combinations to perform - your ingredients will be kept!'
                    : 'Choose how many combinations to perform, or cancel.' 
            });

        if (resultType === 'single' && possibleResults[0]) {
            embed.addFields({ name: 'Result Description', value: possibleResults[0].description || 'No description' });
        }

        const actionRow = this.buildCombinationButtons(combination, maxCombinations);
        await interaction.followUp({ embeds: [embed], components: [actionRow], ephemeral: true });
    }

    async showMultipleCombinationSelection(interaction, user, combinations) {
        const limitedCombinations = combinations.slice(0, 25);
        const hasSpecialTypes = this.analyzeSpecialTypes(limitedCombinations);

        const embed = this.createEmbed(
            this.getMultiCombinationTitle(hasSpecialTypes),
            this.getMultiCombinationColor(hasSpecialTypes)
        ).setDescription(this.getMultiCombinationDescription(limitedCombinations.length, hasSpecialTypes))
         .setFooter({ text: 'Select a combination from the menu below, or cancel.' });

        const selectOptions = this.buildCombinationSelectOptions(limitedCombinations);
        const components = [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('combo_selection')
                    .setPlaceholder('Choose a combination...')
                    .addOptions(selectOptions)
            ),
            this.createCancelButtons()
        ];

        await interaction.followUp({ embeds: [embed], components, ephemeral: true });
    }

    // Combination execution
    async performCombination(user, ruleId, quantity = 1, selectedResultItemId = null) {
        const rule = await CombinationRule.findOne({ ruleId, isActive: true });
        if (!rule) throw new Error(`Combination rule not found: ${ruleId}`);

        const possibleCombinations = await this.findPossibleCombinationsForRule(user, rule);
        if (!possibleCombinations.length) throw new Error('You no longer have the required ingredients');

        const combination = possibleCombinations[0];
        if (combination.maxCombinations < quantity) {
            throw new Error(`You can only make ${combination.maxCombinations} of this combination`);
        }

        return rule.resultType === 'random' 
            ? this.performRandomCombination(user, rule, quantity)
            : this.performStandardCombination(user, rule, quantity, selectedResultItemId);
    }

    async performStandardCombination(user, rule, quantity, selectedResultItemId) {
        const { resultItem, resultQuantity } = await this.resolveResult(rule, quantity, selectedResultItemId);
        const removedIngredients = await this.processIngredients(user, rule, quantity);
        const addResult = user.addGachaItem(resultItem, resultQuantity, 'combined');
        const wasNewDiscovery = await this.markCombinationDiscovered(rule.ruleId, user.raUsername);

        const result = {
            success: true,
            ruleId: rule.ruleId,
            resultItem,
            resultQuantity,
            addResult,
            rule,
            ingredients: rule.ingredients,
            removedIngredients,
            wasNewDiscovery,
            isNonDestructive: rule.isNonDestructive,
            resultType: rule.resultType,
            selectedResultItemId
        };

        await this.checkForShadowUnlock(user, result);
        return result;
    }

    async performRandomCombination(user, rule, quantity) {
        const randomResults = [];
        for (let i = 0; i < quantity; i++) {
            const randomResult = rule.getRandomResult();
            const randomItem = await GachaItem.findOne({ itemId: randomResult.itemId });
            if (randomItem) {
                randomResults.push({ item: randomItem, quantity: randomResult.quantity || 1 });
            }
        }

        if (!randomResults.length) throw new Error('No valid random results found');

        const removedIngredients = await this.processIngredients(user, rule, randomResults.length);
        const results = randomResults.map(({ item, quantity }) => ({
            resultItem: item,
            resultQuantity: quantity,
            addResult: user.addGachaItem(item, quantity, 'combined')
        }));

        const wasNewDiscovery = await this.markCombinationDiscovered(rule.ruleId, user.raUsername);

        return {
            success: true,
            ruleId: rule.ruleId,
            rule,
            ingredients: rule.ingredients,
            removedIngredients,
            wasNewDiscovery,
            isNonDestructive: rule.isNonDestructive,
            resultType: 'random',
            randomResults: results
        };
    }

    async resolveResult(rule, quantity, selectedResultItemId) {
        let resultConfig;
        
        switch (rule.resultType) {
            case 'choice':
                if (!selectedResultItemId) throw new Error('Choice combination requires a selected result item');
                resultConfig = rule.results.find(r => r.itemId === selectedResultItemId);
                if (!resultConfig) throw new Error('Invalid result item selection');
                break;
            default:
                resultConfig = rule.result;
        }

        const resultItem = await GachaItem.findOne({ itemId: resultConfig.itemId });
        if (!resultItem) throw new Error('Result item not found');

        return {
            resultItem,
            resultQuantity: (resultConfig.quantity || 1) * quantity
        };
    }

    async processIngredients(user, rule, quantity) {
        const removedIngredients = [];
        
        for (const ingredient of rule.ingredients) {
            const totalRequired = ingredient.quantity * quantity;
            const userItem = user.gachaCollection.find(item => item.itemId === ingredient.itemId);
            
            if (!userItem || (userItem.quantity || 1) < totalRequired) {
                throw new Error(`Insufficient quantity of ${ingredient.itemId}`);
            }

            if (!rule.isNonDestructive) {
                const removeSuccess = user.removeGachaItem(ingredient.itemId, totalRequired);
                if (!removeSuccess) throw new Error(`Failed to remove ingredient: ${ingredient.itemId}`);
                
                removedIngredients.push({
                    itemId: ingredient.itemId,
                    itemName: userItem.itemName,
                    quantityRemoved: totalRequired
                });
            } else {
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

    // Interaction handling
    async handleCombinationInteraction(interaction) {
        if (!interaction.customId.startsWith('combo_')) return false;

        if (interaction.customId.startsWith('combo_choice_selection_')) {
            return this.handleChoiceSelection(interaction);
        }

        const { action, actionData } = this.parseInteractionCustomId(interaction.customId);

        const handlers = {
            cancel: () => this.handleCancel(interaction),
            to_collection: () => this.handleToCollection(interaction),
            to_recipes: () => this.handleToRecipes(interaction),
            confirm: () => this.handleConfirm(interaction, actionData),
            select: () => this.handleSelect(interaction, actionData),
            selection: () => this.handleSelection(interaction)
        };

        const handler = handlers[action];
        if (!handler) return false;

        if (!['cancel', 'to_collection', 'to_recipes'].includes(action)) {
            await interaction.deferUpdate();
        }

        await handler();
        return true;
    }

    async handleChoiceSelection(interaction) {
        if (!interaction.isStringSelectMenu()) return false;
        
        await interaction.deferUpdate();
        const selectedValue = interaction.values[0];
        const [, , , ruleId, selectedItemId] = selectedValue.split('_');
        
        const user = await this.getUserForInteraction(interaction);
        if (!user) return true;
        
        return this.executeChoiceCombination(interaction, user, ruleId, selectedItemId, 1);
    }

    async handleConfirm(interaction, actionData) {
        const user = await this.getUserForInteraction(interaction);
        if (!user) return true;

        const { ruleId, quantity } = this.parseConfirmAction(actionData);
        const actualQuantity = quantity === 'all' 
            ? await this.getMaxCombinations(user, ruleId)
            : parseInt(quantity);

        return this.executeConfirmCombination(interaction, user, ruleId, actualQuantity);
    }

    // FIXED: Handle random results safely for alerts
    async executeConfirmCombination(interaction, user, ruleId, quantity) {
        try {
            const result = await this.performCombination(user, ruleId, quantity);
            
            if (result.success) {
                await user.save();
                await this.showCombinationSuccess(interaction, result, quantity);
                
                // FIXED: Handle random results safely for alerts
                if (result.resultType === 'random' && result.randomResults) {
                    // For random results, send alert for first result or summary
                    const firstResult = result.randomResults[0];
                    if (firstResult && firstResult.resultItem) {
                        await this.sendCombinationAlert(user, {
                            ...result,
                            resultItem: firstResult.resultItem,
                            resultQuantity: firstResult.resultQuantity
                        });
                    }
                } else if (result.resultItem) {
                    // For single/choice results
                    await this.sendCombinationAlert(user, result);
                }
            } else {
                await interaction.editReply({ content: `❌ Combination failed: ${result.error}`, embeds: [], components: [] });
            }
            return true;
        } catch (error) {
            console.error('Error in executeConfirmCombination:', error);
            await interaction.editReply({ content: `❌ Combination failed: ${error.message}`, embeds: [], components: [] });
            return true;
        }
    }

    async executeChoiceCombination(interaction, user, ruleId, selectedItemId, quantity) {
        const result = await this.performCombination(user, ruleId, quantity, selectedItemId);
        
        if (result.success) {
            await user.save();
            await this.showCombinationSuccess(interaction, result, quantity);
            await this.sendCombinationAlert(user, result);
        } else {
            await interaction.editReply({ content: `❌ Combination failed: ${result.error}`, embeds: [], components: [] });
        }
        return true;
    }

    async showCombinationSuccess(interaction, result, quantity) {
        const { rule, wasNewDiscovery, isNonDestructive, resultType } = result;
        const { title, color, description } = this.buildSuccessDisplay(result, resultType, wasNewDiscovery, isNonDestructive);

        const embed = this.createEmbed(title, color, description)
            .setFooter({ 
                text: isNonDestructive 
                    ? 'The new item(s) have been added to your collection and you kept your ingredients!'
                    : 'The new item(s) have been added to your collection!' 
            });

        if (resultType !== 'random') {
            this.addSuccessFields(embed, result.addResult, isNonDestructive);
        }

        const components = this.buildSuccessComponents(wasNewDiscovery);
        await interaction.editReply({ embeds: [embed], components });
    }

    // Recipe book functionality
    async showRecipeBook(interaction, page = 0) {
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
    }

    async getDiscoveredRecipes() {
        const discoveredRules = await CombinationRule.find({ 
            isActive: true, 
            discovered: true 
        }).sort({ discoveredAt: 1 });

        const recipes = [];
        for (const rule of discoveredRules) {
            const resultItems = await this.getPossibleResultItems(rule);
            if (resultItems.length > 0) {
                const ingredientItems = await this.getIngredientItems(rule.ingredients);
                if (ingredientItems.length === rule.ingredients.length) {
                    recipes.push({
                        rule,
                        resultItems,
                        ingredients: ingredientItems,
                        discoveredBy: rule.discoveredBy,
                        discoveredAt: rule.discoveredAt
                    });
                }
            }
        }

        return this.sortRecipes(recipes);
    }

    async buildRecipeBookDisplay(allRecipes, page) {
        const RECIPES_PER_PAGE = 15;
        const totalPages = Math.ceil(allRecipes.length / RECIPES_PER_PAGE);
        const pageRecipes = allRecipes.slice(page * RECIPES_PER_PAGE, (page + 1) * RECIPES_PER_PAGE);

        const embed = this.createEmbed('📖 Community Recipe Book', COLORS.INFO)
            .setDescription(await this.buildRecipeDescription(pageRecipes, allRecipes.length))
            .setFooter({ text: this.buildRecipeFooter(totalPages, page, allRecipes.length, RECIPES_PER_PAGE) });

        const components = this.buildRecipeBookComponents(totalPages, page);
        return { embed, components };
    }

    async buildRecipeDescription(recipes, totalRecipes) {
        let description = `**Discovered Combinations:** ${totalRecipes}\n\n`;
        const rarityGroups = this.groupRecipesByRarity(recipes);

        for (const rarity of ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common']) {
            const rarityRecipes = rarityGroups[rarity];
            if (!rarityRecipes?.length) continue;

            description += `${this.getRarityEmoji(rarity)} **${this.getRarityDisplayName(rarity)}**\n`;
            
            for (const recipe of rarityRecipes) {
                const recipeText = await this.formatSingleRecipe(recipe.rule, recipe.resultItems[0]);
                description += `${recipeText}\n`;
            }
            description += '\n';
        }

        return description.trim();
    }

    // Utility methods
    async formatSingleRecipe(rule, resultItem = null) {
        const ingredients = [];
        for (const ingredient of rule.ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                // FIXED: Use enhanced emoji formatting
                const emoji = this.formatItemEmoji(item);
                ingredients.push(ingredient.quantity > 1 ? `${emoji} x${ingredient.quantity}` : emoji);
            }
        }

        const ingredientsPart = rule.isNonDestructive ? `(${ingredients.join(' + ')})` : ingredients.join(' + ');
        
        let resultPart = '';
        switch (rule.resultType) {
            case 'single':
                if (resultItem) {
                    // FIXED: Use enhanced emoji formatting
                    const resultEmoji = this.formatItemEmoji(resultItem);
                    const resultQuantity = rule.result.quantity > 1 ? ` x${rule.result.quantity}` : '';
                    resultPart = `${resultEmoji}${resultQuantity}`;
                }
                break;
            case 'choice':
                resultPart = '🎯 Choice';
                break;
            case 'random':
                resultPart = '🎲 Random';
                break;
        }
        
        const nonDestructiveFlag = rule.isNonDestructive ? ' 🔄' : '';
        return `${ingredientsPart} = ${resultPart}${nonDestructiveFlag}`;
    }

    /**
     * FIXED: Special recipe formatting for alerts that ensures quantities and emojis display correctly
     */
    async formatRecipeForAlert(rule, resultItem = null) {
        console.log('Formatting recipe for alert:', {
            ruleId: rule.ruleId,
            resultType: rule.resultType,
            ingredientsCount: rule.ingredients?.length,
            ingredients: rule.ingredients?.map(ing => ({ itemId: ing.itemId, quantity: ing.quantity }))
        });

        const ingredients = [];
        for (const ingredient of rule.ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                console.log(`Found ingredient item:`, {
                    itemId: item.itemId,
                    itemName: item.itemName,
                    emojiId: item.emojiId,
                    emojiName: item.emojiName,
                    requiredQuantity: ingredient.quantity
                });

                const emoji = this.formatItemEmoji(item);
                const ingredientQuantity = ingredient.quantity || 1;
                
                // Always show quantity if it's more than 1, and log it
                if (ingredientQuantity > 1) {
                    console.log(`Adding ingredient with quantity: ${emoji} x${ingredientQuantity}`);
                    ingredients.push(`${emoji} x${ingredientQuantity}`);
                } else {
                    console.log(`Adding ingredient without quantity: ${emoji}`);
                    ingredients.push(emoji);
                }
            } else {
                console.error(`Could not find ingredient item with ID: ${ingredient.itemId}`);
            }
        }

        const ingredientsPart = rule.isNonDestructive ? `(${ingredients.join(' + ')})` : ingredients.join(' + ');
        
        let resultPart = '';
        switch (rule.resultType) {
            case 'single':
                if (resultItem) {
                    const resultEmoji = this.formatItemEmoji(resultItem);
                    const resultQuantity = (rule.result?.quantity || 1) > 1 ? ` x${rule.result.quantity}` : '';
                    resultPart = `${resultEmoji}${resultQuantity}`;
                    console.log(`Result part: ${resultPart}`);
                }
                break;
            case 'choice':
                resultPart = '🎯 Choice';
                break;
            case 'random':
                resultPart = '🎲 Random';
                break;
        }
        
        const nonDestructiveFlag = rule.isNonDestructive ? ' 🔄' : '';
        const finalRecipe = `${ingredientsPart} = ${resultPart}${nonDestructiveFlag}`;
        
        console.log(`Final recipe for alert: ${finalRecipe}`);
        return finalRecipe;
    }

    // Shadow unlock and alerts
    async checkForShadowUnlock(user, combinationResult) {
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
    }

    async sendCombinationAlert(user, combinationResult) {
        const { ruleId, resultItem, resultQuantity, wasNewDiscovery, isNonDestructive, ingredients, resultType } = combinationResult;
        const isShadowUnlock = this.isShadowUnlockItem(resultItem);
        
        const characterNames = await this.getIngredientNames(ingredients);
        const thumbnail = resultItem.imageUrl || null;

        if (wasNewDiscovery) {
            // FIXED: Create detailed recipe text with proper emoji formatting
            const recipeText = await this.formatRecipeForAlert(combinationResult.rule, resultItem);
            
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
            const combinationType = this.getCombinationType(resultType, isNonDestructive);
            await alertService.sendCombinationAlert({
                alertType: ALERT_TYPES.COMBINATION_COMPLETE,
                combinationType,
                ruleId,
                username: user.raUsername,
                characterNames,
                resultCharacterName: resultItem.itemName,
                thumbnail,
                isSuccess: true,
                isPlayerConfirmed: true,
                description: this.getAlertDescription(user.raUsername, isShadowUnlock, isNonDestructive, resultType),
                fields: [
                    {
                        name: 'Result',
                        // FIXED: Use enhanced emoji formatting
                        value: `${this.formatItemEmoji(resultItem)} ${resultQuantity}x **${resultItem.itemName}**`,
                        inline: true
                    },
                    ...(resultItem.flavorText ? [{ name: 'Flavor Text', value: `*"${resultItem.flavorText}"*`, inline: false }] : [])
                ]
            });
        }
    }

    async markCombinationDiscovered(ruleId, discoveredBy) {
        const rule = await CombinationRule.findOne({ ruleId });
        if (rule && !rule.discovered) {
            rule.discovered = true;
            rule.discoveredAt = new Date();
            rule.discoveredBy = discoveredBy;
            await rule.save();
            return true;
        }
        return false;
    }

    // Transfer alerts
    async triggerCombinationAlertsForPlayerTransfer(recipient, giftedItemId, giverUsername) {
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
    }

    async triggerCombinationAlertsForAdminGift(user, giftedItemId, adminInteraction) {
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
    }

    // UI Building utilities
    createEmbed(title, color = COLORS.INFO, description = null) {
        const embed = new EmbedBuilder().setTitle(title).setColor(color).setTimestamp();
        
        // Only set description if it's not null/undefined and has content
        if (description && description.length > 0) {
            embed.setDescription(description);
        }
        
        return embed;
    }

    createResultSelectMenu(combination) {
        const options = combination.possibleResults.map(resultItem => {
            const option = {
                label: `${resultItem.resultQuantity}x ${resultItem.itemName}`.slice(0, 100),
                value: `choice_result_${combination.ruleId}_${resultItem.itemId}`,
                description: `${this.getRarityDisplayName(resultItem.rarity)} - ${resultItem.description?.slice(0, 50) || 'No description'}...`.slice(0, 100)
            };

            // FIXED: Use proper emoji object creation
            const emojiObj = this.createEmojiObject(resultItem);
            if (emojiObj) {
                option.emoji = emojiObj;
            }
            
            return option;
        }).slice(0, 25);

        return new StringSelectMenuBuilder()
            .setCustomId(`combo_choice_selection_${combination.ruleId}`)
            .setPlaceholder('Choose which item you want to create...')
            .addOptions(options);
    }

    buildCombinationButtons(combination, maxCombinations) {
        const { rule, resultType, possibleResults } = combination;
        const isNonDestructive = rule.isNonDestructive;
        const isShadowUnlock = resultType === 'single' && this.isShadowUnlockItem(possibleResults[0]);
        
        const buttons = [];
        
        if (maxCombinations >= 1) {
            const buttonData = this.getButtonData(resultType, isShadowUnlock, isNonDestructive);
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_1`)
                    .setLabel(buttonData.label)
                    .setStyle(buttonData.style)
                    .setEmoji(buttonData.emoji)
            );
        }
        
        if (maxCombinations >= 5 && maxCombinations !== 5 && !isShadowUnlock) {
            const label = this.getMultiButtonLabel(resultType, isNonDestructive, 5);
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_5`)
                    .setLabel(label)
                    .setStyle(isNonDestructive ? ButtonStyle.Success : ButtonStyle.Primary)
            );
        }
        
        if (maxCombinations > 1 && !isShadowUnlock) {
            const label = this.getMultiButtonLabel(resultType, isNonDestructive, maxCombinations);
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`combo_confirm_${combination.ruleId}_all`)
                    .setLabel(label)
                    .setStyle(ButtonStyle.Success)
            );
        }

        buttons.push(
            new ButtonBuilder().setCustomId('combo_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('combo_to_collection').setLabel('← View Collection').setStyle(ButtonStyle.Secondary)
        );

        return new ActionRowBuilder().addComponents(...buttons);
    }

    createCancelButtons() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('combo_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('combo_to_collection').setLabel('← View Collection').setStyle(ButtonStyle.Secondary)
        );
    }

    buildSuccessComponents(wasNewDiscovery) {
        const buttons = [
            new ButtonBuilder().setCustomId('combo_to_collection').setLabel('← View Collection').setStyle(ButtonStyle.Primary)
        ];

        if (wasNewDiscovery) {
            buttons.push(
                new ButtonBuilder().setCustomId('combo_to_recipes').setLabel('📖 View Recipe Book').setStyle(ButtonStyle.Secondary)
            );
        }

        return [new ActionRowBuilder().addComponents(...buttons)];
    }

    // Helper methods
    formatIngredients(ingredients) {
        return ingredients.map(ing => {
            // FIXED: Use enhanced emoji formatting
            const emoji = ing.item ? this.formatItemEmoji(ing.item) : '❓';
            const name = ing.item ? ing.item.itemName : ing.itemId;
            const quantity = ing.quantity || 1;
            
            // FIXED: Always show quantity if more than 1
            if (quantity > 1) {
                return `${emoji} ${quantity}x ${name}`;
            } else {
                return `${emoji} ${name}`;
            }
        }).join('\n');
    }

    getWarningText(isNonDestructive) {
        return isNonDestructive 
            ? '🔄 **This will keep your ingredients!**'
            : '⚠️ **This will consume the ingredients!**';
    }

    // FIXED: Don't show all random outcomes, show summary instead
    buildCombinationDisplay(rule, possibleResults, ingredientsText, maxCombinations, resultType) {
        if (resultType === 'random') {
            // FIXED: Don't show all outcomes, show summary instead
            return {
                title: '🎲 Random Combination Available!',
                color: COMBINATION_COLORS.random,
                description: `You will get a random item from **${possibleResults.length} possible results**!\n\n` +
                           `**Recipe:**\n${ingredientsText}\n\n` +
                           `**Possible Outcomes:** ${possibleResults.length} different items\n` +
                           `**Available combinations:** ${maxCombinations}\n\n` +
                           this.getWarningText(rule.isNonDestructive) + '\n\n' +
                           `🎯 *Exact results will be revealed when you combine!*`
            };
        } else {
            const resultItem = possibleResults[0];
            const isShadowUnlock = this.isShadowUnlockItem(resultItem);
            // FIXED: Use enhanced emoji formatting
            const resultEmoji = this.formatItemEmoji(resultItem);
            const rarityEmoji = this.getRarityEmoji(resultItem.rarity);

            const displayData = this.getCombinationDisplayData(isShadowUnlock, rule.isNonDestructive);

            return {
                title: displayData.title,
                color: displayData.color,
                description: `You can create ${isShadowUnlock ? '**the Shadow Unlock item**' : (rule.isNonDestructive ? '**a collection bonus**' : 'a new item')} by combining ingredients!\n\n` +
                           `**Recipe:**\n${ingredientsText}\n\n` +
                           `**Creates:**\n${resultEmoji} ${rarityEmoji} **${resultItem.resultQuantity}x ${resultItem.itemName}**\n\n` +
                           `**Available combinations:** ${maxCombinations}\n\n` +
                           displayData.warningText
            };
        }
    }

    getCombinationDisplayData(isShadowUnlock, isNonDestructive) {
        if (isShadowUnlock) {
            return {
                title: '🌙 SHADOW UNLOCK AVAILABLE!',
                color: COMBINATION_COLORS.shadow,
                warningText: isNonDestructive 
                    ? '🔄 **This will keep your ingredients!**\n🔓 **This will reveal this month\'s shadow challenge!**'
                    : '⚠️ **This will consume the ingredients!**\n🔓 **This will reveal this month\'s shadow challenge!**'
            };
        } else if (isNonDestructive) {
            return {
                title: '🔄 Non-Destructive Combination Available!',
                color: COMBINATION_COLORS.nondestructive,
                warningText: '🔄 **This will keep your ingredients - perfect for series completion rewards!**'
            };
        } else {
            return {
                title: '⚗️ Combination Available!',
                color: COMBINATION_COLORS.standard,
                warningText: '⚠️ **This will consume the ingredients!**'
            };
        }
    }

    // FIXED: Handle random results better
    buildSuccessDisplay(result, resultType, wasNewDiscovery, isNonDestructive) {
        let title = '✨ Combination Successful!';
        let color = COLORS.SUCCESS;
        let description = '';
        
        if (resultType === 'random' && result.randomResults) {
            title = '🎲 Random Combination Successful!';
            color = COMBINATION_COLORS.random;
            
            description = `You performed ${result.randomResults.length} random combination(s) and got:\n\n`;
            result.randomResults.forEach((randomResult, index) => {
                // FIXED: Use enhanced emoji formatting
                const emoji = this.formatItemEmoji(randomResult.resultItem);
                const rarityEmoji = this.getRarityEmoji(randomResult.resultItem.rarity);
                description += `**${index + 1}.** ${emoji} ${rarityEmoji} **${randomResult.resultQuantity}x ${randomResult.resultItem.itemName}**\n`;
            });
        } else if (result.resultItem) {
            const { resultItem, resultQuantity } = result;
            // FIXED: Use enhanced emoji formatting
            const resultEmoji = this.formatItemEmoji(resultItem);
            const rarityEmoji = this.getRarityEmoji(resultItem.rarity);
            const isShadowUnlock = this.isShadowUnlockItem(resultItem);
            
            if (resultType === 'choice') {
                title = '🎯 Choice Combination Successful!';
                color = COMBINATION_COLORS.choice;
            }
            
            if (isShadowUnlock) {
                title = '🌙 SHADOW UNLOCKED!';
                color = COMBINATION_COLORS.shadow;
            } else if (wasNewDiscovery) {
                title = '🎉 NEW RECIPE DISCOVERED!';
                color = COMBINATION_COLORS.discovery;
            }
            
            description = `You created ${isShadowUnlock ? '**the Shadow Unlock item**' : (isNonDestructive ? '**a collection bonus**' : 'a new item')}!\n\n` +
                         `${resultEmoji} ${rarityEmoji} **${resultQuantity}x ${resultItem.itemName}**\n\n` +
                         `*${resultItem.description}*`;
            
            if (isShadowUnlock) {
                description += '\n\n🔓 **The shadow challenge has been revealed to the server!**';
            }
        }
        
        if (wasNewDiscovery) {
            description += '\n\n📖 **This recipe has been added to the community recipe book for everyone to see!**\n💡 Use `/recipes` to view all discovered combinations!';
        }
        
        if (isNonDestructive) {
            description += '\n\n🔄 **Your ingredients were kept!** Perfect for series completion rewards!';
        }

        return { title, color, description };
    }

    analyzeSpecialTypes(combinations) {
        return {
            hasShadowUnlock: combinations.some(combo => this.isShadowUnlockItem(combo.possibleResults[0])),
            hasNonDestructive: combinations.some(combo => combo.rule.isNonDestructive),
            hasChoice: combinations.some(combo => combo.resultType === 'choice'),
            hasRandom: combinations.some(combo => combo.resultType === 'random')
        };
    }

    getMultiCombinationTitle(hasSpecialTypes) {
        if (hasSpecialTypes.hasShadowUnlock) return '🌙 SHADOW UNLOCK + MORE AVAILABLE!';
        if (hasSpecialTypes.hasChoice || hasSpecialTypes.hasRandom) return '🎯 Enhanced Combinations Available!';
        if (hasSpecialTypes.hasNonDestructive) return '🔄 Multiple Combinations Available!';
        return '⚗️ Multiple Combinations Available!';
    }

    getMultiCombinationColor(hasSpecialTypes) {
        if (hasSpecialTypes.hasShadowUnlock) return COMBINATION_COLORS.shadow;
        if (hasSpecialTypes.hasChoice || hasSpecialTypes.hasRandom) return COMBINATION_COLORS.choice;
        if (hasSpecialTypes.hasNonDestructive) return COMBINATION_COLORS.nondestructive;
        return COLORS.INFO;
    }

    getMultiCombinationDescription(count, hasSpecialTypes) {
        let description = `You have ingredients for multiple combinations!\nChoose which one you'd like to make:\n\n`;
        
        if (!hasSpecialTypes.hasNonDestructive) {
            description += `⚠️ **Standard combinations will consume ingredients!**\n`;
        }
        if (hasSpecialTypes.hasNonDestructive) {
            description += `🔄 **Non-destructive combinations will keep ingredients!**\n`;
        }
        if (hasSpecialTypes.hasChoice) {
            description += `🎯 **Choice combinations let you pick the result!**\n`;
        }
        if (hasSpecialTypes.hasRandom) {
            description += `🎲 **Random combinations give surprise results!**\n`;
        }
        if (hasSpecialTypes.hasShadowUnlock) {
            description += `🌙 **One option will unlock the shadow challenge!**`;
        }
        
        return description;
    }

    buildCombinationSelectOptions(combinations) {
        return combinations.map((combo) => {
            const resultItem = combo.possibleResults[0]; // For display purposes
            const ingredientNames = combo.ingredients.map(ing => ing.item?.itemName || ing.itemId).join(' + ');
            const typeEmoji = RESULT_TYPE_CONFIG[combo.resultType]?.emoji || '⚗️';
            const isShadowUnlock = this.isShadowUnlockItem(resultItem);
            const isNonDestructive = combo.rule.isNonDestructive;
            
            let label = `${resultItem.resultQuantity}x ${resultItem.itemName}`;
            let description = `${ingredientNames} (max: ${combo.maxCombinations})`;
            
            if (isShadowUnlock) {
                label += ' 🌙';
                description += ' - SHADOW!';
            } else if (combo.resultType === 'choice') {
                label += ` ${typeEmoji}`;
                description += ' - CHOICE!';
            } else if (combo.resultType === 'random') {
                label += ` ${typeEmoji}`;
                description += ' - RANDOM!';
            } else if (isNonDestructive) {
                label += ' 🔄';
                description += ' - KEEPS INGREDIENTS!';
            }
            
            const option = {
                label: label.slice(0, 100),
                value: `combo_select_${combo.ruleId}`,
                description: description.slice(0, 100)
            };

            // FIXED: Use proper emoji object creation
            const emojiObj = this.createEmojiObject(resultItem);
            if (emojiObj) {
                option.emoji = emojiObj;
            }
            
            return option;
        });
    }

    getButtonData(resultType, isShadowUnlock, isNonDestructive) {
        if (isShadowUnlock) {
            return { label: 'Unlock Shadow!', style: ButtonStyle.Danger, emoji: '🌙' };
        }
        
        switch (resultType) {
            case 'random':
                return { label: '🎲 Random Result', style: ButtonStyle.Primary, emoji: '🎲' };
            case 'choice':
                return { label: '🎯 Make Choice', style: ButtonStyle.Primary, emoji: '🎯' };
            default:
                return isNonDestructive 
                    ? { label: 'Create 1 🔄', style: ButtonStyle.Success, emoji: '🎁' }
                    : { label: 'Make 1', style: ButtonStyle.Primary, emoji: '⚗️' };
        }
    }

    getMultiButtonLabel(resultType, isNonDestructive, count) {
        const countText = count === 5 ? '5' : `All (${count})`;
        
        switch (resultType) {
            case 'random':
                return `🎲 Random x${countText}`;
            default:
                return isNonDestructive ? `Create ${countText} 🔄` : `Make ${countText}`;
        }
    }

    // Utility functions
    parseInteractionCustomId(customId) {
        const parts = customId.split('_');
        return { action: parts[1], actionData: parts.slice(2) };
    }

    parseConfirmAction(actionData) {
        const quantityPart = actionData[actionData.length - 1];
        const ruleId = actionData.slice(0, -1).join('_');
        return { ruleId, quantity: quantityPart };
    }

    async getMaxCombinations(user, ruleId) {
        const rule = await CombinationRule.findOne({ ruleId, isActive: true });
        if (!rule) return 0;
        
        const possibleCombinations = await this.findPossibleCombinationsForRule(user, rule);
        return possibleCombinations.length > 0 ? possibleCombinations[0].maxCombinations : 0;
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

    async handleCancel(interaction) {
        await interaction.deferUpdate();
        await interaction.editReply({ content: '❌ Combination cancelled.', embeds: [], components: [] });
        return true;
    }

    async handleToCollection(interaction) {
        await interaction.deferUpdate();
        const user = await this.getUserForInteraction(interaction);
        if (user) {
            const { default: collectionCommand } = await import('../commands/user/collection.js');
            await collectionCommand.showCollection(interaction, user, 'all', 0);
        } else {
            await interaction.editReply({ content: '❌ Could not load your collection.', embeds: [], components: [] });
        }
        return true;
    }

    async handleToRecipes(interaction) {
        await interaction.deferUpdate();
        await this.showRecipeBook(interaction, 0);
        return true;
    }

    getCombinationType(resultType, isNonDestructive) {
        if (isNonDestructive) return 'Non-Destructive';
        if (resultType === 'choice') return 'Choice';
        if (resultType === 'random') return 'Random';
        return 'Standard';
    }

    getAlertDescription(username, isShadowUnlock, isNonDestructive, resultType) {
        if (isShadowUnlock) return `${username} unlocked the shadow!`;
        if (resultType === 'choice') return `${username} completed a choice combination!`;
        if (resultType === 'random') return `${username} completed a random combination!`;
        if (isNonDestructive) return `${username} completed a non-destructive combination!`;
        return `${username} created a combination!`;
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

    // FIXED: Check if item exists before accessing properties
    isShadowUnlockItem(item) {
        // FIXED: Check if item exists before accessing properties
        if (!item) {
            return false;
        }
        
        return item.itemId === '999' || 
               item.itemName?.toLowerCase().includes('shadow unlock') ||
               item.itemName?.toLowerCase().includes('shadow_unlock');
    }

    getRarityEmoji(rarity) {
        const emojis = { common: '⚪', uncommon: '🟢', rare: '🔵', epic: '🟣', legendary: '🟡', mythic: '🌟' };
        return emojis[rarity] || emojis.common;
    }

    getRarityDisplayName(rarity) {
        const names = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };
        return names[rarity] || 'Unknown';
    }

    getCombinationStats(user) {
        if (!user.gachaCollection) return { totalCombined: 0 };
        const combinedItems = user.gachaCollection.filter(item => item.source === 'combined');
        return { totalCombined: combinedItems.reduce((total, item) => total + (item.quantity || 1), 0) };
    }

    // Additional utility methods for recipe book and other features
    groupRecipesByRarity(recipes) {
        const groups = {};
        recipes.forEach(recipe => {
            const rarity = recipe.resultItems[0]?.rarity || 'common';
            if (!groups[rarity]) groups[rarity] = [];
            groups[rarity].push(recipe);
        });
        return groups;
    }

    sortRecipes(recipes) {
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        return recipes.sort((a, b) => {
            const aRarity = rarityOrder.indexOf(a.resultItems[0]?.rarity);
            const bRarity = rarityOrder.indexOf(b.resultItems[0]?.rarity);
            if (aRarity !== bRarity) return aRarity - bRarity;
            
            const aSeriesId = a.resultItems[0]?.seriesId || 'zzz_individual';
            const bSeriesId = b.resultItems[0]?.seriesId || 'zzz_individual';
            const seriesCompare = aSeriesId.localeCompare(bSeriesId);
            if (seriesCompare !== 0) return seriesCompare;
            
            return a.resultItems[0]?.itemName.localeCompare(b.resultItems[0]?.itemName);
        });
    }

    buildEmptyRecipeBookEmbed() {
        return this.createEmbed('📖 Community Recipe Book', COLORS.INFO,
            '🔍 **No recipes discovered yet!**\n\n' +
            'Be the first to discover a combination recipe!\n' +
            'When you successfully perform a combination, it will be added to this community recipe book for everyone to see.\n\n' +
            '💡 **Tip:** Experiment with different item combinations in `/collection`!'
        ).setFooter({ text: 'The recipe book updates automatically when new combinations are discovered!' });
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

    buildRecipeFooter(totalPages, page, totalRecipes, recipesPerPage) {
        let footerText = totalPages > 1 
            ? `Page ${page + 1}/${totalPages} • ${page * recipesPerPage + 1}-${Math.min((page + 1) * recipesPerPage, totalRecipes)} of ${totalRecipes} recipes`
            : `${totalRecipes} discovered recipes`;
        
        return footerText + ' • 🔄 = Non-Destructive (keeps ingredients) • Recipes update automatically!';
    }

    async getIngredientItems(ingredients) {
        const items = [];
        for (const ingredient of ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                items.push({ ...item.toObject(), quantity: ingredient.quantity });
            }
        }
        return items;
    }

    async getIngredientNames(ingredients) {
        const names = [];
        for (const ingredient of ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                // FIXED: Include emojis in ingredient names for alerts
                const emoji = this.formatItemEmoji(item);
                const quantity = ingredient.quantity || 1;
                if (quantity > 1) {
                    names.push(`${emoji} ${quantity}x ${item.itemName}`);
                } else {
                    names.push(`${emoji} ${item.itemName}`);
                }
            }
        }
        return names;
    }

    async getCurrentChallenge() {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
        return Challenge.findOne({
            date: { $gte: currentMonthStart, $lt: nextMonthStart }
        });
    }

    async sendShadowUnlockAlert(user, challenge, month, year) {
        if (!this.client) return;

        const generalChannelId = config.discord.generalChannelId || '1224834039804334121';
        const guild = await this.client.guilds.fetch(config.discord.guildId);
        const channel = await guild.channels.fetch(generalChannelId);
        
        if (!channel) return;

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const monthName = monthNames[month - 1];

        const embed = this.createEmbed('🌙 SHADOW CHALLENGE REVEALED!', COMBINATION_COLORS.shadow);
        this.setEmbedDescription(embed,
            `**${user.raUsername}** has unlocked the secrets!\n\n` +
            `🔓 The shadow challenge for **${monthName} ${year}** has been revealed!\n\n` +
            `**Shadow Game:** ${challenge.shadow_game_title || 'Mystery Game'}\n\n` +
            `*The hidden challenge emerges from the darkness...*`
        );
        embed.addFields({
            name: '🎯 How to Participate',
            value: `Use \`/challenge\` to view the newly revealed shadow challenge details!`,
            inline: false
        });
        embed.setFooter({ text: `Unlocked by ${user.raUsername} through item combination • The shadow awaits...` });

        if (challenge.shadow_game_icon_url) {
            embed.setThumbnail(`https://retroachievements.org${challenge.shadow_game_icon_url}`);
        }

        await channel.send({ 
            content: `🌙 **BREAKING:** The shadow has been unveiled! 🌙`,
            embeds: [embed] 
        });
    }

    async buildTransferAlertData(recipient, possibleCombinations, giverUsername) {
        let memberTag = `**${recipient.raUsername}**`;
        try {
            if (this.client) {
                const guild = await this.client.guilds.cache.first();
                await guild.members.fetch(recipient.discordId);
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
                await guild.members.fetch(user.discordId);
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
            resultCharacterName = combo.possibleResults[0]?.itemName || 'Unknown';
            thumbnail = combo.possibleResults[0]?.imageUrl;
        }

        return { characterNames, resultCharacterName, thumbnail };
    }

    formatAvailableCombinations(possibleCombinations) {
        const formatted = possibleCombinations.slice(0, 3).map(combo => {
            const resultItem = combo.possibleResults[0];
            // FIXED: Use enhanced emoji formatting
            const resultEmoji = this.formatItemEmoji(resultItem);
            const typeEmoji = RESULT_TYPE_CONFIG[combo.resultType]?.emoji || '';
            const isShadowUnlock = this.isShadowUnlockItem(resultItem);
            const isNonDestructive = combo.rule.isNonDestructive;
            
            let suffix = '';
            if (isShadowUnlock) suffix = ' 🌙';
            else if (combo.resultType === 'choice') suffix = ' 🎯';
            else if (combo.resultType === 'random') suffix = ' 🎲';
            else if (isNonDestructive) suffix = ' 🔄';
            
            return `${resultEmoji} ${resultItem.itemName}${suffix}`;
        }).join('\n');
        
        return formatted + (possibleCombinations.length > 3 ? '\n*...and more!*' : '');
    }

    // Recipe book interaction handlers  
    async handleRecipeBookInteraction(interaction) {
        if (!interaction.customId.startsWith('recipes_')) return false;

        await interaction.deferUpdate();
        const action = interaction.customId.split('_')[1];

        switch (action) {
            case 'refresh':
                await this.showRecipeBook(interaction, 0);
                return true;
            case 'to':
                if (interaction.customId === 'recipes_to_collection') {
                    const user = await this.getUserForInteraction(interaction);
                    if (user) {
                        const { default: collectionCommand } = await import('../commands/user/collection.js');
                        await collectionCommand.showCollection(interaction, user, 'all', 0);
                    }
                }
                return true;
            case 'prev':
            case 'next':
                const currentPageMatch = interaction.customId.match(/recipes_(prev|next)_(\d+)/);
                if (currentPageMatch) {
                    const currentPage = parseInt(currentPageMatch[2]);
                    const newPage = action === 'prev' ? currentPage - 1 : currentPage + 1;
                    await this.showRecipeBook(interaction, newPage);
                }
                return true;
        }
        return false;
    }

    // Legacy methods for backward compatibility
    async handleSelect(interaction, actionData) {
        const ruleId = actionData.join('_');
        const user = await this.getUserForInteraction(interaction);
        if (!user) return true;

        const rule = await CombinationRule.findOne({ ruleId, isActive: true });
        if (!rule) {
            await interaction.editReply({ content: '❌ Combination rule not found.', embeds: [], components: [] });
            return true;
        }

        const possibleCombinations = await this.findPossibleCombinationsForRule(user, rule);
        
        if (possibleCombinations.length > 0) {
            await this.showSingleCombinationConfirmation(interaction, user, possibleCombinations[0]);
        } else {
            await interaction.editReply({ content: '❌ This combination is no longer available.', embeds: [], components: [] });
        }
        return true;
    }

    async handleSelection(interaction) {
        if (!interaction.isStringSelectMenu()) return true;
        
        const selectedValue = interaction.values[0];
        const selectedParts = selectedValue.split('_');
        const selectedRuleId = selectedParts.slice(2).join('_');
        
        const user = await this.getUserForInteraction(interaction);
        if (!user) return true;

        const rule = await CombinationRule.findOne({ ruleId: selectedRuleId, isActive: true });
        if (!rule) {
            await interaction.editReply({ content: '❌ Combination rule not found.', embeds: [], components: [] });
            return true;
        }

        const possibleCombinations = await this.findPossibleCombinationsForRule(user, rule);
        
        if (possibleCombinations.length > 0) {
            await this.showSingleCombinationConfirmation(interaction, user, possibleCombinations[0]);
        } else {
            await interaction.editReply({ content: '❌ This combination is no longer available.', embeds: [], components: [] });
        }
        return true;
    }
}

export default new CombinationService();
