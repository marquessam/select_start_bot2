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
        console.log('Progress data:', {
            userCompletion: progress.userCompletion,
            achievementsEarned: `${progress.earnedAchievements}/${progress.numAchievements}`
        });

        let awards = {
            participation: false,
            beaten: false,
            mastered: false
        };

        // Check participation
        if (progress.earnedAchievements > 0) {
            awards.participation = true;
            
            // Check beaten status
            if (game.winCondition && game.winCondition.length > 0) {
                const earnedAchievements = Object.keys(progress.achievements || {})
                    .filter(id => progress.achievements[id].DateEarned || progress.achievements[id].dateEarned);

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
        }

        // Check mastery
        if (game.type === 'MONTHLY' && 
            progress.earnedAchievements === progress.numAchievements && 
            progress.earnedAchievements > 0) {
            awards.mastered = true;
            awards.beaten = true;
        }

        // Save to database with all the info we need
        await Award.findOneAndUpdate(
            {
                raUsername,
                gameId: game.gameId,
                month: game.month,
                year: game.year
            },
            {
                achievementCount: progress.earnedAchievements,
                totalAchievements: progress.numAchievements,
                userCompletion: progress.userCompletion,
                awards,
                lastUpdated: new Date()
            },
            { upsert: true }
        );

        console.log(`Updated awards for ${raUsername} in ${game.title}:`, awards);

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
