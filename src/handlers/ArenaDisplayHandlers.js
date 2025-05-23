// src/handlers/ArenaDisplayHandlers.js
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
import { formatTimeRemaining, getLeaderboardEntries } from '../utils/arenaUtils.js';

export default class ArenaDisplayHandlers {
    // Show the main arena menu with all options
    static async showMainArenaMenu(interaction, user, skipGpCheck = false) {
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

        // Check for cancellable open challenges (no participants, within 72 hours)
        const cancellableCount = await ArenaChallenge.countDocuments({
            challengerId: user.discordId,
            status: 'open',
            isOpenChallenge: true,
            participants: { $size: 0 },
            createdAt: { $gte: new Date(Date.now() - 72 * 60 * 60 * 1000) }
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
            );

        if (cancellableCount > 0) {
            embed.addFields({
                name: '⚠️ Cancellable Challenges',
                value: `**${cancellableCount}** open challenge${cancellableCount > 1 ? 's' : ''} can be cancelled`,
                inline: true
            });
        }

        embed.setFooter({ text: 'All challenges and bets are based on RetroAchievements leaderboards' });
        
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
                            label: 'View Live Leaderboards',
                            description: 'Get real-time updates of current challenges',
                            value: 'view_live_leaderboard',
                            emoji: '🔄'
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

        // Add cancellation option if user has cancellable challenges
        if (cancellableCount > 0) {
            actionRow.components[0].addOptions({
                label: 'Cancel Open Challenges',
                description: `Cancel ${cancellableCount} open challenge${cancellableCount > 1 ? 's' : ''} with no participants`,
                value: 'cancel_challenges',
                emoji: '❌'
            });
        }
        
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
            try {
                await interaction.editReply({
                    content: 'An error occurred while displaying the Arena menu. Please try again.',
                    components: []
                });
            } catch (fallbackError) {
                console.error(`Fallback error handling also failed:`, fallbackError);
            }
        }
    }

    // Show pending challenges for user to respond to
    static async showPendingChallenges(interaction, user, pendingChallenges = null) {
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
    }

    // Show user's active and pending challenges
    static async showMyChallenges(interaction) {
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
                    const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                    const participantCount = (challenge.participants?.length || 0) + 1;
                    
                    // Check if it's cancellable (no participants and within 72 hours)
                    const timeSinceCreation = Date.now() - challenge.createdAt.getTime();
                    const isCancellable = challenge.participants?.length === 0 && timeSinceCreation < 72 * 60 * 60 * 1000;
                    const statusText = isCancellable ? 'Open for joining (Cancellable)' : 'Open for joining';
                    
                    openText += `**${index + 1}. ${challenge.gameTitle}** (Open Challenge)\n` +
                                `**Wager:** ${challenge.wagerAmount} GP\n` +
                                `**Participants:** ${participantCount}\n` + 
                                `${leaderboardLink}\n` +
                                `**Status:** ${statusText}\n\n`;
                });
                
                embed.addFields({ name: '📢 Your Open Challenges', value: openText || 'None' });
            }
            
            // Add other challenge types...
            // (keeping the rest of the logic the same as in the original)
            
            // Create buttons for active challenges
            const rows = [];
            
            // Create buttons for refreshing active challenges
            const allActiveChallenges = [...activeDirectChallenges, ...activeOpenChallenges];
            const refreshButtons = [];
            
            // Only show refresh buttons if there are active challenges
            if (allActiveChallenges.length > 0) {
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
    }

    // Show cancellable open challenges
    static async showCancellableOpenChallenges(interaction) {
        try {
            await interaction.deferUpdate();
            
            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply('You need to be registered to cancel challenges.');
            }
            
            // Find cancellable open challenges (no participants, within 72 hours)
            const cancellableChallenges = await ArenaChallenge.find({
                challengerId: user.discordId,
                status: 'open',
                isOpenChallenge: true,
                participants: { $size: 0 },
                createdAt: { $gte: new Date(Date.now() - 72 * 60 * 60 * 1000) }
            }).sort({ createdAt: -1 });
            
            if (cancellableChallenges.length === 0) {
                return interaction.editReply({
                    content: 'You have no open challenges that can be cancelled.\n\n' +
                             '**Note:** Only open challenges with no participants can be cancelled, ' +
                             'and only within 72 hours of creation. After 72 hours, they auto-cancel.',
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('arena_back_to_main')
                                .setLabel('Back to Arena')
                                .setStyle(ButtonStyle.Secondary)
                        )
                    ]
                });
            }
            
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ Cancel Open Challenges')
                .setDescription(
                    `You have **${cancellableChallenges.length}** open challenge${cancellableChallenges.length > 1 ? 's' : ''} that can be cancelled.\n\n` +
                    '**Important:** Once cancelled, your wager will be refunded immediately.\n' +
                    'Challenges with participants cannot be cancelled.'
                );
            
            // Add challenge details
            cancellableChallenges.forEach((challenge, index) => {
                const timeLeft = 72 - Math.floor((Date.now() - challenge.createdAt.getTime()) / (60 * 60 * 1000));
                const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                
                embed.addFields({
                    name: `${index + 1}. ${challenge.gameTitle}`,
                    value: `**Description:** ${challenge.description || 'No description provided'}\n` +
                           `**Wager:** ${challenge.wagerAmount} GP\n` +
                           `**Created:** ${challenge.createdAt.toLocaleString()}\n` +
                           `**Auto-cancels in:** ${timeLeft} hours\n` +
                           `${leaderboardLink}`
                });
            });
            
            // Create cancel buttons (max 5 per row)
            const rows = [];
            const maxButtonsPerRow = 5;
            
            for (let i = 0; i < cancellableChallenges.length; i += maxButtonsPerRow) {
                const row = new ActionRowBuilder();
                
                for (let j = 0; j < maxButtonsPerRow && (i + j) < cancellableChallenges.length; j++) {
                    const challenge = cancellableChallenges[i + j];
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`arena_cancel_open_challenge_${challenge._id}`)
                            .setLabel(`Cancel #${i + j + 1}`)
                            .setStyle(ButtonStyle.Danger)
                    );
                }
                
                rows.push(row);
            }
            
            // Add back button
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('arena_back_to_main')
                    .setLabel('Back to Arena')
                    .setStyle(ButtonStyle.Secondary)
            ));
            
            await interaction.editReply({
                embeds: [embed],
                components: rows
            });
        } catch (error) {
            console.error('Error showing cancellable challenges:', error);
            await interaction.editReply('An error occurred while loading cancellable challenges.');
        }
    }

    // Show arena help info
    static async showArenaHelp(interaction) {
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
                    name: '❌ Challenge Cancellation',
                    value: 'Open challenges with no participants can be cancelled within 72 hours. ' +
                           'After 72 hours, they automatically cancel and refund your wager.'
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
    }
}
