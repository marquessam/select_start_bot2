// File: src/commands/migrateusers.js
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Award = require('../models/Award');
const PlayerProgress = require('../models/PlayerProgress');

module.exports = {
    name: 'migrateusers',
    description: 'One-time migration to update usernames to canonical form',
    async execute(message, args) {
        // Only allow specific users to run this command
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply('This command can only be used by administrators.');
        }

        const statusMsg = await message.channel.send('Starting username migration...');
        const migrations = [];
        const errors = [];

        try {
            // Get services from client
            const { usernameUtils } = message.client;
            if (!usernameUtils) {
                throw new Error('Required services not available');
            }

            // Get all users
            const users = await User.find({});
            await statusMsg.edit(`Found ${users.length} users to process...`);

            // Process each user
            for (const user of users) {
                try {
                    await statusMsg.edit(`Processing user: ${user.raUsername}...`);
                    
                    // Get canonical username
                    const canonicalUsername = await usernameUtils.getCanonicalUsername(user.raUsername);
                    
                    if (!canonicalUsername) {
                        console.error(`Could not find canonical username for ${user.raUsername}`);
                        errors.push({
                            username: user.raUsername,
                            error: 'Could not find canonical username'
                        });
                        continue;
                    }

                    if (canonicalUsername !== user.raUsername) {
                        // Begin a session for atomic updates
                        const session = await User.db.startSession();
                        await session.withTransaction(async () => {
                            // Update user document
                            user.raUsername = canonicalUsername;
                            user.raUsernameLower = canonicalUsername.toLowerCase();
                            await user.save({ session });

                            // Update related collections
                            await Award.updateMany(
                                { raUsername: user.raUsername.toLowerCase() },
                                { raUsername: canonicalUsername.toLowerCase() },
                                { session }
                            );

                            await PlayerProgress.updateMany(
                                { raUsername: user.raUsername.toLowerCase() },
                                { raUsername: canonicalUsername.toLowerCase() },
                                { session }
                            );

                            migrations.push({
                                oldUsername: user.raUsername,
                                newUsername: canonicalUsername
                            });
                        });
                        session.endSession();
                    } else {
                        // Just add the lowercase field if needed
                        if (!user.raUsernameLower) {
                            user.raUsernameLower = canonicalUsername.toLowerCase();
                            await user.save();
                        }
                    }

                    // Add a small delay to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (error) {
                    console.error(`Error processing user ${user.raUsername}:`, error);
                    errors.push({
                        username: user.raUsername,
                        error: error.message
                    });
                }
            }

            // Create summary embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Username Migration Results')
                .addFields(
                    { 
                        name: 'Summary', 
                        value: `Total users processed: ${users.length}\nSuccessful migrations: ${migrations.length}\nErrors: ${errors.length}` 
                    }
                );

            // Add migrated usernames if any
            if (migrations.length > 0) {
                const migrationsText = migrations
                    .map(m => `${m.oldUsername} → ${m.newUsername}`)
                    .join('\n');
                embed.addFields({ 
                    name: 'Migrated Usernames', 
                    value: migrationsText.slice(0, 1024) // Discord field limit
                });
            }

            // Add errors if any
            if (errors.length > 0) {
                const errorsText = errors
                    .map(e => `${e.username}: ${e.error}`)
                    .join('\n');
                embed.addFields({ 
                    name: 'Errors', 
                    value: errorsText.slice(0, 1024) // Discord field limit
                });
            }

            await statusMsg.delete();
            await message.channel.send({ embeds: [embed] });
            await message.channel.send('Migration completed! You can now remove the migrateusers command from the bot.');

        } catch (error) {
            console.error('Migration failed:', error);
            await statusMsg.edit('Migration failed! Check console for details.');
        }
    }
};
