// src/commands/admin/fixHistoricalTitles.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import { User } from '../../models/User.js';

// Complete game title mappings for 2025
const HISTORICAL_TITLES = {
    '2025-01': {
        monthly: 'Chrono Trigger',
        shadow: 'Mario Tennis'
    },
    '2025-02': {
        monthly: 'Zelda: A Link to the Past', 
        shadow: 'UN Squadron'
    },
    '2025-03': {
        monthly: 'Mega Man X5',
        shadow: 'Monster Rancher Advance 2'
    },
    '2025-04': {
        monthly: 'Ape Escape',
        shadow: 'Advance Wars'
    },
    '2025-05': {
        monthly: 'Pokemon Snap',
        shadow: 'Cocoron'
    }
};

export default {
    data: new SlashCommandBuilder()
        .setName('fixhistoricaltitles')
        .setDescription('Fix game titles for all 2025 historical challenges')
        .addBooleanOption(option =>
            option.setName('dryrun')
                .setDescription('Preview changes without saving')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Fix specific user only (optional)')
                .setRequired(false)),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const dryRun = interaction.options.getBoolean('dryrun') || false;
        const targetUsername = interaction.options.getString('username');

        try {
            // Get users to update
            let users;
            if (targetUsername) {
                const user = await User.findOne({
                    raUsername: { $regex: new RegExp(`^${targetUsername}$`, 'i') }
                });
                if (!user) {
                    return interaction.editReply(`❌ User "${targetUsername}" not found.`);
                }
                users = [user];
            } else {
                users = await User.find({});
            }

            let processedUsers = 0;
            let monthlyUpdated = 0;
            let shadowUpdated = 0;
            let skipped = 0;

            for (const user of users) {
                let userModified = false;

                // Process monthly challenges
                for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                    if (HISTORICAL_TITLES[monthKey]?.monthly) {
                        const correctTitle = HISTORICAL_TITLES[monthKey].monthly;
                        
                        // Only update if title is missing or generic
                        if (!data.gameTitle || 
                            data.gameTitle.includes('Monthly Challenge') || 
                            data.gameTitle !== correctTitle) {
                            
                            if (!dryRun) {
                                // Update the data object
                                const updatedData = { ...data, gameTitle: correctTitle };
                                user.monthlyChallenges.set(monthKey, updatedData);
                                userModified = true;
                            }
                            monthlyUpdated++;
                            console.log(`${dryRun ? '[DRY RUN] ' : ''}Updated ${user.raUsername} monthly ${monthKey}: "${correctTitle}"`);
                        } else {
                            skipped++;
                        }
                    }
                }

                // Process shadow challenges
                for (const [monthKey, data] of user.shadowChallenges.entries()) {
                    if (HISTORICAL_TITLES[monthKey]?.shadow) {
                        const correctTitle = HISTORICAL_TITLES[monthKey].shadow;
                        
                        // Only update if title is missing or generic
                        if (!data.gameTitle || 
                            data.gameTitle.includes('Shadow Challenge') || 
                            data.gameTitle !== correctTitle) {
                            
                            if (!dryRun) {
                                // Update the data object
                                const updatedData = { ...data, gameTitle: correctTitle };
                                user.shadowChallenges.set(monthKey, updatedData);
                                userModified = true;
                            }
                            shadowUpdated++;
                            console.log(`${dryRun ? '[DRY RUN] ' : ''}Updated ${user.raUsername} shadow ${monthKey}: "${correctTitle}"`);
                        } else {
                            skipped++;
                        }
                    }
                }

                // Save if modified
                if (userModified && !dryRun) {
                    user.markModified('monthlyChallenges');
                    user.markModified('shadowChallenges');
                    await user.save();
                }

                processedUsers++;

                // Progress update for large operations
                if (processedUsers % 50 === 0 && !targetUsername) {
                    await interaction.editReply(`🔄 **Progress**: ${processedUsers}/${users.length} users processed...`);
                }
            }

            const totalUpdated = monthlyUpdated + shadowUpdated;

            const embed = new EmbedBuilder()
                .setTitle(dryRun ? '🔍 Historical Title Fix Preview' : '✅ Historical Titles Fixed')
                .setDescription(
                    `**Results:**\n` +
                    `• Users Processed: ${processedUsers}\n` +
                    `• Monthly Titles ${dryRun ? 'Would Be ' : ''}Updated: ${monthlyUpdated}\n` +
                    `• Shadow Titles ${dryRun ? 'Would Be ' : ''}Updated: ${shadowUpdated}\n` +
                    `• Total Updates: ${totalUpdated}\n` +
                    `• Skipped (Already Correct): ${skipped}\n\n` +
                    `${dryRun ? 'Run without dryrun to apply changes' : 'All 2025 historical game titles have been updated!'}`
                )
                .setColor(dryRun ? '#FFA500' : '#00FF00')
                .setTimestamp();

            // Add details if targeting specific user
            if (targetUsername && !dryRun) {
                embed.addFields({
                    name: 'Updated Titles',
                    value: totalUpdated > 0 ? 
                        `Fixed ${totalUpdated} titles for ${targetUsername}` :
                        `No titles needed updating for ${targetUsername}`
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fixing historical titles:', error);
            await interaction.editReply('❌ An error occurred. Check console for details.');
        }
    }
};
