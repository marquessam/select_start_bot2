import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register a new user for challenges')
        .addStringOption(option =>
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
            const discordUserInput = interaction.options.getString('discord_user');
            const raUsername = interaction.options.getString('ra_username');
            
            let discordId = discordUserInput;
            let discordTag = discordUserInput;
            
            // Try to fetch the Discord user if they're on the server
            try {
                // Check if input looks like a Discord ID (all numbers)
                if (/^\d+$/.test(discordUserInput)) {
                    const user = await interaction.client.users.fetch(discordUserInput);
                    if (user) {
                        discordId = user.id;
                        discordTag = user.tag;
                    }
                } else {
                    // Try to find the user in the server members by username
                    const guild = interaction.guild;
                    const members = await guild.members.fetch();
                    const member = members.find(m => 
                        m.user.username.toLowerCase() === discordUserInput.toLowerCase() || 
                        m.user.tag.toLowerCase() === discordUserInput.toLowerCase()
                    );
                    
                    if (member) {
                        discordId = member.user.id;
                        discordTag = member.user.tag;
                    }
                }
            } catch (error) {
                console.log(`User not found on server, continuing with provided input: ${discordUserInput}`);
                // We'll continue with the provided input
            }

            // Check if user already exists
            const existingUser = await User.findOne({
                $or: [
                    { discordId },
                    { raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') } }
                ]
            });

            if (existingUser) {
                return interaction.editReply(
                    'This user is already registered. ' +
                    `${existingUser.discordId === discordId ? 'Discord user' : 'RA username'} is already in use.`
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
                discordId
            });

            await user.save();

            // Get user info for a more detailed response
            const raUserInfo = await retroAPI.getUserInfo(raUsername);

            return interaction.editReply({
                content: `Successfully registered user!\n` +
                    `Discord: ${discordTag}\n` +
                    `RA Username: ${raUsername}\n` +
                    `RA Profile: https://retroachievements.org/user/${raUsername}\n` +
                    `Total Points: ${raUserInfo?.points || 'N/A'}\n` +
                    `Total Games: ${raUserInfo?.totalGames || 'N/A'}`
            });

        } catch (error) {
            console.error('Error registering user:', error);
            return interaction.editReply('An error occurred while registering the user. Please try again.');
        }
    }
};
