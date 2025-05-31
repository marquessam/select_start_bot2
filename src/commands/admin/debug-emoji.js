// src/commands/admin/debug-emoji.js - Debug emoji issues
import { 
    SlashCommandBuilder, 
    EmbedBuilder 
} from 'discord.js';
import { GachaItem } from '../../models/GachaItem.js';
import { User } from '../../models/User.js';
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('debug-emoji')
        .setDescription('Debug emoji issues in gacha system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('item')
                .setDescription('Debug a specific gacha item\'s emoji')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to debug')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('user-collection')
                .setDescription('Debug a user\'s collection emoji')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Username to debug')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Specific item ID (optional)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test-emoji')
                .setDescription('Test if bot can access an emoji')
                .addStringOption(option =>
                    option.setName('emoji-input')
                        .setDescription('Paste emoji like <:name:id>')
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
                case 'item':
                    await this.debugItem(interaction);
                    break;
                case 'user-collection':
                    await this.debugUserCollection(interaction);
                    break;
                case 'test-emoji':
                    await this.testEmoji(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error in debug-emoji command:', error);
            await interaction.editReply({
                content: `❌ Error: ${error.message}`
            });
        }
    },

    async debugItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        
        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            throw new Error(`Item "${itemId}" not found.`);
        }

        const embed = new EmbedBuilder()
            .setTitle('🔍 Gacha Item Emoji Debug')
            .setColor(COLORS.INFO)
            .addFields(
                { name: 'Item ID', value: item.itemId, inline: true },
                { name: 'Item Name', value: item.itemName, inline: true },
                { name: 'Rarity', value: item.rarity, inline: true },
                { name: 'Emoji ID', value: item.emojiId || 'null', inline: true },
                { name: 'Emoji Name', value: item.emojiName || 'null', inline: true },
                { name: 'Drop Rate', value: item.dropRate.toString(), inline: true }
            );

        // Test emoji formatting
        let emojiTest = '';
        if (item.emojiId && item.emojiName) {
            const formatted = `<:${item.emojiName}:${item.emojiId}>`;
            emojiTest += `**Formatted:** ${formatted}\n`;
            emojiTest += `**Raw Format:** \`${formatted}\`\n`;
        } else if (item.emojiName) {
            emojiTest += `**Emoji Name Only:** ${item.emojiName}\n`;
        } else {
            emojiTest += `**No Emoji Data**\n`;
        }

        // Test if bot can access the emoji
        if (item.emojiId) {
            try {
                const emoji = await interaction.client.emojis.fetch(item.emojiId);
                emojiTest += `**Bot Access:** ✅ Can access emoji "${emoji.name}" from ${emoji.guild.name}\n`;
            } catch (emojiError) {
                emojiTest += `**Bot Access:** ❌ Cannot access emoji: ${emojiError.message}\n`;
            }
        }

        embed.addFields({ name: 'Emoji Test', value: emojiTest });

        await interaction.editReply({ embeds: [embed] });
    },

    async debugUserCollection(interaction) {
        const username = interaction.options.getString('username');
        const itemId = interaction.options.getString('item-id');

        const user = await User.findOne({ 
            raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
        });

        if (!user) {
            throw new Error(`User "${username}" not found.`);
        }

        if (!user.gachaCollection || user.gachaCollection.length === 0) {
            throw new Error(`User "${username}" has no gacha collection.`);
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔍 ${user.raUsername}'s Collection Emoji Debug`)
            .setColor(COLORS.INFO);

        if (itemId) {
            // Debug specific item
            const collectionItem = user.gachaCollection.find(item => item.itemId === itemId);
            if (!collectionItem) {
                throw new Error(`User does not have item "${itemId}".`);
            }

            embed.addFields(
                { name: 'Item ID', value: collectionItem.itemId, inline: true },
                { name: 'Item Name', value: collectionItem.itemName, inline: true },
                { name: 'Quantity', value: collectionItem.quantity?.toString() || '1', inline: true },
                { name: 'Collection Emoji ID', value: collectionItem.emojiId || 'null', inline: true },
                { name: 'Collection Emoji Name', value: collectionItem.emojiName || 'null', inline: true },
                { name: 'Source', value: collectionItem.source || 'unknown', inline: true }
            );

            // Test formatting
            const formattedEmoji = user.formatGachaItemEmoji(collectionItem);
            embed.addFields({ 
                name: 'Formatted Result', 
                value: `**Display:** ${formattedEmoji}\n**Raw:** \`${formattedEmoji}\`` 
            });

            // Compare with source item
            const sourceItem = await GachaItem.findOne({ itemId });
            if (sourceItem) {
                embed.addFields({
                    name: 'Source vs Collection Comparison',
                    value: `**Source Emoji ID:** ${sourceItem.emojiId || 'null'}\n` +
                           `**Collection Emoji ID:** ${collectionItem.emojiId || 'null'}\n` +
                           `**Source Emoji Name:** ${sourceItem.emojiName || 'null'}\n` +
                           `**Collection Emoji Name:** ${collectionItem.emojiName || 'null'}\n` +
                           `**Match:** ${sourceItem.emojiId === collectionItem.emojiId ? '✅' : '❌'}`
                });
            }
        } else {
            // Debug all items (show first 10)
            const items = user.gachaCollection.slice(0, 10);
            let debugText = '';

            for (const item of items) {
                const formatted = user.formatGachaItemEmoji(item);
                debugText += `**${item.itemName}**\n`;
                debugText += `  Display: ${formatted}\n`;
                debugText += `  ID: ${item.emojiId || 'null'}\n`;
                debugText += `  Name: ${item.emojiName || 'null'}\n\n`;
            }

            if (user.gachaCollection.length > 10) {
                debugText += `*...and ${user.gachaCollection.length - 10} more items*`;
            }

            embed.addFields({ name: 'Collection Items', value: debugText || 'No items found' });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async testEmoji(interaction) {
        const emojiInput = interaction.options.getString('emoji-input');
        
        // Parse emoji
        const emojiMatch = emojiInput.match(/<:([^:]+):(\d+)>/);
        if (!emojiMatch) {
            throw new Error('Invalid emoji format. Please paste like: <:name:id>');
        }

        const [fullMatch, emojiName, emojiId] = emojiMatch;

        const embed = new EmbedBuilder()
            .setTitle('🧪 Emoji Access Test')
            .setColor(COLORS.INFO)
            .addFields(
                { name: 'Input', value: emojiInput, inline: true },
                { name: 'Parsed Name', value: emojiName, inline: true },
                { name: 'Parsed ID', value: emojiId, inline: true }
            );

        // Test if bot can access the emoji
        try {
            const emoji = await interaction.client.emojis.fetch(emojiId);
            embed.addFields(
                { name: 'Bot Access', value: '✅ Success', inline: true },
                { name: 'Emoji Guild', value: emoji.guild.name, inline: true },
                { name: 'Test Display', value: `Here it is: ${fullMatch}`, inline: false }
            );
            embed.setColor(COLORS.SUCCESS);
        } catch (emojiError) {
            embed.addFields(
                { name: 'Bot Access', value: '❌ Failed', inline: true },
                { name: 'Error', value: emojiError.message, inline: false },
                { name: 'Possible Causes', value: 
                    '• Emoji is from a server the bot is not in\n' +
                    '• Emoji ID is incorrect\n' +
                    '• Emoji was deleted\n' +
                    '• Bot lacks permissions in that server', inline: false }
            );
            embed.setColor(COLORS.ERROR);
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
