// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const RetroAchievementsAPI = require('../services/retroAchievements');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

function generateTable(headers, rows) {
    // Calculate column widths
    const colWidths = headers.map((header, i) =>
        Math.max(
            header.length,
            ...rows.map(row => String(row[i] || '').length)
        )
    );

    // Create table borders
    const createLine = (left, mid, right, horizontal) =>
        left + colWidths.map(w => horizontal.repeat(w + 2)).join(mid) + right;

    const topLine = createLine('┌', '┬', '┐', '─');
    const midLine = createLine('├', '┼', '┤', '─');
    const bottomLine = createLine('└', '┴', '┘', '─');

    // Format a row
    const formatRow = (items) =>
        '│' + items.map((item, i) =>
            ` ${String(item || '').padEnd(colWidths[i])} `
        ).join('│') + '│';

    // Build table
    const lines = [
        topLine,
        formatRow(headers),
        midLine,
        ...rows.map(row => formatRow(row)),
        bottomLine
    ];

    return lines.join('\n');
}

function wrapInCodeBlock(text) {
    const wrapped = '```\n' + text + '\n```';
    if (wrapped.length > 1024) {
        const truncated = text.slice(0, 900) + '...\n';
        return '```\n' + truncated + '```';
    }
    return wrapped;
}

async function getCurrentMonthLeaderboard(raAPI) {
    // Get current month's game
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const monthlyGame = await Game.findOne({
        month: currentMonth,
        year: currentYear,
        type: 'MONTHLY'
    });

    if (!monthlyGame) {
        throw new Error('No monthly game found for current month');
    }

    // Get all awards for this game
    const awards = await Award.find({
        gameId: monthlyGame.gameId,
        month: currentMonth,
        year: currentYear
    });

    // Get current progress for each user
    const progressList = await Promise.all(
        awards.map(async award => {
            const progress = await raAPI.getUserGameProgress(
                award.raUsername,
                monthlyGame.gameId
            );
            return {
                username: award.raUsername,
                award: award.award,
                awardName: AwardFunctions.getName(award.award),
                progress: progress.userCompletion || "0.00%",
                achievements: progress.earnedAchievements || 0,
                total: progress.totalAchievements || 0
            };
        })
    );

    // Sort by award level (highest first) then by achievement count
    progressList.sort((a, b) => {
        if (b.award !== a.award) return b.award - a.award;
        return b.achievements - a.achievements;
    });

    // Generate table rows
    let currentRank = 0;
    let previousScore = null;
    const rows = progressList.map((entry, index) => {
        if (previousScore === null || entry.award !== previousScore) {
            currentRank = index + 1;
            previousScore = entry.award;
        }
        return [
            currentRank,
            entry.username,
            entry.awardName,
            `${entry.achievements}/${entry.total}`,
            entry.progress
        ];
    });

    return {
        game: monthlyGame.title,
        rows,
        headers: ['Rank', 'Player', 'Award', 'Progress', 'Completion']
    };
}

async function getYearlyLeaderboard() {
    const currentYear = new Date().getFullYear();
    const awards = await Award.find({ year: currentYear });

    // Group awards by user and calculate points
    const userPoints = {};
    
    for (const award of awards) {
        if (!userPoints[award.raUsername]) {
            userPoints[award.raUsername] = {
                username: award.raUsername,
                totalPoints: 0,
                monthlyGames: 0,
                shadowGames: 0
            };
        }

        const points = AwardFunctions.getPoints(award.award);
        userPoints[award.raUsername].totalPoints += points;

        const game = await Game.findOne({ 
            gameId: award.gameId,
            year: currentYear
        });

        if (game) {
            if (game.type === 'MONTHLY') {
                userPoints[award.raUsername].monthlyGames++;
            } else {
                userPoints[award.raUsername].shadowGames++;
            }
        }
    }

    // Convert to array and sort
    const leaderboard = Object.values(userPoints)
        .sort((a, b) => b.totalPoints - a.totalPoints);

    // Generate table rows
    let currentRank = 0;
    let previousPoints = null;
    const rows = leaderboard.map((entry, index) => {
        if (previousPoints === null || entry.totalPoints !== previousPoints) {
            currentRank = index + 1;
            previousPoints = entry.totalPoints;
        }
        return [
            currentRank,
            entry.username,
            entry.totalPoints,
            entry.monthlyGames,
            entry.shadowGames
        ];
    });

    return {
        rows,
        headers: ['Rank', 'Player', 'Points', 'Monthly', 'Shadow']
    };
}

module.exports = {
    name: 'leaderboard',
    description: 'Shows the leaderboard',
    async execute(message, args) {
        try {
            const type = args[0]?.toLowerCase() || 'month';
            const raAPI = new RetroAchievementsAPI(
                process.env.RA_USERNAME,
                process.env.RA_API_KEY
            );

            let embed = new EmbedBuilder().setColor('#0099ff');

            if (type === 'month' || type === 'm') {
                const monthlyData = await getCurrentMonthLeaderboard(raAPI);
                const table = generateTable(monthlyData.headers, monthlyData.rows);
                
                embed
                    .setTitle(`Monthly Challenge: ${monthlyData.game}`)
                    .addFields({
                        name: 'Current Rankings',
                        value: wrapInCodeBlock(table)
                    });

            } else if (type === 'year' || type === 'y') {
                const yearlyData = await getYearlyLeaderboard();
                const table = generateTable(yearlyData.headers, yearlyData.rows);

                embed
                    .setTitle(`Yearly Rankings ${new Date().getFullYear()}`)
                    .addFields({
                        name: 'Overall Rankings',
                        value: wrapInCodeBlock(table)
                    });

            } else {
                return message.reply('Invalid command. Use `!leaderboard month/m` or `!leaderboard year/y`');
            }

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Leaderboard error:', error);
            await message.reply('Error retrieving leaderboard data.');
        }
    }
};
