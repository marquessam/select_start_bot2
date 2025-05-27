// src/commands/user/arena.js
import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ButtonBuilder, 
    ActionRowBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { User } from '../../models/User.js';
import { ArenaChallenge } from '../../models/ArenaChallenge.js';
import arenaService from '../../services/arenaService.js';
import arenaUtils from '../../utils/arenaUtils.js';
import gpUtils from '../../utils/gpUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arena')
        .setDescription('Arena challenge system - create challenges, place bets, and compete!')
        .addSubcommand(subcommand =>
            subcommand
                .setName('menu')
                .setDescription('Open the main arena menu')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('claim')
                .setDescription('Claim your monthly 1,000 GP allowance')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('balance')
                .setDescription('Check your GP balance and recent transactions')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View GP and arena statistics leaderboards')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of leaderboard to display')
                        .setRequired(false)
                        .addChoices(
                            { name: 'GP Balance', value: 'gp' },
                            { name: 'Challenges Won', value: 'wins' },
                            { name: 'Total GP Won', value: 'total_won' },
                            { name: 'Bet Win Rate', value: 'bet_rate' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('challenge')
                .setDescription('View details of a specific challenge')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Challenge ID')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('View your challenge history')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // Get or create user
        let user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
            return interaction.reply({
                content: '❌ You need to register with the bot first. Please use `/register` to link your RetroAchievements account.',
                ephemeral: true
            });
        }

        switch (subcommand) {
            case 'menu':
                await this.handleMainMenu(interaction, user);
                break;
            case 'claim':
                await this.handleClaimGP(interaction, user);
                break;
            case 'balance':
                await this.handleBalance(interaction, user);
                break;
            case 'leaderboard':
                await this.handleLeaderboard(interaction);
                break;
            case 'challenge':
                await this.handleViewChallenge(interaction);
                break;
            case 'history':
                await this.handleHistory(interaction, user);
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand.',
                    ephemeral: true
                });
        }
    },

    async handleMainMenu(interaction, user) {
        const embed = new EmbedBuilder()
            .setTitle('🏟️ Arena Challenge System')
            .setDescription(
                `Welcome to the Arena, **${user.raUsername}**!\n\n` +
                `💰 **Your GP Balance:** ${gpUtils.formatGP(user.gpBalance)}\n` +
                `🏆 **Challenges Won:** ${user.arenaStats?.challengesWon || 0}\n` +
                `📊 **Win Rate:** ${user.getGpWinRate()}%\n\n` +
                `Choose an action below:`
            )
            .setColor('#00FF00')
            .setTimestamp();

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arena_create_challenge')
                    .setLabel('Create Challenge')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚔️'),
                new ButtonBuilder()
                    .setCustomId('arena_view_active')
                    .setLabel('View Active')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔥'),
                new ButtonBuilder()
                    .setCustomId('arena_claim_gp')
                    .setLabel('Claim GP')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎁'),
                new ButtonBuilder()
                    .setCustomId('arena_leaderboard')
                    .setLabel('Leaderboard')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🏆'),
                new ButtonBuilder()
                    .setCustomId('arena_my_challenges')
                    .setLabel('My Challenges')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📋')
            );

        await interaction.reply({
            embeds: [embed],
            components: [buttons],
            ephemeral: false
        });
    },

    async handleClaimGP(interaction, user) {
        try {
            const result = await gpUtils.claimMonthlyGP(user);
            
            const embed = new EmbedBuilder()
                .setTitle('🎁 Monthly GP Claimed!')
                .setDescription(
                    `You've successfully claimed your monthly GP allowance!\n\n` +
                    `💰 **Amount Received:** ${gpUtils.formatGP(result.amount)}\n` +
                    `💳 **New Balance:** ${gpUtils.formatGP(result.newBalance)}\n\n` +
                    `You can claim your next allowance at the start of next month.`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ GP Claim Failed')
                .setDescription(error.message)
                .setColor('#FF0000');

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async handleBalance(interaction, user) {
        const transactions = await gpUtils.getTransactionHistory(user, 10);
        
        const embed = new EmbedBuilder()
            .setTitle('💰 Your Arena Balance')
            .setDescription(
                `**Current Balance:** ${gpUtils.formatGP(user.gpBalance)}\n` +
                `**Monthly Claim:** ${user.canClaimMonthlyGp() ? '✅ Available' : '❌ Already claimed'}\n\n` +
                `**Arena Stats:**\n` +
                `🏆 Challenges Won: ${user.arenaStats?.challengesWon || 0}\n` +
                `🎯 Challenges Participated: ${user.arenaStats?.challengesParticipated || 0}\n` +
                `💎 Total GP Won: ${gpUtils.formatGP(user.arenaStats?.totalGpWon || 0)}\n` +
                `💸 Total GP Wagered: ${gpUtils.formatGP(user.arenaStats?.totalGpWagered || 0)}\n` +
                `🎰 Bets Won: ${user.arenaStats?.betsWon || 0}/${user.arenaStats?.betsPlaced || 0}`
            )
            .setColor('#0099FF')
            .setTimestamp();

        if (transactions.length > 0) {
            const transactionText = transactions
                .map(tx => {
                    const formatted = gpUtils.formatTransaction(tx);
                    const date = tx.timestamp.toLocaleDateString();
                    return `${formatted.emoji} **${formatted.amount} GP** - ${formatted.description} *(${date})*`;
                })
                .join('\n');
            
            embed.addFields({
                name: '📝 Recent Transactions (Last 10)',
                value: transactionText.length > 1024 ? transactionText.substring(0, 1021) + '...' : transactionText,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleLeaderboard(interaction) {
        await interaction.deferReply();

        const type = interaction.options.getString('type') || 'gp';
        let leaderboard, title, description;

        try {
            switch (type) {
                case 'gp':
                    leaderboard = await gpUtils.getGPLeaderboard(10);
                    title = '💰 GP Balance Leaderboard';
                    description = 'Top users by current GP balance';
                    break;
                case 'wins':
                    leaderboard = await gpUtils.getArenaStatsLeaderboard('challengesWon', 10);
                    title = '🏆 Challenge Winners Leaderboard';
                    description = 'Top users by challenges won';
                    break;
                case 'total_won':
                    leaderboard = await gpUtils.getArenaStatsLeaderboard('totalGpWon', 10);
                    title = '💎 Total GP Won Leaderboard';
                    description = 'Top users by total GP won from challenges';
                    break;
                case 'bet_rate':
                    leaderboard = await gpUtils.getArenaStatsLeaderboard('betsWon', 10);
                    title = '🎰 Betting Champions Leaderboard';
                    description = 'Top users by betting success';
                    break;
                default:
                    leaderboard = await gpUtils.getGPLeaderboard(10);
                    title = '💰 GP Balance Leaderboard';
                    description = 'Top users by current GP balance';
            }

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor('#FFD700')
                .setTimestamp();

            if (leaderboard.length === 0) {
                embed.addFields({ name: 'No Data', value: 'No users found for this leaderboard.', inline: false });
            } else {
                const leaderboardText = leaderboard
                    .map(user => {
                        const medal = user.rank === 1 ? '🥇' : user.rank === 2 ? '🥈' : user.rank === 3 ? '🥉' : `${user.rank}.`;
                        
                        switch (type) {
                            case 'gp':
                                return `${medal} **${user.raUsername}** - ${gpUtils.formatGP(user.gpBalance)}`;
                            case 'wins':
                                return `${medal} **${user.raUsername}** - ${user.challengesWon} wins (${user.winRate}% win rate)`;
                            case 'total_won':
                                return `${medal} **${user.raUsername}** - ${gpUtils.formatGP(user.totalGpWon)} total won`;
                            case 'bet_rate':
                                return `${medal} **${user.raUsername}** - ${user.betsWon}/${user.betsPlaced} bets (${user.betWinRate}%)`;
                            default:
                                return `${medal} **${user.raUsername}** - ${gpUtils.formatGP(user.gpBalance)}`;
                        }
                    })
                    .join('\n');

                embed.addFields({ name: 'Rankings', value: leaderboardText, inline: false });
            }

            // Add system stats
            const systemStats = await gpUtils.getSystemGPStats();
            embed.addFields({
                name: '📊 System Statistics',
                value: 
                    `Total Users: ${systemStats.totalUsers}\n` +
                    `Users with GP: ${systemStats.usersWithGP}\n` +
                    `Total GP in circulation: ${gpUtils.formatGP(systemStats.totalGP)}\n` +
                    `Total challenges created: ${systemStats.totalChallengesCreated}`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching the leaderboard. Please try again.',
            });
        }
    },

    async handleViewChallenge(interaction) {
        const challengeId = interaction.options.getString('id');
        
        try {
            const challenge = await arenaService.getChallengeById(challengeId);
            
            if (!challenge) {
                return interaction.reply({
                    content: `❌ Challenge "${challengeId}" not found.`,
                    ephemeral: true
                });
            }

            const embed = arenaUtils.createChallengeEmbed(challenge);
            
            // Add participants
            if (challenge.participants.length > 0) {
                const participantsText = challenge.participants
                    .map(p => `• **${p.raUsername}** (${gpUtils.formatGP(p.wager)})`)
                    .join('\n');
                embed.addFields({ name: '👥 Participants', value: participantsText, inline: false });
            }

            // Add bets if any
            if (challenge.bets.length > 0) {
                const betsText = challenge.bets
                    .map(b => `• **${b.username}** bet ${gpUtils.formatGP(b.amount)} on **${b.targetRaUsername}**`)
                    .join('\n');
                embed.addFields({ name: '🎰 Bets', value: betsText.length > 1024 ? betsText.substring(0, 1021) + '...' : betsText, inline: false });
            }

            // Add final scores if completed
            if (challenge.status === 'completed' && challenge.finalScores.length > 0) {
                const scoresText = challenge.finalScores
                    .sort((a, b) => (a.rank || 999) - (b.rank || 999))
                    .map(score => `• **${score.raUsername}**: Rank ${score.rank || 'N/A'} (${score.score})`)
                    .join('\n');
                embed.addFields({ name: '📊 Final Scores', value: scoresText, inline: false });
            }

            // Add action buttons if applicable
            let components = [];
            
            if (challenge.status === 'pending' && challenge.targetId === interaction.user.id) {
                components.push(
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`arena_accept_${challenge.challengeId}`)
                                .setLabel('Accept Challenge')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('✅'),
                            new ButtonBuilder()
                                .setCustomId(`arena_decline_${challenge.challengeId}`)
                                .setLabel('Decline Challenge')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('❌')
                        )
                );
            } else if (challenge.canJoin() && !challenge.isParticipant(interaction.user.id)) {
                components.push(
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`arena_join_${challenge.challengeId}`)
                                .setLabel('Join Challenge')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('🔥')
                        )
                );
            }

            if (challenge.canBet() && !challenge.isParticipant(interaction.user.id)) {
                components.push(
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`arena_bet_${challenge.challengeId}`)
                                .setLabel('Place Bet')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('🎰')
                        )
                );
            }

            await interaction.reply({
                embeds: [embed],
                components: components,
                ephemeral: false
            });
        } catch (error) {
            console.error('Error viewing challenge:', error);
            await interaction.reply({
                content: 'An error occurred while fetching the challenge details.',
                ephemeral: true
            });
        }
    },

    async handleHistory(interaction, user) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const challenges = await arenaService.getUserChallenges(user.discordId, 10);
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Your Challenge History')
                .setDescription(`Recent challenges for **${user.raUsername}**`)
                .setColor('#0099FF')
                .setTimestamp();

            if (challenges.length === 0) {
                embed.addFields({ name: 'No Challenges', value: 'You haven\'t participated in any challenges yet.', inline: false });
            } else {
                for (const challenge of challenges) {
                    const statusEmoji = {
                        'pending': '⏳',
                        'active': '🔥',
                        'completed': '✅',
                        'cancelled': '❌'
                    };

                    let resultText = '';
                    if (challenge.status === 'completed') {
                        if (challenge.winnerUserId === user.discordId) {
                            resultText = ' 🏆 **WON**';
                        } else if (challenge.winnerUserId) {
                            resultText = ' 😔 Lost';
                        } else {
                            resultText = ' 🤝 No winner';
                        }
                    }

                    const value = 
                        `${statusEmoji[challenge.status]} **${challenge.gameTitle}**${resultText}\n` +
                        `Type: ${challenge.type === 'direct' ? 'Direct' : 'Open'} | ` +
                        `Wager: ${challenge.participants.find(p => p.userId === user.discordId)?.wager || 0} GP\n` +
                        `Created: ${challenge.createdAt.toLocaleDateString()}`;

                    embed.addFields({
                        name: challenge.challengeId,
                        value: value,
                        inline: true
                    });
                }
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching user challenge history:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching your challenge history.'
            });
        }
    },

    // Button interaction handlers
    async handleButtonInteraction(interaction) {
        const [action, param] = interaction.customId.split('_').slice(1); // Remove 'arena' prefix
        
        let user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
            return interaction.reply({
                content: '❌ You need to register with the bot first.',
                ephemeral: true
            });
        }

        try {
            switch (action) {
                case 'create':
                    await this.handleCreateChallengeButton(interaction);
                    break;
                case 'view':
                    await this.handleViewActiveButton(interaction);
                    break;
                case 'claim':
                    await this.handleClaimGP(interaction, user);
                    break;
                case 'leaderboard':
                    await this.handleLeaderboardButton(interaction);
                    break;
                case 'my':
                    await this.handleMyChallengesButton(interaction, user);
                    break;
                case 'accept':
                    await this.handleAcceptChallenge(interaction, user, param);
                    break;
                case 'decline':
                    await this.handleDeclineChallenge(interaction, user, param);
                    break;
                case 'join':
                    await this.handleJoinChallenge(interaction, user, param);
                    break;
                case 'bet':
                    await this.handlePlaceBetButton(interaction, user, param);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown action.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in button interaction:', error);
            await interaction.reply({
                content: 'An error occurred. Please try again.',
                ephemeral: true
            });
        }
    },

    async handleCreateChallengeButton(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('arena_create_modal')
            .setTitle('Create Arena Challenge');

        const gameIdInput = new TextInputBuilder()
            .setCustomId('game_id')
            .setLabel('RetroAchievements Game ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 1')
            .setRequired(true);

        const leaderboardIdInput = new TextInputBuilder()
            .setCustomId('leaderboard_id')
            .setLabel('Leaderboard ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 1234')
            .setRequired(true);

        const wagerInput = new TextInputBuilder()
            .setCustomId('wager')
            .setLabel('Wager Amount (GP)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 100')
            .setRequired(true);

        const targetInput = new TextInputBuilder()
            .setCustomId('target_user')
            .setLabel('Target User (Optional - leave empty for open)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('RetroAchievements username')
            .setRequired(false);

        const firstActionRow = new ActionRowBuilder().addComponents(gameIdInput);
        const secondActionRow = new ActionRowBuilder().addComponents(leaderboardIdInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(wagerInput);
        const fourthActionRow = new ActionRowBuilder().addComponents(targetInput);

        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow);

        await interaction.showModal(modal);
    },

    // Modal submission handlers
    async handleModalSubmit(interaction) {
        if (interaction.customId === 'arena_create_modal') {
            await this.handleCreateChallengeModal(interaction);
        } else if (interaction.customId.startsWith('arena_bet_modal_')) {
            await this.handlePlaceBetModal(interaction);
        }
    },

    async handleCreateChallengeModal(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const gameId = interaction.fields.getTextInputValue('game_id');
            const leaderboardId = interaction.fields.getTextInputValue('leaderboard_id');
            const wagerText = interaction.fields.getTextInputValue('wager');
            const targetUser = interaction.fields.getTextInputValue('target_user') || null;

            // Validate inputs
            const wager = gpUtils.validateGPAmount(wagerText, 1, 10000);
            
            let user = await User.findOne({ discordId: interaction.user.id });
            if (!user.hasEnoughGp(wager)) {
                return interaction.editReply(`❌ Insufficient GP. You have ${gpUtils.formatGP(user.gpBalance)} but need ${gpUtils.formatGP(wager)}.`);
            }

            // Validate game and leaderboard
            const validation = await arenaUtils.validateGameAndLeaderboard(gameId, leaderboardId);
            
            // Create challenge
            const challenge = await arenaService.createChallenge(
                user,
                validation.game,
                validation.leaderboard,
                wager,
                targetUser
            );

            const embed = new EmbedBuilder()
                .setTitle('✅ Challenge Created!')
                .setDescription(
                    `Your ${challenge.type} challenge has been created successfully!\n\n` +
                    `**Challenge ID:** ${challenge.challengeId}\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Leaderboard:** ${challenge.leaderboardTitle}\n` +
                    `**Wager:** ${gpUtils.formatGP(wager)}\n` +
                    (targetUser ? `**Target:** ${targetUser}\n` : '') +
                    `**Status:** ${challenge.status}\n\n` +
                    (challenge.type === 'direct' ? 
                        `The target user has been notified and has 24 hours to accept.` :
                        `Your challenge is now open for others to join!`)
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Post to arena channel
            const arenaChannel = await interaction.client.channels.fetch(arenaService.client.channels.cache.find(c => c.name === 'arena')?.id);
            if (arenaChannel) {
                const publicEmbed = arenaUtils.createChallengeEmbed(challenge, '#00FF00');
                await arenaChannel.send({ embeds: [publicEmbed] });
            }

        } catch (error) {
            console.error('Error creating challenge:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    }
    async handleViewActiveButton(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const activeChallenges = await arenaService.getActiveChallenges(5);
            
            const embed = new EmbedBuilder()
                .setTitle('🔥 Active Challenges')
                .setDescription('Current pending and active challenges')
                .setColor('#FF6600')
                .setTimestamp();

            if (activeChallenges.length === 0) {
                embed.addFields({ name: 'No Active Challenges', value: 'No challenges are currently active. Create one!', inline: false });
            } else {
                for (const challenge of activeChallenges) {
                    const description = arenaUtils.formatChallengeDisplay(challenge);
                    embed.addFields({
                        name: `${challenge.challengeId} - ${challenge.gameTitle}`,
                        value: description,
                        inline: false
                    });
                }
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching active challenges:', error);
            await interaction.editReply({ content: 'Error fetching active challenges.' });
        }
    },

    async handleLeaderboardButton(interaction) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('arena_leaderboard_select')
            .setPlaceholder('Choose leaderboard type')
            .addOptions([
                {
                    label: 'GP Balance',
                    description: 'Top users by current GP balance',
                    value: 'gp',
                    emoji: '💰'
                },
                {
                    label: 'Challenges Won',
                    description: 'Top users by challenges won',
                    value: 'wins',
                    emoji: '🏆'
                },
                {
                    label: 'Total GP Won',
                    description: 'Top users by total GP won',
                    value: 'total_won',
                    emoji: '💎'
                },
                {
                    label: 'Bet Win Rate',
                    description: 'Top users by betting success',
                    value: 'bet_rate',
                    emoji: '🎰'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: 'Select which leaderboard you\'d like to view:',
            components: [row],
            ephemeral: true
        });
    },

    async handleMyChallengesButton(interaction, user) {
        await this.handleHistory(interaction, user);
    },

    async handleAcceptChallenge(interaction, user, challengeId) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const challenge = await arenaService.acceptChallenge(challengeId, user);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Challenge Accepted!')
                .setDescription(
                    `You have accepted the challenge!\n\n` +
                    `**Challenge ID:** ${challenge.challengeId}\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Your Wager:** ${gpUtils.formatGP(challenge.participants.find(p => p.userId === user.discordId).wager)}\n` +
                    `**Duration:** 7 days\n` +
                    `**Betting Closes:** In 3 days\n\n` +
                    `Good luck! 🍀`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error accepting challenge:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    async handleDeclineChallenge(interaction, user, challengeId) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const challenge = await arenaService.getChallengeById(challengeId);
            if (!challenge) {
                return interaction.editReply('❌ Challenge not found.');
            }

            // Instead of a full decline system, we'll just inform the user
            // The challenge will timeout after 24 hours automatically
            await interaction.editReply({
                content: `❌ Challenge declined. The challenge will automatically timeout and refund the creator if not accepted within 24 hours.`
            });
        } catch (error) {
            console.error('Error declining challenge:', error);
            await interaction.editReply('❌ Error declining challenge.');
        }
    },

    async handleJoinChallenge(interaction, user, challengeId) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const challenge = await arenaService.joinChallenge(challengeId, user);
            
            const wager = challenge.participants.find(p => p.userId === user.discordId).wager;
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Challenge Joined!')
                .setDescription(
                    `You have joined the open challenge!\n\n` +
                    `**Challenge ID:** ${challenge.challengeId}\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Your Wager:** ${gpUtils.formatGP(wager)}\n` +
                    `**Total Participants:** ${challenge.participants.length}\n` +
                    `**Total Prize Pool:** ${gpUtils.formatGP(challenge.getTotalWager())}\n\n` +
                    `Good luck! 🍀`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error joining challenge:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    async handlePlaceBetButton(interaction, user, challengeId) {
        const challenge = await arenaService.getChallengeById(challengeId);
        if (!challenge) {
            return interaction.reply({
                content: '❌ Challenge not found.',
                ephemeral: true
            });
        }

        if (!challenge.canBet()) {
            return interaction.reply({
                content: '❌ Betting is closed for this challenge.',
                ephemeral: true
            });
        }

        // Create modal for betting
        const modal = new ModalBuilder()
            .setCustomId(`arena_bet_modal_${challengeId}`)
            .setTitle('Place Bet');

        const amountInput = new TextInputBuilder()
            .setCustomId('bet_amount')
            .setLabel('Bet Amount (GP)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., 50')
            .setRequired(true);

        // Create options for target selection (we'll handle this in the modal response)
        const participantsList = challenge.participants
            .map(p => `${p.raUsername} (${gpUtils.formatGP(p.wager)} wagered)`)
            .join('\n');

        const targetInput = new TextInputBuilder()
            .setCustomId('bet_target')
            .setLabel('Bet On (RetroAchievements username)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Choose from: ' + challenge.participants.map(p => p.raUsername).join(', '))
            .setRequired(true);

        const firstRow = new ActionRowBuilder().addComponents(amountInput);
        const secondRow = new ActionRowBuilder().addComponents(targetInput);

        modal.addComponents(firstRow, secondRow);

        await interaction.showModal(modal);
    },

    async handlePlaceBetModal(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const challengeId = interaction.customId.split('_')[3]; // arena_bet_modal_<challengeId>
            const betAmountText = interaction.fields.getTextInputValue('bet_amount');
            const betTarget = interaction.fields.getTextInputValue('bet_target');

            const betAmount = gpUtils.validateGPAmount(betAmountText, 1, 10000);
            
            let user = await User.findOne({ discordId: interaction.user.id });
            
            const challenge = await arenaService.placeBet(challengeId, user, betTarget, betAmount);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Bet Placed!')
                .setDescription(
                    `Your bet has been placed successfully!\n\n` +
                    `**Challenge ID:** ${challenge.challengeId}\n` +
                    `**Betting On:** ${betTarget}\n` +
                    `**Bet Amount:** ${gpUtils.formatGP(betAmount)}\n` +
                    `**Total Bets on ${betTarget}:** ${gpUtils.formatGP(challenge.getBetsForUser(betTarget).reduce((sum, bet) => sum + bet.amount, 0))}\n\n` +
                    `Good luck! 🎰`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error placing bet:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    // Select menu handlers
    async handleSelectMenuInteraction(interaction) {
        if (interaction.customId === 'arena_leaderboard_select') {
            const type = interaction.values[0];
            
            // Simulate the leaderboard subcommand with the selected type
            const mockOptions = {
                getString: (name) => name === 'type' ? type : null
            };
            
            const mockInteraction = {
                ...interaction,
                options: mockOptions,
                deferReply: () => interaction.deferUpdate(),
                editReply: (options) => interaction.editReply(options)
            };

            await this.handleLeaderboard(mockInteraction);
        }
    }
};
