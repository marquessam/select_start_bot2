// src/commands/admin/gprewards.js - SIMPLIFIED VERSION
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import gpUtils from '../../utils/gpUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gprewards')
        .setDescription('Give GP to users')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of GP to give')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10000)
        )
        .addStringOption(option =>
            option.setName('username')
                .setDescription('RA username (leave blank for ALL users, comma-separated for multiple)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the GP award (optional)')
                .setRequired(false)
                .setMaxLength(200)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const amount = interaction.options.getInteger('amount');
            const usernameInput = interaction.options.getString('username');
            const reason = interaction.options.getString('reason') || 'Manual GP award';

            let targetUsers = [];

            // Determine target users
            if (!usernameInput) {
                // Give to ALL users
                const confirmEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Confirm ALL USERS GP Award')
                    .setColor('#FF9900')
                    .setDescription(`You are about to give **${amount.toLocaleString()} GP** to **ALL registered users**.`)
                    .addFields(
                        { name: 'Amount per user', value: `${amount.toLocaleString()} GP`, inline: true },
                        { name: 'Reason', value: reason, inline: true },
                        { name: 'Confirm', value: 'React with ✅ to confirm or ❌ to cancel', inline: false }
                    )
                    .setFooter({ text: 'This action cannot be undone!' })
                    .setTimestamp();

                const confirmMessage = await interaction.editReply({ embeds: [confirmEmbed] });
                await confirmMessage.react('✅');
                await confirmMessage.react('❌');

                const filter = (reaction, user) => {
                    return ['✅', '❌'].includes(reaction.emoji.name) && user.id === interaction.user.id;
                };

                try {
                    const collected = await confirmMessage.awaitReactions({ 
                        filter, 
                        max: 1, 
                        time: 30000,
                        errors: ['time'] 
                    });

                    const reaction = collected.first();
                    if (reaction.emoji.name === '❌') {
                        return interaction.editReply({
                            content: '❌ GP award cancelled.',
                            embeds: []
                        });
                    }

                    // Get all users
                    targetUsers = await User.find({});
                } catch (error) {
                    return interaction.editReply({
                        content: '❌ Confirmation timed out. Award cancelled.',
                        embeds: []
                    });
                }

            } else {
                // Parse usernames (comma-separated)
                const usernames = usernameInput.split(',').map(u => u.trim()).filter(u => u.length > 0);
                
                if (usernames.length === 0) {
                    return interaction.editReply('❌ Please provide valid usernames.');
                }

                // Find users
                const foundUsers = await Promise.all(
                    usernames.map(async (username) => {
                        const user = await User.findOne({ 
                            raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
                        });
                        return { username, user };
                    })
                );

                const notFound = foundUsers.filter(result => !result.user).map(result => result.username);
                targetUsers = foundUsers.filter(result => result.user).map(result => result.user);

                if (notFound.length > 0) {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ Some Users Not Found')
                        .setColor('#FF9900')
                        .setDescription(`The following users were not found: ${notFound.join(', ')}`)
                        .addFields({
                            name: 'Continue with found users?',
                            value: targetUsers.length > 0 ? 
                                `Found: ${targetUsers.map(u => u.raUsername).join(', ')}\n\nReact with ✅ to continue or ❌ to cancel` :
                                'No users found to award GP to.',
                            inline: false
                        });

                    if (targetUsers.length === 0) {
                        return interaction.editReply({ embeds: [embed] });
                    }

                    const confirmMessage = await interaction.editReply({ embeds: [embed] });
                    await confirmMessage.react('✅');
                    await confirmMessage.react('❌');

                    const filter = (reaction, user) => {
                        return ['✅', '❌'].includes(reaction.emoji.name) && user.id === interaction.user.id;
                    };

                    try {
                        const collected = await confirmMessage.awaitReactions({ 
                            filter, 
                            max: 1, 
                            time: 15000,
                            errors: ['time'] 
                        });

                        const reaction = collected.first();
                        if (reaction.emoji.name === '❌') {
                            return interaction.editReply({
                                content: '❌ GP award cancelled.',
                                embeds: []
                            });
                        }
                    } catch (error) {
                        return interaction.editReply({
                            content: '❌ Confirmation timed out. Award cancelled.',
                            embeds: []
                        });
                    }
                }
            }

            if (targetUsers.length === 0) {
                return interaction.editReply('❌ No users found to award GP to.');
            }

            // Process awards
            const progressEmbed = new EmbedBuilder()
                .setTitle('🔄 Processing GP Awards...')
                .setColor('#3498DB')
                .setDescription(`Awarding ${amount} GP to ${targetUsers.length} user(s)...`)
                .setTimestamp();

            await interaction.editReply({ embeds: [progressEmbed] });

            let successCount = 0;
            let errorCount = 0;
            const errors = [];

            for (const user of targetUsers) {
                try {
                    await gpUtils.awardGP(
                        user,
                        amount,
                        'admin_award',
                        `Admin award: ${reason}`,
                        null
                    );
                    successCount++;
                } catch (error) {
                    console.error(`Error awarding GP to ${user.raUsername}:`, error);
                    errorCount++;
                    errors.push(`${user.raUsername}: ${error.message}`);
                }
            }

            // Results
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ GP Awards Complete')
                .setColor(errorCount > 0 ? '#FF9900' : '#00FF00')
                .setDescription(`Successfully awarded **${amount.toLocaleString()} GP** to users.`)
                .addFields(
                    { name: 'Successful', value: successCount.toString(), inline: true },
                    { name: 'Errors', value: errorCount.toString(), inline: true },
                    { name: 'Total GP Awarded', value: `${(successCount * amount).toLocaleString()} GP`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();

            if (successCount > 0) {
                const successList = targetUsers.slice(0, 10).map(u => u.raUsername).join(', ');
                resultEmbed.addFields({
                    name: 'Recipients' + (targetUsers.length > 10 ? ' (first 10)' : ''),
                    value: successList + (targetUsers.length > 10 ? `\n...and ${targetUsers.length - 10} more` : ''),
                    inline: false
                });
            }

            if (errors.length > 0 && errors.length <= 5) {
                resultEmbed.addFields({
                    name: 'Errors',
                    value: errors.slice(0, 5).join('\n').substring(0, 1024),
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [resultEmbed] });

            // Log the award
            console.log(`GP award completed by ${interaction.user.tag}: ${amount} GP to ${successCount}/${targetUsers.length} users. Reason: ${reason}`);

        } catch (error) {
            console.error('Error in GP award command:', error);
            await interaction.editReply('❌ An error occurred while processing GP awards. Check logs for details.');
        }
    }
};
