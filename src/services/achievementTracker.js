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
        
        // Get all unique games for 2024
        const games = await Game.find({
            year: 2024,
            active: true
        }).distinct('gameId');

        console.log(`Found ${games.length} unique games for 2024`);

        // Process each game only once
        for (const gameId of games) {
            const game = await Game.findOne({ gameId });
            console.log(`Processing ${game.title} (${game.type}) from month ${game.month}`);
            
            const progress = await this.raAPI.getUserProgress(raUsername, gameId);
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
        const userAchievements = Object.values(achievements)
            .filter(ach => ach.dateEarned)
            .length;

        console.log(`${raUsername} has earned ${userAchievements}/${totalAchievements} in ${game.title}`);

        let awards = {
            participation: false,
            beaten: false,
            mastered: false
        };

        // Simple sequential checks
        if (userAchievements > 0) {
            awards.participation = true;
        }

        if (userAchievements === totalAchievements) {
            awards.participation = true;
            awards.beaten = true;
            if (game.type === 'MONTHLY') {
                awards.mastered = true;
            }
        }

        console.log(`Awards for ${raUsername} in ${game.title}:`, awards);

        // Update database
        await Award.updateOne(
            {
                raUsername,
                gameId: game.gameId,
                month: game.month,
                year: game.year
            },
            {
                $set: {
                    awards,
                    achievementCount: userAchievements,
                    lastUpdated: new Date()
                }
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
