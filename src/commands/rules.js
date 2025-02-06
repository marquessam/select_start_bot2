// File: src/commands/rules.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');

/**
 * Generates a table using Unicode box-drawing characters.
 * @param {string[]} headers - An array of header titles.
 * @param {Array<Array<string|number>>} rows - An array of rows (each row is an array of cell values).
 * @returns {string} - The formatted table as a string.
 */
function generateTable(headers, rows) {
    const colWidths = headers.map((header, i) =>
        Math.max(header.length, ...rows.map(row => row[i].toString().length))
    );

    const horizontalLine = (left, mid, right) => {
        let line = left;
        colWidths.forEach((width, index) => {
            line += '─'.repeat(width + 2) + (index < colWidths.length - 1 ? mid : right);
        });
        return line;
    };

    const topBorder = horizontalLine('┌', '┬', '┐');
    const headerSeparator = horizontalLine('├', '┼', '┤');
    const bottomBorder = horizontalLine('└', '┴', '┘');

    const formatRow = (row) => {
        let rowStr = '│';
        row.forEach((cell, index) => {
            rowStr += ' ' + cell.toString().padEnd(colWidths[index]) + ' │';
        });
        return rowStr;
    };

    const headerRow = formatRow(headers);
    const rowLines = rows.map(formatRow);

    return [topBorder, headerRow, headerSeparator, ...rowLines, bottomBorder].join('\n');
}

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
        const categoriesText = [
            '────────────────────────────',
            '1. `!rules monthly`   - Monthly Challenge Rules & Information',
            '2. `!rules shadow`    - Shadow Game Challenge Information',
            '3. `!rules points`    - Point System Rules & Information',
            '4. `!rules community` - Community Guidelines & Discord Rules',
            '────────────────────────────'
        ].join('\n');

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Select Rules Category')
            .setDescription('Choose a category to view specific rules and information.')
            .addFields({
                name: 'Available Categories',
                value: '```' + categoriesText + '```'
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

            // Build a table for the Active Challenge details
            const activeChallengeTable = generateTable(
                ['Field', 'Details'],
                [
                    ['Game', currentGame.title],
                    ['Dates', `${currentDate.toLocaleString('default', { month: 'long' })} 1 - ${currentDate.toLocaleString('default', { month: 'long' })} 31`]
                ]
            );

            // Build a table for the Achievement Points
            const achievementPointsTable = generateTable(
                ['Achievement', 'Points'],
                [
                    ['Participation', '1'],
                    ['Game Beaten', '+3'],
                    ['Mastery', '+3']
                ]
            );

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Monthly Challenge Rules')
                .setURL(`https://retroachievements.org/game/${currentGame.gameId}`)
                .setThumbnail('https://media.retroachievements.org/Images/022504.png')
                .addFields(
                    {
                        name: 'Active Challenge',
                        value: '```' + activeChallengeTable + '```'
                    },
                    {
                        name: 'Achievement Points',
                        value: '```' + achievementPointsTable + '```\n*Note: Participation and beaten points must be earned during the active month.*'
                    }
                );

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Monthly Rules Error:', error);
            await message.reply('Error retrieving monthly challenge rules.');
        }
    },

    async displayShadowChallenge(message) {
        // Build a table for "How It Works" steps
        const howItWorksTable = generateTable(
            ['Step', 'Description'],
            [
                ['1', 'Find hidden puzzles in the community'],
                ['2', 'Solve puzzles to reveal bonus challenge'],
                ['3', 'Participate for extra points'],
                ['4', 'All members can join once revealed']
            ]
        );

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('Shadow Game Rules')
            .setDescription('The shadow game is a special monthly bonus challenge hidden within our community. Once discovered, it becomes available to all members as an additional way to earn points alongside the main challenge.')
            .addFields({
                name: 'How It Works',
                value: '```' + howItWorksTable + '```'
            });

        await message.channel.send({ embeds: [embed] });
    },

    async displayPointsInfo(message) {
        // Build a table for Monthly Challenge Points
        const monthlyPointsTable = generateTable(
            ['Achievement', 'Points'],
            [
                ['Participation', '1'],
                ['Game Beaten', '+3'],
                ['Mastery', '+3']
            ]
        );

        // Build a table for Shadow Game Points
        const shadowPointsTable = generateTable(
            ['Achievement', 'Points'],
            [
                ['Participation', '1'],
                ['Game Beaten', '+3']
            ]
        );

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Point System Rules')
            .addFields(
                {
                    name: 'Monthly Challenge Points',
                    value: '```' + monthlyPointsTable + '```'
                },
                {
                    name: 'Shadow Game Points',
                    value: '```' + shadowPointsTable + '```'
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
        // Build a table for General Conduct rules
        const generalConductTable = generateTable(
            ['Rule #', 'General Conduct'],
            [
                ['1', 'Treat all members with respect'],
                ['2', 'No harassment, discrimination, or hate speech'],
                ['3', 'Keep discussions family-friendly'],
                ['4', 'Follow channel topic guidelines'],
                ['5', 'Respect admin/mod decisions']
            ]
        );

        // Build a table for Challenge Participation guidelines
        const participationTable = generateTable(
            ['Rule #', 'Participation'],
            [
                ['1', 'No cheating or game exploitation'],
                ['2', 'Report technical issues to admins'],
                ['3', 'Submit scores/achievements honestly'],
                ['4', 'Maintain fair competition'],
                ['5', 'Celebrate others’ achievements']
            ]
        );

        // Build a table for Communication Channels
        const channelsTable = generateTable(
            ['Channel', 'Purpose'],
            [
                ['#general-chat', 'General discussion'],
                ['#retroachievements', 'Share RA profile for verification'],
                ['#submissions', 'Submit arcade high scores'],
                ['#monthly-challenge', 'Discuss current challenges'],
                ['#bot-terminal', 'Bot commands only']
            ]
        );

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Community Guidelines')
            .addFields(
                {
                    name: 'General Conduct',
                    value: '```' + generalConductTable + '```'
                },
                {
                    name: 'Challenge Participation',
                    value: '```' + participationTable + '```'
                },
                {
                    name: 'Communication Channels',
                    value: '```' + channelsTable + '```'
                }
            );

        await message.channel.send({ embeds: [embed] });
    }
};
