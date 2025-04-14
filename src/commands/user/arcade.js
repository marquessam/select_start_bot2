import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType
} from 'discord.js';
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
        .setDescription('Display arcade and racing leaderboards with interactive navigation')
        .addSubcommand(subcommand =>
            subcommand
                .setName('menu')
                .setDescription('Show arcade system menu with interactive buttons')),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Start with the main arcade menu
            await this.displayArcadeMenu(interaction);
        } catch (error) {
            console.error('Error executing arcade command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },

    async displayArcadeMenu(interaction) {
        try {
            // Get counts of different board types
            const arcadeBoardCount = await ArcadeBoard.countDocuments({ boardType: 'arcade' });
            const racingBoardCount = await ArcadeBoard.countDocuments({ boardType: 'racing' });
            
            // Check if a tiebreaker is active
            const now = new Date();
            const activeTiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            // Check if a racing challenge is active
            const activeRacing = await ArcadeBoard.findOne({
                boardType: 'racing',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });

            const embed = new EmbedBuilder()
                .setTitle('🎮 Arcade System Menu')
                .setColor('#9B59B6') // Purple color
                .setDescription('Welcome to the RetroAchievements arcade system! Choose an option below to navigate different leaderboards and racing challenges.')
                .addFields(
                    { 
                        name: '🎯 Arcade Boards', 
                        value: `${arcadeBoardCount} arcade boards available\nView all arcade boards or select a specific board to see the leaderboard.`,
                        inline: false 
                    },
                    { 
                        name: '🏎️ Racing Challenges', 
                        value: `${racingBoardCount} racing challenges available\n` + 
                               `${activeRacing ? '**A racing challenge is currently active!**\n' : ''}` +
                               `View all racing challenges or see the current month's challenge.`,
                        inline: false 
                    },
                    { 
                        name: '⚔️ Tiebreakers', 
                        value: activeTiebreaker 
                            ? 'A tiebreaker is currently active! Click to view details.'
                            : 'No tiebreaker is currently active.',
                        inline: false 
                    }
                )
                .setFooter({ text: 'Use the buttons below to navigate • Data provided by RetroAchievements.org' });
            
            // Create main menu buttons (two rows)
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arcade_boards_list')
                        .setLabel('View All Arcade Boards')
                        .setStyle(ButtonStyle.Secondary) // Gray with slight purple tint
                        .setEmoji('🎯'),
                    new ButtonBuilder()
                        .setCustomId('arcade_board_select')
                        .setLabel('Select Specific Board')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🎮')
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('racing_current')
                        .setLabel('Current Racing Challenge')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🏎️'),
                    new ButtonBuilder()
                        .setCustomId('racing_all')
                        .setLabel('All Racing Challenges')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🏁')
                );

            // Add tiebreaker button only if active
            const row3 = new ActionRowBuilder();
            if (activeTiebreaker) {
                row3.addComponents(
                    new ButtonBuilder()
                        .setCustomId('tiebreaker')
                        .setLabel('Active Tiebreaker')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⚔️')
                );
            }
            
            // Send message with buttons
            const components = activeTiebreaker ? [row1, row2, row3] : [row1, row2];
            const message = await interaction.editReply({ 
                embeds: [embed],
                components: components
            });

            // Create collector for button interactions
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 600000 // 10 minutes
            });

            // Handle button clicks
            collector.on('collect', async (i) => {
                await i.deferUpdate();

                // Generate back button for sub-menus
                const backRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('back_to_menu')
                            .setLabel('Back to Menu')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('↩️')
                    );

                // Handle different button clicks
                switch (i.customId) {
                    case 'arcade_boards_list':
                        await this.handleListArcadeBoards(i, backRow);
                        break;
                    case 'arcade_board_select':
                        await this.handleBoardSelection(i, backRow);
                        break;
                    case 'racing_current':
                        await this.handleCurrentRacing(i, backRow);
                        break;
                    case 'racing_all':
                        await this.handleListRacingBoards(i, backRow);
                        break;
                    case 'tiebreaker':
                        await this.handleTiebreaker(i, backRow);
                        break;
                    case 'back_to_menu':
                        // Return to main menu
                        await i.editReply({ 
                            embeds: [embed],
                            components: components
                        });
                        break;
                    default:
                        // If it starts with "board_", it's a specific board selection
                        if (i.customId.startsWith('board_')) {
                            const boardId = i.customId.replace('board_', '');
                            await this.handleShowSpecificBoard(i, boardId, backRow);
                        }
                        // If it starts with "racing_month_", it's a specific racing challenge
                        else if (i.customId.startsWith('racing_month_')) {
                            const month = i.customId.replace('racing_month_', '');
                            await this.handleShowSpecificRacing(i, month, backRow);
                        }
                }
            });

            // When collector expires
            collector.on('end', async () => {
                try {
                    // Create disabled versions of all rows
                    const disabledRows = components.map(row => {
                        const disabledRow = new ActionRowBuilder();
                        row.components.forEach(component => {
                            disabledRow.addComponents(
                                ButtonBuilder.from(component).setDisabled(true)
                            );
                        });
                        return disabledRow;
                    });

                    // Update with disabled buttons
                    await interaction.editReply({
                        embeds: [embed.setFooter({ text: 'Session expired • Use /arcade again to start a new session' })],
                        components: disabledRows
                    });
                } catch (error) {
                    console.error('Error disabling buttons:', error);
                }
            });
        } catch (error) {
            console.error('Error showing arcade menu:', error);
            await interaction.editReply('An error occurred while loading the arcade menu.');
        }
    },

    async handleListArcadeBoards(interaction, backRow) {
        try {
            // Get all arcade boards
            const boards = await ArcadeBoard.find({ boardType: 'arcade' });
            
            if (boards.length === 0) {
                return interaction.editReply({
                    content: 'No arcade boards are currently configured.',
                    components: [backRow]
                });
            }
            
            // Sort boards by boardId as numbers, not as strings
            boards.sort((a, b) => parseInt(a.boardId) - parseInt(b.boardId));
            
            const embed = new EmbedBuilder()
                .setTitle('🎮 Available Arcade Leaderboards')
                .setColor('#9B59B6') // Purple color
                .setDescription('Select a board to view its leaderboard.')
                .setFooter({ text: 'Select a board button or go back to menu • Data provided by RetroAchievements.org' });
            
            // Create a simplified list with just board IDs and titles
            let fieldValue = '';
            boards.forEach(board => {
                // Add just the board ID and title
                fieldValue += `**${board.boardId}**: ${board.gameTitle}\n`;
            });
            
            embed.addFields({ name: 'Arcade Boards', value: fieldValue });
            
            // Create buttons for board selection (up to 5 per row, max 3 rows = 15 buttons)
            const boardRows = [];
            for (let i = 0; i < Math.min(boards.length, 15); i += 5) {
                const row = new ActionRowBuilder();
                for (let j = i; j < Math.min(i + 5, boards.length, 15); j++) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`board_${boards[j].boardId}`)
                            .setLabel(`Board ${boards[j].boardId}`)
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
                boardRows.push(row);
            }
            
            // Add the back button as the last row
            boardRows.push(backRow);
            
            // If there are too many boards, add a note
            if (boards.length > 15) {
                embed.setDescription(`Select a board to view its leaderboard.\n\n**Note:** Only showing first 15 boards. Use \`/arcade board id:<board_id>\` to access other boards.`);
            }
            
            await interaction.editReply({ 
                embeds: [embed],
                components: boardRows
            });
        } catch (error) {
            console.error('Error listing arcade boards:', error);
            await interaction.editReply({
                content: 'An error occurred while retrieving arcade boards.',
                components: [backRow]
            });
        }
    },

    async handleBoardSelection(interaction, backRow) {
        try {
            // Get all arcade boards for the selection menu
            const boards = await ArcadeBoard.find({ boardType: 'arcade' });
            
            if (boards.length === 0) {
                return interaction.editReply({
                    content: 'No arcade boards are currently configured.',
                    components: [backRow]
                });
            }
            
            // Sort boards by boardId as numbers, not as strings
            boards.sort((a, b) => parseInt(a.boardId) - parseInt(b.boardId));
            
            const embed = new EmbedBuilder()
                .setTitle('🎮 Select an Arcade Board')
                .setColor('#9B59B6') // Purple color
                .setDescription('Please enter the ID of the board you want to view in chat.')
                .setFooter({ text: 'Use the back button to return to the menu' });
            
            // Create a list of boards with their IDs
            let boardList = '';
            boards.forEach(board => {
                boardList += `**${board.boardId}**: ${board.gameTitle}\n`;
            });
            
            embed.addFields({ name: 'Available Boards', value: boardList });
            
            // Create a prompt to select board ID through a follow-up message
            const promptMessage = await interaction.editReply({
                embeds: [embed],
                components: [backRow]
            });
            
            // We can't directly create a text input in a message component,
            // so we'll use the board buttons method instead
            await this.handleListArcadeBoards(interaction, backRow);
        } catch (error) {
            console.error('Error creating board selection:', error);
            await interaction.editReply({
                content: 'An error occurred while preparing board selection.',
                components: [backRow]
            });
        }
    },

    async handleShowSpecificBoard(interaction, boardId, backRow) {
        try {
            // Get the arcade board configuration
            const board = await ArcadeBoard.findOne({ boardId: boardId });
            
            if (!board) {
                return interaction.editReply({
                    content: `Board with ID "${boardId}" not found.`,
                    components: [backRow]
                });
            }
            
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
                return interaction.editReply({
                    content: 'No leaderboard entries found for this board.',
                    components: [backRow]
                });
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
                .setColor('#9B59B6') // Purple color
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
            
            // Create buttons for navigation
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arcade_boards_list')
                        .setLabel('View All Boards')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🎯'),
                    backRow.components[0] // Add the back button
                );
            
            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });
        } catch (error) {
            console.error('Error showing arcade board:', error);
            await interaction.editReply({
                content: 'An error occurred while retrieving the leaderboard.',
                components: [backRow]
            });
        }
    },

    async handleCurrentRacing(interaction, backRow) {
        try {
            const now = new Date();
            // Get current active racing board
            const racingBoard = await ArcadeBoard.findOne({
                boardType: 'racing',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            if (!racingBoard) {
                // Create a special embed for no active racing challenge
                const embed = new EmbedBuilder()
                    .setTitle('🏎️ Racing Challenge')
                    .setColor('#9B59B6') // Purple color
                    .setDescription('No racing challenge is currently active.')
                    .setFooter({ text: 'Check all racing challenges to see upcoming and past races' });
                
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('racing_all')
                            .setLabel('View All Racing Challenges')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🏁'),
                        backRow.components[0] // Add the back button
                    );
                
                return interaction.editReply({
                    embeds: [embed],
                    components: [actionRow]
                });
            }
            
            // Handle displaying the current racing board
            await this.handleShowRacingBoard(interaction, racingBoard, backRow);
        } catch (error) {
            console.error('Error showing current racing:', error);
            await interaction.editReply({
                content: 'An error occurred while retrieving the current racing challenge.',
                components: [backRow]
            });
        }
    },

    async handleListRacingBoards(interaction, backRow) {
        try {
            // Get all racing boards
            const boards = await ArcadeBoard.find({ boardType: 'racing' })
                .sort({ startDate: -1 }); // Sort by start date descending (newest first)
            
            if (boards.length === 0) {
                return interaction.editReply({
                    content: 'No racing boards are currently configured.',
                    components: [backRow]
                });
            }
            
            const now = new Date();
            
            const embed = new EmbedBuilder()
                .setTitle('🏎️ Available Racing Challenges')
                .setColor('#9B59B6') // Purple color
                .setDescription('Select a racing challenge to view details.')
                .setFooter({ text: 'Select a challenge button or go back to menu • Data provided by RetroAchievements.org' });
            
            // Create a list of racing boards by month/year
            let fieldValue = '';
            boards.forEach(board => {
                const startDate = new Date(board.startDate);
                const monthName = startDate.toLocaleString('default', { month: 'long' });
                const year = startDate.getFullYear();
                
                // Generate full title with track name
                const trackDisplay = board.trackName 
                    ? ` - ${board.trackName}`
                    : '';
                    
                const gameDisplay = `${board.gameTitle}${trackDisplay}`;
                
                // Add status icon based on whether the board is active, completed, or pending results
                let statusIcon = '';
                if (now >= board.startDate && now <= board.endDate) {
                    statusIcon = '⏱️ '; // Active
                } else if (board.pointsAwarded) {
                    statusIcon = '✅ '; // Completed with points awarded
                } else if (now > board.endDate) {
                    statusIcon = '⌛ '; // Ended, pending results
                }
                
                // Add the board to the list with month/year and game title
                fieldValue += `${statusIcon}**${monthName} ${year}**: ${gameDisplay}\n`;
            });
            
            embed.addFields({ name: 'Racing Challenges', value: fieldValue });
            
            // Add legend
            embed.addFields({ 
                name: 'Legend', 
                value: '⏱️ Active Challenge\n✅ Completed Challenge\n⌛ Challenge Ended, Pending Results' 
            });
            
            // Create buttons for month selection (up to 10 most recent racing challenges)
            const monthRows = [];
            const recentBoards = boards.slice(0, 10); // Take up to 10 most recent
            
            // Split into rows of 2 buttons each
            for (let i = 0; i < recentBoards.length; i += 2) {
                const row = new ActionRowBuilder();
                
                // First button in the row
                const board1 = recentBoards[i];
                const month1 = new Date(board1.startDate).toLocaleString('default', { month: 'long' });
                const year1 = new Date(board1.startDate).getFullYear();
                const monthKey1 = `${year1}-${(new Date(board1.startDate).getMonth() + 1).toString().padStart(2, '0')}`;
                
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`racing_month_${monthKey1}`)
                        .setLabel(`${month1} ${year1}`)
                        .setStyle(ButtonStyle.Secondary)
                );
                
                // Second button if available
                if (i + 1 < recentBoards.length) {
                    const board2 = recentBoards[i + 1];
                    const month2 = new Date(board2.startDate).toLocaleString('default', { month: 'long' });
                    const year2 = new Date(board2.startDate).getFullYear();
                    const monthKey2 = `${year2}-${(new Date(board2.startDate).getMonth() + 1).toString().padStart(2, '0')}`;
                    
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`racing_month_${monthKey2}`)
                            .setLabel(`${month2} ${year2}`)
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
                
                monthRows.push(row);
            }
            
            // Add the back button as the last row
            monthRows.push(backRow);
            
            // If there are too many boards, add a note
            if (boards.length > 10) {
                embed.setDescription(`Select a racing challenge to view details.\n\n**Note:** Only showing 10 most recent challenges. Use \`/arcade racing month:<YYYY-MM>\` to access older challenges.`);
            }
            
            await interaction.editReply({ 
                embeds: [embed],
                components: monthRows
            });
        } catch (error) {
            console.error('Error listing racing boards:', error);
            await interaction.editReply({
                content: 'An error occurred while retrieving racing boards.',
                components: [backRow]
            });
        }
    },

    async handleShowSpecificRacing(interaction, monthKey, backRow) {
        try {
            // Find the racing board for the specified month
            const racingBoard = await ArcadeBoard.findOne({
                boardType: 'racing',
                monthKey: monthKey
            });
            
            if (!racingBoard) {
                return interaction.editReply({
                    content: `No racing challenge found for ${monthKey}.`,
                    components: [backRow]
                });
            }
            
            // Display the racing board
            await this.handleShowRacingBoard(interaction, racingBoard, backRow);
        } catch (error) {
            console.error('Error showing specific racing board:', error);
            await interaction.editReply({
                content: 'An error occurred while retrieving the racing leaderboard.',
                components: [backRow]
            });
        }
    },

    async handleShowRacingBoard(interaction, racingBoard, backRow) {
        try {
            const now = new Date();
            
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
                return interaction.editReply({
                    content: 'No leaderboard entries found for this racing board.',
                    components: [backRow]
                });
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
            
            // Generate full title with track name
            const trackDisplay = racingBoard.trackName 
                ? ` - ${racingBoard.trackName}`
                : '';
                
            const gameDisplay = `${racingBoard.gameTitle}${trackDisplay}`;
            
            // Determine if race is active or completed for messaging
            const isActive = now >= racingBoard.startDate && now <= racingBoard.endDate;
            
            // Build the leaderboard embed
            const embed = new EmbedBuilder()
                .setColor('#9B59B6') // Purple color
                .setTitle(`🏎️ ${monthName} ${year} Racing Challenge`)
                .setURL(leaderboardUrl)
                .setDescription(`**${gameDisplay}**\n*${racingBoard.description}*\n\n` +
                            (isActive 
                                ? `⏱️ **Currently Active Challenge**\nEnds <t:${Math.floor(racingBoard.endDate.getTime() / 1000)}:f> (UTC)\n\nTop 3 players at the end of the month will receive award points (3/2/1)!`
                                : `${racingBoard.pointsAwarded ? '✅ **Challenge Completed**' : '⌛ **Challenge Ended**'}\nEnded on <t:${Math.floor(racingBoard.endDate.getTime() / 1000)}:f>\n\n${racingBoard.pointsAwarded ? 'Points have been awarded to top finishers.' : 'Points will be awarded soon.'}`)
                )
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
            
            // Create buttons for navigation
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('racing_all')
                        .setLabel('All Racing Challenges')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🏁'),
                    backRow.components[0] // Add the back button
                );
            
            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });
        } catch (error) {
            console.error('Error showing racing board:', error);
            await interaction.editReply({
                content: 'An error occurred while retrieving the racing leaderboard.',
                components: [backRow]
            });
        }
    },

    async handleTiebreaker(interaction, backRow) {
        try {
            // Get the active tiebreaker
            const now = new Date();
            
            const tiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            if (!tiebreaker) {
                return interaction.editReply({
                    content: 'No tiebreaker is currently active.',
                    components: [backRow]
                });
            }
            
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
                return interaction.editReply({
                    content: 'No leaderboard entries found for this tiebreaker.',
                    components: [backRow]
                });
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
                .setColor('#9B59B6') // Purple color
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
            
            await interaction.editReply({
                embeds: [embed],
                components: [backRow]
            });
        } catch (error) {
            console.error('Error showing tiebreaker board:', error);
            await interaction.editReply({
                content: 'An error occurred while retrieving the tiebreaker leaderboard.',
                components: [backRow]
            });
        }
    }
};
