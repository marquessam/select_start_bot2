// src/commands/admin/fixNominations.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('fixnominations')
        .setDescription('Fix nominations with missing game titles or console names')
        .setDefaultMemberPermissions('0') // Only visible to users with Administrator permission
        .addBooleanOption(option =>
            option.setName('dryrun')
            .setDescription('Preview changes without saving them')
            .setRequired(false))
        .addBooleanOption(option =>
            option.setName('verbose')
            .setDescription('Show detailed information about each nomination')
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

        const dryRun = interaction.options.getBoolean('dryrun') ?? false;
        const verbose = interaction.options.getBoolean('verbose') ?? false;

        try {
            const users = await User.find({});
            console.log(`🔍 Starting nomination fix for ${users.length} users (Dry run: ${dryRun})`);

            let totalNominations = 0;
            let fixedNominations = 0;
            let problemNominations = 0;
            let removedNominations = 0;
            let apiCalls = 0;
            const fixedUsers = [];
            const detailLog = [];

            for (const user of users) {
                if (!user.nominations || user.nominations.length === 0) continue;

                let userChanged = false;
                const userLog = [];
                const validNominations = [];

                userLog.push(`👤 **User: ${user.raUsername || user.discordId}**`);

                for (const nom of user.nominations) {
                    totalNominations++;
                    
                    if (!nom.gameId) {
                        userLog.push(`  ❌ Removing nomination without gameId`);
                        removedNominations++;
                        continue;
                    }

                    const hasMissingTitle = !nom.gameTitle;
                    const hasMissingConsole = !nom.consoleName;

                    if (hasMissingTitle || hasMissingConsole) {
                        problemNominations++;
                        userLog.push(`  🔧 Fixing nomination for gameId: ${nom.gameId}`);
                        
                        try {
                            // Add delay to avoid rate limiting
                            await new Promise(resolve => setTimeout(resolve, 200));
                            
                            const gameInfo = await retroAPI.getGameInfo(nom.gameId);
                            apiCalls++;
                            
                            if (!gameInfo || !gameInfo.title) {
                                userLog.push(`    ❌ Invalid game data for gameId ${nom.gameId}, removing`);
                                removedNominations++;
                                continue;
                            }

                            // Create fixed nomination
                            const fixedNomination = {
                                gameId: nom.gameId,
                                gameTitle: hasMissingTitle ? gameInfo.title : nom.gameTitle,
                                consoleName: hasMissingConsole ? gameInfo.consoleName : nom.consoleName,
                                nominatedAt: nom.nominatedAt || new Date()
                            };

                            validNominations.push(fixedNomination);
                            
                            const fixedFields = [];
                            if (hasMissingTitle) fixedFields.push(`title: "${gameInfo.title}"`);
                            if (hasMissingConsole) fixedFields.push(`console: "${gameInfo.consoleName}"`);
                            
                            userLog.push(`    ✅ Fixed: ${fixedFields.join(', ')}`);
                            fixedNominations++;
                            userChanged = true;

                        } catch (error) {
                            userLog.push(`    ❌ API error for gameId ${nom.gameId}: ${error.message}`);
                            userLog.push(`    ❌ Removing invalid nomination`);
                            removedNominations++;
                            continue;
                        }
                    } else {
                        // Nomination is valid, keep it
                        validNominations.push(nom);
                        if (verbose) {
                            userLog.push(`  ✅ Valid: "${nom.gameTitle}" (${nom.consoleName})`);
                        }
                    }
                }

                // Update user's nominations if changes were made
                if (userChanged || validNominations.length !== user.nominations.length) {
                    if (!dryRun) {
                        user.nominations = validNominations;
                        await user.save();
                        userLog.push(`  💾 **Saved changes - ${validNominations.length} nominations kept**`);
                    } else {
                        userLog.push(`  🔍 **Would save changes - ${validNominations.length} nominations would be kept**`);
                    }
                    fixedUsers.push(user.raUsername || user.discordId);
                }

                if (userLog.length > 1) { // More than just the username line
                    detailLog.push(...userLog, ''); // Add empty line between users
                }
            }

            // Create summary embed
            const embed = new EmbedBuilder()
                .setTitle(`🔧 Nomination Fix ${dryRun ? 'Preview' : 'Results'}`)
                .setColor(dryRun ? '#FFA500' : '#00FF00')
                .addFields(
                    { name: 'Total Nominations Processed', value: totalNominations.toString(), inline: true },
                    { name: 'Problems Found', value: problemNominations.toString(), inline: true },
                    { name: 'Nominations Fixed', value: fixedNominations.toString(), inline: true },
                    { name: 'Invalid Nominations Removed', value: removedNominations.toString(), inline: true },
                    { name: 'API Calls Made', value: apiCalls.toString(), inline: true },
                    { name: 'Users Affected', value: fixedUsers.length.toString(), inline: true }
                );

            if (fixedUsers.length > 0) {
                embed.addFields({
                    name: 'Affected Users',
                    value: fixedUsers.slice(0, 10).join(', ') + (fixedUsers.length > 10 ? ` and ${fixedUsers.length - 10} more...` : '')
                });
            }

            const successRate = totalNominations > 0 ? ((totalNominations - removedNominations) / totalNominations * 100).toFixed(1) : '100';
            embed.addFields({
                name: 'Success Rate',
                value: `${successRate}% of nominations ${dryRun ? 'would be' : 'were'} preserved`
            });

            if (dryRun) {
                embed.setDescription('**This was a dry run - no changes were saved to the database.**\nRun without the `dryrun` option to apply these fixes.');
            } else {
                embed.setDescription('All fixes have been applied to the database.');
            }

            embed.setTimestamp();

            // Send the summary
            await interaction.editReply({ embeds: [embed] });

            // If verbose mode is enabled and there are details to show, send them in chunks
            if (verbose && detailLog.length > 0) {
                const detailText = detailLog.join('\n');
                
                // Split into chunks of 1900 characters (Discord limit is 2000)
                const chunks = [];
                let currentChunk = '';
                
                for (const line of detailLog) {
                    if ((currentChunk + line + '\n').length > 1900) {
                        if (currentChunk) chunks.push(currentChunk);
                        currentChunk = line + '\n';
                    } else {
                        currentChunk += line + '\n';
                    }
                }
                if (currentChunk) chunks.push(currentChunk);

                // Send chunks as follow-up messages
                for (let i = 0; i < Math.min(chunks.length, 5); i++) { // Limit to 5 chunks
                    await interaction.followUp({
                        content: `**Detailed Log (${i + 1}/${Math.min(chunks.length, 5)}):**\n\`\`\`\n${chunks[i]}\`\`\``,
                        ephemeral: true
                    });
                }

                if (chunks.length > 5) {
                    await interaction.followUp({
                        content: `⚠️ Log was truncated. ${chunks.length - 5} additional chunks not shown.`,
                        ephemeral: true
                    });
                }
            }

            console.log(`✅ Nomination fix completed: ${fixedNominations} fixed, ${removedNominations} removed, ${apiCalls} API calls`);

        } catch (error) {
            console.error('Error fixing nominations:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Fix Nominations Error')
                .setDescription('An error occurred while processing nominations.')
                .setColor('#FF0000')
                .addFields({
                    name: 'Error Details',
                    value: error.message || 'Unknown error'
                })
                .setTimestamp();

            return interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
