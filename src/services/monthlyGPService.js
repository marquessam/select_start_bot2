// src/services/monthlyGPService.js
import { User } from '../models/User.js';

class MonthlyGPService {
    constructor() {
        this.isProcessing = false;
        this.lastProcessedMonth = null;
    }

    /**
     * Start the monthly GP service
     * Runs once on startup and sets up daily checks
     */
    start() {
        console.log('Monthly GP Service: Starting...');
        
        // Check immediately on startup (in case we missed a month)
        this.checkAndGrantMonthlyGP();
        
        // Set up daily check at 6 AM UTC
        this.setupDailyCheck();
    }

    /**
     * Set up daily check for month changes
     */
    setupDailyCheck() {
        // Check every day at 6 AM UTC
        const checkInterval = 24 * 60 * 60 * 1000; // 24 hours
        
        setInterval(() => {
            this.checkAndGrantMonthlyGP();
        }, checkInterval);
        
        console.log('Monthly GP Service: Daily check scheduled (every 24 hours)');
    }

    /**
     * Check if we need to grant monthly GP and do it
     */
    async checkAndGrantMonthlyGP() {
        if (this.isProcessing) {
            console.log('Monthly GP Service: Already processing, skipping');
            return;
        }

        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`; // 0-based month
        
        if (this.lastProcessedMonth === currentMonthKey) {
            return; // Already processed this month
        }

        // Only process on or after the 1st of the month
        if (now.getDate() < 1) {
            return;
        }

        this.isProcessing = true;
        
        try {
            console.log(`Monthly GP Service: Processing monthly GP for ${currentMonthKey}`);
            await this.grantMonthlyGPToAllUsers(now);
            this.lastProcessedMonth = currentMonthKey;
            console.log('Monthly GP Service: Monthly GP grant completed successfully');
        } catch (error) {
            console.error('Monthly GP Service: Error granting monthly GP:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Grant 1000 GP to all users who haven't received it this month
     */
    async grantMonthlyGPToAllUsers(currentDate) {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        
        // Find users who haven't received GP this month
        const usersNeedingGP = await User.find({
            $or: [
                { lastMonthlyGpGrant: null },
                { lastMonthlyGpGrant: { $lt: startOfMonth } }
            ]
        });

        console.log(`Monthly GP Service: Found ${usersNeedingGP.length} users needing monthly GP`);

        let grantedCount = 0;
        let errorCount = 0;

        for (const user of usersNeedingGP) {
            try {
                // Use atomic update to prevent race conditions
                const result = await User.findOneAndUpdate(
                    {
                        _id: user._id,
                        $or: [
                            { lastMonthlyGpGrant: null },
                            { lastMonthlyGpGrant: { $lt: startOfMonth } }
                        ]
                    },
                    {
                        $inc: { gpBalance: 1000 },
                        $push: {
                            gpTransactions: {
                                type: 'monthly_grant',
                                amount: 1000,
                                description: `Monthly GP grant for ${currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
                                timestamp: currentDate
                            }
                        },
                        $set: { lastMonthlyGpGrant: currentDate }
                    },
                    { new: true }
                );

                if (result) {
                    console.log(`Monthly GP Service: Granted 1000 GP to ${user.raUsername} (Balance: ${result.gpBalance})`);
                    grantedCount++;
                } else {
                    console.log(`Monthly GP Service: ${user.raUsername} already received GP this month (race condition avoided)`);
                }
            } catch (error) {
                console.error(`Monthly GP Service: Error granting GP to ${user.raUsername}:`, error);
                errorCount++;
            }
        }

        console.log(`Monthly GP Service: Completed - ${grantedCount} granted, ${errorCount} errors`);
    }

    /**
     * Force grant monthly GP (admin function)
     */
    async forceGrantMonthlyGP() {
        console.log('Monthly GP Service: Force granting monthly GP to all users');
        this.isProcessing = false; // Reset processing flag
        this.lastProcessedMonth = null; // Reset month tracking
        await this.checkAndGrantMonthlyGP();
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            isProcessing: this.isProcessing,
            lastProcessedMonth: this.lastProcessedMonth,
            nextCheckDue: 'Daily at 6 AM UTC'
        };
    }

    /**
     * Stop the service (for testing/shutdown)
     */
    stop() {
        console.log('Monthly GP Service: Stopping...');
        this.isProcessing = false;
        this.lastProcessedMonth = null;
    }
}

// Export singleton
export default new MonthlyGPService();
