// src/services/statsUpdateService.js
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';

// Helper function to check if an achievement was earned during its challenge month
function wasEarnedDuringChallengeMonth(dateEarned, challengeDate) {
    if (!dateEarned) return false;
    
    const earnedDate = new Date(dateEarned.replace(' ', 'T'));
    
    // Get first day of challenge month
    const challengeMonthStart = new Date(challengeDate.getFullYear(), challengeDate.getMonth(), 1);
    
    // Get first day of next month
    const nextMonthStart = new Date(challengeDate.getFullYear(), challengeDate.getMonth() + 1, 1);
    
    // Get last day of previous month (for grace period)
    const prevMonthLastDay = new Date(challengeMonthStart);
    prevMonthLastDay.setDate(prevMonthLastDay.getDate() - 1);
    
    // Check if achievement was earned during challenge month
    const inChallengeMonth = earnedDate >= challengeMonthStart && earnedDate < nextMonthStart;
    
    // Check if achievement was earned on the last day of previous month (grace period)
    const isLastDayOfPrevMonth = 
        earnedDate.getDate() === prevMonthLastDay.getDate() &&
        earnedDate.getMonth() === prevMonthLastDay.getMonth() &&
        earnedDate.getFullYear() === prevMonthLastDay.getFullYear();
    
    return inChallengeMonth || isLastDayOfPrevMonth;
}

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

        console.log(`Updating stats for ${users.length} users...`);

        // Update each user's stats in parallel with reasonable concurrency
        const concurrencyLimit = 3; // Process 3 users at a time
        const userBatches = [];
        
        // Split users into batches
        for (let i = 0; i < users.length; i += concurrencyLimit) {
            userBatches.push(users.slice(i, i + concurrencyLimit));
        }
        
        // Process each batch of users
        for (const batch of userBatches) {
            await Promise.all(batch.map(user => 
                this.updateUserStats(user, currentChallenge, currentMonthStart)
                    .catch(error => {
                        console.error(`Error updating stats for user ${user.raUsername}:`, error);
                        // Continue with next user even if there's an error
                    })
            ));
            
            // Small delay between batches to avoid overwhelming RetroAchievements API
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`Finished updating stats for ${users.length} users`);
        
        // Try to notify the API to refresh its cache
        try {
            const response = await fetch('https://select-start-api-production.up.railway.app/api/admin/force-update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': '0000'
                },
                body: JSON.stringify({ target: 'leaderboards' })
            });
            
            if (response.ok) {
                console.log('Successfully notified API to refresh cache');
            } else {
                console.error('Failed to notify API:', await response.text());
            }
        } catch (error) {
            console.error('Error notifying API:', error);
        }
    }

    async updateUserStats(user, challenge, currentMonthStart) {
        try {
            // Fetch game info first to save with the challenge
            let gameInfo;
            try {
                gameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);
            } catch (error) {
                console.error(`Error fetching game info for ${challenge.monthly_challange_gameid}:`, error);
                gameInfo = null;
            }

            // Get progress for monthly challenge
            const monthlyProgress = await retroAPI.getUserGameProgress(
                user.raUsername,
                challenge.monthly_challange_gameid
            );

            // Check for achievements earned during the challenge month
            const userAchievements = monthlyProgress.achievements || {};
            
            // Filter achievements earned during the challenge month
            let achievementsEarnedThisMonth = Object.entries(userAchievements)
                .filter(([id, data]) => wasEarnedDuringChallengeMonth(data.dateEarned, challenge.date))
                .map(([id]) => id);
                
            console.log(`User ${user.raUsername} has earned ${achievementsEarnedThisMonth.length} achievements during challenge month for ${monthlyProgress.title}`);

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
            
            // Count total valid progression achievements (earned during challenge month)
            const totalValidProgressionAchievements = progressionAchievements.filter(id => 
                achievementsEarnedThisMonth.includes(id)
            );
            
            // Count total valid win achievements (earned during challenge month)
            const totalValidWinAchievements = winAchievements.filter(id => 
                achievementsEarnedThisMonth.includes(id)
            );
            
            // Calculate points for monthly challenge based on progression and win achievements
            let monthlyPoints = 0;
            
            // For mastery points, all achievements must have been earned during challenge month
            const hasAllAchievements = achievementsEarnedThisMonth.length === challenge.monthly_challange_game_total;
            
            // For mastery, ALL achievements must be earned during challenge month
            if (hasAllAchievements) {
                monthlyPoints = 3; // Mastery
            } 
            // For beaten status, must have all progression achievements AND at least one win achievement earned during challenge month
            else if (totalValidProgressionAchievements.length === progressionAchievements.length && 
                     (winAchievements.length === 0 || totalValidWinAchievements.length > 0)) {
                monthlyPoints = 2; // Beaten
            } 
            // For participation, at least one achievement must be earned during challenge month
            else if (achievementsEarnedThisMonth.length > 0) {
                monthlyPoints = 1; // Participation
            }

            // Update monthly challenge progress WITH DETAILED INFO
            const monthKey = User.formatDateKey(challenge.date);
            user.monthlyChallenges.set(monthKey, { 
                progress: monthlyPoints,
                achievements: achievementsEarnedThisMonth.length,
                totalAchievements: challenge.monthly_challange_game_total,
                percentage: parseFloat((achievementsEarnedThisMonth.length / challenge.monthly_challange_game_total * 100).toFixed(2)),
                gameTitle: monthlyProgress.title || (gameInfo ? gameInfo.title : null),
                gameIconUrl: gameInfo ? gameInfo.imageIcon : null
            });

            // If there's a shadow challenge and it's revealed, update that too
            if (challenge.shadow_challange_gameid && challenge.shadow_challange_revealed) {
                // Get shadow game info
                let shadowGameInfo;
                try {
                    shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);
                } catch (error) {
                    console.error(`Error fetching shadow game info for ${challenge.shadow_challange_gameid}:`, error);
                    shadowGameInfo = null;
                }

                const shadowProgress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    challenge.shadow_challange_gameid
                );

                // Check for shadow achievements earned during the challenge month
                const userShadowAchievements = shadowProgress.achievements || {};
                
                // Filter shadow achievements earned during the challenge month
                let shadowAchievementsEarnedThisMonth = Object.entries(userShadowAchievements)
                    .filter(([id, data]) => wasEarnedDuringChallengeMonth(data.dateEarned, challenge.date))
                    .map(([id]) => id);
                    
                console.log(`User ${user.raUsername} has earned ${shadowAchievementsEarnedThisMonth.length} shadow achievements during challenge month for ${shadowProgress.title}`);

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
                
                // Count total valid progression shadow achievements (earned during challenge month)
                const totalValidShadowProgressionAchievements = progressionShadowAchievements.filter(id => 
                    shadowAchievementsEarnedThisMonth.includes(id)
                );
                
                // Count total valid win shadow achievements (earned during challenge month)
                const totalValidShadowWinAchievements = winShadowAchievements.filter(id => 
                    shadowAchievementsEarnedThisMonth.includes(id)
                );
                
                // Calculate points for shadow challenge based on progression and win achievements
                let shadowPoints = 0;
                
                // Check if user has all progression achievements in the shadow game
                const hasAllProgressionShadowAchievements = 
                    progressionShadowAchievements.length > 0 && 
                    progressionShadowAchievements.every(id => shadowAchievementsEarnedThisMonth.includes(id));

                // Check if user has at least one win achievement in the shadow game (if required)
                const hasWinShadowAchievement = 
                    winShadowAchievements.length === 0 || 
                    winShadowAchievements.some(id => shadowAchievementsEarnedThisMonth.includes(id));
                
                // For shadow games, "Beaten" is the highest status (2 points)
                if (hasAllProgressionShadowAchievements && hasWinShadowAchievement) {
                    shadowPoints = 2; // Beaten
                } 
                // For participation, at least one achievement must be earned during challenge month
                else if (shadowAchievementsEarnedThisMonth.length > 0) {
                    shadowPoints = 1; // Participation
                }

                // Update shadow challenge progress WITH DETAILED INFO
                user.shadowChallenges.set(monthKey, { 
                    progress: shadowPoints,
                    achievements: shadowAchievementsEarnedThisMonth.length,
                    totalAchievements: challenge.shadow_challange_game_total,
                    percentage: parseFloat((shadowAchievementsEarnedThisMonth.length / challenge.shadow_challange_game_total * 100).toFixed(2)),
                    gameTitle: shadowProgress.title || (shadowGameInfo ? shadowGameInfo.title : null),
                    gameIconUrl: shadowGameInfo ? shadowGameInfo.imageIcon : null
                });
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
