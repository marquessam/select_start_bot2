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

// Number of users to show per embed (to avoid message size limits)
const USERS_PER_PAGE = 5;

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

            // Sort users by total points and filter out those with 0 points
            const sortedUsers = userPoints
                .filter(user => user.totalPoints > 0)
                .sort((a, b) => b.totalPoints - a.totalPoints);

            if (sortedUsers.length === 0) {
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

            // Create pages of embeds
            const embeds = this.createPaginatedEmbeds(sortedUsers, selectedYear, challenges.length);

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

    createPaginatedEmbeds(sortedUsers, selectedYear, challengeCount) {
        const embeds = [];

        // Calculate how many pages we need
        const totalPages = Math.ceil(sortedUsers.length / USERS_PER_PAGE);
        
        for (let page = 0; page < totalPages; page++) {
            // Get users for this page
            const startIndex = page * USERS_PER_PAGE;
            const endIndex = Math.min((page + 1) * USERS_PER_PAGE, sortedUsers.length);
            const usersOnPage = sortedUsers.slice(startIndex, endIndex);
            
            // Create embed for this page
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${selectedYear} Yearly Leaderboard${totalPages > 1 ? ` (Page ${page + 1}/${totalPages})` : ''}`)
                .setColor('#FFD700')
                .setTimestamp();
            
            // Set description for the first page
            if (page === 0) {
                embed.setDescription(`Total Challenges: ${challengeCount}`);
            }
            
            // Generate leaderboard text for this page
            let leaderboardText = '';
            
            usersOnPage.forEach((user, index) => {
                const rank = startIndex + index + 1;
                const rankEmoji = rank <= 3 ? RANK_EMOJIS[rank] : `${rank}.`;
                
                // Simplify the display for shadow stats if they have none
                const shadowStatsText = (user.stats.shadowBeaten > 0 || user.stats.shadowParticipation > 0) ?
                    `└ Shadow: ⭐ ${user.stats.shadowBeaten} Beaten, 🏁 ${user.stats.shadowParticipation} Participation\n` :
                    `└ Shadow: None\n`;
                
                leaderboardText += 
                    `${rankEmoji} **${user.username}** - ${user.totalPoints} points\n` +
                    `└ Monthly: ${user.challengePoints} | Community: ${user.communityPoints}\n` +
                    `└ ✨ ${user.stats.mastery} Mastery, ⭐ ${user.stats.beaten} Beaten, 🏁 ${user.stats.participation} Participation\n` +
                    shadowStatsText + 
                    '\n';
            });
            
            embed.addFields({ name: 'Rankings', value: leaderboardText });
            
            // Add point system explanation to the last page
            if (page === totalPages - 1) {
                embed.addFields({
                    name: 'Point System',
                    value: '**Monthly Challenge**\n' +
                           '✨ Mastery: 7 points (all achievements)\n' +
                           '⭐ Beaten: 4 points (progression + win requirements)\n' +
                           '🏁 Participation: 1 point (any achievement)\n\n' +
                           '**Shadow Challenge** (ineligible for mastery)\n' +
                           '⭐ Beaten: 4 points maximum\n' +
                           '🏁 Participation: 1 point\n\n' +
                           '🌟 Community awards: Variable points'
                });
            }
            
            embeds.push(embed);
        }
        
        return embeds;
    }
};
