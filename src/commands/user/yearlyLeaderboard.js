import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';

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
const USERS_PER_PAGE = 10;

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

            // Calculate points exactly as the profile.js command does
            const userPoints = [];
            
            for (const user of users) {
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

                const totalPoints = challengePoints + communityPoints;
                
                // Only include users with points
                if (totalPoints > 0) {
                    userPoints.push({
                        username: user.raUsername,
                        totalPoints,
                        challengePoints,
                        communityPoints,
                        stats: {
                            mastery: masteryCount,
                            beaten: beatenCount,
                            participation: participationCount,
                            shadowBeaten: shadowBeatenCount,
                            shadowParticipation: shadowParticipationCount
                        }
                    });
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
            const embeds = this.createPaginatedEmbeds(userPoints, selectedYear, challenges.length);

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

    createPaginatedEmbeds(userPoints, selectedYear, challengeCount) {
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
                embed.setDescription(`Total Challenges: ${challengeCount}`);
            }
            
            // Generate leaderboard text for this page - more compact format
            let leaderboardText = '';
            
            usersOnPage.forEach((user) => {
                // Use the assigned rank that accounts for ties
                const rankEmoji = user.rank <= 3 ? RANK_EMOJIS[user.rank] : `${user.rank}.`;
                
                // Create a compact display of the user's stats
                leaderboardText += 
                    `${rankEmoji} **${user.username}** - ${user.totalPoints} points\n` +
                    `└ Monthly: ${user.challengePoints} | Community: ${user.communityPoints}\n` +
                    `└ ✨ ${user.stats.mastery} Mastery, ⭐ ${user.stats.beaten} Beaten, 🏁 ${user.stats.participation} Participation\n`;
                
                // Only show shadow line if they have shadow achievements
                if (user.stats.shadowBeaten > 0 || user.stats.shadowParticipation > 0) {
                    leaderboardText += `└ Shadow: ⭐ ${user.stats.shadowBeaten} Beaten, 🏁 ${user.stats.shadowParticipation} Participation\n`;
                } else {
                    leaderboardText += `└ Shadow: None\n`;
                }
                
                leaderboardText += '\n';
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
