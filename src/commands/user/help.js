import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

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
                    { name: 'Arcade', value: 'arcade' },
                    { name: 'Points', value: 'points' },
                    { name: 'Nominations', value: 'nominations' }
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
                case 'arcade':
                    await this.displayArcade(interaction);
                    break;
                case 'points':
                    await this.displayPoints(interaction);
                    break;
                case 'nominations':
                    await this.displayNominations(interaction);
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
                      '• `/help topic:challenges` - About monthly and shadow challenges\n' +
                      '• `/help topic:arcade` - About arcade and racing leaderboards\n' +
                      '• `/help topic:points` - How points are earned and awarded\n' +
                      '• `/help topic:nominations` - How game nominations work'
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
                    value: 'Each month, we select a game chosen by community vote. Everyone competes to earn achievements in that game. There are also hidden "shadow games" that add an extra challenge!'
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
                    value: 'We have monthly racing challenges and year-round arcade leaderboards. Compete for the top positions to earn additional community points!'
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
                           '• `/rules` - Display community rules and guidelines'
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
                    value: '• `/arcade list` - List all available arcade boards\n' +
                           '• `/arcade board` - Show a specific arcade leaderboard\n' +
                           '• `/arcade racing` - Show the current month\'s racing challenge\n' +
                           '• `/arcade tiebreaker` - Show the current tiebreaker board (if active)'
                }
            )
            .setFooter({ text: 'Select Start Gaming Community' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async displayChallenges(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Monthly & Shadow Challenges')
            .setColor('#9B59B6')
            .setDescription('Our community revolves around two main types of challenges each month:')
            .addFields(
                {
                    name: '🎮 Monthly Challenges',
                    value: 'Each month, we select a game based on community votes. Everyone competes to earn achievements in that game throughout the month.\n\n' +
                           '**Points Available:**\n' +
                           '• Participation: 1 point (earn any achievement)\n' +
                           '• Beaten: 3 points (complete all progression achievements)\n' +
                           '• Mastery: 3 points (100% complete all achievements)\n\n' +
                           'Use `/challenge` to see the current challenge and `/leaderboard` to see the standings.'
                },
                {
                    name: '👥 Shadow Challenges',
                    value: 'Each month has a hidden "shadow game" that runs alongside the main challenge. The shadow game must be discovered before it can be competed in.\n\n' +
                           '**How to Find:**\n' +
                           'Use `/shadowguess` to guess the shadow game.\n\n' +
                           '**Points Available:**\n' +
                           '• Participation: 1 point\n' +
                           '• Beaten: 3 points\n\n' +
                           'Shadow games add an element of mystery to each month\'s challenges!'
                }
            )
            .setFooter({ text: 'Use "/challenge" to see current challenges' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
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
                           '**Points Awarded:**\n' +
                           '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point\n\n' +
                           'Use `/arcade racing` to see the current racing challenge.'
                },
                {
                    name: '🎮 Arcade Leaderboards',
                    value: 'We maintain year-round arcade leaderboards for various games. Compete to reach the top positions!\n\n' +
                           'On December 1st each year, the top performers on each arcade board are awarded points:\n' +
                           '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point\n\n' +
                           'Use `/arcade list` to see all available arcade boards and `/arcade board id:<board_id>` to view a specific leaderboard.'
                },
                {
                    name: '⚔️ Tiebreakers',
                    value: 'In case of ties in monthly challenges, special tiebreaker boards may be created to determine the final rankings.\n\n' +
                           'Use `/arcade tiebreaker` to check if any tiebreaker is currently active.'
                }
            )
            .setFooter({ text: 'Use "/arcade list" to see all arcade boards' })
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
                           '• Mastery: 3 points (100% complete all achievements)'
                },
                {
                    name: '👥 Shadow Challenge Points',
                    value: '• Participation: 1 point (earn any achievement)\n' +
                           '• Beaten: 3 points (complete all progression requirements)'
                },
                {
                    name: '🏎️ Racing Challenge Points',
                    value: '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point'
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
                }
            )
            .setFooter({ text: 'Nominations reset at the beginning of each month' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
