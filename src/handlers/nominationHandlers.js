// src/handlers/nominationHandlers.js - Enhanced with better GP award handling and logging + clickable game links
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
import gpRewardService from '../services/gpRewardService.js';
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
                    await nominateCommand.showDetailedInfo(interaction);
                    break;
                case 'status':
                    await nominateCommand.showUserStatus(interaction);
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
                case 'nominate_refresh_menu':
                    await this.handleRefreshMenu(interaction);
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
            await nominateCommand.showMainMenu(interaction);
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
     * Refresh the main nomination menu
     */
    static async handleRefreshMenu(interaction) {
        await interaction.deferUpdate();

        try {
            const nominateCommand = interaction.client.commands.get('nominate');
            await nominateCommand.showMainMenu(interaction);
        } catch (error) {
            console.error('Error in handleRefreshMenu:', error);
            await interaction.followUp({
                content: 'An error occurred while refreshing the menu.',
                ephemeral: true
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
        const remaining = MAX_NOMINATIONS - currentNominations.length;
        
        if (remaining <= 0) {
            return interaction.reply({
                content: `You've already used all ${MAX_NOMINATIONS} nominations for this month.`,
                ephemeral: true
            });
        }

        // Create the modal form
        const modal = new ModalBuilder()
            .setCustomId('nomination_form')
            .setTitle('🎮 Nominate a Game (+25 GP)');

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
            .setPlaceholder('Tell us why you chose this game... (+25 GP for nominating!)')
            .setRequired(false)
            .setMaxLength(500);

        // Add inputs to action rows
        const gameIdRow = new ActionRowBuilder().addComponents(gameIdInput);
        const commentRow = new ActionRowBuilder().addComponents(commentInput);

        modal.addComponents(gameIdRow, commentRow);

        await interaction.showModal(modal);
    }

    /**
     * Handle the nomination form submission - Posts publicly with STATIC EMBED (no buttons) + GP REWARD
     */
    static async handleNominationFormSubmit(interaction) {
        // Post publicly for community to see
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

            // Process the nomination
            await this.processNomination(interaction, gameId, comment);

        } catch (error) {
            console.error('Error processing nomination form:', error);
            await interaction.editReply({
                content: 'An error occurred while processing your nomination. Please try again.'
            });
        }
    }

    /**
     * Process nomination and create STATIC SUCCESS EMBED (no buttons) + AWARD GP + CLICKABLE GAME LINKS
     */
    static async processNomination(interaction, gameId, comment) {
        try {
            console.log(`🎮 Processing nomination: User ${interaction.user.tag} (${interaction.user.id}) nominating game ${gameId}`);

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

            console.log(`👤 Found user: ${user.raUsername} (Discord: ${user.discordId})`);

            // Check current nominations BEFORE processing
            const currentNominations = user.getCurrentNominations();
            const remainingBefore = MAX_NOMINATIONS - currentNominations.length;
            
            console.log(`📊 User has ${currentNominations.length}/${MAX_NOMINATIONS} nominations, ${remainingBefore} remaining`);
            
            if (remainingBefore <= 0) {
                return interaction.editReply(
                    `❌ You've already used all ${MAX_NOMINATIONS} of your nominations for next month.`
                );
            }

            // Get game details
            let gameData;
            let achievementCount;
            
            try {
                console.log(`🔍 Fetching game data for game ID: ${gameId}`);
                gameData = await enhancedRetroAPI.getGameDetails(gameId);
                achievementCount = await enhancedRetroAPI.getGameAchievementCount(gameId);
                console.log(`✅ Game data retrieved: ${gameData.title} (${gameData.consoleName}) - ${achievementCount} achievements`);
            } catch (error) {
                console.error(`❌ Error fetching game info for gameId ${gameId}:`, error);
                return interaction.editReply(
                    '❌ Game not found or unable to retrieve game information. Please check the Game ID and try again.'
                );
            }

            // Validate game data
            if (!gameData.title || !gameData.consoleName) {
                console.error('❌ Incomplete game data received:', gameData);
                return interaction.editReply(
                    '❌ The game information appears to be incomplete. Please try again.'
                );
            }

            // Check eligibility
            if (!settings.isGameAllowed(gameData, now)) {
                console.log(`❌ Game ${gameData.title} is not allowed under current restrictions`);
                return interaction.editReply(
                    settings.getRestrictionMessage(gameData, now)
                );
            }
            
            // Check for duplicate
            const existingNomination = currentNominations.find(nom => nom.gameId === gameId);
            if (existingNomination) {
                console.log(`❌ User already nominated this game: ${gameData.title}`);
                return interaction.editReply(`❌ You've already nominated "${gameData.title}" for next month's challenge.`);
            }

            // Create nomination object
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

            console.log(`💾 Saving nomination to database:`, nomination);

            // Save nomination to database
            if (!user.nominations) {
                user.nominations = [];
            }
            user.nominations.push(nomination);
            
            // Check user's GP balance before awarding
            const balanceBefore = user.gpBalance || 0;
            console.log(`💰 User's GP balance before nomination: ${balanceBefore}`);
            
            await user.save();
            console.log(`✅ Nomination saved to database for ${user.raUsername}: ${gameData.title}`);
            
            // *** AWARD GP FOR NOMINATION WITH ENHANCED LOGGING ***
            let gpAwarded = false;
            let gpError = null;
            
            try {
                console.log(`🎁 Attempting to award nomination GP to ${user.raUsername} for ${gameData.title}`);
                gpAwarded = await gpRewardService.awardNominationGP(user, gameData.title);
                
                if (gpAwarded) {
                    console.log(`✅ Successfully awarded nomination GP to ${user.raUsername} for ${gameData.title}`);
                    
                    // Reload user to get updated balance
                    await user.reload();
                    const balanceAfter = user.gpBalance || 0;
                    console.log(`💰 User's GP balance after nomination: ${balanceAfter} (difference: +${balanceAfter - balanceBefore})`);
                } else {
                    console.warn(`⚠️ GP reward service returned false for ${user.raUsername} - possibly duplicate or other issue`);
                }
            } catch (gpErrorCaught) {
                gpError = gpErrorCaught;
                console.error(`❌ Error awarding nomination GP to ${user.raUsername}:`, gpErrorCaught);
                console.error('GP Error Stack:', gpErrorCaught.stack);
                // Don't fail the nomination because of GP error - continue with announcement
            }
            
            // *** CREATE CLICKABLE GAME LINK ***
            const gameUrl = `https://retroachievements.org/game/${gameId}`;
            const clickableGameTitle = `[${gameData.title}](${gameUrl})`;
            console.log(`🔗 Created clickable game link: ${gameUrl}`);
            
            // Create STATIC success embed using the nominate command method
            const nominateCommand = interaction.client.commands.get('nominate');
            
            // Prepare game data object for the embed with clickable title
            const gameDataForEmbed = {
                Title: clickableGameTitle, // UPDATED: Now includes clickable link
                ConsoleName: gameData.consoleName,
                NumAchievements: achievementCount,
                Publisher: gameData.publisher,
                Developer: gameData.developer,
                Genre: gameData.genre,
                ImageIcon: `https://retroachievements.org${gameData.imageIcon}`
            };

            // Create static embed with correct remaining count (remainingBefore - 1) and GP reward info
            const successEmbed = nominateCommand.createStaticSuccessEmbed(
                gameDataForEmbed, 
                user, 
                comment,
                remainingBefore - 1  // Pass the calculated remaining count
            );

            // Add GP reward field to the embed
            if (gpAwarded) {
                successEmbed.addFields({
                    name: '💰 GP Reward',
                    value: '+20 GP awarded for nomination!',
                    inline: true
                });
            } else if (gpError) {
                successEmbed.addFields({
                    name: '⚠️ GP Reward',
                    value: 'GP award failed - contact admin if needed',
                    inline: true
                });
            } else {
                successEmbed.addFields({
                    name: '💰 GP Reward',
                    value: 'GP award processed (may be duplicate)',
                    inline: true
                });
            }

            // CRITICAL: Post with NO COMPONENTS = static embed
            await interaction.editReply({
                embeds: [successEmbed],
                components: []  // NO BUTTONS = STATIC EMBED
            });

            console.log(`📢 Public nomination announcement posted for ${gameData.title} (clickable link: ${gameUrl})`);

            // Send private confirmation with GP info
            try {
                let confirmationMessage = `✅ **Nomination confirmed!** Your nomination for **${gameData.title}** has been posted publicly with a clickable link to the game page.`;
                
                if (gpAwarded) {
                    confirmationMessage += `\n\n💰 **+20 GP** has been added to your balance!`;
                } else if (gpError) {
                    confirmationMessage += `\n\n⚠️ **GP award failed** - please contact an admin if you should have received GP.`;
                } else {
                    confirmationMessage += `\n\n💰 **GP processed** - check your balance with \`/gp balance\` if needed.`;
                }

                await interaction.followUp({
                    content: confirmationMessage,
                    ephemeral: true
                });
                
                console.log(`📱 Private confirmation sent to ${user.raUsername}`);
            } catch (followUpError) {
                console.error('❌ Error sending private confirmation:', followUpError);
            }

        } catch (error) {
            console.error('❌ Error in processNomination:', error);
            console.error('Error stack:', error.stack);
            await interaction.editReply('An unexpected error occurred while processing your nomination.');
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

            embed.addFields({
                name: '💰 GP Rewards',
                value: '🎮 **+20 GP** for each game nomination\n🗳️ **+20 GP** for voting in polls\n🏆 **Bonus GP** for challenge participation!',
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
}

// Export individual handler functions for easier integration
export const handleNominationButtonInteraction = NominationInteractionHandler.handleButtonInteraction.bind(NominationInteractionHandler);
export const handleNominationModalSubmit = NominationInteractionHandler.handleModalSubmit.bind(NominationInteractionHandler);
export const handleNominationSelectMenu = NominationInteractionHandler.handleSelectMenuInteraction.bind(NominationInteractionHandler);
