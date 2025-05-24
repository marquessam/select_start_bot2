// src/utils/ArenaBettingUtils.js
import { User } from '../models/User.js';
import ArenaTransactionUtils from './ArenaTransactionUtils.js';

/**
 * Utility class for managing arena betting system
 */
export class ArenaBettingUtils {
    /**
     * Calculate betting odds based on current bets
     * @param {Array} bets - Array of bet objects
     * @param {string} targetPlayerName - Name of player to calculate odds for
     * @returns {Object} - Odds information
     */
    static calculateBettingOdds(bets, targetPlayerName) {
        if (!bets || bets.length === 0) {
            return { 
                odds: '1:1', 
                description: 'No bets placed yet. House guarantee: 50% profit if you win.' 
            };
        }
        
        // Group bets by player
        const betsByPlayer = {};
        let totalBetAmount = 0;
        
        bets.forEach(bet => {
            betsByPlayer[bet.targetPlayer] = (betsByPlayer[bet.targetPlayer] || 0) + bet.betAmount;
            totalBetAmount += bet.betAmount;
        });
        
        // If only one player has bets
        const playerNames = Object.keys(betsByPlayer);
        if (playerNames.length === 1) {
            return {
                odds: '1:1',
                description: `All ${totalBetAmount} GP has been bet on ${playerNames[0]}. House guarantee: 50% profit if you win.`
            };
        }
        
        // Calculate odds for target player
        const targetAmount = betsByPlayer[targetPlayerName] || 0;
        const opposingAmount = totalBetAmount - targetAmount;
        
        if (targetAmount === 0) {
            // Calculate simple odds
            const ratio = (opposingAmount / 100).toFixed(2);
            return {
                odds: `${ratio}:1`,
                description: `Bet 100 GP to win approximately ${Math.floor(opposingAmount)} GP if ${targetPlayerName} wins.`
            };
        } else {
            // Calculate payout ratio
            const ratio = (opposingAmount / targetAmount).toFixed(2);
            return {
                odds: `${ratio}:1`,
                description: `Current pot distribution: ${targetAmount} GP on ${targetPlayerName}, ${opposingAmount} GP against.`
            };
        }
    }

    /**
     * Process betting payouts for a completed challenge
     * @param {Object} challenge - Challenge object
     * @param {string} winnerId - Winner's Discord ID
     * @param {string} winnerUsername - Winner's username
     */
    static async processBetsForChallenge(challenge, winnerId, winnerUsername) {
        try {
            // Skip if no bets
            if (!challenge.bets || challenge.bets.length === 0) return;
            
            // If no winner, return all bets
            if (!winnerId) {
                await this.refundAllBets(challenge);
                return;
            }
            
            // Separate winning and losing bets
            const winningBets = challenge.bets.filter(bet => bet.targetPlayer === winnerUsername);
            const losingBets = challenge.bets.filter(bet => bet.targetPlayer !== winnerUsername);
            
            // Calculate total bet amounts
            const totalWinningBetsAmount = winningBets.reduce((total, bet) => total + bet.betAmount, 0);
            const totalLosingBetsAmount = losingBets.reduce((total, bet) => total + bet.betAmount, 0);
            
            // Track total house contribution
            let totalHouseContribution = 0;
            
            // Process winning bets
            for (const bet of winningBets) {
                try {
                    const bettor = await User.findOne({ discordId: bet.userId });
                    if (!bettor) continue;
                    
                    let payoutAmount = bet.betAmount; // Start with getting the original bet back
                    let houseContribution = 0;
                    
                    // If no losing bets, apply 50% house guarantee
                    if (totalLosingBetsAmount === 0) {
                        houseContribution = Math.floor(bet.betAmount * 0.5);
                        payoutAmount += houseContribution;
                    } 
                    // Otherwise, distribute losing bets proportionally
                    else {
                        const proportion = bet.betAmount / totalWinningBetsAmount;
                        const shareOfLosingBets = Math.floor(totalLosingBetsAmount * proportion);
                        payoutAmount += shareOfLosingBets;
                    }
                    
                    // Track total house contribution
                    totalHouseContribution += houseContribution;
                    
                    // Add payout to user
                    await ArenaTransactionUtils.trackGpTransaction(
                        bettor,
                        payoutAmount,
                        'Won bet',
                        `Challenge ID: ${challenge._id}, Bet on: ${winnerUsername}, Profit: ${payoutAmount - bet.betAmount} GP`
                    );
                    
                    // Update stats
                    bettor.arenaStats = bettor.arenaStats || {};
                    bettor.arenaStats.betsWon = (bettor.arenaStats.betsWon || 0) + 1;
                    bettor.arenaStats.gpWon = (bettor.arenaStats.gpWon || 0) + (payoutAmount - bet.betAmount);
                    
                    // Mark bet as paid
                    bet.paid = true;
                    bet.payout = payoutAmount;
                    bet.houseContribution = houseContribution;
                    
                    await bettor.save();
                } catch (error) {
                    console.error(`Error processing bet for user ${bet.userId}:`, error);
                }
            }
            
            // Store the house contribution
            challenge.houseContribution = totalHouseContribution;
            
            // Save the challenge with updated bet info
            await challenge.save();
            
            console.log(`Processed ${winningBets.length} winning bets and ${losingBets.length} losing bets for challenge ${challenge._id}`);
        } catch (error) {
            console.error('Error processing bets for challenge:', error);
        }
    }

    /**
     * Refund all bets for a challenge (used when challenge ends in tie or is cancelled)
     * @param {Object} challenge - Challenge object
     */
    static async refundAllBets(challenge) {
        try {
            if (!challenge.bets || challenge.bets.length === 0) return;
            
            for (const bet of challenge.bets) {
                try {
                    const bettor = await User.findOne({ discordId: bet.userId });
                    if (bettor) {
                        await ArenaTransactionUtils.trackGpTransaction(
                            bettor,
                            bet.betAmount,
                            'Challenge ended with no winner - bet refund',
                            `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
                        );
                        
                        // Mark bet as refunded
                        bet.paid = true;
                        bet.payout = bet.betAmount;
                        bet.refunded = true;
                    }
                } catch (error) {
                    console.error(`Error refunding bet for user ${bet.userId}:`, error);
                }
            }
            
            await challenge.save();
            console.log(`Refunded ${challenge.bets.length} bets for challenge ${challenge._id}`);
        } catch (error) {
            console.error('Error refunding bets:', error);
        }
    }

    /**
     * Validate a bet before placing it
     * @param {Object} user - User object
     * @param {number} betAmount - Amount to bet
     * @param {Object} challenge - Challenge object
     * @param {string} targetPlayer - Player being bet on
     * @returns {Object} - Validation result
     */
    static validateBet(user, betAmount, challenge, targetPlayer) {
        // Check if user has enough GP
        if ((user.gp || 0) < betAmount) {
            return {
                valid: false,
                reason: `You don't have enough GP. You have ${user.gp || 0} GP but need ${betAmount} GP.`
            };
        }
        
        // Check bet limits
        const maxBet = 100;
        if (betAmount > maxBet) {
            return {
                valid: false,
                reason: `Maximum bet is ${maxBet} GP.`
            };
        }
        
        if (betAmount < 1) {
            return {
                valid: false,
                reason: 'Minimum bet is 1 GP.'
            };
        }
        
        // Check if betting is still open (72 hours after start)
        const now = new Date();
        const startTime = challenge.startDate || challenge.createdAt;
        const bettingEndsAt = new Date(startTime.getTime() + (72 * 60 * 60 * 1000));
        
        if (now > bettingEndsAt) {
            return {
                valid: false,
                reason: 'Betting has closed for this challenge.'
            };
        }
        
        // Check if challenge is still active
        if (challenge.status !== 'active') {
            return {
                valid: false,
                reason: 'This challenge is no longer active.'
            };
        }
        
        // Check if user is a participant (can't bet on challenges they're in)
        if (challenge.challengerId === user.discordId || 
            challenge.challengeeId === user.discordId ||
            (challenge.participants && challenge.participants.some(p => p.userId === user.discordId))) {
            return {
                valid: false,
                reason: 'You cannot bet on a challenge you are participating in.'
            };
        }
        
        // Check if user already has a bet on this challenge
        if (challenge.bets && challenge.bets.some(bet => bet.userId === user.discordId)) {
            return {
                valid: false,
                reason: 'You have already placed a bet on this challenge.'
            };
        }
        
        // Validate target player
        const validTargets = [challenge.challengerUsername];
        if (challenge.challengeeUsername) {
            validTargets.push(challenge.challengeeUsername);
        }
        if (challenge.participants) {
            validTargets.push(...challenge.participants.map(p => p.username));
        }
        
        if (!validTargets.includes(targetPlayer)) {
            return {
                valid: false,
                reason: 'Invalid target player.'
            };
        }
        
        return { valid: true };
    }

    /**
     * Place a bet on a challenge
     * @param {Object} user - User object
     * @param {Object} challenge - Challenge object
     * @param {number} betAmount - Amount to bet
     * @param {string} targetPlayer - Player being bet on
     * @returns {Object} - Result of bet placement
     */
    static async placeBet(user, challenge, betAmount, targetPlayer) {
        try {
            // Validate the bet
            const validation = this.validateBet(user, betAmount, challenge, targetPlayer);
            if (!validation.valid) {
                return { success: false, message: validation.reason };
            }
            
            // Deduct GP from user
            const success = await ArenaTransactionUtils.deductGP(
                user.discordId,
                betAmount,
                'Placed bet',
                `Challenge ID: ${challenge._id}, Bet on: ${targetPlayer}`
            );
            
            if (!success) {
                return { success: false, message: 'Failed to deduct GP. Please try again.' };
            }
            
            // Add bet to challenge
            if (!challenge.bets) {
                challenge.bets = [];
            }
            
            challenge.bets.push({
                userId: user.discordId,
                raUsername: user.raUsername,
                betAmount: betAmount,
                targetPlayer: targetPlayer,
                placedAt: new Date(),
                paid: false
            });
            
            await challenge.save();
            
            // Update user's GP in memory
            user.gp = (user.gp || 0) - betAmount;
            
            return { 
                success: true, 
                message: `Successfully placed bet of ${betAmount} GP on ${targetPlayer}!` 
            };
        } catch (error) {
            console.error('Error placing bet:', error);
            return { success: false, message: 'An error occurred while placing your bet.' };
        }
    }

    /**
     * Get betting summary for a challenge
     * @param {Object} challenge - Challenge object
     * @returns {Object} - Betting summary
     */
    static getBettingSummary(challenge) {
        if (!challenge.bets || challenge.bets.length === 0) {
            return {
                totalBets: 0,
                totalAmount: 0,
                betsByPlayer: {},
                bettingOpen: true
            };
        }
        
        const betsByPlayer = {};
        let totalAmount = 0;
        
        challenge.bets.forEach(bet => {
            betsByPlayer[bet.targetPlayer] = (betsByPlayer[bet.targetPlayer] || 0) + bet.betAmount;
            totalAmount += bet.betAmount;
        });
        
        // Check if betting is still open
        const now = new Date();
        const startTime = challenge.startDate || challenge.createdAt;
        const bettingEndsAt = new Date(startTime.getTime() + (72 * 60 * 60 * 1000));
        const bettingOpen = now <= bettingEndsAt;
        
        return {
            totalBets: challenge.bets.length,
            totalAmount,
            betsByPlayer,
            bettingOpen,
            bettingEndsAt
        };
    }
}

export default ArenaBettingUtils;
