import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { Suggestion } from '../../models/Suggestion.js';
import { User } from '../../models/User.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import { config } from '../../config/config.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('suggestadmin')
        .setDescription('Manage community suggestions'),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Show the main admin menu
            await this.showMainMenu(interaction);
        } catch (error) {
            console.error('Error in suggestadmin command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },

    async showMainMenu(interaction) {
        try {
            // Get counts of different suggestions by type and status
            const pendingCount = await Suggestion.countDocuments({ status: 'pending' });
            const arcadeCount = await Suggestion.countDocuments({ type: 'arcade' });
            const racingCount = await Suggestion.countDocuments({ type: 'racing' });
            const botCount = await Suggestion.countDocuments({ type: 'bot' });
            const otherCount = await Suggestion.countDocuments({ type: 'other' });
            const totalCount = await Suggestion.countDocuments();
            
            // Create the main menu embed
            const embed = new EmbedBuilder()
                .setTitle('🔧 Suggestion Management')
                .setColor('#FF9900')
                .setDescription('Welcome to the suggestion management system. Select an option below to manage community suggestions.')
                .addFields(
                    {
                        name: '📊 Suggestion Overview',
                        value: `• **Total Suggestions:** ${totalCount}\n` +
                               `• **Pending Review:** ${pendingCount}\n` +
                               `• **Arcade Boards:** ${arcadeCount}\n` +
                               `• **Racing Challenges:** ${racingCount}\n` +
                               `• **Bot Improvements:** ${botCount}\n` +
                               `• **Other Suggestions:** ${otherCount}`
                    },
                    {
                        name: '🔍 Browse Suggestions',
                        value: 'View suggestions by type or status to review community input.'
                    },
                    {
                        name: '✅ Manage Suggestions',
                        value: 'Update status, provide feedback, or implement suggestions.'
                    }
                )
                .setFooter({ text: 'Select an option from the menu below' })
                .setTimestamp();

            // Create the action menu
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('admin_action')
                        .setPlaceholder('Select action')
                        .addOptions([
                            {
                                label: 'View Pending Suggestions',
                                description: `Browse ${pendingCount} pending suggestions`,
                                value: 'view_pending',
                                emoji: '⏳'
                            },
                            {
                                label: 'View All Suggestions',
                                description: 'Browse all suggestions with filters',
                                value: 'view_all',
                                emoji: '🔍'
                            },
                            {
                                label: 'Arcade Suggestions',
                                description: `View ${arcadeCount} arcade board suggestions`,
                                value: 'view_arcade',
                                emoji: '🎯'
                            },
                            {
                                label: 'Racing Suggestions',
                                description: `View ${racingCount} racing challenge suggestions`,
                                value: 'view_racing',
                                emoji: '🏎️'
                            },
                            {
                                label: 'Bot Improvement Suggestions',
                                description: `View ${botCount} bot improvement suggestions`,
                                value: 'view_bot',
                                emoji: '🤖'
                            },
                            {
                                label: 'Other Suggestions',
                                description: `View ${otherCount} other suggestions`,
                                value: 'view_other',
                                emoji: '💡'
                            }
                        ])
                );

            // Send the menu
            const message = await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });

            // Set up collector for menu interactions
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 600000 // 10 minutes timeout
            });

            collector.on('collect', async i => {
                // Only respond if the interaction is from the original user
                if (i.user.id === interaction.user.id) {
                    // Store selection value before attempting to process
                    const selectedValue = i.values[0];

                    try {
                        // Check if interaction is still valid before proceeding
                        if (i.isSelectMenu()) {
                            try {
                                // Try to acknowledge the interaction first
                                if (!i.deferred && !i.replied) {
                                    await i.deferUpdate().catch(e => {
                                        console.error('Error deferring update (non-critical):', e.message);
                                        // If we can't defer, the interaction may be expired, but we'll continue with the flow
                                    });
                                }
                                
                                // Handle the selected option using the original interaction instead of 'i'
                                // This is more reliable as the original interaction is less likely to expire
                                switch (selectedValue) {
                                    case 'view_pending':
                                        await this.viewSuggestions(interaction, { status: 'pending' }, 'Pending Suggestions');
                                        break;
                                    case 'view_all':
                                        await this.viewSuggestions(interaction, {}, 'All Suggestions');
                                        break;
                                    case 'view_arcade':
                                        await this.viewSuggestions(interaction, { type: 'arcade' }, 'Arcade Board Suggestions');
                                        break;
                                    case 'view_racing':
                                        await this.viewSuggestions(interaction, { type: 'racing' }, 'Racing Challenge Suggestions');
                                        break;
                                    case 'view_bot':
                                        await this.viewSuggestions(interaction, { type: 'bot' }, 'Bot Improvement Suggestions');
                                        break;
                                    case 'view_other':
                                        await this.viewSuggestions(interaction, { type: 'other' }, 'Other Suggestions');
                                        break;
                                }
                            } catch (innerError) {
                                // If we get here, the interaction itself may be invalid
                                console.error('Error in menu select action:', innerError);
                                
                                // Try to use the original interaction as a fallback
                                switch (selectedValue) {
                                    case 'view_pending':
                                        await this.viewSuggestions(interaction, { status: 'pending' }, 'Pending Suggestions');
                                        break;
                                    case 'view_all':
                                        await this.viewSuggestions(interaction, {}, 'All Suggestions');
                                        break;
                                    case 'view_arcade':
                                        await this.viewSuggestions(interaction, { type: 'arcade' }, 'Arcade Board Suggestions');
                                        break;
                                    case 'view_racing':
                                        await this.viewSuggestions(interaction, { type: 'racing' }, 'Racing Challenge Suggestions');
                                        break;
                                    case 'view_bot':
                                        await this.viewSuggestions(interaction, { type: 'bot' }, 'Bot Improvement Suggestions');
                                        break;
                                    case 'view_other':
                                        await this.viewSuggestions(interaction, { type: 'other' }, 'Other Suggestions');
                                        break;
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error handling menu selection:', error);
                        // Don't try to respond to the collector interaction as it may be invalid
                        // Instead, try to update the original message
                        try {
                            await interaction.editReply({
                                content: 'An error occurred while processing your selection. Please try the command again.',
                                components: []
                            }).catch(e => console.error('Could not update original message:', e.message));
                        } catch (finalError) {
                            console.error('Failed to recover from error:', finalError);
                        }
                    }
                } else {
                    try {
                        // For unauthorized users, handle more safely
                        if (!i.replied && !i.deferred) {
                            await i.reply({ 
                                content: 'This menu is not for you. Please use the `/suggestadmin` command to start your own session.',
                                ephemeral: true 
                            }).catch(e => console.error('Could not reply to unauthorized user:', e.message));
                        }
                    } catch (error) {
                        console.error('Error handling unauthorized user:', error);
                    }
                }
            });

            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledRow = new ActionRowBuilder().addComponents(
                            StringSelectMenuBuilder.from(actionRow.components[0]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggestadmin again to start a new session.' })],
                            components: [disabledRow]
                        });
                    } catch (error) {
                        console.error('Error disabling menu:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error showing admin menu:', error);
            await interaction.editReply('An error occurred while loading the admin menu.');
        }
    },

    async viewSuggestions(interaction, filter, title) {
        try {
            // Get suggestions with the filter
            const suggestions = await Suggestion.find(filter).sort({ suggestionDate: -1 });
            
            if (suggestions.length === 0) {
                const backRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('back_to_menu')
                            .setLabel('Back to Main Menu')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('↩️')
                    );
                    
                return interaction.editReply({
                    content: `No suggestions found matching the selected criteria.`,
                    components: [backRow]
                });
            }
            
            // Create embed for the suggestions list
            const embed = new EmbedBuilder()
                .setTitle(`📋 ${title}`)
                .setColor('#3498DB')
                .setDescription(`Found ${suggestions.length} suggestion(s). Select a suggestion to view details and manage it.`)
                .setFooter({ text: 'Select a suggestion from the dropdown menu below' })
                .setTimestamp();
                
            // Create status counts
            const pendingCount = suggestions.filter(s => s.status === 'pending').length;
            const approvedCount = suggestions.filter(s => s.status === 'approved').length;
            const rejectedCount = suggestions.filter(s => s.status === 'rejected').length;
            const implementedCount = suggestions.filter(s => s.status === 'implemented').length;
            
            embed.addFields({
                name: 'Status Overview',
                value: `⏳ Pending: ${pendingCount}\n` +
                       `✅ Approved: ${approvedCount}\n` +
                       `❌ Rejected: ${rejectedCount}\n` +
                       `🚀 Implemented: ${implementedCount}`
            });
            
            // Add note about selection
            embed.addFields({
                name: 'How to Manage Suggestions',
                value: 'Select a suggestion from the dropdown menu below to view details and manage it. You can update status, provide feedback, or implement suggestions.'
            });
            
            // Create suggestion options for the dropdown (limit to 25 due to Discord's limits)
            const suggestionOptions = suggestions.slice(0, 25).map(suggestion => {
                let emoji = '⏳';
                switch (suggestion.status) {
                    case 'approved': emoji = '✅'; break;
                    case 'rejected': emoji = '❌'; break;
                    case 'implemented': emoji = '🚀'; break;
                }
                
                let typeEmoji = '💡';
                switch (suggestion.type) {
                    case 'arcade': typeEmoji = '🎯'; break;
                    case 'racing': typeEmoji = '🏎️'; break;
                    case 'bot': typeEmoji = '🤖'; break;
                }
                
                return {
                    label: suggestion.title || suggestion.gameTitle,
                    description: `${suggestion.type} by ${suggestion.suggestedBy}`,
                    value: suggestion._id.toString(),
                    emoji: suggestion.status === 'pending' ? typeEmoji : emoji
                };
            });
            
            // Create dropdown menu
            const selectRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_suggestion')
                        .setPlaceholder('Select a suggestion to manage')
                        .addOptions(suggestionOptions)
                );
                
            // Create back button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_to_menu')
                        .setLabel('Back to Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );
                
            // Send the suggestions list
            const message = await interaction.editReply({
                embeds: [embed],
                components: [selectRow, backRow]
            });
            
            // Set up collector for interactions
            const collector = message.createMessageComponentCollector({
                time: 600000 // 10 minutes timeout
            });
            
            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    // Store the interaction data before attempting to process
                    const suggestionId = i.customId === 'select_suggestion' ? i.values[0] : null;
                    const buttonAction = i.customId;
                    
                    try {
                        // Check if interaction is still valid before proceeding
                        if (i.isSelectMenu() || i.isButton()) {
                            try {
                                // Try to acknowledge the interaction first
                                if (!i.deferred && !i.replied) {
                                    await i.deferUpdate().catch(e => {
                                        console.error('Error deferring update (non-critical):', e.message);
                                        // If we can't defer, the interaction may be expired, but we'll continue with the flow
                                    });
                                }
                                
                                // Now handle the interaction based on stored data
                                if (buttonAction === 'select_suggestion' && suggestionId) {
                                    await this.viewSuggestionDetails(interaction, suggestionId, filter, title);
                                } else if (buttonAction === 'back_to_menu') {
                                    await this.showMainMenu(interaction);
                                }
                            } catch (innerError) {
                                // If we get here, the interaction itself may be invalid
                                console.error('Error processing interaction action:', innerError);
                                // Try to use the original interaction as a fallback
                                if (buttonAction === 'select_suggestion' && suggestionId) {
                                    await this.viewSuggestionDetails(interaction, suggestionId, filter, title);
                                } else if (buttonAction === 'back_to_menu') {
                                    await this.showMainMenu(interaction);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error handling suggestion selection:', error);
                        // Don't try to respond to the interaction as it may be invalid
                        // Instead, try to update the original message
                        try {
                            await interaction.editReply({
                                content: 'An error occurred while processing your selection. Please try the command again.',
                                components: []
                            }).catch(e => console.error('Could not update original message:', e.message));
                        } catch (finalError) {
                            console.error('Failed to recover from error:', finalError);
                        }
                    }
                } else {
                    try {
                        // For unauthorized users, handle more safely
                        if (!i.replied && !i.deferred) {
                            await i.reply({ 
                                content: 'This menu is not for you. Please use the `/suggestadmin` command to start your own session.',
                                ephemeral: true 
                            }).catch(e => console.error('Could not reply to unauthorized user:', e.message));
                        }
                    } catch (error) {
                        console.error('Error handling unauthorized user:', error);
                    }
                }
            });
            
            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledSelectRow = new ActionRowBuilder().addComponents(
                            StringSelectMenuBuilder.from(selectRow.components[0]).setDisabled(true)
                        );
                        
                        const disabledBackRow = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(backRow.components[0]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggestadmin again to start a new session.' })],
                            components: [disabledSelectRow, disabledBackRow]
                        });
                    } catch (error) {
                        console.error('Error disabling suggestion list components:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error viewing suggestions:', error);
            await interaction.editReply('An error occurred while retrieving suggestions. Please try again.');
        }
    },

    async viewSuggestionDetails(interaction, suggestionId, previousFilter, previousTitle) {
        try {
            // Get the suggestion
            const suggestion = await Suggestion.findById(suggestionId);
            
            if (!suggestion) {
                return interaction.editReply(`Suggestion with ID "${suggestionId}" not found.`);
            }
            
            // Create the suggestion detail embed
            const embed = new EmbedBuilder()
                .setTitle(`Suggestion Details`)
                .setColor('#3498DB')
                .setTimestamp();
                
            // Format the description based on suggestion type
            let description = '';
            switch (suggestion.type) {
                case 'arcade':
                    description = `**Type:** Arcade Board Suggestion\n` +
                                 `**Game:** ${suggestion.gameTitle} (${suggestion.consoleName})\n` +
                                 `**Game ID:** ${suggestion.gameId}\n` +
                                 `**Leaderboard ID:** ${suggestion.leaderboardId}\n` +
                                 `**Description:** ${suggestion.description}\n\n` +
                                 `[View Game on RetroAchievements](https://retroachievements.org/game/${suggestion.gameId})\n` +
                                 `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${suggestion.leaderboardId})`;
                    break;
                    
                case 'racing':
                    description = `**Type:** Racing Challenge Suggestion\n` +
                                 `**Game:** ${suggestion.gameTitle} (${suggestion.consoleName})\n` +
                                 `**Game ID:** ${suggestion.gameId}\n` +
                                 `**Leaderboard ID:** ${suggestion.leaderboardId}\n` +
                                 `**Track Name:** ${suggestion.trackName || 'N/A'}\n` +
                                 `**Description:** ${suggestion.description}\n\n` +
                                 `[View Game on RetroAchievements](https://retroachievements.org/game/${suggestion.gameId})\n` +
                                 `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${suggestion.leaderboardId})`;
                    break;
                    
                case 'bot':
                    description = `**Type:** Bot Improvement Suggestion\n` +
                                 `**Feature:** ${suggestion.title}\n` +
                                 `**Description:** ${suggestion.description}`;
                    break;
                    
                case 'other':
                    description = `**Type:** Other Suggestion\n` +
                                 `**Title:** ${suggestion.title}\n` +
                                 `**Description:** ${suggestion.description}`;
                    break;
            }
            
            embed.setDescription(description);
            
            // Add metadata fields
            embed.addFields(
                {
                    name: 'Suggestion Info',
                    value: `**Suggested By:** ${suggestion.suggestedBy}\n` +
                           `**Date:** ${new Date(suggestion.suggestionDate).toLocaleString()}\n` +
                           `**Status:** ${suggestion.status}\n` +
                           `**ID:** \`${suggestion._id}\``
                }
            );
            
            // Add admin response if it exists
            if (suggestion.adminResponse) {
                embed.addFields(
                    {
                        name: 'Admin Response',
                        value: `**Response:** ${suggestion.adminResponse}\n` +
                               `**By:** ${suggestion.adminRespondedBy || 'Unknown'}\n` +
                               `**Date:** ${suggestion.adminResponseDate ? new Date(suggestion.adminResponseDate).toLocaleString() : 'N/A'}`
                    }
                );
            }
            
            // Create action buttons based on suggestion type and status
            const actionRow = new ActionRowBuilder();
            
            // Status update button
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('update_status')
                    .setLabel('Update Status')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✏️')
            );
            
            // Add implement button for arcade and racing suggestions
            if ((suggestion.type === 'arcade' || suggestion.type === 'racing') && suggestion.status !== 'implemented') {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('implement')
                        .setLabel('Implement')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🚀')
                );
            }
            
            // Add delete button
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('delete')
                    .setLabel('Delete')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️')
            );
            
            // Create navigation row with back buttons
            const navRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_to_list')
                        .setLabel('Back to List')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️'),
                    new ButtonBuilder()
                        .setCustomId('back_to_menu')
                        .setLabel('Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🏠')
                );
                
            // Send the suggestion details
            const message = await interaction.editReply({
                embeds: [embed],
                components: [actionRow, navRow]
            });
            
            // Set up collector for button interactions
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 600000 // 10 minutes timeout
            });
            
            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    try {
                        // Check if interaction has already been acknowledged
                        if (!i.deferred && !i.replied) {
                            await i.deferUpdate();
                        }
                        
                        switch (i.customId) {
                            case 'update_status':
                                await this.handleUpdateStatus(i, suggestion, previousFilter, previousTitle);
                                break;
                            case 'implement':
                                await this.handleImplementSuggestion(i, suggestion, previousFilter, previousTitle);
                                break;
                            case 'delete':
                                await this.handleDeleteSuggestion(i, suggestion, previousFilter, previousTitle);
                                break;
                            case 'back_to_list':
                                await this.viewSuggestions(i, previousFilter, previousTitle);
                                break;
                            case 'back_to_menu':
                                await this.showMainMenu(i);
                                break;
                        }
                    } catch (error) {
                        console.error('Error handling button click:', error);
                        // Only try to respond if we haven't already
                        if (!i.replied) {
                            try {
                                await i.followUp({ 
                                    content: 'An error occurred while processing your selection. Please try again.', 
                                    ephemeral: true 
                                });
                            } catch (followUpError) {
                                console.error('Error sending follow-up message:', followUpError);
                            }
                        }
                    }
                } else {
                    try {
                        // Only reply if we haven't already
                        if (!i.replied) {
                            await i.reply({ 
                                content: 'This menu is not for you. Please use the `/suggestadmin` command to start your own session.',
                                ephemeral: true 
                            });
                        }
                    } catch (error) {
                        console.error('Error replying to unauthorized user:', error);
                    }
                }
            });
            
            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledActionRow = new ActionRowBuilder();
                        actionRow.components.forEach(comp => {
                            disabledActionRow.addComponents(
                                ButtonBuilder.from(comp).setDisabled(true)
                            );
                        });
                        
                        const disabledNavRow = new ActionRowBuilder();
                        navRow.components.forEach(comp => {
                            disabledNavRow.addComponents(
                                ButtonBuilder.from(comp).setDisabled(true)
                            );
                        });
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggestadmin again to start a new session.' })],
                            components: [disabledActionRow, disabledNavRow]
                        });
                    } catch (error) {
                        console.error('Error disabling suggestion detail buttons:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error viewing suggestion details:', error);
            await interaction.editReply('An error occurred while retrieving suggestion details. Please try again.');
        }
    },

    async handleUpdateStatus(interaction, suggestion, previousFilter, previousTitle) {
        try {
            // Create the status selection menu
            const embed = new EmbedBuilder()
                .setTitle(`Update Status: ${suggestion.title || suggestion.gameTitle}`)
                .setDescription(`Select a new status for this suggestion and provide an optional response to the user.`)
                .setColor('#3498DB')
                .setTimestamp();
                
            // Create the status selection menu
            const statusRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_status')
                        .setPlaceholder('Select a new status')
                        .addOptions([
                            {
                                label: 'Pending',
                                description: 'Mark the suggestion as pending review',
                                value: 'pending',
                                emoji: '⏳'
                            },
                            {
                                label: 'Approved',
                                description: 'Approve the suggestion for future implementation',
                                value: 'approved',
                                emoji: '✅'
                            },
                            {
                                label: 'Rejected',
                                description: 'Reject the suggestion',
                                value: 'rejected',
                                emoji: '❌'
                            },
                            {
                                label: 'Implemented',
                                description: 'Mark the suggestion as implemented',
                                value: 'implemented',
                                emoji: '🚀'
                            }
                        ])
                );
                
            // Create back button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_to_details')
                        .setLabel('Back to Details')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );
                
            // Send the status selection menu
            const message = await interaction.editReply({
                embeds: [embed],
                components: [statusRow, backRow]
            });
            
            // Set up collector for status selection
            const collector = message.createMessageComponentCollector({
                time: 600000 // 10 minutes timeout
            });
            
            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    try {
                        if (i.customId === 'select_status') {
                            const newStatus = i.values[0];
                            
                            // Check if interaction has already been acknowledged
                            if (!i.deferred && !i.replied) {
                                await i.deferUpdate();
                            }
                            
                            // Show response modal
                            const modal = new ModalBuilder()
                                .setCustomId('status_update_modal')
                                .setTitle('Update Suggestion Status');
                                
                            // Add status field (hidden)
                            const statusInput = new TextInputBuilder()
                                .setCustomId('status')
                                .setLabel('Status (Do not change)')
                                .setValue(newStatus)
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true);
                                
                            // Add response field
                            const responseInput = new TextInputBuilder()
                                .setCustomId('response')
                                .setLabel('Response to User (Optional)')
                                .setPlaceholder('Provide feedback or explanation for the status change...')
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(false);
                                
                            // Add fields to modal
                            const statusRow = new ActionRowBuilder().addComponents(statusInput);
                            const responseRow = new ActionRowBuilder().addComponents(responseInput);
                            modal.addComponents(statusRow, responseRow);
                            
                            // Show the modal
                            await i.showModal(modal);
                            
                            // Wait for modal submission
                            try {
                                const modalSubmission = await i.awaitModalSubmit({
                                    time: 600000 // 10 minutes to fill out the form
                                });
                                
                                // Check if interaction has already been acknowledged
                                if (!modalSubmission.deferred && !modalSubmission.replied) {
                                    await modalSubmission.deferUpdate();
                                }
                                
                                // Get values from modal
                                const newStatus = modalSubmission.fields.getTextInputValue('status');
                                const response = modalSubmission.fields.getTextInputValue('response');
                                
                                // Update the suggestion
                                suggestion.status = newStatus;
                                if (response) {
                                    suggestion.adminResponse = response;
                                    suggestion.adminResponseDate = new Date();
                                    suggestion.adminRespondedBy = interaction.user.tag;
                                }
                                
                                await suggestion.save();
                                
                                // Try to notify the user if enabled
                                await this.notifyUser(interaction, suggestion, newStatus, response);
                                
                                // Show success message
                                const successEmbed = new EmbedBuilder()
                                    .setTitle('Status Updated')
                                    .setDescription(`The status for **${suggestion.title || suggestion.gameTitle}** has been updated to **${newStatus}**.`)
                                    .setColor('#00FF00')
                                    .setTimestamp();
                                    
                                if (response) {
                                    successEmbed.addFields({ 
                                        name: 'Response', 
                                        value: response 
                                    });
                                }
                                
                                const actionRow = new ActionRowBuilder()
                                    .addComponents(
                                        new ButtonBuilder()
                                            .setCustomId('view_details')
                                            .setLabel('View Details')
                                            .setStyle(ButtonStyle.Primary)
                                            .setEmoji('🔍'),
                                        new ButtonBuilder()
                                            .setCustomId('back_to_list')
                                            .setLabel('Back to List')
                                            .setStyle(ButtonStyle.Secondary)
                                            .setEmoji('↩️')
                                    );
                                    
                                await modalSubmission.editReply({
                                    embeds: [successEmbed],
                                    components: [actionRow]
                                });
                                
                                // Handle post-update navigation
                                const updateMessage = await modalSubmission.fetchReply();
                                const updateCollector = updateMessage.createMessageComponentCollector({
                                    componentType: ComponentType.Button,
                                    time: 300000 // 5 minutes
                                });
                                
                                updateCollector.on('collect', async updateI => {
                                    if (updateI.user.id === interaction.user.id) {
                                        try {
                                            // Check if interaction has already been acknowledged
                                            if (!updateI.deferred && !updateI.replied) {
                                                await updateI.deferUpdate();
                                            }
                                            
                                            if (updateI.customId === 'view_details') {
                                                await this.viewSuggestionDetails(updateI, suggestion._id, previousFilter, previousTitle);
                                            } else if (updateI.customId === 'back_to_list') {
                                                await this.viewSuggestions(updateI, previousFilter, previousTitle);
                                            }
                                        } catch (error) {
                                            console.error('Error handling post-update navigation:', error);
                                        }
                                    }
                                });
                            } catch (error) {
                                console.error('Error processing modal submission:', error);
                                if (error.code !== 'INTERACTION_COLLECTOR_ERROR') {
                                    try {
                                        await interaction.followUp({
                                            content: 'An error occurred while updating the status. Please try again.',
                                            ephemeral: true
                                        });
                                    } catch (followUpError) {
                                        console.error('Error sending follow-up:', followUpError);
                                    }
                                }
                            }
                        } else if (i.customId === 'back_to_details') {
                            // Check if interaction has already been acknowledged
                            if (!i.deferred && !i.replied) {
                                await i.deferUpdate();
                            }
                            await this.viewSuggestionDetails(i, suggestion._id, previousFilter, previousTitle);
                        }
                    } catch (error) {
                        console.error('Error handling status update action:', error);
                    }
                } else {
                    try {
                        // Only reply if we haven't already
                        if (!i.replied) {
                            await i.reply({ 
                                content: 'This menu is not for you. Please use the `/suggestadmin` command to start your own session.',
                                ephemeral: true 
                            });
                        }
                    } catch (error) {
                        console.error('Error replying to unauthorized user:', error);
                    }
                }
            });
            
            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledStatusRow = new ActionRowBuilder().addComponents(
                            StringSelectMenuBuilder.from(statusRow.components[0]).setDisabled(true)
                        );
                        
                        const disabledBackRow = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(backRow.components[0]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggestadmin again to start a new session.' })],
                            components: [disabledStatusRow, disabledBackRow]
                        });
                    } catch (error) {
                        console.error('Error disabling status selection components:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error handling status update:', error);
            await interaction.editReply('An error occurred while updating the status. Please try again.');
        }
    },

    async handleImplementSuggestion(interaction, suggestion, previousFilter, previousTitle) {
        try {
            // Only handle arcade and racing suggestions
            if (suggestion.type !== 'arcade' && suggestion.type !== 'racing') {
                return interaction.editReply('This suggestion type cannot be directly implemented.');
            }
            
            // Create implementation form embed
            const embed = new EmbedBuilder()
                .setTitle(`Implement: ${suggestion.gameTitle}`)
                .setDescription(`Fill out the form to implement this ${suggestion.type} board.`)
                .setColor('#3498DB')
                .addFields(
                    {
                        name: 'Game Details',
                        value: `**Game:** ${suggestion.gameTitle}\n` +
                               `**Game ID:** ${suggestion.gameId}\n` +
                               `**Leaderboard ID:** ${suggestion.leaderboardId}`
                    },
                    {
                        name: 'Implementation Form',
                        value: 'Click the "Open Implementation Form" button below to complete the implementation.'
                    }
                )
                .setTimestamp();
                
            // Create implementation button
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_implementation_form')
                        .setLabel('Open Implementation Form')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🚀')
                );
                
            // Create back button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_to_details')
                        .setLabel('Back to Details')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );
                
            // Send the implementation form
            const message = await interaction.editReply({
                embeds: [embed],
                components: [actionRow, backRow]
            });
            
            // Set up collector for button interactions
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 600000 // 10 minutes timeout
            });
            
            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    try {
                        if (i.customId === 'open_implementation_form') {
                            // Check if interaction has already been acknowledged
                            if (!i.deferred && !i.replied) {
                                await i.deferUpdate();
                            }
                            
                            // Create implementation modal
                            const modal = new ModalBuilder()
                                .setCustomId('implementation_modal')
                                .setTitle(`Implement ${suggestion.type.charAt(0).toUpperCase() + suggestion.type.slice(1)} Board`);
                                
                            // Add board ID field
                            const boardIdInput = new TextInputBuilder()
                                .setCustomId('boardId')
                                .setLabel('Board ID (unique identifier)')
                                .setPlaceholder(`${suggestion.type}-${suggestion.gameId}`)
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true);
                                
                            // Add description field
                            const descriptionInput = new TextInputBuilder()
                                .setCustomId('description')
                                .setLabel('Board Description')
                                .setValue(suggestion.description)
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(true);
                                
                            // Add fields to modal
                            const boardIdRow = new ActionRowBuilder().addComponents(boardIdInput);
                            const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
                            modal.addComponents(boardIdRow, descriptionRow);
                            
                            // Show the modal
                            await i.showModal(modal);
                            
                            // Wait for modal submission
                            try {
                                const modalSubmission = await i.awaitModalSubmit({
                                    time: 600000 // 10 minutes to fill out the form
                                });
                                
                                // Check if interaction has already been acknowledged
                                if (!modalSubmission.deferred && !modalSubmission.replied) {
                                    await modalSubmission.deferUpdate();
                                }
                                
                                // Get values from modal
                                const boardId = modalSubmission.fields.getTextInputValue('boardId');
                                const description = modalSubmission.fields.getTextInputValue('description');
                                
                                // Validate board ID doesn't already exist
                                const existingBoard = await ArcadeBoard.findOne({ boardId });
                                if (existingBoard) {
                                    const errorEmbed = new EmbedBuilder()
                                        .setTitle('Error')
                                        .setDescription(`A board with ID "${boardId}" already exists. Please choose a different board ID.`)
                                        .setColor('#FF0000')
                                        .setTimestamp();
                                        
                                    const backButton = new ActionRowBuilder()
                                        .addComponents(
                                            new ButtonBuilder()
                                                .setCustomId('try_again')
                                                .setLabel('Try Again')
                                                .setStyle(ButtonStyle.Primary)
                                        );
                                        
                                    await modalSubmission.editReply({
                                        embeds: [errorEmbed],
                                        components: [backButton]
                                    });
                                    
                                    // Handle retry
                                    const retryMessage = await modalSubmission.fetchReply();
                                    const retryCollector = retryMessage.createMessageComponentCollector({
                                        componentType: ComponentType.Button,
                                        time: 300000 // 5 minutes
                                    });
                                    
                                    retryCollector.on('collect', async retryI => {
                                        if (retryI.user.id === interaction.user.id) {
                                            try {
                                                // Check if interaction has already been acknowledged
                                                if (!retryI.deferred && !retryI.replied) {
                                                    await retryI.deferUpdate();
                                                }
                                                await this.handleImplementSuggestion(retryI, suggestion, previousFilter, previousTitle);
                                            } catch (error) {
                                                console.error('Error handling retry:', error);
                                            }
                                        }
                                    });
                                    
                                    return;
                                }
                                
                                // Get game info
                                const gameInfo = await retroAPI.getGameInfo(suggestion.gameId);
                                if (!gameInfo) {
                                    return modalSubmission.editReply('Game not found. Please check the game ID.');
                                }
                                
                                // Create new board based on suggestion type
                                let newBoard;
                                
                                if (suggestion.type === 'arcade') {
                                    // Create arcade board
                                    newBoard = new ArcadeBoard({
                                        boardId,
                                        boardType: 'arcade',
                                        leaderboardId: suggestion.leaderboardId,
                                        gameId: suggestion.gameId,
                                        gameTitle: gameInfo.title,
                                        consoleName: gameInfo.consoleName || 'Unknown',
                                        description
                                    });
                                } else if (suggestion.type === 'racing') {
                                    // For racing boards, we need to set up start and end dates
                                    const now = new Date();
                                    const year = now.getFullYear();
                                    const month = now.getMonth() + 1;
                                    
                                    // Calculate start and end dates (current month by default)
                                    const startDate = new Date(year, month - 1, 1);
                                    const endDate = new Date(year, month, 0, 23, 59, 59);
                                    
                                    // Generate month key
                                    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
                                    
                                    // Get the full game title and console name
                                    const gameFull = `${gameInfo.title} (${gameInfo.consoleName})`;
                                    
                                    // Create new racing board
                                    newBoard = new ArcadeBoard({
                                        boardId,
                                        boardType: 'racing',
                                        leaderboardId: suggestion.leaderboardId,
                                        gameId: suggestion.gameId,
                                        gameTitle: gameFull,
                                        trackName: suggestion.trackName || '',
                                        consoleName: gameInfo.consoleName || 'Unknown',
                                        description,
                                        startDate,
                                        endDate,
                                        monthKey
                                    });
                                }
                                
                                // Save the new board
                                await newBoard.save();
                                
                                // Update the suggestion status
                                suggestion.status = 'implemented';
                                suggestion.adminResponse = `Implemented as ${suggestion.type} board with ID: ${boardId}`;
                                suggestion.adminResponseDate = new Date();
                                suggestion.adminRespondedBy = interaction.user.tag;
                                await suggestion.save();
                                
                                // Notify the user of implementation
                                await this.notifyImplementation(interaction, suggestion, boardId);
                                
                                // Show success message
                                const successEmbed = new EmbedBuilder()
                                    .setTitle(`${suggestion.type.charAt(0).toUpperCase() + suggestion.type.slice(1)} Board Created`)
                                    .setDescription(`Successfully implemented suggestion as a ${suggestion.type} board!`)
                                    .setColor('#00FF00')
                                    .addFields(
                                        {
                                            name: 'Board Details',
                                            value: `**Game:** ${gameInfo.title}\n` + 
                                                   `**Board ID:** ${boardId}\n` +
                                                   `**Leaderboard ID:** ${suggestion.leaderboardId}\n` +
                                                   `**Description:** ${description}` +
                                                   (suggestion.type === 'racing' && suggestion.trackName ? `\n**Track:** ${suggestion.trackName}` : '')
                                        },
                                        {
                                            name: 'Next Steps',
                                            value: `• View the board with \`/arcade\`\n` +
                                                   `• Announce the board with \`/arcadeadmin announce board_id:${boardId}\``
                                        }
                                    )
                                    .setTimestamp();
                                    
                                if (gameInfo.imageIcon) {
                                    successEmbed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                                }
                                
                                const successActionRow = new ActionRowBuilder()
                                    .addComponents(
                                        new ButtonBuilder()
                                            .setCustomId('back_to_list')
                                            .setLabel('Back to Suggestions')
                                            .setStyle(ButtonStyle.Secondary)
                                            .setEmoji('↩️'),
                                        new ButtonBuilder()
                                            .setCustomId('back_to_menu')
                                            .setLabel('Main Menu')
                                            .setStyle(ButtonStyle.Secondary)
                                            .setEmoji('🏠')
                                    );
                                    
                                await modalSubmission.editReply({
                                    embeds: [successEmbed],
                                    components: [successActionRow]
                                });
                                
                                // Handle post-implementation navigation
                                const implMessage = await modalSubmission.fetchReply();
                                const implCollector = implMessage.createMessageComponentCollector({
                                    componentType: ComponentType.Button,
                                    time: 300000 // 5 minutes
                                });
                                
                                implCollector.on('collect', async implI => {
                                    if (implI.user.id === interaction.user.id) {
                                        try {
                                            // Check if interaction has already been acknowledged
                                            if (!implI.deferred && !implI.replied) {
                                                await implI.deferUpdate();
                                            }
                                            
                                            if (implI.customId === 'back_to_list') {
                                                await this.viewSuggestions(implI, previousFilter, previousTitle);
                                            } else if (implI.customId === 'back_to_menu') {
                                                await this.showMainMenu(implI);
                                            }
                                        } catch (error) {
                                            console.error('Error handling post-implementation navigation:', error);
                                        }
                                    }
                                });
                            } catch (error) {
                                console.error('Error processing implementation:', error);
                                if (error.code !== 'INTERACTION_COLLECTOR_ERROR') {
                                    try {
                                        await interaction.followUp({
                                            content: 'An error occurred during implementation. Please try again.',
                                            ephemeral: true
                                        });
                                    } catch (followUpError) {
                                        console.error('Error sending follow-up:', followUpError);
                                    }
                                }
                            }
                        } else if (i.customId === 'back_to_details') {
                            // Check if interaction has already been acknowledged
                            if (!i.deferred && !i.replied) {
                                await i.deferUpdate();
                            }
                            await this.viewSuggestionDetails(i, suggestion._id, previousFilter, previousTitle);
                        }
                    } catch (error) {
                        console.error('Error handling implementation action:', error);
                    }
                } else {
                    try {
                        // Only reply if we haven't already
                        if (!i.replied) {
                            await i.reply({ 
                                content: 'This menu is not for you. Please use the `/suggestadmin` command to start your own session.',
                                ephemeral: true 
                            });
                        }
                    } catch (error) {
                        console.error('Error replying to unauthorized user:', error);
                    }
                }
            });
            
            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledActionRow = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(actionRow.components[0]).setDisabled(true)
                        );
                        
                        const disabledBackRow = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(backRow.components[0]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggestadmin again to start a new session.' })],
                            components: [disabledActionRow, disabledBackRow]
                        });
                    } catch (error) {
                        console.error('Error disabling implementation form buttons:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error handling implementation:', error);
            await interaction.editReply('An error occurred during implementation. Please try again.');
        }
    },

    async handleDeleteSuggestion(interaction, suggestion, previousFilter, previousTitle) {
        try {
            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setTitle(`Delete Suggestion: ${suggestion.title || suggestion.gameTitle}`)
                .setDescription(`Are you sure you want to delete this suggestion? This action cannot be undone.`)
                .setColor('#FF0000')
                .addFields(
                    {
                        name: 'Suggestion Info',
                        value: `**Type:** ${suggestion.type}\n` +
                               `**By:** ${suggestion.suggestedBy}\n` +
                               `**Date:** ${new Date(suggestion.suggestionDate).toLocaleString()}\n` +
                               `**Status:** ${suggestion.status}`
                    }
                )
                .setTimestamp();
                
            // Create confirmation buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_delete')
                        .setLabel('Delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️'),
                    new ButtonBuilder()
                        .setCustomId('cancel_delete')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✖️')
                );
                
            // Send confirmation
            const message = await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });
            
            // Set up collector for confirmation
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes timeout
            });
            
            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    try {
                        // Check if interaction has already been acknowledged
                        if (!i.deferred && !i.replied) {
                            await i.deferUpdate();
                        }
                        
                        if (i.customId === 'confirm_delete') {
                            // Delete the suggestion
                            await Suggestion.findByIdAndDelete(suggestion._id);
                            
                            // Show success message
                            const successEmbed = new EmbedBuilder()
                                .setTitle('Suggestion Deleted')
                                .setDescription(`The suggestion has been successfully deleted.`)
                                .setColor('#00FF00')
                                .addFields(
                                    {
                                        name: 'Deleted Suggestion',
                                        value: `**Type:** ${suggestion.type}\n` +
                                               `**Title:** ${suggestion.title || suggestion.gameTitle}\n` +
                                               `**By:** ${suggestion.suggestedBy}`
                                    }
                                )
                                .setTimestamp();
                                
                            const successActionRow = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('back_to_list')
                                        .setLabel('Back to Suggestions')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('↩️'),
                                    new ButtonBuilder()
                                        .setCustomId('back_to_menu')
                                        .setLabel('Main Menu')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('🏠')
                                );
                                
                            await i.editReply({
                                embeds: [successEmbed],
                                components: [successActionRow]
                            });
                            
                            // Handle post-deletion navigation
                            const delMessage = await i.fetchReply();
                            const delCollector = delMessage.createMessageComponentCollector({
                                componentType: ComponentType.Button,
                                time: 300000 // 5 minutes
                            });
                            
                            delCollector.on('collect', async delI => {
                                if (delI.user.id === interaction.user.id) {
                                    try {
                                        // Check if interaction has already been acknowledged
                                        if (!delI.deferred && !delI.replied) {
                                            await delI.deferUpdate();
                                        }
                                        
                                        if (delI.customId === 'back_to_list') {
                                            await this.viewSuggestions(delI, previousFilter, previousTitle);
                                        } else if (delI.customId === 'back_to_menu') {
                                            await this.showMainMenu(delI);
                                        }
                                    } catch (error) {
                                        console.error('Error handling post-deletion navigation:', error);
                                    }
                                }
                            });
                        } else if (i.customId === 'cancel_delete') {
                            // Cancel deletion, go back to suggestion details
                            await this.viewSuggestionDetails(i, suggestion._id, previousFilter, previousTitle);
                        }
                    } catch (error) {
                        console.error('Error handling delete action:', error);
                    }
                } else {
                    try {
                        // Only reply if we haven't already
                        if (!i.replied) {
                            await i.reply({ 
                                content: 'This menu is not for you. Please use the `/suggestadmin` command to start your own session.',
                                ephemeral: true 
                            });
                        }
                    } catch (error) {
                        console.error('Error replying to unauthorized user:', error);
                    }
                }
            });
            
            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledActionRow = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(actionRow.components[0]).setDisabled(true),
                            ButtonBuilder.from(actionRow.components[1]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This confirmation has expired. Use /suggestadmin again to start a new session.' })],
                            components: [disabledActionRow]
                        });
                    } catch (error) {
                        console.error('Error disabling delete confirmation buttons:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error handling delete suggestion:', error);
            await interaction.editReply('An error occurred while deleting the suggestion. Please try again.');
        }
    },

    // Helper function to notify user of status changes
    async notifyUser(interaction, suggestion, newStatus, response) {
        try {
            // Check if notification is enabled in config
            const notifyOnStatusChange = config.suggestions?.notifyOnStatusChange || false;
            if (!notifyOnStatusChange) return;
            
            // Try to get user
            const user = await User.findOne({ discordId: suggestion.discordId });
            if (!user) return;
            
            // Try to get Discord member
            const member = await interaction.guild.members.fetch(suggestion.discordId).catch(() => null);
            if (!member) return;
            
            // Create notification embed
            const notifyEmbed = new EmbedBuilder()
                .setTitle('Suggestion Update')
                .setColor(
                    newStatus === 'approved' ? '#00FF00' : 
                    newStatus === 'rejected' ? '#FF0000' : 
                    newStatus === 'implemented' ? '#0099FF' : '#FFCC00'
                )
                .setDescription(`Your suggestion has been ${newStatus}!`)
                .addFields(
                    {
                        name: 'Suggestion',
                        value: suggestion.title || suggestion.gameTitle
                    }
                )
                .setTimestamp();
                
            // Add response if provided
            if (response) {
                notifyEmbed.addFields(
                    {
                        name: 'Admin Response',
                        value: response
                    }
                );
            }
            
            // Send DM to user
            await member.send({ embeds: [notifyEmbed] }).catch(err => {
                console.log(`Could not send DM to ${user.raUsername}: ${err.message}`);
            });
        } catch (error) {
            console.error('Error notifying user:', error);
            // Don't throw - this is a non-critical function
        }
    },

    // Helper function to notify user of implementation
    async notifyImplementation(interaction, suggestion, boardId) {
        try {
            // Check if notification is enabled
            const notifyOnImplementation = config.suggestions?.notifyOnImplementation || false;
            if (!notifyOnImplementation) return;
            
            // Try to get Discord member
            const member = await interaction.guild.members.fetch(suggestion.discordId).catch(() => null);
            if (!member) return;
            
            // Try to get game info
            const gameInfo = await retroAPI.getGameInfo(suggestion.gameId).catch(() => null);
            
            // Create notification embed
            const notifyEmbed = new EmbedBuilder()
                .setTitle('Suggestion Implemented!')
                .setColor('#0099FF')
                .setDescription(`Your ${suggestion.type} suggestion has been implemented!`)
                .addFields(
                    {
                        name: 'Suggestion',
                        value: `**Game:** ${suggestion.gameTitle}` + 
                               (suggestion.type === 'racing' && suggestion.trackName ? `\n**Track:** ${suggestion.trackName}` : '')
                    },
                    {
                        name: 'Now Available',
                        value: `You can check it out with the \`/arcade\` command!`
                    }
                )
                .setTimestamp();
                
            // Add game thumbnail if available
            if (gameInfo?.imageIcon) {
                notifyEmbed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }
            
            // Send DM to user
            await member.send({ embeds: [notifyEmbed] }).catch(err => {
                console.log(`Could not send implementation notification to user: ${err.message}`);
            });
        } catch (error) {
            console.error('Error notifying implementation:', error);
            // Don't throw - this is a non-critical function
        }
    }
};
