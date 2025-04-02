import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';

const RANK_EMOJIS = {
    1: '🥇',
    2: '🥈',
    3: '🥉'
};

// Award points constants
const POINTS = {
    MASTERY: 3,
    BEATEN: 3,
    PARTICIPATION: 1
};

export default {
    data: new SlashCommandBuilder()
        .setName('yearlyboard')
        .setDescription('Display the yearly leaderboard')
        .addIntegerOption(option =>
            option.setName('year')
                .setDescription('Year to display (defaults to current year)')
                .setMinValue(2000)
                .setMaxValue(2100)),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Get the year from the option, default to current year
            const selectedYear = interaction.options.getInteger('year') || new Date().getFullYear();
            
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

            // Calculate total points for each user
            const userPoints = users.map(user => {
                let challengePoints = 0;
                let participationCount = 0;
                let beatenCount = 0;
                let masteryCount = 0;

                // Calculate points from monthly challenges
                for (const [dateStr, data] of user.monthlyChallenges) {
                    const challengeDate = new Date(dateStr);
                    if (challengeDate.getFullYear() === selectedYear) {
                        // Calculate points based on the highest achievement level
                        if (data.progress === 3) {
                            // Mastery: award full points (mastery + beaten + participation)
                            masteryCount++;
                            challengePoints += POINTS.MASTERY + POINTS.BEATEN + POINTS.PARTICIPATION;
                        } else if (data.progress === 2) {
                            // Beaten: award beaten points + participation
                            beatenCount++;
                            challengePoints += POINTS.BEATEN + POINTS.PARTICIPATION;
                        } else if (data.progress === 1) {
                            // Participation only
                            participationCount++;
                            challengePoints += POINTS.PARTICIPATION;
                        }
                    }
                }

                // Calculate points from shadow challenges
                for (const [dateStr, data] of user.shadowChallenges) {
                    const challengeDate = new Date(dateStr);
                    if (challengeDate.getFullYear() === selectedYear) {
                        // Calculate points based on the highest achievement level
                        if (data.progress === 3) {
                            // Mastery: award full points (mastery + beaten + participation)
                            masteryCount++;
                            challengePoints += POINTS.MASTERY + POINTS.BEATEN + POINTS.PARTICIPATION;
                        } else if (data.progress === 2) {
                            // Beaten: award beaten points + participation
                            beatenCount++;
                            challengePoints += POINTS.BEATEN + POINTS.PARTICIPATION;
                        } else if (data.progress === 1) {
                            // Participation only
                            participationCount++;
                            challengePoints += POINTS.PARTICIPATION;
                        }
                    }
                }

                // Get community awards points
                const communityPoints = user.getCommunityPointsForYear(selectedYear);
                const communityAwards = user.getCommunityAwardsForYear(selectedYear);

                return {
                    username: user.raUsername,
                    totalPoints: challengePoints + communityPoints,
                    challengePoints,
                    communityPoints,
                    communityAwards,
                    stats: {
                        mastery: masteryCount,
                        beaten: beatenCount,
                        participation: participationCount
                    }
                };
            });

            // Sort users by total points
            const sortedUsers = userPoints
                .filter(user => user.totalPoints > 0)
                .sort((a, b) => b.totalPoints - a.totalPoints);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${selectedYear} Yearly Leaderboard`)
                .setDescription(`Total Challenges: ${challenges.length}`)
                .setColor('#FFD700')
                .setTimestamp();

            if (sortedUsers.length === 0) {
                embed.addFields({
                    name: 'No Participants',
                    value: 'No users have earned points this year.'
                });
            } else {
                let leaderboardText = '';
                let currentRank = 1;
                let currentPoints = -1;
                let tiedUsers = [];

                sortedUsers.forEach((user, index) => {
                    // Check if this user is tied with the previous one
                    if (user.totalPoints === currentPoints) {
                        tiedUsers.push(user);
                    } else {
                        // If we had tied users, display them
                        if (tiedUsers.length > 0) {
                            const rankEmoji = currentRank <= 3 ? RANK_EMOJIS[currentRank] : `${currentRank}.`;
                            leaderboardText += `${rankEmoji} ${tiedUsers.map(u => 
                                `**${u.username}** - ${u.totalPoints} points\n` +
                                `└ Challenge: ${u.challengePoints} | Community: ${u.communityPoints}\n` +
                                `└ ✨ ${u.stats.mastery} Mastery, ⭐ ${u.stats.beaten} Beaten, 🏁 ${u.stats.participation} Participation`
                            ).join('\n')}\n\n`;
                        }

                        // Start new group
                        currentRank = index + 1;
                        currentPoints = user.totalPoints;
                        tiedUsers = [user];
                    }
                });

                // Don't forget to display the last group
                if (tiedUsers.length > 0) {
                    const rankEmoji = currentRank <= 3 ? RANK_EMOJIS[currentRank] : `${currentRank}.`;
                    leaderboardText += `${rankEmoji} ${tiedUsers.map(u => 
                        `**${u.username}** - ${u.totalPoints} points\n` +
                        `└ Challenge: ${u.challengePoints} | Community: ${u.communityPoints}\n` +
                        `└ ✨ ${u.stats.mastery} Mastery, ⭐ ${u.stats.beaten} Beaten, 🏁 ${u.stats.participation} Participation`
                    ).join('\n')}\n\n`;
                }

                embed.addFields({
                    name: 'Rankings',
                    value: leaderboardText || 'No rankings available.'
                });
            }

            // Add point system explanation
            embed.addFields({
                name: 'Point System',
                value: '✨ Mastery: 7 points (3+3+1)\n' +
                       '⭐ Beaten: 4 points (3+1)\n' +
                       '🏁 Participation: 1 point\n' +
                       '🌟 Community awards: Variable points',
                inline: true
            });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error displaying yearly leaderboard:', error);
            return interaction.editReply('An error occurred while fetching the yearly leaderboard. Please try again.');
        }
    }
};
