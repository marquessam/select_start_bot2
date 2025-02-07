// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const User = require('../models/User');

// Arcade configuration: each entry defines a known leaderboard.
// You can add more entries as needed.
const arcadeConfigs = [
  {
    id: 1143,
    name: "Mario Kart: Super Circuit (GBA) - Mario Circuit",
  },
  {
    id: 18937,
    name: "Tony Hawk's Pro Skater (PSX) - Warehouse, Woodland Hills",
  },
  {
    id: 24,
    name: "Tetris (GB) - A-Type Challenge",
  },
];

/**
 * Fetches leaderboard entries for a given game from RetroAchievements.
 * This method includes RA credentials as query parameters and logs the raw
 * API response for debugging.
 *
 * @param {string|number} gameId - The game ID to look up.
 * @returns {Promise<Array>} - Returns an array of leaderboard entries.
 */
async function fetchLeaderboardEntries(gameId) {
  const raUsername = process.env.RA_USERNAME;
  const raAPIKey = process.env.RA_API_KEY;
  const url = `https://retroachievements.org/API/API_GetLeaderboardEntries.php?i=${gameId}&z=${raUsername}&y=${raAPIKey}`;

  try {
    const response = await axios.get(url, { responseType: 'json' });
    console.log('API response data:', response.data); // Debug logging
    let data = response.data;

    // If the data is not an array, try to recover.
    if (!Array.isArray(data)) {
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          throw new Error('Failed to parse API response as JSON.');
        }
        if (!Array.isArray(data)) {
          throw new Error('Unexpected data format from the leaderboard API after parsing.');
        }
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.leaderboard)) {
          data = data.leaderboard;
        } else if (data.message) {
          throw new Error(`API error: ${data.message}`);
        } else {
          throw new Error('Unexpected data format from the leaderboard API.');
        }
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
 * Formats a single leaderboard entry.
 * Adds a crown emoji for 1st, second medal for 2nd, and third medal for 3rd.
 *
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
  return `${rankEmoji} Rank #${entry.Rank} - ${entry.Username}: ${entry.Score}`;
}

module.exports = {
  name: 'arcade',
  description: 'Displays highscore lists for preset arcade games',
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

      // Otherwise, interpret the first argument as a selection number.
      const selection = parseInt(args[0]);
      if (isNaN(selection) || selection < 1 || selection > arcadeConfigs.length) {
        return message.reply(`Invalid selection. Please choose a number between 1 and ${arcadeConfigs.length}.`);
      }
      const selectedConfig = arcadeConfigs[selection - 1];

      // Fetch leaderboard entries for the selected game.
      let leaderboardEntries = await fetchLeaderboardEntries(selectedConfig.id);
      if (!Array.isArray(leaderboardEntries)) {
        return message.reply('Unexpected data format from the leaderboard API.');
      }

      // Sort entries by Rank (ascending).
      leaderboardEntries.sort((a, b) => a.Rank - b.Rank);

      // Retrieve registered users from the database.
      const users = await User.find({});
      const registeredUserSet = new Set(users.map(u => u.raUsername.toLowerCase()));

      // Mark each entry if the user is registered.
      leaderboardEntries = leaderboardEntries.map(entry => {
        const isRegistered = registeredUserSet.has(entry.Username.toLowerCase());
        return { ...entry, Registered: isRegistered };
      });

      // Build the output text.
      let output = `**${selectedConfig.name}**\n`;
      output += `**Game ID:** ${selectedConfig.id}\n\n`;
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
