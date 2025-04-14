import { SlashCommandBuilder } from 'discord.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('checkracingboard')
        .setDescription('View details of a racing board for debugging')
        .addStringOption(option =>
            option.setName('month')
            .setDescription('Month name or YYYY-MM format of the racing board to check')
            .setRequired(true)),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const monthParam = interaction.options.getString('month');
            let racingBoard;
            
            // Check if the input is a month name or YYYY-MM format
            if (/^\d{4}-\d{2}$/.test(monthParam)) {
                // YYYY-MM format
                racingBoard = await ArcadeBoard.findOne({
                    boardType: 'racing',
                    monthKey: monthParam
                });
            } else {
                // Try to parse as a month name
                const monthNames = [
                    'january', 'february', 'march', 'april', 'may', 'june',
                    'july', 'august', 'september', 'october', 'november', 'december'
                ];
                
                const monthIndex = monthNames.findIndex(m => 
                    m.toLowerCase() === monthParam.toLowerCase()
                );
                
                if (monthIndex === -1) {
                    return interaction.editReply(`Invalid month format. Please use a month name (e.g., "january") or YYYY-MM format (e.g., "2025-01").`);
                }
                
                // Current year by default
                const now = new Date();
                const year = now.getFullYear();
                
                // Look for any racing board with this month and current year
                const monthKey = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}`;
                
                racingBoard = await ArcadeBoard.findOne({
                    boardType: 'racing',
                    monthKey: monthKey
                });
                
                // If not found, check previous year
                if (!racingBoard) {
                    const prevYearMonthKey = `${year - 1}-${(monthIndex + 1).toString().padStart(2, '0')}`;
                    racingBoard = await ArcadeBoard.findOne({
                        boardType: 'racing',
                        monthKey: prevYearMonthKey
                    });
                }
            }
            
            if (!racingBoard) {
                return interaction.editReply(`No racing board found for ${monthParam}.`);
            }
            
            // Create detailed output of all board properties
            let resultsText = '';
            if (racingBoard.results && racingBoard.results.length > 0) {
                resultsText = '\n\nStored Results:\n';
                racingBoard.results.forEach(result => {
                    resultsText += `- Rank ${result.rank}: ${result.username} (${result.time}) - ${result.points} points\n`;
                });
            }
            
            const response = `
**Racing Board Details for ${racingBoard.monthKey}**

- **Board ID**: \`${racingBoard.boardId}\`
- **Game**: ${racingBoard.gameTitle}
- **Track**: ${racingBoard.trackName || 'Not specified'}
- **Leaderboard ID**: ${racingBoard.leaderboardId}
- **Game ID**: ${racingBoard.gameId}
- **Description**: ${racingBoard.description}
- **Month Key**: ${racingBoard.monthKey}
- **Start Date**: ${racingBoard.startDate.toLocaleString()}
- **End Date**: ${racingBoard.endDate.toLocaleString()}
- **Points Awarded**: ${racingBoard.pointsAwarded ? 'Yes' : 'No'}
- **Created At**: ${racingBoard.createdAt.toLocaleString()}${resultsText}
`;
            
            return interaction.editReply(response);
            
        } catch (error) {
            console.error('Error checking racing board:', error);
            return interaction.editReply('An error occurred while checking the racing board. Please try again.');
        }
    }
};
