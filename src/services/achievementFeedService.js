const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const PlayerProgress = require('../models/PlayerProgress');
const RetroAchievementsAPI = require('./retroAchievements');

class AchievementFeedService {
  constructor(client) {
    this.client = client;
    // Use the environment variable if available; otherwise, fallback to the hard-coded channel ID.
    this.feedChannelId = process.env.ACHIEVEMENT_FEED_CHANNEL || '1336339958503571487';
    this.raAPI = new RetroAchievementsAPI(
      process.env.RA_USERNAME,
      process.env.RA_API_KEY
    );
    this.lastCheck = new Date();
    this.checkInterval = 5 * 60 * 1000; // 5 minutes in milliseconds

    // Queue and history to ensure orderly and non-duplicate announcements.
    this.announcementQueue = [];
    this.announcementHistory = new Set();
    this.isProcessingQueue = false;
    // Flag for pausing feed if needed.
    this.isPaused = false;
  }

  async initialize() {
    this.lastCheck = new Date();
    console.log('Achievement feed service initialized');
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

      for (const user of users) {
        try {
          await this.checkUserAchievements(user, challengeGames);
        } catch (error) {
          console.error(`Error checking achievements for ${user.raUsername}:`, error);
        }
      }
      this.lastCheck = currentDate;
      console.log('Achievement check completed');
    } catch (error) {
      console.error('Error in achievement feed service:', error);
    }
  }

  async checkUserAchievements(user, challengeGames) {
    try {
      const recentAchievements = await this.raAPI.getUserRecentAchievements(user.raUsername);
      if (!recentAchievements || !Array.isArray(recentAchievements)) {
        console.log(`No recent achievements for ${user.raUsername}`);
        return;
      }

      // Process each challenge game for the current month/year
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

        // Filter achievements for this game that are new and not yet announced.
        const gameAchievements = recentAchievements.filter(ach =>
          String(ach.GameID) === String(game.gameId) &&
          new Date(ach.Date) > progress.lastAchievementTimestamp &&
          !progress.announcedAchievements.includes(ach.ID)
        );

        let latestTimestamp = progress.lastAchievementTimestamp;
        for (const achievement of gameAchievements) {
          // Announce this achievement
          await this.announceAchievement(user.raUsername, achievement, game);
          progress.announcedAchievements.push(achievement.ID);
          const achDate = new Date(achievement.Date);
          if (achDate > latestTimestamp) {
            latestTimestamp = achDate;
          }
        }

        // Save the progress if new achievements were announced.
        if (gameAchievements.length > 0) {
          progress.lastAchievementTimestamp = latestTimestamp;
          await progress.save();
        }
      }
    } catch (error) {
      console.error(`Error processing achievements for ${user.raUsername}:`, error);
    }
  }

  // Queue an announcement to control rate limits and ordering.
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

  // Announce a new achievement with special labeling for monthly/shadow challenges.
  async announceAchievement(raUsername, achievement, game) {
    try {
      // Create a unique key to avoid duplicate announcements.
      const announcementKey = `${raUsername}-${achievement.ID}-${achievement.Date}`;
      if (this.announcementHistory.has(announcementKey)) {
        return;
      }

      const badgeUrl = achievement.BadgeName
        ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
        : 'https://media.retroachievements.org/Badge/00000.png';

      // Directly construct the user icon URL without DataService
      const userIconUrl = `https://retroachievements.org/UserPic/${raUsername}.png`;

      let authorName = '';
      let authorIconUrl = '';
      let files = [];
      let color = '#00FF00'; // Default color

      const gameId = String(achievement.GameID); // Ensure string comparison

      // Special handling for specific games with logos and special titles.
      const logoFile = { 
        attachment: './assets/logo_simple.png',
        name: 'game_logo.png'
      };

      if (gameId === '274') { // Shadow Game – UN Squadron
        authorName = 'SHADOW GAME 🌘';
        files = [logoFile];
        authorIconUrl = 'attachment://game_logo.png';
        color = '#FFD700';  // Gold color
      } else if (gameId === '355' || gameId === '319') { // Monthly Challenge examples
        authorName = 'MONTHLY CHALLENGE 🏆';
        files = [logoFile];
        authorIconUrl = 'attachment://game_logo.png';
        color = '#00BFFF';  // Blue color
      }

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${achievement.GameTitle}`)
        .setThumbnail(badgeUrl)
        .setDescription(
          `**${raUsername}** earned **${achievement.Title}**\n\n` +
          `*${achievement.Description || 'No description available'}*`
        )
        .setFooter({ 
          text: `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`, 
          iconURL: userIconUrl 
        })
        .setTimestamp();

      if (authorName) {
        embed.setAuthor({ name: authorName, iconURL: authorIconUrl });
      }

      await this.queueAnnouncement({ embeds: [embed], files });
      console.log(`Queued announcement for achievement ${achievement.ID} for user ${raUsername} in game ${game.title}`);
      this.announcementHistory.add(announcementKey);
      if (this.announcementHistory.size > 1000) this.announcementHistory.clear();
    } catch (error) {
      console.error('Error announcing achievement:', error);
    }
  }

  // Announce points awards, similar to achievements.
  async announcePointsAward(raUsername, points, reason) {
    try {
      if (this.isPaused) return;
      
      const awardKey = `${raUsername}-${points}-${reason}-${Date.now()}`;
      if (this.announcementHistory.has(awardKey)) {
        console.log(`[ACHIEVEMENT FEED] Skipping duplicate points announcement: ${awardKey}`);
        return;
      }
      this.announcementHistory.add(awardKey);

      const userProfileUrl = `https://retroachievements.org/UserPic/${raUsername}.png`;
      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setAuthor({
          name: raUsername,
          iconURL: userProfileUrl,
          url: `https://retroachievements.org/user/${raUsername}`
        })
        .setTitle('🏆 Points Awarded!')
        .setDescription(`**${raUsername}** earned **${points} point${points !== 1 ? 's' : ''}**!\n*${reason}*`)
        .setTimestamp();

      await this.queueAnnouncement({ embeds: [embed] });
      console.log(`[ACHIEVEMENT FEED] Queued points announcement for ${raUsername}: ${points} points (${reason})`);
    } catch (error) {
      console.error('[ACHIEVEMENT FEED] Error announcing points award:', error);
    }
  }

  // OPTIONAL: Announce a game award (separate from achievements or points).
  async announceGameAward(raUsername, gameAward) {
    try {
      if (this.isPaused) return;
      
      const awardKey = `${raUsername}-gameaward-${gameAward.ID}-${Date.now()}`;
      if (this.announcementHistory.has(awardKey)) {
        console.log(`[ACHIEVEMENT FEED] Skipping duplicate game award announcement: ${awardKey}`);
        return;
      }
      this.announcementHistory.add(awardKey);

      const userIconUrl = `https://retroachievements.org/UserPic/${raUsername}.png`;

      const embed = new EmbedBuilder()
        .setColor('#FF4500')
        .setAuthor({
          name: raUsername,
          iconURL: userIconUrl,
          url: `https://retroachievements.org/user/${raUsername}`
        })
        .setTitle('🎖️ Game Award Earned!')
        .setDescription(`**${raUsername}** earned a game award: **${gameAward.Title}**\n*${gameAward.Description || 'No description available'}*`)
        .setTimestamp(new Date());

      await this.queueAnnouncement({ embeds: [embed] });
      console.log(`[ACHIEVEMENT FEED] Queued game award announcement for ${raUsername}: ${gameAward.Title}`);
    } catch (error) {
      console.error('[ACHIEVEMENT FEED] Error announcing game award:', error);
    }
  }
}

module.exports = AchievementFeedService;
