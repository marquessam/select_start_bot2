import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Poll } from '../../models/Poll.js';
import { config } from '../../config/config.js';
import schedule from 'node-schedule';

export default {
    data: new SlashCommandBuilder()
        .setName('cancelvoting')
        .setDescription('Cancel the current voting poll without announcing results'),

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
            // Find the active poll
            const activePoll = await Poll.findActivePoll();
            if (!activePoll) {
                return interaction.editReply('There is no active voting poll to cancel.');
            }

            // Cancel the scheduled job if it exists
            if (activePoll.scheduledJobName) {
                const job = schedule.scheduledJobs[activePoll.scheduledJobName];
                if (job) {
                    job.cancel();
                    console.log(`Canceled scheduled job: ${activePoll.scheduledJobName}`);
                }
            }

            // Mark the poll as processed so it doesn't get picked up again
            activePoll.isProcessed = true;
            await activePoll.save();

            // Update the original poll message
            try {
                const channel = interaction.client.channels.cache.get(activePoll.channelId);
                if (channel) {
                    const pollMessage = await channel.messages.fetch(activePoll.messageId);
                    
                    if (pollMessage) {
                        const updatedEmbed = new EmbedBuilder()
                            .setTitle('🎮 Monthly Challenge Voting (CANCELED)')
                            .setDescription(
                                `This voting poll has been canceled by an administrator.`
                            )
                            .setColor('#FF0000') // Red to indicate it's canceled
                            .setFooter({ text: 'Voting has been canceled' });
                        
                        await pollMessage.edit({ embeds: [updatedEmbed] });
                    }
                }
            } catch (error) {
                console.error('Error updating original poll message:', error);
                // Continue even if updating the message fails
            }

            return interaction.editReply('Voting poll has been canceled successfully.');

        } catch (error) {
            console.error('Error canceling voting:', error);
            return interaction.editReply('An error occurred while canceling the voting process. Please try again.');
        }
    }
};
