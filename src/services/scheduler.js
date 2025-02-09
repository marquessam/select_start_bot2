// File: src/services/achievementService.js
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const Award = require('../models/Award');
const PlayerProgress = require('../models/PlayerProgress');
const RetroAchievementsAPI = require('./retroAchievements');
const UsernameUtils = require('../utils/usernameUtils');
const Cache = require('../utils/cache');

class AchievementService {
    constructor(client) {
        if (!client) {
            throw new Error('Discord client is required');
        }

        this.client = client;
        this.feedChannelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
        if (!this.feedChannelId) {
            throw new Error('Achievement Feed Error: No channel ID provided in environment variables');
        }

        // Initialize API and utilities
        this.raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );
        this.usernameUtils = new UsernameUtils(this.raAPI);

        // Initialize check intervals
        this.activeInterval = 5 * 60 * 1000;  // 5 minutes for active users
        this.inactiveInterval = 60 * 60 * 1000; // 1 hour for inactive users

        // Initialize caches
        this.announcementCache = new Cache(3600000); // 1 hour for announcements
        this.achievementCache = new Cache(60000);    // 1 minute for achievements
        this.userGameCache = new Cache(300000);      // 5 minutes for user game data

        // Track user checks
        this.lastUserChecks = new Map();
        this.activeUsers = new Set();
        this.lastActiveUpdate = null;
        this.activeUpdateInterval = 15 * 60 * 1000; // 15 minutes

        // Queue management
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isPaused = false;

        // Start from 24 hours ago to catch up on missed achievements
        this.lastCheck = new Date(Date.now() - (24 * 60 * 60 * 1000));

        console.log('Achievement Service initialized with:', {
            channelId: this.feedChannelId,
            activeInterval: this.activeInterval / 1000 + 's',
            inactiveInterval: this.inactiveInterval / 1000 + 's'
        });
    }

    async initialize() {
        try {
            // Verify channel exists and bot has permissions
            const channel = await this.client.channels.fetch(this.feedChannelId);
            if (!channel) {
                throw new Error('Feed channel not found');
            }

            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
                throw new Error('Bot lacks required permissions in feed channel');
            }

            // Do initial active users update
            await this.updateActiveUsers();

            console.log('Achievement service initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing achievement service:', error);
            throw error;
        }
    }

    /**
     * Check if a user is active in the current month's challenge
     */
    async isUserActive(username) {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();

        // Check cache first
        const cacheKey = `active-${username.toLowerCase()}-${currentMonth}-${currentYear}`;
        const cachedStatus = this.userGameCache.get(cacheKey);
        if (cachedStatus !== undefined) {
            return cachedStatus;
        }

        try {
            // Check if user has any achievements in current monthly challenge
            const award = await Award.findOne({
                raUsername: username.toLowerCase(),
                month: currentMonth,
                year: currentYear,
                achievementCount: { $gt: 0 }
            });

            const isActive = !!award;
            this.userGameCache.set(cacheKey, isActive);
            return isActive;
        } catch (error) {
            console.error(`Error checking if user ${username} is active:`, error);
            return false;
        }
    }

    /**
     * Update the active users cache
     */
    async updateActiveUsers() {
        if (this.lastActiveUpdate && 
            Date.now() - this.lastActiveUpdate < this.activeUpdateInterval) {
            return;
        }

        try {
            const users = await User.find({ isActive: true });
            this.activeUsers.clear();

            for (const user of users) {
                if (await this.isUserActive(user.raUsername)) {
                    this.activeUsers.add(user.raUsername.toLowerCase());
                }
            }

            this.lastActiveUpdate = Date.now();
            console.log(`Updated active users cache. Found ${this.activeUsers.size} active users.`);
        } catch (error) {
            console.error('Error updating active users:', error);
        }
    }

    /**
     * Check if it's time to check a user again
     */
    shouldCheckUser(username) {
        const lastCheck = this.lastUserChecks.get(username.toLowerCase()) || 0;
        const interval = this.activeUsers.has(username.toLowerCase()) 
            ? this.activeInterval 
            : this.inactiveInterval;
        
        return Date.now() - lastCheck >= interval;
    }

    /**
     * Main achievement check method
     */
    async checkAchievements() {
        if (this.isPaused) return;

        try {
            // Update active users cache if needed
            await this.updateActiveUsers();

            const users = await User.find({ isActive: true });
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const challengeGames = await Game.find({
                month: currentMonth,
                year: currentYear,
                type: { $in: ['MONTHLY', 'SHADOW'] }
            });

            console.log(`Checking achievements for ${users.length} users (${this.activeUsers.size} active)`);

            for (const user of users) {
                const username = user.raUsername.toLowerCase();
                
                // Skip if it's not time to check this user
                if (!this.shouldCheckUser(username)) {
                    continue;
                }

                try {
                    await this.checkUserAchievements(user, challengeGames);
                    this.lastUserChecks.set(username, Date.now());

                    // Add appropriate delay based on user status
                    const delay = this.activeUsers.has(username) ? 2000 : 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } catch (error) {
                    console.error(`Error checking achievements for ${username}:`, error);
                }
            }

            this.lastCheck = currentDate;
            console.log('Achievement check completed');
        } catch (error) {
            console.error('Error in achievement check:', error);
        }
    }

    /**
     * Check achievements for a specific user
     */
    async checkUserAchievements(user, challengeGames) {
        try {
            const recentAchievements = await this.raAPI.getUserRecentAchievements(user.raUsername);
            if (!Array.isArray(recentAchievements)) return;

            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(user.raUsername);
            const processedAchievements = new Set();

            for (const achievement of recentAchievements) {
                const achievementDate = new Date(achievement.Date);
                if (achievementDate <= this.lastCheck) continue;

                const achievementKey = `${achievement.ID}-${achievement.GameID}-${achievementDate.getTime()}`;
                if (processedAchievements.has(achievementKey)) continue;
                processedAchievements.add(achievementKey);

                let progress = await PlayerProgress.findOne({
                    raUsername: user.raUsername.toLowerCase(),
                    gameId: achievement.GameID
                });

                if (!progress) {
                    progress = new PlayerProgress({
                        raUsername: user.raUsername.toLowerCase(),
                        gameId: achievement.GameID,
                        lastAchievementTimestamp: new Date(0),
                        announcedAchievements: []
                    });
                }

                if (!progress.announcedAchievements.includes(achievement.ID)) {
                    const game = challengeGames.find(g => g.gameId === achievement.GameID.toString());
                    await this.announceAchievement(canonicalUsername, achievement, game);
                    
                    progress.announcedAchievements.push(achievement.ID);
                    progress.lastAchievementTimestamp = achievementDate;
                    await progress.save();

                    // Force active status update if achievement is from challenge game
                    if (game) {
                        this.lastActiveUpdate = null;
                    }
                }
            }
        } catch (error) {
            console.error(`Error checking achievements for ${user.raUsername}:`, error);
        }
    }

    async announceAchievement(username, achievement, game) {
        if (this.isPaused) return;

        try {
            const announcementKey = `${username}-${achievement.ID}-${achievement.Date}`;
            if (this.announcementCache.get(announcementKey)) return;

            const profilePicUrl = await this.usernameUtils.getProfilePicUrl(username);
            const profileUrl = await this.usernameUtils.getProfileUrl(username);

            const embed = new EmbedBuilder()
                .setColor(game?.type === 'SHADOW' ? '#FFD700' : '#00BFFF')
                .setTitle(achievement.GameTitle)
                .setDescription(
                    `**${username}** earned **${achievement.Title}**\n\n` +
                    `*${achievement.Description || 'No description available'}*`
                )
                .setURL(profileUrl);

            if (achievement.BadgeName) {
                embed.setThumbnail(`https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`);
            }

            if (game && (game.type === 'SHADOW' || game.type === 'MONTHLY')) {
                embed.setAuthor({
                    name: game.type === 'SHADOW' ? 'SHADOW GAME 🌑' : 'MONTHLY CHALLENGE ☀️',
                    iconURL: 'attachment://game_logo.png'
                });
            }

            embed.setFooter({
                text: `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`,
                iconURL: profilePicUrl
            });

            const files = game ? [{
                attachment: './assets/logo_simple.png',
                name: 'game_logo.png'
            }] : [];

            await this.queueAnnouncement({ embeds: [embed], files });
            this.announcementCache.set(announcementKey, true);
        } catch (error) {
            console.error('Error announcing achievement:', error);
        }
    }

    async announcePointsAward(raUsername, points, reason) {
        if (this.isPaused) return;

        try {
            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(raUsername);
            const awardKey = `${canonicalUsername}-points-${points}-${Date.now()}`;
            
            if (this.announcementCache.get(awardKey)) return;

            const profilePicUrl = await this.usernameUtils.getProfilePicUrl(canonicalUsername);
            const profileUrl = await this.usernameUtils.getProfileUrl(canonicalUsername);

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setAuthor({
                    name: canonicalUsername,
                    iconURL: profilePicUrl,
                    url: profileUrl
                })
                .setTitle('🏆 Points Awarded!')
                .setDescription(
                    `**${canonicalUsername}** earned **${points} point${points !== 1 ? 's' : ''}**!\n` +
                    `*${reason}*`
                )
                .setTimestamp();

            await this.queueAnnouncement({ embeds: [embed] });
            this.announcementCache.set(awardKey, true);
        } catch (error) {
            console.error('Error announcing points award:', error);
        }
    }

    async queueAnnouncement(messageOptions) {
        this.announcementQueue.push(messageOptions);
        if (!this.isProcessingQueue) {
            await this.processAnnouncementQueue();
        }
    }

    async processAnnouncementQueue() {
        if (this.isProcessingQueue || this.announcementQueue.length === 0) return;
        this.isProcessingQueue = true;

        try {
            const channel = await this.client.channels.fetch(this.feedChannelId);
            while (this.announcementQueue.length > 0) {
                const messageOptions = this.announcementQueue.shift();
                await channel.send(messageOptions);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Error processing announcement queue:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    clearCache() {
        this.announcementCache.clear();
        this.achievementCache.clear();
        this.userGameCache.clear();
        console.log('Achievement service caches cleared');
    }

    setPaused(paused) {
        this.isPaused = paused;
        console.log(`Achievement service ${paused ? 'paused' : 'resumed'}`);
    }

    getStats() {
        return {
            activeUsers: this.activeUsers.size,
            totalUsers: this.lastUserChecks.size,
            queueLength: this.announcementQueue.length,
            isPaused: this.isPaused,
            lastCheck: this.lastCheck,
            lastActiveUpdate: this.lastActiveUpdate
        };
    }
}

module.exports = AchievementService;
