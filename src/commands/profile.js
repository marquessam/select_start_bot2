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
                    const percentage = ((monthlyAward.achievementCount / monthlyGame.numAchievements) * 100).toFixed(1);
                    const points = calculatePoints(monthlyAward.awards);
                    
                    monthText += `**${monthlyGame.title}** (Monthly)\n`;
                    monthText += `▫️ ${monthlyAward.achievementCount}/${monthlyGame.numAchievements} (${percentage}%)\n`;
                    
                    let awards = [];
                    if (monthlyAward.awards.participation) awards.push("🏁P");
                    if (monthlyAward.awards.beaten) awards.push("⭐B");
                    if (monthlyAward.awards.mastered) awards.push("✨M");
                    
                    monthText += `▫️ ${awards.join(" ")} = ${points}pts\n\n`;
                }

                // Shadow Game
                const shadowGame = games.find(g => g.month === month && g.type === 'SHADOW');
                const shadowAward = awards.find(a => a.gameId === shadowGame?.gameId);

                if (shadowGame && shadowAward) {
                    const percentage = ((shadowAward.achievementCount / shadowGame.numAchievements) * 100).toFixed(1);
                    const points = calculatePoints(shadowAward.awards);
                    
                    monthText += `**${shadowGame.title}** (Shadow)\n`;
                    monthText += `▫️ ${shadowAward.achievementCount}/${shadowGame.numAchievements} (${percentage}%)\n`;
                    
                    let awards = [];
                    if (shadowAward.awards.participation) awards.push("🏁P");
                    if (shadowAward.awards.beaten) awards.push("⭐B");
                    if (shadowAward.awards.mastered) awards.push("✨M");
                    
                    monthText += `▫️ ${awards.join(" ")} = ${points}pts\n`;
                }

                embed.addFields({ 
                    name: `${monthName} 2025`, 
                    value: monthText || 'No data available',
                    inline: false 
                });
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
