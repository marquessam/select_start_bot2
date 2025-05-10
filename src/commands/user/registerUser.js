import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

// Member role ID
const MEMBER_ROLE_ID = '1316292690870014002';
// Registration channel ID
const REGISTRATION_CHANNEL_ID = '1302430855330795531';

export default {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register yourself for RetroAchievements challenges')
        .addStringOption(option =>
            option.setName('ra_username')
            .setDescription('Your RetroAchievements username')
            .setRequired(true)),

    async execute(interaction) {
        // Check if command is used in the correct channel
        if (interaction.channelId !== REGISTRATION_CHANNEL_ID) {
            return interaction.reply({ 
                content: `This command can only be used in <#${REGISTRATION_CHANNEL_ID}>. Please head there to register!`, 
                ephemeral: true 
            });
        }

        // If in the correct channel, proceed with non-ephemeral reply
        await interaction.deferReply({ ephemeral: false });

        try {
            const discordUser = interaction.user;
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
                    'You are already registered. ' +
                    `${existingUser.discordId === discordUser.id ? 'Your Discord ID' : 'This RA username'} is already in use.`
                );
            }

            // Validate RA username exists
            const isValidUser = await retroAPI.validateUser(raUsername);
            if (!isValidUser) {
                return interaction.editReply('Invalid RetroAchievements username. Please check your username and try again.');
            }

            // Create guidelines confirmation embed
            const guidelinesEmbed = new EmbedBuilder()
                .setTitle('Community Guidelines Confirmation')
                .setDescription(`Please confirm that you understand and agree to the following community guidelines:`)
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
                content: `Please confirm your registration with RetroAchievements username: **${raUsername}**`,
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
                        content: 'Only the user who initiated this registration can confirm it.',
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
                        content: `✅ Registration successful!\n` +
                               `Your RetroAchievements account **${raUsername}** has been linked to your Discord account.\n` +
                               `RA Profile: https://retroachievements.org/user/${raUsername}\n` +
                               `Total Points: ${raUserInfo.points}\n` +
                               `Total Games: ${raUserInfo.totalGames}\n\n` +
                               `You've been assigned the Member role and can now participate in challenges!`,
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
                        content: `❌ Registration cancelled.`,
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
                        content: `⏱️ Registration timed out. Please try again if you still want to register.`,
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
