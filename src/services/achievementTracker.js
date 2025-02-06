// File: src/services/achievementTracker.js
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const RetroAchievementsAPI = require('./retroAchievements');

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
            }).distinct('gameId');

            console.log(`Found ${games.length} unique games for 2025`);

            for (const gameId of games) {
                const game = await Game.findOne({ gameId });
                console.log(`\nProcessing ${game.title} (${game.type}) from month ${game.month}`);
                
                const progress = await this.raAPI.getUserGameProgress(raUsername, gameId);
                await this.processGameProgress(raUsername, game, progress);
            }

            console.log(`Completed all progress checks for ${raUsername}`);
        } catch (error) {
            console.error(`Error checking progress for ${raUsername}:`, error);
            throw error;
        }
    }

    async processGameProgress(raUsername, game, progress) {
        try {
            console.log(`Processing ${game.title} progress for ${raUsername}`);
            
            // Get the achievement numbers from progress data
            const earnedCount = progress.earnedAchievements || 0;
            const totalCount = progress.totalAchievements || 0;
            const userCompletion = progress.userCompletion || "0.00%";
            
            console.log(`Progress data: ${earnedCount}/${totalCount} achievements (${userCompletion})`);

            let awards = {
                participation: false,
                beaten: false,
                mastered: false
            };

            // Check participation
            if (earnedCount > 0) {
                awards.participation = true;
            }

            // Check beaten status
            if (earnedCount > 0 && game.winCondition) {
                const earnedAchievements = progress.achievements ? 
                    Object.entries(progress.achievements)
                        .filter(([_, ach]) => ach.DateEarned || ach.dateEarned)
                        .map(([id]) => id) : [];

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
                    awards.beaten = true;
                }
            }

            // Check mastery
            if (game.type === 'MONTHLY' && earnedCount === totalCount && earnedCount > 0) {
                awards.mastered = true;
                awards.beaten = true;
            }

            // Save complete data to database
            const updateResult = await Award.findOneAndUpdate(
                {
                    raUsername,
                    gameId: game.gameId,
                    month: game.month,
                    year: 2025
                },
                {
                    $set: {
                        achievementCount: earnedCount,
                        totalAchievements: totalCount,
                        userCompletion,
                        awards,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true, new: true }
            );

            console.log('Updated award:', {
                game: game.title,
                earned: earnedCount,
                total: totalCount,
                completion: userCompletion,
                awards
            });

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
