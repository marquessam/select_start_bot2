import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    ComponentType
} from 'discord.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with the Select Start Bot commands and community'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Display the main help menu with dropdown navigation
            await this.displayMainHelp(interaction);
        } catch (error) {
            console.error('Help Command Error:', error);
            await interaction.editReply('Failed to display help. Please try again.');
        }
    },

    async displayMainHelp(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Select Start Community Help')
            .setDescription('Welcome to the Select Start Gaming Community! Choose a topic below to learn more about our community and available bot commands.')
            .setColor('#3498DB')
            .addFields({
                name: 'Available Help Topics',
                value: 'Use the dropdown menu below to explore different topics:'
            })
            .setFooter({ text: 'Select Start Gaming Community • Select a topic from the dropdown' })
            .setTimestamp();

        // Create a dropdown menu for topic selection
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('helpTopics')
                    .setPlaceholder('Select a topic')
                    .addOptions([
                        {
                            label: 'Overview',
                            description: 'Community overview and how things work',
                            value: 'overview',
                            emoji: '🔍'
                        },
                        {
                            label: 'Commands',
                            description: 'List of available bot commands',
                            value: 'commands',
                            emoji: '🤖'
                        },
                        {
                            label: 'Challenges',
                            description: 'About monthly challenges and awards',
                            value: 'challenges',
                            emoji: '🎮'
                        },
                        {
                            label: 'Shadow Games',
                            description: 'About shadow game challenges',
                            value: 'shadow',
                            emoji: '👥'
                        },
                        {
                            label: 'Arcade',
                            description: 'About arcade and racing leaderboards',
                            value: 'arcade',
                            emoji: '🏎️'
                        },
                        {
                            label: 'Points',
                            description: 'How points are earned and awarded',
                            value: 'points',
                            emoji: '🏆'
                        },
                        {
                            label: 'Nominations',
                            description: 'How game nominations work',
                            value: 'nominations',
                            emoji: '🗳️'
                        },
                        {
                            label: 'Rules',
                            description: 'Brief community rules and guidelines',
                            value: 'rules',
                            emoji: '📋'
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
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );

            // Handle different topic selections
            switch (i.values[0]) {
                case 'overview':
                    const overviewEmbed = await this.createOverviewEmbed();
                    await i.editReply({ embeds: [overviewEmbed], components: [backRow] });
                    break;
                case 'commands':
                    const commandsEmbed = await this.createCommandsEmbed();
                    await i.editReply({ embeds: [commandsEmbed], components: [backRow] });
                    break;
                case 'challenges':
                    const challengesEmbed = await this.createChallengesEmbed();
                    await i.editReply({ embeds: [challengesEmbed], components: [backRow] });
                    break;
                case 'shadow':
                    const shadowEmbed = await this.createShadowEmbed();
                    await i.editReply({ embeds: [shadowEmbed], components: [backRow] });
                    break;
                case 'arcade':
                    const arcadeEmbed = await this.createArcadeEmbed();
                    await i.editReply({ embeds: [arcadeEmbed], components: [backRow] });
                    break;
                case 'points':
                    const pointsEmbed = await this.createPointsEmbed();
                    await i.editReply({ embeds: [pointsEmbed], components: [backRow] });
                    break;
                case 'nominations':
                    const nominationsEmbed = await this.createNominationsEmbed();
                    // Create a row with platforms and back buttons
                    const nominationsRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('platforms')
                                .setLabel('Supported Platforms')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('📋'),
                            new ButtonBuilder()
                                .setCustomId('back')
                                .setLabel('Back to Menu')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('↩️')
                        );
                    await i.editReply({ embeds: [nominationsEmbed], components: [nominationsRow] });
                    break;
                case 'rules':
                    const rulesEmbed = await this.createRulesEmbed();
                    await i.editReply({ embeds: [rulesEmbed], components: [backRow] });
                    break;
            }
        });

        // Handle button clicks
        buttonCollector.on('collect', async (i) => {
            await i.deferUpdate();

            // Generate back button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('back')
                        .setLabel('Back to Menu')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('↩️')
                );

            // Handle different button clicks
            switch (i.customId) {
                case 'platforms':
                    const platformsEmbed = await this.createPlatformsEmbed();
                    // Create a row with a back to nominations button
                    const platformsBackRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('nominations')
                                .setLabel('Back to Nominations')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('↩️')
                        );
                    await i.editReply({ embeds: [platformsEmbed], components: [platformsBackRow] });
                    break;
                case 'nominations':
                    const nominationsEmbed = await this.createNominationsEmbed();
                    // Create a row with platforms and back buttons
                    const nominationsRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('platforms')
                                .setLabel('Supported Platforms')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('📋'),
                            new ButtonBuilder()
                                .setCustomId('back')
                                .setLabel('Back to Menu')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('↩️')
                        );
                    await i.editReply({ embeds: [nominationsEmbed], components: [nominationsRow] });
                    break;
                case 'back':
                    // Return to main menu
                    await i.editReply({ 
                        embeds: [embed], 
                        components: [row] 
                    });
                    break;
            }
        });

        // When the collector expires
        collector.on('end', async () => {
            if (!buttonCollector.ended) buttonCollector.stop();
        });

        buttonCollector.on('end', async () => {
            try {
                // Disable the select menu when time expires
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('helpTopics')
                            .setPlaceholder('Help session expired')
                            .setDisabled(true)
                            .addOptions([{ label: 'Expired', value: 'expired' }])
                    );

                // Update with disabled menu
                await interaction.editReply({
                    embeds: [embed.setFooter({ text: 'Select Start Gaming Community • Help session expired' })],
                    components: [disabledRow]
                });
            } catch (error) {
                console.error('Error disabling menu:', error);
            }
        });
    },

    // Create all the embed functions with streamlined content
    async createOverviewEmbed() {
        return new EmbedBuilder()
            .setTitle('Community Overview')
            .setColor('#2ECC71')
            .setDescription('Welcome to the Select Start Gaming Community! We focus on RetroAchievements challenges, competitions, and building a friendly retro gaming community.')
            .addFields(
                {
                    name: '🎮 Monthly Challenges',
                    value: 'Each month features a game chosen by community vote. Everyone competes to earn achievements, with monthly prizes for the top performers. Shadow games provide an extra challenge!'
                },
                {
                    name: '🏆 Point System',
                    value: 'Earn points through monthly challenges, shadow games, racing competitions, and arcade leaderboards. Points accumulate throughout the year for annual prizes.'
                },
                {
                    name: '🗳️ Game Nominations',
                    value: 'Nominate up to two games monthly. In the final week, 10 games are randomly selected for community voting to determine next month\'s challenge.'
                },
                {
                    name: '🏎️ Racing & Arcade',
                    value: 'Compete in monthly racing challenges and year-round arcade leaderboards to earn additional community points.'
                },
                {
                    name: '🏅 Year-End Awards',
                    value: 'On December 1st, yearly points are totaled and prizes are awarded to top performers across all categories.'
                }
            )
            .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
            .setTimestamp();
    },

    async createCommandsEmbed() {
        return new EmbedBuilder()
            .setTitle('Available Commands')
            .setColor('#E74C3C')
            .setDescription('Here are the commands you can use in the Select Start community:')
            .addFields(
                {
                    name: '📋 Information',
                    value: '• `/help` - Display this help information\n' + 
                           '• `/rules` - View detailed community rules and guidelines'
                },
                {
                    name: '🏆 Challenges & Leaderboards',
                    value: '• `/challenge` - View current monthly, shadow, and racing challenges\n' +
                           '• `/leaderboard` - See the monthly challenge leaderboard\n' +
                           '• `/yearlyboard` - Check the yearly points leaderboard\n' +
                           '• `/profile [username]` - View profile and achievements\n' +
                           '• `/shadowguess` - Try to unlock the hidden shadow game'
                },
                {
                    name: '🗳️ Nominations & Suggestions',
                    value: '• `/nominate` - Suggest a game for the next monthly challenge\n' +
                           '• `/nominations` - View all current nominations\n' +
                           '• `/suggest` - Submit ideas for arcade boards, racing tracks, etc.\n' +
                           '• `/vote` - Cast your vote for the next monthly challenge (when active)'
                },
                {
                    name: '🏎️ Arcade & Racing',
                    value: '• `/arcade` - Interactive menu for arcade boards and racing challenges'
                }
            )
            .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
            .setTimestamp();
    },

    async createChallengesEmbed() {
        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            let progressionInfo = '';
            let winInfo = '';
            
            if (currentChallenge) {
                // Get progression and win achievement counts
                const progressionCount = currentChallenge.monthly_challange_progression_achievements.length;
                const winCount = currentChallenge.monthly_challange_win_achievements.length;
                
                progressionInfo = `all ${progressionCount} progression achievements`;
                winInfo = winCount > 0 ? ` and at least one of the ${winCount} win achievements` : '';
            }

            return new EmbedBuilder()
                .setTitle('Monthly Challenges')
                .setColor('#9B59B6')
                .setDescription('Our community revolves around monthly challenge games chosen by community vote.')
                .addFields(
                    {
                        name: '🎮 Points System',
                        value: '**Points (Cumulative):**\n' +
                               '• Participation: 1 point (earn any achievement)\n' +
                               '• Beaten: 4 points total (includes participation + completion points)\n' +
                               '• Mastery: 7 points total (includes beaten + mastery points)\n\n' +
                               '**Monthly Prizes:**\n' +
                               'Top 3 players receive recognition and community points'
                    },
                    {
                        name: '⚠️ Key Requirements',
                        value: '• **HARDCORE MODE REQUIRED** - No save states or rewind\n' +
                               '• Fast forward is allowed\n' +
                               '• Must earn achievements during the challenge month\n\n' +
                               'Use `/challenge` to see current challenges and `/leaderboard` for standings'
                    },
                    {
                        name: '⚔️ Tiebreakers',
                        value: 'When users tie in the monthly standings, tiebreaker competitions will typically be created. Anyone can participate in tiebreakers, but only scores from tied users will count toward final rankings. Tiebreakers usually end with the monthly challenge but may be extended in special circumstances.'
                    }
                )
                .setFooter({ text: 'For detailed rules, use the /rules command' })
                .setTimestamp();
        } catch (error) {
            console.error('Error getting challenge info:', error);
            
            // Fallback embed without specific challenge details
            return new EmbedBuilder()
                .setTitle('Monthly Challenges')
                .setColor('#9B59B6')
                .setDescription('Our community revolves around monthly challenge games chosen by community vote.')
                .addFields(
                    {
                        name: '🎮 Points System',
                        value: '**Points (Cumulative):**\n' +
                               '• Participation: 1 point (earn any achievement)\n' +
                               '• Beaten: 4 points total (includes participation + completion points)\n' +
                               '• Mastery: 7 points total (includes beaten + mastery points)\n\n' +
                               '**Monthly Prizes:**\n' +
                               'Top 3 players receive recognition and community points'
                    },
                    {
                        name: '⚠️ Key Requirements',
                        value: '• **HARDCORE MODE REQUIRED** - No save states or rewind\n' +
                               '• Fast forward is allowed\n' +
                               '• Must earn achievements during the challenge month\n' +
                               '• One grace period on the last day of previous month\n\n' +
                               'Use `/challenge` to see current challenges and `/leaderboard` for standings'
                    },
                    {
                        name: '⚔️ Tiebreakers',
                        value: 'When users tie in the monthly standings, tiebreaker competitions may be created to determine final rankings.'
                    }
                )
                .setFooter({ text: 'For detailed rules, use the /rules command' })
                .setTimestamp();
        }
    },

    async createShadowEmbed() {
        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            // Get current challenge to check shadow game status
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });
            
            const embed = new EmbedBuilder()
                .setTitle('Shadow Game Challenge')
                .setColor('#9B59B6')
                .setDescription('Shadow games are hidden monthly bonus challenges that unlock additional ways to earn points.')
                .addFields({
                    name: 'How It Works',
                    value: '• A shadow game is hidden each month\n' +
                           '• Try to guess it using `/shadowguess`\n' +
                           '• Once revealed, everyone can participate\n' +
                           '• Past month shadow games are automatically revealed'
                },
                {
                    name: '👥 Points System',
                    value: '**Points (Cumulative):**\n' +
                           '• Participation: 1 point (any achievement)\n' +
                           '• Beaten: 4 points total (includes participation points)\n\n' +
                           'Shadow games are capped at "Beaten" status (4 points maximum)'
                },
                {
                    name: '🔍 Guessing the Shadow Game',
                    value: 'Use `/shadowguess` with the exact game title\n\n' +
                           'Correct guesses reveal the game for everyone. No penalties for wrong guesses.\n\n' +
                           'Hint: While shadow games may be thematically related to the monthly challenge, they typically offer different gameplay experiences (different genre, length, or tone)!'
                })
                .setFooter({ text: 'For detailed rules, use the /rules command' })
                .setTimestamp();

            if (currentChallenge && currentChallenge.shadow_challange_gameid && currentChallenge.shadow_challange_revealed) {
                // Shadow game is revealed - get game info
                const shadowGameInfo = await retroAPI.getGameInfo(currentChallenge.shadow_challange_gameid);
                
                // Get progression and win achievement counts for shadow
                const progressionCount = currentChallenge.shadow_challange_progression_achievements.length;
                const winCount = currentChallenge.shadow_challange_win_achievements.length;
                
                embed.addFields({
                    name: 'Current Challenge',
                    value: `**Game:** ${shadowGameInfo.title} (${shadowGameInfo.consoleName})\n\n` +
                           '**Beaten Requirements:**\n' +
                           `• Complete all ${progressionCount} progression achievements` +
                           (winCount > 0 ? `\n• Earn at least one win achievement` : '')
                });
                
                embed.setURL(`https://retroachievements.org/game/${currentChallenge.shadow_challange_gameid}`);
                
                if (shadowGameInfo.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${shadowGameInfo.imageIcon}`);
                }
            }

            return embed;
        } catch (error) {
            console.error('Shadow Rules Error:', error);
            
            // Fallback embed
            return new EmbedBuilder()
                .setTitle('Shadow Game Challenge')
                .setColor('#9B59B6')
                .setDescription('Shadow games are hidden monthly bonus challenges that unlock additional ways to earn points.')
                .addFields({
                    name: 'How It Works',
                    value: '• A shadow game is hidden each month\n' +
                           '• Try to guess it using `/shadowguess`\n' +
                           '• Once revealed, everyone can participate\n' +
                           '• Past month shadow games are automatically revealed'
                },
                {
                    name: '👥 Points System',
                    value: '**Points (Cumulative):**\n' +
                           '• Participation: 1 point (any achievement)\n' +
                           '• Beaten: 4 points total (includes participation points)\n\n' +
                           'Shadow games are capped at "Beaten" status (4 points maximum)'
                },
                {
                    name: '🔍 Guessing the Shadow Game',
                    value: 'Use `/shadowguess` with the exact game title\n\n' +
                           'Correct guesses reveal the game for everyone. No penalties for wrong guesses.\n\n' +
                           'Hint: Shadow games often relate thematically to the monthly challenge!'
                })
                .setFooter({ text: 'For detailed rules, use the /rules command' })
                .setTimestamp();
        }
    },

    async createArcadeEmbed() {
        return new EmbedBuilder()
            .setTitle('Arcade & Racing Challenges')
            .setColor('#F39C12')
            .setDescription('Compete in special competitions alongside monthly challenges for additional points:')
            .addFields(
                {
                    name: '🏎️ Monthly Racing',
                    value: '**Points:**\n' +
                           '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point\n\n' +
                           'Each month features a racing time trial. Points awarded monthly at end of challenge.'
                },
                {
                    name: '🎮 Arcade Leaderboards',
                    value: '**Points (awarded December 1st):**\n' +
                           '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point\n\n' +
                           'Year-round arcade leaderboards remain open until December 1st.'
                },
                {
                    name: '📊 Using the Arcade Menu',
                    value: 'The `/arcade` command provides an interactive menu to:\n' +
                           '• View all arcade boards\n' +
                           '• See current racing challenge\n' +
                           '• Browse past racing challenges\n' +
                           '• Check active tiebreakers\n\n' +
                           'You must place in the top 999 of the global leaderboard to appear in arcade rankings.'
                },
                {
                    name: '💡 Suggest New Boards',
                    value: 'Have a game or track to add? Use `/suggest` to submit your ideas.'
                }
            )
            .setFooter({ text: 'For detailed rules, use the /rules command' })
            .setTimestamp();
    },

    async createPointsEmbed() {
        return new EmbedBuilder()
            .setTitle('Points System')
            .setColor('#1ABC9C')
            .setDescription('Points are awarded across different activities and tracked throughout the year:')
            .addFields(
                {
                    name: '🎮 Monthly Challenge',
                    value: '**Points (Cumulative):**\n' +
                           '• Participation: 1 point\n' +
                           '• Beaten: 4 points total\n' +
                           '• Mastery: 7 points total'
                },
                {
                    name: '👥 Shadow Challenge',
                    value: '**Points (Cumulative):**\n' +
                           '• Participation: 1 point\n' +
                           '• Beaten: 4 points total\n\n' +
                           'Shadow games are capped at "Beaten" status (4 points maximum)'
                },
                {
                    name: '🏎️ Racing Challenge',
                    value: '**Points (Awarded Monthly):**\n' +
                           '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point'
                },
                {
                    name: '🎮 Arcade Leaderboard',
                    value: '**Points (Awarded December 1st):**\n' +
                           '• 1st Place: 3 points\n' +
                           '• 2nd Place: 2 points\n' +
                           '• 3rd Place: 1 point\n\n' +
                           'Points awarded for each arcade board separately.'
                },
                {
                    name: '📊 Tracking Progress',
                    value: '• `/leaderboard` - Monthly challenge standings\n' +
                           '• `/yearlyboard` - Annual points leaderboard\n' +
                           '• `/profile` - Personal achievements and points'
                }
            )
            .setFooter({ text: 'For detailed points breakdown, use the /rules command' })
            .setTimestamp();
    },

    async createNominationsEmbed() {
        return new EmbedBuilder()
            .setTitle('Game Nominations & Voting')
            .setColor('#3498DB')
            .setDescription('Our monthly challenges are determined through a community nomination and voting process:')
            .addFields(
                {
                    name: '🗳️ How to Nominate',
                    value: '• Each member can nominate up to **2 games per month**\n' +
                           '• Use `/nominate gameid:X` with the RetroAchievements game ID\n' +
                           '• Find Game IDs in RetroAchievements URLs: `retroachievements.org/game/1` → ID is `1`\n' +
                           '• View all nominations with `/nominations`'
                },
                {
                    name: '🗳️ Voting Process',
                    value: '• Last week of month: **10 games randomly selected** from nominations\n' +
                           '• Community members vote for up to 2 games\n' +
                           '• Game with most votes becomes next monthly challenge'
                },
                {
                    name: '📋 Nomination Guidelines',
                    value: 'Consider these factors when nominating:\n' +
                           '• **Accessibility**: Games available on common platforms\n' +
                           '• **Balance**: Mix of easy to challenging achievements\n' +
                           '• **Completion Time**: Games beatable within a month\n' +
                           '• **PS2 and GameCube games are NOT eligible**'
                },
                {
                    name: '💡 Need to Change Your Nomination?',
                    value: 'Ask an admin to use `/clearnominations` to reset your nominations'
                }
            )
            .setFooter({ text: 'Press "Supported Platforms" to see eligible platforms or "Back to Menu" to return' })
            .setTimestamp();
    },
    
    async createRulesEmbed() {
        return new EmbedBuilder()
            .setTitle('Community Rules')
            .setColor('#3498DB')
            .setDescription('Key rules for the Select Start Gaming Community:')
            .addFields(
                {
                    name: '👤 Conduct',
                    value: '• Treat all members with respect\n' +
                           '• No harassment or hate speech\n' +
                           '• Keep discussions family-friendly\n' +
                           '• Follow channel topic guidelines'
                },
                {
                    name: '🎮 Achievement Requirements',
                    value: '• **HARDCORE MODE REQUIRED** for all challenges\n' +
                           '• No save states or rewind features\n' +
                           '• Fast forward is permitted\n' +
                           '• Submit achievements honestly\n' +
                           '• Follow all RetroAchievements rules'
                },
                {
                    name: '📝 Registration',
                    value: '• You must be registered by an admin using `/register`\n' +
                           '• RetroAchievements username must be linked to Discord\n' +
                           '• Place in top 999 of global leaderboard for arcade rankings'
                },
                {
                    name: '📜 Detailed Rules',
                    value: 'For a complete explanation of all community rules and guidelines, use the `/rules` command'
                }
            )
            .setFooter({ text: 'Press "Back to Menu" to return to the main menu' })
            .setTimestamp();
    },

    // Add a new function to show the platforms
    async createPlatformsEmbed() {
        return new EmbedBuilder()
            .setTitle('Supported RetroAchievements Platforms')
            .setColor('#3498DB')
            .setDescription('Complete list of platforms supported by RetroAchievements. Note that PlayStation 2 and GameCube games are not eligible for nomination in our monthly challenges.')
            .addFields(
                {
                    name: 'Nintendo',
                    value: '• Game Boy\n• Game Boy Color\n• Game Boy Advance\n• NES/Famicom\n• SNES/Super Famicom\n• Nintendo 64\n• Nintendo DS\n• Nintendo DSi\n• Pokémon Mini\n• Virtual Boy'
                },
                {
                    name: 'Sega',
                    value: '• SG-1000\n• Master System\n• Game Gear\n• Genesis/Mega Drive\n• Sega CD\n• 32X\n• Saturn\n• Dreamcast'
                },
                {
                    name: 'Sony',
                    value: '• PlayStation\n• PlayStation Portable'
                },
                {
                    name: 'Atari',
                    value: '• Atari 2600\n• Atari 7800\n• Atari Jaguar\n• Atari Jaguar CD\n• Atari Lynx'
                },
                {
                    name: 'NEC',
                    value: '• PC Engine/TurboGrafx-16\n• PC Engine CD/TurboGrafx-CD\n• PC-8000/8800\n• PC-FX'
                },
                {
                    name: 'SNK',
                    value: '• Neo Geo CD\n• Neo Geo Pocket'
                },
                {
                    name: 'Others',
                    value: '• 3DO Interactive Multiplayer\n• Amstrad CPC\n• Apple II\n• Arcade\n• Arcadia 2001\n• Arduboy\n• ColecoVision\n• Elektor TV Games Computer\n• Fairchild Channel F\n• Intellivision\n• Interton VC 4000\n• Magnavox Odyssey 2\n• Mega Duck\n• MSX\n• Standalone\n• Uzebox\n• Vectrex\n• WASM-4\n• Watara Supervision\n• WonderSwan'
                },
                {
                    name: 'Not Eligible for Nomination',
                    value: '• PlayStation 2\n• GameCube'
                }
            )
            .setFooter({ text: 'Press "Back to Nominations" to return to the nominations menu' })
            .setTimestamp();
    }
};
