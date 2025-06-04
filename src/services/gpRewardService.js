// src/services/gpRewardService.js - Complete fixed version preventing infinite loops
import { User } from '../models/User.js';
import gpUtils from '../utils/gpUtils.js';

// GP reward amounts
export const GP_REWARDS = {
    NOMINATION: 20,
    VOTE: 20,
    MONTHLY_PARTICIPATION: 20,
    MONTHLY_BEATEN: 50,
    MONTHLY_MASTERY: 100,
    SHADOW_PARTICIPATION: 20,
    SHADOW_BEATEN: 50,
    SHADOW_MASTERY: 100,
    REGULAR_BEATEN: 20,
    REGULAR_MASTERY: 20
};

class GPRewardService {
    constructor() {
        this.rewardHistory = new Set(); // Prevent duplicate rewards in same session
        this.cleanupInterval = null; // Track the cleanup interval
        this.isInitialized = false; // Prevent multiple initializations
    }

    /**
     * Initialize the service (call this only once)
     */
    initialize() {
        if (this.isInitialized) {
            console.log('GP reward service already initialized, skipping...');
            return;
        }

        console.log('Initializing GP reward service...');
        
        // Start cleanup interval (only if not already running)
        if (!this.cleanupInterval) {
            this.cleanupInterval = setInterval(() => {
                this.cleanupRewardHistory();
            }, 60 * 60 * 1000); // 1 hour
            
            console.log('GP reward cleanup interval started (runs every hour)');
        }

        this.isInitialized = true;
        console.log('GP reward service initialized successfully');
    }

    /**
     * Stop the service and cleanup
     */
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('GP reward cleanup interval stopped');
        }
        this.isInitialized = false;
    }

    /**
     * Award GP for nomination
     */
    async awardNominationGP(user, gameTitle) {
        try {
            const rewardKey = `nomination:${user.raUsername}:${gameTitle}:${Date.now()}`;
            
            if (this.rewardHistory.has(rewardKey)) {
                console.log(`Duplicate nomination reward prevented for ${user.raUsername}`);
                return false;
            }

            await gpUtils.awardGP(
                user,
                GP_REWARDS.NOMINATION,
                'nomination',
                `Nominated "${gameTitle}" for monthly challenge`,
                null
            );

            this.rewardHistory.add(rewardKey);
            console.log(`Awarded ${GP_REWARDS.NOMINATION} GP to ${user.raUsername} for nominating ${gameTitle}`);
            return true;
        } catch (error) {
            console.error(`Error awarding nomination GP to ${user.raUsername}:`, error);
            return false;
        }
    }

    /**
     * Award GP for voting
     */
    async awardVotingGP(user, pollType = 'monthly') {
        try {
            const rewardKey = `vote:${user.raUsername}:${pollType}:${new Date().toDateString()}`;
            
            if (this.rewardHistory.has(rewardKey)) {
                console.log(`Duplicate voting reward prevented for ${user.raUsername}`);
                return false;
            }

            await gpUtils.awardGP(
                user,
                GP_REWARDS.VOTE,
                'vote',
                `Voted in ${pollType} challenge poll`,
                null
            );

            this.rewardHistory.add(rewardKey);
            console.log(`Awarded ${GP_REWARDS.VOTE} GP to ${user.raUsername} for voting in ${pollType} poll`);
            return true;
        } catch (error) {
            console.error(`Error awarding voting GP to ${user.raUsername}:`, error);
            return false;
        }
    }

    /**
     * Award GP for game awards (monthly/shadow challenges)
     */
    async awardChallengeGP(user, gameTitle, awardType, systemType) {
        try {
            const rewardKey = `challenge:${user.raUsername}:${systemType}:${gameTitle}:${awardType}`;
            
            if (this.rewardHistory.has(rewardKey)) {
                console.log(`Duplicate challenge reward prevented for ${user.raUsername}`);
                return false;
            }

            let gpAmount = 0;
            let description = '';

            // Determine GP amount based on award type and system
            if (awardType === 'mastery') {
                gpAmount = systemType === 'shadow' ? GP_REWARDS.SHADOW_MASTERY : GP_REWARDS.MONTHLY_MASTERY;
                description = `Mastered "${gameTitle}" in ${systemType} challenge`;
            } else if (awardType === 'beaten') {
                gpAmount = systemType === 'shadow' ? GP_REWARDS.SHADOW_BEATEN : GP_REWARDS.MONTHLY_BEATEN;
                description = `Beaten "${gameTitle}" in ${systemType} challenge`;
            } else if (awardType === 'participation') {
                gpAmount = systemType === 'shadow' ? GP_REWARDS.SHADOW_PARTICIPATION : GP_REWARDS.MONTHLY_PARTICIPATION;
                description = `Participated in "${gameTitle}" ${systemType} challenge`;
            }

            if (gpAmount > 0) {
                await gpUtils.awardGP(
                    user,
                    gpAmount,
                    'challenge_award',
                    description,
                    null
                );

                this.rewardHistory.add(rewardKey);
                console.log(`Awarded ${gpAmount} GP to ${user.raUsername} for ${awardType} in ${systemType} challenge`);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`Error awarding challenge GP to ${user.raUsername}:`, error);
            return false;
        }
    }

    /**
     * Award GP for regular game mastery/beaten (from achievement feed)
     */
    async awardRegularGameGP(user, gameTitle, isMastery) {
        try {
            const awardType = isMastery ? 'mastery' : 'beaten';
            const rewardKey = `regular:${user.raUsername}:${gameTitle}:${awardType}:${new Date().toDateString()}`;
            
            if (this.rewardHistory.has(rewardKey)) {
                console.log(`Duplicate regular game reward prevented for ${user.raUsername}`);
                return false;
            }

            const gpAmount = isMastery ? GP_REWARDS.REGULAR_MASTERY : GP_REWARDS.REGULAR_BEATEN;
            const description = `${isMastery ? 'Mastered' : 'Beaten'} "${gameTitle}"`;

            await gpUtils.awardGP(
                user,
                gpAmount,
                'game_completion',
                description,
                null
            );

            this.rewardHistory.add(rewardKey);
            console.log(`Awarded ${gpAmount} GP to ${user.raUsername} for ${awardType} of ${gameTitle}`);
            return true;
        } catch (error) {
            console.error(`Error awarding regular game GP to ${user.raUsername}:`, error);
            return false;
        }
    }

    /**
     * Clean up old reward history to prevent memory bloat (now controlled)
     */
    cleanupRewardHistory() {
        if (this.rewardHistory.size === 0) {
            // Don't log if there's nothing to clean
            return;
        }

        const sizeBefore = this.rewardHistory.size;
        
        // Clear the history periodically to prevent memory issues
        // This is safe since we're only preventing duplicates within the same session
        this.rewardHistory.clear();
        
        console.log(`GP reward history cleaned up (${sizeBefore} entries removed)`);
    }

    /**
     * Get reward statistics
     */
    getRewardStats() {
        return {
            rewardHistorySize: this.rewardHistory.size,
            rewardAmounts: GP_REWARDS,
            isInitialized: this.isInitialized,
            hasCleanupInterval: !!this.cleanupInterval
        };
    }
}

// Create singleton instance
const gpRewardService = new GPRewardService();

// REMOVED: The automatic setInterval that was causing the infinite loop
// The service will now be initialized manually in index.js

export default gpRewardService;
