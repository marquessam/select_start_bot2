import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register a new user for challenges')
        .addUserOption(option =>
            option.setName('discord_user')
            .setDescription('The Discord username or ID (can be for users not on server)')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('ra_username')
            .setDescription('The RetroAchievements username')
            .setRequired(true)),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

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

            // Create new user
            const user = new User({
                raUsername,
                discordId: discordUser.id
            });

            await user.save();

            // Get user info for a more detailed response
            const raUserInfo = await retroAPI.getUserInfo(raUsername);

            return interaction.editReply({
                content: `Successfully registered user!\n` +
                    `Discord: ${discordUser.tag}\n` +
                    `RA Username: ${raUsername}\n` +
                    `RA Profile: https://retroachievements.org/user/${raUsername}\n` +
                    `Total Points: ${raUserInfo.points}\n` +
                    `Total Games: ${raUserInfo.totalGames}`
            });

        } catch (error) {
            console.error('Error registering user:', error);
            return interaction.editReply('An error occurred while registering the user. Please try again.');
        }
    }
};
