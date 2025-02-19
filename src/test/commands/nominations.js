import mongoose from 'mongoose';
import { User, Game } from '../../models/index.js';

/**
 * Test nominations system
 * @param {number} month - Month number (1-12)
 * @param {number} year - Year
 * @returns {Promise<Object>} Formatted nominations data
 */
export async function testNominations(month, year) {
    try {
        // Connect to MongoDB if not connected
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect('mongodb://localhost:27017/select-start-bot');
        }

        // Get all users with nominations for this month
        const users = await User.find({
            [`monthlyNominations.${year}-${month}`]: { $exists: true }
        });

        // Get nominated games
        const games = await Game.find({
            month,
            year,
            status: { $in: ['PENDING', 'APPROVED', 'REJECTED'] }
        });

        // Format nominations
        const nominations = games.map(game => ({
            gameTitle: game.title,
            platform: game.platform || 'Unknown',
            nominatedBy: game.nominatedBy || 'Unknown',
            votes: game.votes || 0,
            status: game.status || 'PENDING',
            dateNominated: game.createdAt
        }));

        return {
            month,
            year,
            nominations,
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Error in testNominations:', error);
        throw error;
    }
}

/**
 * Generate test nominations data
 * @param {number} month - Month number (1-12)
 * @param {number} year - Year
 * @returns {Object} Test nominations data
 */
export function generateTestNominations(month, year) {
    return {
        month,
        year,
        nominations: [
            {
                gameTitle: 'Super Mario Bros.',
                platform: 'NES',
                nominatedBy: 'Player1',
                votes: 5,
                status: 'APPROVED',
                dateNominated: new Date(year, month - 1, 1)
            },
            {
                gameTitle: 'Sonic the Hedgehog',
                platform: 'Genesis',
                nominatedBy: 'Player2',
                votes: 3,
                status: 'PENDING',
                dateNominated: new Date(year, month - 1, 2)
            },
            {
                gameTitle: 'Crash Bandicoot',
                platform: 'PS1',
                nominatedBy: 'Player3',
                votes: 4,
                status: 'APPROVED',
                dateNominated: new Date(year, month - 1, 3)
            }
        ],
        timestamp: new Date()
    };
}
