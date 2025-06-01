// src/commands/user/collection.js - Fixed interaction handling
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
import gachaService from '../../services/gachaService.js';
import { formatGachaEmoji } from '../../config/gachaEmojis.js';
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View your gacha collection'),

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

            // Go straight to showing all items
            await this.showItemsPage(interaction, user, 'all', 0);
        } catch (error) {
            console.error('Error displaying collection:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching your collection.'
            });
        }
    },

    // Main function to show items page
    async showItemsPage(interaction, user, filter = 'all', page = 0) {
        const ITEMS_PER_PAGE = 25;
        
        // Filter items based on selection
        let filteredItems = [];
        let title = '';
        
        if (filter === 'all') {
            filteredItems = user.gachaCollection;
            title = `All Items`;
        } else {
            // Series filter
            filteredItems = user.gachaCollection.filter(item => item.seriesId === filter);
            const seriesName = filter.charAt(0).toUpperCase() + filter.slice(1);
            title = `${seriesName} Series`;
        }

        // Sort by rarity, then by name
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        filteredItems.sort((a, b) => {
            const aRarityIndex = rarityOrder.indexOf(a.rarity);
            const bRarityIndex = rarityOrder.indexOf(b.rarity);
            if (aRarityIndex !== bRarityIndex) return aRarityIndex - bRarityIndex;
            return a.itemName.localeCompare(b.itemName);
        });

        // Pagination
        const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
        const startIndex = page * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredItems.length);
        const pageItems = filteredItems.slice(startIndex, endIndex);

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Collection - ${title}`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        if (pageItems.length === 0) {
            embed.setDescription('No items to display.');
        } else {
            // Group by rarity and create emoji grid
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
                
                // Create emoji grid (5 per row for better mobile viewing)
                let currentRow = '';
                for (let i = 0; i < rarityItems.length; i++) {
                    const item = rarityItems[i];
                    const emoji = formatGachaEmoji(item.emojiId, item.emojiName);
                    const quantity = (item.quantity || 1) > 1 ? `⁽${item.quantity}⁾` : '';
                    currentRow += `${emoji}${quantity} `;
                    
                    if ((i + 1) % 5 === 0 || i === rarityItems.length - 1) {
                        description += currentRow.trim() + '\n';
                        currentRow = '';
                    }
                }
            }
            embed.setDescription(description.trim());
        }

        // Footer with pagination info
        if (totalPages > 1) {
            embed.setFooter({ 
                text: `Page ${page + 1}/${totalPages} • ${startIndex + 1}-${endIndex} of ${filteredItems.length} items • ⁽ⁿ⁾ = quantity`
            });
        } else {
            embed.setFooter({ 
                text: `${filteredItems.length} items • ⁽ⁿ⁾ = quantity • Use Inspect to see details`
            });
        }

        // Create components
        const components = [];

        // Series dropdown (only if user has items from multiple series)
        const seriesOptions = this.getSeriesOptions(user);
        if (seriesOptions.length > 1) {
            const seriesMenu = new StringSelectMenuBuilder()
                .setCustomId(`coll_series_${user.raUsername}`)
                .setPlaceholder('Choose a series to view...')
                .addOptions(seriesOptions);
            components.push(new ActionRowBuilder().addComponents(seriesMenu));
        }

        // Navigation and action buttons
        const actionRow = new ActionRowBuilder();
        
        // Pagination buttons (only if more than one page)
        if (totalPages > 1) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`coll_prev_${user.raUsername}_${filter}`)
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('page_indicator')
                    .setLabel(`${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`coll_next_${user.raUsername}_${filter}`)
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages - 1)
            );
        }

        // Inspect button
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`coll_inspect_${user.raUsername}_${filter}_${page}`)
                .setLabel('🔍 Inspect')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pageItems.length === 0)
        );

        components.push(actionRow);

        // Use editReply if this is coming from a deferred interaction, otherwise followUp
        try {
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed], components: components });
            } else {
                await interaction.followUp({ embeds: [embed], components: components, ephemeral: true });
            }
        } catch (error) {
            console.error('Error updating collection display:', error);
            await interaction.followUp({ 
                content: '❌ Error updating collection display.',
                ephemeral: true 
            });
        }
    },

    // Get series options for dropdown
    getSeriesOptions(user) {
        const summary = gachaService.getUserCollectionSummary(user);
        const options = [
            { label: 'All Items', value: 'all', description: `View all ${summary.totalItems} items`, emoji: '📦' }
        ];

        Object.entries(summary.seriesBreakdown).forEach(([seriesName, items]) => {
            const itemCount = items.length;
            const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
            
            if (seriesName === 'Individual Items') {
                options.push({
                    label: 'Individual Items',
                    value: 'individual',
                    description: `${itemCount} standalone items`,
                    emoji: '🔸'
                });
            } else {
                options.push({
                    label: `${seriesName.charAt(0).toUpperCase() + seriesName.slice(1)}`,
                    value: seriesName,
                    description: `${itemCount} types (${totalQuantity} total)`,
                    emoji: '🏷️'
                });
            }
        });

        return options.slice(0, 25); // Discord limit
    },

    // Show item details
    async showItemDetail(interaction, user, itemId, returnFilter, returnPage) {
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

        let description = `${itemEmoji} **${collectionItem.itemName}**\n\n${rarityEmoji} **${rarityName}**`;
        
        if (collectionItem.quantity && collectionItem.quantity > 1) {
            description += `\n**Quantity:** ${collectionItem.quantity}`;
        }
        
        if (collectionItem.seriesId) {
            description += `\n**Series:** ${collectionItem.seriesId.charAt(0).toUpperCase() + collectionItem.seriesId.slice(1)}`;
        }

        const sourceNames = { 
            gacha: 'Gacha Pull', 
            combined: 'Item Combination', 
            series_completion: 'Series Completion', 
            admin_grant: 'Admin Grant' 
        };
        const source = collectionItem.source || 'gacha';
        description += `\n**Source:** ${sourceNames[source] || 'Unknown'}`;

        embed.setDescription(description);

        // Add description and flavor text if available
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
            embed.addFields({ 
                name: 'Obtained', 
                value: `<t:${Math.floor(obtainedDate.getTime() / 1000)}:F>`, 
                inline: true 
            });
        }

        // Back button
        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`coll_back_${user.raUsername}_${returnFilter}_${returnPage}`)
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({ embeds: [embed], components: [backButton] });
    },

    // Helper function to check if a string is a unicode emoji
    isUnicodeEmoji(str) {
        if (!str || str.length === 0) return false;
        if (str.startsWith(':') || str.startsWith('<:')) return false;
        const emojiRegex = /^[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
        return emojiRegex.test(str);
    },

    // FIXED: Handle all interactions - Main entry point from index.js
    async handleInteraction(interaction) {
        console.log('Collection handleInteraction called with customId:', interaction.customId);
        
        if (!interaction.customId.startsWith('coll_')) {
            console.log('Not a collection interaction, ignoring');
            return;
        }

        // Defer the update to prevent timeout
        try {
            await interaction.deferUpdate();
        } catch (error) {
            console.error('Error deferring update:', error);
            return;
        }

        try {
            const parts = interaction.customId.split('_');
            if (parts.length < 3) {
                console.error('Invalid customId format:', interaction.customId);
                return;
            }

            const action = parts[1];
            const username = parts[2];

            console.log(`Processing action: ${action}, username: ${username}`);

            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user || user.discordId !== interaction.user.id) {
                return interaction.followUp({ 
                    content: '❌ You can only view your own collection.', 
                    ephemeral: true 
                });
            }

            switch (action) {
                case 'series':
                    if (interaction.isStringSelectMenu()) {
                        const selectedSeries = interaction.values[0];
                        console.log(`Series selected: ${selectedSeries}`);
                        await this.showItemsPage(interaction, user, selectedSeries, 0);
                    }
                    break;

                case 'prev':
                    if (parts.length >= 4) {
                        const prevFilter = parts[3];
                        const currentPage = parseInt(interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/)?.[1] || '1') - 1;
                        console.log(`Previous page: filter=${prevFilter}, currentPage=${currentPage}`);
                        await this.showItemsPage(interaction, user, prevFilter, Math.max(0, currentPage - 1));
                    }
                    break;

                case 'next':
                    if (parts.length >= 4) {
                        const nextFilter = parts[3];
                        const nextCurrentPage = parseInt(interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/)?.[1] || '1') - 1;
                        console.log(`Next page: filter=${nextFilter}, currentPage=${nextCurrentPage}`);
                        await this.showItemsPage(interaction, user, nextFilter, nextCurrentPage + 1);
                    }
                    break;

                case 'inspect':
                    if (interaction.isStringSelectMenu()) {
                        const itemId = interaction.values[0];
                        const returnFilter = parts[3] || 'all';
                        const returnPage = parseInt(parts[4]) || 0;
                        console.log(`Inspecting item: ${itemId}, returnFilter=${returnFilter}, returnPage=${returnPage}`);
                        await this.showItemDetail(interaction, user, itemId, returnFilter, returnPage);
                    } else {
                        // Show inspect menu
                        const filter = parts[3] || 'all';
                        const page = parseInt(parts[4]) || 0;
                        console.log(`Showing inspect menu: filter=${filter}, page=${page}`);
                        await this.showInspectMenu(interaction, user, filter, page);
                    }
                    break;

                case 'back':
                    if (parts.length >= 5) {
                        const backFilter = parts[3];
                        const backPage = parseInt(parts[4]);
                        console.log(`Going back: filter=${backFilter}, page=${backPage}`);
                        await this.showItemsPage(interaction, user, backFilter, backPage);
                    }
                    break;

                default:
                    console.log(`Unknown action: ${action}`);
                    await interaction.followUp({
                        content: '❌ Unknown action.',
                        ephemeral: true
                    });
            }

        } catch (error) {
            console.error('Error handling collection interaction:', error);
            console.error('Error details:', {
                customId: interaction.customId,
                type: interaction.type,
                isButton: interaction.isButton(),
                isSelectMenu: interaction.isStringSelectMenu()
            });
            
            try {
                await interaction.followUp({ 
                    content: '❌ An error occurred while processing your request.', 
                    ephemeral: true 
                });
            } catch (followUpError) {
                console.error('Error sending error follow-up:', followUpError);
            }
        }
    },

    // Show inspect menu for current page items
    async showInspectMenu(interaction, user, filter, page) {
        const ITEMS_PER_PAGE = 25;
        
        // Get filtered items
        let filteredItems = [];
        if (filter === 'all') {
            filteredItems = user.gachaCollection;
        } else {
            filteredItems = user.gachaCollection.filter(item => item.seriesId === filter);
        }

        // Sort and paginate
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        filteredItems.sort((a, b) => {
            const aRarityIndex = rarityOrder.indexOf(a.rarity);
            const bRarityIndex = rarityOrder.indexOf(b.rarity);
            if (aRarityIndex !== bRarityIndex) return aRarityIndex - bRarityIndex;
            return a.itemName.localeCompare(b.itemName);
        });

        const startIndex = page * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredItems.length);
        const pageItems = filteredItems.slice(startIndex, endIndex);

        if (pageItems.length === 0) {
            return interaction.followUp({ 
                content: '❌ No items on this page to inspect.', 
                ephemeral: true 
            });
        }

        // Create inspect options
        const itemOptions = pageItems.map(item => {
            const quantity = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
            const seriesTag = item.seriesId ? ` [${item.seriesId}]` : '';
            
            let emojiOption = undefined;
            if (item.emojiId && item.emojiName) {
                emojiOption = { id: item.emojiId, name: item.emojiName };
            } else if (item.emojiName && this.isUnicodeEmoji(item.emojiName)) {
                emojiOption = item.emojiName;
            }
            
            const option = {
                label: item.itemName.slice(0, 100),
                value: item.itemId,
                description: `${gachaService.getRarityDisplayName(item.rarity)}${quantity}${seriesTag}`.slice(0, 100)
            };
            
            if (emojiOption) option.emoji = emojiOption;
            return option;
        });

        const inspectMenu = new StringSelectMenuBuilder()
            .setCustomId(`coll_inspect_${user.raUsername}_${filter}_${page}`)
            .setPlaceholder('Choose an item to inspect...')
            .addOptions(itemOptions);

        const backButton = new ButtonBuilder()
            .setCustomId(`coll_back_${user.raUsername}_${filter}_${page}`)
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary);

        const components = [
            new ActionRowBuilder().addComponents(inspectMenu),
            new ActionRowBuilder().addComponents(backButton)
        ];

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Inspect Item - Page ${page + 1}`)
            .setDescription('Choose an item from this page to view its details.')
            .setColor(COLORS.INFO);

        await interaction.editReply({ embeds: [embed], components: components });
    }
};
