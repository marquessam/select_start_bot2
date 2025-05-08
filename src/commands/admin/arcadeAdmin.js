import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arcadeadmin')
        .setDescription('Manage arcade leaderboards')
        // No subcommands - just a single entry point
        .addStringOption(option =>
            option.setName('board_id')
                .setDescription('For direct operations on a specific board (optional)')
                .setRequired(false)),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        // Check if a board ID was directly provided
        const boardId = interaction.options.getString('board_id');
        
        if (boardId) {
            // If a board ID was provided, show the board actions menu
            return this.showBoardActionsMenu(interaction, boardId);
        } else {
            // Otherwise, show the main menu
            return this.showMainMenu(interaction);
        }
    },

    async showMainMenu(interaction) {
        // Create the main menu embed
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('Arcade Admin Panel')
            .setDescription('Select the type of board you want to manage.')
            .addFields(
                { name: 'Arcade Boards', value: 'Standard arcade leaderboards' },
                { name: 'Racing Challenges', value: 'Monthly racing competitions' },
                { name: 'Tiebreakers', value: 'Special leaderboards for resolving ties' }
            );

        // Create the board type selection menu
        const boardTypeRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('arcadeadmin_board_type')
                    .setPlaceholder('Select board type...')
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Arcade Boards')
                            .setDescription('Manage standard arcade leaderboards')
                            .setValue('arcade')
                            .setEmoji('🎮'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Racing Challenges')
                            .setDescription('Manage monthly racing competitions')
                            .setValue('racing')
                            .setEmoji('🏎️'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Tiebreakers')
                            .setDescription('Manage tiebreaker boards')
                            .setValue('tiebreaker')
                            .setEmoji('⚔️')
                    )
            );

        // Add a button to list current boards
        const listBoardsRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arcadeadmin_list_arcade')
                    .setLabel('List Arcade Boards')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎮'),
                new ButtonBuilder()
                    .setCustomId('arcadeadmin_list_racing')
                    .setLabel('List Racing Challenges')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🏎️'),
                new ButtonBuilder()
                    .setCustomId('arcadeadmin_list_tiebreaker')
                    .setLabel('List Tiebreakers')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⚔️')
            );

        // Add a button for global actions
        const globalActionsRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arcadeadmin_award_arcade_points')
                    .setLabel('Award Annual Arcade Points')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🏆')
            );

        await interaction.reply({
            embeds: [embed],
            components: [boardTypeRow, listBoardsRow, globalActionsRow],
            ephemeral: true
        });
    },

    async showBoardActionsMenu(interaction, boardId) {
        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ boardId });
            
            if (!board) {
                return interaction.reply({
                    content: `Board with ID "${boardId}" not found.`,
                    ephemeral: true
                });
            }

            // Create the board actions embed
            const embed = new EmbedBuilder()
                .setColor(this.getBoardTypeColor(board.boardType))
                .setTitle(`${this.getBoardTypeEmoji(board.boardType)} ${board.gameTitle}`)
                .setDescription(`Board ID: ${boardId}\nType: ${board.boardType}`)
                .addFields(
                    { name: 'Game', value: board.gameTitle },
                    { name: 'Description', value: board.description }
                );

            if (board.trackName) {
                embed.addFields({ name: 'Track', value: board.trackName });
            }

            if (board.startDate && board.endDate) {
                embed.addFields({
                    name: 'Period',
                    value: `${board.startDate.toLocaleDateString()} to ${board.endDate.toLocaleDateString()}`
                });
            }

            // Create the action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_edit_${board.boardType}_${boardId}`)
                        .setLabel('Edit')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('✏️'),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_announce_${board.boardType}_${boardId}`)
                        .setLabel('Announce')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('📣'),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_remove_${board.boardType}_${boardId}`)
                        .setLabel('Remove')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️')
                );

            // Add specialized buttons based on board type
            const specialActionRow = new ActionRowBuilder();
            
            if (board.boardType === 'racing' && !board.pointsAwarded) {
                specialActionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_award_racing_${boardId}`)
                        .setLabel('Award Points')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏆')
                );
            }

            // Add the view leaderboard button
            specialActionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`view_${board.boardType}_${boardId}`)
                    .setLabel('View Leaderboard')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📊')
            );

            const components = [actionRow];
            if (specialActionRow.components.length > 0) {
                components.push(specialActionRow);
            }

            await interaction.reply({
                embeds: [embed],
                components,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error showing board actions menu:', error);
            await interaction.reply({
                content: 'An error occurred while retrieving the board information.',
                ephemeral: true
            });
        }
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
            return;
        }

        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const customId = interaction.customId;

        // Handle main menu board type selection
        if (customId === 'arcadeadmin_board_type') {
            const boardType = interaction.values[0];
            await this.showActionMenu(interaction, boardType);
            return;
        }

        // Handle list boards buttons
        if (customId.startsWith('arcadeadmin_list_')) {
            const boardType = customId.split('_')[2];
            await this.listBoards(interaction, boardType);
            return;
        }

        // Handle award arcade points
        if (customId === 'arcadeadmin_award_arcade_points') {
            await this.confirmAwardArcadePoints(interaction);
            return;
        }

        // Handle board-specific actions
        if (customId.startsWith('arcadeadmin_')) {
            const parts = customId.split('_');
            const action = parts[1];
            const boardType = parts[2];
            const boardId = parts[3];

            switch (action) {
                case 'edit':
                    await this.showEditForm(interaction, boardType, boardId);
                    break;
                case 'announce':
                    await this.announceBoard(interaction, boardType, boardId);
                    break;
                case 'remove':
                    await this.confirmRemoveBoard(interaction, boardType, boardId);
                    break;
                case 'award':
                    if (boardType === 'racing') {
                        await this.awardRacingPoints(interaction, boardId);
                    }
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown action.',
                        ephemeral: true
                    });
            }
        }
    },

    async showActionMenu(interaction, boardType) {
        // Get the readable name for the board type
        const boardTypeName = this.getBoardTypeName(boardType);
        const emoji = this.getBoardTypeEmoji(boardType);

        // Create the action menu embed
        const embed = new EmbedBuilder()
            .setColor(this.getBoardTypeColor(boardType))
            .setTitle(`${emoji} ${boardTypeName} Management`)
            .setDescription(`Select an action to perform for ${boardTypeName.toLowerCase()}.`);

        // Create the action selection menu
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`arcadeadmin_action_${boardType}`)
                    .setPlaceholder('Select action...')
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Add New')
                            .setDescription(`Create a new ${boardTypeName.toLowerCase()}`)
                            .setValue(`add_${boardType}`)
                            .setEmoji('➕'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('List All')
                            .setDescription(`Show all ${boardTypeName.toLowerCase()}`)
                            .setValue(`list_${boardType}`)
                            .setEmoji('📋')
                    )
            );

        // Add back button
        const backRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arcadeadmin_back_to_main')
                    .setLabel('Back to Main Menu')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('◀️')
            );

        await interaction.update({
            embeds: [embed],
            components: [actionRow, backRow]
        });
    },

    async listBoards(interaction, boardType) {
        try {
            await interaction.deferUpdate();

            // Find all boards of the specified type
            const boards = await ArcadeBoard.find({ boardType }).sort({ createdAt: -1 });

            if (boards.length === 0) {
                // Create embed with no boards message
                const embed = new EmbedBuilder()
                    .setColor(this.getBoardTypeColor(boardType))
                    .setTitle(`${this.getBoardTypeEmoji(boardType)} ${this.getBoardTypeName(boardType)} List`)
                    .setDescription(`No ${boardType} boards found.`);

                // Add back button
                const backRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('arcadeadmin_back_to_main')
                            .setLabel('Back to Main Menu')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('◀️')
                    );

                await interaction.editReply({
                    embeds: [embed],
                    components: [backRow]
                });
                return;
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

            // Create select menu for boards
            const selectRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`arcadeadmin_select_board_${boardType}`)
                        .setPlaceholder('Select a board to manage...')
                        .addOptions(
                            boardsToShow.map(board => {
                                let label = board.gameTitle;
                                if (board.trackName && label.length + board.trackName.length + 3 <= 100) {
                                    label += ` - ${board.trackName}`;
                                }
                                
                                // Trim label if too long
                                if (label.length > 100) {
                                    label = label.substring(0, 97) + '...';
                                }
                                
                                return new StringSelectMenuOptionBuilder()
                                    .setLabel(label)
                                    .setValue(board.boardId)
                                    .setDescription(`ID: ${board.boardId}`);
                            })
                        )
                );

            // Add create new board button and back button
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_create_${boardType}`)
                        .setLabel(`Create New ${this.getBoardTypeName(boardType)}`)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('➕'),
                    new ButtonBuilder()
                        .setCustomId('arcadeadmin_back_to_main')
                        .setLabel('Back to Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [selectRow, actionRow]
            });
        } catch (error) {
            console.error(`Error listing ${boardType} boards:`, error);
            await interaction.editReply({
                content: `An error occurred while listing ${boardType} boards.`,
                components: []
            });
        }
    },

    async showAddForm(interaction, boardType) {
        try {
            // Create a modal for adding a new board
            const modal = new ModalBuilder()
                .setCustomId(`arcadeadmin_add_${boardType}_modal`)
                .setTitle(`Add New ${this.getBoardTypeName(boardType)}`);

            // Add fields based on board type
            const gameIdInput = new TextInputBuilder()
                .setCustomId('game_id')
                .setLabel('Game ID')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('RetroAchievements Game ID')
                .setRequired(true);

            const leaderboardIdInput = new TextInputBuilder()
                .setCustomId('leaderboard_id')
                .setLabel('Leaderboard ID')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('RetroAchievements Leaderboard ID')
                .setRequired(true);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Description of the board')
                .setRequired(true);

            // Common fields
            const gameIdRow = new ActionRowBuilder().addComponents(gameIdInput);
            const leaderboardIdRow = new ActionRowBuilder().addComponents(leaderboardIdInput);
            const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);

            modal.addComponents(gameIdRow, leaderboardIdRow, descriptionRow);

            // Add board type specific fields
            if (boardType === 'arcade') {
                const boardIdInput = new TextInputBuilder()
                    .setCustomId('board_id')
                    .setLabel('Board ID')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Unique identifier for this board')
                    .setRequired(true);

                const boardIdRow = new ActionRowBuilder().addComponents(boardIdInput);
                modal.addComponents(boardIdRow);
            } else if (boardType === 'racing') {
                const trackNameInput = new TextInputBuilder()
                    .setCustomId('track_name')
                    .setLabel('Track Name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Name of the track (e.g., "Mario Circuit")')
                    .setRequired(true);

                const monthInput = new TextInputBuilder()
                    .setCustomId('month_year')
                    .setLabel('Month and Year (Optional)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('YYYY-MM (defaults to current month)')
                    .setRequired(false);

                const trackNameRow = new ActionRowBuilder().addComponents(trackNameInput);
                const monthRow = new ActionRowBuilder().addComponents(monthInput);
                modal.addComponents(trackNameRow, monthRow);
            } else if (boardType === 'tiebreaker') {
                const endDateInput = new TextInputBuilder()
                    .setCustomId('end_date')
                    .setLabel('End Date')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('YYYY-MM-DD')
                    .setRequired(true);

                const endDateRow = new ActionRowBuilder().addComponents(endDateInput);
                modal.addComponents(endDateRow);
            }

            // Show the modal
            await interaction.showModal(modal);
        } catch (error) {
            console.error(`Error showing add form for ${boardType}:`, error);
            await interaction.reply({
                content: `An error occurred while preparing the form.`,
                ephemeral: true
            });
        }
    },

    async handleAddFormSubmit(interaction, boardType) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const gameId = parseInt(interaction.fields.getTextInputValue('game_id'));
            const leaderboardId = parseInt(interaction.fields.getTextInputValue('leaderboard_id'));
            const description = interaction.fields.getTextInputValue('description');

            // Validate game exists
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }

            // Handle board type specific fields and create the board
            if (boardType === 'arcade') {
                const boardId = interaction.fields.getTextInputValue('board_id');

                // Check if board ID already exists
                const existingBoard = await ArcadeBoard.findOne({ boardId });
                if (existingBoard) {
                    return interaction.editReply(`A board with ID "${boardId}" already exists.`);
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

                // Create response embed
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

                // Add action buttons
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`arcadeadmin_announce_arcade_${boardId}`)
                            .setLabel('Announce to Server')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('📣'),
                        new ButtonBuilder()
                            .setCustomId(`view_arcade_${boardId}`)
                            .setLabel('View Leaderboard')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📊')
                    );

                await interaction.editReply({
                    embeds: [embed],
                    components: [actionRow]
                });
            } else if (boardType === 'racing') {
                const trackName = interaction.fields.getTextInputValue('track_name');
                
                // Parse month and year (optional)
                let monthYear = interaction.fields.getTextInputValue('month_year');
                let year, month;
                
                if (monthYear && /^\d{4}-\d{2}$/.test(monthYear)) {
                    [year, month] = monthYear.split('-').map(Number);
                } else {
                    const now = new Date();
                    year = now.getFullYear();
                    month = now.getMonth() + 1;
                    monthYear = `${year}-${month.toString().padStart(2, '0')}`;
                }

                // Check if a racing challenge already exists for this month
                const existingChallenge = await ArcadeBoard.findOne({
                    boardType: 'racing',
                    monthKey: monthYear
                });

                if (existingChallenge) {
                    return interaction.editReply(`A racing challenge already exists for ${monthYear}.`);
                }

                // Calculate start and end dates
                const startDate = new Date(year, month - 1, 1);
                const endDate = new Date(year, month, 0, 23, 59, 59);
                
                // Generate a unique board ID for racing
                const boardId = `racing-${monthYear}`;

                // Get the full game title and console name
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
                    monthKey: monthYear
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
                        `**Challenge Period:** ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}\n\n` +
                        `The top 3 players at the end of the month will receive award points!`
                    );

                if (gameInfo.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }

                // Add action buttons
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`arcadeadmin_announce_racing_${boardId}`)
                            .setLabel('Announce to Server')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('📣'),
                        new ButtonBuilder()
                            .setCustomId(`view_racing_${boardId}`)
                            .setLabel('View Leaderboard')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📊')
                    );

                await interaction.editReply({
                    embeds: [embed],
                    components: [actionRow]
                });
            } else if (boardType === 'tiebreaker') {
                const endDateStr = interaction.fields.getTextInputValue('end_date');
                
                // Parse end date
                const endDate = new Date(endDateStr);
                if (isNaN(endDate.getTime())) {
                    return interaction.editReply('Invalid end date format. Please use YYYY-MM-DD.');
                }

                // Set end time to 23:59:59
                endDate.setHours(23, 59, 59);

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
                        `**Tiebreaker Period:** ${now.toLocaleDateString()} to ${endDate.toLocaleDateString()}\n\n` +
                        `This tiebreaker will be used to resolve ties in the ${monthName} monthly challenge leaderboard.`
                    );

                if (gameInfo.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }

                // Add action buttons
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`arcadeadmin_announce_tiebreaker_${boardId}`)
                            .setLabel('Announce to Server')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('📣'),
                        new ButtonBuilder()
                            .setCustomId(`view_tiebreaker_${boardId}`)
                            .setLabel('View Leaderboard')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📊')
                    );

                await interaction.editReply({
                    embeds: [embed],
                    components: [actionRow]
                });
            }
        } catch (error) {
            console.error(`Error handling add form submit for ${boardType}:`, error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },

    async showEditForm(interaction, boardType, boardId) {
        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType
            });

            if (!board) {
                return interaction.reply({
                    content: `${this.getBoardTypeName(boardType)} with ID "${boardId}" not found.`,
                    ephemeral: true
                });
            }

            // Create a modal for editing the board
            const modal = new ModalBuilder()
                .setCustomId(`arcadeadmin_edit_${boardType}_${boardId}_modal`)
                .setTitle(`Edit ${this.getBoardTypeName(boardType)}`);

            // Add common fields
            const leaderboardIdInput = new TextInputBuilder()
                .setCustomId('leaderboard_id')
                .setLabel('Leaderboard ID')
                .setStyle(TextInputStyle.Short)
                .setValue(board.leaderboardId.toString())
                .setRequired(true);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(board.description)
                .setRequired(true);

            const leaderboardIdRow = new ActionRowBuilder().addComponents(leaderboardIdInput);
            const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);

            modal.addComponents(leaderboardIdRow, descriptionRow);

            // Add board type specific fields
            if (boardType === 'racing' && board.trackName) {
                const trackNameInput = new TextInputBuilder()
                    .setCustomId('track_name')
                    .setLabel('Track Name')
                    .setStyle(TextInputStyle.Short)
                    .setValue(board.trackName)
                    .setRequired(true);

                const trackNameRow = new ActionRowBuilder().addComponents(trackNameInput);
                modal.addComponents(trackNameRow);
            } else if (boardType === 'tiebreaker' && board.endDate) {
                const endDateInput = new TextInputBuilder()
                    .setCustomId('end_date')
                    .setLabel('End Date (YYYY-MM-DD)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(board.endDate.toISOString().split('T')[0])
                    .setRequired(true);

                const endDateRow = new ActionRowBuilder().addComponents(endDateInput);
                modal.addComponents(endDateRow);
            }

            // Show the modal
            await interaction.showModal(modal);
        } catch (error) {
            console.error(`Error showing edit form for ${boardType}:`, error);
            await interaction.reply({
                content: `An error occurred while preparing the edit form.`,
                ephemeral: true
            });
        }
    },

    async handleEditFormSubmit(interaction, boardType, boardId) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType
            });

            if (!board) {
                return interaction.editReply(`${this.getBoardTypeName(boardType)} with ID "${boardId}" not found.`);
            }

            // Update common fields
            const newLeaderboardId = parseInt(interaction.fields.getTextInputValue('leaderboard_id'));
            const newDescription = interaction.fields.getTextInputValue('description');

            board.leaderboardId = newLeaderboardId;
            board.description = newDescription;

            // Update board type specific fields
            if (boardType === 'racing') {
                try {
                    const newTrackName = interaction.fields.getTextInputValue('track_name');
                    board.trackName = newTrackName;
                } catch (e) {
                    // Track name field might not be present
                }
            } else if (boardType === 'tiebreaker') {
                try {
                    const newEndDateStr = interaction.fields.getTextInputValue('end_date');
                    const newEndDate = new Date(newEndDateStr);
                    
                    if (isNaN(newEndDate.getTime())) {
                        return interaction.editReply('Invalid end date format. Please use YYYY-MM-DD.');
                    }
                    
                    // Set end time to 23:59:59
                    newEndDate.setHours(23, 59, 59);
                    board.endDate = newEndDate;
                } catch (e) {
                    // End date field might not be present
                }
            }

            await board.save();

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor(this.getBoardTypeColor(boardType))
                .setTitle(`${this.getBoardTypeEmoji(boardType)} ${this.getBoardTypeName(boardType)} Updated`)
                .setDescription(
                    `Successfully updated ${boardType} board:\n\n` +
                    `**Game:** ${board.gameTitle}\n` +
                    `**Board ID:** ${boardId}`
                );

            // Add board type specific fields to embed
            if (boardType === 'racing' && board.trackName) {
                embed.addFields({ name: 'Track', value: board.trackName });
            }
            
            if (board.startDate && board.endDate) {
                embed.addFields({
                    name: 'Period',
                    value: `${board.startDate.toLocaleDateString()} to ${board.endDate.toLocaleDateString()}`
                });
            }

            // Add action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_announce_${boardType}_${boardId}`)
                        .setLabel('Announce Update')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📣'),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_back_to_board_${boardId}`)
                        .setLabel('Back to Board')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀️')
                );

            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });
        } catch (error) {
            console.error(`Error handling edit form submit for ${boardType}:`, error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },

    async confirmRemoveBoard(interaction, boardType, boardId) {
        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType
            });

            if (!board) {
                return interaction.reply({
                    content: `${this.getBoardTypeName(boardType)} with ID "${boardId}" not found.`,
                    ephemeral: true
                });
            }

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`⚠️ Confirm Removal`)
                .setDescription(
                    `Are you sure you want to remove the following ${boardType} board?\n\n` +
                    `**Game:** ${board.gameTitle}\n` +
                    `**Board ID:** ${boardId}\n\n` +
                    `This action cannot be undone.`
                );

            // Add confirmation buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_remove_confirm_${boardType}_${boardId}`)
                        .setLabel('Confirm Removal')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️'),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_back_to_board_${boardId}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('❌')
                );

            await interaction.reply({
                embeds: [embed],
                components: [actionRow],
                ephemeral: true
            });
        } catch (error) {
            console.error(`Error confirming remove for ${boardType}:`, error);
            await interaction.reply({
                content: 'An error occurred while processing your request.',
                ephemeral: true
            });
        }
    },

    async removeBoard(interaction, boardType, boardId) {
        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType
            });

            if (!board) {
                return interaction.update({
                    content: `${this.getBoardTypeName(boardType)} with ID "${boardId}" not found.`,
                    embeds: [],
                    components: []
                });
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

            // Add back to main menu button
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arcadeadmin_back_to_main')
                        .setLabel('Back to Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀️')
                );

            await interaction.update({
                embeds: [embed],
                components: [actionRow]
            });
        } catch (error) {
            console.error(`Error removing ${boardType}:`, error);
            await interaction.update({
                content: 'An error occurred while removing the board.',
                embeds: [],
                components: []
            });
        }
    },

    async announceBoard(interaction, boardType, boardId) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType
            });
            
            if (!board) {
                return interaction.editReply(`${this.getBoardTypeName(boardType)} with ID "${boardId}" not found.`);
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

            // Add back to board button
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_back_to_board_${boardId}`)
                        .setLabel('Back to Board')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀️')
                );

            await interaction.editReply({
                embeds: [responseEmbed],
                components: [actionRow]
            });
        } catch (error) {
            console.error(`Error announcing ${boardType}:`, error);
            await interaction.editReply('An error occurred while announcing the board.');
        }
    },

    async awardRacingPoints(interaction, boardId) {
        try {
            await interaction.deferReply({ ephemeral: true });

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

            // Add action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_announce_results_${boardId}`)
                        .setLabel('Announce Results')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📣'),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_back_to_board_${boardId}`)
                        .setLabel('Back to Board')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀️')
                );
            
            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });
        } catch (error) {
            console.error('Error awarding racing points:', error);
            await interaction.editReply('An error occurred while awarding points. Please try again.');
        }
    },

    async confirmAwardArcadePoints(interaction) {
        try {
            // Get current year
            const currentYear = new Date().getFullYear();
            
            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle(`🏆 Confirm Award Arcade Points`)
                .setDescription(
                    `This will trigger the annual arcade points award process for the current year (${currentYear}).\n\n` +
                    `This action can take several minutes to complete.\n\n` +
                    `Are you sure you want to proceed?`
                );

            // Create confirmation buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_award_arcade_confirm`)
                        .setLabel('Confirm')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_back_to_main`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('❌')
                );

            // Add year selection
            const yearRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('arcadeadmin_award_year_select')
                        .setPlaceholder('Select year (default: current year)')
                        .addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(`${currentYear} (Current Year)`)
                                .setValue(`${currentYear}`)
                                .setDefault(true),
                            new StringSelectMenuOptionBuilder()
                                .setLabel(`${currentYear - 1}`)
                                .setValue(`${currentYear - 1}`),
                            new StringSelectMenuOptionBuilder()
                                .setLabel(`${currentYear - 2}`)
                                .setValue(`${currentYear - 2}`)
                        )
                );

            await interaction.reply({
                embeds: [embed],
                components: [row, yearRow],
                ephemeral: true
            });
        } catch (error) {
            console.error('Error confirming award arcade points:', error);
            await interaction.reply({
                content: 'An error occurred while preparing the confirmation.',
                ephemeral: true
            });
        }
    },

    async triggerArcadeAwards(interaction, year = null) {
        try {
            await interaction.deferUpdate();
            
            // Set waiting message
            await interaction.editReply({
                content: `Triggering arcade awards process for ${year || 'current year'}... This may take a few minutes.`,
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
            if (year) {
                await arcadeService.awardArcadePoints(parseInt(year));
            } else {
                await arcadeService.awardArcadePoints();
            }
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Arcade Awards Complete')
                .setDescription(
                    `Arcade awards process for ${year || 'the current year'} completed successfully!`
                );

            // Add back to main menu button
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arcadeadmin_back_to_main')
                        .setLabel('Back to Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('◀️')
                );

            await interaction.editReply({
                content: null,
                embeds: [embed],
                components: [actionRow]
            });
        } catch (error) {
            console.error('Error triggering arcade awards:', error);
            await interaction.editReply({
                content: 'An error occurred while processing arcade awards. Check the logs for details.',
                embeds: [],
                components: []
            });
        }
    },

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

    async fetchLeaderboardEntries(leaderboardId) {
        try {
            return await retroAPI.getLeaderboardEntries(leaderboardId, 0, 1000);
        } catch (error) {
            console.error('Error fetching leaderboard entries:', error);
            throw error;
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
