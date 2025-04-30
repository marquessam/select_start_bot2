import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clearnominations')
        .setDescription('Clear user nominations (Admin only)')
        .addStringOption(option =>
            option.setName('ra_username')
            .setDescription('The RetroAchievements username (leave empty to clear ALL nominations)')
            .setRequired(false))
        .addBooleanOption(option =>
            option.setName('confirm_all')
            .setDescription('Confirm clearing ALL nominations (required if ra_username is empty)')
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
            const confirmAll = interaction.options.getBoolean('confirm_all');
            
            // Clear a specific user's nominations
            if (raUsername) {
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
            } 
            // Clear ALL users' nominations
            else {
                // Require confirmation
                if (!confirmAll) {
                    return interaction.editReply('You must set confirm_all to true when clearing ALL nominations.');
                }
                
                // Get all users
                const users = await User.find({});
                let totalCleared = 0;
                let usersAffected = 0;
                
                for (const user of users) {
                    const currentNominations = user.getCurrentNominations();
                    if (currentNominations.length > 0) {
                        totalCleared += currentNominations.length;
                        usersAffected++;
                        
                        user.clearCurrentNominations();
                        await user.save();
                    }
                }
                
                if (totalCleared === 0) {
                    return interaction.editReply('No nominations found to clear.');
                }
                
                return interaction.editReply({
                    content: `✅ Successfully cleared ${totalCleared} nomination${totalCleared !== 1 ? 's' : ''} from ${usersAffected} user${usersAffected !== 1 ? 's' : ''}.`
                });
            }
        } catch (error) {
            console.error('Error clearing nominations:', error);
            return interaction.editReply('An error occurred while clearing nominations. Please try again.');
        }
    }
};
