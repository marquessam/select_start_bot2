const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType, AwardFunctions } = require('../enums/AwardType');
const RetroAchievementsAPI = require('../services/retroAchievements');
const UsernameUtils = require('../utils/usernameUtils');

/**
 * Helper function to pad a string to a given length.
 */
function padString(str, length) {
  return str.toString().slice(0, length).padEnd(length);
}

/**
 * Get the user's current monthly progress.
 * Looks up all monthly games for the current month and finds the corresponding award for the user.
 */
async function getCurrentProgress(normalizedUsername) {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const currentGames = await Game.find({
    month: currentMonth,
    year: currentYear
  });

  const currentProgress = [];
  // For each monthly game, look up if the user has an award.
  for (const game of currentGames) {
    const award = await Award.findOne({
      raUsername: normalizedUsername,
      gameId: game.gameId,
      month: currentMonth,
      year: currentYear,
      achievementCount: { $gt: 0 }
    });
    if (award) {
      currentProgress.push({
        title: game.title,
        type: game.type,
        progress: `${award.achievementCount}/${award.totalAchievements}`,
        completion: award.userCompletion || 'N/A',
        award: award.award
      });
    }
  }

  return currentProgress;
}

/**
 * Get yearly statistics for the user.
 * Processes challenge (non-manual) awards for the current year.
 * Uses logic similar to the working leaderboard to ensure each game is only processed once per month.
 */
async function getYearlyStats(normalizedUsername) {
  const currentYear = new Date().getFullYear();
  const awards = await Award.find({
    raUsername: normalizedUsername,
    year: currentYear,
    gameId: { $ne: 'manual' },
    achievementCount: { $gt: 0 }
  });

  // Initialize statistics.
  const stats = {
    totalPoints: 0,
    totalAchievements: 0,
    gamesParticipated: 0,
    gamesBeaten: 0,
    gamesMastered: 0,
    monthlyGames: 0,
    shadowGames: 0,
    processedGames: new Set()
  };

  // Process each award.
  for (const award of awards) {
    // Key to ensure each game-month combo is counted only once.
    const gameKey = `${award.gameId}-${award.month}`;
    if (stats.processedGames.has(gameKey)) continue;
    stats.processedGames.add(gameKey);

    const game = await Game.findOne({
      gameId: award.gameId,
      year: currentYear
    });
    if (!game) continue;

    stats.totalAchievements += award.achievementCount;
    if (game.type === 'MONTHLY') {
      stats.monthlyGames++;
    } else if (game.type === 'SHADOW') {
      stats.shadowGames++;
    }

    // Use AwardFunctions to calculate points for this award.
    const points = AwardFunctions.getPoints(award.award);
    stats.totalPoints += points;

    // Increment counters based on award type.
    if (award.award >= AwardType.PARTICIPATION) stats.gamesParticipated++;
    if (award.award >= AwardType.BEATEN) stats.gamesBeaten++;
    if (award.award >= AwardType.MASTERED) stats.gamesMastered++;
  }

  return stats;
}

/**
 * Get manual (community) awards for the user.
 */
async function getManualAwards(normalizedUsername) {
  const currentYear = new Date().getFullYear();
  const manualAwards = await Award.find({
    raUsername: normalizedUsername,
    gameId: 'manual',
    year: currentYear
  }).sort({ lastChecked: -1 });

  return manualAwards;
}

module.exports = {
  name: 'profile',
  description: 'Shows user profile with detailed statistics and awards',
  async execute(message, args) {
    try {
      // Use provided username or default to sender's username.
      const requestedUsername = args[0] || message.author.username;
      const loadingMsg = await message.channel.send('Fetching profile data...');

      const raAPI = new RetroAchievementsAPI(
        process.env.RA_USERNAME,
        process.env.RA_API_KEY
      );
      const usernameUtils = new UsernameUtils(raAPI);

      // Retrieve canonical username and normalize it (lowercase) for DB queries.
      const canonicalUsername = await usernameUtils.getCanonicalUsername(requestedUsername);
      const normalizedUsername = canonicalUsername.toLowerCase();

      // Find the User record.
      const user = await User.findOne({
        raUsername: { $regex: new RegExp(`^${canonicalUsername}$`, 'i') }
      });
      if (!user) {
        await loadingMsg.delete();
        return message.reply('User not found.');
      }

      // Retrieve profile image and URL.
      const profilePicUrl = await usernameUtils.getProfilePicUrl(canonicalUsername);
      const profileUrl = await usernameUtils.getProfileUrl(canonicalUsername);

      // Prepare the embed.
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`User Profile: ${canonicalUsername}`)
        .setThumbnail(profilePicUrl)
        .setURL(profileUrl)
        .setTimestamp();

      // Get current monthly progress.
      const currentProgress = await getCurrentProgress(normalizedUsername);
      if (currentProgress.length > 0) {
        let progressText = '';
        currentProgress.forEach(progress => {
          // Display an emoji based on game type.
          const typeEmoji = progress.type === 'SHADOW' ? '🌑' : '☀️';
          let awardIcon = '';
          if (progress.award === AwardType.MASTERED) awardIcon = ' ✨';
          else if (progress.award === AwardType.BEATEN) awardIcon = ' ⭐';
          else if (progress.award === AwardType.PARTICIPATION) awardIcon = ' 🏁';
          
          progressText += `${typeEmoji} ${progress.title}\n`;
          progressText += `Progress: ${progress.progress} (${progress.completion})${awardIcon}\n\n`;
        });
        embed.addFields({ name: '🎮 Current Challenges', value: '```\n' + progressText + '```' });
      }

      // Get yearly statistics.
      const yearlyStats = await getYearlyStats(normalizedUsername);
      // Format statistics similar to the leaderboard style using padString.
      const statsText = 
        `Achievements: ${yearlyStats.totalAchievements}\n` +
        `Monthly Games: ${yearlyStats.monthlyGames}\n` +
        `Shadow Games: ${yearlyStats.shadowGames}`;
      const completionText = 
        `Participated: ${yearlyStats.gamesParticipated}\n` +
        `Beaten: ${yearlyStats.gamesBeaten}\n` +
        `Mastered: ${yearlyStats.gamesMastered}`;
      
      embed.addFields({ 
        name: '📊 2025 Statistics',
        value: '```\n' + statsText + '\n\n' + completionText + '\n```'
      });

      // Get manual (community) awards.
      const manualAwards = await getManualAwards(normalizedUsername);
      const manualPoints = manualAwards.reduce((sum, award) => sum + (award.totalAchievements || 0), 0);
      if (manualAwards.length > 0) {
        const communityAwardsText = manualAwards
          .map(award => {
            // Check if this is a placement award with an emoji.
            if (award.metadata?.type === 'placement') {
              return `• ${award.metadata.emoji || '🏆'} ${award.reason}: ${award.totalAchievements} point${award.totalAchievements !== 1 ? 's' : ''}`;
            }
            return `• ${award.reason}: ${award.totalAchievements} point${award.totalAchievements !== 1 ? 's' : ''}`;
          })
          .join('\n');
        embed.addFields({ 
          name: '🎖️ Community Awards', 
          value: '```\n' + communityAwardsText + '\n```'
        });
      } else {
        embed.addFields({ 
          name: '🎖️ Community Awards', 
          value: '```\nNone\n```'
        });
      }

      // Total points comprise challenge points and community extra points.
      const totalPoints = yearlyStats.totalPoints + manualPoints;
      const pointsText = 
        `Total: ${totalPoints}\n` +
        `• Challenge: ${yearlyStats.totalPoints}\n` +
        `• Community: ${manualPoints}\n`;
      embed.addFields({ 
        name: '🏆 Total Points',
        value: '```\n' + pointsText + '\n```'
      });

      await loadingMsg.delete();
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error showing profile:', error);
      console.error('Error stack:', error.stack);
      await message.reply('Error getting profile data. Please try again.');
    }
  }
};
