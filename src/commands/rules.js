// File: src/commands/rules.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');

module.exports = {
    name: 'rules',
    description: 'Displays community rules and challenge information',
    async execute(message, args) {
        try {
            if (!args.length) {
                return await this.displayRuleCategories(message);
            }

            const subcommand = args[0].toLowerCase();
            switch (subcommand) {
                case 'monthly':
                    await this.displayMonthlyChallenge(message);
                    break;
                case 'shadow':
                    await this.displayShadowChallenge(message);
                    break;
                case 'points':
                    await this.displayPointsInfo(message);
                    break;
                case 'community':
                    await this.displayCommunityRules(message);
                    break;
                default:
                    await this.displayRuleCategories(message);
            }
        } catch (error) {
            console.error('Rules Command Error:', error);
            await message.reply('Error displaying rules information.');
        }
    },

    async displayRuleCategories(message) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Select Start Rules')
            .setDescription('Choose a category to view specific rules and information.')
            .addFields({
                name: 'Available Categories',
                value: '1. `!rules monthly` - Monthly Challenge Rules & Information\n' +
                      '2. `!rules shadow` - Shadow Game Challenge Information\n' +
                      '3. `!rules points` - Point System Rules & Information\n' +
                      '4. `!rules community` - Community Guidelines & Discord Rules'
            });

        await message.channel.send({ embeds: [embed] });
    },

    async displayMonthlyChallenge(message) {
        try {
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const currentGame = await Game.findOne({
                month: currentMonth,
                year: currentYear,
                type: 'MONTHLY'
            });

            if (!currentGame) {
                return message.reply('No active monthly challenge found.');
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Monthly Challenge Rules')
                .setURL(`https://retroachievements.org/game/${currentGame.gameId}`)
                .setThumbnail('https://media.retroachievements.org/Images/022504.png')
                .addFields(
                    {
                        name: 'Active Challenge',
                        value: `**Game:** ${currentGame.title}\n` +
                               `**Dates:** ${currentDate.toLocaleString('default', { month: 'long' })} 1st - ${currentDate.toLocaleString('default', { month: 'long' })} 31st`
                    },
                    {
                        name: 'Achievement Points',
                        value: '• **Participation:** 1 point (earning any achievement)\n' +
                               '• **Game Beaten:** +3 points (completing the game)\n' +
                               '• **Mastery:** +3 points (100% completion)\n\n' +
                               '*Note: Participation and beaten points must be earned during the active month.*'
                    }
                );

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Monthly Rules Error:', error);
            await message.reply('Error retrieving monthly challenge rules.');
        }
    },

    async displayShadowChallenge(message) {
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('Shadow Game Rules')
            .setDescription('The shadow game is a special monthly bonus challenge hidden within our community. ' +
                          'Once discovered through solving puzzles, it becomes available to all members as an ' +
                          'additional way to earn points alongside the main monthly challenge.')
            .addFields(
                {
                    name: 'How It Works',
                    value: '1. A series of puzzles are hidden in the community\n' +
                           '2. Members work together to solve these puzzles\n' +
                           '3. Upon completion, a bonus game challenge is revealed\n' +
                           '4. All members can then participate for additional points'
                }
            );

        await message.channel.send({ embeds: [embed] });
    },

    async displayPointsInfo(message) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Point System Rules')
            .addFields(
                {
                    name: 'Monthly Challenge Points',
                    value: '**Monthly Game Points:**\n' +
                           '• Participation (1 point): Earn any achievement\n' +
                           '• Game Beaten (3 points): Complete the game\n' +
                           '• Mastery (3 points): 100% achievement completion\n\n' +
                           '**Shadow Game Points:**\n' +
                           '• Participation (1 point): Earn any achievement\n' +
                           '• Game Beaten (3 points): Complete the game'
                },
                {
                    name: 'Important Notes',
                    value: '• Participation and beaten points are time-limited\n' +
                           '• Mastery points can be earned anytime during the year\n' +
                           '• Points contribute to yearly rankings\n' +
                           '• Year-end prizes awarded based on total points'
                }
            );

        await message.channel.send({ embeds: [embed] });
    },

    async displayCommunityRules(message) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Community Guidelines')
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
                           '**#retroachievements**\n' +
                           '• Share your RA profile for verification\n\n' +
                           '**#submissions**\n' +
                           '• Submit arcade high scores with proof\n\n' +
                           '**#monthly-challenge**\n' +
                           '• Discuss current challenges\n' +
                           '• Share tips and strategies\n\n' +
                           '**#bot-terminal**\n' +
                           '• All bot commands must be used here\n' +
                           '• Keep other channels clear of bot commands'
                }
            );

        await message.channel.send({ embeds: [embed] });
    }
};