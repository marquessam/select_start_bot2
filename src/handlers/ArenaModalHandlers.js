// src/handlers/ArenaModalHandlers.js
import { EmbedBuilder } from 'discord.js';
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import retroAPI from '../services/retroAPI.js';
import arenaService from '../services/arenaService.js';
import { getLeaderboardEntries } from '../utils/arenaUtils.js';

export default class ArenaModalHandlers {
    // Handle the modal submit for creating a challenge
    static async handleCreateChallengeModal(interaction) {
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
            
            // Verify leaderboard exists
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
                embed.setFooter({ text: 'Other players can use /arena to join this open challenge. Auto-cancels in 72 hours if no one joins.' });
            }
            
            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }
            
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error creating challenge:', error);
            return interaction.editReply('An error occurred while creating the challenge.');
        }
    }

    // Handle modal submissions
    static async handleModalSubmit(interaction) {
        const customId = interaction.customId;
        
        if (customId === 'arena_create_challenge_modal' || customId === 'arena_create_challenge_modal_recovery') {
            await this.handleCreateChallengeModal(interaction);
        }
        else if (customId.startsWith('arena_bet_amount_modal_')) {
            const parts = customId.split('_');
            const challengeId = parts[4];
            const playerName = parts[5];
            
            // Import and call the betting handler
            const ArenaBettingHandlers = (await import('./ArenaBettingHandlers.js')).default;
            await ArenaBettingHandlers.handleBetAmountModal(interaction, challengeId, playerName);
        }
    }
}
