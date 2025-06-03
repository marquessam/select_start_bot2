// src/commands/user/collection.js - UPDATED with combination priority system
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
                    content: '📦 Your collection is empty! Visit the gacha channel to start collecting items.\n\n' +
                             '💡 **Tip:** When you get the right ingredients, combinations will be available in /collection!'
                });
            }

            // PRIORITY: Check for combinations first!
            const possibleCombinations = await combinationService.checkPossibleCombinations(user);
            
            if (possibleCombinations.length > 0) {
                // Show combination alert instead of normal collection
                await combinationService.showCombinationAlert(interaction, user, possibleCombinations);
                return;
            }

            // No combinations available, show normal collection
            await this.showItemsPage(interaction, user, 'all', 0);
        } catch (error) {
            console.error('Error displaying collection:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching your collection.'
            });
        }
    },

    async showItemsPage(interaction, user, filter = 'all', page = 0) {
        const ITEMS_PER_PAGE = 25;
        
        // Filter items
        let filteredItems = filter === 'all' ? 
            user.gachaCollection : 
            user.gachaCollection.filter(item => item.seriesId === filter);

        const title = filter === 'all' ? 'All Items' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Series`;

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
                
                // Create emoji grid (5 per row)
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

        // Get combination stats
        const combinationStats = combinationService.getCombinationStats(user);

        // Footer with combination hint
        let footerText = '';
        if (totalPages > 1) {
            footerText = `Page ${page + 1}/${totalPages} • ${startIndex + 1}-${endIndex} of ${filteredItems.length} items • ${combinationStats.totalCombined} from combinations`;
        } else {
            footerText = `${filteredItems.length} items • ${combinationStats.totalCombined} from combinations • ⁽ⁿ⁾ = quantity`;
        }

        // Check if user has potential combinations (not triggered ones)
        const possibleCombinations = await combinationService.checkPossibleCombinations(user);
        if (possibleCombinations.length > 0) {
            footerText += ` • ⚗️ ${possibleCombinations.length} combination(s) available!`;
        }

        embed.setFooter({ text: footerText });

        // Create components
        const components = [];

        // Series dropdown (if multiple series)
        const seriesOptions = this.getSeriesOptions(user);
        if (seriesOptions.length > 1) {
            const seriesMenu = new StringSelectMenuBuilder()
                .setCustomId(`coll_series_${user.raUsername}`)
                .setPlaceholder('Choose a series to view...')
                .addOptions(seriesOptions);
            components.push(new ActionRowBuilder().addComponents(seriesMenu));
        }

        // Action buttons
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

        // Main action buttons
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`coll_inspect_${user.raUsername}_${filter}_${page}`)
                .setLabel('🔍 Inspect')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pageItems.length === 0),
            new ButtonBuilder()
                .setCustomId(`coll_give_${user.raUsername}`)
                .setLabel('🎁 Give Item')
                .setStyle(ButtonStyle.Success)
                .setDisabled(pageItems.length === 0),
            new ButtonBuilder()
                .setCustomId(`coll_stats_${user.raUsername}`)
                .setLabel('📊 Stats')
                .setStyle(ButtonStyle.Secondary)
        );

        // Add combination button if available
        if (possibleCombinations.length > 0) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`coll_combinations_${user.raUsername}`)
                    .setLabel(`⚗️ Combinations (${possibleCombinations.length})`)
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⚗️')
            );
        }

        components.push(actionRow);

        await interaction.editReply({ embeds: [embed], components: components });
    },

    getSeriesOptions(user) {
        const summary = gachaService.getUserCollectionSummary(user);
        const options = [
            { label: 'All Items', value: 'all', description: `View all ${summary.totalItems} items`, emoji: '📦' }
        ];

        Object.entries(summary.seriesBreakdown || {}).forEach(([seriesName, items]) => {
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

    async showCollectionStats(interaction, user) {
        const summary = gachaService.getUserCollectionSummary(user);
        const combinationStats = combinationService.getCombinationStats(user);
        
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Collection Statistics`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        let description = `📦 **Total Items:** ${summary.totalItems}\n`;
        description += `🎯 **Unique Items:** ${summary.uniqueItems}\n\n`;

        // Rarity breakdown
        description += `**Rarity Breakdown:**\n`;
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        const rarityCount = summary.rarityCount || {};
        for (const rarity of rarityOrder) {
            const count = rarityCount[rarity] || 0;
            if (count > 0) {
                const rarityEmoji = gachaService.getRarityEmoji(rarity);
                const rarityName = gachaService.getRarityDisplayName(rarity);
                description += `${rarityEmoji} ${rarityName}: ${count}\n`;
            }
        }

        // Series breakdown
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

        // Source breakdown
        const sourceBreakdown = summary.sourceBreakdown || {};
        description += `\n**By Source:**\n`;
        description += `🎰 Gacha Pulls: ${sourceBreakdown.gacha || 0}\n`;
        description += `⚗️ Combinations: ${sourceBreakdown.combined || 0}\n`;
        description += `🏆 Series Rewards: ${sourceBreakdown.series_completion || 0}\n`;
        description += `🎁 Player Gifts: ${sourceBreakdown.player_transfer || 0}\n`;

        // Combination system info
        const possibleCombinations = await combinationService.checkPossibleCombinations(user);
        description += `\n**💡 Combination System:**\n`;
        description += `⚗️ Current combinations available: ${possibleCombinations.length}\n`;
        description += `🔮 Combinations show automatically in /collection\n`;
        description += `📢 Public alerts posted when new combinations unlock`;

        embed.setDescription(description);

        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`coll_back_${user.raUsername}_all_0`)
                    .setLabel('← Back to Collection')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({ embeds: [embed], components: [backButton] });
    },

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
            combined: 'Combination', 
            series_completion: 'Series Completion', 
            admin_grant: 'Admin Grant',
            player_transfer: 'Player Gift'
        };
        const source = collectionItem.source || 'gacha';
        description += `\n**Source:** ${sourceNames[source] || 'Unknown'}`;
        description += `\n**Item ID:** \`${itemId}\``;

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

        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`coll_back_${user.raUsername}_${returnFilter}_${returnPage}`)
                    .setLabel('← Back')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({ embeds: [embed], components: [backButton] });
    },

    async showInspectMenu(interaction, user, filter, page) {
        const ITEMS_PER_PAGE = 25;
        
        // Get filtered items
        let filteredItems = filter === 'all' ? 
            user.gachaCollection : 
            user.gachaCollection.filter(item => item.seriesId === filter);

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
            const sourceTag = item.source === 'combined' ? ' ⚗️' : item.source === 'player_transfer' ? ' 🎁' : '';
            
            let emojiOption = undefined;
            if (item.emojiId && item.emojiName) {
                emojiOption = { id: item.emojiId, name: item.emojiName };
            } else if (item.emojiName && this.isUnicodeEmoji(item.emojiName)) {
                emojiOption = item.emojiName;
            }
            
            const option = {
                label: item.itemName.slice(0, 100),
                value: item.itemId,
                description: `${gachaService.getRarityDisplayName(item.rarity)}${quantity}${seriesTag}${sourceTag}`.slice(0, 100)
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
            .setDescription('Choose an item from this page to view its details.\n\n' +
                          '**Legend:** ⚗️ = Combined, 🎁 = Player Gift')
            .setColor(COLORS.INFO);

        await interaction.editReply({ embeds: [embed], components: components });
    },

    async showGiveItemModal(interaction, user) {
        const modal = new ModalBuilder()
            .setCustomId(`coll_give_modal_${user.raUsername}`)
            .setTitle('🎁 Give Item to Another Player');

        const recipientInput = new TextInputBuilder()
            .setCustomId('recipient_username')
            .setLabel('Recipient Username')
            .setPlaceholder('Enter the username of who you want to give the item to')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const itemIdInput = new TextInputBuilder()
            .setCustomId('item_id')
            .setLabel('Item ID')
            .setPlaceholder('Enter the item ID (use Inspect to find IDs)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const quantityInput = new TextInputBuilder()
            .setCustomId('quantity')
            .setLabel('Quantity (optional)')
            .setPlaceholder('How many to give (default: 1)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(recipientInput),
            new ActionRowBuilder().addComponents(itemIdInput),
            new ActionRowBuilder().addComponents(quantityInput)
        );

        await interaction.showModal(modal);
    },

    async handleGiveItemModal(interaction, username) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const recipientUsername = interaction.fields.getTextInputValue('recipient_username');
            const itemId = interaction.fields.getTextInputValue('item_id');
            const quantityStr = interaction.fields.getTextInputValue('quantity') || '1';
            const quantity = parseInt(quantityStr) || 1;

            if (quantity < 1 || quantity > 100) {
                return interaction.editReply({
                    content: '❌ Quantity must be between 1 and 100.'
                });
            }

            // Find users
            const givingUser = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });
            if (!givingUser || givingUser.discordId !== interaction.user.id) {
                return interaction.editReply({
                    content: '❌ You can only give items from your own collection.'
                });
            }

            const receivingUser = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${recipientUsername}$`, 'i') }
            });
            if (!receivingUser) {
                return interaction.editReply({
                    content: `❌ User "${recipientUsername}" not found. Make sure they are registered in the system.`
                });
            }

            if (givingUser.raUsername.toLowerCase() === receivingUser.raUsername.toLowerCase()) {
                return interaction.editReply({
                    content: '❌ You cannot give items to yourself!'
                });
            }

            // Validate item
            const givingUserItem = givingUser.gachaCollection?.find(item => item.itemId === itemId);
            if (!givingUserItem) {
                return interaction.editReply({
                    content: `❌ You don't have the item "${itemId}" in your collection.\nUse the Inspect button to see your items and their IDs.`
                });
            }

            if (givingUserItem.quantity < quantity) {
                return interaction.editReply({
                    content: `❌ You only have ${givingUserItem.quantity} of "${itemId}", but you're trying to give ${quantity}.`
                });
            }

            const gachaItem = await GachaItem.findOne({ itemId });
            if (!gachaItem) {
                return interaction.editReply({
                    content: `❌ Item "${itemId}" not found in the database. This might be an invalid item ID.`
                });
            }

            // Show confirmation
            await this.showGiveConfirmation(interaction, givingUser, receivingUser, gachaItem, quantity);

        } catch (error) {
            console.error('Error handling give item modal:', error);
            await interaction.editReply({
                content: '❌ An error occurred while processing your request. Please try again.'
            });
        }
    },

    async showGiveConfirmation(interaction, givingUser, receivingUser, gachaItem, quantity) {
        const itemEmoji = formatGachaEmoji(gachaItem.emojiId, gachaItem.emojiName);
        const rarityEmoji = gachaService.getRarityEmoji(gachaItem.rarity);
        
        const embed = new EmbedBuilder()
            .setTitle('🤝 Confirm Item Transfer')
            .setColor(COLORS.WARNING)
            .setDescription(
                `You are about to give an item to another player.\n\n` +
                `${itemEmoji} **${quantity}x ${gachaItem.itemName}** ${rarityEmoji}\n\n` +
                `**From:** ${givingUser.raUsername}\n` +
                `**To:** ${receivingUser.raUsername}\n\n` +
                `⚠️ **IMPORTANT WARNINGS:**\n` +
                `• This transfer is **FINAL** and cannot be undone\n` +
                `• Admins will **NOT** intervene in player disputes\n` +
                `• Please **DO NOT** scam other players\n` +
                `• Make sure you trust the other player\n\n` +
                `Are you absolutely sure you want to proceed?`
            )
            .addFields(
                { name: 'Item Details', value: `*${gachaItem.description || 'No description'}*`, inline: false },
                { name: 'Your Current Quantity', value: givingUser.gachaCollection.find(i => i.itemId === gachaItem.itemId).quantity.toString(), inline: true },
                { name: 'Giving Amount', value: quantity.toString(), inline: true },
                { name: 'You Will Have Left', value: (givingUser.gachaCollection.find(i => i.itemId === gachaItem.itemId).quantity - quantity).toString(), inline: true }
            )
            .setFooter({ text: 'This action cannot be reversed!' })
            .setTimestamp();

        const confirmButton = new ButtonBuilder()
            .setCustomId(`coll_give_confirm_${givingUser.raUsername}_${receivingUser.raUsername}_${gachaItem.itemId}_${quantity}`)
            .setLabel('✅ Yes, Give Item')
            .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
            .setCustomId(`coll_give_cancel`)
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Secondary);

        const actionRow = new ActionRowBuilder()
            .addComponents(confirmButton, cancelButton);

        await interaction.editReply({
            embeds: [embed],
            components: [actionRow]
        });
    },

    async performGiveTransfer(givingUsername, receivingUsername, itemId, quantity) {
        try {
            const givingUser = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${givingUsername}$`, 'i') }
            });
            const receivingUser = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${receivingUsername}$`, 'i') }
            });

            if (!givingUser || !receivingUser) {
                throw new Error('One of the users could not be found.');
            }

            const givingUserItem = givingUser.gachaCollection?.find(item => item.itemId === itemId);
            if (!givingUserItem || givingUserItem.quantity < quantity) {
                throw new Error('You no longer have enough of this item to give.');
            }

            const gachaItem = await GachaItem.findOne({ itemId });
            if (!gachaItem) {
                throw new Error('Item not found in database.');
            }

            // Perform transfer
            const removeSuccess = givingUser.removeGachaItem(itemId, quantity);
            if (!removeSuccess) {
                throw new Error('Failed to remove item from your collection.');
            }

            receivingUser.addGachaItem(gachaItem, quantity, 'player_transfer');

            await givingUser.save();
            await receivingUser.save();

            // Check for combinations using the new system
            let combinationResult = { hasCombinations: false };
            try {
                combinationResult = await combinationService.triggerCombinationAlertsForPlayerTransfer(
                    receivingUser, 
                    itemId, 
                    givingUser.raUsername
                );
            } catch (comboError) {
                console.error('Error checking combinations for player gift:', comboError);
                combinationResult = { 
                    hasCombinations: false, 
                    error: 'Could not check for combinations' 
                };
            }

            // Create success message
            const itemEmoji = formatGachaEmoji(gachaItem.emojiId, gachaItem.emojiName);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Item Transfer Complete!')
                .setColor(COLORS.SUCCESS)
                .setDescription(
                    `${itemEmoji} **${quantity}x ${gachaItem.itemName}** has been given to **${receivingUser.raUsername}**!\n\n` +
                    `The item has been removed from your collection and added to theirs.`
                )
                .addFields(
                    { name: 'Given By', value: givingUser.raUsername, inline: true },
                    { name: 'Received By', value: receivingUser.raUsername, inline: true },
                    { name: 'Item ID', value: itemId, inline: true }
                )
                .setTimestamp();

            // Handle combination alerts
            if (combinationResult.hasCombinations) {
                let alertMessage = `${receivingUser.raUsername} now has ${combinationResult.combinationCount} combination option(s) available!`;
                
                if (combinationResult.publicAnnouncementSent) {
                    alertMessage += '\n• Public announcement posted in gacha channel';
                    alertMessage += '\n• They will see combinations when using /collection';
                }
                
                if (combinationResult.error) {
                    alertMessage += `\n• Note: ${combinationResult.error}`;
                }
                
                embed.addFields({
                    name: '⚗️ Combination Alerts Sent!',
                    value: alertMessage,
                    inline: false
                });
            }

            embed.setFooter({ 
                text: 'Transfer completed successfully! Thank you for being a generous community member.' 
            });

            return { success: true, embed };

        } catch (error) {
            console.error('Error in transfer:', error);
            return { 
                success: false, 
                error: error.message || 'An error occurred during the transfer.'
            };
        }
    },

    isUnicodeEmoji(str) {
        if (!str || str.length === 0) return false;
        if (str.startsWith(':') || str.startsWith('<:')) return false;
        const emojiRegex = /^[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
        return emojiRegex.test(str);
    },

    // Main interaction handler
    async handleInteraction(interaction) {
        if (!interaction.customId.startsWith('coll_')) return;

        try {
            // Handle give confirmation buttons first (these need immediate response)
            if (interaction.customId.startsWith('coll_give_confirm_')) {
                await interaction.deferUpdate();
                
                const parts = interaction.customId.split('_');
                const givingUsername = parts[3];
                const receivingUsername = parts[4];
                const itemId = parts[5];
                const quantity = parseInt(parts[6]);

                const user = await User.findOne({ discordId: interaction.user.id });
                if (!user || user.raUsername.toLowerCase() !== givingUsername.toLowerCase()) {
                    await interaction.editReply({
                        content: '❌ You can only confirm your own transfers.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                const result = await this.performGiveTransfer(givingUsername, receivingUsername, itemId, quantity);

                if (result.success) {
                    await interaction.editReply({
                        embeds: [result.embed],
                        components: []
                    });
                } else {
                    await interaction.editReply({
                        content: `❌ Transfer failed: ${result.error}`,
                        embeds: [],
                        components: []
                    });
                }
                return;
            }

            if (interaction.customId === 'coll_give_cancel') {
                await interaction.deferUpdate();
                await interaction.editReply({
                    content: '❌ Transfer cancelled.',
                    embeds: [],
                    components: []
                });
                return;
            }

            // Handle give button (shows modal - DON'T defer this)
            if (interaction.customId.startsWith('coll_give_') && !interaction.customId.includes('_confirm_') && !interaction.customId.includes('_cancel')) {
                const parts = interaction.customId.split('_');
                const username = parts[2];

                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
                });

                if (!user || user.discordId !== interaction.user.id) {
                    await interaction.reply({ 
                        content: '❌ You can only give items from your own collection.', 
                        ephemeral: true 
                    });
                    return;
                }

                // Show modal immediately without deferring
                await this.showGiveItemModal(interaction, user);
                return;
            }

            // Handle combinations button
            if (interaction.customId.startsWith('coll_combinations_')) {
                await interaction.deferUpdate();
                
                const parts = interaction.customId.split('_');
                const username = parts[2];

                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
                });

                if (!user || user.discordId !== interaction.user.id) {
                    return interaction.followUp({ 
                        content: '❌ You can only view your own combinations.', 
                        ephemeral: true 
                    });
                }

                const possibleCombinations = await combinationService.checkPossibleCombinations(user);
                if (possibleCombinations.length > 0) {
                    await combinationService.showCombinationAlert(interaction, user, possibleCombinations);
                } else {
                    await interaction.editReply({
                        content: '❌ No combinations currently available.',
                        embeds: [],
                        components: []
                    });
                }
                return;
            }

            // For all other interactions, defer the update
            try {
                await interaction.deferUpdate();
            } catch (error) {
                console.error('Error deferring update:', error);
                return;
            }

            const parts = interaction.customId.split('_');
            if (parts.length < 3) return;

            const action = parts[1];
            const username = parts[2];

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
                        await this.showItemsPage(interaction, user, selectedSeries, 0);
                    }
                    break;

                case 'prev':
                    if (parts.length >= 4) {
                        const prevFilter = parts[3];
                        const currentPage = parseInt(interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/)?.[1] || '1') - 1;
                        await this.showItemsPage(interaction, user, prevFilter, Math.max(0, currentPage - 1));
                    }
                    break;

                case 'next':
                    if (parts.length >= 4) {
                        const nextFilter = parts[3];
                        const nextCurrentPage = parseInt(interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/)?.[1] || '1') - 1;
                        await this.showItemsPage(interaction, user, nextFilter, nextCurrentPage + 1);
                    }
                    break;

                case 'inspect':
                    if (interaction.isStringSelectMenu()) {
                        const itemId = interaction.values[0];
                        const returnFilter = parts[3] || 'all';
                        const returnPage = parseInt(parts[4]) || 0;
                        await this.showItemDetail(interaction, user, itemId, returnFilter, returnPage);
                    } else {
                        const filter = parts[3] || 'all';
                        const page = parseInt(parts[4]) || 0;
                        await this.showInspectMenu(interaction, user, filter, page);
                    }
                    break;

                case 'stats':
                    await this.showCollectionStats(interaction, user);
                    break;

                case 'back':
                    if (parts.length >= 5) {
                        const backFilter = parts[3];
                        const backPage = parseInt(parts[4]);
                        await this.showItemsPage(interaction, user, backFilter, backPage);
                    }
                    break;
            }

        } catch (error) {
            console.error('Error handling collection interaction:', error);
            try {
                // Only try to respond if we haven't already responded
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: '❌ An error occurred while processing your request.', 
                        ephemeral: true 
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({ 
                        content: '❌ An error occurred while processing your request.' 
                    });
                } else {
                    await interaction.followUp({ 
                        content: '❌ An error occurred while processing your request.', 
                        ephemeral: true 
                    });
                }
            } catch (followUpError) {
                console.error('Error sending error follow-up:', followUpError);
            }
        }
    },

    // Handle modal submissions
    async handleModalSubmit(interaction) {
        if (interaction.customId.startsWith('coll_give_modal_')) {
            const username = interaction.customId.replace('coll_give_modal_', '');
            await this.handleGiveItemModal(interaction, username);
        }
    }
};
