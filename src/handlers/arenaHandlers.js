// src/handlers/arenaHandlers.js - FIXED VERSION
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
 * Handle arena-related button interactions - FIXED WITH JOIN SUPPORT
 */
export async function handleArenaButtonInteraction(interaction) {
    // Handle new challenge interaction buttons (format: arena_challenge_{challengeId}_{action})
    if (interaction.customId.startsWith('arena_challenge_')) {
        const parts = interaction.customId.split('_');
        const challengeId = parts[2];
        const action = parts[3];
        
        let user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
            return interaction.reply({
                content: '❌ You need to register with the bot first. Please use `/register` to link your RetroAchievements account.',
                ephemeral: true
            });
        }

        try {
            switch (action) {
                case 'join':
                    await handleJoinChallenge(interaction, user, challengeId);
                    break;
                case 'bet':
                    await handleChallengeSpecificBet(interaction, user, challengeId);
                    break;
                case 'info':
                    await handleChallengeInfo(interaction, challengeId);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown challenge action.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in challenge button interaction:', error);
            await interaction.reply({
                content: 'An error occurred. Please try again.',
                ephemeral: true
            });
        }
        return;
    }

    // Handle refresh active challenges button
    if (interaction.customId === 'arena_refresh_active') {
        try {
            const arenaCommand = await import('../commands/user/arena.js');
            await arenaCommand.default.handleViewActive(interaction);
        } catch (error) {
            console.error('Error refreshing active challenges:', error);
            await interaction.reply({
                content: 'An error occurred while refreshing. Please try again.',
                ephemeral: true
            });
        }
        return;
    }

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
            case 'quick':
                await handleQuickActions(interaction, user, param);
                break;
            case 'refresh':
                await handleRefreshMenu(interaction, user);
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
            // Admin actions
            case 'admin':
                if (interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
                    await handleAdminActions(interaction, param);
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
    if (interaction.customId === 'arena_action_select') {
        await handleMainMenuSelect(interaction);
    } else if (interaction.customId === 'arena_leaderboard_select') {
        await handleLeaderboardSelect(interaction);
    } else if (interaction.customId === 'arena_betting_select') {
        await handleBettingSelect(interaction);
    }
}

// Quick action handlers (REMOVED 'claim' action)
async function handleQuickActions(interaction, user, action) {
    const arenaCommand = await import('../commands/user/arena.js');
    
    switch (action) {
        case 'create':
            await showCreateChallengeModal(interaction);
            break;
        case 'active':
            await arenaCommand.default.handleViewActive(interaction);
            break;
        default:
            await interaction.reply({
                content: 'Unknown quick action.',
                ephemeral: true
            });
    }
}

async function handleRefreshMenu(interaction, user) {
    const arenaCommand = await import('../commands/user/arena.js');
    await interaction.deferUpdate();
    
    // Update the user data
    const updatedUser = await User.findOne({ discordId: interaction.user.id });
    
    // Use a mock interaction object to call showArenaMenu
    const mockInteraction = {
        ...interaction,
        reply: (options) => interaction.editReply(options)
    };
    
    await arenaCommand.default.showArenaMenu(mockInteraction, updatedUser);
}

// Main menu select handler (REMOVED 'claim_gp' case)
async function handleMainMenuSelect(interaction) {
    const action = interaction.values[0];
    
    let user = await User.findOne({ discordId: interaction.user.id });
    const arenaCommand = await import('../commands/user/arena.js');

    try {
        switch (action) {
            case 'create_challenge':
                await showCreateChallengeModal(interaction);
                break;
            case 'view_active':
                await arenaCommand.default.handleViewActive(interaction);
                break;
            case 'my_challenges':
                await arenaCommand.default.handleHistory(interaction, user);
                break;
            case 'browse_betting':
                await showBettingOptions(interaction);
                break;
            case 'view_balance':
                await arenaCommand.default.handleBalance(interaction, user);
                break;
            case 'leaderboards':
                await arenaCommand.default.handleLeaderboard(interaction);
                break;
            case 'help':
                await arenaCommand.default.handleHelp(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Unknown action selected.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error handling menu selection:', error);
        await interaction.reply({
            content: 'An error occurred processing your selection. Please try again.',
            ephemeral: true
        });
    }
}

// Leaderboard select handler
async function handleLeaderboardSelect(interaction) {
    const type = interaction.values[0];
    const arenaCommand = await import('../commands/user/arena.js');
    
    await arenaCommand.default.displayLeaderboard(interaction, type);
}

// Show create challenge modal - UPDATED to include description field
async function showCreateChallengeModal(interaction) {
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

    // NEW: Description input field
    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Challenge Description')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., Mario Raceway - Time Trial! or High score - Medium Difficulty')
        .setMaxLength(200)
        .setRequired(false);

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
    const thirdRow = new ActionRowBuilder().addComponents(descriptionInput); // NEW
    const fourthRow = new ActionRowBuilder().addComponents(wagerInput);
    const fifthRow = new ActionRowBuilder().addComponents(targetInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

    await interaction.showModal(modal);
}

// Show betting options
async function showBettingOptions(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const activeChallenges = await ArenaChallenge.find({
            status: 'active',
            bettingClosedAt: { $gt: new Date() }
        }).limit(10);

        if (activeChallenges.length === 0) {
            return interaction.editReply({
                content: '🎰 **No Betting Opportunities**\n\nThere are currently no active challenges accepting bets. Check back later or create your own challenge!'
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('arena_betting_select')
            .setPlaceholder('Choose a challenge to bet on...')
            .addOptions(
                activeChallenges.map(challenge => ({
                    label: `${challenge.gameTitle} (${challenge.participants.length} players)`,
                    description: `${challenge.description || 'No description'} | Pool: ${challenge.getTotalWager()} GP`,
                    value: challenge.challengeId,
                    emoji: '🎰'
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setTitle('🎰 Available Betting Opportunities')
            .setDescription(
                `Select a challenge below to place your bet!\n\n` +
                `**How Betting Works:**\n` +
                `• Bet on who you think will win\n` +
                `• Winners split losing bets proportionally\n` +
                `• House guarantees 50% profit for sole bettors\n` +
                `• Betting closes 3 days after challenge start`
            )
            .setColor('#FF6600')
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error showing betting options:', error);
        await interaction.editReply({
            content: 'An error occurred while loading betting options. Please try again.'
        });
    }
}

// Handle betting challenge selection
async function handleBettingSelect(interaction) {
    const challengeId = interaction.values[0];
    
    const challenge = await ArenaChallenge.findOne({ challengeId });
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

    // Check if user is a participant
    if (challenge.isParticipant(interaction.user.id)) {
        return interaction.reply({
            content: '❌ You cannot bet on a challenge you\'re participating in.',
            ephemeral: true
        });
    }

    // Show betting modal
    const modal = new ModalBuilder()
        .setCustomId(`arena_bet_modal_${challengeId}`)
        .setTitle(`Bet on: ${challenge.gameTitle}`);

    const amountInput = new TextInputBuilder()
        .setCustomId('bet_amount')
        .setLabel('Bet Amount (GP)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 50')
        .setRequired(true);

    const participantsList = challenge.participants
        .map(p => p.raUsername)
        .join(', ');

    const targetInput = new TextInputBuilder()
        .setCustomId('bet_target')
        .setLabel('Bet On (RetroAchievements username)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Choose from: ${participantsList}`)
        .setRequired(true);

    const infoInput = new TextInputBuilder()
        .setCustomId('bet_info')
        .setLabel('Challenge Info (READ ONLY)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(
            `Game: ${challenge.gameTitle}\n` +
            `Description: ${challenge.description || 'No description provided'}\n` +
            `Participants: ${participantsList}\n` +
            `Total Wager Pool: ${challenge.getTotalWager()} GP\n` +
            `Betting closes: ${challenge.bettingClosedAt.toLocaleDateString()}`
        )
        .setRequired(false);

    const firstRow = new ActionRowBuilder().addComponents(amountInput);
    const secondRow = new ActionRowBuilder().addComponents(targetInput);
    const thirdRow = new ActionRowBuilder().addComponents(infoInput);

    modal.addComponents(firstRow, secondRow, thirdRow);

    await interaction.showModal(modal);
}

// Challenge action handlers
async function handleAcceptChallenge(interaction, user, challengeId) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const challenge = await arenaService.acceptChallenge(challengeId, user, interaction.user.username);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Challenge Accepted!')
            .setDescription(
                `You have accepted the challenge!\n\n` +
                `**Challenge ID:** ${challenge.challengeId}\n` +
                `**Game:** ${challenge.gameTitle}\n` +
                `**Description:** ${challenge.description || 'No description provided'}\n` +
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
        const challenge = await arenaService.joinChallenge(challengeId, user, interaction.user.username);
        
        const wager = challenge.participants.find(p => p.userId === user.discordId).wager;
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Challenge Joined!')
            .setDescription(
                `You have joined the open challenge!\n\n` +
                `**Challenge ID:** ${challenge.challengeId}\n` +
                `**Game:** ${challenge.gameTitle}\n` +
                `**Description:** ${challenge.description || 'No description provided'}\n` +
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
    // This is called from challenge detail views - redirect to betting options
    await showBettingOptions(interaction);
}

// NEW: Handle betting on a specific challenge from the View Active list
async function handleChallengeSpecificBet(interaction, user, challengeId) {
    const challenge = await ArenaChallenge.findOne({ challengeId });
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

    // Check if user is a participant
    if (challenge.isParticipant(interaction.user.id)) {
        return interaction.reply({
            content: '❌ You cannot bet on a challenge you\'re participating in.',
            ephemeral: true
        });
    }

    // Show betting modal directly for this challenge
    const modal = new ModalBuilder()
        .setCustomId(`arena_bet_modal_${challengeId}`)
        .setTitle(`Bet on: ${challenge.gameTitle}`);

    const amountInput = new TextInputBuilder()
        .setCustomId('bet_amount')
        .setLabel('Bet Amount (GP)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., 50')
        .setRequired(true);

    const participantsList = challenge.participants
        .map(p => p.raUsername)
        .join(', ');

    const targetInput = new TextInputBuilder()
        .setCustomId('bet_target')
        .setLabel('Bet On (RetroAchievements username)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Choose from: ${participantsList}`)
        .setRequired(true);

    const infoInput = new TextInputBuilder()
        .setCustomId('bet_info')
        .setLabel('Challenge Info (READ ONLY)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(
            `Game: ${challenge.gameTitle}\n` +
            `Description: ${challenge.description || 'No description provided'}\n` +
            `Participants: ${participantsList}\n` +
            `Total Wager Pool: ${challenge.getTotalWager()} GP\n` +
            `Betting closes: ${challenge.bettingClosedAt.toLocaleDateString()}`
        )
        .setRequired(false);

    const firstRow = new ActionRowBuilder().addComponents(amountInput);
    const secondRow = new ActionRowBuilder().addComponents(targetInput);
    const thirdRow = new ActionRowBuilder().addComponents(infoInput);

    modal.addComponents(firstRow, secondRow, thirdRow);

    await interaction.showModal(modal);
}

// NEW: Handle showing detailed info about a specific challenge
async function handleChallengeInfo(interaction, challengeId) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const challenge = await ArenaChallenge.findOne({ challengeId });
        if (!challenge) {
            return interaction.editReply('❌ Challenge not found.');
        }

        const embed = new EmbedBuilder()
            .setTitle(`${challenge.type === 'direct' ? '⚔️ Direct' : '🌍 Open'} Challenge Info`)
            .setColor(challenge.type === 'direct' ? '#FF0000' : '#0099FF')
            .setTimestamp();

        // Basic challenge info
        embed.addFields([
            { name: 'Challenge ID', value: challenge.challengeId, inline: true },
            { name: 'Game', value: challenge.gameTitle, inline: true },
            { name: 'Status', value: challenge.status.toUpperCase(), inline: true },
            { name: 'Leaderboard', value: challenge.leaderboardTitle, inline: false },
            { name: 'Description', value: challenge.description || 'No description provided', inline: false },
            { name: 'Created by', value: challenge.creatorRaUsername, inline: true },
            { name: 'Entry Wager', value: gpUtils.formatGP(challenge.participants[0]?.wager || 0), inline: true },
            { name: 'Total Prize Pool', value: gpUtils.formatGP(challenge.getTotalWager()), inline: true }
        ]);

        // Target user for direct challenges
        if (challenge.type === 'direct' && challenge.targetRaUsername) {
            embed.addFields({ name: 'Target Opponent', value: challenge.targetRaUsername, inline: true });
        }

        // Participants
        if (challenge.participants.length > 0) {
            const participantsList = challenge.participants
                .map((p, index) => `${index + 1}. **${p.raUsername}** (Joined: ${p.joinedAt.toLocaleDateString()})`)
                .join('\n');
            embed.addFields({ name: `Participants (${challenge.participants.length})`, value: participantsList, inline: false });
        }

        // Betting info
        if (challenge.bets.length > 0) {
            const totalBets = challenge.getTotalBets();
            embed.addFields({ name: '🎰 Betting Pool', value: `${gpUtils.formatGP(totalBets)} from ${challenge.bets.length} bet(s)`, inline: true });
        }

        // Timing info
        if (challenge.status === 'active') {
            const endTime = challenge.endedAt.toLocaleDateString();
            const bettingEndTime = challenge.bettingClosedAt.toLocaleDateString();
            embed.addFields([
                { name: 'Challenge Ends', value: endTime, inline: true },
                { name: 'Betting Closes', value: bettingEndTime, inline: true }
            ]);
        } else if (challenge.status === 'pending') {
            const timeoutDate = new Date(challenge.createdAt.getTime() + 24 * 60 * 60 * 1000);
            embed.addFields({ name: 'Expires', value: timeoutDate.toLocaleDateString(), inline: true });
        }

        // Add action buttons if applicable
        const actionButtons = new ActionRowBuilder();
        const user = await User.findOne({ discordId: interaction.user.id });
        const isParticipant = challenge.isParticipant(interaction.user.id);
        
        if (challenge.type === 'open' && challenge.status === 'active' && !isParticipant) {
            actionButtons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`arena_challenge_${challengeId}_join`)
                    .setLabel(`Join Challenge (${gpUtils.formatGP(challenge.participants[0].wager)})`)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('⚔️')
            );
        }
        
        if (challenge.status === 'active' && !isParticipant && challenge.canBet()) {
            actionButtons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`arena_challenge_${challengeId}_bet`)
                    .setLabel('Place Bet')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎰')
            );
        }

        const components = actionButtons.components.length > 0 ? [actionButtons] : [];

        await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
        console.error('Error showing challenge info:', error);
        await interaction.editReply('❌ Error loading challenge information.');
    }
}

// Modal submission handlers - UPDATED to handle description
async function handleCreateChallengeModal(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const gameId = interaction.fields.getTextInputValue('game_id');
        const leaderboardId = interaction.fields.getTextInputValue('leaderboard_id');
        const description = interaction.fields.getTextInputValue('description') || ''; // NEW
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
        
        // Create challenge with description and Discord username
        const challenge = await arenaService.createChallenge(
            user,
            validation.game,
            validation.leaderboard,
            wager,
            targetUser,
            interaction.user.username, // Pass Discord username
            description // NEW: Pass description
        );

        const embed = new EmbedBuilder()
            .setTitle('✅ Challenge Created!')
            .setDescription(
                `Your ${challenge.type} challenge has been created successfully!\n\n` +
                `**Challenge ID:** ${challenge.challengeId}\n` +
                `**Game:** ${challenge.gameTitle}\n` +
                `**Leaderboard:** ${challenge.leaderboardTitle}\n` +
                `**Description:** ${challenge.description || 'No description provided'}\n` +
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
        
        const challenge = await arenaService.placeBet(challengeId, user, betTarget, betAmount, interaction.user.username);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Bet Placed!')
            .setDescription(
                `Your bet has been placed successfully!\n\n` +
                `**Challenge ID:** ${challenge.challengeId}\n` +
                `**Challenge:** ${challenge.description || challenge.gameTitle}\n` +
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

// Admin handlers
async function handleAdminActions(interaction, action) {
    // Basic admin action handling
    switch (action) {
        case 'refresh':
            await interaction.update({
                content: '🔄 Refreshed! Use `/adminarena` commands for detailed admin functions.',
                components: []
            });
            break;
        default:
            await interaction.reply({
                content: 'Use `/adminarena` for admin functions.',
                ephemeral: true
            });
    }
}
