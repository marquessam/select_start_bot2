import { SlashCommandBuilder } from 'discord.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('forcecompleteracing')
        .setDescription('Force a racing board to be completed and award points to winners')
        .addStringOption(option =>
            option.setName('month')
            .setDescription('Month name or YYYY-MM format of the racing board to complete')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('first_place')
            .setDescription('Username of the first place winner (3 points)')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('second_place')
            .setDescription('Username of the second place winner (2 points)')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('third_place')
            .setDescription('Username of the third place winner (1 point)')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('first_time')
            .setDescription('Time/score for first place (optional)')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('second_time')
            .setDescription('Time/score for second place (optional)')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('third_time')
            .setDescription('Time/score for third place (optional)')
            .setRequired(false)),

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
            const username1 = interaction.options.getString('first_place');
            const username2 = interaction.options.getString('second_place');
            const username3 = interaction.options.getString('third_place');
            const time1 = interaction.options.getString('first_time') || 'Manual Entry';
            const time2 = interaction.options.getString('second_time') || 'Manual Entry';
            const time3 = interaction.options.getString('third_time') || 'Manual Entry';
            
            // Find the racing board
            let racingBoard;
            let boardId;
            
            // Check if the input is a month name or YYYY-MM format
            if (/^\d{4}-\d{2}$/.test(monthParam)) {
                // YYYY-MM format
                const monthKey = monthParam;
                boardId = `racing-${monthKey}`;
                racingBoard = await ArcadeBoard.findOne({
                    boardId: boardId,
                    boardType: 'racing'
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
                
                // Generate month key and board ID
                const monthKey = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}`;
                boardId = `racing-${monthKey}`;
                
                // Look for the racing board
                racingBoard = await ArcadeBoard.findOne({
                    boardId: boardId,
                    boardType: 'racing'
                });
                
                // If not found, check previous year
                if (!racingBoard) {
                    const prevYearMonthKey = `${year - 1}-${(monthIndex + 1).toString().padStart(2, '0')}`;
                    const prevYearBoardId = `racing-${prevYearMonthKey}`;
                    racingBoard = await ArcadeBoard.findOne({
                        boardId: prevYearBoardId,
                        boardType: 'racing'
                    });
                    boardId = prevYearBoardId;
                }
            }
            
            if (!racingBoard) {
                return interaction.editReply(`Racing board not found for ${monthParam}. Please check the month name or format.`);
            }
            
            // Create results array and track awarded users
            const results = [];
            const awardedUsers = [];
            
            // Get month abbreviation and year for award title
            const startDate = new Date(racingBoard.startDate);
            const monthAbbrev = startDate.toLocaleString('default', { month: 'short' });
            const year = startDate.getFullYear();
            
            // Award points configuration
            const pointsDistribution = [3, 2, 1]; // 1st, 2nd, 3rd place
            const placements = ['1st place', '2nd place', '3rd place'];
            
            // Process the usernames
            const usernames = [username1, username2, username3].filter(Boolean);
            const times = [time1, time2, time3];
            
            // Award points to each user
            for (let i = 0; i < usernames.length && i < 3; i++) {
                try {
                    // Find the user (case-insensitive)
                    const user = await User.findOne({
                        raUsername: { $regex: new RegExp(`^${usernames[i]}$`, 'i') }
                    });
                    
                    if (!user) {
                        console.warn(`User ${usernames[i]} not found, skipping awards`);
                        continue;
                    }
                    
                    // Points and placement
                    const points = pointsDistribution[i];
                    const placement = placements[i];
                    
                    // Create award title in concise format
                    const awardTitle = `${monthAbbrev} ${year} Racing - ${placement}`;
                    
                    // Add award to the user
                    user.communityAwards.push({
                        title: awardTitle,
                        points: points,
                        awardedAt: new Date(),
                        awardedBy: interaction.user.tag
                    });
                    
                    await user.save();
                    awardedUsers.push(user.raUsername);
                    
                    // Add to results array for the racing board
                    results.push({
                        username: user.raUsername,
                        rank: i + 1,
                        time: times[i],
                        points: points
                    });
                } catch (userError) {
                    console.error(`Error processing user ${usernames[i]}:`, userError);
                }
            }
            
            // Update the racing board
            racingBoard.pointsAwarded = true;
            racingBoard.results = results;
            await racingBoard.save();
            
            // Get the month and year for display
            const monthName = startDate.toLocaleString('default', { month: 'long' });
            
            // Create response message
            let responseMessage = `Successfully marked ${monthName} ${year} racing board as completed and awarded points!\n\n`;
            responseMessage += `**${racingBoard.gameTitle}${racingBoard.trackName ? ` - ${racingBoard.trackName}` : ''}**\n\n`;
            responseMessage += `**Final Results:**\n`;
            
            results.forEach(result => {
                const medalEmoji = result.rank === 1 ? '🥇' : (result.rank === 2 ? '🥈' : '🥉');
                responseMessage += `${medalEmoji} **${result.username}**: ${result.time} (${result.points} point${result.points !== 1 ? 's' : ''})\n`;
            });
            
            if (awardedUsers.length > 0) {
                responseMessage += `\n✅ Points awarded to: ${awardedUsers.join(', ')}`;
            } else {
                responseMessage += `\n⚠️ No points were awarded. Check for errors in the usernames.`;
            }
            
            return interaction.editReply(responseMessage);
            
        } catch (error) {
            console.error('Error completing racing board:', error);
            return interaction.editReply('An error occurred while completing the racing board. Please try again.');
        }
    }
};
