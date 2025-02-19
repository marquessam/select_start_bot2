import mongoose from 'mongoose';
import { User, Award } from '../../models/index.js';

/**
 * Test profile display for a user
 * @param {string} username - RetroAchievements username
 * @returns {Promise<Object>} Formatted profile data
 */
export async function testProfile(username) {
    try {
        // Connect to MongoDB if not connected
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect('mongodb://localhost:27017/select-start-bot');
        }

        // Get user from database
        const user = await User.findByRAUsername(username);
        if (!user) {
            throw new Error(`User ${username} not found in database`);
        }

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        // Get current awards
        const currentAwards = await Award.find({
            raUsername: username.toLowerCase(),
            year: currentYear,
            month: currentMonth
        });

        // Get achievement breakdown
        const yearlyAwards = await Award.find({
            raUsername: username.toLowerCase(),
            year: currentYear
        });

        const achievements = {
            mastery: yearlyAwards.filter(a => a.award === 3).length,
            beaten: yearlyAwards.filter(a => a.award === 2).length,
            participation: yearlyAwards.filter(a => a.award === 1).length
        };

        // Format current progress
        const currentProgress = currentAwards.map(award => ({
            title: award.gameId, // In real app this would be game title
            completion: award.userCompletion
        }));

        // Return formatted profile data
        return {
            username: user.raUsername,
            totalPoints: user.totalPoints,
            yearlyPoints: user.getYearlyPoints(currentYear),
            monthlyPoints: user.getMonthlyPoints(currentMonth, currentYear),
            arcadePoints: user.getCurrentArcadePoints(),
            activityStatus: user.activityStatus,
            lastActivity: user.lastActivity,
            joinDate: user.joinDate,
            currentProgress,
            achievements
        };
    } catch (error) {
        console.error('Error in testProfile:', error);
        throw error;
    }
}

/**
 * Generate test profile data
 * @param {string} username - RetroAchievements username
 * @returns {Object} Test profile data
 */
export function generateTestProfile(username) {
    const now = new Date();
    return {
        username,
        totalPoints: 150,
        yearlyPoints: 75,
        monthlyPoints: 25,
        arcadePoints: 6,
        activityStatus: 'ACTIVE',
        lastActivity: now,
        joinDate: new Date(now.getFullYear(), 0, 1), // January 1st of current year
        currentProgress: [
            { title: 'Chrono Trigger', completion: '45.5%' },
            { title: 'Secret of Mana', completion: '22.3%' }
        ],
        achievements: {
            mastery: 2,
            beaten: 5,
            participation: 8
        }
    };
}
