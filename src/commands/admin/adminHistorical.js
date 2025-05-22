
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    PermissionFlagsBits
} from 'discord.js';
import { User } from '../../models/User.js';
import historicalDataService from '../../services/historicalDataService.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminhistorical')
        .setDescription('Manage historical challenge data for users')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('repopulate')
                .setDescription('Repopulate historical data for a specific user')
                .addStringOption(option =>
                    option.setName('ra_username')
                    .setDescription('RetroAchievements username')
                    .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('skip_existing')
                    .setDescription('Skip months that already have data (default: false)')
                    .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('dry_run')
                    .setDescription('Preview changes without saving (default: false)')
                    .setRequired(false))
                .addStringOption(option =>
                    option.setName('from_date')
                    .setDescription('Start from date (YYYY-MM-DD format)')
                    .setRequired(false))
                .addStringOption(option =>
                    option.setName('to_date')
                    .setDescription('End at date (YYYY-MM-DD format)')
                    .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check if a user needs historical data repopulation')
                .addStringOption(option =>
                    option.setName('ra_username')
                    .setDescription('RetroAchievements username')
                    .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('repopulateall')
                .setDescription('Repopulate historical data for ALL users (use with caution)')
                .addBooleanOption(option =>
                    option.setName('skip_existing')
                    .setDescription('Skip months that already have data (default: true)')
                    .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('dry_run')
                    .setDescription('Preview changes without saving (default: true)')
                    .setRequired(false))
        ),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        switch(subcommand) {
            case 'repopulate':
                await this.handleRepopulate(interaction);
                break;
            case 'check':
                await this.handleCheck(interaction);
                break;
            case 'repopulateall':
                await this.handleRepopulateAll(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand. Please try again.',
                    ephemeral: true
                });
        }
    },

    /**
     * Handle repopulating historical data for a single user
     */
    async handleRepopulate(interaction) {
        await interaction.deferReply();

        try {
            const raUsername = interaction.options.getString('ra_username');
            const skipExisting = interaction.options.getBoolean('skip_existing') ?? false;
            const dryRun = interaction.options.getBoolean('dry_run') ?? false;
            const fromDate = interaction.options.getString('from_date');
            const toDate = interaction.options.getString('to_date');

            // Validate date formats if provided
            if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
                return interaction.editReply('Invalid from_date format. Use YYYY-MM-DD.');
            }
            if (toDate && !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
                return interaction.editReply('Invalid to_date format. Use YYYY-MM-DD.');
            }

            // Find the user first
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply(`User ${raUsername} not found. Please check the username.`);
            }

            const options = {
                skipExisting,
                fromDate,
                toDate,
                dryRun
            };

            // Run the repopulation
            const result = await historicalDataService.repopulateUserHistory(raUsername, options);

            // Create result embed
            const embed = new EmbedBuilder()
                .setTitle(`Historical Data ${dryRun ? 'Preview' : 'Repopulation'} Results`)
                .setColor(dryRun ? '#FFA500' : '#00FF00')
                .setDescription(`Results for **${raUsername}**`)
                .addFields(
                    { 
                        name: 'Summary', 
                        value: `${result.monthsProcessed} months processed\n${result.monthsSkipped} months skipped\n${result.monthsUpdated} months updated`,
                        inline: true 
                    },
                    { 
                        name: 'Monthly Challenges', 
                        value: `${result.monthlyUpdates.length} updates`,
                        inline: true 
                    },
                    { 
                        name: 'Shadow Challenges', 
                        value: `${result.shadowUpdates.length} updates`,
                        inline: true 
                    }
                );

            // Add details about updates if any
            if (result.monthlyUpdates.length > 0) {
                const monthlyDetails = result.monthlyUpdates
                    .slice(0, 5) // Show first 5 to avoid embed limits
                    .map(update => {
                        const progressText = update.progress === 3 ? 'Mastery' : 
                                           update.progress === 2 ? 'Beaten' : 
                                           update.progress === 1 ? 'Participation' : 'None';
                        return `${update.month}: ${progressText} (${update.achievementsEarned}/${update.totalAchievements})`;
                    })
                    .join('\n');
                
                embed.addFields({
                    name: `Monthly Updates${result.monthlyUpdates.length > 5 ? ` (showing first 5 of ${result.monthlyUpdates.length})` : ''}`,
                    value: monthlyDetails || 'None',
                    inline: false
                });
            }

            if (result.shadowUpdates.length > 0) {
                const shadowDetails = result.shadowUpdates
                    .slice(0, 5)
                    .map(update => {
                        const progressText = update.progress === 2 ? 'Beaten' : 
                                           update.progress === 1 ? 'Participation' : 'None';
                        return `${update.month}: ${progressText} (${update.achievementsEarned}/${update.totalAchievements})`;
                    })
                    .join('\n');
                
                embed.addFields({
                    name: `Shadow Updates${result.shadowUpdates.length > 5 ? ` (showing first 5 of ${result.shadowUpdates.length})` : ''}`,
                    value: shadowDetails || 'None',
                    inline: false
                });
            }

            // Add errors if any
            if (result.errors.length > 0) {
                embed.addFields({
                    name: 'Errors',
                    value: result.errors.map(error => `${error.month}: ${error.error}`).join('\n'),
                    inline: false
                });
                embed.setColor('#FF0000');
            }

            if (dryRun) {
                embed.setFooter({ text: 'This was a dry run - no changes were saved. Run without dry_run to apply changes.' });
            } else {
                embed.setFooter({ text: 'Historical data has been updated successfully.' });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in historical repopulation:', error);
            await interaction.editReply(`An error occurred: ${error.message}`);
        }
    },

    /**
     * Handle checking if a user needs repopulation
     */
    async handleCheck(interaction) {
        await interaction.deferReply();

        try {
            const raUsername = interaction.options.getString('ra_username');

            const checkResult = await historicalDataService.checkUserNeedsRepopulation(raUsername);

            const embed = new EmbedBuilder()
                .setTitle('Historical Data Check Results')
                .setColor(checkResult.needsRepopulation ? '#FFA500' : '#00FF00')
                .setDescription(`Analysis for **${raUsername}**`)
                .addFields(
                    { 
                        name: 'Status', 
                        value: checkResult.needsRepopulation ? '⚠️ Needs Repopulation' : '✅ Up to Date',
                        inline: true 
                    },
                    { 
                        name: 'Total Challenges', 
                        value: checkResult.totalChallenges.toString(),
                        inline: true 
                    },
                    { 
                        name: 'Current Data', 
                        value: `Monthly: ${checkResult.currentMonthlyData}\nShadow: ${checkResult.currentShadowData}`,
                        inline: true 
                    }
                );

            if (checkResult.needsRepopulation && checkResult.missingMonths.length > 0) {
                const missingMonthsText = checkResult.missingMonths
                    .slice(0, 10) // Show first 10 to avoid embed limits
                    .join(', ');
                
                embed.addFields({
                    name: `Missing Months${checkResult.missingMonths.length > 10 ? ` (showing first 10 of ${checkResult.missingMonths.length})` : ''}`,
                    value: missingMonthsText,
                    inline: false
                });

                embed.setFooter({ 
                    text: 'Use /adminhistorical repopulate to fix missing data.' 
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error checking historical data:', error);
            await interaction.editReply(`An error occurred: ${error.message}`);
        }
    },

    /**
     * Handle repopulating all users (with confirmation)
     */
    async handleRepopulateAll(interaction) {
        await interaction.deferReply();

        try {
            const skipExisting = interaction.options.getBoolean('skip_existing') ?? true;
            const dryRun = interaction.options.getBoolean('dry_run') ?? true;

            // Get user count first
            const userCount = await User.countDocuments();

            // Create confirmation embed
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Mass Historical Data Repopulation')
                .setColor('#FF6B35')
                .setDescription(
                    `You are about to repopulate historical data for **${userCount} users**.\n\n` +
                    `**Settings:**\n` +
                    `• Skip Existing: ${skipExisting ? 'Yes' : 'No'}\n` +
                    `• Dry Run: ${dryRun ? 'Yes' : 'No'}\n\n` +
                    `${dryRun ? '**This is a dry run - no changes will be saved.**' : '**WARNING: This will modify user data!**'}\n\n` +
                    `This process may take a very long time and will make many API calls to RetroAchievements. ` +
                    `Are you sure you want to continue?`
                )
                .setFooter({ 
                    text: 'This action cannot be undone if not using dry run mode.' 
                });

            // Create confirmation buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_repopulate_all')
                        .setLabel(dryRun ? 'Run Preview' : 'Start Repopulation')
                        .setStyle(dryRun ? ButtonStyle.Primary : ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_repopulate_all')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            const confirmationMessage = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [row]
            });

            // Create collector for button interactions
            const collector = confirmationMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000 // 1 minute timeout
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    await i.reply({ 
                        content: 'Only the admin who initiated this command can confirm it.',
                        ephemeral: true 
                    });
                    return;
                }

                await i.deferUpdate();

                if (i.customId === 'confirm_repopulate_all') {
                    // Disable buttons and show processing message
                    const processingEmbed = new EmbedBuilder()
                        .setTitle('🔄 Processing Historical Data Repopulation')
                        .setColor('#0099FF')
                        .setDescription(
                            `${dryRun ? 'Previewing' : 'Repopulating'} historical data for ${userCount} users...\n\n` +
                            `This may take a while. You will be notified when it completes.`
                        );

                    await i.editReply({
                        embeds: [processingEmbed],
                        components: []
                    });

                    // Run the repopulation
                    try {
                        const options = { skipExisting, dryRun };
                        const results = await historicalDataService.repopulateAllUsersHistory(options);

                        // Create results embed
                        const resultsEmbed = new EmbedBuilder()
                            .setTitle(`${dryRun ? 'Preview' : 'Repopulation'} Complete`)
                            .setColor(results.errors.length > 0 ? '#FFA500' : '#00FF00')
                            .setDescription(`Processed ${results.processedUsers} of ${results.totalUsers} users`)
                            .addFields(
                                { 
                                    name: 'Summary', 
                                    value: `✅ Successful: ${results.processedUsers}\n❌ Errors: ${results.errors.length}`,
                                    inline: true 
                                }
                            );

                        if (results.errors.length > 0) {
                            const errorText = results.errors
                                .slice(0, 5)
                                .map(error => `${error.user}: ${error.error}`)
                                .join('\n');
                            
                            resultsEmbed.addFields({
                                name: `Errors${results.errors.length > 5 ? ` (showing first 5 of ${results.errors.length})` : ''}`,
                                value: errorText,
                                inline: false
                            });
                        }

                        if (dryRun) {
                            resultsEmbed.setFooter({ 
                                text: 'This was a preview - no changes were saved.' 
                            });
                        }

                        await i.editReply({ embeds: [resultsEmbed] });

                    } catch (error) {
                        console.error('Error in mass repopulation:', error);
                        const errorEmbed = new EmbedBuilder()
                            .setTitle('❌ Repopulation Failed')
                            .setColor('#FF0000')
                            .setDescription(`An error occurred: ${error.message}`);

                        await i.editReply({ embeds: [errorEmbed] });
                    }

                } else if (i.customId === 'cancel_repopulate_all') {
                    const cancelEmbed = new EmbedBuilder()
                        .setTitle('❌ Operation Cancelled')
                        .setColor('#808080')
                        .setDescription('Historical data repopulation was cancelled.');

                    await i.editReply({
                        embeds: [cancelEmbed],
                        components: []
                    });
                }

                collector.stop();
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('⏱️ Confirmation Timeout')
                        .setColor('#808080')
                        .setDescription('Confirmation timed out. Operation cancelled.');

                    await interaction.editReply({
                        embeds: [timeoutEmbed],
                        components: []
                    });
                }
            });

        } catch (error) {
            console.error('Error in repopulate all setup:', error);
            await interaction.editReply(`An error occurred: ${error.message}`);
        }
    }
};
