// src/commands/user/arena.js
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
import { formatTimeRemaining, getLeaderboardEntries } from '../../utils/arenaUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arena')
        .setDescription('Arena system for competitive challenges and betting'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Verify user is registered
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to use the Arena system. Please contact an admin.');
            }
            
            // Check if user has pending challenges to respond to (priority)
            const pendingChallenges = await ArenaChallenge.find({
                challengeeId: user.discordId,
                status: 'pending'
            });
            
            if (pendingChallenges.length > 0) {
                // User has pending challenges - show them immediately
                return this.showPendingChallenges(interaction, user, pendingChallenges);
            }
            
            // No pending challenges - show main arena menu
            await this.showMainArenaMenu(interaction, user);
        } catch (error) {
            console.error('Error executing arena command:', error);
            return interaction.editReply('An error occurred while accessing the Arena. Please try again.');
        }
    },
    
    // Show the main arena menu with all options
    async showMainArenaMenu(interaction, user, skipGpCheck = false) {
        // Check if user should receive automatic monthly GP
        if (!skipGpCheck) {
            await arenaService.checkAndGrantMonthlyGP(user);
        }
        
        // Get user's stats and relevant info
        const activeCount = await ArenaChallenge.countDocuments({
            $or: [
                { challengerId: user.discordId, status: 'active' },
                { challengeeId: user.discordId, status: 'active' },
                { 'participants.userId': user.discordId, status: 'active' }
            ]
        });
        
        // Format GP balance with commas
        const gpBalance = (user.gp || 0).toLocaleString();
        
        // Create main arena embed
        const embed = new EmbedBuilder()
            .setColor('#FF5722')
            .setTitle('🏆 RetroAchievements Arena')
            .setDescription(
                'Welcome to the Arena - where players compete for glory and GP!\n\n' +
                'Challenge other players to leaderboard competitions, place bets on active matches, ' +
                'and climb the rankings to earn special titles.'
            )
            .addFields(
                { name: '💰 Your Balance', value: `**${gpBalance} GP**`, inline: true },
                { name: '⚔️ Your Active Challenges', value: `**${activeCount}**`, inline: true }
            )
            .setFooter({ text: 'All challenges and bets are based on RetroAchievements leaderboards' });
        
        // Create action menu
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('arena_main_action')
                    .setPlaceholder('Select an action')
                    .addOptions([
                        {
                            label: 'Issue a Challenge',
                            description: 'Issue a challenge (to a specific user or open to everyone)',
                            value: 'create_challenge',
                            emoji: '⚔️'
                        },
                        {
                            label: 'Place a Bet',
                            description: 'Bet on active challenges',
                            value: 'place_bet',
                            emoji: '💰'
                        },
                        {
                            label: 'My Challenges',
                            description: 'View your active and pending challenges',
                            value: 'my_challenges',
                            emoji: '📋'
                        },
                        {
                            label: 'Active Challenges',
                            description: 'See all current Arena challenges',
                            value: 'active_challenges',
                            emoji: '🔥'
                        },
                        {
                            label: 'GP Leaderboard',
                            description: 'View the top GP earners',
                            value: 'leaderboard',
                            emoji: '📊'
                        },
                        {
                            label: 'Browse Open Challenges',
                            description: 'View and join open challenges',
                            value: 'open_challenges',
                            emoji: '🌐'
                        }
                    ])
            );
        
        // Create help button
        const buttonsRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arena_help')
                    .setLabel('How Arena Works')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❓')
            );
        
        // Send the arena menu
        try {
            await interaction.editReply({
                embeds: [embed],
                components: [actionRow, buttonsRow]
            });
        } catch (error) {
            console.error(`Error sending main menu:`, error);
            // Try a fallback approach if the initial reply fails
            try {
                await interaction.editReply({
                    content: 'An error occurred while displaying the Arena menu. Please try again.',
                    components: []
                });
            } catch (fallbackError) {
                console.error(`Fallback error handling also failed:`, fallbackError);
            }
        }
    },
    
    // Show pending challenges for user to respond to
    async showPendingChallenges(interaction, user, pendingChallenges = null) {
        try {
            // If challenges not provided, fetch them
            if (!pendingChallenges) {
                pendingChallenges = await ArenaChallenge.find({
                    challengeeId: user.discordId,
                    status: 'pending'
                });
                
                if (pendingChallenges.length === 0) {
                    return interaction.editReply('You have no pending challenges to respond to.');
                }
            }
            
            // Create embed showing all pending challenges
            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('⚠️ Pending Arena Challenges')
                .setDescription(
                    `You have ${pendingChallenges.length} pending challenge${pendingChallenges.length > 1 ? 's' : ''}!\n` +
                    'Please respond to accept or decline:'
                );
            
            // If only one challenge, show details directly
            if (pendingChallenges.length === 1) {
                const challenge = pendingChallenges[0];
                
                // Verify challenger still has enough GP
                const challenger = await User.findOne({ discordId: challenge.challengerId });
                if (!challenger || (challenger.gp || 0) < challenge.wagerAmount) {
                    challenge.status = 'cancelled';
                    await challenge.save();
                    await arenaService.notifyChallengeUpdate(challenge);
                    
                    // Create a back button to return to main menu
                    const backRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('arena_back_to_main')
                                .setLabel('Back to Arena')
                                .setStyle(ButtonStyle.Secondary)
                        );
                    
                    return interaction.editReply({
                        content: `The challenge from ${challenge.challengerUsername} was automatically cancelled because they don't have enough GP to cover their wager.`,
                        components: [backRow],
                        embeds: []
                    });
                }
                
                // Check if user has enough GP
                if ((user.gp || 0) < challenge.wagerAmount) {
                    // Create a back button to return to main menu
                    const backRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('arena_back_to_main')
                                .setLabel('Back to Arena')
                                .setStyle(ButtonStyle.Secondary)
                        );
                    
                    return interaction.editReply({
                        content: `You don't have enough GP to accept this challenge. You need ${challenge.wagerAmount} GP, but your balance is ${user.gp || 0} GP.`,
                        components: [backRow],
                        embeds: []
                    });
                }
                
                // Fetch current leaderboard positions for both players
            const [challengerScore, challengeeScore] = await arenaService.getChallengersScores(challenge);

                // Prepare leaderboard info text
                let leaderboardText = '';
                if (challengerScore.exists || challengeeScore.exists) {
                    leaderboardText = "\n\n**Current Leaderboard Positions:**\n";
                    
                    if (challengerScore.exists) {
                        leaderboardText += `• ${challenge.challengerUsername}: ${challengerScore.formattedScore}\n`;
                    } else {
                        leaderboardText += `• ${challenge.challengerUsername}: No existing score\n`;
                    }
                    
                    if (challengeeScore.exists) {
                        leaderboardText += `• ${challenge.challengeeUsername} (You): ${challengeeScore.formattedScore}\n`;
                    } else {
                        leaderboardText += `• ${challenge.challengeeUsername} (You): No existing score\n`;
                    }
                }
                
                // Add leaderboard link
                const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                
                // Show detailed challenge info with fixed duration of 1 week
                embed.setDescription(
                    `**${challenge.challengerUsername}** has challenged you to compete in:\n\n` +
                    `**${challenge.gameTitle}**\n\n` +
                    `**Description:** ${challenge.description || 'No description provided'}\n\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n` +
                    `**Duration:** 1 week${leaderboardText}\n\n` +
                    `**Leaderboard:** ${leaderboardLink}\n\n` +
                    `Do you accept this challenge?`
                );
                
                // Add thumbnail if available
                if (challenge.iconUrl) {
                    embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
                }
                
                // Create accept/decline buttons
                const buttonsRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`arena_accept_challenge_${challenge._id.toString()}`)
                            .setLabel('Accept Challenge')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`arena_decline_challenge_${challenge._id.toString()}`)
                            .setLabel('Decline Challenge')
                            .setStyle(ButtonStyle.Danger)
                    );
                    
                // Add a button to view main arena menu instead
                const secondRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('arena_back_to_main')
                            .setLabel('View Arena Menu Instead')
                            .setStyle(ButtonStyle.Secondary)
                    );
                
                return interaction.editReply({
                    embeds: [embed],
                    components: [buttonsRow, secondRow]
                });
            } 
            // Multiple challenges - show a selection menu
            else {
                pendingChallenges.forEach((challenge, index) => {
                    embed.addFields({
                        name: `${index + 1}. From ${challenge.challengerUsername}`,
                        value: `**Game:** ${challenge.gameTitle}\n**Wager:** ${challenge.wagerAmount} GP`
                    });
                });
                
                // Create a select menu for multiple challenges
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('arena_pending_challenge_select')
                    .setPlaceholder('Select a challenge to respond to');
                    
                pendingChallenges.forEach((challenge) => {
                    selectMenu.addOptions({
                        label: `From ${challenge.challengerUsername} - ${challenge.gameTitle}`,
                        description: `Wager: ${challenge.wagerAmount} GP | Duration: 1 week`,
                        value: challenge._id.toString()
                    });
                });
                
                const selectRow = new ActionRowBuilder().addComponents(selectMenu);
                
                // Add a button to view main arena menu instead
                const secondRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('arena_back_to_main')
                            .setLabel('View Arena Menu Instead')
                            .setStyle(ButtonStyle.Secondary)
                    );
                
                return interaction.editReply({
                    embeds: [embed],
                    components: [selectRow, secondRow]
                });
            }
        } catch (error) {
            console.error('Error showing pending challenges:', error);
            return interaction.editReply('An error occurred while loading your pending challenges.');
        }
    },
    
    // Show a modal for creating a challenge
    async showCreateChallengeModal(interaction) {
        try {
            // Verify user is registered
            const challenger = await User.findOne({ discordId: interaction.user.id });
            if (!challenger) {
                // For error case, check if we need to defer
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
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
                .setPlaceholder('Enter opponent\'s RA username (leave blank for open challenge)')
                .setRequired(false) // Make it optional to allow for open challenges
                .setStyle(TextInputStyle.Short);

            // Input for game ID
            const gameIdInput = new TextInputBuilder()
                .setCustomId('game_id')
                .setLabel('RetroAchievements Game ID')
                .setPlaceholder('e.g. 14402')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Input for leaderboard ID
            const leaderboardInput = new TextInputBuilder()
                .setCustomId('leaderboard_id')
                .setLabel('Leaderboard ID (from RetroAchievements)')
                .setPlaceholder('e.g. 9391')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Input for description (shorter placeholder)
            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Challenge Description')
                .setPlaceholder('Specify: 1) Track/level 2) Competition type (time/score) 3) Rules')
                .setRequired(true)
                .setStyle(TextInputStyle.Paragraph);
                
            // Input for wager amount
            const wagerInput = new TextInputBuilder()
                .setCustomId('wager_amount')
                .setLabel(`GP to Wager (Current Balance: ${challenger.gp || 0} GP)`)
                .setPlaceholder('Enter amount (minimum 10 GP)')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Add inputs to modal
            modal.addComponents(
                new ActionRowBuilder().addComponents(usernameInput),
                new ActionRowBuilder().addComponents(gameIdInput),
                new ActionRowBuilder().addComponents(leaderboardInput),
                new ActionRowBuilder().addComponents(descriptionInput),
                new ActionRowBuilder().addComponents(wagerInput)
            );
            
            // Show the modal directly without deferring first IF the interaction hasn't been deferred yet
            try {
                // Check if interaction has already been acknowledged
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.showModal(modal);
                } else {
                    // If already acknowledged, we need a fallback approach - create a new button
                    const buttonRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('arena_show_challenge_modal')
                                .setLabel('Create Challenge')
                                .setStyle(ButtonStyle.Primary)
                        );
                    
                    await interaction.editReply({
                        content: 'Click the button below to create a challenge:',
                        components: [buttonRow]
                    });
                    
                    // Setup a collector for the button click to show the modal
                    const message = await interaction.fetchReply();
                    const filter = i => i.customId === 'arena_show_challenge_modal' && i.user.id === interaction.user.id;
                    const collector = message.createMessageComponentCollector({ filter, time: 60000, max: 1 });
                    
                    collector.on('collect', async i => {
                        await i.showModal(modal);
                    });
                }
            } catch (modalError) {
                console.error('Error showing modal:', modalError);
                // If the interaction was already replied to, try a different approach
                if (modalError.message.includes('already been replied') || modalError.message.includes('already replied') || modalError.message.includes('acknowledged')) {
                    // Try a different approach - reply with a button that shows the modal
                    try {
                        await interaction.editReply({
                            content: 'Click the button below to create a challenge:',
                            components: [
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('arena_show_challenge_modal')
                                        .setLabel('Create Challenge')
                                        .setStyle(ButtonStyle.Primary)
                                )
                            ]
                        });
                    } catch (replyError) {
                        console.error('Error creating fallback button:', replyError);
                    }
                }
            }
        } catch (error) {
            console.error('Error showing challenge creation modal:', error);
            // For error handling, check if we need to defer
            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
                await interaction.editReply({
                    content: 'An error occurred while preparing the challenge form. Please try again.',
                    components: []
                });
            } catch (replyError) {
                console.error('Error handling failed modal:', replyError);
            }
        }
    },
    
    // Handle the modal submit for creating a challenge
    async handleModalSubmit(interaction) {
        const customId = interaction.customId;
        
        if (customId === 'arena_create_challenge_modal' || customId === 'arena_create_challenge_modal_recovery') {
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
            const gameId = parseInt(interaction.fields.getTextInputValue('game_id'));
            const leaderboardId = interaction.fields.getTextInputValue('leaderboard_id');
            const description = interaction.fields.getTextInputValue('description');
            const wagerAmount = parseInt(interaction.fields.getTextInputValue('wager_amount'), 10);
            
            // Set fixed duration of 7 days (1 week)
            const durationDays = 7;
            const durationHours = durationDays * 24;
            
            // Validate inputs
            if (isNaN(wagerAmount) || wagerAmount < 10) {
                return interaction.editReply('Wager amount must be at least 10 GP.');
            }
            
            if (isNaN(gameId)) {
                return interaction.editReply('Please enter a valid Game ID.');
            }
            
            // Check if description has enough detail
            if (description.length < 20) {
                return interaction.editReply('Your description is too brief. Please provide details about which track/level, how to compete (fastest time, highest score), and any special rules.');
            }
            
            // Get challenger info
            const challenger = await User.findOne({ discordId: interaction.user.id });
            
            // Check if user has enough GP
            if ((challenger.gp || 0) < wagerAmount) {
                return interaction.editReply(`You don't have enough GP. Your balance: ${challenger.gp || 0} GP`);
            }
            
            // Check if this is an open challenge (no opponent specified)
            let isOpenChallenge = !opponentUsername || opponentUsername.trim() === '';
            let opponent = null;
            
            if (!isOpenChallenge) {
                // Verify opponent exists and is registered
                opponent = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${opponentUsername}$`, 'i') }
                });
                
                if (!opponent) {
                    return interaction.editReply(`The user "${opponentUsername}" is not registered in our system.`);
                }
                
                // Prevent challenging yourself
                if (opponent.discordId === interaction.user.id) {
                    return interaction.editReply('You cannot challenge yourself.');
                }
                
                // Check for any existing challenges between these users
                const existingChallenge = await arenaService.checkExistingChallenge(challenger, opponent);
                if (existingChallenge) {
                    let statusText = existingChallenge.status === 'pending' ? 'pending response' : 'already active';
                    return interaction.editReply(`You already have a challenge with ${opponentUsername} that is ${statusText}.`);
                }
            }
            
            // Verify game exists
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }
            
            // Verify leaderboard exists - FIXED - use imported function
            const leaderboardEntries = await getLeaderboardEntries(leaderboardId);
            if (!leaderboardEntries || leaderboardEntries.length === 0) {
                return interaction.editReply(`Leaderboard ID ${leaderboardId} not found or has no entries.`);
            }
            
            // Create the challenge
            const challengeData = {
                challengerId: challenger.discordId,
                challengerUsername: challenger.raUsername,
                challengeeId: isOpenChallenge ? null : opponent.discordId,
                challengeeUsername: isOpenChallenge ? "Open Challenge" : opponent.raUsername,
                isOpenChallenge: isOpenChallenge,
                leaderboardId: leaderboardId,
                gameId: gameId,
                gameTitle: gameInfo.title,
                consoleName: gameInfo.consoleName || 'Unknown',
                iconUrl: gameInfo.imageIcon || null,
                description: description,
                wagerAmount: wagerAmount,
                durationHours: durationHours,
                status: isOpenChallenge ? 'open' : 'pending'
            };
            
            // For open challenges, initialize participants array
            if (isOpenChallenge) {
                challengeData.participants = [];
            }
            
            // Create and save the challenge
            const challenge = new ArenaChallenge(challengeData);
            await challenge.save();
            
            // Track the GP transaction
            await arenaService.trackGpTransaction(
                challenger, 
                -wagerAmount, 
                'Challenge wager', 
                `Challenge ID: ${challenge._id}, Game: ${gameInfo.title}`
            );
            
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
            
            // Add leaderboard link
            const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${leaderboardId})`;
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(isOpenChallenge ? 'Open Challenge Created!' : 'Challenge Created!')
                .setDescription(
                    isOpenChallenge ? 
                    `You've created an open challenge for ${gameInfo.title}!\n\n` :
                    `You've challenged ${opponent.raUsername} to compete in ${gameInfo.title}!\n\n`
                )
                .addFields(
                    { name: 'Game', value: `${gameInfo.title} (${gameInfo.consoleName || 'Unknown'})`, inline: false },
                    { name: 'Description', value: description, inline: false },
                    { name: 'Wager', value: `${wagerAmount} GP`, inline: true },
                    { name: 'Duration', value: '1 week', inline: true },
                    { name: 'Leaderboard', value: leaderboardLink, inline: false }
                );
            
            if (!isOpenChallenge) {
                embed.setFooter({ text: `${opponent.raUsername} will be notified and can use /arena to respond.` });
            } else {
                embed.setFooter({ text: 'Other players can use /arena to join this open challenge.' });
            }
            
            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }
            
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error creating challenge:', error);
            return interaction.editReply('An error occurred while creating the challenge.');
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
            
            // Add leaderboard link
            const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
            
            // Create an embed with challenge details - updated to show fixed duration of 1 week
            const embed = new EmbedBuilder()
                .setColor('#FF5722')
                .setTitle(`Challenge from ${challenge.challengerUsername}`)
                .setDescription(
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Description:** ${challenge.description || 'No description provided'}\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n` +
                    `**Duration:** 1 week\n` +
                    `**Leaderboard:** ${leaderboardLink}\n\n` +
                    `Do you want to accept or decline this challenge?`
                );
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
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
    
    // Show active challenges for betting - Updated for 72-hour betting window
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
            
            const now = new Date();
            
            // Filter out challenges the user is participating in and those older than 72 hours
            const bettableChallenges = activeChallengers.filter(
                challenge => {
                    // Check if challenge is less than 72 hours old
                    const challengeAge = (now - challenge.startDate) / (1000 * 60 * 60);
                    if (challengeAge > 72) {
                        return false; // Exclude challenges older than 72 hours
                    }
                    
                    // Check if user is challenger or challengee
                    if (challenge.challengerId === user.discordId || challenge.challengeeId === user.discordId) {
                        return false;
                    }
                    
                    // Check if user is a participant in an open challenge
                    if (challenge.isOpenChallenge && challenge.participants) {
                        return !challenge.participants.some(p => p.userId === user.discordId);
                    }
                    
                    return true;
                }
            );
            
            if (bettableChallenges.length === 0) {
                return interaction.editReply('There are no active challenges available for you to bet on. You cannot bet on challenges you are participating in, or on challenges that have been active for more than 72 hours.');
            }
            
            // Create embed showing all active challenges
            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle('Active Arena Challenges - Place a Bet')
                .setDescription(
                    'Select a challenge to bet on:\n\n' +
                    '**Pot Betting System:** Your bet is added to the total prize pool. ' +
                    'If your chosen player wins, you get your bet back plus a proportional share of the losing side bets based on your bet amount!\n\n' +
                    '**House Guarantee:** If you\'re the only bettor, the house will guarantee a 50% profit on your bet if you win.\n\n' +
                    '**Note:** Betting is only available during the first 72 hours of a challenge. Max bet: 100 GP.'
                );
            
            // Create a select menu
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('arena_bet_challenge_select')
                .setPlaceholder('Select a challenge');
                
            bettableChallenges.forEach((challenge, index) => {
                // Check if user already has a bet on this challenge
                const existingBet = challenge.bets?.find(bet => bet.userId === user.discordId);
                
                // Create a title for the challenge
                let title;
                if (challenge.isOpenChallenge) {
                    title = `${challenge.challengerUsername}'s Open Challenge`;
                } else {
                    title = `${challenge.challengerUsername} vs ${challenge.challengeeUsername}`;
                }
                
                let label = title;
                
                if (existingBet) {
                    label += ` (Bet: ${existingBet.betAmount} GP on ${existingBet.targetPlayer})`;
                }
                
                const hoursLeft = Math.floor(72 - ((now - challenge.startDate) / (1000 * 60 * 60)));
                
                selectMenu.addOptions({
                    label: label.substring(0, 100),
                    description: `${challenge.gameTitle} | Pool: ${challenge.totalPool || 0} GP | Betting: ${hoursLeft}h left`,
                    value: challenge._id.toString()
                });
                
                // Add info to the embed
                const timeRemaining = formatTimeRemaining(challenge.endDate);
                const bettingEnds = formatTimeRemaining(new Date(challenge.startDate.getTime() + (72 * 60 * 60 * 1000)));
                
                // Calculate total pot based on challenge type
                let wagerPool;
                if (challenge.isOpenChallenge) {
                    const participantCount = (challenge.participants?.length || 0) + 1; // +1 for creator
                    wagerPool = challenge.wagerAmount * participantCount;
                } else {
                    wagerPool = challenge.wagerAmount * 2;
                }
                
                const totalPool = (challenge.totalPool || 0) + wagerPool;
                
                // Create description for challenge type
                let challengeDescription;
                if (challenge.isOpenChallenge) {
                    const participantCount = (challenge.participants?.length || 0) + 1; // +1 for creator
                    const participantsList = [`${challenge.challengerUsername} (Creator)`];
                    challenge.participants.forEach(p => participantsList.push(p.username));
                    
                    challengeDescription = `**Open Challenge with ${participantCount} participants**\n` +
                                          `**Participants:** ${participantsList.join(', ')}\n`;
                } else {
                    challengeDescription = `**Game:** ${challenge.gameTitle}\n`;
                }
                
                // Add leaderboard link
                const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                
                embed.addFields({
                    name: `${index + 1}. ${title}`,
                    value: challengeDescription +
                           `**Wager Pool:** ${wagerPool} GP\n` +
                           `**Total Betting Pool:** ${totalPool} GP\n` +
                           `**Challenge Ends:** ${timeRemaining}\n` +
                           `**Betting Ends:** ${bettingEnds}\n` +
                           `**Leaderboard:** ${leaderboardLink}`
                });
                
                if (existingBet) {
                    embed.addFields({
                        name: `Your Bet on Challenge #${index + 1}`,
                        value: `**${existingBet.betAmount} GP** on **${existingBet.targetPlayer}**`
                    });
                }
            });
            
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            
            // Add back button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.editReply({
                embeds: [embed],
                components: [selectRow, backRow]
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
            
            // Check if challenge is within 72-hour betting window
            const now = new Date();
            const challengeAge = (now - challenge.startDate) / (1000 * 60 * 60);
            if (challengeAge > 72) {
                return interaction.editReply('Betting for this challenge has closed. Bets are only accepted during the first 72 hours of a challenge.');
            }
            
            // Get user
            const user = await User.findOne({ discordId: interaction.user.id });
            
            // Check if user is part of the challenge
            if (challenge.challengerId === user.discordId || challenge.challengeeId === user.discordId) {
                return interaction.editReply('You cannot bet on a challenge you are participating in.');
            }
            
            // Check if user is a participant in an open challenge
            if (challenge.isOpenChallenge && challenge.participants) {
                const isParticipant = challenge.participants.some(p => p.userId === user.discordId);
                if (isParticipant) {
                    return interaction.editReply('You cannot bet on a challenge you are participating in.');
                }
            }
            
            // Check if user has already bet on this challenge
            const existingBet = challenge.bets?.find(bet => bet.userId === user.discordId);
            if (existingBet) {
                return interaction.editReply(`You've already placed a bet of ${existingBet.betAmount} GP on ${existingBet.targetPlayer}.`);
            }
            
            // Add leaderboard link
            const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
            const bettingEnds = formatTimeRemaining(new Date(challenge.startDate.getTime() + (72 * 60 * 60 * 1000)));
            
            // Create an embed with challenge details
            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle(`Place Bet: ${challenge.isOpenChallenge ? challenge.gameTitle : `${challenge.challengerUsername} vs ${challenge.challengeeUsername}`}`)
                .setDescription(
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Description:** ${challenge.description || 'No description provided'}\n` +
                    `**Betting Ends:** ${bettingEnds}\n` +
                    `**Leaderboard:** ${leaderboardLink}\n\n` +
                    `**Pot Betting System:** Your bet joins the total prize pool. ` +
                    `If your chosen player wins, you get your bet back plus a share of the losing side's bets proportional to your bet amount.\n\n` +
                    `**House Guarantee:** If you're the only bettor, the house guarantees 50% profit on your bet if you win.\n\n` +
                    `**Note:** Maximum bet is 100 GP.\n\n` +
                    `Select which player you want to bet on:`
                );
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Create select menu for player selection
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('arena_bet_player_select')
                .setPlaceholder('Select a player to bet on');
                
            // Count bets on each option
            const betCounts = new Map();
            
            if (challenge.bets && challenge.bets.length > 0) {
                for (const bet of challenge.bets) {
                    const count = betCounts.get(bet.targetPlayer) || 0;
                    betCounts.set(bet.targetPlayer, count + 1);
                }
            }
                
            // If open challenge with participants, show all options
            if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                // Add creator as option
                const creatorBets = betCounts.get(challenge.challengerUsername) || 0;
                selectMenu.addOptions({
                    label: challenge.challengerUsername,
                    description: `Creator (${creatorBets} bets)`,
                    value: `${selectedChallengeId}_${challenge.challengerUsername}`
                });
                
                // Add each participant as option
                challenge.participants.forEach(participant => {
                    const participantBets = betCounts.get(participant.username) || 0;
                    
                    selectMenu.addOptions({
                        label: participant.username,
                        description: `Participant (${participantBets} bets)`,
                        value: `${selectedChallengeId}_${participant.username}`
                    });
                });
            } 
            // Regular 1v1 challenge
            else {
                const challengerBets = betCounts.get(challenge.challengerUsername) || 0;
                const challengeeBets = betCounts.get(challenge.challengeeUsername) || 0;
                
                selectMenu.addOptions([
                    {
                        label: challenge.challengerUsername,
                        description: `Challenger (${challengerBets} bets)`,
                        value: `${selectedChallengeId}_${challenge.challengerUsername}`
                    },
                    {
                        label: challenge.challengeeUsername,
                        description: `Challengee (${challengeeBets} bets)`,
                        value: `${selectedChallengeId}_${challenge.challengeeUsername}`
                    }
                ]);
            }
            
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            
            // Add back button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.editReply({
                embeds: [embed],
                components: [selectRow, backRow]
            });
        } catch (error) {
            console.error('Error selecting challenge for betting:', error);
            await interaction.editReply('An error occurred while preparing your bet.');
        }
    },
    
    // Handle player selection for bet
    async handleBetPlayerSelect(interaction) {
        try {
            const [challengeId, playerName] = interaction.values[0].split('_');
            
            // Get the challenge
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge || challenge.status !== 'active') {
                await interaction.deferUpdate();
                return interaction.editReply('This challenge is no longer active.');
            }
            
            // Check 72-hour betting window
            const now = new Date();
            const challengeAge = (now - challenge.startDate) / (1000 * 60 * 60);
            if (challengeAge > 72) {
                await interaction.deferUpdate();
                return interaction.editReply('Betting for this challenge has closed. Bets are only accepted during the first 72 hours of a challenge.');
            }
            
            // Get user
            const user = await User.findOne({ discordId: interaction.user.id });
            
            // Show bet amount modal without deferring first
            const betModal = new ModalBuilder()
                .setCustomId(`arena_bet_amount_modal_${challengeId}_${playerName}`)
                .setTitle(`Place Bet on ${playerName}`);
                
            const betAmountInput = new TextInputBuilder()
                .setCustomId('bet_amount')
                .setLabel(`GP to Bet (Max: 100 GP, Balance: ${user.gp || 0} GP)`)
                .setPlaceholder('Enter amount (10-100 GP)')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            const betDescription = new TextInputBuilder()
                .setCustomId('bet_description')
                .setLabel('Betting System Info')
                .setValue('Pot Betting: Win your bet back plus a proportional share of the losing bets')
                .setRequired(false)
                .setStyle(TextInputStyle.Short);
            
            betModal.addComponents(
                new ActionRowBuilder().addComponents(betAmountInput),
                new ActionRowBuilder().addComponents(betDescription)
            );
            
            // Show the modal - check if interaction has already been acknowledged
            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.showModal(betModal);
                } else {
                    // If already acknowledged, create a fallback button
                    await interaction.editReply({
                        content: 'Click this button to place your bet:',
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`arena_show_bet_modal_${challengeId}_${playerName}`)
                                    .setLabel(`Bet on ${playerName}`)
                                    .setStyle(ButtonStyle.Primary)
                            )
                        ]
                    });
                }
            } catch (modalError) {
                console.error('Error showing bet modal:', modalError);
                // If the interaction was already replied to, try a different approach
                if (modalError.message.includes('already been replied') || modalError.message.includes('already replied') || modalError.message.includes('acknowledged')) {
                    await interaction.update({
                        content: 'There was an issue showing the betting form. Please try again by selecting "Place a Bet" from the main menu.',
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('arena_back_to_main')
                                    .setLabel('Back to Arena')
                                    .setStyle(ButtonStyle.Secondary)
                            )
                        ],
                        embeds: []
                    });
                }
            }
        } catch (error) {
            console.error('Error selecting player for bet:', error);
            await interaction.deferUpdate();
            await interaction.editReply('An error occurred while preparing your bet.');
        }
    },
    
    // Handle bet amount modal submission - capped at 100 GP
    async handleBetAmountModal(interaction, challengeId, playerName) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const betAmount = parseInt(interaction.fields.getTextInputValue('bet_amount'), 10);
            
            // Validate bet amount
            if (isNaN(betAmount) || betAmount < 10) {
                return interaction.editReply('Bet amount must be at least 10 GP.');
            }
            
            // Cap bets at 100 GP
            if (betAmount > 100) {
                return interaction.editReply('Bets are capped at 100 GP maximum. Please enter a bet amount of 100 GP or less.');
            }
            
            // Get user and challenge
            const user = await User.findOne({ discordId: interaction.user.id });
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge || challenge.status !== 'active') {
                return interaction.editReply('This challenge is no longer active.');
            }
            
            // Check 72-hour betting window
            const now = new Date();
            const challengeAge = (now - challenge.startDate) / (1000 * 60 * 60);
            if (challengeAge > 72) {
                return interaction.editReply('Betting for this challenge has closed. Bets are only accepted during the first 72 hours of a challenge.');
            }
            
            // Check if user is part of the challenge
            if (challenge.challengerId === user.discordId || challenge.challengeeId === user.discordId) {
                return interaction.editReply('You cannot bet on a challenge you are participating in.');
            }
            
            // Check if user is a participant in an open challenge
            if (challenge.isOpenChallenge && challenge.participants) {
                const isParticipant = challenge.participants.some(p => p.userId === user.discordId);
                if (isParticipant) {
                    return interaction.editReply('You cannot bet on a challenge you are participating in.');
                }
            }
            
            // Check if user has enough GP
            if ((user.gp || 0) < betAmount) {
                return interaction.editReply(`You don't have enough GP. Your balance: ${user.gp || 0} GP`);
            }
            
            // Check if user has already bet on this challenge
            const existingBet = challenge.bets?.find(bet => bet.userId === user.discordId);
            if (existingBet) {
                return interaction.editReply(`You've already placed a bet on this challenge.`);
            }
            
            // Check if user is the only bettor
            const isSoleBettor = !challenge.bets || challenge.bets.length === 0;
            
            // Calculate potential winnings based on pot betting
            let potDescription = '';
            
            if (isSoleBettor) {
                const guaranteedProfit = Math.floor(betAmount * 0.5); // 50% guarantee
                potDescription = `Since you're the only bettor, the house guarantees you'll win ${guaranteedProfit} GP (50% profit) if ${playerName} wins.`;
            } else {
                // Count bets on each side for pot description
                const bets = challenge.bets || [];
                
                // For open challenges, determine which bets are on the same player as the user's bet
                let targetPlayerBets, opposingPlayerBets;
                
                targetPlayerBets = bets.filter(bet => bet.targetPlayer === playerName);
                opposingPlayerBets = bets.filter(bet => bet.targetPlayer !== playerName);
                
                const targetPlayerPool = targetPlayerBets.reduce((sum, bet) => sum + bet.betAmount, 0) + betAmount;
                const opposingPlayerPool = opposingPlayerBets.reduce((sum, bet) => sum + bet.betAmount, 0);
                
                if (opposingPlayerPool > 0) {
                    const estimatedShare = Math.floor((betAmount / targetPlayerPool) * opposingPlayerPool);
                    potDescription = `If ${playerName} wins, you'd get your ${betAmount} GP back plus about ${estimatedShare} GP from the pot (proportional share of ${opposingPlayerPool} GP).`;
                } else {
                    potDescription = `Currently all bets are on ${playerName}. If more users bet on the opposing player(s), you'll receive a proportional share of those bets if ${playerName} wins.`;
                }
            }
            
            // Place the bet with GP tracking
            await arenaService.trackGpTransaction(
                user, 
                -betAmount, 
                'Bet placement', 
                `Challenge ID: ${challenge._id}, Bet on: ${playerName}`
            );
            
            // Update user stats
            user.arenaStats = user.arenaStats || {};
            user.arenaStats.betsPlaced = (user.arenaStats.betsPlaced || 0) + 1;
            await user.save();
            
            // Add bet to challenge
            if (!challenge.bets) {
                challenge.bets = [];
            }
            
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
                    `**Potential Winnings:** ${potDescription}\n\n` +
                    `Good luck! Results will be posted in the Arena channel.`
                );
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error processing bet:', error);
            return interaction.editReply('An error occurred while placing your bet.');
        }
    },
    
    // Show user's active and pending challenges - with refresh buttons for active challenges
    async showMyChallenges(interaction) {
        try {
            await interaction.deferUpdate();
            
            // Find user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to view your challenges.');
            }
            
            // Find user's challenges - updated to include open challenges they've joined
            const challenges = await ArenaChallenge.find({
                $or: [
                    { challengerId: user.discordId, status: { $in: ['pending', 'active', 'open'] } },
                    { challengeeId: user.discordId, status: { $in: ['pending', 'active'] } },
                    { 'participants.userId': user.discordId, status: { $in: ['active', 'open'] } }
                ]
            }).sort({ createdAt: -1 });
            
            if (challenges.length === 0) {
                return interaction.editReply('You have no active or pending challenges.');
            }
            
            // Create an embed to display challenges
            const embed = new EmbedBuilder()
                .setColor('#FF5722')
                .setTitle('My Arena Challenges')
                .setDescription(`Here are your active and pending challenges, ${user.raUsername}:`);
            
            // Group challenges by status and type
            const pendingChallenges = challenges.filter(c => c.status === 'pending');
            const openChallenges = challenges.filter(c => c.status === 'open' && c.challengerId === user.discordId);
            const joinedOpenChallenges = challenges.filter(c => c.status === 'open' && c.challengerId !== user.discordId && c.participants?.some(p => p.userId === user.discordId));
            const activeDirectChallenges = challenges.filter(c => c.status === 'active' && !c.isOpenChallenge);
            const activeOpenChallenges = challenges.filter(c => c.status === 'active' && c.isOpenChallenge);
            
            // Add pending challenges
            if (pendingChallenges.length > 0) {
                let pendingText = '';
                
                pendingChallenges.forEach((challenge, index) => {
                    const isChallenger = challenge.challengerId === user.discordId;
                    const opponent = isChallenger ? challenge.challengeeUsername : challenge.challengerUsername;
                    const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                    
                    pendingText += `**${index + 1}. ${challenge.gameTitle}** vs ${opponent}\n` +
                                 `**Wager:** ${challenge.wagerAmount} GP | **Duration:** 1 week\n` +
                                 `${leaderboardLink}\n` +
                                 `**Status:** ${isChallenger ? 'Waiting for response' : 'Needs your response'}\n\n`;
                });
                
                embed.addFields({ name: '🕒 Pending Challenges', value: pendingText || 'None' });
            }
            
            // Add open challenges that you created
            if (openChallenges.length > 0) {
                let openText = '';
                
                openChallenges.forEach((challenge, index) => {
                    const timeRemaining = formatTimeRemaining(challenge.endDate || new Date(Date.now() + 604800000)); // Default to 1 week from now
                    const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                    const participantCount = (challenge.participants?.length || 0) + 1; // +1 to include creator
                    
                    openText += `**${index + 1}. ${challenge.gameTitle}** (Open Challenge)\n` +
                                `**Wager:** ${challenge.wagerAmount} GP\n` +
                                `**Participants:** ${participantCount}\n` + 
                                `${leaderboardLink}\n` +
                                `**Status:** Open for joining\n\n`;
                });
                
                embed.addFields({ name: '📢 Your Open Challenges', value: openText || 'None' });
            }
            
            // Add open challenges that you've joined
            if (joinedOpenChallenges.length > 0) {
                let joinedText = '';
                
                joinedOpenChallenges.forEach((challenge, index) => {
                    const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                    const participantCount = (challenge.participants?.length || 0) + 1; // +1 to include creator
                    
                    joinedText += `**${index + 1}. ${challenge.gameTitle}** (Created by ${challenge.challengerUsername})\n` +
                                `**Wager:** ${challenge.wagerAmount} GP\n` +
                                `**Participants:** ${participantCount}\n` + 
                                `${leaderboardLink}\n` +
                                `**Status:** You have joined this open challenge\n\n`;
                });
                
                embed.addFields({ name: '🔵 Open Challenges You\'ve Joined', value: joinedText || 'None' });
            }
            
            // Add active direct challenges
            if (activeDirectChallenges.length > 0) {
                let activeText = '';
                
                activeDirectChallenges.forEach((challenge, index) => {
                    const isChallenger = challenge.challengerId === user.discordId;
                    const opponent = isChallenger ? challenge.challengeeUsername : challenge.challengerUsername;
                    const timeRemaining = formatTimeRemaining(challenge.endDate);
                    const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                    
                    activeText += `**${index + 1}. ${challenge.gameTitle}** vs ${opponent}\n` +
                                `**Wager:** ${challenge.wagerAmount} GP | **Ends:** ${timeRemaining}\n` +
                                `**Total Pool:** ${(challenge.totalPool || 0) + (challenge.wagerAmount * 2)} GP\n` +
                                `${leaderboardLink}\n\n`;
                });
                
                embed.addFields({ name: '⚔️ Active Direct Challenges', value: activeText || 'None' });
            }
            
            // Add active open challenges
            if (activeOpenChallenges.length > 0) {
                let openText = '';
                
                activeOpenChallenges.forEach((challenge, index) => {
                    const isCreator = challenge.challengerId === user.discordId;
                    const timeRemaining = formatTimeRemaining(challenge.endDate);
                    const participantCount = (challenge.participants?.length || 0) + 1; // +1 for creator
                    const totalWagered = challenge.wagerAmount * participantCount;
                    const totalPool = (challenge.totalPool || 0) + totalWagered;
                    const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                    
                    openText += `**${index + 1}. ${challenge.gameTitle}** (${isCreator ? 'You created' : 'You joined'})\n` +
                               `**Wager:** ${challenge.wagerAmount} GP | **Ends:** ${timeRemaining}\n` +
                               `**Participants:** ${participantCount} | ` +
                               `**Total Pool:** ${totalPool} GP\n` +
                               `${leaderboardLink}\n\n`;
                });
                
                embed.addFields({ name: '🌐 Active Open Challenges', value: openText || 'None' });
            }
            
            // Create buttons for active challenges (if any)
            const rows = [];
            
            // Create buttons for refreshing active challenges
            const allActiveChallenges = [...activeDirectChallenges, ...activeOpenChallenges];
            const refreshButtons = [];
            
            // Only show refresh buttons if there are active challenges
            if (allActiveChallenges.length > 0) {
                // Create buttons for up to 5 active challenges (Discord limit)
                const maxButtons = Math.min(allActiveChallenges.length, 5);
                
                for (let i = 0; i < maxButtons; i++) {
                    const challenge = allActiveChallenges[i];
                    refreshButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`arena_refresh_leaderboard_${challenge._id}`)
                            .setLabel(`Refresh #${i + 1}`)
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔄')
                    );
                }
                
                // If we have refresh buttons, add them to a row
                if (refreshButtons.length > 0) {
                    const refreshRow = new ActionRowBuilder().addComponents(refreshButtons);
                    rows.push(refreshRow);
                }
            }
            
            // Always add the back button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            rows.push(backRow);
            
            await interaction.editReply({
                embeds: [embed],
                components: rows
            });
        } catch (error) {
            console.error('Error showing user challenges:', error);
            await interaction.editReply('An error occurred while loading your challenges.');
        }
    },
    
    // Show open challenges for joining
    async showOpenChallenges(interaction) {
        await interaction.deferUpdate();
        
        try {
            // Find open challenges - FIXED to show all open challenges correctly
            const openChallenges = await ArenaChallenge.find({
                isOpenChallenge: true,
                status: 'open'
            }).sort({ createdAt: -1 });
            
            if (openChallenges.length === 0) {
                return interaction.editReply('There are no open challenges available right now.');
            }
            
            // Get user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to join challenges.');
            }
            
            // Create embed showing available open challenges
            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle('Open Arena Challenges')
                .setDescription('Join these open challenges by clicking the "Join Challenge" button:');
            
            // Add challenge info to embed
            openChallenges.forEach((challenge, index) => {
                const participantCount = challenge.participants?.length || 0; // Count of participants (not including creator)
                const participantLimit = challenge.maxParticipants ? 
                    `${participantCount + 1}/${challenge.maxParticipants}` : 
                    `${participantCount + 1} (unlimited)`; // +1 to include creator
                
                // Add leaderboard link
                const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                
                // Check if user has already joined this challenge
                const alreadyJoined = challenge.participants?.some(p => p.userId === user.discordId);
                const isCreator = challenge.challengerId === user.discordId;
                
                let statusText = '';
                if (isCreator) {
                    statusText = '**Status:** You created this challenge\n';
                } else if (alreadyJoined) {
                    statusText = '**Status:** You have already joined this challenge\n';
                }
                
                embed.addFields({
                    name: `${index + 1}. ${challenge.gameTitle}`,
                    value: `**Creator:** ${challenge.challengerUsername}\n` +
                           `**Description:** ${challenge.description || 'No description provided'}\n` +
                           `**Wager:** ${challenge.wagerAmount} GP\n` +
                           `**Participants:** ${participantLimit}\n` +
                           statusText +
                           `${leaderboardLink}\n` +
                           `**Challenge ID:** \`${challenge._id}\``
                });
            });
            
            // Create action buttons for first 5 challenges (Discord limit)
            const rows = [];
            const buttonsPerRow = 5;
            const maxButtons = Math.min(openChallenges.length, 25); // Discord limit of 25 buttons total
            
            for (let i = 0; i < maxButtons; i += buttonsPerRow) {
                const row = new ActionRowBuilder();
                
                for (let j = 0; j < buttonsPerRow && (i + j) < maxButtons; j++) {
                    const challenge = openChallenges[i + j];
                    
                    // Don't allow joining if user is creator or already joined
                    const alreadyJoined = challenge.participants?.some(p => p.userId === user.discordId);
                    const isCreator = challenge.challengerId === user.discordId;
                    
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`arena_join_challenge_${challenge._id}`)
                            .setLabel(`Join #${i + j + 1}`)
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(isCreator || alreadyJoined)
                    );
                }
                
                rows.push(row);
            }
            
            // Add back button
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            rows.push(backRow);
            
            await interaction.editReply({
                embeds: [embed],
                components: rows
            });
        } catch (error) {
            console.error('Error showing open challenges:', error);
            await interaction.editReply('An error occurred while loading open challenges.');
        }
    },
    
    // Handle joining an open challenge - FIXED to keep challenges open after joining
    async handleJoinChallenge(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const customId = interaction.customId;
        const challengeId = customId.replace('arena_join_challenge_', '');
        
        try {
            // Get the challenge
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge || challenge.status !== 'open' || !challenge.isOpenChallenge) {
                return interaction.editReply('This challenge is no longer available to join.');
            }
            
            // Get user
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to join challenges.');
            }
            
            // Check if user has already joined
            const alreadyJoined = challenge.participants?.some(p => p.userId === user.discordId);
            if (alreadyJoined) {
                return interaction.editReply('You have already joined this challenge.');
            }
            
            // Check if user is the creator
            if (challenge.challengerId === user.discordId) {
                return interaction.editReply('You cannot join your own challenge.');
            }
            
            // Check if at max participants
            if (challenge.maxParticipants && 
                challenge.participants && 
                challenge.participants.length >= challenge.maxParticipants) {
                return interaction.editReply('This challenge has reached its maximum number of participants.');
            }
            
            // Check if user has enough GP
            if ((user.gp || 0) < challenge.wagerAmount) {
                return interaction.editReply(`You don't have enough GP to join. Required: ${challenge.wagerAmount} GP, Your balance: ${user.gp || 0} GP`);
            }
            
            // Deduct GP from user with tracking
            await arenaService.trackGpTransaction(
                user, 
                -challenge.wagerAmount, 
                'Joined open challenge', 
                `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
            );
            
            // Add user to participants
            if (!challenge.participants) {
                challenge.participants = [];
            }
            
            challenge.participants.push({
                userId: user.discordId,
                username: user.raUsername,
                joinedAt: new Date(),
                score: 'No score yet',
                rank: 0,
                wagerPaid: true,
                completed: false
            });
            
            // IMPORTANT FIX: Keep the challenge status as "open" even after participants join
            // This ensures it remains visible to other potential participants
            // Only set start date if not already set
            if (!challenge.startDate) {
                challenge.startDate = new Date();
            }
            
            // Set end date based on duration if needed
            if (!challenge.endDate) {
                challenge.endDate = new Date(challenge.startDate.getTime() + (challenge.durationHours * 60 * 60 * 1000));
            }
            
            // Only change to active if we've hit a max participant limit
            if (challenge.maxParticipants && challenge.participants.length >= challenge.maxParticipants) {
                challenge.status = 'active';
            }
            
            console.log(`User ${user.raUsername} joined challenge ${challenge._id}. New status: ${challenge.status}, Participant count: ${challenge.participants.length}`);
            
            await challenge.save();
            
            // Notify about the new participant
            await arenaService.notifyParticipantJoined(challenge, user.raUsername);
            
            // Update the arena feed
            await arenaService.createOrUpdateArenaFeed(challenge);
            
            // Add leaderboard link
            const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Joined Open Challenge!')
                .setDescription(
                    `You've successfully joined the open challenge for **${challenge.gameTitle}**!\n\n` +
                    `**Description:** ${challenge.description || 'No description provided'}\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n` +
                    `**Your new GP balance:** ${user.gp} GP\n` +
                    `**Challenge status:** ${challenge.status}\n` +
                    `**Participants:** ${challenge.participants.length + 1} (including creator)\n` +
                    `${leaderboardLink}\n\n` +
                    `Good luck! Updates will be posted in the Arena channel.`
                );
            
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Add buttons to navigate to My Challenges or View Open Challenges
            const buttonsRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arena_my_challenges')
                        .setLabel('View My Challenges')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('arena_open_challenges')
                        .setLabel('View Open Challenges')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            return interaction.editReply({ 
                embeds: [embed],
                components: [buttonsRow]
            });
        } catch (error) {
            console.error('Error joining challenge:', error);
            return interaction.editReply('An error occurred while joining the challenge.');
        }
    },
    
    // Handle refreshing leaderboard data
    async handleRefreshLeaderboard(interaction, challengeId) {
        try {
            await interaction.deferUpdate();
            
            // Get the challenge
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge || challenge.status !== 'active') {
                return interaction.editReply('This challenge is no longer active.');
            }
            
            if (challenge.isOpenChallenge) {
                // For open challenges with multiple participants
                await arenaService.refreshOpenChallengeLeaderboard(interaction, challenge);
            } else {
                // For regular 1v1 challenges
                await arenaService.refreshDirectChallengeLeaderboard(interaction, challenge);
            }
        } catch (error) {
            console.error('Error refreshing leaderboard:', error);
            return interaction.editReply('An error occurred while refreshing the leaderboard data.');
        }
    },
    
    // Show arena help info
    async showArenaHelp(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('How the Arena Works')
            .setDescription(
                'The Arena is a competition system where players can challenge each other and place bets on outcomes.'
            )
            .addFields(
                {
                    name: '💰 GP Currency',
                    value: 'GP (Gold Points) is the Arena currency. You automatically receive 1,000 GP at the start of each month.'
                },
                {
                    name: '⚔️ Challenges',
                    value: 'Challenge another player to compete on a RetroAchievements leaderboard for 1 week. ' +
                           'Both players wager GP, and the winner takes all!'
                },
                {
                    name: '🌐 Open Challenges',
                    value: 'Create an open challenge that anyone can join. All participants wager the same amount, ' +
                           'and the winner at the end takes the entire pot!'
                },
                {
                    name: '🎲 Pot Betting',
                    value: 'You can bet GP on other players\' challenges. Your bet joins the total prize pool. ' +
                           'If your chosen player wins, you get your bet back plus a share of the losing bets proportional to your bet amount. ' +
                           'Maximum bet: 100 GP. Betting is only available during the first 72 hours of a challenge.'
                },
                {
                    name: '💸 House Guarantee',
                    value: 'If you\'re the only person to bet on a challenge, the house guarantees you\'ll get a 50% profit if your chosen player wins.'
                },
                {
                    name: '🏆 Rewards',
                    value: 'The player with the most GP at the end of the year receives a special champion title and badge.'
                },
                {
                    name: '📝 Creating Good Challenges',
                    value: 'When creating a challenge, you must clearly specify:\n' +
                           '• Which track/level/circuit in a racing game\n' +
                           '• Which game mode or difficulty\n' +
                           '• What determines the winner (fastest time, highest score)'
                }
            )
            .setFooter({ text: 'Use /arena to access all Arena features' });

        // Add a back button
        const backRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arena_back_to_main')
                    .setLabel('Back to Arena')
                    .setStyle(ButtonStyle.Secondary)
            );
            
        await interaction.editReply({
            embeds: [embed],
            components: [backRow]
        });
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
            
            // Deduct wager from user with tracking
            await arenaService.trackGpTransaction(
                user, 
                -challenge.wagerAmount, 
                'Accepted challenge', 
                `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
            );
            
            // Update user stats
            user.arenaStats = user.arenaStats || {};
            user.arenaStats.challengesAccepted = (user.arenaStats.challengesAccepted || 0) + 1;
            await user.save();
            
            // Notify about the accepted challenge
            await arenaService.notifyChallengeUpdate(challenge);
            
            // Initialize the leaderboard in the feed
            await arenaService.createOrUpdateArenaFeed(challenge);
            
            // Add leaderboard link
            const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
            
            // Create response embed - fixed duration
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Challenge Accepted!')
                .setDescription(
                    `You've accepted the challenge from ${challenge.challengerUsername}!\n\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n` +
                    `**Duration:** 1 week\n` +
                    `**Ends:** ${challenge.endDate.toLocaleString()}\n` +
                    `${leaderboardLink}\n\n` +
                    `Good luck! Updates will be posted in the Arena channel.`
                );
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
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
            
            // Verify the user is the challengee
            if (challenge.challengeeId !== interaction.user.id) {
                return interaction.editReply('This challenge is not for you to decline.');
            }
            
            // Get the challenger
            const challenger = await User.findOne({ discordId: challenge.challengerId });
            
            // Update challenge status
            challenge.status = 'declined';
            await challenge.save();
            
            // Refund the challenger's wager
            if (challenger) {
                await arenaService.trackGpTransaction(
                    challenger, 
                    challenge.wagerAmount, 
                    'Challenge declined - wager refunded', 
                    `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
                );
            }
            
            // Send notification about declined challenge
            await arenaService.notifyChallengeUpdate(challenge);
            
            // Show confirmation to the user
            await interaction.editReply({
                content: `You have declined the challenge from ${challenge.challengerUsername}. The challenger has been refunded their wager.`,
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('arena_back_to_main')
                                .setLabel('Back to Arena')
                                .setStyle(ButtonStyle.Secondary)
                        )
                ]
            });
        } catch (error) {
            console.error('Error declining challenge:', error);
            await interaction.editReply('An error occurred while declining the challenge.');
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
        else if (customId === 'arena_back_to_main') {
            await interaction.deferUpdate();
            const user = await User.findOne({ discordId: interaction.user.id });
            // Skip GP check when returning to main menu
            await this.showMainArenaMenu(interaction, user, true);
        }
        else if (customId === 'arena_help') {
            await interaction.deferUpdate();
            await this.showArenaHelp(interaction);
        }
        else if (customId.startsWith('arena_join_challenge_')) {
            await this.handleJoinChallenge(interaction);
        }
        else if (customId.startsWith('arena_refresh_leaderboard_')) {
            const challengeId = customId.replace('arena_refresh_leaderboard_', '');
            await this.handleRefreshLeaderboard(interaction, challengeId);
        }
        else if (customId === 'arena_show_challenge_modal') {
            // Handle the new button for challenge modal
            try {
                // Verify user is registered
                const challenger = await User.findOne({ discordId: interaction.user.id });
                if (!challenger) {
                    await interaction.reply({
                        content: 'You need to be registered to issue challenges. Please contact an admin.',
                        ephemeral: true
                    });
                    return;
                }
                
                // Create modal for challenge creation
                const modal = new ModalBuilder()
                    .setCustomId('arena_create_challenge_modal')
                    .setTitle('Challenge Another Player');
                    
                // Input for opponent's RA username
                const usernameInput = new TextInputBuilder()
                    .setCustomId('opponent_username')
                    .setLabel('RetroAchievements Username to Challenge')
                    .setPlaceholder('Enter opponent\'s RA username (leave blank for open challenge)')
                    .setRequired(false) // Make it optional to allow for open challenges
                    .setStyle(TextInputStyle.Short);

                // Input for game ID
                const gameIdInput = new TextInputBuilder()
                    .setCustomId('game_id')
                    .setLabel('RetroAchievements Game ID')
                    .setPlaceholder('e.g. 14402')
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short);
                    
                // Input for leaderboard ID
                const leaderboardInput = new TextInputBuilder()
                    .setCustomId('leaderboard_id')
                    .setLabel('Leaderboard ID (from RetroAchievements)')
                    .setPlaceholder('e.g. 9391')
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short);
                    
                // Input for description (shorter placeholder)
                const descriptionInput = new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('Challenge Description')
                    .setPlaceholder('Specify: 1) Track/level 2) Competition type (time/score) 3) Rules')
                    .setRequired(true)
                    .setStyle(TextInputStyle.Paragraph);
                    
                // Input for wager amount
                const wagerInput = new TextInputBuilder()
                    .setCustomId('wager_amount')
                    .setLabel(`GP to Wager (Current Balance: ${challenger.gp || 0} GP)`)
                    .setPlaceholder('Enter amount (minimum 10 GP)')
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short);
                    
                // Add inputs to modal
                modal.addComponents(
                    new ActionRowBuilder().addComponents(usernameInput),
                    new ActionRowBuilder().addComponents(gameIdInput),
                    new ActionRowBuilder().addComponents(leaderboardInput),
                    new ActionRowBuilder().addComponents(descriptionInput),
                    new ActionRowBuilder().addComponents(wagerInput)
                );
                
                // Show the modal
                await interaction.showModal(modal);
            } catch (error) {
                console.error('Error showing modal from button:', error);
                await interaction.reply({
                    content: 'An error occurred while showing the challenge form. Please try again.',
                    ephemeral: true
                });
            }
        }
        else if (customId.startsWith('arena_show_bet_modal_')) {
            // Handle showing bet modal from button
            try {
                const parts = customId.split('_');
                const challengeId = parts[4];
                const playerName = parts[5];
                
                // Get user
                const user = await User.findOne({ discordId: interaction.user.id });
                
                // Create bet modal
                const betModal = new ModalBuilder()
                    .setCustomId(`arena_bet_amount_modal_${challengeId}_${playerName}`)
                    .setTitle(`Place Bet on ${playerName}`);
                    
                const betAmountInput = new TextInputBuilder()
                    .setCustomId('bet_amount')
                    .setLabel(`GP to Bet (Max: 100 GP, Balance: ${user.gp || 0} GP)`)
                    .setPlaceholder('Enter amount (10-100 GP)')
                    .setRequired(true)
                    .setStyle(TextInputStyle.Short);
                    
                const betDescription = new TextInputBuilder()
                    .setCustomId('bet_description')
                    .setLabel('Betting System Info')
                    .setValue('Pot Betting: Win your bet back plus a proportional share of the losing bets')
                    .setRequired(false)
                    .setStyle(TextInputStyle.Short);
                
                betModal.addComponents(
                    new ActionRowBuilder().addComponents(betAmountInput),
                    new ActionRowBuilder().addComponents(betDescription)
                );
                
                // Show the modal
                await interaction.showModal(betModal);
            } catch (error) {
                console.error('Error showing bet modal from button:', error);
                await interaction.reply({
                    content: 'An error occurred while showing the betting form. Please try again.',
                    ephemeral: true
                });
            }
        }
        // Add handlers for additional navigation buttons
        else if (customId === 'arena_my_challenges') {
            await this.showMyChallenges(interaction);
        }
        else if (customId === 'arena_open_challenges') {
            await this.showOpenChallenges(interaction);
        }
    },
    
    // Handle select menu interactions
    async handleSelectMenuInteraction(interaction) {
        const customId = interaction.customId;
        
        if (customId === 'arena_main_action') {
            const selectedValue = interaction.values[0];
            
            switch (selectedValue) {
                case 'create_challenge':
                    await this.showCreateChallengeModal(interaction);
                    break;
                case 'place_bet':
                    await this.showActiveChallengesForBetting(interaction);
                    break;
                case 'my_challenges':
                    await this.showMyChallenges(interaction);
                    break;
                case 'active_challenges':
                    await arenaService.showActiveChallengesToUser(interaction);
                    break;
                case 'leaderboard':
                    await arenaService.showGpLeaderboard(interaction);
                    break;
                case 'open_challenges':
                    await this.showOpenChallenges(interaction);
                    break;
                default:
                    await interaction.deferUpdate();
                    await interaction.editReply('Invalid selection. Please try again.');
            }
        } else if (customId === 'arena_pending_challenge_select') {
            await this.handlePendingChallengeSelect(interaction);
        } else if (customId === 'arena_bet_challenge_select') {
            await this.handleBetChallengeSelect(interaction);
        } else if (customId === 'arena_bet_player_select') {
            await this.handleBetPlayerSelect(interaction);
        }
    }
};
