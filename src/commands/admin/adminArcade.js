// src/commands/admin/adminArcade.js - Streamlined with DRY principles
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import retroAPI from '../../services/retroAPI.js';
import monthlyTasksService from '../../services/monthlyTasksService.js';
import { config } from '../../config/config.js';
import AlertService from '../../utils/AlertService.js';

// Tiebreaker-Breaker Validation
class TiebreakerBreakerValidation {
    static validateTiebreakerBreakerInput(input) {
        if (!input?.trim()) return { valid: true, data: null };
        
        const parts = input.trim().split(':');
        if (parts.length !== 2) {
            return { valid: false, error: 'Invalid format. Use GameID:LeaderboardID (e.g., 12345:67890)' };
        }
        
        const gameId = parseInt(parts[0]);
        const leaderboardId = parseInt(parts[1]);
        
        if (isNaN(gameId) || isNaN(leaderboardId) || gameId <= 0 || leaderboardId <= 0) {
            return { valid: false, error: 'Both GameID and LeaderboardID must be positive numbers' };
        }
        
        return { valid: true, data: { gameId, leaderboardId } };
    }
    
    static validateNoCircularReference(tiebreakerLeaderboardId, tiebreakerBreakerLeaderboardId) {
        if (tiebreakerLeaderboardId === tiebreakerBreakerLeaderboardId) {
            return { valid: false, error: 'Tiebreaker and tiebreaker-breaker cannot use the same leaderboard' };
        }
        return { valid: true };
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('adminarcade')
        .setDescription('Manage arcade leaderboards')
        .setDefaultMemberPermissions('0')
        .addSubcommand(subcommand =>
            subcommand.setName('manage').setDescription('Manage arcade boards and challenges'))
        .addSubcommand(subcommand =>
            subcommand.setName('list').setDescription('List all boards')
                .addStringOption(option =>
                    option.setName('type').setDescription('Type of board to list').setRequired(true)
                        .addChoices(
                            { name: 'Arcade', value: 'arcade' },
                            { name: 'Racing', value: 'racing' },
                            { name: 'Tiebreaker', value: 'tiebreaker' }
                        )))
        .addSubcommand(subcommand =>
            subcommand.setName('award').setDescription('Award points')
                .addStringOption(option =>
                    option.setName('type').setDescription('Type of award to process').setRequired(true)
                        .addChoices(
                            { name: 'Racing Challenge', value: 'racing' },
                            { name: 'Annual Arcade Points', value: 'arcade' }
                        ))
                .addStringOption(option =>
                    option.setName('identifier').setDescription('Board ID for racing, or year for arcade awards').setRequired(true))),

    // Helper Methods
    helpers: {
        // Permission check
        checkPermission(interaction) {
            if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
                interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                return false;
            }
            return true;
        },

        // Find board with error handling
        async findBoard(boardId, boardType) {
            return await ArcadeBoard.findOne({ boardId, boardType });
        },

        // Get game thumbnail
        async getGameThumbnail(gameId) {
            try {
                const gameInfo = await retroAPI.getGameInfo(gameId);
                return gameInfo?.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null;
            } catch {
                return null;
            }
        },

        // Validate game exists
        async validateGameExists(gameId) {
            const gameInfo = await retroAPI.getGameInfo(gameId);
            return gameInfo ? gameInfo : null;
        },

        // Create modal helper
        createModal(customId, title, inputs) {
            const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
            inputs.forEach(input => {
                modal.addComponents(new ActionRowBuilder().addComponents(input));
            });
            return modal;
        },

        // Create text input helper
        createTextInput(customId, label, style = TextInputStyle.Short, required = true, value = '', placeholder = '') {
            const input = new TextInputBuilder()
                .setCustomId(customId)
                .setLabel(label)
                .setStyle(style)
                .setRequired(required);
            if (value) input.setValue(value);
            if (placeholder) input.setPlaceholder(placeholder);
            return input;
        },

        // Create embed helper
        createEmbed(color, title, description, thumbnail = null, fields = []) {
            const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
            if (thumbnail) embed.setThumbnail(thumbnail);
            if (fields.length) embed.addFields(fields);
            return embed;
        },

        // Create button helper
        createButton(customId, label, style = ButtonStyle.Primary) {
            return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
        },

        // Create action row helper
        createActionRow(components) {
            return new ActionRowBuilder().addComponents(components);
        },

        // Handle errors consistently
        async handleError(interaction, error, message = 'An error occurred') {
            console.error(error);
            const method = interaction.deferred || interaction.replied ? 'editReply' : 'reply';
            return interaction[method]({ content: message, ephemeral: true });
        },

        // Board type helpers
        getBoardConfig(boardType) {
            const configs = {
                arcade: { name: 'Arcade Board', emoji: '🎮', color: '#0099ff' },
                racing: { name: 'Racing Challenge', emoji: '🏎️', color: '#FF9900' },
                tiebreaker: { name: 'Tiebreaker Board', emoji: '⚔️', color: '#FF0000' }
            };
            return configs[boardType] || { name: 'Board', emoji: '', color: '#9B59B6' };
        }
    },

    async execute(interaction) {
        if (!this.helpers.checkPermission(interaction)) return;
        
        AlertService.setClient(interaction.client);
        const subcommand = interaction.options.getSubcommand();
        
        try {
            switch(subcommand) {
                case 'manage':
                    await this.showManagementMenu(interaction);
                    break;
                case 'list':
                    await interaction.deferReply({ ephemeral: true });
                    await this.listBoards(interaction, interaction.options.getString('type'));
                    break;
                case 'award':
                    await interaction.deferReply({ ephemeral: true });
                    const awardType = interaction.options.getString('type');
                    const identifier = interaction.options.getString('identifier');
                    
                    if (awardType === 'racing') {
                        await this.awardRacingPoints(interaction, identifier);
                    } else {
                        await this.triggerArcadeAwards(interaction, identifier);
                    }
                    break;
            }
        } catch (error) {
            await this.helpers.handleError(interaction, error);
        }
    },

    async showManagementMenu(interaction) {
        const embed = this.helpers.createEmbed('#9B59B6', 'Arcade Admin Management', 'Select an action to perform:');
        
        const options = [
            { label: 'Create Arcade Board', description: 'Add a new arcade leaderboard', value: 'create_arcade', emoji: '🎮' },
            { label: 'Edit Arcade Board', description: 'Modify an existing arcade leaderboard', value: 'edit_arcade', emoji: '✏️' },
            { label: 'Remove Arcade Board', description: 'Delete an arcade leaderboard', value: 'remove_arcade', emoji: '🗑️' },
            { label: 'Create Racing Challenge', description: 'Set up a monthly racing challenge', value: 'create_racing', emoji: '🏎️' },
            { label: 'Edit Racing Challenge', description: 'Modify an existing racing challenge', value: 'edit_racing', emoji: '✏️' },
            { label: 'Remove Racing Challenge', description: 'Delete a racing challenge', value: 'remove_racing', emoji: '🗑️' },
            { label: 'Create Tiebreaker', description: 'Set up a tiebreaker board', value: 'create_tiebreaker', emoji: '⚔️' },
            { label: 'Edit Tiebreaker', description: 'Modify an existing tiebreaker', value: 'edit_tiebreaker', emoji: '✏️' },
            { label: 'Remove Tiebreaker', description: 'Delete a tiebreaker board', value: 'remove_tiebreaker', emoji: '🗑️' },
            { label: 'Expire Old Tiebreakers', description: 'Manually expire tiebreakers that have passed their end date', value: 'expire_tiebreakers', emoji: '⏰' },
            { label: 'Cleanup Old Tiebreakers', description: 'Delete very old expired tiebreakers (90+ days)', value: 'cleanup_tiebreakers', emoji: '🗑️' },
            { label: 'Announce Board', description: 'Announce any type of board', value: 'announce', emoji: '📣' }
        ];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('adminarcade_action')
            .setPlaceholder('Select an action')
            .addOptions(options);

        await interaction.reply({
            embeds: [embed],
            components: [this.helpers.createActionRow([selectMenu])],
            ephemeral: true
        });
    },

    // Consolidated Modal Creation
    async showCreateModal(interaction, boardType) {
        const inputs = [];
        
        if (boardType !== 'tiebreaker') {
            if (boardType === 'arcade') {
                inputs.push(this.helpers.createTextInput('board_id', 'Board ID (unique identifier)'));
            }
            inputs.push(this.helpers.createTextInput('leaderboard_id', 'RetroAchievements Leaderboard ID'));
            inputs.push(this.helpers.createTextInput('game_id', 'RetroAchievements Game ID'));
            
            if (boardType === 'racing') {
                inputs.push(this.helpers.createTextInput('track_name', 'Track Name'));
                inputs.push(this.helpers.createTextInput('description', 'Description', TextInputStyle.Paragraph));
                inputs.push(this.helpers.createTextInput('month_year', 'Month & Year (MM-YYYY or blank for current)', TextInputStyle.Short, false, '', 'e.g., 05-2025'));
            } else {
                inputs.push(this.helpers.createTextInput('description', 'Description', TextInputStyle.Paragraph));
            }
        } else {
            inputs.push(
                this.helpers.createTextInput('leaderboard_id', 'RetroAchievements Leaderboard ID'),
                this.helpers.createTextInput('game_id', 'RetroAchievements Game ID'),
                this.helpers.createTextInput('description', 'Description', TextInputStyle.Paragraph),
                this.helpers.createTextInput('end_date', 'End Date (YYYY-MM-DD)'),
                this.helpers.createTextInput('tiebreaker_breaker', '🗡️ Tiebreaker-Breaker (optional)', TextInputStyle.Short, false, '', 'GameID:LeaderboardID')
            );
        }

        const config = this.helpers.getBoardConfig(boardType);
        const modal = this.helpers.createModal(`adminarcade_create_${boardType}_modal`, `Create ${config.name}`, inputs);
        await interaction.showModal(modal);
    },

    // Consolidated Edit Modal
    async showEditModal(interaction, boardType, boardId) {
        const board = await this.helpers.findBoard(boardId, boardType);
        if (!board) {
            return interaction.reply({ content: `${this.helpers.getBoardConfig(boardType).name} not found.`, ephemeral: true });
        }

        const inputs = [this.helpers.createTextInput('leaderboard_id', 'RetroAchievements Leaderboard ID', TextInputStyle.Short, true, board.leaderboardId.toString())];
        
        if (boardType === 'racing') {
            inputs.push(this.helpers.createTextInput('track_name', 'Track Name', TextInputStyle.Short, true, board.trackName || ''));
        }
        
        inputs.push(this.helpers.createTextInput('description', 'Description', TextInputStyle.Paragraph, true, board.description));

        if (boardType === 'tiebreaker') {
            const endDateStr = board.endDate ? 
                `${board.endDate.getFullYear()}-${String(board.endDate.getMonth() + 1).padStart(2, '0')}-${String(board.endDate.getDate()).padStart(2, '0')}` : '';
            
            let tiebreakerBreakerValue = '';
            if (board.hasTiebreakerBreaker()) {
                const tbInfo = board.getTiebreakerBreakerInfo();
                tiebreakerBreakerValue = `${tbInfo.gameId}:${tbInfo.leaderboardId}`;
            }

            inputs.push(
                this.helpers.createTextInput('end_date', 'End Date (YYYY-MM-DD)', TextInputStyle.Short, true, endDateStr),
                this.helpers.createTextInput('tiebreaker_breaker', '🗡️ Tiebreaker-Breaker (optional)', TextInputStyle.Short, false, tiebreakerBreakerValue, 'GameID:LeaderboardID or leave blank')
            );
        }

        const config = this.helpers.getBoardConfig(boardType);
        const modal = this.helpers.createModal(`adminarcade_edit_${boardType}_modal_${boardId}`, `Edit ${config.name}`, inputs);
        await interaction.showModal(modal);
    },

    // Consolidated Create Handler
    async handleCreateModal(interaction, boardType) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const fields = {
                leaderboardId: parseInt(interaction.fields.getTextInputValue('leaderboard_id')),
                gameId: parseInt(interaction.fields.getTextInputValue('game_id')),
                description: interaction.fields.getTextInputValue('description')
            };

            if (boardType === 'arcade') {
                fields.boardId = interaction.fields.getTextInputValue('board_id');
                // Check if board ID already exists
                if (await this.helpers.findBoard(fields.boardId, boardType)) {
                    return interaction.editReply(`A board with ID "${fields.boardId}" already exists.`);
                }
            }

            if (boardType === 'racing') {
                fields.trackName = interaction.fields.getTextInputValue('track_name');
                // Handle month/year logic
                const now = new Date();
                const monthYearInput = interaction.fields.getTextInputValue('month_year');
                if (monthYearInput?.trim()) {
                    const parts = monthYearInput.split('-');
                    if (parts.length !== 2) {
                        return interaction.editReply('Invalid month-year format. Please use MM-YYYY.');
                    }
                    fields.month = parseInt(parts[0]);
                    fields.year = parseInt(parts[1]);
                } else {
                    fields.month = now.getMonth() + 1;
                    fields.year = now.getFullYear();
                }
                fields.monthKey = `${fields.year}-${fields.month.toString().padStart(2, '0')}`;
                fields.boardId = `racing-${fields.monthKey}`;
                
                // Check if racing challenge exists for this month
                if (await ArcadeBoard.findOne({ boardType: 'racing', monthKey: fields.monthKey })) {
                    return interaction.editReply(`A racing challenge already exists for ${fields.monthKey}.`);
                }
            }

            if (boardType === 'tiebreaker') {
                const endDateStr = interaction.fields.getTextInputValue('end_date');
                fields.endDate = new Date(endDateStr);
                if (isNaN(fields.endDate.getTime())) {
                    return interaction.editReply('Invalid end date format. Please use YYYY-MM-DD.');
                }
                fields.endDate.setHours(23, 59, 59);

                // Handle tiebreaker-breaker validation
                const tiebreakerBreakerInput = interaction.fields.getTextInputValue('tiebreaker_breaker');
                const validation = TiebreakerBreakerValidation.validateTiebreakerBreakerInput(tiebreakerBreakerInput);
                if (!validation.valid) {
                    return interaction.editReply(`Tiebreaker-breaker validation error: ${validation.error}`);
                }
                
                if (validation.data) {
                    const circularCheck = TiebreakerBreakerValidation.validateNoCircularReference(fields.leaderboardId, validation.data.leaderboardId);
                    if (!circularCheck.valid) {
                        return interaction.editReply(`Tiebreaker-breaker validation error: ${circularCheck.error}`);
                    }
                    fields.tiebreakerBreakerData = validation.data;
                }

                // Check for active tiebreakers
                const activeTiebreaker = await ArcadeBoard.findOne({
                    boardType: 'tiebreaker',
                    startDate: { $lte: new Date() },
                    endDate: { $gte: new Date() },
                    isActive: true
                });
                if (activeTiebreaker) {
                    return interaction.editReply('An active tiebreaker already exists.');
                }

                const now = new Date();
                fields.monthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
                fields.boardId = `tiebreaker-${fields.monthKey}`;
                fields.startDate = now;
            }

            // Validate game exists
            const gameInfo = await this.helpers.validateGameExists(fields.gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }

            // Create board
            const boardData = {
                boardId: fields.boardId,
                boardType,
                leaderboardId: fields.leaderboardId,
                gameId: fields.gameId,
                gameTitle: boardType === 'racing' ? `${gameInfo.title} (${gameInfo.consoleName})` : gameInfo.title,
                consoleName: gameInfo.consoleName || 'Unknown',
                description: fields.description
            };

            if (fields.trackName) boardData.trackName = fields.trackName;
            if (fields.startDate) boardData.startDate = fields.startDate;
            if (fields.endDate) boardData.endDate = fields.endDate;
            if (fields.monthKey) boardData.monthKey = fields.monthKey;

            const newBoard = new ArcadeBoard(boardData);

            // Handle tiebreaker-breaker
            if (fields.tiebreakerBreakerData) {
                const tbGameInfo = await this.helpers.validateGameExists(fields.tiebreakerBreakerData.gameId);
                if (!tbGameInfo) {
                    return interaction.editReply('Tiebreaker-breaker game not found.');
                }
                newBoard.setTiebreakerBreaker(
                    fields.tiebreakerBreakerData.leaderboardId,
                    fields.tiebreakerBreakerData.gameId,
                    tbGameInfo.title,
                    `Tiebreaker-breaker for ${gameInfo.title}`
                );
            }

            await newBoard.save();

            // Create response
            const config = this.helpers.getBoardConfig(boardType);
            const thumbnail = await this.helpers.getGameThumbnail(fields.gameId);
            
            let title = `${config.name} Created: ${gameInfo.title}`;
            let description = `**Board ID:** ${fields.boardId}\n**Game:** ${gameInfo.title}\n**Description:** ${fields.description}`;
            
            if (fields.trackName) {
                const monthName = new Date(fields.year, fields.month - 1).toLocaleString('default', { month: 'long' });
                title = `${config.name} Created: ${monthName} ${fields.year}`;
                description = `**Game:** ${boardData.gameTitle}\n**Track:** ${fields.trackName}\n**Description:** ${fields.description}`;
            }

            const embed = this.helpers.createEmbed(config.color, title, description, thumbnail);
            const announceButton = this.helpers.createButton(`adminarcade_announce_${boardType}_${fields.boardId}`, 'Announce to Server');

            return interaction.editReply({
                embeds: [embed],
                components: [this.helpers.createActionRow([announceButton])]
            });

        } catch (error) {
            await this.helpers.handleError(interaction, error, 'An error occurred while creating the board.');
        }
    },

    // Consolidated Edit Handler
    async handleEditModal(interaction, boardType, boardId) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const board = await this.helpers.findBoard(boardId, boardType);
            if (!board) {
                return interaction.editReply(`${this.helpers.getBoardConfig(boardType).name} not found.`);
            }

            // Update fields
            board.leaderboardId = parseInt(interaction.fields.getTextInputValue('leaderboard_id'));
            board.description = interaction.fields.getTextInputValue('description');
            
            if (boardType === 'racing') {
                board.trackName = interaction.fields.getTextInputValue('track_name');
            }

            if (boardType === 'tiebreaker') {
                const newEndDateStr = interaction.fields.getTextInputValue('end_date');
                const newEndDate = new Date(newEndDateStr);
                if (isNaN(newEndDate.getTime())) {
                    return interaction.editReply('Invalid end date format. Please use YYYY-MM-DD.');
                }
                newEndDate.setHours(23, 59, 59);
                board.endDate = newEndDate;

                // Handle tiebreaker-breaker updates
                const tiebreakerBreakerInput = interaction.fields.getTextInputValue('tiebreaker_breaker');
                const validation = TiebreakerBreakerValidation.validateTiebreakerBreakerInput(tiebreakerBreakerInput);
                if (!validation.valid) {
                    return interaction.editReply(`Tiebreaker-breaker validation error: ${validation.error}`);
                }

                if (validation.data) {
                    const circularCheck = TiebreakerBreakerValidation.validateNoCircularReference(board.leaderboardId, validation.data.leaderboardId);
                    if (!circularCheck.valid) {
                        return interaction.editReply(`Tiebreaker-breaker validation error: ${circularCheck.error}`);
                    }
                    
                    const tbGameInfo = await this.helpers.validateGameExists(validation.data.gameId);
                    if (!tbGameInfo) {
                        return interaction.editReply('Tiebreaker-breaker game not found.');
                    }
                    
                    board.setTiebreakerBreaker(validation.data.leaderboardId, validation.data.gameId, tbGameInfo.title, `Tiebreaker-breaker for ${board.gameTitle}`);
                } else {
                    board.clearTiebreakerBreaker();
                }
            }

            await board.save();

            // Create response
            const config = this.helpers.getBoardConfig(boardType);
            const embed = this.helpers.createEmbed(config.color, `${config.name} Updated: ${board.gameTitle}`, `Successfully updated ${boardType} board:\n\n**Board ID:** ${boardId}\n**Game:** ${board.gameTitle}`);
            const announceButton = this.helpers.createButton(`adminarcade_announce_${boardType}_${boardId}`, 'Announce Update');

            return interaction.editReply({
                embeds: [embed],
                components: [this.helpers.createActionRow([announceButton])]
            });

        } catch (error) {
            await this.helpers.handleError(interaction, error, 'An error occurred while updating the board.');
        }
    },

    // Announce Board - Streamlined
    async announceBoard(interaction, boardType, boardId, isSelectMenu = false) {
        try {
            if (isSelectMenu) await interaction.deferUpdate();
            else await interaction.deferReply({ ephemeral: true });

            const board = await this.helpers.findBoard(boardId, boardType);
            if (!board) {
                return interaction.editReply(`${this.helpers.getBoardConfig(boardType).name} not found.`);
            }

            const thumbnail = await this.helpers.getGameThumbnail(board.gameId);
            const alertMethods = {
                arcade: 'sendNewArcadeBoardAlert',
                racing: 'sendNewRacingChallengeAlert', 
                tiebreaker: 'sendNewTiebreakerAlert'
            };

            const alertData = {
                gameTitle: board.gameTitle,
                gameId: board.gameId,
                leaderboardTitle: boardType === 'racing' ? board.trackName : board.gameTitle,
                leaderboardId: board.leaderboardId,
                thumbnail
            };

            if (boardType === 'arcade') {
                alertData.title = `🎮 New Arcade Board: ${board.gameTitle}`;
                alertData.description = `A new arcade leaderboard has been added for ${board.gameTitle}!\n\n**Description:** ${board.description}\n\nCheck it out with \`/arcade board id:${board.boardId}\``;
            } else if (boardType === 'racing') {
                const monthName = board.startDate.toLocaleString('default', { month: 'long' });
                const year = board.startDate.getFullYear();
                alertData.title = `🏎️ New Racing Challenge: ${monthName} ${year}`;
                alertData.description = `A new monthly racing challenge has begun for ${board.gameTitle}!\n\n**Track:** ${board.trackName}\n**Description:** ${board.description}\n\nCompete for the fastest time! Check it out with \`/arcade racing\`!`;
                alertData.fields = [{ name: 'Challenge Period', value: `${board.startDate.toLocaleDateString()} to ${board.endDate.toLocaleDateString()}`, inline: true }];
            } else {
                const monthName = board.startDate.toLocaleString('default', { month: 'long' });
                const year = board.startDate.getFullYear();
                alertData.title = `⚔️ Monthly Tiebreaker Challenge: ${monthName} ${year}`;
                alertData.description = `A tiebreaker challenge has been created for this month's competition using ${board.gameTitle}!\n\n**Description:** ${board.description}\n\nThis tiebreaker will be used to resolve ties in the monthly challenge leaderboard. Check it out with \`/arcade tiebreaker\`!`;
                alertData.fields = [{ name: 'Tiebreaker Period', value: `${board.startDate.toLocaleDateString()} to ${board.endDate.toLocaleDateString()}`, inline: false }];
                
                if (board.hasTiebreakerBreaker()) {
                    const tbInfo = board.getTiebreakerBreakerInfo();
                    alertData.fields.push({ name: '🗡️ Tiebreaker-Breaker', value: `**Game:** ${tbInfo.gameTitle}\nIf users are tied in the main tiebreaker, this will resolve the tie.`, inline: false });
                }
            }

            await AlertService[alertMethods[boardType]](alertData);

            const responseEmbed = this.helpers.createEmbed('#00FF00', '✅ Announcement Sent', `Successfully announced ${boardType} board "${board.gameTitle}" with proper game and leaderboard links!`);
            return interaction.editReply({ embeds: [responseEmbed], components: [] });

        } catch (error) {
            await this.helpers.handleError(interaction, error, 'An error occurred while announcing the board.');
        }
    },

    // Simplified interaction handlers
    async handleSelectMenuInteraction(interaction) {
        const customId = interaction.customId;
        const value = interaction.values[0];
        
        try {
            if (customId === 'adminarcade_action') {
                const actionMap = {
                    create_arcade: () => this.showCreateModal(interaction, 'arcade'),
                    create_racing: () => this.showCreateModal(interaction, 'racing'),
                    create_tiebreaker: () => this.showCreateModal(interaction, 'tiebreaker'),
                    edit_arcade: () => this.showSelectBoardMenu(interaction, 'arcade', 'edit'),
                    edit_racing: () => this.showSelectBoardMenu(interaction, 'racing', 'edit'),
                    edit_tiebreaker: () => this.showSelectBoardMenu(interaction, 'tiebreaker', 'edit'),
                    remove_arcade: () => this.showSelectBoardMenu(interaction, 'arcade', 'remove'),
                    remove_racing: () => this.showSelectBoardMenu(interaction, 'racing', 'remove'),
                    remove_tiebreaker: () => this.showSelectBoardMenu(interaction, 'tiebreaker', 'remove'),
                    expire_tiebreakers: () => this.handleExpireTiebreakers(interaction),
                    cleanup_tiebreakers: () => this.handleCleanupTiebreakers(interaction),
                    announce: () => this.showAnnounceBoardMenu(interaction)
                };
                await actionMap[value]?.();
            } else if (customId === 'adminarcade_announce_type') {
                await this.handleAnnounceTypeSelect(interaction);
            } else if (customId.startsWith('adminarcade_announce_board_')) {
                const boardType = customId.split('_').pop();
                await this.announceBoard(interaction, boardType, value, true);
            } else if (customId.includes('_edit')) {
                const boardType = customId.split('_')[1];
                await this.showEditModal(interaction, boardType, value);
            } else if (customId.includes('_remove')) {
                const boardType = customId.split('_')[1];
                await this.confirmRemoveBoard(interaction, boardType, value);
            }
        } catch (error) {
            await this.helpers.handleError(interaction, error);
        }
    },

    async handleModalSubmit(interaction) {
        const customId = interaction.customId;
        
        try {
            if (customId.includes('_create_')) {
                const boardType = customId.split('_')[2];
                await this.handleCreateModal(interaction, boardType);
            } else if (customId.includes('_edit_')) {
                const parts = customId.split('_');
                const boardType = parts[2];
                const boardId = parts.slice(4).join('_');
                await this.handleEditModal(interaction, boardType, boardId);
            }
        } catch (error) {
            await this.helpers.handleError(interaction, error);
        }
    },

    async handleButtonInteraction(interaction) {
        const customId = interaction.customId;
        
        try {
            if (customId.startsWith('adminarcade_announce_')) {
                const parts = customId.split('_');
                if (parts[2] === 'results') {
                    await this.announceRacingResults(interaction, parts[4]);
                } else {
                    await this.announceBoard(interaction, parts[2], parts[3], true);
                }
            } else if (customId.includes('_confirm_')) {
                const parts = customId.split('_');
                if (parts[2] === 'racing') {
                    await this.processAwardRacingPoints(interaction, parts.pop());
                } else if (parts[1] === 'cleanup') {
                    await this.processCleanupTiebreakers(interaction);
                } else {
                    await this.processRemoveBoard(interaction, parts[3], parts[4]);
                }
            } else if (customId.includes('_cancel')) {
                await interaction.update({ content: 'Action cancelled.', embeds: [], components: [] });
            }
        } catch (error) {
            await this.helpers.handleError(interaction, error);
        }
    },

    // Remaining methods streamlined with helper usage...
    async showSelectBoardMenu(interaction, boardType, action) {
        await interaction.deferUpdate();
        const boards = await ArcadeBoard.find({ boardType }).sort({ createdAt: -1 });
        
        if (boards.length === 0) {
            return interaction.editReply(`No ${boardType} boards found.`);
        }

        const options = boards.slice(0, 25).map(board => ({
            label: (board.trackName ? `${board.gameTitle} - ${board.trackName}` : board.gameTitle).substring(0, 100),
            value: board.boardId,
            description: `ID: ${board.boardId.substring(0, 100)}`
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`adminarcade_${boardType}_${action}`)
            .setPlaceholder(`Select a ${boardType} board`)
            .addOptions(options);

        await interaction.editReply({
            content: `Select a ${boardType} board to ${action}:`,
            components: [this.helpers.createActionRow([selectMenu])]
        });
    },

    async showAnnounceBoardMenu(interaction) {
        await interaction.deferUpdate();
        
        const options = [
            { label: 'Arcade Board', value: 'arcade', emoji: '🎮' },
            { label: 'Racing Challenge', value: 'racing', emoji: '🏎️' },
            { label: 'Tiebreaker Board', value: 'tiebreaker', emoji: '⚔️' }
        ];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('adminarcade_announce_type')
            .setPlaceholder('Select board type')
            .addOptions(options);

        await interaction.editReply({
            content: 'Select the type of board to announce:',
            components: [this.helpers.createActionRow([selectMenu])]
        });
    },

    async handleAnnounceTypeSelect(interaction) {
        await interaction.deferUpdate();
        const boardType = interaction.values[0];
        const boards = await ArcadeBoard.find({ boardType }).sort({ createdAt: -1 });
        
        if (boards.length === 0) {
            return interaction.editReply(`No ${boardType} boards found.`);
        }

        const options = boards.slice(0, 25).map(board => ({
            label: (board.trackName ? `${board.gameTitle} - ${board.trackName}` : board.gameTitle).substring(0, 100),
            value: board.boardId,
            description: `ID: ${board.boardId.substring(0, 100)}`
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`adminarcade_announce_board_${boardType}`)
            .setPlaceholder(`Select a ${boardType} board`)
            .addOptions(options);

        await interaction.editReply({
            content: `Select a ${boardType} board to announce:`,
            components: [this.helpers.createActionRow([selectMenu])]
        });
    },

    async listBoards(interaction, boardType) {
        const boards = await ArcadeBoard.find({ boardType }).sort({ createdAt: -1 });
        if (boards.length === 0) {
            return interaction.editReply(`No ${boardType} boards found.`);
        }

        const config = this.helpers.getBoardConfig(boardType);
        const boardsToShow = boards.slice(0, 25);
        
        const description = boardsToShow.map(board => {
            let text = `**${board.gameTitle}**`;
            if (board.trackName) text += ` - ${board.trackName}`;
            text += `\nID: \`${board.boardId}\``;
            
            if (board.startDate && board.endDate) {
                text += `\nPeriod: ${board.startDate.toLocaleDateString()} to ${board.endDate.toLocaleDateString()}`;
            }
            
            if (boardType === 'tiebreaker') {
                const status = board.isActive === false ? '🔴 Expired' : 
                             (board.endDate && board.endDate < new Date()) ? '⚠️ Should Expire' : '🟢 Active';
                text += `\nStatus: ${status}`;
                
                if (board.hasTiebreakerBreaker()) {
                    const tbInfo = board.getTiebreakerBreakerInfo();
                    text += `\n🗡️ TB-Breaker: ${tbInfo.gameTitle}`;
                }
            }
            
            return text;
        }).join('\n\n');

        const embed = this.helpers.createEmbed(config.color, `${config.emoji} ${config.name} List`, description);
        if (boards.length > 25) {
            embed.setFooter({ text: `Showing 25/${boards.length} boards` });
        }

        return interaction.editReply({ embeds: [embed] });
    },

    async confirmRemoveBoard(interaction, boardType, boardId) {
        await interaction.deferUpdate();
        const board = await this.helpers.findBoard(boardId, boardType);
        if (!board) {
            return interaction.editReply(`${this.helpers.getBoardConfig(boardType).name} not found.`);
        }

        const boardTitle = board.trackName ? `${board.gameTitle} - ${board.trackName}` : board.gameTitle;
        const embed = this.helpers.createEmbed('#FF0000', '⚠️ Confirm Removal', 
            `Are you sure you want to remove this ${boardType} board?\n\n**Game:** ${boardTitle}\n**Board ID:** ${boardId}\n\nThis action cannot be undone.`);

        const buttons = [
            this.helpers.createButton(`adminarcade_remove_confirm_${boardType}_${boardId}`, 'Confirm Removal', ButtonStyle.Danger),
            this.helpers.createButton(`adminarcade_remove_cancel_${boardType}_${boardId}`, 'Cancel', ButtonStyle.Secondary)
        ];

        return interaction.editReply({
            embeds: [embed],
            components: [this.helpers.createActionRow(buttons)]
        });
    },

    async processRemoveBoard(interaction, boardType, boardId) {
        await interaction.deferUpdate();
        const board = await this.helpers.findBoard(boardId, boardType);
        if (!board) {
            return interaction.editReply(`${this.helpers.getBoardConfig(boardType).name} not found.`);
        }

        const boardTitle = board.gameTitle + (board.trackName ? ` - ${board.trackName}` : '');
        await ArcadeBoard.deleteOne({ boardId, boardType });

        const embed = this.helpers.createEmbed('#00FF00', `✅ ${this.helpers.getBoardConfig(boardType).name} Removed`, 
            `Successfully removed ${boardType} board:\n\n**${boardTitle}**`);

        await interaction.editReply({ embeds: [embed], components: [] });
    },

    async handleExpireTiebreakers(interaction) {
        await interaction.deferUpdate();
        const result = await monthlyTasksService.expireOldTiebreakers();
        
        const embed = this.helpers.createEmbed(
            result.success ? '#00FF00' : '#FF0000',
            result.success ? '⏰ Tiebreaker Expiration Complete' : '❌ Expiration Failed',
            result.message
        );

        if (result.success && result.expired.length > 0) {
            embed.addFields({ 
                name: 'Expired Tiebreakers', 
                value: result.expired.map(tb => `• ${tb.gameTitle} (${tb.monthKey})`).join('\n')
            });
        }

        return interaction.editReply({ embeds: [embed], components: [] });
    },

    async handleCleanupTiebreakers(interaction) {
        await interaction.deferUpdate();
        
        const embed = this.helpers.createEmbed('#FF9900', '⚠️ Confirm Cleanup', 
            'This will permanently delete all tiebreakers that are older than 90 days.\n\n**This action cannot be undone.**\n\nAre you sure you want to proceed?');

        const buttons = [
            this.helpers.createButton('adminarcade_cleanup_confirm', 'Confirm Cleanup', ButtonStyle.Danger),
            this.helpers.createButton('adminarcade_cleanup_cancel', 'Cancel', ButtonStyle.Secondary)
        ];

        return interaction.editReply({
            embeds: [embed],
            components: [this.helpers.createActionRow(buttons)]
        });
    },

    async processCleanupTiebreakers(interaction) {
        await interaction.deferUpdate();
        const result = await monthlyTasksService.cleanupOldTiebreakers(90);
        
        const embed = this.helpers.createEmbed('#00FF00', '🗑️ Cleanup Complete', `Successfully deleted ${result.count} old tiebreaker(s).`);

        if (result.count > 0) {
            embed.addFields({
                name: 'Deleted Tiebreakers',
                value: result.tiebreakers.slice(0, 10).join(', ') + (result.count > 10 ? '...' : '')
            });
        }

        return interaction.editReply({ embeds: [embed], components: [] });
    },

    async awardRacingPoints(interaction, boardId) {
        const racingBoard = await this.helpers.findBoard(boardId, 'racing');
        if (!racingBoard) {
            return interaction.editReply(`Racing board with ID "${boardId}" not found.`);
        }

        if (racingBoard.pointsAwarded) {
            return interaction.editReply('Points have already been awarded for this racing challenge.');
        }

        if (racingBoard.endDate > new Date()) {
            return interaction.editReply(`This racing challenge hasn't ended yet. It ends on ${racingBoard.endDate.toLocaleDateString()}.`);
        }

        const embed = this.helpers.createEmbed('#FF9900', '🏆 Confirm Award Points', 
            `Are you sure you want to award points for this racing challenge?\n\n**Game:** ${racingBoard.gameTitle}\n**Track:** ${racingBoard.trackName}\n\nPoints will be awarded to the top 3 players.`);

        const buttons = [
            this.helpers.createButton(`adminarcade_award_confirm_racing_${boardId}`, 'Confirm Award'),
            this.helpers.createButton('adminarcade_award_cancel_racing', 'Cancel', ButtonStyle.Secondary)
        ];

        return interaction.editReply({
            embeds: [embed],
            components: [this.helpers.createActionRow(buttons)]
        });
    },

    async processAwardRacingPoints(interaction, boardId) {
        await interaction.deferUpdate();
        const racingBoard = await this.helpers.findBoard(boardId, 'racing');
        if (!racingBoard || racingBoard.pointsAwarded) {
            return interaction.editReply('Racing board not found or points already awarded.');
        }

        const allEntries = await retroAPI.getLeaderboardEntries(racingBoard.leaderboardId, 0, 1000);
        if (!allEntries?.length) {
            return interaction.editReply('No leaderboard entries found.');
        }

        const { User } = await import('../../models/User.js');
        const users = await User.find({ isActive: true });
        const registeredUsers = new Map(users.map(user => [user.raUsername.toLowerCase(), user]));
        const filteredEntries = allEntries.filter(entry => entry.User && registeredUsers.has(entry.User.toLowerCase()));

        if (!filteredEntries.length) {
            return interaction.editReply('No registered users found in the leaderboard.');
        }

        const results = [];
        const pointsDistribution = [3, 2, 1];
        
        for (let i = 0; i < Math.min(3, filteredEntries.length); i++) {
            const entry = filteredEntries[i];
            const userObj = registeredUsers.get(entry.User.toLowerCase());
            const points = pointsDistribution[i];
            const placement = ['1st', '2nd', '3rd'][i];
            
            const monthName = racingBoard.startDate.toLocaleString('default', { month: 'long' });
            const year = racingBoard.startDate.getFullYear();
            const trackDisplay = racingBoard.trackName ? ` - ${racingBoard.trackName}` : '';
            
            userObj.communityAwards.push({
                title: `${placement} Place in ${monthName} ${year} Racing: ${racingBoard.gameTitle}${trackDisplay}`,
                points,
                awardedAt: new Date(),
                awardedBy: interaction.user.tag
            });
            
            await userObj.save();
            results.push({ username: entry.User, rank: i + 1, time: entry.TrackTime, points });
        }
        
        racingBoard.pointsAwarded = true;
        racingBoard.results = results;
        await racingBoard.save();
        
        const embed = this.helpers.createEmbed('#00FF00', '🏆 Racing Points Awarded', 
            `Successfully awarded points for ${racingBoard.gameTitle}${racingBoard.trackName ? ` - ${racingBoard.trackName}` : ''} racing challenge!`);

        embed.addFields({
            name: 'Results',
            value: results.map(r => `${r.rank}. **${r.username}** (${r.time}): ${r.points} point${r.points !== 1 ? 's' : ''}`).join('\n')
        });

        const announceButton = this.helpers.createButton(`adminarcade_announce_results_racing_${boardId}`, 'Announce Results');
        
        return interaction.editReply({
            embeds: [embed],
            components: [this.helpers.createActionRow([announceButton])]
        });
    },

    async announceRacingResults(interaction, boardId) {
        await interaction.deferUpdate();
        const board = await this.helpers.findBoard(boardId, 'racing');
        if (!board?.pointsAwarded || !board.results?.length) {
            return interaction.editReply('No awarded results to announce.');
        }

        const thumbnail = await this.helpers.getGameThumbnail(board.gameId);
        const monthName = board.startDate.toLocaleString('default', { month: 'long' });
        const year = board.startDate.getFullYear();

        const resultsText = board.results.map(result => {
            const emoji = ['🥇', '🥈', '🥉'][result.rank - 1];
            return `${emoji} **${result.username}** (${result.time}): ${result.points} point${result.points !== 1 ? 's' : ''}`;
        }).join('\n');

        const description = `The results are in for the ${monthName} ${year} racing challenge on ${board.gameTitle}!\n\n**Track:** ${board.trackName}\n\n**Results:**\n${resultsText}`;

        await AlertService.sendAnnouncementAlert({
            alertType: 'new_racing_challenge',
            title: `🏆 Racing Challenge Results: ${monthName} ${year}`,
            description,
            gameTitle: board.gameTitle,
            gameId: board.gameId,
            leaderboardTitle: board.trackName,
            leaderboardId: board.leaderboardId,
            thumbnail
        });

        const responseEmbed = this.helpers.createEmbed('#00FF00', '✅ Results Announced', 'Successfully announced the racing results with proper game and leaderboard links!');
        return interaction.editReply({ embeds: [responseEmbed], components: [] });
    },

    async triggerArcadeAwards(interaction, yearStr) {
        const year = parseInt(yearStr);
        if (isNaN(year)) {
            return interaction.editReply('Invalid year format. Please provide a valid year.');
        }
        
        const embed = this.helpers.createEmbed('#FF9900', '🏆 Confirm Award Arcade Points', 
            `This will trigger the annual arcade points award process for ${year}.\n\nThis action can take several minutes to complete.\n\nAre you sure you want to proceed?`);

        const buttons = [
            this.helpers.createButton(`adminarcade_award_arcade_confirm_${year}`, 'Confirm'),
            this.helpers.createButton('adminarcade_award_arcade_cancel', 'Cancel', ButtonStyle.Secondary)
        ];

        return interaction.editReply({
            embeds: [embed],
            components: [this.helpers.createActionRow(buttons)]
        });
    },

    async processArcadeAwards(interaction, year) {
        await interaction.deferUpdate();
        await interaction.editReply({
            content: `Triggering arcade awards process for ${year}... This may take a few minutes.`,
            embeds: [], components: []
        });
        
        try {
            const arcadeService = (await import('../../services/arcadeService.js')).default;
            if (!arcadeService.client) arcadeService.setClient(interaction.client);
            await arcadeService.awardArcadePoints(parseInt(year));
            
            const embed = this.helpers.createEmbed('#00FF00', '✅ Arcade Awards Complete', `Arcade awards process for ${year} completed successfully!`);
            return interaction.editReply({ content: null, embeds: [embed], components: [] });
        } catch (error) {
            await this.helpers.handleError(interaction, error, 'An error occurred while processing arcade awards.');
        }
    }
};
