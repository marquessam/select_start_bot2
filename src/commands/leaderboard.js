// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const leaderboardService = require('../services/leaderboardService');

/**
 * Generates a table using Unicode box-drawing characters.
 * Safely handles undefined or null cell values.
 * @param {string[]} headers - Array of header titles.
 * @param {Array<Array<string|number>>} rows - Array of rows (each row is an array of cell values).
 * @returns {string} - The formatted table.
 */
function generateTable(headers, rows) {
  // Calculate maximum width for each column.
  const colWidths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map(row => ((row[i] == null) ? '' : row[i]).toString().length))
  );

  const horizontalLine = (left, mid, right) => {
    let line = left;
    colWidths.forEach((width, index) => {
      line += "─".repeat(width + 2) + (index < colWidths.length - 1 ? mid : right);
    });
    return line;
  };

  const topBorder = horizontalLine("┌", "┬", "┐");
  const headerSeparator = horizontalLine("├", "┼", "┤");
  const bottomBorder = horizontalLine("└", "┴", "┘");

  const formatRow = (row) => {
    let rowStr = "│";
    row.forEach((cell, index) => {
      cell = (cell == null) ? "" : cell;
      rowStr += " " + cell.toString().padEnd(colWidths[index]) + " │";
    });
    return rowStr;
  };

  const headerRow = formatRow(headers);
  const rowLines = rows.map(formatRow);

  return [topBorder, headerRow, headerSeparator, ...rowLines, bottomBorder].join("\n");
}

/**
 * Wraps text in a code block and truncates it if it exceeds Discord's 1024-character limit.
 * @param {string} text - The text to wrap.
 * @param {number} maxLength - Maximum allowed length (default 1024).
 * @returns {string} - The wrapped (and possibly truncated) text.
 */
function wrapInCodeBlockTruncate(text, maxLength = 1024) {
  const codeBlockWrapperLength = 6; // "```" at beginning and end.
  let codeText = "```" + text + "```";
  if (codeText.length > maxLength) {
    const allowedTextLength = maxLength - codeBlockWrapperLength - 3; // leave room for ellipsis
    text = text.slice(0, allowedTextLength) + "...";
    codeText = "```" + text + "```";
  }
  return codeText;
}

/**
 * Displays the monthly leaderboard using the leaderboard service.
 * @returns {Promise<EmbedBuilder>}
 */
async function displayMonthlyLeaderboard() {
  const monthlyData = await leaderboardService.getCurrentMonthlyProgress();
  const gameTitle = monthlyData.game;
  const entries = monthlyData.leaderboard;

  // Compute ranks with ties.
  let currentRank = 0;
  let previousAchievements = null;
  const tableRows = entries.map((entry, index) => {
    if (previousAchievements === null || entry.achievements < previousAchievements) {
      currentRank = index + 1;
      previousAchievements = entry.achievements;
    }
    return [
      currentRank,
      entry.username,
      entry.achievements,
      entry.totalAchievements,
      entry.percentage + "%"
    ];
  });

  const headers = ["Rank", "Player", "Ach.", "Total", "%"];
  const table = generateTable(headers, tableRows);

  const embed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle(`Monthly Challenge: ${gameTitle}`)
    .addFields({
      name: "Top Rankings",
      value: wrapInCodeBlockTruncate(table)
    });
  return embed;
}

/**
 * Displays the yearly leaderboard using the leaderboard service.
 * @returns {Promise<EmbedBuilder>}
 */
async function displayYearlyLeaderboard() {
  const entries = await leaderboardService.getYearlyPoints();

  // Compute ranks with ties.
  let currentRank = 0;
  let previousPoints = null;
  const tableRows = entries.map((entry, index) => {
    if (previousPoints === null || entry.totalPoints < previousPoints) {
      currentRank = index + 1;
      previousPoints = entry.totalPoints;
    }
    return [
      currentRank,
      entry.username,
      entry.totalPoints,
      entry.monthlyGames,
      entry.shadowGames
    ];
  });

  const headers = ["Rank", "Player", "Points", "Monthly", "Shadow"];
  const table = generateTable(headers, tableRows);

  const embed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle("Yearly Rankings")
    .addFields({
      name: "Rankings",
      value: wrapInCodeBlockTruncate(table)
    });
  return embed;
}

module.exports = {
  name: "leaderboard",
  description: "Shows the leaderboard",
  async execute(message, args) {
    try {
      const type = args[0]?.toLowerCase() || "month";
      let embed;
      if (type === "month" || type === "m") {
        embed = await displayMonthlyLeaderboard();
      } else if (type === "year" || type === "y") {
        embed = await displayYearlyLeaderboard();
      } else {
        return message.reply("Invalid command. Use `!leaderboard month/m` or `!leaderboard year/y`");
      }
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error("Leaderboard error:", error);
      await message.reply("Error retrieving leaderboard data.");
    }
  }
};
