const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');
const UsernameUtils = require('../utils/usernameUtils');
const leaderboardService = require('../services/leaderboardService');

// Helper to get time remaining until the end of the month
function getTimeRemaining() {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const diff = endDate - now;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `${days}d ${hours}h ${minutes}m`;
}

/**
 * Create a compact box with title
 */
function createCompactBox(title, content) {
  return [
    `─${title}─`,
    content,
    '─'.repeat(Math.max(...content.split('\n').map(line => line.length)) + 2)
  ].join('\n');
}

/**
 * Format game title with colored words
 */
function getColoredGameTitle(title) {
  const joiners = /\b(to|the|and|or|of|in|on|at|by|for|with)\b/gi;
  return title.split(joiners).map(part => {
    part = part.trim();
    if (!part) return '';
    if (joiners.test(part.toLowerCase())) {
      return part; // Keep joiner words white
    }
    return `[${part}]`; // Color other words
  }).join(' ');
}

/**
 * Format leaderboard entries with consistent spacing
 */
function formatLeaderboardEntries(entries, showProgress = false) {
  // Find the longest username for padding
  const maxUsernameLength = Math.max(...entries.map(e => e.username.length));
  
  return entries.map((entry, index) => {
    const position = (index + 1).toString().padStart(2, ' ');
    const username = entry.username.padEnd(maxUsernameLength, ' ');
    if (showProgress) {
      return `${position}. ${username} - ${entry.progress} (${entry.percentage}%)`;
    } else {
      const points = entry.points.toString().padStart(2, ' ');
      return `${position}. ${username} - ${points} point${entry.points !== 1 ? 's' : ''}`;
    }
  }).join('\n');
}

module.exports = {
  name: 'leaderboard',
  description: 'Displays monthly or yearly leaderboards using cached database data',
  async execute(message, args) {
    try {
      // Initialize API and username utilities for additional calls (like game info)
      const raAPI = new RetroAchievementsAPI(
        process.env.RA_USERNAME,
        process.env.RA_API_KEY
      );
      const usernameUtils = new UsernameUtils(raAPI);

      // Show menu if no arguments provided.
      if (!args[0]) {
        const menuEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('Leaderboard Menu')
          .setDescription(
            'Use `!leaderboard month` to view the monthly leaderboard\n' +
            'Use `!leaderboard year` to view the yearly leaderboard'
          )
          .setTimestamp();
        return message.channel.send({ embeds: [menuEmbed] });
      }

      const subcommand = args[0].toLowerCase();

      if (subcommand === 'month' || subcommand === 'm') {
        // Retrieve cached monthly leaderboard from the database.
        const monthlyData = await leaderboardService.getMonthlyLeaderboardCache();
        if (!monthlyData) {
          return message.channel.send('Monthly leaderboard data is not available at the moment.');
        }
        
        let headerDetails = '';
        let gameInfo = null;
        
        // If an active monthly game exists, fetch additional game info.
        if (monthlyData.game && monthlyData.game !== 'No Monthly Game') {
          gameInfo = await raAPI.getGameInfo(monthlyData.game.gameId);
          const gameTitle = getColoredGameTitle(gameInfo.GameTitle);
          headerDetails = createCompactBox('Game Information',
            `[${gameTitle}]\n` +
            `Console: ${gameInfo.Console}\n` +
            `Genre: ${gameInfo.Genre}\n` +
            `Developer: ${gameInfo.Developer || 'N/A'}\n` +
            `Publisher: ${gameInfo.Publisher}\n` +
            `Release Date: ${gameInfo.Released}\n` +
            `Total Achievements: ${monthlyData.game.numAchievements || 'N/A'}\n\n` +
            `Time Remaining: ${getTimeRemaining()}`
          );
        }
        
        // Build the leaderboard text from cached data.
        const entries = monthlyData.leaderboard.map(entry => ({
          username: entry.username,
          progress: entry.progress,
          percentage: entry.percentage
        }));
        const leaderboardText = formatLeaderboardEntries(entries, true);

        const embed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('Monthly Leaderboard')
          .setTimestamp();
        
        if (gameInfo && gameInfo.ImageIcon) {
          embed.setThumbnail(`https://retroachievements.org${gameInfo.ImageIcon}`);
        }
        
        if (headerDetails) {
          embed.setDescription('```ml\n' + headerDetails + '\n```');
        }
        
        if (leaderboardText) {
          embed.addFields({
            name: '📊 Rankings',
            value: '```ml\n' + leaderboardText + '\n```'
          });
        } else {
          embed.addFields({
            name: '📊 Rankings',
            value: '```ml\nNo entries yet\n```'
          });
        }
        await message.channel.send({ embeds: [embed] });
      } else if (subcommand === 'year' || subcommand === 'y') {
        // Retrieve cached yearly leaderboard from the database.
        const yearlyData = await leaderboardService.getYearlyLeaderboardCache();
        if (!yearlyData) {
          return message.channel.send('Yearly leaderboard data is not available at the moment.');
        }
        
        const leaderboardText = formatLeaderboardEntries(yearlyData);
        const yearlyInfo = createCompactBox('2025 Total Points',
          `Active Players: ${yearlyData.length}\n` +
          `Total Points: ${yearlyData.reduce((sum, entry) => sum + entry.points, 0)}`
        );
        
        const embed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('Yearly Leaderboard')
          .setDescription('```ml\n' + yearlyInfo + '\n```')
          .setTimestamp();
          
        if (leaderboardText) {
          embed.addFields({
            name: '🏆 Rankings',
            value: '```ml\n' + leaderboardText + '\n```'
          });
        } else {
          embed.addFields({
            name: '🏆 Rankings',
            value: '```ml\nNo entries yet\n```'
          });
        }
        await message.channel.send({ embeds: [embed] });
      } else {
        await message.reply('Please specify either "month" or "year" (e.g., !leaderboard month)');
      }
    } catch (error) {
      console.error('Leaderboard Command Error:', error);
      await message.reply('Error displaying leaderboard.');
    }
  }
};
