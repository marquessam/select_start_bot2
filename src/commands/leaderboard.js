// File: src/commands/leaderboard.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

/**
 * Pads a string to a fixed length.
 * @param {string|number} str 
 * @param {number} length 
 * @returns {string}
 */
function padString(str, length) {
  return str.toString().slice(0, length).padEnd(length);
}

/**
 * Formats the monthly leaderboard output to mimic the old display.
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

  // Retrieve all awards for the current game that have progress.
  const awards = await Award.find({
    gameId: monthlyGame.gameId,
    month: currentMonth,
    year: currentYear,
    achievementCount: { $gt: 0 }
  });

  // Group awards by canonical username.
  const uniqueAwards = {};
  for (const award of awards) {
    const user = await User.findOne({
      raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
    });
    if (user) {
      const canonicalUsername = user.raUsername;
      if (!uniqueAwards[canonicalUsername] || award.achievementCount > uniqueAwards[canonicalUsername].achievementCount) {
        award.raUsername = canonicalUsername;
        uniqueAwards[canonicalUsername] = award;
      }
    }
  }

  // Sort awards descending by achievement count.
  const sortedAwards = Object.values(uniqueAwards).sort((a, b) => b.achievementCount - a.achievementCount);

  // Handle ties and assign rank numbers.
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

  // Split into top performers and others.
  const topPerformers = sortedAwards.slice(0, 3); // show top 3 as "CURRENT CHALLENGE"
  const additional = sortedAwards.slice(3);

  // Build the header for the current challenge.
  const headerText =
    `CURRENT CHALLENGE\n` +
    `GAME: ${monthlyGame.title}\n` +
    `TOTAL ACHIEVEMENTS: ${monthlyGame.numAchievements}\n\n`;

  // Build current challenge text.
  let currentText = '';
  topPerformers.forEach(award => {
    currentText += `RANK #${award.rank} - ${award.raUsername}\n`;
    currentText += `ACHIEVEMENTS: ${award.achievementCount}/${award.totalAchievements}\n`;
    // Calculate progress percentage.
    const progressPercent = ((award.achievementCount / award.totalAchievements) * 100).toFixed(2);
    currentText += `PROGRESS: ${progressPercent}%\n\n`;
  });

  // Build additional participants text.
  let additionalText = '';
  if (additional.length > 0) {
    additionalText += `ADDITIONAL PARTICIPANTS\n`;
    additional.forEach(award => {
      const progressPercent = ((award.achievementCount / award.totalAchievements) * 100).toFixed(2);
      additionalText += `RANK #${award.rank} - ${award.raUsername} (${progressPercent}%)\n`;
    });
  }

  // Combine all text sections.
  const fullText = headerText + "```" + currentText + "```" + (additionalText ? "\n```" + additionalText + "```" : "");

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Monthly Challenge Rankings')
    .setDescription(fullText);

  return embed;
}

/**
 * Formats the yearly leaderboard in a plain text table.
 */
async function displayYearlyLeaderboard() {
  const currentYear = new Date().getFullYear();
  const awards = await Award.find({ year: currentYear });

  const userPoints = {};

  // Group awards by canonical username.
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
        const points = AwardFunctions.getPoints(award.award);
        if (points > 0) {
          userPoints[canonicalUsername].totalPoints += points;
          if (award.award >= AwardType.PARTICIPATION) userPoints[canonicalUsername].participations++;
          if (award.award >= AwardType.BEATEN) userPoints[canonicalUsername].beaten++;
          if (award.award >= AwardType.MASTERED) userPoints[canonicalUsername].mastered++;
          userPoints[canonicalUsername].processedGames.add(gameKey);
        }
      }
    }
  }

  // Convert to an array and sort by total points.
  const leaderboard = Object.values(userPoints)
    .filter(user => user.totalPoints > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Handle ties and assign ranks.
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

  // Build the plain text table.
  let tableText = 'Rank  Player         Pts  P  B  M\n';
  tableText += '--------------------------------\n';
  leaderboard.forEach(user => {
    const rank = padString(user.rank, 4);
    const name = padString(user.username, 13);
    const points = padString(user.totalPoints, 4);
    const p = padString(user.participations, 2);
    const b = padString(user.beaten, 2);
    const m = padString(user.mastered, 2);
    tableText += `${rank} ${name} ${points} ${p} ${b} ${m}\n`;
  });

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('2025 Yearly Rankings')
    .setDescription("```" + tableText + "```");

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Shows the leaderboard')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of leaderboard to display')
        .setRequired(false)
        .addChoices(
          { name: 'Monthly', value: 'month' },
          { name: 'Yearly', value: 'year' }
        )),
  async execute(interaction) {
    try {
      const isSlashCommand = interaction.isChatInputCommand?.();
      const args = isSlashCommand 
        ? [interaction.options.getString('type')]
        : interaction.content.slice(1).trim().split(/ +/).slice(1);
      
      const type = args[0]?.toLowerCase() || 'month';
      let embed;

      if (type === 'month' || type === 'm') {
        embed = await displayMonthlyLeaderboard();
      } else if (type === 'year' || type === 'y') {
        embed = await displayYearlyLeaderboard();
      } else {
        const response = 'Invalid command. Use `/leaderboard month` or `/leaderboard year`';
        return isSlashCommand ? interaction.reply(response) : interaction.reply(response);
      }

      if (isSlashCommand) {
        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Leaderboard error:', error);
      const response = 'Error getting leaderboard data.';
      if (interaction.isChatInputCommand?.()) {
        await interaction.reply(response);
      } else {
        await interaction.reply(response);
      }
    }
  }
};
