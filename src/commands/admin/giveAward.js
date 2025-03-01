import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('giveaward')
        .setDescription('Give a community award to a user')
        .addStringOption(option =>
            option.setName('username')
            .setDescription('The RetroAchievements username')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
            .setDescription('The title of the award')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('points')
            .setDescription('Number of points for this award')
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
            const title = interaction.options.getString('title');
            const points = interaction.options.getInteger('points');

            // Find the user
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply('User not found. Please check the username or register the user first.');
            }

            // Add the community award
            user.communityAwards.push({
                title,
                points,
                awardedBy: interaction.user.tag
            });

            await user.save();

            return interaction.editReply({
                content: `Successfully awarded "${title}" (${points} points) to ${raUsername}!`
            });

        } catch (error) {
            console.error('Error giving community award:', error);
            return interaction.editReply('An error occurred while giving the award. Please try again.');
        }
    }
};