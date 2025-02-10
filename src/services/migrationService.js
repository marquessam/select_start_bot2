// File: src/services/migrationService.js
const Award = require('../models/Award');
const { AwardType } = require('../enums/AwardType');

class MigrationService {
    constructor() {
        this.migrations = [
            {
                name: 'award_types_2025',
                description: 'Migrate award types to new enum system',
                version: 1,
                run: this.migrateAwardTypes.bind(this)
            }
        ];
    }

    async migrateAwardTypes() {
        console.log('Starting award types migration...');
        const stats = {
            processed: 0,
            updated: 0,
            errors: 0
        };

        try {
            // Get all awards
            const awards = await Award.find({});
            console.log(`Found ${awards.length} awards to process`);

            for (const award of awards) {
                try {
                    stats.processed++;
                    const originalType = award.highestAwardKind;

                    // Skip if already using new enum system
                    if (Object.values(AwardType).includes(award.highestAwardKind)) {
                        continue;
                    }

                    // Map old values to new enum
                    if (award.gameId === 'manual') {
                        award.highestAwardKind = AwardType.MANUAL;
                    } else if (award.userCompletion === '100.00%') {
                        award.highestAwardKind = AwardType.MASTERED;
                    } else if (award.achievementCount >= award.totalAchievements * 0.8) {
                        award.highestAwardKind = AwardType.BEATEN;
                    } else if (award.achievementCount > 0) {
                        award.highestAwardKind = AwardType.PARTICIPATION;
                    } else {
                        award.highestAwardKind = AwardType.NONE;
                    }

                    if (award.highestAwardKind !== originalType) {
                        await award.save();
                        stats.updated++;
                    }
                } catch (error) {
                    console.error(`Error processing award ${award._id}:`, error);
                    stats.errors++;
                }
            }

            console.log('Migration completed:', stats);
            return stats;
        } catch (error) {
            console.error('Migration failed:', error);
            throw error;
        }
    }

    async runMigrations() {
        console.log('Starting migrations...');
        const results = [];

        for (const migration of this.migrations) {
            try {
                console.log(`Running migration: ${migration.name} (v${migration.version})`);
                const result = await migration.run();
                results.push({
                    name: migration.name,
                    version: migration.version,
                    success: true,
                    stats: result
                });
            } catch (error) {
                console.error(`Migration ${migration.name} failed:`, error);
                results.push({
                    name: migration.name,
                    version: migration.version,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }
}

module.exports = MigrationService;
