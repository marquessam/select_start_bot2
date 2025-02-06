// File: src/commands/search.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');

// Cache to store search results temporarily
const searchCache = new Map();

/**
 * Generates a table using Unicode box-drawing characters.
 * Safely handles undefined or null cell values.
 *
 * @param {string[]} headers - Array of header titles.
 * @param {Array<Array<string|number>>} rows - Array of rows (each row is an array of cell values).
 * @returns {string} - The formatted table.
 */
function generateTable(headers, rows) {
  // Determine maximum width for each column, safely handling undefined/null values.
  const colWidths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map(row => ((row[i] === undefined || row[i] === null) ? "" : row[i]).toString().length))
  );

  const horizontalLine = (left, mid, right) => {
    let line = left;
    colWidths.forEach((width, index) => {
      line += "─".repeat(width + 2) + (index < colWidths.length - 1 ? mid : right);
    });
    return line;
  };

  const topBorder = horizontalLine("┌", "┬", "┐");
  const headerSeparator = horizontalLine("├", "┼", "┤");
  const bottomBorder = horizontalLine("└", "┴", "┘");

  const formatRow = (row) => {
    let rowStr = "│";
    row.forEach((cell, index) => {
      // If the cell is undefined or null, convert it to an empty string.
      cell = (cell === undefined || cell === null) ? "" : cell;
      rowStr += " " + cell.toString().padEnd(colWidths[index]) + " │";
    });
    return rowStr;
  };

  const headerRow = formatRow(headers);
  const rowLines = rows.map(formatRow);

  return [topBorder, headerRow, headerSeparator, ...rowLines, bottomBorder].join("\n");
}

/**
 * Displays detailed game information in an embed.
 */
async function displayGameInfo(gameInfo, message, raAPI) {
  // Format release date, if available.
  const releaseDate = gameInfo.Released 
    ? new Date(gameInfo.Released).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }) 
    : "Unknown";

  const embed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle(gameInfo.Title || "Unknown Title")
    .setURL(`https://retroachievements.org/game/${gameInfo.ID}`);

  if (gameInfo.ImageIcon) {
    embed.setThumbnail(`https://retroachievements.org${gameInfo.ImageIcon}`);
  }
  if (gameInfo.ImageBoxArt) {
    embed.setImage(`https://retroachievements.org${gameInfo.ImageBoxArt}`);
  }

  // Format game details as a table.
  const infoTable = generateTable(
    ["Field", "Value"],
    [
      ["Console", gameInfo.Console || "Unknown"],
      ["Developer", gameInfo.Developer || "Unknown"],
      ["Publisher", gameInfo.Publisher || "Unknown"],
      ["Genre", gameInfo.Genre || "Unknown"],
      ["Release Date", releaseDate],
      ["Game ID", gameInfo.ID]
    ]
  );
  embed.addFields({ name: "Game Information", value: "```" + infoTable + "```" });

  // Try to get achievement information.
  try {
    const progress = await raAPI.getUserProgress(process.env.RA_USERNAME, gameInfo.ID);
    if (progress && progress[gameInfo.ID]) {
      const gameProgress = progress[gameInfo.ID];
      // Format achievement info as a table.
      const achievementTable = generateTable(
        ["Metric", "Value"],
        [
          ["Total Achievements", gameProgress.numPossibleAchievements || 0],
          ["Total Points", gameProgress.possibleScore || 0]
        ]
      );
      embed.addFields({ name: "Achievement Information", value: "```" + achievementTable + "```" });
    }
  } catch (error) {
    console.error("Error getting achievement info:", error);
    embed.addFields({ name: "Achievement Information", value: "Achievement information currently unavailable" });
  }

  await message.channel.send({ embeds: [embed] });
}

/**
 * Handles a game search based on a search term.
 */
async function handleSearch(message, searchTerm, raAPI) {
  // If searchTerm is a number, attempt direct ID lookup.
  if (/^\d+$/.test(searchTerm)) {
    try {
      const gameInfo = await raAPI.getGameInfo(searchTerm);
      if (gameInfo && gameInfo.Title) {
        await displayGameInfo(gameInfo, message, raAPI);
        return;
      }
    } catch (error) {
      console.error("Error with direct ID lookup:", error);
      // Continue to fuzzy search if direct lookup fails.
    }
  }

  // Perform fuzzy search.
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
      // If only one result, display it directly.
      const gameInfo = await raAPI.getGameInfo(games[0].id);
      await displayGameInfo(gameInfo, message, raAPI);
      return;
    }

    // Create list of options (limit to top 10).
    const optionsList = games.slice(0, 10).map((game, index) => 
      `${index + 1}. ${game.title} (${game.console})`
    ).join("\n");

    const selectionEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("Multiple Games Found")
      .setDescription("Please select a game by number:\n\n" + optionsList + "\n\nType the number of your selection or \"cancel\" to exit.")
      .setFooter({ text: "This search will timeout in 30 seconds" });

    await message.channel.send({ embeds: [selectionEmbed] });

    // Store the games in cache for the response handler.
    searchCache.set(message.author.id, {
      games: games.slice(0, 10),
      timestamp: Date.now()
    });

    // Set up a message collector to capture the user’s selection.
    const filter = m => m.author.id === message.author.id && 
      (m.content.toLowerCase() === "cancel" || (Number(m.content) >= 1 && Number(m.content) <= games.length));

    const collector = message.channel.createMessageCollector({
      filter,
      time: 30000,
      max: 1
    });

    collector.on("collect", async m => {
      if (m.content.toLowerCase() === "cancel") {
        await message.reply("Search cancelled.");
        return;
      }

      const selectedIndex = Number(m.content) - 1;
      const selectedGame = games[selectedIndex];
      const gameInfo = await raAPI.getGameInfo(selectedGame.id);
      await displayGameInfo(gameInfo, message, raAPI);
    });

    collector.on("end", (collected, reason) => {
      searchCache.delete(message.author.id);
      if (reason === "time") {
        message.reply("Search timed out. Please try again.");
      }
    });

  } catch (error) {
    console.error("Search error:", error);
    message.reply("An error occurred while searching. Please try again.");
  }
}

module.exports = {
  name: "search",
  description: "Search for game information on RetroAchievements",
  async execute(message, args) {
    if (!args.length) {
      return message.reply('Please provide a game title or ID to search for (e.g., !search "Chrono Trigger" or !search 319)');
    }

    const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
    const searchTerm = args.join(" ");
    await handleSearch(message, searchTerm, raAPI);
  }
};
