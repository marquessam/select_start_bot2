// src/commands/admin/manageTrophyEmojis.js - Easy emoji management
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import fs from 'fs/promises';
import path from 'path';

export default {
    data: new SlashCommandBuilder()
        .setName('managetrophyemojis')
        .setDescription('Manage trophy emojis')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set emoji ID for a specific trophy')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Challenge type')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Monthly Challenge', value: 'monthly' },
                            { name: 'Shadow Challenge', value: 'shadow' }
                        ))
                .addStringOption(option =>
                    option.setName('month')
                        .setDescription('Month (jan, feb, mar, etc.)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'January', value: 'jan' },
                            { name: 'February', value: 'feb' },
                            { name: 'March', value: 'mar' },
                            { name: 'April', value: 'apr' },
                            { name: 'May', value: 'may' },
                            { name: 'June', value: 'jun' },
                            { name: 'July', value: 'jul' },
                            { name: 'August', value: 'aug' },
                            { name: 'September', value: 'sep' },
                            { name: 'October', value: 'oct' },
                            { name: 'November', value: 'nov' },
                            { name: 'December', value: 'dec' }
                        ))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('The emoji (paste the actual emoji here)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List current emoji mappings'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear emoji ID for a specific trophy')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Challenge type')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Monthly Challenge', value: 'monthly' },
                            { name: 'Shadow Challenge', value: 'shadow' }
                        ))
                .addStringOption(option =>
                    option.setName('month')
                        .setDescription('Month (jan, feb, mar, etc.)')
                        .setRequired(true)
                        .addChoices(
                            { name: 'January', value: 'jan' },
                            { name: 'February', value: 'feb' },
                            { name: 'March', value: 'mar' },
                            { name: 'April', value: 'apr' },
                            { name: 'May', value: 'may' },
                            { name: 'June', value: 'jun' },
                            { name: 'July', value: 'jul' },
                            { name: 'August', value: 'aug' },
                            { name: 'September', value: 'sep' },
                            { name: 'October', value: 'oct' },
                            { name: 'November', value: 'nov' },
                            { name: 'December', value: 'dec' }
                        ))),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'set':
                    await this.handleSetEmoji(interaction);
                    break;
                case 'list':
                    await this.handleListEmojis(interaction);
                    break;
                case 'clear':
                    await this.handleClearEmoji(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error managing trophy emojis:', error);
            await interaction.editReply('❌ An error occurred while managing emojis.');
        }
    },

    async handleSetEmoji(interaction) {
        const type = interaction.options.getString('type');
        const month = interaction.options.getString('month');
        const emojiInput = interaction.options.getString('emoji');

        // Extract emoji ID and name from the input
        const emojiMatch = emojiInput.match(/<:([^:]+):(\d+)>/);
        
        if (!emojiMatch) {
            return interaction.editReply('❌ Invalid emoji format. Please paste a custom Discord emoji.');
        }

        const emojiName = emojiMatch[1];
        const emojiId = emojiMatch[2];
        
        // Generate month key (2025-MM format)
        const monthMap = {
            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
            'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
            'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };
        
        const monthKey = `2025-${monthMap[month]}`;
        
        // Update the emoji configuration file
        await this.updateEmojiConfig(type, monthKey, emojiName, emojiId);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Trophy Emoji Updated')
            .setDescription(
                `**Type:** ${type.charAt(0).toUpperCase() + type.slice(1)} Challenge\n` +
                `**Month:** ${month.toUpperCase()} (${monthKey})\n` +
                `**Emoji:** ${emojiInput}\n` +
                `**Name:** ${emojiName}\n` +
                `**ID:** ${emojiId}`
            )
            .setColor('#00FF00')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async handleListEmojis(interaction) {
        // Read current emoji configuration
        const emojiConfig = await this.readEmojiConfig();
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 Trophy Emoji Configuration')
            .setColor('#0099ff')
            .setTimestamp();

        // Monthly emojis
        let monthlyText = '';
        for (const [monthKey, emoji] of Object.entries(emojiConfig.monthly)) {
            const status = emoji.id ? `<:${emoji.name}:${emoji.id}>` : '❌ Not set';
            monthlyText += `${monthKey}: ${status}\n`;
        }
        
        // Shadow emojis
        let shadowText = '';
        for (const [monthKey, emoji] of Object.entries(emojiConfig.shadow)) {
            const status = emoji.id ? `<:${emoji.name}:${emoji.id}>` : '❌ Not set';
            shadowText += `${monthKey}: ${status}\n`;
        }

        embed.addFields(
            { name: 'Monthly Challenge Emojis', value: monthlyText || 'None set', inline: true },
            { name: 'Shadow Challenge Emojis', value: shadowText || 'None set', inline: true }
        );

        await interaction.editReply({ embeds: [embed] });
    },

    async handleClearEmoji(interaction) {
        const type = interaction.options.getString('type');
        const month = interaction.options.getString('month');
        
        // Generate month key
        const monthMap = {
            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
            'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
            'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };
        
        const monthKey = `2025-${monthMap[month]}`;
        
        // Clear the emoji (set id to null)
        await this.updateEmojiConfig(type, monthKey, `${type === 'monthly' ? 'MC' : 'SG'}-${month}`, null);
        
        const embed = new EmbedBuilder()
            .setTitle('🗑️ Trophy Emoji Cleared')
            .setDescription(
                `**Type:** ${type.charAt(0).toUpperCase() + type.slice(1)} Challenge\n` +
                `**Month:** ${month.toUpperCase()} (${monthKey})\n` +
                `Emoji has been cleared and will use default fallback.`
            )
            .setColor('#FFA500')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async updateEmojiConfig(type, monthKey, emojiName, emojiId) {
        const configPath = path.join(process.cwd(), 'src', 'config', 'trophyEmojis.js');
        
        // Read current config
        const emojiConfig = await this.readEmojiConfig();
        
        // Update the specific emoji
        if (emojiConfig[type] && emojiConfig[type][monthKey]) {
            emojiConfig[type][monthKey] = {
                name: emojiName,
                id: emojiId
            };
        }
        
        // Write back to file
        const fileContent = `// src/config/trophyEmojis.js - Central emoji configuration
export const TROPHY_EMOJIS = ${JSON.stringify(emojiConfig, null, 4)};

// Helper function to get trophy emoji
export function getTrophyEmoji(challengeType, monthKey, awardLevel) {
    // Try to get custom emoji first
    if (challengeType === 'monthly' && TROPHY_EMOJIS.monthly[monthKey]) {
        const emoji = TROPHY_EMOJIS.monthly[monthKey];
        if (emoji.id) {
            return {
                emojiId: emoji.id,
                emojiName: emoji.name
            };
        }
    }
    
    if (challengeType === 'shadow' && TROPHY_EMOJIS.shadow[monthKey]) {
        const emoji = TROPHY_EMOJIS.shadow[monthKey];
        if (emoji.id) {
            return {
                emojiId: emoji.id,
                emojiName: emoji.name
            };
        }
    }
    
    // Fall back to default emoji
    return {
        emojiId: null,
        emojiName: TROPHY_EMOJIS.defaults[awardLevel] || '🏆'
    };
}

// Utility function to format emoji for display
export function formatTrophyEmoji(emojiId, emojiName) {
    if (emojiId) {
        return \`<:\${emojiName}:\${emojiId}>\`;
    }
    return emojiName || '🏆';
}`;

        await fs.writeFile(configPath, fileContent, 'utf8');
    },

    async readEmojiConfig() {
        // This is a simplified version - in practice you'd import the actual config
        // For now, return the base structure
        return {
            monthly: {
                '2025-01': { name: 'MC_jan', id: null },
                '2025-02': { name: 'MC_feb', id: null },
                '2025-03': { name: 'MC_mar', id: null },
                '2025-04': { name: 'MC_apr', id: null },
                '2025-05': { name: 'MC_may', id: null },
                '2025-06': { name: 'MC_jun', id: null },
                '2025-07': { name: 'MC_jul', id: null },
                '2025-08': { name: 'MC_aug', id: null },
                '2025-09': { name: 'MC_sep', id: null },
                '2025-10': { name: 'MC_oct', id: null },
                '2025-11': { name: 'MC_nov', id: null },
                '2025-12': { name: 'MC_dec', id: null }
            },
            shadow: {
                '2025-01': { name: 'SG_jan', id: null },
                '2025-02': { name: 'SG_feb', id: null },
                '2025-03': { name: 'SG_mar', id: null },
                '2025-04': { name: 'SG_apr', id: null },
                '2025-05': { name: 'SG_may', id: null },
                '2025-06': { name: 'SG_jun', id: null },
                '2025-07': { name: 'SG_jul', id: null },
                '2025-08': { name: 'SG_aug', id: null },
                '2025-09': { name: 'SG_sep', id: null },
                '2025-10': { name: 'SG_oct', id: null },
                '2025-11': { name: 'SG_nov', id: null },
                '2025-12': { name: 'SG_dec', id: null }
            },
            defaults: {
                mastery: '✨',
                beaten: '⭐', 
                participation: '🏁',
                special: '🎖️'
            }
        };
    }
};
