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
        
        // Initialize caches
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

    async getCanonicalUsername(username) {
        return await this.usernameUtils.getCanonicalUsername(username);
    }

    async checkAchievements() {
        try {
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

            const canonicalUsername = await this.getCanonicalUsername(user.raUsername);
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
                        announcedAchievements: [],
                        lastAwardType: 0
                    });
                }

                if (!progress.announcedAchievements.includes(achievement.ID)) {
                    const game = challengeGames.find(g => g.gameId === achievement.GameID.toString());
                    await this.announceAchievement(canonicalUsername, achievement, game);
                    
                    if (game) {
                        const currentAward = await Award.findOne({
                            raUsername: user.raUsername.toLowerCase(),
                            gameId: game.gameId,
                            month: new Date().getMonth() + 1,
                            year: new Date().getFullYear()
                        });

                        if (currentAward && currentAward.award > (progress.lastAwardType || 0)) {
                            await this.announceGameAward(
                                canonicalUsername,
                                game,
                                currentAward.award,
                                currentAward.achievementCount,
                                currentAward.totalAchievements
                            );
                            progress.lastAwardType = currentAward.award;
                        }
                    }
                    
                    progress.announcedAchievements.push(achievement.ID);
                    progress.lastAchievementTimestamp = achievementDate;
                    await progress.save();
                }
            }
        } catch (error) {
            console.error(`Error checking achievements for ${user.raUsername}:`, error);
        }
    }
/**
 * Checks if a game is beaten based on user's achievements
 * @param {string} username - RetroAchievements username
 * @param {Game} game - Game from database
 * @returns {Promise<boolean>} - Whether the game is beaten
 */
async isGameBeaten(username, game) {
    try {
        // Get user's game progress from RetroAchievements
        const progress = await this.raAPI.getUserGameProgress(username, game.gameId);
        
        if (!progress || !progress.achievements) {
            return false;
        }

        // Convert user's achievements to a Set for easy checking
        const userAchievements = new Set(
            Object.entries(progress.achievements)
                .filter(([_, ach]) => ach.DateEarned)
                .map(([id, _]) => id)
        );

        // Check win conditions first
        const hasWinConditions = game.requireAllWinConditions
            ? game.winCondition.every(id => userAchievements.has(id))
            : game.winCondition.some(id => userAchievements.has(id));

        if (!hasWinConditions) {
            return false;
        }

        // Check progression achievements
        // If requireProgression is false, we just need to have all the achievements in any order
        // If true, we'd need to check they were earned in the correct order
        const hasProgression = game.progression.every(id => userAchievements.has(id));

        return hasProgression;
    } catch (error) {
        console.error(`Error checking if game is beaten for ${username}:`, error);
        return false;
    }
}

/**
 * Updates award status for a user and game
 */
async updateAwardStatus(username, game) {
    try {
        const normalizedUsername = username.toLowerCase();
        const currentDate = new Date();
        
        // Find or create award record
        let award = await Award.findOne({
            raUsername: normalizedUsername,
            gameId: game.gameId,
            month: currentDate.getMonth() + 1,
            year: currentDate.getFullYear()
        });

        if (!award) {
            award = new Award({
                raUsername: normalizedUsername,
                gameId: game.gameId,
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear(),
                award: AwardType.NONE,
                achievementCount: 0,
                totalAchievements: 0,
                userCompletion: "0.00%"
            });
        }

        // Get current progress
        const progress = await this.raAPI.getUserGameProgress(username, game.gameId);
        if (!progress) return;

        // Update basic stats
        award.achievementCount = progress.earnedAchievements || 0;
        award.totalAchievements = progress.totalAchievements || 0;
        award.userCompletion = progress.userCompletion || "0.00%";

        // Determine award level
        let newAwardType = AwardType.NONE;

        // Check for participation (at least one achievement)
        if (award.achievementCount > 0) {
            newAwardType = AwardType.PARTICIPATION;

            // Check for beaten status
            if (await this.isGameBeaten(username, game)) {
                newAwardType = AwardType.BEATEN;

                // Check for mastery
                if (game.masteryCheck && award.userCompletion === "100.00%") {
                    newAwardType = AwardType.MASTERED;
                }
            }
        }

        // Update award if it's higher than current
        if (newAwardType > award.award) {
            award.award = newAwardType;
            // Trigger a feed announcement if this is a new award level
            if (this.feedChannel) {
                await this.announceGameAward(username, game, newAwardType, 
                    award.achievementCount, award.totalAchievements);
            }
        }

        await award.save();
        return award;
    } catch (error) {
        console.error(`Error updating award status for ${username}:`, error);
    }
}
   async announceAchievement(username, achievement, game) {
    if (this.isPaused) return;

    try {
        const canonicalUsername = await this.getCanonicalUsername(username);
        const announcementKey = `${canonicalUsername}-${achievement.ID}-${achievement.Date}`;
        if (this.announcementCache.get(announcementKey)) return;

        const profilePicUrl = await this.usernameUtils.getProfilePicUrl(canonicalUsername);
        const profileUrl = await this.usernameUtils.getProfileUrl(canonicalUsername);

        let authorName = '';
        let color = '#00FF00'; // Default color for non-challenge achievements
        let files = [];

        const logoFile = {
            attachment: './assets/logo_simple.png',
            name: 'game_logo.png'
        };

        // Check game type instead of specific IDs
        if (game) {
            if (game.type === 'SHADOW') {
                authorName = 'SHADOW GAME 🌑';
                color = '#FFD700'; // Gold
                files = [logoFile];
            } else if (game.type === 'MONTHLY') {
                authorName = 'MONTHLY CHALLENGE ☀️';
                color = '#00BFFF'; // Blue
                files = [logoFile];
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

        if (achievement.BadgeName) {
            embed.setThumbnail(`https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`);
        }

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

    async announceGameAward(username, game, awardType, achievementCount, totalAchievements) {
        if (this.isPaused) return;

        try {
            const canonicalUsername = await this.getCanonicalUsername(username);
            const announcementKey = `award-${canonicalUsername}-${game.gameId}-${awardType}-${Date.now()}`;
            
            if (this.announcementCache.get(announcementKey)) return;

            const profilePicUrl = await this.usernameUtils.getProfilePicUrl(canonicalUsername);
            const profileUrl = await this.usernameUtils.getProfileUrl(canonicalUsername);

            let awardEmoji, awardName, color;
            switch(awardType) {
                case AwardType.MASTERED:
                    awardEmoji = '✨';
                    awardName = 'Mastery';
                    color = '#FFD700';
                    break;
                case AwardType.BEATEN:
                    awardEmoji = '⭐';
                    awardName = 'Beaten';
                    color = '#C0C0C0';
                    break;
                case AwardType.PARTICIPATION:
                    awardEmoji = '🏁';
                    awardName = 'Participation';
                    color = '#CD7F32';
                    break;
                default:
                    return;
            }

            const gameTypeEmoji = game.type === 'SHADOW' ? '🌑' : '☀️';
            const files = [{
                attachment: './assets/logo_simple.png',
                name: 'game_logo.png'
            }];

            const embed = new EmbedBuilder()
                .setColor(color)
                .setAuthor({
                    name: `${game.type === 'SHADOW' ? 'SHADOW GAME' : 'MONTHLY CHALLENGE'} ${gameTypeEmoji}`,
                    iconURL: 'attachment://game_logo.png'
                })
                .setTitle(`${awardEmoji} ${awardName} Award Earned!`)
                .setDescription(
                    `**${canonicalUsername}** has earned the **${awardName} Award** for ${game.title}!\n` +
                    `Progress: ${achievementCount}/${totalAchievements} (${((achievementCount/totalAchievements)*100).toFixed(2)}%)`
                )
                .setURL(profileUrl)
                .setFooter({
                    text: `Game Awards • ${new Date().toLocaleTimeString()}`,
                    iconURL: profilePicUrl
                })
                .setTimestamp();

            await this.queueAnnouncement({ embeds: [embed], files });
            this.announcementCache.set(announcementKey, true);
        } catch (error) {
            console.error('Error announcing game award:', error);
        }
    }

    async announcePointsAward(username, points, reason) {
        if (this.isPaused) return;

        try {
            const canonicalUsername = await this.getCanonicalUsername(username);
            const announcementKey = `points-${canonicalUsername}-${points}-${reason}-${Date.now()}`;
            
            if (this.announcementCache.get(announcementKey)) return;

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
        this.announcementCache.clear();
        this.achievementCache.clear();
        console.log('Achievement service caches cleared');
    }
}

module.exports = AchievementService;
