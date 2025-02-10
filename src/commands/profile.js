const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType, AwardFunctions } = require('../enums/AwardType');
const RetroAchievementsAPI = require('../services/retroAchievements');
const UsernameUtils = require('../utils/usernameUtils');

async function getCurrentProgress(normalizedUsername) {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const currentGames = await Game.find({
    month: currentMonth,
    year: currentYear
  });

  const currentProgress = [];
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
        progress: `${award.achievementCount}/${award.totalAchievements}`,
        completion: award.userCompletion || 'N/A'
      });
    }
  }

  return currentProgress;
}

async function getYearlyAwards(normalizedUsername) {
  const currentYear = new Date().getFullYear();
  const awards = await Award.find({
    raUsername: normalizedUsername,
    year: currentYear,
    achievementCount: { $gt: 0 }
  });

  // Group awards by highest award level achieved
  const groupedAwards = {
    mastered: [],
    beaten: [],
    participation: []
  };

  const processedGames = new Set();

  for (const award of awards) {
    // Skip if we've already processed this game for this month
    const gameKey = `${award.gameId}-${award.month}`;
    if (processedGames.has(gameKey) || award.gameId === 'manual') continue;
    processedGames.add(gameKey);

    const game = await Game.findOne({
      gameId: award.gameId,
      year: currentYear
    });
    if (!game) continue;

    if (award.award === AwardType.MASTERED) {
      groupedAwards.mastered.push(game.title);
    } else if (award.award === AwardType.BEATEN) {
      groupedAwards.beaten.push(game.title);
    } else if (award.award === AwardType.PARTICIPATION) {
      groupedAwards.participation.push(game.title);
    }
  }

  return groupedAwards;
}

async function getManualAwards(normalizedUsername) {
  const currentYear = new Date().getFullYear();
  const manualAwards = await Award.find({
    raUsername: normalizedUsername,
    gameId: 'manual',
    year: currentYear
  }).sort({ awardedAt: -1 });

  if (manualAwards.length === 0) {
    return null;
  }

  let awardText = '';
  for (const award of manualAwards) {
    if (award.metadata?.type === 'placement') {
      awardText += `${award.metadata.emoji} ${award.metadata.name} - ${award.metadata.month}: ${award.totalAchievements} points\n`;
    } else {
      awardText += `• ${award.reason}: ${award.totalAchievements} points\n`;
    }
  }

  return {
    text: awardText,
    totalPoints: manualAwards.reduce((sum, award) => sum + award.totalAchievements, 0)
  };
}

module.exports = {
  name: 'profile',
  description: 'Shows user profile with detailed statistics and awards',
  async execute(message, args) {
    try {
      const requestedUsername = args[0] || message.author.username;
      const loadingMsg = await message.channel.send('Fetching profile data...');

      const raAPI = new RetroAchievementsAPI(
        process.env.RA_USERNAME,
        process.env.RA_API_KEY
      );
      const usernameUtils = new UsernameUtils(raAPI);

      const canonicalUsername = await usernameUtils.getCanonicalUsername(requestedUsername);
      const normalizedUsername = canonicalUsername.toLowerCase();

      const user = await User.findOne({
        raUsername: { $regex: new RegExp(`^${canonicalUsername}$`, 'i') }
      });
      if (!user) {
        await loadingMsg.delete();
        return message.reply('User not found.');
      }

      const profilePicUrl = await usernameUtils.getProfilePicUrl(canonicalUsername);
      const profileUrl = await usernameUtils.getProfileUrl(canonicalUsername);

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`User Profile: ${canonicalUsername}`)
        .setThumbnail(profilePicUrl)
        .setURL(profileUrl);

      // Get current monthly progress
      const currentProgress = await getCurrentProgress(normalizedUsername);
      if (currentProgress.length > 0) {
        let progressText = '';
        currentProgress.forEach(progress => {
          progressText += `${progress.title}\n`;
          progressText += `Progress: ${progress.progress} (${progress.completion})\n\n`;
        });
        embed.addFields({ name: '🎮 Current Challenges', value: progressText });
      }

      // Get and format game awards
      const yearlyAwards = await getYearlyAwards(normalizedUsername);
      let gameAwardsText = '';

      if (yearlyAwards.mastered.length > 0) {
        yearlyAwards.mastered.forEach(game => {
          gameAwardsText += `${game}: Mastered ✨\n`;
        });
      }
      if (yearlyAwards.beaten.length > 0) {
        yearlyAwards.beaten.forEach(game => {
          gameAwardsText += `${game}: Beaten ⭐\n`;
        });
      }
      if (yearlyAwards.participation.length > 0) {
        yearlyAwards.participation.forEach(game => {
          gameAwardsText += `${game}: Participation 🏁\n`;
        });
      }

      if (gameAwardsText) {
        embed.addFields({ 
          name: '🎮 Game Awards', 
          value: gameAwardsText 
        });
      }

      // Add manual awards section
      const manualAwards = await getManualAwards(normalizedUsername);
      if (manualAwards) {
        embed.addFields({
          name: '🎖️ Community Awards',
          value: manualAwards.text
        });
      }

      // Calculate points
      const gamePoints = (
        (yearlyAwards.mastered.length * 7) +
        (yearlyAwards.beaten.length * 4) +
        (yearlyAwards.participation.length)
      );
      const communityPoints = manualAwards?.totalPoints || 0;
      const totalPoints = gamePoints + communityPoints;

      embed.addFields({
        name: '🏆 Points Summary',
        value: 
          `Total: ${totalPoints}\n` +
          `• Challenge: ${gamePoints}\n` +
          `• Community: ${communityPoints}`
      });

      await loadingMsg.delete();
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error showing profile:', error);
      await message.reply('Error getting profile data. Please try again.');
    }
  }
};
