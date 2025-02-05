// File: src/commands/profile.js
const Game = require('../models/Game');
const Award = require('../models/Award');

module.exports = {
    name: 'profile',
    async execute(message, args) {
        try {
            // Get requested username or default to royek
            const raUsername = args[0] || "royek";
            const currentYear = new Date().getFullYear();

            let reply = `**Profile for ${raUsername}**\n\n`;

            // Get all games and awards
            const games = await Game.find({ 
                year: currentYear 
            }).sort({ month: 1 });
            
            const awards = await Award.find({ 
                raUsername,
                year: currentYear 
            });

            // Group by month
            for (let month = 1; month <= 2; month++) {
                const monthName = month === 1 ? 'January' : 'February';
                reply += `**${monthName}**\n`;

                // Process Monthly game
                const monthlyGame = games.find(g => g.month === month && g.type === 'MONTHLY');
                const monthlyAward = awards.find(a => a.gameId === monthlyGame?.gameId);

                if (monthlyGame && monthlyAward) {
                    const percentage = ((monthlyAward.achievementCount / monthlyGame.numAchievements) * 100).toFixed(1);
                    reply += `${monthlyGame.title} (Monthly)\n`;
                    reply += `Progress: ${monthlyAward.achievementCount}/${monthlyGame.numAchievements} (${percentage}%)\n`;
                    reply += `Awards: `;
                    
                    if (monthlyAward.awards.mastered) reply += "✨ MASTERED";
                    else if (monthlyAward.awards.beaten) reply += "⭐ BEATEN";
                    else if (monthlyAward.awards.participation) reply += "🏁 PARTICIPATION";
                    else reply += "None";
                    reply += '\n';
                }

                // Process Shadow game
                const shadowGame = games.find(g => g.month === month && g.type === 'SHADOW');
                const shadowAward = awards.find(a => a.gameId === shadowGame?.gameId);

                if (shadowGame && shadowAward) {
                    const percentage = ((shadowAward.achievementCount / shadowGame.numAchievements) * 100).toFixed(1);
                    reply += `${shadowGame.title} (Shadow)\n`;
                    reply += `Progress: ${shadowAward.achievementCount}/${shadowGame.numAchievements} (${percentage}%)\n`;
                    reply += `Awards: `;
                    
                    if (shadowAward.awards.mastered) reply += "✨ MASTERED";
                    else if (shadowAward.awards.beaten) reply += "⭐ BEATEN";
                    else if (shadowAward.awards.participation) reply += "🏁 PARTICIPATION";
                    else reply += "None";
                    reply += '\n';
                }

                reply += '\n';
            }

            // Calculate total points
            let totalPoints = 0;
            awards.forEach(award => {
                if (award.awards.mastered) totalPoints += 5;
                else if (award.awards.beaten) totalPoints += 3;
                else if (award.awards.participation) totalPoints += 1;
            });

            reply += `**Total 2024 Points: ${totalPoints}**`;

            message.channel.send(reply);

        } catch (error) {
            console.error('Error showing profile:', error);
            message.reply('Error getting profile data.');
        }
    }
};
