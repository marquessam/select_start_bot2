// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');

/**
 * Calculates total points from an award object.
 * @param {object} awards - The awards object containing booleans.
 * @returns {number} - Total points.
 */
function calculatePoints(awards) {
    let points = 0;
    if (awards.participation) points += 1;
    if (awards.beaten) points += 3;
    if (awards.mastered) points += 3;
    return points;
}

/**
 * Generates a table using Unicode box-drawing characters.
 * @param {string[]} headers - The header titles.
 * @param {Array<Array<string|number>>} rows - The table rows.
 * @returns {string} - The formatted table as a string.
 */
function generateTable(headers, rows) {
    // Calculate maximum width for each column
    const colWidths = headers.map((header, i) =>
        Math.max(
            header.length,
            ...rows.map(row => row[i].toString().length)
        )
    );

    // Function to generate a horizontal line given border characters
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

    // Function to format a row's cells with proper padding
    const formatRow = (row) => {
        let rowStr = '│';
        row.forEach((cell, index) => {
            rowStr += ' ' + cell.toString().padEnd(colWidths[index]) + ' │';
        });
        return rowStr;
    };

    const headerRow = formatRow(headers);
    const rowLines = rows.map(formatRow);

    return [
        topBorder,
        headerRow,
        headerSeparator,
        ...rowLines,
        bottomBorder
    ].join('\n');
}

module.exports = {
    name: 'profile',
    description: 'Shows user profile information',
    async execute(message, args) {
        try {
            // Get username for search (defaults to "Royek" if none provided)
            let requestedUsername = args[0] || "Royek";

            // Find the user using a case-insensitive search
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${requestedUsername}$`, 'i') }
            });

            if (!user) {
                return message.reply(`User ${requestedUsername} not found.`);
            }

            // Use the canonical username from the database
            const raUsername = user.raUsername;
            const raProfileImageUrl = `https://media.retroachievements.org/UserPic/${raUsername}.png`;

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`User Profile: ${raUsername}`)
                .setThumbnail(raProfileImageUrl);

            // Get current month game and progress
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const currentGame = await Game.findOne({
                month: currentMonth,
                year: currentYear,
                type: 'MONTHLY'
            });

            const currentAward = currentGame ? await Award.findOne({
                raUsername: raUsername,
                gameId: currentGame.gameId,
                month: currentMonth,
                year: currentYear
            }) : null;

            if (currentGame && currentAward) {
                // Build a table for the current challenge progress
                const currentChallengeTable = generateTable(
                    ['Field', 'Value'],
                    [
                        ['Title', currentGame.title],
                        ['Progress', `${currentAward.achievementCount}/${currentAward.totalAchievements} (${currentAward.userCompletion})`]
                    ]
                );
                embed.addFields({
                    name: '🎮 Current Challenge Progress',
                    value: '```' + currentChallengeTable + '```'
                });
            }

            // Get all user's awards for the current year
            const awards = await Award.find({
                raUsername: raUsername,
                year: currentYear
            });

            // Calculate statistics and collect game titles for each award type
            const processedGames = new Set();
            let totalAchievements = 0;
            let participationCount = 0;
            let beatenCount = 0;
            let masteredCount = 0;
            let participationGames = [];
            let beatenGames = [];
            let masteredGames = [];
            let totalPoints = 0;

            const games = await Game.find({ year: currentYear }).sort({ month: 1, type: 1 });

            games.forEach(game => {
                const award = awards.find(a => a.gameId === game.gameId);
                if (award) {
                    const gameKey = `${game.gameId}-${game.month}`;
                    if (!processedGames.has(gameKey)) {
                        processedGames.add(gameKey);
                        totalAchievements += award.achievementCount;

                        if (award.awards.participation) {
                            participationCount++;
                            participationGames.push(game.title);
                        }
                        if (award.awards.beaten) {
                            beatenCount++;
                            beatenGames.push(game.title);
                        }
                        if (award.awards.mastered) {
                            masteredCount++;
                            masteredGames.push(game.title);
                        }

                        totalPoints += calculatePoints(award.awards);
                    }
                }
            });

            // Build a table for overall 2025 statistics
            const statsTable = generateTable(
                ['Metric', 'Value'],
                [
                    ['Achievements Earned', totalAchievements],
                    ['Games Participated', participationCount],
                    ['Games Beaten', beatenCount],
                    ['Games Mastered', masteredCount]
                ]
            );
            embed.addFields({
                name: '📊 2025 Statistics',
                value: '```' + statsTable + '```'
            });

            // Build tables for each point breakdown category
            const participationTable = generateTable(
                ['Participations (1 pt each)'],
                participationGames.length ? participationGames.map(game => [game]) : [['None']]
            );
            embed.addFields({
                name: '🏆 Participations',
                value: '```' + participationTable + '```'
            });

            if (beatenCount > 0) {
                const beatenTable = generateTable(
                    ['Games Beaten (3 pts each)'],
                    beatenGames.map(game => [game])
                );
                embed.addFields({
                    name: '⭐ Games Beaten',
                    value: '```' + beatenTable + '```'
                });
            }

            if (masteredCount > 0) {
                const masteredTable = generateTable(
                    ['Games Mastered (3 pts each)'],
                    masteredGames.map(game => [game])
                );
                embed.addFields({
                    name: '✨ Games Mastered',
                    value: '```' + masteredTable + '```'
                });
            }

            // Add total points earned
            embed.addFields({
                name: '💎 Total Points',
                value: '```' + totalPoints + ' points earned in 2025' + '```'
            });

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error showing profile:', error);
            await message.reply('Error getting profile data.');
        }
    }
};
