// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const User = require('../models/User');

/**
 * Fetches leaderboard entries for a given game from RetroAchievements.
 * Includes RA credentials as query parameters.
 * Logs the API response for debugging purposes.
 *
 * @param {string|number} gameId - The game ID to look up.
 * @returns {Promise<Array>} - Returns an array of leaderboard entries.
 */
async function fetchLeaderboardEntries(gameId) {
  const raUsername = process.env.RA_USERNAME;
  const raAPIKey = process.env.RA_API_KEY;
  const url = `https://retroachievements.org/API/API_GetLeaderboardEntries.php?i=${gameId}&z=${raUsername}&y=${raAPIKey}`;
  
  try {
    const response = await axios.get(url);
    console.log('API response data:', response.data); // Debug logging
    const data = response.data;
    
    // Check if the API returned an array.
    if (!Array.isArray(data)) {
      if (data.message) {
        throw new Error(`API error: ${data.message}`);
      } else {
        throw new Error('Unexpected data format from the leaderboard API.');
      }
    }
    return data;
  } catch (error) {
    console.error('Error fetching leaderboard entries:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Formats a single leaderboard entry line.
 * Adds a crown emoji for 1st, second medal for 2nd, and third medal for 3rd.
 *
 * @param {object} entry - A leaderboard entry.
 * @returns {string} - The formatted entry string.
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
      // Validate that a game ID was provided.
      if (!args[0]) {
        return message.reply('Please provide a game ID. Example: `!arcade 1143`');
      }
      const gameId = args[0];

      // Fetch leaderboard entries from the RetroAchievements API.
      let leaderboardEntries = await fetchLeaderboardEntries(gameId);
      if (!Array.isArray(leaderboardEntries)) {
        return message.reply('Unexpected data format from the leaderboard API.');
      }

      // Sort the entries by Rank in ascending order.
      leaderboardEntries.sort((a, b) => a.Rank - b.Rank);

      // Retrieve the registered users from the database.
      const users = await User.find({});
      const registeredUserSet = new Set(users.map(u => u.raUsername.toLowerCase()));

      // Flag entries that are from registered users.
      leaderboardEntries = leaderboardEntries.map(entry => {
        const isRegistered = registeredUserSet.has(entry.Username.toLowerCase());
        return { ...entry, Registered: isRegistered };
      });

      // Build the output text.
      let output = `**Game ID:** ${gameId}\n`;
      output += '**User Highscores:**\n\n';

      // Display up to the top 15 entries.
      const displayEntries = leaderboardEntries.slice(0, 15);
      for (const entry of displayEntries) {
        const line = formatEntry(entry);
        output += entry.Registered ? `**${line}**\n` : `${line}\n`;
      }
      if (displayEntries.length === 0) {
        output += 'No leaderboard entries found.';
      }

      // Create and send the embed.
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
