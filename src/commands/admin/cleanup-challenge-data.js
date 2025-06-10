// src/commands/admin/cleanup-challenge-data.js - Clean up duplicate challenge entries
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { User } from '../../models/User.js';

export default {
    data: new SlashCommandBuilder()
        .setName('cleanup-challenge-data')
        .setDescription('Clean up duplicate challenge data entries for users')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Specific username to clean up (optional - leave empty for all users)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('dry-run')
                .setDescription('Just show what would be cleaned without making changes')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const specificUsername = interaction.options.getString('username');
            const isDryRun = interaction.options.getBoolean('dry-run') ?? false;

            // Find users to process
            let users;
            if (specificUsername) {
                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp('^' + specificUsername + '$', 'i') }
                });
                if (!user) {
                    return interaction.editReply(`❌ User '${specificUsername}' not found.`);
                }
                users = [user];
            } else {
                users = await User.find({});
            }

            if (users.length === 0) {
                return interaction.editReply('❌ No users found to process.');
            }

            console.log(`🧹 Starting challenge data cleanup for ${users.length} users (dry-run: ${isDryRun})`);

            let totalUsersProcessed = 0;
            let totalUsersWithDuplicates = 0;
            let totalMonthlyDuplicatesRemoved = 0;
            let totalShadowDuplicatesRemoved = 0;
            let cleanupResults = [];

            for (const user of users) {
                try {
                    const result = await this.cleanupUserChallengeData(user, isDryRun);
                    
                    if (result.hadDuplicates) {
                        totalUsersWithDuplicates++;
                        totalMonthlyDuplicatesRemoved += result.monthlyDuplicatesRemoved;
                        totalShadowDuplicatesRemoved += result.shadowDuplicatesRemoved;
                        
                        cleanupResults.push({
                            username: user.raUsername,
                            monthlyDuplicates: result.monthlyDuplicatesRemoved,
                            shadowDuplicates: result.shadowDuplicatesRemoved,
                            monthlyBefore: result.monthlyBefore,
                            monthlyAfter: result.monthlyAfter,
                            shadowBefore: result.shadowBefore,
                            shadowAfter: result.shadowAfter
                        });
                    }
                    
                    totalUsersProcessed++;
                } catch (error) {
                    console.error(`Error cleaning up user ${user.raUsername}:`, error);
                    cleanupResults.push({
                        username: user.raUsername,
                        error: error.message
                    });
                }
            }

            // Create summary embed
            const embed = new EmbedBuilder()
                .setTitle(`🧹 Challenge Data Cleanup ${isDryRun ? '(Dry Run)' : 'Complete'}`)
                .setColor(isDryRun ? '#FFA500' : '#00FF00')
                .setTimestamp();

            let description = `**Summary:**\n`;
            description += `• Users processed: ${totalUsersProcessed}\n`;
            description += `• Users with duplicates: ${totalUsersWithDuplicates}\n`;
            description += `• Monthly duplicates ${isDryRun ? 'found' : 'removed'}: ${totalMonthlyDuplicatesRemoved}\n`;
            description += `• Shadow duplicates ${isDryRun ? 'found' : 'removed'}: ${totalShadowDuplicatesRemoved}\n`;

            if (isDryRun && (totalMonthlyDuplicatesRemoved > 0 || totalShadowDuplicatesRemoved > 0)) {
                description += `\n💡 **Run without dry-run to actually clean up the data**`;
            }

            embed.setDescription(description);

            // Add details for users with duplicates (limit to first 10)
            if (cleanupResults.length > 0) {
                let detailsText = '';
                const resultsToShow = cleanupResults.slice(0, 10);
                
                for (const result of resultsToShow) {
                    if (result.error) {
                        detailsText += `❌ **${result.username}**: ${result.error}\n`;
                    } else {
                        detailsText += `🔧 **${result.username}**:\n`;
                        if (result.monthlyDuplicates > 0) {
                            detailsText += `  • Monthly: ${result.monthlyBefore} → ${result.monthlyAfter} (-${result.monthlyDuplicates})\n`;
                        }
                        if (result.shadowDuplicates > 0) {
                            detailsText += `  • Shadow: ${result.shadowBefore} → ${result.shadowAfter} (-${result.shadowDuplicates})\n`;
                        }
                    }
                }

                if (cleanupResults.length > 10) {
                    detailsText += `\n*...and ${cleanupResults.length - 10} more users*`;
                }

                if (detailsText.length > 1024) {
                    detailsText = detailsText.substring(0, 1020) + '...';
                }

                embed.addFields({
                    name: 'User Details',
                    value: detailsText || 'No issues found'
                });
            }

            embed.setFooter({ 
                text: isDryRun ? 'This was a dry run - no changes were made' : 'Challenge data cleanup completed'
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in cleanup-challenge-data command:', error);
            await interaction.editReply('❌ An error occurred during cleanup. Check the console for details.');
        }
    },

    /**
     * Clean up duplicate challenge data for a single user
     */
    async cleanupUserChallengeData(user, isDryRun = false) {
        console.log(`🧹 Cleaning up challenge data for ${user.raUsername}...`);

        const initialMonthlySize = user.monthlyChallenges?.size || 0;
        const initialShadowSize = user.shadowChallenges?.size || 0;

        // Clean up monthly challenges
        const monthlyResult = this.deduplicateMap(user.monthlyChallenges, 'monthly');
        
        // Clean up shadow challenges
        const shadowResult = this.deduplicateMap(user.shadowChallenges, 'shadow');

        const monthlyDuplicatesRemoved = initialMonthlySize - monthlyResult.size;
        const shadowDuplicatesRemoved = initialShadowSize - shadowResult.size;
        const hadDuplicates = monthlyDuplicatesRemoved > 0 || shadowDuplicatesRemoved > 0;

        if (hadDuplicates) {
            console.log(`${user.raUsername} cleanup:`, {
                monthly: `${initialMonthlySize} → ${monthlyResult.size} (-${monthlyDuplicatesRemoved})`,
                shadow: `${initialShadowSize} → ${shadowResult.size} (-${shadowDuplicatesRemoved})`
            });

            if (!isDryRun) {
                // Actually update the user's data
                user.monthlyChallenges = monthlyResult;
                user.shadowChallenges = shadowResult;
                await user.save();
                console.log(`✅ Saved cleaned data for ${user.raUsername}`);
            }
        }

        return {
            hadDuplicates,
            monthlyDuplicatesRemoved,
            shadowDuplicatesRemoved,
            monthlyBefore: initialMonthlySize,
            monthlyAfter: monthlyResult.size,
            shadowBefore: initialShadowSize,
            shadowAfter: shadowResult.size
        };
    },

    /**
     * Deduplicate a Map with enhanced logging
     */
    deduplicateMap(challengeMap, challengeType) {
        if (!challengeMap || challengeMap.size === 0) {
            return new Map();
        }

        const normalized = new Map();
        let duplicatesFound = 0;

        for (const [originalKey, data] of challengeMap.entries()) {
            // Skip entries with no data or invalid data
            if (!data || typeof data !== 'object') {
                console.warn(`Skipping invalid data entry for key ${originalKey} in ${challengeType}`);
                continue;
            }

            const normalizedKey = this.normalizeMonthKey(originalKey);
            
            if (normalized.has(normalizedKey)) {
                duplicatesFound++;
                const existing = normalized.get(normalizedKey);
                
                console.log(`Found ${challengeType} duplicate: ${originalKey} -> ${normalizedKey}`, {
                    existing: { progress: existing.progress, gameTitle: existing.gameTitle },
                    new: { progress: data.progress, gameTitle: data.gameTitle }
                });
                
                // Merge the data, keeping the best values
                const mergedData = this.mergeChallengeDatas(existing, data);
                normalized.set(normalizedKey, mergedData);
            } else {
                normalized.set(normalizedKey, { ...data }); // Create a copy to avoid mutations
            }
        }

        console.log(`${challengeType} deduplication: ${challengeMap.size} -> ${normalized.size} (removed ${duplicatesFound})`);
        return normalized;
    },

    /**
     * Normalize month key to standard YYYY-MM format
     */
    normalizeMonthKey(dateKey) {
        if (!dateKey) return String(dateKey);
        
        const keyStr = String(dateKey).trim();
        
        // Already in correct format (YYYY-MM)
        if (/^\d{4}-\d{2}$/.test(keyStr)) {
            return keyStr;
        }
        
        // ISO date format (YYYY-MM-DD -> YYYY-MM)
        if (/^\d{4}-\d{2}-\d{2}$/.test(keyStr)) {
            return keyStr.substring(0, 7);
        }
        
        // Handle various date formats
        try {
            const date = new Date(keyStr);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                return `${year}-${month}`;
            }
        } catch (error) {
            console.warn(`Unable to parse date key: ${keyStr}`, error);
        }
        
        return keyStr;
    },

    /**
     * Merge challenge data objects, keeping the best values
     */
    mergeChallengeDatas(existing, newData) {
        const merged = { ...existing };

        // Take the higher progress value
        const existingProgress = existing.progress || 0;
        const newProgress = newData.progress || 0;
        if (newProgress > existingProgress) {
            merged.progress = newProgress;
        }

        // Take the higher achievement count
        const existingAchievements = existing.achievements || 0;
        const newAchievements = newData.achievements || 0;
        if (newAchievements > existingAchievements) {
            merged.achievements = newAchievements;
        }

        // Take the higher completion percentage
        const existingPercent = existing.completionPercent || existing.percentage || 0;
        const newPercent = newData.completionPercent || newData.percentage || 0;
        if (newPercent > existingPercent) {
            merged.completionPercent = newPercent;
            merged.percentage = newPercent; // Ensure both fields are set
        }

        // Prefer non-empty game titles
        if (newData.gameTitle && !existing.gameTitle) {
            merged.gameTitle = newData.gameTitle;
        } else if (!newData.gameTitle && existing.gameTitle) {
            // Keep existing title
        } else if (newData.gameTitle && existing.gameTitle && newData.gameTitle !== existing.gameTitle) {
            // Both have titles but they're different - prefer the non-"N/A" one
            if (existing.gameTitle === 'N/A' && newData.gameTitle !== 'N/A') {
                merged.gameTitle = newData.gameTitle;
            }
        }

        // Take the more recent lastUpdated date
        if (newData.lastUpdated && (!existing.lastUpdated || 
            new Date(newData.lastUpdated) > new Date(existing.lastUpdated))) {
            merged.lastUpdated = newData.lastUpdated;
        }

        // Keep any other fields that exist in either
        Object.keys(newData).forEach(key => {
            if (!(key in merged) && newData[key] !== undefined) {
                merged[key] = newData[key];
            }
        });

        return merged;
    }
};
