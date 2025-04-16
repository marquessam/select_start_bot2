import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js'; // Add import for ArcadeBoard
import retroAPI from '../../services/retroAPI.js';

const AWARD_EMOJIS = {
    MASTERY: '✨',
    BEATEN: '⭐',
    PARTICIPATION: '🏁'
};

const RANK_EMOJIS = {
    1: '🥇',
    2: '🥈',
    3: '🥉'
};

const TIEBREAKER_EMOJI = '⚔️'; // Emoji to indicate tiebreaker status

function isDateInCurrentMonth(dateString) {
    // Parse the input date string
    const inputDate = new Date(dateString.replace(' ', 'T'));
    
    // Get the current date
    const currentDate = new Date();
    
    // Get the first day of the current month
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    
    // Get the last day of the previous month
    const lastDayOfPrevMonth = new Date(firstDayOfMonth);
    lastDayOfPrevMonth.setDate(lastDayOfPrevMonth.getDate() - 1);
    
    // Check if the input date is in the current month
    const isCurrentMonth = inputDate.getMonth() === currentDate.getMonth() && 
                           inputDate.getFullYear() === currentDate.getFullYear();
                           
    // Check if the input date is the last day of the previous month
    const isLastDayOfPrevMonth = inputDate.getDate() === lastDayOfPrevMonth.getDate() &&
                                inputDate.getMonth() === lastDayOfPrevMonth.getMonth() &&
                                inputDate.getFullYear() === lastDayOfPrevMonth.getFullYear();
    
    return isCurrentMonth || isLastDayOfPrevMonth;
}

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Display the current challenge leaderboard'),

    async execute(interaction) {
       await interaction.deferReply({ ephemeral: true });

        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            if (!currentChallenge) {
                return interaction.editReply('No active challenge found for the current month.');
            }

            // Get game info
            const gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);

            // Get all registered users
            const users = await User.find({});

            // Get progress for all users
            const userProgress = await Promise.all(users.map(async (user) => {
                const progress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    currentChallenge.monthly_challange_gameid
                );

                // Only include users who have at least started the game
                if (progress.numAwardedToUser > 0) {
                    // Check for achievements earned during the challenge month
                    const userAchievements = progress.achievements || {};
                    
                    // Filter achievements earned during the current month
                    let achievementsEarnedThisMonth = Object.entries(userAchievements)
                        .filter(([id, data]) => {
                            if (!data.dateEarned) return false;
                            const earnedDate = new Date(data.dateEarned);
                            return earnedDate >= currentMonthStart;
                        })
                        .map(([id]) => id);
                    
                    // If no achievements were earned this month, skip this user
                    if (achievementsEarnedThisMonth.length === 0) {
                        return null;
                    }

                    // For mastery, ALL achievements must have been earned this month
                    const allAchievementsEarnedThisMonth = Object.entries(userAchievements)
                        .filter(([id, data]) => data.dateEarned)
                        .every(([id, data]) => {
                            const earnedDate = new Date(data.dateEarned);
                            return earnedDate >= currentMonthStart;
                        });

                    // Get the user's earned achievements from the progress data
                    // IMPORTANT: This is where the time gating happens - we use isDateInCurrentMonth
                    // which also includes the grace period
                    const allEarnedAchievements = Object.entries(progress.achievements)
                        .filter(([id, data]) => data.hasOwnProperty('dateEarned') && isDateInCurrentMonth(data.dateEarned))
                        .map(([id, data]) => id);

                    // Check for progression achievements earned this month
                    const progressionAchievements = currentChallenge.monthly_challange_progression_achievements || [];
                    const earnedProgressionInMonth = progressionAchievements.filter(id => 
                        achievementsEarnedThisMonth.includes(id)
                    );
                    
                    // Check for win achievements earned this month
                    const winAchievements = currentChallenge.monthly_challange_win_achievements || [];
                    const earnedWinInMonth = winAchievements.filter(id => 
                        achievementsEarnedThisMonth.includes(id)
                    );
                    
                    // Count total valid progression achievements (either earned this month or previously)
                    const totalValidProgressionAchievements = progressionAchievements.filter(id => 
                        allEarnedAchievements.includes(id)
                    );
                    
                    // Count total valid win achievements (either earned this month or previously)
                    const totalValidWinAchievements = winAchievements.filter(id => 
                        allEarnedAchievements.includes(id)
                    );

                    let award = '';
                    let points = 0;

                    // Check if user has all achievements in the game
                    const hasAllAchievements = progress.numAwardedToUser === currentChallenge.monthly_challange_game_total;

                    // For mastery, ALL achievements must be earned THIS MONTH
                    if (hasAllAchievements && allAchievementsEarnedThisMonth) {
                        award = AWARD_EMOJIS.MASTERY;
                        points = 7;
                    } 
                    // For beaten status, the user must have all progression achievements AND at least one win achievement (if any required)
                    // AND at least one of those achievements must have been earned this month
                    else if (totalValidProgressionAchievements.length === progressionAchievements.length && 
                             (winAchievements.length === 0 || totalValidWinAchievements.length > 0) &&
                             (earnedProgressionInMonth.length > 0 || earnedWinInMonth.length > 0)) {
                        award = AWARD_EMOJIS.BEATEN;
                        points = 4;
                    }
                    // For participation, at least one achievement must be earned this month
                    else if (achievementsEarnedThisMonth.length > 0) {
                        award = AWARD_EMOJIS.PARTICIPATION;
                        points = 1;
                    }

                    return {
                        user,
                        username: user.raUsername,
                        achieved: allEarnedAchievements.length,
                        percentage: (allEarnedAchievements.length / currentChallenge.monthly_challange_game_total * 100).toFixed(2),
                        award,
                        points,
                        earnedThisMonth: achievementsEarnedThisMonth.length
                    };
                }
                return null;
            }));

            // Filter out null entries and sort by achievements first, then points as tiebreaker
            const sortedProgress = userProgress
                .filter(progress => progress !== null)
                .sort((a, b) => {
                    // Primary sort: Number of achievements (descending)
                    if (b.achieved !== a.achieved) {
                        return b.achieved - a.achieved;
                    }
                    // Secondary sort: Points from awards (descending)
                    return b.points - a.points;
                });

            // Check for an active tiebreaker for the current month
            const monthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
            const activeTiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                monthKey: monthKey,
                startDate: { $lte: now },
                endDate: { $gte: now }
            });

            // Identify tied users in the top 3 positions more effectively
            const tiedGroups = [];
            if (sortedProgress.length > 1) {
                // Create groups of users with identical stats
                const statGroups = {};
                
                // Group users by their achievement count and points
                sortedProgress.forEach((progress, index) => {
                    const statKey = `${progress.achieved}-${progress.points}`;
                    if (!statGroups[statKey]) {
                        statGroups[statKey] = {
                            users: [],
                            rank: index + 1 // The rank of the first user with these stats
                        };
                    }
                    statGroups[statKey].users.push(progress);
                });
                
                // Filter for groups with multiple users and in top 3 positions
                Object.values(statGroups).forEach(group => {
                    if (group.users.length > 1 && group.rank <= 3) {
                        tiedGroups.push({
                            rank: group.rank,
                            users: [...group.users]
                        });
                    }
                });
            }

            // Get tiebreaker data if there are tied groups and an active tiebreaker
            let tiebreakerEntries = [];
            if (tiedGroups.length > 0 && activeTiebreaker) {
                try {
                    // Fetch tiebreaker leaderboard entries
                    const leaderboardData = await retroAPI.getLeaderboardEntriesDirect(activeTiebreaker.leaderboardId);
                    
                    if (leaderboardData) {
                        let rawEntries = [];
                        if (Array.isArray(leaderboardData)) {
                            rawEntries = leaderboardData;
                        } else if (leaderboardData.Results && Array.isArray(leaderboardData.Results)) {
                            rawEntries = leaderboardData.Results;
                        }
                        
                        // Process tiebreaker entries
                        tiebreakerEntries = rawEntries.map(entry => {
                            const user = entry.User || entry.user || '';
                            const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                            const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                            const rank = entry.Rank || entry.rank || 0;
                            
                            return {
                                username: user.trim().toLowerCase(),
                                score: formattedScore,
                                apiRank: parseInt(rank, 10)
                            };
                        });
                    }
                } catch (error) {
                    console.error('Error fetching tiebreaker leaderboard:', error);
                }
            }

            // Now reorder tied users based on tiebreaker results
            if (tiedGroups.length > 0 && tiebreakerEntries.length > 0) {
                // For each tied group, reorder users based on their tiebreaker performance
                tiedGroups.forEach(group => {
                    // Get tiebreaker entries for users in this group
                    const relevantEntries = [];
                    
                    // For each user in tied group, find their tiebreaker entry if any
                    group.users.forEach(user => {
                        const entry = tiebreakerEntries.find(e => e.username === user.username.toLowerCase());
                        if (entry) {
                            relevantEntries.push({
                                user: user,
                                tiebreakerRank: entry.apiRank,
                                score: entry.score
                            });
                        } else {
                            // For users not in tiebreaker, push them to the bottom
                            relevantEntries.push({
                                user: user,
                                tiebreakerRank: 999999, // Very large number to ensure they're at the bottom
                                score: "N/A"
                            });
                        }
                    });
                    
                    // Sort the entries by tiebreaker rank
                    relevantEntries.sort((a, b) => a.tiebreakerRank - b.tiebreakerRank);
                    
                    // Find the indices of these users in the original sortedProgress array
                    const indices = group.users.map(user => 
                        sortedProgress.findIndex(p => p.username === user.username)
                    );
                    
                    // Replace the users in sortedProgress with the reordered users
                    for (let i = 0; i < indices.length; i++) {
                        const targetIndex = indices[i];
                        sortedProgress[targetIndex] = relevantEntries[i].user;
                        
                        // Add tiebreaker info to the user object
                        if (relevantEntries[i].tiebreakerRank === 999999) {
                            sortedProgress[targetIndex].tiebreakerNote = `${TIEBREAKER_EMOJI} Not in tiebreaker`;
                            sortedProgress[targetIndex].tiebreakerRank = null;
                        } else {
                            sortedProgress[targetIndex].tiebreakerNote = `${TIEBREAKER_EMOJI} TB: #${relevantEntries[i].tiebreakerRank}`;
                            sortedProgress[targetIndex].tiebreakerRank = relevantEntries[i].tiebreakerRank;
                        }
                    }
                });
            }

            // NEW: Save the processed results to the database
            const monthKeyForDB = User.formatDateKey(currentChallenge.date);
            try {
                console.log(`Saving processed leaderboard data for ${sortedProgress.length} users to database...`);
                
                // Process each user's data in parallel
                await Promise.all(sortedProgress.map(async (progress) => {
                    try {
                        const { user, achieved, percentage, points } = progress;
                        
                        // Save the PROCESSED data to the database
                        user.monthlyChallenges.set(monthKeyForDB, { 
                            progress: points,
                            achievements: achieved, // This is the time-gated count
                            totalAchievements: currentChallenge.monthly_challange_game_total,
                            percentage: parseFloat(percentage),
                            gameTitle: gameInfo.title,
                            gameIconUrl: gameInfo.imageIcon
                        });
                        
                        await user.save();
                    } catch (userError) {
                        console.error(`Error saving data for user ${progress.username}:`, userError);
                    }
                }));
                
                // Notify the API to refresh its cache
                try {
                    console.log('Notifying API to refresh data...');
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
                console.error('Error saving processed data:', saveError);
                // Continue execution to at least show the leaderboard
            }

            // Get month name for the title
            const monthName = now.toLocaleString('default', { month: 'long' });
            
            // Calculate challenge end date and time remaining
            const challengeEndDate = new Date(nextMonthStart);
            challengeEndDate.setDate(challengeEndDate.getDate() - 1); // Last day of current month
            challengeEndDate.setHours(23, 59, 59);  // Set to 11:59 PM
            
            // Format the end date
            const endDateFormatted = `${monthName} ${challengeEndDate.getDate()}${getDaySuffix(challengeEndDate.getDate())}, ${challengeEndDate.getFullYear()} at 11:59 PM`;
            
            // Calculate time remaining
            const timeRemaining = formatTimeRemaining(challengeEndDate, now);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`${monthName} Challenge Leaderboard`)
                .setColor('#FFD700')
                .setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);

            // Add game details to description
            let description = `**Game:** ${gameInfo.title}\n` +
                            `**Total Achievements:** ${currentChallenge.monthly_challange_game_total}\n` +
                            `**Challenge Ends:** ${endDateFormatted}\n` +
                            `**Time Remaining:** ${timeRemaining}\n\n` +
                            `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`;

            // Add tiebreaker info if active
            if (activeTiebreaker) {
                description += `\n\n${TIEBREAKER_EMOJI} **Active Tiebreaker:** ${activeTiebreaker.gameTitle}\n` +
                              `*Tiebreaker results are used to determine final ranking for tied users in top positions.*`;
            }
            
            description += `\n\n*Note: Only achievements earned during ${monthName} count toward challenge status.*`;
            
            embed.setDescription(description);

            if (sortedProgress.length === 0) {
                embed.addFields({
                    name: 'No Participants',
                    value: 'No one has earned achievements in this challenge this month yet!'
                });
            } else {
                // Create final leaderboard with tiebreaker-adjusted rankings
                let leaderboardText = '';
                let displayRank = 1;
                
                // Keep track of which users are in each tiebreaker group
                const userInTieGroup = new Map();
                tiedGroups.forEach(group => {
                    group.users.forEach(user => {
                        userInTieGroup.set(user.username, group.rank);
                    });
                });
                
                for (let i = 0; i < sortedProgress.length; i++) {
                    const progress = sortedProgress[i];
                    
                    // Determine if this user is in a tie group
                    const inTieGroup = userInTieGroup.has(progress.username);
                    
                    // Set the rank emoji based on display rank
                    const rankEmoji = displayRank <= 3 ? RANK_EMOJIS[displayRank] : `#${displayRank}`;
                    
                    // Add tiebreakerNote if available from earlier processing
                    const tiebreakerNote = progress.tiebreakerNote || '';
                    
                    // Add user entry to leaderboard
                    leaderboardText += `${rankEmoji} **${progress.username}** ${progress.award}${tiebreakerNote}\n` +
                                      `${progress.achieved}/${currentChallenge.monthly_challange_game_total} (${progress.percentage}%)\n\n`;
                    
                    // Increment display rank if not tied with next user
                    // But carefully handle tied groups that have been reordered by tiebreaker
                    if (i + 1 < sortedProgress.length) {
                        const next = sortedProgress[i + 1];
                        
                        // If in a tie group and next user has same achievements/points but different tiebreaker rank,
                        // we still increment the rank
                        const sameStats = progress.achieved === next.achieved && progress.points === next.points;
                        const bothInTieGroup = inTieGroup && userInTieGroup.has(next.username);
                        
                        if (!sameStats || (bothInTieGroup && progress.tiebreakerRank !== next.tiebreakerRank)) {
                            displayRank = i + 2; // Next rank
                        }
                    }
                }
                
                embed.addFields({
                    name: `Rankings (${sortedProgress.length} participants)`,
                    value: leaderboardText || 'No rankings available.'
                });
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error displaying leaderboard:', error);
            return interaction.editReply('An error occurred while fetching the leaderboard. Please try again.');
        }
    }
};

// Helper function to get day suffix (st, nd, rd, th)
function getDaySuffix(day) {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

// Helper function to format time remaining
function formatTimeRemaining(end, now) {
    const diffMs = end - now;
    if (diffMs <= 0) return 'Challenge has ended';
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays === 0) {
        return `${diffHrs} hour${diffHrs !== 1 ? 's' : ''}`;
    } else {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} and ${diffHrs} hour${diffHrs !== 1 ? 's' : ''}`;
    }
}
