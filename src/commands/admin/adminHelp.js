import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    PermissionFlagsBits
} from 'discord.js';
import { config } from '../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminhelp')
        .setDescription('Get help with admin commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // Admin permission required

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
            // Display the main admin help menu with dropdown navigation
            await this.displayMainHelp(interaction);
        } catch (error) {
            console.error('Admin Help Command Error:', error);
            await interaction.editReply('Failed to display admin help menu. Please try again.');
        }
    },

    async displayMainHelp(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Admin Command Reference')
            .setDescription('Welcome to the admin command reference. Select a category below to view available commands for different administrative functions.')
            .setColor('#FF4500') // Orange-Red to indicate admin-level command
            .addFields({
                name: 'Command Categories',
                value: 'Use the dropdown menu below to explore different command categories:'
            })
            .setFooter({ text: 'Admin Only • Select a category from the dropdown' })
            .setTimestamp();

        // Create a dropdown menu for category selection
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('adminHelpCategories')
                    .setPlaceholder('Select a category')
                    .addOptions([
                        {
                            label: 'User Management',
                            description: 'Commands for managing users and profiles',
                            value: 'user_management',
                            emoji: '👤'
                        },
                        {
                            label: 'Challenge Management',
                            description: 'Commands for managing monthly and shadow challenges',
                            value: 'challenge_management',
                            emoji: '🎮'
                        },
                        {
                            label: 'Voting & Nominations',
                            description: 'Commands for managing the voting process',
                            value: 'voting_nominations',
                            emoji: '🗳️'
                        },
                        {
                            label: 'Arcade & Racing',
                            description: 'Commands for managing arcade boards and racing challenges',
                            value: 'arcade_racing',
                            emoji: '🏎️'
                        },
                        {
                            label: 'System Management',
                            description: 'System-level administrative commands',
                            value: 'system_management',
                            emoji: '⚙️'
                        },
                        {
                            label: 'Information Commands',
                            description: 'Commands for displaying shareable information',
                            value: 'information_commands',
                            emoji: '📢'
                        }
                    ])
            );

        // Send the initial message with dropdown menu
        const message = await interaction.editReply({
            embeds: [embed],
            components: [row]
        });

        // Create collector for dropdown interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 600000 // Time limit: 10 minutes
        });

        // Create collector for button interactions
        const buttonCollector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 600000 // Time limit: 10 minutes
        });

        // Handle dropdown selection
        collector.on('collect', async (i) => {
            await i.deferUpdate();

            // Generate back button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back')
                        .setLabel('Back to Categories')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );

            // Handle different category selections
            switch (i.values[0]) {
                case 'user_management':
                    const userManagementEmbed = this.createUserManagementEmbed();
                    await i.editReply({ embeds: [userManagementEmbed], components: [backRow] });
                    break;
                case 'challenge_management':
                    const challengeManagementEmbed = this.createChallengeManagementEmbed();
                    await i.editReply({ embeds: [challengeManagementEmbed], components: [backRow] });
                    break;
                case 'voting_nominations':
                    const votingNominationsEmbed = this.createVotingNominationsEmbed();
                    await i.editReply({ embeds: [votingNominationsEmbed], components: [backRow] });
                    break;
                case 'arcade_racing':
                    const arcadeRacingEmbed = this.createArcadeRacingEmbed();
                    await i.editReply({ embeds: [arcadeRacingEmbed], components: [backRow] });
                    break;
                case 'system_management':
                    const systemManagementEmbed = this.createSystemManagementEmbed();
                    await i.editReply({ embeds: [systemManagementEmbed], components: [backRow] });
                    break;
                case 'information_commands':
                    const informationCommandsEmbed = this.createInformationCommandsEmbed();
                    await i.editReply({ embeds: [informationCommandsEmbed], components: [backRow] });
                    break;
            }
        });

        // Handle button clicks
        buttonCollector.on('collect', async (i) => {
            await i.deferUpdate();

            if (i.customId === 'back') {
                // Return to main menu
                await i.editReply({ 
                    embeds: [embed], 
                    components: [row] 
                });
            }
        });

        // When the collectors expire
        collector.on('end', async () => {
            if (!buttonCollector.ended) buttonCollector.stop();
        });

        buttonCollector.on('end', async () => {
            try {
                // Disable the select menu when time expires
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('adminHelpCategories')
                            .setPlaceholder('Help session expired')
                            .setDisabled(true)
                            .addOptions([{ label: 'Expired', value: 'expired' }])
                    );

                // Update with disabled menu
                await interaction.editReply({
                    embeds: [embed.setFooter({ text: 'Admin Only • Help session expired' })],
                    components: [disabledRow]
                });
            } catch (error) {
                console.error('Error disabling menu:', error);
            }
        });
    },

    // Create all the embed functions with command descriptions
    createUserManagementEmbed() {
        return new EmbedBuilder()
            .setTitle('User Management Commands')
            .setColor('#4169E1') // Royal Blue
            .setDescription('Commands for managing users, profiles, and awards:')
            .addFields(
                {
                    name: '👤 Registration Commands',
                    value: '• `/adminregister discord_user:[@user] ra_username:[username]` - Register a user with RetroAchievements and Discord accounts\n' +
                           '• `/unregister ra_username:[username]` - Unregister a user from the system\n' +
                           '• `/purgeregistration ra_username:[username] discord_user:[optional]` - Completely remove a user registration to allow re-registration'
                },
                {
                    name: '🏆 Award Management',
                    value: '• `/giveaward username:[username] title:[award title] points:[number]` - Give a community award to a user\n' +
                           '• `/viewuserawards username:[username]` - View all community awards for a user\n' +
                           '• `/clearuseraward username:[username] index:[number]` - Remove a specific community award from a user'
                },
                {
                    name: '🗳️ Nomination Management',
                    value: '• `/clearnominations ra_username:[username]` - Clear a user\'s current nominations'
                },
                {
                    name: '📊 User Data',
                    value: '• `/resetachievements username:[username]` - Reset achievement announcement history for a user'
                }
            )
            .setFooter({ text: 'Press "Back to Categories" to return to the main menu' })
            .setTimestamp();
    },

    createChallengeManagementEmbed() {
        return new EmbedBuilder()
            .setTitle('Challenge Management Commands')
            .setColor('#32CD32') // Lime Green
            .setDescription('Commands for managing monthly and shadow challenges:')
            .addFields(
                {
                    name: '🎮 Monthly Challenge',
                    value: '• `/createchallenge gameid:[id] month:[1-12] year:[yyyy] progression_achievements:[id,id,...] win_achievements:[optional]` - Create a new monthly challenge with specified game and requirements'
                },
                {
                    name: '👥 Shadow Challenge',
                    value: '• `/addshadow gameid:[id] progression_achievements:[id,id,...] win_achievements:[optional] month:[optional] year:[optional]` - Add a shadow challenge to a specific month\n' +
                           '• `/admintoggleshadow` - Toggle the visibility of the current shadow challenge'
                }
            )
            .setFooter({ text: 'Press "Back to Categories" to return to the main menu' })
            .setTimestamp();
    },

    createVotingNominationsEmbed() {
        return new EmbedBuilder()
            .setTitle('Voting & Nominations Commands')
            .setColor('#FF69B4') // Hot Pink
            .setDescription('Commands for managing the voting process:')
            .addFields(
                {
                    name: '🗳️ Voting Management',
                    value: '• `/startvoting channel:[#channel] results_channel:[optional]` - Start a voting poll for next month\'s challenge\n' +
                           '• `/cancelvoting` - Cancel the current voting poll without announcing results'
                }
            )
            .setFooter({ text: 'Press "Back to Categories" to return to the main menu' })
            .setTimestamp();
    },

    createArcadeRacingEmbed() {
        return new EmbedBuilder()
            .setTitle('Arcade & Racing Commands')
            .setColor('#FFA500') // Orange
            .setDescription('Commands for managing arcade boards and racing challenges:')
            .addFields(
                {
                    name: '🎮 Arcade Management',
                    value: '• `/arcadeadmin add board_id:[id] type:[arcade|racing|tiebreaker] leaderboard_id:[id] game_id:[id] description:[text]` - Add a new arcade board\n' +
                           '• `/arcadeadmin remove board_id:[id]` - Remove an arcade board\n' +
                           '• `/arcadeadmin announce board_id:[id]` - Announce an existing racing or arcade board\n' +
                           '• `/arcadeadmin awardarcade year:[optional]` - Manually trigger the annual arcade points award process\n' +
                           '• `/arcadeadmin clear type:[arcade|racing] identifier:[id|month]` - Remove an arcade or racing board'
                },
                {
                    name: '🏎️ Racing Management',
                    value: '• `/arcadeadmin racing leaderboard_id:[id] game_id:[id] track_name:[name] description:[text] year:[optional] month:[optional]` - Set up a monthly racing challenge\n' +
                           '• `/arcadeadmin award board_id:[id]` - Manually award points for completed racing challenge\n' +
                           '• `/forcecompleteracing month:[month] first_place:[user] second_place:[optional] third_place:[optional]` - Force a racing board to be completed and award points to winners\n' +
                           '• `/checkracingboard month:[month name or YYYY-MM]` - View details of a racing board for debugging'
                },
                {
                    name: '⚔️ Tiebreaker Management',
                    value: '• `/arcadeadmin tiebreaker leaderboard_id:[id] game_id:[id] description:[text] end_date:[YYYY-MM-DD]` - Create a tiebreaker leaderboard for the monthly challenge'
                }
            )
            .setFooter({ text: 'Press "Back to Categories" to return to the main menu' })
            .setTimestamp();
    },

    createSystemManagementEmbed() {
        return new EmbedBuilder()
            .setTitle('System Management Commands')
            .setColor('#9932CC') // Dark Orchid
            .setDescription('System-level administrative commands:')
            .addFields(
                {
                    name: '⚙️ System Commands',
                    value: '• `/forceupdate` - Force an immediate update of all user stats and leaderboards'
                },
                {
                    name: '💡 Suggestion Management',
                    value: '• `/suggestadmin` - Interactive menu to manage community suggestions (view, approve, reject, implement)'
                }
            )
            .setFooter({ text: 'Press "Back to Categories" to return to the main menu' })
            .setTimestamp();
    },

    createInformationCommandsEmbed() {
        return new EmbedBuilder()
            .setTitle('Information Commands')
            .setColor('#1E90FF') // Dodger Blue
            .setDescription('Commands for displaying shareable information:')
            .addFields(
                {
                    name: '📢 Share Information',
                    value: '• `/admininfo arcade` - Display a shareable list of all arcade boards\n' +
                           '• `/admininfo challenges` - Display a shareable list of current challenges\n' +
                           '• `/admininfo overview` - Display a shareable community overview\n' +
                           '• `/admininfo commands` - Display a shareable list of available commands\n' +
                           '• `/admininfo rules` - Display shareable community rules and guidelines'
                }
            )
            .setFooter({ text: 'Press "Back to Categories" to return to the main menu' })
            .setTimestamp();
    }
};
