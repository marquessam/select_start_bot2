import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
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

// Number of users to show per embed
const USERS_PER_PAGE = 15;

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
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Get the year from the option, default to current year
            const selectedYear = interaction.options.getInteger('year') || new Date().getFullYear();
            
            // Check if sync option is enabled - admin only
            const syncOption = interaction.options.getBoolean('sync') || false;
            const isAdmin = interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID);
            const shouldSync = syncOption && isAdmin;
            
            if (syncOption && !isAdmin) {
                await interaction.editReply('Only admins can use the sync option.');
                return;
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
            
            for (const user of users) {
                // Regular database approach for most users
                if (!shouldSync) {
                    const points = this.calculatePointsFromDatabase(user, selectedYear);
                    if (points.totalPoints > 0) {
                        userPoints.push(points);
                    }
                    continue;
                }
                
                // For admins using sync option: recalculate directly from RetroAPI similar to profile.js
                try {
                    const points = await this.syncAndCalculatePoints(user, challengeMap, selectedYear);
                    if (points.totalPoints > 0) {
                        userPoints.push(points);
                    }
                } catch (error) {
                    console.error(`Error syncing data for user ${user.raUsername}:`, error);
                    // Fallback to database approach if API sync fails
                    const points = this.calculatePointsFromDatabase(user, selectedYear);
                    if (points.totalPoints > 0) {
                        userPoints.push(points);
                    }
                }
            }

            // Sort users by total points (descending)
            userPoints.sort((a, b) => b.totalPoints - a.totalPoints);

            if (userPoints.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle(`🏆 ${selectedYear} Yearly Leaderboard`)
                    .setDescription(`Total Challenges: ${challenges.length}`)
                    .setColor('#FFD700')
                    .addFields({
                        name: 'No Participants',
                        value: 'No users have earned points this year.'
                    })
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

            // Create pages of embeds with proper tie handling
            const embeds = this.createPaginatedEmbeds(userPoints, selectedYear, challenges.length, shouldSync);

            // Send the first embed as a reply to the command
            await interaction.editReply({ embeds: [embeds[0]] });
            
            // Send any remaining embeds as follow-up messages
            for (let i = 1; i < embeds.length; i++) {
                await interaction.followUp({ embeds: [embeds[i]] });
            }

        } catch (error) {
            console.error('Error displaying yearly leaderboard:', error);
            return interaction.editReply('An error occurred while fetching the yearly leaderboard. Please try again.');
        }
    },

    // Calculate points using only the database values (fast but might be outdated)
    calculatePointsFromDatabase(user, selectedYear) {
        let challengePoints = 0;
        let masteryCount = 0;
        let beatenCount = 0;
        let participationCount = 0;
        let shadowBeatenCount = 0;
        let shadowParticipationCount = 0;

        // Process monthly challenges
        for (const [dateStr, data] of user.monthlyChallenges.entries()) {
            const challengeDate = new Date(dateStr);
            if (challengeDate.getFullYear() === selectedYear) {
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
        }

        // Process shadow challenges (capped at Beaten status)
        for (const [dateStr, data] of user.shadowChallenges.entries()) {
            const challengeDate = new Date(dateStr);
            if (challengeDate.getFullYear() === selectedYear) {
                if (data.progress === 2) {
                    // Beaten for shadow (4 points)
                    shadowBeatenCount++;
                    challengePoints += SHADOW_MAX_POINTS;
                } else if (data.progress === 1) {
                    // Participation for shadow (1 point)
                    shadowParticipationCount++;
                    challengePoints += POINTS.PARTICIPATION;
                }
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
            
            // Process monthly challenge
            if (challenge.monthly_challange_gameid) {
                try {
                    const progress = await retroAPI.getUserGameProgress(
                        user.raUsername,
                        challenge.monthly_challange_gameid
                    );
                    
                    if (progress.numAwardedToUser > 0) {
                        // Get earned achievements (all-time)
                        const earnedAchievements = Object.entries(progress.achievements)
                            .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
                            .map(([id]) => id);
                            
                        // Check progression and win requirements
                        const progressionAchievements = challenge.monthly_challange_progression_achievements || [];
                        const winAchievements = challenge.monthly_challange_win_achievements || [];
                        
                        const allProgressionCompleted = progressionAchievements.length > 0 && 
                            progressionAchievements.every(id => earnedAchievements.includes(id));
                        
                        const hasWinCondition = winAchievements.length === 0 || 
                            winAchievements.some(id => earnedAchievements.includes(id));
                        
                        // Assign points based on completion
                        let monthlyData = updatedMonthlyMap.get(dateStr) || { progress: 0 };
                        let adjustedProgress = monthlyData.progress;
                        
                        if (progress.numAwardedToUser === challenge.monthly_challange_game_total) {
                            adjustedProgress = 3; // Mastery
                            masteryCount++;
                            challengePoints += POINTS.MASTERY;
                        } else if (allProgressionCompleted && hasWinCondition) {
                            adjustedProgress = 2; // Beaten
                            beatenCount++;
                            challengePoints += POINTS.BEATEN;
                        } else {
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
                        // Get earned achievements (all-time)
                        const earnedAchievements = Object.entries(shadowProgress.achievements)
                            .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
                            .map(([id]) => id);
                            
                        // Check progression and win requirements
                        const progressionAchievements = challenge.shadow_challange_progression_achievements || [];
                        const winAchievements = challenge.shadow_challange_win_achievements || [];
                        
                        const allProgressionCompleted = progressionAchievements.length > 0 && 
                            progressionAchievements.every(id => earnedAchievements.includes(id));
                        
                        const hasWinCondition = winAchievements.length === 0 || 
                            winAchievements.some(id => earnedAchievements.includes(id));
                        
                        // Assign points based on completion
                        let shadowData = updatedShadowMap.get(dateStr) || { progress: 0 };
                        let adjustedProgress = shadowData.progress;
                        
                        if (allProgressionCompleted && hasWinCondition) {
                            adjustedProgress = 2; // Beaten (max for shadow)
                            shadowBeatenCount++;
                            challengePoints += SHADOW_MAX_POINTS;
                        } else if (shadowProgress.numAwardedToUser > 0) {
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

    createPaginatedEmbeds(userPoints, selectedYear, challengeCount, isSynced) {
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
                .setTitle(`🏆 ${selectedYear} Yearly Leaderboard${totalPages > 1 ? ` (Page ${page + 1}/${totalPages})` : ''}`)
                .setColor('#FFD700')
                .setTimestamp();
            
            // Set description for the first page
            if (page === 0) {
                let description = `Total Challenges: ${challengeCount}`;
                if (isSynced) {
                    description += "\n*Synced with RetroAchievements API*";
                }
                embed.setDescription(description);
            }
            
            // Generate leaderboard text for this page - super compact format
            let leaderboardText = '';
            
            usersOnPage.forEach((user) => {
                // Use the assigned rank that accounts for ties
                const rankEmoji = user.rank <= 3 ? RANK_EMOJIS[user.rank] : `${user.rank}.`;
                
                // Create an ultra-compact display using one line per user
                const monthlyStats = `✨${user.stats.mastery} ⭐${user.stats.beaten} 🏁${user.stats.participation}`;
                
                // Generate shadow stats only if they have any
                let shadowStats = "None";
                if (user.stats.shadowBeaten > 0 || user.stats.shadowParticipation > 0) {
                    shadowStats = `⭐${user.stats.shadowBeaten} 🏁${user.stats.shadowParticipation}`;
                }
                
                leaderboardText += 
                    `${rankEmoji} **${user.username}** - ${user.totalPoints} pts\n` +
                    `└ Monthly: ${user.challengePoints} | Community: ${user.communityPoints} | M: ${monthlyStats} | S: ${shadowStats}\n\n`;
            });
            
            embed.addFields({ name: 'Rankings', value: leaderboardText });
            
            // Add point system explanation to the last page
            if (page === totalPages - 1) {
                embed.addFields({
                    name: 'Point System',
                    value: '✨ Mastery: 7pts | ⭐ Beaten: 4pts | 🏁 Participation: 1pt | Shadow games ineligible for mastery'
                });
            }
            
            embeds.push(embed);
        }
        
        return embeds;
    }
};
