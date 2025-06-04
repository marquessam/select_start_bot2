// CLEANUP COMMAND: src/commands/admin/cleanup-challenge-data.js
import { SlashCommandBuilder } from 'discord.js';
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
            .setDescription('Show what would be cleaned without making changes')
            .setRequired(false)),

    async execute(interaction) {
        // Check if user has admin permissions
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return interaction.reply({ content: 'You need administrator permissions to use this command.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetUsername = interaction.options.getString('username');
        const dryRun = interaction.options.getBoolean('dry-run') ?? true; // Default to dry run for safety
        
        try {
            let users;
            if (targetUsername) {
                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp('^' + targetUsername + '$', 'i') }
                });
                if (!user) {
                    return interaction.editReply('User not found.');
                }
                users = [user];
            } else {
                users = await User.find({});
            }

            let totalUsersProcessed = 0;
            let totalDuplicatesFound = 0;
            let totalDuplicatesRemoved = 0;
            const cleanupReport = [];

            for (const user of users) {
                const userCleanup = await this.cleanupUserChallengeData(user, dryRun);
                if (userCleanup.duplicatesFound > 0) {
                    totalUsersProcessed++;
                    totalDuplicatesFound += userCleanup.duplicatesFound;
                    totalDuplicatesRemoved += userCleanup.duplicatesRemoved;
                    cleanupReport.push(userCleanup);
                }
            }

            // Create summary report
            let report = `## Challenge Data Cleanup Report ${dryRun ? '(DRY RUN)' : ''}\n\n`;
            report += `**Summary:**\n`;
            report += `- Users processed: ${totalUsersProcessed}\n`;
            report += `- Total duplicates found: ${totalDuplicatesFound}\n`;
            report += `- Total duplicates ${dryRun ? 'would be removed' : 'removed'}: ${totalDuplicatesRemoved}\n\n`;

            if (cleanupReport.length > 0) {
                report += `**Detailed Results:**\n`;
                cleanupReport.slice(0, 10).forEach(userReport => {
                    report += `\n**${userReport.username}:**\n`;
                    report += `- Monthly duplicates: ${userReport.monthlyDuplicates}\n`;
                    report += `- Shadow duplicates: ${userReport.shadowDuplicates}\n`;
                    if (userReport.examples.length > 0) {
                        report += `- Examples: ${userReport.examples.join(', ')}\n`;
                    }
                });

                if (cleanupReport.length > 10) {
                    report += `\n*...and ${cleanupReport.length - 10} more users with duplicates*\n`;
                }
            }

            if (dryRun) {
                report += `\n⚠️ **This was a dry run. No changes were made.**\n`;
                report += `Run again with \`dry-run: false\` to actually clean up the data.`;
            } else {
                report += `\n✅ **Cleanup completed successfully.**`;
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
            await interaction.editReply('An error occurred during cleanup. Check the console for details.');
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

        // Clean monthly challenges
        const monthlyCleanup = this.cleanupChallengeMap(user.monthlyChallenges, 'monthly');
        result.monthlyDuplicates = monthlyCleanup.duplicatesFound;
        result.duplicatesFound += monthlyCleanup.duplicatesFound;
        result.examples.push(...monthlyCleanup.examples);

        // Clean shadow challenges
        const shadowCleanup = this.cleanupChallengeMap(user.shadowChallenges, 'shadow');
        result.shadowDuplicates = shadowCleanup.duplicatesFound;
        result.duplicatesFound += shadowCleanup.duplicatesFound;
        result.examples.push(...shadowCleanup.examples);

        if (!dryRun && result.duplicatesFound > 0) {
            // Apply the cleaned maps
            user.monthlyChallenges = monthlyCleanup.cleanedMap;
            user.shadowChallenges = shadowCleanup.cleanedMap;
            await user.save();
            result.duplicatesRemoved = result.duplicatesFound;
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

        console.log(`\n=== CLEANING ${challengeType.toUpperCase()} CHALLENGES ===`);
        console.log(`Original entries: ${entries.length}`);

        for (const [originalKey, data] of entries) {
            const normalizedKey = this.normalizeMonthKey(originalKey);
            
            if (normalized.has(normalizedKey)) {
                // Found a duplicate!
                duplicatesFound++;
                const existing = normalized.get(normalizedKey);
                
                examples.push(`${originalKey} -> ${normalizedKey}`);
                console.log(`Duplicate found: ${originalKey} -> ${normalizedKey}`);
                console.log(`  Existing:`, existing);
                console.log(`  New:`, data);
                
                // Merge the data, keeping the best values
                const mergedData = this.mergeChallengeDatas(existing, data);
                normalized.set(normalizedKey, mergedData);
                console.log(`  Merged:`, mergedData);
                
            } else {
                normalized.set(normalizedKey, data);
            }
        }

        console.log(`Final entries: ${normalized.size}`);
        console.log(`Duplicates found: ${duplicatesFound}`);

        return {
            duplicatesFound,
            cleanedMap: normalized,
            examples: examples.slice(0, 3) // Limit examples
        };
    },

    mergeChallengeDatas(existing, newData) {
        // Merge two challenge data objects, keeping the best values
        const merged = { ...existing };

        // Take the higher progress value
        if (newData.progress > (existing.progress || 0)) {
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

        // Take the more recent game title if available
        if (newData.gameTitle && !existing.gameTitle) {
            merged.gameTitle = newData.gameTitle;
        }

        // Take the more recent date if available
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
            }
            currentPart += (currentPart ? '\n' : '') + line;
        }
        
        if (currentPart) {
            parts.push(currentPart);
        }
        
        return parts;
    }
};

// FIXED PROFILE COMMAND: Enhanced deduplication in main profile logic
// Add these methods to the existing profile.js:

// ENHANCED: Calculate points with proper deduplication
calculatePoints(user) {
    let challengePoints = 0;
    let stats = { mastery: 0, beaten: 0, participation: 0, shadowBeaten: 0, shadowParticipation: 0 };
    
    console.log(`=== CALCULATING POINTS FOR ${user.raUsername} ===`);
    
    // Process monthly challenges with deduplication
    const uniqueMonthly = this.deduplicateAndCleanEntries(user.monthlyChallenges, 'monthly');
    console.log(`Monthly challenges: ${user.monthlyChallenges?.size || 0} raw -> ${uniqueMonthly.length} unique`);
    
    for (const [monthKey, data] of uniqueMonthly) {
        if (data.progress === 3) {
            stats.mastery++;
            challengePoints += POINTS.MASTERY;
            console.log(`Monthly mastery: ${monthKey} (+${POINTS.MASTERY} pts)`);
        } else if (data.progress === 2) {
            stats.beaten++;
            challengePoints += POINTS.BEATEN;
            console.log(`Monthly beaten: ${monthKey} (+${POINTS.BEATEN} pts)`);
        } else if (data.progress === 1) {
            stats.participation++;
            challengePoints += POINTS.PARTICIPATION;
            console.log(`Monthly participation: ${monthKey} (+${POINTS.PARTICIPATION} pts)`);
        }
    }

    // Process shadow challenges with deduplication
    const uniqueShadow = this.deduplicateAndCleanEntries(user.shadowChallenges, 'shadow');
    console.log(`Shadow challenges: ${user.shadowChallenges?.size || 0} raw -> ${uniqueShadow.length} unique`);
    
    for (const [monthKey, data] of uniqueShadow) {
        if (data.progress === 2) {
            stats.shadowBeaten++;
            challengePoints += POINTS.BEATEN;
            console.log(`Shadow beaten: ${monthKey} (+${POINTS.BEATEN} pts)`);
        } else if (data.progress === 1) {
            stats.shadowParticipation++;
            challengePoints += POINTS.PARTICIPATION;
            console.log(`Shadow participation: ${monthKey} (+${POINTS.PARTICIPATION} pts)`);
        }
    }

    const currentYear = new Date().getFullYear();
    const communityPoints = user.getCommunityPointsForYear(currentYear);

    console.log(`Final stats:`, stats);
    console.log(`Challenge points: ${challengePoints}, Community points: ${communityPoints}`);
    console.log(`=== END POINTS CALCULATION ===`);

    return {
        totalPoints: challengePoints + communityPoints,
        challengePoints,
        communityPoints,
        stats
    };
},

// ENHANCED: Better deduplication that also cleans the data
deduplicateAndCleanEntries(challengeMap, challengeType) {
    if (!challengeMap?.size) return [];

    const entries = Array.from(challengeMap.entries());
    const normalized = new Map();
    let duplicatesFound = 0;

    for (const [originalKey, data] of entries) {
        const normalizedKey = this.normalizeMonthKey(originalKey);
        
        if (normalized.has(normalizedKey)) {
            duplicatesFound++;
            const existing = normalized.get(normalizedKey);
            
            // Merge the data, keeping the best values
            const mergedData = this.mergeChallengeDatas(existing.data, data);
            normalized.set(normalizedKey, { key: normalizedKey, data: mergedData });
        } else {
            normalized.set(normalizedKey, { key: normalizedKey, data });
        }
    }

    if (duplicatesFound > 0) {
        console.log(`⚠️ Found ${duplicatesFound} duplicate ${challengeType} entries for this user`);
        console.log(`💡 Run /cleanup-challenge-data to fix this permanently`);
    }

    return Array.from(normalized.values()).map(({ key, data }) => [key, data]);
},

// ENHANCED: Merge challenge data objects
mergeChallengeDatas(existing, newData) {
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

    // Prefer non-empty game titles
    if (newData.gameTitle && !existing.gameTitle) {
        merged.gameTitle = newData.gameTitle;
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
},

// ENHANCED: Better month key normalization
normalizeMonthKey(dateKey) {
    if (!dateKey) return dateKey;
    
    const keyStr = String(dateKey).trim();
    
    // Already in correct format (YYYY-MM)
    if (/^\d{4}-\d{2}$/.test(keyStr)) return keyStr;
    
    // ISO date format (YYYY-MM-DD -> YYYY-MM)
    if (/^\d{4}-\d{2}-\d{2}$/.test(keyStr)) {
        return keyStr.substring(0, 7);
    }
    
    // Try parsing various date formats
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

// FIXED: Trophy case with the same deduplication logic
async showTrophyCase(interaction, user) {
    const challenges = await Challenge.find({}).sort({ date: 1 });
    const challengeTitleMap = {};
    
    for (const challenge of challenges) {
        const monthKey = this.getMonthKey(challenge.date);
        challengeTitleMap[monthKey] = {
            monthly: challenge.monthly_game_title,
            shadow: challenge.shadow_game_title
        };
    }

    const trophies = [];
    const seenTrophies = new Set();

    console.log(`=== TROPHY CASE FOR ${user.raUsername} ===`);

    // Process monthly challenges with enhanced deduplication
    const uniqueMonthly = this.deduplicateAndCleanEntries(user.monthlyChallenges, 'monthly');
    console.log(`Monthly trophies: ${user.monthlyChallenges?.size || 0} raw -> ${uniqueMonthly.length} unique`);
    
    for (const [monthKey, data] of uniqueMonthly) {
        if (data.progress > 0) {
            const awardLevel = data.progress === 3 ? 'mastery' : data.progress === 2 ? 'beaten' : 'participation';
            const trophyId = `monthly_${monthKey}_${awardLevel}`;
            
            if (seenTrophies.has(trophyId)) continue;
            seenTrophies.add(trophyId);
            
            const [year, month] = monthKey.split('-');
            const trophyDate = new Date(parseInt(year), parseInt(month) - 1, 15);
            
            let gameTitle = data.gameTitle || challengeTitleMap[monthKey]?.monthly || 
                          `Monthly Challenge - ${this.formatShortDate(monthKey)}`;
            const emojiData = await getTrophyEmoji('monthly', monthKey, awardLevel);

            trophies.push({
                gameTitle, awardLevel, challengeType: 'monthly',
                emojiId: emojiData.emojiId, emojiName: emojiData.emojiName,
                earnedAt: trophyDate
            });
        }
    }

    // Process shadow challenges with enhanced deduplication
    const uniqueShadow = this.deduplicateAndCleanEntries(user.shadowChallenges, 'shadow');
    console.log(`Shadow trophies: ${user.shadowChallenges?.size || 0} raw -> ${uniqueShadow.length} unique`);
    
    for (const [monthKey, data] of uniqueShadow) {
        if (data.progress > 0) {
            const awardLevel = data.progress === 2 ? 'beaten' : 'participation';
            const trophyId = `shadow_${monthKey}_${awardLevel}`;
            
            if (seenTrophies.has(trophyId)) continue;
            seenTrophies.add(trophyId);
            
            const [year, month] = monthKey.split('-');
            const trophyDate = new Date(parseInt(year), parseInt(month) - 1, 15);
            
            let gameTitle = data.gameTitle || challengeTitleMap[monthKey]?.shadow || 
                          `Shadow Challenge - ${this.formatShortDate(monthKey)}`;
            const emojiData = await getTrophyEmoji('shadow', monthKey, awardLevel);

            trophies.push({
                gameTitle, awardLevel, challengeType: 'shadow',
                emojiId: emojiData.emojiId, emojiName: emojiData.emojiName,
                earnedAt: trophyDate
            });
        }
    }

    // Log summary for debugging
    const summary = trophies.reduce((acc, trophy) => {
        const key = `${trophy.challengeType}_${trophy.awardLevel}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    console.log('Trophy summary after deduplication:', summary);

    // Rest of the trophy case logic continues...
    // (Community awards, sorting, embed creation, etc.)
}
