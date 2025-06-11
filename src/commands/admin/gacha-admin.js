// src/commands/admin/gacha-admin.js - COMPLETE REDESIGNED VERSION with modern interactive UI
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
        
        // Keep the old add-item subcommand as backup
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-item')
                .setDescription('Add a new gacha item (classic method)')
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
                        .setDescription('Item rarity')
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
                        .setDescription('Max stack size (optional)')
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

        // Check if it's the classic add-item subcommand
        if (interaction.options.getSubcommand(false) === 'add-item') {
            await this.handleClassicAddItem(interaction);
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
                               `**Active Collectors:** ${totalUsers}`,
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
                        name: '⚡ Quick Actions',
                        value: '• **Add Item** - Auto-incremented ID\n' +
                               '• **Browse** - Filtered item lists\n' +
                               '• **Gift Items** - Admin grants\n' +
                               '• **View Stats** - Real-time data',
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
                    description: 'Add, edit, view, and delete gacha items',
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
                    .setCustomId('gacha_quick_add_item')
                    .setLabel('Quick Add Item')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('➕'),
                
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
     * Handle items management menu
     */
    async handleItemsMenu(interaction) {
        if (!interaction.deferred) await interaction.deferUpdate();

        try {
            const totalItems = await GachaItem.countDocuments({ isActive: true });
            const gachaItems = await GachaItem.countDocuments({ isActive: true, dropRate: { $gt: 0 } });
            const comboOnlyItems = await GachaItem.countDocuments({ isActive: true, dropRate: 0 });

            // Get next available ID for display
            const nextId = await this.getNextItemId();

            const embed = new EmbedBuilder()
                .setTitle('📦 Items Management')
                .setDescription('Create, edit, and manage all gacha items')
                .setColor('#4ECDC4')
                .addFields(
                    {
                        name: '📈 Item Statistics',
                        value: `**Total Items:** ${totalItems}\n` +
                               `**Gacha Items:** ${gachaItems}\n` +
                               `**Combo-Only:** ${comboOnlyItems}\n` +
                               `**Next Auto-ID:** ${nextId}`,
                        inline: true
                    },
                    {
                        name: '🎯 Available Actions',
                        value: '• **Add New** - Auto-incremented ID\n' +
                               '• **Browse All** - Paginated lists\n' +
                               '• **Two-step process** - All fields supported\n' +
                               '• **Smart validation** - Type partial matching\n' +
                               '• **Default stack: 99** - Leave blank for 99',
                        inline: true
                    }
                )
                .setTimestamp();

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_add_item_modal')
                        .setLabel('Add New Item')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('➕'),
                    
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
                        value: '• **Create Rule** - Build new recipes\n' +
                               '• **Browse Rules** - View all combinations\n' +
                               '• **Test Recipe** - Validate combinations\n' +
                               '• **Debug Rules** - Troubleshoot issues',
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
                        value: '• **Give Items** - Grant items to users\n' +
                               '• **View Collections** - Inspect inventories\n' +
                               '• **Clear Collections** - Reset users\n' +
                               '• **User Analytics** - Detailed stats\n' +
                               '• **Bulk Operations** - Mass changes',
                        inline: true
                    }
                )
                .setTimestamp();

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_give_item_modal')
                        .setLabel('Give Item')
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

    /**
     * Handle classic add-item subcommand (backup method)
     */
    async handleClassicAddItem(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const itemId = interaction.options.getString('item-id');
            const itemName = interaction.options.getString('name');
            const description = interaction.options.getString('description');
            const emojiInput = interaction.options.getString('emoji-input');
            const itemType = interaction.options.getString('type') || 'trinket';
            const rarity = interaction.options.getString('rarity') || 'rare';
            const dropRate = interaction.options.getNumber('drop-rate');
            const flavorText = interaction.options.getString('flavor-text');
            const maxStack = interaction.options.getInteger('max-stack') || 99;
            const seriesId = interaction.options.getString('series-id');

            // Check if item already exists
            const existingItem = await GachaItem.findOne({ itemId });
            if (existingItem) {
                throw new Error(`Item "${itemId}" already exists.`);
            }

            // Parse emoji
            const emojiData = this.parseEmojiInput(emojiInput);

            // Create item
            const newItem = new GachaItem({
                itemId,
                itemName,
                description,
                itemType,
                rarity,
                dropRate,
                emojiName: emojiData.emojiName,
                emojiId: emojiData.emojiId,
                isAnimated: emojiData.isAnimated,
                flavorText,
                maxStack,
                seriesId,
                createdBy: interaction.user.username
            });

            await newItem.save();

            const emoji = this.formatItemEmoji(newItem);
            const sourceText = dropRate > 0 ? `Gacha (${dropRate}% drop rate)` : 'Combination only';

            const embed = new EmbedBuilder()
                .setTitle('✅ Item Created (Classic Method)')
                .setColor(COLORS.SUCCESS)
                .addFields(
                    { name: 'Preview', value: `${emoji} **${itemName}**`, inline: false },
                    { name: 'ID', value: itemId, inline: true },
                    { name: 'Type', value: itemType, inline: true },
                    { name: 'Rarity', value: rarity, inline: true },
                    { name: 'Source', value: sourceText, inline: true },
                    { name: 'Max Stack', value: maxStack.toString(), inline: true }
                )
                .setFooter({ text: `Created by ${interaction.user.username}` })
                .setTimestamp();

            if (flavorText) {
                embed.addFields({ name: 'Flavor Text', value: `*${flavorText}*`, inline: false });
            }

            if (seriesId) {
                embed.addFields({ name: 'Series', value: seriesId, inline: true });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in classic add item:', error);
            await interaction.editReply({
                content: `❌ Error creating item: ${error.message}`
            });
        }
    },

    /**
     * Calculate rarity based on drop rate
     */
    calculateRarityFromDropRate(dropRate) {
        if (dropRate >= 40) return 'common';
        if (dropRate >= 21) return 'uncommon';
        if (dropRate >= 10) return 'rare';
        if (dropRate >= 4) return 'epic';
        if (dropRate >= 1) return 'legendary';
        return 'mythic'; // 0% or special cases
    },

    /**
     * Calculate max stack based on rarity
     */
    calculateMaxStackFromRarity(rarity) {
        switch (rarity) {
            case 'common':
            case 'uncommon':
            case 'rare':
                return 99;
            case 'epic':
                return 5;
            case 'legendary':
            case 'mythic':
                return 1;
            default:
                return 99;
        }
    },

    /**
     * Show simplified single add item modal
     */
    async showAddItemModal(interaction) {
        const nextItemId = await this.getNextItemId();

        const modal = new ModalBuilder()
            .setCustomId('gacha_add_item_simple')
            .setTitle('Add New Item - Smart Entry');

        const itemIdInput = new TextInputBuilder()
            .setCustomId('item_id')
            .setLabel('Item ID')
            .setStyle(TextInputStyle.Short)
            .setValue(nextItemId) // Auto-populate next ID
            .setPlaceholder('e.g., 300')
            .setRequired(true);

        const emojiInput = new TextInputBuilder()
            .setCustomId('item_emoji')
            .setLabel('Emoji')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('<:name:123456> or <a:name:123456> for animated')
            .setRequired(true);

        const nameSeriesInput = new TextInputBuilder()
            .setCustomId('name_series')
            .setLabel('Name, Series (comma separated)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Super Mario, Mario  OR  Just Item Name')
            .setRequired(true);

        const descFlavorInput = new TextInputBuilder()
            .setCustomId('desc_flavor')
            .setLabel('Description + Flavor Text (line break separated)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Main description here\nOptional flavor text here')
            .setRequired(true);

        const dropRateInput = new TextInputBuilder()
            .setCustomId('drop_rate')
            .setLabel('Drop Rate % (sets rarity & max stack auto)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('5 (40+=common, 21-39=uncommon, 10-20=rare, 4-9=epic, 1-3=legendary, 0=mythic)')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(itemIdInput),
            new ActionRowBuilder().addComponents(emojiInput),
            new ActionRowBuilder().addComponents(nameSeriesInput),
            new ActionRowBuilder().addComponents(descFlavorInput),
            new ActionRowBuilder().addComponents(dropRateInput)
        );

        await interaction.showModal(modal);
    },

    /**
     * Handle simplified add item modal submission
     */
    async handleAddItemSimple(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const itemId = interaction.fields.getTextInputValue('item_id').trim();
            const emojiInput = interaction.fields.getTextInputValue('item_emoji').trim();
            const nameSeriesInput = interaction.fields.getTextInputValue('name_series').trim();
            const descFlavorInput = interaction.fields.getTextInputValue('desc_flavor').trim();
            const dropRateStr = interaction.fields.getTextInputValue('drop_rate').trim();

            // Parse name and series
            const nameSeriesParts = nameSeriesInput.split(',').map(s => s.trim());
            const itemName = nameSeriesParts[0];
            const seriesId = nameSeriesParts.length > 1 ? nameSeriesParts[1] : null;

            // Parse description and flavor text
            const descFlavorParts = descFlavorInput.split('\n');
            const description = descFlavorParts[0]?.trim();
            const flavorText = descFlavorParts.length > 1 ? descFlavorParts.slice(1).join('\n').trim() : null;

            // Validate required fields
            if (!itemId || !itemName || !description || !emojiInput || !dropRateStr) {
                throw new Error('Item ID, name, description, emoji, and drop rate are required.');
            }

            // Check if item already exists
            const existingItem = await GachaItem.findOne({ itemId });
            if (existingItem) {
                throw new Error(`Item "${itemId}" already exists.`);
            }

            // Parse and validate drop rate
            const dropRate = parseFloat(dropRateStr);
            if (isNaN(dropRate) || dropRate < 0 || dropRate > 100) {
                throw new Error('Drop rate must be a number between 0 and 100.');
            }

            // Auto-calculate rarity and max stack
            const rarity = this.calculateRarityFromDropRate(dropRate);
            const maxStack = this.calculateMaxStackFromRarity(rarity);

            // Parse emoji
            const emojiData = this.parseEmojiInput(emojiInput);

            // Create item
            const newItem = new GachaItem({
                itemId,
                itemName,
                description,
                itemType: 'trinket', // Default type for now
                rarity,
                dropRate,
                emojiName: emojiData.emojiName,
                emojiId: emojiData.emojiId,
                isAnimated: emojiData.isAnimated,
                flavorText: flavorText || null,
                maxStack,
                seriesId: seriesId || null,
                createdBy: interaction.user.username
            });

            await newItem.save();

            const emoji = this.formatItemEmoji(newItem);
            const sourceText = dropRate > 0 ? `Gacha (${dropRate}% drop rate)` : 'Combination only';

            const embed = new EmbedBuilder()
                .setTitle('✅ Item Created Successfully!')
                .setColor(this.getRarityColor(rarity))
                .addFields(
                    { name: 'Preview', value: `${emoji} **${itemName}**`, inline: false },
                    { name: 'ID', value: itemId, inline: true },
                    { name: 'Rarity', value: `${rarity} (auto)`, inline: true },
                    { name: 'Max Stack', value: `${maxStack} (auto)`, inline: true },
                    { name: 'Source', value: sourceText, inline: true },
                    { name: 'Emoji Type', value: emojiData.isAnimated ? 'Animated' : 'Static', inline: true }
                );

            if (seriesId) {
                embed.addFields({ name: 'Series', value: seriesId, inline: true });
            }

            if (flavorText) {
                embed.addFields({ name: 'Flavor Text', value: `*${flavorText}*`, inline: false });
            }

            embed.addFields({
                name: 'Auto-Calculations',
                value: `**Rarity Logic:** ${dropRate}% → ${rarity}\n**Stack Logic:** ${rarity} → ${maxStack} max`,
                inline: false
            });

            embed.setFooter({ text: `Created by ${interaction.user.username}` });
            embed.setTimestamp();

            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_add_another_item')
                        .setLabel('Add Another')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('➕'),
                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_items')
                        .setLabel('Back to Items')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [backButton]
            });

        } catch (error) {
            console.error('Error creating item (simple):', error);
            await interaction.editReply({
                content: `❌ Error creating item: ${error.message}\n\n**Format Examples:**\n` +
                         `• **Name/Series:** "Super Mario, Mario" or just "Golden Scale"\n` +
                         `• **Desc/Flavor:** "A shimmering scale\\nWhispers of ancient power"\n` +
                         `• **Drop Rate:** 5 (sets rarity: 40+=common, 21-39=uncommon, 10-20=rare, 4-9=epic, 1-3=legendary, 0=mythic)\n` +
                         `• **Emoji:** Paste exactly as <:name:123> or <a:name:123>`
            });
        }
    },

    /**
     * Enhanced list items with filtering and pagination
     */
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

            // Filter dropdown
            const filterMenu = new StringSelectMenuBuilder()
                .setCustomId(`gacha_filter_items_${page}`)
                .setPlaceholder('Filter items...')
                .addOptions([
                    { label: 'All Items', value: 'all', emoji: '📦' },
                    { label: 'Gacha Items (Drop Rate > 0)', value: 'gacha', emoji: '🎰' },
                    { label: 'Combo-Only (Drop Rate = 0)', value: 'combo', emoji: '⚗️' },
                    { label: 'Recently Added', value: 'recent', emoji: '🆕' }
                ]);

            // Pagination buttons
            const paginationRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`gacha_items_page_${Math.max(1, page - 1)}_${filter}`)
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1),
                    
                    new ButtonBuilder()
                        .setCustomId('gacha_page_info')
                        .setLabel(`${page}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    
                    new ButtonBuilder()
                        .setCustomId(`gacha_items_page_${Math.min(totalPages, page + 1)}_${filter}`)
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages)
                );

            // Action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_add_item_modal')
                        .setLabel('Add Item')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('➕'),

                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_items')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            const components = [
                new ActionRowBuilder().addComponents(filterMenu),
                paginationRow,
                actionRow
            ];

            embed.setFooter({ text: 'Click an item ID to view details • 🎬 = Animated emoji' });

            await interaction.editReply({
                embeds: [embed],
                components: components
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

    /**
     * Show add combination modal
     */
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

    /**
     * Handle combination modal submission
     */
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

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_add_another_combo')
                        .setLabel('Add Another')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('➕'),
                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_combinations')
                        .setLabel('Back to Combinations')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({ 
                embeds: [embed],
                components: [actionButtons]
            });

        } catch (error) {
            console.error('Error creating combination:', error);
            await interaction.editReply({
                content: `❌ Error creating combination: ${error.message}\n\n**Format Examples:**\n` +
                         `• \`025x5 = 107\` (5 items with ID 025 make 1 item with ID 107)\n` +
                         `• \`(025x5) = 107\` (5 items with ID 025 make 1 item with ID 107, keeps ingredients)\n` +
                         `• \`001 + 003 = 999\` (item 001 + item 003 make item 999)\n` +
                         `• \`(001 + 003) = 999\` (item 001 + item 003 make item 999, keeps ingredients)\n\n` +
                         `**Non-Destructive Format Rules:**\n` +
                         `• Wrap ingredients in parentheses: \`(ingredients) = result\`\n` +
                         `• Perfect for series completion rewards!`
            });
        }
    },

    /**
     * Enhanced combination list with pagination
     */
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
            embed.setFooter({ text: '🔄 = Non-Destructive (keeps ingredients) • All combos require user confirmation' });

            // Pagination buttons
            const paginationRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`gacha_combo_page_${Math.max(1, page - 1)}`)
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 1),
                    
                    new ButtonBuilder()
                        .setCustomId('gacha_combo_page_info')
                        .setLabel(`${page}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    
                    new ButtonBuilder()
                        .setCustomId(`gacha_combo_page_${Math.min(totalPages, page + 1)}`)
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages)
                );

            // Action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_add_combination_modal')
                        .setLabel('Add Rule')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('➕'),
                    
                    new ButtonBuilder()
                        .setCustomId('gacha_manage_combinations')
                        .setLabel('Manage Rules')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('⚙️'),

                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_combinations')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            const components = totalPages > 1 ? [paginationRow, actionRow] : [actionRow];

            await interaction.editReply({
                embeds: [embed],
                components: components
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
     * Show give item modal
     */
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

    /**
     * Handle give item modal submission
     */
    async handleGiveItemSubmission(interaction) {
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
                
                if (combinationResult.publicAnnouncementSent && combinationResult.sentViaDM) {
                    message += '\n• Public announcement posted in gacha channel\n• Private combination options sent via DM';
                } else if (combinationResult.sentViaDM) {
                    message += '\n• Private combination options sent via DM';
                } else if (combinationResult.publicAnnouncementSent) {
                    message += '\n• Public announcement posted in gacha channel';
                }
            }

            const actionButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gacha_give_another_item')
                        .setLabel('Give Another')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎁'),
                    new ButtonBuilder()
                        .setCustomId('gacha_back_to_users')
                        .setLabel('Back to Users')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({ 
                content: message,
                components: [actionButtons]
            });

        } catch (error) {
            console.error('Error giving item:', error);
            await interaction.editReply({
                content: `❌ Error giving item: ${error.message}`
            });
        }
    },

    /**
     * Parse combination format (supports both destructive and non-destructive)
     */
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
            throw new Error('Format must use = or -> as separator (e.g., "025x5 = 107" or "(025+026) = 107")');
        }

        const parts = format.split(separator);
        if (parts.length !== 2) {
            throw new Error('Format must be: ingredients = result (e.g., "025x5 = 107" or "(025+026) = 107")');
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

        return { ingredients, result, isNonDestructive };
    },

    // Include all helper methods from original
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
     * Handle button interactions (called by index.js)
     */
    async handleButtonInteraction(interaction) {
        return this.handleInteraction(interaction);
    },

    /**
     * Handle select menu interactions (called by index.js)
     */
    async handleSelectMenuInteraction(interaction) {
        console.log('Gacha admin handling select menu:', interaction.customId);
        return this.handleInteraction(interaction);
    },

    /**
     * Handle modal submissions (called by index.js)
     */
    async handleModalSubmit(interaction) {
        return this.handleInteraction(interaction);
    },

    /**
     * Central handler for all button and menu interactions
     */
    async handleInteraction(interaction) {
        const customId = interaction.customId;

        try {
            // Main menu navigation
            if (customId === 'gacha_main_menu') {
                console.log('Handling main menu selection:', interaction.values[0]);
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
            if (customId === 'gacha_quick_add_item' || customId === 'gacha_add_item_modal') {
                await this.showAddItemModal(interaction);
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

            if (customId === 'gacha_back_to_items') {
                await this.handleItemsMenu(interaction);
                return;
            }

            if (customId === 'gacha_back_to_combinations') {
                await this.handleCombinationsMenu(interaction);
                return;
            }

            if (customId === 'gacha_back_to_users') {
                await this.handleUsersMenu(interaction);
                return;
            }

            // Item management
            if (customId === 'gacha_add_another_item') {
                await this.showAddItemModal(interaction);
                return;
            }

            // Continue to step 2 button
            if (customId.startsWith('gacha_continue_step2_')) {
                const encodedData = customId.replace('gacha_continue_step2_', '');
                const basicData = JSON.parse(Buffer.from(encodedData, 'base64').toString());
                await this.showAddItemStep2Modal(interaction, basicData);
                return;
            }

            // Combination management
            if (customId === 'gacha_add_combination_modal' || customId === 'gacha_add_another_combo') {
                await this.showAddCombinationModal(interaction);
                return;
            }

            // User management
            if (customId === 'gacha_give_item_modal' || customId === 'gacha_give_another_item') {
                await this.showGiveItemModal(interaction);
                return;
            }

            // Item pagination
            if (customId.startsWith('gacha_items_page_')) {
                const parts = customId.split('_');
                const page = parseInt(parts[3]);
                const filter = parts[4] || 'all';
                await this.handleItemsList(interaction, page, filter);
                return;
            }

            // Combination pagination
            if (customId.startsWith('gacha_combo_page_')) {
                const page = parseInt(customId.split('_')[3]);
                await this.handleCombinationsList(interaction, page);
                return;
            }

            // Filter handling
            if (customId.startsWith('gacha_filter_items_')) {
                console.log('Handling filter selection:', interaction.values[0]);
                const page = parseInt(customId.split('_')[3]) || 1;
                const filter = interaction.values[0];
                await this.handleItemsList(interaction, page, filter);
                return;
            }

            // Modal submissions
            if (customId === 'gacha_add_item_simple') {
                await this.handleAddItemSimple(interaction);
                return;
            }

            if (customId === 'gacha_add_combo_submit') {
                await this.handleCombinationModalSubmission(interaction);
                return;
            }

            if (customId === 'gacha_give_item_submit') {
                await this.handleGiveItemSubmission(interaction);
                return;
            }

            // Default fallback
            console.log(`Unhandled gacha interaction: ${customId}`);

        } catch (error) {
            console.error('Error handling gacha interaction:', error);
            
            const errorMessage = `❌ Error: ${error.message}`;
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: errorMessage, embeds: [], components: [] });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
};
