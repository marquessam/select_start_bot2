import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminaward')
        .setDescription('Manage community awards and points')
        .setDefaultMemberPermissions('0') // Only visible to users with Administrator permission
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
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
                    .setMinValue(1))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View all community awards for a user')
                .addStringOption(option =>
                    option.setName('username')
                    .setDescription('The RetroAchievements username')
                    .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Remove a specific community award from a user')
                .addStringOption(option =>
                    option.setName('username')
                    .setDescription('The RetroAchievements username')
                    .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('index')
                    .setDescription('The index number of the award to remove (from view command)')
                    .setRequired(true)
                    .setMinValue(1))
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
            case 'give':
                await this.handleGiveAward(interaction);
                break;
            case 'view':
                await this.handleViewAwards(interaction);
                break;
            case 'clear':
                await this.handleClearAward(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand. Please try again.',
                    ephemeral: true
                });
        }
    },

    /**
     * Handle giving an award to a user
     */
    async handleGiveAward(interaction) {
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
                awardedBy: interaction.user.tag,
                awardedAt: new Date()
            });

            await user.save();

            return interaction.editReply({
                content: `Successfully awarded "${title}" (${points} point${points !== 1 ? 's' : ''}) to ${raUsername}!`
            });

        } catch (error) {
            console.error('Error giving community award:', error);
            return interaction.editReply('An error occurred while giving the award. Please try again.');
        }
    },

    /**
     * Handle viewing a user's awards
     */
    async handleViewAwards(interaction) {
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
            response += `\n\nTo remove an award, use \`/adminaward clear username:${user.raUsername} index:<number>\``;

            return interaction.editReply(response);

        } catch (error) {
            console.error('Error viewing user awards:', error);
            return interaction.editReply('An error occurred while retrieving user awards. Please try again.');
        }
    },

    /**
     * Handle clearing a specific award
     */
    async handleClearAward(interaction) {
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
                return interaction.editReply(`Invalid award index. Use \`/adminaward view username:${user.raUsername}\` to see available awards.`);
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
