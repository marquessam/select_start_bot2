// File: src/commands/profile.js
const Game = require('../models/Game');
const Award = require('../models/Award');

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
            
            let reply = `**Profile for ${raUsername}**\n\n`;

            // Get all games and awards
            const games = await Game.find({ 
                year: 2025 
            }).sort({ month: 1 });
            
            const awards = await Award.find({ 
                raUsername,
                year: 2025 
            });

            // Group by month
            for (let month = 1; month <= 2; month++) {
                const monthName = month === 1 ? 'January' : 'February';
                reply += `**${monthName} 2025**\n`;

                // Process Monthly game
                const monthlyGame = games.find(g => g.month === month && g.type === 'MONTHLY');
                const monthlyAward = awards.find(a => a.gameId === monthlyGame?.gameId);

                if (monthlyGame && monthlyAward) {
                    const percentage = ((monthlyAward.achievementCount / monthlyGame.numAchievements) * 100).toFixed(1);
                    const points = calculatePoints(monthlyAward.awards);
                    
                    reply += `${monthlyGame.title} (Monthly)\n`;
                    reply += `Progress: ${monthlyAward.achievementCount}/${monthlyGame.numAchievements} (${percentage}%)\n`;
                    reply += `Awards: `;
                    
                    let awardText = [];
                    if (monthlyAward.awards.participation) awardText.push("🏁 P(1)");
                    if (monthlyAward.awards.beaten) awardText.push("⭐ B(3)");
                    if (monthlyAward.awards.mastered) awardText.push("✨ M(3)");
                    
                    reply += awardText.join(" + ");
                    if (awardText.length > 0) reply += ` = ${points} points`;
                    reply += '\n';
                }

                // Process Shadow game
                const shadowGame = games.find(g => g.month === month && g.type === 'SHADOW');
                const shadowAward = awards.find(a => a.gameId === shadowGame?.gameId);

                if (shadowGame && shadowAward) {
                    const percentage = ((shadowAward.achievementCount / shadowGame.numAchievements) * 100).toFixed(1);
                    const points = calculatePoints(shadowAward.awards);
                    
                    reply += `${shadowGame.title} (Shadow)\n`;
                    reply += `Progress: ${shadowAward.achievementCount}/${shadowGame.numAchievements} (${percentage}%)\n`;
                    reply += `Awards: `;
                    
                    let awardText = [];
                    if (shadowAward.awards.participation) awardText.push("🏁 P(1)");
                    if (shadowAward.awards.beaten) awardText.push("⭐ B(3)");
                    if (shadowAward.awards.mastered) awardText.push("✨ M(3)");
                    
                    reply += awardText.join(" + ");
                    if (awardText.length > 0) reply += ` = ${points} points`;
                    reply += '\n';
                }

                reply += '\n';
            }

            // Calculate total points with the new calculation
            let totalPoints = 0;
            awards.forEach(award => {
                totalPoints += calculatePoints(award.awards);
            });

            reply += `**Total 2025 Points: ${totalPoints}**`;

            message.channel.send(reply);

        } catch (error) {
            console.error('Error showing profile:', error);
            message.reply('Error getting profile data.');
        }
    }
};
