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
                year: 2025,  // Fixed year to 2025
                active: true
            }).distinct('gameId');

            console.log(`Found ${games.length} unique games for 2025`);

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

    
async processGameProgress(raUsername, game, progress) {
    try {
        console.log(`Processing ${game.title} progress for ${raUsername}`);
        
        // Get the counts from the progress data
        const earnedCount = progress.earnedAchievements;
        const totalCount = progress.numAchievements || game.numAchievements;
        
        console.log(`Progress data: ${earnedCount}/${totalCount} achievements`);

        let awards = {
            participation: false,
            beaten: false,
            mastered: false
        };

        // Award checks here...
        if (earnedCount > 0) {
            awards.participation = true;
            // Rest of the award logic...
        }

        // Save to database with complete achievement data
        await Award.findOneAndUpdate(
            {
                raUsername,
                gameId: game.gameId,
                month: game.month,
                year: 2025
            },
            {
                $set: {
                    achievementCount: earnedCount,
                    numAchievements: totalCount,  // Store the total
                    userCompletion: progress.userCompletion,
                    awards,
                    lastUpdated: new Date()
                }
            },
            { upsert: true }
        );

        console.log(`Updated awards for ${raUsername} in ${game.title}:`, {
            earned: earnedCount,
            total: totalCount,
            completion: progress.userCompletion,
            awards
        });

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
