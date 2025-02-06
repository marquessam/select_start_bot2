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

function sortGames(a, b) {
    if (a.month !== b.month) return a.month - b.month;
    if (a.type !== b.type) return a.type === 'MONTHLY' ? -1 : 1;
    return 0;
}

module.exports = {
    name: 'profile',
    async execute(message, args) {
        try {
            // Get and normalize username
            let requestedUsername = args[0] || "royek";
            requestedUsername = requestedUsername.toLowerCase();

            // Find the user with case-insensitive search
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${requestedUsername}$`, 'i') }
            });

            if (!user) {
                return message.reply(`User ${requestedUsername} not found.`);
            }

            // Use the exact username from the database
            const raUsername = user.raUsername;

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`User Profile: ${raUsername.toUpperCase()}`)
                .setThumbnail(`https://retroachievements.org/UserPic/${raUsername}.png`);

            const games = await Game.find({ year: 2025 }).sort({ month: 1 });
            const awards = await Award.find({ 
                raUsername: { $regex: new RegExp(`^${requestedUsername}$`, 'i') }, 
                year: 2025 
            });

            // Current Challenge Section
            const currentMonth = new Date().getMonth() + 1;
            const currentGame = games.find(g => g.month === currentMonth && g.type === 'MONTHLY');
            const currentAward = currentGame ? awards.find(a => a.gameId === currentGame.gameId) : null;

            if (currentGame && currentAward) {
                embed.addFields({
                    name: '🎮 Current Challenge Progress',
                    value: '```\n' +
                           `${currentGame.title}\n` +
                           `Progress: ${currentAward.achievementCount}/${currentAward.totalAchievements} (${currentAward.userCompletion})\n` +
                           '```'
                });
            }

            // Stats Section
            let totalAchievements = 0;
            let participationCount = 0;
            let beatenCount = 0;
            let masteredCount = 0;

            awards.forEach(award => {
                totalAchievements += award.achievementCount;
                if (award.awards.participation) participationCount++;
                if (award.awards.beaten) beatenCount++;
                if (award.awards.mastered) masteredCount++;
            });

            embed.addFields({
                name: '📊 2025 Statistics',
                value: '```\n' +
                      `Achievements Earned: ${totalAchievements}\n` +
                      `Games Participated: ${participationCount}\n` +
                      `Games Beaten: ${beatenCount}\n` +
                      `Games Mastered: ${masteredCount}\n` +
                      '```'
            });

            // Get sorted list of games
            const sortedGames = games.slice().sort(sortGames);

            // Participations Section
            let participationsText = 'Worth 1 point each:\n';
            sortedGames.forEach(game => {
                const award = awards.find(a => a.gameId === game.gameId);
                if (award?.awards.participation) {
                    participationsText += `${game.title}\n`;
                }
            });

            // Beaten Games Section
            let beatenText = 'Worth 3 points each:\n';
            sortedGames.forEach(game => {
                const award = awards.find(a => a.gameId === game.gameId);
                if (award?.awards.beaten) {
                    beatenText += `${game.title}\n`;
                }
            });

            // Mastered Games Section
            let masteredText = 'Worth 3 points each:\n';
            sortedGames.forEach(game => {
                const award = awards.find(a => a.gameId === game.gameId);
                if (award?.awards.mastered) {
                    masteredText += `${game.title}\n`;
                }
            });

            if (participationCount > 0) {
                embed.addFields({
                    name: '🏆 Point Breakdown',
                    value: '**Participations**\n```\n' + participationsText + '```'
                });
            }

            if (beatenCount > 0) {
                embed.addFields({
                    name: 'Games Beaten',
                    value: '```\n' + beatenText + '```'
                });
            }

            if (masteredCount > 0) {
                embed.addFields({
                    name: 'Games Mastered',
                    value: '```\n' + masteredText + '```'
                });
            }

            // Total Points Section
            let totalPoints = awards.reduce((sum, award) => sum + calculatePoints(award.awards), 0);

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
