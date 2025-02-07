// File: src/commands/search.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');

// Cache to store search results temporarily
const searchCache = new Map();

/**
 * Displays detailed game information in an embed using clean, plain text formatting.
 * @param {object} gameInfo - The game information object returned from the API.
 * @param {Message} message - The Discord message object.
 * @param {RetroAchievementsAPI} raAPI - An instance of the RetroAchievementsAPI.
 */
async function displayGameInfo(gameInfo, message, raAPI) {
  // Format the release date, if available.
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

  // Format game details as plain text with Markdown.
  const gameInfoText =
    `**Console:** ${gameInfo.Console || "Unknown"}\n` +
    `**Developer:** ${gameInfo.Developer || "Unknown"}\n` +
    `**Publisher:** ${gameInfo.Publisher || "Unknown"}\n` +
    `**Genre:** ${gameInfo.Genre || "Unknown"}\n` +
    `**Release Date:** ${releaseDate}\n` +
    `**Game ID:** ${gameInfo.ID}`;

  embed.addFields({ name: "Game Information", value: gameInfoText });

  // Attempt to get achievement information.
  try {
    const progress = await raAPI.getUserProgress(process.env.RA_USERNAME, gameInfo.ID);
    if (progress && progress[gameInfo.ID]) {
      const gameProgress = progress[gameInfo.ID];
      const achievementInfoText =
        `**Total Achievements:** ${gameProgress.numPossibleAchievements || 0}\n` +
        `**Total Points:** ${gameProgress.possibleScore || 0}`;
      embed.addFields({ name: "Achievement Information", value: achievementInfoText });
    }
  } catch (error) {
    console.error("Error getting achievement info:", error);
    embed.addFields({
      name: "Achievement Information",
      value: "Achievement information currently unavailable"
    });
  }

  await message.channel.send({ embeds: [embed] });
}

/**
 * Handles a game search based on a search term.
 * If the search term is numeric, it first attempts a direct ID lookup.
 * Otherwise, it performs a fuzzy search and lets the user select from up to 10 options.
 *
 * @param {Message} message - The Discord message object.
 * @param {string} searchTerm - The search term provided by the user.
 * @param {RetroAchievementsAPI} raAPI - An instance of the RetroAchievementsAPI.
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

    // Create a numbered list of options (limit to top 10).
    const optionsList = games.slice(0, 10)
      .map((game, index) => `${index + 1}. ${game.title} (${game.console})`)
      .join("\n");

    const selectionEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("Multiple Games Found")
      .setDescription("Please select a game by number:\n\n" + optionsList + "\n\nType the number of your selection or \"cancel\" to exit.")
      .setFooter({ text: "This search will timeout in 30 seconds" });

    await message.channel.send({ embeds: [selectionEmbed] });

    // Cache the search results for later retrieval.
    searchCache.set(message.author.id, {
      games: games.slice(0, 10),
      timestamp: Date.now()
    });

    // Set up a message collector to capture the user’s selection.
    const filter = m => m.author.id === message.author.id &&
      (m.content.toLowerCase() === "cancel" ||
       (Number(m.content) >= 1 && Number(m.content) <= games.length));

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
