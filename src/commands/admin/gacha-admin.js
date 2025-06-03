// src/commands/admin/gacha-admin.js - COMPLETE FIXED VERSION with paginated combinations
import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
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
                .setName('list-items')
                .setDescription('List all gacha items with IDs (paginated)')
                .addIntegerOption(option =>
                    option.setName('page')
                        .setDescription('Page number (default: 1)')
                        .setMinValue(1)
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('filter')
                        .setDescription('Filter items')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All items', value: 'all' },
                            { name: 'Gacha items (drop rate > 0)', value: 'gacha' },
                            { name: 'Combination-only (drop rate = 0)', value: 'combo' }
                        )))

        .addSubcommand(subcommand =>
            subcommand
                .setName('add-combination')
                .setDescription('Add a combination rule (requires confirmation)'))

        .addSubcommand(subcommand =>
            subcommand
                .setName('list-combinations')
                .setDescription('List all combination rules (paginated)')
                .addIntegerOption(option =>
                    option.setName('page')
                        .setDescription('Page number (default: 1)')
                        .setMinValue(1)
                        .setRequired(false)))

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
                .setName('debug-combination')
                .setDescription('Debug a specific combination rule')
                .addStringOption(option =>
                    option.setName('rule-id')
                        .setDescription('Rule ID to debug')
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
                        .setMaxValue(100)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('clear-collection')
                .setDescription('Clear a user\'s gacha collection')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Username to clear collection for')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('confirm')
                        .setDescription('Confirm you want to clear the collection (required)')
                        .setRequired(true)))

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
                        .setRequired(false))),

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
                case 'list-items':
                    await this.handleListItems(interaction);
                    break;
                case 'add-combination':
                    await this.handleAddCombination(interaction);
                    break;
                case 'list-combinations':
                    await this.handleListCombinations(interaction);
                    break;
                case 'remove-combination':
                    await this.handleRemoveCombination(interaction);
                    break;
                case 'debug-combination':
                    await this.handleDebugCombination(interaction);
                    break;
                case 'give-item':
                    await this.handleGiveItem(interaction);
                    break;
                case 'clear-collection':
                    await this.handleClearCollection(interaction);
                    break;
                case 'add-item':
                    await this.handleAddItem(interaction);
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

    async handleListItems(interaction) {
        const page = interaction.options.getInteger('page') || 1;
        const filter = interaction.options.getString('filter') || 'all';
        const itemsPerPage = 15;

        let query = { isActive: true };
        let title = '📦 All Gacha Items';
        
        switch (filter) {
            case 'gacha':
                query.dropRate = { $gt: 0 };
                title = '🎰 Gacha Items (Drop Rate > 0)';
                break;
            case 'combo':
                query.dropRate = 0;
                title = '🔧 Combination-Only Items';
                break;
        }

        const totalItems = await GachaItem.countDocuments(query);
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const skip = (page - 1) * itemsPerPage;

        const items = await GachaItem.find(query)
            .skip(skip)
            .limit(itemsPerPage);

        items.sort((a, b) => {
            const aNum = parseInt(a.itemId) || 0;
            const bNum = parseInt(b.itemId) || 0;
            return aNum - bNum;
        });

        if (items.length === 0) {
            return interaction.editReply({ content: 'No items found.' });
        }

        const embed = new EmbedBuilder()
            .setTitle(`${title} - Page ${page}/${totalPages}`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        let itemsList = '';
        
        items.forEach(item => {
            const id = item.itemId.length > 15 ? 
                item.itemId.substring(0, 12) + '...' : 
                item.itemId;
            const name = item.itemName.length > 20 ? 
                item.itemName.substring(0, 17) + '...' : 
                item.itemName;
            const rarity = item.rarity.charAt(0).toUpperCase();
            
            itemsList += `**${id}** - ${name} (${rarity}, ${item.dropRate}%)\n`;
        });

        embed.setDescription(`Showing ${items.length} items (${totalItems} total)\n\n${itemsList}`);

        const components = [];
        if (totalPages > 1) {
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`gacha_list_${Math.max(1, page - 1)}_${filter}`)
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId(`page_info`)
                        .setLabel(`Page ${page}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`gacha_list_${Math.min(totalPages, page + 1)}_${filter}`)
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages)
                );
            components.push(buttonRow);
        }

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha_add_combination')
                    .setLabel('➕ Add Combination')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('gacha_list_combinations')
                    .setLabel('📋 List Combinations')
                    .setStyle(ButtonStyle.Secondary)
            );
        components.push(actionRow);

        embed.setFooter({ 
            text: 'Copy the Item ID (bolded text) when creating combinations' 
        });

        await interaction.editReply({ embeds: [embed], components });
    },

    async handleAddCombination(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('gacha_add_combo_modal')
            .setTitle('Add Combination Rule');

        const formatInput = new TextInputBuilder()
            .setCustomId('combo_format')
            .setLabel('Combination Rule')
            .setPlaceholder('025x5 = 107 OR 001 + 003 = 999')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const ruleIdInput = new TextInputBuilder()
            .setCustomId('rule_id')
            .setLabel('Rule ID (optional - will auto-generate)')
            .setPlaceholder('Leave empty for auto-generation')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const priorityInput = new TextInputBuilder()
            .setCustomId('priority')
            .setLabel('Priority (0-100, higher = combines first)')
            .setPlaceholder('10')
            .setValue('10')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(formatInput),
            new ActionRowBuilder().addComponents(ruleIdInput),
            new ActionRowBuilder().addComponents(priorityInput)
        );

        await interaction.showModal(modal);
    },

    async handleCombinationModal(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const comboFormat = interaction.fields.getTextInputValue('combo_format');
        const ruleId = interaction.fields.getTextInputValue('rule_id') || 
            `combo_${Date.now()}`;
        const priority = parseInt(interaction.fields.getTextInputValue('priority')) || 10;

        try {
            const parsed = await this.parseSimpleCombination(comboFormat);
            
            // Validate all items exist
            for (const ingredient of parsed.ingredients) {
                const item = await GachaItem.findOne({ itemId: ingredient.itemId });
                if (!item) {
                    throw new Error(`Ingredient item not found: ${ingredient.itemId}`);
                }
            }

            const resultItem = await GachaItem.findOne({ itemId: parsed.result.itemId });
            if (!resultItem) {
                throw new Error(`Result item not found: ${parsed.result.itemId}`);
            }

            const existingRule = await CombinationRule.findOne({ ruleId });
            if (existingRule) {
                throw new Error(`Rule ID "${ruleId}" already exists.`);
            }

            const newRule = new CombinationRule({
                ruleId,
                ingredients: parsed.ingredients,
                result: parsed.result,
                isAutomatic: false,
                priority,
                createdBy: interaction.user.username
            });

            await newRule.save();

            const embed = new EmbedBuilder()
                .setTitle('✅ Combination Rule Added')
                .setColor(COLORS.SUCCESS)
                .addFields(
                    { name: 'Rule ID', value: ruleId, inline: true },
                    { name: 'Priority', value: priority.toString(), inline: true },
                    { name: 'Format', value: `\`${comboFormat}\``, inline: false }
                );

            let ingredientsText = '';
            for (const ing of parsed.ingredients) {
                const item = await GachaItem.findOne({ itemId: ing.itemId });
                const emoji = item ? `<:${item.emojiName}:${item.emojiId}>` : '❓';
                ingredientsText += `${emoji} ${ing.quantity}x **${item?.itemName || ing.itemId}**\n`;
            }
            embed.addFields({ name: 'Ingredients', value: ingredientsText });

            const resultEmoji = resultItem ? `<:${resultItem.emojiName}:${resultItem.emojiId}>` : '❓';
            embed.addFields({ 
                name: 'Result', 
                value: `${resultEmoji} ${parsed.result.quantity}x **${resultItem?.itemName || parsed.result.itemId}**` 
            });

            embed.setDescription('⚗️ This combination will show confirmation prompts when users have the ingredients!');

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error creating combination:', error);
            await interaction.editReply({
                content: `❌ Error creating combination: ${error.message}\n\n**Format Examples:**\n` +
                         `• \`025x5 = 107\` (5 items with ID 025 make 1 item with ID 107)\n` +
                         `• \`001 + 003 = 999\` (item 001 + item 003 make item 999)\n` +
                         `• \`010x3 + 020x2 = 030x5\` (3 of item 010 + 2 of item 020 = 5 of item 030)\n` +
                         `• \`item1 + item2 + item3 = special_item\` (multiple ingredients)\n\n` +
                         `**Format Rules:**\n` +
                         `• Use \`itemIDx#\` for quantities (e.g., \`025x5\` = 5 of item 025)\n` +
                         `• Use \`+\` or \`,\` to separate multiple ingredients\n` +
                         `• Use \`=\` to separate ingredients from result (preferred)\n` +
                         `• \`->\` also works but \`=\` is preferred\n` +
                         `• If no quantity specified, defaults to 1`
            });
        }
    },

    async parseSimpleCombination(format) {
        format = format.trim();

        let separator = '=';
        if (format.includes(' = ')) {
            separator = ' = ';
        } else if (format.includes('=')) {
            separator = '=';
        } else if (format.includes(' -> ')) {
            separator = ' -> ';
        } else if (format.includes('->')) {
            separator = '->';
        } else {
            throw new Error('Format must use = or -> as separator (e.g., "025x5 = 107")');
        }

        const parts = format.split(separator);
        if (parts.length !== 2) {
            throw new Error('Format must be: ingredients = result (e.g., "025x5 = 107")');
        }

        const ingredientsPart = parts[0].trim();
        const resultPart = parts[1].trim();

        const ingredients = [];
        const ingredientItems = ingredientsPart.split(/[+,]/).map(s => s.trim());

        for (const item of ingredientItems) {
            if (item.includes('x')) {
                const [itemId, quantityStr] = item.split('x');
                const quantity = parseInt(quantityStr) || 1;
                ingredients.push({ itemId: itemId.trim(), quantity });
            } else if (item.includes(':')) {
                const [itemId, quantityStr] = item.split(':');
                const quantity = parseInt(quantityStr) || 1;
                ingredients.push({ itemId: itemId.trim(), quantity });
            } else {
                ingredients.push({ itemId: item.trim(), quantity: 1 });
            }
        }

        let result;
        if (resultPart.includes('x')) {
            const [itemId, quantityStr] = resultPart.split('x');
            const quantity = parseInt(quantityStr) || 1;
            result = { itemId: itemId.trim(), quantity };
        } else if (resultPart.includes(':')) {
            const [itemId, quantityStr] = resultPart.split(':');
            const quantity = parseInt(quantityStr) || 1;
            result = { itemId: itemId.trim(), quantity };
        } else {
            result = { itemId: resultPart.trim(), quantity: 1 };
        }

        return { ingredients, result };
    },

    // UPDATED: Now with pagination!
    async handleListCombinations(interaction) {
        const page = interaction.options.getInteger('page') || 1;
        const rulesPerPage = 8; // Fewer per page since combinations take more space

        const totalRules = await CombinationRule.countDocuments({ isActive: true });
        const totalPages = Math.ceil(totalRules / rulesPerPage);
        const skip = (page - 1) * rulesPerPage;

        const rules = await CombinationRule.find({ isActive: true })
            .sort({ priority: -1, ruleId: 1 })
            .skip(skip)
            .limit(rulesPerPage);

        if (rules.length === 0) {
            return interaction.editReply({ content: 'No combination rules found.' });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚗️ Combination Rules - Page ${page}/${totalPages}`)
            .setColor(COLORS.INFO)
            .setDescription(`Showing ${rules.length} rules (${totalRules} total)`)
            .setTimestamp();

        let rulesText = '';
        for (const rule of rules) {
            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            const resultEmoji = resultItem ? `<:${resultItem.emojiName}:${resultItem.emojiId}>` : '❓';
            
            rulesText += `**${rule.ruleId}** (Priority: ${rule.priority})\n`;
            
            const ingredientStrs = rule.ingredients.map(ing => 
                ing.quantity > 1 ? `${ing.itemId}x${ing.quantity}` : ing.itemId
            );
            
            rulesText += `${ingredientStrs.join(' + ')} = ${resultEmoji} ${resultItem?.itemName || rule.result.itemId}${rule.result.quantity > 1 ? ` (x${rule.result.quantity})` : ''}\n\n`;
        }

        embed.addFields({ name: 'Rules', value: rulesText });
        embed.setFooter({ text: 'All combinations require user confirmation' });

        const components = [];
        
        // Add pagination buttons if there are multiple pages
        if (totalPages > 1) {
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`gacha_combo_${Math.max(1, page - 1)}`)
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId(`combo_page_info`)
                        .setLabel(`Page ${page}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`gacha_combo_${Math.min(totalPages, page + 1)}`)
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages)
                );
            components.push(buttonRow);
        }

        // Add action buttons
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha_add_combination')
                    .setLabel('➕ Add Combination')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('gacha_list_items_from_combo')
                    .setLabel('📦 List Items')
                    .setStyle(ButtonStyle.Secondary)
            );
        components.push(actionRow);

        await interaction.editReply({ embeds: [embed], components });
    },

    // UPDATED: Handle pagination for combinations from button clicks
    async handleListCombinationsFromButton(interaction, page = 1) {
        const rulesPerPage = 8;

        const totalRules = await CombinationRule.countDocuments({ isActive: true });
        const totalPages = Math.ceil(totalRules / rulesPerPage);
        const skip = (page - 1) * rulesPerPage;

        const rules = await CombinationRule.find({ isActive: true })
            .sort({ priority: -1, ruleId: 1 })
            .skip(skip)
            .limit(rulesPerPage);

        if (rules.length === 0) {
            return interaction.editReply({ 
                content: 'No combination rules found.',
                embeds: [],
                components: []
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚗️ Combination Rules - Page ${page}/${totalPages}`)
            .setColor(COLORS.INFO)
            .setDescription(`Showing ${rules.length} rules (${totalRules} total)`)
            .setTimestamp();

        let rulesText = '';
        for (const rule of rules) {
            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            const resultEmoji = resultItem ? `<:${resultItem.emojiName}:${resultItem.emojiId}>` : '❓';
            
            rulesText += `**${rule.ruleId}** (Priority: ${rule.priority})\n`;
            
            const ingredientStrs = rule.ingredients.map(ing => 
                ing.quantity > 1 ? `${ing.itemId}x${ing.quantity}` : ing.itemId
            );
            
            rulesText += `${ingredientStrs.join(' + ')} = ${resultEmoji} ${resultItem?.itemName || rule.result.itemId}${rule.result.quantity > 1 ? ` (x${rule.result.quantity})` : ''}\n\n`;
        }

        embed.addFields({ name: 'Rules', value: rulesText });
        embed.setFooter({ text: 'All combinations require user confirmation' });

        const components = [];
        
        // Add pagination buttons if there are multiple pages
        if (totalPages > 1) {
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`gacha_combo_${Math.max(1, page - 1)}`)
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId(`combo_page_info`)
                        .setLabel(`Page ${page}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`gacha_combo_${Math.min(totalPages, page + 1)}`)
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages)
                );
            components.push(buttonRow);
        }

        // Add action buttons
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha_add_combination')
                    .setLabel('➕ Add Combination')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('gacha_list_items_from_combo')
                    .setLabel('📦 List Items')
                    .setStyle(ButtonStyle.Secondary)
            );
        components.push(actionRow);

        await interaction.editReply({ embeds: [embed], components });
    },

    async handleListItemsPagination(interaction, page, filter) {
        const itemsPerPage = 15;

        let query = { isActive: true };
        let title = '📦 All Gacha Items';
        
        switch (filter) {
            case 'gacha':
                query.dropRate = { $gt: 0 };
                title = '🎰 Gacha Items (Drop Rate > 0)';
                break;
            case 'combo':
                query.dropRate = 0;
                title = '🔧 Combination-Only Items';
                break;
        }

        const totalItems = await GachaItem.countDocuments(query);
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const skip = (page - 1) * itemsPerPage;

        const items = await GachaItem.find(query)
            .skip(skip)
            .limit(itemsPerPage);

        items.sort((a, b) => {
            const aNum = parseInt(a.itemId) || 0;
            const bNum = parseInt(b.itemId) || 0;
            return aNum - bNum;
        });

        if (items.length === 0) {
            return interaction.editReply({ 
                content: 'No items found.',
                embeds: [],
                components: []
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`${title} - Page ${page}/${totalPages}`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        let itemsList = '';
        
        items.forEach(item => {
            const id = item.itemId.length > 15 ? 
                item.itemId.substring(0, 12) + '...' : 
                item.itemId;
            const name = item.itemName.length > 20 ? 
                item.itemName.substring(0, 17) + '...' : 
                item.itemName;
            const rarity = item.rarity.charAt(0).toUpperCase();
            
            itemsList += `**${id}** - ${name} (${rarity}, ${item.dropRate}%)\n`;
        });

        embed.setDescription(`Showing ${items.length} items (${totalItems} total)\n\n${itemsList}`);

        const components = [];
        if (totalPages > 1) {
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`gacha_list_${Math.max(1, page - 1)}_${filter}`)
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1),
                    new ButtonBuilder()
                        .setCustomId(`page_info`)
                        .setLabel(`Page ${page}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`gacha_list_${Math.min(totalPages, page + 1)}_${filter}`)
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages)
                );
            components.push(buttonRow);
        }

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha_add_combination')
                    .setLabel('➕ Add Combination')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('gacha_list_combinations')
                    .setLabel('📋 List Combinations')
                    .setStyle(ButtonStyle.Secondary)
            );
        components.push(actionRow);

        embed.setFooter({ 
            text: 'Copy the Item ID (bolded text) when creating combinations' 
        });

        await interaction.editReply({ embeds: [embed], components });
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

    async handleDebugCombination(interaction) {
        const ruleId = interaction.options.getString('rule-id');
        
        const rule = await CombinationRule.findOne({ ruleId, isActive: true });
        if (!rule) {
            return interaction.editReply({
                content: `❌ Combination rule "${ruleId}" not found.`
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Debug: ${ruleId}`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        embed.addFields(
            { name: 'Rule ID', value: rule.ruleId, inline: true },
            { name: 'Priority', value: rule.priority?.toString() || '0', inline: true },
            { name: 'Requires Confirmation', value: 'Yes', inline: true }
        );

        let ingredientsText = '';
        let ingredientsValid = true;
        
        for (const ingredient of rule.ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                const emoji = `<:${item.emojiName}:${item.emojiId}>`;
                ingredientsText += `${emoji} **${ingredient.quantity}x ${item.itemName}** (ID: ${ingredient.itemId})\n`;
                ingredientsText += `  └ Rarity: ${item.rarity}, Drop Rate: ${item.dropRate}%\n`;
            } else {
                ingredientsText += `❌ **${ingredient.quantity}x MISSING ITEM** (ID: ${ingredient.itemId})\n`;
                ingredientsValid = false;
            }
        }
        
        embed.addFields({ name: 'Ingredients', value: ingredientsText || 'None' });

        const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
        let resultText = '';
        if (resultItem) {
            const emoji = `<:${resultItem.emojiName}:${resultItem.emojiId}>`;
            resultText = `${emoji} **${rule.result.quantity || 1}x ${resultItem.itemName}** (ID: ${rule.result.itemId})\n`;
            resultText += `└ Rarity: ${resultItem.rarity}, Drop Rate: ${resultItem.dropRate}%`;
        } else {
            resultText = `❌ **MISSING RESULT ITEM** (ID: ${rule.result.itemId})`;
            ingredientsValid = false;
        }
        
        embed.addFields({ name: 'Result', value: resultText });

        const validationText = ingredientsValid ? 
            '✅ All items exist and rule is valid' : 
            '❌ Some items are missing - rule will not work';
        
        embed.addFields({ name: 'Validation', value: validationText });

        const exampleIngredients = rule.ingredients.map(ing => 
            ing.quantity > 1 ? `${ing.itemId}x${ing.quantity}` : ing.itemId
        ).join(' + ');
        
        const exampleResult = rule.result.quantity > 1 ? 
            `${rule.result.itemId}x${rule.result.quantity}` : 
            rule.result.itemId;
        
        embed.addFields({ 
            name: 'Rule Format', 
            value: `\`${exampleIngredients} = ${exampleResult}\`` 
        });

        if (rule.createdBy) {
            embed.setFooter({ text: `Created by: ${rule.createdBy}` });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleGiveItem(interaction) {
        const username = interaction.options.getString('username');
        const itemId = interaction.options.getString('item-id');
        const quantity = interaction.options.getInteger('quantity') || 1;

        const user = await User.findOne({ 
            raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
        });
        if (!user) {
            throw new Error(`User "${username}" not found.`);
        }

        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            throw new Error(`Item "${itemId}" not found.`);
        }

        const addResult = user.addGachaItem(item, quantity, 'admin_grant');
        await user.save();

        const emoji = `<:${item.emojiName}:${item.emojiId}>`;
        
        const combinationResult = await combinationService.triggerCombinationAlertsForAdminGift(user, itemId, interaction);

        let message = `✅ Gave ${emoji} ${quantity}x **${item.itemName}** to ${username}`;

        if (combinationResult.hasCombinations) {
            message += `\n\n⚗️ **Combination Alerts Sent!**\n`;
            message += `${username} now has ${combinationResult.combinationCount} combination option(s) available!`;
            
            if (combinationResult.publicAnnouncementSent && combinationResult.sentViaDM) {
                message += '\n• Public announcement posted in gacha channel\n• Private combination options sent via DM';
            } else if (combinationResult.sentViaDM) {
                message += '\n• Private combination options sent via DM';
            } else if (combinationResult.publicAnnouncementSent) {
                message += '\n• Public announcement posted in gacha channel';
            }
            
            if (combinationResult.error) {
                message += `\n• Note: ${combinationResult.error}`;
            }
        } else if (combinationResult.error) {
            message += `\n\n⚠️ Item given successfully, but there was an issue with combination alerts: ${combinationResult.error}`;
        } else {
            message += `\n\n💡 No combinations available with this item.`;
        }

        await interaction.editReply({ content: message });
    },

    async handleClearCollection(interaction) {
        const username = interaction.options.getString('username');
        const confirm = interaction.options.getBoolean('confirm');

        if (!confirm) {
            throw new Error('You must set confirm to true to clear a collection.');
        }

        const user = await User.findOne({ 
            raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
        });

        if (!user) {
            throw new Error(`User "${username}" not found.`);
        }

        const collectionSize = user.gachaCollection?.length || 0;
        const totalItems = user.gachaCollection?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;

        if (collectionSize === 0) {
            return interaction.editReply({
                content: `❌ User "${username}" already has an empty collection.`
            });
        }

        user.gachaCollection = [];
        await user.save();

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Collection Cleared')
            .setColor(COLORS.WARNING)
            .setDescription(`Cleared collection for **${username}**`)
            .addFields(
                { name: 'Unique Items Removed', value: collectionSize.toString(), inline: true },
                { name: 'Total Items Removed', value: totalItems.toString(), inline: true },
                { name: 'Collection Size Now', value: '0', inline: true }
            )
            .setFooter({ text: `Cleared by ${interaction.user.username}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleAddItem(interaction) {
        const emojiInput = interaction.options.getString('emoji-input');
        
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
            flavorText: interaction.options.getString('flavor-text'),
            maxStack: interaction.options.getInteger('max-stack') || 1,
            seriesId: interaction.options.getString('series-id'),
            createdBy: interaction.user.username
        };

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

    async handleButtonInteraction(interaction) {
        if (!interaction.customId.startsWith('gacha_')) return;

        if (interaction.customId === 'gacha_add_combination') {
            await this.handleAddCombination(interaction);
            return;
        }

        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }
        } catch (error) {
            console.log('Interaction already handled, continuing...');
        }

        if (interaction.customId === 'gacha_list_combinations') {
            await this.handleListCombinationsFromButton(interaction, 1);
        } else if (interaction.customId.startsWith('gacha_combo_')) {
            // Handle combination pagination
            const page = parseInt(interaction.customId.split('_')[2]);
            await this.handleListCombinationsFromButton(interaction, page);
        } else if (interaction.customId.startsWith('gacha_list_')) {
            // Handle item pagination
            const parts = interaction.customId.split('_');
            const page = parseInt(parts[2]);
            const filter = parts[3];
            
            await this.handleListItemsPagination(interaction, page, filter);
        } else if (interaction.customId === 'gacha_list_items_from_combo') {
            // Navigate to items list from combinations page
            await this.handleListItemsPagination(interaction, 1, 'all');
        }
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId === 'gacha_add_combo_modal') {
            await this.handleCombinationModal(interaction);
        }
    }
};
