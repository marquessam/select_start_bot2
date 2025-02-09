// File: src/services/achievementFeedService.js

const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const PlayerProgress = require('../models/PlayerProgress');
const RetroAchievementsAPI = require('./retroAchievements');

class AchievementFeedService {
    constructor(client) {
        this.client = client;
        this.feedChannelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
        if (!this.feedChannelId) {
            console.error('Achievement Feed Error: No channel ID provided in environment variables');
        }
        this.raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );
        // Start from a much earlier time to ensure we don't miss achievements
        this.lastCheck = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours ago
        this.checkInterval = 5 * 60 * 1000; // 5 minutes
        this.announcementQueue = [];
        this.announcementHistory = new Set();
        this.isProcessingQueue = false;
        this.isPaused = false;

        // Log configuration
        console.log('Achievement Feed Service initialized with:', {
            channelId: this.feedChannelId,
            lastCheck: this.lastCheck,
            checkInterval: this.checkInterval
        });
    }

    async initialize() {
        try {
            // Verify channel exists and bot has permissions
            const channel = await this.client.channels.fetch(this.feedChannelId);
            if (!channel) {
                throw new Error('Feed channel not found');
            }
            console.log('Achievement feed initialized with channel:', channel.name);
            this.startPeriodicCheck();
            return true;
        } catch (error) {
            console.error('Error initializing achievement feed:', error);
            throw error;
        }
    }

    startPeriodicCheck() {
        setInterval(() => this.checkRecentAchievements(), this.checkInterval);
        console.log('Started periodic achievement checks');
    }

    async checkRecentAchievements() {
        try {
            console.log('\nStarting achievement check...');
            const currentDate = new Date();
            const users = await User.find({ isActive: true });

            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const challengeGames = await Game.find({
                month: currentMonth,
                year: currentYear,
                type: { $in: ['MONTHLY', 'SHADOW'] }
            });

            console.log(`Found ${users.length} active users and ${challengeGames.length} current games`);

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

            // Sort achievements by date
            const sortedAchievements = recentAchievements.sort((a, b) => 
                new Date(a.Date) - new Date(b.Date)
            );

            console.log(`Processing ${sortedAchievements.length} achievements for ${user.raUsername}`);

            for (const game of challengeGames) {
                let progress = await PlayerProgress.findOne({
                    raUsername: user.raUsername,
                    gameId: game.gameId
                });

                if (!progress) {
                    progress = new PlayerProgress({
                        raUsername: user.raUsername,
                        gameId: game.gameId,
                        lastAchievementTimestamp: new Date(0),
                        announcedAchievements: []
                    });
                }

                const gameAchievements = sortedAchievements.filter(ach => {
                    const achievementDate = new Date(ach.Date);
                    const isNew = achievementDate > progress.lastAchievementTimestamp;
                    const isUnannounced = !progress.announcedAchievements.includes(ach.ID);
                    const isForGame = String(ach.GameID) === String(game.gameId);
                    
                    return isNew && isUnannounced && isForGame;
                });

                console.log(`Found ${gameAchievements.length} new achievements for ${user.raUsername} in ${game.title}`);

                for (const achievement of gameAchievements) {
                    await this.announceAchievement(user.raUsername, achievement, game);
                    progress.announcedAchievements.push(achievement.ID);
                    const achDate = new Date(achievement.Date);
                    if (achDate > progress.lastAchievementTimestamp) {
                        progress.lastAchievementTimestamp = achDate;
                    }
                }

                if (gameAchievements.length > 0) {
                    await progress.save();
                }
            }
        } catch (error) {
            console.error(`Error checking achievements for ${user.raUsername}:`, error);
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
            if (!channel) {
                console.error('Achievement Feed Error: Feed channel not found');
                return;
            }

            while (this.announcementQueue.length > 0) {
                const messageOptions = this.announcementQueue.shift();
                await channel.send(messageOptions);
                // Add delay between messages to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Error processing announcement queue:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    async announceAchievement(raUsername, achievement, game) {
        try {
            const announcementKey = `${raUsername}-${achievement.ID}-${achievement.Date}`;
            if (this.announcementHistory.has(announcementKey)) {
                console.log(`Skipping duplicate announcement: ${announcementKey}`);
                return;
            }

            console.log(`Preparing announcement for ${raUsername}'s achievement: ${achievement.Title}`);

            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const userIconUrl = `https://retroachievements.org/UserPic/${raUsername}.png`;

            const embed = new EmbedBuilder()
                .setColor(game.type === 'SHADOW' ? '#FFD700' : '#00BFFF')
                .setAuthor({
                    name: game.type === 'SHADOW' ? 'SHADOW GAME 🌑' : 'MONTHLY CHALLENGE ☀️',
                    iconURL: 'attachment://game_logo.png'
                })
                .setTitle(achievement.GameTitle)
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

            const files = [{
                attachment: './assets/logo_simple.png',
                name: 'game_logo.png'
            }];

            await this.queueAnnouncement({ embeds: [embed], files });
            this.announcementHistory.add(announcementKey);

           // Clear old history entries if the set gets too large
                if (this.announcementHistory.size > 1000) {
                    const oldEntries = Array.from(this.announcementHistory).slice(0, 500);
                    oldEntries.forEach(entry => this.announcementHistory.delete(entry));
                }
            
        } catch (error) {
            console.error('Error announcing achievement:', error);
        }
    }

    async announcePointsAward(raUsername, points, reason) {
        try {
            if (this.isPaused) return;
            
            const awardKey = `${raUsername}-points-${points}-${Date.now()}`;
            if (this.announcementHistory.has(awardKey)) {
                console.log(`Skipping duplicate points announcement: ${awardKey}`);
                return;
            }

            const userIconUrl = `https://retroachievements.org/UserPic/${raUsername}.png`;

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setAuthor({
                    name: raUsername,
                    iconURL: userIconUrl,
                    url: `https://retroachievements.org/user/${raUsername}`
                })
                .setTitle('🏆 Points Awarded!')
                .setDescription(
                    `**${raUsername}** earned **${points} point${points !== 1 ? 's' : ''}**!\n` +
                    `*${reason}*`
                )
                .setTimestamp();

            await this.queueAnnouncement({ embeds: [embed] });
            this.announcementHistory.add(awardKey);
            console.log(`Points announcement queued for ${raUsername}: ${points} points (${reason})`);
        } catch (error) {
            console.error('Error announcing points award:', error);
        }
    }

    // Utility method to force a check (useful for testing)
    async forceCheck() {
        console.log('Forcing achievement check...');
        await this.checkRecentAchievements();
    }

    // Method to clear announcement history (useful if needed)
    clearHistory() {
        this.announcementHistory.clear();
        console.log('Announcement history cleared');
    }

    // Method to pause/unpause the feed
    setPaused(paused) {
        this.isPaused = paused;
        console.log(`Achievement feed ${paused ? 'paused' : 'resumed'}`);
    }
}

module.exports = AchievementFeedService;
