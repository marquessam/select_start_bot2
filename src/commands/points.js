// File: src/commands/points.js

const { EmbedBuilder } = require('discord.js');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType } = require('../enums/AwardType');

async function listManualAwards(username) {
    const currentYear = new Date().getFullYear();
    const awards = await Award.find({
        raUsername: username,
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
        date: award.awardedAt.toLocaleDateString()
    }));

    const text = awardsList.map(award => 
        `${award.index}. **${award.points} points** - ${award.reason} (${award.date})`
    ).join('\n');

    return { text, awards: awardsList };
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

async function handleAddPoints(message, user, filter, awaitOptions) {
    // Ask for points amount
    await message.channel.send("Please enter the point amount:");
    const pointsResponse = await message.channel.awaitMessages(awaitOptions);
    const points = parseInt(pointsResponse.first().content.trim(), 10);

    if (isNaN(points) || points <= 0) {
        throw new Error('Invalid points amount');
    }

    // Ask for reason
    await message.channel.send("Please enter the reason for these points:");
    const reasonResponse = await message.channel.awaitMessages(awaitOptions);
    const reason = reasonResponse.first().content.trim();

    if (reason.length < 3) {
        throw new Error('Reason too short');
    }

    // Confirm
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

    // Create award
    const award = new Award({
        raUsername: user.raUsername,
        gameId: 'manual',
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        award: AwardType.MANUAL,
        totalAchievements: points,
        reason: reason,
        awardedBy: message.author.tag
    });

    await award.save();

    // Announce if feed service is available
    if (message.client.achievementFeedService) {
        await message.client.achievementFeedService.announcePointsAward(
            user.raUsername,
            points,
            reason
        );
    }

    await message.channel.send(`Successfully added **${points}** points to **${user.raUsername}**!`);
}

async function handleRemovePoints(message, user, filter, awaitOptions) {
    // List current manual awards
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

    // Get user selection
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

    // Confirm deletion
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

    // Remove the award
    await Award.findByIdAndDelete(selectedAward.id);
    await message.channel.send(
        `Successfully removed the ${selectedAward.points} point award from **${user.raUsername}**`
    );
}
