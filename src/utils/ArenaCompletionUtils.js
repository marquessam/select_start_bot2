// src/utils/ArenaCompletionUtils.js
import { User } from '../models/User.js';
import { processLeaderboardEntries, findUserInLeaderboard } from './arenaUtils.js';
import RetroAPIUtils from './RetroAPIUtils.js';
import ArenaTransactionUtils from './ArenaTransactionUtils.js';
import ArenaBettingUtils from './ArenaBettingUtils.js';

/**
 * Utility class for processing completed arena challenges
 */
export class ArenaCompletionUtils {
    /**
     * Get challenger scores using simplified ApiRank logic
     * @param {Object} challenge - Challenge object
     * @returns {Array} - [challengerScore, challengeeScore]
     */
    static async getChallengersScores(challenge) {
        try {
            // Get leaderboard entries
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
            
            // Process entries - simplified to use rank only
            const leaderboardEntries = processLeaderboardEntries(rawEntries);
            
            // Find challenger entry
            const challengerEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengerUsername);
            
            // Find challengee entry
            const challengeeEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengeeUsername);
            
            // Format challenger score
            const challengerScore = {
                value: challengerEntry ? challengerEntry.Value : 0,
                formattedScore: challengerEntry ? challengerEntry.FormattedScore : 'No score yet',
                exists: !!challengerEntry,
                rank: challengerEntry ? challengerEntry.ApiRank : 0
            };
            
            // Format challengee score
            const challengeeScore = {
                value: challengeeEntry ? challengeeEntry.Value : 0,
                formattedScore: challengeeEntry ? challengeeEntry.FormattedScore : 'No score yet',
                exists: !!challengeeEntry,
                rank: challengeeEntry ? challengeeEntry.ApiRank : 0
            };
            
            return [challengerScore, challengeeScore];
        } catch (error) {
            console.error('Error getting challenger scores:', error);
            return [
                { value: 0, formattedScore: 'Error retrieving score', exists: false, rank: 0 }, 
                { value: 0, formattedScore: 'Error retrieving score', exists: false, rank: 0 }
            ];
        }
    }

    /**
     * Get participant score for open challenges
     * @param {Object} challenge - Challenge object
     * @param {string} participantUsername - Username to get score for
     * @returns {Object} - Score info
     */
    static async getParticipantScore(challenge, participantUsername) {
        try {
            // Get leaderboard entries
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
            
            // Process entries
            const leaderboardEntries = processLeaderboardEntries(rawEntries);
            
            // Find entry for this participant
            const participantEntry = findUserInLeaderboard(leaderboardEntries, participantUsername);
            
            // Format score
            return {
                exists: !!participantEntry,
                formattedScore: participantEntry ? participantEntry.FormattedScore : 'No entry',
                rank: participantEntry ? participantEntry.ApiRank : 0,
                value: participantEntry ? participantEntry.Value : 0
            };
        } catch (error) {
            console.error(`Error fetching leaderboard position for ${participantUsername}:`, error);
            return {
                exists: false,
                formattedScore: 'Error fetching score',
                rank: 0,
                value: 0
            };
        }
    }

    /**
     * Process completed direct challenge (1v1)
     * @param {Object} challenge - Challenge object
     * @returns {Object} - Updated challenge
     */
    static async processCompletedDirectChallenge(challenge) {
        try {
            console.log(`Processing completed direct challenge: ${challenge._id} - ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`);
            
            // Get final scores
            const [challengerScore, challengeeScore] = await this.getChallengersScores(challenge);
            
            console.log(`Final scores - ${challenge.challengerUsername}: ${challengerScore.formattedScore} (rank: ${challengerScore.rank}), ${challenge.challengeeUsername}: ${challengeeScore.formattedScore} (rank: ${challengeeScore.rank})`);
            
            // Determine the winner using ApiRank only (lower rank is better)
            let winnerId, winnerUsername;
            
            if (challengerScore.rank && challengeeScore.rank && challengerScore.rank > 0 && challengeeScore.rank > 0) {
                if (challengerScore.rank < challengeeScore.rank) {
                    winnerId = challenge.challengerId;
                    winnerUsername = challenge.challengerUsername;
                } else if (challengeeScore.rank < challengerScore.rank) {
                    winnerId = challenge.challengeeId;
                    winnerUsername = challenge.challengeeUsername;
                } else {
                    // Ranks are identical - it's a tie
                    winnerId = null;
                    winnerUsername = 'Tie';
                }
            } else if (challengerScore.rank && challengerScore.rank > 0 && (!challengeeScore.rank || challengeeScore.rank === 0)) {
                // Only challenger has a rank
                winnerId = challenge.challengerId;
                winnerUsername = challenge.challengerUsername;
            } else if (challengeeScore.rank && challengeeScore.rank > 0 && (!challengerScore.rank || challengerScore.rank === 0)) {
                // Only challengee has a rank
                winnerId = challenge.challengeeId;
                winnerUsername = challenge.challengeeUsername;
            } else {
                // Neither has a valid rank - it's a tie
                winnerId = null;
                winnerUsername = 'Tie';
            }
            
            console.log(`Winner determined: ${winnerUsername} (ID: ${winnerId || 'none'})`);
            
            // Update challenge data - FIXED: Properly set to completed
            challenge.status = 'completed';
            challenge.challengerScore = challengerScore.formattedScore;
            challenge.challengeeScore = challengeeScore.formattedScore;
            challenge.winnerId = winnerId;
            challenge.winnerUsername = winnerUsername;
            challenge.completedAt = new Date(); // Add completion timestamp
            
            // Save the updated challenge
            await challenge.save();
            
            console.log(`Direct challenge ${challenge._id} marked as completed with winner: ${winnerUsername}`);
            
            // Process wager transfers and bet payouts
            await this.processDirectChallengePayouts(challenge, winnerId, winnerUsername);
            
            return challenge;
        } catch (error) {
            console.error('Error processing completed direct challenge:', error);
            throw error;
        }
    }

    /**
     * Process completed open challenge
     * @param {Object} challenge - Challenge object
     * @returns {Object} - Updated challenge
     */
    static async processCompletedOpenChallenge(challenge) {
        try {
            console.log(`Processing completed open challenge: ${challenge._id} - ${challenge.gameTitle} by ${challenge.challengerUsername}`);
            
            // Transition status to active if it was still open but had participants and has ended
            if (challenge.status === 'open' && challenge.participants && challenge.participants.length > 0) {
                console.log(`Transitioning open challenge ${challenge._id} to active status for completion processing`);
                // Don't save yet, we'll save at the end with completed status
            }
            
            // Get scores for all participants
            const participantScores = new Map();
            
            // Get challenger (creator) score
            const [challengerScore, _] = await this.getChallengersScores(challenge);
            
            console.log(`Creator ${challenge.challengerUsername} score: ${challengerScore.formattedScore} (rank: ${challengerScore.rank})`);
            
            // Add challenger to scores map
            participantScores.set(challenge.challengerUsername.toLowerCase(), {
                exists: challengerScore.rank > 0,
                formattedScore: challengerScore.formattedScore,
                value: challengerScore.value,
                rank: challengerScore.rank
            });
            
            // Store the challenger score
            challenge.challengerScore = challengerScore.formattedScore;
            
            // Get scores for each participant
            for (const participant of challenge.participants) {
                try {
                    const entry = await this.getParticipantScore(challenge, participant.username);
                    participantScores.set(participant.username.toLowerCase(), entry);
                    participant.score = entry.formattedScore;
                    console.log(`Participant ${participant.username} score: ${entry.formattedScore} (rank: ${entry.rank})`);
                } catch (error) {
                    console.error(`Error getting score for participant ${participant.username}:`, error);
                    participantScores.set(participant.username.toLowerCase(), {
                        exists: false,
                        formattedScore: 'No score yet',
                        value: 0,
                        rank: 0
                    });
                    participant.score = 'No score yet';
                }
            }
            
            // Determine winner - use ApiRank (lower is better)
            let winnerId = null;
            let winnerUsername = 'No Winner';
            let bestRank = Number.MAX_SAFE_INTEGER;
            
            // Check challenger first
            if (challengerScore.rank && challengerScore.rank > 0 && challengerScore.rank < bestRank) {
                winnerId = challenge.challengerId;
                winnerUsername = challenge.challengerUsername;
                bestRank = challengerScore.rank;
            }
            
            // Check each participant for better rank
            for (const participant of challenge.participants) {
                const participantScore = participantScores.get(participant.username.toLowerCase());
                if (!participantScore) continue;
                
                // Check by rank (lower is better)
                if (participantScore.rank && participantScore.rank > 0 && participantScore.rank < bestRank) {
                    winnerId = participant.userId;
                    winnerUsername = participant.username;
                    bestRank = participantScore.rank;
                }
            }
            
            console.log(`Winner determined: ${winnerUsername} (ID: ${winnerId || 'none'}) with rank ${bestRank === Number.MAX_SAFE_INTEGER ? 'none' : bestRank}`);
            
            // Calculate total pot (creator + all participants)
            const totalWagered = challenge.wagerAmount * (1 + challenge.participants.length);
            
            console.log(`Total pot to award: ${totalWagered} GP (${challenge.wagerAmount} GP × ${1 + challenge.participants.length} participants)`);
            
            // Award pot to winner
            if (winnerId) {
                const winner = await User.findOne({ discordId: winnerId });
                if (winner) {
                    await ArenaTransactionUtils.trackGpTransaction(
                        winner,
                        totalWagered,
                        'Won open challenge',
                        `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}, Participants: ${1 + challenge.participants.length}`
                    );
                    
                    // Update stats
                    winner.arenaStats = winner.arenaStats || {};
                    winner.arenaStats.wins = (winner.arenaStats.wins || 0) + 1;
                    winner.arenaStats.gpWon = (winner.arenaStats.gpWon || 0) + totalWagered - challenge.wagerAmount;
                    await winner.save();
                    
                    console.log(`Awarded ${totalWagered} GP to winner ${winnerUsername} for open challenge ${challenge._id}`);
                } else {
                    console.error(`Winner user not found: ${winnerId}`);
                }
            } else {
                console.log(`No winner for challenge ${challenge._id} - no payouts will be made`);
            }
            
            // Update challenge data - FIXED: Properly set to completed
            challenge.status = 'completed';
            challenge.winnerId = winnerId;
            challenge.winnerUsername = winnerUsername;
            challenge.completedAt = new Date(); // Add completion timestamp
            
            // Save the updated challenge
            await challenge.save();
            
            console.log(`Open challenge ${challenge._id} marked as completed with winner: ${winnerUsername}`);
            
            // Process bet payouts
            if (challenge.bets && challenge.bets.length > 0) {
                console.log(`Processing ${challenge.bets.length} bets for completed open challenge`);
                await ArenaBettingUtils.processBetsForChallenge(challenge, winnerId, winnerUsername);
            } else {
                console.log(`No bets to process for challenge ${challenge._id}`);
            }
            
            return challenge;
        } catch (error) {
            console.error('Error processing completed open challenge:', error);
            throw error;
        }
    }

    /**
     * Process payouts for direct challenges
     * @param {Object} challenge - Challenge object
     * @param {string} winnerId - Winner's Discord ID
     * @param {string} winnerUsername - Winner's username
     */
    static async processDirectChallengePayouts(challenge, winnerId, winnerUsername) {
        try {
            console.log(`Processing payouts for direct challenge ${challenge._id}, winner: ${winnerUsername || 'none'}`);
            
            // Skip payouts if it's a tie
            if (!winnerId) {
                console.log(`Challenge ${challenge._id} ended in a tie - no wager payouts`);
                
                // Still process bets (they get refunded for ties)
                if (challenge.bets && challenge.bets.length > 0) {
                    console.log(`Processing ${challenge.bets.length} bets for tied challenge (will be refunded)`);
                    await ArenaBettingUtils.processBetsForChallenge(challenge, winnerId, winnerUsername);
                }
                return;
            }
            
            // Get the users
            const challenger = await User.findOne({ discordId: challenge.challengerId });
            const challengee = await User.findOne({ discordId: challenge.challengeeId });
            
            if (!challenger || !challengee) {
                console.error(`Missing users for challenge ${challenge._id} - Challenger: ${!!challenger}, Challengee: ${!!challengee}`);
                return;
            }
            
            console.log(`Processing wager transfer: ${challenge.wagerAmount} GP × 2 = ${challenge.wagerAmount * 2} GP to winner`);
            
            // Transfer wager amount from loser to winner
            if (winnerId === challenge.challengerId) {
                // Challenger won
                await ArenaTransactionUtils.trackGpTransaction(
                    challenger,
                    challenge.wagerAmount * 2,
                    'Won challenge',
                    `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}, Defeated: ${challenge.challengeeUsername}`
                );
                
                // Update stats
                challenger.arenaStats = challenger.arenaStats || {};
                challenger.arenaStats.wins = (challenger.arenaStats.wins || 0) + 1;
                challenger.arenaStats.gpWon = (challenger.arenaStats.gpWon || 0) + challenge.wagerAmount;
                
                challengee.arenaStats = challengee.arenaStats || {};
                challengee.arenaStats.losses = (challengee.arenaStats.losses || 0) + 1;
                challengee.arenaStats.gpLost = (challengee.arenaStats.gpLost || 0) + challenge.wagerAmount;
                
                await challenger.save();
                await challengee.save();
                
                console.log(`Challenger ${challenge.challengerUsername} won - awarded ${challenge.wagerAmount * 2} GP`);
            } else {
                // Challengee won
                await ArenaTransactionUtils.trackGpTransaction(
                    challengee,
                    challenge.wagerAmount * 2,
                    'Won challenge',
                    `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}, Defeated: ${challenge.challengerUsername}`
                );
                
                // Update stats
                challengee.arenaStats = challengee.arenaStats || {};
                challengee.arenaStats.wins = (challengee.arenaStats.wins || 0) + 1;
                challengee.arenaStats.gpWon = (challengee.arenaStats.gpWon || 0) + challenge.wagerAmount;
                
                challenger.arenaStats = challenger.arenaStats || {};
                challenger.arenaStats.losses = (challenger.arenaStats.losses || 0) + 1;
                challenger.arenaStats.gpLost = (challenger.arenaStats.gpLost || 0) + challenge.wagerAmount;
                
                await challengee.save();
                await challenger.save();
                
                console.log(`Challengee ${challenge.challengeeUsername} won - awarded ${challenge.wagerAmount * 2} GP`);
            }
            
            // Process bets
            if (challenge.bets && challenge.bets.length > 0) {
                console.log(`Processing ${challenge.bets.length} bets for completed direct challenge`);
                await ArenaBettingUtils.processBetsForChallenge(challenge, winnerId, winnerUsername);
            } else {
                console.log(`No bets to process for challenge ${challenge._id}`);
            }
        } catch (error) {
            console.error('Error processing direct challenge payouts:', error);
        }
    }

    /**
     * Check if an existing challenge exists between two users
     * @param {Object} user1 - First user
     * @param {Object} user2 - Second user
     * @returns {Object|null} - Existing challenge or null
     */
    static async checkExistingChallenge(user1, user2) {
        try {
            const { ArenaChallenge } = await import('../models/ArenaChallenge.js');
            
            const existingChallenge = await ArenaChallenge.findOne({
                $or: [
                    {
                        challengerId: user1.discordId,
                        challengeeId: user2.discordId,
                        status: { $in: ['pending', 'active'] }
                    },
                    {
                        challengerId: user2.discordId,
                        challengeeId: user1.discordId,
                        status: { $in: ['pending', 'active'] }
                    }
                ]
            });
            
            if (existingChallenge) {
                console.log(`Found existing challenge ${existingChallenge._id} between ${user1.raUsername} and ${user2.raUsername}`);
            }
            
            return existingChallenge;
        } catch (error) {
            console.error('Error checking for existing challenge:', error);
            return null;
        }
    }

    /**
     * Cleanup completed challenges that are too old (optional utility method)
     * This can be called periodically to clean up very old completed challenges
     * @param {number} daysOld - How many days old completed challenges should be before cleanup
     * @returns {number} - Number of challenges cleaned up
     */
    static async cleanupOldCompletedChallenges(daysOld = 30) {
        try {
            const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
            
            const { ArenaChallenge } = await import('../models/ArenaChallenge.js');
            
            const oldChallenges = await ArenaChallenge.find({
                status: 'completed',
                completedAt: { $lt: cutoffDate }
            });
            
            if (oldChallenges.length === 0) {
                console.log(`No completed challenges older than ${daysOld} days found for cleanup`);
                return 0;
            }
            
            console.log(`Found ${oldChallenges.length} completed challenges older than ${daysOld} days for cleanup`);
            
            // Delete the old challenges
            const result = await ArenaChallenge.deleteMany({
                status: 'completed',
                completedAt: { $lt: cutoffDate }
            });
            
            console.log(`Cleaned up ${result.deletedCount} old completed challenges`);
            return result.deletedCount;
        } catch (error) {
            console.error('Error cleaning up old completed challenges:', error);
            return 0;
        }
    }

    /**
     * Get completion statistics for reporting
     * @param {Date} startDate - Start date for statistics
     * @param {Date} endDate - End date for statistics
     * @returns {Object} - Completion statistics
     */
    static async getCompletionStats(startDate = null, endDate = null) {
        try {
            const { ArenaChallenge } = await import('../models/ArenaChallenge.js');
            
            // Default to last 30 days if no dates provided
            if (!startDate) {
                startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            }
            if (!endDate) {
                endDate = new Date();
            }
            
            const completedChallenges = await ArenaChallenge.find({
                status: 'completed',
                completedAt: { $gte: startDate, $lte: endDate }
            });
            
            let directChallenges = 0;
            let openChallenges = 0;
            let totalWagered = 0;
            let totalBets = 0;
            let ties = 0;
            
            completedChallenges.forEach(challenge => {
                if (challenge.isOpenChallenge) {
                    openChallenges++;
                    totalWagered += challenge.wagerAmount * (1 + (challenge.participants?.length || 0));
                } else {
                    directChallenges++;
                    totalWagered += challenge.wagerAmount * 2;
                }
                
                if (challenge.bets) {
                    totalBets += challenge.bets.length;
                }
                
                if (challenge.winnerUsername === 'Tie' || !challenge.winnerId) {
                    ties++;
                }
            });
            
            return {
                period: { startDate, endDate },
                totalCompleted: completedChallenges.length,
                directChallenges,
                openChallenges,
                ties,
                totalWagered,
                totalBets,
                averageWagerPerChallenge: completedChallenges.length > 0 ? totalWagered / completedChallenges.length : 0
            };
        } catch (error) {
            console.error('Error getting completion stats:', error);
            return null;
        }
    }
}

export default ArenaCompletionUtils;
