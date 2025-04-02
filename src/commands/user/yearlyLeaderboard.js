import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';

const RANK_EMOJIS = {
    1: '🥇',
    2: '🥈',
    3: '🥉'
};

// Award points constants - using the same hierarchical values from profile.js
const POINTS = {
    MASTERY: 7,         // Profile now uses 7 to represent MASTERY (3+3+1)
    BEATEN: 4,          // Profile now uses 4 to represent BEATEN (3+1)
    PARTICIPATION: 1    // Participation is still 1 point
};

// Shadow games are limited to beaten status maximum - just like in profile.js
const SHADOW_MAX_POINTS = POINTS.BEATEN;  // Shadow can only go up to "Beaten" (4 points)

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
                let shadowBeatenCount = 0;
                let shadowParticipationCount = 0;

                // Process monthly challenges
                for (const [dateStr, data] of user.monthlyChallenges.entries()) {
                    const challengeDate = new Date(dateStr);
                    if (challengeDate.getFullYear() === selectedYear) {
                        // Calculate points based on the hierarchical points system from profile.js
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

                // Process shadow challenges
                // Important: Shadow games are ineligible for mastery
                for (const [dateStr, data] of user.shadowChallenges.entries()) {
                    const challengeDate = new Date(dateStr);
                    if (challengeDate.getFullYear() === selectedYear) {
                        if (data.progress === 2) {
                            // Beaten for shadow (4 points max)
                            shadowBeatenCount++;
                            challengePoints += SHADOW_MAX_POINTS;
                        } else if (data.progress === 1) {
                            // Participation for shadow (1 point)
                            shadowParticipationCount++;
                            challengePoints += POINTS.PARTICIPATION;
                        }
                        // No mastery points for shadow challenges as per profile.js
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
                        participation: participationCount,
                        shadowBeaten: shadowBeatenCount,
                        shadowParticipation: shadowParticipationCount
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
                                `└ Monthly: ${u.challengePoints} | Community: ${u.communityPoints}\n` +
                                `└ ✨ ${u.stats.mastery} Mastery, ⭐ ${u.stats.beaten} Beaten, 🏁 ${u.stats.participation} Participation\n` +
                                `└ Shadow: ⭐ ${u.stats.shadowBeaten} Beaten, 🏁 ${u.stats.shadowParticipation} Participation`
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
                        `└ Monthly: ${u.challengePoints} | Community: ${u.communityPoints}\n` +
                        `└ ✨ ${u.stats.mastery} Mastery, ⭐ ${u.stats.beaten} Beaten, 🏁 ${u.stats.participation} Participation\n` +
                        `└ Shadow: ⭐ ${u.stats.shadowBeaten} Beaten, 🏁 ${u.stats.shadowParticipation} Participation`
                    ).join('\n')}\n\n`;
                }

                embed.addFields({
                    name: 'Rankings',
                    value: leaderboardText || 'No rankings available.'
                });
            }

            // Add point system explanation - updated to match profile.js
            embed.addFields({
                name: 'Point System',
                value: '**Monthly Challenge**\n' +
                       '✨ Mastery: 7 points (all achievements)\n' +
                       '⭐ Beaten: 4 points (progression + win requirements)\n' +
                       '🏁 Participation: 1 point (any achievement)\n\n' +
                       '**Shadow Challenge** (ineligible for mastery)\n' +
                       '⭐ Beaten: 4 points maximum\n' +
                       '🏁 Participation: 1 point\n\n' +
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
