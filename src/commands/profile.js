// File: src/commands/profile.js
const Game = require('../models/Game');
const Award = require('../models/Award');

module.exports = {
    name: 'profile',
    async execute(message, args) {
        try {
            const raUsername = "royek"; // For now, just show royek's profile
            
            // Get current date for current challenge info
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();

            // Get all awards for the user for 2024
            const awards = await Award.find({
                raUsername: raUsername,
                year: currentYear
            }).sort({ month: 1 });

            // Get all games to match with awards
            const games = await Game.find({
                year: currentYear
            });

            let reply = `**Profile for ${raUsername}**\n\n`;
            
            // Current Challenge Section
            const currentMonthly = games.find(g => g.month === currentMonth && g.type === 'MONTHLY');
            if (currentMonthly) {
                const currentAward = awards.find(a => a.gameId === currentMonthly.gameId);
                const progress = currentAward ? currentAward.achievementCount : 0;
                const percentage = ((progress / currentMonthly.numAchievements) * 100).toFixed(1);
                
                reply += `**Current Challenge:** ${currentMonthly.title}\n`;
                reply += `Progress: ${progress}/${currentMonthly.numAchievements} (${percentage}%)\n\n`;
            }

            // Awards Breakdown
            reply += "**2024 Awards Earned:**\n```\n";
            const months = ["January", "February"];
            
            for (const month of months) {
                const monthNum = months.indexOf(month) + 1;
                const monthlyGame = games.find(g => g.month === monthNum && g.type === 'MONTHLY');
                const shadowGame = games.find(g => g.month === monthNum && g.type === 'SHADOW');
                
                reply += `${month}:\n`;
                
                if (monthlyGame) {
                    const monthlyAward = awards.find(a => a.gameId === monthlyGame.gameId);
                    reply += `  ${monthlyGame.title} (Monthly)\n`;
                    if (monthlyAward) {
                        if (monthlyAward.awards.mastered) reply += "    ★ MASTERED\n";
                        else if (monthlyAward.awards.beaten) reply += "    ✓ BEATEN\n";
                        else if (monthlyAward.awards.participation) reply += "    • PARTICIPATION\n";
                    } else {
                        reply += "    No awards yet\n";
                    }
                }
                
                if (shadowGame) {
                    const shadowAward = awards.find(a => a.gameId === shadowGame.gameId);
                    reply += `  ${shadowGame.title} (Shadow)\n`;
                    if (shadowAward) {
                        if (shadowAward.awards.mastered) reply += "    ★ MASTERED\n";
                        else if (shadowAward.awards.beaten) reply += "    ✓ BEATEN\n";
                        else if (shadowAward.awards.participation) reply += "    • PARTICIPATION\n";
                    } else {
                        reply += "    No awards yet\n";
                    }
                }
                
                reply += "\n";
            }
            reply += "```";

            // Send the message
            message.channel.send(reply);

        } catch (error) {
            console.error('Error showing profile:', error);
            message.reply('Error getting profile data.');
        }
    }
};
