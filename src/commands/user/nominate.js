import { SlashCommandBuilder } from '@discordjs/builders';
import { nominationService, retroAPI } from '../../services/index.js';
import { createErrorEmbed, createSuccessEmbed, isValidGameId } from '../../utils/index.js';
import { getCurrentPeriod, formatPeriod } from '../../utils/dateUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nominate')
        .setDescription('Nominate a game for next month\'s challenge')
        .addStringOption(option =>
            option.setName('game_id')
                .setDescription('RetroAchievements game ID')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Why are you nominating this game?')
                .setRequired(false)
                .setMaxLength(500)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const gameId = interaction.options.getString('game_id');
            const reason = interaction.options.getString('reason');

            // Validate game ID
            if (!isValidGameId(gameId)) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Invalid Game ID',
                        'Please provide a valid RetroAchievements game ID.'
                    )]
                });
            }

            // Get game info from RetroAchievements
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Game Not Found',
                        'This game ID was not found on RetroAchievements.'
                    )]
                });
            }

            // Calculate nomination month (next month)
            const { month: currentMonth, year: currentYear } = getCurrentPeriod();
            const nominationDate = new Date(currentYear, currentMonth - 1);
            nominationDate.setMonth(nominationDate.getMonth() + 1);
            const nominationMonth = nominationDate.getMonth() + 1;
            const nominationYear = nominationDate.getFullYear();

            // Create nomination
            const nomination = await nominationService.createNomination(
                interaction.user.id,
                gameInfo.title,
                parseInt(gameId),
                interaction.user.tag,
                nominationMonth,
                nominationYear
            );

            // Create success embed
            const embed = createSuccessEmbed(
                'Game Nominated',
                `Successfully nominated game for ${formatPeriod(nominationMonth, nominationYear)}`
            );

            embed.addFields(
                { name: 'Game', value: gameInfo.title, inline: true },
                { name: 'Console', value: gameInfo.consoleName, inline: true },
                { name: 'Nominated By', value: interaction.user.tag, inline: true }
            );

            if (reason) {
                embed.addFields({
                    name: 'Reason',
                    value: reason
                });
            }

            // Add achievement info
            const achievements = await retroAPI.getGameAchievements(gameId);
            const totalAchievements = Object.keys(achievements).length;

            embed.addFields({
                name: 'Achievements',
                value: `${totalAchievements} achievement${totalAchievements === 1 ? '' : 's'} available`
            });

            // Add note about approval
            embed.setFooter({
                text: 'Your nomination will be reviewed by moderators before being added to the voting pool.'
            });

            await interaction.editReply({ embeds: [embed] });

            // Generate and send updated nominations list to the channel
            const nominationsEmbed = await nominationService.generateNominationsEmbed(
                nominationMonth,
                nominationYear
            );

            await interaction.followUp({ embeds: [nominationsEmbed] });
        } catch (error) {
            console.error('Error executing nominate command:', error);

            let errorMessage = 'An error occurred while processing your nomination.';
            if (error.message === 'This game has already been nominated this month') {
                errorMessage = 'This game has already been nominated for next month.';
            }

            const errorEmbed = createErrorEmbed('Error', errorMessage);

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
