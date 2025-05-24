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
            // Get final scores
            const [challengerScore, challengeeScore] = await this.getChallengersScores(challenge);
            
            // Determine the winner using ApiRank only (lower rank is better)
            let winnerId, winnerUsername;
            
            if (challengerScore.rank && challengeeScore.rank) {
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
            } else {
                // If no ranks available, it's a tie
                winnerId = null;
                winnerUsername = 'Tie';
            }
            
            // Update challenge data
            challenge.status = 'completed';
            challenge.challengerScore = challengerScore.formattedScore;
            challenge.challengeeScore = challengeeScore.formattedScore;
            challenge.winnerId = winnerId;
            challenge.winnerUsername = winnerUsername;
            
            // Save the updated challenge
            await challenge.save();
            
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
            // Get scores for all participants
            const participantScores = new Map();
            
            // Get challenger (creator) score
            const [challengerScore, _] = await this.getChallengersScores(challenge);
            
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
                } catch (error) {
                    console.error(`Error getting score for participant ${participant.username}:`, error);
                    participantScores.set(participant.username.toLowerCase(), {
                        exists: false,
                        formattedScore: 'No score yet',
                        value: 0,
                        rank: 0
                    });
                }
            }
            
            // Determine winner - use ApiRank (lower is better)
            let winnerId = null;
            let winnerUsername = 'No Winner';
            let bestRank = Number.MAX_SAFE_INTEGER;
            
            // Check challenger first
            if (challengerScore.rank && challengerScore.rank > 0) {
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
            
            // Calculate total pot (creator + all participants)
            const totalWagered = challenge.wagerAmount * (1 + challenge.participants.length);
            
            // Award pot to winner
            if (winnerId) {
                const winner = await User.findOne({ discordId: winnerId });
                if (winner) {
                    await ArenaTransactionUtils.trackGpTransaction(
                        winner,
                        totalWagered,
                        'Won open challenge',
                        `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
                    );
                    
                    // Update stats
                    winner.arenaStats = winner.arenaStats || {};
                    winner.arenaStats.wins = (winner.arenaStats.wins || 0) + 1;
                    winner.arenaStats.gpWon = (winner.arenaStats.gpWon || 0) + totalWagered - challenge.wagerAmount;
                    await winner.save();
                }
            }
            
            // Update challenge data
            challenge.status = 'completed';
            challenge.winnerId = winnerId;
            challenge.winnerUsername = winnerUsername;
            
            // Save the updated challenge
            await challenge.save();
            
            // Process bet payouts
            await ArenaBettingUtils.processBetsForChallenge(challenge, winnerId, winnerUsername);
            
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
            // Skip payouts if it's a tie
            if (!winnerId) {
                return;
            }
            
            // Get the users
            const challenger = await User.findOne({ discordId: challenge.challengerId });
            const challengee = await User.findOne({ discordId: challenge.challengeeId });
            
            if (!challenger || !challengee) {
                return;
            }
            
            // Transfer wager amount from loser to winner
            if (winnerId === challenge.challengerId) {
                // Challenger won
                await ArenaTransactionUtils.trackGpTransaction(
                    challenger,
                    challenge.wagerAmount * 2,
                    'Won challenge',
                    `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
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
            } else {
                // Challengee won
                await ArenaTransactionUtils.trackGpTransaction(
                    challengee,
                    challenge.wagerAmount * 2,
                    'Won challenge',
                    `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
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
            }
            
            // Process bets
            if (challenge.bets && challenge.bets.length > 0) {
                await ArenaBettingUtils.processBetsForChallenge(challenge, winnerId, winnerUsername);
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
        const { ArenaChallenge } = await import('../models/ArenaChallenge.js');
        
        return await ArenaChallenge.findOne({
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
    }
}

export default ArenaCompletionUtils;
