// src/handlers/arenaHandlers.js - FIXED VERSION with title truncation support
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import arenaService from '../services/arenaService.js';
import arenaUtils from '../utils/arenaUtils.js';
import gpUtils from '../utils/gpUtils.js';
import titleUtils from '../utils/titleUtils.js'; // NEW: Import title utilities
import { 
    EmbedBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

/**
 * Handle arena-related button interactions - FIXED WITH JOIN SUPPORT
 */
export async function handleArenaButtonInteraction(interaction) {
    console.log('=== ARENA BUTTON HANDLER CALLED ===');
    console.log('CustomId:', interaction.customId);
    console.log('User:', interaction.user.username);
    
    // Handle new challenge interaction buttons (format: arena_challenge_{challengeId}_{action})
    if (interaction.customId.startsWith('arena_challenge_')) {
        console.log('Processing challenge-specific button');
        
        // Find the last underscore to get the action
        const lastUnderscoreIndex = interaction.customId.lastIndexOf('_');
        const action = interaction.customId.substring(lastUnderscoreIndex + 1);
        const challengeId = interaction.customId.substring('arena_challenge_'.length, lastUnderscoreIndex);
        
        console.log('Parsed Challenge ID:', challengeId);
        console.log('Parsed Action:', action);
        
        let user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
            console.log('User not found in database');
            return interaction.reply({
                content: '❌ You need to register with the bot first. Please use `/register` to link your RetroAchievements account.',
                ephemeral: true
            });
        }

        console.log('User found:', user.raUsername);

        try {
            switch (action) {
                case 'join':
                    console.log('Calling handleJoinChallenge');
                    await handleJoinChallenge(interaction, user, challengeId);
                    break;
                case 'bet':
                    console.log('Calling handleChallengeSpecificBet');
                    await handleChallengeSpecificBet(interaction, user, challengeId);
                    break;
                case 'info':
                    console.log('Calling handleChallengeInfo');
                    await handleChallengeInfo(interaction, challengeId);
                    break;
                default:
                    console.log('UNKNOWN ACTION DETECTED:', action);
                    console.log('Action length:', action.length);
                    console.log('Action bytes:', [...action].map(c => c.charCodeAt(0)));
                    await interaction.reply({
                        content: `❌ Unknown challenge action: "${action}". Please try refreshing the challenge list.`,
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in challenge button interaction:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred. Please try again.',
                    ephemeral: true
                });
            }
        }
        return;
    }

    // Handle refresh active challenges button
    if (interaction.customId === 'arena_refresh_active') {
        console.log('Processing refresh active challenges');
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

// UPDATED: Show betting options with title truncation
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
                activeChallenges.map(challenge => {
                    // UPDATED: Use title truncation for select options
                    const truncatedTitle = titleUtils.formatChallengeTitle(challenge, 'select');
                    const truncatedDescription = titleUtils.formatChallengeDescription(
                        challenge.description, 
                        titleUtils.DISCORD_LIMITS.SELECT_OPTION_DESCRIPTION - 20 // Reserve space for pool info
                    );
                    
                    return {
                        label: truncatedTitle,
                        description: `${truncatedDescription} | Pool: ${challenge.getTotalWager()} GP`,
                        value: challenge.challengeId,
                        emoji: '🎰'
                    };
                })
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

// UPDATED: Handle betting challenge selection with title truncation
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

    // UPDATED: Show betting modal with title truncation
    const modal = new ModalBuilder()
        .setCustomId(`arena_bet_modal_${challengeId}`)
        .setTitle(titleUtils.truncateText(`Bet on: ${challenge.gameTitle}`, titleUtils.DISCORD_LIMITS.MODAL_TITLE));

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
        .setPlaceholder(`Choose from: ${titleUtils.truncateText(participantsList, 80)}`)
        .setRequired(true);

    // UPDATED: Info field with proper truncation
    const gameTitle = titleUtils.truncateGameTitleForEmbed(challenge.gameTitle);
    const description = titleUtils.formatChallengeDescription(challenge.description);
    const infoText = 
        `Game: ${gameTitle}\n` +
        `Description: ${description}\n` +
        `Participants: ${titleUtils.truncateText(participantsList, 100)}\n` +
        `Total Wager Pool: ${challenge.getTotalWager()} GP\n` +
        `Betting closes: ${challenge.bettingClosedAt.toLocaleDateString()}`;

    const infoInput = new TextInputBuilder()
        .setCustomId('bet_info')
        .setLabel('Challenge Info (READ ONLY)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(titleUtils.truncateText(infoText, 3000)) // Stay well under limit
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
        
        // UPDATED: Use title truncation for embed
        const gameTitle = titleUtils.truncateGameTitleForEmbed(challenge.gameTitle);
        const description = titleUtils.formatChallengeDescription(challenge.description);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Challenge Accepted!')
            .setDescription(
                `You have accepted the challenge!\n\n` +
                `**Challenge ID:** ${challenge.challengeId}\n` +
                `**Game:** ${gameTitle}\n` +
                `**Description:** ${description}\n` +
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
    console.log(`Attempting to join challenge: ${challengeId} for user: ${user.raUsername}`);
    
    await interaction.deferReply({ ephemeral: true });

    try {
        const challenge = await arenaService.joinChallenge(challengeId, user, interaction.user.username);
        
        const wager = challenge.participants.find(p => p.userId === user.discordId).wager;
        
        // UPDATED: Use title truncation for embed
        const gameTitle = titleUtils.truncateGameTitleForEmbed(challenge.gameTitle);
        const description = titleUtils.formatChallengeDescription(challenge.description);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Challenge Joined!')
            .setDescription(
                `You have joined the open challenge!\n\n` +
                `**Challenge ID:** ${challenge.challengeId}\n` +
                `**Game:** ${gameTitle}\n` +
                `**Description:** ${description}\n` +
                `**Your Wager:** ${gpUtils.formatGP(wager)}\n` +
                `**Total Participants:** ${challenge.participants.length}\n` +
                `**Total Prize Pool:** ${gpUtils.formatGP(challenge.getTotalWager())}\n\n` +
                `Good luck! 🍀`
            )
            .setColor('#00FF00')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        
        // Refresh the active challenges view
        setTimeout(async () => {
            try {
                const arenaCommand = await import('../commands/user/arena.js');
                // Create a mock interaction for refresh
                const mockInteraction = {
                    ...interaction,
                    reply: (options) => interaction.followUp({ ...options, ephemeral: true }),
                    editReply: (options) => interaction.followUp({ ...options, ephemeral: true }),
                    deferReply: () => Promise.resolve()
                };
                // Don't refresh automatically to avoid confusion
            } catch (error) {
                console.error('Error in post-join refresh:', error);
            }
        }, 1000);
        
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

    // UPDATED: Show betting modal directly for this challenge with title truncation
    const modal = new ModalBuilder()
        .setCustomId(`arena_bet_modal_${challengeId}`)
        .setTitle(titleUtils.truncateText(`Bet on: ${challenge.gameTitle}`, titleUtils.DISCORD_LIMITS.MODAL_TITLE));

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
        .setPlaceholder(`Choose from: ${titleUtils.truncateText(participantsList, 80)}`)
        .setRequired(true);

    // UPDATED: Info field with proper truncation
    const gameTitle = titleUtils.truncateGameTitleForEmbed(challenge.gameTitle);
    const description = titleUtils.formatChallengeDescription(challenge.description);
    const infoText = 
        `Game: ${gameTitle}\n` +
        `Description: ${description}\n` +
        `Participants: ${titleUtils.truncateText(participantsList, 100)}\n` +
        `Total Wager Pool: ${challenge.getTotalWager()} GP\n` +
        `Betting closes: ${challenge.bettingClosedAt.toLocaleDateString()}`;

    const infoInput = new TextInputBuilder()
        .setCustomId('bet_info')
        .setLabel('Challenge Info (READ ONLY)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(titleUtils.truncateText(infoText, 3000)) // Stay well under limit
        .setRequired(false);

    const firstRow = new ActionRowBuilder().addComponents(amountInput);
    const secondRow = new ActionRowBuilder().addComponents(targetInput);
    const thirdRow = new ActionRowBuilder().addComponents(infoInput);

    modal.addComponents(firstRow, secondRow, thirdRow);

    await interaction.showModal(modal);
}

// UPDATED: Handle showing detailed info about a specific challenge with title truncation
async function handleChallengeInfo(interaction, challengeId) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const challenge = await ArenaChallenge.findOne({ challengeId });
        if (!challenge) {
            return interaction.editReply('❌ Challenge not found.');
        }

        // UPDATED: Use title truncation for embed
        const gameTitle = titleUtils.formatChallengeTitle(challenge, 'embed');
        const description = titleUtils.formatChallengeDescription(challenge.description);
        const leaderboardTitle = titleUtils.truncateLeaderboardTitle(challenge.leaderboardTitle);

        const embed = new EmbedBuilder()
            .setTitle(`${challenge.type === 'direct' ? '⚔️ Direct' : '🌍 Open'} Challenge Info`)
            .setColor(challenge.type === 'direct' ? '#FF0000' : '#0099FF')
            .setTimestamp();

        // Basic challenge info
        embed.addFields([
            { name: 'Challenge ID', value: challenge.challengeId, inline: true },
            { name: 'Game', value: gameTitle, inline: true },
            { name: 'Status', value: challenge.status.toUpperCase(), inline: true },
            { name: 'Leaderboard', value: leaderboardTitle, inline: false },
            { name: 'Description', value: description, inline: false },
            { name: 'Created by', value: `⚙️ ${challenge.creatorRaUsername}`, inline: true },
            { name: 'Entry Wager', value: gpUtils.formatGP(challenge.participants[0]?.wager || 0), inline: true },
            { name: 'Total Prize Pool', value: gpUtils.formatGP(challenge.getTotalWager()), inline: true }
        ]);

        // Target user for direct challenges
        if (challenge.type === 'direct' && challenge.targetRaUsername) {
            embed.addFields({ name: 'Target Opponent', value: challenge.targetRaUsername, inline: true });
        }

        // Always show current scores/standings when participants exist
        if (challenge.participants.length > 0) {
            let participantsText = '';
            
            try {
                // Fetch current scores for all participants
                const participantUsernames = challenge.participants.map(p => p.raUsername);
                const currentScores = await fetchLeaderboardScoresFixed(
                    challenge.gameId,
                    challenge.leaderboardId,
                    participantUsernames
                );
                
                if (currentScores && currentScores.length > 0) {
                    // Sort by rank (lower is better, null ranks go to end)
                    currentScores.sort((a, b) => {
                        if (a.rank === null && b.rank === null) return 0;
                        if (a.rank === null) return 1;
                        if (b.rank === null) return -1;
                        return a.rank - b.rank;
                    });
                    
                    // Display current standings with scores and global ranks
                    currentScores.forEach((score, index) => {
                        const displayRank = index + 1;
                        const positionEmoji = displayRank === 1 ? '👑' : `${displayRank}.`;
                        
                        const creatorIndicator = score.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                        const globalRank = score.rank ? ` (Global Rank: #${score.rank})` : '';
                        const scoreText = score.score !== 'No score' ? `: ${score.score}` : ': No score yet';
                        
                        participantsText += `${positionEmoji} **${score.raUsername}**${creatorIndicator}${scoreText}${globalRank}\n`;
                    });
                } else {
                    // Fallback to participant list without scores
                    challenge.participants.forEach((participant, index) => {
                        const displayRank = index + 1;
                        const positionEmoji = displayRank === 1 ? '👑' : `${displayRank}.`;
                        const creatorIndicator = participant.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                        participantsText += `${positionEmoji} **${participant.raUsername}**${creatorIndicator}: No score yet\n`;
                    });
                }
            } catch (error) {
                console.error(`Error fetching scores for challenge info ${challenge.challengeId}:`, error);
                // Fallback to participant list without scores
                challenge.participants.forEach((participant, index) => {
                    const displayRank = index + 1;
                    const positionEmoji = displayRank === 1 ? '👑' : `${displayRank}.`;
                    const creatorIndicator = participant.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                    participantsText += `${positionEmoji} **${participant.raUsername}**${creatorIndicator}: No score yet\n`;
                });
            }
            
            const fieldTitle = challenge.status === 'active' ? 'Current Standings' : `Participants (${challenge.participants.length})`;
            
            embed.addFields({ 
                name: fieldTitle, 
                value: titleUtils.createSafeFieldValue(participantsText, titleUtils.DISCORD_LIMITS.EMBED_FIELD_VALUE),
                inline: false 
            });
        }

        // Betting information if there are bets
        if (challenge.bets.length > 0) {
            const totalBets = challenge.getTotalBets();
            embed.addFields({
                name: '🎰 Total Bets',
                value: `${gpUtils.formatGP(totalBets)} from ${challenge.bets.length} bet${challenge.bets.length !== 1 ? 's' : ''}`,
                inline: true
            });
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

        // Add action buttons if applicable with safe labels
        const actionButtons = new ActionRowBuilder();
        const user = await User.findOne({ discordId: interaction.user.id });
        const isParticipant = challenge.isParticipant(interaction.user.id);
        
        if (challenge.type === 'open' && challenge.status === 'active' && !isParticipant) {
            const joinLabel = titleUtils.ensureSafeButtonLabel(
                `Join Challenge (${gpUtils.formatGP(challenge.participants[0].wager)})`,
                'Join Challenge'
            );
            actionButtons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`arena_challenge_${challengeId}_join`)
                    .setLabel(joinLabel)
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

        // Validate embed length before sending
        const validation = titleUtils.validateEmbedLength(embed.toJSON());
        if (!validation.valid) {
            console.warn(`Embed too long (${validation.totalChars}/${validation.limit}), truncating...`);
            // If embed is too long, remove some optional fields
            embed.spliceFields(-1, 1); // Remove last field if needed
        }

        await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
        console.error('Error showing challenge info:', error);
        await interaction.editReply('❌ Error loading challenge information.');
    }
}

/**
 * HELPER: Use reliable API utilities to fetch leaderboard scores
 */
async function fetchLeaderboardScoresFixed(gameId, leaderboardId, raUsernames) {
    try {
        console.log(`Fetching leaderboard scores for game ${gameId}, leaderboard ${leaderboardId}`);

        // Use arenaUtils which has the reliable API implementation
        const currentScores = await arenaUtils.fetchLeaderboardScores(gameId, leaderboardId, raUsernames);
        
        return currentScores;
    } catch (error) {
        console.error('Error fetching leaderboard scores:', error);
        
        // Return no-score results for all users on error
        return raUsernames.map(username => ({
            raUsername: username,
            rank: null,
            score: 'No score',
            fetchedAt: new Date()
        }));
    }
}

// UPDATED: Modal submission handlers with title truncation
async function handleCreateChallengeModal(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const gameId = interaction.fields.getTextInputValue('game_id');
        const leaderboardId = interaction.fields.getTextInputValue('leaderboard_id');
        const description = interaction.fields.getTextInputValue('description') || '';
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
            description // Pass description
        );

        // UPDATED: Use title truncation for success embed
        const gameTitle = titleUtils.truncateGameTitleForEmbed(challenge.gameTitle);
        const leaderboardTitle = titleUtils.truncateLeaderboardTitle(challenge.leaderboardTitle);
        const challengeDescription = titleUtils.formatChallengeDescription(challenge.description);

        const embed = new EmbedBuilder()
            .setTitle('✅ Challenge Created!')
            .setDescription(
                `Your ${challenge.type} challenge has been created successfully!\n\n` +
                `**Challenge ID:** ${challenge.challengeId}\n` +
                `**Game:** ${gameTitle}\n` +
                `**Leaderboard:** ${leaderboardTitle}\n` +
                `**Description:** ${challengeDescription}\n` +
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
        // FIXED: Extract challenge ID from arena_bet_modal_{challengeId} format
        const challengeId = interaction.customId.substring('arena_bet_modal_'.length);
        const betAmountText = interaction.fields.getTextInputValue('bet_amount');
        const betTarget = interaction.fields.getTextInputValue('bet_target');

        console.log('Extracted challenge ID for bet:', challengeId);

        const betAmount = gpUtils.validateGPAmount(betAmountText, 1, 10000);
        
        let user = await User.findOne({ discordId: interaction.user.id });
        
        const challenge = await arenaService.placeBet(challengeId, user, betTarget, betAmount, interaction.user.username);
        
        // UPDATED: Use title truncation for bet success embed
        const challengeTitle = titleUtils.formatChallengeTitle(challenge, 'short');
        const description = titleUtils.formatChallengeDescription(challenge.description);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Bet Placed!')
            .setDescription(
                `Your bet has been placed successfully!\n\n` +
                `**Challenge ID:** ${challenge.challengeId}\n` +
                `**Challenge:** ${challengeTitle}\n` +
                `**Description:** ${description}\n` +
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
