// File: src/utils/initializeUsers.js
const User = require('../models/User');
const { cleanupDatabase } = require('./cleanupDatabase');

const validUsers = [
    "royek",
    "Marquessam",
    "lowaims",
    "xelxlolox",
    "hyperlincs"
];

async function initializeUsers() {
    try {
        console.log('Starting user initialization...');
        
        // Clean up any existing duplicates first
        await cleanupDatabase();
        
        // Create or update users
        const userPromises = validUsers.map(username => {
            return User.findOneAndUpdate(
                { raUsername: { $regex: new RegExp(`^${username}$`, 'i') } },
                { 
                    raUsername: username,  // Keep original case
                    isActive: true 
                },
                { upsert: true }
            );
        });

        await Promise.all(userPromises);
        
        const totalUsers = await User.countDocuments();
        console.log(`Initialized ${totalUsers} users successfully`);
    } catch (error) {
        console.error('Error initializing users:', error);
        throw error;
    }
}

module.exports = { initializeUsers, validUsers };
