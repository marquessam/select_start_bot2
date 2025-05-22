import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminchallenge')
        .setDescription('Manage monthly and shadow challenges')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new monthly challenge')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('shadow')
                .setDescription('Add or edit a shadow challenge')
                .addIntegerOption(option =>
                    option.setName('month')
                    .setDescription('Month (1-12, defaults to current month)')
                    .setMinValue(1)
                    .setMaxValue(12)
                    .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('year')
                    .setDescription('Year (defaults to current year)')
                    .setMinValue(2000)
                    .setMaxValue(2100)
                    .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle shadow challenge visibility')
                .addIntegerOption(option =>
                    option.setName('month')
                    .setDescription('Month (1-12, defaults to current month)')
                    .setMinValue(1)
                    .setMaxValue(12)
                    .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('year')
                    .setDescription('Year (defaults to current year)')
                    .setMinValue(2000)
                    .setMaxValue(2100)
                    .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View challenge details')
                .addIntegerOption(option =>
                    option.setName('month')
                    .setDescription('Month (1-12, defaults to current month)')
                    .setMinValue(1)
                    .setMaxValue(12)
                    .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('year')
                    .setDescription('Year (defaults to current year)')
                    .setMinValue(2000)
                    .setMaxValue(2100)
                    .setRequired(false))
        ),

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
            // Get the subcommand
            const subcommand = interaction.options.getSubcommand();
            
            // Process based on subcommand
            switch (subcommand) {
                case 'create':
                    await this.handleCreateChallenge(interaction);
                    break;
                case 'shadow':
                    await this.handleShadowChallenge(interaction);
                    break;
                case 'toggle':
                    await this.handleToggleShadow(interaction);
                    break;
                case 'view':
                    await this.handleViewChallenge(interaction);
                    break;
                default:
                    await interaction.editReply('Invalid subcommand.');
            }
        } catch (error) {
            console.error('Error executing admin challenge command:', error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },

    /**
     * Handle creating a monthly challenge
     */
async handleCreateChallenge(interaction) {
    // Create modal for challenge creation
    const modal = new ModalBuilder()
        .setCustomId('create_challenge_modal')
        .setTitle('Create Monthly Challenge');

    // Add game ID input
    const gameIdInput = new TextInputBuilder()
        .setCustomId('game_id')
        .setLabel('Game ID (from RetroAchievements)')
        .setPlaceholder('Example: 14402')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    // Add month input
    const monthInput = new TextInputBuilder()
        .setCustomId('month')
        .setLabel('Month (1-12)')
        .setPlaceholder('Example: 5 (for May)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    // Add year input
    const yearInput = new TextInputBuilder()
        .setCustomId('year')
        .setLabel('Year')
        .setPlaceholder('Example: 2025')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    // UPDATED: Make progression achievements optional with better description
    const progressionInput = new TextInputBuilder()
        .setCustomId('progression_achievements')
        .setLabel('Progression Achievement IDs (optional)')
        .setPlaceholder('Optional: 123456, 123457 (leave blank to use official RA awards)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false); // CHANGED: Now optional

    // UPDATED: Make win achievements optional with better description
    const winInput = new TextInputBuilder()
        .setCustomId('win_achievements')
        .setLabel('Win Achievement IDs (optional)')
        .setPlaceholder('Optional: 123459, 123460 (leave blank to use official RA awards)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false); // Already optional, but keeping consistent

    // Add inputs to modal
    const gameIdRow = new ActionRowBuilder().addComponents(gameIdInput);
    const monthRow = new ActionRowBuilder().addComponents(monthInput);
    const yearRow = new ActionRowBuilder().addComponents(yearInput);
    const progressionRow = new ActionRowBuilder().addComponents(progressionInput);
    const winRow = new ActionRowBuilder().addComponents(winInput);

    modal.addComponents(gameIdRow, monthRow, yearRow, progressionRow, winRow);

    // Show the modal
    await interaction.showModal(modal);

    try {
        // Wait for modal submission
        const modalSubmission = await interaction.awaitModalSubmit({
            time: 300000 // 5 minutes to fill out the form
        });

        await modalSubmission.deferUpdate();

        // Extract values from the modal
        const gameId = modalSubmission.fields.getTextInputValue('game_id');
        const month = parseInt(modalSubmission.fields.getTextInputValue('month'));
        const year = parseInt(modalSubmission.fields.getTextInputValue('year'));
        const progressionAchievementsInput = modalSubmission.fields.getTextInputValue('progression_achievements');
        const winAchievementsInput = modalSubmission.fields.getTextInputValue('win_achievements');

        // Validate inputs
        if (isNaN(month) || month < 1 || month > 12) {
            return modalSubmission.editReply('Invalid month. Please provide a number between 1 and 12.');
        }

        if (isNaN(year) || year < 2000 || year > 2100) {
            return modalSubmission.editReply('Invalid year. Please provide a valid year.');
        }

        // UPDATED: Parse progression and win achievements (now optional)
        const progressionAchievements = progressionAchievementsInput ? 
            progressionAchievementsInput.split(',').map(id => id.trim()).filter(id => id) : [];
        const winAchievements = winAchievementsInput ? 
            winAchievementsInput.split(',').map(id => id.trim()).filter(id => id) : [];
        
        // UPDATED: No longer require progression achievements
        // The system will use official RA awards if no manual IDs are provided

        try {
            // Get game info to validate game exists
            const gameInfo = await retroAPI.getGameInfoExtended(gameId);
            if (!gameInfo) {
                return modalSubmission.editReply('Game not found. Please check the game ID.');
            }
            
            // Get game achievements to get the total count
            const achievements = gameInfo.achievements;
            if (!achievements) {
                return modalSubmission.editReply('Could not retrieve achievements for this game. Please try again.');
            }
            
            const totalAchievements = Object.keys(achievements).length;

            // Create date for the first of the specified month
            const challengeDate = new Date(year, month - 1, 1);

            // Check if a challenge already exists for this month
            const existingChallenge = await Challenge.findOneAndDelete({
                date: {
                    $gte: challengeDate,
                    $lt: new Date(year, month, 1)
                }
            });

            // Create new challenge
            const challenge = new Challenge({
                date: challengeDate,
                monthly_challange_gameid: gameId,
                monthly_challange_progression_achievements: progressionAchievements,
                monthly_challange_win_achievements: winAchievements,
                monthly_challange_game_total: totalAchievements,
                shadow_challange_revealed: false
            });

            await challenge.save();

            // Get month name for display
            const monthNames = ["January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December"];
            const monthName = monthNames[month - 1];

            // UPDATED: Create response message with award system info
            let responseMessage = '';
            const awardSystemInfo = progressionAchievements.length > 0 ? 
                `Manual award criteria (${progressionAchievements.length} progression, ${winAchievements.length} win)` :
                `Official RetroAchievements awards (automatic detection)`;

            if (existingChallenge) {
                responseMessage = `Monthly challenge replaced for ${monthName} ${year}!\n\n` +
                    `**New Game:** ${gameInfo.title}\n` +
                    `**Previous Game:** ${existingChallenge.monthly_challange_gameid}\n` +
                    `**Award System:** ${awardSystemInfo}\n` +
                    `**Total Game Achievements:** ${totalAchievements}`;
            } else {
                responseMessage = `Monthly challenge created for ${monthName} ${year}!\n\n` +
                    `**Game:** ${gameInfo.title}\n` +
                    `**Award System:** ${awardSystemInfo}\n` +
                    `**Total Game Achievements:** ${totalAchievements}`;
            }

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor(existingChallenge ? '#FFA500' : '#00FF00') // Orange if replaced, Green if new
                .setTitle(`${existingChallenge ? 'Challenge Replaced' : 'Challenge Created'}: ${monthName} ${year}`)
                .setDescription(responseMessage)
                .setTimestamp();

            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Add action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('add_shadow')
                        .setLabel('Add Shadow Challenge')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('view_challenge')
                        .setLabel('View Details')
                        .setStyle(ButtonStyle.Secondary)
                );

            await modalSubmission.editReply({
                embeds: [embed],
                components: [actionRow]
            });

            // ... rest of the method remains the same
        } catch (apiError) {
            console.error('Error creating challenge:', apiError);
            return modalSubmission.editReply('An error occurred while creating the challenge. Please try again.');
        }

    } catch (modalError) {
        console.error('Error handling modal submission:', modalError);
        // Modal timed out or was cancelled, no need to respond
    }
},

    /**
     * Handle adding or editing a shadow challenge
     */
    async handleShadowChallenge(interaction, prefilledOptions = null) {
        // Get month and year from options or prefilled values
        let month, year;
        
        if (prefilledOptions && prefilledOptions.month && prefilledOptions.year) {
            month = prefilledOptions.month;
            year = prefilledOptions.year;
        } else {
            month = interaction.options.getInteger('month');
            year = interaction.options.getInteger('year');
            
            // Use current month/year if not specified
            if (!month || !year) {
                const now = new Date();
                month = month || now.getMonth() + 1; // Month is 0-indexed in JS
                year = year || now.getFullYear();
            }
        }

        // Create modal for shadow challenge
        const modal = new ModalBuilder()
            .setCustomId('shadow_challenge_modal')
            .setTitle(`Shadow Challenge: ${month}/${year}`);

        // Add game ID input
        const gameIdInput = new TextInputBuilder()
            .setCustomId('game_id')
            .setLabel('Game ID (from RetroAchievements)')
            .setPlaceholder('Example: 14402')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        // Add progression achievements input
        const progressionInput = new TextInputBuilder()
            .setCustomId('progression_achievements')
            .setLabel('Progression Achievement IDs (comma-separated)')
            .setPlaceholder('Example: 123456, 123457, 123458')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        // Add win achievements input
        const winInput = new TextInputBuilder()
            .setCustomId('win_achievements')
            .setLabel('Win Achievement IDs (comma-separated, optional)')
            .setPlaceholder('Example: 123459, 123460')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        // Add inputs to modal
        const gameIdRow = new ActionRowBuilder().addComponents(gameIdInput);
        const progressionRow = new ActionRowBuilder().addComponents(progressionInput);
        const winRow = new ActionRowBuilder().addComponents(winInput);

        modal.addComponents(gameIdRow, progressionRow, winRow);

        // Show the modal
        await interaction.showModal(modal);

        try {
            // Wait for modal submission
            const modalSubmission = await interaction.awaitModalSubmit({
                time: 300000 // 5 minutes to fill out the form
            });

            await modalSubmission.deferUpdate();

            // Extract values from the modal
            const gameId = modalSubmission.fields.getTextInputValue('game_id');
            const progressionAchievementsInput = modalSubmission.fields.getTextInputValue('progression_achievements');
            const winAchievementsInput = modalSubmission.fields.getTextInputValue('win_achievements');

            // Parse progression and win achievements
            const progressionAchievements = progressionAchievementsInput.split(',').map(id => id.trim()).filter(id => id);
            const winAchievements = winAchievementsInput ? winAchievementsInput.split(',').map(id => id.trim()).filter(id => id) : [];
            
            if (progressionAchievements.length === 0) {
                return modalSubmission.editReply('Please provide at least one progression achievement ID.');
            }

            try {
                // Get date range for the specified month
                const monthStart = new Date(year, month - 1, 1);
                const nextMonthStart = new Date(year, month, 1);

                // Find the target challenge
                const targetChallenge = await Challenge.findOne({
                    date: {
                        $gte: monthStart,
                        $lt: nextMonthStart
                    }
                });

                if (!targetChallenge) {
                    return modalSubmission.editReply(`No challenge exists for ${month}/${year}. Create a monthly challenge first using /adminchallenge create.`);
                }

                // Get game info to validate game exists
                const gameInfo = await retroAPI.getGameInfoExtended(gameId);
                if (!gameInfo) {
                    return modalSubmission.editReply('Game not found. Please check the game ID.');
                }
                
                // Get game achievements to get the total count
                const achievements = gameInfo.achievements;
                if (!achievements) {
                    return modalSubmission.editReply('Could not retrieve achievements for this game. Please try again.');
                }
                
                const totalAchievements = Object.keys(achievements).length;

                // Check if there's an existing shadow game to be replaced
                let replacedShadowGame = null;
                if (targetChallenge.shadow_challange_gameid) {
                    try {
                        const oldGameInfo = await retroAPI.getGameInfo(targetChallenge.shadow_challange_gameid);
                        replacedShadowGame = oldGameInfo.title;
                    } catch (error) {
                        console.error('Error fetching old shadow game info:', error);
                        replacedShadowGame = targetChallenge.shadow_challange_gameid;
                    }
                }

                // Update the challenge with shadow game information
                targetChallenge.shadow_challange_gameid = gameId;
                targetChallenge.shadow_challange_progression_achievements = progressionAchievements;
                targetChallenge.shadow_challange_win_achievements = winAchievements;
                targetChallenge.shadow_challange_game_total = totalAchievements;
                
                // Automatically reveal shadow games for past months
                const now = new Date();
                if (month < now.getMonth() + 1 || year < now.getFullYear()) {
                    targetChallenge.shadow_challange_revealed = true;
                } else if (!targetChallenge.shadow_challange_revealed) {
                    // For current or future months, keep shadow games hidden by default
                    targetChallenge.shadow_challange_revealed = false;
                }

                await targetChallenge.save();

                // Get month name for display
                const monthNames = ["January", "February", "March", "April", "May", "June",
                                "July", "August", "September", "October", "November", "December"];
                const monthName = monthNames[month - 1];

                // Determine if it was auto-revealed
                const autoRevealed = (month < now.getMonth() + 1 || year < now.getFullYear());
                
                // Create response message
                let responseMessage = '';
                if (replacedShadowGame) {
                    responseMessage = `Shadow challenge for ${monthName} ${year} replaced!\n\n` +
                        `**New Game:** ${gameInfo.title}\n` +
                        `**Previous Game:** ${replacedShadowGame}\n` +
                        `**Required Progression Achievements:** ${progressionAchievements.length}\n` +
                        `**Required Win Achievements:** ${winAchievements.length}\n` +
                        `**Total Game Achievements:** ${totalAchievements}\n` +
                        `**Visibility:** ${targetChallenge.shadow_challange_revealed ? 'Revealed' : 'Hidden'}` +
                        (autoRevealed ? ' (Auto-revealed as past challenge)' : '');
                } else {
                    responseMessage = `Shadow challenge for ${monthName} ${year} created!\n\n` +
                        `**Game:** ${gameInfo.title}\n` +
                        `**Required Progression Achievements:** ${progressionAchievements.length}\n` +
                        `**Required Win Achievements:** ${winAchievements.length}\n` +
                        `**Total Game Achievements:** ${totalAchievements}\n` +
                        `**Visibility:** ${targetChallenge.shadow_challange_revealed ? 'Revealed' : 'Hidden'}` +
                        (autoRevealed ? ' (Auto-revealed as past challenge)' : '');
                }

                // Create response embed
                const embed = new EmbedBuilder()
                    .setColor('#9932CC') // Dark purple for shadow
                    .setTitle(`${replacedShadowGame ? 'Shadow Challenge Replaced' : 'Shadow Challenge Created'}: ${monthName} ${year}`)
                    .setDescription(responseMessage)
                    .setTimestamp();

                if (gameInfo.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }

                // Add action buttons
                const actionRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('toggle_shadow')
                            .setLabel(targetChallenge.shadow_challange_revealed ? 'Hide Shadow Challenge' : 'Reveal Shadow Challenge')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('view_challenge')
                            .setLabel('View Details')
                            .setStyle(ButtonStyle.Secondary)
                    );

                await modalSubmission.editReply({
                    embeds: [embed],
                    components: [actionRow]
                });

                // Set up collector for the action buttons
                const message = await modalSubmission.fetchReply();
                const collector = message.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 300000 // 5 minutes timeout
                });

                collector.on('collect', async i => {
                    if (i.user.id === interaction.user.id) {
                        await i.deferUpdate();

                        if (i.customId === 'toggle_shadow') {
                            // Toggle the shadow visibility
                            const options = { month, year };
                            await this.handleToggleShadow(i, options);
                        } else if (i.customId === 'view_challenge') {
                            // View challenge details
                            const options = { month, year };
                            await this.handleViewChallenge(i, options);
                        }
                    }
                });

            } catch (apiError) {
                console.error('Error adding shadow challenge:', apiError);
                return modalSubmission.editReply('An error occurred while adding the shadow challenge. Please try again.');
            }

        } catch (modalError) {
            console.error('Error handling modal submission:', modalError);
            // Modal timed out or was cancelled, no need to respond
        }
    },

    /**
     * Handle toggling shadow challenge visibility
     */
    async handleToggleShadow(interaction, options = null) {
        // Get month and year from options or interaction
        let month, year;
        
        if (options && options.month && options.year) {
            month = options.month;
            year = options.year;
        } else {
            month = interaction.options.getInteger('month');
            year = interaction.options.getInteger('year');
            
            // Use current month/year if not specified
            if (!month || !year) {
                const now = new Date();
                month = month || now.getMonth() + 1; // Month is 0-indexed in JS
                year = year || now.getFullYear();
            }
        }

        try {
            // Get date range for the specified month
            const monthStart = new Date(year, month - 1, 1);
            const nextMonthStart = new Date(year, month, 1);

            // Find the target challenge
            const targetChallenge = await Challenge.findOne({
                date: {
                    $gte: monthStart,
                    $lt: nextMonthStart
                }
            });

            if (!targetChallenge) {
                return interaction.editReply(`No challenge exists for ${month}/${year}.`);
            }

            if (!targetChallenge.shadow_challange_gameid) {
                return interaction.editReply(`No shadow challenge has been set for ${month}/${year}.`);
            }

            // Toggle the visibility
            targetChallenge.shadow_challange_revealed = !targetChallenge.shadow_challange_revealed;
            await targetChallenge.save();

            // Get game info for the response
            const gameInfo = await retroAPI.getGameInfo(targetChallenge.shadow_challange_gameid);
            
            // Get month name for display
            const monthNames = ["January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December"];
            const monthName = monthNames[month - 1];
            
            // Create response message
            const responseMessage = targetChallenge.shadow_challange_revealed
                ? `Shadow challenge for ${monthName} ${year} is now **REVEALED**!\n\n` +
                  `**Game:** ${gameInfo.title}\n` +
                  `**Required Progression Achievements:** ${targetChallenge.shadow_challange_progression_achievements.length}\n` +
                  `**Required Win Achievements:** ${targetChallenge.shadow_challange_win_achievements.length || 0}\n` +
                  `**Total Game Achievements:** ${targetChallenge.shadow_challange_game_total}`
                : `Shadow challenge for ${monthName} ${year} is now **HIDDEN**.`;

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor(targetChallenge.shadow_challange_revealed ? '#00FF00' : '#FFA500') // Green if revealed, Orange if hidden
                .setTitle(`Shadow Challenge ${targetChallenge.shadow_challange_revealed ? 'Revealed' : 'Hidden'}: ${monthName} ${year}`)
                .setDescription(responseMessage)
                .setTimestamp();

            if (targetChallenge.shadow_challange_revealed && gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Add action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('toggle_shadow_again')
                        .setLabel(targetChallenge.shadow_challange_revealed ? 'Hide Shadow Challenge' : 'Reveal Shadow Challenge')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('view_challenge')
                        .setLabel('View Details')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });

            // Set up collector for the action buttons
            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes timeout
            });

            collector.on('collect', async i => {
                if (i.user.id === interaction.user.id) {
                    await i.deferUpdate();

                    if (i.customId === 'toggle_shadow_again') {
                        // Toggle the shadow visibility again
                        const newOptions = { month, year };
                        await this.handleToggleShadow(i, newOptions);
                    } else if (i.customId === 'view_challenge') {
                        // View challenge details
                        const newOptions = { month, year };
                        await this.handleViewChallenge(i, newOptions);
                    }
                }
            });
        } catch (error) {
            console.error('Error toggling shadow challenge visibility:', error);
            await interaction.editReply('An error occurred while toggling the shadow challenge visibility. Please try again.');
        }
    },

    /**
     * Handle viewing challenge details
     */
    async handleViewChallenge(interaction, options = null) {
        // Get month and year from options or interaction
        let month, year;
        
        if (options && options.month && options.year) {
            month = options.month;
            year = options.year;
        } else {
            month = interaction.options.getInteger('month');
            year = interaction.options.getInteger('year');
            
            // Use current month/year if not specified
            if (!month || !year) {
                const now = new Date();
                month = month || now.getMonth() + 1; // Month is 0-indexed in JS
                year = year || now.getFullYear();
            }
        }

        try {
            // Get date range for the specified month
            const monthStart = new Date(year, month - 1, 1);
            const nextMonthStart = new Date(year, month, 1);

            // Find the challenge
            const challenge = await Challenge.findOne({
                date: {
                    $gte: monthStart,
                    $lt: nextMonthStart
                }
            });

            if (!challenge) {
                return interaction.editReply(`No challenge exists for ${month}/${year}.`);
            }

            // Get month name for display
            const monthNames = ["January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December"];
            const monthName = monthNames[month - 1];

            // Get game info for monthly challenge
            let monthlyGameInfo = null;
            if (challenge.monthly_challange_gameid) {
                monthlyGameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);
            }

            // Get game info for shadow challenge if revealed
            let shadowGameInfo = null;
            if (challenge.shadow_challange_gameid && challenge.shadow_challange_revealed) {
                shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);
            }

            // Build response message
            let responseMessage = `# Challenge Details: ${monthName} ${year}\n\n`;
            
            // Add monthly challenge info
            if (monthlyGameInfo) {
                responseMessage += `## 🏆 Monthly Challenge\n` +
                    `**Game:** ${monthlyGameInfo.title}\n` +
                    `**Required Progression Achievements:** ${challenge.monthly_challange_progression_achievements.length}\n` +
                    `**Required Win Achievements:** ${challenge.monthly_challange_win_achievements.length}\n` +
                    `**Total Game Achievements:** ${challenge.monthly_challange_game_total}\n` +
                    `[View Game on RetroAchievements](https://retroachievements.org/game/${challenge.monthly_challange_gameid})\n\n`;
            } else {
                responseMessage += `## 🏆 Monthly Challenge\n` +
                    `No monthly challenge set.\n\n`;
            }

            // Add shadow challenge info
            if (challenge.shadow_challange_gameid) {
                if (challenge.shadow_challange_revealed && shadowGameInfo) {
                    responseMessage += `## 👥 Shadow Challenge (REVEALED)\n` +
                        `**Game:** ${shadowGameInfo.title}\n` +
                        `**Required Progression Achievements:** ${challenge.shadow_challange_progression_achievements.length}\n` +
                        `**Required Win Achievements:** ${challenge.shadow_challange_win_achievements.length}\n` +
                        `**Total Game Achievements:** ${challenge.shadow_challange_game_total}\n` +
                        `[View Game on RetroAchievements](https://retroachievements.org/game/${challenge.shadow_challange_gameid})`;
                } else {
                    responseMessage += `## 👥 Shadow Challenge (HIDDEN)\n` +
                        `Shadow challenge exists but is currently hidden.\n` +
                        `Use \`/adminchallenge toggle\` to reveal it.`;
                }
            } else {
                responseMessage += `## 👥 Shadow Challenge\n` +
                    `No shadow challenge set.\n` +
                    `Use \`/adminchallenge shadow\` to add one.`;
            }

            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#3498DB') // Blue
                .setTitle(`Challenge Details: ${monthName} ${year}`)
                .setDescription(responseMessage)
                .setTimestamp();

            // Set thumbnail to monthly game if available, otherwise shadow game if revealed
            if (monthlyGameInfo && monthlyGameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${monthlyGameInfo.imageIcon}`);
            } else if (challenge.shadow_challange_revealed && shadowGameInfo && shadowGameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${shadowGameInfo.imageIcon}`);
            }

            // Add action buttons based on what's available
            const actionRow = new ActionRowBuilder();
            
            if (!challenge.monthly_challange_gameid) {
                // No monthly challenge, add button to create one
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('create_monthly')
                        .setLabel('Create Monthly Challenge')
                        .setStyle(ButtonStyle.Primary)
                );
            }
            
            if (!challenge.shadow_challange_gameid) {
                // No shadow challenge, add button to create one
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('create_shadow')
                        .setLabel('Add Shadow Challenge')
                        .setStyle(ButtonStyle.Primary)
                );
            } else {
                // Shadow challenge exists, add button to toggle visibility
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('toggle_shadow')
                        .setLabel(challenge.shadow_challange_revealed ? 'Hide Shadow Challenge' : 'Reveal Shadow Challenge')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            // Only add the action row if it has components
            const components = actionRow.components.length > 0 ? [actionRow] : [];

            await interaction.editReply({
                embeds: [embed],
                components: components
            });

            // Set up collector for the action buttons
            if (components.length > 0) {
                const message = await interaction.fetchReply();
                const collector = message.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 300000 // 5 minutes timeout
                });

                collector.on('collect', async i => {
                    if (i.user.id === interaction.user.id) {
                        await i.deferUpdate();

                        if (i.customId === 'create_monthly') {
                            // Create a monthly challenge
                            await this.handleCreateChallenge(i);
                        } else if (i.customId === 'create_shadow') {
                            // Create a shadow challenge
                            const newOptions = { month, year };
                            await this.handleShadowChallenge(i, newOptions);
                        } else if (i.customId === 'toggle_shadow') {
                            // Toggle shadow visibility
                            const newOptions = { month, year };
                            await this.handleToggleShadow(i, newOptions);
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error viewing challenge details:', error);
            await interaction.editReply('An error occurred while retrieving challenge details. Please try again.');
        }
    }
};
