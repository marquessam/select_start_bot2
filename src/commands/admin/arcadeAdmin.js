import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arcadeadmin')
        .setDescription('Manage arcade leaderboards')
        .addStringOption(option =>
            option.setName('board_id')
                .setDescription('Optional: Directly manage a specific board by ID')
                .setRequired(false)),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const boardId = interaction.options.getString('board_id');
        
        if (boardId) {
            // If board ID provided, go directly to board management
            return this.handleBoardManagement(interaction, boardId);
        } else {
            // Otherwise show main menu
            return this.showMainMenu(interaction);
        }
    },

    async showMainMenu(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('Arcade Admin Panel')
            .setDescription('Select the type of board you want to manage.')
            .addFields(
                { name: '🎮 Arcade Boards', value: 'Standard arcade leaderboards' },
                { name: '🏎️ Racing Challenges', value: 'Monthly racing competitions' },
                { name: '⚔️ Tiebreakers', value: 'Special leaderboards for resolving ties' }
            );

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arcadeadmin_arcade_list')
                    .setLabel('Arcade Boards')
                    .setEmoji('🎮')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('arcadeadmin_racing_list')
                    .setLabel('Racing Challenges')
                    .setEmoji('🏎️')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('arcadeadmin_tiebreaker_list')
                    .setLabel('Tiebreakers')
                    .setEmoji('⚔️')
                    .setStyle(ButtonStyle.Primary)
            );

        const awardRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arcadeadmin_arcade_award')
                    .setLabel('Award Annual Arcade Points')
                    .setEmoji('🏆')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.reply({
            embeds: [embed],
            components: [row, awardRow],
            ephemeral: true
        });
    },

    async handleBoardManagement(interaction, boardId) {
        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ boardId });
            
            if (!board) {
                return interaction.reply({
                    content: `Board with ID "${boardId}" not found.`,
                    ephemeral: true
                });
            }

            // Create embed with board info
            const embed = new EmbedBuilder()
                .setColor(this.getBoardTypeColor(board.boardType))
                .setTitle(`${this.getBoardTypeEmoji(board.boardType)} ${board.gameTitle}`)
                .setDescription(`**ID:** ${board.boardId}\n**Type:** ${this.getBoardTypeName(board.boardType)}`)
                .addFields(
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

            // Create action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_${board.boardType}_edit_${boardId}`)
                        .setLabel('Edit')
                        .setEmoji('✏️')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_${board.boardType}_announce_${boardId}`)
                        .setLabel('Announce')
                        .setEmoji('📣')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_${board.boardType}_remove_${boardId}`)
                        .setLabel('Remove')
                        .setEmoji('🗑️')
                        .setStyle(ButtonStyle.Danger)
                );

            // Add special buttons based on board type
            const specialRow = new ActionRowBuilder();
            
            if (board.boardType === 'racing' && !board.pointsAwarded) {
                specialRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_racing_award_${boardId}`)
                        .setLabel('Award Points')
                        .setEmoji('🏆')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            // Add back button
            specialRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('arcadeadmin_back_to_main')
                    .setLabel('Back to Main Menu')
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Secondary)
            );

            const components = [actionRow];
            if (specialRow.components.length > 0) {
                components.push(specialRow);
            }

            return interaction.reply({
                embeds: [embed],
                components: components,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error handling board management:', error);
            return interaction.reply({
                content: 'An error occurred while retrieving the board information.',
                ephemeral: true
            });
        }
    },

    async listBoards(interaction, boardType) {
        try {
            await interaction.deferUpdate();

            // Find all boards of the specified type
            const boards = await ArcadeBoard.find({ boardType }).sort({ createdAt: -1 });

            if (boards.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(this.getBoardTypeColor(boardType))
                    .setTitle(`${this.getBoardTypeEmoji(boardType)} ${this.getBoardTypeName(boardType)} List`)
                    .setDescription(`No ${boardType} boards found.`);

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`arcadeadmin_${boardType}_add`)
                            .setLabel(`Create New ${this.getBoardTypeName(boardType)}`)
                            .setEmoji('➕')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('arcadeadmin_back_to_main')
                            .setLabel('Back to Main Menu')
                            .setEmoji('◀️')
                            .setStyle(ButtonStyle.Secondary)
                    );

                return interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });
            }

            // Create embed with boards list
            const embed = new EmbedBuilder()
                .setColor(this.getBoardTypeColor(boardType))
                .setTitle(`${this.getBoardTypeEmoji(boardType)} ${this.getBoardTypeName(boardType)} List`);

            // Add fields for each board (limit to first 10 for cleaner display)
            const boardsToShow = boards.slice(0, 10);
            
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
            
            if (boards.length > 10) {
                embed.setFooter({ text: `Showing 10/${boards.length} boards` });
            }

            // Create select menu for boards
            const selectRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`arcadeadmin_${boardType}_select`)
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
                                    .setDescription(`ID: ${board.boardId.substring(0, 95)}`);
                            })
                        )
                );

            // Add action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_${boardType}_add`)
                        .setLabel(`Create New ${this.getBoardTypeName(boardType)}`)
                        .setEmoji('➕')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('arcadeadmin_back_to_main')
                        .setLabel('Back to Main Menu')
                        .setEmoji('◀️')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [selectRow, actionRow]
            });
        } catch (error) {
            console.error(`Error listing ${boardType} boards:`, error);
            return interaction.editReply({
                content: `An error occurred while listing ${boardType} boards.`,
                components: []
            });
        }
    },

    async createAddModal(interaction, boardType) {
        try {
            // Create a modal for adding a new board
            const modal = new ModalBuilder()
                .setCustomId(`arcadeadmin_${boardType}_add_modal`)
                .setTitle(`Add New ${this.getBoardTypeName(boardType)}`);

            // Add common fields
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
            console.error(`Error showing add modal for ${boardType}:`, error);
            try {
                await interaction.reply({
                    content: `An error occurred while preparing the form.`,
                    ephemeral: true
                });
            } catch (replyError) {
                console.error("Error replying:", replyError);
            }
        }
    },

    async createEditModal(interaction, boardType, boardId) {
        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ boardId, boardType });
            
            if (!board) {
                return interaction.reply({
                    content: `${this.getBoardTypeName(boardType)} with ID "${boardId}" not found.`,
                    ephemeral: true
                });
            }

            // Create a modal for editing the board
            const modal = new ModalBuilder()
                .setCustomId(`arcadeadmin_${boardType}_edit_modal_${boardId}`)
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
            console.error(`Error showing edit modal for ${boardType}:`, error);
            try {
                await interaction.reply({
                    content: `An error occurred while preparing the edit form.`,
                    ephemeral: true
                });
            } catch (replyError) {
                console.error("Error replying:", replyError);
            }
        }
    },

    async handleArcadeBoardAdd(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

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
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_arcade_announce_${boardId}`)
                        .setLabel('Announce to Server')
                        .setEmoji('📣')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('arcadeadmin_arcade_list')
                        .setLabel('Back to List')
                        .setEmoji('◀️')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error adding arcade board:', error);
            return interaction.editReply('An error occurred while adding the arcade board. Please try again.');
        }
    },

    async handleRacingBoardAdd(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const leaderboardId = parseInt(interaction.fields.getTextInputValue('leaderboard_id'));
            const gameId = parseInt(interaction.fields.getTextInputValue('game_id'));
            const trackName = interaction.fields.getTextInputValue('track_name');
            const description = interaction.fields.getTextInputValue('description');
            
            // Parse month and year (optional)
            let monthYear = '';
            try {
                monthYear = interaction.fields.getTextInputValue('month_year');
            } catch (e) {
                // Field might not be present
            }
            
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

            // Validate game exists
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
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
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_racing_announce_${boardId}`)
                        .setLabel('Announce to Server')
                        .setEmoji('📣')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('arcadeadmin_racing_list')
                        .setLabel('Back to List')
                        .setEmoji('◀️')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error adding racing challenge:', error);
            return interaction.editReply('An error occurred while adding the racing challenge. Please try again.');
        }
    },

    async handleTiebreakerBoardAdd(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

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
                    `**Tiebreaker Period:** ${now.toLocaleDateString()} to ${endDate.toLocaleDateString()}\n\n` +
                    `This tiebreaker will be used to resolve ties in the ${monthName} monthly challenge leaderboard.`
                );

            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Add action buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_tiebreaker_announce_${boardId}`)
                        .setLabel('Announce to Server')
                        .setEmoji('📣')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('arcadeadmin_tiebreaker_list')
                        .setLabel('Back to List')
                        .setEmoji('◀️')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error adding tiebreaker:', error);
            return interaction.editReply('An error occurred while adding the tiebreaker. Please try again.');
        }
    },

    async handleBoardEdit(interaction, boardType, boardId) {
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
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_${boardType}_announce_${boardId}`)
                        .setLabel('Announce Update')
                        .setEmoji('📣')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_${boardType}_manage_${boardId}`)
                        .setLabel('Back to Board')
                        .setEmoji('◀️')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error(`Error handling ${boardType} edit:`, error);
            return interaction.editReply('An error occurred while updating the board. Please try again.');
        }
    },

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

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`⚠️ Confirm Removal`)
                .setDescription(
                    `Are you sure you want to remove this ${boardType} board?\n\n` +
                    `**Game:** ${board.gameTitle}${board.trackName ? ` - ${board.trackName}` : ''}\n` +
                    `**Board ID:** ${boardId}\n\n` +
                    `This action cannot be undone.`
                );

            // Add confirmation buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_${boardType}_remove_confirm_${boardId}`)
                        .setLabel('Confirm Removal')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_${boardType}_manage_${boardId}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error(`Error confirming removal of ${boardType} board:`, error);
            return interaction.editReply('An error occurred while preparing the confirmation. Please try again.');
        }
    },

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

            // Add back to list button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_${boardType}_list`)
                        .setLabel(`Back to ${this.getBoardTypeName(boardType)} List`)
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error(`Error removing ${boardType} board:`, error);
            return interaction.editReply('An error occurred while removing the board. Please try again.');
        }
    },

    async announceBoard(interaction, boardType, boardId) {
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

            // Add back button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_${boardType}_manage_${boardId}`)
                        .setLabel('Back to Board')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [responseEmbed],
                components: [row]
            });
        } catch (error) {
            console.error(`Error announcing ${boardType} board:`, error);
            return interaction.editReply('An error occurred while announcing the board. Please try again.');
        }
    },

    async confirmAwardRacingPoints(interaction, boardId) {
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
                        .setCustomId(`arcadeadmin_racing_award_confirm_${boardId}`)
                        .setLabel('Confirm Award')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_racing_manage_${boardId}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error confirming racing points award:', error);
            return interaction.editReply('An error occurred while preparing the confirmation. Please try again.');
        }
    },

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
                        .setCustomId(`arcadeadmin_racing_announce_results_${boardId}`)
                        .setLabel('Announce Results')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_racing_manage_${boardId}`)
                        .setLabel('Back to Board')
                        .setStyle(ButtonStyle.Secondary)
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

            // Add back button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_racing_manage_${boardId}`)
                        .setLabel('Back to Board')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [responseEmbed],
                components: [row]
            });
        } catch (error) {
            console.error('Error announcing racing results:', error);
            return interaction.editReply('An error occurred while announcing the results.');
        }
    },

    async confirmAwardArcadePoints(interaction) {
        try {
            await interaction.deferUpdate();
            
            // Get current year
            const currentYear = new Date().getFullYear();
            
            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle(`🏆 Confirm Award Arcade Points`)
                .setDescription(
                    `This will trigger the annual arcade points award process for ${currentYear}.\n\n` +
                    `This action can take several minutes to complete.\n\n` +
                    `Are you sure you want to proceed?`
                );

            // Create year buttons
            const yearRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_arcade_award_year_${currentYear}`)
                        .setLabel(`${currentYear} (Current Year)`)
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_arcade_award_year_${currentYear - 1}`)
                        .setLabel(`${currentYear - 1}`)
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`arcadeadmin_arcade_award_year_${currentYear - 2}`)
                        .setLabel(`${currentYear - 2}`)
                        .setStyle(ButtonStyle.Secondary)
                );

            // Add cancel button
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arcadeadmin_back_to_main')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [yearRow, actionRow]
            });
        } catch (error) {
            console.error('Error confirming arcade awards:', error);
            return interaction.editReply('An error occurred while preparing the confirmation. Please try again.');
        }
    },

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

            // Add back button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arcadeadmin_back_to_main')
                        .setLabel('Back to Main Menu')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                content: null,
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error processing arcade awards:', error);
            return interaction.editReply('An error occurred while processing arcade awards. Check the logs for details.');
        }
    },

    // New button handler for all interaction events
    async handleInteraction(interaction) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) {
            return;
        }

        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            try {
                return interaction.reply({
                    content: 'You do not have permission to use this command.',
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error replying to unauthorized user:', error);
                return;
            }
        }

        try {
            // Handle different interaction types
            if (interaction.isButton()) {
                await this.handleButtonInteraction(interaction);
            } else if (interaction.isStringSelectMenu()) {
                await this.handleSelectMenuInteraction(interaction);
            } else if (interaction.isModalSubmit()) {
                await this.handleModalSubmit(interaction);
            }
        } catch (error) {
            console.error('Error handling interaction:', error);
            try {
                const errorContent = 'An error occurred while processing your request. Please try again.';
                
                if (interaction.deferred) {
                    await interaction.editReply({ content: errorContent, components: [] });
                } else if (interaction.replied) {
                    await interaction.followUp({ content: errorContent, ephemeral: true });
                } else {
                    await interaction.reply({ content: errorContent, ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
        }
    },

    async handleButtonInteraction(interaction) {
        const customId = interaction.customId;
        
        // Handle back to main menu
        if (customId === 'arcadeadmin_back_to_main') {
            return this.showMainMenu(interaction);
        }
        
        // Parse button ID
        const parts = customId.split('_');
        
        // Handle different patterns
        if (parts[0] === 'arcadeadmin') {
            const action = parts[2];
            const boardType = parts[1];
            
            if (action === 'list') {
                // Handle list boards
                return this.listBoards(interaction, boardType);
            } else if (action === 'add') {
                // Handle add board
                return this.createAddModal(interaction, boardType);
            } else if (action === 'edit') {
                // Handle edit board
                const boardId = parts[3];
                return this.createEditModal(interaction, boardType, boardId);
            } else if (action === 'announce') {
                // Handle announce board
                const boardId = parts[3];
                return this.announceBoard(interaction, boardType, boardId);
            } else if (action === 'remove') {
                // Handle remove board
                if (parts[3] === 'confirm') {
                    // Confirm remove
                    const boardId = parts[4];
                    return this.processRemoveBoard(interaction, boardType, boardId);
                } else {
                    // Initial remove request
                    const boardId = parts[3];
                    return this.confirmRemoveBoard(interaction, boardType, boardId);
                }
            } else if (action === 'award') {
                // Handle award points
                if (boardType === 'racing') {
                    if (parts[3] === 'confirm') {
                        // Confirm award
                        const boardId = parts[4];
                        return this.processAwardRacingPoints(interaction, boardId);
                    } else if (parts[3] === 'results') {
                        // Announce results
                        const boardId = parts[4];
                        return this.announceRacingResults(interaction, boardId);
                    } else {
                        // Initial award request
                        const boardId = parts[3];
                        return this.confirmAwardRacingPoints(interaction, boardId);
                    }
                } else if (boardType === 'arcade') {
                    // Handle arcade awards
                    if (parts[3] === 'year') {
                        const year = parts[4];
                        return this.processArcadeAwards(interaction, year);
                    } else {
                        return this.confirmAwardArcadePoints(interaction);
                    }
                }
            } else if (action === 'manage') {
                // Handle manage board
                const boardId = parts[3];
                return this.handleBoardManagement(interaction, boardId);
            }
        }
        
        // Handle unexpected button IDs
        await interaction.reply({
            content: 'This button action is not recognized.',
            ephemeral: true
        });
    },

    async handleSelectMenuInteraction(interaction) {
        const customId = interaction.customId;
        const selectedValue = interaction.values[0];
        
        // Parse select menu ID
        const parts = customId.split('_');
        
        if (parts[0] === 'arcadeadmin' && parts[2] === 'select') {
            // Handle board selection
            const boardType = parts[1];
            const boardId = selectedValue;
            
            return this.handleBoardManagement(interaction, boardId);
        }
        
        // Handle unexpected select menu IDs
        await interaction.reply({
            content: 'This selection is not recognized.',
            ephemeral: true
        });
    },

    async handleModalSubmit(interaction) {
        const customId = interaction.customId;
        
        // Parse modal ID
        const parts = customId.split('_');
        
        if (parts[0] === 'arcadeadmin') {
            const boardType = parts[1];
            const action = parts[2];
            
            if (action === 'add' && parts[3] === 'modal') {
                // Handle add board form submission
                if (boardType === 'arcade') {
                    return this.handleArcadeBoardAdd(interaction);
                } else if (boardType === 'racing') {
                    return this.handleRacingBoardAdd(interaction);
                } else if (boardType === 'tiebreaker') {
                    return this.handleTiebreakerBoardAdd(interaction);
                }
            } else if (action === 'edit' && parts[3] === 'modal') {
                // Handle edit board form submission
                const boardId = parts[4];
                return this.handleBoardEdit(interaction, boardType, boardId);
            }
        }
        
        // Handle unexpected modal IDs
        await interaction.reply({
            content: 'This form submission is not recognized.',
            ephemeral: true
        });
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
