// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');

/**
 * Returns the appropriate award icon based on the award object.
 * (If you later change your schema to use an enum, you can adjust this logic.)
 */
function getAwardIcon(awardObj) {
    if (awardObj.mastered) return '✨';
    else if (awardObj.beaten) return '⭐';
    else if (awardObj.participation) return '🏁';
    return '';
}

/**
 * Generates a table with Unicode box-drawing characters.
 * @param {string[]} headers - An array of header strings.
 * @param {Array<Array<string|number>>} rows - An array of rows, each row is an array of cell values.
 * @returns {string} - The generated table as a string.
 */
function generateTable(headers, rows) {
    // Determine maximum width for each column
    const colWidths = headers.map((header, i) => {
        return Math.max(
            header.length,
            ...rows.map(row => row[i].toString().length)
        );
    });

    // Function to build a horizontal line (top, middle, bottom)
    const horizontalLine = (left, mid, right) => {
        let line = left;
        colWidths.forEach((width, index) => {
            line += '─'.repeat(width + 2);
            line += (index < colWidths.length - 1) ? mid : right;
        });
        return line;
    };

    const topBorder = horizontalLine('┌', '┬', '┐');
    const headerSeparator = horizontalLine('├', '┼', '┤');
    const bottomBorder = horizontalLine('└', '┴', '┘');

    // Function to format a single row
    const formatRow = (row) => {
        let rowStr = '│';
        row.forEach((cell, index) => {
            const cellStr = cell.toString();
            rowStr += ' ' + cellStr.padEnd(colWidths[index]) + ' │';
        });
        return rowStr;
    };

    const headerRow = formatRow(headers);
    const rowLines = rows.map(row => formatRow(row));

    return [
        topBorder,
        headerRow,
        headerSeparator,
        ...rowLines,
        bottomBorder
    ].join('\n');
}

/**
 * Displays the monthly leaderboard with a jazzed-up table format.
 */
async function displayMonthlyLeaderboard() {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const monthlyGame = await Game.findOne({
        month: currentMonth,
        year: currentYear,
        type: 'MONTHLY'
    });

    if (!monthlyGame) {
        throw new Error('No monthly game found for current month.');
    }

    // Get all awards for this game with progress > 0
    const awards = await Award.find({
        gameId: monthlyGame.gameId,
        month: currentMonth,
        year: currentYear,
        achievementCount: { $gt: 0 }
    });

    // Group by canonical username
    const uniqueAwards = {};
    for (const award of awards) {
        // Use a case-insensitive search to find the canonical username.
        const user = await User.findOne({
            raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
        });

        if (user) {
            const canonicalUsername = user.raUsername;
            // Save the award with the highest achievementCount for the user.
            if (!uniqueAwards[canonicalUsername] || 
                award.achievementCount > uniqueAwards[canonicalUsername].achievementCount) {
                award.raUsername = canonicalUsername;
                uniqueAwards[canonicalUsername] = award;
            }
        }
    }

    // Sort by achievement count (descending)
    const sortedAwards = Object.values(uniqueAwards)
        .sort((a, b) => b.achievementCount - a.achievementCount);

    // Handle ties and assign ranks
    let currentRank = 1;
    let currentScore = -1;
    let increment = 0;

    sortedAwards.forEach(award => {
        if (award.achievementCount !== currentScore) {
            currentRank += increment;
            increment = 1;
            currentScore = award.achievementCount;
            award.rank = currentRank;
        } else {
            award.rank = currentRank;
            increment++;
        }
    });

    // Split into top ten and the rest
    const topTen = sortedAwards.slice(0, 10);
    const others = sortedAwards.slice(10);

    // Build the table for the top ten
    const monthlyHeaders = ['Rank', 'Player', 'Progress', 'Award'];
    const topTenRows = topTen.map(award => {
        const progress = `${award.achievementCount}/${award.totalAchievements}`;
        const icon = getAwardIcon(award.awards);
        return [award.rank, award.raUsername, progress, icon];
    });
    const topTenTable = generateTable(monthlyHeaders, topTenRows);

    // Build a separate table for "Also Participating" if there are extra players
    let othersTable = '';
    if (others.length > 0) {
        const otherHeaders = ['Player', 'Progress'];
        const othersRows = others.map(award => {
            const progress = `${award.achievementCount}/${award.totalAchievements}`;
            return [award.raUsername, progress];
        });
        othersTable = generateTable(otherHeaders, othersRows);
    }

    // Create the embed with enhanced formatting
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Monthly Challenge')
        .setDescription(`**${monthlyGame.title}**`)
        .setThumbnail('https://media.retroachievements.org/Images/022504.png')
        .addFields({ 
            name: 'Top Rankings', 
            value: '```' + topTenTable + '```' 
        });

    if (othersTable) {
        embed.addFields({ 
            name: 'Also Participating', 
            value: '```' + othersTable + '```' 
        });
    }

    return embed;
}

/**
 * Displays the yearly leaderboard with a jazzed-up table format.
 */
async function displayYearlyLeaderboard() {
    const currentYear = new Date().getFullYear();
    const awards = await Award.find({ year: currentYear });

    const userPoints = {};

    // Group by canonical username to handle case sensitivity
    for (const award of awards) {
        const user = await User.findOne({
            raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
        });

        if (user) {
            const canonicalUsername = user.raUsername;
            if (!userPoints[canonicalUsername]) {
                userPoints[canonicalUsername] = {
                    username: canonicalUsername,
                    totalPoints: 0,
                    participations: 0,
                    beaten: 0,
                    mastered: 0,
                    processedGames: new Set()
                };
            }

            const gameKey = `${award.gameId}-${award.month}`;
            if (!userPoints[canonicalUsername].processedGames.has(gameKey)) {
                // Calculate points based on booleans
                let points = 0;
                if (award.awards.participation) points += 1;
                if (award.awards.beaten) points += 3;
                if (award.awards.mastered) points += 3;
                
                if (points > 0) {
                    userPoints[canonicalUsername].totalPoints += points;
                    if (award.awards.participation) userPoints[canonicalUsername].participations++;
                    if (award.awards.beaten) userPoints[canonicalUsername].beaten++;
                    if (award.awards.mastered) userPoints[canonicalUsername].mastered++;
                    userPoints[canonicalUsername].processedGames.add(gameKey);
                }
            }
        }
    }

    // Convert to array and sort by total points (descending)
    const leaderboard = Object.values(userPoints)
        .filter(user => user.totalPoints > 0)
        .map(({ processedGames, ...user }) => user)
        .sort((a, b) => b.totalPoints - a.totalPoints);

    // Handle ties and assign ranks
    let currentRank = 1;
    let currentPoints = -1;
    let increment = 0;

    leaderboard.forEach(user => {
        if (user.totalPoints !== currentPoints) {
            currentRank += increment;
            increment = 1;
            currentPoints = user.totalPoints;
            user.rank = currentRank;
        } else {
            user.rank = currentRank;
            increment++;
        }
    });

    // Build the table for the yearly leaderboard
    const yearlyHeaders = ['Rank', 'Player', 'Pts', 'P', 'B', 'M'];
    const leaderboardRows = leaderboard.map(user => {
        return [
            user.rank,
            user.username,
            user.totalPoints,
            user.participations,
            user.beaten,
            user.mastered
        ];
    });
    const leaderboardTable = generateTable(yearlyHeaders, leaderboardRows);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${currentYear} Yearly Rankings`)
        .addFields({ name: 'Rankings', value: '```' + leaderboardTable + '```' });

    return embed;
}

module.exports = {
    name: 'leaderboard',
    description: 'Shows the leaderboard',
    async execute(message, args) {
        try {
            const type = args[0]?.toLowerCase() || 'month';
            let embed;

            if (type === 'month' || type === 'm') {
                embed = await displayMonthlyLeaderboard();
            } else if (type === 'year' || type === 'y') {
                embed = await displayYearlyLeaderboard();
            } else {
                return message.reply('Invalid command. Use `!leaderboard month/m` or `!leaderboard year/y`');
            }

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Leaderboard error:', error);
            await message.reply('Error getting leaderboard data.');
        }
    }
};
