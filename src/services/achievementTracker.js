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
        console.log('Achievement Tracker initialized');
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

            // Extract earned achievements with proper type checking
            const earnedAchievements = Object.entries(progress.achievements || {})
                .filter(([_, ach]) => ach && (ach.DateEarned || ach.dateEarned))
                .map(([id]) => id);

            console.log(`User has earned ${earnedAchievements.length} achievements`);

            // Calculate award level with detailed logging
            let awardLevel = AwardType.NONE;
            const awardDetails = [];

            // Check participation
            if (earnedAchievements.length > 0) {
                awardLevel = AwardType.PARTICIPATION;
                awardDetails.push(`Participation: ${earnedAchievements.length} achievements earned`);

                // Check progression requirements
                let progressionMet = !game.requireProgression;
                if (game.requireProgression && game.progression) {
                    const earnedProgression = game.progression.filter(id => 
                        earnedAchievements.includes(id)
                    );
                    const progressionInOrder = game.progression.every((id, index) => {
                        const isEarned = earnedAchievements.includes(id);
                        if (index > 0 && isEarned) {
                            // Check if all previous achievements are earned
                            return game.progression
                                .slice(0, index)
                                .every(prevId => earnedAchievements.includes(prevId));
                        }
                        return isEarned;
                    });
                    
                    progressionMet = earnedProgression.length === game.progression.length && progressionInOrder;
                    awardDetails.push(`Progression: ${earnedProgression.length}/${game.progression.length} (In Order: ${progressionInOrder})`);
                }

                // Check win conditions
                let winConditionMet = false;
                if (game.winCondition && game.winCondition.length > 0) {
                    if (game.requireAllWinConditions) {
                        const earnedWinConditions = game.winCondition.filter(id => 
                            earnedAchievements.includes(id)
                        );
                        winConditionMet = earnedWinConditions.length === game.winCondition.length;
                        awardDetails.push(`Win Conditions: ${earnedWinConditions.length}/${game.winCondition.length} (All Required)`);
                    } else {
                        winConditionMet = game.winCondition.some(id => 
                            earnedAchievements.includes(id)
                        );
                        const metConditions = game.winCondition.filter(id => 
                            earnedAchievements.includes(id)
                        );
                        awardDetails.push(`Win Conditions: ${metConditions.length}/${game.winCondition.length} (Any Required)`);
                    }
                }

                if (progressionMet && winConditionMet) {
                    awardLevel = AwardType.BEATEN;
                    awardDetails.push('Game beaten (progression and win conditions met)');
                }

                // Check mastery
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
                achievementCount: progress.earnedAchievements || 0,
                totalAchievements: progress.totalAchievements || 0,
                userCompletion: progress.userCompletion || "0.00%",
                lastChecked: new Date(),
                // Increase priority for users who are actively earning achievements
                checkPriority: this.calculateCheckPriority(earnedAchievements.length)
            };

            const existingAward = await Award.findOne({
                raUsername,
                gameId: game.gameId,
                month: game.month,
                year: game.year
            });

            if (!existingAward || 
                existingAward.award !== awardLevel || 
                existingAward.achievementCount !== progress.earnedAchievements) {
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
                console.log(`Updated award for ${raUsername} in ${game.title} to ${AwardType[awardLevel]}`);
            } else {
                // Update lastChecked even if no changes
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
