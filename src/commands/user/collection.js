// src/commands/user/collection.js - UPDATED with dropdown menu and series grouping
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { User } from '../../models/User.js';
import { GachaItem, CombinationRule } from '../../models/GachaItem.js';
import combinationService from '../../services/combinationService.js';
import gachaService from '../../services/gachaService.js';
import { formatGachaEmoji } from '../../config/gachaEmojis.js';
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View your gacha collection with filtering and combination options'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply({
                    content: '❌ You are not registered. Please ask an admin to register you first.'
                });
            }

            if (!user.gachaCollection || user.gachaCollection.length === 0) {
                return interaction.editReply({
                    content: '📦 Your collection is empty! Visit the gacha machine to start collecting items.'
                });
            }

            // Get collection summary with series breakdown
            const summary = gachaService.getUserCollectionSummary(user);
            
            // Create the main collection embed with series overview
            const mainEmbed = await this.createMainCollectionEmbed(user, summary);
            
            // Create control buttons and dropdown
            const components = this.createCollectionControls(user, summary);
            
            await interaction.editReply({ 
                embeds: [mainEmbed],
                components: components
            });

        } catch (error) {
            console.error('Error displaying collection:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching your collection.'
            });
        }
    },

    // Create the main collection overview embed
    async createMainCollectionEmbed(user, summary) {
        const embed = new EmbedBuilder()
            .setTitle(`📦 ${user.raUsername}'s Collection`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        // Main stats
        let description = `**Total Items:** ${summary.totalItems} (${summary.uniqueItems} unique)\n\n`;

        // Series breakdown - the main focus
        description += '📚 **Collection by Series:**\n';
        
        const seriesEntries = Object.entries(summary.seriesBreakdown);
        if (seriesEntries.length > 0) {
            // Sort by series name, but put "Individual Items" last
            seriesEntries.sort(([a], [b]) => {
                if (a === 'Individual Items') return 1;
                if (b === 'Individual Items') return -1;
                return a.localeCompare(b);
            });

            for (const [seriesName, items] of seriesEntries) {
                const itemCount = items.length;
                const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
                
                const displayName = seriesName === 'Individual Items' ? 
                    '🔸 Individual Items' : 
                    `🏷️ ${seriesName.charAt(0).toUpperCase() + seriesName.slice(1)} Series`;
                
                description += `${displayName}: ${itemCount} types (${totalQuantity} total)\n`;
            }
        } else {
            description += 'No items collected yet\n';
        }

        description += '\n';

        // Rarity summary (condensed)
        const rarityEmojis = {
            mythic: '🌟',
            legendary: '🟡',
            epic: '🟣',
            rare: '🔵',
            uncommon: '🟢',
            common: '⚪'
        };

        description += '💎 **Rarity Summary:**\n';
        let rarityLine = '';
        for (const [rarity, emoji] of Object.entries(rarityEmojis)) {
            const count = summary.rarityCount[rarity] || 0;
            if (count > 0) {
                rarityLine += `${emoji}${count} `;
            }
        }
        description += rarityLine || 'No items yet';

        embed.setDescription(description);

        // Add combination stats
        const combinationStats = combinationService.getCombinationStats(user);
        embed.addFields({
            name: '🔧 Combination Activity',
            value: `**Items Combined:** ${combinationStats.totalCombined}\n` +
                   `**Unique Combined:** ${combinationStats.uniqueCombined}\n` +
                   `**Discovery Status:** ${combinationStats.uniqueCombined > 0 ? 'Active Explorer!' : 'Ready to Experiment!'}`,
            inline: true
        });

        embed.setFooter({ 
            text: 'Use the dropdown and buttons below to explore your collection • Click Inspect Item to see full details!' 
        });

        return embed;
    },

    // Create control components
    createCollectionControls(user, summary) {
        const components = [];

        // Series selection dropdown
        const seriesOptions = [];
        const seriesEntries = Object.entries(summary.seriesBreakdown);
        
        // Add "All Items" option first
        seriesOptions.push({
            label: 'All Items',
            value: 'all',
            description: `View all ${summary.totalItems} items`,
            emoji: '📦'
        });

        // Add series options
        seriesEntries.forEach(([seriesName, items]) => {
            const itemCount = items.length;
            const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
            
            if (seriesName === 'Individual Items') {
                seriesOptions.push({
                    label: 'Individual Items',
                    value: 'individual',
                    description: `${itemCount} standalone items (${totalQuantity} total)`,
                    emoji: '🔸'
                });
            } else {
                seriesOptions.push({
                    label: `${seriesName.charAt(0).toUpperCase() + seriesName.slice(1)} Series`,
                    value: seriesName,
                    description: `${itemCount} types (${totalQuantity} total)`,
                    emoji: '🏷️'
                });
            }
        });

        // Only add dropdown if there are series to choose from
        if (seriesOptions.length > 1) {
            const seriesMenu = new StringSelectMenuBuilder()
                .setCustomId(`collection_series_${user.raUsername}`)
                .setPlaceholder('Choose a series to view...')
                .addOptions(seriesOptions.slice(0, 25)); // Discord limit

            components.push(new ActionRowBuilder().addComponents(seriesMenu));
        }

        // Filter and action buttons
        const actionButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`collection_filter_${user.raUsername}`)
                    .setLabel('🎯 Filters')
                    .setStyle(ButtonStyle.Secondary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_inspect_${user.raUsername}`)
                    .setLabel('🔍 Inspect Item')
                    .setStyle(ButtonStyle.Secondary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_combine_${user.raUsername}`)
                    .setLabel('🔧 Combine Items')
                    .setStyle(ButtonStyle.Primary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_stats_${user.raUsername}`)
                    .setLabel('📊 Statistics')
                    .setStyle(ButtonStyle.Secondary)
            );

        components.push(actionButtons);

        return components;
    },

    // Handle dropdown interactions
    async handleSelectMenuInteraction(interaction) {
        if (!interaction.customId.startsWith('collection_series_') && !interaction.customId.startsWith('collection_filter_apply_')) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            let username, selectedValue;
            
            if (interaction.customId.startsWith('collection_series_')) {
                username = interaction.customId.replace('collection_series_', '');
                selectedValue = interaction.values[0];
                
                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${username}// src/commands/user/collection.js - UPDATED with dropdown menu and series grouping
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { User } from '../../models/User.js';
import { GachaItem, CombinationRule } from '../../models/GachaItem.js';
import combinationService from '../../services/combinationService.js';
import gachaService from '../../services/gachaService.js';
import { formatGachaEmoji } from '../../config/gachaEmojis.js';
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View your gacha collection with filtering and combination options'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply({
                    content: '❌ You are not registered. Please ask an admin to register you first.'
                });
            }

            if (!user.gachaCollection || user.gachaCollection.length === 0) {
                return interaction.editReply({
                    content: '📦 Your collection is empty! Visit the gacha machine to start collecting items.'
                });
            }

            // Get collection summary with series breakdown
            const summary = gachaService.getUserCollectionSummary(user);
            
            // Create the main collection embed with series overview
            const mainEmbed = await this.createMainCollectionEmbed(user, summary);
            
            // Create control buttons and dropdown
            const components = this.createCollectionControls(user, summary);
            
            await interaction.editReply({ 
                embeds: [mainEmbed],
                components: components
            });

        } catch (error) {
            console.error('Error displaying collection:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching your collection.'
            });
        }
    },

    // Create the main collection overview embed
    async createMainCollectionEmbed(user, summary) {
        const embed = new EmbedBuilder()
            .setTitle(`📦 ${user.raUsername}'s Collection`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        // Main stats
        let description = `**Total Items:** ${summary.totalItems} (${summary.uniqueItems} unique)\n\n`;

        // Series breakdown - the main focus
        description += '📚 **Collection by Series:**\n';
        
        const seriesEntries = Object.entries(summary.seriesBreakdown);
        if (seriesEntries.length > 0) {
            // Sort by series name, but put "Individual Items" last
            seriesEntries.sort(([a], [b]) => {
                if (a === 'Individual Items') return 1;
                if (b === 'Individual Items') return -1;
                return a.localeCompare(b);
            });

            for (const [seriesName, items] of seriesEntries) {
                const itemCount = items.length;
                const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
                
                const displayName = seriesName === 'Individual Items' ? 
                    '🔸 Individual Items' : 
                    `🏷️ ${seriesName.charAt(0).toUpperCase() + seriesName.slice(1)} Series`;
                
                description += `${displayName}: ${itemCount} types (${totalQuantity} total)\n`;
            }
        } else {
            description += 'No items collected yet\n';
        }

        description += '\n';

        // Rarity summary (condensed)
        const rarityEmojis = {
            mythic: '🌟',
            legendary: '🟡',
            epic: '🟣',
            rare: '🔵',
            uncommon: '🟢',
            common: '⚪'
        };

        description += '💎 **Rarity Summary:**\n';
        let rarityLine = '';
        for (const [rarity, emoji] of Object.entries(rarityEmojis)) {
            const count = summary.rarityCount[rarity] || 0;
            if (count > 0) {
                rarityLine += `${emoji}${count} `;
            }
        }
        description += rarityLine || 'No items yet';

        embed.setDescription(description);

        // Add combination stats
        const combinationStats = combinationService.getCombinationStats(user);
        embed.addFields({
            name: '🔧 Combination Activity',
            value: `**Items Combined:** ${combinationStats.totalCombined}\n` +
                   `**Unique Combined:** ${combinationStats.uniqueCombined}\n` +
                   `**Discovery Status:** ${combinationStats.uniqueCombined > 0 ? 'Active Explorer!' : 'Ready to Experiment!'}`,
            inline: true
        });

        embed.setFooter({ 
            text: 'Use the dropdown and buttons below to explore your collection in detail!' 
        });

        return embed;
    },

    // Create control components
    createCollectionControls(user, summary) {
        const components = [];

        // Series selection dropdown
        const seriesOptions = [];
        const seriesEntries = Object.entries(summary.seriesBreakdown);
        
        // Add "All Items" option first
        seriesOptions.push({
            label: 'All Items',
            value: 'all',
            description: `View all ${summary.totalItems} items`,
            emoji: '📦'
        });

        // Add series options
        seriesEntries.forEach(([seriesName, items]) => {
            const itemCount = items.length;
            const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
            
            if (seriesName === 'Individual Items') {
                seriesOptions.push({
                    label: 'Individual Items',
                    value: 'individual',
                    description: `${itemCount} standalone items (${totalQuantity} total)`,
                    emoji: '🔸'
                });
            } else {
                seriesOptions.push({
                    label: `${seriesName.charAt(0).toUpperCase() + seriesName.slice(1)} Series`,
                    value: seriesName,
                    description: `${itemCount} types (${totalQuantity} total)`,
                    emoji: '🏷️'
                });
            }
        });

        // Only add dropdown if there are series to choose from
        if (seriesOptions.length > 1) {
            const seriesMenu = new StringSelectMenuBuilder()
                .setCustomId(`collection_series_${user.raUsername}`)
                .setPlaceholder('Choose a series to view...')
                .addOptions(seriesOptions.slice(0, 25)); // Discord limit

            components.push(new ActionRowBuilder().addComponents(seriesMenu));
        }

        // Filter and action buttons
        const actionButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`collection_filter_${user.raUsername}`)
                    .setLabel('🎯 Filters')
                    .setStyle(ButtonStyle.Secondary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_combine_${user.raUsername}`)
                    .setLabel('🔧 Combine Items')
                    .setStyle(ButtonStyle.Primary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_stats_${user.raUsername}`)
                    .setLabel('📊 Statistics')
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId(`collection_refresh_${user.raUsername}`)
                    .setLabel('🔄 Refresh')
                    .setStyle(ButtonStyle.Secondary)
            );

        components.push(actionButtons);

        return components;
    },

, 'i') }
                });

                if (!user || user.discordId !== interaction.user.id) {
                    return interaction.editReply({
                        content: '❌ You can only view your own collection.',
                        ephemeral: true
                    });
                }

                // Show detailed view of selected series
                await this.showSeriesDetail(interaction, user, selectedValue);
                
            } else if (interaction.customId.startsWith('collection_filter_apply_')) {
                username = interaction.customId.replace('collection_filter_apply_', '');
                selectedValue = interaction.values[0];
                
                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${username}// src/commands/user/collection.js - UPDATED with dropdown menu and series grouping
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { User } from '../../models/User.js';
import { GachaItem, CombinationRule } from '../../models/GachaItem.js';
import combinationService from '../../services/combinationService.js';
import gachaService from '../../services/gachaService.js';
import { formatGachaEmoji } from '../../config/gachaEmojis.js';
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View your gacha collection with filtering and combination options'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply({
                    content: '❌ You are not registered. Please ask an admin to register you first.'
                });
            }

            if (!user.gachaCollection || user.gachaCollection.length === 0) {
                return interaction.editReply({
                    content: '📦 Your collection is empty! Visit the gacha machine to start collecting items.'
                });
            }

            // Get collection summary with series breakdown
            const summary = gachaService.getUserCollectionSummary(user);
            
            // Create the main collection embed with series overview
            const mainEmbed = await this.createMainCollectionEmbed(user, summary);
            
            // Create control buttons and dropdown
            const components = this.createCollectionControls(user, summary);
            
            await interaction.editReply({ 
                embeds: [mainEmbed],
                components: components
            });

        } catch (error) {
            console.error('Error displaying collection:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching your collection.'
            });
        }
    },

    // Create the main collection overview embed
    async createMainCollectionEmbed(user, summary) {
        const embed = new EmbedBuilder()
            .setTitle(`📦 ${user.raUsername}'s Collection`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        // Main stats
        let description = `**Total Items:** ${summary.totalItems} (${summary.uniqueItems} unique)\n\n`;

        // Series breakdown - the main focus
        description += '📚 **Collection by Series:**\n';
        
        const seriesEntries = Object.entries(summary.seriesBreakdown);
        if (seriesEntries.length > 0) {
            // Sort by series name, but put "Individual Items" last
            seriesEntries.sort(([a], [b]) => {
                if (a === 'Individual Items') return 1;
                if (b === 'Individual Items') return -1;
                return a.localeCompare(b);
            });

            for (const [seriesName, items] of seriesEntries) {
                const itemCount = items.length;
                const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
                
                const displayName = seriesName === 'Individual Items' ? 
                    '🔸 Individual Items' : 
                    `🏷️ ${seriesName.charAt(0).toUpperCase() + seriesName.slice(1)} Series`;
                
                description += `${displayName}: ${itemCount} types (${totalQuantity} total)\n`;
            }
        } else {
            description += 'No items collected yet\n';
        }

        description += '\n';

        // Rarity summary (condensed)
        const rarityEmojis = {
            mythic: '🌟',
            legendary: '🟡',
            epic: '🟣',
            rare: '🔵',
            uncommon: '🟢',
            common: '⚪'
        };

        description += '💎 **Rarity Summary:**\n';
        let rarityLine = '';
        for (const [rarity, emoji] of Object.entries(rarityEmojis)) {
            const count = summary.rarityCount[rarity] || 0;
            if (count > 0) {
                rarityLine += `${emoji}${count} `;
            }
        }
        description += rarityLine || 'No items yet';

        embed.setDescription(description);

        // Add combination stats
        const combinationStats = combinationService.getCombinationStats(user);
        embed.addFields({
            name: '🔧 Combination Activity',
            value: `**Items Combined:** ${combinationStats.totalCombined}\n` +
                   `**Unique Combined:** ${combinationStats.uniqueCombined}\n` +
                   `**Discovery Status:** ${combinationStats.uniqueCombined > 0 ? 'Active Explorer!' : 'Ready to Experiment!'}`,
            inline: true
        });

        embed.setFooter({ 
            text: 'Use the dropdown and buttons below to explore your collection in detail!' 
        });

        return embed;
    },

    // Create control components
    createCollectionControls(user, summary) {
        const components = [];

        // Series selection dropdown
        const seriesOptions = [];
        const seriesEntries = Object.entries(summary.seriesBreakdown);
        
        // Add "All Items" option first
        seriesOptions.push({
            label: 'All Items',
            value: 'all',
            description: `View all ${summary.totalItems} items`,
            emoji: '📦'
        });

        // Add series options
        seriesEntries.forEach(([seriesName, items]) => {
            const itemCount = items.length;
            const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
            
            if (seriesName === 'Individual Items') {
                seriesOptions.push({
                    label: 'Individual Items',
                    value: 'individual',
                    description: `${itemCount} standalone items (${totalQuantity} total)`,
                    emoji: '🔸'
                });
            } else {
                seriesOptions.push({
                    label: `${seriesName.charAt(0).toUpperCase() + seriesName.slice(1)} Series`,
                    value: seriesName,
                    description: `${itemCount} types (${totalQuantity} total)`,
                    emoji: '🏷️'
                });
            }
        });

        // Only add dropdown if there are series to choose from
        if (seriesOptions.length > 1) {
            const seriesMenu = new StringSelectMenuBuilder()
                .setCustomId(`collection_series_${user.raUsername}`)
                .setPlaceholder('Choose a series to view...')
                .addOptions(seriesOptions.slice(0, 25)); // Discord limit

            components.push(new ActionRowBuilder().addComponents(seriesMenu));
        }

        // Filter and action buttons
        const actionButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`collection_filter_${user.raUsername}`)
                    .setLabel('🎯 Filters')
                    .setStyle(ButtonStyle.Secondary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_combine_${user.raUsername}`)
                    .setLabel('🔧 Combine Items')
                    .setStyle(ButtonStyle.Primary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_stats_${user.raUsername}`)
                    .setLabel('📊 Statistics')
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId(`collection_refresh_${user.raUsername}`)
                    .setLabel('🔄 Refresh')
                    .setStyle(ButtonStyle.Secondary)
            );

        components.push(actionButtons);

        return components;
    },

, 'i') }
                });

                if (!user || user.discordId !== interaction.user.id) {
                    return interaction.editReply({
                        content: '❌ You can only view your own collection.',
                        ephemeral: true
                    });
                }

                // Apply filter and show results
                await this.showFilteredItems(interaction, user, selectedValue);
            }

        } catch (error) {
            console.error('Error handling collection select menu:', error);
            await interaction.editReply({
                content: '❌ An error occurred.',
                ephemeral: true
            });
        }
    },

    async handleInspectButton(interaction, user) {
        if (!user.gachaCollection || user.gachaCollection.length === 0) {
            return interaction.editReply({
                content: '📦 Your collection is empty! Nothing to inspect.'
            });
        }

        // Create dropdown with all items in collection
        const itemOptions = [];
        
        // Sort items by rarity (highest first), then by name
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        const sortedItems = [...user.gachaCollection].sort((a, b) => {
            const aRarityIndex = rarityOrder.indexOf(a.rarity);
            const bRarityIndex = rarityOrder.indexOf(b.rarity);
            if (aRarityIndex !== bRarityIndex) {
                return aRarityIndex - bRarityIndex;
            }
            return a.itemName.localeCompare(b.itemName);
        });

        // Add up to 25 items to dropdown (Discord limit)
        for (const item of sortedItems.slice(0, 25)) {
            const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
            const quantity = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
            const seriesTag = item.seriesId ? ` [${item.seriesId}]` : '';
            
            itemOptions.push({
                label: item.itemName,
                value: item.itemId,
                description: `${gachaService.getRarityDisplayName(item.rarity)}${quantity}${seriesTag}`.slice(0, 100),
                emoji: item.emojiName
            });
        }

        const inspectMenu = new StringSelectMenuBuilder()
            .setCustomId(`collection_inspect_item_${user.raUsername}`)
            .setPlaceholder('Choose an item to inspect...')
            .addOptions(itemOptions);

        const components = [new ActionRowBuilder().addComponents(inspectMenu)];
        
        // Add back button
        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`collection_back_${user.raUsername}`)
                    .setLabel('← Back to Overview')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        components.push(backButton);

        await interaction.editReply({
            content: `🔍 **Choose an item to inspect:**\n` +
                     `${sortedItems.length > 25 ? `Showing top 25 of ${sortedItems.length} items (sorted by rarity)` : `${sortedItems.length} items available`}`,
            components: components
        });
    },

    // Show detailed view of a specific item
    async showItemDetail(interaction, user, itemId) {
        // Find the item in user's collection
        const collectionItem = user.gachaCollection.find(item => item.itemId === itemId);
        if (!collectionItem) {
            return interaction.editReply({
                content: '❌ Item not found in your collection.'
            });
        }

        // Get the original item data from database for complete information
        const originalItem = await GachaItem.findOne({ itemId });
        
        // Create detailed embed similar to pull result
        const rarityColor = gachaService.getRarityColor(collectionItem.rarity);
        const rarityEmoji = gachaService.getRarityEmoji(collectionItem.rarity);
        const rarityName = gachaService.getRarityDisplayName(collectionItem.rarity);
        const itemEmoji = formatGachaEmoji(collectionItem.emojiId, collectionItem.emojiName);
        
        const embed = new EmbedBuilder()
            .setTitle(`🔍 Item Details - ${collectionItem.itemName}`)
            .setColor(rarityColor)
            .setTimestamp();

        // Main item display - BIG and prominent like pull results
        let description = `# ${itemEmoji} **${collectionItem.itemName}**\n\n`;
        
        // Rarity with emoji
        description += `${rarityEmoji} **${rarityName}**`;
        
        // Quantity info
        if (collectionItem.quantity && collectionItem.quantity > 1) {
            const maxStack = originalItem?.maxStack || 1;
            description += `\n📦 **Quantity:** ${collectionItem.quantity}${maxStack > 1 ? `/${maxStack}` : ''}`;
        }
        
        // Series info
        if (collectionItem.seriesId) {
            description += `\n🏷️ **Series:** ${collectionItem.seriesId.charAt(0).toUpperCase() + collectionItem.seriesId.slice(1)}`;
        }

        // Source info
        const sourceEmojis = {
            gacha: '🎰',
            combined: '🔧',
            series_completion: '🏆',
            admin_grant: '🛠️'
        };
        const sourceNames = {
            gacha: 'Gacha Pull',
            combined: 'Item Combination',
            series_completion: 'Series Completion',
            admin_grant: 'Admin Grant'
        };
        const source = collectionItem.source || 'gacha';
        description += `\n${sourceEmojis[source] || '📦'} **Source:** ${sourceNames[source] || 'Unknown'}`;

        embed.setDescription(description);

        // Add item description
        const itemDescription = collectionItem.description || originalItem?.description;
        if (itemDescription) {
            embed.addFields({
                name: '📝 Description',
                value: `*${itemDescription}*`,
                inline: false
            });
        }

        // Add flavor text
        const flavorText = collectionItem.flavorText || originalItem?.flavorText;
        if (flavorText) {
            embed.addFields({
                name: '💭 Flavor Text',
                value: `*"${flavorText}"*`,
                inline: false
            });
        }

        // Add acquisition date
        if (collectionItem.obtainedAt) {
            const obtainedDate = new Date(collectionItem.obtainedAt);
            embed.addFields({
                name: '📅 Obtained',
                value: `<t:${Math.floor(obtainedDate.getTime() / 1000)}:F>`,
                inline: true
            });
        }

        // Add item type info
        if (originalItem?.itemType) {
            const typeNames = {
                trinket: 'Trinket',
                collectible: 'Collectible',
                series: 'Series Item',
                special: 'Special Item',
                combined: 'Combined Item'
            };
            embed.addFields({
                name: '🏷️ Type',
                value: typeNames[originalItem.itemType] || 'Unknown',
                inline: true
            });
        }

        // Add back button and action buttons
        const actionButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`collection_back_${user.raUsername}`)
                    .setLabel('← Back to Overview')
                    .setStyle(ButtonStyle.Secondary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_inspect_${user.raUsername}`)
                    .setLabel('🔍 Inspect Another')
                    .setStyle(ButtonStyle.Secondary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_combine_${user.raUsername}`)
                    .setLabel('🔧 Combine Items')
                    .setStyle(ButtonStyle.Primary)
            );

        embed.setFooter({ 
            text: 'This is the same detailed view you see when pulling this item from the gacha!' 
        });

        await interaction.editReply({
            embeds: [embed],
            components: [actionButtons]
        });
    },
    async showFilteredItems(interaction, user, filter) {
        let items = [...user.gachaCollection];
        let title = '';

        // Apply filter
        switch (filter) {
            case 'all':
                title = `📦 All Items (${items.length})`;
                break;
            case 'mythic':
            case 'legendary':
            case 'epic':
            case 'rare':
                items = items.filter(item => item.rarity === filter);
                const rarityEmoji = gachaService.getRarityEmoji(filter);
                const rarityName = gachaService.getRarityDisplayName(filter);
                title = `${rarityEmoji} ${rarityName} Items (${items.length})`;
                break;
            case 'stackable':
                items = items.filter(item => (item.quantity || 1) > 1);
                title = `📚 Stackable Items (${items.length})`;
                break;
            case 'combined':
                items = items.filter(item => item.source === 'combined');
                title = `🔧 Combined Items (${items.length})`;
                break;
            case 'series_completion':
                items = items.filter(item => item.source === 'series_completion');
                title = `🏆 Series Completion Rewards (${items.length})`;
                break;
            default:
                title = `📦 Filtered Items (${items.length})`;
        }

        // Sort by rarity (highest first), then by name
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        items.sort((a, b) => {
            const aRarityIndex = rarityOrder.indexOf(a.rarity);
            const bRarityIndex = rarityOrder.indexOf(b.rarity);
            if (aRarityIndex !== bRarityIndex) {
                return aRarityIndex - bRarityIndex;
            }
            return a.itemName.localeCompare(b.itemName);
        });

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(COLORS.INFO)
            .setTimestamp();

        if (items.length === 0) {
            embed.setDescription('No items match this filter.');
        } else {
            // Display items in groups by rarity for better organization
            const rarityGroups = {};
            items.forEach(item => {
                if (!rarityGroups[item.rarity]) {
                    rarityGroups[item.rarity] = [];
                }
                rarityGroups[item.rarity].push(item);
            });

            let description = '';
            
            for (const rarity of rarityOrder) {
                const rarityItems = rarityGroups[rarity];
                if (!rarityItems || rarityItems.length === 0) continue;

                const rarityEmoji = gachaService.getRarityEmoji(rarity);
                const rarityName = gachaService.getRarityDisplayName(rarity);
                
                if (filter !== rarity) { // Don't show rarity header if we're filtering by that rarity
                    description += `\n${rarityEmoji} **${rarityName}** (${rarityItems.length})\n`;
                }
                
                for (const item of rarityItems.slice(0, 10)) { // Limit per rarity
                    const emoji = formatGachaEmoji(item.emojiId, item.emojiName);
                    const quantity = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
                    const sourceIcon = item.source === 'combined' ? ' 🔧' : 
                                     item.source === 'series_completion' ? ' 🏆' : '';
                    const seriesTag = item.seriesId ? ` [${item.seriesId}]` : '';
                    
                    description += `${emoji} **${item.itemName}**${quantity}${sourceIcon}${seriesTag}\n`;
                }
                
                if (rarityItems.length > 10) {
                    description += `*...and ${rarityItems.length - 10} more ${rarityName} items*\n`;
                }
            }

            embed.setDescription(description.trim());
        }

        // Add back button and inspect button
        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`collection_back_${user.raUsername}`)
                    .setLabel('← Back to Overview')
                    .setStyle(ButtonStyle.Secondary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_inspect_${user.raUsername}`)
                    .setLabel('🔍 Inspect Item')
                    .setStyle(ButtonStyle.Secondary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_combine_${user.raUsername}`)
                    .setLabel('🔧 Combine Items')
                    .setStyle(ButtonStyle.Primary)
            );

        embed.setFooter({ 
            text: '🔧 = Combined • 🏆 = Series reward • [series] = Series name' 
        });

        await interaction.editReply({
            embeds: [embed],
            components: [backButton]
        });
    },
    async showSeriesDetail(interaction, user, seriesFilter) {
        const summary = gachaService.getUserCollectionSummary(user);
        let items = [];
        let title = '';

        if (seriesFilter === 'all') {
            items = user.gachaCollection;
            title = `📦 All Items (${items.length})`;
        } else if (seriesFilter === 'individual') {
            items = user.gachaCollection.filter(item => !item.seriesId);
            title = `🔸 Individual Items (${items.length})`;
        } else {
            items = user.gachaCollection.filter(item => item.seriesId === seriesFilter);
            const seriesName = seriesFilter.charAt(0).toUpperCase() + seriesFilter.slice(1);
            title = `🏷️ ${seriesName} Series (${items.length})`;
        }

        // Sort by rarity (highest first), then by name
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        items.sort((a, b) => {
            const aRarityIndex = rarityOrder.indexOf(a.rarity);
            const bRarityIndex = rarityOrder.indexOf(b.rarity);
            if (aRarityIndex !== bRarityIndex) {
                return aRarityIndex - bRarityIndex;
            }
            return a.itemName.localeCompare(b.itemName);
        });

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(COLORS.INFO)
            .setTimestamp();

        if (items.length === 0) {
            embed.setDescription('No items in this category.');
        } else {
            // Group by rarity for better display
            const rarityGroups = {};
            items.forEach(item => {
                if (!rarityGroups[item.rarity]) {
                    rarityGroups[item.rarity] = [];
                }
                rarityGroups[item.rarity].push(item);
            });

            let description = '';
            
            for (const rarity of rarityOrder) {
                const rarityItems = rarityGroups[rarity];
                if (!rarityItems || rarityItems.length === 0) continue;

                const rarityEmoji = gachaService.getRarityEmoji(rarity);
                const rarityName = gachaService.getRarityDisplayName(rarity);
                
                description += `\n${rarityEmoji} **${rarityName}** (${rarityItems.length})\n`;
                
                for (const item of rarityItems.slice(0, 8)) { // Limit per rarity to avoid long embeds
                    const emoji = formatGachaEmoji(item.emojiId, item.emojiName);
                    const quantity = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
                    const sourceIcon = item.source === 'combined' ? ' 🔧' : 
                                     item.source === 'series_completion' ? ' 🏆' : '';
                    
                    description += `${emoji} **${item.itemName}**${quantity}${sourceIcon}\n`;
                }
                
                if (rarityItems.length > 8) {
                    description += `*...and ${rarityItems.length - 8} more ${rarityName} items*\n`;
                }
            }

            embed.setDescription(description.trim());
        }

        // Add back button and inspect button
        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`collection_back_${user.raUsername}`)
                    .setLabel('← Back to Overview')
                    .setStyle(ButtonStyle.Secondary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_inspect_${user.raUsername}`)
                    .setLabel('🔍 Inspect Item')
                    .setStyle(ButtonStyle.Secondary),
                
                new ButtonBuilder()
                    .setCustomId(`collection_combine_${user.raUsername}`)
                    .setLabel('🔧 Combine Items')
                    .setStyle(ButtonStyle.Primary)
            );

        embed.setFooter({ 
            text: '🔧 = Combined item • 🏆 = Series completion reward' 
        });

        await interaction.editReply({
            embeds: [embed],
            components: [backButton]
        });
    },

    // Handle button interactions
    async handleButtonInteraction(interaction) {
        if (!interaction.customId.startsWith('collection_')) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            const [, action, username] = interaction.customId.split('_');
            
            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply({
                    content: '❌ User not found.',
                    ephemeral: true
                });
            }

            // Check if the person clicking is the owner
            if (user.discordId !== interaction.user.id) {
                return interaction.editReply({
                    content: '❌ You can only manage your own collection.',
                    ephemeral: true
                });
            }

            switch (action) {
                case 'back':
                    await this.handleBackToOverview(interaction, user);
                    break;
                case 'filter':
                    await this.handleFilterButton(interaction, user);
                    break;
                case 'inspect':
                    await this.handleInspectButton(interaction, user);
                    break;
                case 'combine':
                    await this.handleCombineButton(interaction, user);
                    break;
                case 'stats':
                    await this.handleStatsButton(interaction, user);
                    break;
                case 'refresh':
                    await this.handleRefreshButton(interaction, user);
                    break;
                default:
                    await interaction.editReply('Unknown action.');
            }

        } catch (error) {
            console.error('Error handling collection button:', error);
            await interaction.editReply({
                content: '❌ An error occurred.',
                ephemeral: true
            });
        }
    },

    async handleBackToOverview(interaction, user) {
        const summary = gachaService.getUserCollectionSummary(user);
        const mainEmbed = await this.createMainCollectionEmbed(user, summary);
        const components = this.createCollectionControls(user, summary);
        
        await interaction.editReply({
            embeds: [mainEmbed],
            components: components
        });
    },

    async handleFilterButton(interaction, user) {
        // Create filter dropdown
        const filterMenu = new StringSelectMenuBuilder()
            .setCustomId(`collection_filter_apply_${user.raUsername}`)
            .setPlaceholder('Choose a filter...')
            .addOptions([
                {
                    label: 'All Items',
                    value: 'all',
                    description: 'Show all items',
                    emoji: '📦'
                },
                {
                    label: 'Mythic Rarity',
                    value: 'mythic',
                    description: 'Show only mythic items',
                    emoji: '🌟'
                },
                {
                    label: 'Legendary Rarity',
                    value: 'legendary',
                    description: 'Show only legendary items',
                    emoji: '🟡'
                },
                {
                    label: 'Epic Rarity',
                    value: 'epic',
                    description: 'Show only epic items',
                    emoji: '🟣'
                },
                {
                    label: 'Rare Rarity',
                    value: 'rare',
                    description: 'Show only rare items',
                    emoji: '🔵'
                },
                {
                    label: 'Stackable Items',
                    value: 'stackable',
                    description: 'Items with quantity > 1',
                    emoji: '📚'
                },
                {
                    label: 'Combined Items',
                    value: 'combined',
                    description: 'Items made through combination',
                    emoji: '🔧'
                },
                {
                    label: 'Series Rewards',
                    value: 'series_completion',
                    description: 'Items from completing series',
                    emoji: '🏆'
                }
            ]);

        const components = [new ActionRowBuilder().addComponents(filterMenu)];
        
        // Add back button
        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`collection_back_${user.raUsername}`)
                    .setLabel('← Back to Overview')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        components.push(backButton);
        
        await interaction.editReply({
            content: '🎯 **Choose a filter to apply:**',
            components: components
        });
    },

    async handleCombineButton(interaction, user) {
        const possibleCombinations = await combinationService.getPossibleCombinations(user);
        
        if (possibleCombinations.length === 0) {
            return interaction.editReply({
                content: '🔧 No combinations available!\n\n' +
                         '💡 **Tips:**\n' +
                         '• Collect more items from the gacha machine\n' +
                         '• Try different combinations - some are discovered through experimentation!\n' +
                         '• Ask other users what combinations they\'ve discovered'
            });
        }

        // Separate available from unavailable
        const available = possibleCombinations.filter(c => c.canMake && !c.isAutomatic);
        const unavailable = possibleCombinations.filter(c => !c.canMake && !c.isAutomatic);
        const automatic = possibleCombinations.filter(c => c.isAutomatic);

        const embed = new EmbedBuilder()
            .setTitle(`🔧 ${user.raUsername}'s Combination Workshop`)
            .setColor(COLORS.INFO)
            .setDescription('Select a combination to create new items!')
            .setTimestamp();

        // Show available combinations
        if (available.length > 0) {
            let availableText = '';
            for (const combo of available.slice(0, 5)) {
                const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName);
                availableText += `${resultEmoji} **${combo.resultItem.itemName}** x${combo.result.quantity}\n`;
                
                // Show ingredients briefly
                let ingredientsText = '';
                for (const ing of combo.ingredients) {
                    const item = await GachaItem.findOne({ itemId: ing.itemId });
                    const emoji = item ? formatGachaEmoji(item.emojiId, item.emojiName) : '❓';
                    ingredientsText += `${emoji}${ing.quantity} `;
                }
                availableText += `   *Needs: ${ingredientsText}*\n\n`;
            }
            
            if (available.length > 5) {
                availableText += `*...and ${available.length - 5} more*\n`;
            }
            
            embed.addFields({ 
                name: `✅ Ready to Make (${available.length})`, 
                value: availableText,
                inline: false 
            });
        }

        const components = [];

        // Add selection menu for available combinations
        if (available.length > 0) {
            const combineMenu = new StringSelectMenuBuilder()
                .setCustomId(`combine_select_${user.raUsername}`)
                .setPlaceholder('Choose a combination to make...')
                .addOptions(
                    available.slice(0, 25).map(combo => {
                        const ingredientCount = combo.ingredients.reduce((sum, ing) => sum + ing.quantity, 0);
                        return {
                            label: combo.resultItem.itemName,
                            value: combo.ruleId,
                            description: `${ingredientCount} ingredients → ${combo.result.quantity}x result`,
                            emoji: combo.resultItem.emojiName
                        };
                    })
                );
            
            components.push(new ActionRowBuilder().addComponents(combineMenu));
        }

        await interaction.editReply({ embeds: [embed], components });
    },

    async handleStatsButton(interaction, user) {
        const stats = combinationService.getCombinationStats(user);
        const summary = gachaService.getUserCollectionSummary(user);
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${user.raUsername}'s Collection Statistics`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        // Collection stats
        embed.addFields({
            name: '📦 Collection Overview',
            value: `**Total Items:** ${summary.totalItems}\n` +
                   `**Unique Items:** ${summary.uniqueItems}\n` +
                   `**Series Collected:** ${Object.keys(summary.seriesBreakdown).length}`,
            inline: true
        });

        // Rarity breakdown
        let rarityText = '';
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        for (const rarity of rarityOrder) {
            const count = summary.rarityCount[rarity] || 0;
            if (count > 0) {
                const emoji = gachaService.getRarityEmoji(rarity);
                const name = gachaService.getRarityDisplayName(rarity);
                rarityText += `${emoji} ${name}: ${count}\n`;
            }
        }

        embed.addFields({
            name: '💎 Rarity Breakdown',
            value: rarityText || 'No items yet',
            inline: true
        });

        // Combination stats
        embed.addFields({
            name: '🔧 Combination Activity',
            value: `**Items Combined:** ${stats.totalCombined}\n` +
                   `**Unique Combined:** ${stats.uniqueCombined}\n` +
                   `**Discovery Status:** ${stats.uniqueCombined > 0 ? 'Active Explorer!' : 'Ready to Experiment!'}`,
            inline: true
        });

        // Source breakdown
        embed.addFields({
            name: '🎯 Item Sources',
            value: `🎰 Gacha: ${summary.sourceBreakdown.gacha || 0}\n` +
                   `🔧 Combined: ${summary.sourceBreakdown.combined || 0}\n` +
                   `🏆 Series Rewards: ${summary.sourceBreakdown.series_completion || 0}`,
            inline: false
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleRefreshButton(interaction, user) {
        // Check for any auto-combinations that might have triggered
        const autoCombinations = await combinationService.checkAutoCombinations(user);
        
        let message = '🔄 Collection refreshed!';
        
        if (autoCombinations.length > 0) {
            message += '\n\n⚡ **Auto-combinations occurred:**\n';
            for (const combo of autoCombinations) {
                const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName);
                message += `${resultEmoji} ${combo.resultQuantity}x ${combo.resultItem.itemName}\n`;
            }
        }

        await interaction.editReply({ content: message });
    },

    // Handle combination confirmation (existing methods)
    async handleCombineConfirm(interaction) {
        if (!interaction.customId.startsWith('combine_confirm_')) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            const [, , username, ruleId] = interaction.customId.split('_');
            
            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user || user.discordId !== interaction.user.id) {
                return interaction.editReply({
                    content: '❌ You can only manage your own collection.',
                    ephemeral: true
                });
            }

            const result = await combinationService.attemptCombination(user, ruleId);
            
            if (!result.success) {
                return interaction.editReply({
                    content: `❌ Combination failed: ${result.error}`
                });
            }

            // Success! Show what happened
            const resultEmoji = formatGachaEmoji(result.resultItem.emojiId, result.resultItem.emojiName);
            
            let message = `🎉 **Combination Successful!**\n\n`;
            message += `${resultEmoji} **Created: ${result.resultQuantity}x ${result.resultItem.itemName}**\n\n`;
            
            message += `📦 **Consumed:**\n`;
            for (const ingredient of result.ingredients) {
                const item = await GachaItem.findOne({ itemId: ingredient.itemId });
                const emoji = item ? formatGachaEmoji(item.emojiId, item.emojiName) : '❓';
                message += `${emoji} ${ingredient.quantity}x ${item?.itemName || ingredient.itemId}\n`;
            }

            await interaction.editReply({ content: message });

            // Check for auto-combinations triggered by this result
            const autoCombinations = await combinationService.checkAutoCombinations(user);
            
            if (autoCombinations.length > 0) {
                let autoMessage = '\n⚡ **Bonus auto-combinations triggered:**\n';
                for (const combo of autoCombinations) {
                    const autoEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName);
                    autoMessage += `${autoEmoji} ${combo.resultQuantity}x ${combo.resultItem.itemName}\n`;
                }
                
                await interaction.followUp({
                    content: autoMessage,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Error confirming combination:', error);
            await interaction.editReply({
                content: '❌ An error occurred during combination.',
                ephemeral: true
            });
        }
    }
};
