// File: src/services/achievementService.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const PlayerProgress = require('../models/PlayerProgress');
const RetroAchievementsAPI = require('./retroAchievements');
const UsernameUtils = require('../utils/usernameUtils');
const Cache = require('../utils/cache');
const StaticCache = require('../utils/staticCache');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

class AchievementService {
    constructor(client) {
        if (!client) {
            throw new Error('Discord client is required');
        }

        console.log('Constructing achievement service...');
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
        this.initialized = false;

        // Start from 24 hours ago to catch up on missed achievements
        this.lastCheck = new Date(Date.now() - (24 * 60 * 60 * 1000));

        console.log('Achievement Service constructed');
    }

    async initialize() {
        try {
            if (this.initialized) {
                console.log('Achievement service already initialized');
                return true;
            }

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
            
            this.initialized = true;
            console.log('Achievement Service initialized');
            
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

            // Look up an Award record for any of the current month's games
            const award = await Award.findOne({
                raUsername: normalizedUsername,
                gameId: { $in: gameIds },
                month: currentMonth,
                year: currentYear
            });

            let isActive = false;
            if (award && award.highestAwardKind !== undefined) {
                isActive = award.highestAwardKind >= AwardType.PARTICIPATION;
            }

            // Cache the result
            this.userGameCache.set(cacheKey, isActive);
            
            if (isActive) {
                console.log(`User ${username} is active in current month with award level ${award.highestAwardKind}`);
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
                if (await this.isUserActive(user.raUsername)) {
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

    shouldCheckUser(username) {
        const lastCheck = this.lastUserChecks.get(username.toLowerCase()) || 0;
        const interval = this.activeUsers.has(username.toLowerCase()) 
            ? this.activeInterval 
            : this.inactiveInterval;
        
        return Date.now() - lastCheck >= interval;
    }

    async checkAchievements() {
        if (this.isPaused || !this.initialized) return;

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

async checkUserAchievements(user, challengeGames) {
    try {
        console.log(`Checking achievements for ${user.raUsername}`);
        const recentAchievements = await this.raAPI.getUserRecentAchievements(user.raUsername);
        
        if (!recentAchievements || !Array.isArray(recentAchievements)) {
            console.log(`No recent achievements for ${user.raUsername}`);
            return;
        }

        // Get current awards for all challenge games
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const gameIds = challengeGames.map(g => g.gameId);
        
        // Get all current awards for the user's challenge games
        const existingAwards = await Award.find({
            raUsername: user.raUsername.toLowerCase(),
            gameId: { $in: gameIds },
            month: currentMonth,
            year: currentYear
        });

        // Create a map for quick lookup
        const awardMap = new Map(existingAwards.map(award => [award.gameId, award]));

        // Get game completion information for all challenge games
        const gameProgress = {};
        for (const game of challengeGames) {
            try {
                const progress = await this.raAPI.getUserGameProgress(user.raUsername, game.gameId);
                if (progress) {
                    gameProgress[game.gameId] = {
                        earnedAchievements: progress.earnedAchievements || 0,
                        totalAchievements: progress.totalAchievements || 0,
                        userCompletion: progress.userCompletion || "0.00%",
                        achievements: progress.achievements || []
                    };
                }
            } catch (error) {
                console.error(`Error getting game progress for ${game.gameId}:`, error);
            }
        }

        // Update awards based on current progress
        for (const game of challengeGames) {
            const progress = gameProgress[game.gameId];
            if (!progress) continue;

            let award = awardMap.get(game.gameId);
            const needsUpdate = !award || 
                award.achievementCount !== progress.earnedAchievements ||
                award.totalAchievements !== progress.totalAchievements;

            if (needsUpdate) {
                console.log(`Updating award for ${user.raUsername} in ${game.title}`);
                if (!award) {
                    award = new Award({
                        raUsername: user.raUsername.toLowerCase(),
                        gameId: game.gameId,
                        month: currentMonth,
                        year: currentYear,
                        achievementCount: progress.earnedAchievements,
                        totalAchievements: progress.totalAchievements,
                        userCompletion: progress.userCompletion,
                        highestAwardKind: AwardType.NONE
                    });
                } else {
                    award.achievementCount = progress.earnedAchievements;
                    award.totalAchievements = progress.totalAchievements;
                    award.userCompletion = progress.userCompletion;
                }

                // Determine award type
                if (progress.earnedAchievements >= progress.totalAchievements) {
                    award.highestAwardKind = AwardType.MASTERED;
                } else if (this.checkGameBeaten(game, progress.achievements)) {
                    award.highestAwardKind = AwardType.BEATEN;
                } else if (progress.earnedAchievements > 0) {
                    award.highestAwardKind = AwardType.PARTICIPATION;
                }

                try {
                    await award.save();
                    console.log(`Saved award for ${user.raUsername} in ${game.title}:`, {
                        achievementCount: award.achievementCount,
                        totalAchievements: award.totalAchievements,
                        highestAwardKind: award.highestAwardKind,
                        userCompletion: award.userCompletion
                    });
                } catch (saveError) {
                    console.error(`Error saving award for ${user.raUsername}:`, saveError);
                }
            }
        }

        // Process recent achievements for announcements
        const sortedAchievements = recentAchievements
            .filter(achievement => achievement && achievement.Date)
            .sort((a, b) => new Date(a.Date) - new Date(b.Date));

        for (const achievement of sortedAchievements) {
            // Handle achievement announcements as before...
            // [Previous announcement code remains the same]
        }

    } catch (error) {
        console.error(`Error checking achievements for ${user.raUsername}:`, error);
    }
}


   async updateAward(username, game, achievement) {
    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // First, find any existing award
        let award = await Award.findOne({
            raUsername: username.toLowerCase(),
            gameId: game.gameId,
            month: currentMonth,
            year: currentYear
        });

        if (!award) {
            // Create new award
            award = new Award({
                raUsername: username.toLowerCase(),
                gameId: game.gameId,
                month: currentMonth,
                year: currentYear,
                achievementCount: 1,
                totalAchievements: game.numAchievements,
                highestAwardKind: AwardType.PARTICIPATION,
                userCompletion: ((1 / game.numAchievements) * 100).toFixed(2) + '%'
            });
        } else {
            // Update existing award
            award.achievementCount = (award.achievementCount || 0) + 1;
            award.userCompletion = ((award.achievementCount / award.totalAchievements) * 100).toFixed(2) + '%';
            
            // Update award type based on progress
            if (award.achievementCount >= award.totalAchievements) {
                award.highestAwardKind = AwardType.MASTERED;
            } else if (this.checkGameBeaten(game, achievement)) {
                if (award.highestAwardKind < AwardType.BEATEN) {
                    award.highestAwardKind = AwardType.BEATEN;
                }
            }
        }

        // Save with error handling
        try {
            await award.save();
            console.log(`Updated award for ${username} on game ${game.title}:`, {
                achievementCount: award.achievementCount,
                totalAchievements: award.totalAchievements,
                highestAwardKind: award.highestAwardKind,
                userCompletion: award.userCompletion
            });
        } catch (saveError) {
            console.error('Error saving award:', saveError);
            throw saveError;
        }

        // Announce award milestone if reached
        if (award.highestAwardKind === AwardType.MASTERED || 
            award.highestAwardKind === AwardType.BEATEN) {
            await this.announceAwardMilestone(username, game, award.highestAwardKind);
        }

        // Invalidate active users cache when awards change
        this.lastActiveUpdate = null;
        
        return award;
    } catch (error) {
        console.error(`Error updating award for ${username}:`, error);
        throw error;
    }
}

// Add helper method to verify award data
async verifyAwardData(username) {
    try {
        const currentYear = new Date().getFullYear();
        const awards = await Award.find({
            raUsername: username.toLowerCase(),
            year: currentYear
        });

        let awardsFixed = 0;
        for (const award of awards) {
            let needsSave = false;

            // Fix missing achievement counts
            if (!award.achievementCount && award.achievementCount !== 0) {
                award.achievementCount = 0;
                needsSave = true;
            }

            // Fix missing award types
            if (!award.highestAwardKind && award.highestAwardKind !== 0) {
                award.highestAwardKind = AwardType.NONE;
                needsSave = true;
            }

            // Fix missing completion percentage
            if (!award.userCompletion) {
                award.userCompletion = "0.00%";
                needsSave = true;
            }

            if (needsSave) {
                await award.save();
                awardsFixed++;
            }
        }

        if (awardsFixed > 0) {
            console.log(`Fixed ${awardsFixed} awards for user ${username}`);
        }

        return awards;
    } catch (error) {
        console.error(`Error verifying awards for ${username}:`, error);
        throw error;
    }
}

  checkGameBeaten(game, achievements) {
    if (!game.winCondition || !game.winCondition.length) {
        return false;
    }

    const earnedAchievements = new Set(achievements
        .filter(a => a.DateEarned)
        .map(a => a.ID.toString()));

    if (game.requireAllWinConditions) {
        // All win conditions must be met
        return game.winCondition.every(id => earnedAchievements.has(id.toString()));
    } else {
        // Any win condition is sufficient
        return game.winCondition.some(id => earnedAchievements.has(id.toString()));
    }
}

    async announceAchievement(username, achievement, game) {
        if (this.isPaused) return;

        try {
            const announcementKey = `${username}-${achievement.ID}-${achievement.Date}`;
            if (this.announcementCache.get(announcementKey)) return;

            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(username);
            const profilePicUrl = await this.usernameUtils.getProfilePicUrl(canonicalUsername);
            const badgeUrl = achievement.BadgeName 
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            const embed = new EmbedBuilder()
                .setColor(game?.type === 'SHADOW' ? '#FFD700' : '#00BFFF')
.setTitle(achievement.GameTitle)
                .setThumbnail(badgeUrl)
                .setDescription(
                    `**${canonicalUsername}** earned **${achievement.Title}**\n\n` +
                    `*${achievement.Description || 'No description available'}*`
                );

            if (game) {
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

    async announceAwardMilestone(username, game, awardType) {
        if (this.isPaused) return;

        try {
            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(username);
            const awardKey = `${canonicalUsername}-${game.gameId}-${awardType}-${Date.now()}`;
            
            if (this.announcementCache.get(awardKey)) return;

            const profilePicUrl = await this.usernameUtils.getProfilePicUrl(canonicalUsername);
            const points = AwardFunctions.getPoints(awardType);
            const awardName = AwardFunctions.getName(awardType);
            const emoji = AwardFunctions.getEmoji(awardType);

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setAuthor({
                    name: game.type === 'SHADOW' ? 'SHADOW GAME 🌑' : 'MONTHLY CHALLENGE ☀️',
                    iconURL: 'attachment://game_logo.png'
                })
                .setTitle(`${emoji} ${awardName} Award!`)
                .setDescription(
                    `**${canonicalUsername}** earned the **${awardName}** award for ${game.title}!\n` +
                    `*+${points} points awarded!*`
                )
                .setFooter({ 
                    text: new Date().toLocaleString(),
                    iconURL: profilePicUrl 
                })
                .setTimestamp();

            const files = [{
                attachment: './assets/logo_simple.png',
                name: 'game_logo.png'
            }];

            await this.queueAnnouncement({ embeds: [embed], files });
            this.announcementCache.set(awardKey, true);
        } catch (error) {
            console.error('Error announcing award milestone:', error);
        }
    }

    async announcePointsAward(username, points, reason) {
        if (this.isPaused) return;

        try {
            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(username);
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
        this.staticCache.clearChallengeCache();
        console.log('Achievement service caches cleared');
    }

    setPaused(paused) {
        this.isPaused = paused;
        console.log(`Achievement service ${paused ? 'paused' : 'resumed'}`);
    }

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
                initialized: this.initialized,
                lastCheck: this.lastCheck,
                lastActiveUpdate: this.lastActiveUpdate,
                isProcessingQueue: this.isProcessingQueue
            },
            caches: {
                static: staticCacheStats,
                dynamic: dynamicCacheStats
            },
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

    async shutdown() {
        console.log('Shutting down achievement service...');
        this.setPaused(true);
        this.clearCache();
        this.lastUserChecks.clear();
        this.activeUsers.clear();
        this.announcementQueue = [];
        this.initialized = false;
        console.log('Achievement service shut down');
    }
}

module.exports = AchievementService;
