// src/commands/user/collection.js - UPDATED with improved trading system
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

export default {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View your gacha collection'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const user = await User.findOne({ discordId: interaction.user.id });
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

        // Check for combinations first
        const possibleCombinations = await combinationService.checkPossibleCombinations(user);
        if (possibleCombinations.length > 0) {
            return combinationService.showCombinationAlert(interaction, user, possibleCombinations);
        }

        await this.showCollection(interaction, user, 'all', 0);
    },

    async showCollection(interaction, user, filter = 'all', page = 0) {
        // Filter and sort items
        let items = filter === 'all' ? user.gachaCollection : user.gachaCollection.filter(item => item.seriesId === filter);
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        items.sort((a, b) => {
            const aIndex = rarityOrder.indexOf(a.rarity);
            const bIndex = rarityOrder.indexOf(b.rarity);
            if (aIndex !== bIndex) return aIndex - bIndex;
            
            // Sort by series (items without seriesId come last)
            const aSeriesId = a.seriesId || 'zzz_individual';
            const bSeriesId = b.seriesId || 'zzz_individual';
            const seriesCompare = aSeriesId.localeCompare(bSeriesId);
            if (seriesCompare !== 0) return seriesCompare;
            
            // Finally sort alphabetically by name
            return a.itemName.localeCompare(b.itemName);
        });

        // Pagination
        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const startIndex = page * ITEMS_PER_PAGE;
        const pageItems = items.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Collection - ${filter === 'all' ? 'All Items' : filter}`)
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
                if (!rarityItems?.length) continue;

                const rarityEmoji = gachaService.getRarityEmoji(rarity);
                const rarityName = gachaService.getRarityDisplayName(rarity);
                description += `\n${rarityEmoji} **${rarityName}** (${rarityItems.length})\n`;
                
                // Create emoji grid (5 per row)
                let currentRow = '';
                rarityItems.forEach((item, i) => {
                    const emoji = formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
                    const quantity = item.quantity > 1 ? `x${item.quantity}` : '';
                    currentRow += `${emoji}${quantity} `;
                    
                    if ((i + 1) % 5 === 0 || i === rarityItems.length - 1) {
                        description += currentRow.trim() + '\n';
                        currentRow = '';
                    }
                });
            }
            embed.setDescription(description.trim());
        }

        // Footer
        const combinationStats = combinationService.getCombinationStats(user);
        const possibleCombinations = await combinationService.checkPossibleCombinations(user);
        
        let footerText = totalPages > 1 
            ? `Page ${page + 1}/${totalPages} • ${startIndex + 1}-${Math.min(startIndex + ITEMS_PER_PAGE, items.length)} of ${items.length} items`
            : `${items.length} items • xN = quantity`;
        
        footerText += ` • ${combinationStats.totalCombined} from combinations`;
        if (possibleCombinations.length > 0) {
            footerText += ` • ⚗️ ${possibleCombinations.length} combination(s) available!`;
        }
        embed.setFooter({ text: footerText });

        // Create components
        const components = [];

        // Series dropdown
        const seriesOptions = this.getSeriesOptions(user);
        if (seriesOptions.length > 1) {
            const seriesMenu = new StringSelectMenuBuilder()
                .setCustomId(`coll_series_${user.raUsername}`)
                .setPlaceholder('Choose a series to view...')
                .addOptions(seriesOptions);
            components.push(new ActionRowBuilder().addComponents(seriesMenu));
        }

        // Pagination
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
            { label: '📊 Collection Stats', value: 'stats', description: 'View collection statistics', emoji: '📊' }
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

        await interaction.editReply({ embeds: [embed], components });
    },

    getSeriesOptions(user) {
        const summary = gachaService.getUserCollectionSummary(user);
        const options = [{ label: 'All Items', value: 'all', description: `View all ${summary.totalItems} items`, emoji: '📦' }];

        Object.entries(summary.seriesBreakdown || {}).forEach(([seriesName, items]) => {
            const itemCount = items.length;
            const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
            
            options.push({
                label: seriesName === 'Individual Items' ? 'Individual Items' : seriesName.charAt(0).toUpperCase() + seriesName.slice(1),
                value: seriesName === 'Individual Items' ? 'individual' : seriesName,
                description: `${itemCount} ${seriesName === 'Individual Items' ? 'standalone' : 'types'} ${seriesName !== 'Individual Items' ? `(${totalQuantity} total)` : 'items'}`,
                emoji: seriesName === 'Individual Items' ? '🔸' : '🏷️'
            });
        });

        return options.slice(0, 25);
    },

    async showInspectMenu(interaction, user, filter, page) {
        let items = filter === 'all' ? user.gachaCollection : user.gachaCollection.filter(item => item.seriesId === filter);
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        items.sort((a, b) => {
            const aIndex = rarityOrder.indexOf(a.rarity);
            const bIndex = rarityOrder.indexOf(b.rarity);
            if (aIndex !== bIndex) return aIndex - bIndex;
            
            const aSeriesId = a.seriesId || 'zzz_individual';
            const bSeriesId = b.seriesId || 'zzz_individual';
            const seriesCompare = aSeriesId.localeCompare(bSeriesId);
            if (seriesCompare !== 0) return seriesCompare;
            
            return a.itemName.localeCompare(b.itemName);
        });

        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pageItems = items.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
        
        if (pageItems.length === 0) {
            return interaction.followUp({ content: '❌ No items on this page to inspect.', ephemeral: true });
        }

        const itemOptions = pageItems.map(item => {
            const quantity = item.quantity > 1 ? ` x${item.quantity}` : '';
            const seriesTag = item.seriesId ? ` [${item.seriesId}]` : '';
            const sourceTag = item.source === 'combined' ? ' ⚗️' : item.source === 'player_transfer' ? ' 🎁' : '';
            const animatedTag = item.isAnimated ? ' 🎬' : '';
            
            const option = {
                label: item.itemName.slice(0, 100),
                value: item.itemId,
                description: `${gachaService.getRarityDisplayName(item.rarity)}${quantity}${seriesTag}${sourceTag}${animatedTag}`.slice(0, 100)
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

        // Add pagination for inspect if needed
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

        // Back button
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`coll_back_${user.raUsername}_${filter}_${page}`)
                .setLabel('← Back')
                .setStyle(ButtonStyle.Secondary)
        ));

        await interaction.editReply({ embeds: [embed], components });
    },

    // NEW: Show give item menu with dropdown instead of modal
    async showGiveMenu(interaction, user, filter, page) {
        let items = filter === 'all' ? user.gachaCollection : user.gachaCollection.filter(item => item.seriesId === filter);
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        items.sort((a, b) => {
            const aIndex = rarityOrder.indexOf(a.rarity);
            const bIndex = rarityOrder.indexOf(b.rarity);
            if (aIndex !== bIndex) return aIndex - bIndex;
            
            const aSeriesId = a.seriesId || 'zzz_individual';
            const bSeriesId = b.seriesId || 'zzz_individual';
            const seriesCompare = aSeriesId.localeCompare(bSeriesId);
            if (seriesCompare !== 0) return seriesCompare;
            
            return a.itemName.localeCompare(b.itemName);
        });

        const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
        const pageItems = items.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
        
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
                description: `${gachaService.getRarityDisplayName(item.rarity)}${quantity}${seriesTag}${sourceTag}${animatedTag}`.slice(0, 100)
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

        // Add pagination for give if needed
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

        // Back button
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`coll_back_${user.raUsername}_${filter}_${page}`)
                .setLabel('← Back')
                .setStyle(ButtonStyle.Secondary)
        ));

        await interaction.editReply({ embeds: [embed], components });
    },

    // NEW: Show modal for recipient details after item selection
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

    async showItemDetail(interaction, user, itemId, returnFilter, returnPage) {
        const item = user.gachaCollection.find(item => item.itemId === itemId);
        if (!item) {
            return interaction.editReply({ content: '❌ Item not found in your collection.' });
        }

        const originalItem = await GachaItem.findOne({ itemId });
        const embed = new EmbedBuilder()
            .setTitle(`Item Details - ${item.itemName}`)
            .setColor(gachaService.getRarityColor(item.rarity))
            .setTimestamp();

        const emoji = formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
        const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
        const rarityName = gachaService.getRarityDisplayName(item.rarity);
        
        let description = `${emoji} **${item.itemName}**\n\n${rarityEmoji} **${rarityName}**`;
        if (item.quantity > 1) description += `\n**Quantity:** ${item.quantity}`;
        if (item.seriesId) description += `\n**Series:** ${item.seriesId.charAt(0).toUpperCase() + item.seriesId.slice(1)}`;
        if (item.isAnimated) description += `\n**Emoji Type:** 🎬 Animated`;
        
        const sourceNames = { gacha: 'Gacha Pull', combined: 'Combination', series_completion: 'Series Completion', admin_grant: 'Admin Grant', player_transfer: 'Player Gift' };
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

        const originalItem = await GachaItem.findOne({ itemId });
        const emoji = formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
        const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
        const rarityName = gachaService.getRarityDisplayName(item.rarity);

        const embed = new EmbedBuilder()
            .setTitle(`${emoji} ${item.itemName}`)
            .setColor(gachaService.getRarityColor(item.rarity))
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

    // ENHANCED: Send public trade confirmation that expires in 5 minutes
    async sendPublicTradeConfirmation(givingUser, receivingUser, gachaItem, quantity, combinationResult, client) {
        try {
            const emoji = formatGachaEmoji(gachaItem.emojiId, gachaItem.emojiName, gachaItem.isAnimated);
            const rarityEmoji = gachaService.getRarityEmoji(gachaItem.rarity);
            const rarityName = gachaService.getRarityDisplayName(gachaItem.rarity);
            
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

            // Add item description if available
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
                // Send a prominent message that mentions both users
                const message = await channel.send({ 
                    content: `**TRADE ALERT**\n<@${givingUser.discordId}> ➡️ <@${receivingUser.discordId}>`, 
                    embeds: [embed] 
                });
                
                console.log(`📢 Public trade confirmation sent to ${channel.name} for trade: ${givingUser.raUsername} -> ${receivingUser.raUsername} (${quantity}x ${gachaItem.itemName})`);
                
                // Schedule deletion in 5 minutes
                setTimeout(async () => {
                    try {
                        await message.delete();
                        console.log(`🗑️ Auto-deleted trade confirmation for ${givingUser.raUsername} -> ${receivingUser.raUsername}`);
                    } catch (deleteError) {
                        console.log('Trade confirmation message already deleted or inaccessible');
                    }
                }, 5 * 60 * 1000); // 5 minutes
                
                return true;
            } else {
                console.error(`❌ Could not find gacha trade channel: ${GACHA_TRADE_CHANNEL_ID}`);
                return false;
            }
        } catch (error) {
            console.error('❌ Error sending public trade confirmation:', error);
            console.error('Error details:', {
                givingUser: givingUser?.raUsername,
                receivingUser: receivingUser?.raUsername,
                item: gachaItem?.itemName,
                quantity: quantity,
                channelId: GACHA_TRADE_CHANNEL_ID
            });
            return false;
        }
    },

    async showStats(interaction, user) {
        const summary = gachaService.getUserCollectionSummary(user);
        const combinationStats = combinationService.getCombinationStats(user);
        
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Collection Statistics`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        let description = `📦 **Total Items:** ${summary.totalItems}\n🎯 **Unique Items:** ${summary.uniqueItems}\n\n**Rarity Breakdown:**\n`;
        
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        const rarityCount = summary.rarityCount || {};
        rarityOrder.forEach(rarity => {
            const count = rarityCount[rarity] || 0;
            if (count > 0) {
                const rarityEmoji = gachaService.getRarityEmoji(rarity);
                const rarityName = gachaService.getRarityDisplayName(rarity);
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

        // Check for animated items
        const animatedCount = user.gachaCollection?.filter(item => item.isAnimated).length || 0;
        if (animatedCount > 0) {
            description += `🎬 Animated Emojis: ${animatedCount}\n`;
        }

        const possibleCombinations = await combinationService.checkPossibleCombinations(user);
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
        const rarityEmoji = gachaService.getRarityEmoji(gachaItem.rarity);
        
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

    async performTransfer(givingUsername, receivingUsername, itemId, quantity) {
        const givingUser = await User.findOne({ raUsername: { $regex: new RegExp(`^${givingUsername}$`, 'i') } });
        const receivingUser = await User.findOne({ raUsername: { $regex: new RegExp(`^${receivingUsername}$`, 'i') } });
        const gachaItem = await GachaItem.findOne({ itemId });

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
        await Promise.all([givingUser.save(), receivingUser.save()]);

        // Check for combinations
        let combinationResult = { hasCombinations: false };
        try {
            combinationResult = await combinationService.triggerCombinationAlertsForPlayerTransfer(receivingUser, itemId, givingUser.raUsername);
        } catch (error) {
            console.error('Error checking combinations for player gift:', error);
        }

        return { success: true, combinationResult, gachaItem, givingUser, receivingUser };
    },

    // NEW: Handle give details modal submission
    async handleGiveDetailsModal(interaction, username, itemId, filter, page) {
        await interaction.deferReply({ ephemeral: true });

        const recipientUsername = interaction.fields.getTextInputValue('recipient_username');
        const quantity = parseInt(interaction.fields.getTextInputValue('quantity') || '1') || 1;

        if (quantity < 1 || quantity > 100) {
            return interaction.editReply({ content: '❌ Quantity must be between 1 and 100.' });
        }

        const givingUser = await User.findOne({ discordId: interaction.user.id });
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

        const gachaItem = await GachaItem.findOne({ itemId });
        if (!gachaItem) {
            return interaction.editReply({ content: `❌ Item not found in the database. This might be an invalid item.` });
        }

        await this.showGiveConfirmation(interaction, givingUser, receivingUser, gachaItem, quantity);
    },

    // Main interaction handler
    async handleInteraction(interaction) {
        if (!interaction.customId.startsWith('coll_')) return;

        try {
            // Handle give confirmation
            if (interaction.customId.startsWith('coll_give_confirm_')) {
                await interaction.deferUpdate();
                const parts = interaction.customId.split('_');
                const [, , , givingUsername, receivingUsername, itemId, quantityStr] = parts;
                const quantity = parseInt(quantityStr);

                const user = await User.findOne({ discordId: interaction.user.id });
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

                    // ENHANCED: Send public trade confirmation that expires in 5 minutes
                    const confirmationSent = await this.sendPublicTradeConfirmation(
                        result.givingUser, 
                        result.receivingUser, 
                        result.gachaItem, 
                        quantity, 
                        result.combinationResult,
                        interaction.client
                    );
                    
                    if (!confirmationSent) {
                        // If public confirmation failed, send a follow-up to let them know
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

            if (interaction.customId === 'coll_give_cancel') {
                await interaction.deferUpdate();
                return interaction.editReply({ content: '❌ Transfer cancelled.', embeds: [], components: [] });
            }

            // Handle share button
            if (interaction.customId.startsWith('coll_share_')) {
                const [, , username, itemId] = interaction.customId.split('_');
                
                const user = await User.findOne({ discordId: interaction.user.id });
                if (!user) {
                    return interaction.reply({ content: '❌ You are not registered. Please ask an admin to register you first.', ephemeral: true });
                }

                if (user.raUsername.toLowerCase() !== username.toLowerCase()) {
                    return interaction.reply({ content: '❌ You can only share your own items.', ephemeral: true });
                }
                
                await interaction.deferReply({ ephemeral: true });
                return this.shareItem(interaction, user, itemId);
            }

            // Handle pagination for inspect
            if (interaction.customId.startsWith('coll_inspect_prev_') || interaction.customId.startsWith('coll_inspect_next_')) {
                await interaction.deferUpdate();
                const parts = interaction.customId.split('_');
                const direction = parts[2]; // prev or next
                const username = parts[3];
                const filter = parts[4];
                const currentPage = parseInt(parts[5]);

                const user = await User.findOne({ discordId: interaction.user.id });
                if (!user || user.raUsername.toLowerCase() !== username.toLowerCase()) {
                    return interaction.editReply({ content: '❌ You can only view your own collection.', embeds: [], components: [] });
                }

                const newPage = direction === 'prev' ? currentPage - 1 : currentPage + 1;
                return this.showInspectMenu(interaction, user, filter, newPage);
            }

            // Handle pagination for give
            if (interaction.customId.startsWith('coll_give_prev_') || interaction.customId.startsWith('coll_give_next_')) {
                await interaction.deferUpdate();
                const parts = interaction.customId.split('_');
                const direction = parts[2]; // prev or next
                const username = parts[3];
                const filter = parts[4];
                const currentPage = parseInt(parts[5]);

                const user = await User.findOne({ discordId: interaction.user.id });
                if (!user || user.raUsername.toLowerCase() !== username.toLowerCase()) {
                    return interaction.editReply({ content: '❌ You can only view your own collection.', embeds: [], components: [] });
                }

                const newPage = direction === 'prev' ? currentPage - 1 : currentPage + 1;
                return this.showGiveMenu(interaction, user, filter, newPage);
            }

            // Handle action dropdown
            if (interaction.customId.startsWith('coll_actions_') && interaction.isStringSelectMenu()) {
                const [, , username, filter, pageStr] = interaction.customId.split('_');
                const page = parseInt(pageStr);
                const action = interaction.values[0];

                const user = await User.findOne({ discordId: interaction.user.id });
                if (!user) {
                    return interaction.reply({ content: '❌ You are not registered. Please ask an admin to register you first.', ephemeral: true });
                }

                if (user.raUsername.toLowerCase() !== username.toLowerCase()) {
                    return interaction.reply({ content: '❌ You can only view your own collection.', ephemeral: true });
                }

                // Handle 'give' action - show give menu instead of modal
                if (action === 'give') {
                    await interaction.deferUpdate();
                    return this.showGiveMenu(interaction, user, filter, page);
                }

                await interaction.deferUpdate();

                switch (action) {
                    case 'inspect': return this.showInspectMenu(interaction, user, filter, page);
                    case 'stats': return this.showStats(interaction, user);
                    case 'combinations':
                        const combinations = await combinationService.checkPossibleCombinations(user);
                        return combinations.length > 0 
                            ? combinationService.showCombinationAlert(interaction, user, combinations)
                            : interaction.editReply({ content: '❌ No combinations currently available.', embeds: [], components: [] });
                }
                return;
            }

            // NEW: Handle give item selection - DON'T defer for modal interactions
            if (interaction.customId.startsWith('coll_give_item_') && interaction.isStringSelectMenu()) {
                const [, , , , filter, pageStr] = interaction.customId.split('_');
                const itemId = interaction.values[0];
                const page = parseInt(pageStr);
                
                const user = await User.findOne({ discordId: interaction.user.id });
                if (!user) {
                    return interaction.reply({ content: '❌ You are not registered. Please ask an admin to register you first.', ephemeral: true });
                }
                
                return this.showGiveDetailsModal(interaction, user, itemId, filter, page);
            }

            await interaction.deferUpdate();
            
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.followUp({ content: '❌ You are not registered. Please ask an admin to register you first.', ephemeral: true });
            }

            // Handle inspect item selection
            if (interaction.customId.startsWith('coll_inspect_item_') && interaction.isStringSelectMenu()) {
                const [, , , , filter, pageStr] = interaction.customId.split('_');
                return this.showItemDetail(interaction, user, interaction.values[0], filter, parseInt(pageStr));
            }

            // Handle other actions by parsing the custom ID
            const [, action, username, ...rest] = interaction.customId.split('_');
            
            if (user.raUsername.toLowerCase() !== username.toLowerCase()) {
                return interaction.followUp({ content: '❌ You can only view your own collection.', ephemeral: true });
            }

            switch (action) {
                case 'series':
                    if (interaction.isStringSelectMenu()) {
                        return this.showCollection(interaction, user, interaction.values[0], 0);
                    }
                    break;
                case 'prev':
                    if (rest.length >= 1) {
                        const filter = rest[0];
                        const currentPage = parseInt(interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/)?.[1] || '1') - 1;
                        return this.showCollection(interaction, user, filter, Math.max(0, currentPage - 1));
                    }
                    break;
                case 'next':
                    if (rest.length >= 1) {
                        const filter = rest[0];
                        const currentPage = parseInt(interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/)?.[1] || '1') - 1;
                        return this.showCollection(interaction, user, filter, currentPage + 1);
                    }
                    break;
                case 'back':
                    if (rest.length >= 2) {
                        return this.showCollection(interaction, user, rest[0], parseInt(rest[1]));
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

    // Handle modal submissions
    async handleModalSubmit(interaction) {
        // NEW: Handle give details modal
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
