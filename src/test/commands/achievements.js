import mongoose from 'mongoose';
import { Award, Game } from '../../models/index.js';

/**
 * Test achievement feed
 * @param {string} username - RetroAchievements username
 * @param {number} count - Number of achievements to fetch
 * @returns {Promise<Object>} Formatted achievements data
 */
export async function testAchievements(username, count = 10) {
    try {
        // Connect to MongoDB if not connected
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect('mongodb://localhost:27017/select-start-bot');
        }

        // Get recent awards
        const awards = await Award.find({
            raUsername: username.toLowerCase()
        })
        .sort({ awardedAt: -1 })
        .limit(count);

        // Get games for these awards
        const gameIds = [...new Set(awards.map(a => a.gameId))];
        const games = await Game.find({ gameId: { $in: gameIds } });
        const gameMap = new Map(games.map(g => [g.gameId, g]));

        // Format achievements
        const achievements = awards.map(award => {
            const game = gameMap.get(award.gameId);
            return {
                title: `Achievement ${award.achievementCount}/${award.totalAchievements}`,
                description: `Progress: ${award.userCompletion}`,
                points: Award.calculatePoints(award.award),
                gameTitle: game ? game.title : award.gameId,
                gameId: award.gameId,
                type: game ? game.type : 'OTHER',
                dateEarned: award.awardedAt
            };
        });

        return {
            username,
            achievements,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Error in testAchievements:', error);
        throw error;
    }
}

/**
 * Generate test achievements data
 * @param {string} username - RetroAchievements username
 * @param {number} count - Number of achievements to generate
 * @returns {Object} Test achievements data
 */
export function generateTestAchievements(username, count = 10) {
    const now = new Date();
    const achievements = [];

    for (let i = 0; i < count; i++) {
        const type = i % 3 === 0 ? 'MONTHLY' : 
                    i % 3 === 1 ? 'SHADOW' : 'OTHER';
        
        const date = new Date(now);
        date.setHours(now.getHours() - i);

        achievements.push({
            title: `Test Achievement ${i + 1}`,
            description: `Description for test achievement ${i + 1}`,
            points: Math.floor(Math.random() * 50) + 1,
            gameTitle: type === 'MONTHLY' ? 'Chrono Trigger' :
                      type === 'SHADOW' ? 'Secret of Mana' :
                      'Other Game',
            gameId: `${1000 + i}`,
            type,
            dateEarned: date
        });
    }

    return {
        username,
        achievements,
        timestamp: now
    };
}
