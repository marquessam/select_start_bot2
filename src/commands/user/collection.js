// src/commands/user/collection.js - UPDATED to use trophy case emoji approach
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
import { formatGachaEmoji } from '../../config/gachaEmojis.js'; // NEW: Use centralized emoji formatting
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('View your gacha collection')
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Filter your collection')
                .setRequired(false)
                .addChoices(
                    { name: 'All items', value: 'all' },
                    { name: 'Common', value: 'common' },
                    { name: 'Uncommon', value: 'uncommon' },
                    { name: 'Rare', value: 'rare' },
                    { name: 'Epic', value: 'epic' },
                    { name: 'Legendary', value: 'legendary' },
                    { name: 'Mythic', value: 'mythic' },
                    { name: 'Trinkets', value: 'trinket' },
                    { name: 'Collectibles', value: 'collectible' },
                    { name: 'Series Items', value: 'series' },
                    { name: 'Combined Items', value: 'combined' },
                    { name: 'Stackable (>1)', value: 'stackable' }
                ))
        .addStringOption(option =>
            option.setName('series')
                .setDescription('Filter by specific series')
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

            const filter = interaction.options.getString('filter') || 'all';
            const series = interaction.options.getString('series');
            const sort = interaction.options.getString('sort') || 'recent';

            const { items, summary } = this.processCollection(user.gachaCollection, filter, series, sort);
            const embed = await this.createCollectionEmbed(user, items, summary, filter, series, sort);
            
            // Add combination button
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`collection_combine_${user.raUsername}`)
                        .setLabel('🔧 Combine Items')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`collection_refresh_${user.raUsername}`)
                        .setLabel('🔄 Refresh')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({ 
                embeds: [embed],
                components: [buttons]
            });

        } catch (error) {
            console.error('Error displaying collection:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching your collection.'
            });
        }
    },

    // Handle button interactions for this command
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
                case 'combine':
                    await this.handleCombineButton(interaction, user);
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
                // FIXED: Use centralized emoji formatting like trophy case
                const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName);
                availableText += `${resultEmoji} **${combo.resultItem.itemName}** x${combo.result.quantity}\n`;
                
                // Show ingredients briefly
                let ingredientsText = '';
                for (const ing of combo.ingredients) {
                    const item = await GachaItem.findOne({ itemId: ing.itemId });
                    // FIXED: Use centralized emoji formatting like trophy case
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

        // Show automatic combinations info
        if (automatic.length > 0) {
            let autoText = '';
            for (const combo of automatic.slice(0, 3)) {
                // FIXED: Use centralized emoji formatting like trophy case
                const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName);
                const status = combo.canMake ? '⚡ Auto-combining' : '⏳ Waiting';
                autoText += `${status} ${resultEmoji} **${combo.resultItem.itemName}**\n`;
            }
            if (automatic.length > 3) {
                autoText += `*...and ${automatic.length - 3} more*\n`;
            }
            embed.addFields({ 
                name: `⚡ Automatic Combinations (${automatic.length})`, 
                value: autoText + '\n*These combine automatically when you have the ingredients*',
                inline: false 
            });
        }

        // Show some missing combinations as hints
        if (unavailable.length > 0) {
            let hintText = '';
            for (const combo of unavailable.slice(0, 3)) {
                // FIXED: Use centralized emoji formatting like trophy case
                const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName);
                hintText += `${resultEmoji} **${combo.resultItem.itemName}** *(need more items)*\n`;
            }
            if (unavailable.length > 3) {
                hintText += `*...and ${unavailable.length - 3} more*\n`;
            }
            embed.addFields({ 
                name: `🔒 Discovered but Missing Items (${unavailable.length})`, 
                value: hintText,
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

        // Add info button
        const infoButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`combine_info_${user.raUsername}`)
                    .setLabel('ℹ️ How Combinations Work')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`combine_stats_${user.raUsername}`)
                    .setLabel('📊 My Combination Stats')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        components.push(infoButton);

        await interaction.editReply({ embeds: [embed], components });
    },

    async handleRefreshButton(interaction, user) {
        // Check for any auto-combinations that might have triggered
        const autoCombinations = await combinationService.checkAutoCombinations(user);
        
        let message = '🔄 Collection refreshed!';
        
        if (autoCombinations.length > 0) {
            message += '\n\n⚡ **Auto-combinations occurred:**\n';
            for (const combo of autoCombinations) {
                // FIXED: Use centralized emoji formatting like trophy case
                const resultEmoji = formatGachaEmoji(combo.resultItem.emojiId, combo.resultItem.emojiName);
                message += `${resultEmoji} ${combo.resultQuantity}x ${combo.resultItem.itemName}\n`;
            }
        }

        await interaction.editReply({ content: message });
    },

    // Handle select menu interactions
    async handleSelectMenuInteraction(interaction) {
        if (!interaction.customId.startsWith('combine_select_')) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            const username = interaction.customId.replace('combine_select_', '');
            const ruleId = interaction.values[0];
            
            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user || user.discordId !== interaction.user.id) {
                return interaction.editReply({
                    content: '❌ You can only manage your own collection.',
                    ephemeral: true
                });
            }

            // Show combination preview and confirmation
            await this.showCombinationPreview(interaction, user, ruleId);

        } catch (error) {
            console.error('Error handling combine select:', error);
            await interaction.editReply({
                content: '❌ An error occurred.',
                ephemeral: true
            });
        }
    },

    async showCombinationPreview(interaction, user, ruleId) {
        const preview = await combinationService.previewCombination(user, ruleId);
        
        if (!preview.success) {
            return interaction.editReply({
                content: `❌ ${preview.error}`
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔍 Combination Preview')
            .setColor(preview.canMake ? COLORS.SUCCESS : COLORS.WARNING)
            .setDescription(`**${preview.rule.ruleId}**`)
            .setTimestamp();

        // Show what will be consumed
        let ingredientsText = '';
        for (const ingredient of preview.rule.ingredients) {
            const item = await GachaItem.findOne({ itemId: ingredient.itemId });
            const userItem = user.gachaCollection?.find(i => i.itemId === ingredient.itemId);
            const have = userItem ? (userItem.quantity || 1) : 0;
            // FIXED: Use centralized emoji formatting like trophy case
            const emoji = item ? formatGachaEmoji(item.emojiId, item.emojiName) : '❓';
            
            ingredientsText += `${emoji} **${ingredient.quantity}x** ${item?.itemName || ingredient.itemId} `;
            ingredientsText += `*(have: ${have})*\n`;
        }
        embed.addFields({ name: '📦 Will Consume', value: ingredientsText });

        // Show what will be created
        // FIXED: Use centralized emoji formatting like trophy case
        const resultEmoji = formatGachaEmoji(preview.resultItem.emojiId, preview.resultItem.emojiName);
        embed.addFields({ 
            name: '🎁 Will Create', 
            value: `${resultEmoji} **${preview.rule.result.quantity}x ${preview.resultItem.itemName}**\n*${preview.resultItem.description}*`
        });

        if (preview.resultItem.flavorText) {
            embed.addFields({ 
                name: 'About This Item', 
                value: `*${preview.resultItem.flavorText}*` 
            });
        }

        const components = [];
        
        if (preview.canMake) {
            const confirmButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`combine_confirm_${user.raUsername}_${ruleId}`)
                        .setLabel('✅ Combine Items')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`combine_cancel_${user.raUsername}`)
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );
            components.push(confirmButton);
        } else {
            embed.setDescription(`❌ **Cannot combine:** ${preview.missing.map(m => `Need ${m.shortage} more ${m.itemId}`).join(', ')}`);
        }

        await interaction.editReply({ embeds: [embed], components });
    },

    // Handle combination confirmation
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
            // FIXED: Use centralized emoji formatting like trophy case
            const resultEmoji = formatGachaEmoji(result.resultItem.emojiId, result.resultItem.emojiName);
            
            let message = `🎉 **Combination Successful!**\n\n`;
            message += `${resultEmoji} **Created: ${result.resultQuantity}x ${result.resultItem.itemName}**\n\n`;
            
            message += `📦 **Consumed:**\n`;
            for (const ingredient of result.ingredients) {
                const item = await GachaItem.findOne({ itemId: ingredient.itemId });
                // FIXED: Use centralized emoji formatting like trophy case
                const emoji = item ? formatGachaEmoji(item.emojiId, item.emojiName) : '❓';
                message += `${emoji} ${ingredient.quantity}x ${item?.itemName || ingredient.itemId}\n`;
            }

            await interaction.editReply({ content: message });

            // Check for auto-combinations triggered by this result
            const autoCombinations = await combinationService.checkAutoCombinations(user);
            
            if (autoCombinations.length > 0) {
                let autoMessage = '\n⚡ **Bonus auto-combinations triggered:**\n';
                for (const combo of autoCombinations) {
                    // FIXED: Use centralized emoji formatting like trophy case
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
    },

    // Existing methods from the original collection command
    processCollection(collection, filter, series, sort) {
        let filteredItems = [...collection];

        // Apply filters
        if (filter && filter !== 'all') {
            if (filter === 'stackable') {
                filteredItems = filteredItems.filter(item => (item.quantity || 1) > 1);
            } else {
                filteredItems = filteredItems.filter(item => {
                    return item.rarity === filter || item.itemType === filter;
                });
            }
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
                const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
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
            combinationStats: combinationService.getCombinationStats({ gachaCollection: collection })
        };

        return { items: filteredItems, summary };
    },

    getRarityBreakdown(items) {
        const breakdown = {
            mythic: 0,
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

    async createCollectionEmbed(user, items, summary, filter, series, sort, page = 0) {
        const itemsPerPage = 15;
        const startIndex = page * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, items.length);
        const pageItems = items.slice(startIndex, endIndex);
        
        const embed = new EmbedBuilder()
            .setTitle(`📦 ${user.raUsername}'s Collection`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        // Enhanced description with combination stats
        let description = `**Total Items:** ${summary.totalQuantity} (${summary.total} unique)\n`;
        
        if (filter && filter !== 'all' || series) {
            description += `**Filtered:** ${summary.filtered} items\n`;
        }

        description += `**Sort:** ${sort}\n`;
        description += `**Combinations Made:** ${summary.combinationStats.totalCombined}\n\n`;

        // Add rarity breakdown
        description += '**By Rarity:**\n';
        Object.entries(summary.rarityBreakdown).forEach(([rarity, count]) => {
            if (count > 0) {
                const emoji = gachaService.getRarityEmoji(rarity);
                description += `${emoji} ${rarity}: ${count}\n`;
            }
        });

        embed.setDescription(description);

        // Add items field
        if (pageItems.length > 0) {
            let itemsText = '';
            
            for (const item of pageItems) {
                // FIXED: Use centralized emoji formatting like trophy case
                const emoji = formatGachaEmoji(item.emojiId, item.emojiName);
                const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
                const quantity = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
                const seriesTag = item.seriesId ? ` [${item.seriesId}]` : '';
                const sourceTag = item.source === 'combined' ? ' 🔧' : '';
                
                itemsText += `${rarityEmoji} ${emoji} **${item.itemName}**${quantity}${seriesTag}${sourceTag}\n`;
            }

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

        embed.setFooter({ 
            text: '🔧 = Made through combination • Use the Combine button to create new items!' 
        });

        return embed;
    }
};
