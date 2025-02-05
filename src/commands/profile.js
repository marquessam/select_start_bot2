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
                    monthText += `**${monthlyGame.title}** (Monthly)\n`;
                    monthText += `▫️ Progress: ${monthlyAward.achievementCount}/${monthlyAward.numAchievements} (${monthlyAward.userCompletion})\n`;
                    
                    let awardText = [];
                    if (monthlyAward.awards.participation) awardText.push("🏁P");
                    if (monthlyAward.awards.beaten) awardText.push("⭐B");
                    if (monthlyAward.awards.mastered) awardText.push("✨M");
                    
                    const points = calculatePoints(monthlyAward.awards);
                    monthText += `▫️ ${awardText.join(" + ")} = ${points}pts\n\n`;
                }

                // Shadow Game
                const shadowGame = games.find(g => g.month === month && g.type === 'SHADOW');
                const shadowAward = awards.find(a => a.gameId === shadowGame?.gameId);

                if (shadowGame && shadowAward) {
                    monthText += `**${shadowGame.title}** (Shadow)\n`;
                    monthText += `▫️ Progress: ${shadowAward.achievementCount}/${shadowAward.numAchievements} (${shadowAward.userCompletion})\n`;
                    
                    let awardText = [];
                    if (shadowAward.awards.participation) awardText.push("🏁P");
                    if (shadowAward.awards.beaten) awardText.push("⭐B");
                    if (shadowAward.awards.mastered) awardText.push("✨M");
                    
                    const points = calculatePoints(shadowAward.awards);
                    monthText += `▫️ ${awardText.join(" + ")} = ${points}pts`;
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