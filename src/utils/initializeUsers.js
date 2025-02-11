// File: src/utils/initializeUsers.js
const User = require('../models/User');

/**
 * Add a new user to the system
 * @param {string} username - RetroAchievements username
 * @param {UsernameUtils} usernameUtils - Instance of UsernameUtils
 * @returns {Promise<Object>} The created/updated user object
 */
async function addUser(username, usernameUtils) {
    if (!usernameUtils) {
        throw new Error('UsernameUtils is required for adding users');
    }

    try {
        // Get canonical username
        const canonicalUsername = await usernameUtils.getCanonicalUsername(username);
        if (!canonicalUsername) {
            throw new Error(`Could not find canonical username for ${username}`);
        }

        // Check if user already exists (case-insensitive)
        const existingUser = await User.findByUsername(canonicalUsername);

        if (existingUser) {
            // Update to ensure canonical form is correct
            if (existingUser.raUsername !== canonicalUsername) {
                await existingUser.updateCanonicalUsername(canonicalUsername);
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
    if (!usernameUtils) {
        throw new Error('UsernameUtils is required for removing users');
    }

    try {
        const canonicalUsername = await usernameUtils.getCanonicalUsername(username);
        if (!canonicalUsername) return false;

        const user = await User.findByUsername(canonicalUsername);
        if (!user) {
            console.log(`User ${canonicalUsername} not found`);
            return false;
        }

        await user.deactivate();
        console.log(`Deactivated user: ${canonicalUsername}`);
        return true;
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
        return await User.getActiveUsers();
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
            try {
                const canonicalUsername = await usernameUtils.getCanonicalUsername(user.raUsername);
                if (canonicalUsername && canonicalUsername !== user.raUsername) {
                    console.log(`Updating username: ${user.raUsername} -> ${canonicalUsername}`);
                    await user.updateCanonicalUsername(canonicalUsername);
                }
            } catch (error) {
                console.error(`Error updating username for ${user.raUsername}:`, error);
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
    if (!usernameUtils) {
        throw new Error('UsernameUtils is required for reactivating users');
    }

    try {
        const canonicalUsername = await usernameUtils.getCanonicalUsername(username);
        if (!canonicalUsername) return null;

        const user = await User.findByUsername(canonicalUsername);
        if (!user) return null;

        await user.reactivate();
        console.log(`Reactivated user: ${canonicalUsername}`);
        return user;
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
