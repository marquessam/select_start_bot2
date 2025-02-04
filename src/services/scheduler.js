// File: src/services/scheduler.js
const cron = require('node-cron');
const achievementTracker = require('./achievementTracker');

class Scheduler {
    constructor() {
        // Schedule achievement checks every 15 minutes
        this.achievementCheckJob = cron.schedule('*/15 * * * *', async () => {
            console.log('Starting scheduled achievement check...');
            try {
                await achievementTracker.checkAllUsers();
                console.log('Scheduled achievement check completed');
            } catch (error) {
                console.error('Error in scheduled achievement check:', error);
            }
        });

        // Schedule a daily cleanup/summary at midnight
        this.dailySummaryJob = cron.schedule('0 0 * * *', async () => {
            console.log('Starting daily summary...');
            try {
                // Here we can add daily summary tasks, like:
                // - Generating reports
                // - Cleaning up old data
                // - Sending daily summaries to Discord
                console.log('Daily summary completed');
            } catch (error) {
                console.error('Error in daily summary:', error);
            }
        });
    }

    startAll() {
        this.achievementCheckJob.start();
        this.dailySummaryJob.start();
        console.log('All scheduled jobs started');
    }

    stopAll() {
        this.achievementCheckJob.stop();
        this.dailySummaryJob.stop();
        console.log('All scheduled jobs stopped');
    }
}

module.exports = new Scheduler();
