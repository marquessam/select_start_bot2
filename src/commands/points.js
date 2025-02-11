// File: src/commands/points.js
const { EmbedBuilder } = require('discord.js');
const { AwardType } = require('../enums/AwardType');

/**
 * Handle adding points to a user
 */
async function handleAddPoints(message, canonicalUsername, filter, awaitOptions, awardService) {
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

        try {
            await awardService.addPlacementAward(canonicalUsername, placement, month);
            await message.channel.send(
                `Added ${placement} place award for ${month} to **${canonicalUsername}**!`
            );
        } catch (error) {
            if (error.message === 'Duplicate placement') {
                await message.reply(`${canonicalUsername} already has a placement award for ${month}`);
            } else {
                throw error;
            }
        }
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
            `Username: **${canonicalUsername}**\n` +
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

    await awardService.addManualAward(
        canonicalUsername,
        points,
        reason,
        message.author.tag
    );

    await message.channel.send(`Successfully added **${points}** points to **${canonicalUsername}**!`);
}

/**
 * Handle removing points from a user
 */
async function handleRemovePoints(message, canonicalUsername, filter, awaitOptions, awardService) {
    const manualAwards = await awardService.getManualAwards(canonicalUsername);
    
    if (!manualAwards || manualAwards.length === 0) {
        await message.channel.send('No manual awards found for this user.');
        return;
    }

    let listText = '';
    manualAwards.forEach((award, index) => {
        if (award.metadata?.type === 'placement') {
            listText += `${index + 1}. ${award.metadata.emoji} ${award.points} points - ${award.metadata.month} ${award.metadata.name}\n`;
        } else {
            listText += `${index + 1}. **${award.totalAchievements} points** - ${award.reason}\n`;
        }
    });

    const listEmbed = new EmbedBuilder()
        .setTitle(`Manual Awards for ${canonicalUsername}`)
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
            `Points: **${selectedAward.totalAchievements}**\n` +
            `Reason: **${selectedAward.reason}**\n` +
            `Date: ${selectedAward.awardedAt.toLocaleDateString()}\n\n` +
            `Type \`confirm\` to proceed or anything else to cancel.`
        )
        .setColor('#ff0000');

    await message.channel.send({ embeds: [confirmEmbed] });

    const confirmation = await message.channel.awaitMessages(awaitOptions);
    if (confirmation.first().content.toLowerCase() !== 'confirm') {
        await message.channel.send('Operation cancelled.');
        return;
    }

    await awardService.removeManualAward(selectedAward._id);
    await message.channel.send(
        `Successfully removed the ${selectedAward.totalAchievements} point award from **${canonicalUsername}**`
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
            // Get required services
            const { usernameUtils, awardService } = message.client;
            if (!usernameUtils || !awardService) {
                console.error('Required services not available:', {
                    hasUsernameUtils: !!usernameUtils,
                    hasAwardService: !!awardService
                });
                throw new Error('Required services not available');
            }

            // Get canonical username
            const canonicalUsername = await usernameUtils.getCanonicalUsername(username);
            if (!canonicalUsername) {
                return message.reply('User not found on RetroAchievements.');
            }

            const filter = m => m.author.id === message.author.id;
            const awaitOptions = { filter, max: 1, time: 30000, errors: ['time'] };

            switch (action) {
                case 'add':
                    await handleAddPoints(message, canonicalUsername, filter, awaitOptions, awardService);
                    break;
                
                case 'remove':
                    await handleRemovePoints(message, canonicalUsername, filter, awaitOptions, awardService);
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
