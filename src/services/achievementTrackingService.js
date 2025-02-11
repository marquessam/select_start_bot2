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
                        announcedAchievements: [],
                        lastAwardType: 0
                    });
                }

                if (!progress.announcedAchievements.includes(achievement.ID)) {
                    const game = challengeGames.find(g => g.gameId === achievement.GameID.toString());
                    
                    // Announce achievement
                    await this.feedService.announceAchievement(canonicalUsername, achievement, game);
                    
                    if (game) {
                        await this.checkAndUpdateAward(user.raUsername, game, canonicalUsername);
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
     * Check if a game is beaten based on user's achievements
     */
    async isGameBeaten(username, game) {
        try {
            const progress = await this.raAPI.getUserGameProgress(username, game.gameId);
            
            if (!progress || !progress.achievements) {
                return false;
            }

            const userAchievements = new Set(
                Object.entries(progress.achievements)
                    .filter(([_, ach]) => ach.DateEarned)
                    .map(([id, _]) => id)
            );

            const hasWinConditions = game.requireAllWinConditions
                ? game.winCondition.every(id => userAchievements.has(id))
                : game.winCondition.some(id => userAchievements.has(id));

            if (!hasWinConditions) {
                return false;
            }

            return game.progression.every(id => userAchievements.has(id));
        } catch (error) {
            console.error(`Error checking if game is beaten for ${username}:`, error);
            return false;
        }
    }

    /**
     * Check and update award status for a user and game
     */
    async checkAndUpdateAward(username, game, canonicalUsername) {
        try {
            const normalizedUsername = username.toLowerCase();
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

            const progress = await this.raAPI.getUserGameProgress(username, game.gameId);
            if (!progress) return;

            award.achievementCount = progress.earnedAchievements || 0;
            award.totalAchievements = progress.totalAchievements || 0;
            award.userCompletion = progress.userCompletion || "0.00%";

            let newAwardType = AwardType.NONE;

            if (award.achievementCount > 0) {
                newAwardType = AwardType.PARTICIPATION;

                if (await this.isGameBeaten(username, game)) {
                    newAwardType = AwardType.BEATEN;

                    if (game.masteryCheck && award.userCompletion === "100.00%") {
                        newAwardType = AwardType.MASTERED;
                    }
                }
            }

            if (newAwardType > award.award) {
                award.award = newAwardType;
                if (this.feedService) {
                    await this.feedService.announceGameAward(
                        canonicalUsername, 
                        game, 
                        newAwardType,
                        award.achievementCount, 
                        award.totalAchievements
                    );
                }
            }

            await award.save();
            return award;
        } catch (error) {
            console.error(`Error updating award status for ${username}:`, error);
        }
    }
}

module.exports = AchievementTrackingService;
