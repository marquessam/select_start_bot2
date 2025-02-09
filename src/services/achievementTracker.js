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
        this.maxConcurrent = 3;
        this.checkInterval = 15 * 60 * 1000;
    }

    async processBatch(users, games) {
        try {
            const batch = [];
            console.log(`Processing batch for ${users.length} users and ${games.length} games`);
            
            // Build batch of needed checks - always include all users/games
            for (const user of users) {
                for (const game of games) {
                    batch.push({ user, game, priority: 0 });
                }
            }

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
            
            // Get progress with error handling
            const progress = await this.raAPI.getUserGameProgress(raUsername, game.gameId)
                .catch(err => {
                    console.error(`Error fetching progress for ${raUsername} in ${game.title}:`, err);
                    return null;
                });

            if (!progress || !progress.achievements) {
                console.log(`No progress data available for ${raUsername} in ${game.title}`);
                return;
            }

            // Extract earned achievements
            const earnedAchievements = Object.entries(progress.achievements)
                .filter(([_, ach]) => ach && (ach.DateEarned || ach.dateEarned))
                .map(([id]) => id);

            console.log(`User ${raUsername} has earned ${earnedAchievements.length} achievements in ${game.title}`);

            // Initialize award level to NONE
            let awardLevel = AwardType.NONE;
            const awardDetails = [];

            // STEP 1: Check for participation (completely independent)
            if (earnedAchievements.length > 0) {
                awardLevel = AwardType.PARTICIPATION;
                awardDetails.push(`Participation: ${earnedAchievements.length} achievements earned`);
            }

            // Log participation check
            console.log('Participation check:', {
                username: raUsername,
                earnedCount: earnedAchievements.length,
                participationAwarded: awardLevel === AwardType.PARTICIPATION
            });

            // STEP 2: Check for beaten status (if they have any achievements)
            if (earnedAchievements.length > 0) {
                let beatenRequirementsMet = true;

                // Check progression requirements if they exist
                if (game.progression && game.progression.length > 0) {
                    const earnedProgression = game.progression.filter(id => 
                        earnedAchievements.includes(id)
                    );
                    
                    if (game.requireProgression) {
                        // Must be earned in order
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
                        // Can be earned in any order
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

                // Upgrade to beaten if requirements met
                if (beatenRequirementsMet) {
                    awardLevel = AwardType.BEATEN;
                    awardDetails.push('Game beaten (all requirements met)');
                }

                // STEP 3: Check for mastery
                if (game.type === 'MONTHLY' && 
                    earnedAchievements.length === progress.numAchievements &&
                    game.masteryCheck) {
                    awardLevel = AwardType.MASTERED;
                    awardDetails.push('Game mastered (100% completion)');
                }
            }

            // Log final award calculation
            console.log('Final award calculation:', {
                username: raUsername,
                game: game.title,
                earnedAchievements: earnedAchievements.length,
                totalAchievements: progress.numAchievements,
                awardLevel: AwardType[awardLevel],
                details: awardDetails
            });

            // Always update the award in database with force
            const awardUpdate = {
                award: awardLevel,
                achievementCount: earnedAchievements.length,
                totalAchievements: progress.numAchievements || 0,
                userCompletion: progress.userCompletion || "0.00%",
                lastChecked: new Date()
            };

            // Force update/create with the new award calculation
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
