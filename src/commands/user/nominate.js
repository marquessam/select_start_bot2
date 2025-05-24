// src/commands/user/nominate.js

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { User } from '../../models/User.js';
import { NominationSettings } from '../../models/NominationSettings.js';
import enhancedRetroAPI from '../../services/enhancedRetroAPI.js';
import { config } from '../../config/config.js';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const MAX_NOMINATIONS = 2;

export default {
    data: new SlashCommandBuilder()
        .setName('nominate')
        .setDescription('Nominate games for the monthly challenge'),

    async execute(interaction) {
        // Always open the interactive menu
        await this.handleInteractiveMenu(interaction);
    },

    /**
     * Create the main menu embed
     */
    createMainMenuEmbed() {
        return new EmbedBuilder()
            .setTitle('🎮 Monthly Challenge Nominations')
            .setDescription('Welcome to the nomination system! Select an option below to get started.')
            .setColor('#0099FF')
            .setThumbnail('https://retroachievements.org/Images/icon.png')
            .addFields(
                {
                    name: '🎯 Quick Start',
                    value: '• **Nominate** - Submit a game for next month\n• **Info** - View detailed requirements\n• **Status** - Check your current nominations',
                    inline: false
                },
                {
                    name: '📋 Guidelines',
                    value: '• Up to **2 games** per month\n• Must meet monthly theme requirements\n• Find Game IDs on RetroAchievements.org',
                    inline: false
                }
            )
            .setTimestamp();
    },

    /**
     * Create menu components (dropdown + buttons)
     */
    createMenuComponents() {
        // Dropdown menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('nominate_main_menu')
            .setPlaceholder('Choose an option...')
            .addOptions([
                {
                    label: 'Nominate Game',
                    description: 'Submit a game nomination',
                    value: 'nominate',
                    emoji: '🎮'
                },
                {
                    label: 'Detailed Info',
                    description: 'View current restrictions and rules',
                    value: 'info',
                    emoji: '📋'
                },
                {
                    label: 'Your Status',
                    description: 'Check your current nominations',
                    value: 'status',
                    emoji: '📊'
                },
                {
                    label: 'Upcoming Themes',
                    description: 'Preview future monthly themes',
                    value: 'upcoming',
                    emoji: '🔮'
                }
            ]);

        // Action buttons
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('nominate_open_form')
                    .setLabel('Quick Nominate')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚡'),
                
                new ButtonBuilder()
                    .setCustomId('nominate_refresh_menu')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄')
            );

        return [
            new ActionRowBuilder().addComponents(selectMenu),
            buttonRow
        ];
    },

    /**
     * Handle interactive nomination menu
     */
    async handleInteractiveMenu(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const settings = await NominationSettings.getSettings();
            const user = await User.findOne({ discordId: interaction.user.id });
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const nominationsOpen = settings.areNominationsOpen(now);
            const currentRestriction = settings.getCurrentMonthRestriction(now);
            const monthName = MONTH_NAMES[currentMonth];

            // Create main embed with current status
            const embed = this.createMainMenuEmbed();

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
                components: this.createMenuComponents()
            });

        } catch (error) {
            console.error('Error in handleInteractiveMenu:', error);
            await interaction.editReply({
                content: 'An error occurred while creating the nomination menu.',
                embeds: [],
                components: []
            });
        }
    },

    /**
     * Handle detailed information display
     */
    async handleDetailedInfo(interaction) {
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
    },

    /**
     * Handle status check
     */
    async handleStatus(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const user = await User.findOne({ discordId: interaction.user.id });
            
            if (!user) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Registration Required')
                    .setDescription('You need to register first using `/register` command.')
                    .setColor('#FF9900');

                const backButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('nominate_back_to_main')
                            .setLabel('Back to Menu')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('⬅️')
                    );

                return interaction.editReply({ 
                    embeds: [embed],
                    components: [backButton]
                });
            }

            const currentNominations = user.getCurrentNominations();
            const settings = await NominationSettings.getSettings();
            const now = new Date();
            const nominationsOpen = settings.areNominationsOpen(now);

            const embed = new EmbedBuilder()
                .setTitle('📊 Your Nomination Status')
                .setColor(nominationsOpen ? '#00FF00' : '#FF0000')
                .setTimestamp();

            // Status overview
            embed.addFields({
                name: '📈 Overview',
                value: `**Username:** ${user.raUsername}\n` +
                       `**Status:** ${nominationsOpen ? '✅ Can nominate' : '❌ Closed'}\n` +
                       `**Used:** ${currentNominations.length}/${MAX_NOMINATIONS}\n` +
                       `**Remaining:** ${MAX_NOMINATIONS - currentNominations.length}`,
                inline: false
            });

            // Current nominations
            if (currentNominations.length > 0) {
                const nominationsList = currentNominations.map((nom, index) => {
                    const date = new Date(nom.nominatedAt);
                    const timestamp = Math.floor(date.getTime() / 1000);
                    return `**${index + 1}. ${nom.gameTitle}**\n` +
                           `   *${nom.consoleName}*\n` +
                           `   Nominated: <t:${timestamp}:R>` +
                           (nom.comment ? `\n   "${nom.comment}"` : '');
                }).join('\n\n');

                embed.addFields({
                    name: '🎮 Your Current Nominations',
                    value: nominationsList,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '🎮 Your Current Nominations',
                    value: 'No nominations yet! You can nominate up to 2 games.',
                    inline: false
                });
            }

            // Timing info
            if (nominationsOpen) {
                const nextClosing = settings.getNextClosingDate(now);
                if (nextClosing) {
                    const nextClosingTimestamp = Math.floor(nextClosing.getTime() / 1000);
                    embed.addFields({
                        name: '⏰ Nominations Close',
                        value: `<t:${nextClosingTimestamp}:F>`,
                        inline: true
                    });
                }
            } else {
                const nextOpening = settings.getNextOpeningDate(now);
                const nextOpeningTimestamp = Math.floor(nextOpening.getTime() / 1000);
                embed.addFields({
                    name: '📅 Next Opening',
                    value: `<t:${nextOpeningTimestamp}:F>`,
                    inline: true
                });
            }

            // Action buttons
            const actionRow = new ActionRowBuilder();
            
            if (nominationsOpen && currentNominations.length < MAX_NOMINATIONS) {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('nominate_open_form')
                        .setLabel('Nominate Game')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎮')
                );
            }

            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('nominate_back_to_main')
                    .setLabel('Back to Menu')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );

            await interaction.editReply({ 
                embeds: [embed],
                components: [actionRow]
            });

        } catch (error) {
            console.error('Error in handleStatus:', error);
            await interaction.editReply('An error occurred while fetching your status.');
        }
    },

    // Nomination processing is handled by the handlers file to preserve original behavior

    /**
     * Format a restriction condition for display
     */
    formatCondition(condition) {
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
};
