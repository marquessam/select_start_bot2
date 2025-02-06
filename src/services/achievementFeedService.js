const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const RetroAchievementsAPI = require('./retroAchievements');
const path = require('path');

class AchievementFeedService {
  /**
   * Creates an instance of AchievementFeedService.
   * @param {Client} client - The Discord client.
   */
  constructor(client) {
    this.client = client;
    this.feedChannelId = '1336339958503571487';
    this.raAPI = new RetroAchievementsAPI(
      process.env.RA_USERNAME,
      process.env.RA_API_KEY
    );
    this.lastCheck = new Date();
    // A set to store unique achievement keys so that the same achievement is not announced twice.
    this.announcementHistory = new Set();
  }

  /**
   * Initializes the achievement feed service.
   */
  async initialize() {
    this.lastCheck = new Date();
    console.log('Achievement feed service initialized');
  }

  /**
   * Checks for recent achievements from all active users and announces new ones.
   */
  async checkRecentAchievements() {
    try {
      console.log('Checking for recent achievements...');
      const currentDate = new Date();
      const users = await User.find({ isActive: true });

      // Get current month and year.
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      // Get current monthly and shadow games.
      const challengeGames = await Game.find({
        month: currentMonth,
        year: currentYear,
        type: { $in: ['MONTHLY', 'SHADOW'] }
      });

      // Process achievements for each user.
      for (const user of users) {
        try {
          const recentAchievements = await this.raAPI.getUserRecentAchievements(user.raUsername);
          if (recentAchievements && recentAchievements.length > 0) {
            for (const achievement of recentAchievements) {
              const earnedDate = new Date(achievement.Date);
              // Only announce achievements earned after the last check.
              if (earnedDate > this.lastCheck) {
                const challengeGame = challengeGames.find(g => g.gameId === String(achievement.GameID));
                await this.announceAchievement(user.raUsername, achievement, challengeGame);
              }
            }
          }
        } catch (error) {
          console.error(`Error checking achievements for ${user.raUsername}:`, error);
          // Continue to next user if an error occurs.
        }
      }

      // Update the last check timestamp.
      this.lastCheck = currentDate;
      console.log('Achievement check completed');
    } catch (error) {
      console.error('Error in achievement feed service:', error);
    }
  }

  /**
   * Announces an achievement in the designated feed channel.
   * @param {string} username - The RA username.
   * @param {object} achievement - The achievement object.
   * @param {object} [challengeGame] - The challenge game associated with the achievement, if any.
   */
  async announceAchievement(username, achievement, challengeGame) {
    try {
      const channel = await this.client.channels.fetch(this.feedChannelId);
      if (!channel) {
        console.error('Achievement feed channel not found');
        return;
      }

      // Create a unique key for the achievement.
      const achievementKey = `${username}-${achievement.ID}-${achievement.GameTitle}-${achievement.Title}`;
      if (this.announcementHistory.has(achievementKey)) return;

      // Determine the badge URL (default to a placeholder if not provided).
      const badgeUrl = achievement.BadgeName
        ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
        : 'https://media.retroachievements.org/Badge/00000.png';
      const userIconUrl = `https://media.retroachievements.org/UserPic/${username}.png`;

      // Default embed setup.
      let authorName = '';
      let authorIconUrl = '';
      let files = [];
      let color = '#00FF00'; // Default: green

      // Load a logo file for special game announcements.
      const logoFile = {
        attachment: path.join(__dirname, '../../assets/logo_simple.png'),
        name: 'game_logo.png'
      };

      // If the achievement is associated with a challenge game, update embed settings.
      if (challengeGame) {
        if (challengeGame.type && challengeGame.type.toUpperCase() === 'SHADOW') {
          authorName = 'SHADOW GAME 🌘';
          color = '#FFD700'; // Gold for shadow games.
        } else {
          authorName = 'MONTHLY CHALLENGE 🏆';
          color = '#00BFFF'; // Blue for monthly challenge.
        }
        files = [logoFile];
        authorIconUrl = 'attachment://game_logo.png';
      }

      // Build the embed.
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(achievement.GameTitle)
        .setThumbnail(badgeUrl)
        .setDescription(
          `**${username}** earned **${achievement.Title}**\n\n` +
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

      await channel.send({ embeds: [embed], files });
      this.announcementHistory.add(achievementKey);

      // Prevent the history set from growing indefinitely.
      if (this.announcementHistory.size > 1000) {
        this.announcementHistory.clear();
      }
    } catch (error) {
      console.error('Error announcing achievement:', error);
    }
  }
}

module.exports = AchievementFeedService;
