// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const RetroAchievementsAPI = require('../services/retroAchievements');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

module.exports = {
  name: 'profile',
  description: 'Shows user profile information',
  async execute(message, args) {
    try {
      // Get username (default to "Royek" if none provided)
      const requestedUsername = args[0] || "Royek";

      // Find user in database (case-insensitive)
      const user = await User.findOne({
        raUsername: { $regex: new RegExp(`^${requestedUsername}$`, 'i') }
      });
      if (!user) {
        return message.reply(`User **${requestedUsername}** not found.`);
      }

      const raUsername = user.raUsername;
      const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);

      // Create base embed
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Profile: ${raUsername}`)
        .setThumbnail(`https://media.retroachievements.org/UserPic/${raUsername}.png`);

      // Get current month and year.
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      // Get current games for this month.
      const currentGames = await Game.find({
        month: currentMonth,
        year: currentYear
      });

      // Add a field for each active game with live progress.
      for (const game of currentGames) {
        const award = await Award.findOne({
          raUsername,
          gameId: game.gameId,
          month: currentMonth,
          year: currentYear
        });
        const progress = await raAPI.getUserGameProgress(raUsername, game.gameId);
        const gameProgress = {
          title: game.title,
          type: game.type,
          earned: progress.earnedAchievements || 0,
          total: progress.totalAchievements || 0,
          completion: progress.userCompletion || "0.00%",
          award: award ? award.award : AwardType.NONE
        };
        // If the award is participation, show only the emoji.
        const awardDisplay = (gameProgress.award === AwardType.PARTICIPATION)
          ? `${AwardFunctions.getEmoji(gameProgress.award)}`
          : `${AwardFunctions.getEmoji(gameProgress.award)} ${AwardFunctions.getName(gameProgress.award)}`;
        embed.addFields({
          name: `${game.type === 'SHADOW' ? '🌘' : '🏆'} ${gameProgress.title}`,
          value:
            `**Progress:** ${gameProgress.earned}/${gameProgress.total} (${gameProgress.completion})\n` +
            `**Award:** ${awardDisplay}\n` +
            `**Points:** ${AwardFunctions.getPoints(gameProgress.award)}`
        });
      }

      // Insert a divider and a Community Awards section.
      embed.addFields({ name: '\u200b', value: '━━━━━━━━━━━━━━━━━━━━━━', inline: false });
      embed.addFields({ name: '🏆 Community Awards', value: 'None', inline: false });

      // Add the game lists (breakdown by award type).
      const formatGameList = games => games.length ? games.map(g => `• ${g}`).join('\n') : 'None';
      
      // Prepare yearly awards breakdown.
      const yearlyAwards = await Award.find({
        raUsername,
        year: currentYear
      });
      const yearStats = {
        totalPoints: 0,
        participationCount: 0,
        beatenCount: 0,
        masteredCount: 0,
        monthlyGames: 0,
        shadowGames: 0
      };
      const participationGames = [];
      const beatenGames = [];
      const masteredGames = [];

      for (const award of yearlyAwards) {
        const game = await Game.findOne({
          gameId: award.gameId,
          year: currentYear
        });
        if (!game) continue;
        yearStats.totalPoints += AwardFunctions.getPoints(award.award);
        if (game.type === 'MONTHLY') {
          yearStats.monthlyGames++;
        } else {
          yearStats.shadowGames++;
        }
        switch (award.award) {
          case AwardType.MASTERED:
            yearStats.masteredCount++;
            masteredGames.push(game.title);
            // Fall through intended.
          case AwardType.BEATEN:
            yearStats.beatenCount++;
            beatenGames.push(game.title);
            // Fall through intended.
          case AwardType.PARTICIPATION:
            yearStats.participationCount++;
            participationGames.push(game.title);
            break;
        }
      }

      // Add game lists for award breakdown.
      embed.addFields({
        name: '🏁 Games Participated (1pt)',
        value: formatGameList(participationGames)
      });
      embed.addFields({
        name: '⭐ Games Beaten (+3pts)',
        value: formatGameList(beatenGames)
      });
      embed.addFields({
        name: '✨ Games Mastered (+3pts)',
        value: formatGameList(masteredGames)
      });

      // Insert a divider before overall statistics.
      embed.addFields({ name: '\u200b', value: '━━━━━━━━━━━━━━━━━━━━━━', inline: false });

      // Add yearly statistics.
      const statsText =
        `**Monthly Games:** ${yearStats.monthlyGames}\n` +
        `**Shadow Games:** ${yearStats.shadowGames}\n` +
        `**Games Participated:** ${yearStats.participationCount}\n` +
        `**Games Beaten:** ${yearStats.beatenCount}\n` +
        `**Games Mastered:** ${yearStats.masteredCount}`;
      embed.addFields({
        name: '📊 2025 Statistics',
        value: statsText
      });

      // Finally, add total points.
      embed.addFields({
        name: '💎 Total Points',
        value: `**${yearStats.totalPoints} points earned in 2025**`
      });

      await message.channel.send({ embeds: [embed] });

    } catch (error) {
      console.error('Error showing profile:', error);
      await message.reply('Error getting profile data.');
    }
  }
};
