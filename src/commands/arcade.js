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
 * Converts a number to an ordinal string (1 -> "1st", 2 -> "2nd", etc.).
 * @param {number} i 
 * @returns {string}
 */
function ordinalSuffixOf(i) {
  let j = i % 10,
      k = i % 100;
  if (j === 1 && k !== 11) {
    return i + "st";
  }
  if (j === 2 && k !== 12) {
    return i + "nd";
  }
  if (j === 3 && k !== 13) {
    return i + "rd";
  }
  return i + "th";
}

/**
 * Formats a Date string into "DD MMM YYYY, HH:mm" format.
 * @param {string} dateStr 
 * @returns {string}
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  // Options for formatting (adjust as needed)
  const options = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC' // Adjust if needed
  };
  return date.toLocaleString('en-GB', options).replace(',', '');
}

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
 * Formats a leaderboard entry line as:
 * "<ordinal> <Username>: <FormattedScore>\t<FormattedDate>"
 * Example: "1st ShminalShmantasy: 1:02.91   05 Feb 2025, 13:13"
 * @param {object} entry 
 * @returns {string}
 */
function formatEntry(entry) {
  const ordinal = ordinalSuffixOf(entry.Rank);
  const score = entry.FormattedScore || entry.Score; // Use FormattedScore if available.
  const date = formatDate(entry.DateSubmitted);
  return `${ordinal} ${entry.User}: ${score}\t${date}`;
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

      // Filter entries to only include those from registered users.
      leaderboardEntries = leaderboardEntries.filter(entry => {
        return registeredUserSet.has(entry.User.toLowerCase());
      });

      // Sort entries by Rank (ascending).
      leaderboardEntries.sort((a, b) => a.Rank - b.Rank);

      // Build the output text.
      let output = `**${selectedConfig.name}**\n`;
      output += `**Game ID:** ${selectedConfig.id}\n\n`;
      output += '**User Highscores:**\n\n';

      // Display each entry (for up to the top 15, if desired).
      const displayEntries = leaderboardEntries.slice(0, 15);
      for (const entry of displayEntries) {
        output += formatEntry(entry) + '\n';
      }
      if (displayEntries.length === 0) {
        output += 'No leaderboard entries found for your users.';
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
