import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from 'discord.js';
import { Game } from '../../models/index.js';
import { createErrorEmbed, formatRequirements, formatPeriod } from '../../utils/index.js';
import { getCurrentPeriod } from '../../utils/dateUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('games')
        .setDescription('View current monthly and shadow games')
        .addBooleanOption(option =>
            option.setName('show_requirements')
                .setDescription('Show achievement requirements for each game')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const showRequirements = interaction.options.getBoolean('show_requirements') ?? true;
            const { month, year } = getCurrentPeriod();

            // Get current games
            const games = await Game.find({
                month,
                year,
                active: true
            }).sort({ type: -1 }); // Sort so MONTHLY comes before SHADOW

            if (games.length === 0) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'No Active Games',
                        'There are no active games for this month yet.'
                    )]
                });
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`🎮 Games for ${formatPeriod(month, year)}`)
                .setDescription('Current monthly challenge and shadow game:')
                .setTimestamp();

            // Add each game to the embed
            for (const game of games) {
                const icon = game.type === 'MONTHLY' ? '🎮' : '👻';
                const title = `${icon} ${game.type === 'MONTHLY' ? 'Monthly Challenge' : 'Shadow Game'}`;
                
                let description = `**${game.title}**`;
                
                if (showRequirements) {
                    const requirements = formatRequirements(
                        game.progression,
                        game.winCondition,
                        game.requireProgression,
                        game.requireAllWinConditions
                    );
                    
                    if (requirements) {
                        description += `\n\nRequirements:\n${requirements}`;
                    }

                    if (game.type === 'MONTHLY' && game.masteryCheck) {
                        description += '\n\n🌟 This game is eligible for mastery points!';
                    }
                }

                embed.addFields({
                    name: title,
                    value: description,
                    inline: false
                });
            }

            // Add footer with points reminder
            embed.setFooter({
                text: 'Participation: 1 point | Beaten: 3 points | Mastery (Monthly only): 3 points'
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error executing games command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                'An error occurred while fetching the games. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
