// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');
const User = require('../models/User');

// Updated arcade configuration with correct game IDs.
const arcadeConfigs = [
  {
    id: 533,
    name: "Mario Kart: Super Circuit (GBA) - Mario Circuit",
  },
  {
    id: 11331,
    name: "Tony Hawk's Pro Skater (PSX) - Warehouse, Woodland Hills",
  },
  {
    id: 508,
    name: "Tetris (GB) - A-Type Challenge",
  },
];

/**
 * Fetches leaderboard entries for a given game using the RetroAchievementsAPI service.
 * @param {string|number} gameId - The game ID to look up.
 * @returns {Promise<Array>} - Returns an array of leaderboard entries.
 */
async function fetchLeaderboardEntries(gameId) {
  const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
  const data = await raAPI.getLeaderboardEntries(gameId);
  console.log('API response data:', data); // Debug logging

  let entries = data;
  // If the data is an object but not an array, convert its values to an array.
  if (!Array.isArray(entries) && entries && typeof entries === 'object') {
    entries = Object.values(entries);
  }
  if (!Array.isArray(entries)) {
    if (entries && entries.message) {
      throw new Error(`API error: ${entries.message}`);
    } else {
      throw new Error('Unexpected data format from the leaderboard API.');
    }
  }
  return entries;
}

/**
 * Formats a single leaderboard entry line.
 * Adds a crown emoji for 1st, second medal for 2nd, and third medal for 3rd.
 * @param {object} entry - A leaderboard entry.
 * @returns {string} - The formatted string.
 */
function formatEntry(entry) {
  let rankEmoji = '';
  if (entry.Rank === 1) {
    rankEmoji = '👑';
  } else if (entry.Rank === 2) {
    rankEmoji = '🥈';
  } else if (entry.Rank === 3) {
    rankEmoji = '🥉';
  }
  // Use entry.User or fallback to entry.Username; if missing, use "Unknown"
  const username = (entry.User || entry.Username) || 'Unknown';
  return `${rankEmoji} Rank #${entry.Rank} - ${username}: ${entry.Score}`;
}

module.exports = {
  name: 'arcade',
  description: 'Displays highscore lists for preset arcade games (for registered users only)',
  async execute(message, args) {
    try {
      // If no argument is provided, list available leaderboards.
      if (!args[0]) {
        let listText = '**Available Arcade Leaderboards:**\n\n';
        arcadeConfigs.forEach((config, index) => {
          listText += `${index + 1}. ${config.name}\n`;
        });
        listText += `\nType \`!arcade <number>\` to view that leaderboard.`;
        const embed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('Arcade Leaderboards')
          .setDescription(listText)
          .setFooter({ text: 'Data provided by RetroAchievements.org' });
        return message.channel.send({ embeds: [embed] });
      }

      // Parse the selection number.
      const selection = parseInt(args[0]);
      if (isNaN(selection) || selection < 1 || selection > arcadeConfigs.length) {
        return message.reply(`Invalid selection. Please choose a number between 1 and ${arcadeConfigs.length}.`);
      }
      const selectedConfig = arcadeConfigs[selection - 1];

      // Fetch leaderboard entries using your API service.
      let leaderboardEntries = await fetchLeaderboardEntries(selectedConfig.id);
      if (!Array.isArray(leaderboardEntries)) {
        return message.reply('Unexpected data format from the leaderboard API.');
      }

      // Retrieve registered users from the database.
      const users = await User.find({});
      const registeredUserSet = new Set(users.map(u => u.raUsername.toLowerCase()));

      // Filter entries to only include those with a valid username and that are registered.
      leaderboardEntries = leaderboardEntries.filter(entry => {
        const username = (entry.User || entry.Username);
        if (typeof username !== 'string') {
          console.warn('Skipping entry with missing username property:', entry);
          return false;
        }
        return registeredUserSet.has(username.toLowerCase());
      });

      // Sort entries by Rank (ascending).
      leaderboardEntries.sort((a, b) => a.Rank - b.Rank);

      // Build the output text.
      let output = `**${selectedConfig.name}**\n`;
      output += `**Game ID:** ${selectedConfig.id}\n\n`;
      output += '**User Highscores:**\n\n';

      // Display up to the top 15 entries.
      const displayEntries = leaderboardEntries.slice(0, 15);
      for (const entry of displayEntries) {
        output += formatEntry(entry) + '\n';
      }
      if (displayEntries.length === 0) {
        output += 'No leaderboard entries found for your users.';
      }

      // Fetch game info to display the game icon as thumbnail.
      const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
      const gameInfo = await raAPI.getGameInfo(selectedConfig.id);
      let thumbnailUrl = null;
      if (gameInfo && gameInfo.ImageIcon) {
        thumbnailUrl = `https://retroachievements.org${gameInfo.ImageIcon}`;
      }

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Arcade Highscores')
        .setDescription(output)
        .setFooter({ text: 'Data provided by RetroAchievements.org' });

      if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
      }

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Arcade command error:', error);
      await message.reply('Error fetching arcade leaderboard.');
    }
  }
};
