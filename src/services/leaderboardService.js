const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

/**
 * Pads a given string to a specific length.
 */
function padString(str, length) {
  return str.toString().slice(0, length).padEnd(length);
}

/**
 * Displays the monthly leaderboard.
 */
async function displayMonthlyLeaderboard() {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  // Look up the monthly game for the current month and year
  const monthlyGame = await Game.findOne({
    month: currentMonth,
    year: currentYear,
    type: 'MONTHLY'
  });

  if (!monthlyGame) {
    throw new Error('No monthly game found for current month.');
  }

  // Get all awards for the monthly game with achievements
  const awards = await Award.find({
    gameId: monthlyGame.gameId,
    month: currentMonth,
    year: currentYear,
    achievementCount: { $gt: 0 }
  });

  // Build a unique set of awards keyed by canonical username
  const uniqueAwards = {};
  for (const award of awards) {
    const user = await User.findOne({
      raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
    });
    if (user) {
      const canonicalUsername = user.raUsername;
      // If there's no record yet, or this award has more achievements, take it
      if (!uniqueAwards[canonicalUsername] || 
          award.achievementCount > uniqueAwards[canonicalUsername].achievementCount) {
        award.raUsername = canonicalUsername;
        uniqueAwards[canonicalUsername] = award;
      }
    }
  }

  // Sort the awards descending by achievement count
  const sortedAwards = Object.values(uniqueAwards)
    .sort((a, b) => b.achievementCount - a.achievementCount);

  // Assign ranks, handling ties
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

  // Build the embed using the game information
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Monthly Challenge:')
    .setDescription(`**${monthlyGame.title}**`)
    .setThumbnail('https://media.retroachievements.org/Images/022504.png');

  const topTen = sortedAwards.slice(0, 10);
  const others = sortedAwards.slice(10);

  if (topTen.length > 0) {
    let topTenText = '';
    
    topTen.forEach(award => {
      const rank = padString(award.rank, 2);
      const username = award.raUsername.padEnd(13);
      const progress = `${award.achievementCount}/${award.totalAchievements}`;
      
      // No emojis in the monthly board display
      topTenText += `${rank} ${username} ${progress}\n`;
    });

    embed.addFields({ 
      name: 'Top Rankings', 
      value: '```\n' + topTenText + '```' 
    });

    if (others.length > 0) {
      const othersText = others
        .map(a => `${a.raUsername}: ${a.achievementCount}/${a.totalAchievements}`)
        .join('\n');
      embed.addFields({ 
        name: 'Also Participating', 
        value: '```\n' + othersText + '```' 
      });
    }
  }

  return embed;
}

/**
 * Displays the yearly leaderboard.
 */
async function displayYearlyLeaderboard() {
  const currentYear = new Date().getFullYear();
  // Retrieve all awards for the current year
  const awards = await Award.find({ year: currentYear });

  // Create a point tally per user
  const userPoints = {};

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
          communityPoints: 0,
          challengePoints: 0,
          participations: 0,
          beaten: 0,
          mastered: 0,
          processedGames: new Set()
        };
      }

      // Handle manual (community) awards separately
      if (award.gameId === 'manual') {
        userPoints[canonicalUsername].communityPoints += (award.totalAchievements || 0);
        userPoints[canonicalUsername].totalPoints += (award.totalAchievements || 0);
        continue;
      }
      
      // Use gameId-month as a key to avoid counting a game more than once
      const gameKey = `${award.gameId}-${award.month}`;
      if (!userPoints[canonicalUsername].processedGames.has(gameKey)) {
        let points = 0;
        if (award.award >= AwardType.MASTERED) {
          points = 7; // 1 (participation) + 3 (beaten) + 3 (mastery)
          userPoints[canonicalUsername].mastered++;
        } else if (award.award >= AwardType.BEATEN) {
          points = 4; // 1 (participation) + 3 (beaten)
          userPoints[canonicalUsername].beaten++;
        } else if (award.award >= AwardType.PARTICIPATION) {
          points = 1;
          userPoints[canonicalUsername].participations++;
        }

        userPoints[canonicalUsername].challengePoints += points;
        userPoints[canonicalUsername].totalPoints += points;
        userPoints[canonicalUsername].processedGames.add(gameKey);
      }
    }
  }

  // Build and sort the leaderboard
  const leaderboard = Object.values(userPoints)
    .filter(user => user.totalPoints > 0)
    .map(({ processedGames, ...user }) => user)
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Rank the users, handling ties
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

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('2025 Yearly Rankings');

  if (leaderboard.length > 0) {
    let text = '';
    leaderboard.forEach(user => {
      const rank = padString(user.rank, 2);
      const name = user.username.padEnd(13);
      const total = padString(user.totalPoints, 4);
      const challenge = padString(user.challengePoints, 4);
      const community = padString(user.communityPoints, 4);
      
      text += `${rank} ${name} ${total} (${challenge}+${community})\n`;
    });

    embed.addFields(
      { 
        name: 'Rankings', 
        value: '```\n' + text + '```' 
      },
      {
        name: 'Legend',
        value: 'Rank Username    Total (Challenge+Community)'
      }
    );
  } else {
    embed.addFields({ 
      name: 'Rankings', 
      value: 'No points earned yet!' 
    });
  }

  return embed;
}

module.exports = {
  name: 'leaderboard',
  description: 'Shows the leaderboard',
  async execute(message, args) {
    try {
      // Determine whether to show the monthly or yearly leaderboard
      const type = args[0]?.toLowerCase() || 'month';
      let embed;

      if (type === 'month' || type === 'm') {
        embed = await displayMonthlyLeaderboard();
      } else if (type === 'year' || type === 'y') {
        embed = await displayYearlyLeaderboard();
      } else {
        return message.reply('Invalid command. Use !leaderboard month/m or !leaderboard year/y');
      }

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Leaderboard error:', error);
      await message.reply('Error getting leaderboard data.');
    }
  }
};
