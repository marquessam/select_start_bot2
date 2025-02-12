// File: src/commands/points.js
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Award = require('../models/Award');

async function handleAddPoints(message, username, filter, awaitOptions) {
    // Check if it's a placement award
    const args = message.content.split(' ').slice(2); // Remove '!points add username'
    const placement = args.find(arg => ['first', 'second', 'third'].includes(arg.toLowerCase()));
    
    if (placement) {
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
        const points = placement === 'first' ? 5 : placement === 'second' ? 3 : 2;

        // Check for existing placement award
        const existingAward = await Award.findOne({
            raUsername: username.toLowerCase(),
            isManual: true,
            year: new Date().getFullYear(),
            reason: `${placement} place - ${month}`
        });

        if (existingAward) {
            return message.reply(`${username} already has a placement award for ${month}`);
        }

        // Create the award
        const award = new Award({
            raUsername: username.toLowerCase(),
            isManual: true,
            manualPoints: points,
            reason: `${placement} place - ${month}`,
            awardedBy: message.author.tag,
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear()
        });

        await award.save();
        await message.channel.send(`Added ${placement} place award (${points} points) for ${month} to **${username}**!`);
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
            `Username: **${username}**\n` +
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
        raUsername: username.toLowerCase(),
        isManual: true,
        manualPoints: points,
        reason: reason,
        awardedBy: message.author.tag,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
    });

    await award.save();
    await message.channel.send(`Successfully added **${points}** points to **${username}**!`);
}

async function handleRemovePoints(message, username, filter, awaitOptions) {
    const manualAwards = await Award.find({
        raUsername: username.toLowerCase(),
        isManual: true,
        year: new Date().getFullYear()
    }).sort({ createdAt: -1 });
    
    if (!manualAwards || manualAwards.length === 0) {
        await message.channel.send('No manual awards found for this user.');
        return;
    }

    let listText = '';
    manualAwards.forEach((award, index) => {
        listText += `${index + 1}. **${award.manualPoints} points** - ${award.reason}\n`;
    });

    const listEmbed = new EmbedBuilder()
        .setTitle(`Manual Awards for ${username}`)
        .setDescription(
            `${listText}\n\n` +
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
    if (isNaN(index) || index < 0 || index >= manualAwards.length) {
        await message.channel.send('Invalid selection.');
        return;
    }

    const selectedAward = manualAwards[index];

    const confirmEmbed = new EmbedBuilder()
        .setTitle('Confirm Award Removal')
        .setDescription(
            `Are you sure you want to remove this award?\n\n` +
            `Points: **${selectedAward.manualPoints}**\n` +
            `Reason: **${selectedAward.reason}**\n` +
            `Date: ${selectedAward.createdAt.toLocaleDateString()}\n\n` +
            `Type \`confirm\` to proceed or anything else to cancel.`
        )
        .setColor('#ff0000');

    await message.channel.send({ embeds: [confirmEmbed] });

    const confirmation = await message.channel.awaitMessages(awaitOptions);
    if (confirmation.first().content.toLowerCase() !== 'confirm') {
        await message.channel.send('Operation cancelled.');
        return;
    }

    await Award.findByIdAndDelete(selectedAward._id);
    await message.channel.send(
        `Successfully removed the ${selectedAward.manualPoints} point award from **${username}**`
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

        // Check for admin permissions
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            return message.reply('This command can only be used by administrators.');
        }

        const action = args[0].toLowerCase();
        const username = args[1];

        if (!username) {
            return message.reply('Please provide a username.');
        }

        try {
            // Find user (case-insensitive)
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user) {
                return message.reply('User not found. They need to register first!');
            }

            const filter = m => m.author.id === message.author.id;
            const awaitOptions = { filter, max: 1, time: 30000, errors: ['time'] };

            switch (action) {
                case 'add':
                    await handleAddPoints(message, user.raUsername, filter, awaitOptions);
                    break;
                
                case 'remove':
                    await handleRemovePoints(message, user.raUsername, filter, awaitOptions);
                    break;

                default:
                    await message.reply('Invalid action. Use `add` or `remove`.');
            }
        } catch (error) {
            if (error.message === 'CANCELLED') {
                await message.reply('Operation cancelled.');
            } else if (error.message === 'time') {
                await message.reply('Command timed out. Please try again.');
            } else {
                console.error('Error in points command:', error);
                await message.reply('An error occurred while processing the command.');
            }
        }
    }
};
