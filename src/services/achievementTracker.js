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
            
            // Get active monthly and shadow games
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const activeGames = await Game.find({
                month: currentMonth,
                year: currentYear
            });

            console.log(`Found ${activeGames.length} active games`);

            for (const game of activeGames) {
                console.log(`Processing game: ${game.title}`);
                const progress = await this.raAPI.getUserProgress(raUsername, game.gameId);
                await this.processGameProgress(raUsername, game, progress);
            }

            // Update user's last checked timestamp
            await User.findOneAndUpdate(
                { raUsername },
                { lastChecked: new Date() }
            );

            console.log(`Completed progress check for ${raUsername}`);

        } catch (error) {
            console.error(`Error checking progress for user ${raUsername}:`, error);
            throw error;
        }
    }

    async processGameProgress(raUsername, game, progress) {
        try {
            console.log(`Processing ${game.title} progress for ${raUsername}`);
            
            const achievements = progress.achievements || {};
            const earnedCount = Object.values(achievements)
                .filter(ach => ach.dateEarned)
                .length;

            console.log(`User has earned ${earnedCount} achievements`);

            const earned = {
                participation: earnedCount > 0,
                beaten: false,
                mastered: false
            };

            // Check if game is beaten (all progression achievements)
            if (game.progressionAchievements && game.progressionAchievements.length > 0) {
                const hasAllProgression = game.progressionAchievements
                    .every(progAch => achievements[progAch.id]?.dateEarned);
                earned.beaten = hasAllProgression;
            }

            // Check mastery (all achievements, only for monthly games)
            if (game.type === 'MONTHLY' && earnedCount === game.numAchievements) {
                earned.mastered = true;
            }

            console.log(`Awards status: ${JSON.stringify(earned)}`);

            // Create or update award record
            const award = new Award({
                userId: raUsername,
                raUsername,
                gameId: game.gameId,
                month: game.month,
                year: game.year,
                awards: earned,
                achievementCount: earnedCount,
                lastUpdated: new Date()
            });

            // Use findOneAndUpdate with upsert
            await Award.findOneAndUpdate(
                {
                    raUsername,
                    gameId: game.gameId,
                    month: game.month,
                    year: game.year
                },
                {
                    $set: {
                        awards: earned,
                        achievementCount: earnedCount,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true, new: true }
            );

            console.log(`Successfully updated awards for ${raUsername}`);

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
