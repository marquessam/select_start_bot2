// File: src/services/scheduler.js
const cron = require('node-cron');
const achievementTracker = require('./achievementTracker');
const AchievementFeedService = require('./achievementFeedService');

class Scheduler {
    constructor(client) {
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
        });
    }

    async initialize() {
        await this.achievementFeedService.initialize();
    }

    startAll() {
        this.achievementFeedJob.start();
        this.achievementCheckJob.start();
        this.dailySummaryJob.start();
        console.log('All scheduled jobs started');
    }

    stopAll() {
        this.achievementFeedJob.stop();
        this.achievementCheckJob.stop();
        this.dailySummaryJob.stop();
        console.log('All scheduled jobs stopped');
    }
}

module.exports = Scheduler;
