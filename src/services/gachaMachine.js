// src/services/gachaMachine.js - UPDATED with improved store design
import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    AttachmentBuilder,
    StringSelectMenuBuilder
} from 'discord.js';
import { config } from '../config/config.js';
import { User } from '../models/User.js';
import { GachaItem } from '../models/GachaItem.js';
import gachaService from './gachaService.js';
import combinationService from './combinationService.js';
import gpUtils from '../utils/gpUtils.js';
import { formatGachaEmoji } from '../config/gachaEmojis.js';
import { COLORS, EMOJIS } from '../utils/FeedUtils.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// UPDATED: Store pricing reduced by 50%
const STORE_PRICES = {
    common: 50,
    uncommon: 75,
    rare: 150,
    epic: 250
    // legendary and mythic not available in store
};

class GachaMachine {
    constructor() {
        this.client = null;
        this.channelId = '1377092881885696022'; // Gacha channel
        this.machineMessageId = null;
        this.storeMessageId = null;
        this.isRunning = false;
        
        // Store management
        this.currentStoreItems = [];
        this.lastStoreRefresh = null;
        this.storeRefreshHour = 0; // Refresh at midnight UTC
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
            await this.createOrUpdateStore();
            this.isRunning = true;
            
            // Set up daily store refresh
            this.scheduleStoreRefresh();
            
            console.log('Gacha Machine and Store started successfully');
        } catch (error) {
            console.error('Error starting Gacha Machine:', error);
        }
    }

    // ===== STORE FUNCTIONALITY =====

    /**
     * Create or update the gacha store
     */
    async createOrUpdateStore() {
        try {
            const channel = await this.getChannel();
            if (!channel) return;

            // Check if we need to refresh store items
            if (this.shouldRefreshStore()) {
                await this.refreshStoreItems();
            }

            // Check if store already exists
            const existingStore = await this.findExistingGachaStore(channel);
            if (existingStore) {
                console.log('Gacha store already exists, updating existing message');
                this.storeMessageId = existingStore.id;
                await this.updateExistingStore(existingStore);
                return;
            }

            // Create new store
            const { embed, components, files } = await this.createStoreEmbed();
            const messageOptions = { embeds: [embed], components };
            if (files && files.length > 0) {
                messageOptions.files = files;
            }
            const message = await channel.send(messageOptions);

            this.storeMessageId = message.id;
            console.log(`Gacha store created with message ID: ${this.storeMessageId}`);

        } catch (error) {
            console.error('Error creating gacha store:', error);
        }
    }

    /**
     * Find existing gacha store in channel
     */
    async findExistingGachaStore(channel) {
        try {
            const messages = await channel.messages.fetch({ limit: 50 });
            
            for (const [, message] of messages) {
                if (message.embeds.length > 0) {
                    const embed = message.embeds[0];
                    if (embed.title === 'Gacha Store' && message.author.bot) {
                        console.log(`Found existing gacha store: ${message.id}`);
                        return message;
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error searching for existing gacha store:', error);
            return null;
        }
    }

    /**
     * Update existing store message
     */
    async updateExistingStore(message) {
        try {
            const { embed, components, files } = await this.createStoreEmbed();
            const messageOptions = { embeds: [embed], components };
            if (files && files.length > 0) {
                messageOptions.files = files;
            }
            await message.edit(messageOptions);
            console.log('Updated existing gacha store');
        } catch (error) {
            console.error('Error updating existing gacha store:', error);
        }
    }

    /**
     * Check if store should be refreshed (daily at midnight UTC)
     */
    shouldRefreshStore() {
        if (!this.lastStoreRefresh) {
            return true; // First time
        }

        const now = new Date();
        const lastRefresh = new Date(this.lastStoreRefresh);
        
        // Check if it's a new day
        const nowDay = now.toDateString();
        const lastRefreshDay = lastRefresh.toDateString();
        
        return nowDay !== lastRefreshDay;
    }

    /**
     * UPDATED: Refresh store items with series diversity (4 items instead of 5)
     */
    async refreshStoreItems() {
        try {
            console.log('🔄 Refreshing gacha store items...');
            
            // Get eligible items (dropRate > 0, not legendary/mythic)
            const eligibleItems = await GachaItem.find({
                isActive: true,
                dropRate: { $gt: 0 },
                rarity: { $in: ['common', 'uncommon', 'rare', 'epic'] }
            });

            if (eligibleItems.length === 0) {
                console.warn('No eligible items found for gacha store');
                this.currentStoreItems = [];
                return;
            }

            // UPDATED: Select 4 items instead of 5
            this.currentStoreItems = this.selectDiverseItems(eligibleItems, 4);
            this.lastStoreRefresh = new Date();

            console.log(`✅ Store refreshed with ${this.currentStoreItems.length} items:`, 
                this.currentStoreItems.map(item => `${item.itemName} (${item.seriesId || 'no-series'})`));

        } catch (error) {
            console.error('Error refreshing store items:', error);
            this.currentStoreItems = [];
        }
    }

    /**
     * Select diverse items ensuring different series
     */
    selectDiverseItems(items, maxCount) {
        const selected = [];
        const usedSeries = new Set();
        const shuffledItems = [...items].sort(() => Math.random() - 0.5);

        // First pass: Select items from different series
        for (const item of shuffledItems) {
            if (selected.length >= maxCount) break;
            
            const seriesKey = item.seriesId || `individual_${item.itemId}`;
            
            if (!usedSeries.has(seriesKey)) {
                selected.push(item);
                usedSeries.add(seriesKey);
            }
        }

        // Second pass: Fill remaining slots if we don't have enough diverse items
        if (selected.length < maxCount) {
            for (const item of shuffledItems) {
                if (selected.length >= maxCount) break;
                
                if (!selected.find(s => s.itemId === item.itemId)) {
                    selected.push(item);
                }
            }
        }

        return selected.slice(0, maxCount);
    }

    /**
     * UPDATED: Create store embed with cleaner design and 2-column layout
     */
    async createStoreEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('Gacha Store') // UPDATED: Removed emoji from title
            .setColor(COLORS.INFO)
            .setTimestamp();

        // UPDATED: Add store image as thumbnail (top-right corner)
        let attachment = null;
        try {
            const imagePath = join(__dirname, '../../assets/store.png');
            if (existsSync(imagePath)) {
                attachment = new AttachmentBuilder(imagePath, { name: 'store.png' });
                embed.setThumbnail('attachment://store.png');
                console.log('Store image attached as thumbnail successfully');
            } else {
                console.warn('Store image not found at:', imagePath);
            }
        } catch (imageError) {
            console.warn('Could not load store image:', imageError.message);
        }

        let description = '**Daily rotating stock of premium items!**\n\n';
        description += 'Direct purchase with GP - No luck required!\n';
        description += 'Stock refreshes daily at midnight UTC\n\n';

        if (this.currentStoreItems.length === 0) {
            description += '**Store is currently restocking...**\nPlease check back later!';
            embed.setDescription(description);
            return { embed: embed, components: [], files: attachment ? [attachment] : [] };
        }

        description += '**Today\'s Featured Items:**\n\n';

        // UPDATED: Create 2-column layout for 4 items
        const items = this.currentStoreItems;
        const leftColumn = items.slice(0, 2); // Items 0, 1
        const rightColumn = items.slice(2, 4); // Items 2, 3

        // Helper function to format item display
        const formatItem = (item) => {
            const price = STORE_PRICES[item.rarity];
            const emoji = gachaService.formatItemEmoji(item);
            const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
            const rarityName = gachaService.getRarityDisplayName(item.rarity);
            const seriesText = item.seriesId ? item.seriesId.charAt(0).toUpperCase() + item.seriesId.slice(1) : 'Individual';

            return `${emoji}\n**${item.itemName}**\n*${item.description}*\n${rarityEmoji} ${rarityName} • ${price.toLocaleString()} GP\nSeries: ${seriesText}`;
        };

        // Create column content
        let leftColumnText = '';
        let rightColumnText = '';

        for (let i = 0; i < Math.max(leftColumn.length, rightColumn.length); i++) {
            if (leftColumn[i]) {
                leftColumnText += formatItem(leftColumn[i]);
                if (i < leftColumn.length - 1) leftColumnText += '\n\n';
            }
            
            if (rightColumn[i]) {
                rightColumnText += formatItem(rightColumn[i]);
                if (i < rightColumn.length - 1) rightColumnText += '\n\n';
            }
        }

        embed.setDescription(description);

        // Add columns as fields
        if (leftColumnText) {
            embed.addFields({
                name: '\u200b', // Invisible character for spacing
                value: leftColumnText,
                inline: true
            });
        }

        if (rightColumnText) {
            embed.addFields({
                name: '\u200b', // Invisible character for spacing
                value: rightColumnText,
                inline: true
            });
        }

        // UPDATED: Fix refresh timer in description instead of footer
        const now = new Date();
        const nextRefresh = new Date();
        nextRefresh.setUTCHours(24, 0, 0, 0); // Next midnight UTC
        const hoursUntilRefresh = Math.ceil((nextRefresh.getTime() - now.getTime()) / (1000 * 60 * 60));
        
        embed.addFields({
            name: 'Store Information',
            value: `Next refresh: **${hoursUntilRefresh} hours**\nUse /profile to check your GP balance`,
            inline: false
        });

        // Create select menu components
        const components = [];
        const selectOptions = [];

        for (const item of items) {
            const price = STORE_PRICES[item.rarity];
            const rarityName = gachaService.getRarityDisplayName(item.rarity);

            selectOptions.push({
                label: `${item.itemName} - ${price.toLocaleString()} GP`,
                value: `store_buy_${item.itemId}`,
                description: `${rarityName} ${item.seriesId ? `• ${item.seriesId}` : '• Individual item'}`,
                emoji: item.emojiId ? { id: item.emojiId, name: item.emojiName, animated: item.isAnimated } : undefined
            });
        }

        if (selectOptions.length > 0) {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('gacha_store_purchase')
                .setPlaceholder('Select an item to purchase...')
                .addOptions(selectOptions);

            components.push(new ActionRowBuilder().addComponents(selectMenu));
        }

        return { embed, components, files: attachment ? [attachment] : [] };
    }

    /**
     * UPDATED: Handle store purchase with updated pricing
     */
    async handleStorePurchase(interaction, user, itemId) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // Find the item in current store
            const storeItem = this.currentStoreItems.find(item => item.itemId === itemId);
            if (!storeItem) {
                return interaction.editReply({
                    content: 'This item is no longer available in the store. The store may have refreshed.',
                    ephemeral: true
                });
            }

            const price = STORE_PRICES[storeItem.rarity];

            // Use gpUtils for validation
            if (!gpUtils.canAfford(user, price)) {
                return interaction.editReply({
                    content: `Insufficient GP! You need ${gpUtils.formatGP(price)} but only have ${gpUtils.formatGP(user.gpBalance)}.`,
                    ephemeral: true
                });
            }

            // Check if user already owns this item (for non-stackable items)
            if (storeItem.maxStack <= 1) {
                const existingItem = user.gachaCollection?.find(item => item.itemId === itemId);
                if (existingItem) {
                    return interaction.editReply({
                        content: `You already own **${storeItem.itemName}**! This item cannot be stacked.`,
                        ephemeral: true
                    });
                }
            }

            // Process purchase using gpUtils
            await gpUtils.deductGP(user, price, 'gacha_pull', `Store purchase: ${storeItem.itemName}`);

            // Add item to collection
            const addResult = user.addGachaItem(storeItem, 1, 'store_purchase');

            await user.save();

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setTitle('Purchase Successful!')
                .setColor(gachaService.getRarityColor(storeItem.rarity))
                .setTimestamp();

            const emoji = gachaService.formatItemEmoji(storeItem);
            const rarityEmoji = gachaService.getRarityEmoji(storeItem.rarity);
            
            let purchaseDescription = `${emoji} **${storeItem.itemName}** ${rarityEmoji}\n\n`;
            purchaseDescription += `**Cost:** ${gpUtils.formatGP(price)}\n`;
            purchaseDescription += `**New Balance:** ${gpUtils.formatGP(user.gpBalance)}\n\n`;
            
            if (addResult.wasStacked) {
                purchaseDescription += `Stacked with existing item (Quantity: ${addResult.item.quantity})`;
            } else {
                purchaseDescription += `Added to your collection!`;
            }

            successEmbed.setDescription(purchaseDescription);

            if (storeItem.description) {
                successEmbed.addFields({
                    name: 'Description',
                    value: `*${storeItem.description}*`,
                    inline: false
                });
            }

            if (storeItem.flavorText) {
                successEmbed.addFields({
                    name: 'Flavor Text',
                    value: `*"${storeItem.flavorText}"*`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [successEmbed] });

            // UPDATED: Reset the store dropdown after purchase
            try {
                const channel = await this.getChannel();
                if (channel && this.storeMessageId) {
                    const storeMessage = await channel.messages.fetch(this.storeMessageId);
                    await this.updateExistingStore(storeMessage);
                    console.log('Store dropdown reset after purchase');
                }
            } catch (resetError) {
                console.error('Error resetting store dropdown:', resetError);
            }

            // Check for combinations after purchase
            const possibleCombinations = await combinationService.checkPossibleCombinations(user);
            const relevantCombinations = possibleCombinations.filter(combo => 
                combo.ingredients.some(ingredient => ingredient.itemId === itemId)
            );

            if (relevantCombinations.length > 0) {
                setTimeout(async () => {
                    await combinationService.showCombinationAlert(interaction, user, relevantCombinations);
                }, 1500);
            }

        } catch (error) {
            console.error('Error handling store purchase:', error);
            await interaction.editReply({
                content: `Error processing purchase: ${error.message}`,
                ephemeral: true
            });
        }
    }

    /**
     * Schedule daily store refresh
     */
    scheduleStoreRefresh() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setUTCHours(24, 0, 0, 0); // Next midnight UTC
        
        const msUntilRefresh = tomorrow.getTime() - now.getTime();
        
        console.log(`⏰ Store will refresh in ${Math.round(msUntilRefresh / 1000 / 60 / 60)} hours`);
        
        setTimeout(async () => {
            await this.refreshStoreItems();
            
            // Update store display
            try {
                const channel = await this.getChannel();
                if (channel && this.storeMessageId) {
                    const message = await channel.messages.fetch(this.storeMessageId);
                    await this.updateExistingStore(message);
                    console.log('✅ Store refreshed and updated');
                }
            } catch (error) {
                console.error('Error updating store after refresh:', error);
            }
            
            // Schedule next refresh
            this.scheduleStoreRefresh();
        }, msUntilRefresh);
    }

    // ===== EXISTING MACHINE FUNCTIONALITY =====

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
                '🛒 **Check out the Gacha Store below for direct purchases!**\n\n' +
                '🎲 **Rarity System:**\n' +
                '⚪ Common • 🟢 Uncommon • 🔵 Rare • 🟣 Epic • 🟡 Legendary • 🌟 Mythic'
            )
            .setColor(COLORS.GOLD)
            .setFooter({ 
                text: 'Pull results will expire after 1 minute • Use /profile to check your GP balance' 
            })
            .setTimestamp();

        // Try to attach the gacha image as thumbnail
        let attachment = null;
        try {
            const imagePath = join(__dirname, '../../assets/gacha.png');
            if (existsSync(imagePath)) {
                attachment = new AttachmentBuilder(imagePath, { name: 'gacha.png' });
                embed.setThumbnail('attachment://gacha.png');
                console.log('Gacha image attached as thumbnail successfully');
            } else {
                console.warn('Gacha image not found at:', imagePath);
            }
        } catch (imageError) {
            console.warn('Could not load gacha image:', imageError.message);
        }

        return { embed, attachment };
    }

    // ... rest of the existing methods remain the same ...
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
                `**Cost:** ${gpUtils.formatGP(cost)} → **New Balance:** ${gpUtils.formatGP(newBalance)}\n\n` +
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

        // Show combination alerts instead of auto-combination results
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

        // Add balance info in footer with gpUtils formatting
        embed.setFooter({ 
            text: `GP Balance: ${gpUtils.formatGP(result.newBalance)}` 
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
                `🛒 Store Purchases: ${summary.sourceBreakdown.store_purchase || 0}\n` +
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
