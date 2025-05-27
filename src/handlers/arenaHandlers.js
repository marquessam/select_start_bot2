// src/handlers/arenaHandlers.js
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import arenaService from '../services/arenaService.js';
import arenaUtils from '../utils/arenaUtils.js';
import gpUtils from '../utils/gpUtils.js';
import { 
    EmbedBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    StringSelectMenuBuilder
} from 'discord.js';

/**
 * Handle arena-related button interactions
 */
export async function handleArenaButtonInteraction(interaction) {
    // Extract action from customId (format: arena_action_param)
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const param = parts[2];

    // Get user from database
    let user = await User.findOne({ discordId: interaction.user.id });
    if (!user) {
        return interaction.reply({
            content: '❌ You need to register with the bot first. Please use `/register` to link your RetroAchievements account.',
            ephemeral: true
        });
    }

    try {
        switch (action) {
            case 'create':
                await handleCreateChallengeButton(interaction);
                break;
            case 'view':
                await handleViewActiveButton(interaction);
                break;
            case 'claim':
                await handleClaimGPButton(interaction, user);
                break;
            case 'leaderboard':
                await handleLeaderboardButton(interaction);
                break;
            case 'my':
                await handleMyChallengesButton(interaction, user);
                break;
            case 'accept':
                await handleAcceptChallenge(interaction, user, param);
                break;
            case 'decline':
                await handleDeclineChallenge(interaction, user, param);
                break;
            case 'join':
                await handleJoinChallenge(interaction, user, param);
                break;
            case 'bet':
                await handlePlaceBetButton(interaction, user, param);
                break;
            case 'refresh':
                if (param === 'challenges' && interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
                    await handleAdminRefreshChallenges(interaction);
                }
                break;
            case 'check':
                if (param === 'completed' && interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
                    await handleAdminCheckCompleted(interaction);
                }
                break;
            case 'process':
                if (param === 'timeouts' && interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
                    await handleAdminProcessTimeouts(interaction);
                }
                break;
            default:
                await interaction.reply({
                    content: 'Unknown arena action.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error in arena button interaction:', error);
        await interaction.reply({
            content: 'An error occurred. Please try again.',
            ephemeral: true
        });
    }
}

/**
 * Handle arena-related modal submissions
 */
export async function handleArenaModalSubmit(interaction) {
    if (interaction.customId === 'arena_create_modal') {
        await handleCreateChallengeModal(interaction);
    } else if (interaction.customId.startsWith('arena_bet_modal_')) {
        await handlePlaceBetModal(interaction);
    }
}

/**
 * Handle arena-related select menu interactions
 */
export async function handleArenaSelectMenu(interaction) {
    if (interaction.customId === 'arena_leaderboard_select') {
        await handleLeaderboardSelect(interaction);
    }
}

// Button handlers
async function handleCreateChallengeButton(interaction) {
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

    const firstRow = new ActionRowBuilder().addComponents(gameIdInput);
    const secondRow = new ActionRowBuilder().addComponents(leaderboardIdInput);
    const thirdRow = new ActionRowBuilder().addComponents(wagerInput);
    const fourthRow = new ActionRowBuilder().addComponents(targetInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

    await interaction.showModal(modal);
}

async function handleViewActiveButton(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const activeChallenges = await arenaService.getActiveChallenges(5);
        
        const embed = new EmbedBuilder()
            .setTitle('🔥 Active Challenges')
            .setDescription('Current pending and active challenges')
            .setColor('#FF6600')
            .setTimestamp();

        if (activeChallenges.length === 0) {
            embed.addFields({ 
                name: 'No Active Challenges', 
                value: 'No challenges are currently active. Create one!', 
                inline: false 
            });
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
}

async function handleClaimGPButton(interaction, user) {
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
}

async function handleLeaderboardButton(interaction) {
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
}

async function handleMyChallengesButton(interaction, user) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const challenges = await arenaService.getUserChallenges(user.discordId, 10);
        
        const embed = new EmbedBuilder()
            .setTitle('📋 Your Challenge History')
            .setDescription(`Recent challenges for **${user.raUsername}**`)
            .setColor('#0099FF')
            .setTimestamp();

        if (challenges.length === 0) {
            embed.addFields({ 
                name: 'No Challenges', 
                value: 'You haven\'t participated in any challenges yet.', 
                inline: false 
            });
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
}

async function handleAcceptChallenge(interaction, user, challengeId) {
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
}

async function handleDeclineChallenge(interaction, user, challengeId) {
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
}

async function handleJoinChallenge(interaction, user, challengeId) {
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
}

async function handlePlaceBetButton(interaction, user, challengeId) {
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
}

// Admin button handlers
async function handleAdminRefreshChallenges(interaction) {
    await interaction.deferUpdate();
    
    // Re-execute the challenges view command
    try {
        const mockInteraction = {
            ...interaction,
            options: {
                getString: () => 'all'
            },
            deferReply: () => Promise.resolve(),
            editReply: (options) => interaction.editReply(options)
        };
        
        // This would need to be imported from the admin command
        // For now, just send a simple update message
        await interaction.editReply({
            content: '🔄 Challenges refreshed! Use `/adminarena challenges` to see updated list.',
            components: []
        });
    } catch (error) {
        console.error('Error refreshing challenges:', error);
        await interaction.editReply({
            content: '❌ Error refreshing challenges.',
            components: []
        });
    }
}

async function handleAdminCheckCompleted(interaction) {
    await interaction.deferUpdate();
    
    try {
        await arenaService.checkCompletedChallenges();
        await interaction.editReply({
            content: '✅ Completed challenges check executed. Check console for results.',
            components: []
        });
    } catch (error) {
        console.error('Error checking completed challenges:', error);
        await interaction.editReply({
            content: '❌ Error checking completed challenges.',
            components: []
        });
    }
}

async function handleAdminProcessTimeouts(interaction) {
    await interaction.deferUpdate();
    
    try {
        await arenaService.checkAndProcessTimeouts();
        await interaction.editReply({
            content: '✅ Timeout processing executed. Check console for results.',
            components: []
        });
    } catch (error) {
        console.error('Error processing timeouts:', error);
        await interaction.editReply({
            content: '❌ Error processing timeouts.',
            components: []
        });
    }
}

// Modal submission handlers
async function handleCreateChallengeModal(interaction) {
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
        try {
            const arenaChannel = await interaction.client.channels.fetch(process.env.ARENA_CHANNEL_ID);
            if (arenaChannel) {
                const publicEmbed = arenaUtils.createChallengeEmbed(challenge, '#00FF00');
                await arenaChannel.send({ embeds: [publicEmbed] });
            }
        } catch (channelError) {
            console.error('Error posting to arena channel:', channelError);
        }

    } catch (error) {
        console.error('Error creating challenge:', error);
        await interaction.editReply(`❌ Error: ${error.message}`);
    }
}

async function handlePlaceBetModal(interaction) {
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
}

// Select menu handlers
async function handleLeaderboardSelect(interaction) {
    await interaction.deferUpdate();
    
    const type = interaction.values[0];
    
    try {
        let leaderboard, title, description;

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
            embed.addFields({ 
                name: 'No Data', 
                value: 'No users found for this leaderboard.', 
                inline: false 
            });
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

            embed.addFields({ 
                name: 'Rankings', 
                value: leaderboardText, 
                inline: false 
            });
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

        await interaction.editReply({ 
            embeds: [embed],
            components: [] // Remove the select menu after selection
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        await interaction.editReply({
            content: 'An error occurred while fetching the leaderboard. Please try again.',
            components: []
        });
    }
}
