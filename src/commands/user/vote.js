import { SlashCommandBuilder } from '@discordjs/builders';
import { Nomination } from '../../models/index.js';
import { nominationService } from '../../services/index.js';
import { createErrorEmbed, createSuccessEmbed } from '../../utils/index.js';
import { getCurrentPeriod, formatPeriod } from '../../utils/dateUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for a nominated game')
        .addStringOption(option =>
            option.setName('nomination_id')
                .setDescription('ID of the nomination to vote for')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('remove')
                .setDescription('Remove your vote instead of adding it')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const nominationId = interaction.options.getString('nomination_id');
            const isRemoving = interaction.options.getBoolean('remove') ?? false;

            // Calculate voting month (next month)
            const { month: currentMonth, year: currentYear } = getCurrentPeriod();
            const votingDate = new Date(currentYear, currentMonth - 1);
            votingDate.setMonth(votingDate.getMonth() + 1);
            const votingMonth = votingDate.getMonth() + 1;
            const votingYear = votingDate.getFullYear();

            // Check if nomination exists and is valid for voting
            const nomination = await Nomination.findById(nominationId);
            if (!nomination) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Nomination Not Found',
                        'This nomination ID was not found.'
                    )]
                });
            }

            // Check if nomination is for the correct month
            const voteMonth = `${votingYear}-${votingMonth.toString().padStart(2, '0')}`;
            if (nomination.voteMonth !== voteMonth) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Invalid Nomination',
                        'This nomination is not for the upcoming month.'
                    )]
                });
            }

            // Check if nomination is approved and available for voting
            if (nomination.status !== 'APPROVED') {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Voting Not Available',
                        nomination.status === 'PENDING'
                            ? 'This nomination has not been approved for voting yet.'
                            : 'This nomination is no longer available for voting.'
                    )]
                });
            }

            // Add or remove vote
            const success = isRemoving
                ? await nominationService.toggleVote(nominationId, interaction.user.id, false)
                : await nominationService.toggleVote(nominationId, interaction.user.id, true);

            if (!success) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Vote Failed',
                        isRemoving
                            ? 'You haven\'t voted for this game.'
                            : 'You have already voted for this game.'
                    )]
                });
            }

            // Create success embed
            const embed = createSuccessEmbed(
                isRemoving ? 'Vote Removed' : 'Vote Added',
                `Successfully ${isRemoving ? 'removed vote from' : 'voted for'} ${nomination.gameTitle}`
            );

            embed.addFields(
                { name: 'Game', value: nomination.gameTitle, inline: true },
                { name: 'Platform', value: nomination.platform || 'Unknown', inline: true },
                { name: 'Current Votes', value: nomination.votes.toString(), inline: true }
            );

            await interaction.editReply({ embeds: [embed] });

            // Generate and send updated nominations list
            const nominationsEmbed = await nominationService.generateNominationsEmbed(
                votingMonth,
                votingYear
            );

            await interaction.followUp({ embeds: [nominationsEmbed] });
        } catch (error) {
            console.error('Error executing vote command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                'An error occurred while processing your vote. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
