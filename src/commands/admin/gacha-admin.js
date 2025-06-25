// src/commands/admin/gacha-admin.js - Complete fixed version with proper embed validation
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
    INFO: '#17a2b8',
    PRIMARY: '#FF6B6B'
};

const RESULT_TYPE_EMOJIS = {
    single: '⚗️',
    choice: '🎯',
    random: '🎲'
};

const RARITY_COLORS = {
    common: '#95a5a6', 
    uncommon: '#2ecc71', 
    rare: '#3498db',
    epic: '#9b59b6', 
    legendary: '#f39c12', 
    mythic: '#e74c3c'
};

export default {
    data: new SlashCommandBuilder()
        .setName('gacha-admin')
        .setDescription('Gacha system management')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        
        .addSubcommand(sub => sub.setName('menu').setDescription('Interactive management interface'))
        
        .addSubcommand(sub => sub
            .setName('add-item').setDescription('Add new gacha item')
            .addStringOption(opt => opt.setName('item-id').setDescription('Unique item ID').setRequired(true))
            .addStringOption(opt => opt.setName('name').setDescription('Item name').setRequired(true))
            .addStringOption(opt => opt.setName('description').setDescription('Item description').setRequired(true))
            .addStringOption(opt => opt.setName('emoji-input').setDescription('Discord emoji (<:name:id> or <a:name:id>)').setRequired(true))
            .addStringOption(opt => opt.setName('type').setDescription('Item type').setRequired(true)
                .addChoices(...['trinket', 'collectible', 'series', 'special', 'combined'].map(v => ({ name: v.charAt(0).toUpperCase() + v.slice(1), value: v }))))
            .addStringOption(opt => opt.setName('rarity').setDescription('Item rarity').setRequired(true)
                .addChoices(...['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].map(v => ({ name: v.charAt(0).toUpperCase() + v.slice(1), value: v }))))
            .addNumberOption(opt => opt.setName('drop-rate').setDescription('Drop rate % (0 = combination-only)').setRequired(true).setMinValue(0).setMaxValue(100))
            .addStringOption(opt => opt.setName('flavor-text').setDescription('Flavor text (optional)'))
            .addIntegerOption(opt => opt.setName('max-stack').setDescription('Max stack size (default: 99)').setMinValue(1).setMaxValue(999))
            .addStringOption(opt => opt.setName('series-id').setDescription('Series ID (optional)')))

        .addSubcommand(sub => sub
            .setName('list-items').setDescription('List gacha items')
            .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setMinValue(1))
            .addStringOption(opt => opt.setName('filter').setDescription('Filter items')
                .addChoices({ name: 'All items', value: 'all' }, { name: 'Gacha items', value: 'gacha' }, { name: 'Combination-only', value: 'combo' })))

        .addSubcommand(sub => sub
            .setName('edit-item').setDescription('Edit existing item')
            .addStringOption(opt => opt.setName('item-id').setDescription('Item ID to edit').setRequired(true))
            .addStringOption(opt => opt.setName('name').setDescription('New name'))
            .addStringOption(opt => opt.setName('description').setDescription('New description'))
            .addStringOption(opt => opt.setName('emoji-input').setDescription('New emoji'))
            .addStringOption(opt => opt.setName('type').setDescription('New type')
                .addChoices(...['trinket', 'collectible', 'series', 'special', 'combined'].map(v => ({ name: v.charAt(0).toUpperCase() + v.slice(1), value: v }))))
            .addStringOption(opt => opt.setName('rarity').setDescription('New rarity')
                .addChoices(...['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].map(v => ({ name: v.charAt(0).toUpperCase() + v.slice(1), value: v }))))
            .addNumberOption(opt => opt.setName('drop-rate').setDescription('New drop rate %').setMinValue(0).setMaxValue(100))
            .addStringOption(opt => opt.setName('flavor-text').setDescription('New flavor text'))
            .addIntegerOption(opt => opt.setName('max-stack').setDescription('New max stack').setMinValue(1).setMaxValue(999))
            .addStringOption(opt => opt.setName('series-id').setDescription('New series ID')))

        .addSubcommand(sub => sub
            .setName('delete-item').setDescription('Delete gacha item')
            .addStringOption(opt => opt.setName('item-id').setDescription('Item ID to delete').setRequired(true))
            .addBooleanOption(opt => opt.setName('force').setDescription('Force delete (breaks combinations)')))

        .addSubcommand(sub => sub
            .setName('view-item').setDescription('View item details')
            .addStringOption(opt => opt.setName('item-id').setDescription('Item ID to view').setRequired(true)))

        .addSubcommand(sub => sub.setName('add-combination').setDescription('Add combination rule'))

        .addSubcommand(sub => sub
            .setName('list-combinations').setDescription('List combination rules')
            .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setMinValue(1))
            .addStringOption(opt => opt.setName('filter').setDescription('Filter by result type')
                .addChoices(
                    { name: 'All combinations', value: 'all' },
                    { name: 'Single result', value: 'single' },
                    { name: 'Choice result', value: 'choice' },
                    { name: 'Random result', value: 'random' },
                    { name: 'Non-destructive', value: 'nondestructive' }
                )))

        .addSubcommand(sub => sub
            .setName('remove-combination').setDescription('Remove combination rule')
            .addStringOption(opt => opt.setName('rule-id').setDescription('Rule ID to remove').setRequired(true)))

        .addSubcommand(sub => sub
            .setName('debug-combination').setDescription('Debug combination rule')
            .addStringOption(opt => opt.setName('rule-id').setDescription('Rule ID to debug').setRequired(true)))

        .addSubcommand(sub => sub
            .setName('give-item').setDescription('Give item to user')
            .addStringOption(opt => opt.setName('username').setDescription('Username').setRequired(true))
            .addStringOption(opt => opt.setName('item-id').setDescription('Item ID').setRequired(true))
            .addIntegerOption(opt => opt.setName('quantity').setDescription('Quantity (default: 1)').setMinValue(1).setMaxValue(100)))

        .addSubcommand(sub => sub
            .setName('clear-collection').setDescription('Clear user collection')
            .addStringOption(opt => opt.setName('username').setDescription('Username').setRequired(true))
            .addBooleanOption(opt => opt.setName('confirm').setDescription('Confirm action').setRequired(true)))

        .addSubcommand(sub => sub
            .setName('convert-combination').setDescription('Convert existing combination to new type')
            .addStringOption(opt => opt.setName('rule-id').setDescription('Rule ID to convert').setRequired(true))
            .addStringOption(opt => opt.setName('new-type').setDescription('New result type').setRequired(true)
                .addChoices({ name: 'Single result', value: 'single' }, { name: 'Choice result', value: 'choice' }, { name: 'Random result', value: 'random' })))

        .addSubcommand(sub => sub.setName('combination-stats').setDescription('View combination system statistics')),

    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Administrator permissions required.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'menu') {
            return this.handleMainMenu(interaction);
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const handlers = {
                'add-item': () => this.handleAddItem(interaction),
                'list-items': () => this.handlePaginatedList(interaction, 'items'),
                'edit-item': () => this.handleEditItem(interaction),
                'delete-item': () => this.handleDeleteItem(interaction),
                'view-item': () => this.handleViewItem(interaction),
                'add-combination': () => this.showModal(interaction, 'combination'),
                'list-combinations': () => this.handlePaginatedList(interaction, 'combinations'),
                'remove-combination': () => this.handleRemoveCombination(interaction),
                'debug-combination': () => this.handleDebugCombination(interaction),
                'give-item': () => this.handleGiveItem(interaction),
                'clear-collection': () => this.handleClearCollection(interaction),
                'convert-combination': () => this.handleConvertCombination(interaction),
                'combination-stats': () => this.handleCombinationStats(interaction)
            };

            await (handlers[subcommand] || (() => { throw new Error('Unknown subcommand'); }))();
        } catch (error) {
            console.error('Error in gacha-admin command:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // Core utility methods
    async getSystemStats() {
        const [itemStats, comboStats, userStats] = await Promise.all([
            this.getItemStats(),
            this.getComboStats(),
            this.getUserStats()
        ]);
        return { ...itemStats, ...comboStats, ...userStats };
    },

    async getItemStats() {
        const [totalItems, gachaItems, comboOnlyItems] = await Promise.all([
            GachaItem.countDocuments({ isActive: true }),
            GachaItem.countDocuments({ isActive: true, dropRate: { $gt: 0 } }),
            GachaItem.countDocuments({ isActive: true, dropRate: 0 })
        ]);
        return { totalItems, gachaItems, comboOnlyItems };
    },

    async getComboStats() {
        const [totalCombos, nonDestructive, singleCombos, choiceCombos, randomCombos, discoveredCombos] = await Promise.all([
            CombinationRule.countDocuments({ isActive: true }),
            CombinationRule.countDocuments({ isActive: true, isNonDestructive: true }),
            CombinationRule.countDocuments({ isActive: true, resultType: 'single' }),
            CombinationRule.countDocuments({ isActive: true, resultType: 'choice' }),
            CombinationRule.countDocuments({ isActive: true, resultType: 'random' }),
            CombinationRule.countDocuments({ isActive: true, discovered: true })
        ]);
        return { totalCombos, nonDestructive, singleCombos, choiceCombos, randomCombos, discoveredCombos };
    },

    async getUserStats() {
        const totalUsers = await User.countDocuments({ 'gachaCollection.0': { $exists: true } });
        const totalCollectionItems = await User.aggregate([
            { $unwind: '$gachaCollection' },
            { $group: { _id: null, total: { $sum: '$gachaCollection.quantity' } } }
        ]);
        return { totalUsers, totalItems: totalCollectionItems[0]?.total || 0 };
    },

    createEmbed(title, color = COLORS.INFO, description = null) {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setTimestamp();
        
        // Only set description if it's not null/undefined and has content
        if (description && description.trim().length > 0) {
            embed.setDescription(description);
        }
        
        return embed;
    },

    createButton(customId, label, style = ButtonStyle.Secondary, emoji = null, disabled = false) {
        const button = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
        if (emoji) button.setEmoji(emoji);
        return button;
    },

    createSelectMenu(customId, placeholder, options) {
        return new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options);
    },

    // FIXED: Enhanced emoji parsing with comprehensive validation
    parseEmojiInput(emojiInput) {
        if (!emojiInput || typeof emojiInput !== 'string') {
            throw new Error('Emoji input is required');
        }
        
        const match = emojiInput.trim().match(/<(a?):([^:]+):(\d+)>/);
        if (!match) {
            throw new Error('Invalid emoji format. Use Discord emoji format: <:name:id> or <a:name:id>');
        }
        
        const [, animatedFlag, emojiName, emojiId] = match;
        
        // Validate emoji name (Discord requirements)
        if (emojiName.length < 2 || emojiName.length > 32) {
            throw new Error('Emoji name must be between 2 and 32 characters');
        }
        
        // Validate emoji ID (should be Discord snowflake)
        if (!/^\d{17,19}$/.test(emojiId)) {
            throw new Error('Invalid emoji ID format');
        }
        
        return { 
            emojiName: emojiName.trim(), 
            emojiId: emojiId.trim(), 
            isAnimated: animatedFlag === 'a' 
        };
    },

    // FIXED: Safe emoji formatting with proper validation and fallbacks
    formatItemEmoji(item) {
        try {
            if (!item) {
                return '❓';
            }
            
            if (item.emojiId && item.emojiName) {
                // Validate emoji ID format (Discord snowflake: 17-19 digits)
                if (!/^\d{17,19}$/.test(item.emojiId)) {
                    console.warn(`Invalid emoji ID for item ${item.itemId}: ${item.emojiId}`);
                    return item.emojiName || '❓';
                }
                
                // Validate emoji name length
                if (item.emojiName.length < 2 || item.emojiName.length > 32) {
                    console.warn(`Invalid emoji name length for item ${item.itemId}: ${item.emojiName}`);
                    return '❓';
                }
                
                const prefix = item.isAnimated ? 'a' : '';
                return `<${prefix}:${item.emojiName}:${item.emojiId}>`;
            }
            
            return item.emojiName || '❓';
        } catch (error) {
            console.error('Error formatting emoji for item:', item?.itemId, error);
            return '❓';
        }
    },

    // ENHANCED: Embed validation helper
    validateEmbedFields(embed) {
        try {
            const embedData = embed.toJSON();
            
            // Check overall embed size (Discord limit: ~6000 characters)
            const embedSize = JSON.stringify(embedData).length;
            if (embedSize > 6000) {
                console.warn('Embed exceeds Discord size limit:', embedSize);
                return false;
            }
            
            // Check description length
            if (embedData.description && embedData.description.length > 4096) {
                console.warn('Embed description too long:', embedData.description.length);
                return false;
            }
            
            // Check field limits
            if (embedData.fields) {
                for (const field of embedData.fields) {
                    if (field.name && field.name.length > 256) {
                        console.warn('Field name too long:', field.name.length);
                        return false;
                    }
                    if (field.value && field.value.length > 1024) {
                        console.warn('Field value too long:', field.value.length);
                        return false;
                    }
                }
            }
            
            return true;
        } catch (error) {
            console.error('Embed validation failed:', error);
            return false;
        }
    },

    async findItem(itemId) {
        const item = await GachaItem.findOne({ itemId });
        if (!item) throw new Error(`Item "${itemId}" not found.`);
        return item;
    },

    async findUser(username) {
        const user = await User.findOne({ raUsername: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (!user) throw new Error(`User "${username}" not found.`);
        return user;
    },

    async findRule(ruleId) {
        const rule = await CombinationRule.findOne({ ruleId, isActive: true });
        if (!rule) throw new Error(`Rule "${ruleId}" not found.`);
        return rule;
    },

    // Main menu system
    async handleMainMenu(interaction) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
        }

        const stats = await this.getSystemStats();
        const embed = this.createEmbed('🎰 Gacha System Management', COLORS.PRIMARY)
            .addFields(
                {
                    name: '📊 System Overview',
                    value: `**Items:** ${stats.totalItems} (${stats.gachaItems} gacha, ${stats.comboOnlyItems} combo-only)\n` +
                           `**Combinations:** ${stats.totalCombos} (${stats.choiceCombos} choice, ${stats.randomCombos} random)\n` +
                           `**Non-destructive:** ${stats.nonDestructive} • **Active Collectors:** ${stats.totalUsers}`,
                    inline: true
                },
                {
                    name: '⚡ Quick Actions',
                    value: '• **Use direct commands** for creation\n• **Browse & manage** via interface\n• **Enhanced:** Random & choice combinations',
                    inline: true
                }
            );

        const selectMenu = this.createSelectMenu('gacha-admin_main_menu', 'Choose management category...', [
            { label: 'Items Management', description: 'Browse, edit, view items', value: 'items', emoji: '📦' },
            { label: 'Combinations', description: 'Manage recipes (enhanced)', value: 'combinations', emoji: '⚗️' },
            { label: 'User Management', description: 'Give items, clear collections', value: 'users', emoji: '👥' },
            { label: 'Analytics', description: 'View statistics', value: 'analytics', emoji: '📊' }
        ]);

        const components = [
            new ActionRowBuilder().addComponents(selectMenu),
            new ActionRowBuilder().addComponents(
                this.createButton('gacha-admin_quick_list_items', 'Browse Items', ButtonStyle.Primary, '📋'),
                this.createButton('gacha-admin_quick_combinations', 'Combinations', ButtonStyle.Secondary, '⚗️'),
                this.createButton('gacha-admin_refresh_main', 'Refresh', ButtonStyle.Secondary, '🔄')
            )
        ];

        await interaction.editReply({ embeds: [embed], components });
    },

    async handleMenuNavigation(interaction, menuType) {
        if (!interaction.deferred) await interaction.deferUpdate();

        const handlers = {
            items: () => this.showItemsMenu(interaction),
            combinations: () => this.showCombinationsMenu(interaction),
            users: () => this.showUsersMenu(interaction),
            analytics: () => this.showAnalyticsMenu(interaction)
        };

        await handlers[menuType]();
    },

    async showItemsMenu(interaction) {
        const stats = await this.getItemStats();
        const nextId = await this.getNextItemId();

        const embed = this.createEmbed('📦 Items Management', '#4ECDC4')
            .addFields(
                { name: '📈 Statistics', value: `**Total:** ${stats.totalItems}\n**Gacha:** ${stats.gachaItems}\n**Combo-only:** ${stats.comboOnlyItems}\n**Next ID:** ${nextId}`, inline: true },
                { name: '🎯 Actions', value: '• Use commands for creation\n• Browse items below', inline: true }
            );

        const components = [new ActionRowBuilder().addComponents(
            this.createButton('gacha-admin_list_items_menu', 'Browse Items', ButtonStyle.Primary, '📋'),
            this.createButton('gacha-admin_back_to_main', 'Back', ButtonStyle.Secondary, '⬅️')
        )];

        await interaction.editReply({ embeds: [embed], components });
    },

    async showCombinationsMenu(interaction) {
        const stats = await this.getComboStats();

        const embed = this.createEmbed('⚗️ Enhanced Combinations Management', '#9B59B6')
            .addFields(
                {
                    name: '🔬 Statistics',
                    value: `**Total:** ${stats.totalCombos}\n**Single:** ${stats.singleCombos}\n**Choice:** ${stats.choiceCombos} 🎯\n**Random:** ${stats.randomCombos} 🎲\n**Non-Destructive:** ${stats.nonDestructive} 🔄`,
                    inline: true
                },
                {
                    name: '💡 Types',
                    value: '**Single**: `001 + 002 = 003`\n**Choice**: `001 + 002 = 003, 004, 005`\n**Random**: `001 + 002 = (003, 004, 005)`\n**Non-destructive**: `(001 + 002) = 003`',
                    inline: true
                }
            );

        const components = [new ActionRowBuilder().addComponents(
            this.createButton('gacha-admin_add_combination_modal', 'Create Rule', ButtonStyle.Success, '➕'),
            this.createButton('gacha-admin_list_combinations_menu', 'Browse Rules', ButtonStyle.Primary, '📋'),
            this.createButton('gacha-admin_combination_stats', 'Advanced Stats', ButtonStyle.Secondary, '📊'),
            this.createButton('gacha-admin_back_to_main', 'Back', ButtonStyle.Secondary, '⬅️')
        )];

        await interaction.editReply({ embeds: [embed], components });
    },

    async showUsersMenu(interaction) {
        const stats = await this.getUserStats();

        const embed = this.createEmbed('👥 User Management', '#E67E22')
            .addFields(
                { name: '👤 Statistics', value: `**Active Collectors:** ${stats.totalUsers}\n**Total Items Owned:** ${stats.totalItems}\n**Avg Items/User:** ${stats.totalUsers > 0 ? Math.round(stats.totalItems / stats.totalUsers) : 0}`, inline: true },
                { name: '🎁 Tools', value: '• Give items to users\n• Clear collections\n• Automatic combination alerts', inline: true }
            );

        const components = [new ActionRowBuilder().addComponents(
            this.createButton('gacha-admin_give_item_modal', 'Give Item', ButtonStyle.Success, '🎁'),
            this.createButton('gacha-admin_back_to_main', 'Back', ButtonStyle.Secondary, '⬅️')
        )];

        await interaction.editReply({ embeds: [embed], components });
    },

    async showAnalyticsMenu(interaction) {
        const stats = await this.getSystemStats();
        const popularItems = await this.getPopularItems();

        const embed = this.createEmbed('📊 System Analytics', '#3498DB')
            .addFields(
                { name: '📈 Overview', value: `**Items:** ${stats.totalItems}\n**Users:** ${stats.totalUsers}\n**Combinations:** ${stats.totalCombos}\n**Discovered:** ${stats.discoveredCombos}`, inline: true },
                { name: '🔥 Popular Items', value: popularItems.length > 0 ? popularItems.map(item => `**${item._id}**: ${item.totalOwned} owned`).join('\n') : 'No data available', inline: true }
            );

        const components = [new ActionRowBuilder().addComponents(
            this.createButton('gacha-admin_back_to_main', 'Back', ButtonStyle.Secondary, '⬅️')
        )];

        await interaction.editReply({ embeds: [embed], components });
    },

    async getPopularItems() {
        return User.aggregate([
            { $unwind: '$gachaCollection' },
            { $group: { _id: '$gachaCollection.itemId', totalOwned: { $sum: '$gachaCollection.quantity' } } },
            { $sort: { totalOwned: -1 } },
            { $limit: 3 }
        ]);
    },

    async getNextItemId() {
        const items = await GachaItem.find({ isActive: true }, { itemId: 1 });
        const numericIds = items.map(item => parseInt(item.itemId)).filter(id => !isNaN(id)).sort((a, b) => b - a);
        return numericIds.length === 0 ? '001' : (numericIds[0] + 1).toString().padStart(3, '0');
    },

    // Paginated list handlers
    async handlePaginatedList(interaction, type) {
        const page = interaction.options.getInteger('page') || 1;
        const filter = interaction.options.getString('filter') || 'all';
        
        if (type === 'items') {
            await this.showItemsList(interaction, page, filter);
        } else if (type === 'combinations') {
            await this.showCombinationsList(interaction, page, filter);
        }
    },

    async showItemsList(interaction, page, filter) {
        if (!interaction.deferred) await interaction.deferUpdate();

        const itemsPerPage = 12;
        const { query, title } = this.getItemsQuery(filter);
        const totalItems = await GachaItem.countDocuments(query);
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const items = await GachaItem.find(query).skip((page - 1) * itemsPerPage).limit(itemsPerPage);

        const embed = this.createEmbed(`${title} - Page ${page}/${totalPages}`, '#4ECDC4', `Showing ${items.length} of ${totalItems} items`);
        
        if (items.length > 0) {
            const itemsList = items.map(item => {
                const emoji = this.formatItemEmoji(item);
                const id = item.itemId.length > 8 ? item.itemId.substring(0, 8) + '...' : item.itemId;
                const name = item.itemName.length > 18 ? item.itemName.substring(0, 15) + '...' : item.itemName;
                const flags = (item.isAnimated ? '🎬' : '');
                return `${emoji} **${id}** - ${name} (${item.rarity[0].toUpperCase()}, ${item.dropRate}%) ${flags}`;
            }).join('\n');
            embed.addFields({ name: 'Items', value: itemsList });
        }

        const components = this.buildPaginatedComponents('items', page, totalPages, filter, [
            { label: 'All Items', value: 'all', emoji: '📦' },
            { label: 'Gacha Items', value: 'gacha', emoji: '🎰' },
            { label: 'Combo-Only', value: 'combo', emoji: '⚗️' }
        ]);

        await interaction.editReply({ embeds: [embed], components });
    },

    async showCombinationsList(interaction, page, filter) {
        if (!interaction.deferred) await interaction.deferUpdate();

        const rulesPerPage = 8;
        const { query, title } = this.getCombinationsQuery(filter);
        const totalRules = await CombinationRule.countDocuments(query);
        const totalPages = Math.ceil(totalRules / rulesPerPage);
        const rules = await CombinationRule.find(query).sort({ priority: -1, ruleId: 1 }).skip((page - 1) * rulesPerPage).limit(rulesPerPage);

        if (rules.length === 0) {
            const embed = this.createEmbed(`${title} - No Rules Found`, '#95a5a6', `No ${filter === 'all' ? '' : filter + ' '}combination rules found.`);
            const components = [new ActionRowBuilder().addComponents(
                this.createButton('gacha-admin_add_combination_modal', 'Create First Rule', ButtonStyle.Primary, '➕'),
                this.createButton('gacha-admin_back_to_combinations', 'Back', ButtonStyle.Secondary, '⬅️')
            )];
            return interaction.editReply({ embeds: [embed], components });
        }

        const embed = this.createEmbed(`${title} - Page ${page}/${totalPages}`, '#9B59B6', `${rules.length} rules (${totalRules} total)`);
        const rulesText = await this.formatRulesList(rules);
        embed.addFields({ name: 'Rules', value: rulesText });

        const components = this.buildPaginatedComponents('combinations', page, totalPages, filter, [
            { label: 'All Rules', value: 'all', emoji: '⚗️' },
            { label: 'Single Result', value: 'single', emoji: '⚗️' },
            { label: 'Choice Result', value: 'choice', emoji: '🎯' },
            { label: 'Random Result', value: 'random', emoji: '🎲' },
            { label: 'Non-Destructive', value: 'nondestructive', emoji: '🔄' }
        ]);

        await interaction.editReply({ embeds: [embed], components });
    },

    getItemsQuery(filter) {
        const queries = {
            all: { query: { isActive: true }, title: '📦 All Items' },
            gacha: { query: { isActive: true, dropRate: { $gt: 0 } }, title: '🎰 Gacha Items' },
            combo: { query: { isActive: true, dropRate: 0 }, title: '⚗️ Combo-Only Items' }
        };
        return queries[filter] || queries.all;
    },

    getCombinationsQuery(filter) {
        const baseQuery = { isActive: true };
        const queries = {
            all: { query: baseQuery, title: '⚗️ All Combination Rules' },
            single: { query: { ...baseQuery, resultType: 'single' }, title: '⚗️ Single Result Rules' },
            choice: { query: { ...baseQuery, resultType: 'choice' }, title: '🎯 Choice Result Rules' },
            random: { query: { ...baseQuery, resultType: 'random' }, title: '🎲 Random Result Rules' },
            nondestructive: { query: { ...baseQuery, isNonDestructive: true }, title: '🔄 Non-Destructive Rules' }
        };
        return queries[filter] || queries.all;
    },

    async formatRulesList(rules) {
        let rulesText = '';
        for (const rule of rules) {
            const typeEmoji = RESULT_TYPE_EMOJIS[rule.resultType] || '⚗️';
            const flags = (rule.isNonDestructive ? ' 🔄' : '');
            const ingredients = rule.ingredients.map(ing => ing.quantity > 1 ? `${ing.itemId}x${ing.quantity}` : ing.itemId);
            const ingredientsDisplay = rule.isNonDestructive ? `(${ingredients.join(' + ')})` : ingredients.join(' + ');
            
            let resultDisplay = '';
            if (rule.resultType === 'single') {
                const resultItem = await GachaItem.findOne({ itemId: rule.result.itemId });
                resultDisplay = resultItem ? `${this.formatItemEmoji(resultItem)} ${resultItem.itemName}` : '❓ Missing';
            } else {
                resultDisplay = `${typeEmoji} ${rule.resultType} (${rule.results?.length || 0} options)`;
            }
            
            rulesText += `**${rule.ruleId}** ${typeEmoji}${flags} (${rule.priority})\n${ingredientsDisplay} = ${resultDisplay}\n\n`;
        }
        return rulesText;
    },

    buildPaginatedComponents(type, page, totalPages, filter, filterOptions) {
        const components = [];
        
        // Filter dropdown
        components.push(new ActionRowBuilder().addComponents(
            this.createSelectMenu(`gacha-admin_filter_${type}_${page}`, `Filter ${type}...`, filterOptions)
        ));

        // Pagination (if needed)
        if (totalPages > 1) {
            components.push(new ActionRowBuilder().addComponents(
                this.createButton(`gacha-admin_${type}_page_${Math.max(1, page - 1)}_${filter}`, '◀ Previous', ButtonStyle.Secondary, null, page === 1),
                this.createButton('gacha-admin_page_info', `${page}/${totalPages}`, ButtonStyle.Secondary, null, true),
                this.createButton(`gacha-admin_${type}_page_${Math.min(totalPages, page + 1)}_${filter}`, 'Next ▶', ButtonStyle.Secondary, null, page === totalPages)
            ));
        }

        // Action buttons
        const actionButtons = type === 'combinations' 
            ? [this.createButton('gacha-admin_add_combination_modal', 'Add Rule', ButtonStyle.Success, '➕')]
            : [];
        actionButtons.push(this.createButton(`gacha-admin_back_to_${type === 'items' ? 'items' : 'combinations'}`, 'Back', ButtonStyle.Secondary, '⬅️'));
        
        components.push(new ActionRowBuilder().addComponents(...actionButtons));

        return components;
    },

    // COMPLETELY FIXED: handleAddItem method with comprehensive validation and safe embed building
    async handleAddItem(interaction) {
        try {
            const itemData = this.extractItemOptions(interaction);
            
            // STEP 1: Validate input lengths BEFORE processing (Discord-safe limits)
            if (itemData.itemName && itemData.itemName.length > 100) {
                throw new Error('Item name must be 100 characters or less');
            }
            
            if (itemData.description && itemData.description.length > 500) {
                throw new Error('Description must be 500 characters or less');
            }
            
            if (itemData.flavorText && itemData.flavorText.length > 500) {
                throw new Error('Flavor text must be 500 characters or less');
            }

            // STEP 2: Check for existing item
            if (await GachaItem.findOne({ itemId: itemData.itemId })) {
                throw new Error(`Item "${itemData.itemId}" already exists.`);
            }

            // STEP 3: Parse and validate emoji data
            const emojiData = this.parseEmojiInput(itemData.emojiInput);

            // STEP 4: Create and save the item
            const newItem = new GachaItem({
                ...itemData,
                ...emojiData,
                maxStack: itemData.maxStack || 99,
                createdBy: interaction.user.username
            });

            await newItem.save();
            console.log(`✅ Item saved successfully: ${itemData.itemId}`);

            // STEP 5: Build safe embed with validation
            const embed = this.createEmbed(
                '✅ Item Created', 
                RARITY_COLORS[itemData.rarity] || COLORS.SUCCESS
            );
            
            // Safe emoji preview with comprehensive fallbacks
            let previewText;
            try {
                const emojiDisplay = this.formatItemEmoji(newItem);
                previewText = `${emojiDisplay} **${itemData.itemName}**`;
            } catch (emojiError) {
                console.warn('Emoji formatting error:', emojiError);
                previewText = `❓ **${itemData.itemName}**`;
            }
            
            // Build details text with safe truncation
            const sourceText = itemData.dropRate > 0 ? `Gacha (${itemData.dropRate}%)` : 'Combination only';
            const detailsText = `**ID:** ${itemData.itemId}\n**Type:** ${itemData.itemType}\n**Rarity:** ${itemData.rarity}\n**Source:** ${sourceText}`;
            
            // Add fields with Discord length limits enforced
            embed.addFields(
                { 
                    name: 'Preview', 
                    value: previewText.slice(0, 1024), // Discord field value limit
                    inline: false 
                },
                { 
                    name: 'Details', 
                    value: detailsText.slice(0, 1024), // Discord field value limit
                    inline: false 
                }
            );

            // Add flavor text field if present and within limits
            if (itemData.flavorText && itemData.flavorText.trim()) {
                const flavorValue = `*${itemData.flavorText.trim()}*`;
                if (flavorValue.length <= 1024) {
                    embed.addFields({ 
                        name: 'Flavor Text', 
                        value: flavorValue,
                        inline: false 
                    });
                }
            }

            // STEP 6: Validate embed before sending
            if (!this.validateEmbedFields(embed)) {
                // Fallback to minimal embed if validation fails
                const fallbackEmbed = this.createEmbed(
                    '✅ Item Created Successfully', 
                    COLORS.SUCCESS,
                    `**${itemData.itemName}** (ID: ${itemData.itemId}) has been created and saved to the database.`
                );
                
                await interaction.editReply({ embeds: [fallbackEmbed] });
                console.log('Used fallback embed due to validation failure');
                return;
            }

            // STEP 7: Send the embed
            await interaction.editReply({ embeds: [embed] });
            console.log('✅ Successfully sent item creation embed');
            
        } catch (error) {
            console.error('Error in handleAddItem:', error);
            
            // Differentiate between validation errors and Discord API errors
            if (error.message.includes('already exists') || 
                error.message.includes('must be') || 
                error.message.includes('Invalid emoji') ||
                error.message.includes('characters or less')) {
                // These are validation errors before saving
                throw error;
            }
            
            // If it's a Discord API error after successful save, provide helpful message
            const errorMessage = error.message.includes('Invalid Form Body') || 
                                error.message.includes('received one or more errors') ||
                                error.code === 50035
                ? `Item created successfully! However, there was an issue displaying the result. Check your collection to confirm the item "${interaction.options.getString('item-id')}" was added.`
                : error.message;
                
            throw new Error(errorMessage);
        }
    },

    extractItemOptions(interaction) {
        return {
            itemId: interaction.options.getString('item-id'),
            itemName: interaction.options.getString('name'),
            description: interaction.options.getString('description'),
            emojiInput: interaction.options.getString('emoji-input'),
            itemType: interaction.options.getString('type'),
            rarity: interaction.options.getString('rarity'),
            dropRate: interaction.options.getNumber('drop-rate'),
            flavorText: interaction.options.getString('flavor-text'),
            maxStack: interaction.options.getInteger('max-stack'),
            seriesId: interaction.options.getString('series-id')
        };
    },

    async handleEditItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        const item = await this.findItem(itemId);
        
        const updates = {};
        const changes = [];
        const fieldMap = { 'name': 'itemName', 'description': 'description', 'type': 'itemType', 'rarity': 'rarity', 'drop-rate': 'dropRate', 'flavor-text': 'flavorText', 'max-stack': 'maxStack', 'series-id': 'seriesId' };

        for (const [option, field] of Object.entries(fieldMap)) {
            const value = option.includes('-') ? interaction.options.getNumber(option) || interaction.options.getInteger(option) : interaction.options.getString(option);
            if (value !== null && value !== undefined && value !== item[field]) {
                updates[field] = value;
                changes.push(`${option}: "${item[field]}" → "${value}"`);
            }
        }

        const emojiInput = interaction.options.getString('emoji-input');
        if (emojiInput) {
            const emojiData = this.parseEmojiInput(emojiInput);
            if (emojiData.emojiName !== item.emojiName || emojiData.emojiId !== item.emojiId) {
                Object.assign(updates, emojiData);
                changes.push('Emoji updated');
            }
        }

        if (changes.length === 0) {
            return interaction.editReply(`❌ No changes specified for item "${itemId}".`);
        }

        Object.assign(item, updates);
        await item.save();

        const embed = this.createEmbed('✅ Item Updated', COLORS.SUCCESS, `${this.formatItemEmoji(item)} **${item.itemName}** (${itemId})`)
            .addFields({ name: 'Changes', value: changes.join('\n') });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleDeleteItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        const force = interaction.options.getBoolean('force') || false;
        const item = await this.findItem(itemId);

        const usedInCombinations = await CombinationRule.find({
            $or: [{ 'ingredients.itemId': itemId }, { 'result.itemId': itemId }, { 'results.itemId': itemId }],
            isActive: true
        });

        if (usedInCombinations.length > 0 && !force) {
            const embed = this.createEmbed('⚠️ Cannot Delete Item', COLORS.WARNING, `Item "${itemId}" is used in ${usedInCombinations.length} combination(s).`)
                .addFields({ name: 'To delete anyway', value: 'Use `force: true` (breaks combinations)' });
            return interaction.editReply({ embeds: [embed] });
        }

        const usersWithItem = await User.find({ 'gachaCollection.itemId': itemId });
        const totalItemsRemoved = usersWithItem.reduce((total, user) => {
            const userItem = user.gachaCollection.find(ci => ci.itemId === itemId);
            return total + (userItem?.quantity || 0);
        }, 0);

        if (force) {
            await CombinationRule.updateMany({ _id: { $in: usedInCombinations.map(r => r._id) } }, { isActive: false });
        }

        for (const user of usersWithItem) {
            user.gachaCollection = user.gachaCollection.filter(ci => ci.itemId !== itemId);
            await user.save();
        }

        await GachaItem.findOneAndDelete({ itemId });

        const embed = this.createEmbed('✅ Item Deleted', COLORS.SUCCESS, `${this.formatItemEmoji(item)} **${item.itemName}** deleted.`)
            .addFields(
                { name: 'Impact', value: `**Users Affected:** ${usersWithItem.length}\n**Items Removed:** ${totalItemsRemoved}${force && usedInCombinations.length > 0 ? `\n**Rules Disabled:** ${usedInCombinations.length}` : ''}` }
            );

        await interaction.editReply({ embeds: [embed] });
    },

    async handleViewItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        const item = await this.findItem(itemId);

        const [usedInIngredients, usedInSingleResults, usedInMultiResults, usersWithItem] = await Promise.all([
            CombinationRule.find({ 'ingredients.itemId': itemId, isActive: true }),
            CombinationRule.find({ 'result.itemId': itemId, isActive: true }),
            CombinationRule.find({ 'results.itemId': itemId, isActive: true }),
            User.countDocuments({ 'gachaCollection.itemId': itemId })
        ]);

        const embed = this.createEmbed(`${this.formatItemEmoji(item)} ${item.itemName}`, RARITY_COLORS[item.rarity], item.description)
            .addFields(
                { name: 'Properties', value: `**ID:** ${item.itemId}\n**Type:** ${item.itemType}\n**Rarity:** ${item.rarity}\n**Drop Rate:** ${item.dropRate}%\n**Max Stack:** ${item.maxStack || 1}\n**Owners:** ${usersWithItem}`, inline: true }
            );

        if (item.flavorText) embed.addFields({ name: 'Flavor Text', value: `*${item.flavorText}*` });
        if (item.seriesId) embed.addFields({ name: 'Series', value: item.seriesId, inline: true });

        const combinationUsage = this.formatCombinationUsage(usedInIngredients, usedInSingleResults, usedInMultiResults);
        if (combinationUsage) embed.addFields({ name: 'Combination Usage', value: combinationUsage });

        if (item.createdBy) embed.setFooter({ text: `Created by: ${item.createdBy}` });

        await interaction.editReply({ embeds: [embed] });
    },

    formatCombinationUsage(ingredients, singleResults, multiResults) {
        const usage = [];
        if (ingredients.length > 0) {
            const rules = ingredients.slice(0, 3).map(r => `${RESULT_TYPE_EMOJIS[r.resultType] || '⚗️'} ${r.ruleId}`);
            usage.push(`**Ingredient in (${ingredients.length}):** ${rules.join(', ')}${ingredients.length > 3 ? '...' : ''}`);
        }
        
        const totalResults = singleResults.length + multiResults.length;
        if (totalResults > 0) {
            const rules = [...singleResults, ...multiResults].slice(0, 3).map(r => `${RESULT_TYPE_EMOJIS[r.resultType] || '⚗️'} ${r.ruleId}`);
            usage.push(`**Result in (${totalResults}):** ${rules.join(', ')}${totalResults > 3 ? '...' : ''}`);
        }
        
        return usage.join('\n');
    },

    // Combination management
    async handleDebugCombination(interaction) {
        const ruleId = interaction.options.getString('rule-id');
        const rule = await this.findRule(ruleId);

        const embed = this.createEmbed(`🔍 Debug: ${ruleId}`, COLORS.INFO)
            .addFields(
                { name: 'Configuration', value: `**Priority:** ${rule.priority || 0}\n**Type:** ${RESULT_TYPE_EMOJIS[rule.resultType] || '⚗️'} ${rule.resultType || 'single'}\n**Non-Destructive:** ${rule.isNonDestructive ? '🔄 Yes' : '❌ No'}` }
            );

        const { ingredientsText, valid: ingredientsValid } = await this.validateRuleIngredients(rule.ingredients);
        const { resultText, valid: resultsValid } = await this.validateRuleResults(rule);
        
        embed.addFields(
            { name: 'Ingredients', value: ingredientsText },
            { name: 'Result(s)', value: resultText },
            { name: 'Status', value: (ingredientsValid && resultsValid) ? '✅ Valid' : '❌ Broken' }
        );

        await interaction.editReply({ embeds: [embed] });
    },

    async validateRuleIngredients(ingredients) {
        const results = [];
        let valid = true;

        for (const ingredient of ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            if (item) {
                results.push(`${this.formatItemEmoji(item)} ${ingredient.quantity}x **${item.itemName}**`);
            } else {
                results.push(`❌ ${ingredient.quantity}x MISSING (${ingredient.itemId})`);
                valid = false;
            }
        }

        return { ingredientsText: results.join('\n') || 'None', valid };
    },

    async validateRuleResults(rule) {
        let resultText = '';
        let valid = true;

        switch (rule.resultType) {
            case 'single':
                const resultItem = await GachaItem.findOne({ itemId: rule.result?.itemId });
                if (resultItem) {
                    resultText = `${this.formatItemEmoji(resultItem)} ${rule.result.quantity || 1}x **${resultItem.itemName}**`;
                } else {
                    resultText = `❌ MISSING (${rule.result?.itemId || 'no result set'})`;
                    valid = false;
                }
                break;
                
            case 'choice':
            case 'random':
                if (rule.results?.length > 0) {
                    const validResults = [];
                    for (const result of rule.results.slice(0, 5)) {
                        const resultItem = await GachaItem.findOne({ itemId: result.itemId });
                        if (resultItem) {
                            validResults.push(`${this.formatItemEmoji(resultItem)} ${result.quantity || 1}x ${resultItem.itemName}`);
                        } else {
                            validResults.push(`❌ MISSING (${result.itemId})`);
                            valid = false;
                        }
                    }
                    resultText = `**${rule.results.length} options:**\n${validResults.join('\n')}`;
                    if (rule.results.length > 5) resultText += `\n*...and ${rule.results.length - 5} more*`;
                } else {
                    resultText = `❌ NO RESULTS CONFIGURED`;
                    valid = false;
                }
                break;
                
            default:
                resultText = `❌ UNKNOWN RESULT TYPE (${rule.resultType})`;
                valid = false;
        }

        return { resultText, valid };
    },

    async handleRemoveCombination(interaction) {
        const ruleId = interaction.options.getString('rule-id');
        const rule = await CombinationRule.findOneAndDelete({ ruleId });
        
        if (!rule) throw new Error(`Rule "${ruleId}" not found.`);
        
        await interaction.editReply(`✅ Removed rule: **${ruleId}** (${RESULT_TYPE_EMOJIS[rule.resultType] || '⚗️'} ${rule.resultType})`);
    },

    async handleConvertCombination(interaction) {
        const ruleId = interaction.options.getString('rule-id');
        const newType = interaction.options.getString('new-type');
        const rule = await this.findRule(ruleId);

        if (rule.resultType === newType) {
            return interaction.editReply(`❌ Rule "${ruleId}" is already of type "${newType}".`);
        }

        const oldType = rule.resultType || 'single';
        
        if (newType === 'single' && rule.results?.length > 0) {
            rule.result = rule.results[0];
            rule.results = undefined;
        } else if (['choice', 'random'].includes(newType) && rule.result && !rule.results?.length) {
            rule.results = [rule.result];
            rule.result = undefined;
        }
        
        rule.resultType = newType;
        await rule.save();

        await interaction.editReply(`✅ Converted rule **${ruleId}** from ${RESULT_TYPE_EMOJIS[oldType] || '⚗️'} ${oldType} to ${RESULT_TYPE_EMOJIS[newType]} ${newType}`);
    },

    async handleCombinationStats(interaction) {
        const stats = await CombinationRule.getDiscoveryStats();
        const statsData = stats[0] || {};
        const [activeRules, inactiveRules] = await Promise.all([
            CombinationRule.countDocuments({ isActive: true }),
            CombinationRule.countDocuments({ isActive: false })
        ]);

        const recentDiscoveries = await CombinationRule.find({ discovered: true, discoveredAt: { $exists: true } })
            .sort({ discoveredAt: -1 }).limit(5);

        const embed = this.createEmbed('📊 Combination System Statistics', '#3498DB')
            .addFields(
                { name: '📈 Rule Counts', value: `**Total:** ${statsData.totalRules || 0}\n**Active:** ${activeRules}\n**Inactive:** ${inactiveRules}`, inline: true },
                { name: '🎯 Result Types', value: `**Single:** ${statsData.singleResultRules || 0} ⚗️\n**Choice:** ${statsData.choiceResultRules || 0} 🎯\n**Random:** ${statsData.randomResultRules || 0} 🎲`, inline: true },
                { name: '🔍 Discovery', value: `**Discovered:** ${statsData.discoveredRules || 0}\n**Hidden:** ${statsData.undiscoveredRules || 0}\n**Non-Destructive:** ${statsData.nonDestructiveRules || 0} 🔄`, inline: true }
            );

        if (recentDiscoveries.length > 0) {
            const recentText = recentDiscoveries.map(rule => {
                const daysSince = Math.floor((Date.now() - rule.discoveredAt.getTime()) / (1000 * 60 * 60 * 24));
                return `${RESULT_TYPE_EMOJIS[rule.resultType] || '⚗️'} **${rule.ruleId}** (${daysSince}d ago)`;
            }).join('\n');
            
            embed.addFields({ name: '🕒 Recent Discoveries', value: recentText });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    // User management
    async handleGiveItem(interaction) {
        const username = interaction.options.getString('username');
        const itemId = interaction.options.getString('item-id');
        const quantity = interaction.options.getInteger('quantity') || 1;

        const [user, item] = await Promise.all([this.findUser(username), this.findItem(itemId)]);
        
        user.addGachaItem(item, quantity, 'admin_grant');
        await user.save();

        const combinationResult = await combinationService.triggerCombinationAlertsForAdminGift(user, itemId, interaction);
        
        let message = `✅ Gave ${this.formatItemEmoji(item)} ${quantity}x **${item.itemName}** to ${username}`;
        if (combinationResult.hasCombinations) {
            message += `\n⚗️ ${combinationResult.combinationCount} combination(s) now available!`;
        }

        await interaction.editReply({ content: message });
    },

    async handleClearCollection(interaction) {
        const username = interaction.options.getString('username');
        const confirm = interaction.options.getBoolean('confirm');

        if (!confirm) throw new Error('Confirmation required.');

        const user = await this.findUser(username);
        const collectionSize = user.gachaCollection?.length || 0;
        
        if (collectionSize === 0) {
            return interaction.editReply(`❌ User "${username}" already has empty collection.`);
        }

        user.gachaCollection = [];
        await user.save();

        await interaction.editReply(`✅ Cleared collection for **${username}** (${collectionSize} items removed).`);
    },

    // Modal handlers
    async showModal(interaction, type) {
        const modals = {
            combination: this.createCombinationModal(),
            giveItem: this.createGiveItemModal()
        };

        await interaction.showModal(modals[type]);
    },

    createCombinationModal() {
        return new ModalBuilder()
            .setCustomId('gacha-admin_add_combo_submit')
            .setTitle('Create Combination Rule')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('combo_format')
                        .setLabel('Combination Rule')
                        .setPlaceholder('Examples:\n025x5 = 107\n(001 + 003) = 999\n001 + 002 = 003, 004, 005\n001 + 002 = (003, 404, 005)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('rule_id')
                        .setLabel('Rule ID (auto-generated if empty)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('priority')
                        .setLabel('Priority (0-100)')
                        .setValue('10')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                )
            );
    },

    createGiveItemModal() {
        return new ModalBuilder()
            .setCustomId('gacha-admin_give_item_submit')
            .setTitle('Give Item to User')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('username')
                        .setLabel('Username')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('item_id')
                        .setLabel('Item ID')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('quantity')
                        .setLabel('Quantity')
                        .setValue('1')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                )
            );
    },

    async processModalSubmit(interaction, type) {
        await interaction.deferReply({ ephemeral: true });

        try {
            if (type === 'combination') {
                await this.processCombinationModal(interaction);
            } else if (type === 'giveItem') {
                await this.processGiveItemModal(interaction);
            }
        } catch (error) {
            await interaction.editReply(`❌ ${error.message}`);
        }
    },

    async processCombinationModal(interaction) {
        const comboFormat = interaction.fields.getTextInputValue('combo_format');
        const ruleId = interaction.fields.getTextInputValue('rule_id') || `combo_${Date.now()}`;
        const priority = parseInt(interaction.fields.getTextInputValue('priority')) || 10;

        const parsed = this.parseEnhancedCombination(comboFormat);
        
        // Validate ingredients and results
        await this.validateCombinationItems(parsed);

        if (await CombinationRule.findOne({ ruleId })) {
            throw new Error(`Rule "${ruleId}" already exists.`);
        }

        const newRule = new CombinationRule({
            ruleId, priority, createdBy: interaction.user.username,
            ingredients: parsed.ingredients,
            isAutomatic: false,
            isNonDestructive: parsed.isNonDestructive,
            resultType: parsed.resultType
        });

        if (parsed.resultType === 'single') {
            newRule.result = parsed.results[0];
        } else {
            newRule.results = parsed.results;
        }

        await newRule.save();

        const embed = this.createEmbed('✅ Combination Rule Added', COLORS.SUCCESS)
            .addFields(
                { name: 'Details', value: `**Rule ID:** ${ruleId}\n**Type:** ${RESULT_TYPE_EMOJIS[parsed.resultType]} ${parsed.resultType}\n**Non-Destructive:** ${parsed.isNonDestructive ? '🔄 Yes' : '❌ No'}\n**Results:** ${parsed.results.length}` }
            );

        await interaction.editReply({ embeds: [embed] });
    },

    async processGiveItemModal(interaction) {
        const username = interaction.fields.getTextInputValue('username').trim();
        const itemId = interaction.fields.getTextInputValue('item_id').trim();
        const quantity = parseInt(interaction.fields.getTextInputValue('quantity')) || 1;

        const [user, item] = await Promise.all([this.findUser(username), this.findItem(itemId)]);
        
        user.addGachaItem(item, quantity, 'admin_grant');
        await user.save();

        const combinationResult = await combinationService.triggerCombinationAlertsForAdminGift(user, itemId, interaction);
        
        let message = `✅ Gave ${this.formatItemEmoji(item)} ${quantity}x **${item.itemName}** to ${username}`;
        if (combinationResult.hasCombinations) {
            message += `\n⚗️ ${combinationResult.combinationCount} combination(s) now available!`;
        }

        await interaction.editReply({ content: message });
    },

    async validateCombinationItems(parsed) {
        for (const ingredient of parsed.ingredients) {
            await this.findItem(ingredient.itemId);
        }
        for (const result of parsed.results) {
            await this.findItem(result.itemId);
        }
    },

    parseEnhancedCombination(format) {
        format = format.trim();
        const separator = format.includes(' = ') ? ' = ' : (format.includes('=') ? '=' : (format.includes(' -> ') ? ' -> ' : '->'));
        const parts = format.split(separator);
        
        if (parts.length !== 2) throw new Error('Format must be: ingredients = result(s)');

        let [ingredientsPart, resultPart] = parts.map(p => p.trim());

        // Check for non-destructive
        const isNonDestructive = ingredientsPart.startsWith('(') && ingredientsPart.endsWith(')');
        if (isNonDestructive) {
            ingredientsPart = ingredientsPart.slice(1, -1).trim();
        }

        // Parse ingredients
        const ingredients = ingredientsPart.split(/[+,]/).map(item => {
            const trimmed = item.trim();
            const [itemId, quantityStr] = trimmed.includes('x') ? trimmed.split('x') : [trimmed, '1'];
            return { itemId: itemId.trim(), quantity: parseInt(quantityStr) || 1 };
        });

        // Determine result type and parse results
        let resultType = 'single';
        if (resultPart.startsWith('(') && resultPart.endsWith(')')) {
            resultType = 'random';
            resultPart = resultPart.slice(1, -1).trim();
        }

        const resultItems = resultPart.split(',').map(s => s.trim());
        if (resultItems.length > 1 && resultType === 'single') {
            resultType = 'choice';
        }

        const results = resultItems.map(item => {
            const [itemId, quantityStr] = item.includes('x') ? item.split('x') : [item, '1'];
            return { itemId: itemId.trim(), quantity: parseInt(quantityStr) || 1 };
        });

        return { ingredients, results, resultType, isNonDestructive };
    },

    // Main interaction handler
    async handleInteraction(interaction) {
        const customId = interaction.customId;

        try {
            // Route interactions
            const routes = {
                'gacha-admin_main_menu': () => this.handleMenuNavigation(interaction, interaction.values[0]),
                'gacha-admin_quick_list_items': () => this.showItemsList(interaction, 1, 'all'),
                'gacha-admin_list_items_menu': () => this.showItemsList(interaction, 1, 'all'),
                'gacha-admin_quick_combinations': () => this.showCombinationsList(interaction, 1, 'all'),
                'gacha-admin_list_combinations_menu': () => this.showCombinationsList(interaction, 1, 'all'),
                'gacha-admin_combination_stats': () => this.handleCombinationStats(interaction),
                'gacha-admin_back_to_main': () => this.handleMainMenu(interaction),
                'gacha-admin_refresh_main': () => this.handleMainMenu(interaction),
                'gacha-admin_back_to_items': () => this.showItemsMenu(interaction),
                'gacha-admin_back_to_combinations': () => this.showCombinationsMenu(interaction),
                'gacha-admin_back_to_users': () => this.showUsersMenu(interaction),
                'gacha-admin_add_combination_modal': () => this.showModal(interaction, 'combination'),
                'gacha-admin_give_item_modal': () => this.showModal(interaction, 'giveItem'),
                'gacha-admin_add_combo_submit': () => this.processModalSubmit(interaction, 'combination'),
                'gacha-admin_give_item_submit': () => this.processModalSubmit(interaction, 'giveItem')
            };

            // Handle paginated routes
            if (customId.includes('_page_')) {
                const [type, page, filter] = this.parsePaginationId(customId);
                if (type === 'items') return this.showItemsList(interaction, page, filter);
                if (type === 'combinations') return this.showCombinationsList(interaction, page, filter);
            }

            // Handle filter routes
            if (customId.includes('_filter_')) {
                const [type, page] = this.parseFilterId(customId);
                const filter = interaction.values[0];
                if (type === 'items') return this.showItemsList(interaction, page, filter);
                if (type === 'combinations') return this.showCombinationsList(interaction, page, filter);
            }

            // Execute route
            const handler = routes[customId];
            if (handler) {
                await handler();
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

    parsePaginationId(customId) {
        const parts = customId.split('_');
        const typeIndex = parts.findIndex(p => p === 'items' || p === 'combinations');
        const type = parts[typeIndex];
        const page = parseInt(parts[typeIndex + 2]) || 1;
        const filter = parts[typeIndex + 3] || 'all';
        return [type, page, filter];
    },

    parseFilterId(customId) {
        const parts = customId.split('_');
        const typeIndex = parts.findIndex(p => p === 'items' || p === 'combinations');
        const type = parts[typeIndex];
        const page = parseInt(parts[typeIndex + 1]) || 1;
        return [type, page];
    },

    // Event handler aliases
    handleButtonInteraction: function(interaction) { return this.handleInteraction(interaction); },
    handleSelectMenuInteraction: function(interaction) { return this.handleInteraction(interaction); },
    handleModalSubmit: function(interaction) { return this.handleInteraction(interaction); }
};
