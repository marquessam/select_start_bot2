// File: src/utils/cleanupDatabase.js
const User = require('../models/User');
const Award = require('../models/Award');

async function cleanupDatabase() {
    try {
        console.log('Starting database cleanup...');

        // Get all users
        const allUsers = await User.find({});
        const usersByLowerCase = {};

        // Group users by lowercase username
        allUsers.forEach(user => {
            const lowerUsername = user.raUsername.toLowerCase();
            if (!usersByLowerCase[lowerUsername]) {
                usersByLowerCase[lowerUsername] = [];
            }
            usersByLowerCase[lowerUsername].push(user);
        });

        // Process each group of users
        for (const [lowerUsername, users] of Object.entries(usersByLowerCase)) {
            if (users.length > 1) {
                console.log(`Found duplicate users for ${lowerUsername}:`, users.map(u => u.raUsername));
                
                // Keep the first user and merge awards from others
                const primaryUser = users[0];
                const duplicateUsers = users.slice(1);

                // Get all awards for duplicate users
                for (const dupUser of duplicateUsers) {
                    const dupAwards = await Award.find({ raUsername: dupUser.raUsername });
                    
                    // Update each award to use the primary username
                    for (const award of dupAwards) {
                        await Award.findOneAndUpdate(
                            {
                                gameId: award.gameId,
                                month: award.month,
                                year: award.year,
                                raUsername: primaryUser.raUsername
                            },
                            {
                                $set: {
                                    achievementCount: award.achievementCount,
                                    totalAchievements: award.totalAchievements,
                                    userCompletion: award.userCompletion,
                                    awards: award.awards,
                                    lastUpdated: award.lastUpdated
                                }
                            },
                            { upsert: true }
                        );

                        // Delete the duplicate award
                        await Award.findByIdAndDelete(award._id);
                    }

                    // Delete the duplicate user
                    await User.findByIdAndDelete(dupUser._id);
                    console.log(`Deleted duplicate user: ${dupUser.raUsername}`);
                }
            }
        }

        console.log('Database cleanup completed successfully');
    } catch (error) {
        console.error('Error during database cleanup:', error);
        throw error;
    }
}

module.exports = { cleanupDatabase };
