import mongoose from 'mongoose';
import { User } from '../../models/index.js';

/**
 * Test arcade leaderboard for a game
 * @param {string} gameId - RetroAchievements game ID
 * @returns {Promise<Object>} Formatted arcade data
 */
export async function testArcade(gameId) {
    try {
        // Connect to MongoDB if not connected
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect('mongodb://localhost:27017/select-start-bot');
        }

        // Get all users with arcade points
        const users = await User.find({
            'arcadePoints.gameId': gameId
        });

        // Format rankings
        const rankings = users
            .map(user => {
                const arcadeEntry = user.arcadePoints.find(ap => ap.gameId === gameId);
                return {
                    username: user.raUsername,
                    rank: arcadeEntry.rank,
                    score: arcadeEntry.points * 100000, // Mock score based on points
                    points: arcadeEntry.points
                };
            })
            .sort((a, b) => a.rank - b.rank);

        return {
            gameId,
            rankings,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Error in testArcade:', error);
        throw error;
    }
}

/**
 * Generate test arcade data
 * @param {string} gameId - RetroAchievements game ID
 * @returns {Object} Test arcade data
 */
export function generateTestArcade(gameId) {
    return {
        gameId,
        rankings: [
            { username: 'Player1', rank: 1, score: 1000000, points: 3 },
            { username: 'Player2', rank: 2, score: 900000, points: 2 },
            { username: 'Player3', rank: 3, score: 800000, points: 1 },
            { username: 'Player4', rank: 4, score: 700000, points: 0 },
            { username: 'Player5', rank: 5, score: 600000, points: 0 }
        ],
        timestamp: new Date()
    };
}
