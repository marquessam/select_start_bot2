// src/commands/admin/gacha-admin.js - COMPLETE FIXED VERSION with all updates
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
                .setDescription('Add an AUTOMATIC combination rule'))

        .addSubcommand(subcommand =>
            subcommand
                .setName('list-combinations')
                .setDescription('List all automatic combination rules'))

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
                        .setMaxValue(999))),

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
        const itemsPerPage = 15; // REDUCED from 20 to avoid character limits

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

        // FIXED: Sort items numerically by ID
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

        // Create a shorter, more compact format to avoid character limits
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

        // Use description instead of fields to avoid 1024 char limit on fields
        embed.setDescription(`Showing ${items.length} items (${totalItems} total)\n\n${itemsList}`);

        // Add navigation buttons if needed
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

        // Add action buttons
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

    // FIXED: Updated handleAddCombination with shorter placeholder
    async handleAddCombination(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('gacha_add_combo_modal')
            .setTitle('Add Automatic Combination');

        // FIXED: Shortened placeholder to under 100 characters
        const formatInput = new TextInputBuilder()
            .setCustomId('combo_format')
            .setLabel('Combination Rule')
            .setPlaceholder('small_key:5 -> boss_key OR mario + luigi -> shadow_unlock')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        // Rule ID (auto-generated if empty)
        const ruleIdInput = new TextInputBuilder()
            .setCustomId('rule_id')
            .setLabel('Rule ID (optional - will auto-generate)')
            .setPlaceholder('Leave empty for auto-generation')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        // Priority for auto-combine order
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

            // Check if rule already exists
            const existingRule = await CombinationRule.findOne({ ruleId });
            if (existingRule) {
                throw new Error(`Rule ID "${ruleId}" already exists.`);
            }

            // Create the combination rule
            const newRule = new CombinationRule({
                ruleId,
                ingredients: parsed.ingredients,
                result: parsed.result,
                isAutomatic: true, // All combinations are automatic now
                priority,
                createdBy: interaction.user.username
            });

            await newRule.save();

            // Create success embed
            const embed = new EmbedBuilder()
                .setTitle('✅ Automatic Combination Added')
                .setColor(COLORS.SUCCESS)
                .addFields(
                    { name: 'Rule ID', value: ruleId, inline: true },
                    { name: 'Priority', value: priority.toString(), inline: true },
                    { name: 'Format', value: `\`${comboFormat}\``, inline: false }
                );

            // Show ingredients and result
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

            embed.setDescription('⚡ This combination will happen automatically when users have the ingredients!');

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error creating combination:', error);
            // UPDATED: Better error message with more examples
            await interaction.editReply({
                content: `❌ Error creating combination: ${error.message}\n\n**Format Examples:**\n` +
                         `• \`small_key:5 -> boss_key\` (5 small keys make 1 boss key)\n` +
                         `• \`mario + luigi -> shadow_unlock\` (mario + luigi make shadow_unlock)\n` +
                         `• \`green_rupee:10 -> blue_rupee:2\` (10 green rupees make 2 blue rupees)\n` +
                         `• \`item1 + item2 + item3 -> special_item\` (multiple ingredients)\n\n` +
                         `**Format Rules:**\n` +
                         `• Use \`item_id:quantity\` for specific amounts\n` +
                         `• Use \`+\` or \`,\` to separate ingredients\n` +
                         `• Use \`->\` or \`=\` to separate ingredients from result`
            });
        }
    },

    async parseSimpleCombination(format) {
        // Remove extra whitespace
        format = format.trim();

        // Support both -> and = as separators
        let separator = '->';
        if (format.includes(' = ')) separator = ' = ';
        else if (format.includes('=')) separator = '=';

        const parts = format.split(separator);
        if (parts.length !== 2) {
            throw new Error('Format must be: ingredients -> result');
        }

        const ingredientsPart = parts[0].trim();
        const resultPart = parts[1].trim();

        // Parse ingredients (support both + and , as separators)
        const ingredients = [];
        const ingredientItems = ingredientsPart.split(/[+,]/).map(s => s.trim());

        for (const item of ingredientItems) {
            if (item.includes(':')) {
                // Format: item_id:quantity
                const [itemId, quantityStr] = item.split(':');
                const quantity = parseInt(quantityStr) || 1;
                ingredients.push({ itemId: itemId.trim(), quantity });
            } else {
                // Format: item_id (quantity defaults to 1)
                ingredients.push({ itemId: item.trim(), quantity: 1 });
            }
        }

        // Parse result
        let result;
        if (resultPart.includes(':')) {
            const [itemId, quantityStr] = resultPart.split(':');
            const quantity = parseInt(quantityStr) || 1;
            result = { itemId: itemId.trim(), quantity };
        } else {
            result = { itemId: resultPart.trim(), quantity: 1 };
        }

        return { ingredients, result };
    },

    async handleListCombinations(interaction) {
        const rules = await CombinationRule.find({ isActive: true })
            .sort({ priority: -1, ruleId: 1 });

        if (rules.length === 0) {
            return interaction.editReply({ content: 'No combination rules found.' });
        }

        const embed = new EmbedBuilder()
            .setTitle('⚡ Automatic Combination Rules')
            .setColor(COLORS.INFO)
            .setDescription(`Found ${rules.length} active rules`)
            .setTimestamp();

        let rulesText = '';
        for (const rule of rules.slice(0, 10)) {
            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            const resultEmoji = resultItem ? `<:${resultItem.emojiName}:${resultItem.emojiId}>` : '❓';
            
            rulesText += `**${rule.ruleId}** (Priority: ${rule.priority})\n`;
            
            // Show ingredients in simple format
            const ingredientStrs = rule.ingredients.map(ing => 
                `${ing.quantity > 1 ? ing.quantity : ''}${ing.itemId}`
            );
            rulesText += `${ingredientStrs.join(' + ')} → ${resultEmoji} ${rule.result.quantity}x ${resultItem?.itemName || rule.result.itemId}\n\n`;
        }
        
        if (rules.length > 10) {
            rulesText += `*...and ${rules.length - 10} more rules*`;
        }

        embed.addFields({ name: 'Rules', value: rulesText });
        embed.setFooter({ text: 'All combinations happen automatically when players have ingredients' });

        await interaction.editReply({ embeds: [embed] });
    },

    // NEW: Separate method for handling list combinations from button
    async handleListCombinationsFromButton(interaction) {
        const rules = await CombinationRule.find({ isActive: true })
            .sort({ priority: -1, ruleId: 1 });

        if (rules.length === 0) {
            return interaction.editReply({ 
                content: 'No combination rules found.',
                embeds: [],
                components: []
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('⚡ Automatic Combination Rules')
            .setColor(COLORS.INFO)
            .setDescription(`Found ${rules.length} active rules`)
            .setTimestamp();

        let rulesText = '';
        for (const rule of rules.slice(0, 10)) {
            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            const resultEmoji = resultItem ? `<:${resultItem.emojiName}:${resultItem.emojiId}>` : '❓';
            
            rulesText += `**${rule.ruleId}** (Priority: ${rule.priority})\n`;
            
            // Show ingredients in simple format
            const ingredientStrs = rule.ingredients.map(ing => 
                `${ing.quantity > 1 ? ing.quantity : ''}${ing.itemId}`
            );
            rulesText += `${ingredientStrs.join(' + ')} → ${resultEmoji} ${rule.result.quantity}x ${resultItem?.itemName || rule.result.itemId}\n\n`;
        }
        
        if (rules.length > 10) {
            rulesText += `*...and ${rules.length - 10} more rules*`;
        }

        embed.addFields({ name: 'Rules', value: rulesText });
        embed.setFooter({ text: 'All combinations happen automatically when players have ingredients' });

        await interaction.editReply({ embeds: [embed], components: [] });
    },

    // NEW: Separate method for handling pagination
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

        // Sort items numerically by ID
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

        // Create a shorter, more compact format to avoid character limits
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

        // Use description instead of fields to avoid 1024 char limit on fields
        embed.setDescription(`Showing ${items.length} items (${totalItems} total)\n\n${itemsList}`);

        // Add navigation buttons if needed
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

        // Add action buttons
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

        // FIXED: Use editReply for deferred button interactions
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

        await interaction.editReply({ embeds: [embed] });
    },

    // FIXED: Handle button interactions
    async handleButtonInteraction(interaction) {
        if (!interaction.customId.startsWith('gacha_')) return;

        // For modal interactions, don't defer
        if (interaction.customId === 'gacha_add_combination') {
            await this.handleAddCombination(interaction);
            return;
        }

        // For other interactions, defer the update
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }
        } catch (error) {
            console.log('Interaction already handled, continuing...');
        }

        if (interaction.customId === 'gacha_list_combinations') {
            await this.handleListCombinationsFromButton(interaction);
        } else if (interaction.customId.startsWith('gacha_list_')) {
            // FIXED: Handle pagination directly without mock interaction
            const parts = interaction.customId.split('_');
            const page = parseInt(parts[2]);
            const filter = parts[3];
            
            // Handle pagination directly
            await this.handleListItemsPagination(interaction, page, filter);
        }
    },

    // Handle modal submissions
    async handleModalSubmit(interaction) {
        if (interaction.customId === 'gacha_add_combo_modal') {
            await this.handleCombinationModal(interaction);
        }
    }
};
