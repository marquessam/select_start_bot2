// src/services/arenaService.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { TemporaryMessage } from '../models/TemporaryMessage.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS, formatTimeRemaining, getDiscordTimestamp, createHeaderEmbed } from '../utils/FeedUtils.js';
import AlertUtils, { ALERT_TYPES } from '../utils/AlertUtils.js';
import ArenaTransactionUtils from '../utils/ArenaTransactionUtils.js';
import ArenaCompletionUtils from '../utils/ArenaCompletionUtils.js';
import ArenaBettingUtils from '../utils/ArenaBettingUtils.js';
import ArenaLeaderboardUtils from '../utils/ArenaLeaderboardUtils.js';
import { 
    getEstimatedWinner,
    checkPositionChanges,
    createChallengeEmbed,
    createArenaOverviewEmbed,
    createCompletedChallengeEmbed
} from '../utils/arenaUtils.js';

// Update interval (every hour)
const UPDATE_INTERVAL = 60 * 60 * 1000;

class ArenaService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arenaChannelId || '1373570850912997476');
        this.arenaFeedChannelId = config.discord.arenaFeedChannelId || '1373570913882214410';
        this.tempMessageCleanupInterval = null;
        this.feedMessageIds = new Map(); // Map of challengeId -> messageId
        this.overviewEmbedId = null;
        this.gpLeaderboardMessageId = null;
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for arena service');
            return;
        }

        try {
            console.log('Starting arena service...');
            AlertUtils.setClient(this.client);
            
            // Clear the arena feed channel first
            await this.clearArenaFeedChannel();
            
            // Start the temporary message cleanup service
            await this.startTempMessageCleanup();
            
            // Run initial updates and set up intervals using the parent class method
            await super.start(UPDATE_INTERVAL);
            
            // Set up a check for completed challenges (every 15 minutes)
            setInterval(() => {
                this.checkCompletedChallenges().catch(error => {
                    console.error('Error checking completed challenges:', error);
                });
            }, 15 * 60 * 1000);
            
            // Set up stuck challenge monitoring (every 30 minutes)
            setInterval(() => {
                this.checkAndFixStuckChallenges().catch(error => {
                    console.error('Error checking stuck challenges:', error);
                });
            }, 30 * 60 * 1000);
            
            console.log('Arena service started with automatic stuck challenge monitoring');
        } catch (error) {
            console.error('Error starting arena service:', error);
        }
    }

    // Override the update method from base class
    async update() {
        await this.updateArenaFeeds();
    }

    // Get the arena feed channel
    async getArenaFeedChannel() {
        if (!this.client) return null;

        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) return null;
            
            return await guild.channels.fetch(this.arenaFeedChannelId);
        } catch (error) {
            console.error('Error getting arena feed channel:', error);
            return null;
        }
    }

    // Clear arena feed channel at startup
    async clearArenaFeedChannel() {
        try {
            const channel = await this.getArenaFeedChannel();
            if (!channel) return false;
            
            console.log(`Clearing arena feed channel for clean rebuild...`);
            
            let messagesDeleted = 0;
            let messages;
            
            do {
                messages = await channel.messages.fetch({ limit: 100 });
                if (messages.size > 0) {
                    try {
                        await channel.bulkDelete(messages);
                        messagesDeleted += messages.size;
                    } catch (bulkError) {
                        // Fall back to individual deletion for older messages
                        for (const [id, message] of messages) {
                            try {
                                await message.delete();
                                messagesDeleted++;
                            } catch (error) {
                                console.error(`Error deleting message ${id}`);
                            }
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }
            } while (messages.size >= 100);
            
            // Reset ALL state after clearing
            this.feedMessageIds.clear();
            this.gpLeaderboardMessageId = null;
            this.overviewEmbedId = null;
            this.headerMessageId = null;
            
            console.log(`Cleared ${messagesDeleted} messages from arena feed channel`);
            return true;
        } catch (error) {
            console.error('Error clearing arena feed channel:', error);
            return false;
        }
    }

    /**
     * Completely refreshes the entire feed by clearing and rebuilding it
     */
    async refreshEntireFeed() {
        try {
            console.log('Refreshing entire Arena feed to maintain proper ordering...');
            
            // Clear the feed channel first
            await this.clearArenaFeedChannel();
            
            // Wait a moment to ensure channel is fully cleared
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Then update all feed components in the correct order
            await this.updateArenaFeeds();
            
            console.log('Arena feed refresh completed successfully with proper ordering');
            return true;
        } catch (error) {
            console.error('Error refreshing arena feed:', error);
            return false;
        }
    }

    // ========================
    // TEMPORARY MESSAGE MANAGEMENT
    // ========================

    /**
     * Send a message that will auto-delete after specified hours
     */
    async sendTemporaryMessage(channel, options, hoursUntilDelete = 3, type = 'notification') {
        try {
            if (!channel) return null;
            
            const sentMessage = await channel.send(options);
            const deleteAt = new Date(Date.now() + hoursUntilDelete * 60 * 60 * 1000);
            
            // Store in database for persistence
            await TemporaryMessage.create({
                messageId: sentMessage.id,
                channelId: channel.id,
                deleteAt,
                type
            });
            
            console.log(`Temporary message ${sentMessage.id} scheduled for deletion at ${deleteAt.toLocaleString()}`);
            
            return sentMessage;
        } catch (error) {
            console.error('Error sending temporary message:', error);
            return null;
        }
    }

    /**
     * Start the temporary message cleanup service
     */
    async startTempMessageCleanup() {
        this.tempMessageCleanupInterval = setInterval(() => {
            this.cleanupExpiredMessages().catch(error => {
                console.error('Error in temporary message cleanup:', error);
            });
        }, 15 * 60 * 1000); // Run every 15 minutes
        
        console.log('Temporary message cleanup service started');
        
        // Run once at startup
        await this.cleanupExpiredMessages();
    }

    /**
     * Clean up any expired temporary messages
     */
    async cleanupExpiredMessages() {
        try {
            const now = new Date();
            const expiredMessages = await TemporaryMessage.find({
                deleteAt: { $lte: now }
            });
            
            if (expiredMessages.length === 0) return;
            
            console.log(`Found ${expiredMessages.length} expired temporary messages to delete`);
            
            for (const msg of expiredMessages) {
                try {
                    const channel = await this.client.channels.fetch(msg.channelId).catch(() => null);
                    if (channel) {
                        const message = await channel.messages.fetch(msg.messageId).catch(() => null);
                        if (message) {
                            await message.delete();
                            console.log(`Deleted temporary message ${msg.messageId}`);
                        }
                    }
                } catch (error) {
                    console.error(`Error deleting message ${msg.messageId}:`, error);
                }
                
                // Delete from database regardless
                await TemporaryMessage.findByIdAndDelete(msg._id);
            }
        } catch (error) {
            console.error('Error in cleanupExpiredMessages:', error);
        }
    }

    // ========================
    // NOTIFICATION METHODS
    // ========================

    async notifyNewChallenge(challenge) {
        try {
            const embed = createHeaderEmbed(
                '🏟️ New Arena Challenge Issued!',
                challenge.isOpenChallenge
                    ? `**${challenge.challengerUsername}** has created an open challenge for anyone to join!`
                    : `**${challenge.challengerUsername}** has challenged **${challenge.challengeeUsername}** to a competition!`,
                {
                    color: challenge.isOpenChallenge ? COLORS.PRIMARY : COLORS.DANGER,
                    timestamp: true
                }
            );
            
            embed.addFields({ name: 'Game', value: challenge.gameTitle, inline: false });
            
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description, inline: false });
            }
            
            const wagerText = challenge.isOpenChallenge ? 
                `${challenge.wagerAmount} GP per player` : 
                `${challenge.wagerAmount} GP each`;
                
            embed.addFields(
                { name: 'Wager', value: wagerText, inline: true },
                { name: 'Duration', value: `${Math.floor(challenge.durationHours / 24)} days`, inline: true }
            );
            
            if (challenge.isOpenChallenge) {
                embed.setFooter({ 
                    text: `Use /arena and select "Browse Open Challenges" to join this challenge. Auto-cancels in 72 hours if no one joins.` 
                });
            } else {
                embed.setFooter({ 
                    text: `${challenge.challengeeUsername} can use /arena to view and respond to this challenge.` 
                });
            }
            
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            const messageOptions = { embeds: [embed] };
            
            await this.sendTemporaryMessage(
                await AlertUtils.getAlertsChannel(ALERT_TYPES.ARENA), 
                messageOptions, 
                4, 
                'newChallenge'
            );
            
            // After sending the notification, refresh the entire feed
            await this.refreshEntireFeed();
        } catch (error) {
            console.error('Error sending new challenge notification:', error);
        }
    }

    async notifyChallengeUpdate(challenge) {
        try {
            let title, description, color;
            const durationDays = Math.floor(challenge.durationHours / 24);
            
            // Set title, description, and color based on challenge status
            if (challenge.isOpenChallenge) {
                switch(challenge.status) {
                    case 'active':
                        title = '🏟️ Open Arena Challenge Started!';
                        description = `The open challenge created by **${challenge.challengerUsername}** has begun!`;
                        color = COLORS.PRIMARY;
                        break;
                    case 'cancelled':
                        title = '🏟️ Open Arena Challenge Cancelled';
                        description = `The open challenge created by **${challenge.challengerUsername}** has been cancelled.`;
                        color = COLORS.NEUTRAL;
                        break;
                    case 'completed':
                        title = '🏟️ Open Arena Challenge Completed!';
                        description = `The open challenge created by **${challenge.challengerUsername}** has ended!`;
                        color = COLORS.INFO;
                        break;
                    default:
                        return;
                }
            } else {
                switch(challenge.status) {
                    case 'active':
                        title = '🏟️ Arena Challenge Accepted!';
                        description = `**${challenge.challengeeUsername}** has accepted the challenge from **${challenge.challengerUsername}**!`;
                        color = COLORS.DANGER;
                        break;
                    case 'declined':
                        title = '🏟️ Arena Challenge Declined';
                        description = `**${challenge.challengeeUsername}** has declined the challenge from **${challenge.challengerUsername}**.`;
                        color = COLORS.DANGER;
                        break;
                    case 'cancelled':
                        title = '🏟️ Arena Challenge Cancelled';
                        description = `The challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}** has been cancelled.`;
                        color = COLORS.NEUTRAL;
                        break;
                    case 'completed':
                        title = '🏟️ Arena Challenge Completed!';
                        description = `The challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}** has ended!`;
                        color = COLORS.INFO;
                        break;
                    default:
                        return;
                }
            }
            
            const embed = createHeaderEmbed(title, description, { color: color, timestamp: true });
            
            embed.addFields({ name: 'Game', value: challenge.gameTitle, inline: false });
                
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description, inline: false });
            }
            
            // Add status-specific fields
            if (challenge.status === 'active') {
                if (challenge.isOpenChallenge) {
                    const participantCount = challenge.participants.length + 1;
                    embed.addFields(
                        { name: 'Participants', value: `${participantCount} players`, inline: true },
                        { name: 'Wager', value: `${challenge.wagerAmount} GP per player`, inline: true },
                        { name: 'Duration', value: `${durationDays} days`, inline: true },
                        { name: 'Ends', value: challenge.endDate.toLocaleString(), inline: true }
                    );
                } else {
                    embed.addFields(
                        { name: 'Wager', value: `${challenge.wagerAmount} GP each`, inline: true },
                        { name: 'Duration', value: `${durationDays} days`, inline: true },
                        { name: 'Ends', value: challenge.endDate.toLocaleString(), inline: true }
                    );
                }
                
                embed.setFooter({ text: 'Watch the leaderboard updates in the arena feed channel! Use /arena to place bets.' });
                
                const alertsChannel = await AlertUtils.getAlertsChannel(ALERT_TYPES.ARENA);
                if (alertsChannel) {
                    const message = await this.sendTemporaryMessage(
                        alertsChannel,
                        { 
                            embeds: [embed], 
                            content: `A new Arena challenge has begun!` 
                        },
                        6,
                        'challengeUpdate'
                    );
                    
                    if (message) {
                        await this.sendTemporaryMessage(
                            alertsChannel,
                            {
                                content: 'To place a bet, use the `/arena` command and select "Place a Bet". Pot Betting System: Your bet joins the total prize pool. If your chosen player wins, you get your bet back plus a share of the losing bets proportional to your bet amount!',
                                reply: { messageReference: message.id }
                            },
                            6,
                            'bettingInfo'
                        );
                    }
                }
                
                await this.refreshEntireFeed();
                return;
            } else if (challenge.status === 'completed') {
                // ENHANCED: Add detailed completion information with betting results
                if (challenge.isOpenChallenge) {
                    const participantCount = challenge.participants.length + 1;
                    const totalPot = challenge.wagerAmount * participantCount;
                    
                    embed.addFields(
                        { name: 'Winner', value: challenge.winnerUsername || 'No Winner', inline: false },
                        { name: 'Participants', value: `${participantCount} players`, inline: true },
                        { name: 'Total Pot', value: `${totalPot} GP`, inline: true }
                    );
                    
                    if (challenge.participants && challenge.participants.length > 0) {
                        let scoresText = `• **${challenge.challengerUsername}** (Creator): ${challenge.challengerScore || 'No score'}\n`;
                        
                        challenge.participants.forEach(participant => {
                            scoresText += `• **${participant.username}**: ${participant.score || 'No score'}\n`;
                        });
                        
                        embed.addFields({ name: 'Final Scores', value: scoresText });
                    }
                } else {
                    embed.addFields(
                        { name: 'Winner', value: challenge.winnerUsername, inline: false },
                        { name: 'Wager', value: `${challenge.wagerAmount} GP each`, inline: true },
                        { name: 'Final Scores', value: 
                            `• ${challenge.challengerUsername}: ${challenge.challengerScore}\n` +
                            `• ${challenge.challengeeUsername}: ${challenge.challengeeScore}`
                        }
                    );
                }

                // ENHANCED: Add detailed betting results to completion notification
                if (challenge.bets && challenge.bets.length > 0) {
                    const totalBets = challenge.bets.length;
                    const totalBetAmount = challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0);
                    
                    if (challenge.winnerUsername && challenge.winnerUsername !== 'Tie' && challenge.winnerUsername !== 'No Winner') {
                        const winningBets = challenge.bets.filter(bet => bet.targetPlayer === challenge.winnerUsername);
                        const losingBets = challenge.bets.filter(bet => bet.targetPlayer !== challenge.winnerUsername);
                        
                        let bettingResultsText = `**Total Bets:** ${totalBets} (${totalBetAmount} GP)\n`;
                        bettingResultsText += `**Winning Bets:** ${winningBets.length} bets\n`;
                        bettingResultsText += `**Losing Bets:** ${losingBets.length} bets\n`;
                        
                        // Show top winners if any
                        if (winningBets.length > 0) {
                            bettingResultsText += '\n**Top Bet Winners:**\n';
                            const sortedWinners = [...winningBets]
                                .sort((a, b) => (b.payout || 0) - (a.payout || 0))
                                .slice(0, 3);
                            
                            sortedWinners.forEach((bet, index) => {
                                const profit = (bet.payout || 0) - bet.betAmount;
                                bettingResultsText += `${index + 1}. ${bet.raUsername}: +${profit} GP\n`;
                            });
                        }
                        
                        // Show house contribution if any
                        if (challenge.houseContribution && challenge.houseContribution > 0) {
                            bettingResultsText += `\n**House Bonus:** ${challenge.houseContribution} GP (50% guarantee for sole bettors)`;
                        }
                        
                        embed.addFields({
                            name: '💰 Betting Results',
                            value: bettingResultsText
                        });
                    } else {
                        // Tie or no winner - all bets refunded
                        embed.addFields({
                            name: '💰 Betting Results',
                            value: `All ${totalBets} bets (${totalBetAmount} GP) were refunded due to no clear winner.`
                        });
                    }
                }
                
                embed.setFooter({ text: 'Congratulations to the winner! All payouts have been processed.' });
                await this.refreshEntireFeed();
            }
            
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            let hoursUntilDelete = 3;
            if (challenge.status === 'completed') {
                hoursUntilDelete = 12; // Keep completion notifications longer
            } else if (challenge.status === 'declined' || challenge.status === 'cancelled') {
                hoursUntilDelete = 2;
            }
            
            const alertsChannel = await AlertUtils.getAlertsChannel(ALERT_TYPES.ARENA);
            if (alertsChannel) {
                await this.sendTemporaryMessage(
                    alertsChannel, 
                    { embeds: [embed] }, 
                    hoursUntilDelete, 
                    'challengeUpdate'
                );
            }
        } catch (error) {
            console.error('Error sending challenge update notification:', error);
        }
    }

    async notifyParticipantJoined(challenge, participantUsername) {
        try {
            const embed = createHeaderEmbed(
                '🏟️ New Participant Joined Challenge!',
                `**${participantUsername}** has joined the open challenge for **${challenge.gameTitle}**!`,
                {
                    color: COLORS.PRIMARY,
                    timestamp: true
                }
            );
            
            embed.addFields(
                { name: 'Challenge Creator', value: challenge.challengerUsername, inline: true },
                { name: 'Wager', value: `${challenge.wagerAmount} GP`, inline: true },
                { name: 'Total Participants', value: `${challenge.participants.length + 1}`, inline: true },
                { name: 'Description', value: challenge.description || 'No description provided' }
            );
            
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            const alertsChannel = await AlertUtils.getAlertsChannel(ALERT_TYPES.ARENA);
            if (alertsChannel) {
                await this.sendTemporaryMessage(
                    alertsChannel,
                    { embeds: [embed] },
                    3,
                    'participantJoined'
                );
            }
            
            await this.refreshEntireFeed();
        } catch (error) {
            console.error('Error sending participant joined notification:', error);
        }
    }

    async notifyStandingsChange(challenge, changedPosition) {
        try {
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
            
            // Get current scores to display in alert
            const [challengerScore, challengeeScore] = await ArenaCompletionUtils.getChallengersScores(challenge);
            
            // Create standings based on ApiRank (lower is better)
            const standings = [];
            
            if (challengerScore.exists && challengeeScore.exists) {
                // Sort by rank
                const participants = [
                    {
                        username: challenge.challengerUsername,
                        rank: challengerScore.rank < challengeeScore.rank ? 1 : 2,
                        score: challengerScore.formattedScore,
                        globalRank: challengerScore.rank
                    },
                    {
                        username: challenge.challengeeUsername,
                        rank: challengeeScore.rank < challengerScore.rank ? 1 : 2,
                        score: challengeeScore.formattedScore,
                        globalRank: challengeeScore.rank
                    }
                ].sort((a, b) => a.rank - b.rank);
                
                standings.push(...participants);
            }
            
            // Use AlertUtils with proper ARENA type for color coding
            await AlertUtils.sendPositionChangeAlert({
                title: '🏟️ Arena Standings Update!',
                description: `There's been a change in the leaderboard for the active challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}**!`,
                changes: [
                    {
                        username: changedPosition.newLeader,
                        newRank: 1
                    }
                ],
                currentStandings: standings,
                thumbnail: challenge.iconUrl ? `https://retroachievements.org${challenge.iconUrl}` : null,
                footer: { text: `Follow the challenge in the arena feed channel!` }
            }, ALERT_TYPES.ARENA);
            
        } catch (error) {
            console.error('Error sending standings change notification:', error);
        }
    }

    async notifyAutoTimeout(challenge, creator) {
        try {
            const embed = createHeaderEmbed(
                '⏰ Open Challenge Auto-Cancelled',
                `An open challenge created by **${creator.raUsername}** has been automatically cancelled due to no participants joining within 72 hours.`,
                {
                    color: COLORS.NEUTRAL,
                    timestamp: true
                }
            );
            
            embed.addFields(
                { name: 'Game', value: challenge.gameTitle, inline: false },
                { name: 'Wager Refunded', value: `${challenge.wagerAmount} GP`, inline: true },
                { name: 'Duration Open', value: '72 hours', inline: true }
            );
            
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description, inline: false });
            }
            
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            embed.setFooter({ 
                text: 'Open challenges automatically cancel after 72 hours if no one joins. Create a new challenge anytime!' 
            });
            
            const messageOptions = { embeds: [embed] };
            
            await this.sendTemporaryMessage(
                await AlertUtils.getAlertsChannel(ALERT_TYPES.ARENA), 
                messageOptions, 
                4, 
                'autoTimeout'
            );
            
            console.log(`Sent auto-timeout notification for challenge ${challenge._id}`);
            
        } catch (error) {
            console.error('Error sending auto-timeout notification:', error);
        }
    }

    // ========================
    // ENHANCED COMPLETION PROCESSING WITH ROBUST ERROR HANDLING
    // ========================

    async checkCompletedChallenges() {
        try {
            const now = new Date();
            
            // FIXED: Properly check for ALL types of ended challenges
            const endedChallenges = await ArenaChallenge.find({
                $or: [
                    {
                        // Regular active challenges that have ended
                        status: 'active',
                        endDate: { $lte: now }
                    },
                    {
                        // CRITICAL FIX: Open challenges with participants that have ended
                        status: 'open',
                        isOpenChallenge: true,
                        $and: [
                            { participants: { $exists: true, $not: { $size: 0 } } }, // Has participants
                            { endDate: { $lte: now } }, // Time has expired
                            { startDate: { $exists: true } } // Actually started
                        ]
                    }
                ]
            });
            
            if (endedChallenges.length === 0) {
                // Also check for stuck challenges and try to unstick them
                await this.checkAndFixStuckChallenges();
                return;
            }
            
            console.log(`Found ${endedChallenges.length} ended challenges to process for completion`);
            
            for (const challenge of endedChallenges) {
                console.log(`Processing challenge ${challenge._id}: ${challenge.gameTitle} (${challenge.status})`);
                await this.processCompletedChallenge(challenge);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Also check for stuck challenges
            await this.checkAndFixStuckChallenges();
            
            // Refresh the feed to remove completed challenges
            await this.refreshEntireFeed();
        } catch (error) {
            console.error('Error checking completed challenges:', error);
        }
    }

    /**
     * Check for and attempt to fix stuck challenges automatically
     * Runs periodically to catch issues before they become problems
     */
    async checkAndFixStuckChallenges() {
        try {
            console.log('🔍 Checking for stuck challenges...');
            
            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            
            // Find challenges that might be stuck
            const potentiallyStuck = await ArenaChallenge.find({
                $or: [
                    {
                        // Open challenges that ended more than 1 hour ago but still show as "open"
                        status: 'open',
                        isOpenChallenge: true,
                        participants: { $exists: true, $not: { $size: 0 } },
                        endDate: { $lte: new Date(now.getTime() - 60 * 60 * 1000) } // Ended over 1 hour ago
                    },
                    {
                        // Completed challenges from last 24 hours that might not have paid out
                        status: 'completed',
                        completedAt: { $gte: oneDayAgo },
                        winnerId: { $exists: true, $ne: null },
                        winnerUsername: { $nin: ['Tie', 'No Winner', 'Error - Manual Review Required'] }
                    }
                ]
            });
            
            if (potentiallyStuck.length === 0) {
                console.log('✅ No stuck challenges found');
                return;
            }
            
            console.log(`⚠️ Found ${potentiallyStuck.length} potentially stuck challenges`);
            
            let fixed = 0;
            let errors = 0;
            
            for (const challenge of potentiallyStuck) {
                try {
                    if (challenge.status === 'open' && challenge.isOpenChallenge) {
                        console.log(`🔧 Attempting to fix stuck open challenge: ${challenge.gameTitle}`);
                        await this.fixStuckOpenChallenge(challenge);
                        fixed++;
                    } else if (challenge.status === 'completed') {
                        console.log(`💰 Checking payout status for: ${challenge.gameTitle}`);
                        const payoutFixed = await this.verifyAndFixPayouts(challenge);
                        if (payoutFixed) fixed++;
                    }
                } catch (error) {
                    console.error(`Error fixing stuck challenge ${challenge._id}:`, error);
                    errors++;
                }
                
                // Small delay to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            if (fixed > 0) {
                console.log(`✅ Auto-fixed ${fixed} stuck challenges`);
                // Refresh feed after fixes
                await this.refreshEntireFeed();
            }
            
            if (errors > 0) {
                console.log(`❌ ${errors} challenges could not be auto-fixed (may need manual intervention)`);
            }
            
        } catch (error) {
            console.error('Error in stuck challenge check:', error);
        }
    }

    /**
     * Fix a specific stuck open challenge
     * @param {Object} challenge - The stuck challenge to fix
     */
    async fixStuckOpenChallenge(challenge) {
        try {
            console.log(`=== FIXING STUCK OPEN CHALLENGE ===`);
            console.log(`Challenge: ${challenge.gameTitle}`);
            console.log(`Current status: ${challenge.status}`);
            console.log(`Participants: ${challenge.participants?.length || 0}`);
            console.log(`End date: ${challenge.endDate}`);
            
            if (!challenge.isOpenChallenge || !challenge.participants || challenge.participants.length === 0) {
                console.log(`❌ Challenge doesn't qualify for open challenge fix`);
                return false;
            }
            
            // Force process as completed open challenge
            await ArenaCompletionUtils.processCompletedOpenChallenge(challenge);
            
            console.log(`✅ Stuck open challenge fixed: ${challenge.gameTitle}`);
            return true;
            
        } catch (error) {
            console.error(`Error fixing stuck open challenge:`, error);
            return false;
        }
    }

    /**
     * Verify and fix missing payouts for completed challenges
     * @param {Object} challenge - The completed challenge to verify
     */
    async verifyAndFixPayouts(challenge) {
        try {
            if (!challenge.winnerId || challenge.winnerUsername === 'Tie') {
                return false; // No payouts needed for ties
            }
            
            // Check if winner was actually paid
            const winner = await User.findOne({ discordId: challenge.winnerId });
            if (!winner) {
                console.log(`⚠️ Winner user not found: ${challenge.winnerId}`);
                return false;
            }
            
            // Check recent transactions for this challenge
            const recentTransactions = winner.gpTransactions?.filter(t => 
                t.timestamp >= challenge.completedAt &&
                t.context && t.context.includes(challenge._id.toString())
            ) || [];
            
            let payoutFixed = false;
            
            if (recentTransactions.length === 0) {
                console.log(`💰 Missing winner payout detected for ${challenge.winnerUsername}`);
                
                // Calculate expected payout
                let payoutAmount = 0;
                if (challenge.isOpenChallenge) {
                    payoutAmount = challenge.wagerAmount * (1 + (challenge.participants?.length || 0));
                } else {
                    payoutAmount = challenge.wagerAmount * 2;
                }
                
                // Process missing payout
                await ArenaTransactionUtils.trackGpTransaction(
                    winner,
                    payoutAmount,
                    'Auto-recovery payout',
                    `Challenge ID: ${challenge._id}, Auto-detected missing payout`
                );
                
                console.log(`✅ Auto-recovery payout completed: ${payoutAmount} GP to ${challenge.winnerUsername}`);
                payoutFixed = true;
            }
            
            // Check betting payouts
            if (challenge.bets && challenge.bets.length > 0) {
                const unpaidBets = challenge.bets.filter(bet => !bet.paid);
                if (unpaidBets.length > 0) {
                    console.log(`🎰 Auto-fixing ${unpaidBets.length} unpaid bets`);
                    
                    await ArenaBettingUtils.processBetsForChallenge(
                        challenge,
                        challenge.winnerId,
                        challenge.winnerUsername
                    );
                    
                    payoutFixed = true;
                }
            }
            
            return payoutFixed;
            
        } catch (error) {
            console.error(`Error verifying payouts for challenge ${challenge._id}:`, error);
            return false;
        }
    }

    async processCompletedChallenge(challenge) {
        console.log(`=== PROCESSING COMPLETED CHALLENGE ${challenge._id} ===`);
        console.log(`Challenge: ${challenge.gameTitle}`);
        console.log(`Type: ${challenge.isOpenChallenge ? 'Open Challenge' : 'Direct Challenge'}`);
        console.log(`Status: ${challenge.status}`);
        console.log(`End Date: ${challenge.endDate}`);
        
        try {
            // Step 1: Process the challenge completion
            let updatedChallenge;
            if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                console.log(`Processing as open challenge with ${challenge.participants.length} participants`);
                updatedChallenge = await ArenaCompletionUtils.processCompletedOpenChallenge(challenge);
            } else {
                console.log(`Processing as direct challenge`);
                updatedChallenge = await ArenaCompletionUtils.processCompletedDirectChallenge(challenge);
            }
            
            console.log(`✅ Challenge completion processing finished`);
            console.log(`Winner: ${updatedChallenge.winnerUsername}`);
            console.log(`Status: ${updatedChallenge.status}`);
            
            // Step 2: FORCE update the feed immediately
            try {
                console.log(`🔄 Updating completed challenge feed...`);
                await this.updateCompletedFeed(updatedChallenge);
                console.log(`✅ Feed updated successfully`);
            } catch (feedError) {
                console.error(`❌ Error updating feed (non-critical):`, feedError);
            }
            
            // Step 3: FORCE send notification alert
            try {
                console.log(`📢 Sending completion notification...`);
                await this.notifyChallengeUpdate(updatedChallenge);
                console.log(`✅ Notification sent successfully`);
            } catch (alertError) {
                console.error(`❌ Error sending notification (non-critical):`, alertError);
            }
            
            // Step 4: Manual betting payout verification (backup)
            if (updatedChallenge.bets && updatedChallenge.bets.length > 0) {
                console.log(`🎰 Verifying betting payouts for ${updatedChallenge.bets.length} bets...`);
                
                try {
                    // Check if bets were already processed
                    const unpaidBets = updatedChallenge.bets.filter(bet => !bet.paid);
                    if (unpaidBets.length > 0) {
                        console.log(`⚠️ Found ${unpaidBets.length} unpaid bets - processing manually...`);
                        await ArenaBettingUtils.processBetsForChallenge(
                            updatedChallenge, 
                            updatedChallenge.winnerId, 
                            updatedChallenge.winnerUsername
                        );
                        console.log(`✅ Manual betting payout completed`);
                    } else {
                        console.log(`✅ All bets already processed`);
                    }
                } catch (bettingError) {
                    console.error(`❌ Error in manual betting processing:`, bettingError);
                    
                    // EMERGENCY: Refund all bets if payout fails
                    try {
                        console.log(`🚨 EMERGENCY: Refunding all bets due to payout failure...`);
                        await ArenaBettingUtils.refundAllBets(updatedChallenge);
                        console.log(`✅ Emergency refunds completed`);
                    } catch (refundError) {
                        console.error(`💥 CRITICAL: Emergency refund also failed:`, refundError);
                    }
                }
            }
            
            console.log(`=== CHALLENGE ${challenge._id} PROCESSING COMPLETE ===\n`);
            
        } catch (error) {
            console.error(`💥 CRITICAL ERROR processing completed challenge ${challenge._id}:`, error);
            
            // EMERGENCY CLEANUP: Try to at least mark as completed to prevent re-processing
            try {
                challenge.status = 'completed';
                challenge.winnerUsername = 'Error - Manual Review Required';
                challenge.completedAt = new Date();
                await challenge.save();
                console.log(`🚨 Emergency status update completed for challenge ${challenge._id}`);
            } catch (saveError) {
                console.error(`💥 DOUBLE CRITICAL: Could not even save emergency status:`, saveError);
            }
            
            throw error;
        }
    }

    // ========================
    // MANUAL RECOVERY SYSTEM
    // ========================

    /**
     * MANUAL PAYOUT FUNCTION - Call this to manually pay out stuck challenges
     */
    async manualPayoutStuckChallenges() {
        console.log(`🔧 MANUAL PAYOUT: Checking for challenges that completed but didn't pay out...`);
        
        try {
            // Find recently completed challenges that might not have paid out properly
            const recentlyCompleted = await ArenaChallenge.find({
                status: 'completed',
                completedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
                $or: [
                    { winnerId: { $exists: true, $ne: null } }, // Has a winner
                    { winnerUsername: { $exists: true, $ne: 'No Winner' } }
                ]
            });
            
            console.log(`Found ${recentlyCompleted.length} recently completed challenges to verify`);
            
            for (const challenge of recentlyCompleted) {
                console.log(`\n--- Checking challenge ${challenge._id} ---`);
                console.log(`Winner: ${challenge.winnerUsername}`);
                console.log(`Bets: ${challenge.bets?.length || 0}`);
                
                // Check if this challenge should have had payouts
                let shouldHavePaidOut = false;
                let payoutAmount = 0;
                
                if (challenge.winnerId && challenge.winnerUsername !== 'Tie') {
                    if (challenge.isOpenChallenge) {
                        payoutAmount = challenge.wagerAmount * (1 + (challenge.participants?.length || 0));
                        shouldHavePaidOut = true;
                    } else {
                        payoutAmount = challenge.wagerAmount * 2;
                        shouldHavePaidOut = true;
                    }
                }
                
                if (shouldHavePaidOut) {
                    console.log(`Challenge should have paid out ${payoutAmount} GP to ${challenge.winnerUsername}`);
                    
                    // Check if winner actually received the payout
                    const winner = await User.findOne({ discordId: challenge.winnerId });
                    if (winner) {
                        // Check recent transactions
                        const recentTransactions = winner.gpTransactions?.filter(t => 
                            t.timestamp >= challenge.completedAt &&
                            t.context && t.context.includes(challenge._id.toString())
                        ) || [];
                        
                        if (recentTransactions.length === 0) {
                            console.log(`⚠️ NO PAYOUT FOUND! Manually paying out now...`);
                            
                            // Manual payout
                            await ArenaTransactionUtils.trackGpTransaction(
                                winner,
                                payoutAmount,
                                'Manual payout - completion system error',
                                `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}, Manual payout`
                            );
                            
                            console.log(`✅ Manual payout of ${payoutAmount} GP completed for ${challenge.winnerUsername}`);
                        } else {
                            console.log(`✅ Payout already processed`);
                        }
                    }
                }
                
                // Check betting payouts
                if (challenge.bets && challenge.bets.length > 0) {
                    const unpaidBets = challenge.bets.filter(bet => !bet.paid);
                    if (unpaidBets.length > 0) {
                        console.log(`⚠️ Found ${unpaidBets.length} unpaid bets - processing now...`);
                        
                        await ArenaBettingUtils.processBetsForChallenge(
                            challenge,
                            challenge.winnerId,
                            challenge.winnerUsername
                        );
                        
                        console.log(`✅ Betting payouts completed`);
                    } else {
                        console.log(`✅ All bets already paid`);
                    }
                }
                
                // Send notification if it wasn't sent
                try {
                    console.log(`📢 Sending completion notification...`);
                    await this.notifyChallengeUpdate(challenge);
                    console.log(`✅ Notification sent`);
                } catch (error) {
                    console.error(`❌ Could not send notification:`, error);
                }
            }
            
            console.log(`\n🔧 MANUAL PAYOUT COMPLETE\n`);
            
        } catch (error) {
            console.error(`💥 Error in manual payout process:`, error);
        }
    }

    /**
     * MANUAL FIX for stuck open challenges
     * @param {string} challengeId - ID of the stuck challenge
     */
    async manualFixStuckOpenChallenge(challengeId) {
        console.log(`🔧 MANUAL FIX: Processing stuck open challenge ${challengeId}`);
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge) {
                console.log(`Challenge not found`);
                return false;
            }
            
            console.log(`Found challenge: ${challenge.gameTitle}`);
            console.log(`Current status: ${challenge.status}`);
            console.log(`Participants: ${challenge.participants?.length || 0}`);
            console.log(`End date: ${challenge.endDate}`);
            
            // Force process as completed open challenge
            if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                console.log(`Force processing as completed open challenge...`);
                
                await ArenaCompletionUtils.processCompletedOpenChallenge(challenge);
                
                console.log(`✅ Manual fix completed`);
                console.log(`New status: ${challenge.status}`);
                console.log(`Winner: ${challenge.winnerUsername}`);
                
                // Send completion notification
                await this.notifyChallengeUpdate(challenge);
                
                // Refresh feed
                await this.refreshEntireFeed();
                
                return true;
            } else {
                console.log(`❌ Challenge doesn't qualify for open challenge completion`);
                return false;
            }
            
        } catch (error) {
            console.error(`Manual fix failed:`, error);
            return false;
        }
    }

    /**
     * EMERGENCY FUNCTION - Call this to refund all bets for a specific challenge
     */
    async emergencyRefundChallengeBets(challengeId) {
        console.log(`🚨 EMERGENCY REFUND for challenge ${challengeId}`);
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge) {
                console.error(`Challenge ${challengeId} not found`);
                return;
            }
            
            if (challenge.bets && challenge.bets.length > 0) {
                console.log(`Refunding ${challenge.bets.length} bets...`);
                await ArenaBettingUtils.refundAllBets(challenge);
                console.log(`✅ Emergency refund completed`);
            } else {
                console.log(`No bets to refund`);
            }
            
        } catch (error) {
            console.error(`💥 Emergency refund failed:`, error);
        }
    }

    /**
     * DEBUG FUNCTION - Check the status of a specific challenge
     */
    async debugChallengeStatus(challengeId) {
        console.log(`🔍 DEBUGGING CHALLENGE ${challengeId}`);
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge) {
                console.log(`Challenge not found`);
                return;
            }
            
            console.log(`Status: ${challenge.status}`);
            console.log(`Winner: ${challenge.winnerUsername}`);
            console.log(`Winner ID: ${challenge.winnerId}`);
            console.log(`Completed At: ${challenge.completedAt}`);
            console.log(`Bets: ${challenge.bets?.length || 0}`);
            
            if (challenge.bets) {
                challenge.bets.forEach((bet, index) => {
                    console.log(`  Bet ${index + 1}: ${bet.raUsername} bet ${bet.betAmount} GP on ${bet.targetPlayer} - Paid: ${bet.paid}`);
                });
            }
            
            if (challenge.winnerId) {
                const winner = await User.findOne({ discordId: challenge.winnerId });
                if (winner) {
                    console.log(`Winner GP: ${winner.gp}`);
                    console.log(`Recent transactions:`);
                    const recent = winner.gpTransactions?.slice(-5) || [];
                    recent.forEach(t => {
                        console.log(`  ${t.timestamp}: ${t.amount} GP - ${t.reason}`);
                    });
                }
            }
            
        } catch (error) {
            console.error(`Debug failed:`, error);
        }
    }

    async checkAndProcessTimeouts() {
        try {
            const ArenaTimeoutUtils = (await import('../utils/ArenaTimeoutUtils.js')).default;
            const result = await ArenaTimeoutUtils.checkAndProcessTimeouts();
            
            if (result.processed > 0) {
                console.log(`Arena: Auto-cancelled ${result.processed} open challenges due to timeout.`);
                await this.refreshEntireFeed();
            }
            
            return result;
        } catch (error) {
            console.error('Error in arena timeout processing:', error);
            return { processed: 0, errors: 1 };
        }
    }

    // ========================
    // ARENA FEED UPDATES
    // ========================

    async updateArenaFeeds() {
        try {
            console.log('Updating arena feeds in correct order...');
            
            // 1. Update header (appears at TOP)
            await this.updateArenaHeader();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 2. Update overview embed
            await this.updateArenaOverview();
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 3. Update ACTIVE challenges (including open challenges that started)
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: new Date() }
            }).sort({ gameTitle: 1 });
            
            console.log(`Found ${activeChallengers.length} active challenges`);
            
            for (const challenge of activeChallengers) {
                if (challenge.isOpenChallenge) {
                    await this.createOrUpdateOpenChallengeFeed(challenge);
                } else {
                    await this.createOrUpdateArenaFeed(challenge);
                }
                await new Promise(resolve => setTimeout(resolve, 800));
            }
            
            // 4. Update OPEN challenges (waiting for participants)
            const openChallenges = await ArenaChallenge.find({
                status: 'open',
                isOpenChallenge: true,
                participants: { $size: 0 } // Only show challenges with no participants yet
            }).sort({ gameTitle: 1 });
            
            console.log(`Found ${openChallenges.length} open challenges waiting for participants`);
            
            for (const challenge of openChallenges) {
                await this.createOrUpdateOpenChallengeFeed(challenge);
                await new Promise(resolve => setTimeout(resolve, 800));
            }
            
            // 5. Update GP leaderboard (appears at BOTTOM)
            await this.updateGpLeaderboard();
            
            console.log('Arena feed update completed in correct order');
        } catch (error) {
            console.error('Error updating arena feeds:', error);
        }
    }

    async createOrUpdateArenaFeed(challenge) {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            // Get live scores
            const scores = await ArenaLeaderboardUtils.getLiveScores(challenge);
            if (!scores) return;
            
            // Store the previous scores before updating
            const previousChallengerScore = challenge.challengerScore;
            const previousChallengeeScore = challenge.challengeeScore;
            
            // Save the scores
            challenge.challengerScore = scores.challenger.formattedScore;
            challenge.challengeeScore = scores.challengee ? scores.challengee.formattedScore : 'No score yet';
            
            await challenge.save();
            
            // Check for position changes and notify if needed
            const positionChange = checkPositionChanges(
                challenge, scores.challenger, scores.challengee, 
                previousChallengerScore, previousChallengeeScore
            );
            
            if (positionChange) {
                await this.notifyStandingsChange(challenge, positionChange);
            }
            
            // Create embed for the challenge
            const embed = createChallengeEmbed(
                challenge, scores.challenger, scores.challengee, 
                new Map(), this.client.options.EmbedBuilder || this.client.EmbedBuilder
            );
            
            // Add betting information to footer
            const startTime = challenge.startDate || challenge.createdAt;
            const bettingEndsAt = new Date(startTime.getTime() + (72 * 60 * 60 * 1000));
            const now = new Date();
            
            if (now < bettingEndsAt) {
                const hoursLeft = Math.max(0, Math.floor((bettingEndsAt - now) / (60 * 60 * 1000)));
                embed.setFooter({ text: `Betting closes in ${hoursLeft} hours` });
            } else {
                embed.setFooter({ text: 'Betting is now closed for this challenge' });
            }
            
            const challengeId = challenge._id.toString();
            const messageId = await this.updateArenaChallengeMessage(
                feedChannel, 
                challengeId, 
                { embeds: [embed] }
            );
            
            if (messageId && messageId !== challenge.messageId) {
                challenge.messageId = messageId;
                await challenge.save();
            }
        } catch (error) {
            console.error('Error creating/updating arena feed:', error);
        }
    }

    async createOrUpdateOpenChallengeFeed(challenge) {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            // Get live scores for open challenge
            const scores = await ArenaLeaderboardUtils.getLiveScores(challenge);
            if (!scores) return;
            
            // Update participant scores
            if (challenge.participants && challenge.participants.length > 0) {
                for (const participant of challenge.participants) {
                    const scoreInfo = scores.participants.get(participant.username.toLowerCase());
                    if (scoreInfo) {
                        participant.score = scoreInfo.formattedScore;
                    }
                }
            }
            
            await challenge.save();
            
            // Create embed for the challenge
            const embed = createChallengeEmbed(
                challenge, scores.challenger, null,
                scores.participants, this.client.options.EmbedBuilder || this.client.EmbedBuilder
            );
            
            // Add betting information to footer
            const startTime = challenge.startDate || challenge.createdAt;
            const bettingEndsAt = new Date(startTime.getTime() + (72 * 60 * 60 * 1000));
            const now = new Date();
            
            if (now < bettingEndsAt) {
                const hoursLeft = Math.max(0, Math.floor((bettingEndsAt - now) / (60 * 60 * 1000)));
                embed.setFooter({ text: `Betting closes in ${hoursLeft} hours` });
            } else {
                embed.setFooter({ text: 'Betting is now closed for this challenge' });
            }
            
            if (challenge.status === 'open') {
                if (!challenge.participants || challenge.participants.length === 0) {
                    const timeSinceCreation = Date.now() - challenge.createdAt.getTime();
                    const hoursLeft = Math.max(0, 72 - Math.floor(timeSinceCreation / (60 * 60 * 1000)));
                    
                    embed.addFields({
                        name: 'How to Join', 
                        value: `Use \`/arena\` and select "Browse Open Challenges" to join this challenge.\n**Auto-cancels in ${hoursLeft} hours if no one joins.**`
                    });
                } else {
                    embed.addFields({
                        name: 'How to Join', 
                        value: `Use \`/arena\` and select "Browse Open Challenges" to join this challenge.`
                    });
                }
            }
            
            const challengeId = challenge._id.toString();
            const messageId = await this.updateArenaChallengeMessage(
                feedChannel, 
                challengeId, 
                { embeds: [embed] }
            );
            
            if (messageId && messageId !== challenge.messageId) {
                challenge.messageId = messageId;
                await challenge.save();
            }
        } catch (error) {
            console.error('Error creating/updating open challenge feed:', error);
        }
    }

    async updateArenaChallengeMessage(channel, challengeId, content) {
        try {
            if (this.feedMessageIds.has(challengeId)) {
                try {
                    const messageId = this.feedMessageIds.get(challengeId);
                    const message = await channel.messages.fetch(messageId);
                    await message.edit(content);
                    return messageId;
                } catch (error) {
                    if (error.message.includes('Unknown Message')) {
                        this.feedMessageIds.delete(challengeId);
                    } else {
                        throw error;
                    }
                }
            }
            
            const message = await channel.send(content);
            this.feedMessageIds.set(challengeId, message.id);
            return message.id;
        } catch (error) {
            console.error(`Error updating arena challenge message ${challengeId}:`, error);
            return null;
        }
    }

    async updateArenaHeader() {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            const activeCount = await ArenaChallenge.countDocuments({
                status: 'active',
                endDate: { $gt: new Date() }
            });
            
            const openCount = await ArenaChallenge.countDocuments({
                status: 'open',
                isOpenChallenge: true
            });
            
            const timestamp = getDiscordTimestamp(new Date());
            
            let headerContent = 
                `# 🏟️ The Arena - Active Challenges\n` +
                `Currently there ${activeCount === 1 ? 'is' : 'are'} **${activeCount}** active challenge${activeCount === 1 ? '' : 's'} in the Arena.\n`;
                
            if (openCount > 0) {
                headerContent += `There ${openCount === 1 ? 'is' : 'are'} also **${openCount}** open challenge${openCount === 1 ? '' : 's'} awaiting participants.\n`;
            }
                
            headerContent += `**Last Updated:** ${timestamp} | **Updates:** Every hour\n` +
                `Use \`/arena\` to challenge others, place bets, or view your challenges`;
            
            if (this.headerMessageId) {
                try {
                    const headerMessage = await feedChannel.messages.fetch(this.headerMessageId);
                    await headerMessage.edit({ content: headerContent });
                } catch (error) {
                    if (error.message.includes('Unknown Message')) {
                        const message = await feedChannel.send({ content: headerContent });
                        this.headerMessageId = message.id;
                        
                        try {
                            const pinnedMessages = await feedChannel.messages.fetchPinned();
                            if (pinnedMessages.size >= 50) {
                                const oldestPinned = pinnedMessages.last();
                                await oldestPinned.unpin();
                            }
                            await message.pin();
                        } catch (pinError) {
                            console.error('Error pinning header message:', pinError);
                        }
                    }
                }
            } else {
                const message = await feedChannel.send({ content: headerContent });
                this.headerMessageId = message.id;
                
                try {
                    const pinnedMessages = await feedChannel.messages.fetchPinned();
                    if (pinnedMessages.size >= 50) {
                        const oldestPinned = pinnedMessages.last();
                        await oldestPinned.unpin();
                    }
                    await message.pin();
                } catch (pinError) {
                    console.error('Error pinning header message:', pinError);
                }
            }
        } catch (error) {
            console.error('Error updating arena header:', error);
        }
    }

    async updateArenaOverview() {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            const now = new Date();
            
            const activeCount = await ArenaChallenge.countDocuments({
                status: 'active',
                endDate: { $gt: now }
            });
            
            const openCount = await ArenaChallenge.countDocuments({
                status: 'open',
                isOpenChallenge: true
            });
            
            // Calculate total prize pool and bet counts
            let totalPrizePool = 0;
            let totalBets = 0;
            
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: now }
            });
            
            for (const challenge of activeChallengers) {
                if (challenge.isOpenChallenge) {
                    const participantCount = challenge.participants?.length + 1 || 1;
                    totalPrizePool += challenge.wagerAmount * participantCount;
                } else {
                    totalPrizePool += challenge.wagerAmount * 2;
                }
                
                if (challenge.bets && challenge.bets.length > 0) {
                    totalBets += challenge.bets.length;
                    totalPrizePool += challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0);
                }
            }
            
            const stats = {
                activeCount,
                openCount,
                totalPrizePool,
                totalBets
            };
            
            const embed = createArenaOverviewEmbed(stats);
            
            if (this.overviewEmbedId) {
                try {
                    const overviewMessage = await feedChannel.messages.fetch(this.overviewEmbedId);
                    await overviewMessage.edit({ embeds: [embed] });
                } catch (error) {
                    if (error.message.includes('Unknown Message')) {
                        const message = await feedChannel.send({ embeds: [embed] });
                        this.overviewEmbedId = message.id;
                    } else {
                        throw error;
                    }
                }
            } else {
                const message = await feedChannel.send({ embeds: [embed] });
                this.overviewEmbedId = message.id;
            }
        } catch (error) {
            console.error('Error updating arena overview:', error);
        }
    }

    async updateGpLeaderboard() {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            const topUsers = await User.find({ gp: { $gt: 0 } })
                .sort({ gp: -1 })
                .limit(5);
            
            if (topUsers.length === 0) return;
            
            const formattedDate = new Date().toLocaleString();
            
            const embed = new EmbedBuilder()
                .setTitle('💰 GP Leaderboard')
                .setColor(COLORS.WARNING)
                .setDescription(
                    'These are the users with the most GP (Gold Points).\n' +
                    'Earn GP by winning Arena challenges and bets.\n\n' +
                    `**Last Updated:** ${formattedDate}`
                )
                .setFooter({ 
                    text: 'Updates hourly | Everyone receives 1,000 GP automatically each month!' 
                });
            
            let leaderboardText = '';
            
            topUsers.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} **${user.raUsername}**: ${user.gp.toLocaleString()} GP\n`;
            });
            
            embed.addFields({ name: 'Top 5 Rankings', value: leaderboardText });
            
            if (this.gpLeaderboardMessageId) {
                try {
                    const gpMessage = await feedChannel.messages.fetch(this.gpLeaderboardMessageId);
                    await gpMessage.edit({ embeds: [embed] });
                } catch (error) {
                    if (error.message.includes('Unknown Message')) {
                        const message = await feedChannel.send({ embeds: [embed] });
                        this.gpLeaderboardMessageId = message.id;
                    }
                }
            } else {
                const message = await feedChannel.send({ embeds: [embed] });
                this.gpLeaderboardMessageId = message.id;
            }
        } catch (error) {
            console.error('Error updating GP leaderboard:', error);
        }
    }

    async updateCompletedFeed(challenge) {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel || !challenge.messageId) return;
            
            try {
                const message = await feedChannel.messages.fetch(challenge.messageId);
                const durationDays = Math.floor(challenge.durationHours / 24);
                const embed = createCompletedChallengeEmbed(challenge, durationDays);
                await message.edit({ embeds: [embed], components: [] });
            } catch (error) {
                if (error.message.includes('Unknown Message')) {
                    challenge.messageId = null;
                    await challenge.save();
                }
            }
        } catch (error) {
            console.error(`Error updating completed feed for challenge ${challenge._id}:`, error);
        }
    }

    // ========================
    // UTILITY METHODS - Delegating to utility classes
    // ========================

    async trackGpTransaction(user, amount, reason, context = '') {
        return ArenaTransactionUtils.trackGpTransaction(user, amount, reason, context);
    }

    async checkAndGrantMonthlyGP(user) {
        return ArenaTransactionUtils.checkAndGrantMonthlyGP(user);
    }

    async checkExistingChallenge(user1, user2) {
        return ArenaCompletionUtils.checkExistingChallenge(user1, user2);
    }

    async getChallengersScores(challenge) {
        return ArenaCompletionUtils.getChallengersScores(challenge);
    }

    async refreshDirectChallengeLeaderboard(interaction, challenge) {
        return ArenaLeaderboardUtils.refreshDirectChallengeLeaderboard(interaction, challenge);
    }

    async refreshOpenChallengeLeaderboard(interaction, challenge) {
        return ArenaLeaderboardUtils.refreshOpenChallengeLeaderboard(interaction, challenge);
    }

    async showGpLeaderboard(interaction) {
        try {
            await interaction.deferUpdate();
            
            const topUsers = await User.find({ gp: { $gt: 0 } })
                .sort({ gp: -1 })
                .limit(10);
            
            if (topUsers.length === 0) {
                return interaction.editReply('No GP leaderboard data is available yet.');
            }
            
            const embed = new EmbedBuilder()
                .setTitle('💰 GP Leaderboard')
                .setColor(COLORS.WARNING)
                .setDescription(
                    'These are the users with the most GP (Gold Points).\n' +
                    'Earn GP by winning Arena challenges and bets!'
                );
            
            let leaderboardText = '';
            
            topUsers.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} **${user.raUsername}**: ${user.gp.toLocaleString()} GP\n`;
            });
            
            embed.addFields({ name: 'Top 10 Rankings', value: leaderboardText });
            
            embed.addFields({
                name: 'How to Earn GP',
                value: 
                    '• **Monthly Reward:** 1,000 GP automatically each month\n' +
                    '• **Win Challenges:** Doubles your wagered GP\n' +
                    '• **Place Bets:** Bet on challenges to win more GP\n' +
                    '• **Create Open Challenges:** Invite others to compete'
            });
            
            embed.setFooter({
                text: 'The #1 player at the end of the year receives a special champion title!'
            });
            
            const backRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            return interaction.editReply({
                embeds: [embed],
                components: [backRow]
            });
        } catch (error) {
            console.error('Error showing GP leaderboard:', error);
            return interaction.editReply('An error occurred while loading the GP leaderboard.');
        }
    }
}

// Create singleton instance
const arenaService = new ArenaService();
export default arenaService;
