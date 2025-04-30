import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clearnominations')
        .setDescription('Clear user nominations (Admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Clear a specific user\'s nominations')
                .addStringOption(option =>
                    option.setName('ra_username')
                    .setDescription('The RetroAchievements username')
                    .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('all')
                .setDescription('Clear ALL users\' nominations (use with caution)')
                .addBooleanOption(option =>
                    option.setName('confirm')
                    .setDescription('Confirm that you want to clear ALL nominations')
                    .setRequired(true))),

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
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'user') {
                // Clear nominations for a specific user
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
            } 
            else if (subcommand === 'all') {
                // Clear nominations for ALL users
                const confirmed = interaction.options.getBoolean('confirm');
                
                if (!confirmed) {
                    return interaction.editReply('Operation cancelled. You must confirm to clear ALL nominations.');
                }
                
                // Get all users with nominations
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
