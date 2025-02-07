// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');
const User = require('../models/User');

// Arcade configuration: each entry defines a known leaderboard
const arcadeConfigs = [
  {
    leaderboardId: 1143,
    gameId: 533,
    name: "Mario Kart: Super Circuit (GBA) - Mario Circuit",
  },
  {
    leaderboardId: 18937,
    gameId: 146,
    name: "Tony Hawk's Pro Skater (PSX) - Warehouse, Woodland Hills",
  },
  {
    leaderboardId: 24,
    gameId: 7,
    name: "Tetris (GB) - A-Type Challenge",
  }
];

/**
 * Normalizes and processes leaderboard entries.
 * This version adds debugging logs to trace the parsing steps.
 */
async function fetchLeaderboardEntries(leaderboardId) {
  const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
  try {
    console.log(`Fetching leaderboard data for leaderboard ID: ${leaderboardId}`);
    const data = await raAPI.getLeaderboardInfo(leaderboardId);
    console.log('Raw leaderboard response:', data);
    
    if (!data) {
      console.log('No leaderboard data received');
      return [];
    }
    
    // Determine the format of the data.
    let entries = [];
    if (Array.isArray(data)) {
      entries = data;
      console.log('Data is an array, length:', entries.length);
    } else if (data.Entries && Array.isArray(data.Entries)) {
      entries = data.Entries;
      console.log('Data has Entries key, length:', entries.length);
    } else if (typeof data === 'object') {
      entries = Object.values(data);
      console.log('Data is an object converted to array, length:', entries.length);
    } else {
      console.log('Unexpected data format:', typeof data);
    }

    // Log each raw entry before processing.
    console.log('Raw entries:', entries);

    // Process and sanitize each entry.
    const validEntries = entries
      .filter(entry => {
        const hasUser = Boolean(entry && (entry.User || entry.user));
        const hasScore = Boolean(entry && (entry.Score || entry.score));
        if (!hasUser || !hasScore) {
          console.log('Filtered out entry due to missing User/Score:', entry);
        }
        return hasUser && hasScore;
      })
      .map(entry => {
        const rawUser = entry.User || entry.user || '';
        const rankValue = entry.Rank || entry.rank || '0';
        const scoreValue = entry.Score || entry.score || '0';
        // Log conversion details for debugging.
        console.log('Mapping entry:', { rawUser, rankValue, scoreValue });
        return {
          Rank: parseInt(rankValue, 10),
          User: rawUser.trim(),
          Score: parseInt(scoreValue, 10),
          DateSubmitted: entry.DateSubmitted || entry.dateSubmitted || null,
        };
      })
      .filter(entry => {
        const valid = !isNaN(entry.Rank) && !isNaN(entry.Score) && entry.User.length > 0;
        if (!valid) {
          console.log('Filtered out entry after mapping (invalid values):', entry);
        }
        return valid;
      });

    // Sort by rank.
    validEntries.sort((a, b) => a.Rank - b.Rank);
    console.log(`Processed ${validEntries.length} valid leaderboard entries:`, validEntries.map(e => e.User));
    return validEntries;
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    throw error;
  }
}

function formatEntry(entry) {
  let rankEmoji = '';
  if (entry.Rank === 1) {
    rankEmoji = '👑';
  } else if (entry.Rank === 2) {
    rankEmoji = '🥈';
  } else if (entry.Rank === 3) {
    rankEmoji = '🥉';
  }
  const score = Number(entry.Score).toLocaleString();
  return `${rankEmoji} Rank #${entry.Rank} - ${entry.User}: ${score}`;
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
      const selection = parseInt(args[0], 10);
      if (isNaN(selection) || selection < 1 || selection > arcadeConfigs.length) {
        return message.reply(`Invalid selection. Please choose a number between 1 and ${arcadeConfigs.length}.`);
      }

      const selectedConfig = arcadeConfigs[selection - 1];
      const loadingMessage = await message.channel.send('Fetching leaderboard data...');

      // Retrieve and normalize leaderboard entries.
      let leaderboardEntries = await fetchLeaderboardEntries(selectedConfig.leaderboardId);

      // Retrieve registered users from the database.
      const users = await User.find({});
      const registeredUsers = users.map(u => u.raUsername.trim());
      console.log('Registered Users from DB:', registeredUsers);
      const registeredUserSet = new Set(registeredUsers.map(u => u.toLowerCase()));

      console.log('Leaderboard entries before filtering:', leaderboardEntries.map(e => e.User));
      // Filter to only include entries that have a matching registered user.
      leaderboardEntries = leaderboardEntries.filter(entry => {
        return entry.User && registeredUserSet.has(entry.User.toLowerCase());
      });
      console.log('Leaderboard entries after filtering:', leaderboardEntries.map(e => e.User));

      let output = `**${selectedConfig.name}**\n\n`;
      output += '**User Highscores:**\n\n';

      if (leaderboardEntries.length > 0) {
        const displayEntries = leaderboardEntries.slice(0, 15);
        for (const entry of displayEntries) {
          output += formatEntry(entry) + '\n';
        }
      } else {
        output += 'No leaderboard entries found for your users.';
      }

      // Fetch game info for thumbnail using the actual game ID.
      const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
      const gameInfo = await raAPI.getGameInfo(selectedConfig.gameId);

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Arcade Highscores')
        .setDescription(output)
        .setFooter({ text: 'Data provided by RetroAchievements.org' });

      if (gameInfo?.ImageIcon) {
        embed.setThumbnail(`https://retroachievements.org${gameInfo.ImageIcon}`);
      }

      await loadingMessage.delete();
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Arcade command error:', error);
      await message.reply('Error fetching arcade leaderboard. The game or leaderboard might not be available.');
    }
  }
};