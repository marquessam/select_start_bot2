// src/handlers/ArenaButtonHandlers.js
import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import arenaService from '../services/arenaService.js';
import ArenaDisplayHandlers from './ArenaDisplayHandlers.js';

export default class ArenaButtonHandlers {
    // Handle accepting a challenge
    static async handleAcceptChallenge(interaction, challengeId) {
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
            
            // Create response embed
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
    }
    
    // Handle declining a challenge
    static async handleDeclineChallenge(interaction, challengeId) {
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
    }

    // Handle joining an open challenge
    static async handleJoinChallenge(interaction) {
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
            
            // Keep the challenge status as "open"
            if (!challenge.startDate) {
                challenge.startDate = new Date();
            }
            
            if (!challenge.endDate) {
                challenge.endDate = new Date(challenge.startDate.getTime() + (challenge.durationHours * 60 * 60 * 1000));
            }
            
            // Only change to active if we've hit a max participant limit
            if (challenge.maxParticipants && challenge.participants.length >= challenge.maxParticipants) {
                challenge.status = 'active';
            }
            
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
    }

    // Handle cancelling an open challenge
    static async handleCancelOpenChallenge(interaction, challengeId) {
        try {
            await interaction.deferUpdate();
            
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to cancel challenges.');
            }
            
            // Get the challenge
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge || challenge.status !== 'open' || !challenge.isOpenChallenge) {
                return interaction.editReply('This challenge cannot be cancelled.');
            }
            
            // Verify user is the creator
            if (challenge.challengerId !== user.discordId) {
                return interaction.editReply('You can only cancel challenges you created.');
            }
            
            // Check if challenge has participants
            if (challenge.participants && challenge.participants.length > 0) {
                return interaction.editReply('Cannot cancel a challenge that has participants.');
            }
            
            // Check if challenge is still within cancellation window (72 hours)
            const timeSinceCreation = Date.now() - challenge.createdAt.getTime();
            if (timeSinceCreation > 72 * 60 * 60 * 1000) {
                return interaction.editReply('This challenge is too old to cancel manually. It should auto-cancel soon.');
            }
            
            // Cancel the challenge
            challenge.status = 'cancelled';
            await challenge.save();
            
            // Refund the creator's wager
            await arenaService.trackGpTransaction(
                user,
                challenge.wagerAmount,
                'Open challenge cancelled - wager refunded',
                `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
            );
            
            // Notify about the cancellation
            await arenaService.notifyChallengeUpdate(challenge);
            
            // Show success message
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Challenge Cancelled')
                .setDescription(
                    `Your open challenge for **${challenge.gameTitle}** has been cancelled.\n\n` +
                    `**Wager Refunded:** ${challenge.wagerAmount} GP\n` +
                    `**Your new GP balance:** ${user.gp} GP\n\n` +
                    `The cancellation has been announced in the Arena channel.`
                );
            
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
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
        } catch (error) {
            console.error('Error cancelling open challenge:', error);
            await interaction.editReply('An error occurred while cancelling the challenge.');
        }
    }

    // Handle refreshing leaderboard data
    static async handleRefreshLeaderboard(interaction, challengeId) {
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
    }

    // Handle showing modal for creating challenges
    static async handleShowChallengeModal(interaction) {
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
                .setRequired(false)
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
                
            // Input for description
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

    // Handle showing bet modal from button
    static async handleShowBetModal(interaction, challengeId, playerName) {
        try {
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

    // Route button interactions to appropriate handlers
    static async handleButtonInteraction(interaction) {
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
            await ArenaDisplayHandlers.showMainArenaMenu(interaction, user, true);
        }
        else if (customId === 'arena_help') {
            await interaction.deferUpdate();
            await ArenaDisplayHandlers.showArenaHelp(interaction);
        }
        else if (customId.startsWith('arena_join_challenge_')) {
            await this.handleJoinChallenge(interaction);
        }
        else if (customId.startsWith('arena_cancel_open_challenge_')) {
            const challengeId = customId.replace('arena_cancel_open_challenge_', '');
            await this.handleCancelOpenChallenge(interaction, challengeId);
        }
        else if (customId.startsWith('arena_refresh_leaderboard_')) {
            const challengeId = customId.replace('arena_refresh_leaderboard_', '');
            await this.handleRefreshLeaderboard(interaction, challengeId);
        }
        else if (customId === 'arena_show_challenge_modal') {
            await this.handleShowChallengeModal(interaction);
        }
        else if (customId.startsWith('arena_show_bet_modal_')) {
            const parts = customId.split('_');
            const challengeId = parts[4];
            const playerName = parts[5];
            await this.handleShowBetModal(interaction, challengeId, playerName);
        }
        else if (customId === 'arena_my_challenges') {
            await ArenaDisplayHandlers.showMyChallenges(interaction);
        }
        else if (customId === 'arena_open_challenges') {
            await interaction.deferUpdate();
            // Import and call the open challenges handler
            const ArenaSelectHandlers = (await import('./ArenaSelectHandlers.js')).default;
            await ArenaSelectHandlers.showOpenChallenges(interaction);
        }
    }
}
