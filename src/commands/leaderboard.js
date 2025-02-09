// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const { AwardFunctions, AwardType } = require('../enums/AwardType');
const RetroAchievementsAPI = require('../services/retroAchievements');

// Helper to get time remaining until the end of the month
function getTimeRemaining() {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const diff = endDate - now;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${days}d ${hours}h ${minutes}m`;
}

/**
 * Splits a text string into chunks that are each no longer than maxLength.
 * Splitting is done on newline boundaries.
 * @param {string} text - The text to split.
 * @param {number} maxLength - The maximum length per chunk.
 * @returns {string[]} - An array of text chunks.
 */
function splitIntoChunks(text, maxLength = 1024) {
    const lines = text.split('\n');
    const chunks = [];
    let currentChunk = '';
    for (const line of lines) {
        // +1 accounts for the newline character.
        if (currentChunk.length + line.length + 1 > maxLength) {
            chunks.push(currentChunk);
            currentChunk = line;
        } else {
            currentChunk = currentChunk ? currentChunk + '\n' + line : line;
        }
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    return chunks;
}

/**
 * Retrieves the monthly leaderboard data.
 * Finds the current monthly challenge and combines awards by normalized usernames.
 * Only users with progress greater than 0% are included.
 * @returns {Promise<{game: Object, gameTitle: string, leaderboardData: Array}>}
 */
async function getMonthlyLeaderboard() {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Find the active monthly challenge for the current month and year.
    const game = await Game.findOne({
        month: currentMonth,
        year: currentYear,
        type: 'MONTHLY'
    });
    if (!game) return { game: null, gameTitle: 'No Monthly Challenge', leaderboardData: [] };

    // Find all awards for this monthly challenge.
    const awards = await Award.find({
        gameId: game.gameId,
        month: currentMonth,
        year: currentYear
    });

    // Use a Map keyed by normalized (lowercase) username to combine duplicates.
    const leaderboardMap = new Map();
    for (const award of awards) {
        // Skip if the achievement count is missing or zero.
        if (!award.achievementCount || award.achievementCount <= 0) continue;
        const percentage = Math.floor((award.achievementCount / award.totalAchievements) * 100);
        if (percentage === 0) continue; // Skip 0% progress.
        const norm = award.raUsername.toLowerCase();
        const progress = `${award.achievementCount}/${award.totalAchievements}`;
        // (award.emoji is no longer used)
        if (!leaderboardMap.has(norm)) {
            leaderboardMap.set(norm, { username: award.raUsername, percentage, progress });
        } else {
            // Update if this entry has a higher percentage.
            const current = leaderboardMap.get(norm);
            if (percentage > current.percentage) {
                leaderboardMap.set(norm, { username: award.raUsername, percentage, progress });
            }
        }
    }

    const leaderboardData = Array.from(leaderboardMap.values());
    // Sort descending by percentage.
    leaderboardData.sort((a, b) => b.percentage - a.percentage);
    return { game, gameTitle: game.title, leaderboardData };
}

/**
 * Retrieves the yearly leaderboard data.
 * Aggregates points from challenge awards and manual awards by normalized usernames.
 * Only users with more than 0 points are included.
 * @returns {Promise<Array>}
 */
async function getYearlyLeaderboard() {
    const currentYear = new Date().getFullYear();

    // Get challenge awards (excluding manual awards).
    const awards = await Award.find({
        year: currentYear,
        gameId: { $ne: 'manual' }
    });

    // Get manual awards.
    const manualAwards = await Award.find({
        year: currentYear,
        gameId: 'manual'
    });

    // Use a Map keyed by normalized username.
    const leaderboardMap = new Map();
    for (const award of awards) {
        const norm = award.raUsername.toLowerCase();
        const points = AwardFunctions.getPoints(award.award);
        if (points <= 0) continue;
        if (!leaderboardMap.has(norm)) {
            leaderboardMap.set(norm, { username: award.raUsername, points });
        } else {
            const current = leaderboardMap.get(norm);
            leaderboardMap.set(norm, { username: current.username, points: current.points + points });
        }
    }
    for (const award of manualAwards) {
        const norm = award.raUsername.toLowerCase();
        const points = award.totalAchievements || 0;
        if (points <= 0) continue;
        if (!leaderboardMap.has(norm)) {
            leaderboardMap.set(norm, { username: award.raUsername, points });
        } else {
            const current = leaderboardMap.get(norm);
            leaderboardMap.set(norm, { username: current.username, points: current.points + points });
        }
    }
    const leaderboardArray = Array.from(leaderboardMap.values()).filter(entry => entry.points > 0);
    leaderboardArray.sort((a, b) => b.points - a.points);
    return leaderboardArray;
}

module.exports = {
    name: 'leaderboard',
    description:
        'Displays the leaderboard menu, monthly leaderboard, or yearly leaderboard based on subcommands',
    async execute(message, args) {
        try {
            // If no subcommand is provided, show the menu.
            if (!args[0]) {
                const menuEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Leaderboard Menu')
                    .setDescription(
                        'Use `!leaderboard month` to view the monthly leaderboard, or `!leaderboard year` to view the yearly leaderboard.'
                    )
                    .setTimestamp();
                return message.channel.send({ embeds: [menuEmbed] });
            }

            const subcommand = args[0].toLowerCase();

            // --- Monthly Leaderboard ---
            if (subcommand === 'month' || subcommand === 'm') {
                const monthlyData = await getMonthlyLeaderboard();

                // Create an instance of the RA API to fetch game info for the monthly challenge.
                let headerDetails = '';
                let gameInfo = null;
                const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
                if (monthlyData.game) {
                    gameInfo = await raAPI.getGameInfo(monthlyData.game.gameId);
                    // Bold the game name and time remaining.
                    headerDetails = `**${gameInfo.GameTitle}**\n\nGame Information\n` +
                        `Console: ${gameInfo.Console}\n` +
                        `Genre: ${gameInfo.Genre}\n` +
                        `Developer: ${gameInfo.Developer || 'N/A'}\n` +
                        `Publisher: ${gameInfo.Publisher}\n` +
                        `Release Date: ${gameInfo.Released}\n` +
                        `Total Achievements: ${monthlyData.game.numAchievements || 'N/A'}\n\n` +
                        `**Time Remaining:** ${getTimeRemaining()}`;
                }

                let monthlyDisplay = '';
                if (monthlyData.leaderboardData.length > 0) {
                    const entries = monthlyData.leaderboardData;
                    const maxNameLength = Math.max(...entries.map(e => e.username.toLowerCase().length));
                    let rank = 0;
                    let lastPercentage = null;
                    entries.forEach((entry, index) => {
                        if (lastPercentage === null || entry.percentage !== lastPercentage) {
                            rank = index + 1;
                        }
                        const name = entry.username.toLowerCase().padEnd(maxNameLength, ' ');
                        monthlyDisplay += `${rank}. ${name} – ${entry.percentage}% (${entry.progress})\n`;
                        lastPercentage = entry.percentage;
                    });
                } else {
                    monthlyDisplay = 'No monthly challenge data available.';
                }

                // Split leaderboard text into chunks.
                const monthlyChunks = splitIntoChunks(monthlyDisplay, 1013);

                // Send one embed per chunk. The first embed includes header details and the game thumbnail.
                for (let i = 0; i < monthlyChunks.length; i++) {
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(i === 0 ? 'Monthly Leaderboard' : `Monthly Leaderboard (Part ${i + 1})`)
                        .setTimestamp();
                    if (i === 0) {
                        embed.setDescription(headerDetails);
                        if (gameInfo && gameInfo.ImageIcon) {
                            embed.setThumbnail(`https://retroachievements.org${gameInfo.ImageIcon}`);
                        }
                        embed.addFields({
                            name: 'Progress',
                            value: '```ml\n' + monthlyChunks[i] + '\n```'
                        });
                    } else {
                        embed.addFields({
                            name: 'Progress',
                            value: '```ml\n' + monthlyChunks[i] + '\n```'
                        });
                    }
                    await message.channel.send({ embeds: [embed] });
                }
            }
            // --- Yearly Leaderboard ---
            else if (subcommand === 'year' || subcommand === 'y') {
                const yearlyData = await getYearlyLeaderboard();
                let yearlyDisplay = '';
                if (yearlyData.length > 0) {
                    const entries = yearlyData;
                    const maxNameLength = Math.max(...entries.map(e => e.username.toLowerCase().length));
                    let rank = 0;
                    let lastPoints = null;
                    entries.forEach((entry, index) => {
                        if (lastPoints === null || entry.points !== lastPoints) {
                            rank = index + 1;
                        }
                        const name = entry.username.toLowerCase().padEnd(maxNameLength, ' ');
                        yearlyDisplay += `${rank}. ${name} – ${entry.points} point${entry.points !== 1 ? 's' : ''}\n`;
                        lastPoints = entry.points;
                    });
                } else {
                    yearlyDisplay = 'No yearly points data available.';
                }

                const yearlyChunks = splitIntoChunks(yearlyDisplay, 1013);
                for (let i = 0; i < yearlyChunks.length; i++) {
                    const embed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle(i === 0 ? 'Yearly Leaderboard' : `Yearly Leaderboard (Part ${i + 1})`)
                        .setTimestamp();
                    embed.addFields({
                        name: 'Rankings',
                        value: '```ml\n' + yearlyChunks[i] + '\n```'
                    });
                    await message.channel.send({ embeds: [embed] });
                }
            } else {
                // If subcommand is unrecognized, show the menu.
                const menuEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Leaderboard Menu')
                    .setDescription(
                        'Use `!leaderboard month` to view the monthly leaderboard, or `!leaderboard year` to view the yearly leaderboard.'
                    )
                    .setTimestamp();
                return message.channel.send({ embeds: [menuEmbed] });
            }
        } catch (error) {
            console.error('Leaderboard Command Error:', error);
            await message.reply('Error displaying leaderboard.');
        }
    }
};
