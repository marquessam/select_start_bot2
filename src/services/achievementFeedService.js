const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const PlayerProgress = require('../models/PlayerProgress');
const RetroAchievementsAPI = require('./retroAchievements');

class AchievementFeedService {
  constructor(client) {
    this.client = client;
    // Ensure this channel ID is correct and the bot has access to it.
    this.feedChannelId = '1336339958503571487';
    this.raAPI = new RetroAchievementsAPI(
      process.env.RA_USERNAME,
      process.env.RA_API_KEY
    );
    this.lastCheck = new Date();
    this.checkInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
  }

  async initialize() {
    this.lastCheck = new Date();
    console.log('Achievement feed service initialized');
  }

  async checkRecentAchievements() {
    try {
      console.log('Checking for recent achievements...');
      const currentDate = new Date();
      const users = await User.find({ isActive: true });

      // Get current month and year
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      // Get current monthly and shadow games
      const challengeGames = await Game.find({
        month: currentMonth,
        year: currentYear,
        type: { $in: ['MONTHLY', 'SHADOW'] }
      });

      // Process achievements for each user
      for (const user of users) {
        try {
          await this.checkUserAchievements(user, challengeGames);
        } catch (error) {
          console.error(`Error checking achievements for ${user.raUsername}:`, error);
          // Continue to next user if an error occurs
        }
      }

      // Update the last check timestamp
      this.lastCheck = currentDate;
      console.log('Achievement check completed');
    } catch (error) {
      console.error('Error in achievement feed service:', error);
    }
  }

  async checkUserAchievements(user, challengeGames) {
    try {
      // Get user's recent achievements from the RetroAchievements API
      const recentAchievements = await this.raAPI.getUserRecentAchievements(user.raUsername);
      if (!recentAchievements || !Array.isArray(recentAchievements)) {
        console.log(`No recent achievements for ${user.raUsername}`);
        return;
      }

      // For each challenge game for the current month/year
      for (const game of challengeGames) {
        let progress = await PlayerProgress.findOne({
          raUsername: user.raUsername,
          gameId: game.gameId
        });

        // If no progress record exists, create one with a base timestamp of January 1, 1970.
        if (!progress) {
          progress = new PlayerProgress({
            raUsername: user.raUsername,
            gameId: game.gameId,
            lastAchievementTimestamp: new Date(0),
            announcedAchievements: []
          });
        }

        // Filter achievements for this game that have not been announced yet and that occurred after the last recorded achievement.
        const gameAchievements = recentAchievements.filter(ach => 
          String(ach.GameID) === String(game.gameId) &&
          new Date(ach.Date) > progress.lastAchievementTimestamp &&
          !progress.announcedAchievements.includes(ach.ID)
        );

        // If there are new achievements to announce, track the maximum achievement timestamp from these achievements.
        let latestTimestamp = progress.lastAchievementTimestamp;
        for (const achievement of gameAchievements) {
          await this.announceAchievement(user.raUsername, achievement, game);
          progress.announcedAchievements.push(achievement.ID);
          const achDate = new Date(achievement.Date);
          if (achDate > latestTimestamp) {
            latestTimestamp = achDate;
          }
        }

        // Update progress if new achievements were found.
        if (gameAchievements.length > 0) {
          progress.lastAchievementTimestamp = latestTimestamp;
          await progress.save();
        }
      }
    } catch (error) {
      console.error(`Error processing achievements for ${user.raUsername}:`, error);
    }
  }

  async announceAchievement(raUsername, achievement, game) {
    try {
      const embed = new EmbedBuilder()
        .setTitle(`New Achievement Unlocked: ${achievement.Title}`)
        .setDescription(`**Game:** ${game.title}\n**User:** ${raUsername}\n**Points:** ${achievement.Points}\n**Date:** ${achievement.Date}`)
        .setColor(0x00AE86)
        .setTimestamp(new Date());
      
      const channel = await this.client.channels.fetch(this.feedChannelId);
      if (!channel) {
        console.error('Achievement Feed Error: Feed channel not found. Check feedChannelId or bot permissions.');
        return;
      }
      await channel.send({ embeds: [embed] });
      console.log(`Announced achievement ${achievement.ID} for user ${raUsername} in game ${game.title}`);
    } catch (error) {
      console.error('Error announcing achievement:', error);
    }
  }
}

module.exports = AchievementFeedService;
