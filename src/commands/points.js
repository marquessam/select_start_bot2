// File: src/commands/points.js

const { EmbedBuilder } = require('discord.js');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType } = require('../enums/AwardType');

module.exports = {
    name: 'points',
    description: 'Manually add points to a user\'s profile',
    async execute(message, args) {
        // Check if user has permission to award points
        // You might want to add proper permission checking here
        
        const sendMessage = async (content, options = {}) => {
            if (message.channel && message.channel.send) {
                return await message.channel.send(content, options);
            }
            if (message.reply) {
                return await message.reply(content, options);
            }
            throw new Error('No valid channel or reply method available');
        };

        // Only allow the command invoker to answer prompts
        const filter = (m) => m.author.id === message.author.id;
        const awaitOptions = { filter, max: 1, time: 30000, errors: ['time'] };

        try {
            // Step 1: Ask for the RA username
            await sendMessage("Please enter the RetroAchievements username:");
            const usernameCollected = await message.channel.awaitMessages(awaitOptions);
            const username = usernameCollected.first().content.trim();

            // Verify user exists in the database
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user) {
                return sendMessage(`Error: User "${username}" not found in the database. They must be registered first.`);
            }

            // Step 2: Ask for the point amount
            await sendMessage("Please enter the point amount (positive number):");
            const pointsCollected = await message.channel.awaitMessages(awaitOptions);
            const pointAmount = parseInt(pointsCollected.first().content.trim(), 10);

            if (isNaN(pointAmount) || pointAmount <= 0) {
                return sendMessage("Error: Please provide a valid positive number for points.");
            }

            // Step 3: Ask for the reason
            await sendMessage("Please enter the reason for awarding these points (e.g., 'Community Event Winner'):");
            const reasonCollected = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 60000,
                errors: ['time']
            });
            const reason = reasonCollected.first().content.trim();

            if (reason.length < 3) {
                return sendMessage("Error: Please provide a more detailed reason (at least 3 characters).");
            }

            // Step 4: Show confirmation
            const confirmEmbed = new EmbedBuilder()
                .setTitle("Confirm Points Award")
                .setDescription(
                    `Please verify the following details:\n\n` +
                    `Username: **${user.raUsername}**\n` +
                    `Points: **${pointAmount}**\n` +
                    `Reason: **${reason}**\n\n` +
                    `Type \`confirm\` to proceed or anything else to cancel.`
                )
                .setColor('#0099ff')
                .setTimestamp();

            await sendMessage({ embeds: [confirmEmbed] });

            const confirmCollected = await message.channel.awaitMessages(awaitOptions);
            if (confirmCollected.first().content.toLowerCase() !== 'confirm') {
                return sendMessage("Points award cancelled.");
            }

            // Step 5: Create the award
            const now = new Date();
            const newAward = new Award({
                raUsername: user.raUsername,
                gameId: 'manual',
                month: now.getMonth() + 1,
                year: now.getFullYear(),
                award: AwardType.NONE,
                achievementCount: 0,
                totalAchievements: pointAmount, // Store points here
                reason: reason, // Store the reason
                userCompletion: "0.00%",
                lastChecked: now
            });

            await newAward.save();

            // Step 6: Announce the points if achievement feed service is available
            if (message.client.achievementFeedService) {
                await message.client.achievementFeedService.announcePointsAward(
                    user.raUsername,
                    pointAmount,
                    reason
                );
            }

            // Final confirmation message
            const successEmbed = new EmbedBuilder()
                .setTitle("Points Awarded Successfully")
                .setDescription(
                    `Added **${pointAmount}** point${pointAmount !== 1 ? 's' : ''} to **${user.raUsername}**\n` +
                    `Reason: ${reason}`
                )
                .setColor('#00ff00')
                .setTimestamp();

            await sendMessage({ embeds: [successEmbed] });

        } catch (error) {
            if (error.name === 'CollectorError' || error.code === 'INTERACTION_COLLECTOR_ERROR') {
                await sendMessage("Command timed out. Please try again.");
            } else {
                console.error("Error in points command:", error);
                await sendMessage("An error occurred while processing the command. Please try again.");
            }
        }
    }
};
