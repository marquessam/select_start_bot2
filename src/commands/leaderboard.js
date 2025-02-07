// File: leaderboard.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');

const MEDAL_EMOJIS = {
  1: '👑',
  2: '🥈',
  3: '🥉'
};

/**
 * Formats a leaderboard entry.
 * For monthly board, the entry will include the completion percentage.
 * For yearly board, only the rank, username, and score will be displayed.
 *
 * @param {Object} entry - Leaderboard entry containing Rank, User, Score, and optionally CompletionPercentage.
 * @param {boolean} isMonthly - True if formatting for the monthly board.
 * @returns {string} Formatted leaderboard entry string.
 */
function formatEntry(entry, isMonthly) {
  const medal = MEDAL_EMOJIS[entry.Rank] || '';
  const baseLine = `${medal} Rank #${entry.Rank} - ${entry.User}: ${Number(entry.Score).toLocaleString()}`;
  if (isMonthly && typeof entry.CompletionPercentage === 'number') {
    return `${baseLine} (${entry.CompletionPercentage.toFixed(2)}%)`;
  }
  return baseLine;
}

/**
 * Processes raw leaderboard data into a normalized array of entries.
 * Expects the raw data to be either an array of entries or an object with a Results property.
 *
 * Each entry should have at least:
 *    Rank (number)
 *    User (string)
 *    Score (number)
 * And optionally:
 *    CompletionPercentage (number) - for monthly board.
 *
 * @param {any} rawData - Raw leaderboard data from the API.
 * @returns {Array} Normalized leaderboard entries.
 */
function processLeaderboardData(rawData) {
  let entries = [];
  if (!rawData) return entries;
  
  // The monthly board endpoint may return data in a "Results" array with nested "UserEntry"
  if (rawData.Results && Array.isArray(rawData.Results)) {
    entries = rawData.Results.map(result => result.UserEntry);
  } 
  // Some endpoints return an "Entries" property
  else if (rawData.Entries && Array.isArray(rawData.Entries)) {
    entries = rawData.Entries;
  } 
  // Otherwise, if rawData is already an array
  else if (Array.isArray(rawData)) {
    entries = rawData;
  } else if (typeof rawData === 'object') {
    entries = Object.values(rawData);
  }
  
  // Normalize each entry
  const normalizedEntries = entries
    .filter(entry => entry && (entry.User || entry.user) && (entry.Score || entry.score))
    .map(entry => {
      const rawUser = entry.User || entry.user || '';
      const rankValue = entry.Rank || entry.rank || '0';
      const scoreValue = entry.Score || entry.score || '0';
      
      // Optionally include CompletionPercentage if available
      const completion = (typeof entry.CompletionPercentage === 'number')
          ? entry.CompletionPercentage
          : (typeof entry.Completion === 'number' ? entry.Completion : null);
      
      return {
        Rank: parseInt(rankValue, 10),
        User: rawUser.trim(),
        Score: parseInt(scoreValue, 10),
        CompletionPercentage: completion,
      };
    })
    .filter(entry => !isNaN(entry.Rank) && !isNaN(entry.Score) && entry.User.length > 0);
  
  // Sort by rank (ascending order)
  normalizedEntries.sort((a, b) => a.Rank - b.Rank);
  return normalizedEntries;
}

/**
 * Leaderboard Command:
 * This command displays either a monthly or yearly leaderboard.
 *
 * Usage:
 *   !leaderboard monthly
 *   !leaderboard yearly
 *
 * For the monthly leaderboard, each user’s completion percentage is shown.
 * For both boards, the top three entries are displayed with medal emojis.
 */
module.exports = {
  name: 'leaderboard',
  description: 'Displays the monthly or yearly leaderboard with mobile-friendly formatting.',
  async execute(message, args) {
    try {
      // Validate command arguments.
      // Expect either "monthly" or "yearly" as the first argument.
      if (!args[0] || !['monthly', 'yearly'].includes(args[0].toLowerCase())) {
        return message.reply('Please specify which leaderboard to show: `monthly` or `yearly`.');
      }
      
      const boardType = args[0].toLowerCase();
      const isMonthly = boardType === 'monthly';

      // Display a loading message while fetching data
      const loadingMessage = await message.channel.send('Fetching leaderboard data...');
      
      const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
      let rawData;
      
      // For demonstration, we assume:
      // Monthly board uses getUserGameLeaderboards endpoint,
      // and yearly board uses API_GetLeaderboardEntries endpoint.
      // Adjust the gameId and user parameters as needed.
      if (isMonthly) {
        // For the monthly board, we assume a specific game ID and current user.
        // The API returns only the leaderboards where the user has participated.
        rawData = await raAPI.getUserGameLeaderboards(533, process.env.RA_USERNAME);
      } else {
        // For the yearly board, we retrieve the general leaderboard using the leaderboard ID.
        // Here we use a placeholder leaderboard ID, adjust accordingly.
        rawData = await raAPI.getLeaderboardInfo(1143);
      }
      
      const entries = processLeaderboardData(rawData);
      
      // Build the leaderboard output message with mobile-friendly formatting.
      let output = `**${boardType.charAt(0).toUpperCase() + boardType.slice(1)} Leaderboard**\n\n`;
      if (entries.length > 0) {
        // Limit to top 15 entries for mobile readability
        const displayEntries = entries.slice(0, 15);
        displayEntries.forEach(entry => {
          output += formatEntry(entry, isMonthly) + '\n';
        });
      } else {
        output += 'No leaderboard entries available.';
      }
      
      // Build the embed message
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${boardType.charAt(0).toUpperCase() + boardType.slice(1)} Leaderboard`)
        .setDescription(output)
        .setFooter({ text: 'Data provided by RetroAchievements.org' });
      
      // Delete the loading message and send the embed
      await loadingMessage.delete();
      return message.channel.send({ embeds: [embed] });
      
    } catch (error) {
      console.error('Leaderboard command error:', error);
      await message.reply('Error fetching leaderboard data.');
    }
  },
};