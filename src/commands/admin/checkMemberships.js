
// src/commands/admin/checkMemberships.js
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    PermissionFlagsBits 
} from 'discord.js';
import { User } from '../../models/User.js';
import membershipCheckService from '../../services/membershipCheckService.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('checkmemberships')
        .setDescription('Check and remove any registered users who left the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

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
            // Get user count before check
            const beforeCount = await User.countDocuments();
            
            // Run the membership check
            const checkResult = await membershipCheckService.triggerCheck();
            
            if (!checkResult) {
                return interaction.editReply('An error occurred while checking memberships. Please check the logs.');
            }
            
            // Get user count after check
            const afterCount = await User.countDocuments();
            
            // Calculate how many users were removed
            const removedCount = beforeCount - afterCount;
            
            // Create embed with results
            const embed = new EmbedBuilder()
                .setTitle('Membership Check Results')
                .setColor(removedCount > 0 ? '#E74C3C' : '#2ECC71')
                .setDescription('Checked all registered users to ensure they are still server members.')
                .addFields(
                    { 
                        name: 'Users Before Check', 
                        value: beforeCount.toString(),
                        inline: true 
                    },
                    { 
                        name: 'Users After Check', 
                        value: afterCount.toString(),
                        inline: true 
                    },
                    { 
                        name: 'Users Removed', 
                        value: removedCount.toString(),
                        inline: true 
                    }
                )
                .setFooter({ text: 'Automatic checks occur daily' })
                .setTimestamp();
                
            // Add message based on results
            if (removedCount > 0) {
                embed.addFields({
                    name: 'Result',
                    value: `Removed ${removedCount} user${removedCount !== 1 ? 's' : ''} who left the server. These users have been unregistered from the system.`
                });
            } else {
                embed.addFields({
                    name: 'Result',
                    value: 'All registered users are currently in the server. No action was needed.'
                });
            }
            
            return interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error executing membership check command:', error);
            return interaction.editReply('An error occurred while checking memberships. Please try again later.');
        }
    }
};
