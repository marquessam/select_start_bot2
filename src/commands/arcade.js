// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');
const User = require('../models/User');

// Arcade configuration: each entry defines a known leaderboard.
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
 * Fetches leaderboard entries for a given game using the RetroAchievementsAPI service.
 * Uses your RA credentials and logs the raw API response for debugging.
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
    
    // Log the raw response data for debugging
    console.log('Raw API response:', JSON.stringify(response.data, null, 2));

    let data = response.data;

    // If the API returns an array, we're done.
    if (Array.isArray(data)) {
      return data;
    }

    // Otherwise, try to see if the data is nested in a property.
    if (data && typeof data === 'object') {
      // Check common properties that might hold the leaderboard.
      if (Array.isArray(data.leaderboard)) {
        return data.leaderboard;
      } else if (Array.isArray(data.entries)) {
        return data.entries;
      } else if (Array.isArray(data.Result)) {
        return data.Result;
      } else if (data.message) {
        throw new Error(`API error: ${data.message}`);
      } else {
        throw new Error('Unexpected data format from the leaderboard API.');
      }
    }

    // If the data is a string, try parsing it.
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
        if (Array.isArray(data)) {
          return data;
        } else {
          throw new Error('Unexpected data format after parsing string response.');
        }
      } catch (e) {
        throw new Error('Failed to parse API response as JSON.');
      }
    }

    throw new Error('Unexpected data format from the leaderboard API.');
  } catch (error) {
    console.error('Error fetching leaderboard entries:', error.response?.data || error.message);
    throw error;
  }
}
  return data;
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
