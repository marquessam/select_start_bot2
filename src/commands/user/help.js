import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with the Select Start Bot commands and community'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Start with the main help menu
            await this.displayMainHelp(interaction);
        } catch (error) {
            console.error('Help Command Error:', error);
            await interaction.editReply('Failed to display help. Please try again.');
        }
    },

    async displayMainHelp(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Select Start Community Help')
            .setDescription('Welcome to the Select Start Gaming Community! Choose a topic below to learn more about our community and available bot commands.')
            .setColor('#3498DB')
            .addFields({
                name: 'Available Help Topics',
                value: '🔍 **Overview** - Community overview and how things work\n' +
                      '🤖 **Commands** - List of available bot commands\n' +
                      '🎮 **Challenges** - About monthly challenges and awards\n' +
                      '👥 **Shadow Games** - About shadow game challenges\n' +
                      '🏎️ **Arcade** - About arcade and racing leaderboards\n' +
                      '🏆 **Points** - How points are earned and awarded\n' +
                      '🗳️ **Nominations** - How game nominations work\n' +
                      '📋 **Community Rules** - Community rules and guidelines'
            })
            .setFooter({ text: 'Select Start Gaming Community • Press a button below to view a topic' })
            .setTimestamp();

        // Create two rows of buttons (4 buttons per row)
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('overview')
                    .setLabel('Overview')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔍'),
                new ButtonBuilder()
                    .setCustomId('commands')
                    .setLabel('Commands')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🤖'),
                new ButtonBuilder()
                    .setCustomId('challenges')
                    .setLabel('Challenges')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎮'),
                new ButtonBuilder()
                    .setCustomId('shadow')
                    .setLabel('Shadow Games')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('👥')
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arcade')
                    .setLabel('Arcade')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🏎️'),
                new ButtonBuilder()
                    .setCustomId('points')
                    .setLabel('Points')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🏆'),
                new ButtonBuilder()
                    .setCustomId('nominations')
                    .setLabel('Nominations')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🗳️'),
                new ButtonBuilder()
                    .setCustomId('community')
                    .setLabel('Community Rules')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📋')
            );

        // Send the initial message with buttons
        const message = await interaction.editReply({
            embeds: [embed],
            components: [row1, row2]
        });

        // Create collector for button interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 600000 // Time limit: 10 minutes
        });

        // Handle button clicks
        collector.on('collect', async (i) => {
            // We need to defer the update to avoid interaction timeouts
            await i.deferUpdate();

            // Generate back button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );

            // Handle different button clicks
            switch (i.customId) {
                case 'overview':
                    const overviewEmbed = await this.createOverviewEmbed();
                    await i.editReply({ embeds: [overviewEmbed], components: [backRow] });
                    break;
                case 'commands':
                    const commandsEmbed = await this.createCommandsEmbed();
                    await i.editReply({ embeds: [commandsEmbed], components: [backRow] });
                    break;
                case 'challenges':
                    const challengesEmbed = await this.createChallengesEmbed();
                    await i.editReply({ embeds: [challengesEmbed], components: [backRow] });
                    break;
                case 'shadow':
                    const shadowEmbed = await this.createShadowEmbed();
                    await i.editReply({ embeds: [shadowEmbed], components: [backRow] });
                    break;
                case 'arcade':
                    const arcadeEmbed = await this.createArcadeEmbed();
                    await i.editReply({ embeds: [arcadeEmbed], components: [backRow] });
                    break;
                case 'points':
                    const pointsEmbed = await this.createPointsEmbed();
                    await i.editReply({ embeds: [pointsEmbed], components: [backRow] });
                    break;
                case 'nominations':
                    const nominationsEmbed = await this.createNominationsEmbed();
                    await i.editReply({ embeds: [nominationsEmbed], components: [backRow] });
                    break;
                case 'community':
                    const communityEmbed = await this.createCommunityEmbed();
                    await i.editReply({ embeds: [communityEmbed], components: [backRow] });
                    break;
                case 'back':
                    // Return to main menu
                    await i.editReply({ embeds: [embed], components: [row1, row2] });
                    break;
            }
        });

        // When the collector expires
        collector.on('end', async () => {
            try {
                // Disable all buttons when time expires
                const disabledRow1 = new ActionRowBuilder()
                    .addComponents(
                        row1.components[0].setDisabled(true),
                        row1.components[1].setDisabled(true),
                        row1.components[2].setDisabled(true),
                        row1.components[3].setDisabled(true)
                    );

                const disabledRow2 = new ActionRowBuilder()
                    .addComponents(
                        row2.components[0].setDisabled(true),
                        row2.components[1].setDisabled(true),
                        row2.components[2].setDisabled(true),
                        row2.components[3].setDisabled(true)
                    );

                // Update with disabled buttons
                await interaction.editReply({
                    embeds: [embed.setFooter({ text: 'Select Start Gaming Community • Help session expired' })],
                    components: [disabledRow1, disabledRow2]
                });
            } catch (error) {
                console.error('Error disabling buttons:', error);
            }
        });
    },

    // Create all the embed functions
    async createOverviewEmbed() {
        return new EmbedBuilder()
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
            .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
            .setTimestamp();
    },

    async createCommandsEmbed() {
        return new EmbedBuilder()
            .setTitle('Available Commands')
            .setColor('#E74C3C')
            .setDescription('Here are the commands you can use in the Select Start community:')
            .addFields(
                {
                    name: '📋 Community Information',
                    value: '• `/help` - Display this help information with interactive buttons'
                },
                {
                    name: '🏆 Challenges & Leaderboards',
                    value: '• `/challenge` - Show the current monthly, shadow, and racing challenges\n' +
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
            .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
            .setTimestamp();
    },

    async createChallengesEmbed() {
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

            return new EmbedBuilder()
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
                .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
                .setTimestamp();
        } catch (error) {
            console.error('Error getting challenge info:', error);
            
            // Fallback embed without specific challenge details
            return new EmbedBuilder()
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
                .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
                .setTimestamp();
        }
    },

    async createShadowEmbed() {
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
                .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
                .setTimestamp();

            if (currentChallenge && currentChallenge.shadow_challange_gameid && currentChallenge.shadow_challange_revealed) {
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
            }

            return embed;
        } catch (error) {
            console.error('Shadow Rules Error:', error);
            
            // Fallback embed
            return new EmbedBuilder()
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
                .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
                .setTimestamp();
        }
    },

    async createArcadeEmbed() {
        return new EmbedBuilder()
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
            .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
            .setTimestamp();
    },

    async createPointsEmbed() {
        return new EmbedBuilder()
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
            .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
            .setTimestamp();
    },

    async createNominationsEmbed() {
        return new EmbedBuilder()
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
            .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
            .setTimestamp();
    },
    
    async createCommunityEmbed() {
        return new EmbedBuilder()
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
                           '• For all non gaming/specific topic discussion'
                }
            )
            .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
            .setTimestamp();
    }
};
