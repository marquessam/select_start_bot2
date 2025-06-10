// src/commands/admin/fix-progress.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';

export default {
    data: new SlashCommandBuilder()
        .setName('fix-progress')
        .setDescription('Fix corrupted progress values in monthly/shadow challenges (Admin only)')
        .addBooleanOption(option =>
            option.setName('dry-run')
                .setDescription('Preview changes without saving (default: false)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Fix specific user only (optional)')
                .setRequired(false)),

    async execute(interaction) {
        // Check admin permissions
        const adminRoleId = process.env.ADMIN_ROLE_ID;
        if (!adminRoleId || !interaction.member.roles.cache.has(adminRoleId)) {
            return interaction.reply({ 
                content: '❌ This command requires administrator permissions.', 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const dryRun = interaction.options.getBoolean('dry-run') || false;
            const targetUsername = interaction.options.getString('username');
            
            console.log(`🔄 Starting progress value migration (dry-run: ${dryRun})`);
            
            // Get users to process
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

            let usersUpdated = 0;
            let challengesFixed = 0;
            let shadowsFixed = 0;
            let detailedLog = [];
            
            // Create initial status embed
            const statusEmbed = new EmbedBuilder()
                .setTitle('🔄 Fixing Progress Values')
                .setColor('#FFA500')
                .setDescription(`${dryRun ? '**DRY RUN MODE** - No changes will be saved' : 'Updating database...'}`)
                .addFields(
                    { name: 'Users to Process', value: users.length.toString(), inline: true },
                    { name: 'Progress', value: 'Starting...', inline: true },
                    { name: 'Status', value: 'Initializing', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [statusEmbed] });

            // Process users in batches to provide progress updates
            const batchSize = 10;
            const totalBatches = Math.ceil(users.length / batchSize);
            
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const batchStart = batchIndex * batchSize;
                const batchEnd = Math.min(batchStart + batchSize, users.length);
                const batch = users.slice(batchStart, batchEnd);
                
                // Process current batch
                for (const user of batch) {
                    let userNeedsUpdate = false;
                    let userChanges = [];
                    
                    // Fix monthly challenges
                    if (user.monthlyChallenges && user.monthlyChallenges.size > 0) {
                        for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                            if (data.progress && typeof data.progress === 'number') {
                                let newProgress = data.progress;
                                let changeType = '';
                                
                                // Convert point values to status codes
                                if (data.progress === 7) {
                                    newProgress = 3; // mastery: 7 points -> status code 3
                                    changeType = 'mastery';
                                    challengesFixed++;
                                    userNeedsUpdate = true;
                                } else if (data.progress === 4) {
                                    newProgress = 2; // beaten: 4 points -> status code 2
                                    changeType = 'beaten';
                                    challengesFixed++;
                                    userNeedsUpdate = true;
                                }
                                // progress === 1 is already correct (participation)
                                
                                if (newProgress !== data.progress) {
                                    userChanges.push(`Monthly ${monthKey}: ${data.progress}pts → status ${newProgress} (${changeType})`);
                                    
                                    if (!dryRun) {
                                        user.monthlyChallenges.set(monthKey, {
                                            ...data,
                                            progress: newProgress
                                        });
                                    }
                                }
                            }
                        }
                    }
                    
                    // Fix shadow challenges
                    if (user.shadowChallenges && user.shadowChallenges.size > 0) {
                        for (const [monthKey, data] of user.shadowChallenges.entries()) {
                            if (data.progress && typeof data.progress === 'number') {
                                let newProgress = data.progress;
                                let changeType = '';
                                
                                // Convert point values to status codes (shadow max is beaten = 2)
                                if (data.progress === 4) {
                                    newProgress = 2; // beaten: 4 points -> status code 2 (max for shadow)
                                    changeType = 'beaten';
                                    shadowsFixed++;
                                    userNeedsUpdate = true;
                                }
                                // progress === 1 is already correct (participation)
                                
                                if (newProgress !== data.progress) {
                                    userChanges.push(`Shadow ${monthKey}: ${data.progress}pts → status ${newProgress} (${changeType})`);
                                    
                                    if (!dryRun) {
                                        user.shadowChallenges.set(monthKey, {
                                            ...data,
                                            progress: newProgress
                                        });
                                    }
                                }
                            }
                        }
                    }
                    
                    if (userNeedsUpdate) {
                        if (!dryRun) {
                            await user.save();
                        }
                        
                        usersUpdated++;
                        detailedLog.push({
                            username: user.raUsername,
                            changes: userChanges
                        });
                    }
                }
                
                // Update progress every few batches
                if (batchIndex % 3 === 0 || batchIndex === totalBatches - 1) {
                    const progress = Math.round(((batchIndex + 1) / totalBatches) * 100);
                    
                    statusEmbed.setFields(
                        { name: 'Users Processed', value: `${batchEnd}/${users.length}`, inline: true },
                        { name: 'Progress', value: `${progress}%`, inline: true },
                        { name: 'Users Modified', value: usersUpdated.toString(), inline: true },
                        { name: 'Monthly Fixes', value: challengesFixed.toString(), inline: true },
                        { name: 'Shadow Fixes', value: shadowsFixed.toString(), inline: true },
                        { name: 'Status', value: batchIndex === totalBatches - 1 ? 'Completing...' : 'Processing...', inline: true }
                    );
                    
                    await interaction.editReply({ embeds: [statusEmbed] });
                }
            }
            
            // Create final results embed
            const resultsEmbed = new EmbedBuilder()
                .setTitle(dryRun ? '🔍 Migration Preview (Dry Run)' : '✅ Migration Completed')
                .setColor(dryRun ? '#0099FF' : '#00FF00')
                .setDescription(dryRun ? 
                    'Preview of changes that would be made. Use without `dry-run:true` to apply fixes.' :
                    'Database has been updated with corrected progress values.')
                .addFields(
                    { name: 'Users Scanned', value: users.length.toString(), inline: true },
                    { name: 'Users Modified', value: usersUpdated.toString(), inline: true },
                    { name: 'Monthly Challenges Fixed', value: challengesFixed.toString(), inline: true },
                    { name: 'Shadow Challenges Fixed', value: shadowsFixed.toString(), inline: true }
                )
                .setTimestamp();

            // Add detailed log if there were changes
            if (detailedLog.length > 0) {
                let logText = '';
                const maxUsers = targetUsername ? 5 : 3; // Show more detail for single user
                
                for (let i = 0; i < Math.min(maxUsers, detailedLog.length); i++) {
                    const userLog = detailedLog[i];
                    logText += `**${userLog.username}:**\n`;
                    for (const change of userLog.changes) {
                        logText += `  • ${change}\n`;
                    }
                    logText += '\n';
                }
                
                if (detailedLog.length > maxUsers) {
                    logText += `...and ${detailedLog.length - maxUsers} more users\n`;
                }
                
                // Ensure we don't exceed Discord's field limit
                if (logText.length > 1000) {
                    logText = logText.substring(0, 950) + '...\n*[Truncated]*';
                }
                
                resultsEmbed.addFields({
                    name: 'Changes Made',
                    value: logText || 'No changes needed'
                });
            }

            if (!dryRun && (challengesFixed > 0 || shadowsFixed > 0)) {
                resultsEmbed.addFields({
                    name: 'Next Steps',
                    value: '• Profile commands should now show correct points\n' +
                           '• Trophy cases should display properly\n' +
                           '• Yearly leaderboard will reflect accurate totals\n' +
                           '• Use `/profile` to verify the fix worked'
                });
                
                // Notify API to refresh cache
                try {
                    const response = await fetch('https://select-start-api-production.up.railway.app/api/admin/force-update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': '0000'
                        },
                        body: JSON.stringify({ target: 'leaderboards' })
                    });
                    
                    if (response.ok) {
                        resultsEmbed.setFooter({ text: 'API cache refreshed successfully' });
                    }
                } catch (apiError) {
                    console.error('Error notifying API:', apiError);
                    resultsEmbed.setFooter({ text: 'Warning: Could not refresh API cache' });
                }
            }

            if (challengesFixed === 0 && shadowsFixed === 0) {
                resultsEmbed.setDescription('✅ No corrupted progress values found. All data is already correct!');
            }

            await interaction.editReply({ embeds: [resultsEmbed] });
            
            // Log to console for record keeping
            console.log(`📊 Migration Summary:`);
            console.log(`   Users scanned: ${users.length}`);
            console.log(`   Users updated: ${usersUpdated}`);
            console.log(`   Monthly challenges fixed: ${challengesFixed}`);
            console.log(`   Shadow challenges fixed: ${shadowsFixed}`);
            console.log(`   Dry run: ${dryRun}`);
            
        } catch (error) {
            console.error('❌ Migration failed:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Migration Failed')
                .setColor('#FF0000')
                .setDescription('An error occurred while fixing progress values.')
                .addFields({
                    name: 'Error Details',
                    value: `\`\`\`${error.message}\`\`\``
                })
                .setTimestamp();
                
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
