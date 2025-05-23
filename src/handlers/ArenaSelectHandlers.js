// src/handlers/ArenaSelectHandlers.js
import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import arenaService from '../services/arenaService.js';
import ArenaDisplayHandlers from './ArenaDisplayHandlers.js';
import { formatTimeRemaining } from '../utils/arenaUtils.js';

export default class ArenaSelectHandlers {
    // Handle main action selections
    static async handleMainActionSelect(interaction) {
        const selectedValue = interaction.values[0];
        
        if (selectedValue === 'create_challenge') {
            await this.showCreateChallengeModal(interaction);
        }
        else if (selectedValue === 'place_bet') {
            await this.showActiveChallengesForBetting(interaction);
        }
        else if (selectedValue === 'my_challenges') {
            await ArenaDisplayHandlers.showMyChallenges(interaction);
        }
        else if (selectedValue === 'active_challenges') {
            await this.showActiveChallengesForBetting(interaction);
        }
        else if (selectedValue === 'view_live_leaderboard') {
            await this.showLiveLeaderboards(interaction);
        }
        else if (selectedValue === 'leaderboard') {
            await arenaService.showGpLeaderboard(interaction);
        }
        else if (selectedValue === 'open_challenges') {
            await this.showOpenChallenges(interaction);
        }
        else if (selectedValue === 'cancel_challenges') {
            await ArenaDisplayHandlers.showCancellableOpenChallenges(interaction);
        }
    }

    // Show a modal for creating a challenge
    static async showCreateChallengeModal(interaction) {
        try {
            // Verify user is registered
            const challenger = await User.findOne({ discordId: interaction.user.id });
            if (!challenger) {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
                return interaction.editReply('You need to be registered to issue challenges. Please contact an admin.');
            }
            
            // Create a fallback button since we can't show modal from select menu
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arena_show_challenge_modal')
                        .setLabel('Create Challenge')
                        .setStyle(ButtonStyle.Primary)
                );
            
            await interaction.update({
                content: 'Click the button below to create a challenge:',
                components: [buttonRow],
                embeds: []
            });
        } catch (error) {
            console.error('Error showing challenge creation modal:', error);
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
    }

    // Show active challenges for betting
    static async showActiveChallengesForBetting(interaction) {
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
                        return false;
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
                
            bettableChallenges.forEach((challenge) => {
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
                
                // Calculate total pot
                let wagerPool;
                if (challenge.isOpenChallenge) {
                    const participantCount = (challenge.participants?.length || 0) + 1;
                    wagerPool = challenge.wagerAmount * participantCount;
                } else {
                    wagerPool = challenge.wagerAmount * 2;
                }
                
                const totalPool = (challenge.totalPool || 0) + wagerPool;
                
                // Create description for challenge type
                let challengeDescription;
                if (challenge.isOpenChallenge) {
                    const participantCount = (challenge.participants?.length || 0) + 1;
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
                    name: `${title}`,
                    value: challengeDescription +
                           `**Wager Pool:** ${wagerPool} GP\n` +
                           `**Total Betting Pool:** ${totalPool} GP\n` +
                           `**Challenge Ends:** ${timeRemaining}\n` +
                           `**Betting Ends:** ${bettingEnds}\n` +
                           `**Leaderboard:** ${leaderboardLink}`
                });
                
                if (existingBet) {
                    embed.addFields({
                        name: `Your Bet`,
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
    }

    // Show open challenges for joining
    static async showOpenChallenges(interaction) {
        try {
            // Find open challenges
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
                const participantCount = challenge.participants?.length || 0;
                const participantLimit = challenge.maxParticipants ? 
                    `${participantCount + 1}/${challenge.maxParticipants}` : 
                    `${participantCount + 1} (unlimited)`;
                
                // Add leaderboard link
                const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                
                // Check if user has already joined this challenge
                const alreadyJoined = challenge.participants?.some(p => p.userId === user.discordId);
                const isCreator = challenge.challengerId === user.discordId;
                
                // Check auto-cancellation timer
                const timeSinceCreation = Date.now() - challenge.createdAt.getTime();
                const hoursLeft = Math.max(0, 72 - Math.floor(timeSinceCreation / (60 * 60 * 1000)));
                
                let statusText = '';
                if (isCreator) {
                    statusText = '**Status:** You created this challenge\n';
                } else if (alreadyJoined) {
                    statusText = '**Status:** You have already joined this challenge\n';
                } else if (participantCount === 0) {
                    statusText = `**Status:** No participants yet • Auto-cancels in ${hoursLeft}h\n`;
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
            const maxButtons = Math.min(openChallenges.length, 25);
            
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
    }

    // Show live leaderboards to view real-time updates
    static async showLiveLeaderboards(interaction) {
        await interaction.deferUpdate();
        
        try {
            // Find active challenges
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: new Date() }
            }).sort({ gameTitle: 1 });
            
            if (activeChallengers.length === 0) {
                return interaction.editReply('There are no active challenges to view.');
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#FF5722')
                .setTitle('Live Arena Leaderboards')
                .setDescription('Select a challenge to view real-time leaderboard data:');
            
            // Create selection menu for challenges
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('arena_live_leaderboard_select')
                .setPlaceholder('Select a challenge to view');
                
            // Add each challenge as an option
            activeChallengers.forEach(challenge => {
                if (challenge.isOpenChallenge) {
                    selectMenu.addOptions({
                        label: `${challenge.gameTitle} (Open Challenge)`,
                        description: `Creator: ${challenge.challengerUsername}`,
                        value: challenge._id.toString()
                    });
                } else {
                    selectMenu.addOptions({
                        label: `${challenge.challengerUsername} vs ${challenge.challengeeUsername}`,
                        description: challenge.gameTitle,
                        value: challenge._id.toString()
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
            console.error('Error showing live leaderboards:', error);
            return interaction.editReply('An error occurred while loading the leaderboards.');
        }
    }

    // Handle the selection of a pending challenge
    static async handlePendingChallengeSelect(interaction) {
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
            
            // Create an embed with challenge details
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
    }

    // Handle live leaderboard selection
    static async handleLiveLeaderboardSelect(interaction) {
        try {
            await interaction.deferUpdate();
            
            const selectedChallengeId = interaction.values[0];
            
            // Get the challenge
            const challenge = await ArenaChallenge.findById(selectedChallengeId);
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
            console.error('Error showing live leaderboard:', error);
            return interaction.editReply('An error occurred while loading the leaderboard data.');
        }
    }

    // Route select menu interactions to appropriate handlers
    static async handleSelectMenuInteraction(interaction) {
        const customId = interaction.customId;
        
        if (customId === 'arena_main_action') {
            await this.handleMainActionSelect(interaction);
        }
        else if (customId === 'arena_pending_challenge_select') {
            await this.handlePendingChallengeSelect(interaction);
        }
        else if (customId === 'arena_bet_challenge_select') {
            // Import and call the bet challenge select handler
            const ArenaBettingHandlers = (await import('./ArenaBettingHandlers.js')).default;
            await ArenaBettingHandlers.handleBetChallengeSelect(interaction);
        }
        else if (customId === 'arena_bet_player_select') {
            // Import and call the bet player select handler
            const ArenaBettingHandlers = (await import('./ArenaBettingHandlers.js')).default;
            await ArenaBettingHandlers.handleBetPlayerSelect(interaction);
        }
        else if (customId === 'arena_live_leaderboard_select') {
            await this.handleLiveLeaderboardSelect(interaction);
        }
    }
}
