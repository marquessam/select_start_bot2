// File: src/utils/initializeUsers.js
const User = require('../models/User');
const { cleanupDatabase } = require('./cleanupDatabase');

// Test group only
const validUsers = [
    "royek",             // Make sure these match exactly the case 
    "Marquessam",        // you want to use for announcements
    "lowaims",
    "xelxlolox",
    "hyperlincs"
];

async function initializeUsers() {
    try {
        console.log('Starting user initialization with test group...');
        
        // First, remove ALL existing users
        await User.deleteMany({});
        console.log('Cleared existing users');
        
        // Create our test users
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
        console.log(`Initialized ${totalUsers} test users successfully`);
    } catch (error) {
        console.error('Error initializing users:', error);
        throw error;
    }
}

module.exports = { initializeUsers, validUsers };
