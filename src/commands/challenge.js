// File: src/commands/challenge.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const RetroAchievementsAPI = require('../services/retroAchievements');

function getTimeRemaining() {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const diff = endDate - now;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${days}d ${hours}h ${minutes}m`;
}

async function displayChallenge(game, raAPI) {
    const gameInfo = await raAPI.getGameInfo(game.gameId);
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(game.title)
        .setThumbnail(`https://media.retroachievements.org${gameInfo.ImageIcon}`)
        .setImage(`https://media.retroachievements.org${gameInfo.ImageBoxArt}`);

    // Add game details
    let details = '';
    details += `**Console:** ${gameInfo.Console}\n`;
    details += `**Genre:** ${gameInfo.Genre}\n`;
    details += `**Developer:** ${gameInfo.Developer || 'N/A'}\n`;
    details += `**Publisher:** ${gameInfo.Publisher}\n`;
    details += `**Release Date:** ${gameInfo.Released}\n`;
    details += `**Total Achievements:** ${game.numAchievements}\n\n`;
    
    // Add time remaining
    details += `**Time Remaining:** ${getTimeRemaining()}\n`;

    // Add completion requirements
    let requirements = '**Requirements:**\n';
    if (game.requireProgression) {
        requirements += '• Complete all progression achievements\n';
    }
    if (game.winCondition && game.winCondition.length > 0) {
        if (game.requireAllWinConditions) {
            requirements += '• Complete all win condition achievements\n';
        } else {
            requirements += '• Complete at least one win condition achievement\n';
        }
    }
    if (game.masteryCheck) {
        requirements += '• Optional: Master all achievements for bonus points\n';
    }

    embed.addFields(
        { name: 'Game Information', value: details },
        { name: 'Challenge Requirements', value: requirements }
    );

    return embed;
}

module.exports = {
    name: 'challenge',
    async execute(message, args) {
        try {
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const type = args[0]?.toLowerCase() || 'monthly';
            if (!['monthly', 'shadow'].includes(type)) {
                return message.reply('Please specify either "monthly" or "shadow" (e.g., !challenge monthly)');
            }

            const game = await Game.findOne({
                month: currentMonth,
                year: currentYear,
                type: type.toUpperCase()
            });

            if (!game) {
                return message.reply(`No ${type} game found for the current month.`);
            }

            const raAPI = new RetroAchievementsAPI(
                process.env.RA_USERNAME,
                process.env.RA_API_KEY
            );

            const embed = await displayChallenge(game, raAPI);
            message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error displaying challenge:', error);
            message.reply('Error getting challenge information.');
        }
    }
};
