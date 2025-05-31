// src/commands/admin/debug-gacha.js - Debug gacha emoji issues
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { GachaItem } from '../../models/GachaItem.js';
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('debug-gacha')
        .setDescription('Debug gacha emoji and collection issues')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('RetroAchievements username to debug')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of debug to run')
                .setRequired(false)
                .addChoices(
                    { name: 'Collection Emojis', value: 'emojis' },
                    { name: 'Gacha Items Database', value: 'items' },
                    { name: 'User Summary', value: 'summary' },
                    { name: 'All', value: 'all' }
                )),

    async execute(interaction) {
        // Check if user is admin
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({
                content: '❌ You need administrator permissions to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const username = interaction.options.getString('username') || 'marquessam';
            const debugType = interaction.options.getString('type') || 'emojis';

            switch (debugType) {
                case 'emojis':
                    await this.debugUserEmojis(interaction, username);
                    break;
                case 'items':
                    await this.debugGachaItems(interaction);
                    break;
                case 'summary':
                    await this.debugUserSummary(interaction, username);
                    break;
                case 'all':
                    await this.debugAll(interaction, username);
                    break;
                default:
                    await interaction.editReply('Invalid debug type.');
            }

        } catch (error) {
            console.error('Error in debug command:', error);
            await interaction.editReply({
                content: `❌ Debug failed: ${error.message}`
            });
        }
    },

    async debugUserEmojis(interaction, username) {
        const user = await User.findOne({ 
            raUsername: { $regex: new RegExp(`^${username}$`, 'i') },
            gachaCollection: { $exists: true, $ne: [] }
        });

        if (!user) {
            return interaction.editReply({
                content: `❌ User "${username}" not found or has no gacha collection.`
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔍 Emoji Debug: ${user.raUsername}`)
            .setColor(COLORS.INFO)
            .setDescription(`Collection size: ${user.gachaCollection.length} items`)
            .setTimestamp();

        let debugText = '';
        let itemsWithIssues = 0;
        let itemsWorking = 0;

        user.gachaCollection.forEach((item, index) => {
            const hasEmojiId = Boolean(item.emojiId);
            const hasEmojiName = Boolean(item.emojiName);
            const formattedEmoji = user.formatGachaItemEmoji(item);
            
            let status = '';
            if (hasEmojiId && hasEmojiName) {
                status = '✅';
                itemsWorking++;
            } else if (hasEmojiName && !hasEmojiId) {
                status = '⚠️';
                itemsWithIssues++;
            } else {
                status = '❌';
                itemsWithIssues++;
            }

            debugText += `${status} **${item.itemName}**\n`;
            debugText += `   ID: \`${item.emojiId || 'NULL'}\`\n`;
            debugText += `   Name: \`${item.emojiName || 'NULL'}\`\n`;
            debugText += `   Formatted: ${formattedEmoji}\n`;
            
            if (hasEmojiId && hasEmojiName) {
                debugText += `   Expected: <:${item.emojiName}:${item.emojiId}>\n`;
            }
            debugText += '\n';

            // Limit to 5 items to avoid hitting Discord's character limit
            if (index >= 4) {
                debugText += `*...and ${user.gachaCollection.length - 5} more items*\n`;
                return false; // Break out of forEach
            }
        });

        embed.addFields({ 
            name: `Items (Showing first 5)`, 
            value: debugText || 'No items to debug' 
        });

        embed.addFields({
            name: 'Summary',
            value: `✅ Working: ${itemsWorking}\n⚠️ Issues: ${itemsWithIssues}\n📊 Total: ${user.gachaCollection.length}`
        });

        // Test the formatting method
        if (user.gachaCollection.length > 0) {
            const testItem = user.gachaCollection[0];
            embed.addFields({
                name: 'Method Test',
                value: `**Raw Data:**\n\`\`\`json\n${JSON.stringify({
                    itemId: testItem.itemId,
                    emojiId: testItem.emojiId,
                    emojiName: testItem.emojiName
                }, null, 2)}\`\`\``
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async debugGachaItems(interaction) {
        const gachaItems = await GachaItem.find({ isActive: true }).limit(10);

        if (gachaItems.length === 0) {
            return interaction.editReply({
                content: '❌ No gacha items found in database.'
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎰 Gacha Items Database Debug')
            .setColor(COLORS.INFO)
            .setDescription(`Found ${gachaItems.length} items (showing first 10)`)
            .setTimestamp();

        let itemsText = '';
        let itemsWithEmojis = 0;
        let itemsWithoutEmojis = 0;

        gachaItems.forEach(item => {
            const hasEmojiId = Boolean(item.emojiId);
            const hasEmojiName = Boolean(item.emojiName);
            
            let status = '';
            if (hasEmojiId && hasEmojiName) {
                status = '✅';
                itemsWithEmojis++;
            } else if (hasEmojiName) {
                status = '⚠️';
                itemsWithEmojis++;
            } else {
                status = '❌';
                itemsWithoutEmojis++;
            }

            itemsText += `${status} **${item.itemName}** (${item.itemId})\n`;
            itemsText += `   Drop Rate: ${item.dropRate}%\n`;
            itemsText += `   Emoji ID: \`${item.emojiId || 'NULL'}\`\n`;
            itemsText += `   Emoji Name: \`${item.emojiName || 'NULL'}\`\n`;
            
            if (hasEmojiId && hasEmojiName) {
                itemsText += `   Test: <:${item.emojiName}:${item.emojiId}>\n`;
            }
            itemsText += '\n';
        });

        embed.addFields({ 
            name: 'Gacha Items', 
            value: itemsText 
        });

        embed.addFields({
            name: 'Database Summary',
            value: `✅ With Emojis: ${itemsWithEmojis}\n❌ Missing Emojis: ${itemsWithoutEmojis}\n📊 Total Active: ${gachaItems.length}`
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async debugUserSummary(interaction, username) {
        const user = await User.findOne({ 
            raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
        });

        if (!user) {
            return interaction.editReply({
                content: `❌ User "${username}" not found.`
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`👤 User Summary: ${user.raUsername}`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        // Basic info
        embed.addFields({
            name: 'Basic Info',
            value: `**Discord ID:** ${user.discordId}\n**RA Username:** ${user.raUsername}\n**GP Balance:** ${user.gpBalance || 0}`
        });

        // Collection info
        if (user.gachaCollection && user.gachaCollection.length > 0) {
            const rarityCount = {};
            const sourceCount = {};
            let totalItems = 0;

            user.gachaCollection.forEach(item => {
                totalItems += item.quantity || 1;
                
                // Count by rarity
                if (rarityCount[item.rarity]) {
                    rarityCount[item.rarity]++;
                } else {
                    rarityCount[item.rarity] = 1;
                }

                // Count by source
                const source = item.source || 'unknown';
                if (sourceCount[source]) {
                    sourceCount[source]++;
                } else {
                    sourceCount[source] = 1;
                }
            });

            embed.addFields({
                name: 'Collection',
                value: `**Total Items:** ${totalItems}\n**Unique Items:** ${user.gachaCollection.length}\n**Has formatGachaItemEmoji:** ${typeof user.formatGachaItemEmoji === 'function' ? '✅' : '❌'}`
            });

            // Rarity breakdown
            const rarityText = Object.entries(rarityCount)
                .map(([rarity, count]) => `${rarity}: ${count}`)
                .join('\n');
            
            embed.addFields({
                name: 'By Rarity',
                value: rarityText || 'None',
                inline: true
            });

            // Source breakdown
            const sourceText = Object.entries(sourceCount)
                .map(([source, count]) => `${source}: ${count}`)
                .join('\n');
            
            embed.addFields({
                name: 'By Source',
                value: sourceText || 'None',
                inline: true
            });

        } else {
            embed.addFields({
                name: 'Collection',
                value: '❌ No gacha collection found'
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async debugAll(interaction, username) {
        // Send initial message
        await interaction.editReply({
            content: '🔍 Running comprehensive debug... This may take a moment.'
        });

        try {
            // Run all debug types
            await this.debugUserEmojis(interaction, username);
            
            await interaction.followUp({
                content: '**🎰 Gacha Items Database:**',
                ephemeral: true
            });
            
            // Create a new mock interaction for followUp
            const followUpInteraction = {
                ...interaction,
                editReply: async (content) => {
                    await interaction.followUp({
                        ...content,
                        ephemeral: true
                    });
                }
            };
            
            await this.debugGachaItems(followUpInteraction);
            
            await interaction.followUp({
                content: '**👤 User Summary:**',
                ephemeral: true
            });
            
            await this.debugUserSummary(followUpInteraction, username);

            await interaction.followUp({
                content: '✅ **Comprehensive debug completed!**',
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in comprehensive debug:', error);
            await interaction.followUp({
                content: `❌ Error during comprehensive debug: ${error.message}`,
                ephemeral: true
            });
        }
    }
};
