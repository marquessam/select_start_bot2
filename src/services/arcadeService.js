import { User } from '../models/index.js';
import retroAPI from './retroAPI.js';

class ArcadeService {
    /**
     * Update arcade points for a specific game's leaderboard
     * @param {string} gameId - RetroAchievements game ID
     * @param {string} gameName - Game name for display
     */
    async updateLeaderboardPoints(gameId, gameName) {
        try {
            // Get all active users
            const users = await User.find({ 
                activityStatus: { $ne: 'INACTIVE' }
            });
            const usernames = users.map(u => u.raUsername.toLowerCase());

            // Get top 100 from leaderboard
            const leaderboard = await retroAPI.getGameRankAndScore(gameId);
            
            // Filter and process community members
            const communityRanks = leaderboard
                .filter(entry => usernames.includes(entry.user.toLowerCase()))
                .map(entry => ({
                    username: entry.user,
                    rank: entry.rank
                }));

            // Update points for each ranked user
            for (const { username, rank } of communityRanks) {
                const user = await User.findByRAUsername(username);
                if (user) {
                    user.addArcadePoints(gameId, gameName, rank);
                    await user.save();
                }
            }

            return communityRanks;
        } catch (error) {
            console.error(`Error updating arcade points for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get community leaderboard for a game
     * @param {string} gameId - RetroAchievements game ID
     * @returns {Promise<Array>} Filtered and formatted leaderboard
     */
    async getCommunityLeaderboard(gameId) {
        try {
            // Get all active users
            const users = await User.find({ 
                activityStatus: { $ne: 'INACTIVE' }
            });
            const usernames = users.map(u => u.raUsername.toLowerCase());

            // Get leaderboard from RA
            const leaderboard = await retroAPI.getGameRankAndScore(gameId);
            
            // Filter and format for community
            return leaderboard
                .filter(entry => usernames.includes(entry.user.toLowerCase()))
                .map(entry => ({
                    username: entry.user,
                    rank: entry.rank,
                    score: entry.score,
                    points: entry.rank <= 3 ? (4 - entry.rank) : 0
                }));
        } catch (error) {
            console.error(`Error getting community leaderboard for game ${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Get all current arcade points for a user
     * @param {string} username - RetroAchievements username
     * @returns {Promise<Array>} Current arcade points with game details
     */
    async getUserArcadePoints(username) {
        try {
            const user = await User.findByRAUsername(username);
            if (!user) {
                throw new Error('User not found');
            }

            // Get current points (this also cleans up expired points)
            const totalPoints = user.getCurrentArcadePoints();
            
            // Format arcade points for display
            const pointsDetails = user.arcadePoints.map(ap => ({
                game: ap.gameName,
                rank: ap.rank,
                points: ap.points,
                expiresAt: ap.expiresAt
            }));

            return {
                totalPoints,
                details: pointsDetails
            };
        } catch (error) {
            console.error(`Error getting arcade points for user ${username}:`, error);
            throw error;
        }
    }

    /**
     * Get arcade leaderboard showing total arcade points for all users
     * @returns {Promise<Array>} Sorted leaderboard of arcade points
     */
    async getArcadeLeaderboard() {
        try {
            const users = await User.find({ 
                activityStatus: { $ne: 'INACTIVE' }
            });

            const leaderboard = users
                .map(user => ({
                    username: user.raUsername,
                    points: user.getCurrentArcadePoints(),
                    gamesRanked: user.arcadePoints.length
                }))
                .filter(entry => entry.points > 0)
                .sort((a, b) => b.points - a.points);

            return leaderboard;
        } catch (error) {
            console.error('Error getting arcade leaderboard:', error);
            throw error;
        }
    }
}

// Create and export singleton instance
const arcadeService = new ArcadeService();
export default arcadeService;
