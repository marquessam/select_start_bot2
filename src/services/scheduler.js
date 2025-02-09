// File: src/services/scheduler.js
const cron = require('node-cron');
const achievementTracker = require('./achievementTracker');
const AchievementFeedService = require('./achievementFeedService');

class Scheduler {
    constructor(client) {
        if (!client || !client.isReady()) {
            throw new Error('Discord client must be ready before initializing scheduler');
        }
        
        this.client = client;
        this.achievementFeedService = new AchievementFeedService(client);

        // Achievement feed check every 5 minutes
        this.achievementFeedJob = cron.schedule('*/5 * * * *', async () => {
            console.log('Starting achievement feed check...');
            try {
                await this.achievementFeedService.checkRecentAchievements();
                console.log('Achievement feed check completed');
            } catch (error) {
                console.error('Error in achievement feed check:', error);
            }
        }, {
            scheduled: false // Don't start automatically
        });

        // Achievement progress check every 15 minutes
        this.achievementCheckJob = cron.schedule('*/15 * * * *', async () => {
            console.log('Starting scheduled achievement check...');
            try {
                await achievementTracker.checkAllUsers();
                console.log('Scheduled achievement check completed');
            } catch (error) {
                console.error('Error in scheduled achievement check:', error);
            }
        }, {
            scheduled: false // Don't start automatically
        });

        // Daily cleanup/summary at midnight
        this.dailySummaryJob = cron.schedule('0 0 * * *', async () => {
            console.log('Starting daily summary...');
            try {
                // Daily summary tasks
                console.log('Daily summary completed');
            } catch (error) {
                console.error('Error in daily summary:', error);
            }
        }, {
            scheduled: false // Don't start automatically
        });
    }

    async initialize() {
        try {
            // Make sure client is ready
            if (!this.client.isReady()) {
                throw new Error('Discord client not ready');
            }

            // Initialize achievement feed service
            await this.achievementFeedService.initialize();
            console.log('Achievement feed service initialized');
            
            return true;
        } catch (error) {
            console.error('Error initializing scheduler:', error);
            throw error;
        }
    }

    startAll() {
        try {
            this.achievementFeedJob.start();
            this.achievementCheckJob.start();
            this.dailySummaryJob.start();
            console.log('All scheduled jobs started');
        } catch (error) {
            console.error('Error starting scheduled jobs:', error);
            throw error;
        }
    }

    stopAll() {
        try {
            this.achievementFeedJob.stop();
            this.achievementCheckJob.stop();
            this.dailySummaryJob.stop();
            console.log('All scheduled jobs stopped');
        } catch (error) {
            console.error('Error stopping scheduled jobs:', error);
        }
    }
}

module.exports = Scheduler;
