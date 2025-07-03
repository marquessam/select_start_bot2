// src/services/gachaMachine.js - DEPLOYMENT-SAFE VERSION with non-blocking startup
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

// DEPLOYMENT SAFETY: Simplified caching system
const storeItemsCache = new Map();
const machineEmbedCache = new Map();
const storeEmbedCache = new Map();
const formattedEmojiCache = new Map();
let lastStoreCacheRefresh = 0;
const STORE_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const EMBED_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const EMOJI_CACHE_TTL = 60 * 60 * 1000; // 1 hour

class GachaMachine {
    constructor() {
        this.client = null;
        this.channelId = '1377092881885696022'; // Gacha channel
        this.machineMessageId = null;
        this.storeMessageId = null;
        this.isRunning = false;
        
        // DEPLOYMENT SAFETY: Simplified store management
        this.currentStoreItems = [];
        this.lastStoreRefresh = null;
        this.storeRefreshHour = 0;
        this.isInitialized = false;
        
        // DEPLOYMENT SAFETY: Optional asset loading
        this.machineImagePath = null;
        this.storeImagePath = null;
        this.initializeAssets();
    }

    /**
     * DEPLOYMENT SAFETY: Non-blocking asset initialization
     */
    initializeAssets() {
        try {
            const machineImagePath = join(__dirname, '../../assets/gacha.png');
            const storeImagePath = join(__dirname, '../../assets/store.png');
            
            if (existsSync(machineImagePath)) {
                this.machineImagePath = machineImagePath;
                console.log('✅ Gacha machine image found');
            } else {
                console.log('ℹ️ Gacha machine image not found (optional)');
            }
            
            if (existsSync(storeImagePath)) {
                this.storeImagePath = storeImagePath;
                console.log('✅ Store image found');
            } else {
                console.log('ℹ️ Store image not found (optional)');
            }
        } catch (error) {
            console.warn('⚠️ Error loading image assets (non-blocking):', error.message);
        }
    }

    setClient(client) {
        this.client = client;
        console.log('🎰 Gacha Machine client configured');
    }

    /**
     * DEPLOYMENT SAFETY: Simplified emoji formatting with caching
     */
    formatItemEmoji(item) {
        if (!item) return '❓';
        
        const cacheKey = `${item.emojiId || 'no-id'}_${item.emojiName || 'no-name'}_${item.isAnimated || false}`;
        const cached = formattedEmojiCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < EMOJI_CACHE_TTL) {
            return cached.data;
        }
        
        let formattedEmoji;
        if (item.emojiId && item.emojiName) {
            const prefix = item.isAnimated ? 'a' : '';
            formattedEmoji = `<${prefix}:${item.emojiName}:${item.emojiId}>`;
        } else {
            formattedEmoji = formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
        }
        
        formattedEmojiCache.set(cacheKey, { 
            data: formattedEmoji, 
            timestamp: Date.now() 
        });
        
        return formattedEmoji;
    }

    /**
     * DEPLOYMENT SAFETY: Non-blocking start with error isolation
     */
    async start() {
        if (!this.client) {
            console.error('❌ Discord client not set for Gacha Machine');
            return;
        }

        try {
            console.log('🚀 Starting Gacha Machine...');
            
            // Start machine and store creation in background (non-blocking)
            this.createMachine().catch(error => {
                console.error('❌ Error creating gacha machine (non-blocking):', error);
            });
            
            this.initializeStore().catch(error => {
                console.error('❌ Error initializing store (non-blocking):', error);
            });
            
            this.isRunning = true;
            this.isInitialized = true;
            this.scheduleStoreRefresh();
            
            console.log('✅ Gacha Machine started (background initialization continues)');
        } catch (error) {
            console.error('❌ Error starting Gacha Machine:', error);
        }
    }

    // ===== DEPLOYMENT SAFE STORE FUNCTIONALITY =====

    /**
     * DEPLOYMENT SAFETY: Initialize store with timeout protection
     */
    async initializeStore() {
        try {
            console.log('📦 Initializing gacha store...');
            
            // Load store items with timeout
            if (this.shouldRefreshStore()) {
                await this.refreshStoreItemsSafe();
            }
            
            await this.createOrUpdateStore();
            console.log('✅ Store initialization complete');
        } catch (error) {
            console.error('❌ Error initializing store (non-blocking):', error);
        }
    }

    /**
     * DEPLOYMENT SAFETY: Safe store item refresh with timeout
     */
    async refreshStoreItemsSafe() {
        try {
            console.log('🔄 Refreshing gacha store items...');
            
            // Check cache first
            const cached = storeItemsCache.get('current_store');
            if (cached && Date.now() - cached.timestamp < STORE_CACHE_TTL && this.isStoreStillValid(cached.refreshDate)) {
                this.currentStoreItems = cached.data;
                this.lastStoreRefresh = cached.refreshDate;
                console.log(`✅ Store items loaded from cache: ${this.currentStoreItems.length} items`);
                return;
            }

            // Create timeout promise
            const timeoutPromise = new Promise((resolve) => {
                setTimeout(() => resolve([]), 5000); // 5 second timeout
            });

            // Query with timeout protection
            const queryPromise = GachaItem.find({
                isActive: true,
                dropRate: { $gt: 0 },
                rarity: { $in: ['common', 'uncommon', 'rare', 'epic'] }
            }).limit(100).lean().exec();

            const eligibleItems = await Promise.race([queryPromise, timeoutPromise]);

            if (!eligibleItems || eligibleItems.length === 0) {
                console.warn('⚠️ No eligible items found for gacha store');
                this.currentStoreItems = [];
                return;
            }

            // Select diverse items
            this.currentStoreItems = this.selectDiverseItems(eligibleItems, 4);
            this.lastStoreRefresh = new Date();

            // Cache the result
            storeItemsCache.set('current_store', {
                data: this.currentStoreItems,
                timestamp: Date.now(),
                refreshDate: this.lastStoreRefresh
            });

            console.log(`✅ Store refreshed with ${this.currentStoreItems.length} items`);

        } catch (error) {
            console.error('❌ Error refreshing store items:', error);
            this.currentStoreItems = [];
        }
    }

    /**
     * Check if cached store is still valid for the current day
     */
    isStoreStillValid(refreshDate) {
        if (!refreshDate) return false;
        
        const now = new Date();
        const lastRefresh = new Date(refreshDate);
        
        return now.toDateString() === lastRefresh.toDateString();
    }

    /**
     * DEPLOYMENT SAFETY: Optimized diverse item selection
     */
    selectDiverseItems(items, maxCount) {
        const selected = [];
        const usedSeries = new Set();
        
        // Shuffle items efficiently
        const shuffledItems = items
            .map(item => ({ item, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ item }) => item);

        // First pass: Different series
        for (const item of shuffledItems) {
            if (selected.length >= maxCount) break;
            
            const seriesKey = item.seriesId || `individual_${item.itemId}`;
            
            if (!usedSeries.has(seriesKey)) {
                selected.push(item);
                usedSeries.add(seriesKey);
            }
        }

        // Second pass: Fill remaining slots
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
     * DEPLOYMENT SAFETY: Cached store embed creation with error handling
     */
    async createStoreEmbed() {
        try {
            const itemIds = this.currentStoreItems.map(item => item.itemId).sort().join(',');
            const cacheKey = `store_embed_${itemIds}`;
            const cached = storeEmbedCache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < EMBED_CACHE_TTL) {
                return cached.data;
            }

            const embed = new EmbedBuilder()
                .setTitle('Gacha Store')
                .setColor(COLORS.INFO)
                .setTimestamp();

            // Add store image if available
            let attachment = null;
            if (this.storeImagePath) {
                try {
                    attachment = new AttachmentBuilder(this.storeImagePath, { name: 'store.png' });
                    embed.setThumbnail('attachment://store.png');
                } catch (imageError) {
                    console.warn('⚠️ Could not load store image:', imageError.message);
                }
            }

            let description = '**Daily rotating stock of premium items!**\n\n';
            description += 'Direct purchase with GP - No luck required!\n';
            description += 'Stock refreshes daily at midnight UTC\n\n';

            if (this.currentStoreItems.length === 0) {
                description += '**Store is currently restocking...**\nPlease check back later!';
                embed.setDescription(description);
                
                const result = { embed: embed, components: [], files: attachment ? [attachment] : [] };
                storeEmbedCache.set(cacheKey, { data: result, timestamp: Date.now() });
                return result;
            }

            description += '**Today\'s Featured Items:**\n\n';

            // Format items efficiently
            const formattedItems = this.currentStoreItems.map(item => {
                const price = STORE_PRICES[item.rarity];
                const emoji = this.formatItemEmoji(item);
                const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
                const rarityName = gachaService.getRarityDisplayName(item.rarity);
                const seriesText = item.seriesId ? item.seriesId.charAt(0).toUpperCase() + item.seriesId.slice(1) : 'Individual';

                return {
                    text: `${emoji}\n**${item.itemName}**\n*${item.description}*\n${rarityEmoji} ${rarityName} • ${price.toLocaleString()} GP\nSeries: ${seriesText}`,
                    item
                };
            });

            // Create layout
            const leftColumn = formattedItems.slice(0, 2);
            const rightColumn = formattedItems.slice(2, 4);

            embed.setDescription(description);

            if (leftColumn.length > 0) {
                embed.addFields({
                    name: '\u200b',
                    value: leftColumn.map(f => f.text).join('\n\n'),
                    inline: true
                });
            }

            if (rightColumn.length > 0) {
                embed.addFields({
                    name: '\u200b',
                    value: rightColumn.map(f => f.text).join('\n\n'),
                    inline: true
                });
            }

            // Add refresh timer
            const now = new Date();
            const nextRefresh = new Date();
            nextRefresh.setUTCHours(24, 0, 0, 0);
            const hoursUntilRefresh = Math.ceil((nextRefresh.getTime() - now.getTime()) / (1000 * 60 * 60));
            
            embed.addFields({
                name: 'Store Information',
                value: `Next refresh: **${hoursUntilRefresh} hours**\nUse /profile to check your GP balance`,
                inline: false
            });

            // Create select menu
            const components = [];
            const selectOptions = [];

            for (const { item } of formattedItems) {
                const price = STORE_PRICES[item.rarity];
                const rarityName = gachaService.getRarityDisplayName(item.rarity);

                const option = {
                    label: `${item.itemName} - ${price.toLocaleString()} GP`,
                    value: `store_buy_${item.itemId}`,
                    description: `${rarityName} ${item.seriesId ? `• ${item.seriesId}` : '• Individual item'}`
                };

                if (item.emojiId && item.emojiName) {
                    option.emoji = { 
                        id: item.emojiId, 
                        name: item.emojiName, 
                        animated: item.isAnimated || false 
                    };
                }
                
                selectOptions.push(option);
            }

            if (selectOptions.length > 0) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('gacha_store_purchase')
                    .setPlaceholder('Select an item to purchase...')
                    .addOptions(selectOptions);

                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }

            const result = { embed, components, files: attachment ? [attachment] : [] };
            storeEmbedCache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;

        } catch (error) {
            console.error('❌ Error creating store embed:', error);
            
            // Return basic embed on error
            const basicEmbed = new EmbedBuilder()
                .setTitle('Gacha Store')
                .setDescription('Store is temporarily unavailable. Please try again later.')
                .setColor(COLORS.ERROR);
                
            return { embed: basicEmbed, components: [], files: [] };
        }
    }

    /**
     * DEPLOYMENT SAFETY: Create or update store with error handling
     */
    async createOrUpdateStore() {
        try {
            const channel = await this.getChannel();
            if (!channel) return;

            // Check if store already exists
            const existingStore = await this.findExistingGachaStore(channel);
            if (existingStore) {
                console.log('📦 Updating existing gacha store');
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
            console.log(`📦 Gacha store created: ${this.storeMessageId}`);

        } catch (error) {
            console.error('❌ Error creating/updating gacha store:', error);
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
                        return message;
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('❌ Error searching for existing gacha store:', error);
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
        } catch (error) {
            console.error('❌ Error updating existing gacha store:', error);
        }
    }

    /**
     * Check if store should be refreshed
     */
    shouldRefreshStore() {
        if (!this.lastStoreRefresh) return true;

        const now = new Date();
        const lastRefresh = new Date(this.lastStoreRefresh);
        
        return now.toDateString() !== lastRefresh.toDateString();
    }

    /**
     * DEPLOYMENT SAFETY: Store purchase handling with timeout protection
     */
    async handleStorePurchase(interaction, user, itemId) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const storeItem = this.currentStoreItems.find(item => item.itemId === itemId);
            if (!storeItem) {
                return interaction.editReply({
                    content: 'This item is no longer available in the store.',
                    ephemeral: true
                });
            }

            const price = STORE_PRICES[storeItem.rarity];

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
                        content: `You already own **${storeItem.itemName}**!`,
                        ephemeral: true
                    });
                }
            }

            // Process purchase
            await gpUtils.deductGP(user, price, 'gacha_pull', `Store purchase: ${storeItem.itemName}`);
            const addResult = user.addGachaItem(storeItem, 1, 'store_purchase');
            await user.save();

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setTitle('Purchase Successful!')
                .setColor(gachaService.getRarityColor(storeItem.rarity))
                .setTimestamp();

            const emoji = this.formatItemEmoji(storeItem);
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

            await interaction.editReply({ embeds: [successEmbed] });

            // Reset store dropdown (non-blocking)
            this.resetStoreDropdown().catch(error => {
                console.error('❌ Error resetting store dropdown:', error);
            });

            // Check for combinations (non-blocking)
            this.checkCombinationsForPurchase(interaction, user, itemId).catch(error => {
                console.error('❌ Error checking combinations:', error);
            });

        } catch (error) {
            console.error('❌ Error handling store purchase:', error);
            await interaction.editReply({
                content: `Error processing purchase: ${error.message}`,
                ephemeral: true
            });
        }
    }

    /**
     * DEPLOYMENT SAFETY: Non-blocking store dropdown reset
     */
    async resetStoreDropdown() {
        try {
            const channel = await this.getChannel();
            if (channel && this.storeMessageId) {
                const storeMessage = await channel.messages.fetch(this.storeMessageId);
                await this.updateExistingStore(storeMessage);
            }
        } catch (error) {
            console.error('❌ Error resetting store dropdown:', error);
        }
    }

    /**
     * DEPLOYMENT SAFETY: Non-blocking combination check
     */
    async checkCombinationsForPurchase(interaction, user, itemId) {
        try {
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([]), 3000));
            const combinationPromise = combinationService.checkPossibleCombinations(user);
            
            const possibleCombinations = await Promise.race([combinationPromise, timeoutPromise]);
            const relevantCombinations = possibleCombinations.filter(combo => 
                combo.ingredients.some(ingredient => ingredient.itemId === itemId)
            );

            if (relevantCombinations.length > 0) {
                setTimeout(async () => {
                    try {
                        await combinationService.showCombinationAlert(interaction, user, relevantCombinations);
                    } catch (alertError) {
                        console.error('❌ Error showing combination alert:', alertError);
                    }
                }, 1500);
            }
        } catch (error) {
            console.error('❌ Error checking combinations for purchase:', error);
        }
    }

    /**
     * DEPLOYMENT SAFETY: Simplified store refresh scheduling
     */
    scheduleStoreRefresh() {
        try {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setUTCHours(24, 0, 0, 0);
            
            const msUntilRefresh = tomorrow.getTime() - now.getTime();
            console.log(`⏰ Store will refresh in ${Math.round(msUntilRefresh / 1000 / 60 / 60)} hours`);
            
            setTimeout(() => {
                this.performStoreRefresh().catch(error => {
                    console.error('❌ Error in scheduled store refresh:', error);
                });
                
                // Schedule next refresh
                this.scheduleStoreRefresh();
            }, msUntilRefresh);
        } catch (error) {
            console.error('❌ Error scheduling store refresh:', error);
        }
    }

    /**
     * DEPLOYMENT SAFETY: Non-blocking store refresh
     */
    async performStoreRefresh() {
        try {
            console.log('🔄 Performing scheduled store refresh...');
            
            // Clear cache
            storeItemsCache.delete('current_store');
            storeEmbedCache.clear();
            
            await this.refreshStoreItemsSafe();
            
            // Update display
            const channel = await this.getChannel();
            if (channel && this.storeMessageId) {
                const message = await channel.messages.fetch(this.storeMessageId);
                await this.updateExistingStore(message);
                console.log('✅ Store refreshed and updated');
            }
        } catch (error) {
            console.error('❌ Error in performStoreRefresh:', error);
        }
    }

    // ===== MACHINE FUNCTIONALITY =====

    /**
     * DEPLOYMENT SAFETY: Cached machine embed creation
     */
    createMachineEmbed() {
        const cacheKey = 'machine_embed';
        const cached = machineEmbedCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < EMBED_CACHE_TTL) {
            return cached.data;
        }

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
                '✨ **NEW: Combination System:**\n' +
                '• When you get items that can be combined, you\'ll get an alert\n' +
                '• Choose which combinations to perform\n' +
                '• View your collection with `/collection`\n\n' +
                '🛒 **Check out the Gacha Store below for direct purchases!**\n\n' +
                '🎲 **Rarity System:**\n' +
                '⚪ Common • 🟢 Uncommon • 🔵 Rare • 🟣 Epic • 🟡 Legendary • 🌟 Mythic'
            )
            .setColor(COLORS.GOLD)
            .setFooter({ 
                text: 'Use /profile to check your GP balance' 
            })
            .setTimestamp();

        // Try to attach image
        let attachment = null;
        if (this.machineImagePath) {
            try {
                attachment = new AttachmentBuilder(this.machineImagePath, { name: 'gacha.png' });
                embed.setThumbnail('attachment://gacha.png');
            } catch (imageError) {
                console.warn('⚠️ Could not load gacha image:', imageError.message);
            }
        }

        const result = { embed, attachment };
        machineEmbedCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
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

    /**
     * DEPLOYMENT SAFETY: Create machine with error handling
     */
    async createMachine() {
        try {
            const channel = await this.getChannel();
            if (!channel) return;

            // Check if machine already exists
            const existingMachine = await this.findExistingGachaMachine(channel);
            if (existingMachine) {
                console.log('🎰 Using existing gacha machine');
                this.machineMessageId = existingMachine.id;
                await this.updateExistingMachine(existingMachine);
                return;
            }

            // Create new machine
            const { embed, attachment } = this.createMachineEmbed();
            const buttons = this.createMachineButtons();

            const messageOptions = {
                embeds: [embed],
                components: [buttons]
            };

            if (attachment) {
                messageOptions.files = [attachment];
            }

            const message = await channel.send(messageOptions);

            // Try to pin (non-blocking)
            message.pin().catch(pinError => {
                console.warn('⚠️ Could not pin gacha machine:', pinError.message);
            });

            this.machineMessageId = message.id;
            console.log(`🎰 Gacha machine created: ${this.machineMessageId}`);

        } catch (error) {
            console.error('❌ Error creating gacha machine:', error);
        }
    }

    /**
     * Find existing gacha machine
     */
    async findExistingGachaMachine(channel) {
        try {
            const messages = await channel.messages.fetch({ limit: 50 });
            
            for (const [, message] of messages) {
                if (message.embeds.length > 0) {
                    const embed = message.embeds[0];
                    if (embed.title === '🎰 Gacha Machine' && message.author.bot) {
                        return message;
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('❌ Error finding existing gacha machine:', error);
            return null;
        }
    }

    /**
     * Update existing machine
     */
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
        } catch (error) {
            console.error('❌ Error updating gacha machine:', error);
        }
    }

    /**
     * DEPLOYMENT SAFETY: Simplified pull handling
     */
    async handlePull(interaction, user, pullType) {
        try {
            const result = await gachaService.performPull(user, pullType);
            
            if (pullType === 'multi') {
                await this.handleMultiPullEmbeds(interaction, result, user);
            } else {
                const embed = await this.createSinglePullEmbed(result.results[0], user, result);
                
                await interaction.editReply({
                    embeds: [embed],
                    ephemeral: true
                });

                // Check combinations (non-blocking)
                if (result.possibleCombinations && result.possibleCombinations.length > 0) {
                    setTimeout(async () => {
                        try {
                            await combinationService.showCombinationAlert(interaction, user, result.possibleCombinations);
                        } catch (combError) {
                            console.error('❌ Error showing combination alert:', combError);
                        }
                    }, 1500);
                }
            }

        } catch (error) {
            console.error('❌ Error handling pull:', error);
            await interaction.editReply({
                content: `❌ ${error.message}`,
                ephemeral: true
            });
        }
    }

    async handleMultiPullEmbeds(interaction, result, user) {
        const { results, completions, possibleCombinations, newBalance, cost } = result;
        
        // Send summary
        const summaryEmbed = new EmbedBuilder()
            .setTitle('🎆 Multi Pull Results')
            .setDescription(
                `**Cost:** ${gpUtils.formatGP(cost)} → **New Balance:** ${gpUtils.formatGP(newBalance)}\n\n` +
                `**Pulls:** ${results.length} items\n` +
                `Individual results coming up...`
            )
            .setColor(COLORS.SUCCESS)
            .setTimestamp();

        await interaction.editReply({
            embeds: [summaryEmbed],
            ephemeral: true
        });

        // Send individual results
        for (let i = 0; i < results.length; i++) {
            const item = results[i];
            const itemEmbed = await this.createSinglePullEmbed(item, user, result, i + 1);
            
            await interaction.followUp({
                embeds: [itemEmbed],
                ephemeral: true
            });
            
            if (i < results.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        }

        // Send completions
        if (completions.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const bonusEmbed = await this.createBonusEmbed(completions, []);
            await interaction.followUp({
                embeds: [bonusEmbed],
                ephemeral: true
            });
        }

        // Show combinations (non-blocking)
        if (possibleCombinations && possibleCombinations.length > 0) {
            setTimeout(async () => {
                try {
                    await combinationService.showCombinationAlert(interaction, user, possibleCombinations);
                } catch (combError) {
                    console.error('❌ Error showing combination alert:', combError);
                }
            }, 2000);
        }
    }

    // Simplified embed creation methods
    async createSinglePullEmbed(item, user, result, pullNumber = null) {
        const rarityColor = gachaService.getRarityColor(item.rarity);
        const title = pullNumber ? 
            `Pull ${pullNumber} - ${item.itemName}` : 
            `Single Pull - ${item.itemName}`;
            
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(rarityColor)
            .setTimestamp();

        const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
        const rarityName = gachaService.getRarityDisplayName(item.rarity);
        const itemEmoji = this.formatItemEmoji(item);
        
        let description = `# ${itemEmoji} **${item.itemName}**\n\n`;
        description += `${rarityEmoji} **${rarityName}**`;
        
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

        if (item.description) {
            embed.addFields({
                name: 'Description',
                value: `*${item.description}*`,
                inline: false
            });
        }

        if (item.wasStacked) {
            embed.addFields({
                name: '📚 Stacked',
                value: `Added to existing stack`,
                inline: true
            });
        }

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

        if (completions && completions.length > 0) {
            description += '🏆 **Series Completed!**\n\n';
            for (const completion of completions) {
                const rewardEmoji = this.formatItemEmoji(completion.rewardItem);
                description += `**${completion.seriesName}** Complete!\n`;
                description += `${rewardEmoji} Unlocked: **${completion.rewardItem.itemName}**\n\n`;
            }
        }

        embed.setDescription(description);
        embed.setFooter({ text: 'These bonuses have been added to your collection automatically!' });

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
            .setFooter({ text: 'Use /collection for detailed view with filters!' })
            .setTimestamp();

        if (summary.recentItems.length > 0) {
            let recentText = '';
            for (const item of summary.recentItems.slice(0, 5)) {
                const emoji = this.formatItemEmoji(item);
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
            if (!guild) return null;

            const channel = await guild.channels.fetch(this.channelId);
            return channel;
        } catch (error) {
            console.error('❌ Error getting gacha channel:', error);
            return null;
        }
    }

    stop() {
        this.isRunning = false;
        console.log('🛑 Gacha Machine stopped');
    }
}

// DEPLOYMENT SAFETY: Simplified cache cleanup
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of machineEmbedCache.entries()) {
        if (now - value.timestamp > EMBED_CACHE_TTL) {
            machineEmbedCache.delete(key);
            cleaned++;
        }
    }
    
    for (const [key, value] of storeEmbedCache.entries()) {
        if (now - value.timestamp > EMBED_CACHE_TTL) {
            storeEmbedCache.delete(key);
            cleaned++;
        }
    }
    
    for (const [key, value] of formattedEmojiCache.entries()) {
        if (now - value.timestamp > EMOJI_CACHE_TTL) {
            formattedEmojiCache.delete(key);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} expired gacha cache entries`);
    }
    
}, 5 * 60 * 1000); // Clean every 5 minutes

export default new GachaMachine();
