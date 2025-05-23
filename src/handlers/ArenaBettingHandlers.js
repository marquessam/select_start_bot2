// src/handlers/ArenaBettingHandlers.js
import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import arenaService from '../services/arenaService.js';
import { formatTimeRemaining } from '../utils/arenaUtils.js';

export default class ArenaBettingHandlers {
    // Handle the selection of an active challenge for betting
    static async handleBetChallengeSelect(interaction) {
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
    }

    // Handle player selection for bet
    static async handleBetPlayerSelect(interaction) {
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
            
            // Additional validation for open challenges
            if (challenge.isOpenChallenge) {
                // Verify that the selected player is either the creator or a participant
                const isCreator = playerName === challenge.challengerUsername;
                const isParticipant = challenge.participants?.some(p => 
                    p.username.toLowerCase() === playerName.toLowerCase()
                );
                
                if (!isCreator && !isParticipant) {
                    await interaction.deferUpdate();
                    return interaction.editReply(`Invalid player selection. ${playerName} is not a participant in this challenge.`);
                }
            }

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
            
            // Show the modal
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
    }

    // Handle bet amount modal submission
    static async handleBetAmountModal(interaction, challengeId, playerName) {
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
    }
}
