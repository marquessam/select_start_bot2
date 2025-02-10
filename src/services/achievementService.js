const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const Award = require('../models/Award');
const PlayerProgress = require('../models/PlayerProgress');
const RetroAchievementsAPI = require('./retroAchievements');
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

        this.raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );

        // Initialize username utilities
        const UsernameUtils = require('../utils/usernameUtils');
        this.usernameUtils = new UsernameUtils(this.raAPI);
        this.announcementCache = new Cache(3600000); // 1 hour for announcement history
        this.achievementCache = new Cache(60000); // 1 minute for achievements
        
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isPaused = false;
        
        // Start from 24 hours ago to catch up on missed achievements
        this.lastCheck = new Date(Date.now() - (24 * 60 * 60 * 1000));
        
        console.log('Achievement Service initialized with channel:', this.feedChannelId);
    }

    async initialize() {
        try {
            // Verify channel exists and bot has permissions
            const channel = await this.client.channels.fetch(this.feedChannelId);
            if (!channel) {
                throw new Error('Feed channel not found');
            }

            // Verify permissions
            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
                throw new Error('Bot lacks required permissions in feed channel');
            }

            await this.checkAchievements();
            console.log('Achievement service initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing achievement service:', error);
            throw error;
        }
    }

    /**
     * Get canonical form of username, maintaining original case from RetroAchievements
     */
    async getCanonicalUsername(username) {
        return await this.usernameUtils.getCanonicalUsername(username);
    }

    async checkAchievements() {
        try {
            // Fetch all users (active or not) to check achievements
            const users = await User.find({});
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const challengeGames = await Game.find({
                month: currentMonth,
                year: currentYear,
                type: { $in: ['MONTHLY', 'SHADOW'] }
            });

            console.log(`Checking achievements for ${users.length} users and ${challengeGames.length} games`);

            for (const user of users) {
                try {
                    await this.checkUserAchievements(user, challengeGames);
                    // Add delay between users to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    console.error(`Error checking achievements for ${user.raUsername}:`, error);
                }
            }

            this.lastCheck = currentDate;
            console.log('Achievement check completed');
        } catch (error) {
            console.error('Error in achievement check:', error);
        }
    }

    async checkUserAchievements(user, challengeGames) {
        try {
            const recentAchievements = await this.raAPI.getUserRecentAchievements(user.raUsername);
            if (!Array.isArray(recentAchievements)) return;

            // Get canonical username once for all achievements
            const canonicalUsername = await this.getCanonicalUsername(user.raUsername);

            const processedAchievements = new Set();
            for (const achievement of recentAchievements) {
                const achievementDate = new Date(achievement.Date);
                if (achievementDate <= this.lastCheck) continue;

                const achievementKey = `${achievement.ID}-${achievement.GameID}-${achievementDate.getTime()}`;
                if (processedAchievements.has(achievementKey)) continue;
                processedAchievements.add(achievementKey);

                // Get or create progress record
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

                // Check if already announced
                if (!progress.announcedAchievements.includes(achievement.ID)) {
                    const game = challengeGames.find(g => g.gameId === achievement.GameID.toString());
                    await this.announceAchievement(canonicalUsername, achievement, game);
                    
                    progress.announcedAchievements.push(achievement.ID);
                    progress.lastAchievementTimestamp = achievementDate;
                    await progress.save();
                }
            }
        } catch (error) {
            console.error(`Error checking achievements for ${user.raUsername}:`, error);
        }
    }

  async announceAchievement(username, achievement, game) {
    if (this.isPaused) return;

    try {
        // Always use canonical username for announcements and URLs
        const canonicalUsername = await this.getCanonicalUsername(username);
        const announcementKey = `${canonicalUsername}-${achievement.ID}-${achievement.Date}`;
        if (this.announcementCache.get(announcementKey)) {
            return;
        }

        const profilePicUrl = await this.usernameUtils.getProfilePicUrl(canonicalUsername);
        const profileUrl = await this.usernameUtils.getProfileUrl(canonicalUsername);

        // Determine special game handling and colors
        let authorName = '';
        let color = '#00FF00'; // Default color
        let files = [];

        const logoFile = {
            attachment: './assets/logo_simple.png',
            name: 'game_logo.png'
        };

        if (game) {
            switch(game.gameId) {
                case '274': // UN Squadron
                    authorName = 'SHADOW GAME 🌑';
                    color = '#FFD700';
                    files = [logoFile];
                    break;
                case '355': // ALTTP
                case '319': // Chrono Trigger
                    authorName = 'MONTHLY CHALLENGE ☀️';
                    color = '#00BFFF';
                    files = [logoFile];
                    break;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(achievement.GameTitle)
            .setDescription(
                `**${canonicalUsername}** earned **${achievement.Title}**\n\n` +
                `*${achievement.Description || 'No description available'}*`
            )
            .setURL(profileUrl);

        // Set badge image if available
        if (achievement.BadgeName) {
            embed.setThumbnail(`https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`);
        }

        // Add game type header for challenge games
        if (authorName) {
            embed.setAuthor({
                name: authorName,
                iconURL: 'attachment://game_logo.png'
            });
        }

        embed.setFooter({
            text: `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`,
            iconURL: profilePicUrl
        });

        await this.queueAnnouncement({ embeds: [embed], files });
        this.announcementCache.set(announcementKey, true);
    } catch (error) {
        console.error('Error announcing achievement:', error);
    }
}
async announcePointsAward(username, points, reason) {
    if (this.isPaused) return;

    try {
        const canonicalUsername = await this.getCanonicalUsername(username);
        const announcementKey = `points-${canonicalUsername}-${points}-${reason}-${Date.now()}`;
        
        if (this.announcementCache.get(announcementKey)) {
            return;
        }

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
        this.announcementCache.set(announcementKey, true);
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
            // Add delay between messages to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        console.error('Error processing announcement queue:', error);
    } finally {
        this.isProcessingQueue = false;
    }
}
    setPaused(paused) {
        this.isPaused = paused;
        console.log(`Achievement service ${paused ? 'paused' : 'resumed'}`);
    }

    clearCache() {
        this.userCache.clear();
        this.announcementCache.clear();
        this.achievementCache.clear();
        console.log('Achievement service caches cleared');
    }

    /**
     * Verifies the provided award data and computes yearly stats.
     * If awardData is not an array, attempts to convert it using Object.values.
     * @param {Array|Object} awardData - Array or object of award data.
     * @returns {Object} breakdown of yearly awards and a total points sum.
     */
    verifyAwardData(awardData) {
        // If awardData is not an array, attempt to convert it
        if (!Array.isArray(awardData)) {
            awardData = Object.values(awardData);
        }

        const yearlyAwards = {};
        let yearTotal = 0;

        awardData.forEach(award => {
            // Assuming award.date is a valid date string and award.points a number
            const year = new Date(award.date).getFullYear();
            if (!yearlyAwards[year]) {
                yearlyAwards[year] = {
                    totalPoints: 0,
                    awards: []
                };
            }
            yearlyAwards[year].awards.push(award);
            yearlyAwards[year].totalPoints += award.points;
            yearTotal += award.points;
        });

        return { yearlyAwards, yearTotal };
    }
}

module.exports = AchievementService;
