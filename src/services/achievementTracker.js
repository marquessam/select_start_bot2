// File: src/services/achievementTracker.js
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const PlayerProgress = require('../models/PlayerProgress');
const RetroAchievementsAPI = require('./retroAchievements');
const { AwardType } = require('../enums/AwardType');

class AchievementTracker {
    constructor() {
        this.raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );
    }

    async checkUserProgress(raUsername) {
        try {
            console.log(`\nChecking progress for user ${raUsername}...`);
            
            const games = await Game.find({
                year: 2025,
                active: true
            });

            console.log(`Found ${games.length} active games for 2025`);

            for (const game of games) {
                await this.processGameProgress(raUsername, game);
            }

            console.log(`Completed all progress checks for ${raUsername}`);
        } catch (error) {
            console.error(`Error checking progress for ${raUsername}:`, error);
            throw error;
        }
    }

    async processGameProgress(raUsername, game) {
        try {
            console.log(`Processing ${game.title} progress for ${raUsername}`);
            
            // Get player's progress record or create new one
            let progress = await PlayerProgress.findOne({
                raUsername,
                gameId: game.gameId
            });

            if (!progress) {
                progress = new PlayerProgress({
                    raUsername,
                    gameId: game.gameId,
                    lastAchievementTimestamp: new Date(0),
                    announcedAchievements: []
                });
            }

            // Get achievements since last check
            const newAchievements = await this.raAPI.getUserGameProgress(raUsername, game.gameId);
            const earnedAchievements = Object.entries(newAchievements.achievements || {})
                .filter(([_, ach]) => ach.DateEarned || ach.dateEarned)
                .map(([id]) => id);

            // Calculate award level
            let awardLevel = AwardType.NONE;

            // Check participation
            if (earnedAchievements.length > 0) {
                awardLevel = AwardType.PARTICIPATION;

                // Check beaten status
                if (game.winCondition) {
                    let progressionMet = !game.requireProgression;
                    if (game.requireProgression && game.progression) {
                        progressionMet = game.progression.every(id => 
                            earnedAchievements.includes(id)
                        );
                    }

                    let winConditionMet = false;
                    if (game.requireAllWinConditions) {
                        winConditionMet = game.winCondition.every(id => 
                            earnedAchievements.includes(id)
                        );
                    } else {
                        winConditionMet = game.winCondition.some(id => 
                            earnedAchievements.includes(id)
                        );
                    }

                    if (progressionMet && winConditionMet) {
                        awardLevel = AwardType.BEATEN;
                    }
                }

                // Check mastery
                if (game.type === 'MONTHLY' && 
                    newAchievements.userCompletion === "100.00%" && 
                    game.masteryCheck) {
                    awardLevel = AwardType.MASTERED;
                }
            }

            // Update award in database
            await Award.findOneAndUpdate(
                {
                    raUsername,
                    gameId: game.gameId,
                    month: game.month,
                    year: game.year
                },
                {
                    $set: {
                        award: awardLevel,
                        lastChecked: new Date()
                    }
                },
                { upsert: true }
            );

            // Update player progress
            progress.lastAchievementTimestamp = new Date();
            await progress.save();

        } catch (error) {
            console.error(`Error processing progress for ${raUsername} in ${game.title}:`, error);
            throw error;
        }
    }

    async checkAllUsers() {
        try {
            const users = await User.find({ isActive: true });
            console.log(`Starting achievement check for ${users.length} users`);

            for (const user of users) {
                try {
                    await this.checkUserProgress(user.raUsername);
                } catch (error) {
                    console.error(`Error checking user ${user.raUsername}:`, error);
                    continue;  // Continue with next user even if one fails
                }
            }

            console.log('Completed checking all users');
        } catch (error) {
            console.error('Error in checkAllUsers:', error);
            throw error;
        }
    }
}

module.exports = new AchievementTracker();
