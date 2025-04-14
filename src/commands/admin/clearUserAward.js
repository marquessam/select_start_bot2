import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clearuseraward')
        .setDescription('Remove a specific community award from a user')
        .addStringOption(option =>
            option.setName('username')
            .setDescription('The RetroAchievements username')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('index')
            .setDescription('The index number of the award to remove (from viewuserawards command)')
            .setRequired(true)
            .setMinValue(1)),

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
            const raUsername = interaction.options.getString('username');
            const awardIndex = interaction.options.getInteger('index') - 1; // Convert to 0-based index

            // Find the user, case-insensitive search
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply(`User "${raUsername}" not found. Please check the username or register the user first.`);
            }

            // Check if the user has any awards
            if (!user.communityAwards || user.communityAwards.length === 0) {
                return interaction.editReply(`User "${user.raUsername}" has no community awards to remove.`);
            }

            // Check if the index is valid
            if (awardIndex < 0 || awardIndex >= user.communityAwards.length) {
                return interaction.editReply(`Invalid award index. Use \`/viewuserawards username:${user.raUsername}\` to see available awards.`);
            }

            // Store the award details for confirmation
            const award = user.communityAwards[awardIndex];
            const awardTitle = award.title;
            const awardPoints = award.points;

            // Remove the award from the array
            user.communityAwards.splice(awardIndex, 1);
            await user.save();

            return interaction.editReply(`Successfully removed award "${awardTitle}" (${awardPoints} points) from ${user.raUsername}.`);

        } catch (error) {
            console.error('Error clearing user award:', error);
            return interaction.editReply('An error occurred while removing the award. Please try again.');
        }
    }
};
