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

module.exports = {
    name: 'profile',
    description: 'Shows user profile information',
    async execute(message, args) {
        try {
            // Get username for search (defaults to "Royek" if none provided)
            const requestedUsername = args[0] || "Royek";

            // Find the user using a case-insensitive search
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${requestedUsername}$`, 'i') }
            });

            if (!user) {
                return message.reply(`User **${requestedUsername}** not found.`);
            }

            // Use the canonical username from the database
            const raUsername = user.raUsername;
            const raProfileImageUrl = `https://media.retroachievements.org/UserPic/${raUsername}.png`;

            // Create the embed
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
                // Display current challenge progress using simple text formatting
                const currentChallengeText = 
                    `**Title:** ${currentGame.title}\n` +
                    `**Progress:** ${currentAward.achievementCount}/${currentAward.totalAchievements} (${currentAward.userCompletion})`;
                embed.addFields({
                    name: '🎮 Current Challenge Progress',
                    value: currentChallengeText
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

            // Display overall statistics as plain text
            const statsText =
                `**Achievements Earned:** ${totalAchievements}\n` +
                `**Games Participated:** ${participationCount}\n` +
                `**Games Beaten:** ${beatenCount}\n` +
                `**Games Mastered:** ${masteredCount}`;
            embed.addFields({
                name: '📊 2025 Statistics',
                value: statsText
            });

            // Helper function for bullet list formatting
            const formatList = (list) => list.length ? list.map(item => `• ${item}`).join('\n') : 'None';

            // Show breakdown of point categories using bullet lists
            embed.addFields({
                name: '🏆 Participations (1 pt each)',
                value: formatList(participationGames)
            });
            if (beatenCount > 0) {
                embed.addFields({
                    name: '⭐ Games Beaten (3 pts each)',
                    value: formatList(beatenGames)
                });
            }
            if (masteredCount > 0) {
                embed.addFields({
                    name: '✨ Games Mastered (3 pts each)',
                    value: formatList(masteredGames)
                });
            }

            // Display total points earned
            embed.addFields({
                name: '💎 Total Points',
                value: `**${totalPoints} points earned in 2025**`
            });

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error showing profile:', error);
            await message.reply('Error getting profile data.');
        }
    }
};
