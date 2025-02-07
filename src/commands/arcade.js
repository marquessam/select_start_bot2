// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const User = require('../models/User');

/**
 * Fetches leaderboard entries for a given game from RetroAchievements.
 * @param {string|number} gameId - The game ID to look up.
 * @returns {Promise<Array>} - Returns an array of leaderboard entries.
 */
async function fetchLeaderboardEntries(gameId) {
  // Using the API_GetLeaderboardEntries endpoint.
  // Example URL: https://retroachievements.org/API/API_GetLeaderboardEntries.php?i=104370
  const url = `https://retroachievements.org/API/API_GetLeaderboardEntries.php?i=${gameId}`;
  const response = await axios.get(url);
  // Assume the API returns an array of entries in JSON.
  return response.data;
}

/**
 * Formats a leaderboard entry line with a rank emoji for 1st-3rd.
 * @param {object} entry - The leaderboard entry.
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
  return `${rankEmoji} Rank #${entry.Rank} - ${entry.Username}: ${entry.Score}`;
}

module.exports = {
  name: 'arcade',
  description: 'Displays highscore lists for arcade games',
  async execute(message, args) {
    try {
      // Require a game ID argument.
      if (!args[0]) {
        return message.reply('Please provide a game ID. Example: `!arcade 104370`');
      }
      const gameId = args[0];

      // Fetch leaderboard data from RetroAchievements.
      let leaderboardEntries = await fetchLeaderboardEntries(gameId);
      if (!Array.isArray(leaderboardEntries)) {
        return message.reply('Unexpected data format from the leaderboard API.');
      }

      // Sort entries by rank (assuming each entry has a numeric "Rank" property).
      leaderboardEntries.sort((a, b) => a.Rank - b.Rank);

      // Retrieve your user list from the database.
      const users = await User.find({});
      // Create a set of lower-case usernames for quick lookup.
      const registeredUserSet = new Set(users.map(u => u.raUsername.toLowerCase()));

      // Optionally, mark or filter entries based on whether they are in your user list.
      // In this example, we'll add a note for entries that are from your registered users.
      leaderboardEntries = leaderboardEntries.map(entry => {
        const isRegistered = registeredUserSet.has(entry.Username.toLowerCase());
        return {
          ...entry,
          Registered: isRegistered
        };
      });

      // Build the output text.
      let output = `**Game ID:** ${gameId}\n`;
      output += '**User Highscores:**\n\n';

      // We'll list the top 15 entries (or fewer if there aren’t that many)
      const displayEntries = leaderboardEntries.slice(0, 15);
      for (const entry of displayEntries) {
        // Format each entry.
        const line = formatEntry(entry);
        // Optionally, if the user is registered, add an asterisk or bold their name.
        if (entry.Registered) {
          output += `**${line}**\n`;
        } else {
          output += `${line}\n`;
        }
      }

      if (displayEntries.length === 0) {
        output += 'No leaderboard entries found.';
      }

      // Create an embed to display the data.
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Arcade Highscores')
        .setDescription(output)
        .setFooter({ text: 'Data provided by RetroAchievements.org' });

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Arcade command error:', error);
      await message.reply('Error fetching arcade leaderboard.');
    }
  }
};
