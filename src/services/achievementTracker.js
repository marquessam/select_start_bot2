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
                year: 2024,
                active: true
            }).distinct('gameId');

            console.log(`Found ${games.length} unique games for 2024`);

            for (const gameId of games) {
                const game = await Game.findOne({ gameId });
                console.log(`\nProcessing ${game.title} (${game.type}) from month ${game.month}`);
                
                const progress = await this.raAPI.getUserProgress(raUsername, gameId);
                await this.processGameProgress(raUsername, game, progress);
            }

        } catch (error) {
            console.error(`Error checking progress for ${raUsername}:`, error);
            throw error;
        }
    }

    checkBeatenStatus(game, achievements) {
        // Convert achievements object to array of earned achievement IDs
        const earnedAchievements = Object.entries(achievements)
            .filter(([_, ach]) => ach.dateEarned)
            .map(([id, _]) => id);

        let progressionComplete = true;
        let winConditionComplete = true;

        // Check progression achievements if required
        if (game.requireProgression && game.progression?.length > 0) {
            progressionComplete = game.progression.every(achId => 
                earnedAchievements.includes(achId)
            );
            console.log(`Progression check: ${progressionComplete ? 'Complete' : 'Incomplete'}`);
        }

        // Check win conditions
        if (game.winCondition?.length > 0) {
            if (game.requireAllWinConditions) {
                winConditionComplete = game.winCondition.every(achId => 
                    earnedAchievements.includes(achId)
                );
            } else {
                winConditionComplete = game.winCondition.some(achId => 
                    earnedAchievements.includes(achId)
                );
            }
            console.log(`Win condition check: ${winConditionComplete ? 'Complete' : 'Incomplete'}`);
        }

        return progressionComplete && winConditionComplete;
    }

    async processGameProgress(raUsername, game, progress) {
        try {
            const achievements = progress.achievements || {};
            const earnedCount = Object.values(achievements)
                .filter(ach => ach.dateEarned)
                .length;

            console.log(`${raUsername} has earned ${earnedCount}/${game.numAchievements} achievements in ${game.title}`);

            let awards = {
                participation: false,
                beaten: false,
                mastered: false
            };

            // Check participation (any achievement)
            if (earnedCount > 0) {
                awards.participation = true;
            }

            // Check beaten status
            if (earnedCount > 0) {
                awards.beaten = this.checkBeatenStatus(game, achievements);
            }

            // Check mastery (only for monthly games with masteryCheck enabled)
            if (game.type === 'MONTHLY' && game.masteryCheck && earnedCount === game.numAchievements) {
                awards.mastered = true;
                awards.beaten = true;  // Mastery implies beaten
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
                    achievementCount: earnedCount,
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
        console.log(`Starting achievement check for ${users.length} users`);

        for (const user of users) {
            try {
                await this.checkUserProgress(user.raUsername);
            } catch (error) {
                console.error(`Error checking user ${user.raUsername}:`, error);
                continue;
            }
        }
    }
}

module.exports = new AchievementTracker();
