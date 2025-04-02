import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';

class StatsUpdateService {
    constructor() {
        this.isUpdating = false;
        this.batchSize = 5; // Process users in small batches
        this.delayBetweenUsers = 5000; // 5 seconds between users
        this.delayBetweenBatches = 60000; // 1 minute between batches
        this.lastUpdateTime = 0;
    }

    async start() {
        if (this.isUpdating) {
            console.log('Stats update already in progress');
            return;
        }

        // Check if we're updating too frequently
        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastUpdateTime;
        const minimumInterval = 10 * 60 * 1000; // 10 minutes minimum
        
        if (timeSinceLastUpdate < minimumInterval) {
            console.log(`Stats update requested too soon (${Math.round(timeSinceLastUpdate/1000)}s since last update, minimum is ${minimumInterval/1000}s)`);
            return;
        }

        try {
            console.log('Starting stats update service...');
            this.isUpdating = true;
            this.lastUpdateTime = now;
            await this.updateAllUserStats();
            console.log('Stats update completed successfully');
        } catch (error) {
            console.error('Error in stats update service:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    async updateAllUserStats() {
        // Get all users
        const users = await User.find({});
        if (users.length === 0) {
            console.log('No users found for stats update');
            return;
        }

        // Get current challenge
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const currentChallenge = await Challenge.findOne({
            date: {
                $gte: currentMonthStart,
                $lt: nextMonthStart
            }
        });

        if (!currentChallenge) {
            console.log('No active challenge found for stats update');
            return;
        }

        console.log(`Found ${users.length} users for stats update, processing in batches of ${this.batchSize}`);

        // Process users in small batches to avoid overwhelming the RetroAchievements API
        for (let i = 0; i < users.length; i += this.batchSize) {
            const userBatch = users.slice(i, i + this.batchSize);
            console.log(`Processing batch ${Math.floor(i/this.batchSize) + 1} of ${Math.ceil(users.length/this.batchSize)}, with ${userBatch.length} users`);
            
            // Process each user in the batch sequentially
            for (const user of userBatch) {
                try {
                    await this.updateUserStats(user, currentChallenge, currentMonthStart);
                    // Add delay between users to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, this.delayBetweenUsers));
                } catch (error) {
                    console.error(`Error updating stats for user ${user.raUsername}:`, error);
                    // Continue with next user even if there's an error
                }
            }
            
            // If this isn't the last batch, wait before processing the next batch
            if (i + this.batchSize < users.length) {
                console.log(`Waiting ${this.delayBetweenBatches/1000} seconds before processing next batch...`);
                await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
            }
        }
    }

    async updateUserStats(user, challenge, currentMonthStart) {
        try {
            console.log(`Updating stats for user: ${user.raUsername}`);
            
            // Get progress for monthly challenge
            const monthlyProgress = await retroAPI.getUserGameProgress(
                user.raUsername,
                challenge.monthly_challange_gameid
            );

            if (!monthlyProgress || !monthlyProgress.achievements) {
                console.log(`No progress data found for ${user.raUsername} on game ${challenge.monthly_challange_gameid}`);
                return;
            }

            // Check for achievements earned during the challenge month
            const userAchievements = monthlyProgress.achievements || {};
            
            // Filter achievements earned during the current month
            let achievementsEarnedThisMonth = Object.entries(userAchievements)
                .filter(([id, data]) => {
                    if (!data.dateEarned) return false;
                    const earnedDate = new Date(data.dateEarned);
                    return earnedDate >= currentMonthStart;
                })
                .map(([id]) => id);
                
            console.log(`User ${user.raUsername} has earned ${achievementsEarnedThisMonth.length} achievements this month for ${monthlyProgress.title}`);

            // Check for progression achievements earned this month
            const progressionAchievements = challenge.monthly_challange_progression_achievements || [];
            const earnedProgressionInMonth = progressionAchievements.filter(id => 
                achievementsEarnedThisMonth.includes(id)
            );
            
            // Check for win achievements earned this month
            const winAchievements = challenge.monthly_challange_win_achievements || [];
            const earnedWinInMonth = winAchievements.filter(id => 
                achievementsEarnedThisMonth.includes(id)
            );
            
            // Get all achievements earned (regardless of when)
            const allEarnedAchievements = Object.entries(userAchievements)
                .filter(([id, data]) => data.dateEarned)
                .map(([id]) => id);
                
            // Count total valid progression achievements (either earned this month or previously)
            const totalValidProgressionAchievements = progressionAchievements.filter(id => 
                allEarnedAchievements.includes(id)
            );
            
            // Count total valid win achievements (either earned this month or previously)
            const totalValidWinAchievements = winAchievements.filter(id => 
                allEarnedAchievements.includes(id)
            );
            
            // Calculate points for monthly challenge based on progression and win achievements
            let monthlyPoints = 0;
            
            // For mastery points, ALL achievements must have been earned
            // Check if user has all required achievements 
            if (monthlyProgress.numAwardedToUser === challenge.monthly_challange_game_total) {
                monthlyPoints = 3; // Mastery
            } 
            // For beaten status, the user must have all progression achievements AND at least one win achievement (if any required)
            else if (totalValidProgressionAchievements.length === progressionAchievements.length && 
                     (winAchievements.length === 0 || totalValidWinAchievements.length > 0)) {
                monthlyPoints = 2; // Beaten
            } 
            // For participation, at least one achievement must be earned
            else if (allEarnedAchievements.length > 0) {
                monthlyPoints = 1; // Participation
            }

            // Update monthly challenge progress
            const monthKey = User.formatDateKey(challenge.date);
            user.monthlyChallenges.set(monthKey, { progress: monthlyPoints });

            // If there's a shadow challenge and it's revealed, update that too
            if (challenge.shadow_challange_gameid && challenge.shadow_challange_revealed) {
                // Add delay before checking shadow challenge
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const shadowProgress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    challenge.shadow_challange_gameid
                );

                if (!shadowProgress || !shadowProgress.achievements) {
                    console.log(`No shadow progress data found for ${user.raUsername}`);
                } else {
                    // Check for shadow achievements earned during the challenge month
                    const userShadowAchievements = shadowProgress.achievements || {};
                    
                    // Filter shadow achievements earned during the current month
                    let shadowAchievementsEarnedThisMonth = Object.entries(userShadowAchievements)
                        .filter(([id, data]) => {
                            if (!data.dateEarned) return false;
                            const earnedDate = new Date(data.dateEarned);
                            return earnedDate >= currentMonthStart;
                        })
                        .map(([id]) => id);
                        
                    console.log(`User ${user.raUsername} has earned ${shadowAchievementsEarnedThisMonth.length} shadow achievements this month`);
    
                    // Get all shadow achievements earned (regardless of when)
                    const allEarnedShadowAchievements = Object.entries(userShadowAchievements)
                        .filter(([id, data]) => data.dateEarned)
                        .map(([id]) => id);
                        
                    // Check for progression shadow achievements
                    const progressionShadowAchievements = challenge.shadow_challange_progression_achievements || [];
                    const allCompletedProgression = progressionShadowAchievements.every(id => 
                        allEarnedShadowAchievements.includes(id)
                    );
                    
                    // Check for win shadow achievements
                    const winShadowAchievements = challenge.shadow_challange_win_achievements || [];
                    const hasWinAchievement = winShadowAchievements.length === 0 || 
                        winShadowAchievements.some(id => allEarnedShadowAchievements.includes(id));
                    
                    // Calculate points for shadow challenge
                    let shadowPoints = 0;
                    
                    // For shadow games, cap at "Beaten" status (2 points)
                    if (allCompletedProgression && hasWinAchievement) {
                        shadowPoints = 2; // Beaten
                    } 
                    // For participation, at least one achievement must be earned
                    else if (allEarnedShadowAchievements.length > 0) {
                        shadowPoints = 1; // Participation
                    }
    
                    // Update shadow challenge progress
                    user.shadowChallenges.set(monthKey, { progress: shadowPoints });
                }
            }

            await user.save();
            console.log(`Updated stats for user ${user.raUsername} successfully`);

        } catch (error) {
            console.error(`Error updating stats for user ${user.raUsername}:`, error);
            throw error;
        }
    }
}

// Create singleton instance
const statsUpdateService = new StatsUpdateService();
export default statsUpdateService;
