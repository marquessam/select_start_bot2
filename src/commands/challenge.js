// File: src/commands/challenge.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');

function getTimeRemaining() {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const diff = endDate - now;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${days}d ${hours}h ${minutes}m`;
}

module.exports = {
    name: 'challenge',
    description: 'Shows current challenge information',
    async execute(message, args) {
        try {
            const type = args[0]?.toLowerCase() || 'monthly';
            
            if (!['monthly', 'shadow'].includes(type)) {
                return message.reply('Please specify either "monthly" or "shadow" (e.g., !challenge monthly)');
            }

            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const game = await Game.findOne({
                month: currentMonth,
                year: currentYear,
                type: type.toUpperCase()
            });

            if (!game) {
                return message.reply(`No ${type} game found for the current month.`);
            }

            const loadingMsg = await message.channel.send('Fetching challenge information...');

            // Get game info from RA
            const gameInfo = await message.client.raAPI('API_GetGame.php', {
                i: game.gameId
            });

            if (!gameInfo) {
                await loadingMsg.delete();
                return message.reply('Error fetching game information.');
            }

            const embed = new EmbedBuilder()
                .setColor(type === 'monthly' ? '#00BFFF' : '#FFD700')
                .setTitle(game.title)
                .setURL(`https://retroachievements.org/game/${game.gameId}`);

            if (gameInfo.ImageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.ImageIcon}`);
            }
            if (gameInfo.ImageBoxArt) {
                embed.setImage(`https://retroachievements.org${gameInfo.ImageBoxArt}`);
            }

            let details = '';
            details += `**Console:** ${gameInfo.Console}\n`;
            details += `**Genre:** ${gameInfo.Genre || 'N/A'}\n`;
            details += `**Developer:** ${gameInfo.Developer || 'N/A'}\n`;
            details += `**Publisher:** ${gameInfo.Publisher || 'N/A'}\n`;
            details += `**Release Date:** ${gameInfo.Released || 'N/A'}\n`;
            details += `**Total Achievements:** ${gameInfo.NumAchievements}\n\n`;
            details += `**Time Remaining:** ${getTimeRemaining()}\n`;

            embed.addFields({ name: 'Game Information', value: details });

            let requirements = '';
            requirements += '**Point Values:**\n';
            requirements += '• Participation (1 point): Earn at least 1 achievement\n';
            requirements += '• Beaten (3 points): Complete win condition(s)\n';
            if (type === 'monthly') {
                requirements += '• Mastery (3 points): Complete 100% of achievements\n\n';
            }

            if (game.winConditions.length > 0) {
                requirements += '**Win Conditions:**\n';
                requirements += game.requireAllWinConditions 
                    ? '• Must complete ALL of the following:\n'
                    : '• Must complete ANY of the following:\n';
                
                // Get achievement info for win conditions
                for (const achievementId of game.winConditions) {
                    if (gameInfo.Achievements && gameInfo.Achievements[achievementId]) {
                        const achievement = gameInfo.Achievements[achievementId];
                        requirements += `• ${achievement.Title}\n`;
                    }
                }
            }

            embed.addFields({ name: 'Requirements', value: requirements });

            await loadingMsg.delete();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error in challenge command:', error);
            await message.reply('Error getting challenge information. Please try again.');
        }
    }
};
