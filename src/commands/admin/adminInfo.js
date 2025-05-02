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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('Display a shareable community overview')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('commands')
                .setDescription('Display a shareable list of available commands')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'arcade') {
            await this.handleArcadeBoards(interaction);
        } else if (subcommand === 'challenges') {
            await this.handleChallenges(interaction);
        } else if (subcommand === 'overview') {
            await this.handleOverview(interaction);
        } else if (subcommand === 'commands') {
            await this.handleCommands(interaction);
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
        
        // Add explanation of how arcade works
        embed.addFields({
            name: 'How Arcade Works',
            value: 'Each month we add 1-2 arcade boards to our collection. You are only competing against other members of Select Start and must place in the top 999 of the global leaderboard to appear in our rankings.\n\n' +
                   'Boards remain open until the end of the year and will be locked on December 1st. Those placing 1st, 2nd, and 3rd will receive 3, 2, and 1 points respectively.\n\n' + 
                   'The arcade is a way for members to collect points without the pressure of a monthly deadline or if you aren\'t interested in the month\'s official challenges.'
        });
        
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
    },

    async handleOverview(interaction) {
        await interaction.deferReply({ ephemeral: false }); // Not ephemeral so it can be seen by everyone

        try {
            const embed = new EmbedBuilder()
                .setTitle('Community Overview')
                .setColor('#2ECC71')
                .setDescription('Welcome to the Select Start Gaming Community! We focus on RetroAchievements challenges, competitions, and building a friendly retro gaming community.')
                .addFields(
                    {
                        name: '🎮 Monthly Challenges',
                        value: 'Each month, we select a game chosen by community vote. Everyone competes to earn achievements in that game. Monthly prizes are awarded to the top 3 players. There are also hidden "shadow games" that add an extra challenge!'
                    },
                    {
                        name: '🏆 Point System',
                        value: 'You can earn points by participating in monthly challenges, discovering shadow games, racing competitions, and arcade leaderboards. Points accumulate throughout the year for annual prizes.'
                    },
                    {
                        name: '🗳️ Game Nominations',
                        value: 'Each month, you can nominate up to two games for the next challenge. In the last week of the month, 10 games are randomly selected from all nominations for community voting.'
                    },
                    {
                        name: '🏎️ Racing & Arcade',
                        value: 'We have monthly racing challenges and year-round arcade leaderboards. Compete for the top positions to earn additional community points! Racing points are awarded monthly for each new track.'
                    },
                    {
                        name: '🏅 Year-End Awards',
                        value: 'On December 1st, yearly points are totaled and prizes are awarded to top performers across all categories.'
                    }
                )
                .setFooter({ text: 'Select Start Gaming Community' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error showing overview:', error);
            await interaction.editReply('An error occurred while creating the overview information.');
        }
    },

    async handleCommands(interaction) {
        await interaction.deferReply({ ephemeral: false }); // Not ephemeral so it can be seen by everyone

        try {
            const embed = new EmbedBuilder()
                .setTitle('Available Commands')
                .setColor('#E74C3C')
                .setDescription('Here are the commands you can use in the Select Start community:')
                .addFields(
                    {
                        name: '📋 Community Information',
                        value: '• `/help` - Display help information with interactive buttons'
                    },
                    {
                        name: '🏆 Challenges & Leaderboards',
                        value: '• `/challenge` - Show the current monthly, shadow, and racing challenges\n' +
                               '• `/leaderboard` - Display the current monthly challenge leaderboard\n' +
                               '• `/yearlyboard` - Display the yearly points leaderboard\n' +
                               '• `/profile [username]` - Show your or someone else\'s profile and achievements\n' +
                               '• `/shadowguess` - Try to guess the hidden shadow game'
                    },
                    {
                        name: '🗳️ Nominations & Voting',
                        value: '• `/nominate` - Nominate a game for the next monthly challenge\n' +
                               '• `/nominations` - Show all current nominations for the next month'
                    },
                    {
                        name: '🏎️ Arcade & Racing',
                        value: '• `/arcade` - Interactive menu for arcade boards and racing challenges\n' +
                               '  - View all arcade leaderboards\n' +
                               '  - Check current and past racing challenges\n' +
                               '  - See active tiebreaker competitions'
                    }
                )
                .setFooter({ text: 'Select Start Gaming Community' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error showing commands:', error);
            await interaction.editReply('An error occurred while creating the commands information.');
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
