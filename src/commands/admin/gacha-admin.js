// src/commands/admin/gacha-admin.js - ENHANCED VERSION with non-destructive combination support
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
                        .setRequired(true))),

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

    // Parse emoji input to handle both static and animated emojis
    parseEmojiInput(emojiInput) {
        // Updated regex to handle both <:name:id> and <a:name:id>
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
            fullFormat: emojiInput // Store the full format for reference
        };
    },

    // Format emoji for display (handles animated emojis)
    formatItemEmoji(item) {
        if (item.emojiId && item.emojiName) {
            const prefix = item.isAnimated ? 'a' : '';
            return `<${prefix}:${item.emojiName}:${item.emojiId}>`;
        }
        return item.emojiName || '❓';
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

        // Add action buttons
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`gacha_edit_item_${itemId}`)
                    .setLabel('✏️ Edit Item')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`gacha_delete_item_${itemId}`)
                    .setLabel('🗑️ Delete Item')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(usedInIngredients.length > 0 || usedInResults.length > 0)
            );

        await interaction.editReply({ embeds: [embed], components: [actionRow] });
    },

    async handleEditItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        
        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            throw new Error(`Item "${itemId}" not found.`);
        }

        const updates = {};
        const changes = [];

        // Check each field for updates
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

            if (usedInIngredients.length > 0) {
                const ingredientRules = usedInIngredients.slice(0, 5).map(rule => rule.ruleId).join(', ');
                embed.addFields({
                    name: 'Ingredient Rules (sample)',
                    value: ingredientRules + (usedInIngredients.length > 5 ? '...' : ''),
                    inline: false
                });
            }

            if (usedInResults.length > 0) {
                const resultRules = usedInResults.slice(0, 5).map(rule => rule.ruleId).join(', ');
                embed.addFields({
                    name: 'Result Rules (sample)',
                    value: resultRules + (usedInResults.length > 5 ? '...' : ''),
                    inline: false
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }

        const emoji = this.formatItemEmoji(item);

        // Show confirmation for deletion
        const embed = new EmbedBuilder()
            .setTitle('🗑️ Confirm Item Deletion')
            .setColor(COLORS.DANGER)
            .setDescription(`Are you sure you want to delete ${emoji} **${item.itemName}**?`)
            .addFields(
                { name: 'Item ID', value: itemId, inline: true },
                { name: 'Type', value: item.itemType, inline: true },
                { name: 'Rarity', value: item.rarity, inline: true },
                { name: 'Users Affected', value: totalUsersAffected.toString(), inline: true },
                { name: 'Total Items Removed', value: totalItemsToRemove.toString(), inline: true },
                { name: 'Combinations Affected', value: totalCombinations.toString(), inline: true }
            );

        if (force && totalCombinations > 0) {
            embed.addFields({
                name: '⚠️ Force Delete Warning',
                value: `This will BREAK ${totalCombinations} combination rules! You'll need to clean them up manually.`,
                inline: false
            });
        }

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`gacha_confirm_delete_${itemId}_${force}`)
                    .setLabel('🗑️ Confirm Delete')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('gacha_cancel_delete')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({ embeds: [embed], components: [confirmRow] });
    },

    async confirmDeleteItem(interaction, itemId, force) {
        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            throw new Error(`Item "${itemId}" not found.`);
        }

        const emoji = this.formatItemEmoji(item);

        // Remove from all user collections
        const usersWithItem = await User.find({
            'gachaCollection.itemId': itemId
        });

        let totalItemsRemoved = 0;
        for (const user of usersWithItem) {
            const itemIndex = user.gachaCollection.findIndex(ci => ci.itemId === itemId);
            if (itemIndex !== -1) {
                totalItemsRemoved += user.gachaCollection[itemIndex].quantity || 1;
                user.gachaCollection.splice(itemIndex, 1);
                await user.save();
            }
        }

        // If force deleting, also remove broken combination rules
        let brokenRules = 0;
        if (force) {
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

        // Delete the item
        await GachaItem.findOneAndDelete({ itemId });

        const embed = new EmbedBuilder()
            .setTitle('✅ Item Deleted')
            .setColor(COLORS.SUCCESS)
            .setDescription(`${emoji} **${item.itemName}** has been permanently deleted.`)
            .addFields(
                { name: 'Item ID', value: itemId, inline: true },
                { name: 'Users Affected', value: usersWithItem.length.toString(), inline: true },
                { name: 'Items Removed', value: totalItemsRemoved.toString(), inline: true }
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

        await interaction.editReply({ embeds: [embed], components: [] });
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
            text: 'Copy the Item ID (bolded text) when creating combinations. 🎬 = Animated emoji' 
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

    // UPDATED: Enhanced to handle non-destructive combinations with parentheses syntax
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
                isNonDestructive: parsed.isNonDestructive, // NEW: Set non-destructive flag
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
                embed.setDescription('🔄 **Non-Destructive Combination** - Ingredients will be kept after combining!\n\n⚗️ This combination will show confirmation prompts when users have the ingredients!');
            } else {
                embed.setDescription('⚗️ This combination will show confirmation prompts when users have the ingredients!');
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error creating combination:', error);
            await interaction.editReply({
                content: `❌ Error creating combination: ${error.message}\n\n**Format Examples:**\n` +
                         `• \`025x5 = 107\` (5 items with ID 025 make 1 item with ID 107)\n` +
                         `• \`(025x5) = 107\` (5 items with ID 025 make 1 item with ID 107, keeps ingredients)\n` +
                         `• \`001 + 003 = 999\` (item 001 + item 003 make item 999)\n` +
                         `• \`(001 + 003) = 999\` (item 001 + item 003 make item 999, keeps ingredients)\n` +
                         `• \`010x3 + 020x2 = 030x5\` (3 of item 010 + 2 of item 020 = 5 of item 030)\n` +
                         `• \`(010x3 + 020x2) = 030x5\` (same as above but keeps ingredients)\n` +
                         `• \`item1 + item2 + item3 = special_item\` (multiple ingredients)\n\n` +
                         `**Non-Destructive Format Rules:**\n` +
                         `• Wrap ingredients in parentheses: \`(ingredients) = result\`\n` +
                         `• Perfect for series completion rewards!\n` +
                         `• Use \`itemIDx#\` for quantities (e.g., \`025x5\` = 5 of item 025)\n` +
                         `• Use \`+\` or \`,\` to separate multiple ingredients\n` +
                         `• Use \`=\` to separate ingredients from result (preferred)\n` +
                         `• \`->\` also works but \`=\` is preferred\n` +
                         `• If no quantity specified, defaults to 1`
            });
        }
    },

    // UPDATED: Enhanced to detect parentheses for non-destructive combinations
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

        // NEW: Check for non-destructive combination (parentheses)
        let isNonDestructive = false;
        if (ingredientsPart.startsWith('(') && ingredientsPart.endsWith(')')) {
            isNonDestructive = true;
            ingredientsPart = ingredientsPart.slice(1, -1).trim(); // Remove parentheses
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

    // UPDATED: Enhanced to show non-destructive indicators
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
            const resultEmoji = resultItem ? this.formatItemEmoji(resultItem) : '❓';
            
            rulesText += `**${rule.ruleId}** (Priority: ${rule.priority})${rule.isNonDestructive ? ' 🔄' : ''}\n`;
            
            const ingredientStrs = rule.ingredients.map(ing => 
                ing.quantity > 1 ? `${ing.itemId}x${ing.quantity}` : ing.itemId
            );
            
            // NEW: Show non-destructive format with parentheses
            const ingredientsDisplay = rule.isNonDestructive 
                ? `(${ingredientStrs.join(' + ')})` 
                : ingredientStrs.join(' + ');
            
            rulesText += `${ingredientsDisplay} = ${resultEmoji} ${resultItem?.itemName || rule.result.itemId}${rule.result.quantity > 1 ? ` (x${rule.result.quantity})` : ''}\n\n`;
        }

        embed.addFields({ name: 'Rules', value: rulesText });
        embed.setFooter({ text: 'All combinations require user confirmation • 🔄 = Non-Destructive (keeps ingredients)' });

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

    // Handle pagination for combinations from button clicks
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
            const resultEmoji = resultItem ? this.formatItemEmoji(resultItem) : '❓';
            
            rulesText += `**${rule.ruleId}** (Priority: ${rule.priority})${rule.isNonDestructive ? ' 🔄' : ''}\n`;
            
            const ingredientStrs = rule.ingredients.map(ing => 
                ing.quantity > 1 ? `${ing.itemId}x${ing.quantity}` : ing.itemId
            );
            
            // Show non-destructive format with parentheses
            const ingredientsDisplay = rule.isNonDestructive 
                ? `(${ingredientStrs.join(' + ')})` 
                : ingredientStrs.join(' + ');
            
            rulesText += `${ingredientsDisplay} = ${resultEmoji} ${resultItem?.itemName || rule.result.itemId}${rule.result.quantity > 1 ? ` (x${rule.result.quantity})` : ''}\n\n`;
        }

        embed.addFields({ name: 'Rules', value: rulesText });
        embed.setFooter({ text: 'All combinations require user confirmation • 🔄 = Non-Destructive (keeps ingredients)' });

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
            const animatedFlag = item.isAnimated ? '🎬' : '';
            
            itemsList += `**${id}** - ${name} (${rarity}, ${item.dropRate}%) ${animatedFlag}\n`;
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
            text: 'Copy the Item ID (bolded text) when creating combinations. 🎬 = Animated emoji' 
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

    // UPDATED: Enhanced debug view to show non-destructive status
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

        const exampleIngredients = rule.ingredients.map(ing => 
            ing.quantity > 1 ? `${ing.itemId}x${ing.quantity}` : ing.itemId
        ).join(' + ');
        
        const exampleResult = rule.result.quantity > 1 ? 
            `${rule.result.itemId}x${rule.result.quantity}` : 
            rule.result.itemId;
        
        // NEW: Show proper format with parentheses for non-destructive
        const formatExample = rule.isNonDestructive 
            ? `\`(${exampleIngredients}) = ${exampleResult}\``
            : `\`${exampleIngredients} = ${exampleResult}\``;
        
        embed.addFields({ 
            name: 'Rule Format', 
            value: formatExample
        });

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
            isAnimated: emojiData.isAnimated, // Store whether emoji is animated
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
            .setTitle('✅ Item Added')
            .setColor(COLORS.SUCCESS)
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
        } else if (interaction.customId.startsWith('gacha_edit_item_')) {
            // Handle edit item button
            const itemId = interaction.customId.replace('gacha_edit_item_', '');
            await this.showEditItemModal(interaction, itemId);
        } else if (interaction.customId.startsWith('gacha_delete_item_')) {
            // Handle delete item button
            const itemId = interaction.customId.replace('gacha_delete_item_', '');
            await this.confirmDeleteFromButton(interaction, itemId);
        } else if (interaction.customId.startsWith('gacha_confirm_delete_')) {
            // Handle delete confirmation
            const parts = interaction.customId.split('_');
            const itemId = parts[3];
            const force = parts[4] === 'true';
            await this.confirmDeleteItem(interaction, itemId, force);
        } else if (interaction.customId === 'gacha_cancel_delete') {
            await interaction.editReply({ 
                content: '❌ Deletion cancelled.',
                embeds: [],
                components: []
            });
        }
    },

    async showEditItemModal(interaction, itemId) {
        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            return interaction.reply({
                content: `❌ Item "${itemId}" not found.`,
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`gacha_edit_modal_${itemId}`)
            .setTitle(`Edit: ${item.itemName}`);

        const nameInput = new TextInputBuilder()
            .setCustomId('edit_name')
            .setLabel('Item Name')
            .setStyle(TextInputStyle.Short)
            .setValue(item.itemName)
            .setRequired(false);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('edit_description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(item.description)
            .setRequired(false);

        const dropRateInput = new TextInputBuilder()
            .setCustomId('edit_drop_rate')
            .setLabel('Drop Rate % (0-100)')
            .setStyle(TextInputStyle.Short)
            .setValue(item.dropRate.toString())
            .setRequired(false);

        const flavorInput = new TextInputBuilder()
            .setCustomId('edit_flavor')
            .setLabel('Flavor Text (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(item.flavorText || '')
            .setRequired(false);

        const currentEmoji = this.formatItemEmoji(item);
        const emojiInput = new TextInputBuilder()
            .setCustomId('edit_emoji')
            .setLabel('Emoji (<:name:id> or <a:name:id>)')
            .setStyle(TextInputStyle.Short)
            .setValue(currentEmoji)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(dropRateInput),
            new ActionRowBuilder().addComponents(flavorInput),
            new ActionRowBuilder().addComponents(emojiInput)
        );

        await interaction.showModal(modal);
    },

    async confirmDeleteFromButton(interaction, itemId) {
        await interaction.deferUpdate();
        
        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            return interaction.editReply({
                content: `❌ Item "${itemId}" not found.`,
                embeds: [],
                components: []
            });
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

        if (totalCombinations > 0) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Cannot Delete Item')
                .setColor(COLORS.WARNING)
                .setDescription(`Item "${itemId}" is used in ${totalCombinations} combination rule(s) and cannot be deleted directly.`)
                .addFields({
                    name: 'Options',
                    value: '• Remove the combination rules first\n• Or use `/gacha-admin delete-item` with `force: true`',
                    inline: false
                });

            return interaction.editReply({ embeds: [embed], components: [] });
        }

        // Check how many users have this item
        const usersWithItem = await User.find({
            'gachaCollection.itemId': itemId
        });

        const totalUsersAffected = usersWithItem.length;
        const totalItemsToRemove = usersWithItem.reduce((total, user) => {
            const userItem = user.gachaCollection.find(ci => ci.itemId === itemId);
            return total + (userItem?.quantity || 0);
        }, 0);

        const emoji = this.formatItemEmoji(item);

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Confirm Item Deletion')
            .setColor(COLORS.DANGER)
            .setDescription(`Are you sure you want to delete ${emoji} **${item.itemName}**?`)
            .addFields(
                { name: 'Item ID', value: itemId, inline: true },
                { name: 'Users Affected', value: totalUsersAffected.toString(), inline: true },
                { name: 'Total Items Removed', value: totalItemsToRemove.toString(), inline: true }
            );

        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`gacha_confirm_delete_${itemId}_false`)
                    .setLabel('🗑️ Confirm Delete')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('gacha_cancel_delete')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({ embeds: [embed], components: [confirmRow] });
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId === 'gacha_add_combo_modal') {
            await this.handleCombinationModal(interaction);
        } else if (interaction.customId.startsWith('gacha_edit_modal_')) {
            const itemId = interaction.customId.replace('gacha_edit_modal_', '');
            await this.handleEditItemModal(interaction, itemId);
        }
    },

    async handleEditItemModal(interaction, itemId) {
        await interaction.deferReply({ ephemeral: true });

        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            throw new Error(`Item "${itemId}" not found.`);
        }

        const updates = {};
        const changes = [];

        // Get values from modal
        const newName = interaction.fields.getTextInputValue('edit_name');
        const newDescription = interaction.fields.getTextInputValue('edit_description');
        const newDropRateStr = interaction.fields.getTextInputValue('edit_drop_rate');
        const newFlavorText = interaction.fields.getTextInputValue('edit_flavor');
        const newEmojiInput = interaction.fields.getTextInputValue('edit_emoji');

        // Check each field for updates
        if (newName && newName !== item.itemName) {
            updates.itemName = newName;
            changes.push(`Name: "${item.itemName}" → "${newName}"`);
        }

        if (newDescription && newDescription !== item.description) {
            updates.description = newDescription;
            changes.push(`Description: "${item.description}" → "${newDescription}"`);
        }

        if (newDropRateStr) {
            const newDropRate = parseFloat(newDropRateStr);
            if (!isNaN(newDropRate) && newDropRate !== item.dropRate) {
                updates.dropRate = newDropRate;
                changes.push(`Drop Rate: ${item.dropRate}% → ${newDropRate}%`);
            }
        }

        if (newFlavorText !== item.flavorText) {
            updates.flavorText = newFlavorText || null;
            changes.push(`Flavor Text: "${item.flavorText || 'none'}" → "${newFlavorText || 'none'}"`);
        }

        if (newEmojiInput) {
            try {
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
            } catch (error) {
                // If emoji parsing fails, ignore the emoji update but continue with other changes
                console.warn('Failed to parse emoji during edit:', error.message);
            }
        }

        if (changes.length === 0) {
            return interaction.editReply({
                content: `❌ No changes detected for item "${itemId}".`
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
    }
};
