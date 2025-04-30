import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clearnominations')
        .setDescription('Clear a user\'s current nominations (Admin only)')
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

        } catch (error) {
            console.error('Error clearing nominations:', error);
            return interaction.editReply('An error occurred while clearing nominations. Please try again.');
        }
    }
};
