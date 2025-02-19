import { SlashCommandBuilder } from '@discordjs/builders';
import { Award, User } from '../../models/index.js';
import { createErrorEmbed, createSuccessEmbed } from '../../utils/index.js';
import { canManageAwards } from '../../utils/permissions.js';
import { getCurrentPeriod, formatPeriod } from '../../utils/dateUtils.js';
import { AwardType } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('manage-awards')
        .setDescription('Manage user awards and points')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-points')
                .setDescription('Add points to a user')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('RetroAchievements username')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('points')
                        .setDescription('Number of points to add')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for adding points')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-points')
                .setDescription('Remove points from a user')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('RetroAchievements username')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('points')
                        .setDescription('Number of points to remove')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for removing points')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-award')
                .setDescription('Set a user\'s award level for a game')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('RetroAchievements username')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('game_id')
                        .setDescription('RetroAchievements game ID')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('award')
                        .setDescription('Award level')
                        .setRequired(true)
                        .addChoices(
                            { name: 'None', value: 'NONE' },
                            { name: 'Participation', value: 'PARTICIPATION' },
                            { name: 'Beaten', value: 'BEATEN' },
                            { name: 'Mastery', value: 'MASTERY' }
                        ))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for setting award')
                        .setRequired(true))),

    async execute(interaction) {
        try {
            // Check permissions
            if (!canManageAwards(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed(
                        'Permission Denied',
                        'You do not have permission to manage awards.'
                    )],
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const subcommand = interaction.options.getSubcommand();
            const username = interaction.options.getString('username');
            const reason = interaction.options.getString('reason');

            // Find user
            const user = await User.findByRAUsername(username);
            if (!user) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'User Not Found',
                        'This RetroAchievements username is not registered.'
                    )]
                });
            }

            const { month, year } = getCurrentPeriod();

            switch (subcommand) {
                case 'add-points':
                case 'remove-points': {
                    const points = interaction.options.getInteger('points');
                    const isAdding = subcommand === 'add-points';
                    const adjustedPoints = isAdding ? points : -points;

                    // Create manual award record
                    const award = new Award({
                        raUsername: user.raUsername,
                        gameId: '0', // Special case for manual adjustments
                        month,
                        year,
                        award: AwardType.NONE,
                        reason,
                        awardedBy: interaction.user.tag
                    });

                    await award.save();

                    // Update user points
                    user.updatePoints(month, year, adjustedPoints);
                    await user.save();

                    const embed = createSuccessEmbed(
                        isAdding ? 'Points Added' : 'Points Removed',
                        `Successfully ${isAdding ? 'added' : 'removed'} ${points} points ${isAdding ? 'to' : 'from'} ${user.raUsername}`
                    );

                    embed.addFields(
                        { name: 'User', value: user.raUsername, inline: true },
                        { name: 'Points', value: `${isAdding ? '+' : '-'}${points}`, inline: true },
                        { name: 'New Total', value: user.totalPoints.toString(), inline: true },
                        { name: 'Reason', value: reason }
                    );

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'set-award': {
                    const gameId = interaction.options.getString('game_id');
                    const awardLevel = interaction.options.getString('award');
                    const awardType = AwardType[awardLevel];

                    // Update or create award
                    const award = await Award.findOneAndUpdate(
                        {
                            raUsername: user.raUsername,
                            gameId,
                            month,
                            year
                        },
                        {
                            award: awardType,
                            reason,
                            awardedBy: interaction.user.tag,
                            lastChecked: new Date(),
                            awardedAt: new Date()
                        },
                        { upsert: true, new: true }
                    );

                    const embed = createSuccessEmbed(
                        'Award Updated',
                        `Successfully set award for ${user.raUsername}`
                    );

                    embed.addFields(
                        { name: 'User', value: user.raUsername, inline: true },
                        { name: 'Game ID', value: gameId, inline: true },
                        { name: 'Award', value: awardLevel, inline: true },
                        { name: 'Reason', value: reason }
                    );

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }
            }
        } catch (error) {
            console.error('Error executing manage-awards command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                'An error occurred while managing awards. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
