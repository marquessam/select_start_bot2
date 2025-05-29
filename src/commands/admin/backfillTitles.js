// src/commands/admin/backfillTitles.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from '../../config/config.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('backfilltitles')
        .setDescription('Backfill missing game titles in user challenge records')
        .addBooleanOption(option =>
            option.setName('dryrun')
                .setDescription('Preview changes without saving')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Specific user to backfill (optional)')
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
            if (dryRun) {
                await this.runAnalysis(interaction, targetUsername);
            } else {
                await this.runBackfill(interaction, targetUsername);
            }
        } catch (error) {
            console.error('Error in backfill command:', error);
            await interaction.editReply('❌ An error occurred. Check console for details.');
        }
    },

    async runAnalysis(interaction, targetUsername) {
        await interaction.editReply('🔍 **Analyzing missing game titles...**');

        // Get users to check
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

        let totalMissing = 0;
        let analysisText = '';

        for (const user of users.slice(0, 10)) { // Limit to 10 users for display
            let userMissing = 0;
            
            // Check monthly challenges
            for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                if (!data.gameTitle) {
                    userMissing++;
                    totalMissing++;
                }
            }
            
            // Check shadow challenges  
            for (const [monthKey, data] of user.shadowChallenges.entries()) {
                if (!data.gameTitle) {
                    userMissing++;
                    totalMissing++;
                }
            }
            
            if (userMissing > 0) {
                analysisText += `• **${user.raUsername}**: ${userMissing} missing titles\n`;
            }
        }

        if (totalMissing === 0) {
            analysisText = '✅ No missing game titles found!';
        } else {
            if (!targetUsername && users.length > 10) {
                analysisText += `\n*...and potentially more from remaining ${users.length - 10} users*`;
            }
            analysisText += `\n\n📊 **Total missing titles**: ${totalMissing}`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🔍 Game Title Analysis')
            .setDescription(analysisText)
            .setColor('#FFA500')
            .setFooter({ text: 'Run without dryrun to fix missing titles' });

        await interaction.editReply({ embeds: [embed] });
    },

    async runBackfill(interaction, targetUsername) {
        await interaction.editReply('🔄 **Backfilling game titles...**');

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
        let updatedTitles = 0;
        let errors = 0;

        for (const user of users) {
            try {
                let userUpdated = false;

                // Process monthly challenges
                for (const [monthKey, data] of user.monthlyChallenges.entries()) {
                    if (!data.gameTitle) {
                        const gameTitle = await this.getGameTitleForMonth(monthKey, 'monthly');
                        if (gameTitle) {
                            data.gameTitle = gameTitle;
                            user.monthlyChallenges.set(monthKey, data);
                            userUpdated = true;
                            updatedTitles++;
                        }
                    }
                }

                // Process shadow challenges
                for (const [monthKey, data] of user.shadowChallenges.entries()) {
                    if (!data.gameTitle) {
                        const gameTitle = await this.getGameTitleForMonth(monthKey, 'shadow');
                        if (gameTitle) {
                            data.gameTitle = gameTitle;
                            user.shadowChallenges.set(monthKey, data);
                            userUpdated = true;
                            updatedTitles++;
                        }
                    }
                }

                if (userUpdated) {
                    await user.save();
                }

                processedUsers++;

                // Progress update every 25 users
                if (processedUsers % 25 === 0 && !targetUsername) {
                    await interaction.editReply(`🔄 **Progress**: ${processedUsers}/${users.length} users processed, ${updatedTitles} titles updated...`);
                }

            } catch (error) {
                console.error(`Error processing user ${user.raUsername}:`, error);
                errors++;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('✅ Game Title Backfill Complete')
            .setDescription(
                `**Results:**\n` +
                `• Users Processed: ${processedUsers}\n` +
                `• Titles Updated: ${updatedTitles}\n` +
                `• Errors: ${errors}\n\n` +
                `${updatedTitles > 0 ? 'Game titles have been populated!' : 'No titles needed updating.'}`
            )
            .setColor(updatedTitles > 0 ? '#00FF00' : '#FFA500')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async getGameTitleForMonth(monthKey, challengeType) {
        try {
            // Parse monthKey (YYYY-MM format)
            const [year, month] = monthKey.split('-').map(Number);
            const challengeDate = new Date(year, month - 1, 1);
            const nextMonthStart = new Date(year, month, 1);

            // Find the challenge record
            const challenge = await Challenge.findOne({
                date: {
                    $gte: challengeDate,
                    $lt: nextMonthStart
                }
            });

            if (!challenge) {
                console.log(`No challenge found for ${monthKey}`);
                return null;
            }

            // Get the appropriate game ID
            let gameId;
            if (challengeType === 'monthly') {
                gameId = challenge.monthly_challange_gameid;
            } else if (challengeType === 'shadow') {
                gameId = challenge.shadow_challange_gameid;
            }

            if (!gameId) {
                console.log(`No ${challengeType} game ID found for ${monthKey}`);
                return null;
            }

            // Get game info from RetroAchievements API
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (gameInfo && gameInfo.title) {
                console.log(`Found title for ${monthKey} ${challengeType}: ${gameInfo.title}`);
                return gameInfo.title;
            }

            console.log(`Could not get game info for ID ${gameId}`);
            return null;

        } catch (error) {
            console.error(`Error getting game title for ${monthKey} ${challengeType}:`, error);
            return null;
        }
    }
};
