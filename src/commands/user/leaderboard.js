import { SlashCommandBuilder } from '@discordjs/builders';
import { leaderboardService } from '../../services/index.js';
import { createErrorEmbed } from '../../utils/index.js';
import { getCurrentPeriod, isValidPeriod } from '../../utils/dateUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the leaderboard')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Leaderboard type')
                .setRequired(true)
                .addChoices(
                    { name: 'Monthly', value: 'monthly' },
                    { name: 'Yearly', value: 'yearly' }
                ))
        .addIntegerOption(option =>
            option.setName('month')
                .setDescription('Month number (1-12)')
                .setMinValue(1)
                .setMaxValue(12))
        .addIntegerOption(option =>
            option.setName('year')
                .setDescription('Year')
                .setMinValue(2000)
                .setMaxValue(2100)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const type = interaction.options.getString('type');
            let month = interaction.options.getInteger('month');
            let year = interaction.options.getInteger('year');

            // If month/year not provided, use current period
            if (!month || !year) {
                const currentPeriod = getCurrentPeriod();
                month = month || currentPeriod.month;
                year = year || currentPeriod.year;
            }

            // Validate period
            if (!isValidPeriod(month, year)) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Invalid Period',
                        'Please provide a valid month (1-12) and year.'
                    )]
                });
            }

            // Generate appropriate leaderboard
            const embed = type === 'monthly'
                ? await leaderboardService.generateMonthlyLeaderboard(month, year)
                : await leaderboardService.generateYearlyLeaderboard(year);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error executing leaderboard command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                'An error occurred while fetching the leaderboard. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
