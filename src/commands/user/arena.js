// src/commands/user/arena.js (Refactored)
import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { ArenaChallenge } from '../../models/ArenaChallenge.js';
import ArenaDisplayHandlers from '../../handlers/ArenaDisplayHandlers.js';
import ArenaButtonHandlers from '../../handlers/ArenaButtonHandlers.js';
import ArenaSelectHandlers from '../../handlers/ArenaSelectHandlers.js';
import ArenaModalHandlers from '../../handlers/ArenaModalHandlers.js';
import ArenaTimeoutUtils from '../../utils/ArenaTimeoutUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arena')
        .setDescription('Arena system for competitive challenges and betting'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Verify user is registered
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to use the Arena system. Please contact an admin.');
            }
            
            // Process any timeouts before showing the menu (non-blocking)
            this.processTimeoutsInBackground();
            
            // Check if user has pending challenges to respond to (priority)
            const pendingChallenges = await ArenaChallenge.find({
                challengeeId: user.discordId,
                status: 'pending'
            });
            
            if (pendingChallenges.length > 0) {
                // User has pending challenges - show them immediately
                return ArenaDisplayHandlers.showPendingChallenges(interaction, user, pendingChallenges);
            }
            
            // No pending challenges - show main arena menu
            await ArenaDisplayHandlers.showMainArenaMenu(interaction, user);
        } catch (error) {
            console.error('Error executing arena command:', error);
            return interaction.editReply('An error occurred while accessing the Arena. Please try again.');
        }
    },

    /**
     * Process timeouts in the background without blocking the main command
     */
    async processTimeoutsInBackground() {
        try {
            // Run timeout processing in the background
            ArenaTimeoutUtils.checkAndProcessTimeouts().catch(error => {
                console.error('Background timeout processing failed:', error);
            });
        } catch (error) {
            // Don't let background processing errors affect the main command
            console.error('Error starting background timeout processing:', error);
        }
    },

    // Handle button interactions
    async handleButtonInteraction(interaction) {
        try {
            await ArenaButtonHandlers.handleButtonInteraction(interaction);
        } catch (error) {
            console.error('Error handling button interaction:', error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error processing this button.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error processing this button.', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
        }
    },
    
    // Handle select menu interactions
    async handleSelectMenuInteraction(interaction) {
        try {
            await ArenaSelectHandlers.handleSelectMenuInteraction(interaction);
        } catch (error) {
            console.error('Error handling select menu interaction:', error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error processing this selection.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error processing this selection.', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
        }
    },
    
    // Handle modal submit interactions
    async handleModalSubmit(interaction) {
        try {
            await ArenaModalHandlers.handleModalSubmit(interaction);
        } catch (error) {
            console.error('Error handling modal submission:', error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error processing your submission.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error processing your submission.', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
        }
    },

    // Utility method for admin commands or scheduled tasks to manually process timeouts
    async processTimeouts() {
        return await ArenaTimeoutUtils.checkAndProcessTimeouts();
    },

    // Utility method to check if a challenge can be cancelled
    canCancelChallenge(challenge, userId) {
        return ArenaTimeoutUtils.canCancelChallenge(challenge, userId);
    },

    // Utility method to get time until auto-cancel
    getTimeUntilAutoCancel(challenge) {
        return ArenaTimeoutUtils.getTimeUntilAutoCancel(challenge);
    }
};
