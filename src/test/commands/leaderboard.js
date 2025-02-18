import mongoose from 'mongoose';
import { Award, Game } from '../../models/index.js';

/**
 * Test leaderboard display
 * @param {string} type - Type of leaderboard (monthly/yearly)
 * @param {number} month - Month number (1-12)
 * @param {number} year - Year
 * @returns {Promise<Object>} Formatted leaderboard data
 */
export async function testLeaderboard(type, month, year) {
    try {
        // Connect to MongoDB if not connected
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect('mongodb://localhost:27017/select-start-bot');
        }

        let title, rankings, games;

        if (type.toLowerCase() === 'monthly') {
            // Get monthly leaderboard
            title = `Monthly Leaderboard - ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`;
            rankings = await Award.getMonthlyLeaderboard(month, year);
            games = await Game.find({ month, year });
        } else if (type.toLowerCase() === 'yearly') {
            // Get yearly leaderboard
            title = `Yearly Leaderboard - ${year}`;
            rankings = await Award.getYearlyLeaderboard(year);
            games = await Game.find({ year });
        } else {
            throw new Error('Invalid leaderboard type. Must be "monthly" or "yearly".');
        }

        // Get statistics
        const totalGames = games.length;
        const totalParticipants = rankings.length;

        // Format games list
        const currentGames = games.map(game => ({
            type: game.type,
            title: game.title
        }));

        // Add achievement details for top players
        for (let i = 0; i < rankings.length; i++) {
            const player = rankings[i];
            const awards = await Award.find({
                raUsername: player.username.toLowerCase(),
                year,
                ...(type.toLowerCase() === 'monthly' ? { month } : {})
            });

            const breakdown = {
                mastery: awards.filter(a => a.award === 3).length,
                beaten: awards.filter(a => a.award === 2).length,
                participation: awards.filter(a => a.award === 1).length
            };

            player.details = `${breakdown.mastery} 🌟 | ${breakdown.beaten} ⭐ | ${breakdown.participation} ✨`;
        }

        return {
            title,
            currentGames,
            rankings: rankings.slice(0, 10), // Top 10 only
            statistics: {
                totalGames,
                totalParticipants
            },
            timestamp: new Date()
        };
    } catch (error) {
        console.error('Error in testLeaderboard:', error);
        throw error;
    }
}

/**
 * Generate test leaderboard data
 * @param {string} type - Type of leaderboard (monthly/yearly)
 * @param {number} month - Month number (1-12)
 * @param {number} year - Year
 * @returns {Object} Test leaderboard data
 */
export function generateTestLeaderboard(type, month, year) {
    const isMonthly = type.toLowerCase() === 'monthly';
    const title = isMonthly 
        ? `Monthly Leaderboard - ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`
        : `Yearly Leaderboard - ${year}`;

    return {
        title,
        currentGames: [
            { type: 'MONTHLY', title: 'Chrono Trigger' },
            { type: 'SHADOW', title: 'Secret of Mana' }
        ],
        rankings: [
            { username: 'Player1', points: 150, details: '3 🌟 | 5 ⭐ | 8 ✨' },
            { username: 'Player2', points: 120, details: '2 🌟 | 4 ⭐ | 6 ✨' },
            { username: 'Player3', points: 90, details: '1 🌟 | 3 ⭐ | 5 ✨' },
            { username: 'Player4', points: 60, details: '0 🌟 | 2 ⭐ | 4 ✨' },
            { username: 'Player5', points: 30, details: '0 🌟 | 1 ⭐ | 3 ✨' }
        ],
        statistics: {
            totalGames: isMonthly ? 2 : 24,
            totalParticipants: isMonthly ? 15 : 50
        }
    };
}
