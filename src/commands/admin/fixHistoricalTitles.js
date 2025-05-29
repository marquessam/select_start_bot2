// src/commands/admin/fixHistoricalTitles.js - IMPROVED VERSION
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('fixhistoricaltitles')
        .setDescription('Fix game titles for historical challenges using Challenge database')
        .addBooleanOption(option =>
            option.setName('dryrun')
                .setDescription('Preview changes without saving')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Fix specific user only (optional)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('updatechallenges')
                .setDescription('First update Challenge documents with missing metadata')
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
        const updateChallenges = interaction.options.getBoolean('updatechallenges') || false;

        try {
            // Step 1: Update Challenge documents with missing metadata if requested
            if (updateChallenges) {
                await interaction.editReply('🔄 **Step 1/2**: Updating Challenge documents with missing metadata...');
                await this.updateChallengeMetadata(dryRun);
            }

            await interaction.editReply('🔄 **Step 2/2**: Fixing user historical titles...');

            // Step 2: Get all challenges to build title mapping
            const challenges = await Challenge.find({}).sort({ date: 1 });
            const titleMapping = {};

            for (const challenge of challenges) {
                const monthKey = this.getMonthKey(challenge.date);
                titleMapping[monthKey] = {};

                // Monthly challenge title
                if (challenge.monthly_challange_gameid) {
                    titleMapping[monthKey].monthly = {
                        gameId: challenge.monthly_challange_gameid,
                        title: challenge.monthly_game_title,
                        iconUrl: challenge.monthly_game_icon_url
                    };
                }

                // Shadow challenge title (if revealed)
                if (challenge.shadow_challange_gameid && challenge.shadow_challange_revealed) {
                    titleMapping[monthKey].shadow = {
                        gameId: challenge.shadow_challange_gameid,
                        title: challenge.shadow_game_title,
                        iconUrl: challenge.shadow_game_icon_url
                    };
                }
            }

            // Step 3: Get users to update
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
            let missingFromChallenges = 0;

            for (const user of users) {
                let userModified = false;

                // Process monthly challenges
                for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                    if (titleMapping[monthKey]?.monthly) {
                        const challengeData = titleMapping[monthKey].monthly;
                        const correctTitle = challengeData.title;
                        
                        if (correctTitle) {
                            // Only update if title is missing, generic, or incorrect
                            if (!data.gameTitle || 
                                data.gameTitle.includes('Monthly Challenge') || 
                                data.gameTitle !== correctTitle) {
                                
                                if (!dryRun) {
                                    const updatedData = { 
                                        ...data, 
                                        gameTitle: correctTitle,
                                        gameIconUrl: challengeData.iconUrl || data.gameIconUrl
                                    };
                                    user.monthlyChallenges.set(monthKey, updatedData);
                                    userModified = true;
                                }
                                monthlyUpdated++;
                                console.log(`${dryRun ? '[DRY RUN] ' : ''}Updated ${user.raUsername} monthly ${monthKey}: "${correctTitle}"`);
                            } else {
                                skipped++;
                            }
                        } else {
                            missingFromChallenges++;
                            console.log(`⚠️ Missing title in Challenge document for monthly ${monthKey}`);
                        }
                    }
                }

                // Process shadow challenges
                for (const [monthKey, data] of user.shadowChallenges.entries()) {
                    if (titleMapping[monthKey]?.shadow) {
                        const challengeData = titleMapping[monthKey].shadow;
                        const correctTitle = challengeData.title;
                        
                        if (correctTitle) {
                            // Only update if title is missing, generic, or incorrect
                            if (!data.gameTitle || 
                                data.gameTitle.includes('Shadow Challenge') || 
                                data.gameTitle !== correctTitle) {
                                
                                if (!dryRun) {
                                    const updatedData = { 
                                        ...data, 
                                        gameTitle: correctTitle,
                                        gameIconUrl: challengeData.iconUrl || data.gameIconUrl
                                    };
                                    user.shadowChallenges.set(monthKey, updatedData);
                                    userModified = true;
                                }
                                shadowUpdated++;
                                console.log(`${dryRun ? '[DRY RUN] ' : ''}Updated ${user.raUsername} shadow ${monthKey}: "${correctTitle}"`);
                            } else {
                                skipped++;
                            }
                        } else {
                            missingFromChallenges++;
                            console.log(`⚠️ Missing title in Challenge document for shadow ${monthKey}`);
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
                    `• Skipped (Already Correct): ${skipped}\n` +
                    `• Missing from Challenges: ${missingFromChallenges}\n\n` +
                    `${dryRun ? 'Run without dryrun to apply changes' : 'Historical game titles have been updated from Challenge database!'}`
                )
                .setColor(dryRun ? '#FFA500' : '#00FF00')
                .setTimestamp();

            if (missingFromChallenges > 0) {
                embed.addFields({
                    name: '⚠️ Missing Challenge Metadata',
                    value: `${missingFromChallenges} titles are missing from Challenge documents. Run with \`updatechallenges:True\` to fix this first.`
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fixing historical titles:', error);
            await interaction.editReply('❌ An error occurred. Check console for details.');
        }
    },

    // Helper method to update Challenge documents with missing metadata
    async updateChallengeMetadata(dryRun = false) {
        const challenges = await Challenge.find({});
        let updated = 0;

        for (const challenge of challenges) {
            let needsUpdate = false;

            // Check monthly challenge metadata
            if (challenge.monthly_challange_gameid && !challenge.monthly_game_title) {
                try {
                    const gameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);
                    if (gameInfo && !dryRun) {
                        challenge.monthly_game_title = gameInfo.title;
                        challenge.monthly_game_icon_url = gameInfo.imageIcon;
                        challenge.monthly_game_console = gameInfo.consoleName;
                        needsUpdate = true;
                    }
                    console.log(`${dryRun ? '[DRY RUN] ' : ''}Updated monthly metadata for ${this.getMonthKey(challenge.date)}: ${gameInfo?.title}`);
                } catch (error) {
                    console.error(`Error fetching monthly game info for ${challenge.monthly_challange_gameid}:`, error);
                }
            }

            // Check shadow challenge metadata (if revealed)
            if (challenge.shadow_challange_gameid && 
                challenge.shadow_challange_revealed && 
                !challenge.shadow_game_title) {
                try {
                    const shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);
                    if (shadowGameInfo && !dryRun) {
                        challenge.shadow_game_title = shadowGameInfo.title;
                        challenge.shadow_game_icon_url = shadowGameInfo.imageIcon;
                        challenge.shadow_game_console = shadowGameInfo.consoleName;
                        needsUpdate = true;
                    }
                    console.log(`${dryRun ? '[DRY RUN] ' : ''}Updated shadow metadata for ${this.getMonthKey(challenge.date)}: ${shadowGameInfo?.title}`);
                } catch (error) {
                    console.error(`Error fetching shadow game info for ${challenge.shadow_challange_gameid}:`, error);
                }
            }

            if (needsUpdate && !dryRun) {
                await challenge.save();
                updated++;
            }

            // Small delay to avoid overwhelming API
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`${dryRun ? '[DRY RUN] ' : ''}Updated ${updated} Challenge documents with metadata`);
    },

    // Helper method to get month key from date
    getMonthKey(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }
};
