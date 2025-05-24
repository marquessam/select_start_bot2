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

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const MAX_NOMINATIONS = 2;

export default {
    data: new SlashCommandBuilder()
        .setName('nominate')
        .setDescription('Nominate games for the monthly challenge')
        
        // Interactive menu (default)
        .addSubcommand(subcommand =>
            subcommand
                .setName('menu')
                .setDescription('Open interactive nomination menu')
        )
        
        // Direct nomination
        .addSubcommand(subcommand =>
            subcommand
                .setName('game')
                .setDescription('Directly nominate a game')
                .addIntegerOption(option =>
                    option
                        .setName('gameid')
                        .setDescription('RetroAchievements Game ID')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('comment')
                        .setDescription('Why this game? (Optional)')
                        .setRequired(false)
                        .setMaxLength(500)
                )
        )
        
        // Check status
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check your current nominations')
        )
        
        // Get info about restrictions
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Get information about nomination requirements')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Check specific month (1-12)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch(subcommand) {
                case 'menu':
                    await this.handleInteractiveMenu(interaction);
                    break;
                case 'game':
                    await this.handleDirectNomination(interaction);
                    break;
                case 'status':
                    await this.handleStatus(interaction);
                    break;
                case 'info':
                    await this.handleInfo(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Invalid subcommand.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in nominate command:', error);
            
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
    },

    /**
     * Handle interactive nomination menu
     */
    async handleInteractiveMenu(interaction) {
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

            // Create main embed
            const embed = new EmbedBuilder()
                .setTitle('🎮 Monthly Challenge Nominations')
                .setColor(nominationsOpen ? (currentRestriction?.restrictionRule?.color || '#00FF00') : '#FF0000')
                .setThumbnail('https://retroachievements.org/Images/icon.png')
                .setTimestamp();

            // Status section
            if (nominationsOpen) {
                embed.addFields({
                    name: '✅ Nominations Open',
                    value: 'Ready to nominate games for next month\'s challenge!',
                    inline: false
                });

                // Show closing time
                const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                const closeDaysStart = daysInMonth - settings.nominationCloseDays + 1;
                const nextClosing = new Date(currentYear, currentMonth, closeDaysStart);
                const nextClosingTimestamp = Math.floor(nextClosing.getTime() / 1000);
                
                embed.addFields({
                    name: '⏰ Deadline',
                    value: `Nominations close <t:${nextClosingTimestamp}:R>`,
                    inline: true
                });
            } else {
                embed.addFields({
                    name: '❌ Nominations Closed',
                    value: 'Nominations are not currently being accepted.',
                    inline: false
                });

                const nextOpening = settings.getNextOpeningDate(now);
                const nextOpeningTimestamp = Math.floor(nextOpening.getTime() / 1000);
                
                embed.addFields({
                    name: '📅 Next Opening',
                    value: `<t:${nextOpeningTimestamp}:F>`,
                    inline: true
                });
            }

            // Current restrictions summary
            if (currentRestriction && currentRestriction.enabled) {
                let restrictionSummary = `${currentRestriction.restrictionRule.emoji} **${currentRestriction.restrictionRule.name}**\n`;
                restrictionSummary += `${currentRestriction.restrictionRule.description}`;
                
                // Add quick rule summary
                const conditions = currentRestriction.restrictionRule.rules?.conditions || [];
                if (conditions.length > 0) {
                    restrictionSummary += `\n\n*Rules: ${conditions.length} condition(s)*`;
                }

                embed.addFields({
                    name: `🎯 ${monthName} Theme`,
                    value: restrictionSummary,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: `🔓 ${monthName} Theme`,
                    value: 'No special restrictions - all games welcome!',
                    inline: false
                });
            }

            // User's current nominations
            if (user) {
                const currentNominations = user.getCurrentNominations();
                let nominationText = '';
                
                if (currentNominations.length > 0) {
                    nominationText = currentNominations.map((nom, index) => 
                        `${index + 1}. **${nom.gameTitle}** *(${nom.consoleName})*`
                    ).join('\n');
                    nominationText += `\n\n${MAX_NOMINATIONS - currentNominations.length} slot(s) remaining`;
                } else {
                    nominationText = 'No nominations yet - you can nominate up to 2 games!';
                }

                embed.addFields({
                    name: '📊 Your Nominations',
                    value: nominationText,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '⚠️ Registration Required',
                    value: 'You need to register first using `/register` command.',
                    inline: false
                });
            }

            // Create action buttons
            const actionRow = new ActionRowBuilder();
            
            if (nominationsOpen && user) {
                const currentNominations = user.getCurrentNominations();
                const canNominate = currentNominations.length < MAX_NOMINATIONS;
                
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('nominate_open_form')
                        .setLabel('Nominate Game')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎮')
                        .setDisabled(!canNominate)
                );
            }

            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId('nominate_detailed_info')
                    .setLabel('Detailed Info')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📋'),
                
                new ButtonBuilder()
                    .setCustomId('nominate_refresh_menu')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄')
            );

            // Add upcoming restrictions button if there are any
            const upcomingRestrictions = settings.monthlyRestrictions
                .filter(r => r.enabled && r.month !== currentMonth)
                .slice(0, 1);
            
            if (upcomingRestrictions.length > 0) {
                actionRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('nominate_upcoming_info')
                        .setLabel('Upcoming')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔮')
                );
            }

            await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });

        } catch (error) {
            console.error('Error in handleInteractiveMenu:', error);
            await interaction.editReply('An error occurred while creating the nomination menu.');
        }
    },

    /**
     * Handle direct game nomination
     */
    async handleDirectNomination(interaction) {
        await interaction.deferReply({ ephemeral: false });

        try {
            const gameId = interaction.options.getInteger('gameid');
            const comment = interaction.options.getString('comment');

            await this.processNomination(interaction, gameId, comment);

        } catch (error) {
            console.error('Error in handleDirectNomination:', error);
            await interaction.editReply('An error occurred while processing your nomination.');
        }
    },

    /**
     * Process a nomination (shared logic)
     */
    async processNomination(interaction, gameId, comment) {
        try {
            const settings = await NominationSettings.getSettings();
            const now = new Date();

            // Check if nominations are open
            if (!settings.areNominationsOpen(now)) {
                const nextOpening = settings.getNextOpeningDate(now);
                const nextOpeningTimestamp = Math.floor(nextOpening.getTime() / 1000);
                
                return interaction.editReply(
                    `🚫 **Nominations are currently closed!**\n\n` +
                    `Next nominations period opens: <t:${nextOpeningTimestamp}:F>`
                );
            }

            // Get user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply(
                    'You need to be registered to nominate games. Please use the `/register` command first.'
                );
            }

            // Get game details
            let gameData;
            let achievementCount;
            
            try {
                gameData = await enhancedRetroAPI.getGameDetails(gameId);
                achievementCount = await enhancedRetroAPI.getGameAchievementCount(gameId);
            } catch (error) {
                console.error(`Error fetching game info for gameId ${gameId}:`, error);
                return interaction.editReply(
                    '❌ Game not found or unable to retrieve game information. Please check the Game ID and try again.'
                );
            }

            // Validate game data
            if (!gameData.title || !gameData.consoleName) {
                return interaction.editReply(
                    '❌ The game information appears to be incomplete. Please try again.'
                );
            }

            // Check eligibility
            if (!settings.isGameAllowed(gameData, now)) {
                return interaction.editReply(
                    settings.getRestrictionMessage(gameData, now)
                );
            }

            // Check current nominations
            const currentNominations = user.getCurrentNominations();
            
            // Check for duplicate
            const existingNomination = currentNominations.find(nom => nom.gameId === gameId);
            if (existingNomination) {
                return interaction.editReply(`❌ You've already nominated "${gameData.title}" for next month's challenge.`);
            }
            
            // Check max nominations
            if (currentNominations.length >= MAX_NOMINATIONS) {
                return interaction.editReply(
                    `❌ You've already used all ${MAX_NOMINATIONS} of your nominations for next month.`
                );
            }

            // Create nomination
            const nomination = {
                gameId: gameId,
                gameTitle: gameData.title,
                consoleName: gameData.consoleName,
                publisher: gameData.publisher,
                developer: gameData.developer,
                genre: gameData.genre,
                released: gameData.released,
                comment: comment,
                nominatedAt: new Date()
            };

            // Save nomination
            if (!user.nominations) {
                user.nominations = [];
            }
            user.nominations.push(nomination);
            
            await user.save();
            
            // Create success response
            const currentRestriction = settings.getCurrentMonthRestriction(now);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Game Nominated Successfully!')
                .setColor(currentRestriction?.restrictionRule?.color || '#00FF00')
                .setThumbnail(`https://retroachievements.org${gameData.imageIcon}`)
                .setURL(`https://retroachievements.org/game/${gameId}`)
                .setTimestamp();

            // Special description for themed months
            if (currentRestriction && currentRestriction.enabled) {
                embed.setDescription(
                    `${user.raUsername} has nominated a game for **${currentRestriction.restrictionRule.name}**! ${currentRestriction.restrictionRule.emoji}`
                );
            } else {
                embed.setDescription(`${user.raUsername} has nominated a game for next month's challenge:`);
            }

            // Game details
            embed.addFields(
                { name: '🎮 Game', value: gameData.title, inline: true },
                { name: '🎯 Console', value: gameData.consoleName, inline: true },
                { name: '🏆 Achievements', value: achievementCount.toString(), inline: true }
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

            // Add comment if provided
            if (comment) {
                embed.addFields({
                    name: '💭 Why this game?',
                    value: comment,
                    inline: false
                });
            }

            // Status
            embed.addFields({
                name: '📊 Your Status',
                value: `${MAX_NOMINATIONS - (currentNominations.length + 1)}/${MAX_NOMINATIONS} nominations remaining`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in processNomination:', error);
            await interaction.editReply('An unexpected error occurred while processing your nomination.');
        }
    },

    /**
     * Handle status check
     */
    async handleStatus(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const user = await User.findOne({ discordId: interaction.user.id });
            
            if (!user) {
                return interaction.editReply('You need to register first using `/register` command.');
            }

            const currentNominations = user.getCurrentNominations();
            const settings = await NominationSettings.getSettings();
            const now = new Date();
            const nominationsOpen = settings.areNominationsOpen(now);

            const embed = new EmbedBuilder()
                .setTitle('📊 Your Nomination Status')
                .setColor(nominationsOpen ? '#00FF00' : '#FF0000')
                .setTimestamp();

            // Status
            embed.addFields({
                name: '📈 Overall Status',
                value: `Nominations: ${nominationsOpen ? '✅ Open' : '❌ Closed'}\n` +
                       `Used: ${currentNominations.length}/${MAX_NOMINATIONS}\n` +
                       `Remaining: ${MAX_NOMINATIONS - currentNominations.length}`,
                inline: false
            });

            // Current nominations
            if (currentNominations.length > 0) {
                const nominationsList = currentNominations.map((nom, index) => {
                    const date = new Date(nom.nominatedAt);
                    const timestamp = Math.floor(date.getTime() / 1000);
                    return `${index + 1}. **${nom.gameTitle}** *(${nom.consoleName})*\n` +
                           `   Nominated: <t:${timestamp}:R>` +
                           (nom.comment ? `\n   Comment: "${nom.comment}"` : '');
                }).join('\n\n');

                embed.addFields({
                    name: '🎮 Your Current Nominations',
                    value: nominationsList,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '🎮 Your Current Nominations',
                    value: 'No nominations yet!',
                    inline: false
                });
            }

            // Next opening/closing
            if (nominationsOpen) {
                const nextClosing = settings.getNextClosingDate(now);
                if (nextClosing) {
                    const nextClosingTimestamp = Math.floor(nextClosing.getTime() / 1000);
                    embed.addFields({
                        name: '⏰ Next Closing',
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

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in handleStatus:', error);
            await interaction.editReply('An error occurred while fetching your status.');
        }
    },

    /**
     * Handle info about restrictions
     */
    async handleInfo(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const requestedMonth = interaction.options.getInteger('month');
            const settings = await NominationSettings.getSettings();
            const now = new Date();
            const currentMonth = now.getMonth();
            
            // Determine which month to check
            const targetMonth = requestedMonth ? requestedMonth - 1 : currentMonth;
            const monthName = MONTH_NAMES[targetMonth];
            
            const restriction = settings.getMonthlyRestriction(targetMonth);

            const embed = new EmbedBuilder()
                .setTitle(`📋 ${monthName} Nomination Information`)
                .setColor('#0099FF')
                .setTimestamp();

            // Month-specific restrictions
            if (restriction && restriction.enabled) {
                embed.addFields({
                    name: `${restriction.restrictionRule.emoji} ${monthName} Theme`,
                    value: `**${restriction.restrictionRule.name}**\n${restriction.restrictionRule.description}`,
                    inline: false
                });

                // Rule breakdown
                if (restriction.restrictionRule.rules && restriction.restrictionRule.rules.conditions) {
                    const conditions = restriction.restrictionRule.rules.conditions;
                    const ruleType = restriction.restrictionRule.rules.type || 'AND';
                    
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
                    name: `🔓 ${monthName} Status`,
                    value: 'No special restrictions - all games are welcome!',
                    inline: false
                });
            }

            // General guidelines
            embed.addFields({
                name: '📝 General Guidelines',
                value: '• Maximum **2 nominations** per month\n' +
                       '• Games must meet monthly theme requirements\n' +
                       '• No duplicate nominations allowed\n' +
                       '• Find Game IDs in RetroAchievements.org URLs\n' +
                       '• Nominations close during last 8 days of month',
                inline: false
            });

            // Always blocked consoles
            if (settings.alwaysBlockedConsoles.length > 0) {
                embed.addFields({
                    name: '🚫 Always Ineligible',
                    value: settings.alwaysBlockedConsoles.join(', '),
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in handleInfo:', error);
            await interaction.editReply('An error occurred while fetching restriction information.');
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
