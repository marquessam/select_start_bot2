import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

const RANK_EMOJIS = {
    1: '🥇',
    2: '🥈',
    3: '🥉'
};

// Award points constants - with hierarchical values matching profile.js exactly
const POINTS = {
    MASTERY: 7,          // Mastery (3+3+1)
    BEATEN: 4,           // Beaten (3+1)
    PARTICIPATION: 1     // Participation
};

// Shadow games are limited to beaten status maximum (4 points)
const SHADOW_MAX_POINTS = POINTS.BEATEN;

// Number of users to show per embed - Reduced to stay within Discord's field character limits
const USERS_PER_PAGE = 5;

// Comprehensive sync configuration
const SYNC_CONFIG = {
    // API rate limiting - be respectful to RetroAchievements
    API_DELAY_MS: 1000,  // 1 second between API calls
    BATCH_SIZE: 5,       // Process 5 users at a time
    BATCH_DELAY_MS: 2000, // 2 second delay between batches
    // Progress reporting
    PROGRESS_UPDATE_INTERVAL: 10, // Update progress every 10 users
};

// Helper function to check if an achievement was earned during its challenge month
function wasEarnedDuringChallengeMonth(dateEarned, challengeDate) {
    if (!dateEarned) return false;
    
    const earnedDate = new Date(dateEarned.replace(' ', 'T'));
    
    // Get first day of challenge month
    const challengeMonthStart = new Date(challengeDate.getFullYear(), challengeDate.getMonth(), 1);
    
    // Get first day of next month
    const nextMonthStart = new Date(challengeDate.getFullYear(), challengeDate.getMonth() + 1, 1);
    
    // Get last day of previous month (for grace period)
    const prevMonthLastDay = new Date(challengeMonthStart);
    prevMonthLastDay.setDate(prevMonthLastDay.getDate() - 1);
    
    // Check if achievement was earned during challenge month
    const inChallengeMonth = earnedDate >= challengeMonthStart && earnedDate < nextMonthStart;
    
    // Check if achievement was earned on the last day of previous month (grace period)
    const isLastDayOfPrevMonth = 
        earnedDate.getDate() === prevMonthLastDay.getDate() &&
        earnedDate.getMonth() === prevMonthLastDay.getMonth() &&
        earnedDate.getFullYear() === prevMonthLastDay.getFullYear();
    
    return inChallengeMonth || isLastDayOfPrevMonth;
}

export default {
    data: new SlashCommandBuilder()
        .setName('yearlyboard')
        .setDescription('Display the yearly leaderboard')
        .addIntegerOption(option =>
            option.setName('year')
                .setDescription('Year to display (defaults to current year)')
                .setMinValue(2000)
                .setMaxValue(2100))
        .addBooleanOption(option =>
            option.setName('sync')
                .setDescription('Sync ALL users with RetroAchievements API (admin only, very slow but most accurate)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Only sync this specific user (admin only, requires sync:true)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('debug')
                .setDescription('Show debug info (admin only)')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Get the year from the option, default to current year
            const selectedYear = interaction.options.getInteger('year') || new Date().getFullYear();
            
            // Check if debug option is enabled - admin only
            const debugOption = interaction.options.getBoolean('debug') || false;
            const isAdmin = interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID);
            const showDebug = debugOption && isAdmin;
            
            // Check if sync option is enabled - admin only
            const syncOption = interaction.options.getBoolean('sync') || false;
            const shouldSync = syncOption && isAdmin;
            
            if ((syncOption || debugOption) && !isAdmin) {
                await interaction.editReply('Only admins can use the sync and debug options.');
                return;
            }
            
            // Get specific username if provided
            const targetUsername = interaction.options.getString('username');
            let targetUser = null;
            
            if (targetUsername && shouldSync) {
                targetUser = await User.findOne({
                    raUsername: { $regex: new RegExp(`^${targetUsername}$`, 'i') }
                });
                
                if (!targetUser) {
                    await interaction.editReply(`User "${targetUsername}" not found.`);
                    return;
                }
            }
            
            // Get start and end dates for the selected year
            const yearStart = new Date(selectedYear, 0, 1);
            const yearEnd = new Date(selectedYear + 1, 0, 1);

            // Get all challenges for the year
            const challenges = await Challenge.find({
                date: {
                    $gte: yearStart,
                    $lt: yearEnd
                }
            }).sort({ date: 1 });

            if (challenges.length === 0) {
                return interaction.editReply(`No challenges found for the year ${selectedYear}.`);
            }

            // Get all users
            const users = await User.find({});
            console.log(`Found ${users.length} users in database`);

            // Create a map for faster challenge lookups
            const challengeMap = new Map();
            for (const challenge of challenges) {
                const dateKey = User.formatDateKey(challenge.date);
                challengeMap.set(dateKey, challenge);
            }

            // Determine which users to process
            let usersToProcess = users;
            if (shouldSync && targetUser) {
                usersToProcess = [targetUser];
            }

            // If synchronizing, provide comprehensive warning
            if (shouldSync) {
                const estimatedTime = Math.ceil((usersToProcess.length * challenges.length * SYNC_CONFIG.API_DELAY_MS) / 60000);
                await interaction.editReply(
                    `🔄 **COMPREHENSIVE SYNC STARTING**\n\n` +
                    `**Users to sync:** ${usersToProcess.length}\n` +
                    `**Challenges:** ${challenges.length}\n` +
                    `**Estimated time:** ${estimatedTime} minutes\n\n` +
                    `This will sync ALL users with the RetroAchievements API for maximum accuracy. Please be patient...`
                );
            }

            // Calculate points for all users
            const userPoints = [];
            const skippedUsers = []; // For debugging
            const syncedUserCount = { value: 0 }; // Use object for reference
            
            // Process users in batches to avoid overwhelming the API
            const batches = [];
            for (let i = 0; i < usersToProcess.length; i += SYNC_CONFIG.BATCH_SIZE) {
                batches.push(usersToProcess.slice(i, i + SYNC_CONFIG.BATCH_SIZE));
            }
            
            console.log(`Processing ${usersToProcess.length} users in ${batches.length} batches`);
            
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];
                
                // Process batch in parallel but with rate limiting
                await Promise.all(batch.map(async (user) => {
                    try {
                        let points;
                        if (shouldSync) {
                            points = await this.syncAndCalculatePoints(user, challengeMap, selectedYear);
                            syncedUserCount.value++;
                        } else {
                            points = await this.calculatePointsFromDatabase(user, challengeMap, selectedYear);
                        }
                        
                        if (points.totalPoints > 0) {
                            userPoints.push(points);
                        } else if (showDebug) {
                            skippedUsers.push({ 
                                username: user.raUsername, 
                                reason: `No points: ${JSON.stringify(points)}` 
                            });
                        }
                    } catch (error) {
                        console.error(`Error processing user ${user.raUsername}:`, error);
                        // Fallback to database approach
                        try {
                            const points = await this.calculatePointsFromDatabase(user, challengeMap, selectedYear);
                            if (points.totalPoints > 0) {
                                userPoints.push(points);
                            } else if (showDebug) {
                                skippedUsers.push({ 
                                    username: user.raUsername, 
                                    reason: `Error syncing, no DB points: ${error.message}` 
                                });
                            }
                        } catch (dbError) {
                            console.error(`Database fallback failed for ${user.raUsername}:`, dbError);
                            if (showDebug) {
                                skippedUsers.push({ 
                                    username: user.raUsername, 
                                    reason: `Complete failure: ${dbError.message}` 
                                });
                            }
                        }
                    }
                }));
                
                // Progress update
                const processedUsers = (batchIndex + 1) * SYNC_CONFIG.BATCH_SIZE;
                const totalUsers = usersToProcess.length;
                const actualProcessed = Math.min(processedUsers, totalUsers);
                
                if (shouldSync && actualProcessed % SYNC_CONFIG.PROGRESS_UPDATE_INTERVAL === 0) {
                    const percentComplete = Math.round((actualProcessed / totalUsers) * 100);
                    await interaction.editReply(
                        `🔄 **COMPREHENSIVE SYNC IN PROGRESS**\n\n` +
                        `**Progress:** ${actualProcessed}/${totalUsers} users (${percentComplete}%)\n` +
                        `**Found participants:** ${userPoints.length}\n\n` +
                        `Syncing with RetroAchievements API for maximum accuracy...`
                    );
                }
                
                // Delay between batches to avoid overwhelming the API
                if (batchIndex < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, SYNC_CONFIG.BATCH_DELAY_MS));
                }
            }
            
            console.log(`Processed ${usersToProcess.length} users, found ${userPoints.length} with points`);

            // Sort users by total points (descending)
            userPoints.sort((a, b) => b.totalPoints - a.totalPoints);

            if (userPoints.length === 0) {
                let noDataMessage = `No users have earned points for ${selectedYear}.`;
                
                if (showDebug && skippedUsers.length > 0) {
                    noDataMessage += `\n\nDebug info (${skippedUsers.length} users skipped):\n` + 
                        skippedUsers.slice(0, 10).map(u => `${u.username}: ${u.reason}`).join('\n');
                    
                    if (skippedUsers.length > 10) {
                        noDataMessage += `\n...and ${skippedUsers.length - 10} more`;
                    }
                }
                
                const embed = new EmbedBuilder()
                    .setTitle(`🏆 ${selectedYear} Yearly Leaderboard`)
                    .setDescription(`Total Challenges: ${challenges.length}`)
                    .setColor('#FFD700')
                    .addFields({
                        name: 'No Participants',
                        value: noDataMessage
                    })
                    .setFooter({ text: 'Use /help points for more information about the points system' })
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [embed] });
            }

            // Handle ties by assigning the same rank to users with equal points
            let currentRank = 1;
            let currentPoints = userPoints[0].totalPoints;
            let usersProcessed = 0;
            
            for (let i = 0; i < userPoints.length; i++) {
                if (userPoints[i].totalPoints < currentPoints) {
                    currentRank = usersProcessed + 1;
                    currentPoints = userPoints[i].totalPoints;
                }
                userPoints[i].rank = currentRank;
                usersProcessed++;
            }

            // Save the processed results to the database
            try {
                console.log(`Saving yearly processed data for ${userPoints.length} users to database...`);
                const yearKey = `annual_${selectedYear}`;
                
                // Create and save annual records for each user
                await Promise.all(userPoints.map(async (points) => {
                    try {
                        // Find the user in the database
                        const user = await User.findOne({ raUsername: points.username });
                        if (!user) {
                            console.error(`Could not find user ${points.username} in database`);
                            return;
                        }
                        
                        // If the user has an annualRecords field, use it; otherwise, create it
                        if (!user.annualRecords) {
                            user.annualRecords = new Map();
                        }
                        
                        // Save the processed annual data
                        user.annualRecords.set(yearKey, {
                            year: selectedYear,
                            totalPoints: points.totalPoints,
                            challengePoints: points.challengePoints,
                            communityPoints: points.communityPoints,
                            rank: points.rank,
                            stats: points.stats,
                            lastUpdated: new Date(),
                            syncedWithAPI: shouldSync
                        });
                        
                        await user.save();
                    } catch (userError) {
                        console.error(`Error saving yearly data for user ${points.username}:`, userError);
                    }
                }));
                
                // Notify the API to refresh its cache
                try {
                    console.log('Notifying API to refresh yearly data...');
                    const response = await fetch('https://select-start-api-production.up.railway.app/api/admin/force-update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': '0000'
                        },
                        body: JSON.stringify({ target: 'leaderboards' })
                    });
                    
                    console.log('API response:', response.ok ? 'Success' : 'Failed');
                } catch (apiError) {
                    console.error('Error notifying API:', apiError);
                }
            } catch (saveError) {
                console.error('Error saving yearly processed data:', saveError);
                // Continue execution to at least show the leaderboard
            }

            // Create embeds for all pages
            const embeds = this.createPaginatedEmbeds(
                userPoints, 
                selectedYear, 
                challenges.length, 
                shouldSync,
                syncedUserCount.value,
                showDebug, 
                skippedUsers
            );

            // Display the paginated leaderboard with navigation buttons
            await this.displayPaginatedLeaderboard(interaction, embeds);

        } catch (error) {
            console.error('Error displaying yearly leaderboard:', error);
            return interaction.editReply(`An error occurred while fetching the yearly leaderboard: ${error.message}\n\nPlease try again.`);
        }
    },

    // Helper method to sum points from a Map for a specific year
    getYearlyPointsFromMap(pointsMap, year) {
        let total = 0;
        for (const [dateKey, data] of pointsMap.entries()) {
            if (dateKey.startsWith(year.toString())) {
                total += data.progress || 0;
            }
        }
        return total;
    },

    // Method to display paginated leaderboard with navigation buttons
    async displayPaginatedLeaderboard(interaction, embeds) {
        // If only one page, just send it without buttons
        if (embeds.length === 1) {
            return interaction.editReply({ embeds: [embeds[0]] });
        }

        // Create navigation buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('first')
                    .setLabel('First')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏮️'),
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('◀️'),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('▶️'),
                new ButtonBuilder()
                    .setCustomId('last')
                    .setLabel('Last')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏭️')
            );

        let currentPage = 0;

        // Send the first page with navigation buttons
        const message = await interaction.editReply({
            embeds: [embeds[currentPage]],
            components: [row]
        });

        // Create collector for button interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes timeout
        });

        // Update buttons based on current page
        const updateButtons = (page) => {
            // Disable/enable buttons based on current page
            row.components[0].setDisabled(page === 0); // First
            row.components[1].setDisabled(page === 0); // Previous
            row.components[2].setDisabled(page === embeds.length - 1); // Next
            row.components[3].setDisabled(page === embeds.length - 1); // Last
            
            return row;
        };

        // Handle button clicks
        collector.on('collect', async (i) => {
            // Defer the update to avoid interaction timeouts
            await i.deferUpdate();

            // Handle different button clicks
            switch (i.customId) {
                case 'first':
                    currentPage = 0;
                    break;
                case 'previous':
                    currentPage = Math.max(0, currentPage - 1);
                    break;
                case 'next':
                    currentPage = Math.min(embeds.length - 1, currentPage + 1);
                    break;
                case 'last':
                    currentPage = embeds.length - 1;
                    break;
            }

            // Update the message with the new page and updated buttons
            await i.editReply({
                embeds: [embeds[currentPage]],
                components: [updateButtons(currentPage)]
            });
        });

        // When the collector expires
        collector.on('end', async () => {
            try {
                // Disable all buttons when time expires
                const disabledRow = new ActionRowBuilder().addComponents(
                    row.components[0].setDisabled(true),
                    row.components[1].setDisabled(true),
                    row.components[2].setDisabled(true),
                    row.components[3].setDisabled(true)
                );

                // Update the message with disabled buttons
                await interaction.editReply({
                    embeds: [embeds[currentPage].setFooter({ 
                        text: 'Session expired • Use /help points for more information about the points system' 
                    })],
                    components: [disabledRow]
                });
            } catch (error) {
                console.error('Error disabling buttons:', error);
            }
        });

        // Initially update buttons based on first page
        return updateButtons(currentPage);
    },

    // Calculate points using database values - includes ALL points sources
    async calculatePointsFromDatabase(user, challengeMap, selectedYear) {
        let challengePoints = 0;
        let masteryCount = 0;
        let beatenCount = 0;
        let participationCount = 0;
        let shadowBeatenCount = 0;
        let shadowParticipationCount = 0;
        
        // Process monthly challenges
        for (const [dateStr, data] of user.monthlyChallenges.entries()) {
            const challengeDate = new Date(dateStr);
            if (challengeDate.getFullYear() !== selectedYear) {
                continue;
            }
            
            const challenge = challengeMap.get(dateStr);
            if (!challenge) {
                continue; // Skip if no matching challenge
            }
            
            // Calculate points based on progress
            if (data.progress === 3) {
                // Mastery (7 points)
                masteryCount++;
                challengePoints += POINTS.MASTERY;
            } else if (data.progress === 2) {
                // Beaten (4 points)
                beatenCount++;
                challengePoints += POINTS.BEATEN;
            } else if (data.progress === 1) {
                // Participation (1 point)
                participationCount++;
                challengePoints += POINTS.PARTICIPATION;
            }
        }

        // Process shadow challenges
        for (const [dateStr, data] of user.shadowChallenges.entries()) {
            const challengeDate = new Date(dateStr);
            if (challengeDate.getFullYear() !== selectedYear) {
                continue;
            }
            
            const challenge = challengeMap.get(dateStr);
            if (!challenge || !challenge.shadow_challange_gameid) {
                continue; // Skip if no matching challenge or no shadow game
            }
            
            if (data.progress === 2) {
                shadowBeatenCount++;
                challengePoints += SHADOW_MAX_POINTS;
            } else if (data.progress === 1) {
                shadowParticipationCount++;
                challengePoints += POINTS.PARTICIPATION;
            }
        }

        // Get ALL community awards points for the year
        // This includes racing points, arcade points, and other community awards
        const communityPoints = user.getCommunityPointsForYear(selectedYear);

        return {
            username: user.raUsername,
            totalPoints: challengePoints + communityPoints,
            challengePoints,
            communityPoints,
            stats: {
                mastery: masteryCount,
                beaten: beatenCount,
                participation: participationCount,
                shadowBeaten: shadowBeatenCount,
                shadowParticipation: shadowParticipationCount
            }
        };
    },

    // Calculate points by querying RetroAchievements API (comprehensive but slow)
    async syncAndCalculatePoints(user, challengeMap, selectedYear) {
        let challengePoints = 0;
        let masteryCount = 0;
        let beatenCount = 0;
        let participationCount = 0;
        let shadowBeatenCount = 0;
        let shadowParticipationCount = 0;
        
        // Track updates needed for database to sync
        let updatedMonthlyMap = new Map(user.monthlyChallenges);
        let updatedShadowMap = new Map(user.shadowChallenges);
        let needDatabaseUpdate = false;

        // Process all challenges for the selected year
        for (const [dateStr, challenge] of challengeMap.entries()) {
            const challengeDate = new Date(dateStr);
            if (challengeDate.getFullYear() !== selectedYear) continue;
            
            // Add rate limiting delay to prevent overwhelming the API
            await new Promise(resolve => setTimeout(resolve, SYNC_CONFIG.API_DELAY_MS));
            
            // Process monthly challenge
            if (challenge.monthly_challange_gameid) {
                try {
                    const progress = await retroAPI.getUserGameProgress(
                        user.raUsername,
                        challenge.monthly_challange_gameid
                    );
                    
                    if (progress.numAwardedToUser > 0) {
                        // Get only achievements earned during the challenge month
                        const earnedDuringChallenge = Object.entries(progress.achievements)
                            .filter(([id, data]) => wasEarnedDuringChallengeMonth(data.dateEarned, challengeDate))
                            .map(([id]) => id);
                        
                        // If no achievements were earned during the challenge month, skip this challenge
                        if (earnedDuringChallenge.length === 0) {
                            continue;
                        }
                        
                        // Check progression and win requirements
                        const progressionAchievements = challenge.monthly_challange_progression_achievements || [];
                        const winAchievements = challenge.monthly_challange_win_achievements || [];
                        
                        const progressionCompletedInChallenge = progressionAchievements.length > 0 && 
                            progressionAchievements.every(id => earnedDuringChallenge.includes(id));
                        
                        const hasWinConditionInChallenge = winAchievements.length === 0 || 
                            winAchievements.some(id => earnedDuringChallenge.includes(id));
                        
                        // Assign points based on completion
                        let monthlyData = updatedMonthlyMap.get(dateStr) || { progress: 0 };
                        let adjustedProgress = monthlyData.progress;
                        
                        // For mastery, ALL achievements must be earned during the challenge
                        if (progress.numAwardedToUser === challenge.monthly_challange_game_total && 
                            earnedDuringChallenge.length === challenge.monthly_challange_game_total) {
                            adjustedProgress = 3; // Mastery
                            masteryCount++;
                            challengePoints += POINTS.MASTERY;
                        } 
                        // For beaten, all progression + at least one win must be earned during challenge
                        else if (progressionCompletedInChallenge && hasWinConditionInChallenge) {
                            adjustedProgress = 2; // Beaten
                            beatenCount++;
                            challengePoints += POINTS.BEATEN;
                        } 
                        // For participation, at least one achievement must be earned during challenge
                        else if (earnedDuringChallenge.length > 0) {
                            adjustedProgress = 1; // Participation
                            participationCount++;
                            challengePoints += POINTS.PARTICIPATION;
                        }
                        
                        // Check if we need to update database
                        if (adjustedProgress !== monthlyData.progress) {
                            updatedMonthlyMap.set(dateStr, { 
                                progress: adjustedProgress,
                                achievements: earnedDuringChallenge.length,
                                totalAchievements: challenge.monthly_challange_game_total,
                                percentage: parseFloat((earnedDuringChallenge.length / challenge.monthly_challange_game_total * 100).toFixed(2))
                            });
                            needDatabaseUpdate = true;
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching monthly game progress for ${user.raUsername}:`, error);
                    // Use existing database entry if available
                    const monthlyData = user.monthlyChallenges.get(dateStr);
                    if (monthlyData) {
                        if (monthlyData.progress === 3) {
                            masteryCount++;
                            challengePoints += POINTS.MASTERY;
                        } else if (monthlyData.progress === 2) {
                            beatenCount++;
                            challengePoints += POINTS.BEATEN;
                        } else if (monthlyData.progress === 1) {
                            participationCount++;
                            challengePoints += POINTS.PARTICIPATION;
                        }
                    }
                }
            }
            
            // Process shadow challenge
            if (challenge.shadow_challange_gameid) {
                try {
                    const shadowProgress = await retroAPI.getUserGameProgress(
                        user.raUsername,
                        challenge.shadow_challange_gameid
                    );
                    
                    if (shadowProgress.numAwardedToUser > 0) {
                        // Get only shadow achievements earned during the challenge month
                        const earnedShadowDuringChallenge = Object.entries(shadowProgress.achievements)
                            .filter(([id, data]) => wasEarnedDuringChallengeMonth(data.dateEarned, challengeDate))
                            .map(([id]) => id);
                        
                        // If no shadow achievements were earned during the challenge month, skip
                        if (earnedShadowDuringChallenge.length === 0) {
                            continue;
                        }
                        
                        // Check progression and win requirements
                        const progressionAchievements = challenge.shadow_challange_progression_achievements || [];
                        const winAchievements = challenge.shadow_challange_win_achievements || [];
                        
                        const progressionCompletedInChallenge = progressionAchievements.length > 0 && 
                            progressionAchievements.every(id => earnedShadowDuringChallenge.includes(id));
                        
                        const hasWinConditionInChallenge = winAchievements.length === 0 || 
                            winAchievements.some(id => earnedShadowDuringChallenge.includes(id));
                        
                        // Assign points based on completion
                        let shadowData = updatedShadowMap.get(dateStr) || { progress: 0 };
                        let adjustedProgress = shadowData.progress;
                        
                        if (progressionCompletedInChallenge && hasWinConditionInChallenge) {
                            adjustedProgress = 2; // Beaten (max for shadow)
                            shadowBeatenCount++;
                            challengePoints += SHADOW_MAX_POINTS;
                        } else if (earnedShadowDuringChallenge.length > 0) {
                            adjustedProgress = 1; // Participation
                            shadowParticipationCount++;
                            challengePoints += POINTS.PARTICIPATION;
                        }
                        
                        // Check if we need to update database
                        if (adjustedProgress !== shadowData.progress) {
                            updatedShadowMap.set(dateStr, { 
                                progress: adjustedProgress,
                                achievements: earnedShadowDuringChallenge.length,
                                totalAchievements: challenge.shadow_challange_game_total,
                                percentage: parseFloat((earnedShadowDuringChallenge.length / challenge.shadow_challange_game_total * 100).toFixed(2))
                            });
                            needDatabaseUpdate = true;
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching shadow game progress for ${user.raUsername}:`, error);
                    // Use existing database entry if available
                    const shadowData = user.shadowChallenges.get(dateStr);
                    if (shadowData) {
                        if (shadowData.progress === 2) {
                            shadowBeatenCount++;
                            challengePoints += SHADOW_MAX_POINTS;
                        } else if (shadowData.progress === 1) {
                            shadowParticipationCount++;
                            challengePoints += POINTS.PARTICIPATION;
                        }
                    }
                }
            }
        }
        
        // Update database if needed
        if (needDatabaseUpdate) {
            user.monthlyChallenges = updatedMonthlyMap;
            user.shadowChallenges = updatedShadowMap;
            await user.save();
        }

        // Get ALL community awards points for the year
        // This includes racing points, arcade points, and other community awards
        const communityPoints = user.getCommunityPointsForYear(selectedYear);

        return {
            username: user.raUsername,
            totalPoints: challengePoints + communityPoints,
            challengePoints,
            communityPoints,
            stats: {
                mastery: masteryCount,
                beaten: beatenCount,
                participation: participationCount,
                shadowBeaten: shadowBeatenCount,
                shadowParticipation: shadowParticipationCount
            }
        };
    },

    createPaginatedEmbeds(userPoints, selectedYear, challengeCount, wasSynced, syncedCount, showDebug, skippedUsers) {
        const embeds = [];

        // Calculate how many pages we need
        const totalPages = Math.ceil(userPoints.length / USERS_PER_PAGE);
        
        for (let page = 0; page < totalPages; page++) {
            // Get users for this page
            const startIndex = page * USERS_PER_PAGE;
            const endIndex = Math.min((page + 1) * USERS_PER_PAGE, userPoints.length);
            const usersOnPage = userPoints.slice(startIndex, endIndex);
            
            // Create embed for this page
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${selectedYear} Yearly Leaderboard`)
                .setColor('#FFD700')
                .setFooter({ text: `Page ${page + 1}/${totalPages} • Use /help points for more information` })
                .setTimestamp();
            
            // Set description for all pages
            let description = `Total Challenges: ${challengeCount}\n**Total Participants:** ${userPoints.length}`;
            
            if (wasSynced) {
                description += `\n🔄 *Fully synced with RetroAchievements API (${syncedCount} users)*`;
            } else {
                description += "\n💾 *Using cached data - use sync:true for live data*";
            }
            
            embed.setDescription(description);
            
            // Add each user as an individual field to avoid character limits
            usersOnPage.forEach((user) => {
                // Use the assigned rank that accounts for ties
                const rankEmoji = user.rank <= 3 ? RANK_EMOJIS[user.rank] : `${user.rank}.`;
                
                // Create more compact formatting to fit within Discord's field limits
                const m = user.stats.mastery;
                const b = user.stats.beaten;
                const p = user.stats.participation;
                const sb = user.stats.shadowBeaten;
                const sp = user.stats.shadowParticipation;
                
                // Create compact content for each user's field
                const userContent = 
                    `**Challenge:** ${user.challengePoints} pts | **Community:** ${user.communityPoints} pts\n` +
                    `Monthly: ${m}✨ ${b}⭐ ${p}🏁 | Shadow: ${sb}⭐ ${sp}🏁`;
                
                // Add field for each user with rank and points in the name
                embed.addFields({ 
                    name: `${rankEmoji} ${user.username} - ${user.totalPoints} pts`, 
                    value: userContent
                });
            });
            
            // Add point system explanation to all pages for reference
            embed.addFields({
                name: 'Point System',
                value: '**Monthly/Shadow:** ✨ Mastery: 7pts | ⭐ Beaten: 4pts | 🏁 Participation: 1pt\n' +
                       '**Community:** Racing & Arcade awards, special community recognition'
            });
            
            // Add debug info if requested (admin only) - only on the last page
            if (showDebug && skippedUsers.length > 0 && page === totalPages - 1) {
                // Truncate to avoid embed limits
                const debugUsers = skippedUsers.slice(0, 3);
                const debugInfo = debugUsers.map(u => `${u.username}: ${u.reason.substring(0, 50)}`).join('\n');
                
                embed.addFields({
                    name: 'Debug Info',
                    value: `${debugInfo}\n...and ${skippedUsers.length - 3} more users skipped`
                });
            }
            
            embeds.push(embed);
        }
        
        return embeds;
    }
};
