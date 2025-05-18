import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { User } from '../../models/User.js';
import { ArenaChallenge } from '../../models/ArenaChallenge.js';
import retroAPI from '../../services/retroAPI.js';
import arenaService from '../../services/arenaService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arena')
        .setDescription('Challenge players to competitive games and bet on outcomes')
        .addSubcommand(subcommand =>
            subcommand
                .setName('manage')
                .setDescription('Manage arena challenges and bets')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('active')
                .setDescription('View active arena challenges')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('claim')
                .setDescription('Claim your monthly 1,000 GP allowance')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View the GP leaderboard')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'manage':
                await this.showManagementMenu(interaction);
                break;
            case 'active':
                await this.handleActive(interaction);
                break;
            case 'claim':
                await this.handleClaim(interaction);
                break;
            case 'leaderboard':
                await this.handleLeaderboard(interaction);
                break;
        }
    },
    
    // Show the main management menu
    async showManagementMenu(interaction) {
        try {
            // Create a menu with options for managing arena challenges
            const embed = new EmbedBuilder()
                .setColor('#FF5722')
                .setTitle('🏆 Arena Management')
                .setDescription('Select an action to perform:');

            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('arena_action')
                        .setPlaceholder('Select an action')
                        .addOptions([
                            {
                                label: 'Create Challenge',
                                description: 'Challenge another player to a competition',
                                value: 'create_challenge',
                                emoji: '⚔️'
                            },
                            {
                                label: 'Respond to Challenges',
                                description: 'Accept or decline pending challenge requests',
                                value: 'respond_challenge',
                                emoji: '🛡️'
                            },
                            {
                                label: 'Place Bet',
                                description: 'Bet on an active arena challenge',
                                value: 'place_bet',
                                emoji: '💰'
                            },
                            {
                                label: 'My Challenges',
                                description: 'View your active and pending challenges',
                                value: 'my_challenges',
                                emoji: '📋'
                            }
                        ])
                );

            await interaction.reply({
                embeds: [embed],
                components: [actionRow],
                ephemeral: true
            });
        } catch (error) {
            console.error('Error showing management menu:', error);
            await interaction.reply({
                content: 'An error occurred while preparing the arena menu.',
                ephemeral: true
            });
        }
    },
    
    // Handle all select menu interactions
    async handleSelectMenuInteraction(interaction) {
        const customId = interaction.customId;
        
        if (customId === 'arena_action') {
            const action = interaction.values[0];
            
            // Handle different actions from main menu
            switch(action) {
                case 'create_challenge':
                    await this.showCreateChallengeModal(interaction);
                    break;
                case 'respond_challenge':
                    await this.showPendingChallenges(interaction);
                    break;
                case 'place_bet':
                    await this.showActiveChallengesForBetting(interaction);
                    break;
                case 'my_challenges':
                    await this.showMyChallenges(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: 'Invalid action selected',
                        ephemeral: true
                    });
            }
        } 
        else if (customId === 'arena_pending_challenge_select') {
            await this.handlePendingChallengeSelect(interaction);
        }
        else if (customId === 'arena_bet_challenge_select') {
            await this.handleBetChallengeSelect(interaction);
        }
        else if (customId === 'arena_bet_player_select') {
            await this.handleBetPlayerSelect(interaction);
        }
    },
    
    // Show a modal for creating a challenge
    async showCreateChallengeModal(interaction) {
        try {
            await interaction.deferUpdate();
            
            // Verify user is registered
            const challenger = await User.findOne({ discordId: interaction.user.id });
            if (!challenger) {
                return interaction.editReply('You need to be registered to issue challenges. Please contact an admin.');
            }
            
            // Create modal for challenge creation
            const modal = new ModalBuilder()
                .setCustomId('arena_create_challenge_modal')
                .setTitle('Challenge Another Player');
                
            // Input for opponent's RA username
            const usernameInput = new TextInputBuilder()
                .setCustomId('opponent_username')
                .setLabel('RetroAchievements Username to Challenge')
                .setPlaceholder('Enter opponent\'s RA username')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Input for leaderboard ID
            const leaderboardInput = new TextInputBuilder()
                .setCustomId('leaderboard_id')
                .setLabel('Leaderboard ID (from retroachievements.org)')
                .setPlaceholder('e.g. 9391')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Input for wager amount
            const wagerInput = new TextInputBuilder()
                .setCustomId('wager_amount')
                .setLabel(`GP to Wager (Current Balance: ${challenger.gp || 0} GP)`)
                .setPlaceholder('Enter amount (minimum 10 GP)')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Input for challenge duration
            const durationInput = new TextInputBuilder()
                .setCustomId('duration_hours')
                .setLabel('Duration in Hours (1-168)')
                .setPlaceholder('e.g. 24 for 1 day')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Add inputs to modal
            modal.addComponents(
                new ActionRowBuilder().addComponents(usernameInput),
                new ActionRowBuilder().addComponents(leaderboardInput),
                new ActionRowBuilder().addComponents(wagerInput),
                new ActionRowBuilder().addComponents(durationInput)
            );
            
            // Show the modal
            await interaction.showModal(modal);
        } catch (error) {
            console.error('Error showing challenge creation modal:', error);
            await interaction.editReply('An error occurred while preparing the challenge form.');
        }
    },
    
    // Handle the modal submit for creating a challenge
    async handleModalSubmit(interaction) {
        const customId = interaction.customId;
        
        if (customId === 'arena_create_challenge_modal') {
            await this.handleCreateChallengeModal(interaction);
        }
        else if (customId.startsWith('arena_bet_amount_modal_')) {
            const parts = customId.split('_');
            const challengeId = parts[4];
            const playerName = parts[5];
            await this.handleBetAmountModal(interaction, challengeId, playerName);
        }
    },
    
    // Handle the modal submit for creating a challenge
    async handleCreateChallengeModal(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get form values
            const opponentUsername = interaction.fields.getTextInputValue('opponent_username');
            const leaderboardId = interaction.fields.getTextInputValue('leaderboard_id');
            const wagerAmount = parseInt(interaction.fields.getTextInputValue('wager_amount'), 10);
            const durationHours = parseInt(interaction.fields.getTextInputValue('duration_hours'), 10);
            
            // Validate inputs
            if (isNaN(wagerAmount) || wagerAmount < 10) {
                return interaction.editReply('Wager amount must be at least 10 GP.');
            }
            
            if (isNaN(durationHours) || durationHours < 1 || durationHours > 168) {
                return interaction.editReply('Duration must be between 1 and 168 hours (1 week).');
            }
            
            // Get challenger info
            const challenger = await User.findOne({ discordId: interaction.user.id });
            
            // Verify opponent exists and is registered
            const opponent = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${opponentUsername}$`, 'i') }
            });
            
            if (!opponent) {
                return interaction.editReply(`The user "${opponentUsername}" is not registered in our system.`);
            }
            
            // Prevent challenging yourself
            if (opponent.discordId === interaction.user.id) {
                return interaction.editReply('You cannot challenge yourself.');
            }
            
            // Check if user has enough GP
            if ((challenger.gp || 0) < wagerAmount) {
                return interaction.editReply(`You don't have enough GP. Your balance: ${challenger.gp || 0} GP`);
            }
            
            // Verify leaderboard exists
            try {
                const leaderboardInfo = await retroAPI.getLeaderboardInfo(leaderboardId);
                if (!leaderboardInfo || !leaderboardInfo.Title) {
                    return interaction.editReply(`Leaderboard ID ${leaderboardId} not found.`);
                }
                
                // Get game info for the leaderboard
                const gameInfo = await retroAPI.getGameInfo(leaderboardInfo.GameID);
                
                // Check for any existing challenges between these users
                const existingChallenge = await ArenaChallenge.findOne({
                    $or: [
                        {
                            challengerId: challenger.discordId,
                            challengeeId: opponent.discordId,
                            status: { $in: ['pending', 'active'] }
                        },
                        {
                            challengerId: opponent.discordId,
                            challengeeId: challenger.discordId,
                            status: { $in: ['pending', 'active'] }
                        }
                    ]
                });
                
                if (existingChallenge) {
                    let statusText = existingChallenge.status === 'pending' ? 'pending response' : 'already active';
                    return interaction.editReply(`You already have a challenge with ${opponentUsername} that is ${statusText}.`);
                }
                
                // Create the challenge
                const challenge = new ArenaChallenge({
                    challengerId: challenger.discordId,
                    challengerUsername: challenger.raUsername,
                    challengeeId: opponent.discordId,
                    challengeeUsername: opponent.raUsername,
                    leaderboardId: leaderboardId,
                    gameTitle: gameInfo.Title || leaderboardInfo.Title,
                    gameId: gameInfo.ID || leaderboardInfo.GameID,
                    iconUrl: gameInfo.ImageIcon,
                    wagerAmount: wagerAmount,
                    durationHours: durationHours,
                    status: 'pending'
                });
                
                // Save the challenge
                await challenge.save();
                
                // Update user stats
                challenger.arenaStats = challenger.arenaStats || {};
                challenger.arenaStats.challengesIssued = (challenger.arenaStats.challengesIssued || 0) + 1;
                await challenger.save();
                
                // Send notification to the arena channel
                try {
                    await arenaService.notifyNewChallenge(challenge);
                } catch (notifyError) {
                    console.error('Error notifying about new challenge:', notifyError);
                }
                
                // Create response embed
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('Challenge Created!')
                    .setDescription(
                        `You've challenged ${opponent.raUsername} to compete in ${gameInfo.Title || leaderboardInfo.Title}!\n\n` +
                        `**Wager:** ${wagerAmount} GP\n` +
                        `**Duration:** ${durationHours} hours\n\n` +
                        `They'll be notified and can use \`/arena manage\` to respond.`
                    );
                
                if (gameInfo.ImageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.ImageIcon}`);
                }
                
                return interaction.editReply({ embeds: [embed] });
            } catch (apiError) {
                console.error('Error fetching leaderboard data:', apiError);
                return interaction.editReply('Error verifying leaderboard. Please check the ID and try again.');
            }
        } catch (error) {
            console.error('Error creating challenge:', error);
            return interaction.editReply('An error occurred while creating the challenge.');
        }
    },
    
    // Show pending challenges for user to respond to
    async showPendingChallenges(interaction) {
        try {
            await interaction.deferUpdate();
            
            // Find user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to respond to challenges.');
            }
            
            // Find pending challenges for this user
            const pendingChallenges = await ArenaChallenge.find({
                challengeeId: user.discordId,
                status: 'pending'
            });
            
            if (pendingChallenges.length === 0) {
                return interaction.editReply('You have no pending challenges to respond to.');
            }
            
            // Create embed showing all pending challenges
            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('Pending Arena Challenges')
                .setDescription('Select a challenge to respond to:');
            
            // Create a select menu to choose which challenge to respond to
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('arena_pending_challenge_select')
                .setPlaceholder('Select a challenge');
                
            pendingChallenges.forEach((challenge, index) => {
                selectMenu.addOptions({
                    label: `${challenge.challengerUsername} - ${challenge.gameTitle}`,
                    description: `Wager: ${challenge.wagerAmount} GP | Duration: ${challenge.durationHours} hrs`,
                    value: challenge._id.toString()
                });
                
                // Add info to the embed
                embed.addFields({
                    name: `${index + 1}. ${challenge.challengerUsername} - ${challenge.gameTitle}`,
                    value: `**Wager:** ${challenge.wagerAmount} GP\n**Duration:** ${challenge.durationHours} hours`
                });
            });
            
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            
            await interaction.editReply({
                embeds: [embed],
                components: [selectRow]
            });
        } catch (error) {
            console.error('Error showing pending challenges:', error);
            await interaction.editReply('An error occurred while loading your pending challenges.');
        }
    },
    
    // Handle the selection of a pending challenge
    async handlePendingChallengeSelect(interaction) {
        try {
            await interaction.deferUpdate();
            
            const selectedChallengeId = interaction.values[0];
            
            // Get the challenge
            const challenge = await ArenaChallenge.findById(selectedChallengeId);
            if (!challenge || challenge.status !== 'pending') {
                return interaction.editReply('This challenge is no longer available.');
            }
            
            // Verify the user is the challengee
            if (challenge.challengeeId !== interaction.user.id) {
                return interaction.editReply('This challenge is not for you.');
            }
            
            // Get users
            const user = await User.findOne({ discordId: interaction.user.id });
            const challenger = await User.findOne({ discordId: challenge.challengerId });
            
            // Verify users have enough GP
            if (!challenger || (challenger.gp || 0) < challenge.wagerAmount) {
                // Update challenge to cancelled and notify
                challenge.status = 'cancelled';
                await challenge.save();
                
                await arenaService.notifyChallengeUpdate(challenge);
                
                return interaction.editReply(`The challenger doesn't have enough GP to cover their wager anymore. Challenge cancelled.`);
            }
            
            if ((user.gp || 0) < challenge.wagerAmount) {
                return interaction.editReply(`You don't have enough GP to accept this challenge. Your balance: ${user.gp || 0} GP`);
            }
            
            // Create an embed with challenge details
            const embed = new EmbedBuilder()
                .setColor('#FF5722')
                .setTitle(`Challenge from ${challenge.challengerUsername}`)
                .setDescription(
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n` +
                    `**Duration:** ${challenge.durationHours} hours\n\n` +
                    `Do you want to accept or decline this challenge?`
                );
            
            // Create buttons for accepting or declining
            const buttonsRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arena_accept_challenge_${selectedChallengeId}`)
                        .setLabel('Accept Challenge')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`arena_decline_challenge_${selectedChallengeId}`)
                        .setLabel('Decline Challenge')
                        .setStyle(ButtonStyle.Danger)
                );
            
            await interaction.editReply({
                embeds: [embed],
                components: [buttonsRow]
            });
        } catch (error) {
            console.error('Error selecting pending challenge:', error);
            await interaction.editReply('An error occurred while loading the challenge details.');
        }
    },
    
    // Show active challenges for betting
    async showActiveChallengesForBetting(interaction) {
        try {
            await interaction.deferUpdate();
            
            // Find user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to place bets.');
            }
            
            // Find active challenges
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: new Date() }
            });
            
            if (activeChallengers.length === 0) {
                return interaction.editReply('There are no active challenges to bet on.');
            }
            
            // Filter out challenges the user is participating in
            const bettableChallenges = activeChallengers.filter(
                challenge => challenge.challengerId !== user.discordId && challenge.challengeeId !== user.discordId
            );
            
            if (bettableChallenges.length === 0) {
                return interaction.editReply('There are no active challenges available for you to bet on. You cannot bet on challenges you are participating in.');
            }
            
            // Create embed showing all active challenges
            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle('Active Arena Challenges - Place a Bet')
                .setDescription('Select a challenge to bet on:');
            
            // Create a select menu
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('arena_bet_challenge_select')
                .setPlaceholder('Select a challenge');
                
            bettableChallenges.forEach((challenge, index) => {
                // Check if user already has a bet on this challenge
                const existingBet = challenge.bets.find(bet => bet.userId === user.discordId);
                let label = `${challenge.challengerUsername} vs ${challenge.challengeeUsername}`;
                
                if (existingBet) {
                    label += ` (Bet: ${existingBet.betAmount} GP on ${existingBet.targetPlayer})`;
                }
                
                selectMenu.addOptions({
                    label: label.substring(0, 100),
                    description: `${challenge.gameTitle} | Pool: ${challenge.totalPool || 0} GP`,
                    value: challenge._id.toString()
                });
                
                // Add info to the embed
                const timeRemaining = this.formatTimeRemaining(challenge.endDate);
                const totalPool = (challenge.totalPool || 0) + (challenge.wagerAmount * 2);
                
                embed.addFields({
                    name: `${index + 1}. ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`,
                    value: `**Game:** ${challenge.gameTitle}\n` +
                           `**Wager Pool:** ${challenge.wagerAmount * 2} GP\n` +
                           `**Total Betting Pool:** ${totalPool} GP\n` +
                           `**Ends:** ${timeRemaining}`
                });
                
                if (existingBet) {
                    embed.addFields({
                        name: `Your Bet on Challenge #${index + 1}`,
                        value: `**${existingBet.betAmount} GP** on **${existingBet.targetPlayer}**`
                    });
                }
            });
            
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            
            await interaction.editReply({
                embeds: [embed],
                components: [selectRow]
            });
        } catch (error) {
            console.error('Error showing active challenges for betting:', error);
            await interaction.editReply('An error occurred while loading the active challenges.');
        }
    },
    
    // Handle the selection of an active challenge for betting
    async handleBetChallengeSelect(interaction) {
        try {
            await interaction.deferUpdate();
            
            const selectedChallengeId = interaction.values[0];
            
            // Get the challenge
            const challenge = await ArenaChallenge.findById(selectedChallengeId);
            if (!challenge || challenge.status !== 'active') {
                return interaction.editReply('This challenge is no longer active.');
            }
            
            // Get user
            const user = await User.findOne({ discordId: interaction.user.id });
            
            // Check if user is part of the challenge
            if (challenge.challengerId === user.discordId || challenge.challengeeId === user.discordId) {
                return interaction.editReply('You cannot bet on a challenge you are participating in.');
            }
            
            // Check if user has already bet on this challenge
            const existingBet = challenge.bets.find(bet => bet.userId === user.discordId);
            if (existingBet) {
                return interaction.editReply(`You've already placed a bet of ${existingBet.betAmount} GP on ${existingBet.targetPlayer}.`);
            }
            
            // Create an embed with challenge details
            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle(`Place Bet: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`)
                .setDescription(
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Current Wager Pool:** ${challenge.wagerAmount * 2} GP\n` +
                    `**Total Betting Pool:** ${challenge.totalPool || 0} GP\n\n` +
                    `Select which player you want to bet on:`
                );
            
            // Create select menu for player selection
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('arena_bet_player_select')
                .setPlaceholder('Select a player to bet on')
                .addOptions([
                    {
                        label: challenge.challengerUsername,
                        description: `Challenger`,
                        value: `${selectedChallengeId}_${challenge.challengerUsername}`
                    },
                    {
                        label: challenge.challengeeUsername,
                        description: `Challengee`,
                        value: `${selectedChallengeId}_${challenge.challengeeUsername}`
                    }
                ]);
            
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            
            await interaction.editReply({
                embeds: [embed],
                components: [selectRow]
            });
        } catch (error) {
            console.error('Error selecting challenge for betting:', error);
            await interaction.editReply('An error occurred while preparing your bet.');
        }
    },
    
    // Handle player selection for bet
    async handleBetPlayerSelect(interaction) {
        try {
            await interaction.deferUpdate();
            
            const [challengeId, playerName] = interaction.values[0].split('_');
            
            // Get the challenge
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge || challenge.status !== 'active') {
                return interaction.editReply('This challenge is no longer active.');
            }
            
            // Get user
            const user = await User.findOne({ discordId: interaction.user.id });
            
            // Show bet amount modal
            const betModal = new ModalBuilder()
                .setCustomId(`arena_bet_amount_modal_${challengeId}_${playerName}`)
                .setTitle(`Place Bet on ${playerName}`);
                
            const betAmountInput = new TextInputBuilder()
                .setCustomId('bet_amount')
                .setLabel(`GP to Bet (Current Balance: ${user.gp || 0} GP)`)
                .setPlaceholder('Enter amount (minimum 10 GP)')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            betModal.addComponents(
                new ActionRowBuilder().addComponents(betAmountInput)
            );
            
            await interaction.showModal(betModal);
        } catch (error) {
            console.error('Error selecting player for bet:', error);
            await interaction.editReply('An error occurred while preparing your bet.');
        }
    },
    
    // Handle bet amount modal submission
    async handleBetAmountModal(interaction, challengeId, playerName) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const betAmount = parseInt(interaction.fields.getTextInputValue('bet_amount'), 10);
            
            // Validate bet amount
            if (isNaN(betAmount) || betAmount < 10) {
                return interaction.editReply('Bet amount must be at least 10 GP.');
            }
            
            // Get user and challenge
            const user = await User.findOne({ discordId: interaction.user.id });
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge || challenge.status !== 'active') {
                return interaction.editReply('This challenge is no longer active.');
            }
            
            // Check if user has enough GP
            if ((user.gp || 0) < betAmount) {
                return interaction.editReply(`You don't have enough GP. Your balance: ${user.gp || 0} GP`);
            }
            
            // Check if user has already bet on this challenge
            const existingBet = challenge.bets.find(bet => bet.userId === user.discordId);
            if (existingBet) {
                return interaction.editReply(`You've already placed a bet on this challenge.`);
            }
            
            // Deduct GP from user
            user.gp = (user.gp || 0) - betAmount;
            user.arenaStats = user.arenaStats || {};
            user.arenaStats.betsPlaced = (user.arenaStats.betsPlaced || 0) + 1;
            await user.save();
            
            // Add bet to challenge
            challenge.bets.push({
                userId: user.discordId,
                raUsername: user.raUsername,
                betAmount: betAmount,
                targetPlayer: playerName,
                placedAt: new Date(),
                paid: false
            });
            
            // Update total pool
            challenge.totalPool = (challenge.totalPool || 0) + betAmount;
            await challenge.save();
            
            // Update the arena feed
            await arenaService.createOrUpdateArenaFeed(challenge);
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Bet Placed Successfully!')
                .setDescription(
                    `You've bet **${betAmount} GP** on **${playerName}** to win the challenge.\n\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**New GP Balance:** ${user.gp} GP\n\n` +
                    `Good luck! Results will be posted in the Arena channel.`
                );
            
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error processing bet:', error);
            return interaction.editReply('An error occurred while placing your bet.');
        }
    },
    
    // Show user's active and pending challenges
    async showMyChallenges(interaction) {
        try {
            await interaction.deferUpdate();
            
            // Find user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to view your challenges.');
            }
            
            // Find user's challenges
            const challenges = await ArenaChallenge.find({
                $or: [
                    { challengerId: user.discordId },
                    { challengeeId: user.discordId }
                ],
                status: { $in: ['pending', 'active'] }
            }).sort({ createdAt: -1 });
            
            if (challenges.length === 0) {
                return interaction.editReply('You have no active or pending challenges.');
            }
            
            // Create an embed to display challenges
            const embed = new EmbedBuilder()
                .setColor('#FF5722')
                .setTitle('My Arena Challenges')
                .setDescription(`Here are your active and pending challenges, ${user.raUsername}:`);
            
            // Group challenges by status
            const pendingChallenges = challenges.filter(c => c.status === 'pending');
            const activeChallenges = challenges.filter(c => c.status === 'active');
            
            // Add pending challenges
            if (pendingChallenges.length > 0) {
                let pendingText = '';
                
                pendingChallenges.forEach((challenge, index) => {
                    const isChallenger = challenge.challengerId === user.discordId;
                    const opponent = isChallenger ? challenge.challengeeUsername : challenge.challengerUsername;
                    
                    pendingText += `**${index + 1}. ${challenge.gameTitle}** vs ${opponent}\n` +
                                 `**Wager:** ${challenge.wagerAmount} GP | **Duration:** ${challenge.durationHours} hrs\n` +
                                 `**Status:** ${isChallenger ? 'Waiting for response' : 'Needs your response'}\n\n`;
                });
                
                embed.addFields({ name: '🕒 Pending Challenges', value: pendingText || 'None' });
            }
            
            // Add active challenges
            if (activeChallenges.length > 0) {
                let activeText = '';
                
                activeChallenges.forEach((challenge, index) => {
                    const isChallenger = challenge.challengerId === user.discordId;
                    const opponent = isChallenger ? challenge.challengeeUsername : challenge.challengerUsername;
                    const timeRemaining = this.formatTimeRemaining(challenge.endDate);
                    
                    activeText += `**${index + 1}. ${challenge.gameTitle}** vs ${opponent}\n` +
                                `**Wager:** ${challenge.wagerAmount} GP | **Ends:** ${timeRemaining}\n` +
                                `**Total Pool:** ${(challenge.totalPool || 0) + (challenge.wagerAmount * 2)} GP\n\n`;
                });
                
                embed.addFields({ name: '⚔️ Active Challenges', value: activeText || 'None' });
            }
            
            await interaction.editReply({
                embeds: [embed],
                components: []
            });
        } catch (error) {
            console.error('Error showing user challenges:', error);
            await interaction.editReply('An error occurred while loading your challenges.');
        }
    },
    
    // Handle button interactions
    async handleButtonInteraction(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('arena_accept_challenge_')) {
            const challengeId = customId.split('_').pop();
            await this.handleAcceptChallenge(interaction, challengeId);
        }
        else if (customId.startsWith('arena_decline_challenge_')) {
            const challengeId = customId.split('_').pop();
            await this.handleDeclineChallenge(interaction, challengeId);
        }
    },
    
    // Handle accepting a challenge
    async handleAcceptChallenge(interaction, challengeId) {
        try {
            await interaction.deferUpdate();
            
            // Get the challenge
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge || challenge.status !== 'pending') {
                return interaction.editReply('This challenge is no longer available.');
            }
            
            // Verify the users
            const challenger = await User.findOne({ discordId: challenge.challengerId });
            const user = await User.findOne({ discordId: interaction.user.id });
            
            // Verify challenger still has enough GP
            if (!challenger || (challenger.gp || 0) < challenge.wagerAmount) {
                challenge.status = 'cancelled';
                await challenge.save();
                
                await arenaService.notifyChallengeUpdate(challenge);
                
                return interaction.editReply(`The challenger doesn't have enough GP anymore. Challenge cancelled.`);
            }
            
            // Verify user has enough GP
            if ((user.gp || 0) < challenge.wagerAmount) {
                return interaction.editReply(`You don't have enough GP to accept this challenge. Your balance: ${user.gp || 0} GP`);
            }
            
            // Set challenge as active
            const now = new Date();
            challenge.status = 'active';
            challenge.startDate = now;
            challenge.endDate = new Date(now.getTime() + (challenge.durationHours * 60 * 60 * 1000));
            await challenge.save();
            
            // Update user stats
            user.arenaStats = user.arenaStats || {};
            user.arenaStats.challengesAccepted = (user.arenaStats.challengesAccepted || 0) + 1;
            await user.save();
            
            // Notify about the accepted challenge
            await arenaService.notifyChallengeUpdate(challenge);
            
            // Initialize the leaderboard in the feed
            await arenaService.createOrUpdateArenaFeed(challenge);
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Challenge Accepted!')
                .setDescription(
                    `You've accepted the challenge from ${challenge.challengerUsername}!\n\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n` +
                    `**Duration:** ${challenge.durationHours} hours\n` +
                    `**Ends:** ${challenge.endDate.toLocaleString()}\n\n` +
                    `Good luck! Updates will be posted in the Arena channel.`
                );
            
            await interaction.editReply({
                embeds: [embed],
                components: []
            });
        } catch (error) {
            console.error('Error accepting challenge:', error);
            await interaction.editReply('An error occurred while accepting the challenge.');
        }
    },
    
    // Handle declining a challenge
    async handleDeclineChallenge(interaction, challengeId) {
        try {
            await interaction.deferUpdate();
            
            // Get the challenge
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge || challenge.status !== 'pending') {
                return interaction.editReply('This challenge is no longer available.');
            }
            
            // Update challenge status
            challenge.status = 'declined';
            await challenge.save();
            
            // Notify about the declined challenge
            await arenaService.notifyChallengeUpdate(challenge);
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Challenge Declined')
                .setDescription(
                    `You've declined the challenge from ${challenge.challengerUsername}.\n\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Wager:** ${challenge.wagerAmount} GP`
                );
            
            await interaction.editReply({
                embeds: [embed],
                components: []
            });
        } catch (error) {
            console.error('Error declining challenge:', error);
            await interaction.editReply('An error occurred while declining the challenge.');
        }
    },
    
    // Handle the active challenges command
    async handleActive(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Get active challenges
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: new Date() }
            }).sort({ endDate: 1 }); // Sort by end date (earliest first)
            
            if (activeChallengers.length === 0) {
                return interaction.editReply('There are no active challenges right now.');
            }
            
            // Create an embed to display active challenges
            const embed = new EmbedBuilder()
                .setTitle('Active Arena Challenges')
                .setColor('#FF5722')
                .setDescription(
                    'These are the currently active challenges in the Arena.\n' +
                    'Use `/arena manage` and select "Place Bet" to bet on these challenges.'
                )
                .setFooter({ text: 'All challenge updates are posted in the Arena channel' });
            
            activeChallengers.forEach((challenge, index) => {
                const timeRemaining = this.formatTimeRemaining(challenge.endDate);
                const totalPool = (challenge.totalPool || 0) + (challenge.wagerAmount * 2);
                
                embed.addFields({
                    name: `${index + 1}. ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`,
                    value: `**Game:** ${challenge.gameTitle}\n` +
                           `**Wager:** ${challenge.wagerAmount} GP each\n` +
                           `**Total Pool:** ${totalPool} GP\n` +
                           `**Ends:** ${challenge.endDate.toLocaleDateString()} (${timeRemaining})\n` +
                           `**Bets:** ${challenge.bets.length} bets placed`
                });
            });
            
            // Send the embed
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error displaying active challenges:', error);
            return interaction.editReply('An error occurred while fetching active challenges.');
        }
    },
    
    // Handle claiming monthly GP allowance
    async handleClaim(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Find user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to claim GP.');
            }
            
            // Check if user has already claimed this month
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const lastClaim = user.lastMonthlyGpClaim ? new Date(user.lastMonthlyGpClaim) : null;
            
            if (lastClaim && 
                lastClaim.getMonth() === currentMonth && 
                lastClaim.getFullYear() === currentYear) {
                
                const nextMonth = new Date(currentYear, currentMonth + 1, 1);
                const daysUntilNext = Math.ceil((nextMonth - now) / (1000 * 60 * 60 * 24));
                
                const embed = new EmbedBuilder()
                    .setColor('#FF9800')
                    .setTitle('Monthly GP Claim')
                    .setDescription(
                        `You've already claimed your GP allowance for ${now.toLocaleString('default', { month: 'long' })}.\n\n` +
                        `Your next claim will be available in ${daysUntilNext} days, on the 1st of ${nextMonth.toLocaleString('default', { month: 'long' })}.`
                    )
                    .addFields({ name: 'Current Balance', value: `${user.gp || 0} GP` });
                
                return interaction.editReply({ embeds: [embed] });
            }
            
            // Award the GP
            user.gp = (user.gp || 0) + 1000;
            user.lastMonthlyGpClaim = now;
            await user.save();
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Monthly GP Claimed!')
                .setDescription(
                    `You've successfully claimed your 1,000 GP allowance for ${now.toLocaleString('default', { month: 'long' })}!\n\n` +
                    `Use your GP to challenge other players or place bets on active challenges.`
                )
                .addFields({ name: 'New Balance', value: `${user.gp} GP` });
            
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error claiming GP:', error);
            return interaction.editReply('An error occurred while claiming your GP.');
        }
    },
    
    // Handle the GP leaderboard command
    async handleLeaderboard(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Get top users by GP
            const topUsers = await User.find({ gp: { $gt: 0 } })
                .sort({ gp: -1 })
                .limit(20);
            
            if (topUsers.length === 0) {
                return interaction.editReply('No users have any GP yet.');
            }
            
            // Create an embed for the leaderboard
            const embed = new EmbedBuilder()
                .setTitle('GP Leaderboard')
                .setColor('#FFD700')
                .setDescription(
                    'These are the users with the most GP (Gold Points).\n' +
                    'Earn GP by winning Arena challenges and bets, or claim your monthly allowance.'
                )
                .setFooter({ text: 'The user with the most GP at the end of the year will receive a special title!' });
            
            let leaderboardText = '';
            
            topUsers.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} **${user.raUsername}**: ${user.gp} GP\n`;
                
                // Add a visual divider after the top 3
                if (index === 2) {
                    leaderboardText += '──────────────\n';
                }
            });
            
            embed.addFields({ name: 'Rankings', value: leaderboardText });
            
            // Find the requesting user's position
            const requestingUser = await User.findOne({ discordId: interaction.user.id });
            
            if (requestingUser && requestingUser.gp > 0) {
                // Count users with more GP than the requesting user
                const position = await User.countDocuments({ gp: { $gt: requestingUser.gp } });
                
                // Add the user's position to the embed
                embed.addFields({ 
                    name: 'Your Position', 
                    value: `**${requestingUser.raUsername}**: ${requestingUser.gp} GP (Rank: #${position + 1})`
                });
            }
            
            // Send the embed
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error displaying GP leaderboard:', error);
            return interaction.editReply('An error occurred while fetching the GP leaderboard.');
        }
    },
    
    // Helper function to format time remaining
    formatTimeRemaining(endDate) {
        const now = new Date();
        const diff = endDate - now;
        
        if (diff <= 0) {
            return 'Ended';
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) {
            return `${days}d ${hours}h remaining`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m remaining`;
        } else {
            return `${minutes}m remaining`;
        }
    }
};
