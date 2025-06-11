// src/commands/admin/gacha-admin.js - Streamlined Version
import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    PermissionFlagsBits
} from 'discord.js';
import { GachaItem, CombinationRule } from '../../models/GachaItem.js';
import { User } from '../../models/User.js';
import combinationService from '../../services/combinationService.js';

const COLORS = {
    SUCCESS: '#28a745',
    WARNING: '#ffc107', 
    DANGER: '#dc3545',
    INFO: '#17a2b8'
};

export default {
    data: new SlashCommandBuilder()
        .setName('gacha-admin')
        .setDescription('Gacha system management')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('menu')
                .setDescription('Interactive management interface'))
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-item')
                .setDescription('Add new gacha item')
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
                        .setDescription('Discord emoji (<:name:id> or <a:name:id>)')
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
                        .setDescription('Drop rate % (0 = combination-only)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100))
                .addStringOption(option =>
                    option.setName('flavor-text')
                        .setDescription('Flavor text (optional)')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('max-stack')
                        .setDescription('Max stack size (default: 99)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(999))
                .addStringOption(option =>
                    option.setName('series-id')
                        .setDescription('Series ID (optional)')
                        .setRequired(false)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('list-items')
                .setDescription('List gacha items')
                .addIntegerOption(option =>
                    option.setName('page')
                        .setDescription('Page number')
                        .setMinValue(1)
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('filter')
                        .setDescription('Filter items')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All items', value: 'all' },
                            { name: 'Gacha items', value: 'gacha' },
                            { name: 'Combination-only', value: 'combo' }
                        )))

        .addSubcommand(subcommand =>
            subcommand
                .setName('edit-item')
                .setDescription('Edit existing item')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to edit')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('New name')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('description') 
                        .setDescription('New description')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('emoji-input')
                        .setDescription('New emoji')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('New type')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Trinket', value: 'trinket' },
                            { name: 'Collectible', value: 'collectible' },
                            { name: 'Series', value: 'series' },
                            { name: 'Special', value: 'special' },
                            { name: 'Combined', value: 'combined' }
                        ))
                .addStringOption(option =>
                    option.setName('rarity')
                        .setDescription('New rarity')
                        .setRequired(false)
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
                        .setDescription('New drop rate %')
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(100))
                .addStringOption(option =>
                    option.setName('flavor-text')
                        .setDescription('New flavor text')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('max-stack')
                        .setDescription('New max stack')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(999))
                .addStringOption(option =>
                    option.setName('series-id')
                        .setDescription('New series ID')
                        .setRequired(false)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('delete-item')
                .setDescription('Delete gacha item')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to delete')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('force')
                        .setDescription('Force delete (breaks combinations)')
                        .setRequired(false)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('view-item')
                .setDescription('View item details')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to view')
                        .setRequired(true)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('add-combination')
                .setDescription('Add combination rule'))

        .addSubcommand(subcommand =>
            subcommand
                .setName('list-combinations')
                .setDescription('List combination rules')
                .addIntegerOption(option =>
                    option.setName('page')
                        .setDescription('Page number')
                        .setMinValue(1)
                        .setRequired(false)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-combination')
                .setDescription('Remove combination rule')
                .addStringOption(option =>
                    option.setName('rule-id')
                        .setDescription('Rule ID to remove')
                        .setRequired(true)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('debug-combination')
                .setDescription('Debug combination rule')
                .addStringOption(option =>
                    option.setName('rule-id')
                        .setDescription('Rule ID to debug')
                        .setRequired(true)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('give-item')
                .setDescription('Give item to user')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Username')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID')
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
                .setDescription('Clear user collection')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Username')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('confirm')
                        .setDescription('Confirm action')
                        .setRequired(true))),

    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '❌ Administrator permissions required.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'menu') {
            await this.handleMainMenu(interaction);
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            switch (subcommand) {
                case 'add-item': await this.handleAddItem(interaction); break;
                case 'list-items': await this.handleListItemsCommand(interaction); break;
                case 'edit-item': await this.handleEditItem(interaction); break;
                case 'delete-item': await this.handleDeleteItem(interaction); break;
                case 'view-item': await this.handleViewItem(interaction); break;
                case 'add-combination': await this.handleAddCombination(interaction); break;
                case 'list-combinations': await this.handleListCombinationsCommand(interaction); break;
                case 'remove-combination': await this.handleRemoveCombination(interaction); break;
                case 'debug-combination': await this.handleDebugCombination(interaction); break;
                case 'give-item': await this.handleGiveItemCommand(interaction); break;
                case 'clear-collection': await this.handleClearCollection(interaction); break;
                default: await interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // Main menu system
    async createMainMenuEmbed() {
        try {
            const totalItems = await GachaItem.countDocuments({ isActive: true });
            const gachaItems = await GachaItem.countDocuments({ isActive: true, dropRate: { $gt: 0 } });
            const comboOnlyItems = await GachaItem.countDocuments({ isActive: true, dropRate: 0 });
            const totalCombos = await CombinationRule.countDocuments({ isActive: true });
            const nonDestructiveCombos = await CombinationRule.countDocuments({ isActive: true, isNonDestructive: true });
            const totalUsers = await User.countDocuments({ 'gachaCollection.0': { $exists: true } });

            return new EmbedBuilder()
                .setTitle('🎰 Gacha System Management')
                .setColor('#FF6B6B')
                .addFields(
                    {
                        name: '📊 System Overview',
                        value: `**Items:** ${totalItems} (${gachaItems} gacha, ${comboOnlyItems} combo-only)\n` +
                               `**Combinations:** ${totalCombos} (${nonDestructiveCombos} non-destructive)\n` +
                               `**Active Collectors:** ${totalUsers}`,
                        inline: true
                    },
                    {
                        name: '⚡ Quick Actions',
                        value: '• **Use `/gacha-admin add-item`** for direct creation\n' +
                               '• **Browse & manage** via interface below\n' +
                               '• **All functionality** available via commands',
                        inline: true
                    }
                )
                .setTimestamp();
        } catch (error) {
            return new EmbedBuilder()
                .setTitle('🎰 Gacha System Management')
                .setColor('#FF6B6B')
                .setDescription('Administration interface for the gacha system');
        }
    },

    createMainMenuComponents() {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('gacha-admin_main_menu')
            .setPlaceholder('Choose management category...')
            .addOptions([
                { label: 'Items Management', description: 'Browse, edit, view items', value: 'items', emoji: '📦' },
                { label: 'Combinations', description: 'Manage recipes', value: 'combinations', emoji: '⚗️' },
                { label: 'User Management', description: 'Give items, clear collections', value: 'users', emoji: '👥' },
                { label: 'Analytics', description: 'View statistics', value: 'analytics', emoji: '📊' }
            ]);

        const quickButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha-admin_quick_list_items')
                    .setLabel('Browse Items')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📋'),
                new ButtonBuilder()
                    .setCustomId('gacha-admin_quick_combinations')
                    .setLabel('Combinations')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⚗️'),
                new ButtonBuilder()
                    .setCustomId('gacha-admin_refresh_main')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄')
            );

        return [new ActionRowBuilder().addComponents(selectMenu), quickButtons];
    },

    async handleMainMenu(interaction) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        try {
            const embed = await this.createMainMenuEmbed();
            const components = this.createMainMenuComponents();
            await interaction.editReply({ embeds: [embed], components });
        } catch (error) {
            await interaction.editReply({ content: 'Error loading interface.', embeds: [], components: [] });
        }
    },

    async handleItemsMenu(interaction) {
        if (!interaction.deferred) await interaction.deferUpdate();

        const totalItems = await GachaItem.countDocuments({ isActive: true });
        const gachaItems = await GachaItem.countDocuments({ isActive: true, dropRate: { $gt: 0 } });
        const comboOnlyItems = await GachaItem.countDocuments({ isActive: true, dropRate: 0 });
        const nextId = await this.getNextItemId();

        const embed = new EmbedBuilder()
            .setTitle('📦 Items Management')
            .setColor('#4ECDC4')
            .addFields(
                {
                    name: '📈 Statistics',
                    value: `**Total:** ${totalItems}\n**Gacha:** ${gachaItems}\n**Combo-only:** ${comboOnlyItems}\n**Next ID:** ${nextId}`,
                    inline: true
                },
                {
                    name: '🎯 Actions',
                    value: '• Use `/gacha-admin add-item` for creation\n• Browse items below\n• Direct command interface',
                    inline: true
                }
            );

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha-admin_list_items_menu')
                    .setLabel('Browse Items')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📋'),
                new ButtonBuilder()
                    .setCustomId('gacha-admin_back_to_main')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );

        await interaction.editReply({ embeds: [embed], components: [buttons] });
    },

    async handleCombinationsMenu(interaction) {
        if (!interaction.deferred) await interaction.deferUpdate();

        const totalCombos = await CombinationRule.countDocuments({ isActive: true });
        const nonDestructive = await CombinationRule.countDocuments({ isActive: true, isNonDestructive: true });

        const embed = new EmbedBuilder()
            .setTitle('⚗️ Combinations Management')
            .setColor('#9B59B6')
            .addFields(
                {
                    name: '🔬 Statistics',
                    value: `**Total:** ${totalCombos}\n**Non-Destructive:** ${nonDestructive}\n**Standard:** ${totalCombos - nonDestructive}`,
                    inline: true
                },
                {
                    name: '💡 Rules',
                    value: '**Standard**: Consumes ingredients\n**Non-Destructive**: Keeps ingredients\n**Format**: `(025x5) = 107`',
                    inline: true
                }
            );

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha-admin_add_combination_modal')
                    .setLabel('Create Rule')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('➕'),
                new ButtonBuilder()
                    .setCustomId('gacha-admin_list_combinations_menu')
                    .setLabel('Browse Rules')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📋'),
                new ButtonBuilder()
                    .setCustomId('gacha-admin_back_to_main')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );

        await interaction.editReply({ embeds: [embed], components: [buttons] });
    },

    async handleUsersMenu(interaction) {
        if (!interaction.deferred) await interaction.deferUpdate();

        const totalUsers = await User.countDocuments({ 'gachaCollection.0': { $exists: true } });
        const totalCollectionItems = await User.aggregate([
            { $unwind: '$gachaCollection' },
            { $group: { _id: null, total: { $sum: '$gachaCollection.quantity' } } }
        ]);
        const totalItems = totalCollectionItems[0]?.total || 0;

        const embed = new EmbedBuilder()
            .setTitle('👥 User Management')
            .setColor('#E67E22')
            .addFields(
                {
                    name: '👤 Statistics',
                    value: `**Active Collectors:** ${totalUsers}\n**Total Items Owned:** ${totalItems}\n**Avg Items/User:** ${totalUsers > 0 ? Math.round(totalItems / totalUsers) : 0}`,
                    inline: true
                },
                {
                    name: '🎁 Tools',
                    value: '• Give items to users\n• Clear collections\n• Use direct commands',
                    inline: true
                }
            );

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha-admin_give_item_modal')
                    .setLabel('Give Item')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎁'),
                new ButtonBuilder()
                    .setCustomId('gacha-admin_back_to_main')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );

        await interaction.editReply({ embeds: [embed], components: [buttons] });
    },

    async handleAnalyticsMenu(interaction) {
        if (!interaction.deferred) await interaction.deferUpdate();

        const totalItems = await GachaItem.countDocuments({ isActive: true });
        const totalUsers = await User.countDocuments({ 'gachaCollection.0': { $exists: true } });
        const totalCombos = await CombinationRule.countDocuments({ isActive: true });

        const popularItems = await User.aggregate([
            { $unwind: '$gachaCollection' },
            { $group: { _id: '$gachaCollection.itemId', totalOwned: { $sum: '$gachaCollection.quantity' }, uniqueOwners: { $sum: 1 } } },
            { $sort: { totalOwned: -1 } },
            { $limit: 3 }
        ]);

        const embed = new EmbedBuilder()
            .setTitle('📊 System Analytics')
            .setColor('#3498DB')
            .addFields(
                {
                    name: '📈 Overview',
                    value: `**Items:** ${totalItems}\n**Users:** ${totalUsers}\n**Combinations:** ${totalCombos}`,
                    inline: true
                },
                {
                    name: '🔥 Popular Items',
                    value: popularItems.length > 0 ? 
                        popularItems.map(item => `**${item._id}**: ${item.totalOwned} owned`).join('\n') : 
                        'No data available',
                    inline: true
                }
            );

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha-admin_back_to_main')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );

        await interaction.editReply({ embeds: [embed], components: [buttons] });
    },

    async getNextItemId() {
        try {
            const items = await GachaItem.find({ isActive: true }, { itemId: 1 });
            const numericIds = items
                .map(item => parseInt(item.itemId))
                .filter(id => !isNaN(id))
                .sort((a, b) => b - a);

            if (numericIds.length === 0) return '001';
            return (numericIds[0] + 1).toString().padStart(3, '0');
        } catch (error) {
            return '';
        }
    },

    // Item list with pagination
    async handleItemsList(interaction, page = 1, filter = 'all') {
        if (!interaction.deferred) await interaction.deferUpdate();

        const itemsPerPage = 12;
        let query = { isActive: true };
        let title = '📦 All Items';

        if (filter === 'gacha') {
            query.dropRate = { $gt: 0 };
            title = '🎰 Gacha Items';
        } else if (filter === 'combo') {
            query.dropRate = 0;
            title = '⚗️ Combo-Only Items';
        }

        const totalItems = await GachaItem.countDocuments(query);
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const skip = (page - 1) * itemsPerPage;

        const items = await GachaItem.find(query).skip(skip).limit(itemsPerPage);
        items.sort((a, b) => (parseInt(a.itemId) || 0) - (parseInt(b.itemId) || 0));

        const embed = new EmbedBuilder()
            .setTitle(`${title} - Page ${page}/${totalPages}`)
            .setColor('#4ECDC4')
            .setDescription(`Showing ${items.length} of ${totalItems} items`);

        let itemsList = '';
        items.forEach(item => {
            const emoji = this.formatItemEmoji(item);
            const id = item.itemId.length > 8 ? item.itemId.substring(0, 8) + '...' : item.itemId;
            const name = item.itemName.length > 18 ? item.itemName.substring(0, 15) + '...' : item.itemName;
            const rarity = item.rarity.charAt(0).toUpperCase();
            const animatedFlag = item.isAnimated ? '🎬' : '';
            itemsList += `${emoji} **${id}** - ${name} (${rarity}, ${item.dropRate}%) ${animatedFlag}\n`;
        });

        if (itemsList) embed.addFields({ name: 'Items', value: itemsList });

        const filterMenu = new StringSelectMenuBuilder()
            .setCustomId(`gacha-admin_filter_items_${page}`)
            .setPlaceholder('Filter items...')
            .addOptions([
                { label: 'All Items', value: 'all', emoji: '📦' },
                { label: 'Gacha Items', value: 'gacha', emoji: '🎰' },
                { label: 'Combo-Only', value: 'combo', emoji: '⚗️' }
            ]);

        const paginationRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`gacha-admin_items_page_${Math.max(1, page - 1)}_${filter}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1),
                new ButtonBuilder()
                    .setCustomId('gacha-admin_page_info')
                    .setLabel(`${page}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`gacha-admin_items_page_${Math.min(totalPages, page + 1)}_${filter}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages)
            );

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha-admin_back_to_items')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );

        await interaction.editReply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(filterMenu), paginationRow, actionRow]
        });
    },

    // Combination list with pagination  
    async handleCombinationsList(interaction, page = 1) {
        if (!interaction.deferred) await interaction.deferUpdate();

        const rulesPerPage = 8;
        const totalRules = await CombinationRule.countDocuments({ isActive: true });
        const totalPages = Math.ceil(totalRules / rulesPerPage);
        const skip = (page - 1) * rulesPerPage;

        const rules = await CombinationRule.find({ isActive: true })
            .sort({ priority: -1, ruleId: 1 })
            .skip(skip)
            .limit(rulesPerPage);

        if (rules.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('⚗️ No Combination Rules')
                .setColor('#95a5a6');

            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha-admin_add_combination_modal')
                        .setLabel('Create First Rule')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('➕'),
                    new ButtonBuilder()
                        .setCustomId('gacha-admin_back_to_combinations')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            return interaction.editReply({ embeds: [embed], components: [button] });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚗️ Combination Rules - Page ${page}/${totalPages}`)
            .setColor('#9B59B6')
            .setDescription(`${rules.length} rules (${totalRules} total)`);

        let rulesText = '';
        for (const rule of rules) {
            const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
            const resultEmoji = resultItem ? this.formatItemEmoji(resultItem) : '❓';
            
            rulesText += `**${rule.ruleId}** (${rule.priority})${rule.isNonDestructive ? ' 🔄' : ''}\n`;
            
            const ingredientStrs = rule.ingredients.map(ing => 
                ing.quantity > 1 ? `${ing.itemId}x${ing.quantity}` : ing.itemId
            );
            
            const ingredientsDisplay = rule.isNonDestructive 
                ? `(${ingredientStrs.join(' + ')})` 
                : ingredientStrs.join(' + ');
            
            rulesText += `${ingredientsDisplay} = ${resultEmoji} ${resultItem?.itemName || rule.result.itemId}\n\n`;
        }

        embed.addFields({ name: 'Rules', value: rulesText });

        const paginationRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`gacha-admin_combo_page_${Math.max(1, page - 1)}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1),
                new ButtonBuilder()
                    .setCustomId('gacha-admin_combo_page_info')
                    .setLabel(`${page}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`gacha-admin_combo_page_${Math.min(totalPages, page + 1)}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages)
            );

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha-admin_add_combination_modal')
                    .setLabel('Add Rule')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('➕'),
                new ButtonBuilder()
                    .setCustomId('gacha-admin_back_to_combinations')
                    .setLabel('Back')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );

        const components = totalPages > 1 ? [paginationRow, actionRow] : [actionRow];
        await interaction.editReply({ embeds: [embed], components });
    },

    // Direct command handlers
    async handleAddItem(interaction) {
        try {
            const itemId = interaction.options.getString('item-id');
            const itemName = interaction.options.getString('name');
            const description = interaction.options.getString('description');
            const emojiInput = interaction.options.getString('emoji-input');
            const itemType = interaction.options.getString('type');
            const rarity = interaction.options.getString('rarity');
            const dropRate = interaction.options.getNumber('drop-rate');
            const flavorText = interaction.options.getString('flavor-text');
            const maxStack = interaction.options.getInteger('max-stack') || 99;
            const seriesId = interaction.options.getString('series-id');

            const existingItem = await GachaItem.findOne({ itemId });
            if (existingItem) throw new Error(`Item "${itemId}" already exists.`);

            const emojiData = this.parseEmojiInput(emojiInput);

            const newItem = new GachaItem({
                itemId, itemName, description, itemType, rarity, dropRate,
                emojiName: emojiData.emojiName,
                emojiId: emojiData.emojiId,
                isAnimated: emojiData.isAnimated,
                flavorText, maxStack, seriesId,
                createdBy: interaction.user.username
            });

            await newItem.save();

            const emoji = this.formatItemEmoji(newItem);
            const sourceText = dropRate > 0 ? `Gacha (${dropRate}%)` : 'Combination only';

            const embed = new EmbedBuilder()
                .setTitle('✅ Item Created')
                .setColor(this.getRarityColor(rarity))
                .addFields(
                    { name: 'Preview', value: `${emoji} **${itemName}**`, inline: false },
                    { name: 'ID', value: itemId, inline: true },
                    { name: 'Type', value: itemType, inline: true },
                    { name: 'Rarity', value: rarity, inline: true },
                    { name: 'Source', value: sourceText, inline: true },
                    { name: 'Max Stack', value: maxStack.toString(), inline: true }
                );

            if (flavorText) embed.addFields({ name: 'Flavor Text', value: `*${flavorText}*` });
            if (seriesId) embed.addFields({ name: 'Series', value: seriesId, inline: true });

            embed.setFooter({ text: `Created by ${interaction.user.username}` });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            await interaction.editReply(`❌ ${error.message}`);
        }
    },

    async handleListItemsCommand(interaction) {
        const page = interaction.options.getInteger('page') || 1;
        const filter = interaction.options.getString('filter') || 'all';
        await this.handleItemsList(interaction, page, filter);
    },

    async handleViewItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        
        const item = await GachaItem.findOne({ itemId });
        if (!item) throw new Error(`Item "${itemId}" not found.`);

        const usedInIngredients = await CombinationRule.find({ 'ingredients.itemId': itemId, isActive: true });
        const usedInResults = await CombinationRule.find({ 'result.itemId': itemId, isActive: true });
        const usersWithItem = await User.countDocuments({ 'gachaCollection.itemId': itemId });

        const emoji = this.formatItemEmoji(item);
        
        const embed = new EmbedBuilder()
            .setTitle(`${emoji} ${item.itemName}`)
            .setColor(this.getRarityColor(item.rarity))
            .setDescription(item.description)
            .addFields(
                { name: 'ID', value: item.itemId, inline: true },
                { name: 'Type', value: item.itemType, inline: true },
                { name: 'Rarity', value: item.rarity, inline: true },
                { name: 'Drop Rate', value: `${item.dropRate}%`, inline: true },
                { name: 'Max Stack', value: item.maxStack?.toString() || '1', inline: true },
                { name: 'Users Own This', value: usersWithItem.toString(), inline: true }
            );

        if (item.flavorText) embed.addFields({ name: 'Flavor Text', value: `*${item.flavorText}*` });
        if (item.seriesId) embed.addFields({ name: 'Series', value: item.seriesId, inline: true });

        if (usedInIngredients.length > 0) {
            embed.addFields({ 
                name: `Used as Ingredient (${usedInIngredients.length})`, 
                value: usedInIngredients.slice(0, 3).map(rule => rule.ruleId).join(', ') + 
                       (usedInIngredients.length > 3 ? '...' : '')
            });
        }

        if (usedInResults.length > 0) {
            embed.addFields({ 
                name: `Created by Combinations (${usedInResults.length})`, 
                value: usedInResults.slice(0, 3).map(rule => rule.ruleId).join(', ') + 
                       (usedInResults.length > 3 ? '...' : '')
            });
        }

        if (item.createdBy) embed.setFooter({ text: `Created by: ${item.createdBy}` });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleEditItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        
        const item = await GachaItem.findOne({ itemId });
        if (!item) throw new Error(`Item "${itemId}" not found.`);

        const updates = {};
        const changes = [];

        const fields = ['name', 'description', 'type', 'rarity', 'drop-rate', 'flavor-text', 'max-stack', 'series-id', 'emoji-input'];
        
        for (const field of fields) {
            const value = field === 'drop-rate' ? interaction.options.getNumber(field) : 
                         field === 'max-stack' ? interaction.options.getInteger(field) :
                         interaction.options.getString(field);
            
            if (value !== null && value !== undefined) {
                const fieldMap = {
                    'name': 'itemName',
                    'description': 'description',
                    'type': 'itemType', 
                    'rarity': 'rarity',
                    'drop-rate': 'dropRate',
                    'flavor-text': 'flavorText',
                    'max-stack': 'maxStack',
                    'series-id': 'seriesId'
                };
                
                if (field === 'emoji-input') {
                    const emojiData = this.parseEmojiInput(value);
                    if (emojiData.emojiName !== item.emojiName || emojiData.emojiId !== item.emojiId) {
                        updates.emojiName = emojiData.emojiName;
                        updates.emojiId = emojiData.emojiId;
                        updates.isAnimated = emojiData.isAnimated;
                        changes.push(`Emoji updated`);
                    }
                } else {
                    const dbField = fieldMap[field];
                    if (value !== item[dbField]) {
                        updates[dbField] = value;
                        changes.push(`${field}: "${item[dbField]}" → "${value}"`);
                    }
                }
            }
        }

        if (changes.length === 0) {
            return interaction.editReply(`❌ No changes specified for item "${itemId}".`);
        }

        Object.assign(item, updates);
        await item.save();

        const embed = new EmbedBuilder()
            .setTitle('✅ Item Updated')
            .setColor(COLORS.SUCCESS)
            .setDescription(`${this.formatItemEmoji(item)} **${item.itemName}** (${itemId})`)
            .addFields({ name: 'Changes', value: changes.join('\n') })
            .setFooter({ text: `Updated by ${interaction.user.username}` });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleDeleteItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        const force = interaction.options.getBoolean('force') || false;
        
        const item = await GachaItem.findOne({ itemId });
        if (!item) throw new Error(`Item "${itemId}" not found.`);

        const usedInCombinations = await CombinationRule.find({
            $or: [{ 'ingredients.itemId': itemId }, { 'result.itemId': itemId }],
            isActive: true
        });

        if (usedInCombinations.length > 0 && !force) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Cannot Delete Item')
                .setColor(COLORS.WARNING)
                .setDescription(`Item "${itemId}" is used in ${usedInCombinations.length} combination(s).`)
                .addFields({ 
                    name: 'To delete anyway', 
                    value: 'Use `force: true` (breaks combinations)' 
                });
            return interaction.editReply({ embeds: [embed] });
        }

        const usersWithItem = await User.find({ 'gachaCollection.itemId': itemId });
        const totalItemsToRemove = usersWithItem.reduce((total, user) => {
            const userItem = user.gachaCollection.find(ci => ci.itemId === itemId);
            return total + (userItem?.quantity || 0);
        }, 0);

        if (force) {
            for (const rule of usedInCombinations) {
                rule.isActive = false;
                await rule.save();
            }
        }

        for (const user of usersWithItem) {
            const itemIndex = user.gachaCollection.findIndex(ci => ci.itemId === itemId);
            if (itemIndex !== -1) {
                user.gachaCollection.splice(itemIndex, 1);
                await user.save();
            }
        }

        await GachaItem.findOneAndDelete({ itemId });

        const embed = new EmbedBuilder()
            .setTitle('✅ Item Deleted')
            .setColor(COLORS.SUCCESS)
            .setDescription(`${this.formatItemEmoji(item)} **${item.itemName}** deleted.`)
            .addFields(
                { name: 'Users Affected', value: usersWithItem.length.toString(), inline: true },
                { name: 'Items Removed', value: totalItemsToRemove.toString(), inline: true }
            );

        if (force && usedInCombinations.length > 0) {
            embed.addFields({ name: 'Rules Disabled', value: usedInCombinations.length.toString(), inline: true });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleGiveItemCommand(interaction) {
        const username = interaction.options.getString('username');
        const itemId = interaction.options.getString('item-id');
        const quantity = interaction.options.getInteger('quantity') || 1;

        const user = await User.findOne({ raUsername: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (!user) throw new Error(`User "${username}" not found.`);

        const item = await GachaItem.findOne({ itemId });
        if (!item) throw new Error(`Item "${itemId}" not found.`);

        user.addGachaItem(item, quantity, 'admin_grant');
        await user.save();

        const emoji = this.formatItemEmoji(item);
        const combinationResult = await combinationService.triggerCombinationAlertsForAdminGift(user, itemId, interaction);

        let message = `✅ Gave ${emoji} ${quantity}x **${item.itemName}** to ${username}`;
        if (combinationResult.hasCombinations) {
            message += `\n⚗️ ${combinationResult.combinationCount} combination(s) now available!`;
        }

        await interaction.editReply({ content: message });
    },

    async handleClearCollection(interaction) {
        const username = interaction.options.getString('username');
        const confirm = interaction.options.getBoolean('confirm');

        if (!confirm) throw new Error('Confirmation required.');

        const user = await User.findOne({ raUsername: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (!user) throw new Error(`User "${username}" not found.`);

        const collectionSize = user.gachaCollection?.length || 0;
        if (collectionSize === 0) {
            return interaction.editReply(`❌ User "${username}" already has empty collection.`);
        }

        user.gachaCollection = [];
        await user.save();

        await interaction.editReply(`✅ Cleared collection for **${username}** (${collectionSize} items removed).`);
    },

    // Combination handlers
    async showAddCombinationModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('gacha-admin_add_combo_submit')
            .setTitle('Create Combination Rule');

        const formatInput = new TextInputBuilder()
            .setCustomId('combo_format')
            .setLabel('Combination Rule')
            .setPlaceholder('025x5 = 107 OR (001 + 003) = 999')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const ruleIdInput = new TextInputBuilder()
            .setCustomId('rule_id')
            .setLabel('Rule ID (auto-generated if empty)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        const priorityInput = new TextInputBuilder()
            .setCustomId('priority')
            .setLabel('Priority (0-100)')
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

    async showGiveItemModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('gacha-admin_give_item_submit')
            .setTitle('Give Item to User');

        const usernameInput = new TextInputBuilder()
            .setCustomId('username')
            .setLabel('Username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const itemIdInput = new TextInputBuilder()
            .setCustomId('item_id')
            .setLabel('Item ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Quantity')
            .setValue('1')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(usernameInput),
            new ActionRowBuilder().addComponents(itemIdInput),
            new ActionRowBuilder().addComponents(quantityInput)
        );

        await interaction.showModal(modal);
    },

    async handleAddCombination(interaction) {
        await this.showAddCombinationModal(interaction);
    },

    async handleListCombinationsCommand(interaction) {
        const page = interaction.options.getInteger('page') || 1;
        await this.handleCombinationsList(interaction, page);
    },

    async handleRemoveCombination(interaction) {
        const ruleId = interaction.options.getString('rule-id');
        const rule = await CombinationRule.findOneAndDelete({ ruleId });
        
        if (!rule) throw new Error(`Rule "${ruleId}" not found.`);
        await interaction.editReply(`✅ Removed rule: **${ruleId}**`);
    },

    async handleDebugCombination(interaction) {
        const ruleId = interaction.options.getString('rule-id');
        
        const rule = await CombinationRule.findOne({ ruleId, isActive: true });
        if (!rule) throw new Error(`Rule "${ruleId}" not found.`);

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Debug: ${ruleId}`)
            .setColor(COLORS.INFO)
            .addFields(
                { name: 'Priority', value: rule.priority?.toString() || '0', inline: true },
                { name: 'Type', value: rule.isNonDestructive ? '🔄 Non-Destructive' : '⚗️ Standard', inline: true }
            );

        let ingredientsText = '';
        let valid = true;
        
        for (const ingredient of rule.ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                const emoji = this.formatItemEmoji(item);
                ingredientsText += `${emoji} ${ingredient.quantity}x **${item.itemName}**\n`;
            } else {
                ingredientsText += `❌ ${ingredient.quantity}x MISSING (${ingredient.itemId})\n`;
                valid = false;
            }
        }
        
        embed.addFields({ name: 'Ingredients', value: ingredientsText || 'None' });

        const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
        let resultText = '';
        if (resultItem) {
            const emoji = this.formatItemEmoji(resultItem);
            resultText = `${emoji} ${rule.result.quantity || 1}x **${resultItem.itemName}**`;
        } else {
            resultText = `❌ MISSING (${rule.result.itemId})`;
            valid = false;
        }
        
        embed.addFields({ name: 'Result', value: resultText });
        embed.addFields({ name: 'Status', value: valid ? '✅ Valid' : '❌ Broken' });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleCombinationModalSubmission(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const comboFormat = interaction.fields.getTextInputValue('combo_format');
        const ruleId = interaction.fields.getTextInputValue('rule_id') || `combo_${Date.now()}`;
        const priority = parseInt(interaction.fields.getTextInputValue('priority')) || 10;

        try {
            const parsed = await this.parseSimpleCombination(comboFormat);
            
            for (const ingredient of parsed.ingredients) {
                const item = await GachaItem.findOne({ itemId: ingredient.itemId });
                if (!item) throw new Error(`Ingredient not found: ${ingredient.itemId}`);
            }

            const resultItem = await GachaItem.findOne({ itemId: parsed.result.itemId });
            if (!resultItem) throw new Error(`Result not found: ${parsed.result.itemId}`);

            const existingRule = await CombinationRule.findOne({ ruleId });
            if (existingRule) throw new Error(`Rule "${ruleId}" already exists.`);

            const newRule = new CombinationRule({
                ruleId, priority, createdBy: interaction.user.username,
                ingredients: parsed.ingredients, result: parsed.result,
                isAutomatic: false, isNonDestructive: parsed.isNonDestructive
            });

            await newRule.save();

            const embed = new EmbedBuilder()
                .setTitle('✅ Combination Rule Added')
                .setColor(COLORS.SUCCESS)
                .addFields(
                    { name: 'Rule ID', value: ruleId, inline: true },
                    { name: 'Type', value: parsed.isNonDestructive ? '🔄 Non-Destructive' : '⚗️ Standard', inline: true }
                );

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            await interaction.editReply(`❌ ${error.message}`);
        }
    },

    async handleGiveItemSubmission(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const username = interaction.fields.getTextInputValue('username').trim();
            const itemId = interaction.fields.getTextInputValue('item_id').trim();
            const quantity = parseInt(interaction.fields.getTextInputValue('quantity')) || 1;

            const user = await User.findOne({ raUsername: { $regex: new RegExp(`^${username}$`, 'i') } });
            if (!user) throw new Error(`User "${username}" not found.`);

            const item = await GachaItem.findOne({ itemId });
            if (!item) throw new Error(`Item "${itemId}" not found.`);

            user.addGachaItem(item, quantity, 'admin_grant');
            await user.save();

            const emoji = this.formatItemEmoji(item);
            await interaction.editReply(`✅ Gave ${emoji} ${quantity}x **${item.itemName}** to ${username}`);
        } catch (error) {
            await interaction.editReply(`❌ ${error.message}`);
        }
    },

    // Interaction handler
    async handleInteraction(interaction) {
        const customId = interaction.customId;

        try {
            if (customId === 'gacha-admin_main_menu') {
                const value = interaction.values[0];
                switch (value) {
                    case 'items': await this.handleItemsMenu(interaction); break;
                    case 'combinations': await this.handleCombinationsMenu(interaction); break;
                    case 'users': await this.handleUsersMenu(interaction); break;
                    case 'analytics': await this.handleAnalyticsMenu(interaction); break;
                }
                return;
            }

            if (customId === 'gacha-admin_quick_list_items' || customId === 'gacha-admin_list_items_menu') {
                await this.handleItemsList(interaction, 1, 'all');
                return;
            }

            if (customId === 'gacha-admin_quick_combinations' || customId === 'gacha-admin_list_combinations_menu') {
                await this.handleCombinationsList(interaction, 1);
                return;
            }

            if (customId === 'gacha-admin_back_to_main' || customId === 'gacha-admin_refresh_main') {
                await this.handleMainMenu(interaction);
                return;
            }

            if (customId === 'gacha-admin_back_to_items') {
                await this.handleItemsMenu(interaction);
                return;
            }

            if (customId === 'gacha-admin_back_to_combinations') {
                await this.handleCombinationsMenu(interaction);
                return;
            }

            if (customId === 'gacha-admin_back_to_users') {
                await this.handleUsersMenu(interaction);
                return;
            }

            if (customId === 'gacha-admin_add_combination_modal') {
                await this.showAddCombinationModal(interaction);
                return;
            }

            if (customId === 'gacha-admin_give_item_modal') {
                await this.showGiveItemModal(interaction);
                return;
            }

            if (customId.startsWith('gacha-admin_items_page_')) {
                const parts = customId.split('_');
                const page = parseInt(parts[3]);
                const filter = parts[4] || 'all';
                await this.handleItemsList(interaction, page, filter);
                return;
            }

            if (customId.startsWith('gacha-admin_combo_page_')) {
                const page = parseInt(customId.split('_')[3]);
                await this.handleCombinationsList(interaction, page);
                return;
            }

            if (customId.startsWith('gacha-admin_filter_items_')) {
                const page = parseInt(customId.split('_')[3]) || 1;
                const filter = interaction.values[0];
                await this.handleItemsList(interaction, page, filter);
                return;
            }

            if (customId === 'gacha-admin_add_combo_submit') {
                await this.handleCombinationModalSubmission(interaction);
                return;
            }

            if (customId === 'gacha-admin_give_item_submit') {
                await this.handleGiveItemSubmission(interaction);
                return;
            }

        } catch (error) {
            const errorMessage = `❌ Error: ${error.message}`;
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: errorMessage, embeds: [], components: [] });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },

    async parseSimpleCombination(format) {
        format = format.trim();
        let separator = format.includes(' = ') ? ' = ' : format.includes('=') ? '=' : format.includes(' -> ') ? ' -> ' : '->';
        
        const parts = format.split(separator);
        if (parts.length !== 2) throw new Error('Format must be: ingredients = result');

        let ingredientsPart = parts[0].trim();
        const resultPart = parts[1].trim();

        let isNonDestructive = false;
        if (ingredientsPart.startsWith('(') && ingredientsPart.endsWith(')')) {
            isNonDestructive = true;
            ingredientsPart = ingredientsPart.slice(1, -1).trim();
        }

        const ingredients = [];
        const ingredientItems = ingredientsPart.split(/[+,]/).map(s => s.trim());

        for (const item of ingredientItems) {
            if (item.includes('x')) {
                const [itemId, quantityStr] = item.split('x');
                ingredients.push({ itemId: itemId.trim(), quantity: parseInt(quantityStr) || 1 });
            } else {
                ingredients.push({ itemId: item.trim(), quantity: 1 });
            }
        }

        let result;
        if (resultPart.includes('x')) {
            const [itemId, quantityStr] = resultPart.split('x');
            result = { itemId: itemId.trim(), quantity: parseInt(quantityStr) || 1 };
        } else {
            result = { itemId: resultPart.trim(), quantity: 1 };
        }

        return { ingredients, result, isNonDestructive };
    },

    parseEmojiInput(emojiInput) {
        const emojiMatch = emojiInput.match(/<(a?):([^:]+):(\d+)>/);
        if (!emojiMatch) throw new Error('Invalid emoji format');

        const [, animatedFlag, emojiName, emojiId] = emojiMatch;
        return { emojiName, emojiId, isAnimated: animatedFlag === 'a' };
    },

    formatItemEmoji(item) {
        if (item.emojiId && item.emojiName) {
            const prefix = item.isAnimated ? 'a' : '';
            return `<${prefix}:${item.emojiName}:${item.emojiId}>`;
        }
        return item.emojiName || '❓';
    },

    getRarityColor(rarity) {
        const colors = {
            common: '#95a5a6', uncommon: '#2ecc71', rare: '#3498db',
            epic: '#9b59b6', legendary: '#f39c12', mythic: '#e74c3c'
        };
        return colors[rarity] || colors.common;
    },

    handleButtonInteraction(interaction) { return this.handleInteraction(interaction); },
    handleSelectMenuInteraction(interaction) { return this.handleInteraction(interaction); },
    handleModalSubmit(interaction) { return this.handleInteraction(interaction); }
};
