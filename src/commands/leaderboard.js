// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');

function calculatePoints(awards) {
  let points = 0;
  if (awards.participation) points += 1;
  if (awards.beaten) points += 3;
  if (awards.mastered) points += 3;
  return points;
}

function padString(str, length) {
  return str.toString().slice(0, length).padEnd(length);
}

/**
 * Generates a table using Unicode box-drawing characters.
 * @param {string[]} headers - An array of header titles.
 * @param {Array<Array<string|number>>} rows - An array of rows, where each row is an array of cell values.
 * @returns {string} - The formatted table as a string.
 */
function generateTable(headers, rows) {
  const colWidths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map(row => row[i].toString().length))
  );

  const horizontalLine = (left, mid, right) => {
    let line = left;
    colWidths.forEach((width, index) => {
      line += '─'.repeat(width + 2) + (index < colWidths.length - 1 ? mid : right);
    });
    return line;
  };

  const topBorder = horizontalLine('┌', '┬', '┐');
  const headerSeparator = horizontalLine('├', '┼', '┤');
  const bottomBorder = horizontalLine('└', '┴', '┘');

  const formatRow = (row) => {
    let rowStr = '│';
    row.forEach((cell, index) => {
      rowStr += ' ' + cell.toString().padEnd(colWidths[index]) + ' │';
    });
    return rowStr;
  };

  const headerRow = formatRow(headers);
  const rowLines = rows.map(formatRow);

  return [topBorder, headerRow, headerSeparator, ...rowLines, bottomBorder].join('\n');
}

/**
 * Wraps text in a code block and truncates it if it exceeds Discord's 1024-character limit.
 * @param {string} text - The text to wrap.
 * @param {number} maxLength - Maximum allowed length (default 1024).
 * @returns {string} - The wrapped (and possibly truncated) text.
 */
function wrapInCodeBlockTruncate(text, maxLength = 1024) {
  // "```" at the beginning and end take 6 characters total.
  const codeBlockWrapperLength = 6;
  let codeText = '```' + text + '```';
  if (codeText.length > maxLength) {
    // Allowed text length = maxLength minus wrapper length and space for ellipsis (3 characters).
    const allowedTextLength = maxLength - codeBlockWrapperLength - 3;
    text = text.slice(0, allowedTextLength) + '...';
    codeText = '```' + text + '```';
  }
  return codeText;
}

/**
 * Displays the monthly leaderboard in an embed.
 */
async function displayMonthlyLeaderboard() {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const monthlyGame = await Game.findOne({
    month: currentMonth,
    year: currentYear,
    type: 'MONTHLY'
  });

  if (!monthlyGame) {
    throw new Error('No monthly game found for current month.');
  }

  // Get all awards for this game with progress > 0
  const awards = await Award.find({
    gameId: monthlyGame.gameId,
    month: currentMonth,
    year: currentYear,
    achievementCount: { $gt: 0 }
  });

  // Group by canonical username
  const uniqueAwards = {};
  for (const award of awards) {
    const user = await User.findOne({
      raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
    });
    if (user) {
      const canonicalUsername = user.raUsername;
      if (!uniqueAwards[canonicalUsername] || 
          award.achievementCount > uniqueAwards[canonicalUsername].achievementCount) {
        award.raUsername = canonicalUsername;
        uniqueAwards[canonicalUsername] = award;
      }
    }
  }

  // Sort by achievement count (descending)
  const sortedAwards = Object.values(uniqueAwards)
    .sort((a, b) => b.achievementCount - a.achievementCount);

  // Handle ties and assign ranks
  let currentRank = 1;
  let currentScore = -1;
  let increment = 0;
  sortedAwards.forEach(award => {
    if (award.achievementCount !== currentScore) {
      currentRank += increment;
      increment = 1;
      currentScore = award.achievementCount;
      award.rank = currentRank;
    } else {
      award.rank = currentRank;
      increment++;
    }
  });

  // Split into top ten and others
  const topTen = sortedAwards.slice(0, 10);
  const others = sortedAwards.slice(10);

  // Build the table for the top ten rankings
  const monthlyHeaders = ['Rank', 'Player', 'Progress', 'Award'];
  const topTenRows = topTen.map(award => {
    const progress = `${award.achievementCount}/${award.totalAchievements}`;
    let awardIcon = '';
    if (award.awards.mastered) awardIcon = '✨';
    else if (award.awards.beaten) awardIcon = '⭐';
    else if (award.awards.participation) awardIcon = '🏁';
    return [award.rank, award.raUsername, progress, awardIcon];
  });
  const topTenTable = generateTable(monthlyHeaders, topTenRows);

  // Build the table for "Also Participating"
  let othersTable = '';
  if (others.length > 0) {
    const otherHeaders = ['Player', 'Progress'];
    const othersRows = others.map(award => {
      const progress = `${award.achievementCount}/${award.totalAchievements}`;
      return [award.raUsername, progress];
    });
    othersTable = generateTable(otherHeaders, othersRows);
  }

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Monthly Challenge:')
    .setDescription(`**${monthlyGame.title}**`)
    .setThumbnail('https://media.retroachievements.org/Images/022504.png');

  embed.addFields({ 
    name: 'Top Rankings', 
    value: wrapInCodeBlockTruncate(topTenTable)
  });

  if (othersTable) {
    embed.addFields({ 
      name: 'Also Participating', 
      value: wrapInCodeBlockTruncate(othersTable)
    });
  }

  return embed;
}

/**
 * Displays the yearly leaderboard in an embed.
 */
async function displayYearlyLeaderboard() {
  const currentYear = new Date().getFullYear();
  const awards = await Award.find({ year: currentYear });

  const userPoints = {};

  // Group by canonical username (case-insensitive)
  for (const award of awards) {
    const user = await User.findOne({
      raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
    });
    if (user) {
      const canonicalUsername = user.raUsername;
      if (!userPoints[canonicalUsername]) {
        userPoints[canonicalUsername] = {
          username: canonicalUsername,
          totalPoints: 0,
          participations: 0,
          beaten: 0,
          mastered: 0,
          processedGames: new Set()
        };
      }
      const gameKey = `${award.gameId}-${award.month}`;
      if (!userPoints[canonicalUsername].processedGames.has(gameKey)) {
        const points = calculatePoints(award.awards);
        if (points > 0) {
          userPoints[canonicalUsername].totalPoints += points;
          if (award.awards.participation) userPoints[canonicalUsername].participations++;
          if (award.awards.beaten) userPoints[canonicalUsername].beaten++;
          if (award.awards.mastered) userPoints[canonicalUsername].mastered++;
          userPoints[canonicalUsername].processedGames.add(gameKey);
        }
      }
    }
  }

  // Convert to array, filter, and sort by total points (descending)
  const leaderboard = Object.values(userPoints)
    .filter(user => user.totalPoints > 0)
    .map(({ processedGames, ...user }) => user)
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Handle ties and assign ranks
  let currentRank = 1;
  let currentPoints = -1;
  let increment = 0;
  leaderboard.forEach(user => {
    if (user.totalPoints !== currentPoints) {
      currentRank += increment;
      increment = 1;
      currentPoints = user.totalPoints;
      user.rank = currentRank;
    } else {
      user.rank = currentRank;
      increment++;
    }
  });

  // Build the table for the yearly leaderboard.
  const yearlyHeaders = ['Rank', 'Player', 'Pts', 'P', 'B', 'M'];
  // Option: use all entries (with truncation if needed)...
  const leaderboardRows = leaderboard.map(user => [
    user.rank,
    user.username,
    user.totalPoints,
    user.participations,
    user.beaten,
    user.mastered
  ]);
  const leaderboardTable = generateTable(yearlyHeaders, leaderboardRows);

  // Wrap in code block (and truncate if necessary)
  const leaderboardTableWithCode = wrapInCodeBlockTruncate(leaderboardTable);

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('2025 Yearly Rankings')
    .addFields({ name: 'Rankings', value: leaderboardTableWithCode });

  return embed;
}

module.exports = {
  name: 'leaderboard',
  description: 'Shows the leaderboard',
  async execute(message, args) {
    try {
      const type = args[0]?.toLowerCase() || 'month';
      let embed;

      if (type === 'month' || type === 'm') {
        embed = await displayMonthlyLeaderboard();
      } else if (type === 'year' || type === 'y') {
        embed = await displayYearlyLeaderboard();
      } else {
        return message.reply('Invalid command. Use `!leaderboard month/m` or `!leaderboard year/y`');
      }

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Leaderboard error:', error);
      await message.reply('Error getting leaderboard data.');
    }
  }
};
