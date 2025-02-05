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
            console.log(`Checking progress for user ${raUsername}...`);
            
            // Get all games for 2024
            const games = await Game.find({
                year: 2024,
                active: true
            });

            console.log(`Found ${games.length} games for 2024`);

            for (const game of games) {
                console.log(`Processing ${game.title} (${game.type}) from month ${game.month}`);
                const progress = await this.raAPI.getUserProgress(raUsername, game.gameId);
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
            const achievements = progress.achievements || {};
            const totalAchievements = game.numAchievements;
            const earnedAchievements = Object.values(achievements)
                .filter(ach => ach.dateEarned)
                .length;

            console.log(`${raUsername} has earned ${earnedAchievements}/${totalAchievements} in ${game.title}`);

            // Simple award logic
            let awards = {
                participation: earnedAchievements > 0,
                beaten: false,
                mastered: false
            };

            // Check for mastery first (100% completion)
            if (earnedAchievements === totalAchievements) {
                awards.participation = true;
                awards.beaten = true;
                awards.mastered = true;
            }
            // If not mastered but has some achievements, check for beaten
            else if (earnedAchievements > 0) {
                awards.participation = true;
                // Check win conditions for beaten status
                if (game.progressionAchievements && game.progressionAchievements.length > 0) {
                    const hasBeaten = game.progressionAchievements
                        .every(achId => achievements[achId]?.dateEarned);
                    awards.beaten = hasBeaten;
                }
            }

            console.log(`Awards for ${raUsername} in ${game.title}:`, awards);

            // Update database
            await Award.findOneAndUpdate(
                {
                    raUsername,
                    gameId: game.gameId,
                    month: game.month,
                    year: game.year
                },
                {
                    awards,
                    achievementCount: earnedAchievements,
                    lastUpdated: new Date()
                },
                { upsert: true }
            );

        } catch (error) {
            console.error(`Error processing progress for ${raUsername} in ${game.title}:`, error);
            throw error;
        }
    }

    async checkAllUsers() {
        const users = await User.find({ isActive: true });
        for (const user of users) {
            await this.checkUserProgress(user.raUsername);
        }
    }
}

module.exports = new AchievementTracker();
