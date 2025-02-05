// File: src/commands/leaderboard.js
const Game = require('../models/Game');
const Award = require('../models/Award');

module.exports = {
    name: 'leaderboard',
    async execute(message, args) {
        try {
            // Get current month's game
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const monthlyGame = await Game.findOne({
                month: currentMonth,
                year: currentYear,
                type: 'MONTHLY'
            });

            if (!monthlyGame) {
                return message.reply('No monthly game found for current month.');
            }

            // Get all awards for this game
            const awards = await Award.find({
                gameId: monthlyGame.gameId,
                month: currentMonth,
                year: currentYear
            });

            // Build simple leaderboard message
            let reply = `Current Monthly Game: ${monthlyGame.title}\n\n`;
            reply += "```\n";
            reply += "Player          Progress  Awards\n";
            reply += "--------------------------------\n";

            awards.forEach(award => {
                const username = award.raUsername.padEnd(15);
                const progress = `${award.achievementCount}/${monthlyGame.numAchievements}`.padEnd(9);
                let awardText = '';
                if (award.achievementCount === monthlyGame.numAchievements) awardText += '🏆';
                else if (award.beaten) awardText += '⭐';
                else if (award.achievementCount > 0) awardText += '✓';
                
                reply += `${username} ${progress} ${awardText}\n`;
            });
            
            reply += "```\n";
            reply += "🏆 = Mastered | ⭐ = Beaten | ✓ = Participated";

            message.channel.send(reply);
        } catch (error) {
            console.error('Leaderboard error:', error);
            message.reply('Error getting leaderboard data.');
        }
    }
};
