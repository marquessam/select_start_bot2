// src/commands/user/collection.js - Clean and concise version
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { User } from '../../models/User.js';
import { GachaItem } from '../../models/GachaItem.js';
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

            await this.showMainOverview(interaction, user);
        } catch (error) {
            console.error('Error displaying collection:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching your collection.'
            });
        }
    },

    // Helper function to check if a string is a unicode emoji
    isUnicodeEmoji(str) {
        if (!str || str.length === 0) return false;
        if (str.startsWith(':') || str.startsWith('<:')) return false;
        const emojiRegex = /^[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
        return emojiRegex.test(str);
    },

    // Main overview display
    async showMainOverview(interaction, user) {
        const summary = gachaService.getUserCollectionSummary(user);
        const combinationStats = combinationService.getCombinationStats(user);
        
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Collection`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        let description = `**Total Items:** ${summary.totalItems} (${summary.uniqueItems} unique)\n\n`;

        // Series breakdown
        description += '📚 **Collection by Series:**\n';
        const seriesEntries = Object.entries(summary.seriesBreakdown);
        if (seriesEntries.length > 0) {
            seriesEntries.sort(([a], [b]) => {
                if (a === 'Individual Items') return 1;
                if (b === 'Individual Items') return -1;
                return a.localeCompare(b);
            });

            for (const [seriesName, items] of seriesEntries) {
                const itemCount = items.length;
                const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
                const displayName = seriesName === 'Individual Items' ? 
                    'Individual Items' : 
                    `${seriesName.charAt(0).toUpperCase() + seriesName.slice(1)} Series`;
                description += `${displayName}: ${itemCount} types (${totalQuantity} total)\n`;
            }
        }

        // Rarity summary
        description += '\n💎 **Rarity Summary:**\n';
        const rarityEmojis = { mythic: '🌟', legendary: '🟡', epic: '🟣', rare: '🔵', uncommon: '🟢', common: '⚪' };
        let rarityLine = '';
        for (const [rarity, emoji] of Object.entries(rarityEmojis)) {
            const count = summary.rarityCount[rarity] || 0;
            if (count > 0) rarityLine += `${emoji}${count} `;
        }
        description += rarityLine || 'No items yet';

        embed.setDescription(description);

        // Combination stats
        embed.addFields({
            name: '🔧 Combination Activity',
            value: `**Items Combined:** ${combinationStats.totalCombined}\n` +
                   `**Unique Combined:** ${combinationStats.uniqueCombined}\n` +
                   `**Discovery Status:** ${combinationStats.uniqueCombined > 0 ? 'Active Explorer!' : 'Ready to Experiment!'}`,
            inline: true
        });

        embed.setFooter({ text: 'Use the dropdown and buttons below to explore your collection!' });

        const components = this.createMainControls(user, summary);
        await interaction.editReply({ embeds: [embed], components: components });
    },

    // Create main control components
    createMainControls(user, summary) {
        const components = [];

        // Series dropdown
        const seriesOptions = [{ label: 'All Items', value: 'all', description: `View all ${summary.totalItems} items`, emoji: '📦' }];
        
        Object.entries(summary.seriesBreakdown).forEach(([seriesName, items]) => {
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

        if (seriesOptions.length > 1) {
            const seriesMenu = new StringSelectMenuBuilder()
                .setCustomId(`collection_series_${user.raUsername}`)
                .setPlaceholder('Choose a series to view...')
                .addOptions(seriesOptions.slice(0, 25));
            components.push(new ActionRowBuilder().addComponents(seriesMenu));
        }

        // Action buttons
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

    // Show items as emoji grid
    async showItemGrid(interaction, user, items, title, page = 0) {
        const ITEMS_PER_PAGE = 60;
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const startIndex = page * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, items.length);
        const pageItems = items.slice(startIndex, endIndex);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(COLORS.INFO)
            .setTimestamp();

        if (items.length === 0) {
            embed.setDescription('No items to display.');
        } else {
            // Group by rarity and create emoji grid
            const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
            const rarityGroups = {};
            pageItems.forEach(item => {
                if (!rarityGroups[item.rarity]) rarityGroups[item.rarity] = [];
                rarityGroups[item.rarity].push(item);
            });

            let description = '';
            for (const rarity of rarityOrder) {
                const rarityItems = rarityGroups[rarity];
                if (!rarityItems || rarityItems.length === 0) continue;

                const rarityEmoji = gachaService.getRarityEmoji(rarity);
                const rarityName = gachaService.getRarityDisplayName(rarity);
                description += `\n${rarityEmoji} **${rarityName}** (${rarityItems.length})\n`;
                
                // Create emoji grid (8 per row)
                let currentRow = '';
                for (let i = 0; i < rarityItems.length; i++) {
                    const item = rarityItems[i];
                    const emoji = formatGachaEmoji(item.emojiId, item.emojiName);
                    const quantity = (item.quantity || 1) > 1 ? `⁽${item.quantity}⁾` : '';
                    currentRow += `${emoji}${quantity} `;
                    
                    if ((i + 1) % 8 === 0 || i === rarityItems.length - 1) {
                        description += currentRow.trim() + '\n';
                        currentRow = '';
                    }
                }
            }
            embed.setDescription(description.trim());
        }

        // Pagination footer
        if (totalPages > 1) {
            embed.setFooter({ text: `Page ${page + 1}/${totalPages} • Showing ${startIndex + 1}-${endIndex} of ${items.length} items • ⁽ⁿ⁾ = quantity` });
        } else {
            embed.setFooter({ text: '⁽ⁿ⁾ = quantity • Use Inspect Item to see details' });
        }

        // Create navigation components
        const components = [];
        
        // Pagination buttons
        if (totalPages > 1) {
            const navButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`collection_prev_${user.raUsername}`)
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('page_indicator')
                        .setLabel(`${page + 1}/${totalPages}`)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`collection_next_${user.raUsername}`)
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages - 1)
                );
            components.push(navButtons);
        }

        // Action buttons
        const actionButtons = new ActionRowBuilder()
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
        components.push(actionButtons);

        await interaction.editReply({ embeds: [embed], components: components });
    },

    // Show item details
    async showItemDetail(interaction, user, itemId) {
        const collectionItem = user.gachaCollection.find(item => item.itemId === itemId);
        if (!collectionItem) {
            return interaction.editReply({ content: '❌ Item not found in your collection.' });
        }

        const originalItem = await GachaItem.findOne({ itemId });
        const rarityColor = gachaService.getRarityColor(collectionItem.rarity);
        const rarityEmoji = gachaService.getRarityEmoji(collectionItem.rarity);
        const rarityName = gachaService.getRarityDisplayName(collectionItem.rarity);
        const itemEmoji = formatGachaEmoji(collectionItem.emojiId, collectionItem.emojiName);
        
        const embed = new EmbedBuilder()
            .setTitle(`Item Details - ${collectionItem.itemName}`)
            .setColor(rarityColor)
            .setTimestamp();

        let description = `# ${itemEmoji} **${collectionItem.itemName}**\n\n${rarityEmoji} **${rarityName}**`;
        
        if (collectionItem.quantity && collectionItem.quantity > 1) {
            const maxStack = originalItem?.maxStack || 1;
            description += `\n**Quantity:** ${collectionItem.quantity}${maxStack > 1 ? `/${maxStack}` : ''}`;
        }
        
        if (collectionItem.seriesId) {
            description += `\n**Series:** ${collectionItem.seriesId.charAt(0).toUpperCase() + collectionItem.seriesId.slice(1)}`;
        }

        const sourceNames = { gacha: 'Gacha Pull', combined: 'Item Combination', series_completion: 'Series Completion', admin_grant: 'Admin Grant' };
        const source = collectionItem.source || 'gacha';
        description += `\n**Source:** ${sourceNames[source] || 'Unknown'}`;

        embed.setDescription(description);

        // Add fields for description, flavor text, etc.
        const itemDescription = collectionItem.description || originalItem?.description;
        if (itemDescription) {
            embed.addFields({ name: 'Description', value: `*${itemDescription}*`, inline: false });
        }

        const flavorText = collectionItem.flavorText || originalItem?.flavorText;
        if (flavorText) {
            embed.addFields({ name: 'Flavor Text', value: `*"${flavorText}"*`, inline: false });
        }

        if (collectionItem.obtainedAt) {
            const obtainedDate = new Date(collectionItem.obtainedAt);
            embed.addFields({ name: 'Obtained', value: `<t:${Math.floor(obtainedDate.getTime() / 1000)}:F>`, inline: true });
        }

        // Action buttons
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

        await interaction.editReply({ embeds: [embed], components: [actionButtons] });
    },

    // Handle dropdown interactions
    async handleSelectMenuInteraction(interaction) {
        if (!interaction.customId.startsWith('collection_')) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            if (interaction.customId.startsWith('collection_series_')) {
                const username = interaction.customId.replace('collection_series_', '');
                const selectedValue = interaction.values[0];
                
                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
                });

                if (!user || user.discordId !== interaction.user.id) {
                    return interaction.editReply({ content: '❌ You can only view your own collection.' });
                }

                // Filter items and show grid
                let items = [];
                let title = '';
                
                if (selectedValue === 'all') {
                    items = user.gachaCollection;
                    title = `All Items (${items.length})`;
                } else if (selectedValue === 'individual') {
                    items = user.gachaCollection.filter(item => !item.seriesId);
                    title = `Individual Items (${items.length})`;
                } else {
                    items = user.gachaCollection.filter(item => item.seriesId === selectedValue);
                    const seriesName = selectedValue.charAt(0).toUpperCase() + selectedValue.slice(1);
                    title = `${seriesName} Series (${items.length})`;
                }

                // Sort items
                const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
                items.sort((a, b) => {
                    const aRarityIndex = rarityOrder.indexOf(a.rarity);
                    const bRarityIndex = rarityOrder.indexOf(b.rarity);
                    if (aRarityIndex !== bRarityIndex) return aRarityIndex - bRarityIndex;
                    return a.itemName.localeCompare(b.itemName);
                });

                await this.showItemGrid(interaction, user, items, title);
                
            } else if (interaction.customId.startsWith('collection_inspect_item_')) {
                const username = interaction.customId.replace('collection_inspect_item_', '');
                const itemId = interaction.values[0];
                
                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
                });

                if (!user || user.discordId !== interaction.user.id) {
                    return interaction.editReply({ content: '❌ You can only view your own collection.' });
                }

                await this.showItemDetail(interaction, user, itemId);
            }

        } catch (error) {
            console.error('Error handling collection select menu:', error);
            await interaction.editReply({ content: '❌ An error occurred.' });
        }
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

            if (!user || user.discordId !== interaction.user.id) {
                return interaction.editReply({ content: '❌ You can only manage your own collection.' });
            }

            switch (action) {
                case 'back':
                    await this.showMainOverview(interaction, user);
                    break;
                case 'inspect':
                    await this.handleInspectButton(interaction, user);
                    break;
                case 'filter':
                    await this.handleFilterButton(interaction, user);
                    break;
                case 'combine':
                    await this.handleCombineButton(interaction, user);
                    break;
                case 'stats':
                    await this.handleStatsButton(interaction, user);
                    break;
                default:
                    await interaction.editReply('Unknown action.');
            }

        } catch (error) {
            console.error('Error handling collection button:', error);
            await interaction.editReply({ content: '❌ An error occurred.' });
        }
    },

    // Handle inspect button
    async handleInspectButton(interaction, user) {
        if (!user.gachaCollection || user.gachaCollection.length === 0) {
            return interaction.editReply({ content: '📦 Your collection is empty! Nothing to inspect.' });
        }

        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        const sortedItems = [...user.gachaCollection].sort((a, b) => {
            const aRarityIndex = rarityOrder.indexOf(a.rarity);
            const bRarityIndex = rarityOrder.indexOf(b.rarity);
            if (aRarityIndex !== bRarityIndex) return aRarityIndex - bRarityIndex;
            return a.itemName.localeCompare(b.itemName);
        });

        const itemOptions = [];
        for (const item of sortedItems.slice(0, 25)) {
            const quantity = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
            const seriesTag = item.seriesId ? ` [${item.seriesId}]` : '';
            
            let emojiOption = undefined;
            if (item.emojiId && item.emojiName) {
                emojiOption = { id: item.emojiId, name: item.emojiName };
            } else if (item.emojiName && this.isUnicodeEmoji(item.emojiName)) {
                emojiOption = item.emojiName;
            }
            
            const option = {
                label: item.itemName,
                value: item.itemId,
                description: `${gachaService.getRarityDisplayName(item.rarity)}${quantity}${seriesTag}`.slice(0, 100)
            };
            
            if (emojiOption) option.emoji = emojiOption;
            itemOptions.push(option);
        }

        const inspectMenu = new StringSelectMenuBuilder()
            .setCustomId(`collection_inspect_item_${user.raUsername}`)
            .setPlaceholder('Choose an item to inspect...')
            .addOptions(itemOptions);

        const components = [
            new ActionRowBuilder().addComponents(inspectMenu),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`collection_back_${user.raUsername}`)
                    .setLabel('← Back to Overview')
                    .setStyle(ButtonStyle.Secondary)
            )
        ];

        await interaction.editReply({
            content: `🔍 **Choose an item to inspect:**\n${sortedItems.length > 25 ? `Showing top 25 of ${sortedItems.length} items` : `${sortedItems.length} items available`}`,
            components: components
        });
    },

    // Other button handlers (simplified)
    async handleFilterButton(interaction, user) {
        const filterMenu = new StringSelectMenuBuilder()
            .setCustomId(`collection_filter_apply_${user.raUsername}`)
            .setPlaceholder('Choose a filter...')
            .addOptions([
                { label: 'All Items', value: 'all', description: 'Show all items', emoji: '📦' },
                { label: 'Mythic Rarity', value: 'mythic', description: 'Show only mythic items', emoji: '🌟' },
                { label: 'Legendary Rarity', value: 'legendary', description: 'Show only legendary items', emoji: '🟡' },
                { label: 'Epic Rarity', value: 'epic', description: 'Show only epic items', emoji: '🟣' },
                { label: 'Rare Rarity', value: 'rare', description: 'Show only rare items', emoji: '🔵' },
                { label: 'Stackable Items', value: 'stackable', description: 'Items with quantity > 1', emoji: '📚' },
                { label: 'Combined Items', value: 'combined', description: 'Items made through combination', emoji: '🔧' }
            ]);

        const components = [
            new ActionRowBuilder().addComponents(filterMenu),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`collection_back_${user.raUsername}`)
                    .setLabel('← Back to Overview')
                    .setStyle(ButtonStyle.Secondary)
            )
        ];
        
        await interaction.editReply({ content: '🎯 **Choose a filter to apply:**', components: components });
    },

    async handleCombineButton(interaction, user) {
        const possibleCombinations = await combinationService.getPossibleCombinations(user);
        if (possibleCombinations.length === 0) {
            return interaction.editReply({
                content: '🔧 No combinations available!\n\n💡 **Tips:**\n• Collect more items from the gacha machine\n• Try different combinations - some are discovered through experimentation!'
            });
        }
        // Simplified combination interface
        await interaction.editReply({ content: '🔧 Combination system - check the combination service for available recipes!' });
    },

    async handleStatsButton(interaction, user) {
        const stats = combinationService.getCombinationStats(user);
        const summary = gachaService.getUserCollectionSummary(user);
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${user.raUsername}'s Collection Statistics`)
            .setColor(COLORS.INFO)
            .addFields(
                { name: '📦 Collection', value: `**Total:** ${summary.totalItems}\n**Unique:** ${summary.uniqueItems}\n**Series:** ${Object.keys(summary.seriesBreakdown).length}`, inline: true },
                { name: '🔧 Combinations', value: `**Combined:** ${stats.totalCombined}\n**Unique:** ${stats.uniqueCombined}`, inline: true },
                { name: '🎯 Sources', value: `**Gacha:** ${summary.sourceBreakdown.gacha || 0}\n**Combined:** ${summary.sourceBreakdown.combined || 0}\n**Rewards:** ${summary.sourceBreakdown.series_completion || 0}`, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
