import { EmbedBuilder } from 'discord.js';
import { Award, Game, User } from '../models/index.js';

class LeaderboardService {
    /**
     * Generate monthly leaderboard
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     * @returns {Promise<EmbedBuilder>} Discord embed with leaderboard
     */
    async generateMonthlyLeaderboard(month, year) {
        try {
            // Get all games for the month
            const games = await Game.find({ month, year });
            const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

            // Get all awards for the month
            const leaderboard = await Award.getMonthlyLeaderboard(month, year);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`📊 Monthly Leaderboard - ${monthName} ${year}`)
                .setDescription('Top players this month:')
                .setTimestamp();

            // Add games section
            const gamesList = games.map(game => 
                `${game.type === 'MONTHLY' ? '🎮' : '👻'} ${game.title}`
            ).join('\n');
            
            embed.addFields({ 
                name: 'Current Games', 
                value: gamesList || 'No games set for this month',
                inline: false 
            });

            // Add leaderboard section
            if (leaderboard.length > 0) {
                const topPlayers = leaderboard
                    .slice(0, 10)
                    .map((entry, index) => {
                        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '▫️';
                        return `${medal} ${entry.username}: ${entry.points} points`;
                    })
                    .join('\n');

                embed.addFields({ 
                    name: 'Rankings', 
                    value: topPlayers,
                    inline: false 
                });
            } else {
                embed.addFields({ 
                    name: 'Rankings', 
                    value: 'No points earned yet this month',
                    inline: false 
                });
            }

            return embed;
        } catch (error) {
            console.error('Error generating monthly leaderboard:', error);
            throw error;
        }
    }

    /**
     * Generate yearly leaderboard
     * @param {number} year - Year
     * @returns {Promise<EmbedBuilder>} Discord embed with leaderboard
     */
    async generateYearlyLeaderboard(year) {
        try {
            // Get yearly leaderboard
            const leaderboard = await Award.getYearlyLeaderboard(year);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#ffd700')
                .setTitle(`🏆 Yearly Leaderboard - ${year}`)
                .setDescription('Top players this year:')
                .setTimestamp();

            // Add statistics section
            const totalGames = await Game.countDocuments({ year });
            const totalParticipants = await User.countDocuments({ 
                isActive: true,
                [`yearlyPoints.${year}`]: { $gt: 0 }
            });

            embed.addFields({ 
                name: 'Statistics', 
                value: `Games: ${totalGames}\nParticipants: ${totalParticipants}`,
                inline: false 
            });

            // Add leaderboard section
            if (leaderboard.length > 0) {
                const topPlayers = leaderboard
                    .slice(0, 10)
                    .map((entry, index) => {
                        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '▫️';
                        return `${medal} ${entry.username}: ${entry.points} points`;
                    })
                    .join('\n');

                embed.addFields({ 
                    name: 'Rankings', 
                    value: topPlayers,
                    inline: false 
                });

                // Add achievement breakdown for top player
                const topPlayer = await User.findByRAUsername(leaderboard[0].username);
                if (topPlayer) {
                    const breakdown = await this.getPlayerAchievementBreakdown(topPlayer.raUsername, year);
                    embed.addFields({ 
                        name: `🏅 ${topPlayer.raUsername}'s Achievements`, 
                        value: breakdown,
                        inline: false 
                    });
                }
            } else {
                embed.addFields({ 
                    name: 'Rankings', 
                    value: 'No points earned yet this year',
                    inline: false 
                });
            }

            return embed;
        } catch (error) {
            console.error('Error generating yearly leaderboard:', error);
            throw error;
        }
    }

    /**
     * Get achievement breakdown for a player
     * @param {string} username - RetroAchievements username
     * @param {number} year - Year
     * @returns {Promise<string>} Formatted achievement breakdown
     */
    async getPlayerAchievementBreakdown(username, year) {
        try {
            const awards = await Award.find({ 
                raUsername: username.toLowerCase(),
                year 
            });

            const breakdown = {
                mastery: 0,
                beaten: 0,
                participation: 0
            };

            awards.forEach(award => {
                switch (award.award) {
                    case 3: breakdown.mastery++; break;
                    case 2: breakdown.beaten++; break;
                    case 1: breakdown.participation++; break;
                }
            });

            return [
                `Mastery: ${breakdown.mastery} 🌟`,
                `Beaten: ${breakdown.beaten} ⭐`,
                `Participation: ${breakdown.participation} ✨`
            ].join('\n');
        } catch (error) {
            console.error('Error getting player breakdown:', error);
            return 'Achievement breakdown unavailable';
        }
    }

    /**
     * Generate user profile embed
     * @param {string} username - RetroAchievements username
     * @returns {Promise<EmbedBuilder>} Discord embed with user profile
     */
    async generateUserProfile(username) {
        try {
            const user = await User.findByRAUsername(username);
            if (!user) throw new Error('User not found');

            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth() + 1;

            // Get current awards
            const currentAwards = await Award.find({
                raUsername: username.toLowerCase(),
                year: currentYear,
                month: currentMonth
            });

            // Get activity metrics
            const activityEmoji = {
                'VERY_ACTIVE': '🌟',
                'ACTIVE': '⭐',
                'INACTIVE': '💤'
            };

            const activityStats = user.achievementStats;
            const daysSinceLastAchievement = activityStats.lastAchievement ? 
                Math.floor((new Date() - activityStats.lastAchievement) / (24 * 60 * 60 * 1000)) : 
                'N/A';

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`👤 ${user.raUsername}'s Profile`)
                .setDescription(`Member since: ${user.joinDate.toLocaleDateString()}`)
                .addFields(
                    { 
                        name: 'Total Points', 
                        value: user.totalPoints.toString(),
                        inline: true 
                    },
                    { 
                        name: 'Yearly Points', 
                        value: user.getYearlyPoints(currentYear).toString(),
                        inline: true 
                    },
                    { 
                        name: 'Monthly Points', 
                        value: user.getMonthlyPoints(currentMonth, currentYear).toString(),
                        inline: true 
                    },
                    {
                        name: 'Community Activity',
                        value: [
                            `Status: ${activityEmoji[user.activityTier]} ${user.activityTier}`,
                            `Recent Achievements: ${activityStats.dailyCount} today, ${activityStats.weeklyCount} this week`,
                            `Last Achievement: ${daysSinceLastAchievement === 'N/A' ? 'Never' : `${daysSinceLastAchievement} days ago`}`,
                            `Arcade Points: ${user.getCurrentArcadePoints()}`,
                            `Nominations Left: ${2 - (user.monthlyNominations.get(`${currentYear}-${currentMonth}`) || 0)}/2`,
                            `Votes Left: ${2 - (user.monthlyVotes.get(`${currentYear}-${currentMonth}`) || 0)}/2`
                        ].join('\n'),
                        inline: false
                    }
                )
                .setImage(`https://retroachievements.org/UserPic/${user.raUsername}.png`)
                .setTimestamp();

            // Add current games progress
            if (currentAwards.length > 0) {
                const progress = currentAwards.map(award => {
                    const game = Game.findOne({ gameId: award.gameId });
                    return `${game ? game.title : 'Unknown Game'}: ${award.userCompletion}`;
                }).join('\n');

                embed.addFields({ 
                    name: 'Current Progress', 
                    value: progress,
                    inline: false 
                });
            }

            // Add achievement breakdown
            const breakdown = await this.getPlayerAchievementBreakdown(username, currentYear);
            embed.addFields({ 
                name: 'Achievement Breakdown', 
                value: breakdown,
                inline: false 
            });

            return embed;
        } catch (error) {
            console.error('Error generating user profile:', error);
            throw error;
        }
    }
}

// Create and export singleton instance
const leaderboardService = new LeaderboardService();
export default leaderboardService;
