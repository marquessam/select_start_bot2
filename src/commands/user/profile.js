import { SlashCommandBuilder } from '@discordjs/builders';
import { User } from '../../models/index.js';
import { leaderboardService } from '../../services/index.js';
import { createErrorEmbed, isValidRAUsername } from '../../utils/index.js';

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View a user\'s profile and achievements')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('RetroAchievements username (leave empty for your own profile)')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            // Get target username
            let username = interaction.options.getString('username');
            if (!username) {
                // If no username provided, look up the Discord user's linked RA account
                const user = await User.findOne({ discordId: interaction.user.id });
                if (!user) {
                    return interaction.editReply({
                        embeds: [createErrorEmbed(
                            'Profile Not Found',
                            'You haven\'t linked your RetroAchievements account yet. Use `/register` to link your account.'
                        )]
                    });
                }
                username = user.raUsername;
            } else if (!isValidRAUsername(username)) {
                return interaction.editReply({
                    embeds: [createErrorEmbed(
                        'Invalid Username',
                        'The provided username contains invalid characters. RetroAchievements usernames can only contain letters, numbers, and underscores.'
                    )]
                });
            }

            // Generate profile embed
            const embed = await leaderboardService.generateUserProfile(username);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error executing profile command:', error);

            const errorEmbed = createErrorEmbed(
                'Error',
                error.message === 'User not found'
                    ? 'User not found. Make sure the RetroAchievements username is correct.'
                    : 'An error occurred while fetching the profile. Please try again later.'
            );

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
