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

            // Identify tied users in the top 3 positions
            const tiedGroups = [];
            if (sortedProgress.length > 1) {
                let currentTiedGroup = [sortedProgress[0]];
                let currentRank = 1;

                for (let i = 1; i < sortedProgress.length; i++) {
                    const current = sortedProgress[i];
                    const previous = sortedProgress[i - 1];

                    // Check if tied with previous user
                    if (current.achieved === previous.achieved && current.points === previous.points) {
                        // Add to current tie group
                        currentTiedGroup.push(current);
                    } else {
                        // If we had a tied group and it's in the top 3, add it
                        if (currentTiedGroup.length > 1 && currentRank <= 3) {
                            tiedGroups.push({
                                rank: currentRank,
                                users: [...currentTiedGroup]
                            });
                        }

                        // Start a new tied group at new rank
                        currentRank = i + 1;
                        currentTiedGroup = [current];
                    }

                    // If we're at the end and have a tied group in top 3, add it
                    if (i === sortedProgress.length - 1 && currentTiedGroup.length > 1 && currentRank <= 3) {
                        tiedGroups.push({
                            rank: currentRank,
                            users: [...currentTiedGroup]
                        });
                    }
                }
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
                // Create final leaderboard with tiebreaker-adjusted rankings if necessary
                let leaderboardText = '';
                let displayRank = 1;
                
                for (let i = 0; i < sortedProgress.length; i++) {
                    const progress = sortedProgress[i];
                    
                    // Check if this user is in a tie group that needs tiebreaker resolution
                    let tiebreakerNote = '';
                    let useTiebreakerRank = false;
                    
                    if (tiedGroups.length > 0 && activeTiebreaker) {
                        // Find if this user is in a tied group
                        const tiedGroup = tiedGroups.find(group => 
                            group.users.some(u => u.username === progress.username)
                        );
                        
                        if (tiedGroup) {
                            // Find this user's tiebreaker entry
                            const tiebreakerEntry = tiebreakerEntries.find(
                                entry => entry.username === progress.username.toLowerCase()
                            );
                            
                            if (tiebreakerEntry) {
                                tiebreakerNote = ` ${TIEBREAKER_EMOJI} TB: #${tiebreakerEntry.apiRank}`;
                                useTiebreakerRank = true;
                            } else {
                                tiebreakerNote = ` ${TIEBREAKER_EMOJI} Not in tiebreaker`;
                            }
                        }
                    }
                    
                    // Use regular ranking if not in a tie group or tiebreaker not active
                    const rankEmoji = displayRank <= 3 ? RANK_EMOJIS[displayRank] : `#${displayRank}`;
                    
                    // Add user entry to leaderboard
                    leaderboardText += `${rankEmoji} **${progress.username}** ${progress.award}${tiebreakerNote}\n` +
                                      `${progress.achieved}/${currentChallenge.monthly_challange_game_total} (${progress.percentage}%)\n\n`;
                    
                    // Increment display rank if not tied with next user
                    if (i + 1 < sortedProgress.length) {
                        const next = sortedProgress[i + 1];
                        if (progress.achieved !== next.achieved || progress.points !== next.points) {
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
