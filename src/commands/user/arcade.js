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
                .setDescription('Show the current month\'s racing challenge'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tiebreaker')
                .setDescription('Show the current tiebreaker board (if active)')),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();
            
            switch(subcommand) {
                case 'list':
                    await this.listArcadeBoards(interaction);
                    break;
                case 'board':
                    const boardId = interaction.options.getString('id');
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

    async showArcadeBoard(interaction, boardId) {
        try {
            // Get the arcade board configuration
            const board = await ArcadeBoard.findOne({ boardId: boardId });
            
            if (!board) {
                return interaction.editReply(`Board with ID "${boardId}" not found. Use \`/arcade list\` to see available boards.`);
            }
            
            // Create loading message
            await interaction.editReply('Fetching leaderboard data...');
            
            // Fetch the full leaderboard from RetroAchievements
            const leaderboardEntries = await this.fetchLeaderboardEntries(board.leaderboardId);
            
            if (!leaderboardEntries || leaderboardEntries.length === 0) {
                return interaction.editReply('No leaderboard entries found for this board.');
            }
            
            // Get all registered users (remove the non-existent isActive filter)
            const users = await User.find({});

            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
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
            // Get the current month's racing board
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            
            const racingBoard = await ArcadeBoard.findOne({
                boardType: 'racing',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            if (!racingBoard) {
                return interaction.editReply('No racing challenge is currently active.');
            }
            
            // Create loading message
            await interaction.editReply('Fetching racing leaderboard data...');
            
            // Get the month name
            const monthName = now.toLocaleString('default', { month: 'long' });
            
            // Fetch the leaderboard entries
            const leaderboardEntries = await this.fetchLeaderboardEntries(racingBoard.leaderboardId);
            
            if (!leaderboardEntries || leaderboardEntries.length === 0) {
                return interaction.editReply('No leaderboard entries found for this racing board.');
            }
            
            // Get all registered users
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
            // Filter entries to only show registered users
            const filteredEntries = leaderboardEntries.filter(entry => {
                if (!entry.User) return false;
                const username = entry.User.toLowerCase().trim();
                return username && registeredUsers.has(username);
            });
            
            // Create clickable link to RetroAchievements leaderboard
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${racingBoard.leaderboardId}`;
            
            // Build the leaderboard embed
            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle(`🏎️ ${monthName} Racing Challenge`)
                .setURL(leaderboardUrl)
                .setDescription(`**${racingBoard.gameTitle}**\n*${racingBoard.description}*\n\n` +
                               `End Date: <t:${Math.floor(racingBoard.endDate.getTime() / 1000)}:f>\n\n` +
                               `Top 3 players at the end of the month will receive award points (3/2/1)!`)
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
            
            // Fetch the leaderboard entries
            const leaderboardEntries = await this.fetchLeaderboardEntries(tiebreaker.leaderboardId);
            
            if (!leaderboardEntries || leaderboardEntries.length === 0) {
                return interaction.editReply('No leaderboard entries found for this tiebreaker.');
            }
            
            // Get usernames of tied users
            const tiedUsernames = tiebreaker.tiedUsers || [];
            
            // Filter entries to only show tied users
            const filteredEntries = leaderboardEntries.filter(entry => 
                entry.User && tiedUsernames.some(username => username.toLowerCase() === entry.User.toLowerCase())
            );
            
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
                // Sort entries by score (track time)
                filteredEntries.sort((a, b) => {
                    // For racing games, lower times are better
                    // This is a simplified comparison, may need adjustment based on actual time format
                    return a.TrackTime.localeCompare(b.TrackTime);
                });
                
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
    },

    async fetchLeaderboardEntries(leaderboardId) {
        try {
            // First batch of entries (top 500)
            const firstBatch = await retroAPI.getLeaderboardEntries(leaderboardId, 0, 500);
            
            // Second batch of entries (next 500)
            const secondBatch = await retroAPI.getLeaderboardEntries(leaderboardId, 500, 500);
            
            // Combine and process entries
            let allEntries = [...firstBatch, ...secondBatch];
            
            // Format entries consistently
            const processedEntries = allEntries.map(entry => {
                // Handle different API response formats
                const user = entry.User || entry.user || '';
                const apiRank = entry.Rank || entry.rank || '0';
                const formattedScore = entry.FormattedScore || entry.formattedScore;
                const fallbackScore = entry.Score || entry.score || '0';
                const trackTime = formattedScore ? formattedScore.trim() : fallbackScore.toString();
                
                return {
                    ApiRank: parseInt(apiRank, 10),
                    User: user.trim(),
                    TrackTime: trackTime,
                    DateSubmitted: entry.DateSubmitted || entry.dateSubmitted || null,
                };
            });
            
            return processedEntries.filter(entry => !isNaN(entry.ApiRank) && entry.User.length > 0);
        } catch (error) {
            console.error('Error fetching leaderboard entries:', error);
            throw error;
        }
    }
};
