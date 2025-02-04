// File: src/services/leaderboardService.js
const { Game, Award } = require('../models/Game');
const User = require('../models/User');

class LeaderboardService {
    async getCurrentMonthlyProgress() {
        try {
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            // Get current monthly game
            const monthlyGame = await Game.findOne({
                month: currentMonth,
                year: currentYear,
                type: 'MONTHLY'
            });

            if (!monthlyGame) {
                throw new Error('No monthly game found for current month');
            }

            // Get all user progress for this game
            const awards = await Award.find({
                gameId: monthlyGame.gameId,
                month: currentMonth,
                year: currentYear
            });

            // Format the leaderboard data
            const leaderboard = awards.map(award => ({
                username: award.raUsername,
                achievements: award.achievementCount,
                totalAchievements: monthlyGame.numAchievements,
                percentage: ((award.achievementCount / monthlyGame.numAchievements) * 100).toFixed(2)
            }));

            // Sort by achievement count (highest to lowest)
            leaderboard.sort((a, b) => b.achievements - a.achievements);

            return {
                game: monthlyGame.title,
                leaderboard
            };
        } catch (error) {
            console.error('Error getting monthly leaderboard:', error);
            throw error;
        }
    }

    async getYearlyPoints() {
        try {
            const currentYear = new Date().getFullYear();

            // Get all awards for the current year
            const awards = await Award.find({
                year: currentYear
            });

            // Group awards by user and calculate total points
            const userPoints = {};
            
            for (const award of awards) {
                if (!userPoints[award.raUsername]) {
                    userPoints[award.raUsername] = {
                        username: award.raUsername,
                        totalPoints: 0,
                        monthlyGames: 0,
                        shadowGames: 0
                    };
                }

                // Calculate points based on highest award
                if (award.awards.mastered) {
                    userPoints[award.raUsername].totalPoints += 5;
                } else if (award.awards.beaten) {
                    userPoints[award.raUsername].totalPoints += 3;
                } else if (award.awards.participation) {
                    userPoints[award.raUsername].totalPoints += 1;
                }

                // Track game participation
                const game = await Game.findOne({ gameId: award.gameId });
                if (game.type === 'MONTHLY') {
                    userPoints[award.raUsername].monthlyGames++;
                } else {
                    userPoints[award.raUsername].shadowGames++;
                }
            }

            // Convert to array and sort by total points
            const leaderboard = Object.values(userPoints)
                .sort((a, b) => b.totalPoints - a.totalPoints);

            return leaderboard;
        } catch (error) {
            console.error('Error getting yearly leaderboard:', error);
            throw error;
        }
    }
}

module.exports = new LeaderboardService();
