// File: src/services/achievementTracker.js
const { Game, Award } = require('../models/Game');
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
            // Get active monthly and shadow games
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-based
            const currentYear = currentDate.getFullYear();

            const activeGames = await Game.find({
                month: currentMonth,
                year: currentYear
            });

            for (const game of activeGames) {
                const progress = await this.raAPI.getUserProgress(raUsername, game.gameId);
                await this.processGameProgress(raUsername, game, progress);
            }

            // Update user's last checked timestamp
            await User.findOneAndUpdate(
                { raUsername },
                { lastChecked: new Date() }
            );

        } catch (error) {
            console.error(`Error checking progress for user ${raUsername}:`, error);
            throw error;
        }
    }

    async processGameProgress(raUsername, game, progress) {
        try {
            let earned = {
                participation: false,
                beaten: false,
                mastered: false
            };

            const achievements = progress.achievements || {};
            const earnedCount = Object.values(achievements)
                .filter(ach => ach.dateEarned)
                .length;

            // Check participation (any achievement)
            if (earnedCount > 0) {
                earned.participation = true;
            }

            // Check if game is beaten (all progression achievements)
            if (game.progressionAchievements.length > 0) {
                const hasAllProgression = game.progressionAchievements
                    .every(progAch => achievements[progAch.id]?.dateEarned);
                if (hasAllProgression) {
                    earned.beaten = true;
                }
            }

            // Check mastery (all achievements, only for monthly games)
            if (game.type === 'MONTHLY' && earnedCount === game.numAchievements) {
                earned.mastered = true;
            }

            // Update or create award record
            await Award.findOneAndUpdate(
                {
                    userId: raUsername,
                    gameId: game.gameId,
                    month: game.month,
                    year: game.year
                },
                {
                    raUsername,
                    awards: earned,
                    achievementCount: earnedCount,
                    lastUpdated: new Date()
                },
                { upsert: true }
            );

        } catch (error) {
            console.error(`Error processing game progress for user ${raUsername}, game ${game.gameId}:`, error);
            throw error;
        }
    }

    async checkAllUsers() {
        const users = await User.find({ isActive: true });
        console.log(`Starting achievement check for ${users.length} users`);

        for (const user of users) {
            try {
                await this.checkUserProgress(user.raUsername);
                console.log(`Completed checking achievements for ${user.raUsername}`);
            } catch (error) {
                console.error(`Error checking user ${user.raUsername}:`, error);
                // Continue with next user even if one fails
                continue;
            }
        }

        console.log('Completed checking all users');
    }
}

module.exports = new AchievementTracker();
