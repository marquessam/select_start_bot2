// File: src/commands/search.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');

// Cache to store search results temporarily
const searchCache = new Map();

/**
 * Generates a table using Unicode box-drawing characters.
 * @param {string[]} headers - An array of header titles.
 * @param {Array<Array<string|number>>} rows - An array of rows (each row is an array of cell values).
 * @returns {string} - The formatted table as a string.
 */
function generateTable(headers, rows) {
    // Determine maximum width for each column.
    const colWidths = headers.map((header, i) => 
        Math.max(header.length, ...rows.map(row => row[i].toString().length))
    );

    // Helper to build horizontal lines.
    const horizontalLine = (left, mid, right) => {
        let line = left;
        colWidths.forEach((width, index) => {
            line += '─'.repeat(width + 2);
            line += index < colWidths.length - 1 ? mid : right;
        });
        return line;
    };

    const topBorder = horizontalLine('┌', '┬', '┐');
    const headerSeparator = horizontalLine('├', '┼', '┤');
    const bottomBorder = horizontalLine('└', '┴', '┘');

    const formatRow = (row) => {
        let rowStr = '│';
        row.forEach((cell, index) => {
            rowStr += ' ' + cell.toString().padEnd(colWidths[index]) + ' │';
        });
        return rowStr;
    };

    const headerRow = formatRow(headers);
    const rowLines = rows.map(formatRow);

    return [topBorder, headerRow, headerSeparator, ...rowLines, bottomBorder].join('\n');
}

/**
 * Displays detailed game information in an embed.
 */
async function displayGameInfo(gameInfo, message, raAPI) {
    // Format the release date nicely.
    const releaseDate = gameInfo.Released 
        ? new Date(gameInfo.Released).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }) 
        : 'Unknown';

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(gameInfo.Title || 'Unknown Title')
        .setURL(`https://retroachievements.org/game/${gameInfo.ID}`);

    // Set thumbnail and image if available.
    if (gameInfo.ImageIcon) {
        embed.setThumbnail(`https://retroachievements.org${gameInfo.ImageIcon}`);
    }
    if (gameInfo.ImageBoxArt) {
        embed.setImage(`https://retroachievements.org${gameInfo.ImageBoxArt}`);
    }

    // Create a table for the basic game details.
    const infoTable = generateTable(
        ['Field', 'Value'],
        [
            ['Console', gameInfo.Console || 'Unknown'],
            ['Developer', gameInfo.Developer || 'Unknown'],
            ['Publisher', gameInfo.Publisher || 'Unknown'],
            ['Genre', gameInfo.Genre || 'Unknown'],
            ['Release Date', releaseDate],
            ['Game ID', gameInfo.ID]
        ]
    );
    embed.addFields({ name: 'Game Information', value: '```' + infoTable + '```' });

    // Try to get achievement information.
    try {
        const progress = await raAPI.getUserProgress(process.env.RA_USERNAME, gameInfo.ID);
        if (progress && progress[gameInfo.ID]) {
            const gameProgress = progress[gameInfo.ID];
            const achievementTable = generateTable(
                ['Metric', 'Value'],
                [
                    ['Total Achievements', gameProgress.numPossibleAchievements || 0],
                    ['Total Points', gameProgress.possibleScore || 0]
                ]
            );
            embed.addFields({ name: 'Achievement Information', value: '```' + achievementTable + '```' });
        }
    } catch (error) {
        console.error('Error getting achievement info:', error);
        embed.addFields({ 
            name: 'Achievement Information', 
            value: 'Achievement information currently unavailable'
        });
    }

    await message.channel.send({ embeds: [embed] });
}

/**
 * Handles searching for a game based on a search term.
 */
async function handleSearch(message, searchTerm, raAPI) {
    // If the search term is a number, attempt a direct ID lookup first.
    if (/^\d+$/.test(searchTerm)) {
        try {
            const gameInfo = await raAPI.getGameInfo(searchTerm);
            if (gameInfo && gameInfo.Title) {
                await displayGameInfo(gameInfo, message, raAPI);
                return;
            }
        } catch (error) {
            console.error('Error with direct ID lookup:', error);
            // Continue to fuzzy search if direct lookup fails.
        }
    }

    // Perform a fuzzy search.
    try {
        const searchResults = await raAPI.getGameList(searchTerm);
        
        if (!searchResults || Object.keys(searchResults).length === 0) {
            return message.reply(`No games found matching "${searchTerm}"`);
        }

        // Convert results to an array and sort by title.
        const games = Object.entries(searchResults)
            .map(([id, game]) => ({
                id,
                title: game.Title,
                console: game.ConsoleName
            }))
            .sort((a, b) => a.title.localeCompare(b.title));

        if (games.length === 1) {
            // If only one result, show it directly.
            const gameInfo = await raAPI.getGameInfo(games[0].id);
            await displayGameInfo(gameInfo, message, raAPI);
            return;
        }

        // Create a table of options with columns for Number, Title, and Console.
        const optionsRows = games.slice(0, 10).map((game, index) => [
            index + 1,
            game.title,
            game.console
        ]);
        const optionsTable = generateTable(['No.', 'Title', 'Console'], optionsRows);

        const selectionEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Multiple Games Found')
            .setDescription('Please select a game by number:\n```' + optionsTable + '```\nType the number of your selection or "cancel" to exit.')
            .setFooter({ text: 'This search will timeout in 30 seconds' });

        await message.channel.send({ embeds: [selectionEmbed] });

        // Store the games in cache for the response handler.
        searchCache.set(message.author.id, {
            games: games.slice(0, 10),
            timestamp: Date.now()
        });

        // Set up a message collector to capture the user’s selection.
        const filter = m => m.author.id === message.author.id && 
            (m.content.toLowerCase() === 'cancel' || 
             (Number(m.content) >= 1 && Number(m.content) <= games.length));

        const collector = message.channel.createMessageCollector({
            filter,
            time: 30000,
            max: 1
        });

        collector.on('collect', async m => {
            if (m.content.toLowerCase() === 'cancel') {
                await message.reply('Search cancelled.');
                return;
            }

            const selectedIndex = Number(m.content) - 1;
            const selectedGame = games[selectedIndex];
            const gameInfo = await raAPI.getGameInfo(selectedGame.id);
            await displayGameInfo(gameInfo, message, raAPI);
        });

        collector.on('end', (collected, reason) => {
            searchCache.delete(message.author.id);
            if (reason === 'time') {
                message.reply('Search timed out. Please try again.');
            }
        });

    } catch (error) {
        console.error('Search error:', error);
        message.reply('An error occurred while searching. Please try again.');
    }
}

module.exports = {
    name: 'search',
    description: 'Search for game information on RetroAchievements',
    async execute(message, args) {
        if (!args.length) {
            return message.reply('Please provide a game title or ID to search for (e.g., !search "Chrono Trigger" or !search 319)');
        }

        const raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );

        const searchTerm = args.join(' ');
        await handleSearch(message, searchTerm, raAPI);
    }
};
