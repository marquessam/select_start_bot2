import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('viewuserawards')
        .setDescription('View all community awards for a user')
        .addStringOption(option =>
            option.setName('username')
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
            const raUsername = interaction.options.getString('username');

            // Find the user, case-insensitive search
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply(`User "${raUsername}" not found. Please check the username or register the user first.`);
            }

            // Check if the user has any awards
            if (!user.communityAwards || user.communityAwards.length === 0) {
                return interaction.editReply(`User "${user.raUsername}" has no community awards.`);
            }

            // Format awards for display
            let response = `**Community Awards for ${user.raUsername}:**\n\n`;
            
            user.communityAwards.forEach((award, index) => {
                const awardDate = award.awardedAt ? new Date(award.awardedAt).toLocaleDateString() : 'Unknown date';
                response += `**${index + 1}.** "${award.title}" (${award.points} point${award.points !== 1 ? 's' : ''})\n`;
                response += `   Awarded by: ${award.awardedBy || 'System'} on ${awardDate}\n\n`;
            });
            
            // Add total points
            const totalPoints = user.communityAwards.reduce((sum, award) => sum + award.points, 0);
            response += `**Total Points:** ${totalPoints}`;
            
            // Add instruction for deleting awards
            response += `\n\nTo remove an award, use \`/clearuseraward username:${user.raUsername} index:<number>\``;

            return interaction.editReply(response);

        } catch (error) {
            console.error('Error viewing user awards:', error);
            return interaction.editReply('An error occurred while retrieving user awards. Please try again.');
        }
    }
};
