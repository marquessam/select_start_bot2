import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arcadeadmin')
        .setDescription('Manage arcade leaderboards')
        .setDefaultMemberPermissions('0') // Only visible to users with Administrator permission
        .addSubcommand(subcommand =>
            subcommand
                .setName('manage')
                .setDescription('Manage arcade boards and challenges'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all boards')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of board to list')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Arcade', value: 'arcade' },
                            { name: 'Racing', value: 'racing' },
                            { name: 'Tiebreaker', value: 'tiebreaker' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('award')
                .setDescription('Award points')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of award to process')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Racing Challenge', value: 'racing' },
                            { name: 'Annual Arcade Points', value: 'arcade' }
                        ))
                .addStringOption(option =>
                    option.setName('identifier')
                        .setDescription('Board ID for racing, or year for arcade awards')
                        .setRequired(true))),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        switch(subcommand) {
            case 'manage':
                await this.showManagementMenu(interaction);
                break;
            case 'list':
                await interaction.deferReply({ ephemeral: true });
                const boardType = interaction.options.getString('type');
                await this.listBoards(interaction, boardType);
                break;
            case 'award':
                await interaction.deferReply({ ephemeral: true });
                const awardType = interaction.options.getString('type');
                const identifier = interaction.options.getString('identifier');
                
                if (awardType === 'racing') {
                    await this.awardRacingPoints(interaction, identifier);
                } else if (awardType === 'arcade') {
                    await this.triggerArcadeAwards(interaction, identifier);
                }
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand',
                    ephemeral: true
                });
        }
    },

    async showManagementMenu(interaction) {
        // Create a menu with options for managing all board types
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('Arcade Admin Management')
            .setDescription('Select an action to perform:');

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('arcadeadmin_action')
                    .setPlaceholder('Select an action')
                    .addOptions([
                        {
                            label: 'Create Arcade Board',
                            description: 'Add a new arcade leaderboard',
                            value: 'create_arcade',
                            emoji: '🎮'
                        },
                        {
                            label: 'Edit Arcade Board',
                            description: 'Modify an existing arcade leaderboard',
                            value: 'edit_arcade',
                            emoji: '✏️'
                        },
                        {
                            label: 'Remove Arcade Board',
                            description: 'Delete an arcade leaderboard',
                            value: 'remove_arcade',
                            emoji: '🗑️'
                        },
                        {
                            label: 'Create Racing Challenge',
                            description: 'Set up a monthly racing challenge',
                            value: 'create_racing',
                            emoji: '🏎️'
                        },
                        {
                            label: 'Edit Racing Challenge',
                            description: 'Modify an existing racing challenge',
                            value: 'edit_racing',
                            emoji: '✏️'
                        },
                        {
                            label: 'Remove Racing Challenge',
                            description: 'Delete a racing challenge',
                            value: 'remove_racing',
                            emoji: '🗑️'
                        },
                        {
                            label: 'Create Tiebreaker',
                            description: 'Set up a tiebreaker board',
                            value: 'create_tiebreaker',
                            emoji: '⚔️'
                        },
                        {
                            label: 'Edit Tiebreaker',
                            description: 'Modify an existing tiebreaker',
                            value: 'edit_tiebreaker',
                            emoji: '✏️'
                        },
                        {
                            label: 'Remove Tiebreaker',
                            description: 'Delete a tiebreaker board',
                            value: 'remove_tiebreaker',
                            emoji: '🗑️'
                        },
                        {
                            label: 'Announce Board',
                            description: 'Announce any type of board',
                            value: 'announce',
                            emoji: '📣'
                        }
                    ])
            );

        await interaction.reply({
            embeds: [embed],
            components: [actionRow],
            ephemeral: true
        });
    },

    // Handle all select menu interactions
    async handleSelectMenuInteraction(interaction) {
        const customId = interaction.customId;
        
        if (customId === 'arcadeadmin_action') {
            const action = interaction.values[0];
            
            // Handle different actions from main menu
            switch(action) {
                case 'create_arcade':
                    await this.showCreateArcadeModal(interaction);
                    break;
                case 'edit_arcade':
                    await this.showSelectBoardMenu(interaction, 'arcade', 'edit');
                    break;
                case 'remove_arcade':
                    await this.showSelectBoardMenu(interaction, 'arcade', 'remove');
                    break;
                case 'create_racing':
                    await this.showCreateRacingModal(interaction);
                    break;
                case 'edit_racing':
                    await this.showSelectBoardMenu(interaction, 'racing', 'edit');
                    break;
                case 'remove_racing':
                    await this.showSelectBoardMenu(interaction, 'racing', 'remove');
                    break;
                case 'create_tiebreaker':
                    await this.showCreateTiebreakerModal(interaction);
                    break;
                case 'edit_tiebreaker':
                    await this.showSelectBoardMenu(interaction, 'tiebreaker', 'edit');
                    break;
                case 'remove_tiebreaker':
                    await this.showSelectBoardMenu(interaction, 'tiebreaker', 'remove');
                    break;
                case 'announce':
                    await this.showAnnounceBoardMenu(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Invalid action selected',
                        ephemeral: true
                    });
            }
        } 
        else if (customId === 'select_announce_type') {
            await this.handleAnnounceTypeSelect(interaction);
        }
        else if (customId.startsWith('select_announce_board_')) {
            const boardType = customId.split('_').pop();
            const boardId = interaction.values[0];
            await this.announceBoard(interaction, boardType, boardId, true);
        }
        else if (customId.startsWith('select_arcade_edit')) {
            const boardId = interaction.values[0];
            await this.showEditArcadeModal(interaction, boardId);
        }
        else if (customId.startsWith('select_racing_edit')) {
            const boardId = interaction.values[0];
            await this.showEditRacingModal(interaction, boardId);
        }
        else if (customId.startsWith('select_tiebreaker_edit')) {
            const boardId = interaction.values[0];
            await this.showEditTiebreakerModal(interaction, boardId);
        }
        else if (customId.startsWith('select_arcade_remove')) {
            const boardId = interaction.values[0];
            await this.confirmRemoveBoard(interaction, 'arcade', boardId);
        }
        else if (customId.startsWith('select_racing_remove')) {
            const boardId = interaction.values[0];
            await this.confirmRemoveBoard(interaction, 'racing', boardId);
        }
        else if (customId.startsWith('select_tiebreaker_remove')) {
            const boardId = interaction.values[0];
            await this.confirmRemoveBoard(interaction, 'tiebreaker', boardId);
        }
    },

    // Handle all modal submissions
    async handleModalSubmit(interaction) {
        const customId = interaction.customId;
        
        if (customId === 'create_arcade_modal') {
            await this.handleCreateArcadeModal(interaction);
        }
        else if (customId === 'create_racing_modal') {
            await this.handleCreateRacingModal(interaction);
        }
        else if (customId === 'create_tiebreaker_modal') {
            await this.handleCreateTiebreakerModal(interaction);
        }
        else if (customId.startsWith('edit_arcade_modal_')) {
            const boardId = customId.split('_').pop();
            await this.handleEditArcadeModal(interaction, boardId);
        }
        else if (customId.startsWith('edit_racing_modal_')) {
            const boardId = customId.split('_').pop();
            await this.handleEditRacingModal(interaction, boardId);
        }
        else if (customId.startsWith('edit_tiebreaker_modal_')) {
            const boardId = customId.split('_').pop();
            await this.handleEditTiebreakerModal(interaction, boardId);
        }
    },

    // Handle all button interactions
    async handleButtonInteraction(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('announce_')) {
            const parts = customId.split('_');
            const boardType = parts[1];
            const boardId = parts[2];
            await this.announceBoard(interaction, boardType, boardId, true);
        }
        else if (customId.startsWith('announce_results_racing_')) {
            const boardId = customId.split('_').pop();
            await this.announceRacingResults(interaction, boardId);
        }
        else if (customId.startsWith('remove_confirm_')) {
            const parts = customId.split('_');
            const boardType = parts[2];
            const boardId = parts[3];
            await this.processRemoveBoard(interaction, boardType, boardId);
        }
        else if (customId.startsWith('remove_cancel_')) {
            await interaction.update({
                content: 'Removal cancelled.',
                embeds: [],
                components: []
            });
        }
        else if (customId.startsWith('award_confirm_racing_')) {
            const boardId = customId.split('_').pop();
            await this.processAwardRacingPoints(interaction, boardId);
        }
        else if (customId.startsWith('award_arcade_confirm_')) {
            const year = customId.split('_').pop();
            await this.processArcadeAwards(interaction, year);
        }
        else if (customId === 'award_arcade_cancel' || customId === 'award_cancel_racing') {
            await interaction.update({
                content: 'Award process cancelled.',
                embeds: [],
                components: []
            });
        }
    },

    // Show a modal for creating an arcade board
    async showCreateArcadeModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('create_arcade_modal')
            .setTitle('Create Arcade Board');

        // Add input fields
        const boardIdInput = new TextInputBuilder()
            .setCustomId('board_id')
            .setLabel('Board ID (unique identifier)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const leaderboardIdInput = new TextInputBuilder()
            .setCustomId('leaderboard_id')
            .setLabel('RetroAchievements Leaderboard ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const gameIdInput = new TextInputBuilder()
            .setCustomId('game_id')
            .setLabel('RetroAchievements Game ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        // Add inputs to the modal
        modal.addComponents(
            new ActionRowBuilder().addComponents(boardIdInput),
            new ActionRowBuilder().addComponents(leaderboardIdInput),
            new ActionRowBuilder().addComponents(gameIdInput),
            new ActionRowBuilder().addComponents(descriptionInput)
        );

        // Show the modal
        await interaction.showModal(modal);
    },

    // Show a modal for creating a racing challenge
    async showCreateRacingModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('create_racing_modal')
            .setTitle('Create Racing Challenge');

        // Add input fields
        const leaderboardIdInput = new TextInputBuilder()
            .setCustomId('leaderboard_id')
            .setLabel('RetroAchievements Leaderboard ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const gameIdInput = new TextInputBuilder()
            .setCustomId('game_id')
            .setLabel('RetroAchievements Game ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const trackNameInput = new TextInputBuilder()
            .setCustomId('track_name')
            .setLabel('Track Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const dateInput = new TextInputBuilder()
            .setCustomId('month_year')
            .setLabel('Month & Year (MM-YYYY or leave blank for current)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('e.g., 05-2025 (blank for current month)');

        // Add inputs to the modal
        modal.addComponents(
            new ActionRowBuilder().addComponents(leaderboardIdInput),
            new ActionRowBuilder().addComponents(gameIdInput),
            new ActionRowBuilder().addComponents(trackNameInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(dateInput)
        );

        // Show the modal
        await interaction.showModal(modal);
    },

    // Show a modal for creating a tiebreaker
    async showCreateTiebreakerModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('create_tiebreaker_modal')
            .setTitle('Create Tiebreaker Board');

        // Add input fields
        const leaderboardIdInput = new TextInputBuilder()
            .setCustomId('leaderboard_id')
            .setLabel('RetroAchievements Leaderboard ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const gameIdInput = new TextInputBuilder()
            .setCustomId('game_id')
            .setLabel('RetroAchievements Game ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const endDateInput = new TextInputBuilder()
            .setCustomId('end_date')
            .setLabel('End Date (YYYY-MM-DD)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // Add inputs to the modal
        modal.addComponents(
            new ActionRowBuilder().addComponents(leaderboardIdInput),
            new ActionRowBuilder().addComponents(gameIdInput),
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(endDateInput)
        );

        // Show the modal
        await interaction.showModal(modal);
    },

    // Show a menu to select a board
    async showSelectBoardMenu(interaction, boardType, action) {
        try {
            await interaction.deferUpdate();

            // Get all boards of the specified type
            const boards = await ArcadeBoard.find({ boardType }).sort({ createdAt: -1 });
            
            if (boards.length === 0) {
                return interaction.editReply(`No ${boardType} boards found.`);
            }

            // Create options for the select menu (max 25 due to Discord's limits)
            const boardOptions = boards.slice(0, 25).map(board => {
                const label = board.trackName 
                    ? `${board.gameTitle} - ${board.trackName}`.substring(0, 100)
                    : board.gameTitle.substring(0, 100);
                
                return {
                    label: label,
                    value: board.boardId,
                    description: `ID: ${board.boardId.substring(0, 100)}`
                };
            });

            // Create the select menu
            const selectRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`select_${boardType}_${action}`)
                        .setPlaceholder(`Select a ${boardType} board`)
                        .addOptions(boardOptions)
                );

            // Update the response with the select menu
            await interaction.editReply({
                content: `Select a ${boardType} board to ${action}:`,
                components: [selectRow]
            });
        } catch (error) {
            console.error(`Error showing ${boardType} selection menu:`, error);
            await interaction.editReply(`An error occurred while fetching ${boardType} boards.`);
        }
    },

    // Show a menu to select a board to announce
    async showAnnounceBoardMenu(interaction) {
        try {
            await interaction.deferUpdate();
            
            // Create select menu for board type
            const typeRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_announce_type')
                        .setPlaceholder('Select board type')
                        .addOptions([
                            {
                                label: 'Arcade Board',
                                value: 'arcade',
                                emoji: '🎮'
                            },
                            {
                                label: 'Racing Challenge',
                                value: 'racing',
                                emoji: '🏎️'
                            },
                            {
                                label: 'Tiebreaker Board',
                                value: 'tiebreaker',
                                emoji: '⚔️'
                            }
                        ])
                );

            // Update the response with the select menu
            await interaction.editReply({
                content: 'Select the type of board to announce:',
                components: [typeRow]
            });
        } catch (error) {
            console.error('Error showing announce menu:', error);
            await interaction.editReply('An error occurred while preparing the announce menu.');
        }
    },

    // Handle the modal submit for creating an arcade board
    async handleCreateArcadeModal(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get form values
            const boardId = interaction.fields.getTextInputValue('board_id');
            const leaderboardId = parseInt(interaction.fields.getTextInputValue('leaderboard_id'));
            const gameId = parseInt(interaction.fields.getTextInputValue('game_id'));
            const description = interaction.fields.getTextInputValue('description');
            
            // Check if board ID already exists
            const existingBoard = await ArcadeBoard.findOne({ boardId });
            if (existingBoard) {
                return interaction.editReply(`A board with ID "${boardId}" already exists.`);
            }

            // Validate game exists
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }

            // Create new board
            const newBoard = new ArcadeBoard({
                boardId,
                boardType: 'arcade',
                leaderboardId,
                gameId,
                gameTitle: gameInfo.title,
                consoleName: gameInfo.consoleName || 'Unknown',
                description
            });

            await newBoard.save();

            // Create an embed for the response
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Arcade Board Created: ${gameInfo.title}`)
                .setDescription(
                    `**Board ID:** ${boardId}\n` +
                    `**Game:** ${gameInfo.title}\n` +
                    `**Description:** ${description}`
                );

            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }
            
            // Add announce button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`announce_arcade_${boardId}`)
                        .setLabel('Announce to Server')
                        .setStyle(ButtonStyle.Primary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error creating arcade board:', error);
            return interaction.editReply('An error occurred while creating the arcade board. Please check your inputs and try again.');
        }
    },

    // Handle the modal submit for creating a racing challenge
    async handleCreateRacingModal(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get form values
            const leaderboardId = parseInt(interaction.fields.getTextInputValue('leaderboard_id'));
            const gameId = parseInt(interaction.fields.getTextInputValue('game_id'));
            const trackName = interaction.fields.getTextInputValue('track_name');
            const description = interaction.fields.getTextInputValue('description');
            
            // Parse month and year input (optional)
            let year, month;
            const now = new Date();
            const monthYearInput = interaction.fields.getTextInputValue('month_year');
            
            if (monthYearInput && monthYearInput.trim()) {
                const parts = monthYearInput.split('-');
                if (parts.length === 2) {
                    month = parseInt(parts[0]);
                    year = parseInt(parts[1]);
                } else {
                    return interaction.editReply('Invalid month-year format. Please use MM-YYYY (e.g., 05-2025).');
                }
            } else {
                // Default to current month and year
                month = now.getMonth() + 1;
                year = now.getFullYear();
            }
            
            // Validate game exists
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }

            // Calculate start and end dates
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);
            
            // Check if a racing challenge already exists for this month
            const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
            const existingChallenge = await ArcadeBoard.findOne({
                boardType: 'racing',
                monthKey
            });

            if (existingChallenge) {
                return interaction.editReply(`A racing challenge already exists for ${monthKey}.`);
            }

            // Generate board ID
            const boardId = `racing-${monthKey}`;

            // Get the full game title
            const gameFull = `${gameInfo.title} (${gameInfo.consoleName})`;

            // Create new racing board
            const newBoard = new ArcadeBoard({
                boardId,
                boardType: 'racing',
                leaderboardId,
                gameId,
                gameTitle: gameFull,
                trackName,
                consoleName: gameInfo.consoleName || 'Unknown',
                description,
                startDate,
                endDate,
                monthKey
            });

            await newBoard.save();

            // Get month name for response
            const monthName = startDate.toLocaleString('default', { month: 'long' });

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle(`Racing Challenge Created: ${monthName} ${year}`)
                .setDescription(
                    `**Game:** ${gameFull}\n` +
                    `**Track:** ${trackName}\n` +
                    `**Description:** ${description}\n\n` +
                    `**Challenge Period:** ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`
                );

            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }
            
            // Add announce button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`announce_racing_${boardId}`)
                        .setLabel('Announce to Server')
                        .setStyle(ButtonStyle.Primary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error creating racing challenge:', error);
            return interaction.editReply('An error occurred while creating the racing challenge. Please check your inputs and try again.');
        }
    },

    // Handle the modal submit for creating a tiebreaker
    async handleCreateTiebreakerModal(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get form values
            const leaderboardId = parseInt(interaction.fields.getTextInputValue('leaderboard_id'));
            const gameId = parseInt(interaction.fields.getTextInputValue('game_id'));
            const description = interaction.fields.getTextInputValue('description');
            const endDateStr = interaction.fields.getTextInputValue('end_date');
            
            // Parse end date
            const endDate = new Date(endDateStr);
            if (isNaN(endDate.getTime())) {
                return interaction.editReply('Invalid end date format. Please use YYYY-MM-DD.');
            }

            // Set end time to 23:59:59
            endDate.setHours(23, 59, 59);

            // Validate game exists
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }

            // Check if an active tiebreaker already exists
            const now = new Date();
            const activeTiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });

            if (activeTiebreaker) {
                return interaction.editReply('An active tiebreaker already exists. Please end it before creating a new one.');
            }

            // Generate a unique board ID based on month and year
            const monthYear = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
            const boardId = `tiebreaker-${monthYear}`;

            // Create new tiebreaker board
            const newBoard = new ArcadeBoard({
                boardId,
                boardType: 'tiebreaker',
                leaderboardId,
                gameId,
                gameTitle: gameInfo.title,
                consoleName: gameInfo.consoleName || 'Unknown',
                description,
                startDate: now,
                endDate,
                monthKey: monthYear
            });

            await newBoard.save();

            // Get the month name
            const monthName = now.toLocaleString('default', { month: 'long' });
            const year = now.getFullYear();

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`⚔️ Tiebreaker Created: ${monthName} ${year}`)
                .setDescription(
                    `**Game:** ${gameInfo.title}\n` +
                    `**Description:** ${description}\n\n` +
                    `**Tiebreaker Period:** ${now.toLocaleDateString()} to ${endDate.toLocaleDateString()}`
                );

            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Add announce button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`announce_tiebreaker_${boardId}`)
                        .setLabel('Announce to Server')
                        .setStyle(ButtonStyle.Primary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error creating tiebreaker:', error);
            return interaction.editReply('An error occurred while creating the tiebreaker. Please check your inputs and try again.');
        }
    },

    // Show edit modal for arcade board
    async showEditArcadeModal(interaction, boardId) {
        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType: 'arcade'
            });

            if (!board) {
                return interaction.reply({
                    content: `Arcade board with ID "${boardId}" not found.`,
                    ephemeral: true
                });
            }

            // Create edit modal
            const modal = new ModalBuilder()
                .setCustomId(`edit_arcade_modal_${boardId}`)
                .setTitle('Edit Arcade Board');

            // Add input fields with current values
            const leaderboardIdInput = new TextInputBuilder()
                .setCustomId('leaderboard_id')
                .setLabel('RetroAchievements Leaderboard ID')
                .setStyle(TextInputStyle.Short)
                .setValue(board.leaderboardId.toString())
                .setRequired(true);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(board.description)
                .setRequired(true);

            // Add inputs to the modal
            modal.addComponents(
                new ActionRowBuilder().addComponents(leaderboardIdInput),
                new ActionRowBuilder().addComponents(descriptionInput)
            );

            // Show the modal
            await interaction.showModal(modal);
        } catch (error) {
            console.error('Error showing edit arcade modal:', error);
            await interaction.reply({
                content: 'An error occurred while preparing the edit form.',
                ephemeral: true
            });
        }
    },

    // Show edit modal for racing board
    async showEditRacingModal(interaction, boardId) {
        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType: 'racing'
            });

            if (!board) {
                return interaction.reply({
                    content: `Racing board with ID "${boardId}" not found.`,
                    ephemeral: true
                });
            }

            // Create edit modal
            const modal = new ModalBuilder()
                .setCustomId(`edit_racing_modal_${boardId}`)
                .setTitle('Edit Racing Challenge');

            // Add input fields with current values
            const leaderboardIdInput = new TextInputBuilder()
                .setCustomId('leaderboard_id')
                .setLabel('RetroAchievements Leaderboard ID')
                .setStyle(TextInputStyle.Short)
                .setValue(board.leaderboardId.toString())
                .setRequired(true);

            const trackNameInput = new TextInputBuilder()
                .setCustomId('track_name')
                .setLabel('Track Name')
                .setStyle(TextInputStyle.Short)
                .setValue(board.trackName || '')
                .setRequired(true);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(board.description)
                .setRequired(true);

            // Add inputs to the modal
            modal.addComponents(
                new ActionRowBuilder().addComponents(leaderboardIdInput),
                new ActionRowBuilder().addComponents(trackNameInput),
                new ActionRowBuilder().addComponents(descriptionInput)
            );

            // Show the modal
            await interaction.showModal(modal);
        } catch (error) {
            console.error('Error showing edit racing modal:', error);
            await interaction.reply({
                content: 'An error occurred while preparing the edit form.',
                ephemeral: true
            });
        }
    },

    // Show edit modal for tiebreaker board
    async showEditTiebreakerModal(interaction, boardId) {
        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType: 'tiebreaker'
            });

            if (!board) {
                return interaction.reply({
                    content: `Tiebreaker board with ID "${boardId}" not found.`,
                    ephemeral: true
                });
            }

            // Format end date as YYYY-MM-DD
            const endDate = board.endDate;
            const endDateStr = endDate ? `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}` : '';

            // Create edit modal
            const modal = new ModalBuilder()
                .setCustomId(`edit_tiebreaker_modal_${boardId}`)
                .setTitle('Edit Tiebreaker Board');

            // Add input fields with current values
            const leaderboardIdInput = new TextInputBuilder()
                .setCustomId('leaderboard_id')
                .setLabel('RetroAchievements Leaderboard ID')
                .setStyle(TextInputStyle.Short)
                .setValue(board.leaderboardId.toString())
                .setRequired(true);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(board.description)
                .setRequired(true);

            const endDateInput = new TextInputBuilder()
                .setCustomId('end_date')
                .setLabel('End Date (YYYY-MM-DD)')
                .setStyle(TextInputStyle.Short)
                .setValue(endDateStr)
                .setRequired(true);

            // Add inputs to the modal
            modal.addComponents(
                new ActionRowBuilder().addComponents(leaderboardIdInput),
                new ActionRowBuilder().addComponents(descriptionInput),
                new ActionRowBuilder().addComponents(endDateInput)
            );

            // Show the modal
            await interaction.showModal(modal);
        } catch (error) {
            console.error('Error showing edit tiebreaker modal:', error);
            await interaction.reply({
                content: 'An error occurred while preparing the edit form.',
                ephemeral: true
            });
        }
    },

    // Handle edit modal submission for arcade board
    async handleEditArcadeModal(interaction, boardId) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get form values
            const newLeaderboardId = parseInt(interaction.fields.getTextInputValue('leaderboard_id'));
            const newDescription = interaction.fields.getTextInputValue('description');

            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType: 'arcade'
            });

            if (!board) {
                return interaction.editReply(`Arcade board with ID "${boardId}" not found.`);
            }

            // Update the board
            board.leaderboardId = newLeaderboardId;
            board.description = newDescription;
            await board.save();

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Arcade Board Updated: ${board.gameTitle}`)
                .setDescription(
                    `Successfully updated arcade board:\n\n` +
                    `**Board ID:** ${boardId}\n` +
                    `**Game:** ${board.gameTitle}`
                );
            
            embed.addFields({ name: 'New Description', value: newDescription });
            embed.addFields({ name: 'New Leaderboard ID', value: newLeaderboardId.toString() });

            // Add announce button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`announce_arcade_${boardId}`)
                        .setLabel('Announce Update')
                        .setStyle(ButtonStyle.Primary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error editing arcade board:', error);
            return interaction.editReply('An error occurred while updating the arcade board. Please try again.');
        }
    },

    // Handle edit modal submission for racing board
    async handleEditRacingModal(interaction, boardId) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get form values
            const newLeaderboardId = parseInt(interaction.fields.getTextInputValue('leaderboard_id'));
            const newTrackName = interaction.fields.getTextInputValue('track_name');
            const newDescription = interaction.fields.getTextInputValue('description');

            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType: 'racing'
            });

            if (!board) {
                return interaction.editReply(`Racing board with ID "${boardId}" not found.`);
            }

            // Update the board
            board.leaderboardId = newLeaderboardId;
            board.trackName = newTrackName;
            board.description = newDescription;
            await board.save();

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle(`Racing Challenge Updated: ${board.gameTitle}`)
                .setDescription(
                    `Successfully updated racing board:\n\n` +
                    `**Board ID:** ${boardId}\n` +
                    `**Game:** ${board.gameTitle}`
                );
            
            embed.addFields({ name: 'New Track Name', value: newTrackName });
            embed.addFields({ name: 'New Description', value: newDescription });
            embed.addFields({ name: 'New Leaderboard ID', value: newLeaderboardId.toString() });

            // Add announce button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`announce_racing_${boardId}`)
                        .setLabel('Announce Update')
                        .setStyle(ButtonStyle.Primary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error editing racing board:', error);
            return interaction.editReply('An error occurred while updating the racing board. Please try again.');
        }
    },

    // Handle edit modal submission for tiebreaker board
    async handleEditTiebreakerModal(interaction, boardId) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get form values
            const newLeaderboardId = parseInt(interaction.fields.getTextInputValue('leaderboard_id'));
            const newDescription = interaction.fields.getTextInputValue('description');
            const newEndDateStr = interaction.fields.getTextInputValue('end_date');

            // Parse end date
            const newEndDate = new Date(newEndDateStr);
            if (isNaN(newEndDate.getTime())) {
                return interaction.editReply('Invalid end date format. Please use YYYY-MM-DD.');
            }
            
            // Set end time to 23:59:59
            newEndDate.setHours(23, 59, 59);

            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType: 'tiebreaker'
            });

            if (!board) {
                return interaction.editReply(`Tiebreaker board with ID "${boardId}" not found.`);
            }

            // Update the board
            board.leaderboardId = newLeaderboardId;
            board.description = newDescription;
            board.endDate = newEndDate;
            await board.save();

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`⚔️ Tiebreaker Updated: ${board.gameTitle}`)
                .setDescription(
                    `Successfully updated tiebreaker board:\n\n` +
                    `**Board ID:** ${boardId}\n` +
                    `**Game:** ${board.gameTitle}`
                );
            
            embed.addFields({ name: 'New Description', value: newDescription });
            embed.addFields({ name: 'New Leaderboard ID', value: newLeaderboardId.toString() });
            embed.addFields({ name: 'New End Date', value: newEndDateStr });

            // Add announce button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`announce_tiebreaker_${boardId}`)
                        .setLabel('Announce Update')
                        .setStyle(ButtonStyle.Primary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error editing tiebreaker board:', error);
            return interaction.editReply('An error occurred while updating the tiebreaker board. Please try again.');
        }
    },

    // Confirm board removal 
    async confirmRemoveBoard(interaction, boardType, boardId) {
        try {
            await interaction.deferUpdate();
            
            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType 
            });
            
            if (!board) {
                return interaction.editReply(`${this.getBoardTypeName(boardType)} with ID "${boardId}" not found.`);
            }

            // Board title
            const boardTitle = board.trackName 
                ? `${board.gameTitle} - ${board.trackName}`
                : board.gameTitle;

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`⚠️ Confirm Removal`)
                .setDescription(
                    `Are you sure you want to remove this ${boardType} board?\n\n` +
                    `**Game:** ${boardTitle}\n` +
                    `**Board ID:** ${boardId}\n\n` +
                    `This action cannot be undone.`
                );

            // Add confirmation buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`remove_confirm_${boardType}_${boardId}`)
                        .setLabel('Confirm Removal')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`remove_cancel_${boardType}_${boardId}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error(`Error confirming ${boardType} removal:`, error);
            return interaction.editReply(`An error occurred while preparing the removal confirmation.`);
        }
    },

    // Process the board removal
    async processRemoveBoard(interaction, boardType, boardId) {
        try {
            await interaction.deferUpdate();
            
            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType
            });

            if (!board) {
                return interaction.editReply(`${this.getBoardTypeName(boardType)} with ID "${boardId}" not found.`);
            }

            const boardTitle = board.gameTitle + (board.trackName ? ` - ${board.trackName}` : '');

            // Delete the board
            await ArcadeBoard.deleteOne({ boardId, boardType });

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`✅ ${this.getBoardTypeName(boardType)} Removed`)
                .setDescription(
                    `Successfully removed ${boardType} board:\n\n` +
                    `**${boardTitle}**`
                );

            await interaction.editReply({
                embeds: [embed],
                components: []
            });
        } catch (error) {
            console.error(`Error removing ${boardType}:`, error);
            await interaction.editReply({
                content: 'An error occurred while removing the board.',
                embeds: [],
                components: []
            });
        }
    },

    // Process the announce board type selection
    async handleAnnounceTypeSelect(interaction) {
        try {
            await interaction.deferUpdate();
            
            const boardType = interaction.values[0];
            
            // Get all boards of the specified type
            const boards = await ArcadeBoard.find({ boardType }).sort({ createdAt: -1 });
            
            if (boards.length === 0) {
                return interaction.editReply(`No ${boardType} boards found.`);
            }

            // Create options for the select menu (max 25 due to Discord's limits)
            const boardOptions = boards.slice(0, 25).map(board => {
                const label = board.trackName 
                    ? `${board.gameTitle} - ${board.trackName}`.substring(0, 100)
                    : board.gameTitle.substring(0, 100);
                
                return {
                    label: label,
                    value: board.boardId,
                    description: `ID: ${board.boardId.substring(0, 100)}`
                };
            });

            // Create the select menu
            const selectRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`select_announce_board_${boardType}`)
                        .setPlaceholder(`Select a ${boardType} board`)
                        .addOptions(boardOptions)
                );

            // Update the response with the select menu
            await interaction.editReply({
                content: `Select a ${boardType} board to announce:`,
                components: [selectRow]
            });
        } catch (error) {
            console.error('Error handling announce type selection:', error);
            await interaction.editReply('An error occurred while preparing the board selection.');
        }
    },

    // Handle the list boards command
    async listBoards(interaction, boardType) {
        try {
            // Find all boards of the specified type
            const boards = await ArcadeBoard.find({ boardType }).sort({ createdAt: -1 });

            if (boards.length === 0) {
                return interaction.editReply(`No ${boardType} boards found.`);
            }

            // Create embed with boards list
            const embed = new EmbedBuilder()
                .setColor(this.getBoardTypeColor(boardType))
                .setTitle(`${this.getBoardTypeEmoji(boardType)} ${this.getBoardTypeName(boardType)} List`);

            // Add fields for each board (limit to 25 due to Discord's limits)
            const boardsToShow = boards.slice(0, 25);
            
            let description = '';
            
            for (const board of boardsToShow) {
                let entryText = `**${board.gameTitle}**`;
                
                if (board.trackName) {
                    entryText += ` - ${board.trackName}`;
                }
                
                entryText += `\nID: \`${board.boardId}\``;
                
                if (board.startDate && board.endDate) {
                    entryText += `\nPeriod: ${board.startDate.toLocaleDateString()} to ${board.endDate.toLocaleDateString()}`;
                }
                
                description += entryText + '\n\n';
            }
            
            embed.setDescription(description);
            
            if (boards.length > 25) {
                embed.setFooter({ text: `Showing 25/${boards.length} boards` });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(`Error listing ${boardType} boards:`, error);
            return interaction.editReply(`An error occurred while listing ${boardType} boards.`);
        }
    },

    // Handle the award racing points command
    async awardRacingPoints(interaction, boardId) {
        try {
            // Find the racing board
            const racingBoard = await ArcadeBoard.findOne({ 
                boardId,
                boardType: 'racing'
            });

            if (!racingBoard) {
                return interaction.editReply(`Racing board with ID "${boardId}" not found.`);
            }

            // Check if points have already been awarded
            if (racingBoard.pointsAwarded) {
                return interaction.editReply(`Points have already been awarded for this racing challenge.`);
            }

            // Check if the racing challenge has ended
            const now = new Date();
            if (racingBoard.endDate > now) {
                return interaction.editReply(`This racing challenge hasn't ended yet. It ends on ${racingBoard.endDate.toLocaleDateString()}.`);
            }

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle(`🏆 Confirm Award Points`)
                .setDescription(
                    `Are you sure you want to award points for this racing challenge?\n\n` +
                    `**Game:** ${racingBoard.gameTitle}\n` +
                    `**Track:** ${racingBoard.trackName}\n\n` +
                    `Points will be awarded to the top 3 players.`
                );

            // Add confirmation buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`award_confirm_racing_${boardId}`)
                        .setLabel('Confirm Award')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`award_cancel_racing`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error preparing to award racing points:', error);
            return interaction.editReply('An error occurred while preparing to award points. Please try again.');
        }
    },

    // Process the award racing points
    async processAwardRacingPoints(interaction, boardId) {
        try {
            await interaction.deferUpdate();

            // Find the racing board
            const racingBoard = await ArcadeBoard.findOne({ 
                boardId,
                boardType: 'racing'
            });

            if (!racingBoard) {
                return interaction.editReply(`Racing board with ID "${boardId}" not found.`);
            }

            // Check if points have already been awarded
            if (racingBoard.pointsAwarded) {
                return interaction.editReply(`Points have already been awarded for this racing challenge.`);
            }

            // Fetch leaderboard entries
            const allEntries = await this.fetchLeaderboardEntries(racingBoard.leaderboardId);
            if (!allEntries || allEntries.length === 0) {
                return interaction.editReply('No leaderboard entries found for this racing board.');
            }

            // Get all registered users
            const { User } = await import('../../models/User.js');
            const users = await User.find({ isActive: true });
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user);
            }
            
            // Filter entries to only show registered users
            const filteredEntries = allEntries.filter(entry => 
                entry.User && registeredUsers.has(entry.User.toLowerCase())
            );

            if (filteredEntries.length === 0) {
                return interaction.editReply('No registered users found in the leaderboard for this racing board.');
            }

            // Track awarded points and results
            const results = [];
            
            // Award points to the top 3 finishers
            const pointsDistribution = [3, 2, 1]; // 1st, 2nd, 3rd place
            
            for (let i = 0; i < Math.min(3, filteredEntries.length); i++) {
                const entry = filteredEntries[i];
                const pointsToAward = pointsDistribution[i];
                const userObj = registeredUsers.get(entry.User.toLowerCase());
                
                if (userObj) {
                    // Add community award
                    const monthName = racingBoard.startDate.toLocaleString('default', { month: 'long' });
                    const year = racingBoard.startDate.getFullYear();
                    const placement = i === 0 ? '1st' : (i === 1 ? '2nd' : '3rd');
                    
                    // Include track name in award if available
                    const trackDisplay = racingBoard.trackName 
                        ? ` - ${racingBoard.trackName}`
                        : '';
                        
                    const gameDisplay = `${racingBoard.gameTitle}${trackDisplay}`;
                    
                    const awardTitle = `${placement} Place in ${monthName} ${year} Racing: ${gameDisplay}`;
                    
                    userObj.communityAwards.push({
                        title: awardTitle,
                        points: pointsToAward,
                        awardedAt: new Date(),
                        awardedBy: interaction.user.tag
                    });
                    
                    await userObj.save();
                    
                    // Record result
                    results.push({
                        username: entry.User,
                        rank: i + 1,
                        time: entry.TrackTime,
                        points: pointsToAward
                    });
                }
            }
            
            // Update the racing board to mark points as awarded and store results
            racingBoard.pointsAwarded = true;
            racingBoard.results = results;
            await racingBoard.save();
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`🏆 Racing Points Awarded`)
                .setDescription(
                    `Successfully awarded points for ${racingBoard.gameTitle}${racingBoard.trackName ? ` - ${racingBoard.trackName}` : ''} racing challenge!`
                );

            // Add results to embed
            let resultsText = '';
            results.forEach(result => {
                resultsText += `${result.rank}. **${result.username}** (${result.time}): ${result.points} point${result.points !== 1 ? 's' : ''}\n`;
            });
            
            if (resultsText) {
                embed.addFields({ name: 'Results', value: resultsText });
            }

            // Add announce results button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`announce_results_racing_${boardId}`)
                        .setLabel('Announce Results')
                        .setStyle(ButtonStyle.Primary)
                );
            
            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error awarding racing points:', error);
            return interaction.editReply('An error occurred while awarding points. Please try again.');
        }
    },

    // Handle the trigger arcade awards command
    async triggerArcadeAwards(interaction, yearStr) {
        const year = parseInt(yearStr);
        
        // Validate year
        if (isNaN(year)) {
            return interaction.editReply('Invalid year format. Please provide a valid year.');
        }
        
        // Create confirmation embed
        const currentYear = new Date().getFullYear();
        
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle(`🏆 Confirm Award Arcade Points`)
            .setDescription(
                `This will trigger the annual arcade points award process for ${year}.\n\n` +
                `This action can take several minutes to complete.\n\n` +
                `Are you sure you want to proceed?`
            );

        // Create confirmation buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`award_arcade_confirm_${year}`)
                    .setLabel('Confirm')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`award_arcade_cancel`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        return interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    },

    // Process the arcade awards
    async processArcadeAwards(interaction, year) {
        try {
            await interaction.deferUpdate();
            
            // Set waiting message
            await interaction.editReply({
                content: `Triggering arcade awards process for ${year}... This may take a few minutes.`,
                embeds: [],
                components: []
            });
            
            // Import arcadeService
            const arcadeService = (await import('../../services/arcadeService.js')).default;
            
            // Set client if needed
            if (!arcadeService.client) {
                arcadeService.setClient(interaction.client);
            }
            
            // Run the arcade points award process
            await arcadeService.awardArcadePoints(parseInt(year));
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Arcade Awards Complete')
                .setDescription(
                    `Arcade awards process for ${year} completed successfully!`
                );

            return interaction.editReply({
                content: null,
                embeds: [embed],
                components: []
            });
        } catch (error) {
            console.error('Error triggering arcade awards:', error);
            return interaction.editReply({
                content: 'An error occurred while processing arcade awards. Check the logs for details.',
                embeds: [],
                components: []
            });
        }
    },

    // Announce a board
    async announceBoard(interaction, boardType, boardId, isSelectMenu = false) {
        try {
            if (isSelectMenu) {
                await interaction.deferUpdate();
            } else {
                await interaction.deferReply({ ephemeral: true });
            }

            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType
            });
            
            if (!board) {
                const response = `${this.getBoardTypeName(boardType)} with ID "${boardId}" not found.`;
                return interaction.editReply(response);
            }

            // Get the announcement and arcade channels
            const announcementChannel = await this.getAnnouncementChannel(interaction.client);
            const arcadeChannel = await this.getArcadeChannel(interaction.client);
            
            if (!announcementChannel) {
                return interaction.editReply('Announcement channel not found.');
            }
            
            if (!arcadeChannel) {
                return interaction.editReply('Arcade channel not found.');
            }
            
            // Different announcement based on board type
            let embed;
            
            if (boardType === 'racing') {
                // Get month name for racing challenge
                const monthName = board.startDate.toLocaleString('default', { month: 'long' });
                const year = board.startDate.getFullYear();
                
                embed = new EmbedBuilder()
                    .setColor('#FF9900')
                    .setTitle(`🏎️ New Racing Challenge: ${monthName} ${year}`)
                    .setDescription(
                        `A new monthly racing challenge has begun!\n\n` +
                        `**Game:** ${board.gameTitle}\n` +
                        `**Track:** ${board.trackName}\n` +
                        `**Description:** ${board.description}\n\n` +
                        `**Challenge Period:** ${board.startDate.toLocaleDateString()} to ${board.endDate.toLocaleDateString()}\n\n` +
                        `Compete for the fastest time! The top 3 players will receive award points at the end of the month. Check it out with \`/arcade racing\`!`
                    )
                    .setTimestamp();
                
                // Get game info for thumbnail
                const gameInfo = await retroAPI.getGameInfo(board.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } else if (boardType === 'arcade') {
                // Get game info
                const gameInfo = await retroAPI.getGameInfo(board.gameId);
                
                embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(`🎮 New Arcade Board: ${board.gameTitle}`)
                    .setDescription(
                        `A new arcade leaderboard has been added!\n\n` +
                        `**Game:** ${board.gameTitle}\n` +
                        `**Description:** ${board.description}\n\n` +
                        `Check it out with \`/arcade board id:${board.boardId}\``
                    )
                    .setTimestamp();
                
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } else if (boardType === 'tiebreaker') {
                // Get month name for tiebreaker
                const monthName = board.startDate.toLocaleString('default', { month: 'long' });
                const year = board.startDate.getFullYear();
                
                embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(`⚔️ Monthly Tiebreaker Challenge: ${monthName} ${year}`)
                    .setDescription(
                        `A tiebreaker challenge has been created for this month's competition!\n\n` +
                        `**Game:** ${board.gameTitle}\n` +
                        `**Description:** ${board.description}\n\n` +
                        `**Tiebreaker Period:** ${board.startDate.toLocaleDateString()} to ${board.endDate.toLocaleDateString()}\n\n` +
                        `This tiebreaker will be used to resolve ties in the ${monthName} monthly challenge leaderboard. Check it out with \`/arcade tiebreaker\`!`
                    )
                    .setTimestamp();
                
                // Get game info for thumbnail
                const gameInfo = await retroAPI.getGameInfo(board.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } else {
                return interaction.editReply(`Cannot announce board of type "${boardType}".`);
            }
            
            // Send to both announcement and arcade channels
            await announcementChannel.send({ embeds: [embed] });
            await arcadeChannel.send({ embeds: [embed] });
            
            // Create response embed
            const responseEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Announcement Sent')
                .setDescription(
                    `Successfully announced ${boardType} board "${board.gameTitle}" in both the announcements and arcade channels!`
                );

            return interaction.editReply({
                embeds: [responseEmbed],
                components: []
            });
        } catch (error) {
            console.error(`Error announcing ${boardType}:`, error);
            return interaction.editReply('An error occurred while announcing the board.');
        }
    },

    // Announce racing results
    async announceRacingResults(interaction, boardId) {
        try {
            await interaction.deferUpdate();

            // Find the racing board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType: 'racing'
            });

            if (!board) {
                return interaction.editReply(`Racing board with ID "${boardId}" not found.`);
            }

            if (!board.pointsAwarded || !board.results || board.results.length === 0) {
                return interaction.editReply('This racing challenge has no awarded results to announce.');
            }

            // Get the announcement and arcade channels
            const announcementChannel = await this.getAnnouncementChannel(interaction.client);
            const arcadeChannel = await this.getArcadeChannel(interaction.client);
            
            if (!announcementChannel || !arcadeChannel) {
                return interaction.editReply('Could not find the required channels.');
            }

            // Create results announcement embed
            const monthName = board.startDate.toLocaleString('default', { month: 'long' });
            const year = board.startDate.getFullYear();
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`🏆 Racing Challenge Results: ${monthName} ${year}`)
                .setDescription(
                    `The results are in for the ${monthName} ${year} racing challenge!\n\n` +
                    `**Game:** ${board.gameTitle}\n` +
                    `**Track:** ${board.trackName}`
                );

            // Add results to embed
            let resultsText = '';
            board.results.forEach(result => {
                const emoji = result.rank === 1 ? '🥇' : (result.rank === 2 ? '🥈' : '🥉');
                resultsText += `${emoji} **${result.username}** (${result.time}): ${result.points} point${result.points !== 1 ? 's' : ''}\n`;
            });
            
            if (resultsText) {
                embed.addFields({ name: 'Results', value: resultsText });
            }

            // Send announcements
            await announcementChannel.send({ embeds: [embed] });
            await arcadeChannel.send({ embeds: [embed] });

            // Create response embed
            const responseEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Results Announced')
                .setDescription(
                    `Successfully announced the racing results in both the announcements and arcade channels!`
                );

            return interaction.editReply({
                embeds: [responseEmbed],
                components: []
            });
        } catch (error) {
            console.error('Error announcing racing results:', error);
            return interaction.editReply('An error occurred while announcing the results.');
        }
    },

    // Helper methods for fetching leaderboard entries
    async fetchLeaderboardEntries(leaderboardId) {
        try {
            return await retroAPI.getLeaderboardEntries(leaderboardId, 0, 1000);
        } catch (error) {
            console.error('Error fetching leaderboard entries:', error);
            throw error;
        }
    },

    // Get announcement channel
    async getAnnouncementChannel(client) {
        try {
            // Get the guild
            const guild = await client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Get the announcement channel
            return await guild.channels.fetch(config.discord.announcementChannelId);
        } catch (error) {
            console.error('Error getting announcement channel:', error);
            return null;
        }
    },
    
    // Get arcade channel
    async getArcadeChannel(client) {
        try {
            // Get the guild
            const guild = await client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Get the arcade channel
            return await guild.channels.fetch('1300941091335438471');
        } catch (error) {
            console.error('Error getting arcade channel:', error);
            return null;
        }
    },

    // Helper methods for consistency
    getBoardTypeName(boardType) {
        const names = {
            'arcade': 'Arcade Board',
            'racing': 'Racing Challenge',
            'tiebreaker': 'Tiebreaker Board'
        };
        return names[boardType] || 'Board';
    },
    
    getBoardTypeEmoji(boardType) {
        const emojis = {
            'arcade': '🎮',
            'racing': '🏎️',
            'tiebreaker': '⚔️'
        };
        return emojis[boardType] || '';
    },
    
    getBoardTypeColor(boardType) {
        const colors = {
            'arcade': '#0099ff',
            'racing': '#FF9900',
            'tiebreaker': '#FF0000'
        };
        return colors[boardType] || '#9B59B6';
    }
};
