// src/services/gachaMachine.js - UPDATED with combination alerts instead of auto-combining
import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    AttachmentBuilder
} from 'discord.js';
import { config } from '../config/config.js';
import { User } from '../models/User.js';
import gachaService from './gachaService.js';
import combinationService from './combinationService.js';
import { formatGachaEmoji } from '../config/gachaEmojis.js';
import { COLORS, EMOJIS } from '../utils/FeedUtils.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

            // Check if gacha machine already exists
            const existingMachine = await this.findExistingGachaMachine(channel);
            if (existingMachine) {
                console.log('Gacha machine already exists, using existing message');
                this.machineMessageId = existingMachine.id;
                
                // Update the existing machine to ensure it's current
                await this.updateExistingMachine(existingMachine);
                return;
            }

            // Create the machine embed and buttons
            const { embed, attachment } = this.createMachineEmbed();
            const buttons = this.createMachineButtons();

            // Prepare message options
            const messageOptions = {
                embeds: [embed],
                components: [buttons]
            };

            // Add attachment if image exists
            if (attachment) {
                messageOptions.files = [attachment];
            }

            // Send the machine message
            const message = await channel.send(messageOptions);

            // Pin the message
            try {
                await message.pin();
                console.log('Gacha machine pinned successfully');
            } catch (pinError) {
                console.error('Error pinning gacha machine:', pinError);
            }

            this.machineMessageId = message.id;
            console.log(`Gacha machine created with message ID: ${this.machineMessageId}`);

        } catch (error) {
            console.error('Error creating gacha machine:', error);
        }
    }

    // Find existing gacha machine in channel
    async findExistingGachaMachine(channel) {
        try {
            // Fetch recent messages (last 50)
            const messages = await channel.messages.fetch({ limit: 50 });
            
            // Look for messages with gacha machine embed
            for (const [, message] of messages) {
                if (message.embeds.length > 0) {
                    const embed = message.embeds[0];
                    if (embed.title === '🎰 Gacha Machine' && message.author.bot) {
                        console.log(`Found existing gacha machine: ${message.id}`);
                        return message;
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error searching for existing gacha machine:', error);
            return null;
        }
    }

    // Update existing machine instead of creating new one
    async updateExistingMachine(message) {
        try {
            const { embed, attachment } = this.createMachineEmbed();
            const buttons = this.createMachineButtons();

            const messageOptions = {
                embeds: [embed],
                components: [buttons]
            };

            if (attachment) {
                messageOptions.files = [attachment];
            }

            await message.edit(messageOptions);
            console.log('Updated existing gacha machine');
        } catch (error) {
            console.error('Error updating existing gacha machine:', error);
        }
    }

    createMachineEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('🎰 Gacha Machine')
            .setDescription(
                '**Welcome to the Gacha Machine!** 🎮\n\n' +
                '🎯 **How it works:**\n' +
                '• **Single Pull**: 50 GP for 1 item\n' +
                '• **Multi Pull**: 150 GP for 4 items (25% discount!)\n\n' +
                '🏆 **What you can win:**\n' +
                '• Collectible items organized by series\n' +
                '• Rare trinkets and special items\n' +
                '• Series collections with completion rewards\n\n' +
                '✨ **NEW: Combination System with Confirmation:**\n' +
                '• When you get items that can be combined, you\'ll get an alert\n' +
                '• Choose which combinations to perform (ingredients are consumed)\n' +
                '• Multiple options? Pick which one you want!\n' +
                '• View your collection with `/collection`\n\n' +
                '🎲 **Rarity System:**\n' +
                '⚪ Common • 🟢 Uncommon • 🔵 Rare • 🟣 Epic • 🟡 Legendary • 🌟 Mythic'
            )
            .setColor(COLORS.GOLD)
            .setFooter({ 
                text: 'Pull results will expire after 1 minute • Use /profile to check your GP balance' 
            })
            .setTimestamp();

        // Try to attach the gacha image
        let attachment = null;
        try {
            const imagePath = join(__dirname, '../../assets/gacha.png');
            if (existsSync(imagePath)) {
                attachment = new AttachmentBuilder(imagePath, { name: 'gacha.png' });
                embed.setImage('attachment://gacha.png');
                console.log('Gacha image attached successfully');
            } else {
                console.warn('Gacha image not found at:', imagePath);
            }
        } catch (imageError) {
            console.warn('Could not load gacha image:', imageError.message);
        }

        return { embed, attachment };
    }

    createMachineButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('gacha_single_pull')
                    .setLabel('Single Pull (50 GP)')
                    .setEmoji('🎯')
                    .setStyle(ButtonStyle.Primary),
                
                new ButtonBuilder()
                    .setCustomId('gacha_multi_pull')
                    .setLabel('Multi Pull (150 GP)')
                    .setEmoji('🎆')
                    .setStyle(ButtonStyle.Success),
                
                new ButtonBuilder()
                    .setCustomId('gacha_collection')
                    .setLabel('My Collection')
                    .setEmoji('📦')
                    .setStyle(ButtonStyle.Secondary)
            );
    }

    async handlePull(interaction, user, pullType) {
        try {
            const result = await gachaService.performPull(user, pullType);
            
            if (pullType === 'multi') {
                // For multi-pull, send 4 separate embeds then check for combinations
                await this.handleMultiPullEmbeds(interaction, result, user);
            } else {
                // Single pull - one embed then check for combinations
                const embed = await this.createSinglePullEmbed(result.results[0], user, result);
                
                await interaction.editReply({
                    embeds: [embed],
                    ephemeral: true
                });

                // Check for combinations after single pull
                if (result.possibleCombinations && result.possibleCombinations.length > 0) {
                    // Small delay before showing combination alert
                    setTimeout(async () => {
                        await combinationService.showCombinationAlert(interaction, user, result.possibleCombinations);
                    }, 1500);
                }
            }

        } catch (error) {
            console.error('Error handling pull:', error);
            await interaction.editReply({
                content: `❌ ${error.message}`,
                ephemeral: true
            });
        }
    }

    async handleMultiPullEmbeds(interaction, result, user) {
        const { results, completions, possibleCombinations, newBalance, cost } = result;
        
        // Send initial summary message
        const summaryEmbed = new EmbedBuilder()
            .setTitle('🎆 Multi Pull Results')
            .setDescription(
                `**Cost:** ${cost} GP → **New Balance:** ${newBalance.toLocaleString()} GP\n\n` +
                `**Pulls:** ${results.length} items\n` +
                `Individual results coming up...`
            )
            .setColor(COLORS.SUCCESS)
            .setFooter({ text: 'Individual pull results will follow this message' })
            .setTimestamp();

        await interaction.editReply({
            embeds: [summaryEmbed],
            ephemeral: true
        });

        // Send individual pull embeds with slight delays
        for (let i = 0; i < results.length; i++) {
            const item = results[i];
            
            // Create a beautiful individual item embed
            const itemEmbed = await this.createSinglePullEmbed(item, user, result, i + 1);
            
            // Send as follow-up
            await interaction.followUp({
                embeds: [itemEmbed],
                ephemeral: true
            });
            
            // Small delay between embeds to prevent spam
            if (i < results.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        }

        // Send completions if any
        if (completions.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const bonusEmbed = await this.createBonusEmbed(completions, []);
            await interaction.followUp({
                embeds: [bonusEmbed],
                ephemeral: true
            });
        }

        // UPDATED: Show combination alerts instead of auto-combination results
        if (possibleCombinations && possibleCombinations.length > 0) {
            // Delay before showing combination alert to let user see their pulls
            setTimeout(async () => {
                await combinationService.showCombinationAlert(interaction, user, possibleCombinations);
            }, 2000);
        }
    }

    // Clean design without competing emojis
    async createSinglePullEmbed(item, user, result, pullNumber = null) {
        const rarityColor = gachaService.getRarityColor(item.rarity);
        const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
        const rarityName = gachaService.getRarityDisplayName(item.rarity);
        const itemEmoji = formatGachaEmoji(item.emojiId, item.emojiName);
        
        const title = pullNumber ? 
            `Pull ${pullNumber} - ${item.itemName}` : 
            `Single Pull - ${item.itemName}`;
            
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(rarityColor)
            .setTimestamp();

        // Main item display - BIG and prominent
        let description = `# ${itemEmoji} **${item.itemName}**\n\n`;
        
        // Rarity with emoji
        description += `${rarityEmoji} **${rarityName}**`;
        
        // NEW flag
        if (item.isNew) {
            description += ` ✨ **NEW!**`;
        }
        
        if (item.maxStack > 1) {
            description += `\n**Quantity:** ${item.quantity}/${item.maxStack}`;
        }
        
        if (item.seriesId) {
            description += `\n**Series:** ${item.seriesId.charAt(0).toUpperCase() + item.seriesId.slice(1)}`;
        }

        embed.setDescription(description);

        // Add item description
        if (item.description) {
            embed.addFields({
                name: 'Description',
                value: `*${item.description}*`,
                inline: false
            });
        }

        // Add flavor text
        if (item.flavorText) {
            embed.addFields({
                name: 'Flavor Text',
                value: `*"${item.flavorText}"*`,
                inline: false
            });
        }

        // Add stacking info
        if (item.wasStacked) {
            embed.addFields({
                name: '📚 Stacked',
                value: `Added to existing stack`,
                inline: true
            });
        }

        if (item.atMaxStack) {
            embed.addFields({
                name: '⚠️ Max Stack',
                value: `Cannot stack more`,
                inline: true
            });
        }

        // Add balance info in footer
        embed.setFooter({ 
            text: `GP Balance: ${result.newBalance.toLocaleString()}` 
        });

        return embed;
    }

    async createBonusEmbed(completions, autoCombinations) {
        const embed = new EmbedBuilder()
            .setTitle('🎉 Bonus Rewards!')
            .setColor(COLORS.GOLD)
            .setTimestamp();

        let description = '';

        // Add series completions
        if (completions && completions.length > 0) {
            description += '🏆 **Series Completed!**\n\n';
            for (const completion of completions) {
                const rewardEmoji = formatGachaEmoji(
                    completion.rewardItem.emojiId, 
                    completion.rewardItem.emojiName
                );
                description += `**${completion.seriesName}** Complete!\n`;
                description += `${rewardEmoji} Unlocked: **${completion.rewardItem.itemName}**\n\n`;
            }
        }

        // REMOVED: Auto-combination display since we now use confirmations

        embed.setDescription(description);
        embed.setFooter({ text: 'These bonuses have been added to your collection automatically!' });

        return embed;
    }

    scheduleMessageDeletion(message) {
        setTimeout(async () => {
            try {
                await message.delete();
            } catch (deleteError) {
                console.log('Pull result already deleted or inaccessible');
            }
        }, 60000); // 60 seconds
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
                `🌟 Mythic: ${summary.rarityCount.mythic || 0}\n` +
                `🟡 Legendary: ${summary.rarityCount.legendary || 0}\n` +
                `🟣 Epic: ${summary.rarityCount.epic || 0}\n` +
                `🔵 Rare: ${summary.rarityCount.rare || 0}\n` +
                `🟢 Uncommon: ${summary.rarityCount.uncommon || 0}\n` +
                `⚪ Common: ${summary.rarityCount.common || 0}\n\n` +
                '**By Source:**\n' +
                `🎰 Gacha: ${summary.sourceBreakdown.gacha || 0}\n` +
                `⚗️ Combinations: ${summary.sourceBreakdown.combined || 0}\n` +
                `🏆 Series Rewards: ${summary.sourceBreakdown.series_completion || 0}\n` +
                `🎁 Player Gifts: ${summary.sourceBreakdown.player_transfer || 0}`
            )
            .setFooter({ text: 'Use /collection for detailed view with filters and giving interface!' })
            .setTimestamp();

        // Add recent items
        if (summary.recentItems.length > 0) {
            let recentText = '';
            for (const item of summary.recentItems.slice(0, 5)) {
                const emoji = formatGachaEmoji(item.emojiId, item.emojiName);
                const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
                const stackInfo = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
                recentText += `${rarityEmoji} ${emoji} **${item.itemName}**${stackInfo}\n`;
            }
            
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
            const { embed, attachment } = this.createMachineEmbed();
            const buttons = this.createMachineButtons();

            const messageOptions = {
                embeds: [embed],
                components: [buttons]
            };

            if (attachment) {
                messageOptions.files = [attachment];
            }

            await message.edit(messageOptions);

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
