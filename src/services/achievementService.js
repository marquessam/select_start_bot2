// File: src/services/achievementService.js
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const Award = require('../models/Award');
const PlayerProgress = require('../models/PlayerProgress');
const RetroAchievementsAPI = require('./retroAchievements');
const UsernameUtils = require('../utils/usernameUtils');
const Cache = require('../utils/cache');
const StaticCache = require('../utils/staticCache');
const { AwardType } = require('../enums/AwardType');

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
        this.staticCache = new StaticCache();
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

        console.log('Achievement Service constructed');
    }

    async initialize() {
        try {
            console.log('Initializing Achievement Service...');
            
            // Verify channel exists and bot has permissions
            const channel = await this.client.channels.fetch(this.feedChannelId);
            if (!channel) {
                throw new Error('Feed channel not found');
            }

            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
                throw new Error('Bot lacks required permissions in feed channel');
            }

            // Preload current month's challenge games
            await this.preloadCurrentChallenges();

            // Initial active users update
            await this.updateActiveUsers();
            console.log('Achievement Service initialized with channel:', channel.name);
            
            return true;
        } catch (error) {
            console.error('Error initializing Achievement Service:', error);
            throw error;
        }
    }

    async preloadCurrentChallenges() {
        try {
            const currentMonth = new Date().getMonth() + 1;
            const currentYear = new Date().getFullYear();

            const challenges = await Game.find({
                month: currentMonth,
                year: currentYear,
                type: { $in: ['MONTHLY', 'SHADOW'] }
            });

            // Preload game info for each challenge
            for (const challenge of challenges) {
                await this.staticCache.getGameInfo(challenge.gameId,
                    async () => await this.raAPI.getGameInfo(challenge.gameId)
                );
            }

            return challenges;
        } catch (error) {
            console.error('Error preloading challenges:', error);
            return [];
        }
    }

    /**
     * Checks if a user is active by looking up an Award record for one of the current month’s challenge games.
     * A user is considered active if their HighestAwardKind is at least PARTICIPATION.
     */
    async isUserActive(username) {
        try {
            const normalizedUsername = username.toLowerCase();
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();

            // Check cache first
            const cacheKey = `active-${normalizedUsername}-${currentMonth}-${currentYear}`;
            const cachedStatus = this.userGameCache.get(cacheKey);
            if (cachedStatus !== undefined) {
                return cachedStatus;
            }

            // Get current month's games
            const currentGames = await Game.find({
                month: currentMonth,
                year: currentYear,
                type: { $in: ['MONTHLY', 'SHADOW'] }
            });
            const gameIds = currentGames.map(g => g.gameId);

            // Look up an Award record for the user for any of the current month's games
            const award = await Award.findOne({
                raUsername: normalizedUsername,
                gameId: { $in: gameIds },
                month: currentMonth,
                year: currentYear
            });

            let isActive = false;
            if (award && award.HighestAwardKind !== undefined) {
                isActive = award.HighestAwardKind >= AwardType.PARTICIPATION;
            }

            // Cache the result
            this.userGameCache.set(cacheKey, isActive);
            
            if (isActive) {
                console.log(`User ${username} is active in current month with award level ${award.HighestAwardKind}`);
            }
            
            return isActive;
        } catch (error) {
            console.error(`Error checking if user ${username} is active:`, error);
            return false;
        }
    }

    async updateActiveUsers() {
        console.log('Updating active users list...');
        try {
            if (this.lastActiveUpdate && 
                Date.now() - this.lastActiveUpdate < this.activeUpdateInterval) {
                console.log('Active users list is still fresh, skipping update');
                return;
            }

            const users = await User.find({ isActive: true });
            this.activeUsers.clear();

            for (const user of users) {
                // Use static cache for user profile check
                const profile = await this.staticCache.getUserProfile(user.raUsername,
                    async () => await this.raAPI.getUserProfile(user.raUsername)
                );

                if (profile && await this.isUserActive(user.raUsername)) {
                    this.activeUsers.add(user.raUsername.toLowerCase());
                }
            }

            this.lastActiveUpdate = Date.now();
            console.log(`Updated active users cache. Found ${this.activeUsers.size} active users.`);
        } catch (error) {
            console.error('Error updating active users:', error);
            throw error;
        }
    }

    async checkAchievements() {
        if (this.isPaused) return;

        try {
            // Update active users cache if needed
            await this.updateActiveUsers();

            const users = await User.find({ isActive: true });
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            // Get current challenges from cache
            const challengeGames = await this.staticCache.getCurrentChallenges(
                async () => await Game.find({
                    month: currentMonth,
                    year: currentYear,
                    type: { $in: ['MONTHLY', 'SHADOW'] }
                })
            );

            console.log(`Checking achievements for ${users.length} users (${this.activeUsers.size} active)`);

            for (const user of users) {
                const username = user.raUsername.toLowerCase();
                
                // Skip if it's not time to check this user
                if (!this.shouldCheckUser(username)) {
                    continue;
                }

                try {
                    await this.checkUserAchievements(user, challengeGames, currentMonth, currentYear);
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

    shouldCheckUser(username) {
        const lastCheck = this.lastUserChecks.get(username.toLowerCase()) || 0;
        const interval = this.activeUsers.has(username.toLowerCase()) 
            ? this.activeInterval 
            : this.inactiveInterval;
        
        return Date.now() - lastCheck >= interval;
    }

    /**
     * Processes a user’s recent achievements. For each new achievement:
     * - It is announced (if not already announced)
     * - The PlayerProgress record is updated
     * - The Award record is updated (or created) for this game/challenge
     */
    async checkUserAchievements(user, challengeGames, currentMonth, currentYear) {
        try {
            // Use static cache for user profile
            const userProfile = await this.staticCache.getUserProfile(user.raUsername,
                async () => await this.raAPI.getUserProfile(user.raUsername)
            );

            const recentAchievements = await this.raAPI.getUserRecentAchievements(user.raUsername);
            if (!Array.isArray(recentAchievements)) return;

            const canonicalUsername = userProfile.Username || user.raUsername;
            const processedAchievements = new Set();

            for (const achievement of recentAchievements) {
                const achievementDate = new Date(achievement.Date);
                if (achievementDate <= this.lastCheck) continue;

                const achievementKey = `${achievement.ID}-${achievement.GameID}-${achievementDate.getTime()}`;
                if (processedAchievements.has(achievementKey)) continue;
                processedAchievements.add(achievementKey);

                // Cache the achievement info
                await this.staticCache.getAchievementInfo(
                    achievement.GameID,
                    achievement.ID,
                    async () => achievement
                );

                let progress = await PlayerProgress.findOne({
                    raUsername: user.raUsername.toLowerCase(),
                    gameId: achievement.GameID.toString()
                });

                if (!progress) {
                    progress = new PlayerProgress({
                        raUsername: user.raUsername.toLowerCase(),
                        gameId: achievement.GameID.toString(),
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

                    // Update Award record for this achievement
                    let award = await Award.findOne({
                        raUsername: user.raUsername.toLowerCase(),
                        gameId: achievement.GameID.toString(),
                        month: currentMonth,
                        year: currentYear
                    });
                    if (!award) {
                        award = new Award({
                            raUsername: user.raUsername.toLowerCase(),
                            gameId: achievement.GameID.toString(),
                            month: currentMonth,
                            year: currentYear,
                            achievementCount: 1,
                            HighestAwardKind: achievement.Points // assuming Points corresponds to award type
                        });
                    } else {
                        award.achievementCount = (award.achievementCount || 0) + 1;
                        if (achievement.Points > (award.HighestAwardKind || 0)) {
                            award.HighestAwardKind = achievement.Points;
                        }
                    }
                    await award.save();

                    // Invalidate active users cache if award was updated
                    if (game) {
                        this.lastActiveUpdate = null;
                    }
                }
            }
        } catch (error) {
            console.error(`Error checking achievements for ${user.raUsername}:`, error);
            throw error;
        }
    }

    async announceAchievement(username, achievement, game) {
        if (this.isPaused) return;

        try {
            const announcementKey = `${username}-${achievement.ID}-${achievement.Date}`;
            if (this.announcementCache.get(announcementKey)) return;

            // Use static cache for game info
            const gameInfo = await this.staticCache.getGameInfo(achievement.GameID,
                async () => await this.raAPI.getGameInfo(achievement.GameID)
            );

            // Get cached profile URLs
            const profilePicUrl = await this.usernameUtils.getProfilePicUrl(username);
            const profileUrl = await this.usernameUtils.getProfileUrl(username);

            const embed = new EmbedBuilder()
                .setColor(game?.type === 'SHADOW' ? '#FFD700' : '#00BFFF')
                .setTitle(gameInfo.Title || achievement.GameTitle)
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
        // Selectively clear static cache
        this.staticCache.clearChallengeCache();
        console.log('Achievement service caches cleared');
    }

    setPaused(paused) {
        this.isPaused = paused;
        console.log(`Achievement service ${paused ? 'paused' : 'resumed'}`);
    }

    /**
     * Get comprehensive service statistics
     */
    getStats() {
        const staticCacheStats = this.staticCache.getCacheStats();
        const dynamicCacheStats = {
            announcements: this.announcementCache.size(),
            achievements: this.achievementCache.size(),
            userGames: this.userGameCache.size(),
            activeUsers: this.activeUsers.size,
            totalUsers: this.lastUserChecks.size,
            queueLength: this.announcementQueue.length
        };

        return {
            status: {
                isPaused: this.isPaused,
                lastCheck: this.lastCheck,
                lastActiveUpdate: this.lastActiveUpdate,
                isProcessingQueue: this.isProcessingQueue
            },
            staticCache: staticCacheStats,
            dynamicCache: dynamicCacheStats,
            queues: {
                announcements: this.announcementQueue.length,
                userChecks: this.lastUserChecks.size
            },
            timing: {
                activeInterval: this.activeInterval / 1000,
                inactiveInterval: this.inactiveInterval / 1000,
                activeUpdateInterval: this.activeUpdateInterval / 1000
            }
        };
    }

    /**
     * Perform maintenance tasks
     */
    async performMaintenance() {
        console.log('Starting achievement service maintenance...');
        try {
            // Clear expired cache entries
            this.clearCache();

            // Reset tracking for users that haven't been seen in a while
            const now = Date.now();
            const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
            let staleUsers = 0;

            for (const [username, lastCheck] of this.lastUserChecks.entries()) {
                if (now - lastCheck > staleThreshold) {
                    this.lastUserChecks.delete(username);
                    this.activeUsers.delete(username);
                    staleUsers++;
                }
            }

            // Force refresh of current challenges
            await this.preloadCurrentChallenges();

            // Log maintenance results
            console.log('Maintenance completed:', {
                staleUsersRemoved: staleUsers,
                activeUsers: this.activeUsers.size,
                totalUsers: this.lastUserChecks.size,
                cacheStats: this.staticCache.getCacheStats()
            });
        } catch (error) {
            console.error('Error during maintenance:', error);
        }
    }

    /**
     * Force check a specific user
     */
    async forceCheckUser(username) {
        try {
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user) {
                throw new Error(`User ${username} not found`);
            }

            const currentMonth = new Date().getMonth() + 1;
            const currentYear = new Date().getFullYear();

            const challengeGames = await this.staticCache.getCurrentChallenges(
                async () => await Game.find({
                    month: currentMonth,
                    year: currentYear,
                    type: { $in: ['MONTHLY', 'SHADOW'] }
                })
            );

            await this.checkUserAchievements(user, challengeGames, currentMonth, currentYear);
            this.lastUserChecks.set(user.raUsername.toLowerCase(), Date.now());

            return {
                success: true,
                username: user.raUsername,
                timestamp: new Date()
            };
        } catch (error) {
            console.error(`Error force checking user ${username}:`, error);
            throw error;
        }
    }

    /**
     * Clean up resources
     */
    async shutdown() {
        console.log('Shutting down achievement service...');
        this.setPaused(true);
        this.clearCache();
        this.lastUserChecks.clear();
        this.activeUsers.clear();
        this.announcementQueue = [];
        console.log('Achievement service shut down');
    }
}

module.exports = AchievementService;
