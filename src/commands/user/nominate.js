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
        await this.showMainMenu(interaction);
    },

    /**
     * Show the main nomination menu
     */
    async showMainMenu(interaction) {
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

            const embed = new EmbedBuilder()
                .setTitle('🎮 Monthly Challenge Nominations')
                .setDescription('Welcome to the nomination system! Select an option below to get started.')
                .setColor(nominationsOpen ? '#00FF00' : '#FF0000')
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

            // Add status information
            if (nominationsOpen) {
                embed.addFields({
                    name: '✅ Status: OPEN',
                    value: 'Nominations are currently being accepted!',
                    inline: true
                });

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

            // Current month theme
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

            // User status
            if (user) {
                const currentNominations = user.getCurrentNominations();
                const remaining = MAX_NOMINATIONS - currentNominations.length;
                embed.addFields({
                    name: '📊 Your Status',
                    value: `${remaining}/${MAX_NOMINATIONS} nominations remaining`,
                    inline: true
                });
            } else {
                embed.addFields({
                    name: '⚠️ Not Registered',
                    value: 'Use `/register` first',
                    inline: true
                });
            }

            const components = this.createMenuComponents();

            await interaction.editReply({
                embeds: [embed],
                components: components
            });

        } catch (error) {
            console.error('Error in showMainMenu:', error);
            await interaction.editReply({
                content: 'An error occurred while creating the nomination menu.',
                embeds: [],
                components: []
            });
        }
    },

    /**
     * Create menu components
     */
    createMenuComponents() {
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
     * Create static success embed without any buttons
     * The handlers file should calculate the correct remaining count and pass it here
     */
    createStaticSuccessEmbed(gameData, user, comment = null, remainingCount = null) {
        const embed = new EmbedBuilder()
            .setTitle('✅ Game Nominated Successfully!')
            .setDescription(`${user.raUsername} has nominated a game!`)
            .setColor('#00FF00')
            .setThumbnail(gameData.ImageIcon)
            .addFields(
                {
                    name: '🎮 Game',
                    value: gameData.Title,
                    inline: true
                },
                {
                    name: '🎯 Console',
                    value: gameData.ConsoleName,
                    inline: true
                },
                {
                    name: '🏆 Achievements',
                    value: `${gameData.NumAchievements || 0}`,
                    inline: true
                },
                {
                    name: '🏢 Publisher',
                    value: gameData.Publisher || 'Unknown',
                    inline: true
                },
                {
                    name: '👨‍💻 Developer',
                    value: gameData.Developer || 'Unknown',
                    inline: true
                },
                {
                    name: '🎭 Genre',
                    value: gameData.Genre || 'Unknown',
                    inline: true
                }
            );

        if (comment) {
            embed.addFields({
                name: '💭 Why this game?',
                value: comment,
                inline: false
            });
        }

        // Use the remaining count passed from handlers (already calculated correctly)
        const remaining = remainingCount !== null ? remainingCount : 0;
        
        embed.addFields({
            name: '📊 Status',
            value: `${user.raUsername} has ${remaining}/${MAX_NOMINATIONS} nominations remaining`,
            inline: false
        });

        embed.setTimestamp();

        return embed;
    },

    /**
     * Show detailed information
     */
    async showDetailedInfo(interaction) {
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

            if (currentRestriction && currentRestriction.enabled) {
                const monthName = MONTH_NAMES[currentMonth];
                
                embed.addFields({
                    name: `${currentRestriction.restrictionRule.emoji} ${monthName} Theme Details`,
                    value: `**${currentRestriction.restrictionRule.name}**\n${currentRestriction.restrictionRule.description}`,
                    inline: false
                });

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

            embed.addFields({
                name: '📝 Nomination Guidelines',
                value: '• You can nominate up to **2 games** per month\n' +
                       '• Games must meet current month\'s theme requirements\n' +
                       '• Find Game IDs on RetroAchievements.org in the URL\n' +
                       '• Duplicate nominations are not allowed\n' +
                       '• Nominations close during the last 8 days of each month',
                inline: false
            });

            if (settings.alwaysBlockedConsoles.length > 0) {
                embed.addFields({
                    name: '🚫 Always Ineligible',
                    value: settings.alwaysBlockedConsoles.join(', '),
                    inline: false
                });
            }

            embed.addFields({
                name: '💡 Pro Tips',
                value: '• Use `/restrictions test gameid:XXXXX` to test game eligibility\n' +
                       '• Check upcoming themes to plan ahead\n' +
                       '• Consider achievement count when nominating',
                inline: false
            });

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
            console.error('Error in showDetailedInfo:', error);
            await interaction.editReply('An error occurred while fetching detailed information.');
        }
    },

    /**
     * Show user status
     */
    async showUserStatus(interaction) {
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
            const remaining = MAX_NOMINATIONS - currentNominations.length;

            const embed = new EmbedBuilder()
                .setTitle('📊 Your Nomination Status')
                .setColor(nominationsOpen ? '#00FF00' : '#FF0000')
                .setTimestamp();

            embed.addFields({
                name: '📈 Overview',
                value: `**Username:** ${user.raUsername}\n` +
                       `**Status:** ${nominationsOpen ? '✅ Can nominate' : '❌ Closed'}\n` +
                       `**Remaining:** ${remaining}/${MAX_NOMINATIONS} nominations\n` +
                       `**Used:** ${currentNominations.length}/${MAX_NOMINATIONS}`,
                inline: false
            });

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

            const actionRow = new ActionRowBuilder();
            
            if (nominationsOpen && remaining > 0) {
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
            console.error('Error in showUserStatus:', error);
            await interaction.editReply('An error occurred while fetching your status.');
        }
    },

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
