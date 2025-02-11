// File: src/services/achievementTrackingService.js
const User = require('../models/User');
const Game = require('../models/Game');
const Award = require('../models/Award');
const PlayerProgress = require('../models/PlayerProgress');
const { AwardType } = require('../enums/AwardType');

class AchievementTrackingService {
    constructor(raAPI, usernameUtils, achievementFeedService) {
        if (!raAPI) {
            throw new Error('RetroAchievements API client is required');
        }
        if (!usernameUtils) {
            throw new Error('Username utils is required');
        }
        if (!achievementFeedService) {
            throw new Error('Achievement feed service is required');
        }

        this.raAPI = raAPI;
        this.usernameUtils = usernameUtils;
        this.feedService = achievementFeedService;
        
        // Start from 24 hours ago to catch up on missed achievements
        this.lastCheck = new Date(Date.now() - (24 * 60 * 60 * 1000));
        
        console.log('Achievement Tracking Service initialized');
    }

    /**
     * Check achievements for all users
     */
    async checkAchievements() {
        try {
            const users = await User.find({ isActive: true });
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
                    const canonicalUsername = await this.usernameUtils.getCanonicalUsername(user.raUsername);
                    if (!canonicalUsername) {
                        console.error(`Could not get canonical username for ${user.raUsername}`);
                        continue;
                    }

                    await this.checkUserAchievements(canonicalUsername, challengeGames);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limiting
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

    /**
     * Check achievements for a specific user
     */
    async checkUserAchievements(canonicalUsername, challengeGames) {
        try {
            const recentAchievements = await this.raAPI.getUserRecentAchievements(canonicalUsername);
            if (!Array.isArray(recentAchievements)) return;

            const processedAchievements = new Set();
            const normalizedUsername = canonicalUsername.toLowerCase();

            for (const achievement of recentAchievements) {
                const achievementDate = new Date(achievement.Date);
                if (achievementDate <= this.lastCheck) continue;

                const achievementKey = `${achievement.ID}-${achievement.GameID}-${achievementDate.getTime()}`;
                if (processedAchievements.has(achievementKey)) continue;
                processedAchievements.add(achievementKey);

                let progress = await PlayerProgress.findOne({
                    raUsername: normalizedUsername,
                    gameId: achievement.GameID
                });

                if (!progress) {
                    progress = new PlayerProgress({
                        raUsername: normalizedUsername,
                        gameId: achievement.GameID,
                        lastAchievementTimestamp: new Date(0),
                        announcedAchievements: [],
                        lastAwardType: AwardType.NONE
                    });
                }

                if (!progress.announcedAchievements.includes(achievement.ID)) {
                    const game = challengeGames.find(g => g.gameId === achievement.GameID.toString());
                    
                    // Announce achievement
                    await this.feedService.announceAchievement(canonicalUsername, achievement, game);
                    
                    if (game) {
                        // Update award status
                        const currentAward = await this.checkAndUpdateAward(canonicalUsername, game);
                        
                        // If award level increased, announce it
                        if (currentAward && currentAward.award > (progress.lastAwardType || 0)) {
                            await this.feedService.announceGameAward(
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
            console.error(`Error checking achievements for ${canonicalUsername}:`, error);
        }
    }

    /**
     * Check if a game is beaten based on user's achievements
     */
    async isGameBeaten(canonicalUsername, game) {
        try {
            const progress = await this.raAPI.getUserGameProgress(canonicalUsername, game.gameId);
            
            if (!progress || !progress.achievements) {
                return false;
            }

            // If they have 100% completion, they've definitely beaten it
            if (progress.userCompletion === "100.00%") {
                return true;
            }

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

            // Check progression requirements
            return !game.progression.length || 
                game.progression.every(id => userAchievements.has(id));
        } catch (error) {
            console.error(`Error checking if game is beaten for ${canonicalUsername}:`, error);
            return false;
        }
    }

    /**
     * Check and update award status for a user and game
     */
    async checkAndUpdateAward(canonicalUsername, game) {
        try {
            const normalizedUsername = canonicalUsername.toLowerCase();
            const currentDate = new Date();
            
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

            const progress = await this.raAPI.getUserGameProgress(canonicalUsername, game.gameId);
            if (!progress) return null;

            // Update achievement counts and completion
            award.achievementCount = progress.earnedAchievements || 0;
            award.totalAchievements = progress.totalAchievements || 0;
            award.userCompletion = progress.userCompletion || "0.00%";

            // Determine award level
            let newAwardType = AwardType.NONE;

            // Check for participation first
            if (award.achievementCount > 0) {
                newAwardType = AwardType.PARTICIPATION;

                // Check for completion conditions
                const hasBeaten = await this.isGameBeaten(canonicalUsername, game);
                const hasMastery = award.userCompletion === "100.00%";

                if (hasMastery && game.masteryCheck) {
                    newAwardType = AwardType.MASTERED;
                } else if (hasMastery || hasBeaten) {
                    newAwardType = AwardType.BEATEN;
                }
            }

            // Update award if level increased
            if (newAwardType > award.award) {
                award.award = newAwardType;
            }

            await award.save();
            return award;
        } catch (error) {
            console.error(`Error updating award status for ${canonicalUsername}:`, error);
            return null;
        }
    }

    /**
     * Get current award level for a user and game
     */
    async getCurrentAward(username, gameId) {
        try {
            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(username);
            if (!canonicalUsername) return null;

            const currentDate = new Date();
            const award = await Award.findOne({
                raUsername: canonicalUsername.toLowerCase(),
                gameId: gameId,
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear()
            });

            return award;
        } catch (error) {
            console.error(`Error getting current award for ${username}:`, error);
            return null;
        }
    }
}

module.exports = AchievementTrackingService;
