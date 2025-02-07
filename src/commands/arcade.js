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
 * @param {string|number} gameId - The game ID to look up.
 * @returns {Promise<Array>} - Returns an array of leaderboard entries.
 */
async function fetchLeaderboardEntries(gameId) {
  const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
  const data = await raAPI.getLeaderboardEntries(gameId);
  console.log('API response data:', data); // Debug logging

  // Check if the API returned an array.
  if (!Array.isArray(data)) {
    if (data && data.message) {
      throw new Error(`API error: ${data.message}`);
    } else {
      throw new Error('Unexpected data format from the leaderboard API.');
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
