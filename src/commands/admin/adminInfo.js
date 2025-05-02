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
            const lastDayTimestamp = Math.floor(lastDayOfMonth.getTime() / 1000);
            
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

            const embed = new EmbedBuilder()
                .setColor('#32CD32')  // Lime green color
                .setTitle('RetroAchievements Current Challenges')
                .setDescription('Here are the current challenges you can participate in this month:')
                .setFooter({ text: 'Use /challenge for more detailed information' });

            // Monthly Challenge
            if (currentChallenge && currentChallenge.monthly_challange_gameid) {
                const gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);
                const gameUrl = `https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid}`;
                
                let monthlyText = `**Game:** [${gameInfo.title}](${gameUrl})\n`;
                monthlyText += `**Ends:** <t:${lastDayTimestamp}:F>\n\n`;
                monthlyText += `**Points Available:**\n`;
                monthlyText += `• Participation: 1 point\n`;
                monthlyText += `• Beaten: 3 points\n`;
                monthlyText += `• Mastery: 3 points\n`;
                
                embed.addFields({ name: '🏆 Monthly Challenge', value: monthlyText });
                
                if (gameInfo.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } else {
                embed.addFields({ name: '🏆 Monthly Challenge', value: 'No active challenge found for the current month.' });
            }

            // Shadow Challenge
            if (currentChallenge && currentChallenge.shadow_challange_gameid && 
                (currentChallenge.shadow_challange_revealed || isPastChallenge(currentChallenge.date))) {
                const shadowGameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
                const shadowUrl = `https://retroachievements.org/game/${currentChallenge.shadow_challange_gameid}`;
                
                let shadowText = `**Game:** [${shadowGameInfo.title}](${shadowUrl})\n`;
                shadowText += `**Ends:** <t:${lastDayTimestamp}:F>\n\n`;
                shadowText += `**Points Available:**\n`;
                shadowText += `• Participation: 1 point\n`;
                shadowText += `• Beaten: 3 points\n`;
                
                embed.addFields({ name: '👥 Shadow Challenge', value: shadowText });
            } else if (currentChallenge && currentChallenge.shadow_challange_gameid) {
                embed.addFields({ 
                    name: '👥 Shadow Challenge', 
                    value: 'A shadow challenge exists but has not yet been revealed. Try `/shadowguess` to unlock it!' 
                });
            } else {
                embed.addFields({ name: '👥 Shadow Challenge', value: 'No shadow challenge is set for the current month.' });
            }

            // Racing Challenge
            if (activeRacing) {
                const trackDisplay = activeRacing.trackName ? ` - ${activeRacing.trackName}` : '';
                const gameDisplay = `${activeRacing.gameTitle}${trackDisplay}`;
                const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${activeRacing.leaderboardId}`;
                
                const endTimestamp = Math.floor(activeRacing.endDate.getTime() / 1000);
                
                let racingText = `**Game:** [${gameDisplay}](${leaderboardUrl})\n`;
                racingText += `**Ends:** <t:${endTimestamp}:F>\n\n`;
                racingText += `**Points Available:**\n`;
                racingText += `• 1st Place: 3 points\n`;
                racingText += `• 2nd Place: 2 points\n`;
                racingText += `• 3rd Place: 1 point\n`;
                
                embed.addFields({ name: '🏎️ Racing Challenge', value: racingText });
            } else {
                embed.addFields({ 
                    name: '🏎️ Racing Challenge', 
                    value: 'No racing challenge is currently active. Check back soon!' 
                });
            }

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
