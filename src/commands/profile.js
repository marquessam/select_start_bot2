// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');

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
            const raUsername = args[0] || "royek";
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`User Profile: ${raUsername.toUpperCase()}`)
                .setThumbnail(`https://retroachievements.org/UserPic/${raUsername}.png`);

            const games = await Game.find({ year: 2025 }).sort({ month: 1 });
            const awards = await Award.find({ raUsername, year: 2025 });

            // Current Challenge Section
            const currentMonth = new Date().getMonth() + 1;
            const currentGame = games.find(g => g.month === currentMonth && g.type === 'MONTHLY');
            const currentAward = currentGame ? awards.find(a => a.gameId === currentGame.gameId) : null;

            if (currentGame && currentAward) {
                embed.addFields({
                    name: '🎮 Current Challenge Progress',
                    value: `**${currentGame.title}**\nProgress: ${currentAward.achievementCount}/${currentAward.totalAchievements} (${currentAward.userCompletion})`,
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

            // Participations Section
            let participationsText = '';
            awards.filter(a => a.awards.participation).forEach(award => {
                const game = games.find(g => g.gameId === award.gameId);
                participationsText += `${game.title} - Participation: 1pt\n`;
            });

            // Beaten Games Section
            let beatenText = '';
            awards.filter(a => a.awards.beaten).forEach(award => {
                const game = games.find(g => g.gameId === award.gameId);
                beatenText += `${game.title} - Game Beaten: 3pts\n`;
            });

            // Mastered Games Section
            let masteredText = '';
            awards.filter(a => a.awards.mastered).forEach(award => {
                const game = games.find(g => g.gameId === award.gameId);
                masteredText += `${game.title} - Game Mastered: 3pts\n`;
            });

            embed.addFields({
                name: '🏆 Point Breakdown',
                value: '```\nParticipations:\n' + participationsText + '```'
            });

            if (beatenText) {
                embed.addFields({
                    name: 'Games Beaten:',
                    value: '```\n' + beatenText + '```'
                });
            }

            if (masteredText) {
                embed.addFields({
                    name: 'Games Mastered:',
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
