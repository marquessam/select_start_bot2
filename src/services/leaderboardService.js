const Game = require('../models/Game');
const Award = require('../models/Award');
const Leaderboard = require('../models/Leaderboard');
const User = require('../models/User');

class LeaderboardService {
  /**
   * Computes the current monthly leaderboard, caches it in the database,
   * and returns the cached data.
   *
   * @returns {Promise<{ game: string, leaderboard: Array }>}
   */
  async updateMonthlyLeaderboardCache() {
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
        // Cache an empty leaderboard if no monthly game is found.
        const emptyCache = { game: 'No Monthly Game', leaderboard: [] };
        await Leaderboard.findOneAndUpdate(
          { type: 'monthly' },
          { data: emptyCache, lastUpdate: new Date() },
          { upsert: true }
        );
        return emptyCache;
      }

      // Get all awards for this monthly game.
      const awards = await Award.find({
        gameId: monthlyGame.gameId,
        month: currentMonth,
        year: currentYear
      });

      // Format the leaderboard data.
      const leaderboard = awards.map(award => {
        const achievementCount = award.achievementCount || 0;
        const totalAchievements = monthlyGame.numAchievements || 0;
        // Prevent division by zero.
        const percentage =
          totalAchievements > 0
            ? ((achievementCount / totalAchievements) * 100).toFixed(2)
            : '0.00';
        return {
          username: award.raUsername,
          achievements: achievementCount,
          totalAchievements: totalAchievements,
          percentage: percentage
        };
      });

      // Sort the leaderboard by achievement count (highest first).
      leaderboard.sort((a, b) => b.achievements - a.achievements);

      const monthlyCache = {
        game: monthlyGame.title,
        leaderboard
      };

      // Update or create the monthly leaderboard cache in the database.
      await Leaderboard.findOneAndUpdate(
        { type: 'monthly' },
        { data: monthlyCache, lastUpdate: new Date() },
        { upsert: true }
      );

      return monthlyCache;
    } catch (error) {
      console.error('Error updating monthly leaderboard cache:', error);
      throw error;
    }
  }

  /**
   * Computes the yearly leaderboard based on total points, caches it in the database,
   * and returns the cached data.
   *
   * Points are determined as follows:
   *  - Mastered: 5 points
   *  - Beaten: 3 points
   *  - Participation: 1 point
   *
   * Additionally, counts of monthly and shadow games are tracked.
   *
   * @returns {Promise<Array>} - Sorted array of user leaderboard entries.
   */
  async updateYearlyLeaderboardCache() {
    try {
      const currentYear = new Date().getFullYear();

      // Get all awards for the current year.
      const awards = await Award.find({ year: currentYear });
      
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

      // Convert the user points object to an array and sort by total points (highest first).
      const yearlyLeaderboard = Object.values(userPoints).sort((a, b) => b.totalPoints - a.totalPoints);

      // Update or create the yearly leaderboard cache in the database.
      await Leaderboard.findOneAndUpdate(
        { type: 'yearly' },
        { data: yearlyLeaderboard, lastUpdate: new Date() },
        { upsert: true }
      );

      return yearlyLeaderboard;
    } catch (error) {
      console.error('Error updating yearly leaderboard cache:', error);
      throw error;
    }
  }

  /**
   * Updates both the monthly and yearly leaderboard caches.
   */
  async updateAllLeaderboards() {
    await Promise.all([
      this.updateMonthlyLeaderboardCache(),
      this.updateYearlyLeaderboardCache()
    ]);
    console.log('Leaderboard caches updated at', new Date());
  }

  /**
   * Retrieves the cached monthly leaderboard data from the database.
   *
   * @returns {Promise<{ game: string, leaderboard: Array } | null>}
   */
  async getMonthlyLeaderboardCache() {
    const cached = await Leaderboard.findOne({ type: 'monthly' });
    if (!cached || !cached.data) {
      return null;
    }
    return cached.data;
  }

  /**
   * Retrieves the cached yearly leaderboard data from the database.
   *
   * @returns {Promise<Array | null>}
   */
  async getYearlyLeaderboardCache() {
    const cached = await Leaderboard.findOne({ type: 'yearly' });
    if (!cached || !cached.data) {
      return null;
    }
    return cached.data;
  }
}

module.exports = new LeaderboardService();
