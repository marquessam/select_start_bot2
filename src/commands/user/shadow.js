import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from 'discord.js';
import { Game, User, PlayerProgress } from '../../models/index.js';
import { createErrorEmbed } from '../../utils/index.js';
import { getCurrentPeriod } from '../../utils/dateUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shadow')
        .setDescription('View shadow game information')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check shadow game status'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('progress')
                .setDescription('Check your shadow game meta progress')),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const subcommand = interaction.options.getSubcommand();
            const { month, year } = getCurrentPeriod();
            const monthKey = `${year}-${month.toString().padStart(2, '0')}`;

            // Get current shadow game
            const shadowGame = await Game.findOne({
                type: 'SHADOW',
                month,
                year,
                active: true
            });

            if (!shadowGame) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'No Shadow Game',
                        'There is no active shadow game for this month.'
                    )]
                });
            }

            switch (subcommand) {
                case 'status': {
                    const embed = new EmbedBuilder()
                        .setColor('#9932cc')
                        .setTitle('🎭 Shadow Game Status')
                        .setTimestamp();

                    if (shadowGame.isShadowGameRevealed()) {
                        // Show full game info
                        embed.setDescription('The shadow game has been revealed!')
                            .addFields(
                                { name: 'Game', value: shadowGame.title, inline: true },
                                { 
                                    name: 'Requirements',
                                    value: `${shadowGame.requireProgression ? 'All' : 'Any'} progression achievements\n` +
                                        `${shadowGame.requireAllWinConditions ? 'All' : 'Any'} win conditions`,
                                    inline: true
                                }
                            );
                    } else if (shadowGame.meta) {
                        // Show meta challenge info
                        embed.setDescription('The shadow game remains hidden...')
                            .addFields({
                                name: 'Meta Challenge',
                                value: shadowGame.getMetaDescription(),
                                inline: false
                            });
                    } else {
                        embed.setDescription('A shadow game exists, but remains hidden...');
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'progress': {
                    const user = await User.findOne({ discordId: interaction.user.id });
                    if (!user) {
                        return interaction.editReply({
                            embeds: [createErrorEmbed(
                                'Not Registered',
                                'You need to be registered to check your progress.'
                            )]
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setColor('#9932cc')
                        .setTitle('🎭 Shadow Game Progress')
                        .setTimestamp();

                    if (shadowGame.isShadowGameRevealed()) {
                        // Show achievement progress if game is revealed
                        const progress = await PlayerProgress.findOne({
                            raUsername: user.raUsername,
                            gameId: shadowGame.gameId
                        });

                        if (progress) {
                            embed.addFields({
                                name: shadowGame.title,
                                value: `Progress: ${progress.getCompletionPercentage()}%\n` +
                                    `Achievements: ${progress.currentAchievements}/${progress.totalGameAchievements}`,
                                inline: false
                            });
                        } else {
                            embed.setDescription('You haven\'t started this game yet.');
                        }
                    } else if (shadowGame.meta) {
                        // Show meta progress
                        const progress = user.shadowGameProgress.get(monthKey) || { pieces: [], completed: false };
                        const totalPieces = shadowGame.getMetaPieces().length;

                        embed.setDescription(shadowGame.getMetaDescription())
                            .addFields({
                                name: 'Meta Progress',
                                value: `Collected ${progress.pieces.length}/${totalPieces} pieces`,
                                inline: false
                            });

                        if (progress.pieces.length > 0) {
                            embed.addFields({
                                name: 'Your Pieces',
                                value: progress.pieces.join('\n'),
                                inline: false
                            });
                        }
                    } else {
                        embed.setDescription('The shadow game remains hidden...');
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }
            }
        } catch (error) {
            console.error('Error executing shadow command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                'An error occurred while checking shadow game status. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
