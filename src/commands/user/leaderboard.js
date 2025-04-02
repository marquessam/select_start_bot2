import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
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

function isDateInCurrentMonth(dateString) {
    // Parse the input date string
    const inputDate = new Date(dateString.replace(' ', 'T'));
    
    // Get the current date
    const currentDate = new Date();
    
    // Check if the input date's month and year match the current month and year
    return inputDate.getMonth() === currentDate.getMonth() && 
           inputDate.getFullYear() === currentDate.getFullYear();
}

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Display the current challenge leaderboard'),

    async execute(interaction) {
        await interaction.deferReply();

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
                        username: user.raUsername,
                        achieved: progress.numAwardedToUser,
                        percentage: (progress.numAwardedToUser / currentChallenge.monthly_challange_game_total * 100).toFixed(2),
                        award,
                        points,
                        earnedThisMonth: achievementsEarnedThisMonth.length
                    };
                }
                return null;
            }));

            // Filter out null entries and sort by achievements and points
            const sortedProgress = userProgress
                .filter(progress => progress !== null)
                .sort((a, b) => {
                    if (b.points !== a.points) {
                        return b.points - a.points;
                    }
                    return b.achieved - a.achieved;
                });

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
            const description = `**Game:** ${gameInfo.title}\n` +
                                `**Total Achievements:** ${currentChallenge.monthly_challange_game_total}\n` +
                                `**Challenge Ends:** ${endDateFormatted}\n` +
                                `**Time Remaining:** ${timeRemaining}\n\n` +
                                `*Note: Only achievements earned during ${monthName} count toward challenge status.*`;

            embed.setDescription(description);

            if (sortedProgress.length === 0) {
                embed.addFields({
                    name: 'No Participants',
                    value: 'No one has earned achievements in this challenge this month yet!'
                });
            } else {
                let leaderboardText = '';
                let currentRank = 1;
                let currentPoints = -1;
                let currentAchieved = -1;
                let tiedUsers = [];

                sortedProgress.forEach((progress, index) => {
                    // Check if this user is tied with the previous one
                    if (progress.points === currentPoints && progress.achieved === currentAchieved) {
                        tiedUsers.push(progress);
                    } else {
                        // If we had tied users, display them
                        if (tiedUsers.length > 0) {
                            const rankEmoji = currentRank <= 3 ? RANK_EMOJIS[currentRank] : `#${currentRank}`;
                            leaderboardText += `${rankEmoji} ${tiedUsers.map(u => 
                                `**${u.username}** ${u.award}\n` +
                                `${u.achieved}/${currentChallenge.monthly_challange_game_total} (${u.percentage}%) - ${u.earnedThisMonth} this month`
                            ).join('\n')}\n\n`;
                        }

                        // Start new group
                        currentRank = index + 1;
                        currentPoints = progress.points;
                        currentAchieved = progress.achieved;
                        tiedUsers = [progress];
                    }
                });

                // Don't forget to display the last group
                if (tiedUsers.length > 0) {
                    const rankEmoji = currentRank <= 3 ? RANK_EMOJIS[currentRank] : `#${currentRank}`;
                    leaderboardText += `${rankEmoji} ${tiedUsers.map(u => 
                        `**${u.username}** ${u.award}\n` +
                        `${u.achieved}/${currentChallenge.monthly_challange_game_total} (${u.percentage}%) - ${u.earnedThisMonth} this month`
                    ).join('\n')}\n\n`;
                }

                embed.addFields({
                    name: `Rankings 1-${sortedProgress.length}`,
                    value: leaderboardText || 'No rankings available.'
                });
            }

            // Add legend
            embed.addFields({
                name: 'Legend',
                value: `${AWARD_EMOJIS.MASTERY} Mastery (3 points) - All achievements must be earned this month\n` +
                       `${AWARD_EMOJIS.BEATEN} Beaten (3 points) - Must complete all progression requirements this month\n` +
                       `${AWARD_EMOJIS.PARTICIPATION} Participation (1 point) - At least one achievement earned this month`,
                inline: true
            });

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
