// File: src/utils/initializeUsers.js
const User = require('../models/User');

const validUsers = ["royek"];

async function initializeUsers() {
    try {
        console.log('Starting user initialization...');
        await User.deleteMany({}); // Clear all users
        
        // Just add Royek
        await User.create({
            raUsername: "royek",
            isActive: true
        });
        
        console.log('User initialization complete!');
    } catch (error) {
        console.error('Error initializing users:', error);
        throw error;
    }
}

module.exports = { initializeUsers, validUsers };
