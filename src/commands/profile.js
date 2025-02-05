// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');

function formatProgress(count, total) {
    const percentage = ((count / total) * 100).toFixed(1);
    return `${count}/${total} (${percentage}%)`;
}

function formatAwards(award) {
    const parts = [];
    if (award.awards.participation) parts.push('🏁P');
    if (award.awards.beaten) parts.push('⭐B');
    if (award.awards.mastered) parts.push('✨M');
    
    const points = calculatePoints(award.awards);
    return `${parts.join(' + ')} = ${points}pts`;
}

function calculatePoints(awards) {
    let points = 0;
    if (awards.participation) points += 1;  // Participation
    if (awards.beaten) points += 3;         // Beaten
    if (awards.mastered) points += 3;       // Mastery
    return points;
}

module.exports = {
    name: 'profile',
    async execute(message, args) {
        try {
            const raUsername = args[0] || "royek";
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Profile for ${raUsername}`)
                .setThumbnail(`https://retroachievements.org/UserPic/${raUsername}.png`);

            const games = await Game.find({ year: 2025 }).sort({ month: 1 });
            const awards = await Award.find({ raUsername, year: 2025 });

            // Process each month
            for (let month = 1; month <= 2; month++) {
                const monthName = month === 1 ? 'January' : 'February';
                let monthText = '';

                // Monthly Game
                const monthlyGame = games.find(g => g.month === month && g.type === 'MONTHLY');
                const monthlyAward = awards.find(a => a.gameId === monthlyGame?.gameId);

                if (monthlyGame && monthlyAward) {
                    monthText += `▫️ **${monthlyGame.title}** (Monthly)\n`;
                    monthText += `▫️ ${formatProgress(monthlyAward.achievementCount, monthlyGame.numAchievements)}\n`;
                    monthText += `▫️ ${formatAwards(monthlyAward)}\n\n`;
                }

                // Shadow Game
                const shadowGame = games.find(g => g.month === month && g.type === 'SHADOW');
                const shadowAward = awards.find(a => a.gameId === shadowGame?.gameId);

                if (shadowGame && shadowAward) {
                    monthText += `▫️ **${shadowGame.title}** (Shadow)\n`;
                    monthText += `▫️ ${formatProgress(shadowAward.achievementCount, shadowGame.numAchievements)}\n`;
                    monthText += `▫️ ${formatAwards(shadowAward)}`;
                }

                if (monthText) {
                    embed.addFields({
                        name: monthName,
                        value: monthText,
                        inline: false
                    });
                }
            }

            // Calculate total points
            let totalPoints = 0;
            awards.forEach(award => {
                totalPoints += calculatePoints(award.awards);
            });

            embed.addFields({
                name: 'Total Points',
                value: `**${totalPoints}** points earned in 2025`,
                inline: false
            });

            message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing profile:', error);
            message.reply('Error getting profile data.');
        }
    }
};