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
    details += `**Total Achievements:** ${109}\n\n`; // Fixed achievement count
    
    // Add time remaining
    details += `**Time Remaining:** ${getTimeRemaining()}\n`;

    // Add awards explanation
    let awards = '';
    awards += '**Participation Award** 🏁\n';
    awards += '• Earn at least 1 achievement\n';
    awards += '• Worth 1 point\n\n';

    awards += '**Beaten Award** ⭐\n';
    if (game.winCondition) {
        awards += '• Complete all win conditions\n';
    }
    awards += '• Worth 3 points\n\n';

    awards += '**Mastery Award** ✨\n';
    awards += '• Complete 100% of the achievements\n';
    awards += '• Worth 3 additional points\n';

    embed.addFields(
        { name: 'Game Information', value: details },
        { name: 'Awards and Points', value: awards }
    );

    return embed;
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

            const raAPI = new RetroAchievementsAPI(
                process.env.RA_USERNAME,
                process.env.RA_API_KEY
            );

            const embed = await displayChallenge(game, raAPI);
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error in challenge command:', error);
            await message.reply('Error getting challenge information.');
        }
    }
};