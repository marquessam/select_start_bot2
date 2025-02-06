// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');

function calculatePoints(awards) {
    let points = 0;
    if (awards.participation) points += 1;
    if (awards.beaten) points += 3;
    if (awards.mastered) points += 3;
    return points;
}

module.exports = {
    name: 'profile',
    async execute(message, args) {
        try {
            // Get username for search
            let requestedUsername = args[0] || "Royek";

            // Find the user with case-insensitive search
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
                embed.addFields({
                    name: '🎮 Current Challenge Progress',
                    value: '```\n' +
                           `${currentGame.title}\n` +
                           `Progress: ${currentAward.achievementCount}/${currentAward.totalAchievements} (${currentAward.userCompletion})\n` +
                           '```'
                });
            }

            // Get all user's awards for the year
            const awards = await Award.find({
                raUsername: raUsername,
                year: currentYear
            });

            // Calculate statistics
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

            // Add Statistics Section
            embed.addFields({
                name: '📊 2025 Statistics',
                value: '```\n' +
                      `Achievements Earned: ${totalAchievements}\n` +
                      `Games Participated: ${participationCount}\n` +
                      `Games Beaten: ${beatenCount}\n` +
                      `Games Mastered: ${masteredCount}\n` +
                      '```'
            });

            // Add Point Breakdown
            embed.addFields({
                name: '🏆 Point Breakdown',
                value: '**Participations**\n```\nWorth 1 point each:\n' + 
                      `${participationGames.join('\n')}\n` +
                      '```'
            });

            if (beatenCount > 0) {
                embed.addFields({
                    name: 'Games Beaten',
                    value: '```\nWorth 3 points each:\n' + 
                          `${beatenGames.join('\n')}\n` +
                          '```'
                });
            }

            if (masteredCount > 0) {
                embed.addFields({
                    name: 'Games Mastered',
                    value: '```\nWorth 3 points each:\n' + 
                          `${masteredGames.join('\n')}\n` +
                          '```'
                });
            }

            // Add Total Points
            embed.addFields({
                name: '💎 Total Points',
                value: '```\n' +
                       `${totalPoints} points earned in 2025\n` +
                       '```'
            });

            message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing profile:', error);
            message.reply('Error getting profile data.');
        }
    }
};
