// src/utils/gpUtils.js
import { User } from '../models/User.js';

class GPUtils {
    /**
     * Award GP to a user
     */
    async awardGP(user, amount, type, description, challengeId = null) {
        try {
            if (amount <= 0) {
                throw new Error('GP amount must be positive');
            }

            user.addGpTransaction(type, amount, description, challengeId);
            await user.save();

            console.log(`Awarded ${amount} GP to ${user.raUsername}: ${description}`);
            return user.gpBalance;
        } catch (error) {
            console.error('Error awarding GP:', error);
            throw error;
        }
    }

    /**
     * Deduct GP from a user
     */
    async deductGP(user, amount, type, description, challengeId = null) {
        try {
            if (amount <= 0) {
                throw new Error('GP amount must be positive');
            }

            if (!user.hasEnoughGp(amount)) {
                throw new Error(`Insufficient GP. User has ${user.gpBalance} but needs ${amount}`);
            }

            user.addGpTransaction(type, -amount, description, challengeId);
            await user.save();

            console.log(`Deducted ${amount} GP from ${user.raUsername}: ${description}`);
            return user.gpBalance;
        } catch (error) {
            console.error('Error deducting GP:', error);
            throw error;
        }
    }

    /**
     * Get GP leaderboard
     */
    async getGPLeaderboard(limit = 10) {
        try {
            const users = await User.find({ gpBalance: { $gt: 0 } })
                .sort({ gpBalance: -1 })
                .limit(limit)
                .select('username raUsername gpBalance arenaStats');

            return users.map((user, index) => ({
                rank: index + 1,
                username: user.username,
                raUsername: user.raUsername,
                gpBalance: user.gpBalance,
                challengesWon: user.arenaStats?.challengesWon || 0,
                totalGpWon: user.arenaStats?.totalGpWon || 0,
                winRate: user.getGpWinRate()
            }));
        } catch (error) {
            console.error('Error getting GP leaderboard:', error);
            throw error;
        }
    }

    /**
     * Get arena statistics leaderboard
     */
    async getArenaStatsLeaderboard(sortBy = 'challengesWon', limit = 10) {
        try {
            const sortField = `arenaStats.${sortBy}`;
            const users = await User.find({ [sortField]: { $gt: 0 } })
                .sort({ [sortField]: -1 })
                .limit(limit)
                .select('username raUsername gpBalance arenaStats');

            return users.map((user, index) => ({
                rank: index + 1,
                username: user.username,
                raUsername: user.raUsername,
                gpBalance: user.gpBalance,
                challengesWon: user.arenaStats?.challengesWon || 0,
                challengesParticipated: user.arenaStats?.challengesParticipated || 0,
                totalGpWon: user.arenaStats?.totalGpWon || 0,
                totalGpWagered: user.arenaStats?.totalGpWagered || 0,
                betsWon: user.arenaStats?.betsWon || 0,
                betsPlaced: user.arenaStats?.betsPlaced || 0,
                winRate: user.getGpWinRate(),
                betWinRate: user.getBetWinRate()
            }));
        } catch (error) {
            console.error('Error getting arena stats leaderboard:', error);
            throw error;
        }
    }

    /**
     * Get user's GP transaction history
     */
    async getTransactionHistory(user, limit = 20) {
        try {
            if (!user.gpTransactions) {
                return [];
            }

            return user.gpTransactions
                .slice(-limit) // Get last N transactions
                .reverse() // Show most recent first
                .map(transaction => ({
                    type: transaction.type,
                    amount: transaction.amount,
                    description: transaction.description,
                    challengeId: transaction.challengeId,
                    timestamp: transaction.timestamp,
                    formattedAmount: transaction.amount > 0 ? `+${transaction.amount}` : `${transaction.amount}`
                }));
        } catch (error) {
            console.error('Error getting transaction history:', error);
            throw error;
        }
    }

    /**
     * Admin function: Adjust user's GP balance
     */
    async adminAdjustGP(user, amount, reason, adminUsername) {
        try {
            const description = `Admin adjustment by ${adminUsername}: ${reason}`;
            
            if (amount > 0) {
                await this.awardGP(user, amount, 'admin_adjust', description);
            } else if (amount < 0) {
                // For negative adjustments, we need to handle insufficient funds gracefully
                const deductAmount = Math.abs(amount);
                if (user.gpBalance < deductAmount) {
                    // Adjust to set balance to 0 instead of failing
                    const actualDeduction = user.gpBalance;
                    user.addGpTransaction('admin_adjust', -actualDeduction, `${description} (partial: insufficient funds)`);
                    await user.save();
                } else {
                    await this.deductGP(user, deductAmount, 'admin_adjust', description);
                }
            }

            return user.gpBalance;
        } catch (error) {
            console.error('Error in admin GP adjustment:', error);
            throw error;
        }
    }

    /**
     * Get GP statistics for the entire system
     */
    async getSystemGPStats() {
        try {
            const stats = await User.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        totalGP: { $sum: '$gpBalance' },
                        usersWithGP: {
                            $sum: {
                                $cond: [{ $gt: ['$gpBalance', 0] }, 1, 0]
                            }
                        },
                        avgGP: { $avg: '$gpBalance' },
                        maxGP: { $max: '$gpBalance' },
                        totalChallengesCreated: { $sum: '$arenaStats.challengesCreated' },
                        totalChallengesWon: { $sum: '$arenaStats.challengesWon' },
                        totalGpWon: { $sum: '$arenaStats.totalGpWon' },
                        totalGpWagered: { $sum: '$arenaStats.totalGpWagered' },
                        totalBetsPlaced: { $sum: '$arenaStats.betsPlaced' },
                        totalBetsWon: { $sum: '$arenaStats.betsWon' }
                    }
                }
            ]);

            if (stats.length === 0) {
                return {
                    totalUsers: 0,
                    totalGP: 0,
                    usersWithGP: 0,
                    avgGP: 0,
                    maxGP: 0,
                    totalChallengesCreated: 0,
                    totalChallengesWon: 0,
                    totalGpWon: 0,
                    totalGpWagered: 0,
                    totalBetsPlaced: 0,
                    totalBetsWon: 0
                };
            }

            return {
                totalUsers: stats[0].totalUsers || 0,
                totalGP: stats[0].totalGP || 0,
                usersWithGP: stats[0].usersWithGP || 0,
                avgGP: Math.round(stats[0].avgGP || 0),
                maxGP: stats[0].maxGP || 0,
                totalChallengesCreated: stats[0].totalChallengesCreated || 0,
                totalChallengesWon: stats[0].totalChallengesWon || 0,
                totalGpWon: stats[0].totalGpWon || 0,
                totalGpWagered: stats[0].totalGpWagered || 0,
                totalBetsPlaced: stats[0].totalBetsPlaced || 0,
                totalBetsWon: stats[0].totalBetsWon || 0
            };
        } catch (error) {
            console.error('Error getting system GP stats:', error);
            throw error;
        }
    }

    /**
     * Format GP amount for display
     */
    formatGP(amount) {
        if (typeof amount !== 'number') {
            return '0 GP';
        }
        
        return `${amount.toLocaleString()} GP`;
    }

    /**
     * Format GP transaction for display
     */
    formatTransaction(transaction) {
        const typeEmojis = {
            'monthly_grant': '🎁',
            'wager': '⚔️',
            'bet': '🎰',
            'win': '🏆',
            'refund': '↩️',
            'admin_adjust': '🛠️'
        };

        const emoji = typeEmojis[transaction.type] || '💰';
        const amountText = transaction.amount > 0 ? `+${transaction.amount}` : `${transaction.amount}`;
        const color = transaction.amount > 0 ? 'green' : 'red';
        
        return {
            emoji,
            amount: amountText,
            description: transaction.description,
            timestamp: transaction.timestamp,
            color,
            challengeId: transaction.challengeId
        };
    }

    /**
     * Validate GP amount input
     */
    validateGPAmount(amount, min = 1, max = 10000) {
        const parsed = parseInt(amount, 10);
        
        if (isNaN(parsed)) {
            throw new Error('GP amount must be a valid number');
        }
        
        if (parsed < min) {
            throw new Error(`GP amount must be at least ${min}`);
        }
        
        if (parsed > max) {
            throw new Error(`GP amount cannot exceed ${max}`);
        }
        
        return parsed;
    }

    /**
     * Check if user can afford a transaction
     */
    canAfford(user, amount) {
        return user.hasEnoughGp(amount);
    }

    /**
     * Calculate bet payout odds (for display purposes)
     */
    calculateBetOdds(challenge, targetRaUsername) {
        if (!challenge.bets || challenge.bets.length === 0) {
            return { odds: 'Even', ratio: '1:1' };
        }

        const targetBets = challenge.getBetsForUser(targetRaUsername);
        const otherBets = challenge.bets.filter(bet => bet.targetRaUsername !== targetRaUsername);
        
        const targetTotal = targetBets.reduce((sum, bet) => sum + bet.amount, 0);
        const otherTotal = otherBets.reduce((sum, bet) => sum + bet.amount, 0);

        if (targetTotal === 0) {
            return { odds: 'No bets', ratio: 'N/A' };
        }

        if (otherTotal === 0) {
            return { odds: 'Only choice', ratio: '1:1' };
        }

        const ratio = otherTotal / targetTotal;
        const roundedRatio = Math.round(ratio * 10) / 10;
        
        return {
            odds: `${roundedRatio}:1`,
            ratio: `${Math.round(otherTotal)}:${Math.round(targetTotal)}`
        };
    }
}

export default new GPUtils();
