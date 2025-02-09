const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const PlayerProgress = require('../models/PlayerProgress');
const RetroAchievementsAPI = require('./retroAchievements');

class AchievementFeedService {
  constructor(client) {
    this.client = client;
    // Use environment variable if available; otherwise, fallback to the hard-coded ID.
    this.feedChannelId = process.env.ACHIEVEMENT_FEED_CHANNEL || '1336339958503571487';
    this.raAPI = new RetroAchievementsAPI(
      process.env.RA_USERNAME,
      process.env.RA_API_KEY
    );
    this.lastCheck = new Date();
    this.checkInterval = 5 * 60 * 1000; // 5 minutes in milliseconds

    // New in this version: an announcement queue and in-memory history to avoid duplicates.
    this.announcementQueue = [];
    this.announcementHistory = new Set();
    this.isProcessingQueue = false;
  }

  async initialize() {
    this.lastCheck = new Date();
    console.log('Achievement feed service initialized');
    // Optional: call checkRecentAchievements immediately if desired.
    this.startPeriodicCheck();
  }

  startPeriodicCheck() {
    setInterval(() => this.checkRecentAchievements(), this.checkInterval);
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

      // For each challenge game for the current month/year, compare against saved progress.
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

        // Filter achievements for this game that have not been announced yet and occurred after the last recorded achievement.
        const gameAchievements = recentAchievements.filter(ach => 
          String(ach.GameID) === String(game.gameId) &&
          new Date(ach.Date) > progress.lastAchievementTimestamp &&
          !progress.announcedAchievements.includes(ach.ID)
        );

        // If there are new achievements, call announceAchievement for each and update progress.
        let latestTimestamp = progress.lastAchievementTimestamp;
        for (const achievement of gameAchievements) {
          await this.announceAchievement(user.raUsername, achievement, game);
          // Track this achievement as announced
          progress.announcedAchievements.push(achievement.ID);
          const achDate = new Date(achievement.Date);
          if (achDate > latestTimestamp) {
            latestTimestamp = achDate;
          }
        }

        // Save progress if any announcements were sent.
        if (gameAchievements.length > 0) {
          progress.lastAchievementTimestamp = latestTimestamp;
          await progress.save();
        }
      }
    } catch (error) {
      console.error(`Error processing achievements for ${user.raUsername}:`, error);
    }
  }

  // This method queues an announcement instead of sending it directly.
  async queueAnnouncement(messageOptions) {
    this.announcementQueue.push(messageOptions);
    if (!this.isProcessingQueue) {
      await this.processAnnouncementQueue();
    }
  }

  // Processes the announcement queue with a short delay between messages.
  async processAnnouncementQueue() {
    if (this.isProcessingQueue || this.announcementQueue.length === 0) return;

    this.isProcessingQueue = true;
    try {
      const channel = await this.client.channels.fetch(this.feedChannelId);
      if (!channel) {
        console.error('Achievement Feed Error: Feed channel not found. Check feedChannelId or bot permissions.');
        return;
      }
      while (this.announcementQueue.length > 0) {
        const messageOptions = this.announcementQueue.shift();
        await channel.send(messageOptions);
        // Delay between messages to avoid rate limits.
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Achievement Feed Error processing announcements:', error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  // Announce a single achievement by building an embed, queuing the announcement,
  // and using an in-memory history to avoid duplicate announcements.
  async announceAchievement(raUsername, achievement, game) {
    try {
      // Create a unique key for this announcement.
      const announcementKey = `${raUsername}-${achievement.ID}-${achievement.Date}`;
      if (this.announcementHistory.has(announcementKey)) {
        // Skip duplicate announcement.
        return;
      }
      // Build the embed.
      const embed = new EmbedBuilder()
        .setTitle(`New Achievement Unlocked: ${achievement.Title}`)
        .setDescription(`**Game:** ${game.title}\n**User:** ${raUsername}\n**Points:** ${achievement.Points}\n**Date:** ${achievement.Date}`)
        .setColor(0x00AE86)
        .setTimestamp(new Date());
      
      // Queue the announcement.
      await this.queueAnnouncement({ embeds: [embed] });
      console.log(`Queued announcement for achievement ${achievement.ID} for user ${raUsername} in game ${game.title}`);
      
      // Record this announcement in the in-memory history.
      this.announcementHistory.add(announcementKey);
      // Clean up announcement history if it grows too large.
      if (this.announcementHistory.size > 1000) this.announcementHistory.clear();
    } catch (error) {
      console.error('Error announcing achievement:', error);
    }
  }
}

module.exports = AchievementFeedService;
