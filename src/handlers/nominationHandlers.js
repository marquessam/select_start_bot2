// src/handlers/nominationHandlers.js
// Handle button interactions, modals, and select menus for the nomination system

import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { User } from '../models/User.js';
import { NominationSettings } from '../models/NominationSettings.js';
import enhancedRetroAPI from '../services/enhancedRetroAPI.js';
import { config } from '../config/config.js';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const MAX_NOMINATIONS = 2;

export class NominationInteractionHandler {
    /**
     * Handle select menu interactions for nomination system
     */
    static async handleSelectMenuInteraction(interaction) {
        if (interaction.customId !== 'nominate_main_menu') {
            return;
        }

        const selectedValue = interaction.values[0];

        try {
            // Get the nominate command to reuse its methods
            const nominateCommand = interaction.client.commands.get('nominate');
            
            switch(selectedValue) {
                case 'nominate':
                    await this.handleOpenNominationForm(interaction);
                    break;
                case 'info':
                    await nominateCommand.handleDetailedInfo(interaction);
                    break;
                case 'status':
                    await nominateCommand.handleStatus(interaction);
                    break;
                case 'upcoming':
                    await this.handleUpcomingInfo(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown menu option.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error handling select menu interaction:', error);
            
            const errorMessage = {
                content: 'An error occurred while processing your selection.',
                ephemeral: true
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }

    /**
     * Handle all nomination-related button interactions
     */
    static async handleButtonInteraction(interaction) {
        const customId = interaction.customId;

        try {
            switch(customId) {
                case 'nominate_open_form':
                    await this.handleOpenNominationForm(interaction);
                    break;
                case 'nominate_detailed_info':
                    await this.handleDetailedInfo(interaction);
                    break;
                case 'nominate_refresh_menu':
                    await this.handleRefreshMenu(interaction);
                    break;
                case 'nominate_upcoming_info':
                    await this.handleUpcomingInfo(interaction);
                    break;
                case 'nominate_back_to_main':
                    await this.handleBackToMain(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown button interaction.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error handling nomination button interaction:', error);
            
            const errorMessage = {
                content: 'An error occurred while processing your request.',
                ephemeral: true
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }

    /**
     * Handle modal submissions for nominations
     */
    static async handleModalSubmit(interaction) {
        const customId = interaction.customId;

        try {
            switch(customId) {
                case 'nomination_form':
                    await this.handleNominationFormSubmit(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown modal submission.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error handling nomination modal submission:', error);
            
            const errorMessage = {
                content: 'An error occurred while processing your nomination.',
                ephemeral: true
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }

    /**
     * Handle back to main menu button
     */
    static async handleBackToMain(interaction) {
        await interaction.deferUpdate();

        try {
            const nominateCommand = interaction.client.commands.get('nominate');
            
            await interaction.editReply({
                embeds: [nominateCommand.createMainMenuEmbed()],
                components: nominateCommand.createMenuComponents()
            });
        } catch (error) {
            console.error('Error handling back to main:', error);
            await interaction.editReply({
                content: 'An error occurred while returning to the main menu.',
                embeds: [],
                components: []
            });
        }
    }

    /**
     * Open the nomination form modal
     */
    static async handleOpenNominationForm(interaction) {
        const user = await User.findOne({ discordId: interaction.user.id });
        
        if (!user) {
            return interaction.reply({
                content: 'You need to register first using `/register` command.',
                ephemeral: true
            });
        }

        // Check if nominations are open
        const settings = await NominationSettings.getSettings();
        const now = new Date();
        
        if (!settings.areNominationsOpen(now)) {
            const nextOpening = settings.getNextOpeningDate(now);
            const nextOpeningTimestamp = Math.floor(nextOpening.getTime() / 1000);
            
            return interaction.reply({
                content: `🚫 **Nominations are currently closed!**\n\nNext nominations period opens: <t:${nextOpeningTimestamp}:F>`,
                ephemeral: true
            });
        }

        const currentNominations = user.getCurrentNominations();
        if (currentNominations.length >= MAX_NOMINATIONS) {
            return interaction.reply({
                content: `You've already used all ${MAX_NOMINATIONS} nominations for this month.`,
                ephemeral: true
            });
        }

        // Create the modal form
        const modal = new ModalBuilder()
            .setCustomId('nomination_form')
            .setTitle('🎮 Nominate a Game');

        // Game ID input
        const gameIdInput = new TextInputBuilder()
            .setCustomId('game_id')
            .setLabel('RetroAchievements Game ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 12345')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(10);

        // Optional comment input
        const commentInput = new TextInputBuilder()
            .setCustomId('nomination_comment')
            .setLabel('Why this game? (Optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Tell us why you chose this game...')
            .setRequired(false)
            .setMaxLength(500);

        // Add inputs to action rows
        const gameIdRow = new ActionRowBuilder().addComponents(gameIdInput);
        const commentRow = new ActionRowBuilder().addComponents(commentInput);

        modal.addComponents(gameIdRow, commentRow);

        await interaction.showModal(modal);
    }

    /**
     * Handle the nomination form submission - KEEP ORIGINAL PUBLIC POSTING BEHAVIOR
     */
    static async handleNominationFormSubmit(interaction) {
        // This should post publicly, not ephemeral - PRESERVING ORIGINAL BEHAVIOR
        await interaction.deferReply({ ephemeral: false });

        try {
            const gameIdStr = interaction.fields.getTextInputValue('game_id');
            const comment = interaction.fields.getTextInputValue('nomination_comment') || null;
            
            // Validate game ID
            const gameId = parseInt(gameIdStr);
            if (isNaN(gameId) || gameId <= 0) {
                return interaction.editReply({
                    content: '❌ Please provide a valid Game ID (positive number).'
                });
            }

            // Process the nomination - PRESERVING ORIGINAL RICH EMBED BEHAVIOR
            await this.processModalNomination(interaction, gameId, comment);

        } catch (error) {
            console.error('Error processing nomination form:', error);
            await interaction.editReply({
                content: 'An error occurred while processing your nomination. Please try again.'
            });
        }
    }

    /**
     * Process nomination from modal form - PRESERVE ORIGINAL RICH EMBED FUNCTIONALITY
     */
    static async processModalNomination(interaction, gameId, comment) {
        try {
            const settings = await NominationSettings.getSettings();
            const now = new Date();

            // Check if nominations are open
            if (!settings.areNominationsOpen(now)) {
                const nextOpening = settings.getNextOpeningDate(now);
                const nextOpeningTimestamp = Math.floor(nextOpening.getTime() / 1000);
                
                return interaction.editReply(
                    `🚫 **Nominations are currently closed!**\n\n` +
                    `Next nominations period opens: <t:${nextOpeningTimestamp}:F>`
                );
            }

            // Get user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply(
                    'You need to be registered to nominate games. Please use the `/register` command first.'
                );
            }

            // Get game details
            let gameData;
            let achievementCount;
            
            try {
                gameData = await enhancedRetroAPI.getGameDetails(gameId);
                achievementCount = await enhancedRetroAPI.getGameAchievementCount(gameId);
            } catch (error) {
                console.error(`Error fetching game info for gameId ${gameId}:`, error);
                return interaction.editReply(
                    '❌ Game not found or unable to retrieve game information. Please check the Game ID and try again.'
                );
            }

            // Validate game data
            if (!gameData.title || !gameData.consoleName) {
                return interaction.editReply(
                    '❌ The game information appears to be incomplete. Please try again.'
                );
            }

            // Check eligibility
            if (!settings.isGameAllowed(gameData, now)) {
                return interaction.editReply(
                    settings.getRestrictionMessage(gameData, now)
                );
            }

            // Check current nominations
            const currentNominations = user.getCurrentNominations();
            
            // Check for duplicate
            const existingNomination = currentNominations.find(nom => nom.gameId === gameId);
            if (existingNomination) {
                return interaction.editReply(`❌ You've already nominated "${gameData.title}" for next month's challenge.`);
            }
            
            // Check max nominations
            if (currentNominations.length >= MAX_NOMINATIONS) {
                return interaction.editReply(
                    `❌ You've already used all ${MAX_NOMINATIONS} of your nominations for next month.`
                );
            }

            // Create nomination
            const nomination = {
                gameId: gameId,
                gameTitle: gameData.title,
                consoleName: gameData.consoleName,
                publisher: gameData.publisher,
                developer: gameData.developer,
                genre: gameData.genre,
                released: gameData.released,
                comment: comment,
                nominatedAt: new Date()
            };

            // Save nomination
            if (!user.nominations) {
                user.nominations = [];
            }
            user.nominations.push(nomination);
            
            await user.save();
            
            // Create success response - PRESERVE ORIGINAL RICH EMBED
            const currentRestriction = settings.getCurrentMonthRestriction(now);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Game Nominated Successfully!')
                .setColor(currentRestriction?.restrictionRule?.color || '#00FF00')
                .setThumbnail(`https://retroachievements.org${gameData.imageIcon}`)
                .setURL(`https://retroachievements.org/game/${gameId}`)
                .setTimestamp();

            // Special description for themed months
            if (currentRestriction && currentRestriction.enabled) {
                embed.setDescription(
                    `${user.raUsername} has nominated a game for **${currentRestriction.restrictionRule.name}**! ${currentRestriction.restrictionRule.emoji}`
                );
            } else {
                embed.setDescription(`${user.raUsername} has nominated a game for next month's challenge:`);
            }

            // Game details
            embed.addFields(
                { name: '🎮 Game', value: gameData.title, inline: true },
                { name: '🎯 Console', value: gameData.consoleName, inline: true },
                { name: '🏆 Achievements', value: achievementCount.toString(), inline: true }
            );

            if (gameData.publisher) {
                embed.addFields({ name: '🏢 Publisher', value: gameData.publisher, inline: true });
            }
            if (gameData.developer) {
                embed.addFields({ name: '👨‍💻 Developer', value: gameData.developer, inline: true });
            }
            if (gameData.genre) {
                embed.addFields({ name: '🎭 Genre', value: gameData.genre, inline: true });
            }

            // Add comment if provided
            if (comment) {
                embed.addFields({
                    name: '💭 Why this game?',
                    value: comment,
                    inline: false
                });
            }

            // Status
            embed.addFields({
                name: '📊 Status',
                value: `${user.raUsername} has ${MAX_NOMINATIONS - currentNominations.length}/${MAX_NOMINATIONS} nominations remaining`,
                inline: false
            });

            // PRESERVE ORIGINAL ACTION BUTTONS
            const actionRow = new ActionRowBuilder();
            if (currentNominations.length < MAX_NOMINATIONS) {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('nominate_open_form')
                        .setLabel('Nominate Another')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎮')
                );
            }

            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('nominate_back_to_main')
                    .setLabel('Back to Menu')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📋')
            );

            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });

            // ALSO send a follow-up private confirmation
            try {
                await interaction.followUp({
                    content: `✅ **Nomination confirmed!** Your nomination for **${gameData.title}** has been posted publicly.`,
                    ephemeral: true
                });
            } catch (followUpError) {
                console.error('Error sending private confirmation:', followUpError);
            }

        } catch (error) {
            console.error('Error in processModalNomination:', error);
            await interaction.editReply('An unexpected error occurred while processing your nomination.');
        }
    }

    /**
     * Show detailed information in an ephemeral response
     */
    static async handleDetailedInfo(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const settings = await NominationSettings.getSettings();
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentRestriction = settings.getCurrentMonthRestriction(now);

            const embed = new EmbedBuilder()
                .setTitle('📋 Detailed Nomination Information')
                .setColor('#0099FF')
                .setTimestamp();

            // Current restrictions detail
            if (currentRestriction && currentRestriction.enabled) {
                const monthName = MONTH_NAMES[currentMonth];
                
                embed.addFields({
                    name: `${currentRestriction.restrictionRule.emoji} ${monthName} Theme Details`,
                    value: `**${currentRestriction.restrictionRule.name}**\n${currentRestriction.restrictionRule.description}`,
                    inline: false
                });

                // Rule breakdown
                if (currentRestriction.restrictionRule.rules && currentRestriction.restrictionRule.rules.conditions) {
                    const conditions = currentRestriction.restrictionRule.rules.conditions;
                    const ruleType = currentRestriction.restrictionRule.rules.type || 'AND';
                    
                    let rulesText = `**Logic:** ${ruleType} (${conditions.length} condition${conditions.length > 1 ? 's' : ''})\n\n`;
                    
                    conditions.forEach((condition, index) => {
                        const conditionText = this.formatCondition(condition);
                        rulesText += `${index + 1}. ${conditionText}\n`;
                    });

                    if (rulesText.length <= 1024) {
                        embed.addFields({
                            name: '🔍 Rule Details',
                            value: rulesText,
                            inline: false
                        });
                    }
                }
            } else {
                embed.addFields({
                    name: '🔓 Current Status',
                    value: 'No special restrictions - all games are welcome!',
                    inline: false
                });
            }

            // Nomination guidelines
            embed.addFields({
                name: '📝 Nomination Guidelines',
                value: '• You can nominate up to **2 games** per month\n' +
                       '• Games must meet current month\'s theme requirements\n' +
                       '• Find Game IDs on RetroAchievements.org in the URL\n' +
                       '• Duplicate nominations are not allowed\n' +
                       '• Nominations close during the last 8 days of each month',
                inline: false
            });

            // Always blocked (if any)
            if (settings.alwaysBlockedConsoles.length > 0) {
                embed.addFields({
                    name: '🚫 Always Ineligible',
                    value: settings.alwaysBlockedConsoles.join(', '),
                    inline: false
                });
            }

            // Tips
            embed.addFields({
                name: '💡 Pro Tips',
                value: '• Use `/restrictions test gameid:XXXXX` to test game eligibility\n' +
                       '• Check upcoming themes to plan ahead\n' +
                       '• Consider achievement count when nominating',
                inline: false
            });

            // Back button
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('nominate_back_to_main')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({ 
                embeds: [embed],
                components: [backButton]
            });

        } catch (error) {
            console.error('Error in handleDetailedInfo:', error);
            await interaction.editReply('An error occurred while fetching detailed information.');
        }
    }

    /**
     * Refresh the main nomination menu
     */
    static async handleRefreshMenu(interaction) {
        await interaction.deferUpdate();

        try {
            const nominateCommand = interaction.client.commands.get('nominate');
            
            // Recreate the main menu using the command's methods
            const settings = await NominationSettings.getSettings();
            const user = await User.findOne({ discordId: interaction.user.id });
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const nominationsOpen = settings.areNominationsOpen(now);
            const currentRestriction = settings.getCurrentMonthRestriction(now);
            const monthName = MONTH_NAMES[currentMonth];

            // Create main embed with current status
            const embed = nominateCommand.createMainMenuEmbed();

            // Add dynamic status information
            if (nominationsOpen) {
                embed.addFields({
                    name: '✅ Status: OPEN',
                    value: 'Nominations are currently being accepted!',
                    inline: true
                });

                // Show closing time
                const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                const closeDaysStart = daysInMonth - settings.nominationCloseDays + 1;
                const nextClosing = new Date(currentYear, currentMonth, closeDaysStart);
                const nextClosingTimestamp = Math.floor(nextClosing.getTime() / 1000);
                
                embed.addFields({
                    name: '⏰ Deadline',
                    value: `<t:${nextClosingTimestamp}:R>`,
                    inline: true
                });
            } else {
                embed.addFields({
                    name: '❌ Status: CLOSED',
                    value: 'Nominations not currently accepted',
                    inline: true
                });

                const nextOpening = settings.getNextOpeningDate(now);
                const nextOpeningTimestamp = Math.floor(nextOpening.getTime() / 1000);
                
                embed.addFields({
                    name: '📅 Next Opening',
                    value: `<t:${nextOpeningTimestamp}:R>`,
                    inline: true
                });
            }

            // Current month theme (brief)
            if (currentRestriction && currentRestriction.enabled) {
                embed.addFields({
                    name: `🎯 ${monthName} Theme`,
                    value: `${currentRestriction.restrictionRule.emoji} **${currentRestriction.restrictionRule.name}**\n${currentRestriction.restrictionRule.description.substring(0, 100)}${currentRestriction.restrictionRule.description.length > 100 ? '...' : ''}`,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: `🔓 ${monthName} Theme`,
                    value: 'No special restrictions - all games welcome!',
                    inline: false
                });
            }

            // User's nomination count (if registered)
            if (user) {
                const currentNominations = user.getCurrentNominations();
                embed.addFields({
                    name: '📊 Your Progress',
                    value: `${currentNominations.length}/${MAX_NOMINATIONS} nominations used`,
                    inline: true
                });
            } else {
                embed.addFields({
                    name: '⚠️ Not Registered',
                    value: 'Use `/register` first',
                    inline: true
                });
            }

            // Update embed color based on status
            embed.setColor(nominationsOpen ? '#00FF00' : '#FF0000');

            await interaction.editReply({
                embeds: [embed],
                components: nominateCommand.createMenuComponents()
            });

        } catch (error) {
            console.error('Error in handleRefreshMenu:', error);
            await interaction.followUp({
                content: 'An error occurred while refreshing the menu.',
                ephemeral: true
            });
        }
    }

    /**
     * Show upcoming restrictions
     */
    static async handleUpcomingInfo(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const settings = await NominationSettings.getSettings();
            const now = new Date();
            const currentMonth = now.getMonth();

            const upcomingRestrictions = settings.monthlyRestrictions
                .filter(r => r.enabled && r.month !== currentMonth)
                .sort((a, b) => {
                    // Sort by next occurrence
                    const aNext = a.month > currentMonth ? a.month : a.month + 12;
                    const bNext = b.month > currentMonth ? b.month : b.month + 12;
                    return aNext - bNext;
                })
                .slice(0, 6);

            const embed = new EmbedBuilder()
                .setTitle('🔮 Upcoming Monthly Themes')
                .setColor('#9B59B6')
                .setTimestamp();

            if (upcomingRestrictions.length > 0) {
                upcomingRestrictions.forEach(restriction => {
                    const monthName = MONTH_NAMES[restriction.month];
                    const monthDistance = restriction.month > currentMonth ? 
                        restriction.month - currentMonth : 
                        (12 - currentMonth) + restriction.month;
                    
                    const distanceText = monthDistance === 1 ? 'Next month' : `In ${monthDistance} months`;
                    
                    embed.addFields({
                        name: `${restriction.restrictionRule.emoji} ${monthName} - ${distanceText}`,
                        value: `**${restriction.restrictionRule.name}**\n${restriction.restrictionRule.description}`,
                        inline: false
                    });
                });
            } else {
                embed.addFields({
                    name: '📅 No Upcoming Themes',
                    value: 'No special restrictions planned for upcoming months.',
                    inline: false
                });
            }

            embed.addFields({
                name: '💡 Planning Ahead',
                value: 'Use the detailed info option to check specific month requirements\nThemes may be added or changed by administrators',
                inline: false
            });

            // Back button
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('nominate_back_to_main')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({ 
                embeds: [embed],
                components: [backButton]
            });

        } catch (error) {
            console.error('Error in handleUpcomingInfo:', error);
            await interaction.editReply('An error occurred while fetching upcoming information.');
        }
    }

    /**
     * Format a restriction condition for display
     */
    static formatCondition(condition) {
        switch (condition.type) {
            case 'CONSOLE_GROUP':
                return `🎯 Console Group: **${condition.value}**`;
            case 'PUBLISHER_GROUP':
                return `🏢 Publisher Group: **${condition.value}**`;
            case 'GENRE_GROUP':
                return `🎭 Genre Group: **${condition.value}**`;
            case 'CONSOLE_NAME':
                return `🎯 Console: **${condition.value}**`;
            case 'PUBLISHER':
                return `🏢 Publisher: **${condition.value}**`;
            case 'DEVELOPER':
                return `👨‍💻 Developer: **${condition.value}**`;
            case 'GENRE':
                return `🎭 Genre: **${condition.value}**`;
            case 'MIN_YEAR':
                return `📅 Released after: **${condition.value}**`;
            case 'MAX_YEAR':
                return `📅 Released before: **${condition.value + 1}**`;
            case 'YEAR_RANGE':
                return `📅 Released: **${condition.min}-${condition.max}**`;
            default:
                return `❓ ${condition.type}: **${condition.value}**`;
        }
    }
}

// Export individual handler functions for easier integration
export const handleNominationButtonInteraction = NominationInteractionHandler.handleButtonInteraction.bind(NominationInteractionHandler);
export const handleNominationModalSubmit = NominationInteractionHandler.handleModalSubmit.bind(NominationInteractionHandler);
export const handleNominationSelectMenu = NominationInteractionHandler.handleSelectMenuInteraction.bind(NominationInteractionHandler);
