// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const User = require('../models/User');

// Define your known arcade leaderboards here.
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
  }
];

/**
 * Fetch leaderboard entries for a given game ID using RetroAchievements API.
 * The API call is authenticated using your RA_USERNAME and RA_API_KEY from environment variables.
 * @param {number|string} gameId - The game ID to fetch.
 * @returns {Promise<Array>} - Returns an array of leaderboard entries.
 */
async function fetchLeaderboardEntries(gameId) {
  const raUsername = process.env.RA_USERNAME;
  const raAPIKey = process.env.RA_API_KEY;
  const url = `https://retroachievements.org/API/API_GetLeaderboardEntries.php?i=${gameId}&z=${raUsername}&y=${raAPIKey}`;
  const response = await axios.get(url);
  return response.data;
}

/**
 * Formats a single leaderboard entry.
 * Adds crown emoji for 1st, second medal for 2nd, and third medal for 3rd.
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
      } else {
        // Parse the provided selection.
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
        // Sort by rank ascending.
        leaderboardEntries.sort((a, b) => a.Rank - b.Rank);

        // Get your registered users from the database.
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
          // Bold the line if the user is registered.
          if (entry.Registered) {
            output += `**${line}**\n`;
          } else {
            output += `${line}\n`;
          }
        }
        if (displayEntries.length === 0) {
          output += 'No leaderboard entries found.';
        }

        const embed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('Arcade Highscores')
          .setDescription(output)
          .setFooter({ text: 'Data provided by RetroAchievements.org' });

        return message.channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Arcade command error:', error);
      return message.reply('Error fetching arcade leaderboard.');
    }
  }
};
