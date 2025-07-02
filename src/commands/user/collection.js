// src/commands/user/collection.js - OPTIMIZED for performance
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
import { GachaItem } from '../../models/GachaItem.js';
import gachaService from '../../services/gachaService.js';
import combinationService from '../../services/combinationService.js';
import { formatGachaEmoji } from '../../config/gachaEmojis.js';
import { COLORS } from '../../utils/FeedUtils.js';

const GACHA_TRADE_CHANNEL_ID = '1379402075120730185';
const ITEMS_PER_PAGE = 25;

// PERFORMANCE: Cache frequently used data
const collectionCache = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];

// PERFORMANCE: Pre-computed rarity data
const rarityData = {
    mythic: { emoji: null, name: 'Mythic', color: null },
    legendary: { emoji: null, name: 'Legendary', color: null },
    epic: { emoji: null, name: 'Epic', color: null },
    rare: { emoji: null, name: 'Rare', color: null },
    uncommon: { emoji: null, name: 'Uncommon', color: null },
    common: { emoji: null, name: 'Common', color: null }
};

// Initialize rarity data on startup
function initializeRarityData() {
    for (const rarity of rarityOrder) {
        rarityData[rarity].emoji = gachaService.getRarityEmoji(rarity);
        rarityData[rarity].name = gachaService.getRarityDisplayName(rarity);
        rarityData[rarity].color = gachaService.getRarityColor(rarity);
    }
}

// PERFORMANCE: Optimized user lookup with caching and projection
async function getCachedUserCollection(discordId) {
    const cacheKey = `user_${discordId}`;
    const cached = collectionCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    
    // Only fetch necessary fields
    const user = await User.findOne(
        { discordId },
        { 
            raUsername: 1, 
            gachaCollection: 1, 
            discordId: 1,
            gpBalance: 1,
            _id: 1
        }
    ).lean(); // Use lean() for better performance
    
    if (user) {
        collectionCache.set(cacheKey, { data: user, timestamp: Date.now() });
    }
    
    return user;
}

// PERFORMANCE: Clear cache when user data changes
function invalidateUserCache(discordId) {
    collectionCache.delete(`user_${discordId}`);
}

// PERFORMANCE: Optimized collection processing
function processCollection(items, filter = 'all') {
    if (!items || items.length === 0) return [];
    
    // Filter items
    const filteredItems = filter === 'all' 
        ? items 
        : items.filter(item => item.seriesId === filter);
    
    // PERFORMANCE: Use a single sort with multiple criteria
    return filteredItems.sort((a, b) => {
        // Primary: Rarity
        const aRarityIndex = rarityOrder.indexOf(a.rarity);
        const bRarityIndex = rarityOrder.indexOf(b.rarity);
        if (aRarityIndex !== bRarityIndex) return aRarityIndex - bRarityIndex;
        
        // Secondary: Series
        const aSeriesId = a.seriesId || 'zzz_individual';
        const bSeriesId = b.seriesId || 'zzz_individual';
        if (aSeriesId !== bSeriesId) return aSeriesId.localeCompare(bSeriesId);
        
        // Tertiary: Name
        return a.itemName.localeCompare(b.itemName);
    });
}

// PERFORMANCE: Pre-build emoji grids to avoid repeated string operations
function buildEmojiGrid(items) {
    const rarityGroups = {};
    
    // Group items by rarity
    items.forEach(item => {
        if (!rarityGroups[item.rarity]) rarityGroups[item.rarity] = [];
        rarityGroups[item.rarity].push(item);
    });
    
    let description = '';
    
    for (const rarity of rarityOrder) {
        const rarityItems = rarityGroups[rarity];
        if (!rarityItems?.length) continue;
        
        const { emoji: rarityEmoji, name: rarityName } = rarityData[rarity];
        description += `\n${rarityEmoji} **${rarityName}** (${rarityItems.length})\n`;
        
        // Build emoji grid efficiently
        const emojiRows = [];
        let currentRow = '';
        
        rarityItems.forEach((item, i) => {
            const emoji = formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
            const quantity = item.quantity > 1 ? `x${item.quantity}` : '';
            currentRow += `${emoji}${quantity} `;
            
            if ((i + 1) % 5 === 0 || i === rarityItems.length - 1) {
                emojiRows.push(currentRow.trim());
                currentRow = '';
            }
        });
        
        description += emojiRows.join('\n') + '\n';
    }
    
    return description.trim();
}

// PERFORMANCE: Optimized series options generation
function getSeriesOptions(user) {
    if (!user.gachaCollection || user.gachaCollection.length === 0) {
        return [{ label: 'All Items', value: 'all', description: 'No items', emoji: '📦' }];
    }
    
    // Use Map for better performance with large collections
    const seriesMap = new Map();
    let totalItems = 0;
    
    user.gachaCollection.forEach(item => {
        totalItems++;
        const seriesId = item.seriesId || 'individual';
        
        if (!seriesMap.has(seriesId)) {
            seriesMap.set(seriesId, { count: 0, totalQuantity: 0 });
        }
        
        const series = seriesMap.get(seriesId);
        series.count++;
        series.totalQuantity += item.quantity || 1;
    });
    
    const options = [{
        label: 'All Items',
        value: 'all',
        description: `View all ${totalItems} items`,
        emoji: '📦'
    }];
    
    // Convert map to sorted array
    const sortedSeries = Array.from(seriesMap.entries())
        .sort(([,a], [,b]) => b.totalQuantity - a.totalQuantity)
        .slice(0, 24); // Discord limit
    
    sortedSeries.forEach(([seriesId, data]) => {
        const label = seriesId === 'individual' ? 'Individual Items' : 
                     seriesId.charAt(0).toUpperCase() + seriesId.slice(1);
        const isIndividual = seriesId === 'individual';
        
        options.push({
            label,
            value: seriesId,
            description: `${data.count} ${isIndividual ? 'standalone' : 'types'} ${!isIndividual ? `(${data.totalQuantity} total)` : 'items'}`,
            emoji: isIndividual ? '🔸' : '🏷️'
        });
    });
    
    return options;
}

export default {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View your gacha collection'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // PERFORMANCE: Use optimized user lookup
        const user = await getCachedUserCollection(interaction.user.id);
        if (!user) {
            return interaction.editReply({
                content: '❌ You are not registered. Please ask an admin to register you first.'
            });
        }

        if (!user.gachaCollection || user.gachaCollection.length === 0) {
            return interaction.editReply({
                content: '📦 Your collection is empty! Visit the gacha channel to start collecting items.\n\n💡 **Tip:** When you get the right ingredients, combinations will be available in /collection!'
            });
        }

        // PERFORMANCE: Check combinations asynchronously
        const combinationsPromise = combinationService.checkPossibleCombinations(user);
        
        // Don't wait for combinations if we're just showing the collection
        combinationsPromise.then(possibleCombinations => {
            if (possibleCombinations.length > 0) {
                // Only interrupt if there are combinations available
                return combinationService.showCombinationAlert(interaction, user, possibleCombinations);
            }
        }).catch(error => {
            console.error('Error checking combinations:', error);
        });

        await this.showCollection(interaction, user, 'all', 0);
    },

    async showCollection(interaction, user, filter = 'all', page = 0) {
        // PERFORMANCE: Process collection efficiently
        const processedItems = processCollection(user.gachaCollection, filter);
        
        // Pagination
        const totalPages = Math.ceil(processedItems.length / ITEMS_PER_PAGE);
        const startIndex = page * ITEMS_PER_PAGE;
        const pageItems = processedItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        // PERFORMANCE: Build embed efficiently
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Collection - ${filter === 'all' ? 'All Items' : filter}`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        if (pageItems.length === 0) {
            embed.setDescription('No items to display.');
        } else {
            embed.setDescription(buildEmojiGrid(pageItems));
        }

        // PERFORMANCE: Parallel operations for footer
        const [combinationStats, possibleCombinations] = await Promise.all([
            combinationService.getCombinationStats(user),
            combinationService.checkPossibleCombinations(user)
        ]);
        
        let footerText = totalPages > 1 
            ? `Page ${page + 1}/${totalPages} • ${startIndex + 1}-${Math.min(startIndex + ITEMS_PER_PAGE, processedItems.length)} of ${processedItems.length} items`
            : `${processedItems.length} items • xN = quantity`;
        
        // Add GP balance to footer
        footerText += ` • ${(user.gpBalance || 0).toLocaleString()} GP`;
        footerText += ` • ${combinationStats.totalCombined} from combinations`;
        if (possibleCombinations.length > 0) {
            footerText += ` • ⚗️ ${possibleCombinations.length} combination(s) available!`;
        }
        embed.setFooter({ text: footerText });

        // PERFORMANCE: Build components efficiently
        const components = this.buildComponents(user, filter, page, totalPages, possibleCombinations);

        await interaction.editReply({ embeds: [embed], components });
    },

    // PERFORMANCE: Optimized component building
    buildComponents(user, filter, page, totalPages, possibleCombinations) {
        const components = [];

        // Series dropdown - only build if needed
        const seriesOptions = getSeriesOptions(user);
        if (seriesOptions.length > 1) {
            const seriesMenu = new StringSelectMenuBuilder()
                .setCustomId(`coll_series_${user.raUsername}`)
                .setPlaceholder('Choose a series to view...')
                .addOptions(seriesOptions);
            components.push(new ActionRowBuilder().addComponents(seriesMenu));
        }

        // Pagination - only build if needed
        if (totalPages > 1) {
            const paginationRow = new ActionRowBuilder().addComponents(
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
            components.push(paginationRow);
        }

        // Action dropdown
        const actionOptions = [
            { label: '🔍 Inspect Items', value: 'inspect', description: 'View detailed item information', emoji: '🔍' },
            { label: '🎁 Give Item', value: 'give', description: 'Transfer item to another player', emoji: '🎁' },
            { label: '📊 Collection Stats', value: 'stats', description: 'View collection statistics', emoji: '📊' },
            { label: '📖 Recipe Book', value: 'recipes', description: 'View community recipe book of combinations', emoji: '📖' }
        ];

        if (possibleCombinations.length > 0) {
            actionOptions.unshift({
                label: `⚗️ Combinations (${possibleCombinations.length})`,
                value: 'combinations',
                description: 'View and perform available combinations',
                emoji: '⚗️'
            });
        }

        const actionMenu = new StringSelectMenuBuilder()
            .setCustomId(`coll_actions_${user.raUsername}_${filter}_${page}`)
            .setPlaceholder('Choose an action...')
            .addOptions(actionOptions);
        components.push(new ActionRowBuilder().addComponents(actionMenu));

        return components;
    },

    // PERFORMANCE: Optimized inspect menu
    async showInspectMenu(interaction, user, filter, page) {
        const processedItems = processCollection(user.gachaCollection, filter);
        const totalPages = Math.ceil(processedItems.length / ITEMS_PER_PAGE);
        const pageItems = processedItems.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
        
        if (pageItems.length === 0) {
            return interaction.followUp({ content: '❌ No items on this page to inspect.', ephemeral: true });
        }

        // PERFORMANCE: Build options efficiently
        const itemOptions = pageItems.map(item => {
            const quantity = item.quantity > 1 ? ` x${item.quantity}` : '';
            const seriesTag = item.seriesId ? ` [${item.seriesId}]` : '';
            const sourceTag = item.source === 'combined' ? ' ⚗️' : item.source === 'player_transfer' ? ' 🎁' : '';
            const animatedTag = item.isAnimated ? ' 🎬' : '';
            
            const option = {
                label: item.itemName.slice(0, 100),
                value: item.itemId,
                description: `${rarityData[item.rarity].name}${quantity}${seriesTag}${sourceTag}${animatedTag}`.slice(0, 100)
            };
            
            if (item.emojiId && item.emojiName) {
                option.emoji = { id: item.emojiId, name: item.emojiName, animated: item.isAnimated };
            }
            
            return option;
        });

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Inspect Item - Page ${page + 1}/${totalPages}`)
            .setDescription('Choose an item to view its details.\n\n**Legend:** ⚗️ = Combined, 🎁 = Player Gift, 🎬 = Animated')
            .setColor(COLORS.INFO);

        const components = [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`coll_inspect_item_${user.raUsername}_${filter}_${page}`)
                    .setPlaceholder('Choose an item to inspect...')
                    .addOptions(itemOptions)
            )
        ];

        if (totalPages > 1) {
            const paginationRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`coll_inspect_prev_${user.raUsername}_${filter}_${page}`)
                    .setLabel('◀ Previous Page')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId(`coll_inspect_next_${user.raUsername}_${filter}_${page}`)
                    .setLabel('Next Page ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages - 1)
            );
            components.push(paginationRow);
        }

        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`coll_back_${user.raUsername}_${filter}_${page}`)
                .setLabel('← Back')
                .setStyle(ButtonStyle.Secondary)
        ));

        await interaction.editReply({ embeds: [embed], components });
    },

    async showGiveMenu(interaction, user, filter, page) {
        // Similar optimization as showInspectMenu
        const processedItems = processCollection(user.gachaCollection, filter);
        const totalPages = Math.ceil(processedItems.length / ITEMS_PER_PAGE);
        const pageItems = processedItems.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
        
        if (pageItems.length === 0) {
            return interaction.followUp({ content: '❌ No items on this page to give.', ephemeral: true });
        }

        const itemOptions = pageItems.map(item => {
            const quantity = item.quantity > 1 ? ` x${item.quantity}` : '';
            const seriesTag = item.seriesId ? ` [${item.seriesId}]` : '';
            const sourceTag = item.source === 'combined' ? ' ⚗️' : item.source === 'player_transfer' ? ' 🎁' : '';
            const animatedTag = item.isAnimated ? ' 🎬' : '';
            
            const option = {
                label: item.itemName.slice(0, 100),
                value: item.itemId,
                description: `${rarityData[item.rarity].name}${quantity}${seriesTag}${sourceTag}${animatedTag}`.slice(0, 100)
            };
            
            if (item.emojiId && item.emojiName) {
                option.emoji = { id: item.emojiId, name: item.emojiName, animated: item.isAnimated };
            }
            
            return option;
        });

        const embed = new EmbedBuilder()
            .setTitle(`🎁 Give Item - Page ${page + 1}/${totalPages}`)
            .setDescription('Choose an item to give to another player.\n\n**Legend:** ⚗️ = Combined, 🎁 = Player Gift, 🎬 = Animated\n\n⚠️ **Remember:** This transfer is final and cannot be undone!')
            .setColor(COLORS.WARNING);

        const components = [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`coll_give_item_${user.raUsername}_${filter}_${page}`)
                    .setPlaceholder('Choose an item to give...')
                    .addOptions(itemOptions)
            )
        ];

        if (totalPages > 1) {
            const paginationRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`coll_give_prev_${user.raUsername}_${filter}_${page}`)
                    .setLabel('◀ Previous Page')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId(`coll_give_next_${user.raUsername}_${filter}_${page}`)
                    .setLabel('Next Page ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages - 1)
            );
            components.push(paginationRow);
        }

        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`coll_back_${user.raUsername}_${filter}_${page}`)
                .setLabel('← Back')
                .setStyle(ButtonStyle.Secondary)
        ));

        await interaction.editReply({ embeds: [embed], components });
    },

    async showGiveDetailsModal(interaction, user, itemId, filter, page) {
        const item = user.gachaCollection.find(item => item.itemId === itemId);
        if (!item) {
            return interaction.reply({ content: '❌ Item not found in your collection.', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`coll_give_details_${user.raUsername}_${itemId}_${filter}_${page}`)
            .setTitle(`Give ${item.itemName}`);

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('recipient_username')
                    .setLabel('Recipient Username')
                    .setPlaceholder('Enter the username of who you want to give the item to')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('quantity')
                    .setLabel(`Quantity (1-${item.quantity})`)
                    .setPlaceholder('How many to give (default: 1)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setValue('1')
            )
        );

        await interaction.showModal(modal);
    },

    // PERFORMANCE: Optimized item detail view
    async showItemDetail(interaction, user, itemId, returnFilter, returnPage) {
        const item = user.gachaCollection.find(item => item.itemId === itemId);
        if (!item) {
            return interaction.editReply({ content: '❌ Item not found in your collection.' });
        }

        // PERFORMANCE: Only fetch original item if needed
        let originalItem = null;
        const needsOriginalData = !item.description || !item.flavorText;
        
        if (needsOriginalData) {
            originalItem = await GachaItem.findOne({ itemId }, { description: 1, flavorText: 1 }).lean();
        }

        const embed = new EmbedBuilder()
            .setTitle(`Item Details - ${item.itemName}`)
            .setColor(rarityData[item.rarity].color)
            .setTimestamp();

        const emoji = formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
        const { emoji: rarityEmoji, name: rarityName } = rarityData[item.rarity];
        
        let description = `${emoji} **${item.itemName}**\n\n${rarityEmoji} **${rarityName}**`;
        if (item.quantity > 1) description += `\n**Quantity:** ${item.quantity}`;
        if (item.seriesId) description += `\n**Series:** ${item.seriesId.charAt(0).toUpperCase() + item.seriesId.slice(1)}`;
        if (item.isAnimated) description += `\n**Emoji Type:** 🎬 Animated`;
        
        const sourceNames = { 
            gacha: 'Gacha Pull', 
            combined: 'Combination', 
            series_completion: 'Series Completion', 
            admin_grant: 'Admin Grant', 
            player_transfer: 'Player Gift' 
        };
        description += `\n**Source:** ${sourceNames[item.source] || 'Unknown'}`;
        description += `\n**Item ID:** \`${itemId}\``;
        embed.setDescription(description);

        const itemDescription = item.description || originalItem?.description;
        if (itemDescription) {
            embed.addFields({ name: 'Description', value: `*${itemDescription}*`, inline: false });
        }

        const flavorText = item.flavorText || originalItem?.flavorText;
        if (flavorText) {
            embed.addFields({ name: 'Flavor Text', value: `*"${flavorText}"*`, inline: false });
        }

        if (item.obtainedAt) {
            embed.addFields({ name: 'Obtained', value: `<t:${Math.floor(new Date(item.obtainedAt).getTime() / 1000)}:F>`, inline: true });
        }

        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`coll_back_${user.raUsername}_${returnFilter}_${returnPage}`)
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`coll_share_${user.raUsername}_${itemId}`)
                    .setLabel('📢 Share in Trade Channel')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📢')
            )
        ];

        await interaction.editReply({ embeds: [embed], components });
    },

    async shareItem(interaction, user, itemId) {
        const item = user.gachaCollection.find(item => item.itemId === itemId);
        if (!item) {
            return interaction.followUp({ content: '❌ Item not found in your collection.', ephemeral: true });
        }

        // PERFORMANCE: Only fetch if needed
        let originalItem = null;
        if (!item.description || !item.flavorText) {
            originalItem = await GachaItem.findOne({ itemId }, { description: 1, flavorText: 1 }).lean();
        }

        const emoji = formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
        const { emoji: rarityEmoji, name: rarityName, color } = rarityData[item.rarity];

        const embed = new EmbedBuilder()
            .setTitle(`${emoji} ${item.itemName}`)
            .setColor(color)
            .setAuthor({ name: `${user.raUsername}'s Collection`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        let description = `${rarityEmoji} **${rarityName}**`;
        if (item.quantity > 1) description += `\n**Quantity:** ${item.quantity}`;
        if (item.seriesId) description += `\n**Series:** ${item.seriesId.charAt(0).toUpperCase() + item.seriesId.slice(1)}`;
        if (item.isAnimated) description += `\n**Type:** 🎬 Animated Emoji`;
        
        const sourceNames = { gacha: 'Gacha Pull', combined: 'Combination', series_completion: 'Series Completion', admin_grant: 'Admin Grant', player_transfer: 'Player Gift' };
        description += `\n**Source:** ${sourceNames[item.source] || 'Unknown'}`;
        embed.setDescription(description);

        const itemDescription = item.description || originalItem?.description;
        if (itemDescription) embed.addFields({ name: 'Description', value: `*${itemDescription}*`, inline: false });

        const flavorText = item.flavorText || originalItem?.flavorText;
        if (flavorText) embed.addFields({ name: 'Flavor Text', value: `*"${flavorText}"*`, inline: false });

        embed.setFooter({ text: 'Shared from /collection • Use /collection to view your own items!' });

        try {
            const tradeChannel = await interaction.client.channels.fetch(GACHA_TRADE_CHANNEL_ID);
            await tradeChannel.send({ 
                content: `**${user.raUsername}** is showing off their item!`,
                embeds: [embed] 
            });
            await interaction.followUp({ content: `✅ Successfully shared **${item.itemName}** to <#${GACHA_TRADE_CHANNEL_ID}>!`, ephemeral: true });
        } catch (error) {
            console.error('❌ Error sharing item to trade channel:', error);
            await interaction.followUp({ content: '❌ Failed to share item. Please try again later.', ephemeral: true });
        }
    },

    // PERFORMANCE: Optimized trade confirmation
    async sendPublicTradeConfirmation(givingUser, receivingUser, gachaItem, quantity, combinationResult, client) {
        try {
            const emoji = formatGachaEmoji(gachaItem.emojiId, gachaItem.emojiName, gachaItem.isAnimated);
            const { emoji: rarityEmoji, name: rarityName } = rarityData[gachaItem.rarity];
            
            const embed = new EmbedBuilder()
                .setTitle('ITEM TRADE COMPLETED!')
                .setColor(COLORS.SUCCESS)
                .setDescription(
                    `**TRADE SUMMARY:**\n\n` +
                    `${emoji} **${quantity}x ${gachaItem.itemName}** ${rarityEmoji}\n` +
                    `**Rarity:** ${rarityName}${gachaItem.isAnimated ? ' 🎬' : ''}\n\n` +
                    `**👤 From:** [${givingUser.raUsername}](https://retroachievements.org/user/${givingUser.raUsername})\n` +
                    `**👤 To:** [${receivingUser.raUsername}](https://retroachievements.org/user/${receivingUser.raUsername})\n\n` +
                    `**The item has been successfully transferred!**`
                )
                .setTimestamp();

            if (gachaItem.description) {
                embed.addFields({
                    name: 'Item Description',
                    value: `*${gachaItem.description}*`,
                    inline: false
                });
            }

            if (combinationResult.hasCombinations) {
                embed.addFields({
                    name: '⚗️ BONUS: Combinations Available!',
                    value: `🎉 ${receivingUser.raUsername} now has **${combinationResult.combinationCount}** combination option(s) available!\n💡 Use \`/collection\` to view and perform combinations!`,
                    inline: false
                });
            }

            embed.setFooter({ 
                text: `Trade ID: ${Date.now()} • This message expires in 5 minutes • Both parties can reference this confirmation` 
            });

            const channel = await client.channels.fetch(GACHA_TRADE_CHANNEL_ID);
            if (channel) {
                const message = await channel.send({ 
                    content: `**TRADE ALERT**\n<@${givingUser.discordId}> ➡️ <@${receivingUser.discordId}>`, 
                    embeds: [embed] 
                });
                
                console.log(`📢 Public trade confirmation sent to ${channel.name} for trade: ${givingUser.raUsername} -> ${receivingUser.raUsername} (${quantity}x ${gachaItem.itemName})`);
                
                setTimeout(async () => {
                    try {
                        await message.delete();
                        console.log(`🗑️ Auto-deleted trade confirmation for ${givingUser.raUsername} -> ${receivingUser.raUsername}`);
                    } catch (deleteError) {
                        console.log('Trade confirmation message already deleted or inaccessible');
                    }
                }, 5 * 60 * 1000);
                
                return true;
            } else {
                console.error(`❌ Could not find gacha trade channel: ${GACHA_TRADE_CHANNEL_ID}`);
                return false;
            }
        } catch (error) {
            console.error('❌ Error sending public trade confirmation:', error);
            return false;
        }
    },

    // PERFORMANCE: Optimized stats display
    async showStats(interaction, user) {
        const [summary, combinationStats, possibleCombinations] = await Promise.all([
            gachaService.getUserCollectionSummary(user),
            combinationService.getCombinationStats(user),
            combinationService.checkPossibleCombinations(user)
        ]);
        
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Collection Statistics`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        let description = `📦 **Total Items:** ${summary.totalItems}\n🎯 **Unique Items:** ${summary.uniqueItems}\n💰 **GP Balance:** ${(user.gpBalance || 0).toLocaleString()} GP\n\n**Rarity Breakdown:**\n`;
        
        const rarityCount = summary.rarityCount || {};
        rarityOrder.forEach(rarity => {
            const count = rarityCount[rarity] || 0;
            if (count > 0) {
                const { emoji: rarityEmoji, name: rarityName } = rarityData[rarity];
                description += `${rarityEmoji} ${rarityName}: ${count}\n`;
            }
        });

        if (Object.keys(summary.seriesBreakdown || {}).length > 0) {
            description += `\n**Series Breakdown:**\n`;
            Object.entries(summary.seriesBreakdown)
                .sort(([,a], [,b]) => b.length - a.length)
                .slice(0, 5)
                .forEach(([seriesName, items]) => {
                    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
                    description += `🏷️ ${seriesName}: ${items.length} types (${totalQuantity} total)\n`;
                });
        }

        const sourceBreakdown = summary.sourceBreakdown || {};
        description += `\n**By Source:**\n`;
        description += `🎰 Gacha Pulls: ${sourceBreakdown.gacha || 0}\n`;
        description += `⚗️ Combinations: ${sourceBreakdown.combined || 0}\n`;
        description += `🏆 Series Rewards: ${sourceBreakdown.series_completion || 0}\n`;
        description += `🎁 Player Gifts: ${sourceBreakdown.player_transfer || 0}\n`;

        const animatedCount = user.gachaCollection?.filter(item => item.isAnimated).length || 0;
        if (animatedCount > 0) {
            description += `🎬 Animated Emojis: ${animatedCount}\n`;
        }

        description += `\n**💡 Combination System:**\n`;
        description += `⚗️ Current combinations available: ${possibleCombinations.length}\n`;
        description += `🔮 Combinations show automatically in /collection\n`;
        description += `📢 Public alerts posted when new combinations unlock`;

        embed.setDescription(description);

        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`coll_back_${user.raUsername}_all_0`)
                    .setLabel('← Back to Collection')
                    .setStyle(ButtonStyle.Secondary)
            )
        ];

        await interaction.editReply({ embeds: [embed], components });
    },

    async showGiveConfirmation(interaction, givingUser, receivingUser, gachaItem, quantity) {
        const emoji = formatGachaEmoji(gachaItem.emojiId, gachaItem.emojiName, gachaItem.isAnimated);
        const { emoji: rarityEmoji } = rarityData[gachaItem.rarity];
        
        const embed = new EmbedBuilder()
            .setTitle('🤝 Confirm Item Transfer')
            .setColor(COLORS.WARNING)
            .setDescription(
                `You are about to give an item to another player.\n\n` +
                `${emoji} **${quantity}x ${gachaItem.itemName}** ${rarityEmoji}${gachaItem.isAnimated ? ' 🎬' : ''}\n\n` +
                `**From:** ${givingUser.raUsername}\n**To:** ${receivingUser.raUsername}\n\n` +
                `⚠️ **IMPORTANT:** This transfer is FINAL and cannot be undone. Admins will NOT intervene in player disputes. Make sure you trust the other player.\n\n` +
                `Are you absolutely sure you want to proceed?`
            )
            .setFooter({ text: 'This action cannot be reversed!' })
            .setTimestamp();

        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`coll_give_confirm_${givingUser.raUsername}_${receivingUser.raUsername}_${gachaItem.itemId}_${quantity}`)
                    .setLabel('✅ Yes, Give Item')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('coll_give_cancel')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Secondary)
            )
        ];

        await interaction.editReply({ embeds: [embed], components });
    },

    // PERFORMANCE: Optimized transfer with better error handling
    async performTransfer(givingUsername, receivingUsername, itemId, quantity) {
        // PERFORMANCE: Use Promise.all for parallel queries
        const [givingUser, receivingUser, gachaItem] = await Promise.all([
            User.findOne({ raUsername: { $regex: new RegExp(`^${givingUsername}$`, 'i') } }),
            User.findOne({ raUsername: { $regex: new RegExp(`^${receivingUsername}$`, 'i') } }),
            GachaItem.findOne({ itemId }).lean() // Use lean for read-only data
        ]);

        if (!givingUser || !receivingUser || !gachaItem) {
            throw new Error('User or item not found.');
        }

        const givingUserItem = givingUser.gachaCollection?.find(item => item.itemId === itemId);
        if (!givingUserItem || givingUserItem.quantity < quantity) {
            throw new Error('You no longer have enough of this item to give.');
        }

        // Perform transfer
        const removeSuccess = givingUser.removeGachaItem(itemId, quantity);
        if (!removeSuccess) throw new Error('Failed to remove item from your collection.');

        receivingUser.addGachaItem(gachaItem, quantity, 'player_transfer');
        
        // PERFORMANCE: Parallel save and combination check
        const [, , combinationResult] = await Promise.all([
            givingUser.save(),
            receivingUser.save(),
            combinationService.triggerCombinationAlertsForPlayerTransfer(receivingUser, itemId, givingUser.raUsername)
                .catch(error => {
                    console.error('Error checking combinations for player gift:', error);
                    return { hasCombinations: false };
                })
        ]);

        // PERFORMANCE: Clear cache for both users
        invalidateUserCache(givingUser.discordId);
        invalidateUserCache(receivingUser.discordId);

        return { success: true, combinationResult, gachaItem, givingUser, receivingUser };
    },

    async handleGiveDetailsModal(interaction, username, itemId, filter, page) {
        await interaction.deferReply({ ephemeral: true });

        const recipientUsername = interaction.fields.getTextInputValue('recipient_username');
        const quantity = parseInt(interaction.fields.getTextInputValue('quantity') || '1') || 1;

        if (quantity < 1 || quantity > 100) {
            return interaction.editReply({ content: '❌ Quantity must be between 1 and 100.' });
        }

        // PERFORMANCE: Use cached user lookup
        const givingUser = await getCachedUserCollection(interaction.user.id);
        if (!givingUser || givingUser.raUsername.toLowerCase() !== username.toLowerCase()) {
            return interaction.editReply({ content: '❌ You can only give items from your own collection.' });
        }

        const receivingUser = await User.findOne({ raUsername: { $regex: new RegExp(`^${recipientUsername}$`, 'i') } });
        if (!receivingUser) {
            return interaction.editReply({ content: `❌ User "${recipientUsername}" not found. Make sure they are registered in the system.` });
        }

        if (givingUser.raUsername.toLowerCase() === receivingUser.raUsername.toLowerCase()) {
            return interaction.editReply({ content: '❌ You cannot give items to yourself!' });
        }

        const givingUserItem = givingUser.gachaCollection?.find(item => item.itemId === itemId);
        if (!givingUserItem) {
            return interaction.editReply({ content: `❌ You don't have this item in your collection anymore.` });
        }

        if (givingUserItem.quantity < quantity) {
            return interaction.editReply({ content: `❌ You only have ${givingUserItem.quantity} of this item, but you're trying to give ${quantity}.` });
        }

        const gachaItem = await GachaItem.findOne({ itemId }).lean();
        if (!gachaItem) {
            return interaction.editReply({ content: `❌ Item not found in the database. This might be an invalid item.` });
        }

        await this.showGiveConfirmation(interaction, givingUser, receivingUser, gachaItem, quantity);
    },

    // PERFORMANCE: Optimized interaction handler
    async handleInteraction(interaction) {
        if (!interaction.customId.startsWith('coll_')) return;

        try {
            // PERFORMANCE: Parse customId once and route efficiently
            const customIdParts = interaction.customId.split('_');
            const action = customIdParts[1];

            // Handle give confirmation
            if (action === 'give' && customIdParts[2] === 'confirm') {
                await interaction.deferUpdate();
                const [, , , givingUsername, receivingUsername, itemId, quantityStr] = customIdParts;
                const quantity = parseInt(quantityStr);

                const user = await getCachedUserCollection(interaction.user.id);
                if (!user) {
                    return interaction.editReply({ content: '❌ You are not registered. Please ask an admin to register you first.', embeds: [], components: [] });
                }

                if (user.raUsername.toLowerCase() !== givingUsername.toLowerCase()) {
                    return interaction.editReply({ content: '❌ You can only confirm your own transfers.', embeds: [], components: [] });
                }

                try {
                    const result = await this.performTransfer(givingUsername, receivingUsername, itemId, quantity);
                    const emoji = formatGachaEmoji(result.gachaItem.emojiId, result.gachaItem.emojiName, result.gachaItem.isAnimated);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Item Transfer Complete!')
                        .setColor(COLORS.SUCCESS)
                        .setDescription(`${emoji} **${quantity}x ${result.gachaItem.itemName}** has been given to **${result.receivingUser.raUsername}**!`)
                        .setTimestamp();

                    if (result.combinationResult.hasCombinations) {
                        embed.addFields({
                            name: '⚗️ Combination Alerts Sent!',
                            value: `${result.receivingUser.raUsername} now has ${result.combinationResult.combinationCount} combination option(s) available!`,
                            inline: false
                        });
                    }

                    await interaction.editReply({ embeds: [embed], components: [] });

                    const confirmationSent = await this.sendPublicTradeConfirmation(
                        result.givingUser, 
                        result.receivingUser, 
                        result.gachaItem, 
                        quantity, 
                        result.combinationResult,
                        interaction.client
                    );
                    
                    if (!confirmationSent) {
                        await interaction.followUp({ 
                            content: '⚠️ Trade completed successfully, but public confirmation could not be sent to the trade channel. Both parties should screenshot this confirmation.', 
                            ephemeral: true 
                        });
                    }

                } catch (error) {
                    await interaction.editReply({ content: `❌ Transfer failed: ${error.message}`, embeds: [], components: [] });
                }
                return;
            }

            if (customIdParts.join('_') === 'coll_give_cancel') {
                await interaction.deferUpdate();
                return interaction.editReply({ content: '❌ Transfer cancelled.', embeds: [], components: [] });
            }

            // Handle share button
            if (action === 'share') {
                const [, , username, itemId] = customIdParts;
                
                const user = await getCachedUserCollection(interaction.user.id);
                if (!user) {
                    return interaction.reply({ content: '❌ You are not registered. Please ask an admin to register you first.', ephemeral: true });
                }

                if (user.raUsername.toLowerCase() !== username.toLowerCase()) {
                    return interaction.reply({ content: '❌ You can only share your own items.', ephemeral: true });
                }
                
                await interaction.deferReply({ ephemeral: true });
                return this.shareItem(interaction, user, itemId);
            }

            // Handle pagination efficiently
            if ((action === 'inspect' || action === 'give') && (customIdParts[2] === 'prev' || customIdParts[2] === 'next')) {
                await interaction.deferUpdate();
                const direction = customIdParts[2];
                const username = customIdParts[3];
                const filter = customIdParts[4];
                const currentPage = parseInt(customIdParts[5]);

                const user = await getCachedUserCollection(interaction.user.id);
                if (!user || user.raUsername.toLowerCase() !== username.toLowerCase()) {
                    return interaction.editReply({ content: '❌ You can only view your own collection.', embeds: [], components: [] });
                }

                const newPage = direction === 'prev' ? currentPage - 1 : currentPage + 1;
                
                if (action === 'inspect') {
                    return this.showInspectMenu(interaction, user, filter, newPage);
                } else {
                    return this.showGiveMenu(interaction, user, filter, newPage);
                }
            }

            // Handle action dropdown
            if (action === 'actions' && interaction.isStringSelectMenu()) {
                const [, , username, filter, pageStr] = customIdParts;
                const page = parseInt(pageStr);
                const selectedAction = interaction.values[0];

                const user = await getCachedUserCollection(interaction.user.id);
                if (!user) {
                    return interaction.reply({ content: '❌ You are not registered. Please ask an admin to register you first.', ephemeral: true });
                }

                if (user.raUsername.toLowerCase() !== username.toLowerCase()) {
                    return interaction.reply({ content: '❌ You can only view your own collection.', ephemeral: true });
                }

                if (selectedAction === 'give') {
                    await interaction.deferUpdate();
                    return this.showGiveMenu(interaction, user, filter, page);
                }

                await interaction.deferUpdate();

                switch (selectedAction) {
                    case 'inspect': return this.showInspectMenu(interaction, user, filter, page);
                    case 'stats': return this.showStats(interaction, user);
                    case 'recipes': return combinationService.showRecipeBook(interaction, 0);
                    case 'combinations':
                        const combinations = await combinationService.checkPossibleCombinations(user);
                        return combinations.length > 0 
                            ? combinationService.showCombinationAlert(interaction, user, combinations)
                            : interaction.editReply({ content: '❌ No combinations currently available.', embeds: [], components: [] });
                }
                return;
            }

            // Handle give item selection
            if (action === 'give' && customIdParts[2] === 'item' && interaction.isStringSelectMenu()) {
                const [, , , , filter, pageStr] = customIdParts;
                const itemId = interaction.values[0];
                const page = parseInt(pageStr);
                
                const user = await getCachedUserCollection(interaction.user.id);
                if (!user) {
                    return interaction.reply({ content: '❌ You are not registered. Please ask an admin to register you first.', ephemeral: true });
                }
                
                return this.showGiveDetailsModal(interaction, user, itemId, filter, page);
            }

            await interaction.deferUpdate();
            
            const user = await getCachedUserCollection(interaction.user.id);
            if (!user) {
                return interaction.followUp({ content: '❌ You are not registered. Please ask an admin to register you first.', ephemeral: true });
            }

            // Handle inspect item selection
            if (action === 'inspect' && customIdParts[2] === 'item' && interaction.isStringSelectMenu()) {
                const [, , , , filter, pageStr] = customIdParts;
                return this.showItemDetail(interaction, user, interaction.values[0], filter, parseInt(pageStr));
            }

            // Handle other actions
            if (user.raUsername.toLowerCase() !== customIdParts[2]?.toLowerCase()) {
                return interaction.followUp({ content: '❌ You can only view your own collection.', ephemeral: true });
            }

            switch (action) {
                case 'series':
                    if (interaction.isStringSelectMenu()) {
                        return this.showCollection(interaction, user, interaction.values[0], 0);
                    }
                    break;
                case 'prev':
                    if (customIdParts.length >= 4) {
                        const filter = customIdParts[3];
                        const currentPage = parseInt(interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/)?.[1] || '1') - 1;
                        return this.showCollection(interaction, user, filter, Math.max(0, currentPage - 1));
                    }
                    break;
                case 'next':
                    if (customIdParts.length >= 4) {
                        const filter = customIdParts[3];
                        const currentPage = parseInt(interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/)?.[1] || '1') - 1;
                        return this.showCollection(interaction, user, filter, currentPage + 1);
                    }
                    break;
                case 'back':
                    if (customIdParts.length >= 5) {
                        return this.showCollection(interaction, user, customIdParts[3], parseInt(customIdParts[4]));
                    }
                    break;
            }

        } catch (error) {
            console.error('Error handling collection interaction:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred while processing your request.', ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: '❌ An error occurred while processing your request.' });
            } else {
                await interaction.followUp({ content: '❌ An error occurred while processing your request.', ephemeral: true });
            }
        }
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId.startsWith('coll_give_details_')) {
            const parts = interaction.customId.split('_');
            const username = parts[3];
            const itemId = parts[4];
            const filter = parts[5];
            const page = parseInt(parts[6]);
            await this.handleGiveDetailsModal(interaction, username, itemId, filter, page);
        }
    }
};

// Initialize rarity data when module loads
initializeRarityData();
