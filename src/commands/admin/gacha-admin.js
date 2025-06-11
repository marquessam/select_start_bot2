// src/commands/admin/gacha-admin.js - RESTORED with manual input + modern UI
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
import gachaService from '../../services/gachaService.js';
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gacha-admin')
        .setDescription('Interactive gacha system management interface')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        
        // RESTORED: Full manual add-item subcommand
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-item')
                .setDescription('Add a new gacha item (manual input)')
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
                        .setDescription('Discord emoji (paste: <:name:id> or <a:name:id> for animated)')
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
                .setName('edit-item')
                .setDescription('Edit an existing gacha item')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to edit')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('New item name (leave empty to keep current)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('description') 
                        .setDescription('New item description (leave empty to keep current)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('emoji-input')
                        .setDescription('New Discord emoji (<:name:id> or <a:name:id>) (leave empty to keep current)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('New item type (leave empty to keep current)')
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
                        .setDescription('New item rarity (leave empty to keep current)')
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
                        .setDescription('New drop rate % (leave empty to keep current)')
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(100))
                .addStringOption(option =>
                    option.setName('flavor-text')
                        .setDescription('New flavor text (leave empty to keep current)')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('max-stack')
                        .setDescription('New max stack size (leave empty to keep current)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(999))
                .addStringOption(option =>
                    option.setName('series-id')
                        .setDescription('New series ID (leave empty to keep current)')
                        .setRequired(false)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('delete-item')
                .setDescription('Delete a gacha item (checks for dependencies)')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to delete')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('force')
                        .setDescription('Force delete even if used in combinations (dangerous!)')
                        .setRequired(false)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('view-item')
                .setDescription('View detailed info about a specific item')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to view')
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
                        .setRequired(true))),

    async execute(interaction) {
        // Check if user is admin
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand(false);
        
        // If a specific subcommand was used, handle it
        if (subcommand) {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                switch (subcommand) {
                    case 'add-item':
                        await this.handleAddItem(interaction);
                        break;
                    case 'edit-item':
                        await this.handleEditItem(interaction);
                        break;
                    case 'delete-item':
                        await this.handleDeleteItem(interaction);
                        break;
                    case 'view-item':
                        await this.handleViewItem(interaction);
                        break;
                    case 'give-item':
                        await this.handleGiveItem(interaction);
                        break;
                    case 'clear-collection':
                        await this.handleClearCollection(interaction);
                        break;
                    case 'list-items':
                        await this.handleListItems(interaction);
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
                    default:
                        await interaction.editReply('Subcommand not implemented yet.');
                }
            } catch (error) {
                console.error('Error executing gacha admin command:', error);
                await interaction.editReply({
                    content: `❌ Error: ${error.message}`
                });
            }
            return;
        }

        // Otherwise show the modern interactive menu
        await this.handleMainMenu(interaction);
    },

    /**
     * Create the main menu embed with system overview
     */
    async createMainMenuEmbed() {
        try {
            // Get system stats
            const totalItems = await GachaItem.countDocuments({ isActive: true });
            const gachaItems = await GachaItem.countDocuments({ isActive: true, dropRate: { $gt: 0 } });
            const comboOnlyItems = await GachaItem.countDocuments({ isActive: true, dropRate: 0 });
            const totalCombos = await CombinationRule.countDocuments({ isActive: true });
            const nonDestructiveCombos = await CombinationRule.countDocuments({ isActive: true, isNonDestructive: true });
            const totalUsers = await User.countDocuments({ 'gachaCollection.0': { $exists: true } });

            // Get next available ID for display
            const nextId = await this.getNextItemId();

            const embed = new EmbedBuilder()
                .setTitle('🎰 Gacha System Management Center')
                .setDescription('Comprehensive gacha system administration interface')
                .setColor('#FF6B6B')
                .addFields(
                    {
                        name: '📊 System Overview',
                        value: `**Total Items:** ${totalItems}\n` +
                               `**Gacha Items:** ${gachaItems}\n` +
                               `**Combo-Only:** ${comboOnlyItems}\n` +
                               `**Combinations:** ${totalCombos} (${nonDestructiveCombos} non-destructive)\n` +
                               `**Active Collectors:** ${totalUsers}\n` +
                               `**Next Available ID:** ${nextId}`,
                        inline: true
                    },
                    {
                        name: '🛠️ Management Areas',
                        value: '• **Items** - Create, edit, manage items\n' +
                               '• **Combinations** - Recipe management\n' +
                               '• **Users** - Collection tools\n' +
                               '• **Analytics** - System insights',
                        inline: true
                    },
                    {
                        name: '⚡ Quick Commands',
                        value: '• `/gacha-admin add-item` - Manual input (fastest)\n' +
                               '• `/gacha-admin give-item` - Grant items to users\n' +
                               '• `/gacha-admin list-items` - Browse all items\n' +
                               '• Use buttons below for interactive menus',
                        inline: false
                    }
                )
                .setTimestamp();

            return embed;
        } catch (error) {
            console.error('Error creating main menu embed:', error);
            return new EmbedBuilder()
                .setTitle('🎰 Gacha System Management')
                .setDescription('Administration interface for the gacha system')
                .setColor('#FF6B6B');
        }
    },

    /**
     * Create main menu components
     */
    createMainMenuComponents() {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('gacha_main_menu')
            .setPlaceholder('Choose a management category...')
            .addOptions([
                {
                    label: 'Items Management',
                    description: 'Browse, edit, view, and delete gacha items',
                    value: 'items',
                    emoji: '📦'
                },
                {
                    label: 'Combinations',
                    description: 'Manage combination rules and recipes',
                    value: 'combinations',
                    emoji: '⚗️'
                },
                {
                    label: 'User Management',
                    description: 'Give items, clear collections, manage users',
                    value: 'users',
                    emoji: '👥'
                },
                {
                    label: 'Analytics & Stats',
                    description: 'View system statistics and insights',
                    value: 'analytics',
                    emoji: '📊'
                }
            ]);

        const quickButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha_quick_add_help')
                    .setLabel('Add Item Help')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('❓'),
                
                new ButtonBuilder()
                    .setCustomId('gacha_quick_list_items')
                    .setLabel('Browse Items')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📋'),

                new ButtonBuilder()
                    .setCustomId('gacha_quick_combinations')
                    .setLabel('Combinations')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⚗️'),

                new ButtonBuilder()
                    .setCustomId('gacha_refresh_main')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄')
            );

        return [
            new ActionRowBuilder().addComponents(selectMenu),
            quickButtons
        ];
    },

    /**
     * Handle main menu display
     */
    async handleMainMenu(interaction) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        try {
            const embed = await this.createMainMenuEmbed();
            const components = this.createMainMenuComponents();

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    embeds: [embed],
                    components: components
                });
            } else {
                await interaction.reply({
                    embeds: [embed],
                    components: components,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error in main menu:', error);
            const errorMessage = 'An error occurred while loading the gacha admin interface.';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: errorMessage, embeds: [], components: [] });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },

    /**
     * Show add item help (replaces modal system)
     */
    async showAddItemHelp(interaction) {
        if (!interaction.deferred) await interaction.deferUpdate();

        const nextId = await this.getNextItemId();

        const embed = new EmbedBuilder()
            .setTitle('➕ Add Item Help - Manual Input (Fastest Method)')
            .setDescription('Use the slash command for quick, efficient item creation')
            .setColor('#2ECC71')
            .addFields(
                {
                    name: '🚀 Quick Command',
                    value: `\`/gacha-admin add-item\` and fill in the options`,
                    inline: false
                },
                {
                    name: '📝 Required Fields',
                    value: `• **item-id**: ${nextId} (suggested next ID)\n` +
                           `• **name**: Item display name\n` +
                           `• **description**: Main description text\n` +
                           `• **emoji-input**: <:name:123456> or <a:name:123456>\n` +
                           `• **type**: trinket/collectible/series/special/combined\n` +
                           `• **rarity**: common/uncommon/rare/epic/legendary/mythic\n` +
                           `• **drop-rate**: 0-100 (0 = combo-only)`,
                    inline: false
                },
                {
                    name: '📋 Optional Fields',
                    value: `• **flavor-text**: Additional lore text\n` +
                           `• **max-stack**: How many can be owned (default: 1)\n` +
                           `• **series-id**: Group items into series`,
                    inline: false
                },
                {
                    name: '💡 Pro Tips',
                    value: `• Copy emoji by right-clicking in Discord and "Copy ID"\n` +
                           `• Use drop-rate 0 for combination-only items\n` +
                           `• Series items work great with non-destructive combos\n` +
                           `• Higher max-stack for common items, 1 for rare items`,
                    inline: false
                }
            )
            .setFooter({ text: 'This method is much faster once you get used to it!' })
            .setTimestamp();

        const actionButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha_back_to_main')
                    .setLabel('Back to Main')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );

        await interaction.editReply({
            embeds: [embed],
            components: [actionButtons]
        });
    },

    /**
     * Handle items management menu
     */
    async handleItemsMenu(interaction) {
        if (!interaction.deferred) await interaction.deferUpdate();

        try {
            const totalItems = await GachaItem.countDocuments({ isActive: true });
            const gachaItems = await GachaItem.countDocuments({ isActive: true, dropRate: { $gt: 0 } });
            const comboOnlyItems = await GachaItem.countDocuments({ isActive: true, dropRate: 0 });

            const embed = new EmbedBuilder()
                .setTitle('📦 Items Management')
                .setDescription('Create, edit, and manage all gacha items')
                .setColor('#4ECDC4')
                .addFields(
                    {
                        name: '📈 Item Statistics',
                        value: `**Total Items:** ${totalItems}\n` +
                               `**Gacha Items:** ${gachaItems}\n` +
                               `**Combo-Only:** ${comboOnlyItems}`,
                        inline: true
                    },
                    {
                        name: '🎯 Available Actions',
                        value: '• **Add New** - Use `/gacha-admin add-item`\n' +
                               '• **Edit Existing** - Use `/gacha-admin edit-item`\n' +
                               '• **View Details** - Use `/gacha-admin view-item`\n' +
                               '• **Delete Item** - Use `/gacha-admin delete-item`\n' +
                               '• **Browse All** - Paginated lists below',
                        inline: true
                    }
                )
                .setTimestamp();

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_quick_add_help')
                        .setLabel('Add Item Help')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('❓'),
                    
                    new ButtonBuilder()
                        .setCustomId('gacha_list_items_menu')
                        .setLabel('Browse Items')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📋'),

                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_main')
                        .setLabel('Back to Main')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [actionButtons]
            });

        } catch (error) {
            console.error('Error in items menu:', error);
            await interaction.editReply({
                content: 'An error occurred while loading the items menu.',
                embeds: [],
                components: []
            });
        }
    },

    /**
     * Handle combinations management menu
     */
    async handleCombinationsMenu(interaction) {
        if (!interaction.deferred) await interaction.deferUpdate();

        try {
            const totalCombos = await CombinationRule.countDocuments({ isActive: true });
            const nonDestructive = await CombinationRule.countDocuments({ isActive: true, isNonDestructive: true });
            const destructive = totalCombos - nonDestructive;

            const embed = new EmbedBuilder()
                .setTitle('⚗️ Combinations Management')
                .setDescription('Create and manage combination rules and recipes')
                .setColor('#9B59B6')
                .addFields(
                    {
                        name: '🔬 Combination Statistics',
                        value: `**Total Rules:** ${totalCombos}\n` +
                               `**Non-Destructive:** ${nonDestructive} 🔄\n` +
                               `**Standard:** ${destructive} ⚗️`,
                        inline: true
                    },
                    {
                        name: '💡 Rule Types',
                        value: '**Standard**: Consumes ingredients\n' +
                               '**Non-Destructive**: Keeps ingredients\n' +
                               '**Priority**: Higher combines first\n' +
                               '**Format**: `(025x5) = 107` for non-destructive',
                        inline: true
                    },
                    {
                        name: '🎯 Available Actions',
                        value: '• **Create Rule** - Use combination modal\n' +
                               '• **Browse Rules** - View all combinations\n' +
                               '• **Remove Rule** - Use `/gacha-admin remove-combination`\n' +
                               '• **Debug Rules** - Use `/gacha-admin debug-combination`',
                        inline: false
                    }
                )
                .setTimestamp();

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_add_combination_modal')
                        .setLabel('Create Rule')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('➕'),
                    
                    new ButtonBuilder()
                        .setCustomId('gacha_list_combinations_menu')
                        .setLabel('Browse Rules')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📋'),

                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_main')
                        .setLabel('Back to Main')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [actionButtons]
            });

        } catch (error) {
            console.error('Error in combinations menu:', error);
            await interaction.editReply({
                content: 'An error occurred while loading the combinations menu.',
                embeds: [],
                components: []
            });
        }
    },

    /**
     * Handle user management menu
     */
    async handleUsersMenu(interaction) {
        if (!interaction.deferred) await interaction.deferUpdate();

        try {
            const totalUsers = await User.countDocuments({ 'gachaCollection.0': { $exists: true } });
            const totalCollectionItems = await User.aggregate([
                { $unwind: '$gachaCollection' },
                { $group: { _id: null, total: { $sum: '$gachaCollection.quantity' } } }
            ]);
            const totalItems = totalCollectionItems[0]?.total || 0;

            const embed = new EmbedBuilder()
                .setTitle('👥 User Management')
                .setDescription('Manage user collections and gacha interactions')
                .setColor('#E67E22')
                .addFields(
                    {
                        name: '👤 User Statistics',
                        value: `**Active Collectors:** ${totalUsers}\n` +
                               `**Total Items Owned:** ${totalItems}\n` +
                               `**Avg Items/User:** ${totalUsers > 0 ? Math.round(totalItems / totalUsers) : 0}`,
                        inline: true
                    },
                    {
                        name: '🎁 Admin Tools',
                        value: '• **Give Items** - `/gacha-admin give-item`\n' +
                               '• **Clear Collections** - `/gacha-admin clear-collection`\n' +
                               '• **View Item Details** - `/gacha-admin view-item`\n' +
                               '• **User Analytics** - Coming soon',
                        inline: true
                    }
                )
                .setTimestamp();

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_give_item_modal')
                        .setLabel('Give Item (Modal)')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🎁'),
                    
                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_main')
                        .setLabel('Back to Main')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [actionButtons]
            });

        } catch (error) {
            console.error('Error in users menu:', error);
            await interaction.editReply({
                content: 'An error occurred while loading the user management menu.',
                embeds: [],
                components: []
            });
        }
    },

    /**
     * Handle analytics menu
     */
    async handleAnalyticsMenu(interaction) {
        if (!interaction.deferred) await interaction.deferUpdate();

        try {
            // Get various analytics
            const totalItems = await GachaItem.countDocuments({ isActive: true });
            const totalUsers = await User.countDocuments({ 'gachaCollection.0': { $exists: true } });
            const totalCombos = await CombinationRule.countDocuments({ isActive: true });
            
            // Most owned items
            const popularItems = await User.aggregate([
                { $unwind: '$gachaCollection' },
                { $group: { _id: '$gachaCollection.itemId', totalOwned: { $sum: '$gachaCollection.quantity' }, uniqueOwners: { $sum: 1 } } },
                { $sort: { totalOwned: -1 } },
                { $limit: 5 }
            ]);

            const embed = new EmbedBuilder()
                .setTitle('📊 System Analytics & Statistics')
                .setDescription('Comprehensive insights into the gacha system')
                .setColor('#3498DB')
                .addFields(
                    {
                        name: '📈 Overview',
                        value: `**Total Items:** ${totalItems}\n` +
                               `**Active Users:** ${totalUsers}\n` +
                               `**Combinations:** ${totalCombos}`,
                        inline: true
                    },
                    {
                        name: '🔥 Most Popular Items',
                        value: popularItems.length > 0 ? 
                            popularItems.slice(0, 3).map(item => 
                                `**${item._id}**: ${item.totalOwned} owned by ${item.uniqueOwners} users`
                            ).join('\n') : 'No data available',
                        inline: true
                    }
                )
                .setTimestamp();

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_main')
                        .setLabel('Back to Main')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [actionButtons]
            });

        } catch (error) {
            console.error('Error in analytics menu:', error);
            await interaction.editReply({
                content: 'An error occurred while loading analytics.',
                embeds: [],
                components: []
            });
        }
    },

    /**
     * Get next available item ID (auto-increment feature)
     */
    async getNextItemId() {
        try {
            // Find all items with numeric IDs
            const items = await GachaItem.find({ isActive: true }, { itemId: 1 });
            const numericIds = items
                .map(item => parseInt(item.itemId))
                .filter(id => !isNaN(id))
                .sort((a, b) => b - a); // Sort descending

            if (numericIds.length === 0) {
                return '001'; // Start from 001 if no numeric IDs exist
            }

            const highestId = numericIds[0];
            const nextId = highestId + 1;
            
            // Pad with zeros to match common format (e.g., 001, 002, etc.)
            return nextId.toString().padStart(3, '0');
        } catch (error) {
            console.error('Error getting next item ID:', error);
            return ''; // Return empty if error, let user fill manually
        }
    },

    // RESTORED: Original manual add item method
    async handleAddItem(interaction) {
        const emojiInput = interaction.options.getString('emoji-input');
        
        // Parse emoji input to handle both static and animated emojis
        const emojiData = this.parseEmojiInput(emojiInput);
        const dropRate = interaction.options.getNumber('drop-rate');

        const itemData = {
            itemId: interaction.options.getString('item-id'),
            itemName: interaction.options.getString('name'),
            description: interaction.options.getString('description'),
            itemType: interaction.options.getString('type'),
            rarity: interaction.options.getString('rarity'),
            dropRate,
            emojiName: emojiData.emojiName,
            emojiId: emojiData.emojiId,
            isAnimated: emojiData.isAnimated,
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
        const emojiTypeText = emojiData.isAnimated ? 'Animated' : 'Static';
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Item Added Successfully!')
            .setColor(this.getRarityColor(itemData.rarity))
            .addFields(
                { name: 'Preview', value: `${emojiInput} **${itemData.itemName}**`, inline: false },
                { name: 'ID', value: itemData.itemId, inline: true },
                { name: 'Type', value: itemData.itemType, inline: true },
                { name: 'Rarity', value: itemData.rarity, inline: true },
                { name: 'Source', value: sourceText, inline: true },
                { name: 'Max Stack', value: itemData.maxStack.toString(), inline: true },
                { name: 'Emoji Type', value: emojiTypeText, inline: true }
            );

        if (itemData.flavorText) {
            embed.addFields({ name: 'Flavor Text', value: `*${itemData.flavorText}*` });
        }
        
        if (itemData.seriesId) {
            embed.addFields({ name: 'Series', value: itemData.seriesId, inline: true });
        }

        embed.setFooter({ text: `Created by ${interaction.user.username}` });
        embed.setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    // Include all the original methods from the paste
    async handleEditItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        
        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            throw new Error(`Item "${itemId}" not found.`);
        }

        const updates = {};
        const changes = [];

        // Check each field for updates (same logic as original)
        const newName = interaction.options.getString('name');
        if (newName && newName !== item.itemName) {
            updates.itemName = newName;
            changes.push(`Name: "${item.itemName}" → "${newName}"`);
        }

        const newDescription = interaction.options.getString('description');
        if (newDescription && newDescription !== item.description) {
            updates.description = newDescription;
            changes.push(`Description: "${item.description}" → "${newDescription}"`);
        }

        const newType = interaction.options.getString('type');
        if (newType && newType !== item.itemType) {
            updates.itemType = newType;
            changes.push(`Type: "${item.itemType}" → "${newType}"`);
        }

        const newRarity = interaction.options.getString('rarity');
        if (newRarity && newRarity !== item.rarity) {
            updates.rarity = newRarity;
            changes.push(`Rarity: "${item.rarity}" → "${newRarity}"`);
        }

        const newDropRate = interaction.options.getNumber('drop-rate');
        if (newDropRate !== null && newDropRate !== item.dropRate) {
            updates.dropRate = newDropRate;
            changes.push(`Drop Rate: ${item.dropRate}% → ${newDropRate}%`);
        }

        const newFlavorText = interaction.options.getString('flavor-text');
        if (newFlavorText !== null && newFlavorText !== item.flavorText) {
            updates.flavorText = newFlavorText;
            changes.push(`Flavor Text: "${item.flavorText || 'none'}" → "${newFlavorText}"`);
        }

        const newMaxStack = interaction.options.getInteger('max-stack');
        if (newMaxStack && newMaxStack !== item.maxStack) {
            updates.maxStack = newMaxStack;
            changes.push(`Max Stack: ${item.maxStack || 1} → ${newMaxStack}`);
        }

        const newSeriesId = interaction.options.getString('series-id');
        if (newSeriesId !== null && newSeriesId !== item.seriesId) {
            updates.seriesId = newSeriesId;
            changes.push(`Series: "${item.seriesId || 'none'}" → "${newSeriesId}"`);
        }

        const newEmojiInput = interaction.options.getString('emoji-input');
        if (newEmojiInput) {
            const emojiData = this.parseEmojiInput(newEmojiInput);
            
            if (emojiData.emojiName !== item.emojiName || 
                emojiData.emojiId !== item.emojiId || 
                emojiData.isAnimated !== item.isAnimated) {
                
                updates.emojiName = emojiData.emojiName;
                updates.emojiId = emojiData.emojiId;
                updates.isAnimated = emojiData.isAnimated;
                
                const oldEmoji = this.formatItemEmoji(item);
                changes.push(`Emoji: ${oldEmoji} → ${newEmojiInput}`);
            }
        }

        if (changes.length === 0) {
            return interaction.editReply({
                content: `❌ No changes specified for item "${itemId}". Provide at least one field to update.`
            });
        }

        // Apply updates
        Object.assign(item, updates);
        await item.save();

        const emoji = this.formatItemEmoji(item);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Item Updated')
            .setColor(COLORS.SUCCESS)
            .setDescription(`${emoji} **${item.itemName}** (ID: ${itemId})`)
            .addFields({
                name: 'Changes Made',
                value: changes.join('\n')
            })
            .setFooter({ text: `Updated by ${interaction.user.username}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleDeleteItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        const force = interaction.options.getBoolean('force') || false;
        
        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            throw new Error(`Item "${itemId}" not found.`);
        }

        // Check if item is used in combinations
        const usedInIngredients = await CombinationRule.find({ 
            'ingredients.itemId': itemId,
            isActive: true 
        });
        
        const usedInResults = await CombinationRule.find({ 
            'result.itemId': itemId,
            isActive: true 
        });

        const totalCombinations = usedInIngredients.length + usedInResults.length;

        // Check how many users have this item
        const usersWithItem = await User.find({
            'gachaCollection.itemId': itemId
        });

        const totalUsersAffected = usersWithItem.length;
        const totalItemsToRemove = usersWithItem.reduce((total, user) => {
            const userItem = user.gachaCollection.find(ci => ci.itemId === itemId);
            return total + (userItem?.quantity || 0);
        }, 0);

        if (totalCombinations > 0 && !force) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Cannot Delete Item')
                .setColor(COLORS.WARNING)
                .setDescription(`Item "${itemId}" is used in ${totalCombinations} combination rule(s).`)
                .addFields(
                    { 
                        name: 'Dependency Details', 
                        value: `• Used as ingredient in: ${usedInIngredients.length} rules\n• Created by combinations: ${usedInResults.length} rules`,
                        inline: false 
                    },
                    { 
                        name: 'To delete anyway', 
                        value: 'Use the `force: true` option, but this will break combination rules!',
                        inline: false 
                    }
                );

            return interaction.editReply({ embeds: [embed] });
        }

        // If force deleting, also remove broken combination rules
        let brokenRules = 0;
        if (force && totalCombinations > 0) {
            const rulesToRemove = await CombinationRule.find({
                $or: [
                    { 'ingredients.itemId': itemId },
                    { 'result.itemId': itemId }
                ],
                isActive: true
            });

            brokenRules = rulesToRemove.length;
            for (const rule of rulesToRemove) {
                rule.isActive = false;
                await rule.save();
            }
        }

        // Remove from all user collections
        for (const user of usersWithItem) {
            const itemIndex = user.gachaCollection.findIndex(ci => ci.itemId === itemId);
            if (itemIndex !== -1) {
                user.gachaCollection.splice(itemIndex, 1);
                await user.save();
            }
        }

        // Delete the item
        await GachaItem.findOneAndDelete({ itemId });

        const emoji = this.formatItemEmoji(item);

        const embed = new EmbedBuilder()
            .setTitle('✅ Item Deleted')
            .setColor(COLORS.SUCCESS)
            .setDescription(`${emoji} **${item.itemName}** has been permanently deleted.`)
            .addFields(
                { name: 'Item ID', value: itemId, inline: true },
                { name: 'Users Affected', value: totalUsersAffected.toString(), inline: true },
                { name: 'Items Removed', value: totalItemsToRemove.toString(), inline: true }
            );

        if (brokenRules > 0) {
            embed.addFields({
                name: 'Combination Rules Disabled',
                value: `${brokenRules} rules were automatically disabled due to missing items.`,
                inline: false
            });
        }

        embed.setFooter({ text: `Deleted by ${interaction.user.username}` });
        embed.setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleViewItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        
        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            throw new Error(`Item "${itemId}" not found.`);
        }

        // Check if item is used in combinations
        const usedInIngredients = await CombinationRule.find({ 
            'ingredients.itemId': itemId,
            isActive: true 
        });
        
        const usedInResults = await CombinationRule.find({ 
            'result.itemId': itemId,
            isActive: true 
        });

        // Check how many users have this item
        const usersWithItem = await User.countDocuments({
            'gachaCollection.itemId': itemId
        });

        const emoji = this.formatItemEmoji(item);
        
        const embed = new EmbedBuilder()
            .setTitle(`${emoji} ${item.itemName}`)
            .setColor(this.getRarityColor(item.rarity))
            .setDescription(item.description)
            .addFields(
                { name: 'Item ID', value: item.itemId, inline: true },
                { name: 'Type', value: item.itemType, inline: true },
                { name: 'Rarity', value: item.rarity, inline: true },
                { name: 'Drop Rate', value: `${item.dropRate}%`, inline: true },
                { name: 'Max Stack', value: item.maxStack?.toString() || '1', inline: true },
                { name: 'Users Own This', value: usersWithItem.toString(), inline: true }
            );

        if (item.isAnimated) {
            embed.addFields({ name: 'Emoji Type', value: '🎬 Animated', inline: true });
        }

        if (item.flavorText) {
            embed.addFields({ name: 'Flavor Text', value: `*${item.flavorText}*`, inline: false });
        }

        if (item.seriesId) {
            embed.addFields({ name: 'Series', value: item.seriesId, inline: true });
        }

        // Show combination usage
        if (usedInIngredients.length > 0) {
            const ingredientRules = usedInIngredients.slice(0, 3).map(rule => rule.ruleId).join(', ');
            const extraCount = Math.max(0, usedInIngredients.length - 3);
            const ingredientText = extraCount > 0 ? 
                `${ingredientRules}${extraCount > 0 ? ` (+${extraCount} more)` : ''}` : 
                ingredientRules;
            embed.addFields({ 
                name: `Used as Ingredient (${usedInIngredients.length})`, 
                value: ingredientText, 
                inline: false 
            });
        }

        if (usedInResults.length > 0) {
            const resultRules = usedInResults.slice(0, 3).map(rule => rule.ruleId).join(', ');
            const extraCount = Math.max(0, usedInResults.length - 3);
            const resultText = extraCount > 0 ? 
                `${resultRules}${extraCount > 0 ? ` (+${extraCount} more)` : ''}` : 
                resultRules;
            embed.addFields({ 
                name: `Created by Combinations (${usedInResults.length})`, 
                value: resultText, 
                inline: false 
            });
        }

        if (usedInIngredients.length === 0 && usedInResults.length === 0) {
            embed.addFields({ 
                name: 'Combination Usage', 
                value: 'Not used in any combinations', 
                inline: false 
            });
        }

        if (item.createdBy) {
            embed.setFooter({ text: `Created by: ${item.createdBy}` });
        }

        embed.setTimestamp();

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

        const emoji = this.formatItemEmoji(item);
        
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
            const animatedFlag = item.isAnimated ? '🎬' : '';
            
            itemsList += `**${id}** - ${name} (${rarity}, ${item.dropRate}%) ${animatedFlag}\n`;
        });

        embed.setDescription(`Showing ${items.length} items (${totalItems} total)\n\n${itemsList}`);
        embed.setFooter({ 
            text: 'Copy the Item ID (bolded text) when creating combinations. 🎬 = Animated emoji' 
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleListCombinations(interaction) {
        const page = interaction.options.getInteger('page') || 1;
        const rulesPerPage = 8;

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
            const resultEmoji = resultItem ? this.formatItemEmoji(resultItem) : '❓';
            
            rulesText += `**${rule.ruleId}** (Priority: ${rule.priority})${rule.isNonDestructive ? ' 🔄' : ''}\n`;
            
            const ingredientStrs = rule.ingredients.map(ing => 
                ing.quantity > 1 ? `${ing.itemId}x${ing.quantity}` : ing.itemId
            );
            
            const ingredientsDisplay = rule.isNonDestructive 
                ? `(${ingredientStrs.join(' + ')})` 
                : ingredientStrs.join(' + ');
            
            rulesText += `${ingredientsDisplay} = ${resultEmoji} ${resultItem?.itemName || rule.result.itemId}${rule.result.quantity > 1 ? ` (x${rule.result.quantity})` : ''}\n\n`;
        }

        embed.addFields({ name: 'Rules', value: rulesText });
        embed.setFooter({ text: 'All combinations require user confirmation • 🔄 = Non-Destructive (keeps ingredients)' });

        await interaction.editReply({ embeds: [embed] });
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
            { name: 'Type', value: rule.isNonDestructive ? '🔄 Non-Destructive' : '⚗️ Standard', inline: true },
            { name: 'Requires Confirmation', value: 'Yes', inline: true }
        );

        let ingredientsText = '';
        let ingredientsValid = true;
        
        for (const ingredient of rule.ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                const emoji = this.formatItemEmoji(item);
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
            const emoji = this.formatItemEmoji(resultItem);
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

        if (rule.isNonDestructive) {
            embed.addFields({
                name: '🔄 Non-Destructive Behavior',
                value: 'This combination will keep all ingredients after creating the result. Perfect for series completion rewards!',
                inline: false
            });
        }

        if (rule.createdBy) {
            embed.setFooter({ text: `Created by: ${rule.createdBy}` });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    // Keep modal functionality for combinations and give-item
    async showAddCombinationModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('gacha_add_combo_submit')
            .setTitle('Create Combination Rule');

        const formatInput = new TextInputBuilder()
            .setCustomId('combo_format')
            .setLabel('Combination Rule')
            .setPlaceholder('025x5 = 107 OR (001 + 003) = 999 for non-destructive')
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

    async handleCombinationModalSubmission(interaction) {
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
                isNonDestructive: parsed.isNonDestructive,
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
                    { name: 'Type', value: parsed.isNonDestructive ? '🔄 Non-Destructive' : '⚗️ Standard', inline: true },
                    { name: 'Format', value: `\`${comboFormat}\``, inline: false }
                );

            let ingredientsText = '';
            for (const ing of parsed.ingredients) {
                const item = await GachaItem.findOne({ itemId: ing.itemId });
                const emoji = item ? this.formatItemEmoji(item) : '❓';
                ingredientsText += `${emoji} ${ing.quantity}x **${item?.itemName || ing.itemId}**\n`;
            }
            embed.addFields({ name: 'Ingredients', value: ingredientsText });

            const resultEmoji = resultItem ? this.formatItemEmoji(resultItem) : '❓';
            embed.addFields({ 
                name: 'Result', 
                value: `${resultEmoji} ${parsed.result.quantity}x **${resultItem?.itemName || parsed.result.itemId}**` 
            });

            if (parsed.isNonDestructive) {
                embed.setDescription('🔄 **Non-Destructive Combination** - Ingredients will be kept after combining!');
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error creating combination:', error);
            await interaction.editReply({
                content: `❌ Error creating combination: ${error.message}\n\n**Format Examples:**\n` +
                         `• \`025x5 = 107\` (5 items with ID 025 make 1 item with ID 107)\n` +
                         `• \`(025x5) = 107\` (5 items with ID 025 make 1 item with ID 107, keeps ingredients)\n` +
                         `• \`001 + 003 = 999\` (item 001 + item 003 make item 999)\n` +
                         `• \`(001 + 003) = 999\` (item 001 + item 003 make item 999, keeps ingredients)`
            });
        }
    },

    async showGiveItemModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('gacha_give_item_submit')
            .setTitle('Give Item to User');

        const usernameInput = new TextInputBuilder()
            .setCustomId('username')
            .setLabel('Username')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter username')
            .setRequired(true);

        const itemIdInput = new TextInputBuilder()
            .setCustomId('item_id')
            .setLabel('Item ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 025')
            .setRequired(true);

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Quantity (default: 1)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1')
            .setValue('1')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(usernameInput),
            new ActionRowBuilder().addComponents(itemIdInput),
            new ActionRowBuilder().addComponents(quantityInput)
        );

        await interaction.showModal(modal);
    },

    async handleGiveItemModalSubmission(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const username = interaction.fields.getTextInputValue('username').trim();
            const itemId = interaction.fields.getTextInputValue('item_id').trim();
            const quantity = parseInt(interaction.fields.getTextInputValue('quantity')) || 1;

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

            const emoji = this.formatItemEmoji(item);
            
            const combinationResult = await combinationService.triggerCombinationAlertsForAdminGift(user, itemId, interaction);

            let message = `✅ Gave ${emoji} ${quantity}x **${item.itemName}** to ${username}`;

            if (combinationResult.hasCombinations) {
                message += `\n\n⚗️ **Combination Alerts Sent!**\n`;
                message += `${username} now has ${combinationResult.combinationCount} combination option(s) available!`;
            }

            await interaction.editReply({ content: message });

        } catch (error) {
            console.error('Error giving item:', error);
            await interaction.editReply({
                content: `❌ Error giving item: ${error.message}`
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
            throw new Error('Format must use = or -> as separator');
        }

        const parts = format.split(separator);
        if (parts.length !== 2) {
            throw new Error('Format must be: ingredients = result');
        }

        let ingredientsPart = parts[0].trim();
        const resultPart = parts[1].trim();

        // Check for non-destructive combination (parentheses)
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
        } else {
            result = { itemId: resultPart.trim(), quantity: 1 };
        }

        return { ingredients, result, isNonDestructive };
    },

    // Include all helper methods
    parseEmojiInput(emojiInput) {
        const emojiMatch = emojiInput.match(/<(a?):([^:]+):(\d+)>/);
        if (!emojiMatch) {
            throw new Error('Invalid emoji format. Please paste like: <:name:123456> or <a:name:123456> for animated');
        }

        const [, animatedFlag, emojiName, emojiId] = emojiMatch;
        const isAnimated = animatedFlag === 'a';

        return {
            emojiName,
            emojiId,
            isAnimated,
            fullFormat: emojiInput
        };
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
            common: '#95a5a6',
            uncommon: '#2ecc71',
            rare: '#3498db',
            epic: '#9b59b6',
            legendary: '#f39c12',
            mythic: '#e74c3c'
        };
        return colors[rarity] || colors.common;
    },

    /**
     * Central handler for all interactions
     */
    async handleInteraction(interaction) {
        const customId = interaction.customId;

        try {
            // Main menu navigation
            if (customId === 'gacha_main_menu') {
                const value = interaction.values[0];
                switch (value) {
                    case 'items':
                        await this.handleItemsMenu(interaction);
                        break;
                    case 'combinations':
                        await this.handleCombinationsMenu(interaction);
                        break;
                    case 'users':
                        await this.handleUsersMenu(interaction);
                        break;
                    case 'analytics':
                        await this.handleAnalyticsMenu(interaction);
                        break;
                }
                return;
            }

            // Quick action buttons
            if (customId === 'gacha_quick_add_help') {
                await this.showAddItemHelp(interaction);
                return;
            }

            if (customId === 'gacha_quick_list_items' || customId === 'gacha_list_items_menu') {
                await this.handleItemsList(interaction, 1, 'all');
                return;
            }

            if (customId === 'gacha_quick_combinations' || customId === 'gacha_list_combinations_menu') {
                await this.handleCombinationsList(interaction, 1);
                return;
            }

            // Navigation buttons
            if (customId === 'gacha_back_to_main' || customId === 'gacha_refresh_main') {
                await this.handleMainMenu(interaction);
                return;
            }

            // Combination management
            if (customId === 'gacha_add_combination_modal') {
                await this.showAddCombinationModal(interaction);
                return;
            }

            // User management
            if (customId === 'gacha_give_item_modal') {
                await this.showGiveItemModal(interaction);
                return;
            }

            // Modal submissions
            if (customId === 'gacha_add_combo_submit') {
                await this.handleCombinationModalSubmission(interaction);
                return;
            }

            if (customId === 'gacha_give_item_submit') {
                await this.handleGiveItemModalSubmission(interaction);
                return;
            }

        } catch (error) {
            console.error('Error handling gacha interaction:', error);
            
            const errorMessage = `❌ Error: ${error.message}`;
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: errorMessage, embeds: [], components: [] });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },

    // Enhanced list handlers with new UI
    async handleItemsList(interaction, page = 1, filter = 'all') {
        if (!interaction.deferred) await interaction.deferUpdate();

        try {
            const itemsPerPage = 12;
            let query = { isActive: true };
            let title = '📦 All Items';

            switch (filter) {
                case 'gacha':
                    query.dropRate = { $gt: 0 };
                    title = '🎰 Gacha Items';
                    break;
                case 'combo':
                    query.dropRate = 0;
                    title = '⚗️ Combo-Only Items';
                    break;
                case 'recent':
                    title = '🆕 Recently Added';
                    break;
            }

            const totalItems = await GachaItem.countDocuments(query);
            const totalPages = Math.ceil(totalItems / itemsPerPage);
            const skip = (page - 1) * itemsPerPage;

            let items = await GachaItem.find(query)
                .skip(skip)
                .limit(itemsPerPage);

            if (filter === 'recent') {
                items = items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            } else {
                items.sort((a, b) => {
                    const aNum = parseInt(a.itemId) || 0;
                    const bNum = parseInt(b.itemId) || 0;
                    return aNum - bNum;
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`${title} - Page ${page}/${totalPages}`)
                .setColor('#4ECDC4')
                .setDescription(`Showing ${items.length} of ${totalItems} items`)
                .setTimestamp();

            // Create items display
            let itemsList = '';
            items.forEach(item => {
                const emoji = this.formatItemEmoji(item);
                const id = item.itemId.length > 8 ? item.itemId.substring(0, 8) + '...' : item.itemId;
                const name = item.itemName.length > 18 ? item.itemName.substring(0, 15) + '...' : item.itemName;
                const rarity = item.rarity.charAt(0).toUpperCase();
                const animatedFlag = item.isAnimated ? '🎬' : '';
                
                itemsList += `${emoji} **${id}** - ${name} (${rarity}, ${item.dropRate}%) ${animatedFlag}\n`;
            });

            if (itemsList) {
                embed.addFields({ name: 'Items', value: itemsList });
            }

            embed.setFooter({ text: 'Use /gacha-admin view-item to see details • 🎬 = Animated emoji' });

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_quick_add_help')
                        .setLabel('Add Item Help')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('❓'),

                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_items')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [actionButtons]
            });

        } catch (error) {
            console.error('Error in items list:', error);
            await interaction.editReply({
                content: 'An error occurred while loading the items list.',
                embeds: [],
                components: []
            });
        }
    },

    async handleCombinationsList(interaction, page = 1) {
        if (!interaction.deferred) await interaction.deferUpdate();

        try {
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
                    .setTitle('⚗️ No Combination Rules Found')
                    .setDescription('No combination rules are currently configured.')
                    .setColor('#95a5a6');

                const actionButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('gacha_add_combination_modal')
                            .setLabel('Create First Rule')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('➕'),
                        new ButtonBuilder()
                            .setCustomId('gacha_back_to_combinations')
                            .setLabel('Back')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('⬅️')
                    );

                return interaction.editReply({
                    embeds: [embed],
                    components: [actionButton]
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`⚗️ Combination Rules - Page ${page}/${totalPages}`)
                .setColor('#9B59B6')
                .setDescription(`Showing ${rules.length} rules (${totalRules} total)`)
                .setTimestamp();

            let rulesText = '';
            for (const rule of rules) {
                const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
                const resultEmoji = resultItem ? this.formatItemEmoji(resultItem) : '❓';
                
                rulesText += `**${rule.ruleId}** (Priority: ${rule.priority})${rule.isNonDestructive ? ' 🔄' : ''}\n`;
                
                const ingredientStrs = rule.ingredients.map(ing => 
                    ing.quantity > 1 ? `${ing.itemId}x${ing.quantity}` : ing.itemId
                );
                
                const ingredientsDisplay = rule.isNonDestructive 
                    ? `(${ingredientStrs.join(' + ')})` 
                    : ingredientStrs.join(' + ');
                
                rulesText += `${ingredientsDisplay} = ${resultEmoji} ${resultItem?.itemName || rule.result.itemId}${rule.result.quantity > 1 ? ` (x${rule.result.quantity})` : ''}\n\n`;
            }

            embed.addFields({ name: 'Rules', value: rulesText });
            embed.setFooter({ text: '🔄 = Non-Destructive (keeps ingredients) • Use /gacha-admin debug-combination to troubleshoot' });

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_add_combination_modal')
                        .setLabel('Add Rule')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('➕'),

                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_combinations')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [actionButtons]
            });

        } catch (error) {
            console.error('Error in combinations list:', error);
            await interaction.editReply({
                content: 'An error occurred while loading the combinations list.',
                embeds: [],
                components: []
            });
        }
    },

    /**
     * Handle button interactions (called by index.js)
     */
    async handleButtonInteraction(interaction) {
        return this.handleInteraction(interaction);
    },

    /**
     * Handle select menu interactions (called by index.js)
     */
    async handleSelectMenuInteraction(interaction) {
        return this.handleInteraction(interaction);
    },

    /**
     * Handle modal submissions (called by index.js)
     */
    async handleModalSubmit(interaction) {
        return this.handleInteraction(interaction);
    }
};
