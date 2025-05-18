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
import retroAPI from '../../services/retroAPI.js';
import achievementFeedService from '../../services/achievementFeedService.js';
import { config } from '../../config/config.js';

// Member role ID
const MEMBER_ROLE_ID = '1316292690870014002';

export default {
    data: new SlashCommandBuilder()
        .setName('adminuser')
        .setDescription('Manage user accounts and profiles')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('register')
                .setDescription('Register a user for challenges')
                .addUserOption(option =>
                    option.setName('discord_user')
                    .setDescription('The Discord user to register')
                    .setRequired(true))
                .addStringOption(option =>
                    option.setName('ra_username')
                    .setDescription('The RetroAchievements username')
                    .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('unregister')
                .setDescription('Unregister a user from the system')
                .addStringOption(option =>
                    option.setName('ra_username')
                    .setDescription('The RetroAchievements username to unregister')
                    .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('purge')
                .setDescription('Completely remove a user registration to allow re-registration')
                .addStringOption(option =>
                    option.setName('ra_username')
                    .setDescription('The RetroAchievements username to purge')
                    .setRequired(true))
                .addUserOption(option =>
                    option.setName('discord_user')
                    .setDescription('The Discord user to purge (optional)')
                    .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resetachievements')
                .setDescription('Reset achievement announcement history for a user')
                .addStringOption(option =>
                    option.setName('username')
                    .setDescription('RetroAchievements username')
                    .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clearnominations')
                .setDescription('Clear a user\'s current nominations')
                .addStringOption(option =>
                    option.setName('ra_username')
                    .setDescription('The RetroAchievements username')
                    .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setgp')
                .setDescription('Set a user\'s GP balance')
                .addStringOption(option =>
                    option.setName('ra_username')
                    .setDescription('The RetroAchievements username')
                    .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                    .setDescription('The amount of GP to set')
                    .setRequired(true))
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
            case 'register':
                await this.handleRegister(interaction);
                break;
            case 'unregister':
                await this.handleUnregister(interaction);
                break;
            case 'purge':
                await this.handlePurge(interaction);
                break;
            case 'resetachievements':
                await this.handleResetAchievements(interaction);
                break;
            case 'clearnominations':
                await this.handleClearNominations(interaction);
                break;
            case 'setgp':
                await this.handleSetGP(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand. Please try again.',
                    ephemeral: true
                });
        }
    },

    /**
     * Handle registering a user
     */
    async handleRegister(interaction) {
        await interaction.deferReply();

        try {
            const discordUser = interaction.options.getUser('discord_user');
            const raUsername = interaction.options.getString('ra_username');

            // Check if user already exists
            const existingUser = await User.findOne({
                $or: [
                    { discordId: discordUser.id },
                    { raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') } }
                ]
            });

            if (existingUser) {
                return interaction.editReply(
                    'This user is already registered. ' +
                    `${existingUser.discordId === discordUser.id ? 'Discord ID' : 'RA username'} is already in use.`
                );
            }

            // Validate RA username exists
            const isValidUser = await retroAPI.validateUser(raUsername);
            if (!isValidUser) {
                return interaction.editReply('Invalid RetroAchievements username. Please check the username and try again.');
            }

            // Create guidelines confirmation embed
            const guidelinesEmbed = new EmbedBuilder()
                .setTitle('Community Guidelines Confirmation')
                .setDescription(`Please confirm that ${discordUser.tag} understands and agrees to the following community guidelines:`)
                .setColor('#3498DB')
                .addFields(
                    {
                        name: '⚠️ Hardcore Mode Required',
                        value: 'All achievements must be earned in RetroAchievements **Hardcore Mode**. Save states and rewind features are **not allowed**.'
                    },
                    {
                        name: '📆 Challenge Timeframe',
                        value: 'Achievements must be earned within the challenge month to be counted toward standings.'
                    },
                    {
                        name: '👥 Community Conduct',
                        value: 'Members must maintain respectful communication and follow all community rules.'
                    },
                    {
                        name: '📋 Full Rules',
                        value: 'Please read the complete rules using the `/rules` command at your convenience.'
                    }
                )
                .setFooter({ text: 'You must acknowledge these guidelines to complete registration' });

            // Create confirmation buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm')
                        .setLabel('I Understand & Agree')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('cancel')
                        .setLabel('Cancel Registration')
                        .setStyle(ButtonStyle.Danger)
                );

            // Send embed with buttons
            const confirmationMessage = await interaction.editReply({
                content: `Registration for ${discordUser.tag} (${raUsername}) requires confirmation:`,
                embeds: [guidelinesEmbed],
                components: [row]
            });

            // Create collector for button interactions
            const collector = confirmationMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 120000 // 2 minute timeout
            });

            // Handle button clicks
            collector.on('collect', async (i) => {
                // Only allow the original interaction user to confirm
                if (i.user.id !== interaction.user.id) {
                    await i.reply({ 
                        content: 'Only the admin who initiated this registration can confirm it.',
                        ephemeral: true 
                    });
                    return;
                }

                await i.deferUpdate();

                if (i.customId === 'confirm') {
                    // Create new user in database
                    const user = new User({
                        raUsername,
                        discordId: discordUser.id
                    });
                    
                    await user.save();

                    // Assign role if user is in the server
                    try {
                        const guildMember = interaction.guild.members.cache.get(discordUser.id);
                        if (guildMember) {
                            await guildMember.roles.add(MEMBER_ROLE_ID);
                        }
                    } catch (roleError) {
                        console.error('Error assigning role:', roleError);
                        // Continue with registration even if role assignment fails
                    }

                    // Disable buttons
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('confirm_disabled')
                                .setLabel('Registration Confirmed')
                                .setStyle(ButtonStyle.Success)
                                .setDisabled(true)
                        );

                    // Update message with registration confirmation
                    await i.editReply({
                        content: `✅ Successfully registered user!\n` +
                               `Discord: ${discordUser.tag}\n` +
                               `RA Username: ${raUsername}\n` +
                               `RA Profile: https://retroachievements.org/user/${raUsername}`,
                        embeds: [],
                        components: [disabledRow]
                    });

                } else if (i.customId === 'cancel') {
                    // Disable buttons
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('cancel_disabled')
                                .setLabel('Registration Cancelled')
                                .setStyle(ButtonStyle.Danger)
                                .setDisabled(true)
                        );

                    // Update message with cancellation confirmation
                    await i.editReply({
                        content: `❌ Registration cancelled for ${discordUser.tag} (${raUsername}).`,
                        embeds: [],
                        components: [disabledRow]
                    });
                }

                // Stop collector after handling button
                collector.stop();
            });

            // Handle collector end (timeout)
            collector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    // If timeout with no interactions
                    const timeoutRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('timeout')
                                .setLabel('Registration Timed Out')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true)
                        );

                    await interaction.editReply({
                        content: `⏱️ Registration timed out for ${discordUser.tag} (${raUsername}). Please try again.`,
                        embeds: [],
                        components: [timeoutRow]
                    });
                }
            });

        } catch (error) {
            console.error('Error during registration process:', error);
            return interaction.editReply('An error occurred while processing the registration. Please try again.');
        }
    },

    /**
     * Handle unregistering a user
     */
    async handleUnregister(interaction) {
        await interaction.deferReply();

        try {
            const raUsername = interaction.options.getString('ra_username');

            // Find the user
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply('User not found. Please check the username.');
            }

            // Get Discord user info for the response
            let discordUserInfo = 'Unknown Discord user';
            try {
                const discordUser = await interaction.client.users.fetch(user.discordId);
                if (discordUser) {
                    discordUserInfo = discordUser.tag;
                }
            } catch (error) {
                console.error('Error fetching Discord user:', error);
            }

            // Delete the user
            await User.deleteOne({ _id: user._id });

            return interaction.editReply({
                content: `Successfully unregistered user!\n` +
                    `RA Username: ${user.raUsername}\n` +
                    `Discord: ${discordUserInfo}`
            });

        } catch (error) {
            console.error('Error unregistering user:', error);
            return interaction.editReply('An error occurred while unregistering the user. Please try again.');
        }
    },

    /**
     * Handle purging a user registration
     */
    async handlePurge(interaction) {
        await interaction.deferReply();

        try {
            const raUsername = interaction.options.getString('ra_username');
            const discordUser = interaction.options.getUser('discord_user');
            
            // Build query based on provided information
            let query = {
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            };
            
            // If Discord user is provided, add to query
            if (discordUser) {
                query = {
                    $or: [
                        { raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') } },
                        { discordId: discordUser.id }
                    ]
                };
            }

            // Find all matching users
            const users = await User.find(query);
            
            if (users.length === 0) {
                return interaction.editReply('No users found matching the provided criteria.');
            }
            
            // Keep track of purged users for reporting
            const purgedUsers = [];
            
            // Process each matching user
            for (const user of users) {
                // Try to remove member role if discord user is in the server
                try {
                    if (user.discordId) {
                        const member = interaction.guild.members.cache.get(user.discordId);
                        if (member) {
                            await member.roles.remove(MEMBER_ROLE_ID);
                        }
                    }
                } catch (roleError) {
                    console.error('Error removing role:', roleError);
                    // Continue with deletion even if role removal fails
                }
                
                // Track user info for response
                let discordInfo = 'Unknown Discord user';
                try {
                    if (user.discordId) {
                        const discordMember = await interaction.client.users.fetch(user.discordId);
                        if (discordMember) {
                            discordInfo = discordMember.tag;
                        }
                    }
                } catch (fetchError) {
                    console.error('Error fetching Discord user:', fetchError);
                }
                
                purgedUsers.push({
                    raUsername: user.raUsername,
                    discordInfo
                });
                
                // Delete the user document
                await User.deleteOne({ _id: user._id });
            }
            
            // Generate response message
            let responseContent = `${purgedUsers.length} user registration(s) purged successfully:\n\n`;
            
            purgedUsers.forEach((user, index) => {
                responseContent += `${index + 1}. RA Username: ${user.raUsername}\n   Discord: ${user.discordInfo}\n\n`;
            });
            
            responseContent += 'These users can now be re-registered.';
            
            return interaction.editReply({
                content: responseContent
            });

        } catch (error) {
            console.error('Error purging registration:', error);
            return interaction.editReply('An error occurred while purging the user registration. Please try again.');
        }
    },

    /**
     * Handle resetting achievements for a user
     */
    async handleResetAchievements(interaction) {
        await interaction.deferReply();
        
        const raUsername = interaction.options.getString('username');
        
        try {
            // Call the clearUserAchievements method in achievementFeedService
            const success = await achievementFeedService.clearUserAchievements(raUsername);
            
            if (success) {
                await interaction.editReply(`Successfully reset achievement history for ${raUsername}.`);
            } else {
                await interaction.editReply(`Failed to reset achievement history for ${raUsername}.`);
            }
        } catch (error) {
            console.error('Error resetting achievement history:', error);
            await interaction.editReply('An error occurred while resetting achievement history.');
        }
    },

    /**
     * Handle clearing nominations for a user
     */
    async handleClearNominations(interaction) {
        await interaction.deferReply();

        try {
            const raUsername = interaction.options.getString('ra_username');

            // Find the user
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply('User not found. Please check the username.');
            }

            // Get current nominations count before clearing
            const currentNominations = user.getCurrentNominations();
            const nominationCount = currentNominations.length;

            if (nominationCount === 0) {
                return interaction.editReply(`${raUsername} has no current nominations to clear.`);
            }

            // Clear the current nominations
            user.clearCurrentNominations();
            await user.save();

            return interaction.editReply({
                content: `Successfully cleared ${nominationCount} nomination${nominationCount !== 1 ? 's' : ''} for ${raUsername}. They can now nominate again.`
            });

        } catch (error) {
            console.error('Error clearing nominations:', error);
            return interaction.editReply('An error occurred while clearing nominations. Please try again.');
        }
    },

    /**
     * Handle setting a user's GP balance
     */
    async handleSetGP(interaction) {
        await interaction.deferReply();

        try {
            const raUsername = interaction.options.getString('ra_username');
            const amount = interaction.options.getInteger('amount');

            // Find the user
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply('User not found. Please check the username.');
            }

            // Get previous GP amount for the log
            const previousGP = user.gp || 0;

            // Set the GP amount
            user.gp = amount;
            await user.save();

            // Create an embed with details
            const embed = new EmbedBuilder()
                .setTitle('GP Balance Updated')
                .setColor('#00FF00')
                .setDescription(`Successfully updated GP balance for **${user.raUsername}**`)
                .addFields(
                    { name: 'Previous Balance', value: `${previousGP.toLocaleString()} GP`, inline: true },
                    { name: 'New Balance', value: `${amount.toLocaleString()} GP`, inline: true },
                    { name: 'Change', value: `${(amount - previousGP).toLocaleString()} GP`, inline: true }
                )
                .setTimestamp();

            // Log this action to admin log
            try {
                const adminLogChannel = await interaction.client.channels.fetch(config.discord.adminLogChannelId);
                if (adminLogChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('Admin Action: GP Balance Modified')
                        .setColor('#FFA500')
                        .setDescription(`An admin has modified a user's GP balance.`)
                        .addFields(
                            { name: 'User', value: user.raUsername, inline: true },
                            { name: 'Admin', value: interaction.user.tag, inline: true },
                            { name: 'Previous Balance', value: `${previousGP.toLocaleString()} GP`, inline: true },
                            { name: 'New Balance', value: `${amount.toLocaleString()} GP`, inline: true },
                            { name: 'Change', value: `${(amount - previousGP).toLocaleString()} GP`, inline: true }
                        )
                        .setTimestamp();
                    
                    await adminLogChannel.send({ embeds: [logEmbed] });
                }
            } catch (logError) {
                console.error('Error logging GP adjustment:', logError);
                // Continue even if logging fails
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error setting GP balance:', error);
            return interaction.editReply('An error occurred while setting the GP balance. Please try again.');
        }
    }
};
