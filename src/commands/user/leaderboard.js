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

            // Check for an active tiebreaker
            const activeTiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });

            let tiebreakerEntries = [];
            if (activeTiebreaker) {
                // Fetch tiebreaker leaderboard entries
                try {
                    const leaderboardData = await retroAPI.getLeaderboardEntriesDirect(activeTiebreaker.leaderboardId);
                    
                    // Extract and process the entries
                    if (leaderboardData) {
                        let rawEntries = [];
                        if (Array.isArray(leaderboardData)) {
                            rawEntries = leaderboardData;
                        } else if (leaderboardData.Results && Array.isArray(leaderboardData.Results)) {
                            rawEntries = leaderboardData.Results;
                        }
                        
                        // Process entries
                        tiebreakerEntries = rawEntries.map(entry => {
                            const user = entry.User || entry.user || '';
                            const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                            const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                            const rank = entry.Rank || entry.rank || 0;
                            
                            return {
                                username: user.trim().toLowerCase(),
                                score: formattedScore,
                                rank: parseInt(rank, 10)
                            };
                        });
                        
                        // Sort by rank (typically lower is better for time-based leaderboards)
                        tiebreakerEntries.sort((a, b) => a.rank - b.rank);
                    }
                } catch (error) {
                    console.error('Error fetching tiebreaker leaderboard:', error);
                    // Continue without tiebreaker data
                }
            }

            // NEW: Save the processed results to the database
            const monthKey = User.formatDateKey(currentChallenge.date);
            try {
                console.log(`Saving processed leaderboard data for ${sortedProgress.length} users to database...`);
                
                // Process each user's data in parallel
                await Promise.all(sortedProgress.map(async (progress) => {
                    try {
                        const { user, achieved, percentage, points } = progress;
                        
                        // Save the PROCESSED data to the database
                        user.monthlyChallenges.set(monthKey, { 
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
                               `*Tiebreaker results are used to determine final rank for tied users in top positions.*`;
            }
            
            description += `\n\n*Note: Only achievements earned during ${monthName} count toward challenge status.*`;
            
            embed.setDescription(description);

            if (sortedProgress.length === 0) {
                embed.addFields({
                    name: 'No Participants',
                    value: 'No one has earned achievements in this challenge this month yet!'
                });
            } else {
                let leaderboardText = '';
                let currentRank = 1;
                let previousAchieved = -1;
                let previousPoints = -1;
                
                // Group users with the same achievements and points
                const tiedGroups = [];
                let currentTiedGroup = [];
                
                sortedProgress.forEach((progress, index) => {
                    // Check if this user is tied with the previous one
                    if (index > 0 && progress.achieved === previousAchieved && progress.points === previousPoints) {
                        // Add to current tie group
                        currentTiedGroup.push(progress);
                    } else {
                        // If we had a previous tied group, save it
                        if (currentTiedGroup.length > 0) {
                            tiedGroups.push({
                                rank: currentRank,
                                users: [...currentTiedGroup]
                            });
                        }
                        
                        // Start a new tied group with this user
                        currentRank = index + 1;
                        currentTiedGroup = [progress];
                    }
                    
                    previousAchieved = progress.achieved;
                    previousPoints = progress.points;
                    
                    // If this is the last user, add the final tied group
                    if (index === sortedProgress.length - 1 && currentTiedGroup.length > 0) {
                        tiedGroups.push({
                            rank: currentRank,
                            users: [...currentTiedGroup]
                        });
                    }
                });
                
                // Process each tied group
                currentRank = 1;
                for (let i = 0; i < sortedProgress.length; i++) {
                    const progress = sortedProgress[i];
                    
                    // Check if this user is part of a tie in the top 3 positions
                    const inTopThreeTie = currentRank <= 3 && 
                        i + 1 < sortedProgress.length && 
                        progress.achieved === sortedProgress[i + 1].achieved && 
                        progress.points === sortedProgress[i + 1].points;
                    
                    // Check if this user is in a tie carried over from the last user
                    const inCarryoverTie = i > 0 && 
                        progress.achieved === sortedProgress[i - 1].achieved && 
                        progress.points === sortedProgress[i - 1].points;
                    
                    // Only check tiebreaker for users in a tie in top 3 positions
                    let tiebreakerRank = null;
                    let tiebreakerInfo = '';
                    
                    if ((inTopThreeTie || inCarryoverTie) && currentRank <= 3 && activeTiebreaker) {
                        // Find this user in the tiebreaker entries
                        const tiebreakerEntry = tiebreakerEntries.find(
                            entry => entry.username === progress.username.toLowerCase()
                        );
                        
                        if (tiebreakerEntry) {
                            tiebreakerRank = tiebreakerEntry.rank;
                            tiebreakerInfo = ` ${TIEBREAKER_EMOJI} TB Rank: #${tiebreakerRank}`;
                        } else {
                            tiebreakerInfo = ` ${TIEBREAKER_EMOJI} Not participating in tiebreaker`;
                        }
                    }
                    
                    // Display rank based on position
                    const rankEmoji = currentRank <= 3 ? RANK_EMOJIS[currentRank] : `#${currentRank}`;
                    
                    // Create the user entry with tiebreaker info if applicable
                    leaderboardText += `${rankEmoji} **${progress.username}** ${progress.award}${tiebreakerInfo}\n` +
                                     `${progress.achieved}/${currentChallenge.monthly_challange_game_total} (${progress.percentage}%)\n\n`;
                    
                    // Increment rank if not tied with next user
                    if (!inTopThreeTie && !(i + 1 < sortedProgress.length && 
                        progress.achieved === sortedProgress[i + 1].achieved && 
                        progress.points === sortedProgress[i + 1].points)) {
                        currentRank = i + 2;
                    }
                }
                
                embed.addFields({
                    name: `Rankings (${sortedProgress.length} participants)`,
                    value: leaderboardText || 'No rankings available.'
                });
                
                // If there's an active tiebreaker but no one in the monthly challenge is using it
                // add a note about the tiebreaker
                if (activeTiebreaker && !leaderboardText.includes(TIEBREAKER_EMOJI)) {
                    embed.addFields({
                        name: 'Tiebreaker Information',
                        value: `There is an active tiebreaker (${activeTiebreaker.gameTitle}), but no tied users in the top positions are currently participating in it.`
                    });
                }
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
