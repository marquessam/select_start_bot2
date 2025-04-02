import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';

class StatsUpdateService {
    constructor() {
        this.isUpdating = false;
        this.updateInterval = 30 * 60 * 1000; // 30 minutes in milliseconds
    }

    async start() {
        if (this.isUpdating) {
            console.log('Stats update already in progress');
            return;
        }

        try {
            this.isUpdating = true;
            await this.updateAllUserStats();
        } catch (error) {
            console.error('Error in stats update service:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    async updateAllUserStats() {
        // Get all users
        const users = await User.find({});
        if (users.length === 0) return;

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

        if (!currentChallenge) return;

        // Calculate delay between each user update to spread them over the interval
        // Leave 10% buffer at the end of the interval
        const effectiveInterval = this.updateInterval * 0.9;
        const delayBetweenUsers = Math.floor(effectiveInterval / users.length);

        // Update each user's stats with delay
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            // Use setTimeout to spread out the API calls
            await new Promise(resolve => {
                setTimeout(async () => {
                    try {
                        await this.updateUserStats(user, currentChallenge, currentMonthStart);
                        resolve();
                    } catch (error) {
                        console.error(`Error updating stats for user ${user.raUsername}:`, error);
                        resolve(); // Continue with next user even if there's an error
                    }
                }, i * delayBetweenUsers);
            });
        }
    }

    async updateUserStats(user, challenge, currentMonthStart) {
        try {
            // Get progress for monthly challenge
            const monthlyProgress = await retroAPI.getUserGameProgress(
                user.raUsername,
                challenge.monthly_challange_gameid
            );

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
            
            // For mastery points, ALL achievements must have been earned this month
            // Check if user has earned all required achievements this month
            const allAchievementsEarnedThisMonth = Object.entries(userAchievements)
                .filter(([id, data]) => data.dateEarned)
                .every(([id, data]) => {
                    const earnedDate = new Date(data.dateEarned);
                    return earnedDate >= currentMonthStart;
                });
            
            // For mastery, ALL achievements must be earned THIS MONTH
            if (monthlyProgress.numAwardedToUser === challenge.monthly_challange_game_total && allAchievementsEarnedThisMonth) {
                monthlyPoints = 3; // Mastery
            } 
            // For beaten status, the user must have all progression achievements AND at least one win achievement (if any required)
            // AND at least one of those achievements must have been earned this month
            else if (totalValidProgressionAchievements.length === progressionAchievements.length && 
                     (winAchievements.length === 0 || totalValidWinAchievements.length > 0) &&
                     (earnedProgressionInMonth.length > 0 || earnedWinInMonth.length > 0)) {
                monthlyPoints = 2; // Beaten
            } 
            // For participation, at least one achievement must be earned this month
            else if (achievementsEarnedThisMonth.length > 0) {
                monthlyPoints = 1; // Participation
            }

            // Update monthly challenge progress
            const monthKey = User.formatDateKey(challenge.date);
            user.monthlyChallenges.set(monthKey, { progress: monthlyPoints });

            // If there's a shadow challenge and it's revealed, update that too
            if (challenge.shadow_challange_gameid && challenge.shadow_challange_revealed) {
                const shadowProgress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    challenge.shadow_challange_gameid
                );

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
                    
                console.log(`User ${user.raUsername} has earned ${shadowAchievementsEarnedThisMonth.length} shadow achievements this month for ${shadowProgress.title}`);

                // Check for progression shadow achievements earned this month
                const progressionShadowAchievements = challenge.shadow_challange_progression_achievements || [];
                const earnedShadowProgressionInMonth = progressionShadowAchievements.filter(id => 
                    shadowAchievementsEarnedThisMonth.includes(id)
                );
                
                // Check for win shadow achievements earned this month
                const winShadowAchievements = challenge.shadow_challange_win_achievements || [];
                const earnedShadowWinInMonth = winShadowAchievements.filter(id => 
                    shadowAchievementsEarnedThisMonth.includes(id)
                );
                
                // Get all shadow achievements earned (regardless of when)
                const allEarnedShadowAchievements = Object.entries(userShadowAchievements)
                    .filter(([id, data]) => data.dateEarned)
                    .map(([id]) => id);
                    
                // Count total valid progression shadow achievements (either earned this month or previously)
                const totalValidShadowProgressionAchievements = progressionShadowAchievements.filter(id => 
                    allEarnedShadowAchievements.includes(id)
                );
                
                // Count total valid win shadow achievements (either earned this month or previously)
                const totalValidShadowWinAchievements = winShadowAchievements.filter(id => 
                    allEarnedShadowAchievements.includes(id)
                );
                
                // For shadow mastery, ALL achievements must have been earned this month
                const allShadowAchievementsEarnedThisMonth = Object.entries(userShadowAchievements)
                    .filter(([id, data]) => data.dateEarned)
                    .every(([id, data]) => {
                        const earnedDate = new Date(data.dateEarned);
                        return earnedDate >= currentMonthStart;
                    });
                
                // Calculate points for shadow challenge based on progression and win achievements
                let shadowPoints = 0;
                
                // For mastery, ALL achievements must be earned THIS MONTH
                if (shadowProgress.numAwardedToUser === challenge.shadow_challange_game_total && allShadowAchievementsEarnedThisMonth) {
                    shadowPoints = 3; // Mastery
                } 
                // For beaten status, the user must have all progression achievements AND at least one win achievement (if any required)
                // AND at least one of those achievements must have been earned this month
                else if (totalValidShadowProgressionAchievements.length === progressionShadowAchievements.length && 
                         (winShadowAchievements.length === 0 || totalValidShadowWinAchievements.length > 0) &&
                         (earnedShadowProgressionInMonth.length > 0 || earnedShadowWinInMonth.length > 0)) {
                    shadowPoints = 2; // Beaten
                } 
                // For participation, at least one achievement must be earned this month
                else if (shadowAchievementsEarnedThisMonth.length > 0) {
                    shadowPoints = 1; // Participation
                }

                // Update shadow challenge progress
                user.shadowChallenges.set(monthKey, { progress: shadowPoints });
            }

            await user.save();
            console.log(`Updated stats for user ${user.raUsername}`);

        } catch (error) {
            console.error(`Error updating stats for user ${user.raUsername}:`, error);
            throw error;
        }
    }
}

// Create singleton instance
const statsUpdateService = new StatsUpdateService();
export default statsUpdateService;
