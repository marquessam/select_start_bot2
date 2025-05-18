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
    
    // Show the main arena menu with all options - clean version with logging
    async showMainArenaMenu(interaction, user) {
        console.log(`[ARENA] Showing main menu for user ${user.raUsername} (${user.discordId})`);
        
        // Check if user should receive automatic monthly GP and give it
        await this.checkAndGrantMonthlyGP(user);
        
        // Get user's stats and relevant info
        const activeCount = await ArenaChallenge.countDocuments({
            $or: [
                { challengerId: user.discordId, status: 'active' },
                { challengeeId: user.discordId, status: 'active' }
            ]
        });
        
        // Format GP balance with commas
        const gpBalance = (user.gp || 0).toLocaleString();
        
        console.log(`[ARENA] User ${user.raUsername} has ${gpBalance} GP and ${activeCount} active challenges`);
        
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
        
        console.log(`[ARENA] Created embed for main menu`);
        
        // Create action menu - following the same pattern as adminarcade
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('arena_main_action')
                    .setPlaceholder('Select an action')
                    .addOptions([
                        {
                            label: 'Challenge a Player',
                            description: 'Create a new challenge against another player',
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
                        }
                    ])
            );
        
        console.log(`[ARENA] Created dropdown menu for main actions`);
        
        // Create help button
        const buttonsRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arena_help')
                    .setLabel('How Arena Works')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❓')
            );
        
        console.log(`[ARENA] Created help button`);
        console.log(`[ARENA] Sending main menu components to Discord...`);
        
        // Send the arena menu
        try {
            await interaction.editReply({
                embeds: [embed],
                components: [actionRow, buttonsRow]
            });
            console.log(`[ARENA] Successfully sent main menu to Discord`);
        } catch (error) {
            console.error(`[ARENA] Error sending main menu to Discord:`, error);
            // Try a fallback approach if the initial reply fails
            try {
                await interaction.editReply({
                    content: 'An error occurred while displaying the Arena menu. Please try again.',
                    components: []
                });
            } catch (fallbackError) {
                console.error(`[ARENA] Fallback error handling also failed:`, fallbackError);
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
                
                // Calculate days from hours for display
                const durationDays = Math.floor(challenge.durationHours / 24);
                
                // Show detailed challenge info
                embed.setDescription(
                    `**${challenge.challengerUsername}** has challenged you to compete in:\n\n` +
                    `**${challenge.gameTitle}**\n\n` +
                    `**Description:** ${challenge.description || 'No description provided'}\n\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n` +
                    `**Duration:** ${durationDays} days\n\n` +
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
                    const durationDays = Math.floor(challenge.durationHours / 24);
                    
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
                    const durationDays = Math.floor(challenge.durationHours / 24);
                    
                    selectMenu.addOptions({
                        label: `From ${challenge.challengerUsername} - ${challenge.gameTitle}`,
                        description: `Wager: ${challenge.wagerAmount} GP | Duration: ${durationDays} days`,
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
            // Verify user is registered (without deferring first)
            const challenger = await User.findOne({ discordId: interaction.user.id });
            if (!challenger) {
                // For error case, we defer and then edit
                await interaction.deferUpdate();
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

            // Input for game ID (like in adminArcade)
            const gameIdInput = new TextInputBuilder()
                .setCustomId('game_id')
                .setLabel('RetroAchievements Game ID')
                .setPlaceholder('e.g. 14402')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Input for leaderboard ID
            const leaderboardInput = new TextInputBuilder()
                .setCustomId('leaderboard_id')
                .setLabel('RetroAchievements Leaderboard ID')
                .setPlaceholder('e.g. 9391')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Input for description (like in adminArcade)
            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Challenge Description')
                .setPlaceholder('Describe the challenge or special rules')
                .setRequired(true)
                .setStyle(TextInputStyle.Paragraph);
                
            // Input for wager amount
            const wagerInput = new TextInputBuilder()
                .setCustomId('wager_amount')
                .setLabel(`GP to Wager (Current Balance: ${challenger.gp || 0} GP)`)
                .setPlaceholder('Enter amount (minimum 10 GP)')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Add inputs to modal - we can only have 5 max in a Discord modal
            modal.addComponents(
                new ActionRowBuilder().addComponents(usernameInput),
                new ActionRowBuilder().addComponents(gameIdInput),
                new ActionRowBuilder().addComponents(leaderboardInput),
                new ActionRowBuilder().addComponents(descriptionInput),
                new ActionRowBuilder().addComponents(wagerInput)
            );
            
            // Show the modal directly without deferring first
            try {
                await interaction.showModal(modal);
            } catch (modalError) {
                console.error('Error showing modal:', modalError);
                // If the interaction was already replied to, try a different approach
                if (modalError.message.includes('already been replied') || modalError.message.includes('already replied')) {
                    // Create a new modal with a different ID that isn't tied to the current interaction
                    const recoveryModal = new ModalBuilder()
                        .setCustomId('arena_create_challenge_modal_recovery')
                        .setTitle('Challenge Another Player');
                        
                    // Add the same components
                    recoveryModal.addComponents(
                        new ActionRowBuilder().addComponents(usernameInput.setCustomId('opponent_username_recovery')),
                        new ActionRowBuilder().addComponents(gameIdInput.setCustomId('game_id_recovery')),
                        new ActionRowBuilder().addComponents(leaderboardInput.setCustomId('leaderboard_id_recovery')),
                        new ActionRowBuilder().addComponents(descriptionInput.setCustomId('description_recovery')),
                        new ActionRowBuilder().addComponents(wagerInput.setCustomId('wager_amount_recovery'))
                    );
                    
                    // Try a different approach - reply with a button that shows the modal
                    await interaction.reply({
                        content: 'Click the button below to create a challenge:',
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('arena_show_challenge_modal')
                                    .setLabel('Create Challenge')
                                    .setStyle(ButtonStyle.Primary)
                            )
                        ],
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error showing challenge creation modal:', error);
            // For error handling, defer and then edit
            try {
                await interaction.deferUpdate();
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
            
            // Check if this is a recovery modal
            const isRecovery = interaction.customId === 'arena_create_challenge_modal_recovery';
            
            // Get form values with appropriate field IDs based on modal type
            const opponentUsername = interaction.fields.getTextInputValue(isRecovery ? 'opponent_username_recovery' : 'opponent_username');
            const gameId = parseInt(interaction.fields.getTextInputValue(isRecovery ? 'game_id_recovery' : 'game_id'));
            const leaderboardId = interaction.fields.getTextInputValue(isRecovery ? 'leaderboard_id_recovery' : 'leaderboard_id');
            const description = interaction.fields.getTextInputValue(isRecovery ? 'description_recovery' : 'description');
            const wagerAmount = parseInt(interaction.fields.getTextInputValue(isRecovery ? 'wager_amount_recovery' : 'wager_amount'), 10);
            
            // Extract duration from description since we removed the duration field
            // Set default duration to 7 days
            let durationDays = 7;
            
            // Try to extract duration from description if it's mentioned
            const durationMatch = description.match(/duration:?\s*(\d+)\s*days?/i);
            if (durationMatch && durationMatch[1]) {
                const extractedDuration = parseInt(durationMatch[1], 10);
                if (!isNaN(extractedDuration) && extractedDuration >= 1 && extractedDuration <= 14) {
                    durationDays = extractedDuration;
                }
            }
            
            const durationHours = durationDays * 24;
            
            // Validate inputs
            if (isNaN(wagerAmount) || wagerAmount < 10) {
                return interaction.editReply('Wager amount must be at least 10 GP.');
            }
            
            if (isNaN(gameId)) {
                return interaction.editReply('Please enter a valid Game ID.');
            }
            
            // Get challenger info
            const challenger = await User.findOne({ discordId: interaction.user.id });
            
            // Verify opponent exists and is registered
            const opponent = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${opponentUsername}import { 
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
    
    // Show the main arena menu with all options - clean version with logging
    async showMainArenaMenu(interaction, user) {
        console.log(`[ARENA] Showing main menu for user ${user.raUsername} (${user.discordId})`);
        
        // Check if user should receive automatic monthly GP and give it
        await this.checkAndGrantMonthlyGP(user);
        
        // Get user's stats and relevant info
        const activeCount = await ArenaChallenge.countDocuments({
            $or: [
                { challengerId: user.discordId, status: 'active' },
                { challengeeId: user.discordId, status: 'active' }
            ]
        });
        
        // Format GP balance with commas
        const gpBalance = (user.gp || 0).toLocaleString();
        
        console.log(`[ARENA] User ${user.raUsername} has ${gpBalance} GP and ${activeCount} active challenges`);
        
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
        
        console.log(`[ARENA] Created embed for main menu`);
        
        // Create action menu - following the same pattern as adminarcade
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('arena_main_action')
                    .setPlaceholder('Select an action')
                    .addOptions([
                        {
                            label: 'Challenge a Player',
                            description: 'Create a new challenge against another player',
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
                        }
                    ])
            );
        
        console.log(`[ARENA] Created dropdown menu for main actions`);
        
        // Create help button
        const buttonsRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arena_help')
                    .setLabel('How Arena Works')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('❓')
            );
        
        console.log(`[ARENA] Created help button`);
        console.log(`[ARENA] Sending main menu components to Discord...`);
        
        // Send the arena menu
        try {
            await interaction.editReply({
                embeds: [embed],
                components: [actionRow, buttonsRow]
            });
            console.log(`[ARENA] Successfully sent main menu to Discord`);
        } catch (error) {
            console.error(`[ARENA] Error sending main menu to Discord:`, error);
            // Try a fallback approach if the initial reply fails
            try {
                await interaction.editReply({
                    content: 'An error occurred while displaying the Arena menu. Please try again.',
                    components: []
                });
            } catch (fallbackError) {
                console.error(`[ARENA] Fallback error handling also failed:`, fallbackError);
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
                
                // Calculate days from hours for display
                const durationDays = Math.floor(challenge.durationHours / 24);
                
                // Show detailed challenge info
                embed.setDescription(
                    `**${challenge.challengerUsername}** has challenged you to compete in:\n\n` +
                    `**${challenge.gameTitle}**\n\n` +
                    `**Description:** ${challenge.description || 'No description provided'}\n\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n` +
                    `**Duration:** ${durationDays} days\n\n` +
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
                    const durationDays = Math.floor(challenge.durationHours / 24);
                    
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
                    const durationDays = Math.floor(challenge.durationHours / 24);
                    
                    selectMenu.addOptions({
                        label: `From ${challenge.challengerUsername} - ${challenge.gameTitle}`,
                        description: `Wager: ${challenge.wagerAmount} GP | Duration: ${durationDays} days`,
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
            // Verify user is registered (without deferring first)
            const challenger = await User.findOne({ discordId: interaction.user.id });
            if (!challenger) {
                // For error case, we defer and then edit
                await interaction.deferUpdate();
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

            // Input for game ID (like in adminArcade)
            const gameIdInput = new TextInputBuilder()
                .setCustomId('game_id')
                .setLabel('RetroAchievements Game ID')
                .setPlaceholder('e.g. 14402')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Input for leaderboard ID
            const leaderboardInput = new TextInputBuilder()
                .setCustomId('leaderboard_id')
                .setLabel('RetroAchievements Leaderboard ID')
                .setPlaceholder('e.g. 9391')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Input for description (like in adminArcade)
            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Challenge Description')
                .setPlaceholder('Describe the challenge or special rules')
                .setRequired(true)
                .setStyle(TextInputStyle.Paragraph);
                
            // Input for wager amount
            const wagerInput = new TextInputBuilder()
                .setCustomId('wager_amount')
                .setLabel(`GP to Wager (Current Balance: ${challenger.gp || 0} GP)`)
                .setPlaceholder('Enter amount (minimum 10 GP)')
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
                
            // Add inputs to modal - we can only have 5 max in a Discord modal
            modal.addComponents(
                new ActionRowBuilder().addComponents(usernameInput),
                new ActionRowBuilder().addComponents(gameIdInput),
                new ActionRowBuilder().addComponents(leaderboardInput),
                new ActionRowBuilder().addComponents(descriptionInput),
                new ActionRowBuilder().addComponents(wagerInput)
            );
            
            // Show the modal directly without deferring first
            try {
                await interaction.showModal(modal);
            } catch (modalError) {
                console.error('Error showing modal:', modalError);
                // If the interaction was already replied to, try a different approach
                if (modalError.message.includes('already been replied') || modalError.message.includes('already replied')) {
                    // Create a new modal with a different ID that isn't tied to the current interaction
                    const recoveryModal = new ModalBuilder()
                        .setCustomId('arena_create_challenge_modal_recovery')
                        .setTitle('Challenge Another Player');
                        
                    // Add the same components
                    recoveryModal.addComponents(
                        new ActionRowBuilder().addComponents(usernameInput.setCustomId('opponent_username_recovery')),
                        new ActionRowBuilder().addComponents(gameIdInput.setCustomId('game_id_recovery')),
                        new ActionRowBuilder().addComponents(leaderboardInput.setCustomId('leaderboard_id_recovery')),
                        new ActionRowBuilder().addComponents(descriptionInput.setCustomId('description_recovery')),
                        new ActionRowBuilder().addComponents(wagerInput.setCustomId('wager_amount_recovery'))
                    );
                    
                    // Try a different approach - reply with a button that shows the modal
                    await interaction.reply({
                        content: 'Click the button below to create a challenge:',
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('arena_show_challenge_modal')
                                    .setLabel('Create Challenge')
                                    .setStyle(ButtonStyle.Primary)
                            )
                        ],
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error showing challenge creation modal:', error);
            // For error handling, defer and then edit
            try {
                await interaction.deferUpdate();
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
    
    , 'i') }
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
            
            // Verify game exists - similar to adminArcade
            const gameInfo = await retroAPI.getGameInfo(gameId);
            if (!gameInfo) {
                return interaction.editReply('Game not found. Please check the game ID.');
            }
            
            // Verify leaderboard exists
            try {
                // Fetch leaderboard entries to verify the leaderboard exists
                const batch1 = await retroAPI.getLeaderboardEntriesDirect(leaderboardId, 0, 500);
                const batch2 = await retroAPI.getLeaderboardEntriesDirect(leaderboardId, 500, 500);
                
                // Combine the batches
                let rawEntries = [];
                
                // Process first batch
                if (batch1) {
                    if (Array.isArray(batch1)) {
                        rawEntries = [...rawEntries, ...batch1];
                    } else if (batch1.Results && Array.isArray(batch1.Results)) {
                        rawEntries = [...rawEntries, ...batch1.Results];
                    }
                }
                
                // Process second batch
                if (batch2) {
                    if (Array.isArray(batch2)) {
                        rawEntries = [...rawEntries, ...batch2];
                    } else if (batch2.Results && Array.isArray(batch2.Results)) {
                        rawEntries = [...rawEntries, ...batch2.Results];
                    }
                }
                
                console.log(`Total entries fetched for leaderboard ${leaderboardId}: ${rawEntries.length}`);
                
                if (!rawEntries || rawEntries.length === 0) {
                    return interaction.editReply(`Leaderboard ID ${leaderboardId} not found or has no entries.`);
                }
                
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
                    gameId: gameId,
                    gameTitle: gameInfo.title,
                    consoleName: gameInfo.consoleName || 'Unknown',
                    iconUrl: gameInfo.imageIcon || null,
                    description: description,
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
                        `You've challenged ${opponent.raUsername} to compete in ${gameInfo.title}!\n\n` +
                        `**Game:** ${gameInfo.title} (${gameInfo.consoleName || 'Unknown'})\n` +
                        `**Description:** ${description}\n` +
                        `**Wager:** ${wagerAmount} GP\n` +
                        `**Duration:** ${durationDays} days\n\n` +
                        `They'll be notified and can use \`/arena\` to respond.`
                    );
                
                if (gameInfo.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
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
            
            // Calculate days for display
            const durationDays = Math.floor(challenge.durationHours / 24);
            
            // Create an embed with challenge details
            const embed = new EmbedBuilder()
                .setColor('#FF5722')
                .setTitle(`Challenge from ${challenge.challengerUsername}`)
                .setDescription(
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Description:** ${challenge.description || 'No description provided'}\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n` +
                    `**Duration:** ${durationDays} days\n\n` +
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
                .setDescription(
                    'Select a challenge to bet on:\n\n' +
                    '**Pot Betting System:** Your bet is added to the total prize pool. ' +
                    'If your chosen player wins, you get your bet back plus a proportional share of the losing side bets based on your bet amount!\n\n' +
                    '**House Guarantee:** If you\'re the only bettor, the house will guarantee a 50% profit on your bet if you win.'
                );
            
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
            
            // Count bets on each side
            const challengerBets = challenge.bets.filter(bet => bet.targetPlayer === challenge.challengerUsername);
            const challengeeBets = challenge.bets.filter(bet => bet.targetPlayer === challenge.challengeeUsername);
            
            // Create an embed with challenge details
            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle(`Place Bet: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`)
                .setDescription(
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Current Wager Pool:** ${challenge.wagerAmount * 2} GP\n` +
                    `**Total Betting Pool:** ${challenge.totalPool || 0} GP\n\n` +
                    `**Pot Betting System:** Your bet joins the total prize pool. ` +
                    `If your chosen player wins, you get your bet back plus a share of the losing side's bets proportional to your bet amount.\n\n` +
                    `**House Guarantee:** If you're the only bettor, the house guarantees 50% profit on your bet if you win.\n\n` +
                    `**Current Bets:** ${challengerBets.length} on ${challenge.challengerUsername}, ${challengeeBets.length} on ${challenge.challengeeUsername}\n\n` +
                    `Select which player you want to bet on:`
                );
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Create select menu for player selection
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('arena_bet_player_select')
                .setPlaceholder('Select a player to bet on')
                .addOptions([
                    {
                        label: challenge.challengerUsername,
                        description: `Challenger (${challengerBets.length} bets)`,
                        value: `${selectedChallengeId}_${challenge.challengerUsername}`
                    },
                    {
                        label: challenge.challengeeUsername,
                        description: `Challengee (${challengeeBets.length} bets)`,
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
            const [challengeId, playerName] = interaction.values[0].split('_');
            
            // Get the challenge
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge || challenge.status !== 'active') {
                await interaction.deferUpdate();
                return interaction.editReply('This challenge is no longer active.');
            }
            
            // Get user
            const user = await User.findOne({ discordId: interaction.user.id });
            
            // Show bet amount modal without deferring first
            const betModal = new ModalBuilder()
                .setCustomId(`arena_bet_amount_modal_${challengeId}_${playerName}`)
                .setTitle(`Place Bet on ${playerName}`);
                
            const betAmountInput = new TextInputBuilder()
                .setCustomId('bet_amount')
                .setLabel(`GP to Bet (Current Balance: ${user.gp || 0} GP)`)
                .setPlaceholder('Enter amount (minimum 10 GP)')
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
            try {
                await interaction.showModal(betModal);
            } catch (modalError) {
                console.error('Error showing bet modal:', modalError);
                // If the interaction was already replied to, try a different approach
                if (modalError.message.includes('already been replied') || modalError.message.includes('already replied')) {
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
            
            // Check if user is the only bettor
            const isSoleBettor = challenge.bets.length === 0;
            
            // Calculate potential winnings based on pot betting
            let potDescription = '';
            
            if (isSoleBettor) {
                const guaranteedProfit = Math.floor(betAmount * 0.5); // 50% guarantee
                potDescription = `Since you're the only bettor, the house guarantees you'll win ${guaranteedProfit} GP (50% profit) if ${playerName} wins.`;
            } else {
                // Count bets on each side for pot description
                const challengerBets = challenge.bets.filter(bet => bet.targetPlayer === challenge.challengerUsername);
                const challengeeBets = challenge.bets.filter(bet => bet.targetPlayer === challenge.challengeeUsername);
                
                const targetPlayerBets = playerName === challenge.challengerUsername ? challengerBets : challengeeBets;
                const opposingPlayerBets = playerName === challenge.challengerUsername ? challengeeBets : challengerBets;
                
                const targetPlayerPool = targetPlayerBets.reduce((sum, bet) => sum + bet.betAmount, 0) + betAmount;
                const opposingPlayerPool = opposingPlayerBets.reduce((sum, bet) => sum + bet.betAmount, 0);
                
                if (opposingPlayerPool > 0) {
                    const estimatedShare = Math.floor((betAmount / targetPlayerPool) * opposingPlayerPool);
                    potDescription = `If ${playerName} wins, you'd get your ${betAmount} GP back plus about ${estimatedShare} GP from the pot (proportional share of ${opposingPlayerPool} GP).`;
                } else {
                    potDescription = `Currently all bets are on ${playerName}. If more users bet on the opposing player, you'll receive a proportional share of those bets if ${playerName} wins.`;
                }
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
                    const durationDays = Math.floor(challenge.durationHours / 24);
                    
                    pendingText += `**${index + 1}. ${challenge.gameTitle}** vs ${opponent}\n` +
                                 `**Wager:** ${challenge.wagerAmount} GP | **Duration:** ${durationDays} days\n` +
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
        else if (customId === 'arena_back_to_main') {
            await interaction.deferUpdate();
            const user = await User.findOne({ discordId: interaction.user.id });
            await this.showMainArenaMenu(interaction, user);
        }
        else if (customId === 'arena_help') {
            await interaction.deferUpdate();
            await this.showArenaHelp(interaction);
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
                    await this.handleActive(interaction);
                    break;
                case 'leaderboard':
                    await this.handleLeaderboard(interaction);
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
                    value: 'Challenge another player to compete on a RetroAchievements leaderboard for a set duration. ' +
                           'Both players wager GP, and the winner takes all!'
                },
                {
                    name: '🎲 Pot Betting',
                    value: 'You can bet GP on other players\' challenges. Your bet joins the total prize pool. ' +
                           'If your chosen player wins, you get your bet back plus a share of the losing bets proportional to your bet amount.'
                },
                {
                    name: '💸 House Guarantee',
                    value: 'If you\'re the only person to bet on a challenge, the house guarantees you\'ll get a 50% profit if your chosen player wins.'
                },
                {
                    name: '🏆 Rewards',
                    value: 'The player with the most GP at the end of the year receives a special champion title and badge.'
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
            
            // Update user stats
            user.arenaStats = user.arenaStats || {};
            user.arenaStats.challengesAccepted = (user.arenaStats.challengesAccepted || 0) + 1;
            await user.save();
            
            // Notify about the accepted challenge
            await arenaService.notifyChallengeUpdate(challenge);
            
            // Initialize the leaderboard in the feed
            await arenaService.createOrUpdateArenaFeed(challenge);
            
            // Calculate duration in days for display
            const durationDays = Math.floor(challenge.durationHours / 24);
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Challenge Accepted!')
                .setDescription(
                    `You've accepted the challenge from ${challenge.challengerUsername}!\n\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n` +
                    `**Duration:** ${durationDays} days\n` +
                    `**Ends:** ${challenge.endDate.toLocaleString()}\n\n` +
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
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
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
        await interaction.deferUpdate();
        
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
                    'Use `/arena` and select "Place Bet" to bet on these challenges.\n\n' +
                    '**Pot Betting System:** Your bet joins the total prize pool. ' +
                    'If your chosen player wins, you get your bet back plus a share of the losing bets proportional to your bet amount.'
                )
                .setFooter({ text: 'All challenge updates are posted in the Arena channel' });
            
            activeChallengers.forEach((challenge, index) => {
                const timeRemaining = this.formatTimeRemaining(challenge.endDate);
                const totalPool = (challenge.totalPool || 0) + (challenge.wagerAmount * 2);
                const durationDays = Math.floor(challenge.durationHours / 24);
                
                embed.addFields({
                    name: `${index + 1}. ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`,
                    value: `**Game:** ${challenge.gameTitle}\n` +
                           (challenge.description ? `**Description:** ${challenge.description}\n` : '') +
                           `**Wager:** ${challenge.wagerAmount} GP each\n` +
                           `**Total Pool:** ${totalPool} GP\n` +
                           `**Ends:** ${challenge.endDate.toLocaleDateString()} (${timeRemaining})\n` +
                           `**Bets:** ${challenge.bets.length} bets placed`
                });
            });
            
            // Add back button
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            // Send the embed
            await interaction.editReply({ 
                embeds: [embed],
                components: [backButton]
            });
        } catch (error) {
            console.error('Error displaying active challenges:', error);
            return interaction.editReply('An error occurred while fetching active challenges.');
        }
    },
    
    // New method to automatically check and grant monthly GP
    async checkAndGrantMonthlyGP(user) {
        try {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const lastClaim = user.lastMonthlyGpClaim ? new Date(user.lastMonthlyGpClaim) : null;
            
            // Check if user hasn't received GP this month yet
            if (!lastClaim || 
                lastClaim.getMonth() !== currentMonth || 
                lastClaim.getFullYear() !== currentYear) {
                
                // Automatically award the GP
                user.gp = (user.gp || 0) + 1000;
                user.lastMonthlyGpClaim = now;
                await user.save();
                
                return true; // Indicate that GP was awarded
            }
            
            return false; // No GP was awarded
        } catch (error) {
            console.error('Error checking and granting monthly GP:', error);
            return false;
        }
    },
    
    // Handle the GP leaderboard command
    async handleLeaderboard(interaction) {
        try {
            await interaction.deferUpdate();
            
            // Get top users by GP
            const topUsers = await User.find({ gp: { $gt: 0 } })
                .sort({ gp: -1 })
                .limit(20);
            
            if (topUsers.length === 0) {
                return interaction.editReply('No users have any GP yet.');
            }
            
            // Create an embed for the leaderboard
            const embed = new EmbedBuilder()
                .setTitle('💰 GP Leaderboard')
                .setColor('#FFD700')
                .setDescription(
                    'These are the users with the most GP (Gold Points).\n' +
                    'Earn GP by winning Arena challenges and bets. Everyone receives 1,000 GP automatically each month.'
                )
                .setFooter({ text: 'The user with the most GP at the end of the year will receive a special title!' });
            
            let leaderboardText = '';
            
            topUsers.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} **${user.raUsername}**: ${user.gp.toLocaleString()} GP\n`;
                
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
                    value: `**${requestingUser.raUsername}**: ${requestingUser.gp.toLocaleString()} GP (Rank: #${position + 1})`
                });
            }
            
            // Add back button
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            // Send the embed
            await interaction.editReply({ 
                embeds: [embed],
                components: [backButton]
            });
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
