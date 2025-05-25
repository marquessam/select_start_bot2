// src/handlers/restrictionHandlers.js
// Handle button interactions, modals, and select menus for the restriction system

import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { NominationSettings } from '../models/NominationSettings.js';
import { 
    CONSOLE_GROUPS, 
    PUBLISHER_GROUPS, 
    GENRE_GROUPS, 
    QUICK_PRESETS,
    RuleBuilder
} from '../config/consoleGroups.js';
import enhancedRetroAPI from '../services/enhancedRetroAPI.js';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export class RestrictionInteractionHandler {
    /**
     * Handle select menu interactions for restriction system
     */
    static async handleSelectMenuInteraction(interaction) {
        const customId = interaction.customId;

        try {
            switch(customId) {
                case 'restrictions_main_menu':
                    await this.handleMainMenuSelection(interaction);
                    break;
                case 'restrictions_select_preset':
                    await this.handlePresetSelection(interaction);
                    break;
                case 'restrictions_select_month':
                    await this.handleMonthSelection(interaction);
                    break;
                case 'restrictions_select_console_group':
                    await this.handleConsoleGroupSelection(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown menu option.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error handling restriction select menu interaction:', error);
            
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
     * Handle all restriction-related button interactions
     */
    static async handleButtonInteraction(interaction) {
        const customId = interaction.customId;

        try {
            switch(customId) {
                case 'restrictions_quick_status':
                    await this.handleQuickStatus(interaction);
                    break;
                case 'restrictions_test_game':
                    await this.handleTestGameModal(interaction);
                    break;
                case 'restrictions_refresh':
                    await this.handleRefresh(interaction);
                    break;
                case 'restrictions_back_to_main':
                    await this.handleBackToMain(interaction);
                    break;
                case 'restrictions_toggle_month':
                    await this.handleToggleMonthModal(interaction);
                    break;
                case 'restrictions_remove_month':
                    await this.handleRemoveMonthModal(interaction);
                    break;
                case 'restrictions_groups_console':
                    await this.handleAllConsoleGroups(interaction);
                    break;
                case 'restrictions_groups_publisher':
                    await this.handleAllPublisherGroups(interaction);
                    break;
                case 'restrictions_create_console_group':
                    await this.handleCreateConsoleGroupModal(interaction);
                    break;
                case 'restrictions_create_publisher':
                    await this.handleCreatePublisherModal(interaction);
                    break;
                case 'restrictions_create_year_range':
                    await this.handleCreateYearRangeModal(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown button interaction.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error handling restriction button interaction:', error);
            
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
     * Handle modal submissions for restrictions
     */
    static async handleModalSubmit(interaction) {
        const customId = interaction.customId;

        try {
            switch(customId) {
                case 'restrictions_test_game_modal':
                    await this.handleTestGameSubmit(interaction);
                    break;
                case 'restrictions_preset_modal':
                    await this.handlePresetSubmit(interaction);
                    break;
                case 'restrictions_toggle_modal':
                    await this.handleToggleSubmit(interaction);
                    break;
                case 'restrictions_remove_modal':
                    await this.handleRemoveSubmit(interaction);
                    break;
                case 'restrictions_console_group_modal':
                    await this.handleConsoleGroupSubmit(interaction);
                    break;
                case 'restrictions_publisher_modal':
                    await this.handlePublisherSubmit(interaction);
                    break;
                case 'restrictions_year_range_modal':
                    await this.handleYearRangeSubmit(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown modal submission.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error handling restriction modal submission:', error);
            
            const errorMessage = {
                content: 'An error occurred while processing your submission.',
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
     * Handle main menu dropdown selection
     */
    static async handleMainMenuSelection(interaction) {
        const selectedValue = interaction.values[0];
        const restrictionsCommand = interaction.client.commands.get('restrictions');

        switch(selectedValue) {
            case 'status':
                await restrictionsCommand.handleDetailedStatus(interaction);
                break;
            case 'test':
                await this.handleTestGameModal(interaction);
                break;
            case 'presets':
                await restrictionsCommand.handlePresetsMenu(interaction);
                break;
            case 'create':
                await this.handleCreateMenu(interaction);
                break;
            case 'manage':
                await restrictionsCommand.handleManageMenu(interaction);
                break;
            case 'groups':
                await restrictionsCommand.handleGroupsMenu(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Unknown menu option.',
                    ephemeral: true
                });
        }
    }

    /**
     * Handle back to main menu
     */
    static async handleBackToMain(interaction) {
        await interaction.deferUpdate();

        try {
            const restrictionsCommand = interaction.client.commands.get('restrictions');
            await restrictionsCommand.handleMainMenu({ 
                ...interaction, 
                deferReply: async () => {}, 
                editReply: async (data) => await interaction.editReply(data)
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
     * Handle quick status button
     */
    static async handleQuickStatus(interaction) {
        const restrictionsCommand = interaction.client.commands.get('restrictions');
        await restrictionsCommand.handleDetailedStatus(interaction);
    }

    /**
     * Handle refresh button
     */
    static async handleRefresh(interaction) {
        await interaction.deferUpdate();

        try {
            const restrictionsCommand = interaction.client.commands.get('restrictions');
            await restrictionsCommand.handleMainMenu({ 
                ...interaction, 
                deferReply: async () => {}, 
                editReply: async (data) => await interaction.editReply(data)
            });
        } catch (error) {
            console.error('Error refreshing menu:', error);
            await interaction.followUp({
                content: 'An error occurred while refreshing the menu.',
                ephemeral: true
            });
        }
    }

    /**
     * Handle test game modal
     */
    static async handleTestGameModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('restrictions_test_game_modal')
            .setTitle('🧪 Test Game Against Restrictions');

        const gameIdInput = new TextInputBuilder()
            .setCustomId('game_id')
            .setLabel('RetroAchievements Game ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 12345')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(10);

        const monthInput = new TextInputBuilder()
            .setCustomId('test_month')
            .setLabel('Month to test against (1-12, optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Leave empty for current month')
            .setRequired(false)
            .setMinLength(1)
            .setMaxLength(2);

        const gameIdRow = new ActionRowBuilder().addComponents(gameIdInput);
        const monthRow = new ActionRowBuilder().addComponents(monthInput);

        modal.addComponents(gameIdRow, monthRow);
        await interaction.showModal(modal);
    }

    /**
     * Handle test game submission
     */
    static async handleTestGameSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const gameIdStr = interaction.fields.getTextInputValue('game_id');
            const testMonthStr = interaction.fields.getTextInputValue('test_month') || '';
            
            const gameId = parseInt(gameIdStr);
            if (isNaN(gameId) || gameId <= 0) {
                return interaction.editReply('❌ Please provide a valid Game ID (positive number).');
            }

            const testMonth = testMonthStr ? parseInt(testMonthStr) : null;
            if (testMonth && (isNaN(testMonth) || testMonth < 1 || testMonth > 12)) {
                return interaction.editReply('❌ Month must be between 1 and 12.');
            }

            // Get game details
            let gameData;
            try {
                gameData = await enhancedRetroAPI.getGameDetails(gameId);
            } catch (error) {
                console.error(`Error fetching game info for gameId ${gameId}:`, error);
                return interaction.editReply('❌ Game not found or unable to retrieve game information.');
            }

            // Get settings and test
            const settings = await NominationSettings.getSettings();
            const testDate = testMonth ? 
                new Date(new Date().getFullYear(), testMonth - 1, 15) : 
                new Date();

            const allowed = settings.isGameAllowed(gameData, testDate);
            const restriction = settings.getCurrentMonthRestriction(testDate);

            const embed = new EmbedBuilder()
                .setTitle('🧪 Game Restriction Test Results')
                .setColor(allowed ? '#00FF00' : '#FF0000')
                .setThumbnail(`https://retroachievements.org${gameData.imageIcon}`)
                .setTimestamp();

            embed.addFields(
                { name: '🎮 Game', value: gameData.title, inline: true },
                { name: '🎯 Console', value: gameData.consoleName, inline: true },
                { name: '📅 Released', value: gameData.released || 'Unknown', inline: true }
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

            embed.addFields({
                name: '✅ Test Result',
                value: allowed ? '**✅ GAME IS ALLOWED**' : '**❌ GAME IS BLOCKED**',
                inline: false
            });

            if (restriction && !allowed) {
                embed.addFields({
                    name: '🚫 Blocked By',
                    value: `${restriction.restrictionRule.emoji} **${restriction.restrictionRule.name}**\n${restriction.restrictionRule.description}`,
                    inline: false
                });
            }

            if (testMonth) {
                const monthName = MONTH_NAMES[testMonth - 1];
                embed.setFooter({ text: `Tested against ${monthName} restrictions` });
            }

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
            console.error('Error testing game:', error);
            await interaction.editReply('An error occurred while testing the game.');
        }
    }

    /**
     * Handle preset selection
     */
    static async handlePresetSelection(interaction) {
        const presetKey = interaction.values[0];
        const preset = QUICK_PRESETS[presetKey];

        if (!preset) {
            return interaction.reply({
                content: '❌ Invalid preset selected.',
                ephemeral: true
            });
        }

        // Show modal to select month and year
        const modal = new ModalBuilder()
            .setCustomId('restrictions_preset_modal')
            .setTitle(`Apply: ${preset.name}`);

        const monthInput = new TextInputBuilder()
            .setCustomId('preset_month')
            .setLabel('Month (1-12)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 6 for June')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2);

        const yearInput = new TextInputBuilder()
            .setCustomId('preset_year')
            .setLabel('Year (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Leave empty for all years')
            .setRequired(false)
            .setMinLength(4)
            .setMaxLength(4);

        const presetKeyInput = new TextInputBuilder()
            .setCustomId('preset_key')
            .setLabel('Preset (do not modify)')
            .setStyle(TextInputStyle.Short)
            .setValue(presetKey)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(monthInput),
            new ActionRowBuilder().addComponents(yearInput),
            new ActionRowBuilder().addComponents(presetKeyInput)
        );

        await interaction.showModal(modal);
    }

    /**
     * Handle preset submission
     */
    static async handlePresetSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const monthStr = interaction.fields.getTextInputValue('preset_month');
            const yearStr = interaction.fields.getTextInputValue('preset_year') || '';
            const presetKey = interaction.fields.getTextInputValue('preset_key');

            const month = parseInt(monthStr) - 1;
            const year = yearStr ? parseInt(yearStr) : null;

            if (isNaN(month) || month < 0 || month > 11) {
                return interaction.editReply('❌ Month must be between 1 and 12.');
            }

            if (year && (isNaN(year) || year < 2024 || year > 2030)) {
                return interaction.editReply('❌ Year must be between 2024 and 2030.');
            }

            const preset = QUICK_PRESETS[presetKey];
            if (!preset) {
                return interaction.editReply('❌ Invalid preset.');
            }

            const settings = await NominationSettings.getSettings();
            const modifiedBy = {
                discordId: interaction.user.id,
                username: interaction.user.tag
            };

            try {
                settings.applyQuickPreset(month, year, presetKey);
                settings.lastModifiedBy = modifiedBy;
                await settings.save();

                const monthName = MONTH_NAMES[month];
                const yearText = year ? ` ${year}` : ' (all years)';

                const embed = new EmbedBuilder()
                    .setTitle('✅ Preset Applied Successfully!')
                    .setColor('#00FF00')
                    .addFields({
                        name: '🎯 Applied To',
                        value: `**${monthName}${yearText}**`,
                        inline: true
                    }, {
                        name: '🎨 Preset',
                        value: `${preset.emoji} **${preset.name}**`,
                        inline: true
                    }, {
                        name: '📝 Description',
                        value: preset.description,
                        inline: false
                    })
                    .setTimestamp();

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
                await interaction.editReply(`❌ Error applying preset: ${error.message}`);
            }

        } catch (error) {
            console.error('Error applying preset:', error);
            await interaction.editReply('An error occurred while applying the preset.');
        }
    }

    /**
     * Handle create menu
     */
    static async handleCreateMenu(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const embed = new EmbedBuilder()
                .setTitle('🎨 Create Custom Restrictions')
                .setDescription('Build custom monthly restrictions using various criteria.')
                .setColor('#9B59B6')
                .setTimestamp();

            embed.addFields({
                name: '🎯 Console-Based',
                value: 'Restrict by console groups (Sega, Nintendo, Sony, etc.)',
                inline: true
            }, {
                name: '🏢 Publisher-Based',
                value: 'Restrict by publisher groups or custom publishers',
                inline: true
            }, {
                name: '📅 Year-Based',
                value: 'Restrict by release year ranges',
                inline: true
            });

            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('restrictions_create_console_group')
                        .setLabel('Console Groups')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎯'),
                    
                    new ButtonBuilder()
                        .setCustomId('restrictions_create_publisher')
                        .setLabel('Publishers')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏢'),

                    new ButtonBuilder()
                        .setCustomId('restrictions_create_year_range')
                        .setLabel('Year Range')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📅')
                );

            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('restrictions_back_to_main')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⬅️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [actionRow, backRow]
            });

        } catch (error) {
            console.error('Error in create menu:', error);
            await interaction.editReply('An error occurred while loading the create menu.');
        }
    }

    /**
     * Handle toggle month modal
     */
    static async handleToggleMonthModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('restrictions_toggle_modal')
            .setTitle('🔄 Toggle Month Restriction');

        const monthInput = new TextInputBuilder()
            .setCustomId('toggle_month')
            .setLabel('Month (1-12)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 6 for June')
            .setRequired(true);

        const enabledInput = new TextInputBuilder()
            .setCustomId('toggle_enabled')
            .setLabel('Enable or Disable (true/false)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('true or false')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(monthInput),
            new ActionRowBuilder().addComponents(enabledInput)
        );

        await interaction.showModal(modal);
    }

    /**
     * Handle remove month modal
     */
    static async handleRemoveMonthModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('restrictions_remove_modal')
            .setTitle('🗑️ Remove Month Restriction');

        const monthInput = new TextInputBuilder()
            .setCustomId('remove_month')
            .setLabel('Month (1-12)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 6 for June')
            .setRequired(true);

        const yearInput = new TextInputBuilder()
            .setCustomId('remove_year')
            .setLabel('Year (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Leave empty for all years')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(monthInput),
            new ActionRowBuilder().addComponents(yearInput)
        );

        await interaction.showModal(modal);
    }

    /**
     * Handle toggle submit
     */
    static async handleToggleSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const monthStr = interaction.fields.getTextInputValue('toggle_month');
            const enabledStr = interaction.fields.getTextInputValue('toggle_enabled').toLowerCase();

            const month = parseInt(monthStr) - 1;
            const enabled = enabledStr === 'true' || enabledStr === '1';

            if (isNaN(month) || month < 0 || month > 11) {
                return interaction.editReply('❌ Month must be between 1 and 12.');
            }

            const settings = await NominationSettings.getSettings();
            const success = settings.toggleMonthlyRestriction(month, null, enabled);

            if (!success) {
                const monthName = MONTH_NAMES[month];
                return interaction.editReply(`❌ No restriction found for **${monthName}**.`);
            }

            settings.lastModifiedBy = {
                discordId: interaction.user.id,
                username: interaction.user.tag
            };
            await settings.save();

            const monthName = MONTH_NAMES[month];
            const status = enabled ? 'enabled' : 'disabled';
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Restriction Updated')
                .setColor(enabled ? '#00FF00' : '#FF9900')
                .addFields({
                    name: '📅 Month',
                    value: monthName,
                    inline: true
                }, {
                    name: '🔄 Status',
                    value: enabled ? '✅ Enabled' : '❌ Disabled',
                    inline: true
                })
                .setTimestamp();

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
            console.error('Error toggling restriction:', error);
            await interaction.editReply('An error occurred while toggling the restriction.');
        }
    }

    /**
     * Handle remove submit
     */
    static async handleRemoveSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const monthStr = interaction.fields.getTextInputValue('remove_month');
            const yearStr = interaction.fields.getTextInputValue('remove_year') || '';

            const month = parseInt(monthStr) - 1;
            const year = yearStr ? parseInt(yearStr) : null;

            if (isNaN(month) || month < 0 || month > 11) {
                return interaction.editReply('❌ Month must be between 1 and 12.');
            }

            if (year && (isNaN(year) || year < 2024 || year > 2030)) {
                return interaction.editReply('❌ Year must be between 2024 and 2030.');
            }

            const settings = await NominationSettings.getSettings();
            const removed = settings.removeMonthlyRestriction(month, year);

            if (!removed) {
                const monthName = MONTH_NAMES[month];
                const yearText = year ? ` ${year}` : '';
                return interaction.editReply(`❌ No restriction found for **${monthName}${yearText}**.`);
            }

            settings.lastModifiedBy = {
                discordId: interaction.user.id,
                username: interaction.user.tag
            };
            await settings.save();

            const monthName = MONTH_NAMES[month];
            const yearText = year ? ` ${year}` : '';
            
            const embed = new EmbedBuilder()
                .setTitle('🗑️ Restriction Removed')
                .setColor('#FF0000')
                .addFields({
                    name: '📅 Removed From',
                    value: `${monthName}${yearText}`,
                    inline: false
                })
                .setTimestamp();

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
            console.error('Error removing restriction:', error);
            await interaction.editReply('An error occurred while removing the restriction.');
        }
    }

    /**
     * Handle all console groups display
     */
    static async handleAllConsoleGroups(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const embed = new EmbedBuilder()
                .setTitle('🎯 All Console Groups')
                .setColor('#4ECDC4')
                .setTimestamp();

            const chunks = [];
            const entries = Object.entries(CONSOLE_GROUPS);
            
            for (let i = 0; i < entries.length; i += 10) {
                const chunk = entries.slice(i, i + 10);
                const text = chunk.map(([key, group]) => {
                    const consoleList = group.consoles.slice(0, 4).join(', ') + 
                        (group.consoles.length > 4 ? `, +${group.consoles.length - 4} more` : '');
                    return `${group.emoji} **${key}**\n${consoleList}`;
                }).join('\n\n');
                
                chunks.push(text);
            }

            // Show first chunk
            embed.setDescription(chunks[0]);
            embed.setFooter({ text: `Showing ${Math.min(10, entries.length)} of ${entries.length} groups` });

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
            console.error('Error showing console groups:', error);
            await interaction.editReply('An error occurred while loading console groups.');
        }
    }

    /**
     * Handle all publisher groups display
     */
    static async handleAllPublisherGroups(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const embed = new EmbedBuilder()
                .setTitle('🏢 All Publisher Groups')
                .setColor('#4ECDC4')
                .setTimestamp();

            const entries = Object.entries(PUBLISHER_GROUPS);
            const chunks = [];
            
            for (let i = 0; i < entries.length; i += 8) {
                const chunk = entries.slice(i, i + 8);
                const text = chunk.map(([key, publishers]) => 
                    `**${key}**\n${publishers.join(', ')}`
                ).join('\n\n');
                
                chunks.push(text);
            }

            // Show first chunk
            embed.setDescription(chunks[0]);
            embed.setFooter({ text: `Showing ${Math.min(8, entries.length)} of ${entries.length} groups` });

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
            console.error('Error showing publisher groups:', error);
            await interaction.editReply('An error occurred while loading publisher groups.');
        }
    }

    /**
     * Handle console group creation modal
     */
    static async handleCreateConsoleGroupModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('restrictions_console_group_modal')
            .setTitle('🎯 Create Console Group Restriction');

        const monthInput = new TextInputBuilder()
            .setCustomId('console_month')
            .setLabel('Month (1-12)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 6 for June')
            .setRequired(true);

        const groupsInput = new TextInputBuilder()
            .setCustomId('console_groups')
            .setLabel('Console Groups (comma-separated)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g., SEGA, NINTENDO, SONY')
            .setRequired(true);

        const titleInput = new TextInputBuilder()
            .setCustomId('console_title')
            .setLabel('Restriction Title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., "Sega Month"')
            .setRequired(true);

        const operationInput = new TextInputBuilder()
            .setCustomId('console_operation')
            .setLabel('Logic (AND/OR)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('OR (default) or AND')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(monthInput),
            new ActionRowBuilder().addComponents(groupsInput),
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(operationInput)
        );

        await interaction.showModal(modal);
    }

    /**
     * Handle console group submit
     */
    static async handleConsoleGroupSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const monthStr = interaction.fields.getTextInputValue('console_month');
            const groupsStr = interaction.fields.getTextInputValue('console_groups');
            const title = interaction.fields.getTextInputValue('console_title');
            const operation = interaction.fields.getTextInputValue('console_operation') || 'OR';

            const month = parseInt(monthStr) - 1;
            if (isNaN(month) || month < 0 || month > 11) {
                return interaction.editReply('❌ Month must be between 1 and 12.');
            }

            const groupNames = groupsStr.split(',').map(g => g.trim().toUpperCase());
            const validGroups = groupNames.filter(name => CONSOLE_GROUPS[name]);
            
            if (validGroups.length === 0) {
                return interaction.editReply('❌ No valid console groups specified. Use `/restrictions groups` to see available groups.');
            }

            // Build conditions
            const conditions = validGroups.map(groupName => 
                RuleBuilder.consoleGroup(groupName)
            );

            // Create restriction rule
            const firstGroup = CONSOLE_GROUPS[validGroups[0]];
            const restrictionRule = {
                name: title,
                description: `Only games from: ${validGroups.map(g => CONSOLE_GROUPS[g].name).join(', ')}`,
                emoji: firstGroup.emoji,
                color: firstGroup.color,
                enabled: true,
                rules: {
                    type: operation.toUpperCase(),
                    conditions
                }
            };

            const settings = await NominationSettings.getSettings();
            settings.addMonthlyRestriction(month, null, restrictionRule);
            settings.lastModifiedBy = {
                discordId: interaction.user.id,
                username: interaction.user.tag
            };
            await settings.save();

            const monthName = MONTH_NAMES[month];
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Console Group Restriction Created!')
                .setColor(firstGroup.color)
                .addFields({
                    name: '📅 Applied To',
                    value: monthName,
                    inline: true
                }, {
                    name: '🎯 Groups',
                    value: validGroups.join(', '),
                    inline: true
                }, {
                    name: '🔧 Logic',
                    value: operation.toUpperCase(),
                    inline: true
                }, {
                    name: '📝 Description',
                    value: restrictionRule.description,
                    inline: false
                })
                .setTimestamp();

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
            console.error('Error creating console group restriction:', error);
            await interaction.editReply('An error occurred while creating the restriction.');
        }
    }

    /**
     * Handle publisher creation modal
     */
    static async handleCreatePublisherModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('restrictions_publisher_modal')
            .setTitle('🏢 Create Publisher Restriction');

        const monthInput = new TextInputBuilder()
            .setCustomId('publisher_month')
            .setLabel('Month (1-12)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 6 for June')
            .setRequired(true);

        const publishersInput = new TextInputBuilder()
            .setCustomId('publisher_names')
            .setLabel('Publishers (comma-separated)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g., Nintendo, Capcom, SEGA_GAMES')
            .setRequired(true);

        const titleInput = new TextInputBuilder()
            .setCustomId('publisher_title')
            .setLabel('Restriction Title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., "First Party Month"')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(monthInput),
            new ActionRowBuilder().addComponents(publishersInput),
            new ActionRowBuilder().addComponents(titleInput)
        );

        await interaction.showModal(modal);
    }

    /**
     * Handle publisher submit
     */
    static async handlePublisherSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const monthStr = interaction.fields.getTextInputValue('publisher_month');
            const publishersInput = interaction.fields.getTextInputValue('publisher_names');
            const title = interaction.fields.getTextInputValue('publisher_title');

            const month = parseInt(monthStr) - 1;
            if (isNaN(month) || month < 0 || month > 11) {
                return interaction.editReply('❌ Month must be between 1 and 12.');
            }

            const publisherNames = publishersInput.split(',').map(p => p.trim());
            const conditions = [];

            publisherNames.forEach(name => {
                if (PUBLISHER_GROUPS[name.toUpperCase()]) {
                    // It's a group
                    conditions.push(RuleBuilder.publisherGroup(name.toUpperCase()));
                } else {
                    // It's a custom publisher name
                    conditions.push(RuleBuilder.publisher(name));
                }
            });

            const restrictionRule = {
                name: title,
                description: `Only games from publishers: ${publisherNames.join(', ')}`,
                emoji: '🏢',
                color: '#4682B4',
                enabled: true,
                rules: {
                    type: 'OR',
                    conditions
                }
            };

            const settings = await NominationSettings.getSettings();
            settings.addMonthlyRestriction(month, null, restrictionRule);
            settings.lastModifiedBy = {
                discordId: interaction.user.id,
                username: interaction.user.tag
            };
            await settings.save();

            const monthName = MONTH_NAMES[month];
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Publisher Restriction Created!')
                .setColor('#4682B4')
                .addFields({
                    name: '📅 Applied To',
                    value: monthName,
                    inline: true
                }, {
                    name: '🏢 Publishers',
                    value: publisherNames.join(', '),
                    inline: true
                }, {
                    name: '📝 Description',
                    value: restrictionRule.description,
                    inline: false
                })
                .setTimestamp();

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
            console.error('Error creating publisher restriction:', error);
            await interaction.editReply('An error occurred while creating the restriction.');
        }
    }

    /**
     * Handle year range creation modal
     */
    static async handleCreateYearRangeModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('restrictions_year_range_modal')
            .setTitle('📅 Create Year Range Restriction');

        const monthInput = new TextInputBuilder()
            .setCustomId('year_month')
            .setLabel('Month (1-12)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 6 for June')
            .setRequired(true);

        const titleInput = new TextInputBuilder()
            .setCustomId('year_title')
            .setLabel('Restriction Title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., "Retro Games Month"')
            .setRequired(true);

        const minYearInput = new TextInputBuilder()
            .setCustomId('min_year')
            .setLabel('Minimum Year (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 1980')
            .setRequired(false);

        const maxYearInput = new TextInputBuilder()
            .setCustomId('max_year')
            .setLabel('Maximum Year (optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 1999')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(monthInput),
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(minYearInput),
            new ActionRowBuilder().addComponents(maxYearInput)
        );

        await interaction.showModal(modal);
    }

    /**
     * Handle year range submit
     */
    static async handleYearRangeSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const monthStr = interaction.fields.getTextInputValue('year_month');
            const title = interaction.fields.getTextInputValue('year_title');
            const minYearStr = interaction.fields.getTextInputValue('min_year') || '';
            const maxYearStr = interaction.fields.getTextInputValue('max_year') || '';

            const month = parseInt(monthStr) - 1;
            if (isNaN(month) || month < 0 || month > 11) {
                return interaction.editReply('❌ Month must be between 1 and 12.');
            }

            const minYear = minYearStr ? parseInt(minYearStr) : null;
            const maxYear = maxYearStr ? parseInt(maxYearStr) : null;

            if (!minYear && !maxYear) {
                return interaction.editReply('❌ You must specify at least one year boundary.');
            }

            if (minYear && (isNaN(minYear) || minYear < 1970 || minYear > 2024)) {
                return interaction.editReply('❌ Minimum year must be between 1970 and 2024.');
            }

            if (maxYear && (isNaN(maxYear) || maxYear < 1970 || maxYear > 2024)) {
                return interaction.editReply('❌ Maximum year must be between 1970 and 2024.');
            }

            const conditions = [];
            let description = 'Games ';

            if (minYear && maxYear) {
                conditions.push(RuleBuilder.yearRange(minYear, maxYear));
                description += `from ${minYear}-${maxYear}`;
            } else if (minYear) {
                conditions.push(RuleBuilder.afterYear(minYear - 1));
                description += `from ${minYear} onwards`;
            } else {
                conditions.push(RuleBuilder.beforeYear(maxYear + 1));
                description += `before ${maxYear + 1}`;
            }

            const restrictionRule = {
                name: title,
                description,
                emoji: '📅',
                color: '#8B4513',
                enabled: true,
                rules: {
                    type: 'AND',
                    conditions
                }
            };

            const settings = await NominationSettings.getSettings();
            settings.addMonthlyRestriction(month, null, restrictionRule);
            settings.lastModifiedBy = {
                discordId: interaction.user.id,
                username: interaction.user.tag
            };
            await settings.save();

            const monthName = MONTH_NAMES[month];
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Year Range Restriction Created!')
                .setColor('#8B4513')
                .addFields({
                    name: '📅 Applied To',
                    value: monthName,
                    inline: true
                }, {
                    name: '📆 Year Range',
                    value: minYear && maxYear ? `${minYear}-${maxYear}` : 
                           minYear ? `${minYear}+` : 
                           `Before ${maxYear + 1}`,
                    inline: true
                }, {
                    name: '📝 Description',
                    value: description,
                    inline: false
                })
                .setTimestamp();

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
            console.error('Error creating year range restriction:', error);
            await interaction.editReply('An error occurred while creating the restriction.');
        }
    }
}

// Export individual handler functions for easier integration
export const handleRestrictionButtonInteraction = RestrictionInteractionHandler.handleButtonInteraction.bind(RestrictionInteractionHandler);
export const handleRestrictionModalSubmit = RestrictionInteractionHandler.handleModalSubmit.bind(RestrictionInteractionHandler);
export const handleRestrictionSelectMenu = RestrictionInteractionHandler.handleSelectMenuInteraction.bind(RestrictionInteractionHandler);
