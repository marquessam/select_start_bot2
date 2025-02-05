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
            reply += `**2024 Awards:**\n\`\`\`\n`;

            // Get all data
            const games = await Game.find({ year: currentYear }).sort({ month: 1 });
            const awards = await Award.find({ 
                raUsername,
                year: currentYear
            });

            // Process month by month
            let currentMonth = null;
            for (const game of games) {
                // Print month header if it's a new month
                if (currentMonth !== game.month) {
                    if (currentMonth !== null) reply += '\n';
                    currentMonth = game.month;
                    reply += `${game.month === 1 ? 'January' : 'February'}:\n`;
                }

                // Find award for this game
                const award = awards.find(a => a.gameId === game.gameId);
                
                // Print game info
                reply += `${game.title} (${game.type}):\n`;
                reply += `  Progress: ${award ? award.achievementCount : 0}/${game.numAchievements}\n`;
                
                // Print awards
                if (award && award.awards) {
                    if (award.awards.mastered) reply += '  ★ MASTERED\n';
                    else if (award.awards.beaten) reply += '  ✓ BEATEN\n';
                    else if (award.awards.participation) reply += '  • PARTICIPATED\n';
                } else {
                    reply += '  No awards yet\n';
                }
            }

            reply += '\`\`\`';
            message.channel.send(reply);

        } catch (error) {
            console.error('Error showing profile:', error);
            message.reply('Error getting profile data.');
        }
    }
};
