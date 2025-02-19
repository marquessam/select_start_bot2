import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from 'discord.js';
import { arcadeService } from '../../services/index.js';
import { createErrorEmbed } from '../../utils/index.js';
import { isValidGameId } from '../../utils/formatUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arcade')
        .setDescription('View arcade leaderboards and points')
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View the arcade points leaderboard'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('points')
                .setDescription('View your arcade points')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('RetroAchievements username (leave empty for your own points)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('game')
                .setDescription('View community leaderboard for a specific game')
                .addStringOption(option =>
                    option.setName('game_id')
                        .setDescription('RetroAchievements game ID')
                        .setRequired(true))),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'leaderboard': {
                    const leaderboard = await arcadeService.getArcadeLeaderboard();

                    const embed = new EmbedBuilder()
                        .setColor('#ffd700')
                        .setTitle('🕹️ Arcade Points Leaderboard')
                        .setDescription('Current arcade points rankings:')
                        .setTimestamp();

                    if (leaderboard.length > 0) {
                        const topPlayers = leaderboard
                            .slice(0, 10)
                            .map((entry, index) => {
                                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '▫️';
                                return `${medal} ${entry.username}: ${entry.points} points (${entry.gamesRanked} games)`;
                            })
                            .join('\n');

                        embed.addFields({ 
                            name: 'Top Players', 
                            value: topPlayers,
                            inline: false 
                        });
                    } else {
                        embed.addFields({ 
                            name: 'Rankings', 
                            value: 'No arcade points earned yet',
                            inline: false 
                        });
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'points': {
                    const username = interaction.options.getString('username');
                    const points = await arcadeService.getUserArcadePoints(username);

                    const embed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle(`🕹️ Arcade Points - ${points.username}`)
                        .setDescription(`Total Points: ${points.totalPoints}`)
                        .setTimestamp();

                    if (points.details.length > 0) {
                        const details = points.details
                            .map(p => {
                                const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : '🥉';
                                const expires = new Date(p.expiresAt).toLocaleDateString();
                                return `${medal} ${p.game}: ${p.points} points (expires ${expires})`;
                            })
                            .join('\n');

                        embed.addFields({ 
                            name: 'Active Points', 
                            value: details,
                            inline: false 
                        });
                    } else {
                        embed.addFields({ 
                            name: 'Active Points', 
                            value: 'No active arcade points',
                            inline: false 
                        });
                    }

                    embed.setFooter({
                        text: 'Points expire 30 days after earning them'
                    });

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'game': {
                    const gameId = interaction.options.getString('game_id');

                    if (!isValidGameId(gameId)) {
                        return interaction.editReply({
                            embeds: [createErrorEmbed(
                                'Invalid Game ID',
                                'Please provide a valid RetroAchievements game ID.'
                            )]
                        });
                    }

                    const leaderboard = await arcadeService.getCommunityLeaderboard(gameId);

                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(`🎮 Community Leaderboard`)
                        .setDescription(`Top community scores for game ${gameId}:`)
                        .setTimestamp();

                    if (leaderboard.length > 0) {
                        const rankings = leaderboard
                            .map(entry => {
                                const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : '▫️';
                                const points = entry.points > 0 ? ` (${entry.points} points)` : '';
                                return `${medal} ${entry.username}: ${entry.score}${points}`;
                            })
                            .join('\n');

                        embed.addFields({ 
                            name: 'Rankings', 
                            value: rankings,
                            inline: false 
                        });
                    } else {
                        embed.addFields({ 
                            name: 'Rankings', 
                            value: 'No community members on leaderboard yet',
                            inline: false 
                        });
                    }

                    embed.setFooter({
                        text: '🥇 3 points | 🥈 2 points | 🥉 1 point'
                    });

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }
            }
        } catch (error) {
            console.error('Error executing arcade command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                'An error occurred while fetching arcade data. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
