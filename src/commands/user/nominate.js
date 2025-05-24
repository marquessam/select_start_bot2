// src/commands/user/nominate.js

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType
} from 'discord.js';
import { User } from '../../models/User.js';
import { NominationSettings } from '../../models/NominationSettings.js';
import enhancedRetroAPI from '../../services/enhancedRetroAPI.js';
import { 
    handleNominationButtonInteraction, 
    handleNominationModalSubmit 
} from '../../handlers/nominationHandlers.js';
import { config } from '../../config/config.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get nominations channel ID from config/env
const NOMINATIONS_CHANNEL_ID = process.env.NOMINATIONS_CHANNEL || config.discord.votingChannelId;

// Maximum nominations per user
const MAX_NOMINATIONS = 2;

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export default {
    data: new SlashCommandBuilder()
        .setName('nominate')
        .setDescription('Nominate games for monthly challenges')
        .addSubcommand(subcommand =>
            subcommand
                .setName('menu')
                .setDescription('Open the interactive nomination menu')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('quick')
                .setDescription('Quick nominate with game ID')
                .addIntegerOption(option =>
                    option.setName('gameid')
                    .setDescription('RetroAchievements Game ID')
                    .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('View detailed nomination information for any month')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Month to check (1-12, default: current)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check your current nominations')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // Check if command is used in the correct channel (except for info/status)
        if (subcommand !== 'info' && subcommand !== 'status' && interaction.channelId !== NOMINATIONS_CHANNEL_ID) {
            return interaction.reply({ 
                content: `Nominations can only be made in <#${NOMINATIONS_CHANNEL_ID}>. You can use \`/nominate info\` anywhere to check restrictions.`, 
                ephemeral: true 
            });
        }

        try {
            switch(subcommand) {
                case 'menu':
                    await this.handleMenu(interaction);
                    break;
                case 'quick':
                    await this.handleQuickNominate(interaction);
                    break;
                case 'info':
                    await this.handleInfo(interaction);
                    break;
                case 'status':
                    await this.handleStatus(interaction);
                    break;
                default:
                    await interaction.reply({ content: 'Invalid subcommand.', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in nominate command:', error);
            await interaction.reply({ 
                content: 'An error occurred while processing your request. Please try again.', 
                ephemeral: true 
            });
        }
    },

    async handleMenu(interaction) {
        await interaction.deferReply({ ephemeral: false });

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
                    const ruleTypes = conditions.map(c => c.type).join(', ');
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
            console.error('Error in handleMenu:', error);
            await interaction.editReply('An error occurred while loading the nomination menu.');
        }
    },

    async handleQuickNominate(interaction) {
        const gameId = interaction.options.getInteger('gameid');
        
        // Use the existing nomination logic
        await this.processNomination(interaction, gameId);
    },

    async handleInfo(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const settings = await NominationSettings.getSettings();
            const now = new Date();
            const checkMonth = interaction.options.getInteger('month');
            
            // Determine which month to check
            const targetDate = checkMonth ? 
                new Date(now.getFullYear(), checkMonth - 1, 15) : 
                now;
            
            const targetMonth = targetDate.getMonth();
            const targetYear = targetDate.getFullYear();
            const currentRestriction = settings.getCurrentMonthRestriction(targetDate);
            const nominationsOpen = settings.areNominationsOpen(targetDate);

            const embed = new EmbedBuilder()
                .setTitle('📋 Detailed Nomination Information')
                .setColor(nominationsOpen ? '#00FF00' : '#FF0000')
                .setTimestamp();

            // If checking a specific month, show that in title
            if (checkMonth) {
                const monthName = MONTH_NAMES[targetMonth];
                embed.setTitle(`📋 ${monthName} Nomination Information`);
            }

            // Current status (only for current month)
            if (!checkMonth) {
                if (nominationsOpen) {
                    embed.addFields({
                        name: '✅ Nominations are OPEN',
                        value: 'Use `/nominate menu` to get started!',
                        inline: false
                    });
                    
                    // Show when they close
                    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
                    const closeDaysStart = daysInMonth - settings.nominationCloseDays + 1;
                    const nextClosing = new Date(targetYear, targetMonth, closeDaysStart);
                    const nextClosingTimestamp = Math.floor(nextClosing.getTime() / 1000);
                    
                    embed.addFields({
                        name: '⏰ Closing Time',
                        value: `<t:${nextClosingTimestamp}:F>\n(<t:${nextClosingTimestamp}:R>)`,
                        inline: false
                    });
                } else {
                    embed.addFields({
                        name: '❌ Nominations are CLOSED',
                        value: 'Check back during the nomination period.',
                        inline: false
                    });
                    
                    const nextOpening = settings.getNextOpeningDate(targetDate);
                    const nextOpeningTimestamp = Math.floor(nextOpening.getTime() / 1000);
                    
                    embed.addFields({
                        name: '📅 Next Opening',
                        value: `<t:${nextOpeningTimestamp}:F>\n(<t:${nextOpeningTimestamp}:R>)`,
                        inline: false
                    });
                }
            }

            // Current/target month restrictions
            if (currentRestriction && currentRestriction.enabled) {
                const monthName = MONTH_NAMES[targetMonth];
                
                embed.addFields({
                    name: `${currentRestriction.restrictionRule.emoji} ${monthName} Theme`,
                    value: `**${currentRestriction.restrictionRule.name}**\n${currentRestriction.restrictionRule.description}`,
                    inline: false
                });

                // Show detailed rule breakdown
                if (currentRestriction.restrictionRule.rules && currentRestriction.restrictionRule.rules.conditions) {
                    const conditions = currentRestriction.restrictionRule.rules.conditions;
                    const ruleType = currentRestriction.restrictionRule.rules.type || 'AND';
                    
                    let rulesText = `**Logic:** ${ruleType} (${conditions.length} condition${conditions.length > 1 ? 's' : ''})\n\n`;
                    
                    conditions.forEach((condition, index) => {
                        const conditionText = this.formatCondition(condition);
                        rulesText += `${index + 1}. ${conditionText}\n`;
                    });

                    if (rulesText.length <= 1024) {
                        embed.addFields({
                            name: '📋 Restriction Details',
                            value: rulesText,
                            inline: false
                        });
                    }
                }
                
                embed.setColor(currentRestriction.restrictionRule.color);
            } else {
                const monthName = MONTH_NAMES[targetMonth];
                embed.addFields({
                    name: `🔓 ${monthName} Status`,
                    value: 'No special restrictions - all games are allowed!',
                    inline: false
                });
            }

            // Always blocked consoles (if any)
            if (settings.alwaysBlockedConsoles.length > 0) {
                embed.addFields({
                    name: '🚫 Always Ineligible',
                    value: settings.alwaysBlockedConsoles.join(', '),
                    inline: false
                });
            }

            // How to nominate (only for current month and if open)
            if (!checkMonth && nominationsOpen) {
                embed.addFields({
                    name: '💡 How to Nominate',
                    value: '• Use `/nominate menu` for interactive nomination\n' +
                           '• Use `/nominate quick gameid:XXXXX` for direct nomination\n' +
                           '• You can nominate up to **2 games** per month\n' +
                           '• Find game IDs on RetroAchievements.org',
                    inline: false
                });
            }

            // Upcoming restrictions preview
            if (!checkMonth) {
                const upcomingRestrictions = settings.monthlyRestrictions
                    .filter(r => r.enabled && r.month !== targetMonth)
                    .slice(0, 3);

                if (upcomingRestrictions.length > 0) {
                    const upcomingText = upcomingRestrictions.map(r => {
                        const monthName = MONTH_NAMES[r.month];
                        return `${r.restrictionRule.emoji} **${monthName}**: ${r.restrictionRule.name}`;
                    }).join('\n');

                    embed.addFields({
                        name: '🔮 Upcoming Themes',
                        value: upcomingText,
                        inline: false
                    });
                }
            }

            embed.setFooter({ 
                text: 'Use /nominate menu for the interactive nomination interface'
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error getting nomination info:', error);
            await interaction.editReply('An error occurred while fetching nomination information.');
        }
    },

    async handleStatus(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const user = await User.findOne({ discordId: interaction.user.id });
            
            if (!user) {
                return interaction.editReply({
                    content: 'You are not registered. Please use `/register` first.'
                });
            }

            const currentNominations = user.getCurrentNominations();
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Your Nomination Status')
                .setColor('#0099FF')
                .setTimestamp();

            if (currentNominations.length > 0) {
                let nominationText = '';
                
                for (let i = 0; i < currentNominations.length; i++) {
                    const nom = currentNominations[i];
                    nominationText += `**${i + 1}. ${nom.gameTitle}**\n`;
                    nominationText += `Console: ${nom.consoleName}\n`;
                    if (nom.publisher) nominationText += `Publisher: ${nom.publisher}\n`;
                    if (nom.genre) nominationText += `Genre: ${nom.genre}\n`;
                    nominationText += `Nominated: <t:${Math.floor(nom.nominatedAt.getTime() / 1000)}:R>\n\n`;
                }

                embed.addFields({
                    name: `🎮 Your Nominations (${currentNominations.length}/${MAX_NOMINATIONS})`,
                    value: nominationText,
                    inline: false
                });

                const remaining = MAX_NOMINATIONS - currentNominations.length;
                if (remaining > 0) {
                    embed.addFields({
                        name: '✨ Available Slots',
                        value: `You can nominate ${remaining} more game${remaining > 1 ? 's' : ''}!`,
                        inline: false
                    });
                }
            } else {
                embed.addFields({
                    name: '📭 No Nominations Yet',
                    value: `You haven't nominated any games for next month.\nYou can nominate up to **${MAX_NOMINATIONS} games**!`,
                    inline: false
                });
            }

            embed.addFields({
                name: '💡 Quick Actions',
                value: '• `/nominate menu` - Interactive nomination interface\n' +
                       '• `/nominate info` - Check current restrictions\n' +
                       '• `/nominate quick gameid:XXXXX` - Direct nomination',
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error getting nomination status:', error);
            await interaction.editReply('An error occurred while fetching your nomination status.');
        }
    },

    async processNomination(interaction, gameId) {
        await interaction.deferReply({ ephemeral: false });

        try {
            const settings = await NominationSettings.getSettings();
            const now = new Date();

            // Check if nominations are currently open
            if (!settings.areNominationsOpen(now)) {
                const nextOpening = settings.getNextOpeningDate(now);
                const nextOpeningTimestamp = Math.floor(nextOpening.getTime() / 1000);
                
                return interaction.editReply(
                    `🚫 **Nominations are currently closed!**\n\n` +
                    `Next nominations period opens: <t:${nextOpeningTimestamp}:F>`
                );
            }

            const discordId = interaction.user.id;

            // Validate gameId
            if (!gameId || gameId <= 0) {
                return interaction.editReply('Please provide a valid Game ID (positive number).');
            }

            // Get the user
            const user = await User.findOne({ discordId });
            if (!user) {
                return interaction.editReply(
                    'You need to be registered to nominate games. Please use the `/register` command first.'
                );
            }

            // Get game details using enhanced API
            let gameData;
            let achievementCount;
            
            try {
                console.log(`Fetching enhanced game info for gameId: ${gameId}`);
                gameData = await enhancedRetroAPI.getGameDetails(gameId);
                achievementCount = await enhancedRetroAPI.getGameAchievementCount(gameId);
                
            } catch (error) {
                console.error(`Error fetching game info for gameId ${gameId}:`, error);
                return interaction.editReply(
                    'Game not found or unable to retrieve game information. Please check the Game ID and try again.'
                );
            }

            // Validate game data
            if (!gameData.title || !gameData.consoleName) {
                return interaction.editReply(
                    'The game information appears to be incomplete. Please try again or contact an administrator.'
                );
            }

            // Check game eligibility using enhanced restriction system
            if (!settings.isGameAllowed(gameData, now)) {
                return interaction.editReply(
                    settings.getRestrictionMessage(gameData, now)
                );
            }

            // Get current nominations for the user
            const currentNominations = user.getCurrentNominations();
            
            // Check if user already nominated this game
            const existingNomination = currentNominations.find(nom => nom.gameId === gameId);
            if (existingNomination) {
                return interaction.editReply(`You've already nominated "${gameData.title}" for next month's challenge.`);
            }
            
            // Check if user has reached max nominations
            if (currentNominations.length >= MAX_NOMINATIONS) {
                return interaction.editReply(
                    `You've already used all ${MAX_NOMINATIONS} of your nominations for next month.`
                );
            }
            
            // Create the nomination object
            const nomination = {
                gameId: gameId,
                gameTitle: gameData.title,
                consoleName: gameData.consoleName,
                publisher: gameData.publisher,
                developer: gameData.developer,
                genre: gameData.genre,
                released: gameData.released,
                nominatedAt: new Date()
            };

            // Add the new nomination
            if (!user.nominations) {
                user.nominations = [];
            }
            user.nominations.push(nomination);
            
            try {
                await user.save();
                console.log(`Successfully saved nomination for ${user.raUsername}: "${gameData.title}" (${gameData.consoleName})`);
            } catch (saveError) {
                console.error('Error saving nomination:', saveError);
                return interaction.editReply(
                    'An error occurred while saving your nomination. Please try again.'
                );
            }
            
            // Create success embed
            const currentRestriction = settings.getCurrentMonthRestriction(now);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Game Nominated Successfully!')
                .setColor(currentRestriction?.restrictionRule?.color || '#00FF00')
                .setThumbnail(`https://retroachievements.org${gameData.imageIcon}`)
                .setURL(`https://retroachievements.org/game/${gameId}`)
                .setTimestamp();

            // Add special description for themed months
            if (currentRestriction && currentRestriction.enabled) {
                embed.setDescription(
                    `${user.raUsername} has nominated a game for **${currentRestriction.restrictionRule.name}**! ${currentRestriction.restrictionRule.emoji}`
                );
            } else {
                embed.setDescription(`${user.raUsername} has nominated a game for next month's challenge:`);
            }

            // Game information
            embed.addFields(
                { name: '🎮 Game', value: gameData.title, inline: true },
                { name: '🎯 Console', value: gameData.consoleName, inline: true },
                { name: '🏆 Achievements', value: achievementCount.toString(), inline: true }
            );

            // Enhanced information (if available)
            if (gameData.publisher) {
                embed.addFields({ name: '🏢 Publisher', value: gameData.publisher, inline: true });
            }
            if (gameData.developer) {
                embed.addFields({ name: '👨‍💻 Developer', value: gameData.developer, inline: true });
            }
            if (gameData.genre) {
                embed.addFields({ name: '🎭 Genre', value: gameData.genre, inline: true });
            }

            // Nomination status
            embed.addFields({
                name: '📊 Your Status',
                value: `${MAX_NOMINATIONS - (currentNominations.length + 1)}/${MAX_NOMINATIONS} nominations remaining`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error processing nomination:', error);
            await interaction.editReply('An unexpected error occurred while processing your nomination. Please try again.');
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
    },

    /**
     * Handle button interactions for nomination system
     */
    async handleButtonInteraction(interaction) {
        // Only handle nomination-related buttons
        if (interaction.customId.startsWith('nominate_')) {
            await handleNominationButtonInteraction(interaction);
        }
    },

    /**
     * Handle modal submissions for nomination system
     */
    async handleModalSubmit(interaction) {
        // Only handle nomination-related modals
        if (interaction.customId === 'nomination_form') {
            await handleNominationModalSubmit(interaction);
        }
    }
};
