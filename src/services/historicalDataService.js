// src/services/historicalDataService.js
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { HistoricalLeaderboard } from '../models/HistoricalLeaderboard.js';
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

class HistoricalDataService {
    constructor() {
        this.isProcessing = false;
    }

    /**
     * Repopulate all historical data for a specific user
     * @param {string} raUsername - RetroAchievements username
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} Results of the repopulation
     */
    async repopulateUserHistory(raUsername, options = {}) {
        const {
            skipExisting = false,  // Skip months that already have data
            fromDate = null,       // Start from specific date (YYYY-MM-DD)
            toDate = null,         // End at specific date (YYYY-MM-DD)
            dryRun = false        // Don't save changes, just report what would happen
        } = options;

        console.log(`Starting historical data repopulation for ${raUsername}${dryRun ? ' (DRY RUN)' : ''}`);

        // Find the user
        const user = await User.findOne({
            raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
        });

        if (!user) {
            throw new Error(`User ${raUsername} not found`);
        }

        // Get all historical challenges
        const challenges = await this.getAllHistoricalChallenges(fromDate, toDate);
        
        if (challenges.length === 0) {
            return {
                success: true,
                message: 'No historical challenges found',
                monthsProcessed: 0,
                monthsSkipped: 0,
                monthsUpdated: 0
            };
        }

        const results = {
            monthsProcessed: 0,
            monthsSkipped: 0,
            monthsUpdated: 0,
            monthlyUpdates: [],
            shadowUpdates: [],
            errors: []
        };

        // Process each challenge
        for (const challenge of challenges) {
            try {
                const monthKey = User.formatDateKey(challenge.date);
                
                // Check if we should skip existing data
                if (skipExisting) {
                    const existingMonthly = user.monthlyChallenges.get(monthKey);
                    const existingShadow = user.shadowChallenges.get(monthKey);
                    
                    if (existingMonthly || existingShadow) {
                        console.log(`Skipping ${monthKey} - existing data found`);
                        results.monthsSkipped++;
                        continue;
                    }
                }

                console.log(`Processing challenge for ${monthKey}...`);
                
                // Process monthly challenge
                const monthlyResult = await this.processMonthlyChallenge(user, challenge, dryRun);
                if (monthlyResult) {
                    results.monthlyUpdates.push({
                        month: monthKey,
                        ...monthlyResult
                    });
                }

                // Process shadow challenge if it exists and was revealed
                if (challenge.shadow_challange_gameid && challenge.shadow_challange_revealed) {
                    const shadowResult = await this.processShadowChallenge(user, challenge, dryRun);
                    if (shadowResult) {
                        results.shadowUpdates.push({
                            month: monthKey,
                            ...shadowResult
                        });
                    }
                }

                results.monthsProcessed++;
                
                // Small delay to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Error processing challenge for ${User.formatDateKey(challenge.date)}:`, error);
                results.errors.push({
                    month: User.formatDateKey(challenge.date),
                    error: error.message
                });
            }
        }

        // Save user if not dry run and there were updates
        if (!dryRun && (results.monthlyUpdates.length > 0 || results.shadowUpdates.length > 0)) {
            await user.save();
            results.monthsUpdated = results.monthsProcessed - results.monthsSkipped;
            console.log(`Saved historical data for ${raUsername}`);
        }

        return {
            success: true,
            user: raUsername,
            dryRun,
            ...results
        };
    }

    /**
     * Process monthly challenge for a user
     */
    async processMonthlyChallenge(user, challenge, dryRun = false) {
        if (!challenge.monthly_challange_gameid) {
            return null;
        }

        try {
            // Get game info
            const gameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);
            
            // Get user's progress for this game
            const gameProgress = await retroAPI.getUserGameProgress(
                user.raUsername,
                challenge.monthly_challange_gameid
            );

            const userAchievements = gameProgress.achievements || {};
            
            // Filter achievements earned during the challenge month
            const achievementsEarnedThisMonth = Object.entries(userAchievements)
                .filter(([id, data]) => wasEarnedDuringChallengeMonth(data.dateEarned, challenge.date))
                .map(([id]) => id);

            // Calculate progress
            const progressionAchievements = challenge.monthly_challange_progression_achievements || [];
            const winAchievements = challenge.monthly_challange_win_achievements || [];
            
            const totalValidProgressionAchievements = progressionAchievements.filter(id => 
                achievementsEarnedThisMonth.includes(id)
            );
            
            const totalValidWinAchievements = winAchievements.filter(id => 
                achievementsEarnedThisMonth.includes(id)
            );

            let progressLevel = 0;
            
            // Check for mastery (all achievements earned during challenge month)
            if (achievementsEarnedThisMonth.length === challenge.monthly_challange_game_total) {
                progressLevel = 3; // Mastery
            } 
            // Check for beaten (all progression + at least one win during challenge month)
            else if (totalValidProgressionAchievements.length === progressionAchievements.length && 
                     (winAchievements.length === 0 || totalValidWinAchievements.length > 0)) {
                progressLevel = 2; // Beaten
            } 
            // Check for participation (at least one achievement during challenge month)
            else if (achievementsEarnedThisMonth.length > 0) {
                progressLevel = 1; // Participation
            }

            const result = {
                gameId: challenge.monthly_challange_gameid,
                gameTitle: gameProgress.title || gameInfo?.title || `Game ${challenge.monthly_challange_gameid}`,
                progress: progressLevel,
                achievementsEarned: achievementsEarnedThisMonth.length,
                totalAchievements: challenge.monthly_challange_game_total,
                percentage: parseFloat((achievementsEarnedThisMonth.length / challenge.monthly_challange_game_total * 100).toFixed(2))
            };

            // Update user data if not dry run
            if (!dryRun && progressLevel > 0) {
                const monthKey = User.formatDateKey(challenge.date);
                user.monthlyChallenges.set(monthKey, {
                    progress: progressLevel,
                    achievements: achievementsEarnedThisMonth.length,
                    totalAchievements: challenge.monthly_challange_game_total,
                    percentage: result.percentage,
                    gameTitle: result.gameTitle,
                    gameIconUrl: gameInfo?.imageIcon || null
                });
            }

            return result;

        } catch (error) {
            console.error(`Error processing monthly challenge for game ${challenge.monthly_challange_gameid}:`, error);
            throw error;
        }
    }

    /**
     * Process shadow challenge for a user
     */
    async processShadowChallenge(user, challenge, dryRun = false) {
        if (!challenge.shadow_challange_gameid) {
            return null;
        }

        try {
            // Get shadow game info
            const shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);
            
            // Get user's progress for shadow game
            const shadowGameData = await retroAPI.getUserGameProgress(
                user.raUsername,
                challenge.shadow_challange_gameid
            );

            const shadowUserAchievements = shadowGameData.achievements || {};
            
            // Filter shadow achievements earned during the challenge month
            const earnedShadowAchievements = Object.entries(shadowUserAchievements)
                .filter(([id, data]) => wasEarnedDuringChallengeMonth(data.dateEarned, challenge.date))
                .map(([id]) => id);

            // Calculate shadow progress
            const shadowProgressionAchs = challenge.shadow_challange_progression_achievements || [];
            const shadowWinAchs = challenge.shadow_challange_win_achievements || [];
            
            const validProgressionAchs = shadowProgressionAchs.filter(id => 
                earnedShadowAchievements.includes(id)
            );
            
            const validWinAchs = shadowWinAchs.filter(id => 
                earnedShadowAchievements.includes(id)
            );

            let calculatedLevel = 0;
            
            // For shadow games, "Beaten" is the highest status (2 points)
            const hasAllProgressionAchs = 
                shadowProgressionAchs.length > 0 && 
                shadowProgressionAchs.every(id => earnedShadowAchievements.includes(id));

            const hasWinAch = 
                shadowWinAchs.length === 0 || 
                shadowWinAchs.some(id => earnedShadowAchievements.includes(id));
            
            if (hasAllProgressionAchs && hasWinAch) {
                calculatedLevel = 2; // Beaten
            } 
            else if (earnedShadowAchievements.length > 0) {
                calculatedLevel = 1; // Participation
            }

            const shadowResult = {
                gameId: challenge.shadow_challange_gameid,
                gameTitle: shadowGameData.title || shadowGameInfo?.title || `Game ${challenge.shadow_challange_gameid}`,
                progress: calculatedLevel,
                achievementsEarned: earnedShadowAchievements.length,
                totalAchievements: challenge.shadow_challange_game_total,
                percentage: parseFloat((earnedShadowAchievements.length / challenge.shadow_challange_game_total * 100).toFixed(2))
            };

            // Update user data if not dry run
            if (!dryRun && calculatedLevel > 0) {
                const monthKey = User.formatDateKey(challenge.date);
                user.shadowChallenges.set(monthKey, {
                    progress: calculatedLevel,
                    achievements: earnedShadowAchievements.length,
                    totalAchievements: challenge.shadow_challange_game_total,
                    percentage: shadowResult.percentage,
                    gameTitle: shadowResult.gameTitle,
                    gameIconUrl: shadowGameInfo?.imageIcon || null
                });
            }

            return shadowResult;

        } catch (error) {
            console.error(`Error processing shadow challenge for game ${challenge.shadow_challange_gameid}:`, error);
            throw error;
        }
    }

    /**
     * Get all historical challenges within date range
     */
    async getAllHistoricalChallenges(fromDate = null, toDate = null) {
        let query = {};

        if (fromDate || toDate) {
            query.date = {};
            if (fromDate) {
                query.date.$gte = new Date(fromDate);
            }
            if (toDate) {
                query.date.$lte = new Date(toDate);
            }
        }

        // Get challenges sorted by date (oldest first)
        const challenges = await Challenge.find(query).sort({ date: 1 });
        
        console.log(`Found ${challenges.length} historical challenges to process`);
        return challenges;
    }

    /**
     * Repopulate historical data for all users (admin function)
     */
    async repopulateAllUsersHistory(options = {}) {
        if (this.isProcessing) {
            throw new Error('Historical data repopulation is already in progress');
        }

        this.isProcessing = true;
        
        try {
            const users = await User.find({});
            const results = {
                totalUsers: users.length,
                processedUsers: 0,
                errors: [],
                userResults: []
            };

            console.log(`Starting historical data repopulation for ${users.length} users`);

            for (const user of users) {
                try {
                    console.log(`Processing user ${user.raUsername}...`);
                    const userResult = await this.repopulateUserHistory(user.raUsername, options);
                    results.userResults.push(userResult);
                    results.processedUsers++;
                    
                    // Small delay between users
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    console.error(`Error processing user ${user.raUsername}:`, error);
                    results.errors.push({
                        user: user.raUsername,
                        error: error.message
                    });
                }
            }

            return results;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Check if a user needs historical data repopulation
     */
    async checkUserNeedsRepopulation(raUsername) {
        const user = await User.findOne({
            raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
        });

        if (!user) {
            throw new Error(`User ${raUsername} not found`);
        }

        // Get all historical challenges
        const challenges = await this.getAllHistoricalChallenges();
        
        let needsRepopulation = false;
        const missingMonths = [];

        for (const challenge of challenges) {
            const monthKey = User.formatDateKey(challenge.date);
            const hasMonthlyData = user.monthlyChallenges.has(monthKey);
            const hasShadowData = challenge.shadow_challange_revealed && user.shadowChallenges.has(monthKey);
            
            if (!hasMonthlyData || (challenge.shadow_challange_revealed && !hasShadowData)) {
                needsRepopulation = true;
                missingMonths.push(monthKey);
            }
        }

        return {
            needsRepopulation,
            missingMonths,
            totalChallenges: challenges.length,
            currentMonthlyData: user.monthlyChallenges.size,
            currentShadowData: user.shadowChallenges.size
        };
    }
}

// Create singleton instance
const historicalDataService = new HistoricalDataService();
export default historicalDataService;
