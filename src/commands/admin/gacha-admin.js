// src/commands/admin/gacha-admin.js
import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    AttachmentBuilder 
} from 'discord.js';
import { GachaItem } from '../../models/GachaItem.js';
import gachaService from '../../services/gachaService.js';
import { COLORS } from '../../utils/FeedUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gacha-admin') 
        .setDescription('Admin commands for managing the gacha system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-item')
                .setDescription('Add a new gacha item')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Unique item ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Item name')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description') 
                        .setDescription('Item description')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Item type')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Trinket', value: 'trinket' },
                            { name: 'Collectible', value: 'collectible' },
                            { name: 'Series', value: 'series' },
                            { name: 'Special', value: 'special' },
                            { name: 'Trophy', value: 'trophy' }
                        ))
                .addStringOption(option =>
                    option.setName('rarity')
                        .setDescription('Item rarity')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Common', value: 'common' },
                            { name: 'Uncommon', value: 'uncommon' },
                            { name: 'Rare', value: 'rare' },
                            { name: 'Epic', value: 'epic' },
                            { name: 'Legendary', value: 'legendary' }
                        ))
                .addNumberOption(option =>
                    option.setName('drop-rate')
                        .setDescription('Drop rate percentage (0-100)')
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(100))
                .addStringOption(option =>
                    option.setName('emoji-name')
                        .setDescription('Emoji name (without colons)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('emoji-id')
                        .setDescription('Discord emoji ID')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('series-id')
                        .setDescription('Series ID (for collection items)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('flavor-text')
                        .setDescription('Flavor text for the item')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('max-stack')
                        .setDescription('Maximum stack size (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(999)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-items')
                .setDescription('List all gacha items')
                .addStringOption(option =>
                    option.setName('filter')
                        .setDescription('Filter by type or rarity')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-item')
                .setDescription('Remove a gacha item')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle-item')
                .setDescription('Enable/disable a gacha item')
                .addStringOption(option =>
                    option.setName('item-id')
                        .setDescription('Item ID to toggle')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('create-series')
                .setDescription('Create a collection series with completion reward')
                .addStringOption(option =>
                    option.setName('series-id')
                        .setDescription('Series identifier')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reward-id')
                        .setDescription('Reward item ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reward-name')
                        .setDescription('Reward item name')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reward-emoji')
                        .setDescription('Reward emoji name')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reward-emoji-id')
                        .setDescription('Reward emoji Discord ID')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('import-preset')
                .setDescription('Import preset item collections')
                .addStringOption(option =>
                    option.setName('preset')
                        .setDescription('Preset to import')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Triforce Collection', value: 'triforce' },
                            { name: 'Mario Power-ups', value: 'mario' },
                            { name: 'Pokéballs', value: 'pokeballs' },
                            { name: 'Zelda Items', value: 'zelda' }
                        ))),

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
                case 'add-item':
                    await this.handleAddItem(interaction);
                    break;
                case 'list-items':
                    await this.handleListItems(interaction);
                    break;
                case 'remove-item':
                    await this.handleRemoveItem(interaction);
                    break;
                case 'toggle-item':
                    await this.handleToggleItem(interaction);
                    break;
                case 'create-series':
                    await this.handleCreateSeries(interaction);
                    break;
                case 'import-preset':
                    await this.handleImportPreset(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error executing gacha admin command:', error);
            await interaction.editReply({
                content: `❌ Error: ${error.message}`
            });
        }
    },

    async handleAddItem(interaction) {
        const itemData = {
            itemId: interaction.options.getString('item-id'),
            itemName: interaction.options.getString('name'),
            description: interaction.options.getString('description'),
            itemType: interaction.options.getString('type'),
            rarity: interaction.options.getString('rarity'),
            dropRate: interaction.options.getNumber('drop-rate'),
            emojiName: interaction.options.getString('emoji-name'),
            emojiId: interaction.options.getString('emoji-id'),
            seriesId: interaction.options.getString('series-id'),
            flavorText: interaction.options.getString('flavor-text'),
            maxStack: interaction.options.getInteger('max-stack') || 1,
            createdBy: interaction.user.username
        };

        // Check if item already exists
        const existingItem = await GachaItem.findOne({ itemId: itemData.itemId });
        if (existingItem) {
            throw new Error(`Item with ID "${itemData.itemId}" already exists.`);
        }

        const newItem = new GachaItem(itemData);
        await newItem.save();

        const embed = new EmbedBuilder()
            .setTitle('✅ Gacha Item Added')
            .setColor(COLORS.SUCCESS)
            .addFields(
                { name: 'ID', value: itemData.itemId, inline: true },
                { name: 'Name', value: itemData.itemName, inline: true },
                { name: 'Rarity', value: itemData.rarity, inline: true },
                { name: 'Type', value: itemData.itemType, inline: true },
                { name: 'Drop Rate', value: `${itemData.dropRate}%`, inline: true },
                { name: 'Max Stack', value: itemData.maxStack.toString(), inline: true }
            );

        if (itemData.seriesId) {
            embed.addFields({ name: 'Series', value: itemData.seriesId, inline: true });
        }

        if (itemData.flavorText) {
            embed.addFields({ name: 'Flavor Text', value: itemData.flavorText });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async handleListItems(interaction) {
        const filter = interaction.options.getString('filter');
        
        let query = {};
        if (filter) {
            query = {
                $or: [
                    { itemType: filter },
                    { rarity: filter }
                ]
            };
        }

        const items = await GachaItem.find(query).sort({ rarity: 1, itemName: 1 });

        if (items.length === 0) {
            return interaction.editReply({
                content: filter ? 
                    `No items found matching filter: ${filter}` : 
                    'No gacha items found.'
            });
        }

        // Group items by rarity
        const rarityGroups = {
            legendary: [],
            epic: [],
            rare: [],
            uncommon: [],
            common: []
        };

        items.forEach(item => {
            if (rarityGroups[item.rarity]) {
                rarityGroups[item.rarity].push(item);
            }
        });

        const embed = new EmbedBuilder()
            .setTitle(`🎰 Gacha Items ${filter ? `(${filter})` : ''}`)
            .setColor(COLORS.INFO)
            .setDescription(`Total items: ${items.length}`)
            .setTimestamp();

        Object.entries(rarityGroups).forEach(([rarity, rarityItems]) => {
            if (rarityItems.length === 0) return;

            const rarityEmoji = gachaService.getRarityEmoji(rarity);
            let itemText = '';

            rarityItems.forEach(item => {
                const emoji = gachaService.formatEmoji(item.emojiId, item.emojiName);
                const status = item.isActive ? '✅' : '❌';
                const series = item.seriesId ? ` [${item.seriesId}]` : '';
                itemText += `${status} ${emoji} **${item.itemName}** (${item.dropRate}%)${series}\n`;
            });

            embed.addFields({
                name: `${rarityEmoji} ${rarity.toUpperCase()} (${rarityItems.length})`,
                value: itemText || 'None',
                inline: false
            });
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async handleRemoveItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        
        const item = await GachaItem.findOneAndDelete({ itemId });
        if (!item) {
            throw new Error(`Item with ID "${itemId}" not found.`);
        }

        await interaction.editReply({
            content: `✅ Successfully removed item: **${item.itemName}** (${itemId})`
        });
    },

    async handleToggleItem(interaction) {
        const itemId = interaction.options.getString('item-id');
        
        const item = await GachaItem.findOne({ itemId });
        if (!item) {
            throw new Error(`Item with ID "${itemId}" not found.`);
        }

        item.isActive = !item.isActive;
        await item.save();

        const status = item.isActive ? 'enabled' : 'disabled';
        await interaction.editReply({
            content: `✅ Successfully ${status} item: **${item.itemName}** (${itemId})`
        });
    },

    async handleCreateSeries(interaction) {
        const seriesId = interaction.options.getString('series-id');
        const rewardData = {
            itemId: interaction.options.getString('reward-id'),
            itemName: interaction.options.getString('reward-name'),
            emojiName: interaction.options.getString('reward-emoji'),
            emojiId: interaction.options.getString('reward-emoji-id')
        };

        // Update all items in the series with the completion reward
        const result = await GachaItem.updateMany(
            { seriesId },
            { $set: { completionReward: rewardData } }
        );

        if (result.matchedCount === 0) {
            throw new Error(`No items found with series ID: ${seriesId}`);
        }

        await interaction.editReply({
            content: `✅ Successfully set completion reward for series "${seriesId}" (${result.matchedCount} items updated)`
        });
    },

    async handleImportPreset(interaction) {
        const preset = interaction.options.getString('preset');
        
        const presets = {
            triforce: [
                {
                    itemId: 'triforce_power',
                    itemName: 'Triforce of Power',
                    description: 'One third of the legendary Triforce',
                    itemType: 'series',
                    seriesId: 'triforce',
                    rarity: 'rare',
                    dropRate: 8,
                    emojiName: 'triforce_power',
                    flavorText: 'The Triforce of Power, symbol of strength and conquest.',
                    completionReward: {
                        itemId: 'complete_triforce',
                        itemName: 'Complete Triforce',
                        emojiName: 'complete_triforce'
                    }
                },
                {
                    itemId: 'triforce_wisdom',
                    itemName: 'Triforce of Wisdom',
                    description: 'One third of the legendary Triforce',
                    itemType: 'series',
                    seriesId: 'triforce',
                    rarity: 'rare',
                    dropRate: 8,
                    emojiName: 'triforce_wisdom',
                    flavorText: 'The Triforce of Wisdom, symbol of knowledge and magic.',
                    completionReward: {
                        itemId: 'complete_triforce',
                        itemName: 'Complete Triforce',
                        emojiName: 'complete_triforce'
                    }
                },
                {
                    itemId: 'triforce_courage',
                    itemName: 'Triforce of Courage',
                    description: 'One third of the legendary Triforce',
                    itemType: 'series',
                    seriesId: 'triforce',
                    rarity: 'rare',
                    dropRate: 8,
                    emojiName: 'triforce_courage',
                    flavorText: 'The Triforce of Courage, symbol of bravery and heroism.',
                    completionReward: {
                        itemId: 'complete_triforce',
                        itemName: 'Complete Triforce',
                        emojiName: 'complete_triforce'
                    }
                }
            ]
            // Add more presets here...
        };

        const presetData = presets[preset];
        if (!presetData) {
            throw new Error(`Preset "${preset}" not found.`);
        }

        let importedCount = 0;
        let skippedCount = 0;

        for (const itemData of presetData) {
            const existingItem = await GachaItem.findOne({ itemId: itemData.itemId });
            if (existingItem) {
                skippedCount++;
                continue;
            }

            const newItem = new GachaItem({
                ...itemData,
                createdBy: interaction.user.username
            });
            
            await newItem.save();
            importedCount++;
        }

        await interaction.editReply({
            content: `✅ Preset "${preset}" imported!\n` +
                    `• **Imported:** ${importedCount} items\n` +
                    `• **Skipped:** ${skippedCount} items (already exist)`
        });
    }
};
