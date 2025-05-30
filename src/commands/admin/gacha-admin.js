// src/commands/admin/gacha-admin.js - Simplified version
import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { GachaItem, CombinationRule } from '../../models/GachaItem.js';
import { User } from '../../models/User.js';
import combinationService from '../../services/combinationService.js';
import gachaService from '../../services/gachaService.js';
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gacha-admin') 
        .setDescription('Admin commands for managing the gacha system')
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-item')
                .setDescription('Add a new gacha item')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Unique item ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Item name')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description') 
                        .setDescription('Item description')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('emoji-input')
                        .setDescription('Discord emoji (paste: <:name:id>)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Item type')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Trinket', value: 'trinket' },
                            { name: 'Collectible', value: 'collectible' },
                            { name: 'Series', value: 'series' },
                            { name: 'Special', value: 'special' },
                            { name: 'Combined', value: 'combined' }
                        ))
                .addStringOption(option =>
                    option.setName('rarity')
                        .setDescription('Item rarity')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Common', value: 'common' },
                            { name: 'Uncommon', value: 'uncommon' },
                            { name: 'Rare', value: 'rare' },
                            { name: 'Epic', value: 'epic' },
                            { name: 'Legendary', value: 'legendary' },
                            { name: 'Mythic', value: 'mythic' }
                        ))
                .addNumberOption(option =>
                    option.setName('drop-rate')
                        .setDescription('Drop rate % (0 = combination-only, >0 = appears in gacha)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100))
                .addStringOption(option =>
                    option.setName('flavor-text')
                        .setDescription('Flavor text (optional)')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('max-stack')
                        .setDescription('Max stack size (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(999))
                .addStringOption(option =>
                    option.setName('series-id')
                        .setDescription('Series ID (optional)')
                        .setRequired(false)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('add-combination')
                .setDescription('Add a combination rule')
                .addStringOption(option =>
                    option.setName('rule-id')
                        .setDescription('Unique rule ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('ingredients')
                        .setDescription('Format: itemId1:qty1,itemId2:qty2 (e.g., green_rupee:5,small_key:1)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('result')
                        .setDescription('Format: itemId:quantity (e.g., blue_rupee:1)')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('automatic')
                        .setDescription('Should this combine automatically? (default: false)')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('priority')
                        .setDescription('Auto-combine priority (higher = combines first, default: 0)')
                        .setRequired(false)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('list-items')
                .setDescription('List gacha items')
                .addStringOption(option =>
                    option.setName('filter')
                        .setDescription('Filter items')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Gacha items (drop rate > 0)', value: 'gacha' },
                            { name: 'Combination-only (drop rate = 0)', value: 'combo' },
                            { name: 'By rarity', value: 'rarity' },
                            { name: 'By series', value: 'series' }
                        )))

        .addSubcommand(subcommand =>
            subcommand
                .setName('list-combinations')
                .setDescription('List combination rules')
                .addStringOption(option =>
                    option.setName('filter')
                        .setDescription('Filter combinations')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Automatic', value: 'auto' },
                            { name: 'Manual', value: 'manual' },
                            { name: 'All', value: 'all' }
                        )))

        .addSubcommand(subcommand =>
            subcommand
                .setName('test-combination')
                .setDescription('Test a combination with a user')
                .addStringOption(option =>
                    option.setName('rule-id')
                        .setDescription('Combination rule ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Username to test with')
                        .setRequired(true)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-item')
                .setDescription('Remove an item')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to remove')
                        .setRequired(true)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-combination')
                .setDescription('Remove a combination rule')
                .addStringOption(option =>
                    option.setName('rule-id')
                        .setDescription('Rule ID to remove')
                        .setRequired(true)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('give-item')
                .setDescription('Give item(s) to a user for testing')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Username')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to give')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('quantity')
                        .setDescription('Quantity (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(100))),

    async execute(interaction) {
        // Check if user is admin
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'add-item':
                    await this.handleAddItem(interaction);
                    break;
                case 'add-combination':
                    await this.handleAddCombination(interaction);
                    break;
                case 'list-items':
                    await this.handleListItems(interaction);
                    break;
                case 'list-combinations':
                    await this.handleListCombinations(interaction);
                    break;
                case 'test-combination':
                    await this.handleTestCombination(interaction);
                    break;
                case 'remove-item':
                    await this.handleRemoveItem(interaction);
                    break;
                case 'remove-combination':
                    await this.handleRemoveCombination(interaction);
                    break;
                case 'give-item':
                    await this.handleGiveItem(interaction);
                    break;
                default:
                    await interaction.editReply('Subcommand not implemented yet.');
            }
        } catch (error) {
            console.error('Error executing gacha admin command:', error);
            await interaction.editReply({
                content: `❌ Error: ${error.message}`
            });
        }
    },

    async handleAddItem(interaction) {
        const emojiInput = interaction.options.getString('emoji-input');
        
        // Extract emoji ID and name
        const emojiMatch = emojiInput.match(/<:([^:]+):(\d+)>/);
        if (!emojiMatch) {
            throw new Error('Invalid emoji format. Please paste like: <:name:123456>');
        }

        const [, emojiName, emojiId] = emojiMatch;
        const dropRate = interaction.options.getNumber('drop-rate');

        const itemData = {
            itemId: interaction.options.getString('item-id'),
            itemName: interaction.options.getString('name'),
            description: interaction.options.getString('description'),
            itemType: interaction.options.getString('type'),
            rarity: interaction.options.getString('rarity'),
            dropRate,
            emojiName,
            emojiId,
            seriesId: interaction.options.getString('series-id'),
            flavorText: interaction.options.getString('flavor-text'),
            maxStack: interaction.options.getInteger('max-stack') || 1,
            createdBy: interaction.user.username
        };

        // Check if item already exists
        const existingItem = await GachaItem.findOne({ itemId: itemData.itemId });
        if (existingItem) {
            throw new Error(`Item "${itemData.itemId}" already exists.`);
        }

        const newItem = new GachaItem(itemData);
        await newItem.save();

        const sourceText = dropRate > 0 ? `Gacha (${dropRate}% drop rate)` : 'Combination only';
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Item Added')
            .setColor(COLORS.SUCCESS)
            .addFields(
                { name: 'Preview', value: `${emojiInput} **${itemData.itemName}**`, inline: false },
                { name: 'ID', value: itemData.itemId, inline: true },
                { name: 'Type', value: itemData.itemType, inline: true },
                { name: 'Rarity', value: itemData.rarity, inline: true },
                { name: 'Source', value: sourceText, inline: true },
                { name: 'Max Stack', value: itemData.maxStack.toString(), inline: true }
            );

        if (itemData.flavorText) {
            embed.addFields({ name: 'Flavor Text', value: `*${itemData.flavorText}*` });
        }
        if (itemData.seriesId) {
            embed.addFields({ name: 'Series', value: itemData.seriesId, inline: true });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleAddCombination(interaction) {
        const ruleData = {
            ruleId: interaction.options.getString('rule-id'),
            isAutomatic: interaction.options.getBoolean('automatic') || false,
            priority: interaction.options.getInteger('priority') || 0,
            createdBy: interaction.user.username
        };

        // Parse ingredients
        const ingredientsStr = interaction.options.getString('ingredients');
        const ingredients = [];
        
        for (const ingredientStr of ingredientsStr.split(',')) {
            const [itemId, qtyStr] = ingredientStr.trim().split(':');
            const quantity = parseInt(qtyStr) || 1;
            
            // Verify item exists
            const item = await GachaItem.findOne({ itemId: itemId.trim() });
            if (!item) {
                throw new Error(`Ingredient item not found: ${itemId}`);
            }
            
            ingredients.push({ itemId: itemId.trim(), quantity });
        }

        // Parse result
        const resultStr = interaction.options.getString('result');
        const [resultItemId, resultQtyStr] = resultStr.split(':');
        const resultQuantity = parseInt(resultQtyStr) || 1;
        
        // Verify result item exists
        const resultItem = await GachaItem.findOne({ itemId: resultItemId.trim() });
        if (!resultItem) {
            throw new Error(`Result item not found: ${resultItemId}`);
        }

        ruleData.ingredients = ingredients;
        ruleData.result = { itemId: resultItemId.trim(), quantity: resultQuantity };

        // Check if rule already exists
        const existingRule = await CombinationRule.findOne({ ruleId: ruleData.ruleId });
        if (existingRule) {
            throw new Error(`Combination rule "${ruleData.ruleId}" already exists.`);
        }

        const newRule = new CombinationRule(ruleData);
        await newRule.save();

        const embed = new EmbedBuilder()
            .setTitle('✅ Combination Rule Added')
            .setColor(COLORS.SUCCESS)
            .addFields(
                { name: 'Rule ID', value: ruleData.ruleId, inline: true },
                { name: 'Type', value: ruleData.isAutomatic ? 'Automatic' : 'Manual', inline: true },
                { name: 'Priority', value: ruleData.priority.toString(), inline: true }
            );

        // Show ingredients
        let ingredientsText = '';
        for (const ing of ingredients) {
            const item = await GachaItem.findOne({ itemId: ing.itemId });
            const emoji = `<:${item.emojiName}:${item.emojiId}>`;
            ingredientsText += `${emoji} ${ing.quantity}x ${item.itemName}\n`;
        }
        embed.addFields({ name: 'Ingredients', value: ingredientsText });

        // Show result
        const resultEmoji = `<:${resultItem.emojiName}:${resultItem.emojiId}>`;
        embed.addFields({ 
            name: 'Result', 
            value: `${resultEmoji} ${resultQuantity}x ${resultItem.itemName}` 
        });

        if (ruleData.isAutomatic) {
            embed.setDescription('⚡ This combination will happen automatically when users have the ingredients!');
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleListItems(interaction) {
        const filter = interaction.options.getString('filter') || 'all';
        
        let query = { isActive: true };
        let title = '📦 All Items';
        
        switch (filter) {
            case 'gacha':
                query.dropRate = { $gt: 0 };
                title = '🎰 Gacha Items';
                break;
            case 'combo':
                query.dropRate = 0;
                title = '🔧 Combination-Only Items';
                break;
        }

        const items = await GachaItem.find(query).sort({ dropRate: -1, rarity: 1, itemName: 1 });

        if (items.length === 0) {
            return interaction.editReply({ content: 'No items found.' });
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(COLORS.INFO)
            .setDescription(`Found ${items.length} items`)
            .setTimestamp();

        // Group by source type
        const gachaItems = items.filter(item => item.dropRate > 0);
        const comboItems = items.filter(item => item.dropRate === 0);

        if (gachaItems.length > 0 && filter !== 'combo') {
            let gachaText = '';
            gachaItems.slice(0, 10).forEach(item => {
                const emoji = `<:${item.emojiName}:${item.emojiId}>`;
                gachaText += `${emoji} **${item.itemName}** (${item.dropRate}%)\n`;
            });
            if (gachaItems.length > 10) {
                gachaText += `\n*...and ${gachaItems.length - 10} more*`;
            }
            embed.addFields({ name: `🎰 Gacha Items (${gachaItems.length})`, value: gachaText });
        }

        if (comboItems.length > 0 && filter !== 'gacha') {
            let comboText = '';
            comboItems.slice(0, 10).forEach(item => {
                const emoji = `<:${item.emojiName}:${item.emojiId}>`;
                comboText += `${emoji} **${item.itemName}** (combination only)\n`;
            });
            if (comboItems.length > 10) {
                comboText += `\n*...and ${comboItems.length - 10} more*`;
            }
            embed.addFields({ name: `🔧 Combination Items (${comboItems.length})`, value: comboText });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleListCombinations(interaction) {
        const filter = interaction.options.getString('filter') || 'all';
        
        let query = { isActive: true };
        if (filter === 'auto') {
            query.isAutomatic = true;
        } else if (filter === 'manual') {
            query.isAutomatic = false;
        }

        const rules = await CombinationRule.find(query).sort({ priority: -1, ruleId: 1 });

        if (rules.length === 0) {
            return interaction.editReply({ content: 'No combination rules found.' });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔧 Combination Rules ${filter !== 'all' ? `(${filter})` : ''}`)
            .setColor(COLORS.INFO)
            .setDescription(`Found ${rules.length} rules`)
            .setTimestamp();

        // Show rules
        let rulesText = '';
        for (const rule of rules.slice(0, 8)) {
            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            const resultEmoji = resultItem ? `<:${resultItem.emojiName}:${resultItem.emojiId}>` : '❓';
            const typeIcon = rule.isAutomatic ? '⚡' : '🔧';
            
            rulesText += `${typeIcon} **${rule.ruleId}**\n`;
            rulesText += `   ${rule.ingredients.length} ingredients → ${resultEmoji} ${rule.result.quantity}x ${resultItem?.itemName || 'Unknown'}\n`;
        }
        
        if (rules.length > 8) {
            rulesText += `\n*...and ${rules.length - 8} more rules*`;
        }

        embed.addFields({ name: 'Rules', value: rulesText });
        embed.setFooter({ text: '⚡ = Automatic, 🔧 = Manual' });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleTestCombination(interaction) {
        const ruleId = interaction.options.getString('rule-id');
        const username = interaction.options.getString('username');

        const user = await User.findOne({ raUsername: username });
        if (!user) {
            throw new Error(`User "${username}" not found.`);
        }

        const preview = await combinationService.previewCombination(user, ruleId);
        if (!preview.success) {
            throw new Error(preview.error);
        }

        const embed = new EmbedBuilder()
            .setTitle(`🧪 Combination Test: ${ruleId}`)
            .setColor(preview.canMake ? COLORS.SUCCESS : COLORS.WARNING)
            .addFields(
                { name: 'User', value: username, inline: true },
                { name: 'Can Make', value: preview.canMake ? '✅ Yes' : '❌ No', inline: true },
                { name: 'Type', value: preview.isAutomatic ? 'Automatic' : 'Manual', inline: true }
            );

        // Show ingredients status
        let ingredientsText = '';
        for (const ingredient of preview.rule.ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            const userItem = user.gachaCollection?.find(i => i.itemId === ingredient.itemId);
            const have = userItem ? (userItem.quantity || 1) : 0;
            const status = have >= ingredient.quantity ? '✅' : '❌';
            const emoji = item ? `<:${item.emojiName}:${item.emojiId}>` : '❓';
            
            ingredientsText += `${status} ${emoji} ${ingredient.quantity}x (have: ${have})\n`;
        }
        embed.addFields({ name: 'Ingredients', value: ingredientsText });

        // Show result
        const resultEmoji = `<:${preview.resultItem.emojiName}:${preview.resultItem.emojiId}>`;
        embed.addFields({ 
            name: 'Result', 
            value: `${resultEmoji} ${preview.rule.result.quantity}x ${preview.resultItem.itemName}` 
        });

        // Show what's missing if can't make
        if (!preview.canMake && preview.missing.length > 0) {
            let missingText = '';
            for (const missing of preview.missing) {
                const item = await GachaItem.findOne({ itemId: missing.itemId });
                const emoji = item ? `<:${item.emojiName}:${item.emojiId}>` : '❓';
                missingText += `${emoji} Need ${missing.shortage} more ${item?.itemName || missing.itemId}\n`;
            }
            embed.addFields({ name: 'Missing', value: missingText });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleRemoveItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        const item = await GachaItem.findOneAndDelete({ itemId });
        
        if (!item) {
            throw new Error(`Item "${itemId}" not found.`);
        }

        await interaction.editReply({
            content: `✅ Removed item: **${item.itemName}** (${itemId})`
        });
    },

    async handleRemoveCombination(interaction) {
        const ruleId = interaction.options.getString('rule-id');
        const rule = await CombinationRule.findOneAndDelete({ ruleId });
        
        if (!rule) {
            throw new Error(`Combination rule "${ruleId}" not found.`);
        }

        await interaction.editReply({
            content: `✅ Removed combination rule: **${ruleId}**`
        });
    },

    async handleGiveItem(interaction) {
        const username = interaction.options.getString('username');
        const itemId = interaction.options.getString('item-id');
        const quantity = interaction.options.getInteger('quantity') || 1;

        const user = await User.findOne({ raUsername: username });
        if (!user) {
            throw new Error(`User "${username}" not found.`);
        }

        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            throw new Error(`Item "${itemId}" not found.`);
        }

        // Add item to user's collection
        combinationService.addItemToUser(user, item, quantity);
        await user.save();

        // Check for auto-combinations
        const autoCombinations = await combinationService.checkAutoCombinations(user);

        const emoji = `<:${item.emojiName}:${item.emojiId}>`;
        let message = `✅ Gave ${emoji} ${quantity}x **${item.itemName}** to ${username}`;

        if (autoCombinations.length > 0) {
            message += `\n\n⚡ **Auto-combinations triggered:**\n`;
            for (const combo of autoCombinations) {
                const resultEmoji = `<:${combo.resultItem.emojiName}:${combo.resultItem.emojiId}>`;
                message += `${resultEmoji} ${combo.resultQuantity}x ${combo.resultItem.itemName}\n`;
            }
        }

        await interaction.editReply({ content: message });
    }
};
