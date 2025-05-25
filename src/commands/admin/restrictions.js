// src/commands/admin/restrictions.js

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    PermissionFlagsBits
} from 'discord.js';
import { config } from '../../config/config.js';
import { NominationSettings } from '../../models/NominationSettings.js';
import { 
    CONSOLE_GROUPS, 
    PUBLISHER_GROUPS, 
    GENRE_GROUPS, 
    QUICK_PRESETS
} from '../../config/consoleGroups.js';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export default {
    data: new SlashCommandBuilder()
        .setName('restrictions')
        .setDescription('Advanced nomination restriction management interface')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        // Always open the interactive menu
        await this.handleMainMenu(interaction);
    },

    /**
     * Create the main menu embed
     */
    createMainMenuEmbed() {
        return new EmbedBuilder()
            .setTitle('🛠️ Restriction Management Center')
            .setDescription('Manage monthly nomination themes and restrictions with ease.')
            .setColor('#FF6B6B')
            .setThumbnail('https://retroachievements.org/Images/icon.png')
            .addFields(
                {
                    name: '⚡ Quick Actions',
                    value: '• **Status** - View all current restrictions\n• **Test Game** - Test a game against rules\n• **Quick Presets** - Apply themed month templates',
                    inline: false
                },
                {
                    name: '🔧 Advanced',
                    value: '• **Create Custom** - Build new restrictions\n• **Manage** - Edit or remove existing rules\n• **Groups** - View available console/publisher groups',
                    inline: false
                }
            )
            .setTimestamp();
    },

    /**
     * Create menu components (dropdown + buttons)
     */
    createMenuComponents() {
        // Main dropdown menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('restrictions_main_menu')
            .setPlaceholder('Choose an action...')
            .addOptions([
                {
                    label: 'View Status',
                    description: 'See all current restrictions and settings',
                    value: 'status',
                    emoji: '📊'
                },
                {
                    label: 'Test Game',
                    description: 'Test if a game meets current restrictions',
                    value: 'test',
                    emoji: '🧪'
                },
                {
                    label: 'Quick Presets',
                    description: 'Apply themed month templates',
                    value: 'presets',
                    emoji: '⚡'
                },
                {
                    label: 'Create Custom',
                    description: 'Build new custom restrictions',
                    value: 'create',
                    emoji: '🎨'
                },
                {
                    label: 'Manage Existing',
                    description: 'Edit, toggle, or remove restrictions',
                    value: 'manage',
                    emoji: '⚙️'
                },
                {
                    label: 'View Groups',
                    description: 'See available console/publisher groups',
                    value: 'groups',
                    emoji: '📋'
                }
            ]);

        // Quick action buttons
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('restrictions_quick_status')
                    .setLabel('Quick Status')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📊'),
                
                new ButtonBuilder()
                    .setCustomId('restrictions_test_game')
                    .setLabel('Test Game')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🧪'),

                new ButtonBuilder()
                    .setCustomId('restrictions_refresh')
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
     * Handle main menu display
     */
    async handleMainMenu(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const settings = await NominationSettings.getSettings();
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentRestriction = settings.getCurrentMonthRestriction(now);

            // Create main embed with current status
            const embed = this.createMainMenuEmbed();

            // Add current status overview
            const activeRestrictions = settings.monthlyRestrictions.filter(r => r.enabled);
            const nominationsOpen = settings.areNominationsOpen(now);

            embed.addFields({
                name: '📈 System Status',
                value: `**Nominations:** ${nominationsOpen ? '✅ Open' : '❌ Closed'}\n` +
                       `**Active Restrictions:** ${activeRestrictions.length} months\n` +
                       `**Default Mode:** ${settings.defaultRestricted ? '🔒 Restricted' : '🔓 Open'}`,
                inline: true
            });

            // Current month status
            if (currentRestriction && currentRestriction.enabled) {
                const monthName = MONTH_NAMES[currentMonth];
                embed.addFields({
                    name: `🎯 ${monthName} Active`,
                    value: `${currentRestriction.restrictionRule.emoji} **${currentRestriction.restrictionRule.name}**\n*${currentRestriction.restrictionRule.description.substring(0, 60)}${currentRestriction.restrictionRule.description.length > 60 ? '...' : ''}*`,
                    inline: true
                });
            } else {
                const monthName = MONTH_NAMES[currentMonth];
                embed.addFields({
                    name: `🔓 ${monthName} Status`,
                    value: 'No restrictions active',
                    inline: true
                });
            }

            await interaction.editReply({
                embeds: [embed],
                components: this.createMenuComponents()
            });

        } catch (error) {
            console.error('Error in restrictions main menu:', error);
            await interaction.editReply({
                content: 'An error occurred while loading the restrictions menu.',
                embeds: [],
                components: []
            });
        }
    },

    /**
     * Handle detailed status view
     */
    async handleDetailedStatus(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const settings = await NominationSettings.getSettings();
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentRestriction = settings.getCurrentMonthRestriction(now);
            const nominationsOpen = settings.areNominationsOpen(now);

            const embed = new EmbedBuilder()
                .setTitle('📊 Detailed Restriction Status')
                .setColor(nominationsOpen ? '#00FF00' : '#FF0000')
                .setTimestamp();

            // Overall status
            embed.addFields({
                name: '🎛️ System Configuration',
                value: `**Nominations:** ${nominationsOpen ? '✅ Open' : '❌ Closed'}\n` +
                       `**Default Mode:** ${settings.defaultRestricted ? '🔒 Restricted' : '🔓 Open'}\n` +
                       `**Close Period:** Last ${settings.nominationCloseDays} days of month`,
                inline: false
            });

            // Current month details
            if (currentRestriction && currentRestriction.enabled) {
                const monthName = MONTH_NAMES[currentMonth];
                const ruleCount = currentRestriction.restrictionRule.rules.conditions?.length || 0;
                
                embed.addFields({
                    name: `${currentRestriction.restrictionRule.emoji} Current: ${monthName}`,
                    value: `**${currentRestriction.restrictionRule.name}**\n` +
                           `${currentRestriction.restrictionRule.description}\n\n` +
                           `**Rules:** ${ruleCount} condition(s)\n` +
                           `**Logic:** ${currentRestriction.restrictionRule.rules.type || 'AND'}\n` +
                           `**Status:** ${currentRestriction.enabled ? '✅ Active' : '❌ Disabled'}`,
                    inline: false
                });
            } else {
                const monthName = MONTH_NAMES[currentMonth];
                embed.addFields({
                    name: `🔓 Current: ${monthName}`,
                    value: settings.defaultRestricted ? 
                        'No specific restrictions (default restricted)' : 
                        'No restrictions - all games welcome',
                    inline: false
                });
            }

            // All active restrictions summary
            const activeRestrictions = settings.monthlyRestrictions.filter(r => r.enabled);
            if (activeRestrictions.length > 0) {
                const restrictionList = activeRestrictions.slice(0, 8).map(r => {
                    const monthName = MONTH_NAMES[r.month];
                    const yearText = r.year ? ` ${r.year}` : '';
                    const ruleCount = r.restrictionRule.rules.conditions?.length || 0;
                    return `${r.restrictionRule.emoji} **${monthName}${yearText}**: ${r.restrictionRule.name} (${ruleCount} rules)`;
                }).join('\n');
                
                embed.addFields({
                    name: `📅 Active Restrictions (${activeRestrictions.length})`,
                    value: restrictionList + (activeRestrictions.length > 8 ? '\n*...and more*' : ''),
                    inline: false
                });
            }

            // Always blocked consoles
            if (settings.alwaysBlockedConsoles.length > 0) {
                embed.addFields({
                    name: '🚫 Always Blocked',
                    value: settings.alwaysBlockedConsoles.join(', '),
                    inline: false
                });
            }

            // Back button
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('restrictions_back_to_main')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [backButton]
            });

        } catch (error) {
            console.error('Error in detailed status:', error);
            await interaction.editReply('An error occurred while fetching detailed status.');
        }
    },

    /**
     * Handle preset selection menu
     */
    async handlePresetsMenu(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const embed = new EmbedBuilder()
                .setTitle('⚡ Quick Restriction Presets')
                .setDescription('Apply pre-configured themed month restrictions quickly.')
                .setColor('#FFD93D')
                .setTimestamp();

            // Create preset options
            const presetOptions = Object.entries(QUICK_PRESETS).map(([key, preset]) => ({
                label: preset.name,
                description: preset.description.substring(0, 100),
                value: key,
                emoji: preset.emoji
            }));

            const presetMenu = new StringSelectMenuBuilder()
                .setCustomId('restrictions_select_preset')
                .setPlaceholder('Choose a preset to apply...')
                .addOptions(presetOptions);

            // Show available presets
            const presetList = Object.entries(QUICK_PRESETS).map(([key, preset]) => 
                `${preset.emoji} **${preset.name}**\n${preset.description}`
            ).join('\n\n');

            embed.addFields({
                name: '🎨 Available Presets',
                value: presetList,
                inline: false
            });

            const actionRows = [
                new ActionRowBuilder().addComponents(presetMenu),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('restrictions_back_to_main')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                )
            ];

            await interaction.editReply({
                embeds: [embed],
                components: actionRows
            });

        } catch (error) {
            console.error('Error in presets menu:', error);
            await interaction.editReply('An error occurred while loading presets.');
        }
    },

    /**
     * Handle groups display
     */
    async handleGroupsMenu(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const embed = new EmbedBuilder()
                .setTitle('📋 Available Groups Reference')
                .setDescription('Reference for building custom restrictions.')
                .setColor('#4ECDC4')
                .setTimestamp();

            // Console groups (show first few)
            const consoleGroupsText = Object.entries(CONSOLE_GROUPS).slice(0, 5).map(([key, group]) => {
                const consoleList = group.consoles.slice(0, 3).join(', ') + 
                    (group.consoles.length > 3 ? `, +${group.consoles.length - 3} more` : '');
                return `${group.emoji} **${key}**: ${consoleList}`;
            }).join('\n');

            embed.addFields({
                name: '🎯 Console Groups (Sample)',
                value: consoleGroupsText + `\n\n*${Object.keys(CONSOLE_GROUPS).length} total groups available*`,
                inline: false
            });

            // Publisher groups (show first few)
            const publisherGroupsText = Object.entries(PUBLISHER_GROUPS).slice(0, 3).map(([key, publishers]) => 
                `🏢 **${key}**: ${publishers.slice(0, 3).join(', ')}${publishers.length > 3 ? '...' : ''}`
            ).join('\n');

            embed.addFields({
                name: '🏢 Publisher Groups (Sample)',
                value: publisherGroupsText + `\n\n*${Object.keys(PUBLISHER_GROUPS).length} total groups available*`,
                inline: false
            });

            // Genre groups
            const genreGroupsText = Object.entries(GENRE_GROUPS).slice(0, 3).map(([key, group]) => 
                `${group.emoji} **${key}**: ${group.genres.slice(0, 3).join(', ')}${group.genres.length > 3 ? '...' : ''}`
            ).join('\n');

            embed.addFields({
                name: '🎭 Genre Groups (Sample)',
                value: genreGroupsText + `\n\n*${Object.keys(GENRE_GROUPS).length} total groups available*`,
                inline: false
            });

            // Navigation buttons
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('restrictions_groups_console')
                        .setLabel('All Console Groups')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎯'),
                    
                    new ButtonBuilder()
                        .setCustomId('restrictions_groups_publisher')
                        .setLabel('All Publishers')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏢'),

                    new ButtonBuilder()
                        .setCustomId('restrictions_back_to_main')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [buttonRow]
            });

        } catch (error) {
            console.error('Error in groups menu:', error);
            await interaction.editReply('An error occurred while loading groups.');
        }
    },

    /**
     * Handle management menu for existing restrictions
     */
    async handleManageMenu(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const settings = await NominationSettings.getSettings();
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Manage Existing Restrictions')
                .setDescription('Edit, toggle, or remove existing monthly restrictions.')
                .setColor('#FF8A80')
                .setTimestamp();

            const activeRestrictions = settings.monthlyRestrictions.filter(r => r.enabled);
            const inactiveRestrictions = settings.monthlyRestrictions.filter(r => !r.enabled);

            if (activeRestrictions.length > 0) {
                const activeList = activeRestrictions.slice(0, 8).map(r => {
                    const monthName = MONTH_NAMES[r.month];
                    const yearText = r.year ? ` ${r.year}` : '';
                    return `${r.restrictionRule.emoji} **${monthName}${yearText}**: ${r.restrictionRule.name}`;
                }).join('\n');

                embed.addFields({
                    name: `✅ Active Restrictions (${activeRestrictions.length})`,
                    value: activeList + (activeRestrictions.length > 8 ? '\n*...and more*' : ''),
                    inline: false
                });
            }

            if (inactiveRestrictions.length > 0) {
                const inactiveList = inactiveRestrictions.slice(0, 5).map(r => {
                    const monthName = MONTH_NAMES[r.month];
                    const yearText = r.year ? ` ${r.year}` : '';
                    return `${r.restrictionRule.emoji} **${monthName}${yearText}**: ${r.restrictionRule.name}`;
                }).join('\n');

                embed.addFields({
                    name: `❌ Disabled Restrictions (${inactiveRestrictions.length})`,
                    value: inactiveList + (inactiveRestrictions.length > 5 ? '\n*...and more*' : ''),
                    inline: false
                });
            }

            if (activeRestrictions.length === 0 && inactiveRestrictions.length === 0) {
                embed.addFields({
                    name: '📭 No Restrictions',
                    value: 'No monthly restrictions are currently configured.',
                    inline: false
                });
            }

            // Action buttons
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('restrictions_toggle_month')
                        .setLabel('Toggle Month')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                        .setDisabled(settings.monthlyRestrictions.length === 0),
                    
                    new ButtonBuilder()
                        .setCustomId('restrictions_remove_month')
                        .setLabel('Remove Month')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️')
                        .setDisabled(settings.monthlyRestrictions.length === 0),

                    new ButtonBuilder()
                        .setCustomId('restrictions_back_to_main')
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [buttonRow]
            });

        } catch (error) {
            console.error('Error in manage menu:', error);
            await interaction.editReply('An error occurred while loading management options.');
        }
    }
};
