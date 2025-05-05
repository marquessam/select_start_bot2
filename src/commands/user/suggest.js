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
import { User } from '../../models/User.js';
import { Suggestion } from '../../models/Suggestion.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Submit or view suggestions for the community'),

    async execute(interaction) {
        // Check if the user is registered
        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
            return interaction.reply({
                content: 'You are not registered. Please ask an admin to register you first.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Display the main menu
            await this.showMainMenu(interaction, user);
        } catch (error) {
            console.error('Error executing suggest command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },

    async showMainMenu(interaction, user) {
        try {
            // Create the main menu embed
            const embed = new EmbedBuilder()
                .setTitle('🔍 Community Suggestions')
                .setColor('#9B59B6')
                .setDescription('Welcome to the community suggestions system! You can suggest new arcade boards, racing challenges, bot improvements, or other ideas to help improve our community.')
                .addFields(
                    {
                        name: '🎯 Arcade Board Suggestions',
                        value: 'Suggest a game to be added as an arcade leaderboard. You\'ll need the RetroAchievements Game ID (the numbers at the end of the game URL).'
                    },
                    {
                        name: '🏎️ Racing Challenge Suggestions',
                        value: 'Suggest a racing game or track for a future monthly racing challenge. You\'ll need the RetroAchievements Game ID.'
                    },
                    {
                        name: '🤖 Bot Improvement',
                        value: 'Suggest a new feature or improvement for the community bot.'
                    },
                    {
                        name: '💡 Other Suggestion',
                        value: 'Have another idea? Submit it here!'
                    },
                    {
                        name: '📋 View Current Suggestions',
                        value: 'Browse all current community suggestions.'
                    }
                )
                .setFooter({ text: 'Select an option from the dropdown menu below' });

            // Create the dropdown menu
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('suggestion_type')
                        .setPlaceholder('What would you like to suggest?')
                        .addOptions([
                            {
                                label: 'Suggest Arcade Board',
                                description: 'Propose a game for a new arcade leaderboard',
                                value: 'arcade',
                                emoji: '🎯'
                            },
                            {
                                label: 'Suggest Racing Challenge',
                                description: 'Propose a game/track for a racing challenge',
                                value: 'racing',
                                emoji: '🏎️'
                            },
                            {
                                label: 'Suggest Bot Improvement',
                                description: 'Propose a new feature for the bot',
                                value: 'bot',
                                emoji: '🤖'
                            },
                            {
                                label: 'Other Suggestion',
                                description: 'Submit another type of suggestion',
                                value: 'other',
                                emoji: '💡'
                            },
                            {
                                label: 'View Suggestions',
                                description: 'Browse current community suggestions',
                                value: 'view',
                                emoji: '📋'
                            }
                        ])
                );

            // Send the menu
            const message = await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });

            // Set up collector for dropdown menu
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 300000 // 5 minutes timeout
            });

            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    const selectedValue = i.values[0];
                    
                    await i.deferUpdate();
                    
                    // Handle the selected option
                    switch (selectedValue) {
                        case 'arcade':
                            await this.handleArcadeSuggestion(i, user);
                            break;
                        case 'racing':
                            await this.handleRacingSuggestion(i, user);
                            break;
                        case 'bot':
                            await this.handleBotSuggestion(i, user);
                            break;
                        case 'other':
                            await this.handleOtherSuggestion(i, user);
                            break;
                        case 'view':
                            await this.handleViewSuggestions(i);
                            break;
                    }
                } else {
                    await i.reply({ 
                        content: 'This menu is not for you. Please use the `/suggest` command to start your own session.',
                        ephemeral: true 
                    });
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
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggest again to start a new session.' })],
                            components: [disabledRow]
                        });
                    } catch (error) {
                        console.error('Error disabling suggestions menu:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error showing suggestions menu:', error);
            await interaction.editReply('An error occurred while loading the suggestions menu.');
        }
    },

    async handleArcadeSuggestion(interaction, user) {
        try {
            // Create the arcade suggestion info embed
            const embed = new EmbedBuilder()
                .setTitle('🎯 Suggest an Arcade Board')
                .setColor('#00BFFF')
                .setDescription('Please complete the form to suggest a new arcade board for the community.')
                .addFields(
                    {
                        name: 'What is an Arcade Board?',
                        value: 'Arcade boards are RetroAchievements leaderboards that remain available throughout the year for players to compete on.'
                    },
                    {
                        name: 'Game ID Information',
                        value: 'You\'ll need to provide two pieces of information:\n\n1. **Game ID**: The number at the end of the game URL on RetroAchievements.org.\nExample: For https://retroachievements.org/game/10078, the Game ID is `10078`\n\n2. **Leaderboard ID**: The number at the end of the leaderboard URL.\nExample: For https://retroachievements.org/leaderboardinfo.php?i=2310, the Leaderboard ID is `2310`'
                    },
                    {
                        name: 'Next Steps',
                        value: 'Click the button below to open a form where you can submit your arcade board suggestion.'
                    }
                );

            // Create the submit button
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('submit_arcade')
                        .setLabel('Submit Arcade Suggestion')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎯'),
                    new ButtonBuilder()
                        .setCustomId('back_to_menu')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );

            // Send the info and button
            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });

            // Set up collector for the button
            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes timeout
            });

            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    if (i.customId === 'submit_arcade') {
                        // Create the modal for submitting arcade suggestion
                        const modal = new ModalBuilder()
                            .setCustomId('arcade_suggestion_modal')
                            .setTitle('Suggest an Arcade Board');

                        // Add the game ID input
                        const gameIdInput = new TextInputBuilder()
                            .setCustomId('gameId')
                            .setLabel('RetroAchievements Game ID')
                            .setPlaceholder('Example: 10078 (from game URL)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);
                            
                        // Add the leaderboard ID input
                        const leaderboardIdInput = new TextInputBuilder()
                            .setCustomId('leaderboardId')
                            .setLabel('RetroAchievements Leaderboard ID')
                            .setPlaceholder('Example: 2310 (from leaderboard URL)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);

                        // Add the description input
                        const descriptionInput = new TextInputBuilder()
                            .setCustomId('description')
                            .setLabel('Why would this make a good arcade board?')
                            .setPlaceholder('Explain why this game would be good for an arcade leaderboard...')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);

                        // Add the inputs to the modal
                        const gameIdRow = new ActionRowBuilder().addComponents(gameIdInput);
                        const leaderboardIdRow = new ActionRowBuilder().addComponents(leaderboardIdInput);
                        const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
                        modal.addComponents(gameIdRow, leaderboardIdRow, descriptionRow);

                        // Show the modal
                        await i.showModal(modal);

                        // Wait for modal submission
                        try {
                            const modalSubmission = await i.awaitModalSubmit({
                                time: 600000 // 10 minutes to fill out the form
                            });

                            // Process the submission
                            const gameId = modalSubmission.fields.getTextInputValue('gameId');
                            const leaderboardId = modalSubmission.fields.getTextInputValue('leaderboardId');
                            const description = modalSubmission.fields.getTextInputValue('description');

                            await modalSubmission.deferUpdate();

                            // Validate game exists via RetroAPI
                            const gameInfo = await retroAPI.getGameInfo(gameId);
                            if (!gameInfo) {
                                return modalSubmission.followUp({ 
                                    content: 'Game not found. Please check the Game ID (the numbers at the end of the game URL on RetroAchievements.org).',
                                    ephemeral: true 
                                });
                            }

                            // Create new suggestion
                            const newSuggestion = new Suggestion({
                                type: 'arcade',
                                gameId,
                                leaderboardId,
                                gameTitle: gameInfo.title,
                                consoleName: gameInfo.consoleName,
                                description,
                                suggestedBy: user.raUsername,
                                discordId: user.discordId,
                                suggestionDate: new Date()
                            });

                            await newSuggestion.save();

                            // Create a success embed
                            const successEmbed = new EmbedBuilder()
                                .setTitle('Arcade Board Suggestion Submitted')
                                .setColor('#00FF00')
                                .setThumbnail(gameInfo.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null)
                                .setDescription(`Your suggestion for **${gameInfo.title}** has been submitted!`)
                                .addFields(
                                    { 
                                        name: 'Game Details', 
                                        value: `**Console:** ${gameInfo.consoleName}\n**Achievements:** ${gameInfo.achievements ? Object.keys(gameInfo.achievements).length : 'Unknown'}\n**Game ID:** ${gameId}\n**Leaderboard ID:** ${leaderboardId}\n[View Game Page](https://retroachievements.org/game/${gameId})\n[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${leaderboardId})`
                                    },
                                    {
                                        name: 'Your Reason', 
                                        value: description
                                    }
                                )
                                .setFooter({ text: 'Thank you for your suggestion!' })
                                .setTimestamp();

                            // Create button to view all suggestions
                            const viewButtonRow = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('view_suggestions')
                                        .setLabel('View All Suggestions')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('📋')
                                );

                            await modalSubmission.editReply({
                                embeds: [successEmbed],
                                components: [viewButtonRow]
                            });

                            // Set up collector for the view button
                            const successMessage = await modalSubmission.fetchReply();
                            const viewCollector = successMessage.createMessageComponentCollector({
                                componentType: ComponentType.Button,
                                time: 300000 // 5 minutes timeout
                            });

                            viewCollector.on('collect', async viewI => {
                                if (viewI.user.id === interaction.user.id && viewI.customId === 'view_suggestions') {
                                    await viewI.deferUpdate();
                                    await this.handleViewSuggestions(viewI);
                                }
                            });
                        } catch (error) {
                            console.error('Error processing arcade suggestion modal:', error);
                            if (error.name === 'Error [InteractionCollectorError]') {
                                // Modal timed out, do nothing
                                return;
                            }
                            await interaction.followUp({ 
                                content: 'An error occurred while processing your arcade board suggestion. Please try again.',
                                ephemeral: true 
                            });
                        }
                    } else if (i.customId === 'back_to_menu') {
                        await i.deferUpdate();
                        await this.showMainMenu(i, user);
                    }
                } else {
                    await i.reply({ 
                        content: 'This menu is not for you. Please use the `/suggest` command to start your own session.',
                        ephemeral: true 
                    });
                }
            });

            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledRow = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(actionRow.components[0]).setDisabled(true),
                            ButtonBuilder.from(actionRow.components[1]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggest again to start a new session.' })],
                            components: [disabledRow]
                        });
                    } catch (error) {
                        console.error('Error disabling arcade suggestion buttons:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error handling arcade suggestion:', error);
            await interaction.editReply('An error occurred while setting up the arcade suggestion form.');
        }
    },

    async handleRacingSuggestion(interaction, user) {
        try {
            // Create the racing suggestion info embed
            const embed = new EmbedBuilder()
                .setTitle('🏎️ Suggest a Racing Challenge')
                .setColor('#FF9900')
                .setDescription('Please complete the form to suggest a new racing challenge for the community.')
                .addFields(
                    {
                        name: 'What is a Racing Challenge?',
                        value: 'Racing challenges are monthly competitions where players compete on time-based leaderboards for racing games.'
                    },
                    {
                        name: 'Game ID Information',
                        value: 'You\'ll need to provide two pieces of information:\n\n1. **Game ID**: The number at the end of the game URL on RetroAchievements.org.\nExample: For https://retroachievements.org/game/10078, the Game ID is `10078`\n\n2. **Leaderboard ID**: The number at the end of the leaderboard URL.\nExample: For https://retroachievements.org/leaderboardinfo.php?i=2310, the Leaderboard ID is `2310`'
                    },
                    {
                        name: 'Track Name (Optional)',
                        value: 'If you\'re suggesting a specific track from the game, you can include that information as well.'
                    },
                    {
                        name: 'Next Steps',
                        value: 'Click the button below to open a form where you can submit your racing challenge suggestion.'
                    }
                );

            // Create the submit button
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('submit_racing')
                        .setLabel('Submit Racing Suggestion')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏎️'),
                    new ButtonBuilder()
                        .setCustomId('back_to_menu')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );

            // Send the info and button
            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });

            // Set up collector for the button
            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes timeout
            });

            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    if (i.customId === 'submit_racing') {
                        // Create the modal for submitting racing suggestion
                        const modal = new ModalBuilder()
                            .setCustomId('racing_suggestion_modal')
                            .setTitle('Suggest a Racing Challenge');

                        // Add the game ID input
                        const gameIdInput = new TextInputBuilder()
                            .setCustomId('gameId')
                            .setLabel('RetroAchievements Game ID')
                            .setPlaceholder('Example: 10078 (from game URL)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);
                            
                        // Add the leaderboard ID input
                        const leaderboardIdInput = new TextInputBuilder()
                            .setCustomId('leaderboardId')
                            .setLabel('RetroAchievements Leaderboard ID')
                            .setPlaceholder('Example: 2310 (from leaderboard URL)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);

                        // Add the description input (required, must come before optional fields)
                        const descriptionInput = new TextInputBuilder()
                            .setCustomId('description')
                            .setLabel('Why would this make a good racing challenge?')
                            .setPlaceholder('Explain why this game/track would make a good racing challenge...')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);
                            
                        // Add the track name input (optional)
                        const trackNameInput = new TextInputBuilder()
                            .setCustomId('trackName')
                            .setLabel('Track Name (optional)')
                            .setPlaceholder('Example: Rainbow Road')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false);

                        // Add the inputs to the modal
                        const gameIdRow = new ActionRowBuilder().addComponents(gameIdInput);
                        const leaderboardIdRow = new ActionRowBuilder().addComponents(leaderboardIdInput);
                        const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
                        const trackNameRow = new ActionRowBuilder().addComponents(trackNameInput);
                        modal.addComponents(gameIdRow, leaderboardIdRow, descriptionRow, trackNameRow);

                        // Show the modal
                        await i.showModal(modal);

                        // Wait for modal submission
                        try {
                            const modalSubmission = await i.awaitModalSubmit({
                                time: 600000 // 10 minutes to fill out the form
                            });

                            // Process the submission
                            const gameId = modalSubmission.fields.getTextInputValue('gameId');
                            const leaderboardId = modalSubmission.fields.getTextInputValue('leaderboardId');
                            const description = modalSubmission.fields.getTextInputValue('description');
                            const trackName = modalSubmission.fields.getTextInputValue('trackName');

                            await modalSubmission.deferUpdate();

                            // Validate game exists via RetroAPI
                            const gameInfo = await retroAPI.getGameInfo(gameId);
                            if (!gameInfo) {
                                return modalSubmission.followUp({ 
                                    content: 'Game not found. Please check the Game ID (the numbers at the end of the game URL on RetroAchievements.org).',
                                    ephemeral: true 
                                });
                            }

                            // Create new suggestion
                            const newSuggestion = new Suggestion({
                                type: 'racing',
                                gameId,
                                leaderboardId,
                                gameTitle: gameInfo.title,
                                consoleName: gameInfo.consoleName,
                                trackName,
                                description,
                                suggestedBy: user.raUsername,
                                discordId: user.discordId,
                                suggestionDate: new Date()
                            });

                            await newSuggestion.save();

                            // Create a success embed
                            const successEmbed = new EmbedBuilder()
                                .setTitle('Racing Challenge Suggestion Submitted')
                                .setColor('#00FF00')
                                .setThumbnail(gameInfo.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null)
                                .setDescription(`Your suggestion for **${gameInfo.title}**${trackName ? ` (${trackName})` : ''} has been submitted!`)
                                .addFields(
                                    { 
                                        name: 'Game Details', 
                                        value: `**Console:** ${gameInfo.consoleName}\n**Achievements:** ${gameInfo.achievements ? Object.keys(gameInfo.achievements).length : 'Unknown'}\n**Game ID:** ${gameId}\n**Leaderboard ID:** ${leaderboardId}\n[View Game Page](https://retroachievements.org/game/${gameId})\n[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${leaderboardId})`
                                    },
                                    {
                                        name: 'Your Reason', 
                                        value: description
                                    }
                                )
                                .setFooter({ text: 'Thank you for your suggestion!' })
                                .setTimestamp();

                            // Create button to view all suggestions
                            const viewButtonRow = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('view_suggestions')
                                        .setLabel('View All Suggestions')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('📋')
                                );

                            await modalSubmission.editReply({
                                embeds: [successEmbed],
                                components: [viewButtonRow]
                            });

                            // Set up collector for the view button
                            const successMessage = await modalSubmission.fetchReply();
                            const viewCollector = successMessage.createMessageComponentCollector({
                                componentType: ComponentType.Button,
                                time: 300000 // 5 minutes timeout
                            });

                            viewCollector.on('collect', async viewI => {
                                if (viewI.user.id === interaction.user.id && viewI.customId === 'view_suggestions') {
                                    await viewI.deferUpdate();
                                    await this.handleViewSuggestions(viewI);
                                }
                            });
                        } catch (error) {
                            console.error('Error processing racing suggestion modal:', error);
                            if (error.name === 'Error [InteractionCollectorError]') {
                                // Modal timed out, do nothing
                                return;
                            }
                            await interaction.followUp({ 
                                content: 'An error occurred while processing your racing challenge suggestion. Please try again.',
                                ephemeral: true 
                            });
                        }
                    } else if (i.customId === 'back_to_menu') {
                        await i.deferUpdate();
                        await this.showMainMenu(i, user);
                    }
                } else {
                    await i.reply({ 
                        content: 'This menu is not for you. Please use the `/suggest` command to start your own session.',
                        ephemeral: true 
                    });
                }
            });

            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledRow = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(actionRow.components[0]).setDisabled(true),
                            ButtonBuilder.from(actionRow.components[1]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggest again to start a new session.' })],
                            components: [disabledRow]
                        });
                    } catch (error) {
                        console.error('Error disabling racing suggestion buttons:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error handling racing suggestion:', error);
            await interaction.editReply('An error occurred while setting up the racing suggestion form.');
        }
    },

    async handleBotSuggestion(interaction, user) {
        try {
            // Create the bot suggestion info embed
            const embed = new EmbedBuilder()
                .setTitle('🤖 Suggest a Bot Improvement')
                .setColor('#5865F2')
                .setDescription('Please complete the form to suggest a new feature or improvement for the community bot.')
                .addFields(
                    {
                        name: 'What can I suggest?',
                        value: 'You can suggest new commands, features, improvements to existing functionality, or any other ideas to make the bot more useful to the community.'
                    },
                    {
                        name: 'Next Steps',
                        value: 'Click the button below to open a form where you can submit your bot improvement suggestion.'
                    }
                );

            // Create the submit button
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('submit_bot')
                        .setLabel('Submit Bot Suggestion')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🤖'),
                    new ButtonBuilder()
                        .setCustomId('back_to_menu')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );

            // Send the info and button
            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });

            // Set up collector for the button
            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes timeout
            });

            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    if (i.customId === 'submit_bot') {
                        // Create the modal for submitting bot suggestion
                        const modal = new ModalBuilder()
                            .setCustomId('bot_suggestion_modal')
                            .setTitle('Suggest a Bot Improvement');

                        // Add the feature input
                        const featureInput = new TextInputBuilder()
                            .setCustomId('feature')
                            .setLabel('Feature or Improvement')
                            .setPlaceholder('Example: Add a daily challenge command')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);

                        // Add the description input
                        const descriptionInput = new TextInputBuilder()
                            .setCustomId('description')
                            .setLabel('Describe your suggestion in detail')
                            .setPlaceholder('Explain how your suggestion would work and why it would be useful...')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);

                        // Add the inputs to the modal
                        const featureRow = new ActionRowBuilder().addComponents(featureInput);
                        const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
                        modal.addComponents(featureRow, descriptionRow);

                        // Show the modal
                        await i.showModal(modal);

                        // Wait for modal submission
                        try {
                            const modalSubmission = await i.awaitModalSubmit({
                                time: 600000 // 10 minutes to fill out the form
                            });

                            // Process the submission
                            const feature = modalSubmission.fields.getTextInputValue('feature');
                            const description = modalSubmission.fields.getTextInputValue('description');

                            await modalSubmission.deferUpdate();

                            // Create new suggestion
                            const newSuggestion = new Suggestion({
                                type: 'bot',
                                title: feature,
                                description,
                                suggestedBy: user.raUsername,
                                discordId: user.discordId,
                                suggestionDate: new Date()
                            });

                            await newSuggestion.save();

                            // Create a success embed
                            const successEmbed = new EmbedBuilder()
                                .setTitle('Bot Improvement Suggestion Submitted')
                                .setColor('#00FF00')
                                .setDescription(`Your suggestion for a bot improvement has been submitted!`)
                                .addFields(
                                    { 
                                        name: 'Feature', 
                                        value: feature
                                    },
                                    {
                                        name: 'Description', 
                                        value: description
                                    }
                                )
                                .setFooter({ text: 'Thank you for your suggestion!' })
                                .setTimestamp();

                            // Create button to view all suggestions
                            const viewButtonRow = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('view_suggestions')
                                        .setLabel('View All Suggestions')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('📋')
                                );

                            await modalSubmission.editReply({
                                embeds: [successEmbed],
                                components: [viewButtonRow]
                            });

                            // Set up collector for the view button
                            const successMessage = await modalSubmission.fetchReply();
                            const viewCollector = successMessage.createMessageComponentCollector({
                                componentType: ComponentType.Button,
                                time: 300000 // 5 minutes timeout
                            });

                            viewCollector.on('collect', async viewI => {
                                if (viewI.user.id === interaction.user.id && viewI.customId === 'view_suggestions') {
                                    await viewI.deferUpdate();
                                    await this.handleViewSuggestions(viewI);
                                }
                            });
                        } catch (error) {
                            console.error('Error processing bot suggestion modal:', error);
                            if (error.name === 'Error [InteractionCollectorError]') {
                                // Modal timed out, do nothing
                                return;
                            }
                            await interaction.followUp({ 
                                content: 'An error occurred while processing your bot improvement suggestion. Please try again.',
                                ephemeral: true 
                            });
                        }
                    } else if (i.customId === 'back_to_menu') {
                        await i.deferUpdate();
                        await this.showMainMenu(i, user);
                    }
                } else {
                    await i.reply({ 
                        content: 'This menu is not for you. Please use the `/suggest` command to start your own session.',
                        ephemeral: true 
                    });
                }
            });

            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledRow = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(actionRow.components[0]).setDisabled(true),
                            ButtonBuilder.from(actionRow.components[1]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggest again to start a new session.' })],
                            components: [disabledRow]
                        });
                    } catch (error) {
                        console.error('Error disabling bot suggestion buttons:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error handling bot suggestion:', error);
            await interaction.editReply('An error occurred while setting up the bot suggestion form.');
        }
    },

    async handleOtherSuggestion(interaction, user) {
        try {
            // Create the other suggestion info embed
            const embed = new EmbedBuilder()
                .setTitle('💡 Other Suggestion')
                .setColor('#9B59B6')
                .setDescription('Please complete the form to submit another type of suggestion for the community.')
                .addFields(
                    {
                        name: 'What can I suggest?',
                        value: 'This category is for any suggestions that don\'t fit into the other categories. Feel free to share your ideas for improving the community!'
                    },
                    {
                        name: 'Next Steps',
                        value: 'Click the button below to open a form where you can submit your suggestion.'
                    }
                );

            // Create the submit button
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('submit_other')
                        .setLabel('Submit Suggestion')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('💡'),
                    new ButtonBuilder()
                        .setCustomId('back_to_menu')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );

            // Send the info and button
            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });

            // Set up collector for the button
            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes timeout
            });

            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    if (i.customId === 'submit_other') {
                        // Create the modal for submitting other suggestion
                        const modal = new ModalBuilder()
                            .setCustomId('other_suggestion_modal')
                            .setTitle('Submit a Suggestion');

                        // Add the title input
                        const titleInput = new TextInputBuilder()
                            .setCustomId('title')
                            .setLabel('Suggestion Title')
                            .setPlaceholder('Give your suggestion a short, descriptive title')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true);

                        // Add the description input
                        const descriptionInput = new TextInputBuilder()
                            .setCustomId('description')
                            .setLabel('Describe your suggestion in detail')
                            .setPlaceholder('Explain your suggestion and why it would be beneficial...')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);

                        // Add the inputs to the modal
                        const titleRow = new ActionRowBuilder().addComponents(titleInput);
                        const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
                        modal.addComponents(titleRow, descriptionRow);

                        // Show the modal
                        await i.showModal(modal);

                        // Wait for modal submission
                        try {
                            const modalSubmission = await i.awaitModalSubmit({
                                time: 600000 // 10 minutes to fill out the form
                            });

                            // Process the submission
                            const title = modalSubmission.fields.getTextInputValue('title');
                            const description = modalSubmission.fields.getTextInputValue('description');

                            await modalSubmission.deferUpdate();

                            // Create new suggestion
                            const newSuggestion = new Suggestion({
                                type: 'other',
                                title,
                                description,
                                suggestedBy: user.raUsername,
                                discordId: user.discordId,
                                suggestionDate: new Date()
                            });

                            await newSuggestion.save();

                            // Create a success embed
                            const successEmbed = new EmbedBuilder()
                                .setTitle('Suggestion Submitted')
                                .setColor('#00FF00')
                                .setDescription(`Your suggestion has been submitted!`)
                                .addFields(
                                    { 
                                        name: 'Title', 
                                        value: title
                                    },
                                    {
                                        name: 'Description', 
                                        value: description
                                    }
                                )
                                .setFooter({ text: 'Thank you for your suggestion!' })
                                .setTimestamp();

                            // Create button to view all suggestions
                            const viewButtonRow = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('view_suggestions')
                                        .setLabel('View All Suggestions')
                                        .setStyle(ButtonStyle.Secondary)
                                        .setEmoji('📋')
                                );

                            await modalSubmission.editReply({
                                embeds: [successEmbed],
                                components: [viewButtonRow]
                            });

                            // Set up collector for the view button
                            const successMessage = await modalSubmission.fetchReply();
                            const viewCollector = successMessage.createMessageComponentCollector({
                                componentType: ComponentType.Button,
                                time: 300000 // 5 minutes timeout
                            });

                            viewCollector.on('collect', async viewI => {
                                if (viewI.user.id === interaction.user.id && viewI.customId === 'view_suggestions') {
                                    await viewI.deferUpdate();
                                    await this.handleViewSuggestions(viewI);
                                }
                            });
                        } catch (error) {
                            console.error('Error processing other suggestion modal:', error);
                            if (error.name === 'Error [InteractionCollectorError]') {
                                // Modal timed out, do nothing
                                return;
                            }
                            await interaction.followUp({ 
                                content: 'An error occurred while processing your suggestion. Please try again.',
                                ephemeral: true 
                            });
                        }
                    } else if (i.customId === 'back_to_menu') {
                        await i.deferUpdate();
                        await this.showMainMenu(i, user);
                    }
                } else {
                    await i.reply({ 
                        content: 'This menu is not for you. Please use the `/suggest` command to start your own session.',
                        ephemeral: true 
                    });
                }
            });

            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledRow = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(actionRow.components[0]).setDisabled(true),
                            ButtonBuilder.from(actionRow.components[1]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggest again to start a new session.' })],
                            components: [disabledRow]
                        });
                    } catch (error) {
                        console.error('Error disabling other suggestion buttons:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error handling other suggestion:', error);
            await interaction.editReply('An error occurred while setting up the suggestion form.');
        }
    },

    async handleViewSuggestions(interaction) {
        try {
            // Get all suggestions
            const suggestions = await Suggestion.find({}).sort({ suggestionDate: -1 });
            
            if (suggestions.length === 0) {
                return interaction.editReply('No suggestions have been submitted yet.');
            }

            // Group suggestions by type
            const suggestionsByType = {
                'arcade': [],
                'racing': [],
                'bot': [],
                'other': []
            };
            
            suggestions.forEach(suggestion => {
                if (suggestionsByType[suggestion.type]) {
                    suggestionsByType[suggestion.type].push(suggestion);
                }
            });
            
            // Create initial embed with all suggestions
            const embed = new EmbedBuilder()
                .setTitle('📋 Community Suggestions')
                .setDescription('Here are all the current community suggestions:')
                .setColor('#00BFFF')
                .setTimestamp();
                
            // Add fields for each category that has suggestions
            if (suggestionsByType.arcade.length > 0) {
                let arcadeText = '';
                suggestionsByType.arcade.slice(0, 5).forEach(s => {
                    arcadeText += `**${s.gameTitle}** (${s.consoleName})\n` +
                                 `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                 `Status: ${s.status}\n` +
                                 `[View Game](https://retroachievements.org/game/${s.gameId})\n\n`;
                });
                
                if (suggestionsByType.arcade.length > 5) {
                    arcadeText += `*...and ${suggestionsByType.arcade.length - 5} more arcade suggestions.*\n`;
                }
                
                embed.addFields({
                    name: '🎯 Arcade Board Suggestions',
                    value: arcadeText
                });
            }
            
            if (suggestionsByType.racing.length > 0) {
                let racingText = '';
                suggestionsByType.racing.slice(0, 5).forEach(s => {
                    racingText += `**${s.gameTitle}**${s.trackName ? ` (${s.trackName})` : ''} (${s.consoleName})\n` +
                                 `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                 `Status: ${s.status}\n` +
                                 `[View Game](https://retroachievements.org/game/${s.gameId})\n\n`;
                });
                
                if (suggestionsByType.racing.length > 5) {
                    racingText += `*...and ${suggestionsByType.racing.length - 5} more racing suggestions.*\n`;
                }
                
                embed.addFields({
                    name: '🏎️ Racing Challenge Suggestions',
                    value: racingText
                });
            }
            
            if (suggestionsByType.bot.length > 0) {
                let botText = '';
                suggestionsByType.bot.slice(0, 5).forEach(s => {
                    botText += `**${s.title}**\n` +
                              `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                              `Status: ${s.status}\n\n`;
                });
                
                if (suggestionsByType.bot.length > 5) {
                    botText += `*...and ${suggestionsByType.bot.length - 5} more bot improvement suggestions.*\n`;
                }
                
                embed.addFields({
                    name: '🤖 Bot Improvement Suggestions',
                    value: botText
                });
            }
            
            if (suggestionsByType.other.length > 0) {
                let otherText = '';
                suggestionsByType.other.slice(0, 5).forEach(s => {
                    otherText += `**${s.title}**\n` +
                                `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                `Status: ${s.status}\n\n`;
                });
                
                if (suggestionsByType.other.length > 5) {
                    otherText += `*...and ${suggestionsByType.other.length - 5} more suggestions.*\n`;
                }
                
                embed.addFields({
                    name: '💡 Other Suggestions',
                    value: otherText
                });
            }
            
            // Create filter dropdown
            const filterRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('filter_suggestions')
                        .setPlaceholder('Filter suggestions by type')
                        .addOptions([
                            {
                                label: 'All Suggestions',
                                description: 'View all community suggestions',
                                value: 'all',
                                emoji: '📋'
                            },
                            {
                                label: 'Arcade Boards',
                                description: 'View arcade board suggestions',
                                value: 'arcade',
                                emoji: '🎯'
                            },
                            {
                                label: 'Racing Challenges',
                                description: 'View racing challenge suggestions',
                                value: 'racing',
                                emoji: '🏎️'
                            },
                            {
                                label: 'Bot Improvements',
                                description: 'View bot improvement suggestions',
                                value: 'bot',
                                emoji: '🤖'
                            },
                            {
                                label: 'Other Suggestions',
                                description: 'View other suggestions',
                                value: 'other',
                                emoji: '💡'
                            }
                        ])
                );
            
            // Add back to menu button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_to_menu')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );
            
            // Send the suggestions with filter
            await interaction.editReply({
                embeds: [embed],
                components: [filterRow, backRow]
            });
            
            // Set up collector for the filter dropdown
            const message = await interaction.fetchReply();
            const filterCollector = message.createMessageComponentCollector({
                time: 300000 // 5 minutes timeout
            });
            
            filterCollector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    await i.deferUpdate();
                    
                    if (i.customId === 'filter_suggestions') {
                        const filterType = i.values[0];
                        await this.showFilteredSuggestions(i, filterType);
                    } else if (i.customId === 'back_to_menu') {
                        await this.showMainMenu(i, await User.findOne({ discordId: i.user.id }));
                    }
                } else {
                    await i.reply({ 
                        content: 'This menu is not for you. Please use the `/suggest` command to start your own session.',
                        ephemeral: true 
                    });
                }
            });
            
            // When collector expires
            filterCollector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledFilterRow = new ActionRowBuilder().addComponents(
                            StringSelectMenuBuilder.from(filterRow.components[0]).setDisabled(true)
                        );
                        
                        const disabledBackRow = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(backRow.components[0]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'This menu has expired. Use /suggest again to start a new session.' })],
                            components: [disabledFilterRow, disabledBackRow]
                        });
                    } catch (error) {
                        console.error('Error disabling suggestion view menu:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error viewing suggestions:', error);
            await interaction.editReply('An error occurred while retrieving suggestions. Please try again.');
        }
    },

    async showFilteredSuggestions(interaction, filterType) {
        try {
            // Get suggestions based on filter
            const filter = filterType !== 'all' ? { type: filterType } : {};
            const suggestions = await Suggestion.find(filter).sort({ suggestionDate: -1 });
            
            if (suggestions.length === 0) {
                return interaction.editReply(`No ${filterType !== 'all' ? filterType + ' ' : ''}suggestions found.`);
            }
            
            // Create embed for filtered suggestions
            const embed = new EmbedBuilder()
                .setTitle(`📋 ${filterType === 'all' ? 'All' : (filterType === 'arcade' ? 'Arcade Board' : (filterType === 'racing' ? 'Racing Challenge' : (filterType === 'bot' ? 'Bot Improvement' : 'Other')))} Suggestions`)
                .setDescription(`Showing ${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}:`)
                .setColor('#00BFFF')
                .setTimestamp();
            
            // Show suggestions based on type
            if (filterType === 'arcade' || filterType === 'all') {
                const arcadeSuggestions = filterType === 'all' ? suggestions.filter(s => s.type === 'arcade') : suggestions;
                
                if (arcadeSuggestions.length > 0) {
                    let arcadeText = '';
                    arcadeSuggestions.slice(0, 10).forEach(s => {
                        arcadeText += `**${s.gameTitle}** (${s.consoleName})\n` +
                                     `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                     `Status: ${s.status}\n` +
                                     `Reason: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n` +
                                     `[View Game](https://retroachievements.org/game/${s.gameId})\n\n`;
                    });
                    
                    if (arcadeSuggestions.length > 10) {
                        arcadeText += `*...and ${arcadeSuggestions.length - 10} more arcade suggestions.*\n`;
                    }
                    
                    if (filterType === 'all') {
                        embed.addFields({
                            name: '🎯 Arcade Board Suggestions',
                            value: arcadeText
                        });
                    } else {
                        embed.setDescription(`Showing ${arcadeSuggestions.length} arcade board suggestion${arcadeSuggestions.length !== 1 ? 's' : ''}:`);
                        embed.setDescription(arcadeText);
                    }
                }
            }
            
            if (filterType === 'racing' || filterType === 'all') {
                const racingSuggestions = filterType === 'all' ? suggestions.filter(s => s.type === 'racing') : suggestions;
                
                if (racingSuggestions.length > 0) {
                    let racingText = '';
                    racingSuggestions.slice(0, 10).forEach(s => {
                        racingText += `**${s.gameTitle}**${s.trackName ? ` (${s.trackName})` : ''} (${s.consoleName})\n` +
                                     `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                     `Status: ${s.status}\n` +
                                     `Reason: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n` +
                                     `[View Game](https://retroachievements.org/game/${s.gameId})\n\n`;
                    });
                    
                    if (racingSuggestions.length > 10) {
                        racingText += `*...and ${racingSuggestions.length - 10} more racing suggestions.*\n`;
                    }
                    
                    if (filterType === 'all') {
                        embed.addFields({
                            name: '🏎️ Racing Challenge Suggestions',
                            value: racingText
                        });
                    } else {
                        embed.setDescription(`Showing ${racingSuggestions.length} racing challenge suggestion${racingSuggestions.length !== 1 ? 's' : ''}:`);
                        embed.setDescription(racingText);
                    }
                }
            }
            
            if (filterType === 'bot' || filterType === 'all') {
                const botSuggestions = filterType === 'all' ? suggestions.filter(s => s.type === 'bot') : suggestions;
                
                if (botSuggestions.length > 0) {
                    let botText = '';
                    botSuggestions.slice(0, 10).forEach(s => {
                        botText += `**${s.title}**\n` +
                                  `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                  `Status: ${s.status}\n` +
                                  `Description: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n\n`;
                    });
                    
                    if (botSuggestions.length > 10) {
                        botText += `*...and ${botSuggestions.length - 10} more bot improvement suggestions.*\n`;
                    }
                    
                    if (filterType === 'all') {
                        embed.addFields({
                            name: '🤖 Bot Improvement Suggestions',
                            value: botText
                        });
                    } else {
                        embed.setDescription(`Showing ${botSuggestions.length} bot improvement suggestion${botSuggestions.length !== 1 ? 's' : ''}:`);
                        embed.setDescription(botText);
                    }
                }
            }
            
            if (filterType === 'other' || filterType === 'all') {
                const otherSuggestions = filterType === 'all' ? suggestions.filter(s => s.type === 'other') : suggestions;
                
                if (otherSuggestions.length > 0) {
                    let otherText = '';
                    otherSuggestions.slice(0, 10).forEach(s => {
                        otherText += `**${s.title}**\n` +
                                    `Suggested by: ${s.suggestedBy} on ${new Date(s.suggestionDate).toLocaleDateString()}\n` +
                                    `Status: ${s.status}\n` +
                                    `Description: ${s.description.substring(0, 100)}${s.description.length > 100 ? '...' : ''}\n\n`;
                    });
                    
                    if (otherSuggestions.length > 10) {
                        otherText += `*...and ${otherSuggestions.length - 10} more suggestions.*\n`;
                    }
                    
                    if (filterType === 'all') {
                        embed.addFields({
                            name: '💡 Other Suggestions',
                            value: otherText
                        });
                    } else {
                        embed.setDescription(`Showing ${otherSuggestions.length} other suggestion${otherSuggestions.length !== 1 ? 's' : ''}:`);
                        embed.setDescription(otherText);
                    }
                }
            }
            
            // Create filter dropdown
            const filterRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('filter_suggestions')
                        .setPlaceholder('Filter suggestions by type')
                        .addOptions([
                            {
                                label: 'All Suggestions',
                                description: 'View all community suggestions',
                                value: 'all',
                                emoji: '📋'
                            },
                            {
                                label: 'Arcade Boards',
                                description: 'View arcade board suggestions',
                                value: 'arcade',
                                emoji: '🎯'
                            },
                            {
                                label: 'Racing Challenges',
                                description: 'View racing challenge suggestions',
                                value: 'racing',
                                emoji: '🏎️'
                            },
                            {
                                label: 'Bot Improvements',
                                description: 'View bot improvement suggestions',
                                value: 'bot',
                                emoji: '🤖'
                            },
                            {
                                label: 'Other Suggestions',
                                description: 'View other suggestions',
                                value: 'other',
                                emoji: '💡'
                            }
                        ])
                );
            
            // Add back to menu button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back_to_menu')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );
            
            // Send the filtered suggestions
            await interaction.editReply({
                embeds: [embed],
                components: [filterRow, backRow]
            });
        } catch (error) {
            console.error('Error showing filtered suggestions:', error);
            await interaction.editReply('An error occurred while retrieving suggestions. Please try again.');
        }
    }
};
