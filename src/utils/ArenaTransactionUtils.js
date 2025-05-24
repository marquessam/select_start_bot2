// src/utils/ArenaTransactionUtils.js
import { User } from '../models/User.js';

/**
 * Utility class for managing GP transactions and monthly grants
 */
export class ArenaTransactionUtils {
    /**
     * Track a GP transaction for a user
     * @param {Object} user - User object
     * @param {number} amount - Amount to add/subtract
     * @param {string} reason - Reason for transaction
     * @param {string} context - Additional context
     * @returns {boolean} - Success status
     */
    static async trackGpTransaction(user, amount, reason, context = '') {
        try {
            if (!user || !user.discordId) return false;

            // Get fresh user data
            const freshUser = await User.findOne({ discordId: user.discordId });
            if (!freshUser) return false;

            // Record old balance and update
            const oldBalance = freshUser.gp || 0;
            freshUser.gp = oldBalance + amount;
            
            // Add transaction record
            if (!freshUser.gpTransactions) {
                freshUser.gpTransactions = [];
            }
            
            freshUser.gpTransactions.push({
                amount,
                oldBalance,
                newBalance: freshUser.gp,
                reason,
                context,
                timestamp: new Date()
            });
            
            // Keep only recent transactions
            if (freshUser.gpTransactions.length > 10) {
                freshUser.gpTransactions = freshUser.gpTransactions.slice(-10);
            }
            
            // Save changes
            await freshUser.save();
            
            // Update original object
            user.gp = freshUser.gp;
            
            return true;
        } catch (error) {
            console.error(`Error tracking GP transaction:`, error);
            return false;
        }
    }

    /**
     * Check and grant monthly GP to a user
     * @param {Object} user - User object
     * @returns {boolean} - True if GP was granted
     */
    static async checkAndGrantMonthlyGP(user) {
        try {
            // Prevent concurrent processing
            if (user._monthlyGpProcessing) {
                return false;
            }
            
            user._monthlyGpProcessing = true;
            
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            // Get fresh user data
            const freshUser = await User.findOne({ discordId: user.discordId });
            const lastClaim = freshUser.lastMonthlyGpClaim ? new Date(freshUser.lastMonthlyGpClaim) : null;
            
            // Check if eligible for monthly GP
            if (!lastClaim || 
                lastClaim.getMonth() !== currentMonth || 
                lastClaim.getFullYear() !== currentYear) {
                
                // Award the GP
                freshUser.gp = (freshUser.gp || 0) + 1000;
                freshUser.lastMonthlyGpClaim = now;
                await freshUser.save();
                
                // Update the original user object
                user.gp = freshUser.gp;
                user.lastMonthlyGpClaim = freshUser.lastMonthlyGpClaim;
                
                // Clear the flag
                delete user._monthlyGpProcessing;
                return true;
            }
            
            // Clear the flag
            delete user._monthlyGpProcessing;
            return false;
        } catch (error) {
            console.error(`Error checking monthly GP:`, error);
            delete user._monthlyGpProcessing;
            return false;
        }
    }

    /**
     * Get user's GP balance safely
     * @param {string} discordId - User's Discord ID
     * @returns {number} - Current GP balance
     */
    static async getUserGP(discordId) {
        try {
            const user = await User.findOne({ discordId });
            return user ? (user.gp || 0) : 0;
        } catch (error) {
            console.error('Error getting user GP:', error);
            return 0;
        }
    }

    /**
     * Deduct GP from user (for wagers, bets)
     * @param {string} discordId - User's Discord ID
     * @param {number} amount - Amount to deduct
     * @param {string} reason - Reason for deduction
     * @param {string} context - Additional context
     * @returns {boolean} - Success status
     */
    static async deductGP(discordId, amount, reason, context = '') {
        try {
            const user = await User.findOne({ discordId });
            if (!user) return false;
            
            // Check if user has enough GP
            if ((user.gp || 0) < amount) return false;
            
            return await this.trackGpTransaction(user, -amount, reason, context);
        } catch (error) {
            console.error('Error deducting GP:', error);
            return false;
        }
    }

    /**
     * Add GP to user
     * @param {string} discordId - User's Discord ID
     * @param {number} amount - Amount to add
     * @param {string} reason - Reason for addition
     * @param {string} context - Additional context
     * @returns {boolean} - Success status
     */
    static async addGP(discordId, amount, reason, context = '') {
        try {
            const user = await User.findOne({ discordId });
            if (!user) return false;
            
            return await this.trackGpTransaction(user, amount, reason, context);
        } catch (error) {
            console.error('Error adding GP:', error);
            return false;
        }
    }
}

export default ArenaTransactionUtils;
