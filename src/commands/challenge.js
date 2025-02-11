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

async function displayChallenge(game, raAPI, awardService) {
    try {
        const gameInfo = await raAPI.getGameInfo(game.gameId);
        if (!gameInfo) {
            throw new Error(`Unable to fetch game info for ${game.title}`);
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(game.title)
            .setURL(`https://retroachievements.org/game/${game.gameId}`);

        // Set images if available
        if (gameInfo.ImageIcon) {
            embed.setThumbnail(`https://retroachievements.org${gameInfo.ImageIcon}`);
        }
        if (gameInfo.ImageBoxArt) {
            embed.setImage(`https://retroachievements.org${gameInfo.ImageBoxArt}`);
        }

        // Add game details
        let details = '';
        details += `**Console:** ${gameInfo.Console}\n`;
        details += `**Genre:** ${gameInfo.Genre || 'N/A'}\n`;
        details += `**Developer:** ${gameInfo.Developer || 'N/A'}\n`;
        details += `**Publisher:** ${gameInfo.Publisher || 'N/A'}\n`;
        details += `**Release Date:** ${gameInfo.Released || 'N/A'}\n`;
        details += `**Total Achievements:** ${game.numAchievements}\n\n`;
        
        // Add time remaining
        details += `**Time Remaining:** ${getTimeRemaining()}\n`;

        // Add progression requirements if any
        if (game.progression && game.progression.length > 0) {
            details += `\n**Progression Required:** ${game.requireProgression ? 'Yes' : 'No'}\n`;
            if (game.requireProgression) {
                details += `• Must complete ${game.progression.length} progression achievements in order\n`;
            }
        }

        // Add win conditions
        if (game.winCondition && game.winCondition.length > 0) {
            details += `**Win Conditions Required:** ${game.requireAllWinConditions ? 'All' : 'Any'}\n`;
            details += `• Must complete ${game.requireAllWinConditions ? 'all' : 'at least one of'} ${game.winCondition.length} win condition achievement(s)\n`;
        }

        // Add awards explanation
        let awards = '';
        awards += '**Participation Award** 🏁\n';
        awards += '• Earn at least 1 achievement\n';
        awards += '• Worth 1 point\n\n';

        awards += '**Beaten Award** ⭐\n';
        if (game.progression && game.progression.length > 0) {
            awards += '• Complete progression achievements (if required)\n';
        }
        awards += `• Complete ${game.requireAllWinConditions ? 'all' : 'any'} win condition achievement(s)\n`;
        awards += '• Worth 3 points\n\n';

        if (game.type === 'MONTHLY' && game.masteryCheck) {
            awards += '**Mastery Award** ✨\n';
            awards += '• Complete 100% of the achievements\n';
            awards += '• Worth 3 additional points\n';
        }

        embed.addFields(
            { name: 'Game Information', value: details },
            { name: 'Awards and Points', value: awards }
        );

        // Add achievement progress tracking info
        if (game.progression && game.progression.length > 0) {
            let progressionInfo = '';
            for (const achievementId of game.progression) {
                try {
                    const achievementInfo = await raAPI.getAchievementInfo(game.gameId, achievementId);
                    if (achievementInfo) {
                        progressionInfo += `• ${achievementInfo.Title}\n`;
                    }
                } catch (error) {
                    console.error(`Error fetching achievement info for ${achievementId}:`, error);
                }
            }
            
            if (progressionInfo) {
                embed.addFields({
                    name: 'Progression Achievements',
                    value: progressionInfo
                });
            }
        }

        return embed;
    } catch (error) {
        console.error('Error creating challenge embed:', error);
        throw error;
    }
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

            // Get required services from client
            const { raAPI, awardService } = message.client;

            const embed = await displayChallenge(game, raAPI, awardService);
            
            await loadingMsg.delete();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error in challenge command:', error);
            await message.reply('Error getting challenge information. Please try again.');
        }
    }
};
