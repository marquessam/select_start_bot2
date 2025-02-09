// File: src/commands/points.js
const { EmbedBuilder } = require('discord.js');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType } = require('../enums/AwardType');
const UsernameUtils = require('../utils/usernameUtils');
const RetroAchievementsAPI = require('../services/retroAchievements');

/**
 * Parse placement award command
 * @param {string} placement - The placement emoji or text
 * @returns {object} Parsed placement info
 */
function parsePlacementAward(placement) {
    const placementMap = {
        '1st': { points: 5, emoji: '🥇', name: 'First Place' },
        '2nd': { points: 3, emoji: '🥈', name: 'Second Place' },
        '3rd': { points: 2, emoji: '🥉', name: 'Third Place' },
        '🥇': { points: 5, emoji: '🥇', name: 'First Place' },
        '🥈': { points: 3, emoji: '🥈', name: 'Second Place' },
        '🥉': { points: 2, emoji: '🥉', name: 'Third Place' },
        'first_place': { points: 5, emoji: '🥇', name: 'First Place' },
        'second_place': { points: 3, emoji: '🥈', name: 'Second Place' },
        'third_place': { points: 2, emoji: '🥉', name: 'Third Place' }
    };

    return placementMap[placement.toLowerCase()] || null;
}

/**
 * List all manual awards for a user
 */
async function listManualAwards(username) {
    const currentYear = new Date().getFullYear();
    const awards = await Award.find({
        raUsername: username.toLowerCase(),
        gameId: 'manual',
        year: currentYear
    }).sort({ lastChecked: -1 });

    if (awards.length === 0) {
        return { text: 'No manual awards found for this user.', awards: [] };
    }

    const awardsList = awards.map((award, index) => ({
        index: index + 1,
        id: award._id,
        points: award.totalAchievements,
        reason: award.reason,
        date: award.awardedAt.toLocaleDateString(),
        metadata: award.metadata
    }));

    const text = awardsList.map(award => {
        if (award.metadata?.type === 'placement') {
            return `${award.index}. ${award.metadata.emoji} ${award.points} points - ${award.metadata.month} ${award.metadata.name}`;
        }
        return `${award.index}. **${award.points} points** - ${award.reason} (${award.date})`;
    }).join('\n');

    return { text, awards: awardsList };
}

/**
 * Handle adding points to a user
 */
async function handleAddPoints(message, user, filter, awaitOptions) {
    // Check if it's a placement award
    const args = message.content.split(' ').slice(2); // Remove '!points add username'
    const placementArg = args.find(arg => 
        arg.includes('place') || ['🥇', '🥈', '🥉'].includes(arg)
    );
    
    if (placementArg) {
        const placement = parsePlacementAward(placementArg);
        if (!placement) {
            return message.reply('Invalid placement. Use 1st/2nd/3rd or 🥇/🥈/🥉');
        }

        // Get month from command
        const monthArg = args.find(arg => {
            const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                          'july', 'august', 'september', 'october', 'november', 'december'];
            return months.includes(arg.toLowerCase());
        });

        if (!monthArg) {
            return message.reply('Please specify the month (e.g., January)');
        }

        const month = monthArg.charAt(0).toUpperCase() + monthArg.slice(1).toLowerCase();

        // Check for duplicate placement award
        const existingAward = await Award.findOne({
            raUsername: user.raUsername.toLowerCase(),
            gameId: 'manual',
            year: new Date().getFullYear(),
            'metadata.type': 'placement',
            'metadata.month': month
        });

        if (existingAward) {
            return message.reply(`${user.raUsername} already has a placement award for ${month}`);
        }

        // Create confirmation embed
        const confirmEmbed = new EmbedBuilder()
            .setTitle('Confirm Placement Award')
            .setDescription(
                `Please verify:\n\n` +
                `Username: **${user.raUsername}**\n` +
                `Award: ${placement.emoji} ${placement.name}\n` +
                `Month: ${month}\n` +
                `Points: **${placement.points}**\n\n` +
                `Type \`confirm\` to proceed or anything else to cancel.`
            )
            .setColor('#0099ff');

        await message.channel.send({ embeds: [confirmEmbed] });
        
        const confirmation = await message.channel.awaitMessages(awaitOptions);
        if (confirmation.first().content.toLowerCase() !== 'confirm') {
            return message.reply('Operation cancelled.');
        }

        const award = new Award({
            raUsername: user.raUsername.toLowerCase(),
            gameId: 'manual',
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
            award: AwardType.MANUAL,
            totalAchievements: placement.points,
            reason: `${placement.emoji} ${placement.name} - ${month}`,
            awardedBy: message.author.tag,
            metadata: {
                type: 'placement',
                placement: placement.name,
                month: month,
                emoji: placement.emoji
            }
        });

        await award.save();

        // Announce if feed service is available
        if (message.client.achievementFeedService) {
            await message.client.achievementFeedService.announcePointsAward(
                user.raUsername,
                placement.points,
                `${placement.emoji} ${placement.name} for ${month}`
            );
        }

        await message.channel.send(
            `Awarded **${placement.points}** points to **${user.raUsername}** for ` +
            `${placement.emoji} ${placement.name} in ${month}!`
        );
        return;
    }

    // Regular point award
    await message.channel.send("Please enter the point amount:");
    const pointsResponse = await message.channel.awaitMessages(awaitOptions);
    const points = parseInt(pointsResponse.first().content.trim(), 10);

    if (isNaN(points) || points <= 0) {
        throw new Error('Invalid points amount');
    }

    await message.channel.send("Please enter the reason for these points:");
    const reasonResponse = await message.channel.awaitMessages(awaitOptions);
    const reason = reasonResponse.first().content.trim();

    if (reason.length < 3) {
        throw new Error('Reason too short');
    }

    const confirmEmbed = new EmbedBuilder()
        .setTitle('Confirm Points Award')
        .setDescription(
            `Please verify:\n\n` +
            `Username: **${user.raUsername}**\n` +
            `Points: **${points}**\n` +
            `Reason: **${reason}**\n\n` +
            `Type \`confirm\` to proceed or anything else to cancel.`
        )
        .setColor('#0099ff');

    await message.channel.send({ embeds: [confirmEmbed] });
    
    const confirmation = await message.channel.awaitMessages(awaitOptions);
    if (confirmation.first().content.toLowerCase() !== 'confirm') {
        throw new Error('CANCELLED');
    }

    const award = new Award({
        raUsername: user.raUsername.toLowerCase(),
        gameId: 'manual',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        award: AwardType.MANUAL,
        totalAchievements: points,
        reason: reason,
        awardedBy: message.author.tag
    });

    await award.save();

    if (message.client.achievementFeedService) {
        await message.client.achievementFeedService.announcePointsAward(
            user.raUsername,
            points,
            reason
        );
    }

    await message.channel.send(`Successfully added **${points}** points to **${user.raUsername}**!`);
}

/**
 * Handle removing points from a user
 */
async function handleRemovePoints(message, user, filter, awaitOptions) {
    const { text, awards } = await listManualAwards(user.raUsername);
    
    if (awards.length === 0) {
        await message.channel.send('No manual awards found for this user.');
        return;
    }

    const listEmbed = new EmbedBuilder()
        .setTitle(`Manual Awards for ${user.raUsername}`)
        .setDescription(
            `${text}\n\n` +
            `Enter the number of the award to remove, or \`cancel\` to exit.`
        )
        .setColor('#ff9900');

    await message.channel.send({ embeds: [listEmbed] });

    const selection = await message.channel.awaitMessages(awaitOptions);
    const content = selection.first().content.toLowerCase();

    if (content === 'cancel') {
        await message.channel.send('Operation cancelled.');
        return;
    }

    const index = parseInt(content, 10) - 1;
    if (isNaN(index) || index < 0 || index >= awards.length) {
        await message.channel.send('Invalid selection.');
        return;
    }

    const selectedAward = awards[index];

    const confirmEmbed = new EmbedBuilder()
        .setTitle('Confirm Award Removal')
        .setDescription(
            `Are you sure you want to remove this award?\n\n` +
            `Points: **${selectedAward.points}**\n` +
            `Reason: **${selectedAward.reason}**\n` +
            `Date: ${selectedAward.date}\n\n` +
            `Type \`confirm\` to proceed or anything else to cancel.`
        )
        .setColor('#ff0000');

    await message.channel.send({ embeds: [confirmEmbed] });

    const confirmation = await message.channel.awaitMessages(awaitOptions);
    if (confirmation.first().content.toLowerCase() !== 'confirm') {
        await message.channel.send('Operation cancelled.');
        return;
    }

    await Award.findByIdAndDelete(selectedAward.id);
    await message.channel.send(
        `Successfully removed the ${selectedAward.points} point award from **${user.raUsername}**`
    );
}

module.exports = {
    name: 'points',
    description: 'Add or remove manual point awards',
    async execute(message, args) {
        if (!args.length) {
            return message.reply(
                'Please specify an action: `!points add <username>` or `!points remove <username>`'
            );
        }

        const action = args[0].toLowerCase();
        const username = args[1];

        if (!username) {
            return message.reply('Please provide a username.');
        }

        const raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );
        const usernameUtils = new UsernameUtils(raAPI);

        // Get canonical username
        const canonicalUsername = await usernameUtils.getCanonicalUsername(username);
        const user = await User.findOne({
            raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
        });

        if (!user) {
            return message.reply(`User "${username}" not found in the database.`);
        }

        const filter = m => m.author.id === message.author.id;
        const awaitOptions = { filter, max: 1, time: 30000, errors: ['time'] };

        try {
            switch (action) {
                case 'add':
                    await handleAddPoints(message, user, filter, awaitOptions);
                    break;
                
                case 'remove':
                    await handleRemovePoints(message, user, filter, awaitOptions);
                    break;

                default:
                    await message.reply('Invalid action. Use `add` or `remove`.');
            }
        } catch (error) {
            if (error.message === 'TIMEOUT') {
                await message.reply('Command timed out. Please try again.');
            } else {
                console.error('Error in points command:', error);
                await message.reply('An error occurred while processing the command.');
            }
        }
    }
};
