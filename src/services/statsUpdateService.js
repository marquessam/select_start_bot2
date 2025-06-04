// src/services/statsUpdateService.js - FIXED VERSION - Uses current API status like gameAwardService
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';

class StatsUpdateService {
    constructor() {
        this.isUpdating = false;
        this.updateInterval = 30 * 60 * 1000; // 30 minutes in milliseconds
        this.updateSemaphore = new Map(); // Prevent concurrent updates per user
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

    /**
     * Create consistent month key format
     */
    createMonthKey(challengeDate) {
        const year = challengeDate.getFullYear();
        const month = (challengeDate.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }

    /**
     * FIXED: Normalize award kind strings to handle API variations (same as gameAwardService)
     */
    normalizeAwardKind(awardKind) {
        if (!awardKind) return null;
        
        const normalized = awardKind.toString().toLowerCase().trim();
        
        // Map various API responses to standard values
        const mappings = {
            'mastered': 'mastery',
            'mastery': 'mastery',
            'master': 'mastery',
            'mastery/completion': 'mastery',
            'completed': 'completion',
            'completion': 'completion',
            'beaten': 'completion',
            'complete': 'completion',
            'game beaten': 'completion',
            'participated': 'participation',
            'participation': 'participation'
        };
        
        return mappings[normalized] || normalized;
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

        // Create consistent month key
        const monthKey = this.createMonthKey(currentChallenge.date);
        console.log(`Using month key: ${monthKey} for challenge date: ${currentChallenge.date}`);

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
                this.updateUserStats(user, currentChallenge, monthKey)
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

    /**
     * Prevent concurrent updates and ensure consistent data
     */
    async updateUserStats(user, challenge, monthKey) {
        // Prevent concurrent updates for the same user
        const userKey = user.raUsername;
        if (this.updateSemaphore.has(userKey)) {
            console.log(`Skipping concurrent update for ${userKey}`);
            return;
        }

        this.updateSemaphore.set(userKey, true);

        try {
            // Reload user to ensure we have latest data
            const freshUser = await User.findById(user._id);
            if (!freshUser) {
                console.warn(`User ${userKey} not found during stats update`);
                return;
            }

            await this.processUserChallengeStats(freshUser, challenge, monthKey);

        } finally {
            this.updateSemaphore.delete(userKey);
        }
    }

    async processUserChallengeStats(user, challenge, monthKey) {
        try {
            // MONTHLY CHALLENGE PROCESSING
            const monthlyResult = await this.processMonthlyChallenge(user, challenge, monthKey);
            
            // SHADOW CHALLENGE PROCESSING  
            const shadowResult = await this.processShadowChallenge(user, challenge, monthKey);

            // Only save if we actually have updates and data is different
            let needsSave = false;

            if (monthlyResult.hasUpdate) {
                // Check for existing entry and only update if different
                const existingMonthly = user.monthlyChallenges.get(monthKey);
                if (!existingMonthly || this.isDifferentData(existingMonthly, monthlyResult.data)) {
                    user.monthlyChallenges.set(monthKey, monthlyResult.data);
                    needsSave = true;
                    console.log(`Updated monthly challenge for ${user.raUsername}: progress ${monthlyResult.data.progress} (${this.progressToLevel(monthlyResult.data.progress, 'monthly')})`);
                } else {
                    console.log(`No change in monthly challenge for ${user.raUsername}`);
                }
            }

            if (shadowResult.hasUpdate) {
                // Check for existing entry and only update if different
                const existingShadow = user.shadowChallenges.get(monthKey);
                if (!existingShadow || this.isDifferentData(existingShadow, shadowResult.data)) {
                    user.shadowChallenges.set(monthKey, shadowResult.data);
                    needsSave = true;
                    console.log(`Updated shadow challenge for ${user.raUsername}: progress ${shadowResult.data.progress} (${this.progressToLevel(shadowResult.data.progress, 'shadow')})`);
                } else {
                    console.log(`No change in shadow challenge for ${user.raUsername}`);
                }
            }

            if (needsSave) {
                await user.save();
                console.log(`Saved stats for user ${user.raUsername}`);
            }

        } catch (error) {
            console.error(`Error processing challenge stats for user ${user.raUsername}:`, error);
            throw error;
        }
    }

    /**
     * Check if challenge data is actually different
     */
    isDifferentData(existing, newData) {
        return (
            existing.progress !== newData.progress ||
            existing.achievements !== newData.achievements ||
            existing.totalAchievements !== newData.totalAchievements ||
            Math.abs((existing.percentage || 0) - (newData.percentage || 0)) > 0.01 ||
            existing.gameTitle !== newData.gameTitle
        );
    }

    /**
     * FIXED: Process monthly challenge using current API status (same logic as gameAwardService)
     */
    async processMonthlyChallenge(user, challenge, monthKey) {
        // Fetch game info first to save with the challenge - WITH FALLBACK
        let gameInfo;
        let gameTitle;
        let gameIconUrl;
        
        try {
            gameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);
            gameTitle = gameInfo.title;
            gameIconUrl = gameInfo.imageIcon;
            console.log(`API: Retrieved game info for ${challenge.monthly_challange_gameid}: ${gameTitle}`);
        } catch (error) {
            console.error(`Error fetching game info for ${challenge.monthly_challange_gameid}:`, error);
            
            // FALLBACK: Use stored metadata from Challenge document
            gameTitle = challenge.monthly_game_title;
            gameIconUrl = challenge.monthly_game_icon_url;
            gameInfo = null;
            
            if (gameTitle) {
                console.log(`FALLBACK: Using stored metadata for ${challenge.monthly_challange_gameid}: ${gameTitle}`);
            } else {
                console.warn(`No metadata available for game ${challenge.monthly_challange_gameid}`);
            }
        }

        // FIXED: Get current user awards to determine actual completion status
        let userAwards;
        try {
            userAwards = await retroAPI.getUserAwards(user.raUsername);
        } catch (error) {
            console.error(`Error fetching user awards for ${user.raUsername}:`, error);
            return { hasUpdate: false };
        }

        if (!userAwards || !userAwards.visibleUserAwards) {
            console.log(`No user awards found for ${user.raUsername}`);
            return { hasUpdate: false };
        }

        // FIXED: Find awards for this specific monthly game using current API data
        const gameAwards = userAwards.visibleUserAwards.filter(award => {
            return String(award.awardData || award.AwardData) === String(challenge.monthly_challange_gameid);
        });

        // FIXED: Determine progress based on current award status (same as gameAwardService)
        let monthlyPoints = 0;
        let awardDetails = 'No awards found';

        if (gameAwards.length > 0) {
            // Find the highest award for this game
            let highestAward = null;
            let isMastery = false;
            let isBeaten = false;
            
            for (const award of gameAwards) {
                const awardType = award.awardType || award.AwardType || '';
                const awardExtra = award.awardDataExtra || award.AwardDataExtra || 0;
                
                const normalizedType = this.normalizeAwardKind(awardType);
                
                if (normalizedType === 'mastery') {
                    if (awardExtra === 1) { // Hardcore mastery
                        isMastery = true;
                        highestAward = award;
                        break; // Mastery is highest, stop looking
                    }
                }
                
                if (normalizedType === 'completion') {
                    if (awardExtra === 1) { // Hardcore beaten
                        isBeaten = true;
                        if (!highestAward) highestAward = award;
                    }
                }
            }

            // Set progress based on actual awards
            if (isMastery) {
                monthlyPoints = 3; // Mastery
                awardDetails = 'Mastery award found';
            } else if (isBeaten) {
                monthlyPoints = 2; // Beaten
                awardDetails = 'Beaten award found';
            } else {
                monthlyPoints = 1; // Participation (has some awards but not mastery/beaten)
                awardDetails = `${gameAwards.length} awards found (participation level)`;
            }

            console.log(`${user.raUsername} - Monthly ${monthKey}: ${awardDetails} -> progress ${monthlyPoints}`);
        }

        // Get current progress data for achievement counts
        let monthlyProgress;
        let achievementCount = 0;
        let completionPercentage = 0;

        try {
            monthlyProgress = await retroAPI.getUserGameProgress(user.raUsername, challenge.monthly_challange_gameid);
            const userAchievements = monthlyProgress.achievements || {};
            achievementCount = Object.keys(userAchievements).length;
            completionPercentage = monthlyProgress.completionPercentage || 0;
        } catch (error) {
            console.warn(`Could not get game progress for ${user.raUsername} on game ${challenge.monthly_challange_gameid}`);
        }

        return {
            hasUpdate: true,
            data: { 
                progress: monthlyPoints,
                achievements: achievementCount,
                totalAchievements: challenge.monthly_challange_game_total,
                percentage: parseFloat(completionPercentage.toFixed(2)),
                gameTitle: monthlyProgress?.title || gameTitle || challenge.monthly_game_title || `Game ${challenge.monthly_challange_gameid}`,
                gameIconUrl: gameIconUrl || challenge.monthly_game_icon_url,
                lastUpdated: new Date(),
                calculationMethod: 'current_api_status', // Track how this was calculated
                gameBeaten: monthlyPoints >= 2 // Track if game is beaten
            }
        };
    }

    /**
     * FIXED: Process shadow challenge using current API status (same logic as gameAwardService)
     */
    async processShadowChallenge(user, challenge, monthKey) {
        // If there's a shadow challenge and it's revealed, update that too
        if (!challenge.shadow_challange_gameid || !challenge.shadow_challange_revealed) {
            return { hasUpdate: false };
        }

        // Get shadow game info with fallback
        let shadowGameInfo;
        let shadowGameTitle;
        let shadowGameIconUrl;
        
        try {
            shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);
            shadowGameTitle = shadowGameInfo.title;
            shadowGameIconUrl = shadowGameInfo.imageIcon;
            console.log(`API: Retrieved shadow game info for ${challenge.shadow_challange_gameid}: ${shadowGameTitle}`);
        } catch (error) {
            console.error(`Error fetching shadow game info for ${challenge.shadow_challange_gameid}:`, error);
            
            // FALLBACK: Use stored metadata from Challenge document
            shadowGameTitle = challenge.shadow_game_title;
            shadowGameIconUrl = challenge.shadow_game_icon_url;
            shadowGameInfo = null;
            
            if (shadowGameTitle) {
                console.log(`FALLBACK: Using stored shadow metadata for ${challenge.shadow_challange_gameid}: ${shadowGameTitle}`);
            } else {
                console.warn(`No shadow metadata available for game ${challenge.shadow_challange_gameid}`);
            }
        }

        // FIXED: Get current user awards to determine actual completion status
        let userAwards;
        try {
            userAwards = await retroAPI.getUserAwards(user.raUsername);
        } catch (error) {
            console.error(`Error fetching user awards for ${user.raUsername}:`, error);
            return { hasUpdate: false };
        }

        if (!userAwards || !userAwards.visibleUserAwards) {
            console.log(`No user awards found for ${user.raUsername}`);
            return { hasUpdate: false };
        }

        // FIXED: Find awards for this specific shadow game using current API data
        const shadowGameAwards = userAwards.visibleUserAwards.filter(award => {
            return String(award.awardData || award.AwardData) === String(challenge.shadow_challange_gameid);
        });

        // FIXED: Determine progress based on current award status (same as gameAwardService)
        let shadowPoints = 0;
        let awardDetails = 'No awards found';

        if (shadowGameAwards.length > 0) {
            // Find the highest award for this shadow game
            let highestAward = null;
            let isBeaten = false;
            
            for (const award of shadowGameAwards) {
                const awardType = award.awardType || award.AwardType || '';
                const awardExtra = award.awardDataExtra || award.AwardDataExtra || 0;
                
                const normalizedType = this.normalizeAwardKind(awardType);
                
                // For shadow games, mastery and completion both count as "beaten" (max level)
                if ((normalizedType === 'mastery' || normalizedType === 'completion') && awardExtra === 1) {
                    isBeaten = true;
                    highestAward = award;
                    break; // Beaten is highest for shadow, stop looking
                }
            }

            // Set progress based on actual awards (shadow max is 2 = beaten)
            if (isBeaten) {
                shadowPoints = 2; // Beaten (highest level for shadow)
                awardDetails = 'Beaten/Mastery award found';
            } else {
                shadowPoints = 1; // Participation (has some awards but not beaten)
                awardDetails = `${shadowGameAwards.length} awards found (participation level)`;
            }

            console.log(`${user.raUsername} - Shadow ${monthKey}: ${awardDetails} -> progress ${shadowPoints}`);
        }

        // Get current progress data for achievement counts
        let shadowProgress;
        let achievementCount = 0;
        let completionPercentage = 0;

        try {
            shadowProgress = await retroAPI.getUserGameProgress(user.raUsername, challenge.shadow_challange_gameid);
            const userShadowAchievements = shadowProgress.achievements || {};
            achievementCount = Object.keys(userShadowAchievements).length;
            completionPercentage = shadowProgress.completionPercentage || 0;
        } catch (error) {
            console.warn(`Could not get shadow game progress for ${user.raUsername} on game ${challenge.shadow_challange_gameid}`);
        }

        return {
            hasUpdate: true,
            data: { 
                progress: shadowPoints,
                achievements: achievementCount,
                totalAchievements: challenge.shadow_challange_game_total,
                percentage: parseFloat(completionPercentage.toFixed(2)),
                gameTitle: shadowProgress?.title || shadowGameTitle || challenge.shadow_game_title || `Game ${challenge.shadow_challange_gameid}`,
                gameIconUrl: shadowGameIconUrl || challenge.shadow_game_icon_url,
                lastUpdated: new Date(),
                calculationMethod: 'current_api_status', // Track how this was calculated
                gameBeaten: shadowPoints >= 2 // Track if game is beaten
            }
        };
    }

    /**
     * Helper method to convert progress to level name
     */
    progressToLevel(progress, type) {
        if (progress >= 3) {
            return type === 'shadow' ? 'beaten' : 'mastery';
        } else if (progress >= 2) {
            return 'beaten';
        } else if (progress >= 1) {
            return 'participation';
        }
        return 'none';
    }

    /**
     * ENHANCED: Force update a specific user's stats (useful for debugging or manual fixes)
     */
    async forceUpdateUser(username) {
        console.log(`Force updating stats for ${username}...`);
        
        const user = await User.findOne({ 
            raUsername: { $regex: new RegExp('^' + username + '$', 'i') }
        });
        
        if (!user) {
            throw new Error(`User ${username} not found`);
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
            throw new Error('No current challenge found');
        }

        const monthKey = this.createMonthKey(currentChallenge.date);
        await this.updateUserStats(user, currentChallenge, monthKey);
        
        console.log(`✅ Force update completed for ${username}`);
        return { success: true, monthKey, user: user.raUsername };
    }
}

// Create singleton instance
const statsUpdateService = new StatsUpdateService();
export default statsUpdateService;
