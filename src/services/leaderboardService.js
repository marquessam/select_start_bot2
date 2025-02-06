// File: src/services/leaderboardService.js
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');

class LeaderboardService {
  /**
   * Returns the current monthly progress leaderboard.
   * @returns {Promise<{ game: string, leaderboard: Array }>}
   */
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

      // Get all awards for this game
      const awards = await Award.find({
        gameId: monthlyGame.gameId,
        month: currentMonth,
        year: currentYear
      });

      // Format leaderboard data
      const leaderboard = awards.map(award => {
        const achievementCount = award.achievementCount || 0;
        const totalAchievements = monthlyGame.numAchievements || 0;
        // Prevent division by zero.
        const percentage = totalAchievements > 0
          ? ((achievementCount / totalAchievements) * 100).toFixed(2)
          : '0.00';
        return {
          username: award.raUsername,
          achievements: achievementCount,
          totalAchievements: totalAchievements,
          percentage: percentage
        };
      });

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

  /**
   * Returns the yearly leaderboard based on total points.
   * Points are awarded as follows:
   * - Mastered: 5 points
   * - Beaten: 3 points
   * - Participation: 1 point
   *
   * Additionally, game participation is tracked for monthly and shadow games.
   *
   * @returns {Promise<Array>} - Sorted array of user leaderboard entries.
   */
  async getYearlyPoints() {
    try {
      const currentYear = new Date().getFullYear();

      // Get all awards for the current year
      const awards = await Award.find({
        year: currentYear
      });
      
      // Pre-fetch all games for the current year to avoid querying in a loop.
      const gamesForYear = await Game.find({ year: currentYear });
      const gameMap = new Map();
      gamesForYear.forEach(game => {
        gameMap.set(String(game.gameId), game);
      });

      // Group awards by user and calculate total points.
      const userPoints = {};
      
      for (const award of awards) {
        const username = award.raUsername;
        if (!userPoints[username]) {
          userPoints[username] = {
            username: username,
            totalPoints: 0,
            monthlyGames: 0,
            shadowGames: 0
          };
        }

        // Calculate points based on the highest award earned.
        if (award.awards) {
          if (award.awards.mastered) {
            userPoints[username].totalPoints += 5;
          } else if (award.awards.beaten) {
            userPoints[username].totalPoints += 3;
          } else if (award.awards.participation) {
            userPoints[username].totalPoints += 1;
          }
        }

        // Determine game type using the pre-fetched game map.
        const game = gameMap.get(String(award.gameId));
        if (game) {
          if (game.type === 'MONTHLY') {
            userPoints[username].monthlyGames++;
          } else if (game.type === 'SHADOW') {
            userPoints[username].shadowGames++;
          }
        }
      }

      // Convert to an array and sort by total points (highest to lowest)
      const leaderboard = Object.values(userPoints).sort((a, b) => b.totalPoints - a.totalPoints);
      return leaderboard;
    } catch (error) {
      console.error('Error getting yearly leaderboard:', error);
      throw error;
    }
  }
}

module.exports = new LeaderboardService();
