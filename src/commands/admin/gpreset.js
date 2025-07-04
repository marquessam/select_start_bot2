// src/commands/admin/gpreset.js - Reset all users' GP to a flat value
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { User } from '../../models/User.js';
import gpUtils from '../../utils/gpUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gpreset')
        .setDescription('Reset ALL users GP to a flat value')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of GP to set for all users')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(50000)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the GP reset (optional)')
                .setRequired(false)
                .setMaxLength(200)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const amount = interaction.options.getInteger('amount');
            const reason = interaction.options.getString('reason') || 'GP reset by admin';

            // Get current user count for the warning
            const userCount = await User.countDocuments({});

            // Create confirmation embed with strong warning
            const confirmEmbed = new EmbedBuilder()
                .setTitle('🚨 DANGER: GP RESET CONFIRMATION')
                .setColor('#FF0000')
                .setDescription(
                    `**YOU ARE ABOUT TO RESET ALL USERS' GP TO ${amount.toLocaleString()}!**\n\n` +
                    `This will affect **${userCount.toLocaleString()} users** and **CANNOT BE UNDONE**.\n\n` +
                    `**All current GP balances will be lost!**`
                )
                .addFields(
                    { name: 'New GP Amount', value: `${amount.toLocaleString()} GP`, inline: true },
                    { name: 'Users Affected', value: `${userCount.toLocaleString()} users`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { 
                        name: '⚠️ WARNING', 
                        value: 'This action is **IRREVERSIBLE**. All current GP balances will be overwritten!', 
                        inline: false 
                    }
                )
                .setFooter({ text: 'Type "CONFIRM RESET" to proceed or click Cancel' })
                .setTimestamp();

            const confirmButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('gpreset_confirm')
                        .setLabel('I UNDERSTAND - RESET ALL GP')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🚨'),
                    new ButtonBuilder()
                        .setCustomId('gpreset_cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('❌')
                );

            const confirmMessage = await interaction.editReply({ 
                embeds: [confirmEmbed], 
                components: [confirmButtons] 
            });

            try {
                const buttonInteraction = await confirmMessage.awaitMessageComponent({
                    filter: (i) => i.user.id === interaction.user.id,
                    time: 60000 // Give more time for this important decision
                });

                if (buttonInteraction.customId === 'gpreset_cancel') {
                    await buttonInteraction.update({
                        content: '✅ GP reset cancelled. No changes were made.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                // Confirm button pressed - start the reset process
                await buttonInteraction.update({
                    content: '🔄 **RESETTING ALL USER GP...** This may take a while...',
                    embeds: [],
                    components: []
                });

                // Get all users
                const allUsers = await User.find({});
                
                if (allUsers.length === 0) {
                    await interaction.editReply({
                        content: '⚠️ No users found in the database.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                // Process reset
                const progressEmbed = new EmbedBuilder()
                    .setTitle('🔄 Processing GP Reset...')
                    .setColor('#FF9900')
                    .setDescription(`Resetting GP for **${allUsers.length.toLocaleString()}** users to **${amount.toLocaleString()} GP**...`)
                    .addFields({
                        name: 'Progress',
                        value: '0% complete',
                        inline: false
                    })
                    .setTimestamp();

                await interaction.editReply({ embeds: [progressEmbed] });

                let successCount = 0;
                let errorCount = 0;
                const errors = [];
                const batchSize = 100; // Process in batches for better performance

                console.log(`🚨 Starting GP RESET: Setting ${amount} GP for ALL ${allUsers.length} users`);

                // Process users in batches
                for (let i = 0; i < allUsers.length; i += batchSize) {
                    const batch = allUsers.slice(i, i + batchSize);
                    
                    // Update progress every batch
                    const progress = Math.round((i / allUsers.length) * 100);
                    const progressUpdateEmbed = new EmbedBuilder()
                        .setTitle('🔄 Processing GP Reset...')
                        .setColor('#FF9900')
                        .setDescription(`Resetting GP for **${allUsers.length.toLocaleString()}** users to **${amount.toLocaleString()} GP**...`)
                        .addFields({
                            name: 'Progress',
                            value: `${progress}% complete (${i + batch.length}/${allUsers.length})`,
                            inline: false
                        })
                        .setTimestamp();

                    // Don't spam updates too frequently
                    if (i % (batchSize * 5) === 0 || i + batchSize >= allUsers.length) {
                        try {
                            await interaction.editReply({ embeds: [progressUpdateEmbed] });
                        } catch (err) {
                            // Ignore edit errors during bulk processing
                        }
                    }

                    // Process batch
                    for (const user of batch) {
                        try {
                            console.log(`🔄 Resetting GP for ${user.raUsername} to ${amount}...`);
                            
                            // Set GP directly instead of adding
                            user.gp = amount;
                            await user.save();
                            
                            // Log the reset in GP history if gpUtils supports it
                            try {
                                await gpUtils.awardGP(
                                    user,
                                    0, // No change amount since we're setting directly
                                    'admin_reset',
                                    `GP reset: ${reason} (set to ${amount})`,
                                    null
                                );
                            } catch (logError) {
                                // If logging fails, continue with the reset
                                console.warn(`Failed to log GP reset for ${user.raUsername}:`, logError.message);
                            }
                            
                            successCount++;
                            console.log(`✅ Reset GP for ${user.raUsername} to ${amount}`);
                        } catch (error) {
                            console.error(`❌ Error resetting GP for ${user.raUsername}:`, error);
                            errorCount++;
                            errors.push(`${user.raUsername}: ${error.message}`);
                        }
                    }
                }

                // Final results
                const resultEmbed = new EmbedBuilder()
                    .setTitle(errorCount > 0 ? '⚠️ GP Reset Completed with Errors' : '✅ GP Reset Completed Successfully')
                    .setColor(errorCount > 0 ? '#FF9900' : '#00FF00')
                    .setDescription(`GP reset operation completed.`)
                    .addFields(
                        { name: 'New GP Amount', value: `${amount.toLocaleString()} GP`, inline: true },
                        { name: 'Users Updated', value: `${successCount.toLocaleString()}`, inline: true },
                        { name: 'Errors', value: `${errorCount.toLocaleString()}`, inline: true },
                        { name: 'Total Users', value: `${allUsers.length.toLocaleString()}`, inline: true },
                        { name: 'Success Rate', value: `${((successCount / allUsers.length) * 100).toFixed(1)}%`, inline: true },
                        { name: 'Total GP in System', value: `${(successCount * amount).toLocaleString()} GP`, inline: true },
                        { name: 'Reason', value: reason, inline: false }
                    )
                    .setTimestamp();

                if (errors.length > 0 && errors.length <= 10) {
                    resultEmbed.addFields({
                        name: 'First 10 Errors',
                        value: errors.slice(0, 10).join('\n').substring(0, 1024),
                        inline: false
                    });
                } else if (errors.length > 10) {
                    resultEmbed.addFields({
                        name: 'Errors',
                        value: `${errors.length} errors occurred. Check console logs for details.`,
                        inline: false
                    });
                }

                await interaction.editReply({ embeds: [resultEmbed] });

                // Log the reset completion
                console.log(`🎯 GP RESET completed by ${interaction.user.tag}: Set ${amount} GP for ${successCount}/${allUsers.length} users. Reason: ${reason}`);

            } catch (error) {
                if (error.name === 'Error' && error.message.includes('time')) {
                    await interaction.editReply({
                        content: '❌ Confirmation timed out. GP reset cancelled for safety.',
                        embeds: [],
                        components: []
                    });
                } else {
                    throw error; // Re-throw if it's a different error
                }
                return;
            }

        } catch (error) {
            console.error('❌ Error in GP reset command:', error);
            console.error('Error stack:', error.stack);
            await interaction.editReply({
                content: '❌ An error occurred while processing GP reset. Check logs for details.',
                embeds: [],
                components: []
            });
        }
    }
};
