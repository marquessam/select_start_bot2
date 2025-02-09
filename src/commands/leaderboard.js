// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const { AwardFunctions, AwardType } = require('../enums/AwardType');

/**
 * Gets the monthly leaderboard data.
 * For the current monthly challenge, returns each user's progress:
 *   - Percentage (achievementCount / totalAchievements)
 *   - Progress as x/x
 *   - The emoji for the highest award achieved.
 */
async function getMonthlyLeaderboard() {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Find the active monthly challenge for the current month and year.
    const currentGame = await Game.findOne({
        month: currentMonth,
        year: currentYear,
        type: 'MONTHLY'
    });
    if (!currentGame) return { gameTitle: 'No Monthly Challenge', leaderboardData: [] };

    // Find all awards for this monthly challenge.
    const awards = await Award.find({
        gameId: currentGame.gameId,
        month: currentMonth,
        year: currentYear
    });

    // Build the leaderboard entries.
    const leaderboardData = awards.map(award => {
        // Calculate progress percentage.
        const percentage = Math.floor((award.achievementCount / award.totalAchievements) * 100);
        const progress = `${award.achievementCount}/${award.totalAchievements}`;

        // Assume award.award already reflects the highest level achieved.
        // (Mastery > Beaten > Participation)
        const emoji = AwardFunctions.getEmoji(award.award);
        return {
            username: award.raUsername,
            percentage,
            progress,
            emoji
        };
    });

    // Sort by descending percentage.
    leaderboardData.sort((a, b) => b.percentage - a.percentage);
    return {
        gameTitle: currentGame.title,
        leaderboardData
    };
}

/**
 * Aggregates yearly points for each user.
 * Points come from challenge awards (only one per game is processed) plus manual awards.
 * Only users with > 0 points are included.
 */
async function getYearlyLeaderboard() {
    const currentYear = new Date().getFullYear();

    // Get challenge awards (exclude manual awards).
    const awards = await Award.find({
        year: currentYear,
        gameId: { $ne: 'manual' }
    });

    // Get manual awards.
    const manualAwards = await Award.find({
        year: currentYear,
        gameId: 'manual'
    });

    // Build a mapping from username to total points.
    const leaderboard = {};
    // To ensure we count only one award per game per user.
    const processedGames = {};

    for (const award of awards) {
        const username = award.raUsername;
        if (!username) continue;
        // Use a composite key to identify a unique game entry.
        const gameKey = `${award.gameId}-${award.month}`;
        if (!processedGames[username]) {
            processedGames[username] = new Set();
        }
        if (processedGames[username].has(gameKey)) continue;
        processedGames[username].add(gameKey);

        const points = AwardFunctions.getPoints(award.award);
        if (!leaderboard[username]) leaderboard[username] = 0;
        leaderboard[username] += points;
    }

    // Process manual awards.
    for (const award of manualAwards) {
        const username = award.raUsername;
        if (!username) continue;
        // Use award.totalAchievements as the extra points.
        const points = award.totalAchievements || 0;
        if (!leaderboard[username]) leaderboard[username] = 0;
        leaderboard[username] += points;
    }

    // Create and sort the leaderboard array.
    const leaderboardArray = Object.keys(leaderboard)
        .map(username => ({ username, points: leaderboard[username] }))
        .filter(entry => entry.points > 0)
        .sort((a, b) => b.points - a.points);

    return leaderboardArray;
}

module.exports = {
    name: 'leaderboard',
    description: 'Displays the monthly and yearly leaderboards',
    async execute(message, args) {
        try {
            // If a subcommand is provided, show that leaderboard; otherwise show both.
            const subcommand = args[0] ? args[0].toLowerCase() : 'both';

            if (subcommand === 'monthly' || subcommand === 'both') {
                const monthlyData = await getMonthlyLeaderboard();
                let monthlyDisplay = '';

                if (monthlyData.leaderboardData.length > 0) {
                    monthlyData.leaderboardData.forEach((entry, index) => {
                        monthlyDisplay += `${index + 1}. **${entry.username}** – ${entry.percentage}% (${entry.progress}) ${entry.emoji}\n`;
                    });
                } else {
                    monthlyDisplay = 'No monthly challenge data available.';
                }

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Monthly Leaderboard')
                    .setDescription(`**Challenge:** ${monthlyData.gameTitle}`)
                    .addFields({
                        name: 'Progress',
                        value: '```ml\n' + monthlyDisplay + '\n```'
                    })
                    .setTimestamp();

                await message.channel.send({ embeds: [embed] });
            }

            if (subcommand === 'yearly' || subcommand === 'both') {
                const yearlyData = await getYearlyLeaderboard();
                let yearlyDisplay = '';

                if (yearlyData.length > 0) {
                    yearlyData.forEach((entry, index) => {
                        yearlyDisplay += `${index + 1}. **${entry.username}** – ${entry.points} point${entry.points !== 1 ? 's' : ''}\n`;
                    });
                } else {
                    yearlyDisplay = 'No yearly points data available.';
                }

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Yearly Leaderboard')
                    .addFields({
                        name: 'Rankings',
                        value: '```ml\n' + yearlyDisplay + '\n```'
                    })
                    .setTimestamp();

                await message.channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Leaderboard Command Error:', error);
            await message.reply('Error displaying leaderboard.');
        }
    }
};
