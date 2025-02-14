import { EmbedBuilder } from 'discord.js';
import { Award, Game, PlayerProgress, User } from '../models/index.js';
import retroAPI from './retroAPI.js';
import { AwardType } from '../config/config.js';

class AchievementTracker {
    constructor(client) {
        this.client = client;
        this.achievementChannel = null;
    }

    /**
     * Initialize the achievement channel
     * @param {string} channelId - Discord channel ID for achievement announcements
     */
    setAchievementChannel(channelId) {
        this.achievementChannel = this.client.channels.cache.get(channelId);
        if (!this.achievementChannel) {
            throw new Error('Achievement channel not found');
        }
    }

    /**
     * Check achievements for all active users
     */
    async checkAllUsers() {
        try {
            const users = await User.find({ isActive: true });
            console.log(`Checking achievements for ${users.length} users`);

            for (const user of users) {
                await this.checkUserAchievements(user.raUsername);
            }
        } catch (error) {
            console.error('Error checking all users:', error);
        }
    }

    /**
     * Check achievements for a specific user
     * @param {string} username - RetroAchievements username
     */
    async checkUserAchievements(username) {
        try {
            const recentAchievements = await retroAPI.getUserRecentAchievements(username);
            if (!recentAchievements.length) return;

            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            // Get current monthly and shadow games
            const currentGames = await Game.find({
                month: currentMonth,
                year: currentYear,
                active: true
            });

            for (const achievement of recentAchievements) {
                await this.processAchievement(username, achievement, currentGames);
            }
        } catch (error) {
            console.error(`Error checking achievements for ${username}:`, error);
        }
    }

    /**
     * Process a single achievement
     * @param {string} username - RetroAchievements username
     * @param {Object} achievement - Achievement data from RetroAchievements
     * @param {Array} currentGames - Array of current monthly and shadow games
     */
    async processAchievement(username, achievement, currentGames) {
        try {
            const gameId = achievement.gameId.toString();
            const game = currentGames.find(g => g.gameId === gameId);

            // Get or create player progress
            let progress = await PlayerProgress.findOne({ raUsername: username, gameId });
            if (!progress) {
                progress = new PlayerProgress({
                    raUsername: username,
                    gameId,
                    currentAchievements: 0,
                    totalGameAchievements: 0
                });
            }

            // Check if achievement has already been announced
            if (progress.shouldAnnounceAchievement(achievement.achievementId)) {
                // Update progress
                progress.currentAchievements++;
                progress.announcedAchievements.push(achievement.achievementId);
                progress.lastAchievementTimestamp = new Date(achievement.dateEarned);

                // If this is a current game, check for progression/win conditions
                if (game) {
                    if (game.progression.includes(achievement.achievementId)) {
                        progress.progressionCompleted.push(achievement.achievementId);
                    }
                    if (game.winCondition.includes(achievement.achievementId)) {
                        progress.winConditionsCompleted.push(achievement.achievementId);
                    }

                    // Update award if applicable
                    await this.updateAward(username, game, progress);
                }

                await progress.save();

                // Announce the achievement
                await this.announceAchievement(username, achievement, game);
            }
        } catch (error) {
            console.error(`Error processing achievement for ${username}:`, error);
        }
    }

    /**
     * Update award status for a user
     * @param {string} username - RetroAchievements username
     * @param {Game} game - Game document
     * @param {PlayerProgress} progress - PlayerProgress document
     */
    async updateAward(username, game, progress) {
        try {
            let awardType = AwardType.NONE;

            // Check for highest award level achieved
            if (progress.hasParticipation()) {
                awardType = AwardType.PARTICIPATION;
            }
            
            if (progress.hasBeaten(game)) {
                awardType = AwardType.BEATEN;
            }
            
            if (game.type === 'MONTHLY' && progress.hasMastery(game)) {
                awardType = AwardType.MASTERY;
            }

            // Only update if award type has changed
            if (awardType !== progress.lastAwardType) {
                const award = await Award.findOneAndUpdate(
                    {
                        raUsername: username,
                        gameId: game.gameId,
                        month: game.month,
                        year: game.year
                    },
                    {
                        award: awardType,
                        achievementCount: progress.currentAchievements,
                        totalAchievements: progress.totalGameAchievements,
                        userCompletion: progress.getCompletionPercentage() + '%',
                        lastChecked: new Date()
                    },
                    { upsert: true, new: true }
                );

                // Update user points
                const user = await User.findOne({ raUsernameLower: username.toLowerCase() });
                if (user) {
                    const pointDiff = Award.calculatePoints(awardType) - Award.calculatePoints(progress.lastAwardType);
                    if (pointDiff !== 0) {
                        user.updatePoints(game.month, game.year, pointDiff);
                        await user.save();
                    }
                }

                progress.lastAwardType = awardType;
                await progress.save();

                // Announce new award if achieved
                if (awardType > AwardType.NONE) {
                    await this.announceAward(username, game, awardType);
                }
            }
        } catch (error) {
            console.error(`Error updating award for ${username}:`, error);
        }
    }

    /**
     * Announce an achievement in Discord
     * @param {string} username - RetroAchievements username
     * @param {Object} achievement - Achievement data
     * @param {Game} game - Game document (optional)
     */
    async announceAchievement(username, achievement, game = null) {
        if (!this.achievementChannel) return;

        try {
            const embed = new EmbedBuilder()
                .setColor(game ? '#00ff00' : '#0099ff')
                .setTitle('🏆 Achievement Unlocked!')
                .setDescription(`**${username}** earned an achievement in ${achievement.gameTitle}!`)
                .addFields(
                    { name: 'Achievement', value: achievement.title, inline: true },
                    { name: 'Game', value: achievement.gameTitle, inline: true },
                    { name: 'Type', value: game ? `${game.type} Challenge` : 'Other Game', inline: true }
                )
                .setTimestamp(new Date(achievement.dateEarned));

            await this.achievementChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error announcing achievement:', error);
        }
    }

    /**
     * Announce a new award in Discord
     * @param {string} username - RetroAchievements username
     * @param {Game} game - Game document
     * @param {number} awardType - Award type from AwardType enum
     */
    async announceAward(username, game, awardType) {
        if (!this.achievementChannel) return;

        try {
            const awardNames = {
                [AwardType.PARTICIPATION]: 'Participation',
                [AwardType.BEATEN]: 'Beaten',
                [AwardType.MASTERY]: 'Mastery'
            };

            const embed = new EmbedBuilder()
                .setColor('#ffd700')
                .setTitle('🎉 New Award Achieved!')
                .setDescription(`**${username}** has earned a new award!`)
                .addFields(
                    { name: 'Award', value: awardNames[awardType], inline: true },
                    { name: 'Game', value: game.title, inline: true },
                    { name: 'Type', value: game.type, inline: true },
                    { name: 'Points Earned', value: Award.calculatePoints(awardType).toString(), inline: true }
                )
                .setTimestamp();

            await this.achievementChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error announcing award:', error);
        }
    }
}

// Create and export singleton instance
const achievementTracker = new AchievementTracker();
export default achievementTracker;
