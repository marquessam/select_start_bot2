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
                    let award = '';
                    let points = 0;

                    if (progress.numAwardedToUser === currentChallenge.monthly_challange_game_total) {
                        award = AWARD_EMOJIS.MASTERY;
                        points = 3;
                    } else if (progress.numAwardedToUser >= currentChallenge.monthly_challange_goal) {
                        award = AWARD_EMOJIS.BEATEN;
                        points = 3;
                    } else {
                        award = AWARD_EMOJIS.PARTICIPATION;
                        points = 1;
                    }

                    return {
                        username: user.raUsername,
                        achieved: progress.numAwardedToUser,
                        percentage: (progress.numAwardedToUser / currentChallenge.monthly_challange_game_total * 100).toFixed(2),
                        award,
                        points
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
                                `**Time Remaining:** ${timeRemaining}`;

            embed.setDescription(description);

            if (sortedProgress.length === 0) {
                embed.addFields({
                    name: 'No Participants',
                    value: 'No one has started this challenge yet!'
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
                                `${u.achieved}/${currentChallenge.monthly_challange_game_total} (${u.percentage}%)`
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
                        `${u.achieved}/${currentChallenge.monthly_challange_game_total} (${u.percentage}%)`
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
                value: `${AWARD_EMOJIS.MASTERY} Mastery (3 points)\n` +
                       `${AWARD_EMOJIS.BEATEN} Beaten (3 points)\n` +
                       `${AWARD_EMOJIS.PARTICIPATION} Participation (1 point)`,
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
