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

// Number of users to show per embed - Increased for single page view
const USERS_PER_PAGE = 10;

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
                .setDescription('Sync with RetroAchievements API (admin only, slower but more accurate)')
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

            // If synchronizing, let the user know it might take a while
            if (shouldSync) {
                await interaction.editReply('Syncing with RetroAchievements API. This may take a few minutes...');
            }

            // Calculate points and update database if needed
            const userPoints = [];
            const skippedUsers = []; // For debugging
            
            // If we're only syncing a specific user
            if (shouldSync && targetUser) {
                try {
                    const points = await this.syncAndCalculatePoints(targetUser, challengeMap, selectedYear);
                    if (points.totalPoints > 0) {
                        userPoints.push(points);
                    } else if (showDebug) {
                        skippedUsers.push({ 
                            username: targetUser.raUsername, 
                            reason: `No points: ${JSON.stringify(points)}` 
                        });
                    }
                } catch (error) {
                    console.error(`Error syncing data for user ${targetUser.raUsername}:`, error);
                    // Fallback to database approach
                    const points = await this.calculatePointsFromDatabase(targetUser, challengeMap, selectedYear);
                    if (points.totalPoints > 0) {
                        userPoints.push(points);
                    } else if (showDebug) {
                        skippedUsers.push({ 
                            username: targetUser.raUsername, 
                            reason: `Error syncing, no points in DB: ${error.message}` 
                        });
                    }
                }
                
                // Add all other users using database method
                for (const user of users) {
                    if (user.raUsername !== targetUser.raUsername) {
                        const points = await this.calculatePointsFromDatabase(user, challengeMap, selectedYear);
                        if (points.totalPoints > 0) {
                            userPoints.push(points);
                        } else if (showDebug) {
                            skippedUsers.push({ 
                                username: user.raUsername, 
                                reason: `No points: ${JSON.stringify(points)}` 
                            });
                        }
                    }
                }
            }
            // Regular approach for all users
            else {
                let usersWithPoints = 0;
                for (const user of users) {
                    // Regular database approach for most users
                    if (!shouldSync) {
                        const points = await this.calculatePointsFromDatabase(user, challengeMap, selectedYear);
                        if (points.totalPoints > 0) {
                            userPoints.push(points);
                            usersWithPoints++;
                        } else if (showDebug) {
                            // Check specific data to help debugging
                            const monthlyPoints = this.getYearlyPointsFromMap(user.monthlyChallenges, selectedYear);
                            const shadowPoints = this.getYearlyPointsFromMap(user.shadowChallenges, selectedYear);
                            const communityPoints = user.getCommunityPointsForYear(selectedYear);
                            
                            skippedUsers.push({ 
                                username: user.raUsername, 
                                reason: `No points (monthly: ${monthlyPoints}, shadow: ${shadowPoints}, community: ${communityPoints})` 
                            });
                        }
                        continue;
                    }
                    
                    // For admins using sync option: recalculate directly from RetroAPI similar to profile.js
                    try {
                        const points = await this.syncAndCalculatePoints(user, challengeMap, selectedYear);
                        if (points.totalPoints > 0) {
                            userPoints.push(points);
                            usersWithPoints++;
                        } else if (showDebug) {
                            skippedUsers.push({ 
                                username: user.raUsername, 
                                reason: `No points after sync` 
                            });
                        }
                    } catch (error) {
                        console.error(`Error syncing data for user ${user.raUsername}:`, error);
                        // Fallback to database approach if API sync fails
                        const points = await this.calculatePointsFromDatabase(user, challengeMap, selectedYear);
                        if (points.totalPoints > 0) {
                            userPoints.push(points);
                            usersWithPoints++;
                        } else if (showDebug) {
                            skippedUsers.push({ 
                                username: user.raUsername, 
                                reason: `Error syncing and no points in DB: ${error.message}` 
                            });
                        }
                    }
                }
                console.log(`Found ${usersWithPoints} users with points out of ${users.length} total`);
            }

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
                            stats: points.stats
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
            const embeds = this.createPaginatedEmbeds(userPoints, selectedYear, challenges.length, shouldSync, showDebug, skippedUsers);

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

    // Calculate points using database values but also check actual achievements
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
            
            // First handle the mastery case which is simple
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

        // Process shadow challenges (similar approach)
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

        // Get community awards points
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

    // Calculate points by querying RetroAchievements API (slow but more accurate)
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
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between API calls
            
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
                            updatedMonthlyMap.set(dateStr, { progress: adjustedProgress });
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
                            updatedShadowMap.set(dateStr, { progress: adjustedProgress });
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

        // Get community awards points
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

    createPaginatedEmbeds(userPoints, selectedYear, challengeCount, isSynced, showDebug, skippedUsers) {
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
                .setFooter({ text: `Page ${page + 1}/${totalPages} • Use /help points for more information about the points system` })
                .setTimestamp();
            
            // Set description for all pages
            let description = `Total Challenges: ${challengeCount}`;
            if (isSynced) {
                description += "\n*Synced with RetroAchievements API*";
            }
            embed.setDescription(description);
            
            // Generate leaderboard content
            let leaderboardText = '';
            
            usersOnPage.forEach((user) => {
                // Use the assigned rank that accounts for ties
                const rankEmoji = user.rank <= 3 ? RANK_EMOJIS[user.rank] : `${user.rank}.`;
                
                // Create detailed user entry with consistent formatting
                const m = user.stats.mastery;
                const b = user.stats.beaten;
                const p = user.stats.participation;
                const sb = user.stats.shadowBeaten;
                const sp = user.stats.shadowParticipation;
                
                leaderboardText += 
                    `${rankEmoji} **${user.username}** - ${user.totalPoints} points\n` +
                    `   Challenge: ${user.challengePoints} points | Community: ${user.communityPoints} points\n` +
                    `   Regular: ${m}✨ ${b}⭐ ${p}🏁 | Shadow: ${sb}⭐ ${sp}🏁\n\n`;
            });
            
            embed.addFields({ name: 'Leaderboard', value: leaderboardText || 'No ranked users' });
            
            // Add point system explanation to all pages for reference
            embed.addFields({
                name: 'Point System',
                value: '✨ Mastery: 7pts | ⭐ Beaten: 4pts | 🏁 Participation: 1pt | Shadow max: Beaten (4pts)'
            });
            
            // Add debug info if requested (admin only) - only on the last page
            if (showDebug && skippedUsers.length > 0 && page === totalPages - 1) {
                // Truncate to avoid embed limits
                const debugUsers = skippedUsers.slice(0, 5);
                const debugInfo = debugUsers.map(u => `${u.username}: ${u.reason.substring(0, 50)}`).join('\n');
                
                embed.addFields({
                    name: 'Debug Info',
                    value: `${debugInfo}\n...and ${skippedUsers.length - 5} more users skipped`
                });
            }
            
            embeds.push(embed);
        }
        
        return embeds;
    }
};
