// File: src/services/scheduler.js
const cron = require('node-cron');
const AchievementService = require('./achievementService');

class Scheduler {
    constructor(client) {
        if (!client || !client.isReady()) {
            throw new Error('Discord client must be ready before initializing scheduler');
        }
        
        console.log('Constructing scheduler...');
        this.client = client;
        this.achievementService = new AchievementService(client);
        this.jobs = new Map();

        // Achievement check - Runs every minute but internally handles tiered checking
        this.jobs.set('achievementCheck', cron.schedule('* * * * *', async () => {
            console.log('Running tiered achievement check...');
            try {
                await this.achievementService.checkAchievements();
            } catch (error) {
                console.error('Error in achievement check:', error);
            }
        }, {
            scheduled: false
        }));

        // Active users update - Every 15 minutes
        this.jobs.set('activeUsersUpdate', cron.schedule('*/15 * * * *', async () => {
            console.log('Scheduled active users update...');
            try {
                await this.achievementService.updateActiveUsers();
            } catch (error) {
                console.error('Error updating active users:', error);
            }
        }, {
            scheduled: false
        }));

        // Daily cleanup - Midnight
        this.jobs.set('dailyCleanup', cron.schedule('0 0 * * *', async () => {
            console.log('Starting daily cleanup...');
            try {
                // Clear various caches
                this.achievementService.clearCache();
                // Force fresh checks
                await this.achievementService.updateActiveUsers();
                // Log cleanup results
                console.log({
                    activeUsers: this.achievementService.activeUsers.size,
                    totalChecks: this.achievementService.lastUserChecks.size
                });
                console.log('Daily cleanup completed');
            } catch (error) {
                console.error('Error in daily cleanup:', error);
            }
        }, {
            scheduled: false
        }));

        // Weekly maintenance - Sunday 2 AM
        this.jobs.set('weeklyMaintenance', cron.schedule('0 2 * * 0', async () => {
            console.log('Starting weekly maintenance...');
            try {
                // Perform deep cleanup
                await this.achievementService.clearCache();
                this.achievementService.lastUserChecks.clear();
                this.achievementService.activeUsers.clear();
                this.achievementService.lastActiveUpdate = null;
                
                // Force full refresh
                await this.achievementService.updateActiveUsers();

                // Log maintenance results
                console.log({
                    activeUsers: this.achievementService.activeUsers.size,
                    cacheCleared: true,
                    checksReset: true
                });
                console.log('Weekly maintenance completed');
            } catch (error) {
                console.error('Error in weekly maintenance:', error);
            }
        }, {
            scheduled: false
        }));

        // Monthly rollover - 1st of month at 00:05
        this.jobs.set('monthlyRollover', cron.schedule('5 0 1 * *', async () => {
            console.log('Starting monthly rollover...');
            try {
                // Reset all tracking for new month
                this.achievementService.clearCache();
                this.achievementService.lastUserChecks.clear();
                this.achievementService.activeUsers.clear();
                this.achievementService.lastActiveUpdate = null;
                
                // Wait a moment for any final previous month updates
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Force fresh start for new month
                await this.achievementService.updateActiveUsers();

                // Log rollover results
                console.log({
                    month: new Date().getMonth() + 1,
                    year: new Date().getFullYear(),
                    activeUsers: this.achievementService.activeUsers.size,
                    cacheCleared: true,
                    checksReset: true
                });
                console.log('Monthly rollover completed');
            } catch (error) {
                console.error('Error in monthly rollover:', error);
            }
        }, {
            scheduled: false
        }));

        // API usage monitor - Every hour
        this.jobs.set('apiMonitor', cron.schedule('0 * * * *', async () => {
            try {
                const stats = this.getStats();
                console.log('API Usage Stats:', {
                    ...stats,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Error in API monitor:', error);
            }
        }, {
            scheduled: false
        }));

        console.log('Scheduler constructed with jobs:', 
            Array.from(this.jobs.keys()).join(', '));
    }

    async initialize() {
        try {
            console.log('Initializing scheduler...');
            
            if (!this.client.isReady()) {
                throw new Error('Discord client not ready');
            }

            console.log('Initializing achievement service...');
            // Initialize achievement service
            await this.achievementService.initialize();
            console.log('Achievement service initialized');

            // Store service on client for global access
            this.client.achievementService = this.achievementService;

            console.log('Updating active users...');
            // Initial active users update
            await this.achievementService.updateActiveUsers();
            console.log('Initial active users updated');
            
            return true;
        } catch (error) {
            console.error('Error initializing scheduler:', error);
            console.error('Stack trace:', error.stack);
            throw error;
        }
    }

    startAll() {
        try {
            for (const [jobName, job] of this.jobs) {
                job.start();
                console.log(`Started ${jobName} job`);
            }
            console.log('All scheduled jobs started');
        } catch (error) {
            console.error('Error starting scheduled jobs:', error);
            throw error;
        }
    }

    stopAll() {
        try {
            for (const [jobName, job] of this.jobs) {
                job.stop();
                console.log(`Stopped ${jobName} job`);
            }
            console.log('All scheduled jobs stopped');
        } catch (error) {
            console.error('Error stopping scheduled jobs:', error);
        }
    }

    startJob(jobName) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.start();
            console.log(`Started ${jobName} job`);
        } else {
            console.error(`Job ${jobName} not found`);
        }
    }

    stopJob(jobName) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.stop();
            console.log(`Stopped ${jobName} job`);
        } else {
            console.error(`Job ${jobName} not found`);
        }
    }

    async runJobNow(jobName) {
        console.log(`Manually running ${jobName} job`);
        try {
            switch (jobName) {
                case 'achievementCheck':
                    await this.achievementService.checkAchievements();
                    break;
                case 'activeUsersUpdate':
                    await this.achievementService.updateActiveUsers();
                    break;
                case 'dailyCleanup':
                    this.achievementService.clearCache();
                    await this.achievementService.updateActiveUsers();
                    break;
                case 'weeklyMaintenance':
                    await this.achievementService.clearCache();
                    this.achievementService.lastUserChecks.clear();
                    await this.achievementService.updateActiveUsers();
                    break;
                default:
                    console.error(`Job ${jobName} not found or cannot be run manually`);
            }
        } catch (error) {
            console.error(`Error running ${jobName} job:`, error);
        }
    }

    getStats() {
        return {
            activeUsers: this.achievementService.activeUsers.size,
            totalUsers: this.achievementService.lastUserChecks.size,
            jobs: Array.from(this.jobs.keys()),
            runningJobs: Array.from(this.jobs.entries())
                .filter(([_, job]) => job.getStatus() === 'scheduled')
                .map(([name]) => name),
            lastCheck: this.achievementService.lastCheck,
            queueLength: this.achievementService.announcementQueue.length
        };
    }

    async shutdown() {
        console.log('Shutting down scheduler...');
        this.stopAll();
        if (this.achievementService) {
            await this.achievementService.clearCache();
            this.achievementService.lastUserChecks.clear();
            this.achievementService.activeUsers.clear();
        }
    }
}

module.exports = Scheduler;
