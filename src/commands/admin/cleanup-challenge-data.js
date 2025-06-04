// src/commands/admin/cleanup-challenge-data.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { User } from '../../models/User.js';

export default {
    data: new SlashCommandBuilder()
        .setName('cleanup-challenge-data')
        .setDescription('Clean up duplicate challenge entries caused by date format changes')
        .addStringOption(option =>
            option.setName('username')
            .setDescription('Specific username to clean up (leave empty for all users)')
            .setRequired(false))
        .addBooleanOption(option =>
            option.setName('dry-run')
            .setDescription('Show what would be cleaned without making changes (default: true)')
            .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Double-check admin permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '❌ You need administrator permissions to use this command.', 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetUsername = interaction.options.getString('username');
        const dryRun = interaction.options.getBoolean('dry-run') ?? true; // Default to dry run for safety
        
        try {
            console.log(`\n=== STARTING CHALLENGE DATA CLEANUP ===`);
            console.log(`Target user: ${targetUsername || 'ALL USERS'}`);
            console.log(`Dry run: ${dryRun}`);
            console.log(`Initiated by: ${interaction.user.tag}`);

            let users;
            if (targetUsername) {
                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp('^' + targetUsername + '$', 'i') }
                });
                if (!user) {
                    return interaction.editReply('❌ User not found.');
                }
                users = [user];
                console.log(`Found target user: ${user.raUsername}`);
            } else {
                users = await User.find({});
                console.log(`Found ${users.length} total users to process`);
            }

            let totalUsersProcessed = 0;
            let totalDuplicatesFound = 0;
            let totalDuplicatesRemoved = 0;
            const cleanupReport = [];
            const processedUsers = [];

            // Process users in batches to avoid memory issues
            const batchSize = 50;
            for (let i = 0; i < users.length; i += batchSize) {
                const batch = users.slice(i, i + batchSize);
                console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(users.length/batchSize)} (${batch.length} users)`);

                for (const user of batch) {
                    try {
                        const userCleanup = await this.cleanupUserChallengeData(user, dryRun);
                        if (userCleanup.duplicatesFound > 0) {
                            totalUsersProcessed++;
                            totalDuplicatesFound += userCleanup.duplicatesFound;
                            totalDuplicatesRemoved += userCleanup.duplicatesRemoved;
                            cleanupReport.push(userCleanup);
                            processedUsers.push(user.raUsername);
                            
                            console.log(`✅ ${user.raUsername}: ${userCleanup.duplicatesFound} duplicates ${dryRun ? 'found' : 'cleaned'}`);
                        }
                    } catch (userError) {
                        console.error(`❌ Error processing user ${user.raUsername}:`, userError);
                        cleanupReport.push({
                            username: user.raUsername,
                            error: userError.message,
                            duplicatesFound: 0,
                            duplicatesRemoved: 0
                        });
                    }
                }

                // Small delay between batches to prevent overwhelming the database
                if (i + batchSize < users.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            console.log(`\n=== CLEANUP SUMMARY ===`);
            console.log(`Users processed: ${totalUsersProcessed}`);
            console.log(`Total duplicates found: ${totalDuplicatesFound}`);
            console.log(`Total duplicates ${dryRun ? 'would be removed' : 'removed'}: ${totalDuplicatesRemoved}`);
            console.log(`=== END CLEANUP ===\n`);

            // Create summary report
            let report = `## Challenge Data Cleanup Report ${dryRun ? '(DRY RUN)' : ''}\n\n`;
            report += `**Summary:**\n`;
            report += `- Users scanned: ${users.length}\n`;
            report += `- Users with duplicates: ${totalUsersProcessed}\n`;
            report += `- Total duplicates found: ${totalDuplicatesFound}\n`;
            report += `- Total duplicates ${dryRun ? 'would be removed' : 'removed'}: ${totalDuplicatesRemoved}\n\n`;

            if (cleanupReport.length > 0) {
                report += `**Detailed Results:**\n`;
                
                // Show users with errors first
                const errorReports = cleanupReport.filter(r => r.error);
                if (errorReports.length > 0) {
                    report += `\n**Errors (${errorReports.length}):**\n`;
                    errorReports.slice(0, 5).forEach(userReport => {
                        report += `- ${userReport.username}: ${userReport.error}\n`;
                    });
                    if (errorReports.length > 5) {
                        report += `- ...and ${errorReports.length - 5} more errors\n`;
                    }
                }

                // Show successful cleanups
                const successReports = cleanupReport.filter(r => !r.error && r.duplicatesFound > 0);
                if (successReports.length > 0) {
                    report += `\n**Successfully ${dryRun ? 'analyzed' : 'cleaned'} (${successReports.length}):**\n`;
                    successReports.slice(0, 10).forEach(userReport => {
                        report += `\n**${userReport.username}:**\n`;
                        report += `- Monthly duplicates: ${userReport.monthlyDuplicates || 0}\n`;
                        report += `- Shadow duplicates: ${userReport.shadowDuplicates || 0}\n`;
                        if (userReport.examples && userReport.examples.length > 0) {
                            report += `- Examples: ${userReport.examples.slice(0, 2).join(', ')}\n`;
                        }
                    });

                    if (successReports.length > 10) {
                        report += `\n*...and ${successReports.length - 10} more users with duplicates*\n`;
                    }
                }
            }

            if (dryRun) {
                report += `\n⚠️ **This was a dry run. No changes were made.**\n`;
                report += `Run again with \`dry-run: false\` to actually clean up the data.`;
            } else {
                report += `\n✅ **Cleanup completed successfully.**\n`;
                if (processedUsers.length > 0) {
                    report += `\n**Affected users should run \`/profile\` to see corrected stats.**`;
                }
            }

            // Split long reports if needed
            if (report.length > 2000) {
                const parts = this.splitReport(report, 2000);
                await interaction.editReply(parts[0]);
                for (let i = 1; i < parts.length; i++) {
                    await interaction.followUp({ content: parts[i], ephemeral: true });
                }
            } else {
                await interaction.editReply(report);
            }

        } catch (error) {
            console.error('Error during challenge data cleanup:', error);
            await interaction.editReply('❌ An error occurred during cleanup. Check the console for details.');
        }
    },

    async cleanupUserChallengeData(user, dryRun = true) {
        const result = {
            username: user.raUsername,
            duplicatesFound: 0,
            duplicatesRemoved: 0,
            monthlyDuplicates: 0,
            shadowDuplicates: 0,
            examples: []
        };

        let hasChanges = false;

        // Clean monthly challenges
        if (user.monthlyChallenges && user.monthlyChallenges.size > 0) {
            const monthlyCleanup = this.cleanupChallengeMap(user.monthlyChallenges, 'monthly');
            result.monthlyDuplicates = monthlyCleanup.duplicatesFound;
            result.duplicatesFound += monthlyCleanup.duplicatesFound;
            result.examples.push(...monthlyCleanup.examples);
            
            if (monthlyCleanup.duplicatesFound > 0) {
                hasChanges = true;
                if (!dryRun) {
                    user.monthlyChallenges = monthlyCleanup.cleanedMap;
                }
            }
        }

        // Clean shadow challenges
        if (user.shadowChallenges && user.shadowChallenges.size > 0) {
            const shadowCleanup = this.cleanupChallengeMap(user.shadowChallenges, 'shadow');
            result.shadowDuplicates = shadowCleanup.duplicatesFound;
            result.duplicatesFound += shadowCleanup.duplicatesFound;
            result.examples.push(...shadowCleanup.examples);
            
            if (shadowCleanup.duplicatesFound > 0) {
                hasChanges = true;
                if (!dryRun) {
                    user.shadowChallenges = shadowCleanup.cleanedMap;
                }
            }
        }

        // Save changes if not dry run and we have changes
        if (!dryRun && hasChanges) {
            try {
                await user.save();
                result.duplicatesRemoved = result.duplicatesFound;
                console.log(`💾 Saved changes for ${user.raUsername}`);
            } catch (saveError) {
                console.error(`❌ Failed to save changes for ${user.raUsername}:`, saveError);
                throw new Error(`Failed to save changes: ${saveError.message}`);
            }
        }

        return result;
    },

    cleanupChallengeMap(challengeMap, challengeType) {
        if (!challengeMap || challengeMap.size === 0) {
            return { duplicatesFound: 0, cleanedMap: challengeMap, examples: [] };
        }

        const entries = Array.from(challengeMap.entries());
        const normalized = new Map();
        const examples = [];
        let duplicatesFound = 0;

        console.log(`\n--- Cleaning ${challengeType} challenges ---`);
        console.log(`Original entries: ${entries.length}`);

        for (const [originalKey, data] of entries) {
            const normalizedKey = this.normalizeMonthKey(originalKey);
            
            if (normalized.has(normalizedKey)) {
                // Found a duplicate!
                duplicatesFound++;
                const existing = normalized.get(normalizedKey);
                
                examples.push(`${originalKey} -> ${normalizedKey}`);
                console.log(`    Duplicate: ${originalKey} -> ${normalizedKey}`);
                console.log(`      Existing progress: ${existing.progress || 0}`);
                console.log(`      New progress: ${data.progress || 0}`);
                
                // Merge the data, keeping the best values
                const mergedData = this.mergeChallengeDatas(existing, data);
                normalized.set(normalizedKey, mergedData);
                console.log(`      Merged progress: ${mergedData.progress || 0}`);
                
            } else {
                normalized.set(normalizedKey, data);
            }
        }

        console.log(`Final entries: ${normalized.size}`);
        console.log(`Duplicates found: ${duplicatesFound}`);

        return {
            duplicatesFound,
            cleanedMap: normalized,
            examples: examples.slice(0, 3) // Limit examples to prevent overwhelming reports
        };
    },

    mergeChallengeDatas(existing, newData) {
        // Merge two challenge data objects, keeping the best values
        const merged = { ...existing };

        // Take the higher progress value
        if ((newData.progress || 0) > (existing.progress || 0)) {
            merged.progress = newData.progress;
        }

        // Take the higher achievement count
        if ((newData.achievements || 0) > (existing.achievements || 0)) {
            merged.achievements = newData.achievements;
        }

        // Take the higher completion percentage
        if ((newData.completionPercent || 0) > (existing.completionPercent || 0)) {
            merged.completionPercent = newData.completionPercent;
        }

        // Take the more descriptive game title if available
        if (newData.gameTitle && (!existing.gameTitle || newData.gameTitle.length > existing.gameTitle.length)) {
            merged.gameTitle = newData.gameTitle;
        }

        // Take the more recent date if available
        if (newData.lastUpdated && (!existing.lastUpdated || 
            new Date(newData.lastUpdated) > new Date(existing.lastUpdated))) {
            merged.lastUpdated = newData.lastUpdated;
        }

        // Take the more recent completed date if available
        if (newData.completedAt && (!existing.completedAt || 
            new Date(newData.completedAt) > new Date(existing.completedAt))) {
            merged.completedAt = newData.completedAt;
        }

        // Keep any other fields that exist in either but prefer newer data
        Object.keys(newData).forEach(key => {
            if (!(key in merged) && newData[key] !== undefined && newData[key] !== null) {
                merged[key] = newData[key];
            }
        });

        return merged;
    },

    normalizeMonthKey(dateKey) {
        if (!dateKey) return dateKey;
        
        const keyStr = String(dateKey).trim();
        
        // Already in correct format (YYYY-MM)
        if (/^\d{4}-\d{2}$/.test(keyStr)) return keyStr;
        
        // ISO date format (YYYY-MM-DD)
        if (/^\d{4}-\d{2}-\d{2}$/.test(keyStr)) {
            return keyStr.substring(0, 7);
        }
        
        // Handle other date formats
        try {
            const date = new Date(keyStr);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                return `${year}-${month}`;
            }
        } catch (error) {
            console.warn(`Unable to parse date key: ${keyStr}`);
        }
        
        return keyStr;
    },

    splitReport(text, maxLength) {
        const parts = [];
        let currentPart = '';
        const lines = text.split('\n');
        
        for (const line of lines) {
            if (currentPart.length + line.length + 1 > maxLength) {
                if (currentPart) {
                    parts.push(currentPart);
                    currentPart = '';
                }
                
                // If a single line is too long, truncate it
                if (line.length > maxLength) {
                    parts.push(line.substring(0, maxLength - 3) + '...');
                    continue;
                }
            }
            currentPart += (currentPart ? '\n' : '') + line;
        }
        
        if (currentPart) {
            parts.push(currentPart);
        }
        
        return parts;
    }
};
