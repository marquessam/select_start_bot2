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
import { config } from '../../config/config.js';

// Member role ID
const MEMBER_ROLE_ID = '1316292690870014002';

export default {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register a new user for challenges')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Admin command
        .addUserOption(option =>
            option.setName('discord_user')
            .setDescription('The Discord username or ID (can be for users not on server)')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('ra_username')
            .setDescription('The RetroAchievements username')
            .setRequired(true)),

    async execute(interaction) {
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

                    // Get user info for a more detailed response
                    const raUserInfo = await retroAPI.getUserInfo(raUsername);

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
                               `RA Profile: https://retroachievements.org/user/${raUsername}\n` +
                               `Total Points: ${raUserInfo.points}\n` +
                               `Total Games: ${raUserInfo.totalGames}`,
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
    }
};
