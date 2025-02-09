// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const { AwardFunctions, AwardType } = require('../enums/AwardType');

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
 * It finds the current monthly challenge and combines awards by normalizing usernames.
 * Only users with progress greater than 0% are included.
 * @returns {Promise<{gameTitle: string, leaderboardData: Array}>}
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
	if (!currentGame)
		return { gameTitle: 'No Monthly Challenge', leaderboardData: [] };

	// Find all awards for this monthly challenge.
	const awards = await Award.find({
		gameId: currentGame.gameId,
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
		const emoji = AwardFunctions.getEmoji(award.award);
		if (!leaderboardMap.has(norm)) {
			leaderboardMap.set(norm, { username: award.raUsername, percentage, progress, emoji });
		} else {
			// If duplicate exists, update only if this entry has a higher percentage.
			const current = leaderboardMap.get(norm);
			if (percentage > current.percentage) {
				leaderboardMap.set(norm, { username: award.raUsername, percentage, progress, emoji });
			}
		}
	}

	const leaderboardData = Array.from(leaderboardMap.values());
	// Sort descending by percentage.
	leaderboardData.sort((a, b) => b.percentage - a.percentage);
	return { gameTitle: currentGame.title, leaderboardData };
}

/**
 * Retrieves the yearly leaderboard data.
 * It aggregates points from challenge awards and manual awards by normalizing usernames.
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
				let monthlyDisplay = '';
				if (monthlyData.leaderboardData.length > 0) {
					monthlyData.leaderboardData.forEach((entry, index) => {
						monthlyDisplay += `${index + 1}. **${entry.username}** – ${entry.percentage}% (${entry.progress}) ${entry.emoji}\n`;
					});
				} else {
					monthlyDisplay = 'No monthly challenge data available.';
				}

				// Use 1013 as the maximum length (to allow for code block markers, totaling ~1024).
				const monthlyChunks = splitIntoChunks(monthlyDisplay, 1013);

				// Send one embed per chunk.
				for (let i = 0; i < monthlyChunks.length; i++) {
					const embed = new EmbedBuilder()
						.setColor('#0099ff')
						.setTitle(i === 0 ? 'Monthly Leaderboard' : `Monthly Leaderboard (Part ${i + 1})`)
						.setTimestamp();
					// Add the challenge title only on the first embed.
					if (i === 0) {
						embed.setDescription(`**Challenge:** ${monthlyData.gameTitle}`);
					}
					embed.addFields({
						name: 'Progress',
						value: '```ml\n' + monthlyChunks[i] + '\n```'
					});
					await message.channel.send({ embeds: [embed] });
				}
			}
			// --- Yearly Leaderboard ---
			else if (subcommand === 'year' || subcommand === 'y') {
				const yearlyData = await getYearlyLeaderboard();
				let yearlyDisplay = '';
				if (yearlyData.length > 0) {
					yearlyData.forEach((entry, index) => {
						yearlyDisplay += `${index + 1}. **${entry.username}** – ${entry.points} point${entry.points !== 1 ? 's' : ''}\n`;
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
