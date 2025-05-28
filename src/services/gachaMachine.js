// src/services/gachaMachine.js
import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { config } from '../config/config.js';
import { User } from '../models/User.js';
import gachaService from './gachaService.js';
import { COLORS, EMOJIS } from '../utils/FeedUtils.js';

class GachaMachine {
    constructor() {
        this.client = null;
        this.channelId = '1377092881885696022'; // Gacha channel
        this.machineMessageId = null;
        this.isRunning = false;
    }

    setClient(client) {
        this.client = client;
        console.log('Gacha Machine client configured');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for Gacha Machine');
            return;
        }

        try {
            console.log('Starting Gacha Machine...');
            await this.createMachine();
            this.isRunning = true;
            console.log('Gacha Machine started successfully');
        } catch (error) {
            console.error('Error starting Gacha Machine:', error);
        }
    }

    async createMachine() {
        try {
            const channel = await this.getChannel();
            if (!channel) return;

            // Create the machine embed
            const embed = this.createMachineEmbed();
            const buttons = this.createMachineButtons();

            // Send the machine message
            const message = await channel.send({
                embeds: [embed],
                components: [buttons]
            });

            // Pin the message
            try {
                await message.pin();
                console.log('Gacha machine pinned successfully');
            } catch (pinError) {
                console.error('Error pinning gacha machine:', pinError);
            }

            this.machineMessageId = message.id;

            // Set up button interaction handling
            this.setupButtonHandling();

        } catch (error) {
            console.error('Error creating gacha machine:', error);
        }
    }

    createMachineEmbed() {
        return new EmbedBuilder()
            .setTitle('🎰 Gacha Machine')
            .setDescription(
                '**Welcome to the Gacha Machine!** 🎮\n\n' +
                '🎯 **How it works:**\n' +
                '• **Single Pull**: 10 GP for 1 item\n' +
                '• **Multi Pull**: 100 GP for 11 items (10% discount!)\n\n' +
                '🏆 **What you can win:**\n' +
                '• Game trophies from monthly challenges\n' +
                '• Collectible series (Triforce pieces, Mario power-ups, etc.)\n' +
                '• Rare trinkets and special items\n\n' +
                '✨ **Collection System:**\n' +
                '• Collect series items to unlock special rewards\n' +
                '• Stack duplicate items (where applicable)\n' +
                '• View your collection with `/collection`\n\n' +
                '🎲 **Rarity System:**\n' +
                '⚪ Common • 🟢 Uncommon • 🔵 Rare • 🟣 Epic • 🟡 Legendary'
            )
            .setColor(COLORS.GOLD)
            .setFooter({ 
                text: 'Pull results will expire after 1 minute • Use /profile to check your GP balance' 
            })
            .setTimestamp();
    }

    createMachineButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha_single_pull')
                    .setLabel('Single Pull (10 GP)')
                    .setEmoji('🎯')
                    .setStyle(ButtonStyle.Primary),
                
                new ButtonBuilder()
                    .setCustomId('gacha_multi_pull')
                    .setLabel('Multi Pull (100 GP)')
                    .setEmoji('🎆')
                    .setStyle(ButtonStyle.Success),
                
                new ButtonBuilder()
                    .setCustomId('gacha_collection')
                    .setLabel('My Collection')
                    .setEmoji('📦')
                    .setStyle(ButtonStyle.Secondary)
            );
    }

    setupButtonHandling() {
        if (!this.client) return;

        // Handle button interactions
        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;
            if (!interaction.customId.startsWith('gacha_')) return;

            await interaction.deferReply({ ephemeral: true });

            try {
                const user = await User.findOne({ discordId: interaction.user.id });
                if (!user) {
                    return interaction.editReply({
                        content: '❌ You are not registered! Please ask an admin to register you first.',
                        ephemeral: true
                    });
                }

                switch (interaction.customId) {
                    case 'gacha_single_pull':
                        await this.handlePull(interaction, user, 'single');
                        break;
                    case 'gacha_multi_pull':
                        await this.handlePull(interaction, user, 'multi');
                        break;
                    case 'gacha_collection':
                        await this.handleCollection(interaction, user);
                        break;
                }
            } catch (error) {
                console.error('Error handling gacha button:', error);
                await interaction.editReply({
                    content: '❌ An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        });
    }

    async handlePull(interaction, user, pullType) {
        try {
            const result = await gachaService.performPull(user, pullType);
            const embed = this.createPullResultEmbed(result, user, pullType);
            
            const reply = await interaction.editReply({
                embeds: [embed],
                ephemeral: true
            });

            // Schedule deletion after 1 minute
            setTimeout(async () => {
                try {
                    await reply.delete();
                } catch (deleteError) {
                    console.log('Pull result already deleted or inaccessible');
                }
            }, 60000); // 60 seconds

        } catch (error) {
            console.error('Error handling pull:', error);
            await interaction.editReply({
                content: `❌ ${error.message}`,
                ephemeral: true
            });
        }
    }

    createPullResultEmbed(result, user, pullType) {
        const { results, completions, newBalance, cost } = result;
        
        const embed = new EmbedBuilder()
            .setTitle(`🎰 ${pullType === 'single' ? 'Single' : 'Multi'} Pull Results`)
            .setColor(COLORS.SUCCESS)
            .setFooter({ 
                text: `This message will be deleted in 1 minute • New GP Balance: ${newBalance.toLocaleString()}` 
            })
            .setTimestamp();

        // Add results field
        let resultsText = '';
        const rarityGroups = {
            legendary: [],
            epic: [],
            rare: [],
            uncommon: [],
            common: []
        };

        // Group results by rarity
        results.forEach(item => {
            if (rarityGroups[item.rarity]) {
                rarityGroups[item.rarity].push(item);
            }
        });

        // Format results by rarity (highest first)
        Object.entries(rarityGroups).forEach(([rarity, items]) => {
            if (items.length === 0) return;

            items.forEach(item => {
                const emoji = gachaService.formatEmoji(item.emojiId, item.emojiName);
                const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
                const newFlag = item.isNew ? ' ✨**NEW!**' : '';
                const stackInfo = item.maxStack > 1 ? ` (${item.quantity}/${item.maxStack})` : '';
                
                resultsText += `${rarityEmoji} ${emoji} **${item.itemName}**${stackInfo}${newFlag}\n`;
                
                if (item.flavorText) {
                    resultsText += `*${item.flavorText}*\n`;
                }
                resultsText += '\n';
            });
        });

        embed.addFields({ 
            name: `Items Received (${results.length})`, 
            value: resultsText || 'No items received'
        });

        // Add completions if any
        if (completions.length > 0) {
            let completionsText = '';
            completions.forEach(completion => {
                const rewardEmoji = gachaService.formatEmoji(
                    completion.rewardItem.emojiId, 
                    completion.rewardItem.emojiName
                );
                completionsText += `🎉 **${completion.seriesName} Complete!**\n`;
                completionsText += `${rewardEmoji} Unlocked: **${completion.rewardItem.itemName}**\n\n`;
            });
            
            embed.addFields({ 
                name: '🏆 Series Completed!', 
                value: completionsText
            });
        }

        // Add cost info
        embed.setDescription(`**Cost:** ${cost} GP → **New Balance:** ${newBalance.toLocaleString()} GP`);

        return embed;
    }

    async handleCollection(interaction, user) {
        const summary = gachaService.getUserCollectionSummary(user);
        
        if (summary.totalItems === 0) {
            return interaction.editReply({
                content: '📦 Your collection is empty! Try pulling from the gacha machine to start collecting.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`📦 ${user.raUsername}'s Collection`)
            .setColor(COLORS.INFO)
            .setDescription(
                `**Total Items:** ${summary.totalItems} (${summary.uniqueItems} unique)\n\n` +
                '**By Rarity:**\n' +
                `🟡 Legendary: ${summary.rarityCount.legendary || 0}\n` +
                `🟣 Epic: ${summary.rarityCount.epic || 0}\n` +
                `🔵 Rare: ${summary.rarityCount.rare || 0}\n` +
                `🟢 Uncommon: ${summary.rarityCount.uncommon || 0}\n` +
                `⚪ Common: ${summary.rarityCount.common || 0}`
            )
            .setFooter({ text: 'Use /collection for detailed view with filters' })
            .setTimestamp();

        // Add recent items
        if (summary.recentItems.length > 0) {
            let recentText = '';
            summary.recentItems.slice(0, 5).forEach(item => {
                const emoji = gachaService.formatEmoji(item.emojiId, item.emojiName);
                const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
                const stackInfo = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
                recentText += `${rarityEmoji} ${emoji} **${item.itemName}**${stackInfo}\n`;
            });
            
            embed.addFields({ 
                name: 'Recent Items', 
                value: recentText
            });
        }

        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
    }

    async getChannel() {
        if (!this.client) return null;

        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error(`Guild not found: ${config.discord.guildId}`);
                return null;
            }

            const channel = await guild.channels.fetch(this.channelId);
            if (!channel) {
                console.error(`Gacha channel not found: ${this.channelId}`);
                return null;
            }

            return channel;
        } catch (error) {
            console.error('Error getting gacha channel:', error);
            return null;
        }
    }

    async updateMachine() {
        if (!this.machineMessageId) return;

        try {
            const channel = await this.getChannel();
            if (!channel) return;

            const message = await channel.messages.fetch(this.machineMessageId);
            const embed = this.createMachineEmbed();
            const buttons = this.createMachineButtons();

            await message.edit({
                embeds: [embed],
                components: [buttons]
            });

        } catch (error) {
            console.error('Error updating gacha machine:', error);
            // If message is deleted, recreate it
            if (error.message.includes('Unknown Message')) {
                await this.createMachine();
            }
        }
    }

    stop() {
        this.isRunning = false;
        console.log('Gacha Machine stopped');
    }
}

// Export singleton
export default new GachaMachine();
