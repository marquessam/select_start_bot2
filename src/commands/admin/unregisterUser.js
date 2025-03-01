import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unregister')
        .setDescription('Unregister a user from the system')
        .addStringOption(option =>
            option.setName('ra_username')
            .setDescription('The RetroAchievements username to unregister')
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
    }
};
