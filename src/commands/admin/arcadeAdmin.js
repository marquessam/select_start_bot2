import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arcadeadmin')
        .setDescription('Manage arcade leaderboards')
        .addSubcommandGroup(group =>
            group
                .setName('arcade')
                .setDescription('Manage arcade boards')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List all arcade boards'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add a new arcade board')
                        .addStringOption(option =>
                            option.setName('board_id')
                                .setDescription('Unique identifier for this board')
                                .setRequired(true))
                        .addIntegerOption(option =>
                            option.setName('leaderboard_id')
                                .setDescription('RetroAchievements leaderboard ID')
                                .setRequired(true))
                        .addIntegerOption(option =>
                            option.setName('game_id')
                                .setDescription('RetroAchievements game ID')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('description')
                                .setDescription('Description of the leaderboard')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('edit')
                        .setDescription('Edit an existing arcade board')
                        .addStringOption(option =>
                            option.setName('board_id')
                                .setDescription('ID of the board to edit')
                                .setRequired(true))
                        .addIntegerOption(option =>
                            option.setName('leaderboard_id')
                                .setDescription('New RetroAchievements leaderboard ID'))
                        .addStringOption(option =>
                            option.setName('description')
                                .setDescription('New description of the leaderboard')))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove an arcade board')
                        .addStringOption(option =>
                            option.setName('board_id')
                                .setDescription('ID of the board to remove')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('announce')
                        .setDescription('Announce an arcade board')
                        .addStringOption(option =>
                            option.setName('board_id')
                                .setDescription('ID of the board to announce')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('award')
                        .setDescription('Manually trigger the annual arcade points award process')
                        .addIntegerOption(option =>
                            option.setName('year')
                                .setDescription('Year to award points for (defaults to current year)')
                                .setRequired(false))))
        
        // Racing board management
        .addSubcommandGroup(group =>
            group
                .setName('racing')
                .setDescription('Manage racing challenges')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List all racing challenges'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Set up a monthly racing challenge')
                        .addIntegerOption(option =>
                            option.setName('leaderboard_id')
                                .setDescription('RetroAchievements leaderboard ID')
                                .setRequired(true))
                        .addIntegerOption(option =>
                            option.setName('game_id')
                                .setDescription('RetroAchievements game ID')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('track_name')
                                .setDescription('Name of the track (e.g., "Mario Circuit")')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('description')
                                .setDescription('Description of the racing challenge')
                                .setRequired(true))
                        .addIntegerOption(option =>
                            option.setName('year')
                                .setDescription('Year (defaults to current year)')
                                .setMinValue(2000)
                                .setMaxValue(2100))
                        .addIntegerOption(option =>
                            option.setName('month')
                                .setDescription('Month (1-12, defaults to current month)')
                                .setMinValue(1)
                                .setMaxValue(12)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('edit')
                        .setDescription('Edit an existing racing challenge')
                        .addStringOption(option =>
                            option.setName('board_id')
                                .setDescription('ID of the racing board to edit')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('track_name')
                                .setDescription('New name of the track'))
                        .addStringOption(option =>
                            option.setName('description')
                                .setDescription('New description of the racing challenge'))
                        .addIntegerOption(option =>
                            option.setName('leaderboard_id')
                                .setDescription('New RetroAchievements leaderboard ID')))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove a racing challenge')
                        .addStringOption(option =>
                            option.setName('identifier')
                                .setDescription('Board ID or month (YYYY-MM or month name)')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('announce')
                        .setDescription('Announce a racing challenge')
                        .addStringOption(option =>
                            option.setName('board_id')
                                .setDescription('ID of the racing board to announce')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('award')
                        .setDescription('Manually award points for completed racing challenge')
                        .addStringOption(option =>
                            option.setName('board_id')
                                .setDescription('ID of the racing board')
                                .setRequired(true))))
        
        // Tiebreaker board management
        .addSubcommandGroup(group =>
            group
                .setName('tiebreaker')
                .setDescription('Manage tiebreaker boards')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List all tiebreaker boards'))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Create a tiebreaker leaderboard')
                        .addIntegerOption(option =>
                            option.setName('leaderboard_id')
                                .setDescription('RetroAchievements leaderboard ID')
                                .setRequired(true))
                        .addIntegerOption(option =>
                            option.setName('game_id')
                                .setDescription('RetroAchievements game ID')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('description')
                                .setDescription('Description of the tiebreaker')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('end_date')
                                .setDescription('End date (YYYY-MM-DD)')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('edit')
                        .setDescription('Edit an existing tiebreaker board')
                        .addStringOption(option =>
                            option.setName('board_id')
                                .setDescription('ID of the tiebreaker board to edit')
                                .setRequired(true))
                        .addIntegerOption(option =>
                            option.setName('leaderboard_id')
                                .setDescription('New RetroAchievements leaderboard ID'))
                        .addStringOption(option =>
                            option.setName('description')
                                .setDescription('New description of the tiebreaker'))
                        .addStringOption(option =>
                            option.setName('end_date')
                                .setDescription('New end date (YYYY-MM-DD)')))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove a tiebreaker board')
                        .addStringOption(option =>
                            option.setName('board_id')
                                .setDescription('ID of the tiebreaker board to remove')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('announce')
                        .setDescription('Announce a tiebreaker board')
                        .addStringOption(option =>
                            option.setName('board_id')
                                .setDescription('ID of the tiebreaker board to announce')
                                .setRequired(true)))),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const group = interaction.options.getSubcommandGroup();
            const subcommand = interaction.options.getSubcommand();
            
            switch(group) {
                case 'arcade':
                    await this.handleArcadeCommands(interaction, subcommand);
                    break;
                case 'racing':
                    await this.handleRacingCommands(interaction, subcommand);
                    break;
                case 'tiebreaker':
                    await this.handleTiebreakerCommands(interaction, subcommand);
                    break;
                default:
                    await interaction.editReply('Invalid command group');
            }
        } catch (error) {
            console.error('Error executing arcade admin command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },

    async handleArcadeCommands(interaction, subcommand) {
        switch(subcommand) {
            case 'list':
                await this.listBoards(interaction, 'arcade');
                break;
            case 'add':
                await this.addArcadeBoard(interaction);
                break;
            case 'edit':
                await this.editArcadeBoard(interaction);
                break;
            case 'remove':
                await this.removeArcadeBoard(interaction);
                break;
            case 'announce':
                await this.announceBoard(interaction, 'arcade');
                break;
            case 'award':
                await this.triggerArcadeAwards(interaction);
                break;
            default:
                await interaction.editReply('Invalid arcade subcommand');
        }
    },

    async handleRacingCommands(interaction, subcommand) {
        switch(subcommand) {
            case 'list':
                await this.listBoards(interaction, 'racing');
                break;
            case 'add':
                await this.createRacingChallenge(interaction);
                break;
            case 'edit':
                await this.editRacingBoard(interaction);
                break;
            case 'remove':
                await this.removeRacingBoard(interaction);
                break;
            case 'announce':
                await this.announceBoard(interaction, 'racing');
                break;
            case 'award':
                await this.awardRacingPoints(interaction);
                break;
            default:
                await interaction.editReply('Invalid racing subcommand');
        }
    },

    async handleTiebreakerCommands(interaction, subcommand) {
        switch(subcommand) {
            case 'list':
                await this.listBoards(interaction, 'tiebreaker');
                break;
            case 'add':
                await this.createTiebreaker(interaction);
                break;
            case 'edit':
                await this.editTiebreakerBoard(interaction);
                break;
            case 'remove':
                await this.removeTiebreakerBoard(interaction);
                break;
            case 'announce':
                await this.announceBoard(interaction, 'tiebreaker');
                break;
            default:
                await interaction.editReply('Invalid tiebreaker subcommand');
        }
    },

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

    async addArcadeBoard(interaction) {
        const boardId = interaction.options.getString('board_id');
        const leaderboardId = interaction.options.getInteger('leaderboard_id');
        const gameId = interaction.options.getInteger('game_id');
        const description = interaction.options.getString('description');

        // Check if board ID already exists
        const existingBoard = await ArcadeBoard.findOne({ boardId });
        if (existingBoard) {
            return interaction.editReply(`A board with ID "${boardId}" already exists.`);
        }

        // Validate game exists
        try {
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
                    `**Description:** ${description}\n\n` +
                    `You can announce this board with \`/arcadeadmin arcade announce board_id:${boardId}\``
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
            console.error('Error adding arcade board:', error);
            return interaction.editReply('An error occurred while adding the arcade board. Please try again.');
        }
    },

    async editArcadeBoard(interaction) {
        const boardId = interaction.options.getString('board_id');
        const newLeaderboardId = interaction.options.getInteger('leaderboard_id');
        const newDescription = interaction.options.getString('description');

        // Find the board
        const board = await ArcadeBoard.findOne({ 
            boardId,
            boardType: 'arcade'
        });

        if (!board) {
            return interaction.editReply(`Arcade board with ID "${boardId}" not found.`);
        }

        // Check if any updates were provided
        if (!newLeaderboardId && !newDescription) {
            return interaction.editReply('Please provide at least one field to update.');
        }

        // Update the board
        if (newLeaderboardId) {
            board.leaderboardId = newLeaderboardId;
        }
        
        if (newDescription) {
            board.description = newDescription;
        }

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
        
        if (newDescription) {
            embed.addFields({ name: 'New Description', value: newDescription });
        }
        
        if (newLeaderboardId) {
            embed.addFields({ name: 'New Leaderboard ID', value: newLeaderboardId.toString() });
        }

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
    },

    async removeArcadeBoard(interaction) {
        const boardId = interaction.options.getString('board_id');

        // Find and remove the board
        const board = await ArcadeBoard.findOne({ 
            boardId,
            boardType: 'arcade'
        });
        
        if (!board) {
            return interaction.editReply(`Arcade board with ID "${boardId}" not found.`);
        }

        // Create confirmation embed
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`⚠️ Confirm Removal`)
            .setDescription(
                `Are you sure you want to remove this arcade board?\n\n` +
                `**Game:** ${board.gameTitle}\n` +
                `**Board ID:** ${boardId}\n\n` +
                `This action cannot be undone.`
            );

        // Add confirmation buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`remove_confirm_arcade_${boardId}`)
                    .setLabel('Confirm Removal')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`remove_cancel_arcade_${boardId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        return interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    },

    async createRacingChallenge(interaction) {
        const leaderboardId = interaction.options.getInteger('leaderboard_id');
        const gameId = interaction.options.getInteger('game_id');
        const trackName = interaction.options.getString('track_name');
        const description = interaction.options.getString('description');
        
        // Get year and month (defaults to current)
        const now = new Date();
        const year = interaction.options.getInteger('year') || now.getFullYear();
        const month = interaction.options.getInteger('month') || (now.getMonth() + 1);

        // Validate game exists
        try {
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }

            // Calculate start and end dates
            // Start at beginning of specified month
            const startDate = new Date(year, month - 1, 1);
            
            // End at the end of the specified month (23:59:59 on the last day)
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

            // Generate a unique board ID specifically for racing
            // This format ensures no overlap with regular arcade boards
            const boardId = `racing-${monthKey}`;

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
                monthKey
            });

            await newBoard.save();

            // Get month name for response
            const monthName = startDate.toLocaleString('default', { month: 'long' });

            // Create an embed for the response
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
            return interaction.editReply('An error occurred while creating the racing challenge. Please try again.');
        }
    },

    async editRacingBoard(interaction) {
        const boardId = interaction.options.getString('board_id');
        const newTrackName = interaction.options.getString('track_name');
        const newDescription = interaction.options.getString('description');
        const newLeaderboardId = interaction.options.getInteger('leaderboard_id');

        // Find the racing board
        const board = await ArcadeBoard.findOne({ 
            boardId,
            boardType: 'racing'
        });

        if (!board) {
            return interaction.editReply(`Racing board with ID "${boardId}" not found.`);
        }

        // Check if any updates were provided
        if (!newTrackName && !newDescription && !newLeaderboardId) {
            return interaction.editReply('Please provide at least one field to update.');
        }

        // Update the racing board
        if (newTrackName) {
            board.trackName = newTrackName;
        }
        
        if (newDescription) {
            board.description = newDescription;
        }
        
        if (newLeaderboardId) {
            board.leaderboardId = newLeaderboardId;
        }

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
            
        if (newTrackName) {
            embed.addFields({ name: 'New Track Name', value: newTrackName });
        }
        
        if (newDescription) {
            embed.addFields({ name: 'New Description', value: newDescription });
        }
        
        if (newLeaderboardId) {
            embed.addFields({ name: 'New Leaderboard ID', value: newLeaderboardId.toString() });
        }

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
    },

    async removeRacingBoard(interaction) {
        const identifier = interaction.options.getString('identifier');

        try {
            let board = null;

            // For racing boards, the identifier could be a month name or YYYY-MM format
            if (/^\d{4}-\d{2}$/.test(identifier)) {
                // YYYY-MM format
                board = await ArcadeBoard.findOne({
                    boardType: 'racing',
                    monthKey: identifier
                });
            } else if (identifier.startsWith('racing-')) {
                // Direct board ID
                board = await ArcadeBoard.findOne({
                    boardId: identifier,
                    boardType: 'racing'
                });
            } else {
                // Try to parse as a month name
                const monthNames = [
                    'january', 'february', 'march', 'april', 'may', 'june',
                    'july', 'august', 'september', 'october', 'november', 'december'
                ];
                
                const monthIndex = monthNames.findIndex(m => 
                    m.toLowerCase() === identifier.toLowerCase()
                );
                
                if (monthIndex === -1) {
                    return interaction.editReply(`Invalid identifier format. Please use a month name (e.g., "january"), YYYY-MM format (e.g., "2025-01"), or the full board ID.`);
                }
                
                // Current year by default
                const now = new Date();
                const year = now.getFullYear();
                
                // Look for any racing board with this month and current year
                const monthKey = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}`;
                
                board = await ArcadeBoard.findOne({
                    boardType: 'racing',
                    monthKey: monthKey
                });
                
                // If not found, check previous year
                if (!board) {
                    const prevYearMonthKey = `${year - 1}-${(monthIndex + 1).toString().padStart(2, '0')}`;
                    board = await ArcadeBoard.findOne({
                        boardType: 'racing',
                        monthKey: prevYearMonthKey
                    });
                }
            }

            if (!board) {
                return interaction.editReply(`Racing challenge with identifier "${identifier}" not found.`);
            }

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`⚠️ Confirm Removal`)
                .setDescription(
                    `Are you sure you want to remove this racing challenge?\n\n` +
                    `**Game:** ${board.gameTitle}\n` +
                    `**Track:** ${board.trackName}\n` +
                    `**Board ID:** ${board.boardId}\n\n` +
                    `This action cannot be undone.`
                );

            // Add confirmation buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`remove_confirm_racing_${board.boardId}`)
                        .setLabel('Confirm Removal')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`remove_cancel_racing_${board.boardId}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            console.error('Error removing racing board:', error);
            return interaction.editReply('An error occurred while removing the racing board. Please try again.');
        }
    },

    async createTiebreaker(interaction) {
        const leaderboardId = interaction.options.getInteger('leaderboard_id');
        const gameId = interaction.options.getInteger('game_id');
        const description = interaction.options.getString('description');
        const endDateStr = interaction.options.getString('end_date');

        try {
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
                // Add monthKey for consistency with racing challenges
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
            return interaction.editReply('An error occurred while creating the tiebreaker. Please try again.');
        }
    },

    async editTiebreakerBoard(interaction) {
        const boardId = interaction.options.getString('board_id');
        const newLeaderboardId = interaction.options.getInteger('leaderboard_id');
        const newDescription = interaction.options.getString('description');
        const newEndDateStr = interaction.options.getString('end_date');

        // Find the tiebreaker board
        const board = await ArcadeBoard.findOne({ 
            boardId,
            boardType: 'tiebreaker'
        });

        if (!board) {
            return interaction.editReply(`Tiebreaker board with ID "${boardId}" not found.`);
        }

        // Check if any updates were provided
        if (!newLeaderboardId && !newDescription && !newEndDateStr) {
            return interaction.editReply('Please provide at least one field to update.');
        }

        // Update the tiebreaker board
        if (newLeaderboardId) {
            board.leaderboardId = newLeaderboardId;
        }
        
        if (newDescription) {
            board.description = newDescription;
        }
        
        if (newEndDateStr) {
            const newEndDate = new Date(newEndDateStr);
            if (isNaN(newEndDate.getTime())) {
                return interaction.editReply('Invalid end date format. Please use YYYY-MM-DD.');
            }
            
            // Set end time to 23:59:59
            newEndDate.setHours(23, 59, 59);
            board.endDate = newEndDate;
        }

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
            
        if (newDescription) {
            embed.addFields({ name: 'New Description', value: newDescription });
        }
        
        if (newLeaderboardId) {
            embed.addFields({ name: 'New Leaderboard ID', value: newLeaderboardId.toString() });
        }
        
        if (newEndDateStr) {
            embed.addFields({ name: 'New End Date', value: newEndDateStr });
        }

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
    },

    async removeTiebreakerBoard(interaction) {
        const boardId = interaction.options.getString('board_id');

        // Find the tiebreaker board
        const board = await ArcadeBoard.findOne({ 
            boardId,
            boardType: 'tiebreaker'
        });

        if (!board) {
            return interaction.editReply(`Tiebreaker board with ID "${boardId}" not found.`);
        }

        // Create confirmation embed
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`⚠️ Confirm Removal`)
            .setDescription(
                `Are you sure you want to remove this tiebreaker board?\n\n` +
                `**Game:** ${board.gameTitle}\n` +
                `**Board ID:** ${boardId}\n\n` +
                `This action cannot be undone.`
            );

        // Add confirmation buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`remove_confirm_tiebreaker_${boardId}`)
                    .setLabel('Confirm Removal')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`remove_cancel_tiebreaker_${boardId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        return interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    },

    async awardRacingPoints(interaction) {
        const boardId = interaction.options.getString('board_id');

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
                        .setCustomId(`award_cancel_racing_${boardId}`)
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

    async triggerArcadeAwards(interaction) {
        const year = interaction.options.getInteger('year');
        
        // Create confirmation embed
        const currentYear = new Date().getFullYear();
        const awardYear = year || currentYear;
        
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle(`🏆 Confirm Award Arcade Points`)
            .setDescription(
                `This will trigger the annual arcade points award process for ${awardYear}.\n\n` +
                `This action can take several minutes to complete.\n\n` +
                `Are you sure you want to proceed?`
            );

        // Create confirmation buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`award_arcade_confirm_${awardYear}`)
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

    async announceBoard(interaction, boardType, isButton = false) {
        let boardId;
        
        if (isButton) {
            boardId = interaction.customId.split('_')[2];
            await interaction.deferUpdate();
        } else {
            boardId = interaction.options.getString('board_id');
        }

        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ 
                boardId,
                boardType
            });
            
            if (!board) {
                const response = `${this.getBoardTypeName(boardType)} with ID "${boardId}" not found.`;
                return isButton ? interaction.editReply(response) : interaction.editReply(response);
            }

            // Get the announcement and arcade channels
            const announcementChannel = await this.getAnnouncementChannel(interaction.client);
            const arcadeChannel = await this.getArcadeChannel(interaction.client);
            
            if (!announcementChannel) {
                const response = 'Announcement channel not found.';
                return isButton ? interaction.editReply(response) : interaction.editReply(response);
            }
            
            if (!arcadeChannel) {
                const response = 'Arcade channel not found.';
                return isButton ? interaction.editReply(response) : interaction.editReply(response);
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
                const response = `Cannot announce board of type "${boardType}".`;
                return isButton ? interaction.editReply(response) : interaction.editReply(response);
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

            if (isButton) {
                return interaction.editReply({
                    embeds: [responseEmbed],
                    components: []
                });
            } else {
                return interaction.editReply({
                    embeds: [responseEmbed]
                });
            }
        } catch (error) {
            console.error(`Error announcing ${boardType}:`, error);
            const response = 'An error occurred while announcing the board.';
            return isButton ? interaction.editReply(response) : interaction.editReply(response);
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

            return interaction.editReply({
                embeds: [responseEmbed],
                components: []
            });
        } catch (error) {
            console.error('Error announcing racing results:', error);
            return interaction.editReply('An error occurred while announcing the results.');
        }
    },

    async handleButtonInteraction(interaction) {
        try {
            const customId = interaction.customId;
            
            // Parse the button ID to get the action, type, and board ID
            const parts = customId.split('_');
            const action = parts[0];
            const boardType = parts[1];
            const boardId = parts[2];

            // Handle different button actions
            switch (action) {
                case 'announce':
                    await this.announceBoard(interaction, boardType, true);
                    break;
                case 'announce':
                    if (boardType === 'results' && parts[1] === 'racing') {
                        await this.announceRacingResults(interaction, boardId);
                    } else {
                        await this.announceBoard(interaction, boardType, true);
                    }
                    break;
                case 'remove':
                    if (parts[1] === 'confirm') {
                        await this.processRemoveBoard(interaction, parts[2], parts[3]);
                    } else if (parts[1] === 'cancel') {
                        await interaction.update({
                            content: 'Removal cancelled.',
                            embeds: [],
                            components: []
                        });
                    }
                    break;
                case 'award':
                    if (parts[1] === 'confirm') {
                        if (parts[2] === 'racing') {
                            await this.processAwardRacingPoints(interaction, parts[3]);
                        } else if (parts[2] === 'arcade') {
                            await this.processArcadeAwards(interaction, parts[3]);
                        }
                    } else if (parts[1] === 'cancel') {
                        await interaction.update({
                            content: 'Award process cancelled.',
                            embeds: [],
                            components: []
                        });
                    } else if (parts[1] === 'arcade') {
                        if (parts[2] === 'confirm') {
                            await this.processArcadeAwards(interaction, parts[3]);
                        } else if (parts[2] === 'cancel') {
                            await interaction.update({
                                content: 'Award process cancelled.',
                                embeds: [],
                                components: []
                            });
                        }
                    }
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown button action.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error handling button interaction:', error);
            try {
                if (interaction.deferred) {
                    await interaction.editReply('An error occurred while processing your request.');
                } else {
                    await interaction.reply({
                        content: 'An error occurred while processing your request.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
        }
    },

    async processRemoveBoard(interaction, boardType, boardId) {
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

            await interaction.update({
                embeds: [embed],
                components: []
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
