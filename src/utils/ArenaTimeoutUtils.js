// src/utils/ArenaTimeoutUtils.js
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { User } from '../models/User.js';
import arenaService from '../services/arenaService.js';

export default class ArenaTimeoutUtils {
    /**
     * Check for open challenges that should be automatically cancelled due to timeout
     * This should be called periodically (e.g., every hour)
     */
    static async checkAndProcessTimeouts() {
        try {
            console.log('Checking for open challenges that need auto-cancellation...');
            
            // Find open challenges with no participants that are older than 72 hours
            const timeoutThreshold = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago
            
            const timedOutChallenges = await ArenaChallenge.find({
                status: 'open',
                isOpenChallenge: true,
                participants: { $size: 0 }, // No participants
                createdAt: { $lte: timeoutThreshold } // Created more than 72 hours ago
            });
            
            if (timedOutChallenges.length === 0) {
                console.log('No open challenges found that need auto-cancellation.');
                return { processed: 0, errors: 0 };
            }
            
            console.log(`Found ${timedOutChallenges.length} open challenges to auto-cancel.`);
            
            let processed = 0;
            let errors = 0;
            
            for (const challenge of timedOutChallenges) {
                try {
                    await this.processChallengeTimeout(challenge);
                    processed++;
                } catch (error) {
                    console.error(`Error processing timeout for challenge ${challenge._id}:`, error);
                    errors++;
                }
                
                // Small delay to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            console.log(`Auto-cancellation complete: ${processed} processed, ${errors} errors.`);
            
            return { processed, errors };
        } catch (error) {
            console.error('Error in checkAndProcessTimeouts:', error);
            return { processed: 0, errors: 1 };
        }
    }

    /**
     * Process the timeout for a specific challenge
     * @param {Object} challenge - The challenge to timeout
     */
    static async processChallengeTimeout(challenge) {
        try {
            // Double-check that this challenge should be cancelled
            if (challenge.status !== 'open' || 
                !challenge.isOpenChallenge || 
                (challenge.participants && challenge.participants.length > 0)) {
                console.log(`Challenge ${challenge._id} no longer qualifies for auto-cancellation.`);
                return;
            }
            
            const timeSinceCreation = Date.now() - challenge.createdAt.getTime();
            if (timeSinceCreation < 72 * 60 * 60 * 1000) {
                console.log(`Challenge ${challenge._id} is not old enough for auto-cancellation.`);
                return;
            }
            
            // Get the creator
            const creator = await User.findOne({ discordId: challenge.challengerId });
            if (!creator) {
                console.error(`Creator not found for challenge ${challenge._id}`);
                return;
            }
            
            // Cancel the challenge
            challenge.status = 'cancelled';
            await challenge.save();
            
            // Refund the creator's wager
            await arenaService.trackGpTransaction(
                creator,
                challenge.wagerAmount,
                'Open challenge auto-cancelled - wager refunded',
                `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}, Reason: No participants after 72 hours`
            );
            
            console.log(`Auto-cancelled challenge ${challenge._id} and refunded ${challenge.wagerAmount} GP to ${creator.raUsername}`);
            
            // Send notification about the auto-cancellation
            await arenaService.notifyAutoTimeout(challenge, creator);
            
            // Update the arena feed to remove the challenge
            await arenaService.refreshEntireFeed();
            
        } catch (error) {
            console.error(`Error processing timeout for challenge ${challenge._id}:`, error);
            throw error;
        }
    }

    /**
     * Get challenges that are approaching timeout (within 12 hours)
     * This can be used for warning notifications
     */
    static async getChallengersApproachingTimeout() {
        try {
            const warningThreshold = new Date(Date.now() - 60 * 60 * 60 * 1000); // 60 hours ago (12 hours before timeout)
            const timeoutThreshold = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago
            
            const approachingTimeout = await ArenaChallenge.find({
                status: 'open',
                isOpenChallenge: true,
                participants: { $size: 0 }, // No participants
                createdAt: { 
                    $lte: warningThreshold, // Created more than 60 hours ago
                    $gt: timeoutThreshold   // But less than 72 hours ago
                }
            });
            
            return approachingTimeout;
        } catch (error) {
            console.error('Error getting challenges approaching timeout:', error);
            return [];
        }
    }

    /**
     * Check if a specific challenge is eligible for manual cancellation
     * @param {Object} challenge - The challenge to check
     * @param {string} userId - The Discord ID of the user requesting cancellation
     */
    static canCancelChallenge(challenge, userId) {
        // Must be an open challenge
        if (!challenge.isOpenChallenge || challenge.status !== 'open') {
            return { canCancel: false, reason: 'Only open challenges can be cancelled.' };
        }
        
        // Must be the creator
        if (challenge.challengerId !== userId) {
            return { canCancel: false, reason: 'You can only cancel challenges you created.' };
        }
        
        // Must have no participants
        if (challenge.participants && challenge.participants.length > 0) {
            return { canCancel: false, reason: 'Cannot cancel a challenge that has participants.' };
        }
        
        // Must be within 72 hours
        const timeSinceCreation = Date.now() - challenge.createdAt.getTime();
        if (timeSinceCreation > 72 * 60 * 60 * 1000) {
            const hoursOverdue = Math.floor((timeSinceCreation - 72 * 60 * 60 * 1000) / (60 * 60 * 1000));
            return { 
                canCancel: false, 
                reason: `This challenge is too old to cancel manually (${hoursOverdue} hours past the 72-hour limit). It should auto-cancel soon.` 
            };
        }
        
        return { canCancel: true, reason: null };
    }

    /**
     * Get time until auto-cancellation for a challenge
     * @param {Object} challenge - The challenge to check
     */
    static getTimeUntilAutoCancel(challenge) {
        if (!challenge.isOpenChallenge || challenge.status !== 'open') {
            return null;
        }
        
        const timeSinceCreation = Date.now() - challenge.createdAt.getTime();
        const timeUntilCancel = (72 * 60 * 60 * 1000) - timeSinceCreation;
        
        if (timeUntilCancel <= 0) {
            return { expired: true, hoursLeft: 0 };
        }
        
        const hoursLeft = Math.ceil(timeUntilCancel / (60 * 60 * 1000));
        return { expired: false, hoursLeft };
    }
}
