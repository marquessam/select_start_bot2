// File: src/commands/search.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');

module.exports = {
    name: 'search',
    description: 'Search for game information on RetroAchievements',
    async execute(message, args) {
        try {
            if (!args.length) {
                return message.reply('Please provide a game title to search for (e.g., !search "Chrono Trigger")');
            }

            const raAPI = new RetroAchievementsAPI(
                process.env.RA_USERNAME,
                process.env.RA_API_KEY
            );

            // Join args to handle titles with spaces
            const searchTerm = args.join(' ');
            
            // Search for games
            const searchResults = await raAPI.searchGame(searchTerm);
            
            if (!searchResults || searchResults.length === 0) {
                return message.reply(`No games found matching "${searchTerm}"`);
            }

            // Get full info for the first result
            const gameInfo = await raAPI.getGameInfo(searchResults[0].gameId);

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
                if (gameInfo.RetroPoints) pointStats += `Retro Points: ${gameInfo.RetroPoints}\n`;
                pointStats += '```';
                
                embed.addFields({
                    name: 'Achievement Stats',
                    value: pointStats
                });
            }

            // If there were multiple results, mention them
            if (searchResults.length > 1) {
                const otherGames = searchResults.slice(1, 4).map(game => 
                    `• ${game.title} (${game.consoleName}) - ID: ${game.gameId}`
                ).join('\n');

                embed.addFields({
                    name: 'Other Matches',
                    value: otherGames + (searchResults.length > 4 ? '\n*(and more...)*' : '')
                });
            }

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Search command error:', error);
            await message.reply('Error searching for game information.');
        }
    }
};
