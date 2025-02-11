// File: src/utils/initializeUsers.js
const User = require('../models/User');

/**
 * Add a new user to the system
 * @param {string} username - RetroAchievements username
 * @param {UsernameUtils} usernameUtils - Instance of UsernameUtils
 * @returns {Promise<Object>} The created/updated user object
 */
async function addUser(username, usernameUtils) {
    try {
        // Get canonical username
        const canonicalUsername = await usernameUtils.getCanonicalUsername(username);
        if (!canonicalUsername) {
            throw new Error(`Could not find canonical username for ${username}`);
        }

        // Check if user already exists (case-insensitive)
        const existingUser = await User.findOne({
            raUsernameLower: canonicalUsername.toLowerCase()
        });

        if (existingUser) {
            // Update the stored username to ensure it's in canonical form
            if (existingUser.raUsername !== canonicalUsername) {
                existingUser.raUsername = canonicalUsername;
                await existingUser.save();
                console.log(`Updated username case for ${canonicalUsername}`);
            }
            return existingUser;
        }

        // Create new user with canonical username
        const newUser = new User({
            raUsername: canonicalUsername,
            isActive: true,
            joinDate: new Date()
        });

        await newUser.save();
        console.log(`Added new user: ${canonicalUsername}`);
        return newUser;
    } catch (error) {
        console.error(`Error adding user ${username}:`, error);
        throw error;
    }
}

/**
 * Remove a user from the system
 * @param {string} username - RetroAchievements username
 * @param {UsernameUtils} usernameUtils - Instance of UsernameUtils
 * @returns {Promise<boolean>} Success status
 */
async function removeUser(username, usernameUtils) {
    try {
        const canonicalUsername = await usernameUtils.getCanonicalUsername(username);
        if (!canonicalUsername) return false;

        const result = await User.findOneAndUpdate(
            { raUsernameLower: canonicalUsername.toLowerCase() },
            { isActive: false }
        );

        if (result) {
            console.log(`Deactivated user: ${canonicalUsername}`);
            return true;
        }
        console.log(`User ${canonicalUsername} not found`);
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
 * Initialize users and ensure canonical usernames
 * @param {UsernameUtils} usernameUtils - Instance of UsernameUtils
 */
async function initializeUsers(usernameUtils) {
    if (!usernameUtils) {
        throw new Error('UsernameUtils is required for user initialization');
    }
    try {
        console.log('Checking existing users...');
        const users = await User.find({});
        console.log(`Found ${users.length} users in database`);
        
        // Update all usernames to canonical form
        for (const user of users) {
            const canonicalUsername = await usernameUtils.getCanonicalUsername(user.raUsername);
            if (canonicalUsername && canonicalUsername !== user.raUsername) {
                console.log(`Updating username: ${user.raUsername} -> ${canonicalUsername}`);
                user.raUsername = canonicalUsername;
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
 * @param {UsernameUtils} usernameUtils - Instance of UsernameUtils
 * @returns {Promise<Object>} The reactivated user object
 */
async function reactivateUser(username, usernameUtils) {
    try {
        const canonicalUsername = await usernameUtils.getCanonicalUsername(username);
        if (!canonicalUsername) return null;

        const user = await User.findOneAndUpdate(
            { raUsernameLower: canonicalUsername.toLowerCase() },
            { isActive: true },
            { new: true }
        );

        if (user) {
            console.log(`Reactivated user: ${canonicalUsername}`);
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
