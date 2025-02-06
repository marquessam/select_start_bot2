// File: src/commands/search.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');

module.exports = {
    name: 'search',
    description: 'Search for game information on RetroAchievements',
    async execute(message, args) {
        try {
            if (!args.length) {
                return message.reply('Please provide a game ID or title to search for (e.g., !search 319 or !search "Chrono Trigger")');
            }

            const raAPI = new RetroAchievementsAPI(
                process.env.RA_USERNAME,
                process.env.RA_API_KEY
            );

            // Join args to handle titles with spaces
            const searchTerm = args.join(' ');
            
            // Check if search term is a game ID
            const isGameId = /^\d+$/.test(searchTerm);
            
            let gameInfo;
            if (isGameId) {
                try {
                    gameInfo = await raAPI.getGameInfo(searchTerm);
                    if (!gameInfo) {
                        return message.reply(`No game found with ID ${searchTerm}`);
                    }
                } catch (error) {
                    return message.reply(`No game found with ID ${searchTerm}`);
                }
            } else {
                return message.reply('Please provide a valid game ID (e.g., !search 319). Game title search is currently not supported.');
            }

            // Format dates nicely
            const releaseDate = gameInfo.released ? new Date(gameInfo.released).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) : 'Unknown';

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(gameInfo.title || gameInfo.gameTitle)
                .setURL(`https://retroachievements.org/game/${searchTerm}`)
                .setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`)
                .setImage(`https://retroachievements.org${gameInfo.imageBoxArt}`)
                .addFields(
                    {
                        name: 'Game Information',
                        value: `**Console:** ${gameInfo.console || gameInfo.consoleName}\n` +
                               `**Developer:** ${gameInfo.developer || 'Unknown'}\n` +
                               `**Publisher:** ${gameInfo.publisher || 'Unknown'}\n` +
                               `**Genre:** ${gameInfo.genre || 'Unknown'}\n` +
                               `**Release Date:** ${releaseDate}\n` +
                               `**Game ID:** ${searchTerm}`
                    }
                );

            // Get user progress if this game has achievements
            try {
                const progress = await raAPI.getUserProgress(process.env.RA_USERNAME, searchTerm);
                if (progress && progress[searchTerm]) {
                    const gameProgress = progress[searchTerm];
                    embed.addFields({
                        name: 'Achievement Information',
                        value: `**Total Achievements:** ${gameProgress.numPossibleAchievements}\n` +
                               `**Total Points:** ${gameProgress.possibleScore}`
                    });
                }
            } catch (error) {
                console.error('Error getting achievement info:', error);
                // Don't fail the whole command if we can't get achievement info
            }

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Search command error:', error);
            await message.reply('Error searching for game information.');
        }
    }
};