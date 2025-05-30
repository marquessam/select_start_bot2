// src/commands/admin/manageTrophyEmojis.js - Database-driven emoji management (safer version)
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import { TrophyEmoji } from '../../models/TrophyEmoji.js';

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
                        .setDescription('The emoji (paste the actual emoji here: <:name:id>)')
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
            return interaction.editReply('❌ Invalid emoji format. Please paste a custom Discord emoji like `<:name:123456>`');
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
        
        try {
            // Save to database using the model's static method
            const savedEmoji = await TrophyEmoji.setEmoji(type, monthKey, emojiId, emojiName);
            
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
                .setFooter({ text: 'Emoji saved to database successfully' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error saving emoji:', error);
            await interaction.editReply('❌ An error occurred while saving the emoji to the database.');
        }
    },

    async handleListEmojis(interaction) {
        try {
            // Get all emojis from database
            const allEmojis = await TrophyEmoji.getAllEmojis();
            
            const embed = new EmbedBuilder()
                .setTitle('🏆 Trophy Emoji Configuration')
                .setColor('#0099ff')
                .setTimestamp();

            // Group emojis by type
            const monthlyEmojis = allEmojis.filter(e => e.challengeType === 'monthly');
            const shadowEmojis = allEmojis.filter(e => e.challengeType === 'shadow');
            
            // Monthly emojis
            let monthlyText = '';
            if (monthlyEmojis.length > 0) {
                monthlyEmojis.forEach(emoji => {
                    monthlyText += `${emoji.monthKey}: <:${emoji.emojiName}:${emoji.emojiId}>\n`;
                });
            } else {
                monthlyText = 'No monthly emojis configured\n';
            }
            
            // Shadow emojis
            let shadowText = '';
            if (shadowEmojis.length > 0) {
                shadowEmojis.forEach(emoji => {
                    shadowText += `${emoji.monthKey}: <:${emoji.emojiName}:${emoji.emojiId}>\n`;
                });
            } else {
                shadowText = 'No shadow emojis configured\n';
            }

            // Show all months for reference
            const allMonths = [
                '2025-01', '2025-02', '2025-03', '2025-04', 
                '2025-05', '2025-06', '2025-07', '2025-08', 
                '2025-09', '2025-10', '2025-11', '2025-12'
            ];
            
            const configuredMonthly = new Set(monthlyEmojis.map(e => e.monthKey));
            const configuredShadow = new Set(shadowEmojis.map(e => e.monthKey));
            
            let statusText = '';
            allMonths.forEach(month => {
                const monthlyStatus = configuredMonthly.has(month) ? '✅' : '❌';
                const shadowStatus = configuredShadow.has(month) ? '✅' : '❌';
                statusText += `${month}: Monthly ${monthlyStatus} Shadow ${shadowStatus}\n`;
            });

            embed.addFields(
                { name: 'Monthly Challenge Emojis', value: monthlyText, inline: true },
                { name: 'Shadow Challenge Emojis', value: shadowText, inline: true },
                { name: 'Configuration Status', value: statusText, inline: false }
            );

            embed.setFooter({ 
                text: `Total configured: ${allEmojis.length} | ✅ = Configured, ❌ = Using default` 
            });

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error listing emojis:', error);
            await interaction.editReply('❌ An error occurred while listing emojis.');
        }
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
        
        try {
            // Remove from database
            const deletedEmoji = await TrophyEmoji.clearEmoji(type, monthKey);
            
            if (!deletedEmoji) {
                return interaction.editReply({
                    content: `❌ No emoji found for ${type} challenge ${month.toUpperCase()} (${monthKey})`,
                    ephemeral: true
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('🗑️ Trophy Emoji Cleared')
                .setDescription(
                    `**Type:** ${type.charAt(0).toUpperCase() + type.slice(1)} Challenge\n` +
                    `**Month:** ${month.toUpperCase()} (${monthKey})\n` +
                    `**Cleared:** <:${deletedEmoji.emojiName}:${deletedEmoji.emojiId}>\n\n` +
                    `Emoji has been removed and will use default fallback.`
                )
                .setColor('#FFA500')
                .setFooter({ text: 'Emoji removed from database successfully' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error clearing emoji:', error);
            await interaction.editReply('❌ An error occurred while clearing the emoji.');
        }
    }
};
