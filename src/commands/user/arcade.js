import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';

// Helper function to format ordinal numbers (1st, 2nd, 3rd, etc.)
function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default {
    data: new SlashCommandBuilder()
        .setName('arcade')
        .setDescription('Display arcade leaderboards')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all available arcade boards'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('board')
                .setDescription('Show a specific arcade leaderboard')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('The board ID to display')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('racing')
                .setDescription('Show a racing challenge board')
                .addStringOption(option =>
                    option.setName('month')
                        .setDescription('Month name or YYYY-MM format (defaults to current month)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tiebreaker')
                .setDescription('Show the current tiebreaker board (if active)')),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const subcommand = interaction.options.getSubcommand();
            
            switch(subcommand) {
                case 'list':
                    await this.listArcadeBoards(interaction);
                    break;
                case 'board':
                    const boardId = interaction.options.getString('id');
                    
                    // Special handling for "list-racing" to show all racing boards
                    if (boardId === 'list-racing') {
                        await this.listRacingBoards(interaction);
                        break;
                    }
                    
                    await this.showArcadeBoard(interaction, boardId);
                    break;
                case 'racing':
                    await this.showRacingBoard(interaction);
                    break;
                case 'tiebreaker':
                    await this.showTiebreakerBoard(interaction);
                    break;
                default:
                    await interaction.editReply('Invalid subcommand');
            }
        } catch (error) {
            console.error('Error executing arcade command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },

    async listArcadeBoards(interaction) {
        try {
            // Get all arcade boards
            const boards = await ArcadeBoard.find({ boardType: 'arcade' });
            
            if (boards.length === 0) {
                return interaction.editReply('No arcade boards are currently configured.');
            }
            
            // Sort boards by boardId as numbers, not as strings
            boards.sort((a, b) => parseInt(a.boardId) - parseInt(b.boardId));
            
            const embed = new EmbedBuilder()
                .setTitle('🎮 Available Arcade Leaderboards')
                .setColor('#0099ff')
                .setDescription('Use `/arcade board id:<board_id>` to view a specific leaderboard.')
                .setFooter({ text: 'Data provided by RetroAchievements.org' });
            
            // Create a simplified list with just board IDs and titles (no descriptions)
            let fieldValue = '';
            boards.forEach(board => {
                // Create a link to the RetroAchievements leaderboard
                const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${board.leaderboardId}`;
                
                // Add just the board ID and title as a link, no description
                fieldValue += `**${board.boardId}**: [${board.gameTitle}](${leaderboardUrl})\n`;
            });
            
            embed.addFields({ name: 'Arcade Boards', value: fieldValue });
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error listing arcade boards:', error);
            await interaction.editReply('An error occurred while retrieving arcade boards.');
        }
    },

    async listRacingBoards(interaction) {
        try {
            // Get all racing boards
            const boards = await ArcadeBoard.find({ boardType: 'racing' })
                .sort({ startDate: -1 }); // Sort by start date descending (newest first)
            
            if (boards.length === 0) {
                return interaction.editReply('No racing boards are currently configured.');
            }
            
            const embed = new EmbedBuilder()
                .setTitle('🏎️ Available Racing Challenges')
                .setColor('#FF9900')
                .setDescription('Use `/arcade racing month:<month_name>` to view a specific racing challenge. For example: `/arcade racing month:january`')
                .setFooter({ text: 'Data provided by RetroAchievements.org' });
            
            // Create a list of racing boards by month/year
            let fieldValue = '';
            boards.forEach(board => {
                const startDate = new Date(board.startDate);
                const monthName = startDate.toLocaleString('default', { month: 'long' });
                const year = startDate.getFullYear();
                
                // Create a link to the RetroAchievements leaderboard
                const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${board.leaderboardId}`;
                
                // Add the board to the list with month/year and game title
                fieldValue += `**${monthName} ${year}**: [${board.gameTitle}](${leaderboardUrl})${board.pointsAwarded ? ' ✅' : ''}\n`;
            });
            
            embed.addFields({ name: 'Racing Challenges', value: fieldValue });
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error listing racing boards:', error);
            await interaction.editReply('An error occurred while retrieving racing boards.');
        }
    },

    async showArcadeBoard(interaction, boardId) {
        try {
            // Get the arcade board configuration
            const board = await ArcadeBoard.findOne({ boardId: boardId });
            
            if (!board) {
                return interaction.editReply(`Board with ID "${boardId}" not found. Use \`/arcade list\` to see available boards.`);
            }
            
            // Create loading message
            await interaction.editReply('Fetching leaderboard data...');
            
            // Get all registered users
            const users = await User.find({});

            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
            // Use the direct API method to get leaderboard entries
            const leaderboardData = await retroAPI.getLeaderboardEntriesDirect(board.leaderboardId);
            
            // Extract the actual entries from the Results array if available
            let rawEntries = [];
            if (leaderboardData) {
                if (Array.isArray(leaderboardData)) {
                    // API returned an array directly
                    rawEntries = leaderboardData;
                } else if (leaderboardData.Results && Array.isArray(leaderboardData.Results)) {
                    // API returned an object with a Results array
                    rawEntries = leaderboardData.Results;
                } else {
                    // Try to extract entries from some other way
                    console.log('Unexpected leaderboard data structure:', typeof leaderboardData);
                }
            }
            
            if (!rawEntries || rawEntries.length === 0) {
                return interaction.editReply('No leaderboard entries found for this board.');
            }
            
            // Safely log a sample of the first entry for debugging
            if (rawEntries.length > 0) {
                try {
                    const sampleJson = JSON.stringify(rawEntries[0]);
                    if (sampleJson) {
                        console.log('First raw entry sample:', sampleJson.substring(0, 300));
                    }
                } catch (logError) {
                    console.log('Could not log sample entry:', logError.message);
                }
            }
            
            // Process the entries with appropriate handling based on leaderboard type
            const leaderboardEntries = rawEntries.map(entry => {
                // Standard properties that most entries have
                const user = entry.User || entry.user || '';
                const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                const rank = entry.Rank || entry.rank || 0;
                
                return {
                    ApiRank: parseInt(rank, 10),
                    User: user.trim(),
                    RawScore: score,
                    TrackTime: formattedScore.toString().trim() || score.toString()
                };
            });
            
            // Filter entries to only show registered users
            const filteredEntries = leaderboardEntries.filter(entry => {
                if (!entry.User) return false;
                const username = entry.User.toLowerCase().trim();
                return username && registeredUsers.has(username);
            });
            
            // Create clickable link to RetroAchievements leaderboard
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${board.leaderboardId}`;
            
            // Build the leaderboard embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Arcade: ${board.gameTitle}`)
                .setURL(leaderboardUrl)
                .setFooter({ text: 'Data provided by RetroAchievements.org' });
            
            // Get game info for thumbnail
            try {
                const gameInfo = await retroAPI.getGameInfo(board.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error('Error fetching game info:', error);
                // Continue without the thumbnail
            }
            
            // Create description
            let description = `**${board.description}**\n\n`;
            
            if (filteredEntries.length > 0) {
                description += '**User Highscores:**\n\n';
                
                // Display top 15 entries
                const displayEntries = filteredEntries.slice(0, 15);
                displayEntries.forEach((entry, index) => {
                    const displayRank = index + 1;
                    const ordinalRank = ordinal(displayRank);
                    description += `${ordinalRank} (#${entry.ApiRank}) - ${entry.User}: ${entry.TrackTime}\n`;
                });
            } else {
                description += 'No leaderboard entries found for registered users.';
            }
            
            embed.setDescription(description);
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error showing arcade board:', error);
            await interaction.editReply('An error occurred while retrieving the leaderboard.');
        }
    },

    async showRacingBoard(interaction) {
        try {
            const now = new Date();
            const monthParam = interaction.options.getString('month');
            let racingBoard;
            
            // If month parameter is provided
            if (monthParam) {
                // Create loading message
                await interaction.editReply('Searching for racing leaderboard...');
                
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
                    const year = now.getFullYear();
                    
                    // Look for any racing board with this month and current year
                    const monthKey = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}`;
                    
                    racingBoard = await ArcadeBoard.findOne({
                        boardType: 'racing',
                        monthKey: monthKey
                    });
                    
                    // If not found, check previous year (for historical lookups)
                    if (!racingBoard) {
                        const prevYearMonthKey = `${year - 1}-${(monthIndex + 1).toString().padStart(2, '0')}`;
                        racingBoard = await ArcadeBoard.findOne({
                            boardType: 'racing',
                            monthKey: prevYearMonthKey
                        });
                    }
                }
            } else {
                // No month parameter, get current active racing board
                await interaction.editReply('Fetching current racing leaderboard...');
                
                racingBoard = await ArcadeBoard.findOne({
                    boardType: 'racing',
                    startDate: { $lte: now },
                    endDate: { $gte: now }
                });
            }
            
            if (!racingBoard) {
                const message = monthParam 
                    ? `No racing challenge found for ${monthParam}.` 
                    : 'No racing challenge is currently active.';
                return interaction.editReply(message);
            }
            
            // Get all registered users
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
            // Use the direct API method to get leaderboard entries
            const leaderboardData = await retroAPI.getLeaderboardEntriesDirect(racingBoard.leaderboardId);
            
            // Extract the actual entries from the Results array if available
            let rawEntries = [];
            if (leaderboardData) {
                if (Array.isArray(leaderboardData)) {
                    // API returned an array directly
                    rawEntries = leaderboardData;
                } else if (leaderboardData.Results && Array.isArray(leaderboardData.Results)) {
                    // API returned an object with a Results array
                    rawEntries = leaderboardData.Results;
                } else {
                    // Try to extract entries from some other way
                    console.log('Unexpected leaderboard data structure:', typeof leaderboardData);
                }
            }
            
            if (!rawEntries || rawEntries.length === 0) {
                return interaction.editReply('No leaderboard entries found for this racing board.');
            }
            
            // Process the entries with appropriate handling based on leaderboard type
            const leaderboardEntries = rawEntries.map(entry => {
                // Standard properties that most entries have
                const user = entry.User || entry.user || '';
                const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                const rank = entry.Rank || entry.rank || 0;
                
                return {
                    ApiRank: parseInt(rank, 10),
                    User: user.trim(),
                    RawScore: score,
                    TrackTime: formattedScore.toString().trim() || score.toString()
                };
            });
            
            // Filter entries to only show registered users
            const filteredEntries = leaderboardEntries.filter(entry => {
                if (!entry.User) return false;
                const username = entry.User.toLowerCase().trim();
                return username && registeredUsers.has(username);
            });
            
            // Sort entries by score (for racing, usually lower is better)
            filteredEntries.sort((a, b) => {
                // For racing games, lower times are better
                // This is a simplified comparison that should work for most time formats
                return a.TrackTime.localeCompare(b.TrackTime);
            });
            
            // Create clickable link to RetroAchievements leaderboard
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${racingBoard.leaderboardId}`;
            
            // Get the month name for display
            const raceDate = new Date(racingBoard.startDate);
            const monthName = raceDate.toLocaleString('default', { month: 'long' });
            const year = raceDate.getFullYear();
            
            // Build the leaderboard embed
            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle(`🏎️ ${monthName} ${year} Racing Challenge`)
                .setURL(leaderboardUrl)
                .setDescription(`**${racingBoard.gameTitle}**\n*${racingBoard.description}*\n\n` +
                            `${racingBoard.pointsAwarded ? '✅ Challenge completed' : '⏱️ End Date:'} <t:${Math.floor(racingBoard.endDate.getTime() / 1000)}:f>\n\n` +
                            `${racingBoard.pointsAwarded ? 'Points have been awarded to top finishers.' : 'Top 3 players at the end of the month will receive award points (3/2/1)!'}`)
                .setFooter({ text: 'Data provided by RetroAchievements.org' });
            
            // Get game info for thumbnail
            try {
                const gameInfo = await retroAPI.getGameInfo(racingBoard.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error('Error fetching game info:', error);
                // Continue without the thumbnail
            }
            
            // Add leaderboard field
            let leaderboardText = '';
            
            if (filteredEntries.length > 0) {
                // Display top 10 entries
                const displayEntries = filteredEntries.slice(0, 10);
                displayEntries.forEach((entry, index) => {
                    const displayRank = index + 1;
                    const medalEmoji = displayRank === 1 ? '🥇' : (displayRank === 2 ? '🥈' : (displayRank === 3 ? '🥉' : `${displayRank}.`));
                    leaderboardText += `${medalEmoji} **${entry.User}**: ${entry.TrackTime}\n`;
                });
            } else {
                leaderboardText = 'No leaderboard entries found for registered users.';
            }
            
            embed.addFields({ name: 'Current Standings', value: leaderboardText });
            
            // If this challenge has completed and has results stored, show them
            if (racingBoard.pointsAwarded && racingBoard.results && racingBoard.results.length > 0) {
                let resultsText = '';
                racingBoard.results.forEach(result => {
                    const medalEmoji = result.rank === 1 ? '🥇' : (result.rank === 2 ? '🥈' : '🥉');
                    resultsText += `${medalEmoji} **${result.username}**: ${result.time} (${result.points} point${result.points !== 1 ? 's' : ''})\n`;
                });
                
                embed.addFields({ name: 'Final Results', value: resultsText });
            }
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error showing racing board:', error);
            await interaction.editReply('An error occurred while retrieving the racing leaderboard.');
        }
    },
    
    async showTiebreakerBoard(interaction) {
        try {
            // Get the active tiebreaker
            const now = new Date();
            
            const tiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            if (!tiebreaker) {
                return interaction.editReply('No tiebreaker is currently active.');
            }
            
            // Create loading message
            await interaction.editReply('Fetching tiebreaker leaderboard data...');
            
            // Get usernames of tied users
            const tiedUsernames = tiebreaker.tiedUsers || [];
            
            // Use the direct API method to get leaderboard entries
            const leaderboardData = await retroAPI.getLeaderboardEntriesDirect(tiebreaker.leaderboardId);
            
            // Extract the actual entries from the Results array if available
            let rawEntries = [];
            if (leaderboardData) {
                if (Array.isArray(leaderboardData)) {
                    // API returned an array directly
                    rawEntries = leaderboardData;
                } else if (leaderboardData.Results && Array.isArray(leaderboardData.Results)) {
                    // API returned an object with a Results array
                    rawEntries = leaderboardData.Results;
                } else {
                    // Try to extract entries from some other way
                    console.log('Unexpected leaderboard data structure:', typeof leaderboardData);
                }
            }
            
            if (!rawEntries || rawEntries.length === 0) {
                return interaction.editReply('No leaderboard entries found for this tiebreaker.');
            }
            
            // Process the entries with appropriate handling based on leaderboard type
            const leaderboardEntries = rawEntries.map(entry => {
                // Standard properties that most entries have
                const user = entry.User || entry.user || '';
                const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                const rank = entry.Rank || entry.rank || 0;
                
                return {
                    ApiRank: parseInt(rank, 10),
                    User: user.trim(),
                    RawScore: score,
                    TrackTime: formattedScore.toString().trim() || score.toString()
                };
            });
            
            // Filter entries to only show tied users
            const filteredEntries = leaderboardEntries.filter(entry => 
                entry.User && tiedUsernames.some(username => username.toLowerCase() === entry.User.toLowerCase())
            );
            
            // Sort entries by score (track time)
            filteredEntries.sort((a, b) => {
                // For racing games, lower times are better
                // This is a simplified comparison that should work for most time formats
                return a.TrackTime.localeCompare(b.TrackTime);
            });
            
            // Create clickable link to RetroAchievements leaderboard
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${tiebreaker.leaderboardId}`;
            
            // Build the tiebreaker embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚔️ Monthly Challenge Tiebreaker')
                .setURL(leaderboardUrl)
                .setDescription(`**${tiebreaker.gameTitle}**\n*${tiebreaker.description}*\n\n` +
                               `End Date: <t:${Math.floor(tiebreaker.endDate.getTime() / 1000)}:f>\n\n` +
                               `This tiebreaker is to resolve ties in the monthly challenge standings.`)
                .setFooter({ text: 'Data provided by RetroAchievements.org' });
            
            // Get game info for thumbnail
            try {
                const gameInfo = await retroAPI.getGameInfo(tiebreaker.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error('Error fetching game info:', error);
                // Continue without the thumbnail
            }
            
            // Add participants field
            embed.addFields({ 
                name: 'Participants', 
                value: tiedUsernames.length > 0 ? tiedUsernames.join(', ') : 'No participants' 
            });
            
            // Add leaderboard field
            let leaderboardText = '';
            
            if (filteredEntries.length > 0) {
                // Display entries
                filteredEntries.forEach((entry, index) => {
                    const displayRank = index + 1;
                    const medalEmoji = displayRank === 1 ? '🥇' : (displayRank === 2 ? '🥈' : (displayRank === 3 ? '🥉' : `${displayRank}.`));
                    leaderboardText += `${medalEmoji} **${entry.User}**: ${entry.TrackTime}\n`;
                });
            } else {
                leaderboardText = 'No tiebreaker entries found yet.';
            }
            
            embed.addFields({ name: 'Current Standings', value: leaderboardText });
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error showing tiebreaker board:', error);
            await interaction.editReply('An error occurred while retrieving the tiebreaker leaderboard.');
        }
    }
};
