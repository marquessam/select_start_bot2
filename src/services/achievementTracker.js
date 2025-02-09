async function processGameProgress(raUsername, game) {
    try {
        console.log(`\nProcessing ${game.title} progress for ${raUsername}`);
        
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
                        // If not first achievement, check if previous ones are earned
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
