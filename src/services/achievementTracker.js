// File: src/services/achievementTracker.js
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const PlayerProgress = require('../models/PlayerProgress');
const RetroAchievementsAPI = require('./retroAchievements');
const { AwardType } = require('../enums/AwardType');

class AchievementTracker {
    constructor() {
        console.log('Initializing Achievement Tracker...');
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
            console.log(`Processing batch for ${users.length} users and ${games.length} games`);
            
            // Build batch of needed checks
            for (const user of users) {
                for (const game of games) {
                    const award = await Award.findOne({
                        raUsername: user.raUsername,
                        gameId: game.gameId,
                        month: game.month,
                        year: game.year
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
            console.log(`Created batch of ${batch.length} items to process`);

            // Process in parallel with rate limiting
            const chunks = [];
            for (let i = 0; i < batch.length; i += this.maxConcurrent) {
                chunks.push(batch.slice(i, i + this.maxConcurrent));
            }

            console.log(`Split into ${chunks.length} chunks for processing`);

            for (const chunk of chunks) {
                await Promise.all(
                    chunk.map(({ user, game }) => 
                        this.processGameProgress(user.raUsername, game)
                    )
                );
                // Add delay between chunks to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            console.log('Batch processing completed');
        } catch (error) {
            console.error('Error processing batch:', error);
            throw error;
        }
    }

    async processGameProgress(raUsername, game) {
        try {
            console.log(`\nProcessing ${game.title} progress for ${raUsername}`);
            console.log('Game requirements:', {
                type: game.type,
                requireProgression: game.requireProgression,
                requireAllWinConditions: game.requireAllWinConditions,
                masteryCheck: game.masteryCheck,
                progressionCount: game.progression?.length || 0,
                winConditionCount: game.winCondition?.length || 0
            });
            
            // Get player's progress record
            let progressRecord = await PlayerProgress.findOne({
                raUsername,
                gameId: game.gameId
            }) || new PlayerProgress({
                raUsername,
                gameId: game.gameId,
                lastAchievementTimestamp: new Date(0),
                announcedAchievements: []
            });

            // Get progress with error handling
            const progress = await this.raAPI.getUserGameProgress(raUsername, game.gameId)
                .catch(err => {
                    console.error(`Error fetching progress for ${raUsername} in ${game.title}:`, err);
                    return null;
                });

            if (!progress) {
                console.log(`No progress data available for ${raUsername} in ${game.title}`);
                return;
            }

            // Extract earned achievements
            const earnedAchievements = Object.entries(progress.achievements || {})
                .filter(([_, ach]) => ach && (ach.DateEarned || ach.dateEarned))
                .map(([id]) => id);

            console.log(`User has earned ${earnedAchievements.length} achievements`);

            // Calculate award level with detailed logging
            let awardLevel = AwardType.NONE;
            const awardDetails = [];

            // FIRST: Check participation - ANY achievements = participation
            if (earnedAchievements.length > 0) {
                awardLevel = AwardType.PARTICIPATION;
                awardDetails.push(`Participation: ${earnedAchievements.length} achievements earned`);

                // SECOND: Check beaten requirements
                let beatenRequirementsMet = true;

                // Check progression if it exists
                if (game.progression && game.progression.length > 0) {
                    const earnedProgression = game.progression.filter(id => 
                        earnedAchievements.includes(id)
                    );
                    
                    if (game.requireProgression) {
                        // Check if they're earned in order
                        const progressionInOrder = game.progression.every((id, index) => {
                            if (!earnedAchievements.includes(id)) return false;
                            if (index > 0) {
                                return game.progression
                                    .slice(0, index)
                                    .every(prevId => earnedAchievements.includes(prevId));
                            }
                            return true;
                        });
                        beatenRequirementsMet = beatenRequirementsMet && progressionInOrder;
                        awardDetails.push(`Progression: ${earnedProgression.length}/${game.progression.length} (In Order: ${progressionInOrder})`);
                    } else {
                        // Just check if all are earned (any order)
                        beatenRequirementsMet = beatenRequirementsMet && 
                            (earnedProgression.length === game.progression.length);
                        awardDetails.push(`Progression: ${earnedProgression.length}/${game.progression.length} (Any Order)`);
                    }
                }

                // Check win conditions
                if (game.winCondition && game.winCondition.length > 0) {
                    const earnedWinConditions = game.winCondition.filter(id => 
                        earnedAchievements.includes(id)
                    );
                    
                    if (game.requireAllWinConditions) {
                        beatenRequirementsMet = beatenRequirementsMet && 
                            (earnedWinConditions.length === game.winCondition.length);
                        awardDetails.push(`Win Conditions: ${earnedWinConditions.length}/${game.winCondition.length} (All Required)`);
                    } else {
                        beatenRequirementsMet = beatenRequirementsMet && 
                            (earnedWinConditions.length > 0);
                        awardDetails.push(`Win Conditions: ${earnedWinConditions.length}/${game.winCondition.length} (Any Required)`);
                    }
                }

                // If all beaten requirements are met, upgrade to beaten
                if (beatenRequirementsMet) {
                    awardLevel = AwardType.BEATEN;
                    awardDetails.push('Game beaten (all requirements met)');
                }

                // FINALLY: Check mastery
                if (game.type === 'MONTHLY' && 
                    progress.userCompletion === "100.00%" && 
                    game.masteryCheck) {
                    awardLevel = AwardType.MASTERED;
                    awardDetails.push('Game mastered (100% completion)');
                }
            }

            console.log('Award calculation details:', {
                username: raUsername,
                game: game.title,
                awardLevel: AwardType[awardLevel],
                details: awardDetails
            });

            // Update award in database
            const awardUpdate = {
                award: awardLevel,
                achievementCount: earnedAchievements.length,
                totalAchievements: game.numAchievements || progress.numAchievements || 0,
                userCompletion: progress.userCompletion || "0.00%",
                lastChecked: new Date(),
                checkPriority: this.calculateCheckPriority(earnedAchievements.length)
            };

            await Award.findOneAndUpdate(
                {
                    raUsername,
                    gameId: game.gameId,
                    month: game.month,
                    year: game.year
                },
                { $set: awardUpdate },
                { upsert: true, new: true }
            );

            // Update progress record
            progressRecord.lastAchievementTimestamp = new Date();
            await progressRecord.save();

        } catch (error) {
            console.error(`Error processing progress for ${raUsername} in ${game.title}:`, error);
            throw error;
        }
    }

    calculateCheckPriority(achievementCount) {
        // Higher priority for users with more achievements
        if (achievementCount > 20) return 3;
        if (achievementCount > 10) return 2;
        if (achievementCount > 0) return 1;
        return 0;
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
                    // Add delay between games
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    console.error(`Error processing game ${game.title} for ${raUsername}:`, error);
                    continue;
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

            console.log(`Starting check for ${users.length} users and ${games.length} games`);
            await this.processBatch(users, games);
            console.log('Completed checkAllUsers');
        } catch (error) {
            console.error('Error in checkAllUsers:', error);
            throw error;
        }
    }
}

// Create and export a single instance
const tracker = new AchievementTracker();
module.exports = tracker;
