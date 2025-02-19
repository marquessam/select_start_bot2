import { SlashCommandBuilder } from '@discordjs/builders';
import { EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('View information about bot commands and systems')
        .addStringOption(option =>
            option.setName('topic')
                .setDescription('Specific topic to get help with')
                .setRequired(false)
                .addChoices(
                    { name: 'Monthly Challenges', value: 'monthly' },
                    { name: 'Shadow Games', value: 'shadow' },
                    { name: 'Arcade System', value: 'arcade' },
                    { name: 'Points & Awards', value: 'points' },
                    { name: 'Nominations', value: 'nominations' },
                    { name: 'Commands', value: 'commands' }
                )),

    async execute(interaction) {
        try {
            const topic = interaction.options.getString('topic');

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTimestamp();

            if (!topic) {
                // Show general help overview
                embed.setTitle('🎮 Select Start Bot Help')
                    .setDescription('Welcome to the Select Start gaming community! Here\'s how our systems work:')
                    .addFields(
                        {
                            name: '📅 Monthly Challenges',
                            value: 'Each month features a main game challenge and a hidden shadow game. Use `/games` to view current challenges.',
                            inline: false
                        },
                        {
                            name: '🏆 Points & Awards',
                            value: 'Earn points through:\n' +
                                '• Participation (1 point)\n' +
                                '• Beaten (3 points)\n' +
                                '• Mastery (3 points, Monthly only)',
                            inline: false
                        },
                        {
                            name: '🕹️ Arcade',
                            value: 'Compete in game leaderboards for extra points. Top 3 positions earn 3/2/1 points.',
                            inline: false
                        },
                        {
                            name: '🗳️ Nominations',
                            value: 'Nominate and vote for next month\'s games. Each user gets 2 nominations and 2 votes per month.',
                            inline: false
                        },
                        {
                            name: '❓ Detailed Help',
                            value: 'Use `/help topic:choice` to learn more about specific systems.',
                            inline: false
                        }
                    );
            } else {
                switch (topic) {
                    case 'monthly': {
                        embed.setTitle('📅 Monthly Challenges')
                            .setDescription('Information about monthly game challenges:')
                            .addFields(
                                {
                                    name: 'How It Works',
                                    value: 'Each month has a main challenge game selected by community vote. ' +
                                        'Complete achievements to earn points and compete on the leaderboard.',
                                    inline: false
                                },
                                {
                                    name: 'Awards',
                                    value: '• Participation (1pt): Earn any achievement\n' +
                                        '• Beaten (3pts): Complete progression & win conditions\n' +
                                        '• Mastery (3pts): 100% all achievements',
                                    inline: false
                                },
                                {
                                    name: 'Commands',
                                    value: '`/games` - View current challenges\n' +
                                        '`/profile` - Check your progress\n' +
                                        '`/leaderboard` - View rankings',
                                    inline: false
                                }
                            );
                        break;
                    }
                    case 'shadow': {
                        embed.setTitle('🎭 Shadow Games')
                            .setDescription('Information about shadow game challenges:')
                            .addFields(
                                {
                                    name: 'How It Works',
                                    value: 'Each month has a hidden shadow game that runs alongside the main challenge. ' +
                                        'The community must solve meta-challenges to reveal the game.',
                                    inline: false
                                },
                                {
                                    name: 'Meta Challenges',
                                    value: 'Collect pieces by solving puzzles and completing tasks. ' +
                                        'Once all pieces are collected, the shadow game is revealed.',
                                    inline: false
                                },
                                {
                                    name: 'Awards',
                                    value: '• Participation (1pt): Earn any achievement\n' +
                                        '• Beaten (3pts): Complete progression & win conditions',
                                    inline: false
                                },
                                {
                                    name: 'Commands',
                                    value: '`/shadow status` - Check shadow game status\n' +
                                        '`/shadow progress` - View your progress',
                                    inline: false
                                }
                            );
                        break;
                    }
                    case 'arcade': {
                        embed.setTitle('🕹️ Arcade System')
                            .setDescription('Information about the arcade points system:')
                            .addFields(
                                {
                                    name: 'How It Works',
                                    value: 'Compete on RetroAchievements leaderboards for extra points. ' +
                                        'Points are awarded for top 3 positions in supported games.',
                                    inline: false
                                },
                                {
                                    name: 'Points',
                                    value: '• 1st Place: 3 points\n' +
                                        '• 2nd Place: 2 points\n' +
                                        '• 3rd Place: 1 point',
                                    inline: false
                                },
                                {
                                    name: 'Duration',
                                    value: 'Arcade points expire after 30 days. Stay competitive to maintain your points!',
                                    inline: false
                                },
                                {
                                    name: 'Commands',
                                    value: '`/arcade leaderboard` - View arcade rankings\n' +
                                        '`/arcade points` - Check your points\n' +
                                        '`/arcade game` - View game leaderboard',
                                    inline: false
                                }
                            );
                        break;
                    }
                    case 'points': {
                        embed.setTitle('🏆 Points & Awards')
                            .setDescription('Information about the points system:')
                            .addFields(
                                {
                                    name: 'Monthly Challenge Points',
                                    value: '• Participation: 1 point\n' +
                                        '• Beaten: 3 points\n' +
                                        '• Mastery: 3 points',
                                    inline: false
                                },
                                {
                                    name: 'Shadow Game Points',
                                    value: '• Participation: 1 point\n' +
                                        '• Beaten: 3 points',
                                    inline: false
                                },
                                {
                                    name: 'Arcade Points',
                                    value: '• 1st Place: 3 points\n' +
                                        '• 2nd Place: 2 points\n' +
                                        '• 3rd Place: 1 point\n' +
                                        'Expire after 30 days',
                                    inline: false
                                },
                                {
                                    name: 'Community Points',
                                    value: 'Special points awarded by admins for community contributions and events.',
                                    inline: false
                                },
                                {
                                    name: 'Commands',
                                    value: '`/profile` - View your points\n' +
                                        '`/leaderboard monthly` - Monthly rankings\n' +
                                        '`/leaderboard yearly` - Yearly rankings',
                                    inline: false
                                }
                            );
                        break;
                    }
                    case 'nominations': {
                        embed.setTitle('🗳️ Nominations')
                            .setDescription('Information about game nominations:')
                            .addFields(
                                {
                                    name: 'How It Works',
                                    value: 'Each month, users can nominate games for the next monthly challenge. ' +
                                        'Top nominations are put to a community vote.',
                                    inline: false
                                },
                                {
                                    name: 'Limits',
                                    value: '• 2 nominations per user per month\n' +
                                        '• 2 votes per user per month',
                                    inline: false
                                },
                                {
                                    name: 'Process',
                                    value: '1. Users submit nominations\n' +
                                        '2. Admins approve nominations\n' +
                                        '3. Community votes\n' +
                                        '4. Top game becomes monthly challenge\n' +
                                        '5. Runner-up becomes shadow game',
                                    inline: false
                                },
                                {
                                    name: 'Commands',
                                    value: '`/nominate` - Nominate a game\n' +
                                        '`/vote` - Vote for a nomination',
                                    inline: false
                                }
                            );
                        break;
                    }
                    case 'commands': {
                        embed.setTitle('🤖 Available Commands')
                            .setDescription('List of all available commands:')
                            .addFields(
                                {
                                    name: 'General Commands',
                                    value: '`/help` - Show this help message\n' +
                                        '`/profile` - View your profile\n' +
                                        '`/games` - View current challenges\n' +
                                        '`/leaderboard` - View rankings',
                                    inline: false
                                },
                                {
                                    name: 'Shadow Game Commands',
                                    value: '`/shadow status` - Check shadow game status\n' +
                                        '`/shadow progress` - View your progress',
                                    inline: false
                                },
                                {
                                    name: 'Arcade Commands',
                                    value: '`/arcade leaderboard` - View arcade rankings\n' +
                                        '`/arcade points` - Check your points\n' +
                                        '`/arcade game` - View game leaderboard',
                                    inline: false
                                },
                                {
                                    name: 'Nomination Commands',
                                    value: '`/nominate` - Nominate a game\n' +
                                        '`/vote` - Vote for a nomination',
                                    inline: false
                                }
                            );
                        break;
                    }
                }
            }

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error executing help command:', error);
            await interaction.reply({
                content: 'An error occurred while showing help information. Please try again later.',
                ephemeral: true
            });
        }
    }
};
