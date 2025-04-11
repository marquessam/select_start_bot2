// Add this command to src/commands/admin/resetAchievements.js or similar

import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import achievementFeedService from '../../services/achievementFeedService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('resetachievements')
        .setDescription('Reset achievement announcement history for a user')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('RetroAchievements username')
                .setRequired(true)),
    
    async execute(interaction) {
        // Check for admin permissions
        if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

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
};
