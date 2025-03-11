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
                        await this.updateUserStats(user, currentChallenge);
                        resolve();
                    } catch (error) {
                        console.error(`Error updating stats for user ${user.raUsername}:`, error);
                        resolve(); // Continue with next user even if there's an error
                    }
                }, i * delayBetweenUsers);
            });
        }
    }

    async updateUserStats(user, challenge) {
        try {
            // Get progress for monthly challenge
            const monthlyProgress = await retroAPI.getUserGameProgress(
                user.raUsername,
                challenge.monthly_challange_gameid
            );

            // Check for specific achievements
            const requiredAchievements = challenge.monthly_challange_achievement_ids || [];
            const userAchievements = monthlyProgress.achievements || {};
            
            // Count how many of the required achievements the user has earned
            let earnedRequiredCount = 0;
            for (const achievementId of requiredAchievements) {
                if (userAchievements[achievementId] && userAchievements[achievementId].dateEarned) {
                    earnedRequiredCount++;
                }
            }
            
            // Calculate points for monthly challenge based on specific achievements
            let monthlyPoints = 0;
            if (earnedRequiredCount === requiredAchievements.length && requiredAchievements.length > 0) {
                monthlyPoints = 3; // Mastery
            } else if (earnedRequiredCount >= challenge.monthly_challange_goal) {
                monthlyPoints = 2; // Beaten
            } else if (earnedRequiredCount > 0) {
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

                // Check for specific shadow achievements
                const requiredShadowAchievements = challenge.shadow_challange_achievement_ids || [];
                const userShadowAchievements = shadowProgress.achievements || {};
                
                // Count how many of the required shadow achievements the user has earned
                let earnedRequiredShadowCount = 0;
                for (const achievementId of requiredShadowAchievements) {
                    if (userShadowAchievements[achievementId] && userShadowAchievements[achievementId].dateEarned) {
                        earnedRequiredShadowCount++;
                    }
                }
                
                // Calculate points for shadow challenge based on specific achievements
                let shadowPoints = 0;
                if (earnedRequiredShadowCount === requiredShadowAchievements.length && requiredShadowAchievements.length > 0) {
                    shadowPoints = 3;
                } else if (earnedRequiredShadowCount >= challenge.shadow_challange_goal) {
                    shadowPoints = 2;
                } else if (earnedRequiredShadowCount > 0) {
                    shadowPoints = 1;
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
