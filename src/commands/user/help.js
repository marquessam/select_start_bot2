import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with the Select Start Bot commands and community')
        .addStringOption(option =>
            option.setName('topic')
                .setDescription('Help topic to display')
                .setRequired(false)
                .addChoices(
                    { name: 'Overview', value: 'overview' },
                    { name: 'Commands', value: 'commands' },
                    { name: 'Challenges', value: 'challenges' },
                    { name: 'Shadow Games', value: 'shadow' },
                    { name: 'Arcade', value: 'arcade' },
                    { name: 'Points', value: 'points' },
                    { name: 'Nominations', value: 'nominations' },
                    { name: 'Community Rules', value: 'community' }
                )),

    async execute(interaction) {
       await interaction.deferReply({ ephemeral: true });

        try {
            const topic = interaction.options.getString('topic') || 'main';

            switch (topic) {
                case 'overview':
                    await this.displayOverview(interaction);
                    break;
                case 'commands':
                    await this.displayCommands(interaction);
                    break;
                case 'challenges':
                    await this.displayChallenges(interaction);
                    break;
                case 'shadow':
                    await this.displayShadowChallenge(interaction);
                    break;
                case 'arcade':
                    await this.displayArcade(interaction);
                    break;
                case 'points':
                    await this.displayPoints(interaction);
                    break;
                case 'nominations':
                    await this.displayNominations(interaction);
                    break;
                case 'community':
                    await this.displayCommunityRules(interaction);
                    break;
                default:
                    await this.displayMainHelp(interaction);
            }
        } catch (error) {
            console.error('Help Command Error:', error);
            await interaction.editReply('Failed to display help. Please try again.');
        }
    },

    async displayMainHelp(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Select Start Community Help')
            .setDescription('Welcome to the Select Start Gaming Community! Use this help command to learn about our community and available bot commands.')
            .setColor('#3498DB')
            .addFields({
                name: 'Available Help Topics',
                value: '• `/help topic:overview` - Community overview and how things work\n' +
                      '• `/help topic:commands` - List of available bot commands\n' +
                      '• `/help topic:challenges` - About monthly challenges and awards\n' +
                      '• `/help topic:shadow` - About shadow game challenges\n' +
                      '• `/help topic:arcade` - About arcade and racing leaderboards\n' +
                      '• `/help topic:points` - How points are earned and awarded\n' +
                      '• `/help topic:nominations` - How game nominations work\n' +
                      '• `/help topic:community` - Community rules and guidelines'
            })
            .setFooter({ text: 'Select Start Gaming Community' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async displayOverview(interaction) {
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
            .setFooter({ text: 'Use "/help topic:commands" to see available commands' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async displayCommands(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Available Commands')
            .setColor('#E74C3C')
            .setDescription('Here are the commands you can use in the Select Start community:')
            .addFields(
                {
                    name: '📋 Community Information',
                    value: '• `/help` - Display this help information\n' +
                           '• `/help topic:[topic]` - Display specific information about a topic'
                },
                {
                    name: '🏆 Challenges & Leaderboards',
                    value: '• `/challenge` - Show the current monthly and shadow challenges\n' +
                           '• `/leaderboard` - Display the current monthly challenge leaderboard\n' +
                           '• `/yearlyboard` - Display the yearly points leaderboard\n' +
                           '• `/profile [username]` - Show your or someone else\'s profile\n' +
                           '• `/shadowguess` - Try to guess the hidden shadow game'
                },
                {
                    name: '🗳️ Nominations & Voting',
                    value: '• `/nominate` - Nominate a game for the next monthly challenge\n' +
                           '• `/nominations` - Show all current nominations'
                },
                {
                    name: '🏎️ Arcade & Racing',
                    value: '• `/arcade menu` - Show arcade system menu\n' +
                           '• `/arcade boards` - List all available arcade boards\n' +
                           '• `/arcade board id:<board_id>` - Show a specific arcade leaderboard\n' +
                           '• `/arcade races` - List all racing challenges\n' +
                           '• `/arcade racing` - Show the current month\'s racing challenge\n' +
                           '• `/arcade racing month:<month>` - View a specific racing challenge\n' +
                           '• `/arcade tiebreaker` - Show the current tiebreaker board (if active)'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async displayChallenges(interaction) {
        // Try to get current challenge information for the most relevant data
        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const lastDayOfMonth = new Date(nextMonthStart - 86400000).toISOString().split('T')[0];

            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            // Get month name
            const monthName = now.toLocaleString('default', { month: 'long' });

            let progressionInfo = '';
            let winInfo = '';
            
            if (currentChallenge) {
                // Get progression and win achievement counts
                const progressionCount = currentChallenge.monthly_challange_progression_achievements.length;
                const winCount = currentChallenge.monthly_challange_win_achievements.length;
                
                progressionInfo = `all ${progressionCount} progression achievements`;
                winInfo = winCount > 0 ? ` and at least one of the ${winCount} win achievements` : '';
            }

            const embed = new EmbedBuilder()
                .setTitle('Monthly Challenges')
                .setColor('#9B59B6')
                .setDescription('Our community revolves around monthly challenge games chosen by community vote:')
                .addFields(
                    {
                        name: '🎮 Monthly Challenges',
                        value: 'Each month, we select a game based on community votes. Everyone competes to earn achievements in that game throughout the month.\n\n' +
                               '**Points Available:**\n' +
                               '• Participation: 1 point (earn any achievement)\n' +
                               '• Beaten: 3 points (complete' + (progressionInfo ? ` ${progressionInfo}${winInfo}` : ' all progression achievements') + ')\n' +
                               '• Mastery: 3 points (100% complete all achievements)\n\n' +
                               '**Monthly Prizes:**\n' +
                               '• Top 3 players receive special recognition and prizes each month\n\n' +
                               'Use `/challenge` to see the current challenge and `/leaderboard` to see the standings.'
                    },
                    {
                        name: '📊 Challenge Rules',
                        value: '• Achievements must be earned during the challenge month to count toward standings\n' +
                               '• The challenge begins on the 1st of each month and ends on the last day\n' +
                               '• Use `/profile` to see your current progress and achievement history\n' +
                               '• All RetroAchievements rules must be followed (no cheating or exploits)'
                    }
                )
                .setFooter({ text: 'Use "/challenge" to see the current challenge' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error getting challenge info:', error);
            
            // Fallback embed without specific challenge details
            const embed = new EmbedBuilder()
                .setTitle('Monthly Challenges')
                .setColor('#9B59B6')
                .setDescription('Our community revolves around monthly challenge games chosen by community vote:')
                .addFields(
                    {
                        name: '🎮 Monthly Challenges',
                        value: 'Each month, we select a game based on community votes. Everyone competes to earn achievements in that game throughout the month.\n\n' +
                               '**Points Available:**\n' +
                               '• Participation: 1 point (earn any achievement)\n' +
                               '• Beaten: 3 points (complete all progression achievements)\n' +
                               '• Mastery: 3 points (100% complete all achievements)\n\n' +
                               '**Monthly Prizes:**\n' +
                               '• Top 3 players receive special recognition and prizes each month\n\n' +
                               'Use `/challenge` to see the current challenge and `/leaderboard` to see the standings.'
                    },
                    {
                        name: '📊 Challenge Rules',
                        value: '• Achievements must be earned during the challenge month to count toward standings\n' +
                               '• The challenge begins on the 1st of each month and ends on the last day\n' +
                               '• Use `/profile` to see your current progress and achievement history\n' +
                               '• All RetroAchievements rules must be followed (no cheating or exploits)'
                    }
                )
                .setFooter({ text: 'Use "/challenge" to see the current challenge' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    },

    async displayShadowChallenge(interaction) {
        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            // Get current challenge to check shadow game status
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });
            
            const embed = new EmbedBuilder()
                .setTitle('Shadow Game Challenge')
                .setColor('#9B59B6')
                .setDescription(
                    'The shadow game is a special monthly bonus challenge hidden within our community. ' +
                    'Once discovered, it becomes available to all members as an additional way to earn ' +
                    'points alongside the main monthly challenge.'
                )
                .addFields({
                    name: 'How It Works',
                    value: '1. A shadow game is hidden each month\n' +
                           '2. Members can try to guess it using `/shadowguess`\n' +
                           '3. Once revealed, all members can participate for additional points\n' +
                           '4. Use the `/challenge` command to see if it has been revealed'
                },
                {
                    name: '👥 Shadow Game Points',
                    value: '**Points Available:**\n' +
                           '• Participation: 1 point (earn any achievement)\n' +
                           '• Beaten: 3 points (complete all progression requirements)\n\n' +
                           'Shadow games add an element of mystery to each month\'s challenges! Note that shadow games ' +
                           'are ineligible for mastery awards.'
                })
                .setTimestamp();

            if (!currentChallenge || !currentChallenge.shadow_challange_gameid) {
                embed.addFields({
                    name: 'Status',
                    value: 'No active shadow game available for this month.'
                });
            } else if (currentChallenge.shadow_challange_revealed) {
                // Shadow game is revealed - get game info
                const shadowGameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
                
                // Get progression and win achievement counts for shadow
                const progressionCount = currentChallenge.shadow_challange_progression_achievements.length;
                const winCount = currentChallenge.shadow_challange_win_achievements.length;
                
                embed.addFields({
                    name: 'Current Challenge',
                    value: `**Game:** ${shadowGameInfo.title} (${shadowGameInfo.consoleName})\n\n` +
                           '**Available Points:**\n' +
                           `• **Participation:** 1 point\n` +
                           `• **Beaten:** 3 points (requires all ${progressionCount} progression achievements` +
                           (winCount > 0 ? ` and at least one win achievement` : '') + `)\n\n` +
                           'This challenge can be completed alongside the monthly challenge.'
                });
                
                embed.setURL(`https://retroachievements.org/game/${currentChallenge.shadow_challange_gameid}`);
                
                if (shadowGameInfo.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${shadowGameInfo.imageIcon}`);
                }
            } else {
                embed.addFields({
                    name: 'Status',
                    value: '*A shadow game has been prepared for this month, but it remains hidden.*\n\n' +
                           'Try to identify it by using the `/shadowguess` command followed by your guess for the shadow game.'
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Shadow Rules Error:', error);
            
            // Fallback embed
            const embed = new EmbedBuilder()
                .setTitle('Shadow Game Challenge')
                .setColor('#9B59B6')
                .setDescription(
                    'The shadow game is a special monthly bonus challenge hidden within our community. ' +
                    'Once discovered, it becomes available to all members as an additional way to earn ' +
                    'points alongside the main monthly challenge.'
                )
                .addFields({
                    name: 'How It Works',
                    value: '1. A shadow game is hidden each month\n' +
                           '2. Members can try to guess it using `/shadowguess`\n' +
                           '3. Once revealed, all members can participate for additional points\n' +
                           '4. Use the `/challenge` command to see if it has been revealed'
                },
                {
                    name: '👥 Shadow Game Points',
                    value: '**Points Available:**\n' +
                           '• Participation: 1 point (earn any achievement)\n' +
                           '• Beaten: 3 points (complete all progression requirements)\n\n' +
                           'Shadow games add an element of mystery to each month\'s challenges! Note that shadow games ' +
                           'are ineligible for mastery awards.'
                })
                .setTimestamp();
                
            await interaction.editReply({ embeds: [embed] });
        }
    },

    async displayArcade(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Arcade & Racing Challenges')
            .setColor('#F39C12')
            .setDescription('In addition to monthly challenges, we have special competitions with their own point systems:')
            .addFields(
                {
                    name: '🏎️ Monthly Racing Challenges',
                    value: 'Each month features a racing game time trial. Compete to achieve the fastest time!\n\n' +
                           '**Points Awarded Monthly:**\n' +
                           '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point\n\n' +
                           'Use `/arcade racing` to see the current racing challenge or `/arcade races` to see all available racing challenges. You can also use `/arcade racing month:<name>` to view a specific month\'s challenge.'
                },
                {
                    name: '🎮 Arcade Leaderboards',
                    value: 'We maintain year-round arcade leaderboards for various games. Compete to reach the top positions!\n\n' +
                           'On December 1st each year, the top performers on each arcade board are awarded points:\n' +
                           '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point\n\n' +
                           'Use `/arcade boards` to see all available arcade boards and `/arcade board id:<board_id>` to view a specific leaderboard.'
                },
                {
                    name: '⚔️ Tiebreakers',
                    value: 'In case of ties in monthly challenges, special tiebreaker boards may be created to determine the final rankings.\n\n' +
                           'Tiebreakers are used to resolve ties in the monthly challenge standings. If a tiebreaker is active, you can view it using the `/arcade tiebreaker` command.\n\n' +
                           'Only tied participants can compete in the tiebreaker.'
                },
                {
                    name: '📊 Arcade Menu',
                    value: 'For a complete overview of the arcade system, use `/arcade menu` to see all available options and current active challenges.'
                }
            )
            .setFooter({ text: 'Use "/arcade menu" to see the arcade system menu' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async displayPoints(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Points System')
            .setColor('#1ABC9C')
            .setDescription('Points are awarded across different activities and tracked throughout the year:')
            .addFields(
                {
                    name: '🎮 Monthly Challenge Points',
                    value: '• Participation: 1 point (earn any achievement)\n' +
                           '• Beaten: 3 points (complete all progression requirements)\n' +
                           '• Mastery: 3 points (100% complete all achievements)\n\n' +
                           '**Monthly Prizes:**\n' +
                           '• Top 3 players each month receive special recognition and prizes'
                },
                {
                    name: '👥 Shadow Challenge Points',
                    value: '• Participation: 1 point (earn any achievement)\n' +
                           '• Beaten: 3 points (complete all progression requirements)'
                },
                {
                    name: '🏎️ Racing Challenge Points (Awarded Monthly)',
                    value: '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point\n\n' +
                           'Racing points are awarded monthly for each new track.'
                },
                {
                    name: '🎮 Arcade Leaderboard Points',
                    value: 'Awarded annually on December 1st:\n' +
                           '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point'
                },
                {
                    name: '🏅 Community Awards',
                    value: 'Special community awards may be given by admins for notable achievements or contributions.'
                },
                {
                    name: '🏆 Year-End Prizes',
                    value: 'On December 1st, all points are totaled and prizes are awarded to the top performers across all categories.'
                }
            )
            .setFooter({ text: 'Use "/yearlyboard" to see the current standings' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async displayNominations(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Game Nominations & Voting')
            .setColor('#3498DB')
            .setDescription('Our monthly challenges are determined through a community nomination and voting process:')
            .addFields(
                {
                    name: '🗳️ Nomination Process',
                    value: '1. Each member can nominate up to **2 games per month**\n' +
                           '2. Use the `/nominate gameid:X` command with the RetroAchievements game ID\n' +
                           '3. Game IDs can be found in the RetroAchievements URL, e.g.:\n' +
                           '   `https://retroachievements.org/game/1` → Game ID is `1`\n' +
                           '4. Use `/nominations` to view all current nominations'
                },
                {
                    name: '🗳️ Voting Process',
                    value: '1. During the last week of each month, **10 games are randomly selected** from all nominations\n' +
                           '2. A voting poll is created in the designated channel\n' +
                           '3. Community members can vote for up to 2 games\n' +
                           '4. The game with the most votes becomes the next monthly challenge'
                },
                {
                    name: '📋 Nomination Guidelines',
                    value: 'When nominating games, consider:\n' +
                           '• **Accessibility**: Choose games available on common platforms\n' +
                           '• **Achievement Balance**: Games with a good mix of easy to challenging achievements\n' +
                           '• **Completion Time**: Ideally games that can be completed within a month\n' +
                           '• **Variety**: Different genres or consoles from recent challenges'
                },
                {
                    name: 'Need to Change Your Nomination?',
                    value: 'If you want to change your nomination, ask an admin to use the `/clearnominations` command to reset your nominations'
                }
            )
            .setFooter({ text: 'Nominations reset at the beginning of each month' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
    
    async displayCommunityRules(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Community Guidelines')
            .setColor('#3498DB')
            .setDescription('Rules and information for the Select Start Gaming Community')
            .addFields(
                {
                    name: 'General Conduct',
                    value: '1. Treat all members with respect\n' +
                           '2. No harassment, discrimination, or hate speech\n' +
                           '3. Keep discussions family-friendly\n' +
                           '4. Follow channel topic guidelines\n' +
                           '5. Listen to and respect admin/mod decisions'
                },
                {
                    name: 'Challenge Participation',
                    value: '1. No cheating or exploitation of games\n' +
                           '2. Report technical issues to admins\n' +
                           '3. Submit scores/achievements honestly\n' +
                           '4. Help maintain a fair competition\n' +
                           '5. Celebrate others\' achievements'
                },
                {
                    name: 'Communication Channels',
                    value: '**#general-chat**\n' +
                           '• General discussion and community chat\n\n' +
                           '**#monthly-challenge**\n' +
                           '• Discuss current challenges\n' +
                           '• Share tips and strategies\n\n' +
                           '**#shadow-game**\n' +
                           '• Discuss the shadow game challenge/share clues\n\n' +
                           '**#the-arcade**\n' +
                           '• Discuss the arcade board challenges\n\n' +
                           '**#off-topic**\n' +
                           '• For general discussion of non gaming or specific channel topics'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
