import { SlashCommandBuilder } from '@discordjs/builders';
import { Nomination } from '../../models/index.js';
import { nominationService } from '../../services/index.js';
import { createErrorEmbed, createSuccessEmbed } from '../../utils/index.js';
import { canManageNominations } from '../../utils/permissions.js';
import { getCurrentPeriod, formatPeriod } from '../../utils/dateUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('manage-nominations')
        .setDescription('Manage game nominations')
        .addSubcommand(subcommand =>
            subcommand
                .setName('approve')
                .setDescription('Approve a nomination')
                .addStringOption(option =>
                    option.setName('nomination_id')
                        .setDescription('ID of the nomination to approve')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('notes')
                        .setDescription('Optional notes about the approval')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reject')
                .setDescription('Reject a nomination')
                .addStringOption(option =>
                    option.setName('nomination_id')
                        .setDescription('ID of the nomination to reject')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for rejection')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('select-winners')
                .setDescription('Select monthly and shadow games from approved nominations')),

    async execute(interaction) {
        try {
            // Check permissions
            if (!canManageNominations(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed(
                        'Permission Denied',
                        'You do not have permission to manage nominations.'
                    )],
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'approve': {
                    const nominationId = interaction.options.getString('nomination_id');
                    const notes = interaction.options.getString('notes');

                    const nomination = await nominationService.updateNominationStatus(
                        nominationId,
                        'APPROVED',
                        notes
                    );

                    const embed = createSuccessEmbed(
                        'Nomination Approved',
                        `Successfully approved nomination for ${nomination.gameTitle}`
                    );

                    embed.addFields(
                        { name: 'Game', value: nomination.gameTitle, inline: true },
                        { name: 'Platform', value: nomination.platform || 'Unknown', inline: true },
                        { name: 'Nominated By', value: nomination.nominatedBy, inline: true }
                    );

                    if (notes) {
                        embed.addFields({ name: 'Notes', value: notes });
                    }

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'reject': {
                    const nominationId = interaction.options.getString('nomination_id');
                    const reason = interaction.options.getString('reason');

                    const nomination = await nominationService.updateNominationStatus(
                        nominationId,
                        'REJECTED',
                        reason
                    );

                    const embed = createSuccessEmbed(
                        'Nomination Rejected',
                        `Successfully rejected nomination for ${nomination.gameTitle}`
                    );

                    embed.addFields(
                        { name: 'Game', value: nomination.gameTitle, inline: true },
                        { name: 'Platform', value: nomination.platform || 'Unknown', inline: true },
                        { name: 'Nominated By', value: nomination.nominatedBy, inline: true },
                        { name: 'Reason', value: reason }
                    );

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }

                case 'select-winners': {
                    const { month, year } = getCurrentPeriod();
                    const nextMonth = month === 12 ? 1 : month + 1;
                    const nextYear = month === 12 ? year + 1 : year;

                    // Check if we have enough approved nominations
                    const approvedCount = await Nomination.countDocuments({
                        voteMonth: `${nextYear}-${nextMonth.toString().padStart(2, '0')}`,
                        status: 'APPROVED'
                    });

                    if (approvedCount < 2) {
                        return interaction.editReply({
                            embeds: [createErrorEmbed(
                                'Not Enough Nominations',
                                'There must be at least 2 approved nominations to select winners.'
                            )]
                        });
                    }

                    // Select winners
                    const selectedGames = await nominationService.selectWinners(nextMonth, nextYear);

                    const embed = createSuccessEmbed(
                        'Winners Selected',
                        `Successfully selected games for ${formatPeriod(nextMonth, nextYear)}`
                    );

                    const monthlyGame = selectedGames.find(g => g.type === 'MONTHLY');
                    const shadowGame = selectedGames.find(g => g.type === 'SHADOW');

                    embed.addFields(
                        { name: '🎮 Monthly Challenge', value: monthlyGame.title, inline: false },
                        { name: '👻 Shadow Game', value: shadowGame.title, inline: false }
                    );

                    embed.setFooter({
                        text: 'Remember to set achievement requirements using /add-game'
                    });

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }
            }

            // Send updated nominations list
            const { month, year } = getCurrentPeriod();
            const nextMonth = month === 12 ? 1 : month + 1;
            const nextYear = month === 12 ? year + 1 : year;

            const nominationsEmbed = await nominationService.generateNominationsEmbed(
                nextMonth,
                nextYear
            );

            await interaction.followUp({ embeds: [nominationsEmbed] });
        } catch (error) {
            console.error('Error executing manage-nominations command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                'An error occurred while managing nominations. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
