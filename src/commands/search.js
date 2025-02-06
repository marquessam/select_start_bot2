// File: src/commands/search.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');

module.exports = {
    name: 'search',
    description: 'Search for game information on RetroAchievements',
    async execute(message, args) {
        try {
            if (!args.length) {
                return message.reply('Please provide a game ID or title to search for (e.g., !search "Chrono Trigger" or !search 319)');
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
                gameInfo = await raAPI.getGameInfo(searchTerm);
            } else {
                // First we need to search for the game to get its ID
                const searchResults = await raAPI.searchGame(searchTerm);
                if (!searchResults || searchResults.length === 0) {
                    return message.reply(`No games found matching "${searchTerm}"`);
                }
                
                // Get full info for the first result
                gameInfo = await raAPI.getGameInfo(searchResults[0].gameId);
            }

            if (!gameInfo) {
                return message.reply('No game information found.');
            }

            // Format dates nicely
            const releaseDate = gameInfo.Released ? new Date(gameInfo.Released).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) : 'Unknown';

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(gameInfo.Title)
                .setURL(`https://retroachievements.org/game/${gameInfo.ID}`)
                .setThumbnail(`https://media.retroachievements.org${gameInfo.ImageIcon}`)
                .setImage(`https://media.retroachievements.org${gameInfo.ImageBoxArt}`)
                .addFields(
                    {
                        name: 'Game Information',
                        value: `**Console:** ${gameInfo.Console}\n` +
                               `**Developer:** ${gameInfo.Developer || 'Unknown'}\n` +
                               `**Publisher:** ${gameInfo.Publisher || 'Unknown'}\n` +
                               `**Genre:** ${gameInfo.Genre || 'Unknown'}\n` +
                               `**Release Date:** ${releaseDate}\n` +
                               `**Total Achievements:** ${gameInfo.NumAchievements}\n` +
                               `**Game ID:** ${gameInfo.ID}`
                    }
                );

            // If there are achievements, add some stats
            if (gameInfo.NumAchievements > 0) {
                let pointStats = '```\n';
                pointStats += `Total Points: ${gameInfo.Points || 0}\n`;
                pointStats += `Completion Estimate: ${gameInfo.CompletionEstimate || 'Unknown'}\n`;
                pointStats += '```';
                
                embed.addFields({
                    name: 'Achievement Stats',
                    value: pointStats
                });
            }

            // Add rich presence script if available
            if (gameInfo.RichPresencePatch) {
                embed.addFields({
                    name: 'Rich Presence',
                    value: 'This game supports rich presence tracking'
                });
            }

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Search command error:', error);
            await message.reply('Error searching for game information.');
        }
    }
};