import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    PermissionFlagsBits
} from 'discord.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('admininfo')
        .setDescription('Display shareable information about the community')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        // Create the selection menu embed
        const menuEmbed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('Information Selection')
            .setDescription('Select the type of information you want to display to the community:')
            .addFields(
                { 
                    name: 'Available Information', 
                    value: '• **Arcade Boards** - List of all arcade boards\n' +
                           '• **Challenges** - Current monthly and shadow challenges\n' +
                           '• **Overview** - Community overview and description\n' +
                           '• **Commands** - List of available commands for users\n' +
                           '• **Rules** - Community rules and guidelines'
                }
            )
            .setFooter({ text: 'Select an option from the dropdown menu below' })
            .setTimestamp();

        // Create the dropdown menu
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('info_selection')
                    .setPlaceholder('Select information type')
                    .addOptions([
                        {
                            label: 'Arcade Boards',
                            description: 'Display a list of all arcade boards',
                            value: 'arcade',
                            emoji: '🎮'
                        },
                        {
                            label: 'Challenges',
                            description: 'Display current monthly and shadow challenges',
                            value: 'challenges',
                            emoji: '🏆'
                        },
                        {
                            label: 'Community Overview',
                            description: 'Display general community information',
                            value: 'overview',
                            emoji: 'ℹ️'
                        },
                        {
                            label: 'Available Commands',
                            description: 'Display list of available commands',
                            value: 'commands',
                            emoji: '📋'
                        },
                        {
                            label: 'Rules & Guidelines',
                            description: 'Display community rules and guidelines',
                            value: 'rules',
                            emoji: '📜'
                        }
                    ])
            );

        // Send the initial menu - ephemeral so only admin sees the menu
        const message = await interaction.reply({
            embeds: [menuEmbed],
            components: [actionRow],
            ephemeral: true
        });

        // Set up collector for menu interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000 // 5 minutes timeout
        });

        collector.on('collect', async i => {
            if (i.user.id === interaction.user.id) {
                try {
                    // Defer update to indicate we're processing
                    await i.deferUpdate();
                    
                    // Get selected value
                    const selectedValue = i.values[0];
                    
                    // Generate a non-ephemeral response based on selection that everyone can see
                    switch(selectedValue) {
                        case 'arcade':
                            await this.handleArcadeBoards(i);
                            break;
                        case 'challenges':
                            await this.handleChallenges(i);
                            break;
                        case 'overview':
                            await this.handleOverview(i);
                            break;
                        case 'commands':
                            await this.handleCommands(i);
                            break;
                        case 'rules':
                            await this.handleRules(i);
                            break;
                        default:
                            await i.editReply('Invalid selection. Please try again.');
                    }
                    
                    // Stop the collector after handling selection
                    collector.stop();
                } catch (error) {
                    console.error('Error handling info selection:', error);
                    await i.editReply('An error occurred while processing your selection. Please try again.');
                }
            } else {
                await i.reply({ 
                    content: 'This menu is not for you. Please use the `/admininfo` command to start your own session.',
                    ephemeral: true 
                });
            }
        });

        // Handle collector end event
        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                // Only update if it was a timeout and no selections were made
                try {
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(
                            StringSelectMenuBuilder.from(actionRow.components[0]).setDisabled(true)
                        );
                    
                    await interaction.editReply({
                        embeds: [menuEmbed.setFooter({ text: 'This menu has expired. Please run /admininfo again.' })],
                        components: [disabledRow]
                    });
                } catch (error) {
                    console.error('Error disabling menu:', error);
                }
            }
        });
    },

    /**
     * Handle arcade boards information display
     */
    async handleArcadeBoards(interaction) {
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
                .setDescription(' ')
                .setFooter({ text: 'Data provided by RetroAchievements.org' });
            
            // Add explanation of how arcade works
            embed.addFields({
                name: 'How Arcade Works',
                value: 'New arcade boards are announced in the 2nd week of each month and added to our collection. You are only competing against other members of Select Start and must place in the top 999 of the global leaderboard to appear in our rankings.\n\n' +
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
                value: 'Use `/arcade` to view detailed leaderboards and track your progress.' 
            });
            
            // Send a public (non-ephemeral) message visible to everyone
            await interaction.followUp({ embeds: [embed], ephemeral: false });
            
            // Confirm to admin that info was posted
            await interaction.editReply({ 
                content: 'Arcade boards information has been posted successfully.',
                embeds: [],
                components: []
            });
        } catch (error) {
            console.error('Error listing arcade boards:', error);
            await interaction.editReply('An error occurred while retrieving arcade boards.');
        }
    },

    /**
     * Handle challenges information display
     */
    async handleChallenges(interaction) {
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
                monthlyText += `**Points Available (Additive):**\n`;
                monthlyText += `• Participation: 1 point (any achievement)\n`;
                monthlyText += `• Beaten: +3 points (4 total)\n`;
                monthlyText += `• Mastery: +3 points (7 total)\n\n`;
                monthlyText += `**Important:** You must complete the challenge within this month to earn points.`;
                
                embed.addFields({ name: '🏆 Monthly Challenge', value: monthlyText });
                
                if (gameInfo.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } else {
                embed.addFields({ name: '🏆 Monthly Challenge', value: 'No active challenge found for the current month.' });
            }

            // Shadow Challenge
            if (currentChallenge && currentChallenge.shadow_challange_gameid && 
                (currentChallenge.shadow_challange_revealed || this.isPastChallenge(currentChallenge.date))) {
                const shadowGameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
                const shadowUrl = `https://retroachievements.org/game/${currentChallenge.shadow_challange_gameid}`;
                
                let shadowText = `**Game:** [${shadowGameInfo.title}](${shadowUrl})\n`;
                shadowText += `**Ends:** <t:${lastDayTimestamp}:F>\n\n`;
                shadowText += `**Points Available (Additive):**\n`;
                shadowText += `• Participation: 1 point (any achievement)\n`;
                shadowText += `• Beaten: +3 points (4 total)\n\n`;
                shadowText += `**Important:** You must complete the challenge within this month to earn points. Shadow games are capped at Beaten status.`;
                
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

            // Send a public (non-ephemeral) message visible to everyone
            await interaction.followUp({ embeds: [embed], ephemeral: false });
            
            // Confirm to admin that info was posted
            await interaction.editReply({ 
                content: 'Current challenges information has been posted successfully.',
                embeds: [],
                components: []
            });
        } catch (error) {
            console.error('Error retrieving challenges:', error);
            await interaction.editReply('An error occurred while retrieving challenge information.');
        }
    },

    /**
     * Handle community overview information display
     */
    async handleOverview(interaction) {
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
                        name: '🗳️ Game Nominations',
                        value: 'Each month, you can nominate up to two games for the next challenge. Voting starts 8 days before the end of the month with 10 randomly selected games from all nominations.'
                    },
                    {
                        name: '🏎️ Racing & Arcade',
                        value: 'We have monthly racing challenges that start on the 1st of each month and year-round arcade leaderboards announced in the 2nd week. Compete for the top positions to earn additional community points!'
                    },
                    {
                        name: '⚔️ Arena System',
                        value: 'Challenge other community members to head-to-head competitions on RetroAchievements leaderboards. Wager GP (Gold Points) and prove your skills in direct competition!'
                    },
                    {
                        name: '🏆 Point System',
                        value: 'You can earn points by participating in monthly challenges, discovering shadow games, racing competitions, arcade leaderboards, and arena battles. Points accumulate throughout the year for annual prizes.'
                    },
                    {
                        name: '📅 Monthly Schedule',
                        value: '• **1st:** New monthly, shadow, and racing challenges begin\n• **2nd week:** New arcade boards announced\n• **3rd week:** Tiebreakers announced if needed\n• **8 days before month end:** Voting opens\n• **1 day before month end:** Voting closes'
                    },
                    {
                        name: '🏅 Year-End Awards',
                        value: 'On December 1st, yearly points are totaled and prizes are awarded to top performers across all categories.'
                    }
                )
                .setFooter({ text: 'Select Start Gaming Community' })
                .setTimestamp();

            // Send a public (non-ephemeral) message visible to everyone
            await interaction.followUp({ embeds: [embed], ephemeral: false });
            
            // Confirm to admin that info was posted
            await interaction.editReply({ 
                content: 'Community overview has been posted successfully.',
                embeds: [],
                components: []
            });
        } catch (error) {
            console.error('Error showing overview:', error);
            await interaction.editReply('An error occurred while creating the overview information.');
        }
    },

    /**
     * Handle commands information display
     */
    async handleCommands(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('Available Commands')
                .setColor('#E74C3C')
                .setDescription('Here are the commands you can use in the Select Start community:')
                .addFields(
                    {
                        name: '📋 Community Information',
                        value: '• `/help` - Display help information with interactive buttons\n' +
                               '• `/rules` - View detailed community rules and guidelines'
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
                        name: '🗳️ Nominations & Suggestions',
                        value: '• `/nominate` - Nominate a game for the next monthly challenge\n' +
                               '• `/nominations` - Show all current nominations for the next month\n' +
                               '• `/suggest` - Suggest arcade boards, racing tracks, or bot improvements\n' +
                               '• `/vote` - Cast your vote for the next monthly challenge (when active)'
                    },
                    {
                        name: '🏎️ Arcade & Racing',
                        value: '• `/arcade` - Interactive menu for arcade boards and racing challenges\n' +
                               '  - View all arcade leaderboards\n' +
                               '  - Check current and past racing challenges\n' +
                               '  - See active tiebreaker competitions'
                    },
                    {
                        name: '⚔️ Arena Battles',
                        value: '• `/arena` - Access the arena system for competitive battles\n' +
                               '  - Challenge other members to head-to-head competitions\n' +
                               '  - Bet points on your performance\n' +
                               '  - Accept or decline incoming challenges'
                    }
                )
                .setFooter({ text: 'Select Start Gaming Community' })
                .setTimestamp();

            // Send a public (non-ephemeral) message visible to everyone
            await interaction.followUp({ embeds: [embed], ephemeral: false });
            
            // Confirm to admin that info was posted
            await interaction.editReply({ 
                content: 'Commands information has been posted successfully.',
                embeds: [],
                components: []
            });
        } catch (error) {
            console.error('Error showing commands:', error);
            await interaction.editReply('An error occurred while creating the commands information.');
        }
    },

    /**
     * Handle rules information display
     */
    async handleRules(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('Community Rules & Guidelines')
                .setColor('#3498DB')
                .setDescription('These rules help ensure a fair competition and enjoyable experience for all members:')
                .addFields(
                    {
                        name: '📜 General Community Rules',
                        value: '• Treat all members with respect\n' +
                               '• No harassment, discrimination, or hate speech\n' +
                               '• Keep discussions family-friendly\n' +
                               '• Follow channel topic guidelines\n' +
                               '• Listen to and respect admin/mod decisions'
                    },
                    {
                        name: '🎮 RetroAchievements Requirements',
                        value: '• **Hardcore Mode is REQUIRED** for all challenges\n' +
                               '• Save states and rewind features are **not allowed**\n' +
                               '• Fast forward is permitted\n' +
                               '• Only achievements earned in Hardcore Mode will count\n' +
                               '• All RetroAchievements rules and guidelines must be followed'
                    },
                    {
                        name: '🏆 Competition Guidelines',
                        value: '• No cheating or exploitation of games\n' +
                               '• Submit scores and achievements honestly\n' +
                               '• Report technical issues to admins promptly\n' +
                               '• **Achievements must be earned during the challenge month to earn points**\n' +
                               '• One grace period on the last day of the previous month for participation only\n' +
                               '• Help maintain a fair and supportive competitive environment'
                    },
                    {
                        name: '📝 Registration Requirements',
                        value: '• You must be registered by an admin using the `/register` command\n' +
                               '• Your RetroAchievements username must be linked to your Discord account\n' +
                               '• You must place in the top 999 of the global leaderboard to appear in arcade rankings'
                    },
                    {
                        name: '🏆 Points System (Additive)',
                        value: '• **Monthly/Shadow Challenges:** Participation (1), Beaten (+3), Mastery (+3)\n' +
                               '• **Racing:** 1st (3), 2nd (2), 3rd (1) - awarded monthly\n' +
                               '• **Arcade:** 1st (3), 2nd (2), 3rd (1) - awarded December 1st\n' +
                               '• **Arena:** GP wagering system (separate from community points)\n' +
                               '• **Important:** Monthly and shadow challenges must be completed within their respective month to earn points'
                    },
                    {
                        name: '⚔️ Arena System',
                        value: '• Challenge other members to head-to-head competitions\n' +
                               '• Both players must agree to challenge terms and GP wagers\n' +
                               '• Challenges last 1 week with specific objectives\n' +
                               '• GP (Gold Points) are wagered, winner takes all\n' +
                               '• Monthly GP allowance of 1,000 given on the 1st\n' +
                               '• Fair play and sportsmanship are expected'
                    },
                    {
                        name: '💬 Communication Guidelines',
                        value: '• Stay on topic in designated channels\n' +
                               '• Use spoiler tags when discussing challenge solutions\n' +
                               '• Share tips and strategies in a constructive manner\n' +
                               '• Celebrate and encourage others\' achievements\n' +
                               '• Direct feedback and suggestions through proper channels'
                    }
                )
                .setFooter({ text: 'Select Start Gaming Community • Use /rules for detailed rules' })
                .setTimestamp();

            // Send a public (non-ephemeral) message visible to everyone
            await interaction.followUp({ embeds: [embed], ephemeral: false });
            
            // Confirm to admin that info was posted
            await interaction.editReply({ 
                content: 'Rules information has been posted successfully.',
                embeds: [],
                components: []
            });
        } catch (error) {
            console.error('Error showing rules:', error);
            await interaction.editReply('An error occurred while creating the rules information.');
        }
    },

    // Helper function to check if a challenge is from a past month
    isPastChallenge(challengeDate) {
        const now = new Date();
        // Challenge is in the past if it's from a previous month or previous year
        return (challengeDate.getFullYear() < now.getFullYear()) ||
               (challengeDate.getFullYear() === now.getFullYear() && 
                challengeDate.getMonth() < now.getMonth());
    }
};
