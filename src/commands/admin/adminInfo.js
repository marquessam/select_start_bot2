import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    PermissionFlagsBits
} from 'discord.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('admininfo')
        .setDescription('Admin commands to display shareable information')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('arcade')
                .setDescription('Display a shareable list of all arcade boards')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('challenges')
                .setDescription('Display a shareable list of current challenges')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'arcade') {
            await this.handleArcadeBoards(interaction);
        } else if (subcommand === 'challenges') {
            await this.handleChallenges(interaction);
        }
    },

    async handleArcadeBoards(interaction) {
        await interaction.deferReply({ ephemeral: false }); // Not ephemeral so it can be seen by everyone

        try {
            // Get all arcade boards
            const boards = await ArcadeBoard.find({ boardType: 'arcade' });
            
            if (boards.length === 0) {
                return interaction.editReply('No arcade boards are currently configured.');
            }
            
            // Sort boards alphabetically by game title
            boards.sort((a, b) => a.gameTitle.localeCompare(b.gameTitle));
            
            const embed = new EmbedBuilder()
                .setTitle('🎮 RetroAchievements Arcade Boards')
                .setColor('#9B59B6') // Purple color
                .setDescription('Here\'s a list of all available arcade leaderboards. Click on any game title to view its leaderboard on RetroAchievements.org!')
                .setFooter({ text: 'Data provided by RetroAchievements.org' });
            
            // Create a list of board titles with hyperlinks
            let boardsList = '';
            boards.forEach(board => {
                const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${board.leaderboardId}`;
                boardsList += `• [${board.gameTitle}](${leaderboardUrl})\n`;
            });
            
            embed.addFields({ 
                name: 'Available Boards', 
                value: boardsList || 'No boards available.' 
            });
            
            embed.addFields({ 
                name: 'How to Participate', 
                value: 'Use `/arcade` to view detailed leaderboards and track your progress. Only users ranked 999 or lower in the global leaderboards will appear in our boards.' 
            });
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error listing arcade boards:', error);
            await interaction.editReply('An error occurred while retrieving arcade boards.');
        }
    },

    async handleChallenges(interaction) {
        await interaction.deferReply({ ephemeral: false }); // Not ephemeral so it can be seen by everyone

        try {
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            
            // Last day of the month at 11:59 PM
            const lastDayOfMonth = new Date(nextMonthStart - 1);
            lastDayOfMonth.setHours(23, 59, 59);
            
            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            // Get current racing challenge
            const activeRacing = await ArcadeBoard.findOne({
                boardType: 'racing',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            // Get arcade boards with year-end expiration
            const arcadeBoards = await ArcadeBoard.find({ 
                boardType: 'arcade'
            });

            const embed = new EmbedBuilder()
                .setColor('#32CD32')  // Lime green color
                .setTitle('Current RetroAchievements Challenges')
                .setDescription('Here are all active challenges. Join in and earn points!')
                .setFooter({ text: 'Use /challenge for more detailed information' });

            // Build a table-like structure with formatted rows
            let tableContent = "```\n";
            tableContent += "Game                    | Challenge Type    | Points Possible     | End Date\n";
            tableContent += "------------------------|-------------------|---------------------|----------\n";
            
            // Add monthly challenge to table
            if (currentChallenge && currentChallenge.monthly_challange_gameid) {
                const gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);
                const month = now.toLocaleString('default', { month: 'long' });
                const lastDay = lastDayOfMonth.getDate();
                
                // Format with appropriate spacing for table
                const gameName = gameInfo.title.substring(0, 23).padEnd(24);
                const type = "Monthly Challenge".padEnd(19);
                const points = "1 - participate\n3 - beaten\n3 - mastery".padEnd(21);
                const endDate = `${month} ${lastDay}`.padEnd(10);
                
                tableContent += `${gameName}| ${type}| ${points}| ${endDate}\n`;
            }
            
            // Add shadow challenge to table if revealed
            if (currentChallenge && currentChallenge.shadow_challange_gameid && 
                (currentChallenge.shadow_challange_revealed || isPastChallenge(currentChallenge.date))) {
                
                const gameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
                const month = now.toLocaleString('default', { month: 'long' });
                
                const gameName = gameInfo.title.substring(0, 23).padEnd(24);
                const type = `${month} Shadow Game`.padEnd(19);
                const points = "1 - participate\n3 - beaten".padEnd(21);
                const endDate = `${month} ${lastDayOfMonth.getDate()}`.padEnd(10);
                
                tableContent += `${gameName}| ${type}| ${points}| ${endDate}\n`;
            }
            
            // Add racing challenge to table
            if (activeRacing) {
                const trackDisplay = activeRacing.trackName ? ` - ${activeRacing.trackName}` : '';
                const gameDisplay = `${activeRacing.gameTitle}${trackDisplay}`;
                
                const endDate = new Date(activeRacing.endDate);
                const month = endDate.toLocaleString('default', { month: 'long' });
                const day = endDate.getDate();
                
                const gameName = gameDisplay.substring(0, 23).padEnd(24);
                const type = "Racing".padEnd(19);
                const points = "3 - 1st place\n2 - 2nd place\n1 - 3rd place".padEnd(21);
                const endDateStr = `${month} ${day}`.padEnd(10);
                
                tableContent += `${gameName}| ${type}| ${points}| ${endDateStr}\n`;
            }
            
            // Add arcade boards (limit to a few to keep embed manageable)
            if (arcadeBoards && arcadeBoards.length > 0) {
                // Sort alphabetically and take top boards
                const sortedBoards = arcadeBoards.sort((a, b) => a.gameTitle.localeCompare(b.gameTitle)).slice(0, 3);
                
                for (const board of sortedBoards) {
                    const gameName = board.gameTitle.substring(0, 23).padEnd(24);
                    const type = "Arcade".padEnd(19);
                    const points = "Leaderboard".padEnd(21);
                    const endDate = "Year End".padEnd(10);
                    
                    tableContent += `${gameName}| ${type}| ${points}| ${endDate}\n`;
                }
                
                if (arcadeBoards.length > 3) {
                    tableContent += "... and more arcade boards. Use /admininfo arcade to see all.\n";
                }
            }
            
            tableContent += "```";
            
            embed.addFields({ name: 'Challenge Overview', value: tableContent });
            
            // Add links section for clickable game titles
            let linksSection = "";
            
            if (currentChallenge && currentChallenge.monthly_challange_gameid) {
                const gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);
                const gameUrl = `https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid}`;
                linksSection += `• Monthly: [${gameInfo.title}](${gameUrl})\n`;
            }
            
            if (currentChallenge && currentChallenge.shadow_challange_gameid && 
                (currentChallenge.shadow_challange_revealed || isPastChallenge(currentChallenge.date))) {
                const gameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
                const gameUrl = `https://retroachievements.org/game/${currentChallenge.shadow_challange_gameid}`;
                linksSection += `• Shadow: [${gameInfo.title}](${gameUrl})\n`;
            } else if (currentChallenge && currentChallenge.shadow_challange_gameid) {
                linksSection += `• Shadow: *Hidden (use /shadowguess to unlock)*\n`;
            }
            
            if (activeRacing) {
                const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${activeRacing.leaderboardId}`;
                linksSection += `• Racing: [${activeRacing.gameTitle}](${leaderboardUrl})\n`;
            }
            
            if (arcadeBoards && arcadeBoards.length > 0) {
                // Add the same 3 boards we showed in the table
                const sortedBoards = arcadeBoards.sort((a, b) => a.gameTitle.localeCompare(b.gameTitle)).slice(0, 3);
                
                for (const board of sortedBoards) {
                    const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${board.leaderboardId}`;
                    linksSection += `• Arcade: [${board.gameTitle}](${leaderboardUrl})\n`;
                }
                
                if (arcadeBoards.length > 3) {
                    linksSection += `• *+ ${arcadeBoards.length - 3} more arcade boards*\n`;
                }
            }
            
            embed.addFields({ name: 'Game Links', value: linksSection || "No active challenges found." });
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error retrieving challenges:', error);
            await interaction.editReply('An error occurred while retrieving challenge information.');
        }
    }
};

// Helper function to check if a challenge is from a past month
function isPastChallenge(challengeDate) {
    const now = new Date();
    // Challenge is in the past if it's from a previous month or previous year
    return (challengeDate.getFullYear() < now.getFullYear()) ||
           (challengeDate.getFullYear() === now.getFullYear() && 
            challengeDate.getMonth() < now.getMonth());
}
