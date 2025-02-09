// File: src/utils/initializeUsers.js
const User = require('../models/User');

/**
 * Add a new user to the system
 * @param {string} username - RetroAchievements username
 * @returns {Promise<Object>} The created/updated user object
 */
async function addUser(username) {
    try {
        // Normalize username
        const normalizedUsername = username.toLowerCase();
        
        // Check if user already exists (case-insensitive)
        const existingUser = await User.findOne({
            raUsername: { $regex: new RegExp(`^${normalizedUsername}$`, 'i') }
        });

        if (existingUser) {
            console.log(`User ${username} already exists`);
            return existingUser;
        }

        // Create new user
        const newUser = new User({
            raUsername: normalizedUsername,
            isActive: true,
            joinDate: new Date()
        });

        await newUser.save();
        console.log(`Added new user: ${normalizedUsername}`);
        return newUser;
    } catch (error) {
        console.error(`Error adding user ${username}:`, error);
        throw error;
    }
}

/**
 * Remove a user from the system
 * @param {string} username - RetroAchievements username
 * @returns {Promise<boolean>} Success status
 */
async function removeUser(username) {
    try {
        const normalizedUsername = username.toLowerCase();
        const result = await User.findOneAndUpdate(
            { raUsername: { $regex: new RegExp(`^${normalizedUsername}$`, 'i') } },
            { isActive: false }
        );

        if (result) {
            console.log(`Deactivated user: ${normalizedUsername}`);
            return true;
        }
        console.log(`User ${username} not found`);
        return false;
    } catch (error) {
        console.error(`Error removing user ${username}:`, error);
        throw error;
    }
}

/**
 * Get list of all active users
 * @returns {Promise<Array>} Array of active user objects
 */
async function getActiveUsers() {
    try {
        const users = await User.find({ isActive: true });
        return users;
    } catch (error) {
        console.error('Error getting active users:', error);
        throw error;
    }
}

/**
 * Legacy initialization function - kept for compatibility
 * but no longer maintains a hardcoded list
 */
async function initializeUsers() {
    try {
        console.log('Checking existing users...');
        const users = await User.find({});
        console.log(`Found ${users.length} users in database`);
        
        // Ensure all usernames are normalized
        for (const user of users) {
            const normalizedUsername = user.raUsername.toLowerCase();
            if (user.raUsername !== normalizedUsername) {
                console.log(`Normalizing username: ${user.raUsername} -> ${normalizedUsername}`);
                user.raUsername = normalizedUsername;
                await user.save();
            }
        }
        
        console.log('User initialization completed');
    } catch (error) {
        console.error('Error initializing users:', error);
        throw error;
    }
}

/**
 * Reactivate a previously deactivated user
 * @param {string} username - RetroAchievements username
 * @returns {Promise<Object>} The reactivated user object
 */
async function reactivateUser(username) {
    try {
        const normalizedUsername = username.toLowerCase();
        const user = await User.findOneAndUpdate(
            { raUsername: { $regex: new RegExp(`^${normalizedUsername}$`, 'i') } },
            { isActive: true },
            { new: true }
        );

        if (user) {
            console.log(`Reactivated user: ${normalizedUsername}`);
            return user;
        }
        return null;
    } catch (error) {
        console.error(`Error reactivating user ${username}:`, error);
        throw error;
    }
}

module.exports = {
    initializeUsers,
    addUser,
    removeUser,
    getActiveUsers,
    reactivateUser
};
