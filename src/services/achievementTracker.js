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
        this.maxConcurrent = 3;  // Maximum concurrent API requests
        this.checkInterval = 15 * 60 * 1000;  // 15 minutes between checks
    }

    async processBatch(users, games) {
        try {
            const batch = [];
            
            // Build batch of needed checks
            for (const user of users) {
                for (const game of games) {
                    const award = await Award.findOne({
                        raUsername: user.raUsername,
                        gameId: game.gameId
                    });

                    // Check if this needs processing
                    if (!award || 
                        Date.now() - award.lastChecked.getTime() > this.checkInterval) {
                        batch.push({ user, game, priority: award?.checkPriority || 0 });
                    }
                }
            }

            // Sort by priority (higher numbers first)
            batch.sort((a, b) => b.priority - a.priority);

            // Process in parallel with rate limiting
            const chunks = [];
            for (let i = 0; i < batch.length; i += this.maxConcurrent) {
                chunks.push(batch.slice(i, i + this.maxConcurrent));
            }

            for (const chunk of chunks) {
                await Promise.all(
                    chunk.map(({ user, game }) => 
                        this.processGameProgress(user.raUsername, game)
                    )
                );
            }
        } catch (error) {
            console.error('Error processing batch:', error);
            throw error;
        }
    }

    async processGameProgress(raUsername, game) {
        try {
            console.log(`Processing ${game.title} progress for ${raUsername}`);
            
            // Get player's progress record or create new one
            let progressRecord = await PlayerProgress.findOne({
                raUsername,
                gameId: game.gameId
            });

            if (!progressRecord) {
                progressRecord = new PlayerProgress({
                    raUsername,
                    gameId: game.gameId,
                    lastAchievementTimestamp: new Date(0),
                    announcedAchievements: []
                });
            }

            // Get progress from cached API
            const progress = await this.raAPI.getUserGameProgress(raUsername, game.gameId);
            
            // Extract earned achievements
            const earnedAchievements = Object.entries(progress.achievements || {})
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
                    progress.userCompletion === "100.00%" && 
                    game.masteryCheck) {
                    awardLevel = AwardType.MASTERED;
                }
            }

            // Get existing award or create new one
            const existingAward = await Award.findOne({
                raUsername,
                gameId: game.gameId,
                month: game.month,
                year: game.year
            });

            // Only update if there are changes
            if (!existingAward || 
                existingAward.award !== awardLevel || 
                existingAward.achievementCount !== progress.earnedAchievements) {
                
                // Store both award level and progress data
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
                            achievementCount: progress.earnedAchievements || 0,
                            totalAchievements: progress.totalAchievements || 0,
                            userCompletion: progress.userCompletion || "0.00%",
                            lastChecked: new Date(),
                            // Increase priority for users who are actively earning achievements
                            checkPriority: (existingAward?.achievementCount || 0) < progress.earnedAchievements ? 1 : 0
                        }
                    },
                    { upsert: true }
                );

                console.log(`Updated award for ${raUsername} in ${game.title}:`, {
                    award: awardLevel,
                    achievements: `${progress.earnedAchievements}/${progress.totalAchievements}`,
                    completion: progress.userCompletion
                });
            } else {
                // Update last checked time even if no changes
                await Award.findOneAndUpdate(
                    {
                        raUsername,
                        gameId: game.gameId,
                        month: game.month,
                        year: game.year
                    },
                    {
                        $set: {
                            lastChecked: new Date(),
                            // Decrease priority for inactive users
                            checkPriority: Math.max(0, (existingAward.checkPriority || 0) - 1)
                        }
                    }
                );
            }

            // Update progress record
            progressRecord.lastAchievementTimestamp = new Date();
            await progressRecord.save();

        } catch (error) {
            console.error(`Error processing progress for ${raUsername} in ${game.title}:`, error);
            throw error;
        }
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
                try {
                    await this.processGameProgress(raUsername, game);
                } catch (error) {
                    console.error(`Error processing game ${game.title} for ${raUsername}:`, error);
                    continue; // Continue with next game even if one fails
                }
            }

            console.log(`Completed all progress checks for ${raUsername}`);
        } catch (error) {
            console.error(`Error checking progress for ${raUsername}:`, error);
            throw error;
        }
    }

    async checkAllUsers() {
        try {
            const users = await User.find({ isActive: true });
            const games = await Game.find({ 
                year: 2025,
                active: true
            });

            console.log(`Starting optimized check for ${users.length} users and ${games.length} games`);

            await this.processBatch(users, games);

            console.log('Completed optimized check');
        } catch (error) {
            console.error('Error in checkAllUsers:', error);
            throw error;
        }
    }
}

module.exports = new AchievementTracker();
