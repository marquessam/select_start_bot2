import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { User } from '../../models/User.js';
import { Poll } from '../../models/Poll.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminresetvote')
        .setDescription('Reset a user\'s vote in the current poll')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Only visible to users with administrative permissions
        .addUserOption(option =>
            option.setName('discord_user')
            .setDescription('The Discord user whose vote to reset')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('ra_username')
            .setDescription('The RetroAchievements username whose vote to reset')
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
            // Check that at least one identifier is provided
            const discordUser = interaction.options.getUser('discord_user');
            const raUsername = interaction.options.getString('ra_username');

            if (!discordUser && !raUsername) {
                return interaction.editReply('You must provide either a Discord user or a RetroAchievements username.');
            }

            // Get the active poll
            const activePoll = await Poll.findActivePoll();
            if (!activePoll) {
                return interaction.editReply('There is no active voting poll right now.');
            }

            // Find the user
            let userId = null;
            let displayName = null;

            if (discordUser) {
                // If Discord user is provided, use their ID directly
                userId = discordUser.id;
                displayName = discordUser.tag;
            } else if (raUsername) {
                // If RA username is provided, look up their Discord ID
                const user = await User.findOne({
                    raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
                });

                if (!user) {
                    return interaction.editReply(`User with RetroAchievements username "${raUsername}" not found.`);
                }

                userId = user.discordId;
                displayName = `${raUsername} (Discord: ${user.discordId})`;
            }

            // Check if user has voted
            const hasVoted = activePoll.hasUserVoted(userId);
            if (!hasVoted) {
                return interaction.editReply(`${displayName} has not voted in the current poll.`);
            }

            // Find the user's vote to get details for logging
            const userVote = activePoll.votes.find(vote => vote.userId === userId);
            let voteDetails = 'Unknown vote details';

            if (userVote && userVote.gameIds) {
                const votedGames = userVote.gameIds.map(gameId => {
                    const game = activePoll.selectedGames.find(g => g.gameId === gameId);
                    return game ? game.title : `Game ID: ${gameId}`;
                });
                voteDetails = votedGames.join(', ');
            }

            // Remove the vote
            activePoll.votes = activePoll.votes.filter(vote => vote.userId !== userId);
            await activePoll.save();

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setTitle('🗳️ Vote Reset Successfully')
                .setDescription(`The vote for **${displayName}** has been reset.`)
                .addFields(
                    { name: 'Previous Vote', value: voteDetails, inline: false },
                    { name: 'Status', value: 'This user can now vote again.', inline: false }
                )
                .setColor('#00AAFF')
                .setTimestamp();

            // Log the action
            try {
                const adminLogChannel = await interaction.client.channels.fetch(config.discord.adminLogChannelId);
                if (adminLogChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('Admin Action: Vote Reset')
                        .setDescription(`An admin has reset a user's vote in the current poll.`)
                        .addFields(
                            { name: 'User', value: displayName, inline: true },
                            { name: 'Admin', value: interaction.user.tag, inline: true },
                            { name: 'Previous Vote', value: voteDetails, inline: false }
                        )
                        .setColor('#FFA500')
                        .setTimestamp();
                    
                    await adminLogChannel.send({ embeds: [logEmbed] });
                }
            } catch (logError) {
                console.error('Error logging vote reset:', logError);
                // Continue even if logging fails
            }

            return interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('Error resetting vote:', error);
            return interaction.editReply('An error occurred while resetting the vote. Please try again.');
        }
    }
};
