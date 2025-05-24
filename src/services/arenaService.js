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
            
            // Also set up a check for completed challenges
            setInterval(() => {
                this.checkCompletedChallenges().catch(error => {
                    console.error('Error checking completed challenges:', error);
                });
            }, 15 * 60 * 1000); // Every 15 minutes
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
                
                embed.setFooter({ text: 'Congratulations to the winner! All bets have been paid out.' });
                await this.refreshEntireFeed();
            }
            
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            let hoursUntilDelete = 3;
            if (challenge.status === 'completed') {
                hoursUntilDelete = 12;
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
            
            // 3. Update active challenge feeds - sort alphabetically
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: new Date() }
            }).sort({ gameTitle: 1 });
            
            for (const challenge of activeChallengers) {
                await this.createOrUpdateArenaFeed(challenge);
                await new Promise(resolve => setTimeout(resolve, 800));
            }
            
            // 4. Update open challenge feeds
            const openChallenges = await ArenaChallenge.find({
                status: 'open',
                isOpenChallenge: true
            }).sort({ gameTitle: 1 });
            
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

    // ========================
    // COMPLETED CHALLENGE PROCESSING
    // ========================

    async checkCompletedChallenges() {
        try {
            const now = new Date();
            const endedChallenges = await ArenaChallenge.find({
                status: 'active',
                endDate: { $lte: now }
            });
            
            if (endedChallenges.length === 0) return;
            
            for (const challenge of endedChallenges) {
                await this.processCompletedChallenge(challenge);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            await this.refreshEntireFeed();
        } catch (error) {
            console.error('Error checking completed challenges:', error);
        }
    }

    async processCompletedChallenge(challenge) {
        try {
            if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                await ArenaCompletionUtils.processCompletedOpenChallenge(challenge);
            } else {
                await ArenaCompletionUtils.processCompletedDirectChallenge(challenge);
            }
            
            await this.updateCompletedFeed(challenge);
            await this.notifyChallengeUpdate(challenge);
        } catch (error) {
            console.error(`Error processing completed challenge ${challenge._id}:`, error);
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

    // ADD THIS MISSING METHOD:
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
