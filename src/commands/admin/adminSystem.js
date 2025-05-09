import { 
    SlashCommandBuilder,
    PermissionFlagsBits
} from 'discord.js';
import { config } from '../../config/config.js';
import statsUpdateService from '../../services/statsUpdateService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminsystem')
        .setDescription('System-level administrative functions')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Force an immediate update of all user stats and leaderboards')
        ),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        switch(subcommand) {
            case 'update':
                await this.handleForceUpdate(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand. Please try again.',
                    ephemeral: true
                });
        }
    },

    /**
     * Handle force update stats
     */
    async handleForceUpdate(interaction) {
        await interaction.deferReply();

        try {
            // Check if an update is already in progress
            if (statsUpdateService.isUpdating) {
                return interaction.editReply('An update is already in progress. Please wait for it to complete.');
            }

            // Start the update
            await interaction.editReply('Starting stats update. This may take a few minutes...');
            
            // Force the update by bypassing the isUpdating check
            const originalIsUpdating = statsUpdateService.isUpdating;
            statsUpdateService.isUpdating = false;
            
            await statsUpdateService.start();
            
            // Restore the original state
            statsUpdateService.isUpdating = originalIsUpdating;

            return interaction.editReply('Stats update completed successfully!');
        } catch (error) {
            console.error('Error forcing stats update:', error);
            return interaction.editReply('An error occurred while updating stats. Please try again.');
        }
    }
};
