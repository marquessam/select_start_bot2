import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType
} from 'discord.js';
import { User } from '../../models/User.js';
import { ArenaChallenge } from '../../models/ArenaChallenge.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';
import arenaService from '../../services/arenaService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arena')
        .setDescription('Challenge players to competitive games and bet on outcomes')
        .addSubcommand(subcommand =>
            subcommand
                .setName('challenge')
                .setDescription('Challenge another player to a competition')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('respond')
                .setDescription('Respond to arena challenge requests')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('bet')
                .setDescription('Place a bet on an active arena challenge')
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
            case 'challenge':
                await this.handleChallenge(interaction);
                break;
            case 'respond':
                await this.handleRespond(interaction);
                break;
            case 'bet':
                await this.handleBet(interaction);
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
    
    async handleChallenge(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Verify user is registered
            const challenger = await User.findOne({ discordId: interaction.user.id });
            if (!challenger) {
                return interaction.editReply('You need to be registered to issue challenges. Please contact an admin.');
            }
            
            // Create and show the challenge form
            const modal = new ModalBuilder()
                .setCustomId('arena_challenge_modal')
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
            
            // Handle modal submission
            const filter = (i) => i.customId === 'arena_challenge_modal' && i.user.id === interaction.user.id;
            const modalSubmission = await interaction.awaitModalSubmit({ filter, time: 120000 });
            
            if (modalSubmission) {
                await modalSubmission.deferReply({ ephemeral: true });
                
                // Extract data from modal
                const opponentUsername = modalSubmission.fields.getTextInputValue('opponent_username');
                const leaderboardId = modalSubmission.fields.getTextInputValue('leaderboard_id');
                const wagerAmount = parseInt(modalSubmission.fields.getTextInputValue('wager_amount'), 10);
                const durationHours = parseInt(modalSubmission.fields.getTextInputValue('duration_hours'), 10);
                
                // Validate inputs
                if (isNaN(wagerAmount) || wagerAmount < 10) {
                    return modalSubmission.editReply('Wager amount must be at least 10 GP.');
                }
                
                if (isNaN(durationHours) || durationHours < 1 || durationHours > 168) {
                    return modalSubmission.editReply('Duration must be between 1 and 168 hours (1 week).');
                }
                
                // Verify opponent exists and is registered
                const opponent = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${opponentUsername}$`, 'i') }
                });
                
                if (!opponent) {
                    return modalSubmission.editReply(`The user "${opponentUsername}" is not registered in our system.`);
                }
                
                // Prevent challenging yourself
                if (opponent.discordId === interaction.user.id) {
                    return modalSubmission.editReply('You cannot challenge yourself.');
                }
                
                // Check if user has enough GP
                if ((challenger.gp || 0) < wagerAmount) {
                    return modalSubmission.editReply(`You don't have enough GP. Your balance: ${challenger.gp || 0} GP`);
                }
                
                // Verify leaderboard exists
                try {
                    const leaderboardInfo = await retroAPI.getLeaderboardInfo(leaderboardId);
                    if (!leaderboardInfo || !leaderboardInfo.Title) {
                        return modalSubmission.editReply(`Leaderboard ID ${leaderboardId} not found.`);
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
                        return modalSubmission.editReply(`You already have a challenge with ${opponentUsername} that is ${statusText}.`);
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
                    
                    return modalSubmission.editReply(
                        `Challenge sent to ${opponent.raUsername} for ${gameInfo.Title || leaderboardInfo.Title}!\n` +
                        `Wager: ${wagerAmount} GP | Duration: ${durationHours} hours\n` +
                        `They can use \`/arena respond\` to accept or decline.`
                    );
                } catch (apiError) {
                    console.error('Error fetching leaderboard data:', apiError);
                    return modalSubmission.editReply('Error verifying leaderboard. Please check the ID and try again.');
                }
            }
        } catch (error) {
            console.error('Error creating challenge:', error);
            return interaction.editReply('An error occurred while creating the challenge.');
        }
    },
    
    async handleRespond(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
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
            
            // Create a select menu to choose which challenge to respond to
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('challenge_select')
                .setPlaceholder('Select a challenge to respond to');
                
            pendingChallenges.forEach((challenge, index) => {
                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${challenge.challengerUsername} - ${challenge.gameTitle}`)
                        .setDescription(`Wager: ${challenge.wagerAmount} GP | Duration: ${challenge.durationHours} hrs`)
                        .setValue(challenge._id.toString())
                );
            });
            
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            
            const message = await interaction.editReply({
                content: 'Select a challenge to respond to:',
                components: [selectRow]
            });
            
            // Wait for selection
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60000
            });
            
            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'This menu is not for you.', ephemeral: true });
                }
                
                await i.deferUpdate();
                
                const selectedChallengeId = i.values[0];
                const selectedChallenge = pendingChallenges.find(c => c._id.toString() === selectedChallengeId);
                
                if (!selectedChallenge) {
                    return i.editReply('Challenge not found. Please try again.');
                }
                
                // Verify challenger and challengee both have enough GP
                const challenger = await User.findOne({ discordId: selectedChallenge.challengerId });
                
                if (!challenger || (challenger.gp || 0) < selectedChallenge.wagerAmount) {
                    // Update challenge to cancelled and notify
                    selectedChallenge.status = 'cancelled';
                    await selectedChallenge.save();
                    
                    await arenaService.notifyChallengeUpdate(selectedChallenge);
                    
                    return i.editReply(`The challenger doesn't have enough GP to cover their wager anymore. Challenge cancelled.`);
                }
                
                if ((user.gp || 0) < selectedChallenge.wagerAmount) {
                    return i.editReply(`You don't have enough GP to accept this challenge. Your balance: ${user.gp || 0} GP`);
                }
                
                // Create response buttons
                const buttonsRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`accept_${selectedChallengeId}`)
                            .setLabel('Accept Challenge')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`decline_${selectedChallengeId}`)
                            .setLabel('Decline Challenge')
                            .setStyle(ButtonStyle.Danger)
                    );
                
                await i.editReply({
                    content: `Challenge from ${selectedChallenge.challengerUsername} for ${selectedChallenge.gameTitle}\n` +
                             `Wager: ${selectedChallenge.wagerAmount} GP | Duration: ${selectedChallenge.durationHours} hours\n` +
                             `Do you want to accept or decline?`,
                    components: [buttonsRow]
                });
                
                collector.stop();
                
                // Set up a new collector for the buttons
                const buttonCollector = message.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60000
                });
                
                buttonCollector.on('collect', async (btn) => {
                    if (btn.user.id !== interaction.user.id) {
                        return btn.reply({ content: 'These buttons are not for you.', ephemeral: true });
                    }
                    
                    await btn.deferUpdate();
                    
                    if (btn.customId === `accept_${selectedChallengeId}`) {
                        // Accept the challenge
                        // First, verify both users still have enough GP
                        const updatedChallenger = await User.findOne({ discordId: selectedChallenge.challengerId });
                        const updatedUser = await User.findOne({ discordId: user.discordId });
                        
                        if (!updatedChallenger || (updatedChallenger.gp || 0) < selectedChallenge.wagerAmount) {
                            selectedChallenge.status = 'cancelled';
                            await selectedChallenge.save();
                            
                            await arenaService.notifyChallengeUpdate(selectedChallenge);
                            
                            return btn.editReply(`The challenger doesn't have enough GP anymore. Challenge cancelled.`);
                        }
                        
                        if ((updatedUser.gp || 0) < selectedChallenge.wagerAmount) {
                            return btn.editReply(`You don't have enough GP to accept this challenge. Your balance: ${updatedUser.gp || 0} GP`);
                        }
                        
                        // Set challenge as active
                        const now = new Date();
                        selectedChallenge.status = 'active';
                        selectedChallenge.startDate = now;
                        selectedChallenge.endDate = new Date(now.getTime() + (selectedChallenge.durationHours * 60 * 60 * 1000));
                        await selectedChallenge.save();
                        
                        // Update user stats
                        updatedUser.arenaStats = updatedUser.arenaStats || {};
                        updatedUser.arenaStats.challengesAccepted = (updatedUser.arenaStats.challengesAccepted || 0) + 1;
                        await updatedUser.save();
                        
                        // Notify about the accepted challenge
                        await arenaService.notifyChallengeUpdate(selectedChallenge);
                        
                        // Initialize the leaderboard in the feed
                        await arenaService.createOrUpdateArenaFeed(selectedChallenge);
                        
                        return btn.editReply(
                            `You've accepted the challenge! The competition will run until ${selectedChallenge.endDate.toLocaleString()}.\n` +
                            `Good luck!`
                        );
                    } else if (btn.customId === `decline_${selectedChallengeId}`) {
                        // Decline the challenge
                        selectedChallenge.status = 'declined';
                        await selectedChallenge.save();
                        
                        // Notify about the declined challenge
                        await arenaService.notifyChallengeUpdate(selectedChallenge);
                        
                        return btn.editReply(`You've declined the challenge from ${selectedChallenge.challengerUsername}.`);
                    }
                });
                
                buttonCollector.on('end', async (collected, reason) => {
                    if (reason === 'time' && collected.size === 0) {
                        await interaction.editReply({
                            content: 'Response time expired. Please try again.',
                            components: []
                        });
                    }
                });
            });
            
            collector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    await interaction.editReply({
                        content: 'Selection time expired. Please try again.',
                        components: []
                    });
                }
            });
        } catch (error) {
            console.error('Error responding to challenge:', error);
            return interaction.editReply('An error occurred while responding to the challenge.');
        }
    },
    
    async handleBet(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
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
            
            // Create a select menu to choose which challenge to bet on
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('bet_challenge_select')
                .setPlaceholder('Select a challenge to bet on');
                
            activeChallengers.forEach((challenge) => {
                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${challenge.challengerUsername} vs ${challenge.challengeeUsername}`)
                        .setDescription(`${challenge.gameTitle} | Ends: ${challenge.endDate.toLocaleString()}`)
                        .setValue(challenge._id.toString())
                );
            });
            
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            
            const message = await interaction.editReply({
                content: 'Select a challenge to bet on:',
                components: [selectRow]
            });
            
            // Wait for selection
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60000
            });
            
            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: 'This menu is not for you.', ephemeral: true });
                }
                
                await i.deferUpdate();
                
                const selectedChallengeId = i.values[0];
                const selectedChallenge = activeChallengers.find(c => c._id.toString() === selectedChallengeId);
                
                if (!selectedChallenge) {
                    return i.editReply('Challenge not found. Please try again.');
                }
                
                // Check if user is part of the challenge
                if (selectedChallenge.challengerId === user.discordId || selectedChallenge.challengeeId === user.discordId) {
                    return i.editReply('You cannot bet on a challenge you are participating in.');
                }
                
                // Check if user has already bet on this challenge
                const existingBet = selectedChallenge.bets.find(bet => bet.userId === user.discordId);
                if (existingBet) {
                    return i.editReply(`You've already placed a bet of ${existingBet.betAmount} GP on ${existingBet.targetPlayer}.`);
                }
                
                // Create player selection buttons
                const playersRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`bet_${selectedChallengeId}_${selectedChallenge.challengerUsername}`)
                            .setLabel(`Bet on ${selectedChallenge.challengerUsername}`)
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`bet_${selectedChallengeId}_${selectedChallenge.challengeeUsername}`)
                            .setLabel(`Bet on ${selectedChallenge.challengeeUsername}`)
                            .setStyle(ButtonStyle.Secondary)
                    );
                
                await i.editReply({
                    content: `Challenge: ${selectedChallenge.challengerUsername} vs ${selectedChallenge.challengeeUsername}\n` +
                             `Game: ${selectedChallenge.gameTitle}\n` +
                             `Current Wager Pool: ${selectedChallenge.wagerAmount * 2} GP\n` +
                             `Total Betting Pool: ${selectedChallenge.totalPool} GP\n\n` +
                             `Who do you want to bet on?`,
                    components: [playersRow]
                });
                
                collector.stop();
                
                // Set up a new collector for the player selection
                const playerCollector = message.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60000
                });
                
                playerCollector.on('collect', async (btn) => {
                    if (btn.user.id !== interaction.user.id) {
                        return btn.reply({ content: 'These buttons are not for you.', ephemeral: true });
                    }
                    
                    await btn.deferUpdate();
                    
                    // Extract selected player from button ID
                    const parts = btn.customId.split('_');
                    const challengeId = parts[1];
                    const playerName = parts[2];
                    
                    // Prompt for bet amount
                    const betModal = new ModalBuilder()
                        .setCustomId(`bet_modal_${challengeId}_${playerName}`)
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
                    
                    await btn.showModal(betModal);
                    
                    // Handle modal submission
                    const betFilter = (mi) => mi.customId === `bet_modal_${challengeId}_${playerName}` && mi.user.id === interaction.user.id;
                    const betSubmission = await interaction.awaitModalSubmit({ filter: betFilter, time: 120000 });
                    
                    if (betSubmission) {
                        await betSubmission.deferUpdate();
                        
                        const betAmount = parseInt(betSubmission.fields.getTextInputValue('bet_amount'), 10);
                        
                        // Validate bet amount
                        if (isNaN(betAmount) || betAmount < 10) {
                            return betSubmission.editReply('Bet amount must be at least 10 GP.');
                        }
                        
                        // Check if user has enough GP
                        if ((user.gp || 0) < betAmount) {
                            return betSubmission.editReply(`You don't have enough GP. Your balance: ${user.gp || 0} GP`);
                        }
                        
                        // Place the bet
                        // First, get fresh versions of the challenge and user
                        const updatedChallenge = await ArenaChallenge.findById(challengeId);
                        const updatedUser = await User.findOne({ discordId: user.discordId });
                        
                        if (!updatedChallenge || updatedChallenge.status !== 'active') {
                            return betSubmission.editReply('This challenge is no longer active.');
                        }
                        
                        if ((updatedUser.gp || 0) < betAmount) {
                            return betSubmission.editReply(`You don't have enough GP. Your balance: ${updatedUser.gp || 0} GP`);
                        }
                        
                        // Deduct GP from user
                        updatedUser.gp = (updatedUser.gp || 0) - betAmount;
                        updatedUser.arenaStats = updatedUser.arenaStats || {};
                        updatedUser.arenaStats.betsPlaced = (updatedUser.arenaStats.betsPlaced || 0) + 1;
                        await updatedUser.save();
                        
                        // Add bet to challenge
                        updatedChallenge.bets.push({
                            userId: user.discordId,
                            raUsername: user.raUsername,
                            betAmount: betAmount,
                            targetPlayer: playerName,
                            placedAt: new Date(),
                            paid: false
                        });
                        
                        // Update total pool
                        updatedChallenge.totalPool = (updatedChallenge.totalPool || 0) + betAmount;
                        await updatedChallenge.save();
                        
                        // Update the arena feed
                        await arenaService.createOrUpdateArenaFeed(updatedChallenge);
                        
                        return betSubmission.editReply(
                            `Bet placed successfully!\n` +
                            `You bet ${betAmount} GP on ${playerName} to win.\n` +
                            `New GP balance: ${updatedUser.gp} GP`
                        );
                    }
                });
                
                playerCollector.on('end', async (collected, reason) => {
                    if (reason === 'time' && collected.size === 0) {
                        await interaction.editReply({
                            content: 'Selection time expired. Please try again.',
                            components: []
                        });
                    }
                });
            });
            
            collector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    await interaction.editReply({
                        content: 'Selection time expired. Please try again.',
                        components: []
                    });
                }
            });
        } catch (error) {
            console.error('Error placing bet:', error);
            return interaction.editReply('An error occurred while placing your bet.');
        }
    },
    
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
                    'Use `/arena bet` to place bets on active challenges.'
                )
                .setFooter({ text: 'All challenge updates are posted in the Arena channel' });
            
            activeChallengers.forEach((challenge, index) => {
                const timeRemaining = this.formatTimeRemaining(challenge.endDate);
                const totalPool = challenge.totalPool + (challenge.wagerAmount * 2);
                
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
                
                return interaction.editReply(
                    `You've already claimed your GP allowance for ${now.toLocaleString('default', { month: 'long' })}.\n` +
                    `Your next claim will be available on the 1st of ${new Date(currentYear, currentMonth + 1, 1).toLocaleString('default', { month: 'long' })}.`
                );
            }
            
            // Award the GP
            user.gp = (user.gp || 0) + 1000;
            user.lastMonthlyGpClaim = now;
            await user.save();
            
            return interaction.editReply(
                `You've claimed your 1,000 GP allowance for ${now.toLocaleString('default', { month: 'long' })}!\n` +
                `Your new balance is ${user.gp} GP.`
            );
        } catch (error) {
            console.error('Error claiming GP:', error);
            return interaction.editReply('An error occurred while claiming your GP.');
        }
    },
    
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
