import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arcadeadmin')
        .setDescription('Manage arcade leaderboards')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new arcade board')
                .addStringOption(option =>
                    option.setName('board_id')
                        .setDescription('Unique identifier for this board')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of board')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Arcade', value: 'arcade' },
                            { name: 'Racing', value: 'racing' },
                            { name: 'Tiebreaker', value: 'tiebreaker' }
                        ))
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
                .setName('remove')
                .setDescription('Remove an arcade board')
                .addStringOption(option =>
                    option.setName('board_id')
                        .setDescription('ID of the board to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('racing')
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
                .setName('tiebreaker')
                .setDescription('Create a tiebreaker leaderboard for the monthly challenge')
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
                .setName('award')
                .setDescription('Manually award points for completed racing challenge')
                .addStringOption(option =>
                    option.setName('board_id')
                        .setDescription('ID of the racing board')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('announce')
                .setDescription('Announce an existing racing or arcade board')
                .addStringOption(option =>
                    option.setName('board_id')
                        .setDescription('ID of the board to announce')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('awardarcade')
                .setDescription('Manually trigger the annual arcade points award process')
                .addIntegerOption(option =>
                    option.setName('year')
                        .setDescription('Year to award points for (defaults to current year)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Remove an arcade or racing board')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of board to clear')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Arcade Board', value: 'arcade' },
                            { name: 'Racing Challenge', value: 'racing' }
                        ))
                .addStringOption(option =>
                    option.setName('identifier')
                        .setDescription('Board ID or month (YYYY-MM or month name) for racing')
                        .setRequired(true))),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();
            
            switch(subcommand) {
                case 'add':
                    await this.addArcadeBoard(interaction);
                    break;
                case 'remove':
                    await this.removeArcadeBoard(interaction);
                    break;
                case 'racing':
                    await this.createRacingChallenge(interaction);
                    break;
                case 'tiebreaker':
                    await this.createTiebreaker(interaction);
                    break;
                case 'award':
                    await this.awardRacingPoints(interaction);
                    break;
                case 'announce':
                    await this.announceBoard(interaction);
                    break;
                case 'awardarcade':
                    await this.triggerArcadeAwards(interaction);
                    break;
                case 'clear':
                    await this.clearBoard(interaction);
                    break;
                default:
                    await interaction.editReply('Invalid subcommand');
            }
        } catch (error) {
            console.error('Error executing arcade admin command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },

    async addArcadeBoard(interaction) {
        const boardId = interaction.options.getString('board_id');
        const boardType = interaction.options.getString('type');
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
                boardType,
                leaderboardId,
                gameId,
                gameTitle: gameInfo.title,
                consoleName: gameInfo.consoleName || 'Unknown',
                description
            });

            await newBoard.save();

            return interaction.editReply(`Successfully added "${gameInfo.title}" arcade board with ID: ${boardId}`);
        } catch (error) {
            console.error('Error adding arcade board:', error);
            return interaction.editReply('An error occurred while adding the arcade board. Please try again.');
        }
    },

    async removeArcadeBoard(interaction) {
        const boardId = interaction.options.getString('board_id');

        // Find and remove the board
        const board = await ArcadeBoard.findOne({ boardId });
        if (!board) {
            return interaction.editReply(`Board with ID "${boardId}" not found.`);
        }

        await ArcadeBoard.deleteOne({ boardId });
        return interaction.editReply(`Successfully removed arcade board: ${board.gameTitle} (${boardId})`);
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
            
            // Add buttons to the response message
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`announce_racing_${boardId}`)
                        .setLabel('Announce to Server')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`view_racing_${boardId}`)
                        .setLabel('View Leaderboard')
                        .setStyle(ButtonStyle.Secondary)
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
                `This tiebreaker will be used to resolve ties in the ${monthName} monthly challenge leaderboard. ` +
                `Any users who are tied in achievement count in the top 3 positions will be ranked based on their performance in this tiebreaker.`
            );

        if (gameInfo.imageIcon) {
            embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
        }
        
        // Add buttons to the response message
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`announce_tiebreaker_${boardId}`)
                    .setLabel('Announce to Server')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`view_tiebreaker_${boardId}`)
                    .setLabel('View Leaderboard')
                    .setStyle(ButtonStyle.Secondary)
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
            
            // Create response message
            let responseMessage = `Successfully awarded points for ${racingBoard.gameTitle}${racingBoard.trackName ? ` - ${racingBoard.trackName}` : ''} racing challenge!\n\n`;
            
            results.forEach(result => {
                responseMessage += `${result.rank}. ${result.username} (${result.time}): ${result.points} point${result.points !== 1 ? 's' : ''}\n`;
            });
            
            return interaction.editReply(responseMessage);
        } catch (error) {
            console.error('Error awarding racing points:', error);
            return interaction.editReply('An error occurred while awarding points. Please try again.');
        }
    },

    async announceBoard(interaction) {
        const boardId = interaction.options.getString('board_id');

        try {
            // Find the board
            const board = await ArcadeBoard.findOne({ boardId });
            if (!board) {
                return interaction.editReply(`Board with ID "${boardId}" not found.`);
            }

            // Import arcadeService
            const arcadeService = (await import('../../services/arcadeService.js')).default;
            
            // Set client if needed
            if (!arcadeService.client) {
                arcadeService.setClient(interaction.client);
            }
            
            // Different announcement based on board type
            if (board.boardType === 'racing') {
                await arcadeService.announceNewRacingChallenge(board);
                return interaction.editReply(`Racing challenge "${board.gameTitle}${board.trackName ? ` - ${board.trackName}` : ''}" has been announced!`);
            } else if (board.boardType === 'arcade') {
                // Get the announcement channel
                const channel = await this.getAnnouncementChannel(interaction.client);
                if (!channel) {
                    return interaction.editReply('Announcement channel not found.');
                }
                
                // Get game info
                const gameInfo = await retroAPI.getGameInfo(board.gameId);
                
                // Create an announcement embed
                const embed = new EmbedBuilder()
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
                
                await channel.send({ embeds: [embed] });
                return interaction.editReply(`Arcade board "${board.gameTitle}" has been announced!`);
            } else {
                return interaction.editReply(`Cannot announce board of type "${board.boardType}".`);
            }
        } catch (error) {
            console.error('Error announcing board:', error);
            return interaction.editReply('An error occurred while announcing the board. Please try again.');
        }
    },

    async triggerArcadeAwards(interaction) {
        try {
            await interaction.editReply('Triggering arcade awards process... This may take a few minutes.');
            
            // Import arcadeService
            const arcadeService = (await import('../../services/arcadeService.js')).default;
            
            // Set client if needed
            if (!arcadeService.client) {
                arcadeService.setClient(interaction.client);
            }
            
            // Run the arcade points award process
            await arcadeService.awardArcadePoints();
            
            return interaction.editReply('Arcade awards process completed successfully!');
        } catch (error) {
            console.error('Error triggering arcade awards:', error);
            return interaction.editReply('An error occurred while processing arcade awards. Check the logs for details.');
        }
    },
    
    async clearBoard(interaction) {
        const boardType = interaction.options.getString('type');
        const identifier = interaction.options.getString('identifier');

        try {
            let board = null;

            if (boardType === 'arcade') {
                // For arcade boards, the identifier is directly the board ID
                board = await ArcadeBoard.findOne({ 
                    boardId: identifier,
                    boardType: 'arcade'
                });

                if (!board) {
                    return interaction.editReply(`Arcade board with ID "${identifier}" not found.`);
                }
            } else if (boardType === 'racing') {
                // For racing boards, the identifier could be a month name or YYYY-MM format
                if (/^\d{4}-\d{2}$/.test(identifier)) {
                    // YYYY-MM format
                    board = await ArcadeBoard.findOne({
                        boardType: 'racing',
                        monthKey: identifier
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
                        return interaction.editReply(`Invalid month format. Please use a month name (e.g., "january") or YYYY-MM format (e.g., "2025-01").`);
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

                        if (!board) {
                            return interaction.editReply(`No racing challenge found for ${identifier}.`);
                        }
                    }
                }

                if (!board) {
                    return interaction.editReply(`Racing challenge with identifier "${identifier}" not found.`);
                }
            }

            // Confirm to delete the board
            const boardTitle = board.trackName 
                ? `${board.gameTitle} - ${board.trackName}`
                : board.gameTitle;
                
            await ArcadeBoard.deleteOne({ _id: board._id });
            
            return interaction.editReply(`Successfully removed ${boardType} board: ${boardTitle}`);
        } catch (error) {
            console.error(`Error clearing ${boardType} board:`, error);
            return interaction.editReply(`An error occurred while removing the ${boardType} board. Please try again.`);
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

    async fetchLeaderboardEntries(leaderboardId) {
        try {
            return await retroAPI.getLeaderboardEntries(leaderboardId, 0, 1000);
        } catch (error) {
            console.error('Error fetching leaderboard entries:', error);
            throw error;
        }
    }
};
