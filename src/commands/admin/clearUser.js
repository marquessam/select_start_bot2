import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

// Member role ID
const MEMBER_ROLE_ID = '1316292690870014002';

export default {
    data: new SlashCommandBuilder()
        .setName('clearuser')
        .setDescription('Completely clear a user to allow re-registration')
        .addStringOption(option =>
            option.setName('ra_username')
            .setDescription('The RetroAchievements username to clear')
            .setRequired(true))
        .addUserOption(option =>
            option.setName('discord_user')
            .setDescription('The Discord user to clear (optional)')
            .setRequired(false)),

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
            
            // Keep track of cleared users for reporting
            const clearedUsers = [];
            
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
                
                clearedUsers.push({
                    raUsername: user.raUsername,
                    discordInfo
                });
                
                // Delete the user document
                await User.deleteOne({ _id: user._id });
            }
            
            // Generate response message
            let responseContent = `${clearedUsers.length} user(s) cleared successfully:\n\n`;
            
            clearedUsers.forEach((user, index) => {
                responseContent += `${index + 1}. RA Username: ${user.raUsername}\n   Discord: ${user.discordInfo}\n\n`;
            });
            
            responseContent += 'These users can now be re-registered.';
            
            return interaction.editReply({
                content: responseContent
            });

        } catch (error) {
            console.error('Error clearing user:', error);
            return interaction.editReply('An error occurred while clearing the user data. Please try again.');
        }
    }
};
