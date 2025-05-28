// src/commands/user/collection.js
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { User } from '../../models/User.js';
import gachaService from '../../services/gachaService.js';
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View your gacha collection')
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Filter by rarity, type, or series')
                .setRequired(false)
                .addChoices(
                    { name: 'Common', value: 'common' },
                    { name: 'Uncommon', value: 'uncommon' },
                    { name: 'Rare', value: 'rare' },
                    { name: 'Epic', value: 'epic' },
                    { name: 'Legendary', value: 'legendary' },
                    { name: 'Trinkets', value: 'trinket' },
                    { name: 'Collectibles', value: 'collectible' },
                    { name: 'Series Items', value: 'series' },
                    { name: 'Trophies', value: 'trophy' },
                    { name: 'Special Items', value: 'special' }
                ))
        .addStringOption(option =>
            option.setName('series')
                .setDescription('Filter by specific series (e.g., triforce, mario)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('sort')
                .setDescription('Sort order')
                .setRequired(false)
                .addChoices(
                    { name: 'Recently Obtained', value: 'recent' },
                    { name: 'Alphabetical', value: 'name' },
                    { name: 'Rarity', value: 'rarity' },
                    { name: 'Quantity', value: 'quantity' }
                )),

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

            const filter = interaction.options.getString('filter');
            const series = interaction.options.getString('series');
            const sort = interaction.options.getString('sort') || 'recent';

            const { items, summary } = this.processCollection(user.gachaCollection, filter, series, sort);
            const embed = this.createCollectionEmbed(user, items, summary, filter, series, sort);
            
            // Add pagination if there are many items
            if (items.length > 15) {
                const buttons = this.createPaginationButtons(0, items.length);
                await interaction.editReply({ 
                    embeds: [embed],
                    components: [buttons]
                });
                
                // Set up pagination handling
                this.setupPagination(interaction, user, items, summary, filter, series, sort);
            } else {
                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error displaying collection:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching your collection.'
            });
        }
    },

    processCollection(collection, filter, series, sort) {
        let filteredItems = [...collection];

        // Apply filters
        if (filter) {
            filteredItems = filteredItems.filter(item => {
                return item.rarity === filter || item.itemType === filter;
            });
        }

        if (series) {
            filteredItems = filteredItems.filter(item => item.seriesId === series);
        }

        // Apply sorting
        switch (sort) {
            case 'name':
                filteredItems.sort((a, b) => a.itemName.localeCompare(b.itemName));
                break;
            case 'rarity':
                const rarityOrder = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
                filteredItems.sort((a, b) => {
                    const aIndex = rarityOrder.indexOf(a.rarity);
                    const bIndex = rarityOrder.indexOf(b.rarity);
                    return aIndex - bIndex;
                });
                break;
            case 'quantity':
                filteredItems.sort((a, b) => (b.quantity || 1) - (a.quantity || 1));
                break;
            case 'recent':
            default:
                filteredItems.sort((a, b) => new Date(b.obtainedAt) - new Date(a.obtainedAt));
                break;
        }

        // Create summary
        const summary = {
            total: collection.length,
            filtered: filteredItems.length,
            totalQuantity: collection.reduce((sum, item) => sum + (item.quantity || 1), 0),
            rarityBreakdown: this.getRarityBreakdown(filteredItems),
            seriesBreakdown: this.getSeriesBreakdown(filteredItems)
        };

        return { items: filteredItems, summary };
    },

    getRarityBreakdown(items) {
        const breakdown = {
            legendary: 0,
            epic: 0,
            rare: 0,
            uncommon: 0,
            common: 0
        };

        items.forEach(item => {
            if (breakdown[item.rarity] !== undefined) {
                breakdown[item.rarity] += (item.quantity || 1);
            }
        });

        return breakdown;
    },

    getSeriesBreakdown(items) {
        const breakdown = {};
        
        items.forEach(item => {
            if (item.seriesId) {
                if (!breakdown[item.seriesId]) {
                    breakdown[item.seriesId] = 0;
                }
                breakdown[item.seriesId] += (item.quantity || 1);
            }
        });

        return breakdown;
    },

    createCollectionEmbed(user, items, summary, filter, series, sort, page = 0) {
        const itemsPerPage = 15;
        const startIndex = page * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, items.length);
        const pageItems = items.slice(startIndex, endIndex);
        
        const embed = new EmbedBuilder()
            .setTitle(`📦 ${user.raUsername}'s Collection`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        // Create description with filters and summary
        let description = `**Total Items:** ${summary.totalQuantity} (${summary.total} unique)\n`;
        
        if (filter || series) {
            description += `**Filtered:** ${summary.filtered} items\n`;
        }

        description += `**Sort:** ${sort}\n\n`;

        // Add rarity breakdown
        description += '**By Rarity:**\n';
        Object.entries(summary.rarityBreakdown).forEach(([rarity, count]) => {
            if (count > 0) {
                const emoji = gachaService.getRarityEmoji(rarity);
                description += `${emoji} ${rarity}: ${count}\n`;
            }
        });

        // Add series breakdown if there are series items
        if (Object.keys(summary.seriesBreakdown).length > 0) {
            description += '\n**By Series:**\n';
            Object.entries(summary.seriesBreakdown).forEach(([seriesId, count]) => {
                description += `📚 ${seriesId}: ${count}\n`;
            });
        }

        embed.setDescription(description);

        // Add items field
        if (pageItems.length > 0) {
            let itemsText = '';
            
            pageItems.forEach(item => {
                const emoji = gachaService.formatEmoji(item.emojiId, item.emojiName);
                const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
                const quantity = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
                const seriesTag = item.seriesId ? ` [${item.seriesId}]` : '';
                const obtainedDate = new Date(item.obtainedAt).toLocaleDateString();
                
                itemsText += `${rarityEmoji} ${emoji} **${item.itemName}**${quantity}${seriesTag}\n`;
                itemsText += `*Obtained: ${obtainedDate}*\n\n`;
            });

            const totalPages = Math.ceil(items.length / itemsPerPage);
            const fieldName = totalPages > 1 ? 
                `Items (Page ${page + 1} of ${totalPages})` : 
                `Items (${pageItems.length})`;

            embed.addFields({ 
                name: fieldName, 
                value: itemsText || 'No items found'
            });
        } else {
            embed.addFields({ 
                name: 'Items', 
                value: 'No items match your filters'
            });
        }

        // Add footer with help text
        embed.setFooter({ 
            text: 'Use filters to narrow down your collection • Visit the gacha machine to collect more!' 
        });

        return embed;
    },

    createPaginationButtons(currentPage, totalItems) {
        const itemsPerPage = 15;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('collection_first')
                    .setLabel('<<')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 0),
                
                new ButtonBuilder()
                    .setCustomId('collection_prev')
                    .setLabel('<')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === 0),
                
                new ButtonBuilder()
                    .setCustomId('collection_info')
                    .setLabel(`${currentPage + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                
                new ButtonBuilder()
                    .setCustomId('collection_next')
                    .setLabel('>')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage >= totalPages - 1),
                
                new ButtonBuilder()
                    .setCustomId('collection_last')
                    .setLabel('>>')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage >= totalPages - 1)
            );
    },

    setupPagination(originalInteraction, user, items, summary, filter, series, sort) {
        const collector = originalInteraction.channel.createMessageComponentCollector({
            filter: i => i.user.id === originalInteraction.user.id && i.customId.startsWith('collection_'),
            time: 300000 // 5 minutes
        });

        let currentPage = 0;
        const itemsPerPage = 15;
        const totalPages = Math.ceil(items.length / itemsPerPage);

        collector.on('collect', async (buttonInteraction) => {
            await buttonInteraction.deferUpdate();

            switch (buttonInteraction.customId) {
                case 'collection_first':
                    currentPage = 0;
                    break;
                case 'collection_prev':
                    currentPage = Math.max(0, currentPage - 1);
                    break;
                case 'collection_next':
                    currentPage = Math.min(totalPages - 1, currentPage + 1);
                    break;
                case 'collection_last':
                    currentPage = totalPages - 1;
                    break;
            }

            const embed = this.createCollectionEmbed(user, items, summary, filter, series, sort, currentPage);
            const buttons = this.createPaginationButtons(currentPage, items.length);

            await buttonInteraction.editReply({
                embeds: [embed],
                components: [buttons]
            });
        });

        collector.on('end', async () => {
            try {
                await originalInteraction.editReply({
                    components: [] // Remove buttons when collector expires
                });
            } catch (error) {
                // Interaction might be deleted
            }
        });
    }
};
