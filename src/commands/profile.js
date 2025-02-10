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
        type: game.type,
        progress: `${award.achievementCount}/${award.totalAchievements}`,
        completion: award.userCompletion || 'N/A',
        award: award.award
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

  // Group awards by type and game
  const groupedAwards = {
    mastered: [],
    beaten: [],
    participation: [],
    community: []
  };

  const processedGames = new Set();

  for (const award of awards) {
    // Skip if we've already processed this game for this month
    const gameKey = `${award.gameId}-${award.month}`;
    if (processedGames.has(gameKey)) continue;
    processedGames.add(gameKey);

    if (award.gameId === 'manual') {
      groupedAwards.community.push({
        reason: award.reason,
        points: award.totalAchievements,
        metadata: award.metadata
      });
      continue;
    }

    const game = await Game.findOne({
      gameId: award.gameId,
      year: currentYear
    });
    if (!game) continue;

    const awardInfo = {
      title: game.title,
      type: game.type,
      month: award.month
    };

    if (award.award === AwardType.MASTERED) {
      groupedAwards.mastered.push(awardInfo);
    } else if (award.award === AwardType.BEATEN) {
      groupedAwards.beaten.push(awardInfo);
    } else if (award.award === AwardType.PARTICIPATION) {
      groupedAwards.participation.push(awardInfo);
    }
  }

  return groupedAwards;
}

async function formatAwardsSection(groupedAwards) {
  let sections = [];

  // Format mastery awards
  if (groupedAwards.mastered.length > 0) {
    const masteryText = groupedAwards.mastered
      .map(award => `• ${award.type === 'SHADOW' ? '🌑' : '☀️'} ${award.title}`)
      .join('\n');
    sections.push({ name: '✨ Mastery Awards', value: masteryText });
  }

  // Format beaten awards
  if (groupedAwards.beaten.length > 0) {
    const beatenText = groupedAwards.beaten
      .map(award => `• ${award.type === 'SHADOW' ? '🌑' : '☀️'} ${award.title}`)
      .join('\n');
    sections.push({ name: '⭐ Beaten Awards', value: beatenText });
  }

  // Format participation awards
  if (groupedAwards.participation.length > 0) {
    const participationText = groupedAwards.participation
      .map(award => `• ${award.type === 'SHADOW' ? '🌑' : '☀️'} ${award.title}`)
      .join('\n');
    sections.push({ name: '🏁 Participation Awards', value: participationText });
  }

  // Format community awards
  if (groupedAwards.community.length > 0) {
    const communityText = groupedAwards.community
      .map(award => {
        if (award.metadata?.type === 'placement') {
          return `• ${award.metadata.emoji} ${award.reason} (${award.points} pts)`;
        }
        return `• ${award.reason} (${award.points} pts)`;
      })
      .join('\n');
    sections.push({ name: '🎖️ Community Awards', value: communityText });
  }

  return sections;
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
        .setURL(profileUrl)
        .setTimestamp();

      // Get and display current progress
      const currentProgress = await getCurrentProgress(normalizedUsername);
      if (currentProgress.length > 0) {
        let progressText = '';
        currentProgress.forEach(progress => {
          const typeEmoji = progress.type === 'SHADOW' ? '🌑' : '☀️';
          let awardIcon = '';
          if (progress.award === AwardType.MASTERED) awardIcon = ' ✨';
          else if (progress.award === AwardType.BEATEN) awardIcon = ' ⭐';
          else if (progress.award === AwardType.PARTICIPATION) awardIcon = ' 🏁';
          
          progressText += `${typeEmoji} ${progress.title}\n`;
          progressText += `Progress: ${progress.progress} (${progress.completion})${awardIcon}\n\n`;
        });
        embed.addFields({ name: '🎮 Current Challenges', value: progressText });
      }

      // Get and format all awards
      const yearlyAwards = await getYearlyAwards(normalizedUsername);
      const awardSections = await formatAwardsSection(yearlyAwards);
      
      // Calculate total points
      const communityPoints = yearlyAwards.community.reduce((sum, award) => sum + award.points, 0);
      const gamePoints = (
        (yearlyAwards.mastered.length * 7) +
        (yearlyAwards.beaten.length * 4) +
        (yearlyAwards.participation.length * 1)
      );
      const totalPoints = gamePoints + communityPoints;

      // Add award sections to embed
      awardSections.forEach(section => {
        embed.addFields({ name: section.name, value: section.value });
      });

      // Add points summary
      const pointsText = 
        `Total: ${totalPoints}\n` +
        `• Challenge: ${gamePoints}\n` +
        `• Community: ${communityPoints}`;
      embed.addFields({ name: '🏆 Points Summary', value: pointsText });

      await loadingMsg.delete();
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error showing profile:', error);
      await message.reply('Error getting profile data. Please try again.');
    }
  }
};
