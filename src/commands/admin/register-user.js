import { SlashCommandBuilder } from '@discordjs/builders';
import { User } from '../../models/index.js';
import { retroAPI } from '../../services/index.js';
import { createErrorEmbed, createSuccessEmbed, isValidRAUsername } from '../../utils/index.js';
import { canManageUsers } from '../../utils/permissions.js';

export default {
    data: new SlashCommandBuilder()
        .setName('register-user')
        .setDescription('Register a user\'s RetroAchievements account')
        .addUserOption(option =>
            option.setName('discord_user')
                .setDescription('Discord user to register')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('ra_username')
                .setDescription('RetroAchievements username')
                .setRequired(true)),

    async execute(interaction) {
        try {
            // Check permissions
            if (!canManageUsers(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed(
                        'Permission Denied',
                        'You do not have permission to register users.'
                    )],
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const discordUser = interaction.options.getUser('discord_user');
            const raUsername = interaction.options.getString('ra_username');

            // Validate username format
            if (!isValidRAUsername(raUsername)) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Invalid Username',
                        'The provided username contains invalid characters. RetroAchievements usernames can only contain letters, numbers, and underscores.'
                    )]
                });
            }

            // Check if user already exists
            const existingUser = await User.findOne({
                $or: [
                    { discordId: discordUser.id },
                    { raUsernameLower: raUsername.toLowerCase() }
                ]
            });

            if (existingUser) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'User Already Registered',
                        existingUser.discordId === discordUser.id
                            ? `This Discord user is already registered with RetroAchievements username: ${existingUser.raUsername}`
                            : `The RetroAchievements username ${raUsername} is already registered to another Discord user.`
                    )]
                });
            }

            // Validate RetroAchievements username exists
            const isValid = await retroAPI.validateUser(raUsername);
            if (!isValid) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Invalid Username',
                        'This RetroAchievements username does not exist. Please check the spelling and try again.'
                    )]
                });
            }

            // Create new user
            const user = new User({
                raUsername: raUsername,
                raUsernameLower: raUsername.toLowerCase(),
                discordId: discordUser.id,
                isActive: true,
                joinDate: new Date()
            });

            await user.save();

            // Send success message
            await interaction.editReply({
                embeds: [createSuccessEmbed(
                    'User Registered',
                    `Successfully registered Discord user ${discordUser.tag} with RetroAchievements username: ${raUsername}`
                )]
            });

        } catch (error) {
            console.error('Error executing register-user command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                'An error occurred while registering the user. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
