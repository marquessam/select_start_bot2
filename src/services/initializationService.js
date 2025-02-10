// File: src/services/initializationService.js
const MigrationService = require('./migrationService');

class InitializationService {
    constructor(client) {
        this.client = client;
        this.migrationService = new MigrationService();
    }

    async initialize() {
        try {
            console.log('Starting initialization sequence...');

            // Step 1: Run migrations
            console.log('Running migrations...');
            const migrationResults = await this.migrationService.runMigrations();
            console.log('Migration results:', migrationResults);

            // Step 2: Initialize achievement service
            console.log('Initializing achievement service...');
            await this.client.achievementService.initialize();

            // Step 3: Initialize achievement feed
            console.log('Initializing achievement feed...');
            await this.client.achievementFeed.initialize();

            // Step 4: Start the scheduler
            console.log('Starting scheduler...');
            await this.client.scheduler.startAll();

            // Step 5: Force a full refresh of active users
            console.log('Refreshing active users...');
            await this.client.achievementService.updateActiveUsers();

            console.log('Initialization sequence completed successfully');
            return true;
        } catch (error) {
            console.error('Initialization sequence failed:', error);
            throw error;
        }
    }

    getStatus() {
        return {
            achievementService: this.client.achievementService?.initialized || false,
            achievementFeed: this.client.achievementFeed?.initialized || false,
            scheduler: this.client.scheduler?.initialized || false,
            activeUsers: this.client.achievementService?.activeUsers?.size || 0
        };
    }
}

module.exports = InitializationService;
