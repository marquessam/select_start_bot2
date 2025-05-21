// src/services/arenaService.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { TemporaryMessage } from '../models/TemporaryMessage.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS, formatTimeRemaining, getDiscordTimestamp, createHeaderEmbed } from '../utils/FeedUtils.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertUtils from '../utils/AlertUtils.js';
import { 
    getEstimatedWinner,
    checkPositionChanges,
    findUserInLeaderboard,
    createChallengeEmbed,
    createArenaOverviewEmbed,
    createCompletedChallengeEmbed,
    calculateBettingOdds,
    processLeaderboardEntries,
    isTimeBasedLeaderboard
} from '../utils/arenaUtils.js';

// Update interval (every hour)
const UPDATE_INTERVAL = 60 * 60 * 1000;

/**
 * Refresh leaderboard for a direct challenge (1v1)
 */
async function refreshDirectChallengeLeaderboard(interaction, challenge) {
    try {
        // Get current leaderboard data from RetroAchievements API
        const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
        const isTimeBased = isTimeBasedLeaderboard(challenge);
        const leaderboardEntries = processLeaderboardEntries(rawEntries, isTimeBased);
        
        // Find challenger and challengee entries using our helper function
        const challengerEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengerUsername);
        const challengeeEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengeeUsername);
        
        // Format scores for display
        const challengerScore = {
            value: challengerEntry ? challengerEntry.Value : 0,
            formattedScore: challengerEntry ? challengerEntry.FormattedScore : 'No score yet',
            exists: !!challengerEntry,
            rank: challengerEntry ? challengerEntry.ApiRank : 0
        };
        
        const challengeeScore = {
            value: challengeeEntry ? challengeeEntry.Value : 0,
            formattedScore: challengeeEntry ? challengeeEntry.FormattedScore : 'No score yet',
            exists: !!challengeeEntry,
            rank: challengeeEntry ? challengeeEntry.ApiRank : 0
        };
        
        // Determine who's leading
        const leader = getEstimatedWinner(challenge, challengerScore, challengeeScore);
        
        // Get leaderboard URL
        const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
        
        // Create embed for display
        const embed = new EmbedBuilder()
            .setColor('#FF5722')
            .setTitle(`Live Leaderboard: ${challenge.gameTitle}`)
            .setDescription(
                `**Challenge:** ${challenge.challengerUsername} vs ${challenge.challengeeUsername}\n` +
                `**Description:** ${challenge.description || 'No description provided'}\n` +
                `**Time Remaining:** ${formatTimeRemaining(challenge.endDate)}\n` +
                `**Leaderboard:** [View on RetroAchievements](${leaderboardUrl})\n\n` +
                `${leader ? `**Current Leader:** ${leader === 'Tie' ? 'Tied!' : leader}` : ''}`
            );
            
        // Add challenger info
        const challengerRankText = challengerScore.rank ? ` (Rank: #${challengerScore.rank})` : '';
        embed.addFields({
            name: `${challenge.challengerUsername}${leader === challenge.challengerUsername ? ' 👑' : ''}`,
            value: challengerScore.exists ? 
                `**Score:** ${challengerScore.formattedScore}${challengerRankText}` : 
                'No score recorded yet'
        });
        
        // Add challengee info
        const challengeeRankText = challengeeScore.rank ? ` (Rank: #${challengeeScore.rank})` : '';
        embed.addFields({
            name: `${challenge.challengeeUsername}${leader === challenge.challengeeUsername ? ' 👑' : ''}`,
            value: challengeeScore.exists ? 
                `**Score:** ${challengeeScore.formattedScore}${challengeeRankText}` : 
                'No score recorded yet'
        });
        
        // Add wager and bet info
        const totalWagered = challenge.wagerAmount * 2;
        const totalBets = challenge.bets ? challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0) : 0;
        const totalPool = totalWagered + totalBets;
        
        embed.addFields({
            name: '💰 Prize Pool',
            value: `**Total Prize Pool:** ${totalPool} GP\n` +
                  `**Wager Amount:** ${challenge.wagerAmount} GP each\n` +
                  `**Betting Pool:** ${totalBets} GP`
        });
        
        // Add thumbnail if available
        if (challenge.iconUrl) {
            embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
        }
        
        // Buttons row with refresh and back buttons
        const buttonsRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`arena_refresh_leaderboard_${challenge._id}`)
                    .setLabel('Refresh Data')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄'),
                new ButtonBuilder()
                    .setCustomId('arena_back_to_main')
                    .setLabel('Back to Arena')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.editReply({
            embeds: [embed],
            components: [buttonsRow]
        });
    } catch (error) {
        console.error('Error refreshing direct challenge leaderboard:', error);
        await interaction.editReply('An error occurred while refreshing the leaderboard data.');
    }
}

/**
 * Refresh leaderboard for an open challenge (multiple participants)
 */
async function refreshOpenChallengeLeaderboard(interaction, challenge) {
    try {
        // Get current leaderboard data from RetroAchievements API
        const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
        const isTimeBased = isTimeBasedLeaderboard(challenge);
        const leaderboardEntries = processLeaderboardEntries(rawEntries, isTimeBased);
        
        // Get leaderboard URL
        const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
        
        // Create embed for display
        const embed = new EmbedBuilder()
            .setColor('#3498DB')  // Blue for open challenges
            .setTitle(`Live Leaderboard: ${challenge.gameTitle} (Open Challenge)`)
            .setDescription(
                `**Creator:** ${challenge.challengerUsername}\n` +
                `**Description:** ${challenge.description || 'No description provided'}\n` +
                `**Time Remaining:** ${formatTimeRemaining(challenge.endDate)}\n` +
                `**Leaderboard:** [View on RetroAchievements](${leaderboardUrl})\n`
            );
            
        // Get all participants including creator
        const participants = [];
        
        // Add creator
        const creatorEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengerUsername);
        participants.push({
            username: challenge.challengerUsername,
            isCreator: true,
            score: creatorEntry ? creatorEntry.FormattedScore : 'No score yet',
            exists: !!creatorEntry,
            rank: creatorEntry ? creatorEntry.ApiRank : 999999,
            value: creatorEntry ? creatorEntry.Value : 0
        });
        
        // Add all participants
        if (challenge.participants && challenge.participants.length > 0) {
            for (const participant of challenge.participants) {
                const entry = findUserInLeaderboard(leaderboardEntries, participant.username);
                participants.push({
                    username: participant.username,
                    isCreator: false,
                    score: entry ? entry.FormattedScore : 'No score yet',
                    exists: !!entry,
                    rank: entry ? entry.ApiRank : 999999,
                    value: entry ? entry.Value : 0
                });
            }
        }
        
        // Sort participants by rank (lower is better)
        participants.sort((a, b) => {
            // Sort by whether they have scores first
            if (a.exists && !b.exists) return -1;
            if (!a.exists && b.exists) return 1;
            
            // If both have scores, sort by rank
            if (a.exists && b.exists) {
                if (a.rank !== b.rank) return a.rank - b.rank;
                
                // If ranks are the same (or not available), compare scores
                if (isTimeBased) {
                    // For time-based, lower is better
                    return a.value - b.value;
                } else {
                    // For score-based, higher is better
                    return b.value - a.value;
                }
            }
            
            return 0;
        });
        
        // Build standings text
        let standingsText = '';
        participants.forEach((participant, index) => {
            const medal = index === 0 ? '👑 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : '';
            const creatorTag = participant.isCreator ? ' (Creator)' : '';
            const rankText = participant.rank < 999999 ? ` (Rank: #${participant.rank})` : '';
            
            standingsText += `${medal}**${participant.username}${creatorTag}**: ${participant.score}${rankText}\n`;
        });
        
        embed.addFields({
            name: '📊 Current Standings',
            value: standingsText || 'No participants have scores yet.'
        });
        
        // Add wager and prize info
        const participantCount = challenge.participants?.length + 1 || 1; // +1 for creator
        const totalWagered = challenge.wagerAmount * participantCount;
        const totalBets = challenge.bets ? challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0) : 0;
        const totalPool = totalWagered + totalBets;
        
        embed.addFields({
            name: '💰 Prize Pool',
            value: `**Total Prize Pool:** ${totalPool} GP\n` +
                  `**Wager Amount:** ${challenge.wagerAmount} GP per player\n` +
                  `**Total Participants:** ${participantCount}\n` +
                  `**Betting Pool:** ${totalBets} GP`
        });
        
        // Add thumbnail if available
        if (challenge.iconUrl) {
            embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
        }
        
        // Buttons row with refresh and back buttons
        const buttonsRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`arena_refresh_leaderboard_${challenge._id}`)
                    .setLabel('Refresh Data')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄'),
                new ButtonBuilder()
                    .setCustomId('arena_back_to_main')
                    .setLabel('Back to Arena')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.editReply({
            embeds: [embed],
            components: [buttonsRow]
        });
    } catch (error) {
        console.error('Error refreshing open challenge leaderboard:', error);
        await interaction.editReply('An error occurred while refreshing the leaderboard data.');
    }
}

class ArenaService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arenaChannelId || '1373570850912997476');
        this.arenaFeedChannelId = config.discord.arenaFeedChannelId || '1373570913882214410';
        this.tempMessageCleanupInterval = null;
        this.feedMessageIds = new Map(); // Map of challengeId -> messageId
        this.overviewEmbedId = null;
        this.gpLeaderboardMessageId = null;
        
        // Set the alerts channel for notifications
        AlertUtils.setAlertsChannel(this.channelId);
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for arena service');
            return;
        }

        try {
            console.log('Starting arena service...');
            
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
            
            console.log(`Clearing arena feed channel...`);
            
            // Use the same approach as in FeedManagerBase.clearChannel()
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
            
            // Reset state after clearing
            this.feedMessageIds.clear();
            this.gpLeaderboardMessageId = null;
            this.overviewEmbedId = null;
            
            return true;
        } catch (error) {
            console.error('Error clearing arena feed channel:', error);
            return false;
        }
    }

    /**
     * Completely refreshes the entire feed by clearing and rebuilding it
     * This ensures all challenges are displayed in alphabetical order
     * and the GP leaderboard remains at the end
     */
    async refreshEntireFeed() {
        try {
            console.log('Refreshing entire Arena feed to maintain alphabetical ordering...');
            // Clear the feed channel first
            await this.clearArenaFeedChannel();
            
            // Then update all feed components in the correct order
            await this.updateArenaFeeds();
            
            console.log('Arena feed refresh completed successfully');
            return true;
        } catch (error) {
            console.error('Error refreshing arena feed:', error);
            return false;
        }
    }

    // Temporary message management
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
                
                // Delete from database regardless of whether the message was found
                await TemporaryMessage.findByIdAndDelete(msg._id);
            }
        } catch (error) {
            console.error('Error in cleanupExpiredMessages:', error);
        }
    }

    // Notification methods
    async notifyNewChallenge(challenge) {
        try {
            const channel = await this.getChannel();
            if (!channel) return;
            
            // Use our createHeaderEmbed utility
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
            
            // Add fields
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
            
            // Set footer based on challenge type
            if (challenge.isOpenChallenge) {
                embed.setFooter({ 
                    text: `Use /arena and select "Browse Open Challenges" to join this challenge.` 
                });
            } else {
                embed.setFooter({ 
                    text: `${challenge.challengeeUsername} can use /arena to view and respond to this challenge.` 
                });
            }
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Send as a temporary message that will auto-delete after 4 hours
            await this.sendTemporaryMessage(channel, { embeds: [embed] }, 4, 'newChallenge');
            
            // After sending the notification, refresh the entire feed to maintain alphabetical order
            await this.refreshEntireFeed();
        } catch (error) {
            console.error('Error sending new challenge notification:', error);
        }
    }

    async notifyChallengeUpdate(challenge) {
        try {
            const channel = await this.getChannel();
            if (!channel) return;
            
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
                        return; // Don't notify for other statuses
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
                        return; // Don't notify for other statuses
                }
            }
            
            // Use our createHeaderEmbed utility
            const embed = createHeaderEmbed(
                title,
                description,
                {
                    color: color,
                    timestamp: true
                }
            );
            
            embed.addFields({ name: 'Game', value: challenge.gameTitle, inline: false });
                
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description, inline: false });
            }
            
            // Add status-specific fields
            if (challenge.status === 'active') {
                if (challenge.isOpenChallenge) {
                    const participantCount = challenge.participants.length + 1; // +1 for creator
                    
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
                
                // Add betting button for active challenges
                const buttonsRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('not_used_here')
                            .setLabel('Place a Bet')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('💰')
                    );
                
                // Determine how long to keep the message based on status
                let hoursUntilDelete = 6; // Keep active notifications longer
                
                // Send with button and follow-up instructions using temp message
                const message = await this.sendTemporaryMessage(
                    channel,
                    { embeds: [embed], components: [buttonsRow], content: `A new Arena challenge has begun!` },
                    hoursUntilDelete,
                    'challengeUpdate'
                );
                
                if (message) {
                    // Follow-up message with same timer
                    await this.sendTemporaryMessage(
                        channel,
                        {
                            content: 'To place a bet, use the `/arena` command and select "Place a Bet". Pot Betting System: Your bet joins the total prize pool. If your chosen player wins, you get your bet back plus a share of the losing bets proportional to your bet amount!',
                            reply: { messageReference: message.id }
                        },
                        hoursUntilDelete,
                        'bettingInfo'
                    );
                }
                
                // After activating a challenge, refresh the entire feed to maintain alphabetical order
                await this.refreshEntireFeed();
                
                return;
            } else if (challenge.status === 'completed') {
                if (challenge.isOpenChallenge) {
                    const participantCount = challenge.participants.length + 1; // +1 for creator
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
                
                // After completing a challenge, refresh the entire feed to maintain alphabetical order
                await this.refreshEntireFeed();
            }
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Send notification with appropriate duration based on status
            let hoursUntilDelete = 3; // Default
            if (challenge.status === 'completed') {
                hoursUntilDelete = 12; // Keep completed challenges longer
            } else if (challenge.status === 'declined' || challenge.status === 'cancelled') {
                hoursUntilDelete = 2; // Remove declined/cancelled faster
            }
            
            // Send as a temporary message
            await this.sendTemporaryMessage(channel, { embeds: [embed] }, hoursUntilDelete, 'challengeUpdate');
        } catch (error) {
            console.error('Error sending challenge update notification:', error);
        }
    }
    
    async notifyParticipantJoined(challenge, participantUsername) {
        try {
            const channel = await this.getChannel();
            if (!channel) return;
            
            // Use our createHeaderEmbed utility
            const embed = createHeaderEmbed(
                '🏟️ New Participant Joined Challenge!',
                `**${participantUsername}** has joined the open challenge for **${challenge.gameTitle}**!`,
                {
                    color: COLORS.PRIMARY, // Blue for open challenges
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
            
            // Send as a temporary message that will auto-delete after 3 hours
            await this.sendTemporaryMessage(channel, { embeds: [embed] }, 3, 'participantJoined');
            
            // After a participant joins, refresh the entire feed to maintain alphabetical order
            await this.refreshEntireFeed();
        } catch (error) {
            console.error('Error sending participant joined notification:', error);
        }
    }
    
    async notifyStandingsChange(challenge, changedPosition) {
        try {
            const channel = await this.getChannel();
            if (!channel) return;
            
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
            
            // Use our createHeaderEmbed utility
            const embed = createHeaderEmbed(
                '🏟️ Arena Standings Update!',
                `There's been a change in the leaderboard for the active challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}**!`,
                {
                    color: challenge.isOpenChallenge ? COLORS.PRIMARY : COLORS.DANGER,
                    timestamp: true,
                    footer: { text: `Follow the challenge in the arena feed channel!` }
                }
            );
            
            embed.addFields(
                { name: 'Game', value: `[${challenge.gameTitle}](${leaderboardUrl})`, inline: false }
            );
            
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description, inline: false });
            }
            
            embed.addFields({
                name: 'Position Change', 
                value: `**${changedPosition.newLeader}** has overtaken **${changedPosition.previousLeader}**!`
            });
            
            embed.addFields({
                name: 'Current Scores',
                value: `• **${challenge.challengerUsername}**: ${challenge.challengerScore}\n` +
                       `• **${challenge.challengeeUsername}**: ${challenge.challengeeScore}`
            });
            
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Send as a temporary message that will auto-delete after 6 hours
            await this.sendTemporaryMessage(channel, { embeds: [embed] }, 6, 'standingsChange');
        } catch (error) {
            console.error('Error sending standings change notification:', error);
        }
    }
    
    // Arena feed updates
    async updateArenaFeeds() {
        try {
            // Update header first
            await this.updateArenaHeader();
            
            // Update overview embed
            await this.updateArenaOverview();
            
            // Update active challenge feeds - sort alphabetically by game title
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: new Date() }
            }).sort({ gameTitle: 1 }); // Sort alphabetically
            
            for (const challenge of activeChallengers) {
                await this.createOrUpdateArenaFeed(challenge);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Update open challenge feeds too - also sort alphabetically
            const openChallenges = await ArenaChallenge.find({
                status: 'open',
                isOpenChallenge: true
            }).sort({ gameTitle: 1 }); // Sort alphabetically
            
            for (const challenge of openChallenges) {
                await this.createOrUpdateOpenChallengeFeed(challenge);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Update GP leaderboard LAST
            await this.updateGpLeaderboard();
        } catch (error) {
            console.error('Error updating arena feeds:', error);
        }
    }

    async createOrUpdateArenaFeed(challenge) {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            // Get leaderboard data
            const [challengerScore, challengeeScore] = await this.getChallengersScores(challenge);
            
            // Store the previous scores before updating
            const previousChallengerScore = challenge.challengerScore;
            const previousChallengeeScore = challenge.challengeeScore;
            
            // Save the scores
            challenge.challengerScore = challengerScore.formattedScore;
            challenge.challengeeScore = challengeeScore.formattedScore;
            
            // Update participant scores for open challenges
            const participantScores = new Map();
            if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                for (const participant of challenge.participants) {
                    try {
                        const entry = await this.getParticipantScore(challenge, participant.username);
                        participant.score = entry.formattedScore;
                        participantScores.set(participant.username.toLowerCase(), entry);
                    } catch (error) {
                        console.error(`Error getting score for participant ${participant.username}:`, error);
                    }
                }
            }
            
            await challenge.save();
            
            // Check for position changes and notify if needed
            const positionChange = checkPositionChanges(
                challenge, challengerScore, challengeeScore, 
                previousChallengerScore, previousChallengeeScore
            );
            
            if (positionChange) {
                await this.notifyStandingsChange(challenge, positionChange);
            }
            
            // Determine who's leading for status updates
            let leader = null;
            if (challenge.isOpenChallenge) {
                // For open challenges, determine leader from all participants
                // This will be handled in the createChallengeEmbed function
            } else {
                // For direct challenges, determine leader using our improved function
                leader = getEstimatedWinner(challenge, challengerScore, challengeeScore);
                
                // Update the status field
                challenge.status = 'active'; // Ensure status is active
                if (leader && leader !== 'Tie') {
                    challenge.currentLeader = leader; // Store the current leader
                }
                await challenge.save();
            }
            
            // Create embed for the challenge using our improved utility function
            const embed = createChallengeEmbed(
                challenge, challengerScore, challengeeScore, 
                participantScores, this.client.options.EmbedBuilder || this.client.EmbedBuilder
            );
            
            // Add betting information to footer
            const startTime = challenge.startDate || challenge.createdAt;
            const bettingEndsAt = new Date(startTime.getTime() + (72 * 60 * 60 * 1000)); // 72 hours after start
            const now = new Date();
            
            if (now < bettingEndsAt) {
                const hoursLeft = Math.max(0, Math.floor((bettingEndsAt - now) / (60 * 60 * 1000)));
                embed.setFooter({ text: `Betting closes in ${hoursLeft} hours` });
            } else {
                embed.setFooter({ text: 'Betting is now closed for this challenge' });
            }
            
            // Send or update the message using base class method
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
            
            // Get the most up-to-date scores for all participants
            const participantScores = new Map();
            const challengerScore = { exists: false, formattedScore: 'No score yet', rank: 0, value: 0 };
            
            // Try to get challenger's score using RetroAPIUtils
            try {
                const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
                const isTimeBased = isTimeBasedLeaderboard(challenge);
                const processedEntries = processLeaderboardEntries(rawEntries, isTimeBased);
                
                const creatorEntry = findUserInLeaderboard(processedEntries, challenge.challengerUsername);
                
                if (creatorEntry) {
                    challengerScore.exists = true;
                    challengerScore.formattedScore = creatorEntry.FormattedScore;
                    challengerScore.rank = creatorEntry.ApiRank;
                    challengerScore.value = creatorEntry.Value;
                }
                
                // Get scores for participants too
                if (challenge.participants && challenge.participants.length > 0) {
                    for (const participant of challenge.participants) {
                        const participantEntry = findUserInLeaderboard(processedEntries, participant.username);
                        
                        if (participantEntry) {
                            participantScores.set(participant.username.toLowerCase(), {
                                exists: true,
                                formattedScore: participantEntry.FormattedScore,
                                rank: participantEntry.ApiRank,
                                value: participantEntry.Value
                            });
                            
                            // Update the participant's score in the challenge
                            participant.score = participantEntry.FormattedScore;
                        } else {
                            participantScores.set(participant.username.toLowerCase(), {
                                exists: false,
                                formattedScore: 'No score yet',
                                rank: 0,
                                value: 0
                            });
                        }
                    }
                }
                
                // Save updated scores
                await challenge.save();
            } catch (error) {
                console.error(`Error getting scores for open challenge:`, error);
            }
            
            // Create embed for the challenge using our utility function
            // For open challenges, explicitly pass null for challengeeScore
            const embed = createChallengeEmbed(
                challenge, challengerScore, null, // Explicitly pass null for challengeeScore
                participantScores, this.client.options.EmbedBuilder || this.client.EmbedBuilder
            );
            
            // Add betting information to footer
            const startTime = challenge.startDate || challenge.createdAt;
            const bettingEndsAt = new Date(startTime.getTime() + (72 * 60 * 60 * 1000)); // 72 hours after start
            const now = new Date();
            
            if (now < bettingEndsAt) {
                const hoursLeft = Math.max(0, Math.floor((bettingEndsAt - now) / (60 * 60 * 1000)));
                embed.setFooter({ text: `Betting closes in ${hoursLeft} hours` });
            } else {
                embed.setFooter({ text: 'Betting is now closed for this challenge' });
            }
            
            // Add how to join instructions at the bottom if the challenge is still open
            if (challenge.status === 'open') {
                embed.addFields({
                    name: 'How to Join', 
                    value: `Use \`/arena\` and select "Browse Open Challenges" to join this challenge.`
                });
            }
            
            // Send or update the message using our helper method
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

    // Helper method for updating arena challenge messages
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
            
            // Create new message
            const message = await channel.send(content);
            this.feedMessageIds.set(challengeId, message.id);
            return message.id;
        } catch (error) {
            console.error(`Error updating arena challenge message ${challengeId}:`, error);
            return null;
        }
    }

    // Header and leaderboard
    async updateArenaHeader() {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            // Get counts
            const activeCount = await ArenaChallenge.countDocuments({
                status: 'active',
                endDate: { $gt: new Date() }
            });
            
            const openCount = await ArenaChallenge.countDocuments({
                status: 'open',
                isOpenChallenge: true
            });
            
            // Create header content using Discord timestamp
            const timestamp = getDiscordTimestamp(new Date());
            
            let headerContent = 
                `# 🏟️ The Arena - Active Challenges\n` +
                `Currently there ${activeCount === 1 ? 'is' : 'are'} **${activeCount}** active challenge${activeCount === 1 ? '' : 's'} in the Arena.\n`;
                
            if (openCount > 0) {
                headerContent += `There ${openCount === 1 ? 'is' : 'are'} also **${openCount}** open challenge${openCount === 1 ? '' : 's'} awaiting participants.\n`;
            }
                
            headerContent += `**Last Updated:** ${timestamp} | **Updates:** Every hour\n` +
                `Use \`/arena\` to challenge others, place bets, or view your challenges`;
            
            // Update or create the header message using base class method
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

    // Arena overview
    async updateArenaOverview() {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            // Collect stats for the overview
            const activeCount = await ArenaChallenge.countDocuments({
                status: 'active',
                endDate: { $gt: new Date() }
            });
            
            const openCount = await ArenaChallenge.countDocuments({
                status: 'open',
                isOpenChallenge: true
            });
            
            // Get total prize pool and bet counts
            let totalPrizePool = 0;
            let totalBets = 0;
            
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: new Date() }
            });
            
            for (const challenge of activeChallengers) {
                // Wager pool
                if (challenge.isOpenChallenge) {
                    const participantCount = challenge.participants?.length + 1 || 1;
                    totalPrizePool += challenge.wagerAmount * participantCount;
                } else {
                    totalPrizePool += challenge.wagerAmount * 2;
                }
                
                // Add bet amounts
                if (challenge.bets && challenge.bets.length > 0) {
                    totalBets += challenge.bets.length;
                    totalPrizePool += challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0);
                }
            }
            
            // Stats object
            const stats = {
                activeCount,
                openCount,
                totalPrizePool,
                totalBets
            };
            
            // Create overview embed using our utility function
            const embed = createArenaOverviewEmbed(
                stats
            );
            
            // Send or update - using our helper method
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
            
            // Get top users by GP
            const topUsers = await User.find({ gp: { $gt: 0 } })
                .sort({ gp: -1 })
                .limit(5); // Reduced to top 5
            
            if (topUsers.length === 0) return;
            
            // Create leaderboard embed with exact timestamp
            const formattedDate = new Date().toLocaleString();
            
            const embed = new EmbedBuilder()
                .setTitle('💰 GP Leaderboard')
                .setColor(COLORS.WARNING) // Yellow color for GP leaderboard
                .setDescription(
                    'These are the users with the most GP (Gold Points).\n' +
                    'Earn GP by winning Arena challenges and bets.\n\n' +
                    `**Last Updated:** ${formattedDate}`
                )
                .setFooter({ 
                    text: 'Updates hourly | Everyone receives 1,000 GP automatically each month!' 
                });
            
            // Build leaderboard text with medals
            let leaderboardText = '';
            
            topUsers.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} **${user.raUsername}**: ${user.gp.toLocaleString()} GP\n`;
            });
            
            embed.addFields({ name: 'Top 5 Rankings', value: leaderboardText });
            
            // Update or create the leaderboard message
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

    // Challenge score management
    async getChallengersScores(challenge) {
        try {
            // Get leaderboard entries with our improved function
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
            
            // Process entries based on whether this is a time-based leaderboard
            const isTimeBased = isTimeBasedLeaderboard(challenge);
            const leaderboardEntries = processLeaderboardEntries(rawEntries, isTimeBased);
            
            // Find challenger entry using the improved user matching function
            const challengerEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengerUsername);
            
            // Find challengee entry using the improved user matching function
            const challengeeEntry = findUserInLeaderboard(leaderboardEntries, challenge.challengeeUsername);
            
            // Format challenger score
            const challengerScore = {
                value: challengerEntry ? challengerEntry.Value : 0,
                formattedScore: challengerEntry ? challengerEntry.FormattedScore : 'No score yet',
                exists: !!challengerEntry,
                rank: challengerEntry ? challengerEntry.ApiRank : 0
            };
            
            // Format challengee score
            const challengeeScore = {
                value: challengeeEntry ? challengeeEntry.Value : 0,
                formattedScore: challengeeEntry ? challengeeEntry.FormattedScore : 'No score yet',
                exists: !!challengeeEntry,
                rank: challengeeEntry ? challengeeEntry.ApiRank : 0
            };
            
            return [challengerScore, challengeeScore];
        } catch (error) {
            console.error('Error getting challenger scores:', error);
            return [
                { value: 0, formattedScore: 'Error retrieving score', exists: false, rank: 0 }, 
                { value: 0, formattedScore: 'Error retrieving score', exists: false, rank: 0 }
            ];
        }
    }

    async getParticipantScore(challenge, participantUsername) {
        try {
            // Get leaderboard entries with our improved function
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(challenge.leaderboardId, 1000);
            
            // Process entries based on whether this is a time-based leaderboard
            const isTimeBased = isTimeBasedLeaderboard(challenge);
            const leaderboardEntries = processLeaderboardEntries(rawEntries, isTimeBased);
            
            // Find entry for this participant using the improved user matching function
            const participantEntry = findUserInLeaderboard(leaderboardEntries, participantUsername);
            
            // Format score
            return {
                exists: !!participantEntry,
                formattedScore: participantEntry ? participantEntry.FormattedScore : 'No entry',
                rank: participantEntry ? participantEntry.ApiRank : 0,
                value: participantEntry ? participantEntry.Value : 0
            };
        } catch (error) {
            console.error(`Error fetching leaderboard position for ${participantUsername}:`, error);
            return {
                exists: false,
                formattedScore: 'Error fetching score',
                rank: 0,
                value: 0
            };
        }
    }

    // Completed challenge processing
    async checkCompletedChallenges() {
        try {
            // Find challenges that have ended but aren't completed
            const now = new Date();
            const endedChallenges = await ArenaChallenge.find({
                status: 'active',
                endDate: { $lte: now }
            });
            
            if (endedChallenges.length === 0) return;
            
            // Process each ended challenge
            for (const challenge of endedChallenges) {
                await this.processCompletedChallenge(challenge);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Refresh the feed after processing completed challenges to maintain order
            await this.refreshEntireFeed();
        } catch (error) {
            console.error('Error checking completed challenges:', error);
        }
    }

    async processCompletedChallenge(challenge) {
        try {
            // Handle open challenges with multiple participants
            if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                await this.processCompletedOpenChallenge(challenge);
            } else {
                await this.processCompletedDirectChallenge(challenge);
            }
            
            // Update the feed message
            await this.updateCompletedFeed(challenge);
        } catch (error) {
            console.error(`Error processing completed challenge ${challenge._id}:`, error);
        }
    }

    async processCompletedOpenChallenge(challenge) {
        // Get scores for all participants
        const participantScores = new Map();
        
        // Get challenger (creator) score
        const [challengerScore, _] = await this.getChallengersScores(challenge);
        
        // Add challenger to scores map
        participantScores.set(challenge.challengerUsername.toLowerCase(), {
            exists: challengerScore.value > 0,
            formattedScore: challengerScore.formattedScore,
            value: challengerScore.value,
            rank: challengerScore.rank
        });
        
        // Store the challenger score
        challenge.challengerScore = challengerScore.formattedScore;
        
        // Get scores for each participant
        for (const participant of challenge.participants) {
            try {
                const entry = await this.getParticipantScore(challenge, participant.username);
                participantScores.set(participant.username.toLowerCase(), entry);
                participant.score = entry.formattedScore;
            } catch (error) {
                console.error(`Error getting score for participant ${participant.username}:`, error);
                participantScores.set(participant.username.toLowerCase(), {
                    exists: false,
                    formattedScore: 'No score yet',
                    value: 0,
                    rank: 0
                });
            }
        }
        
        // Determine winner - now using ApiRank as primary consideration
        let winnerId = null;
        let winnerUsername = 'No Winner';
        let bestRank = Number.MAX_SAFE_INTEGER;
        let bestScore = null;
        
        // Check if it's a time-based challenge (lower is better)
        const isTimeBased = isTimeBasedLeaderboard(challenge);
        
        // Start with the creator as potential winner
        if (challengerScore.rank && challengerScore.rank > 0) {
            winnerId = challenge.challengerId;
            winnerUsername = challenge.challengerUsername;
            bestRank = challengerScore.rank;
            bestScore = challengerScore.value;
        } else if (challengerScore.value !== 0) {
            // Fall back to score if no rank
            winnerId = challenge.challengerId;
            winnerUsername = challenge.challengerUsername;
            bestScore = challengerScore.value;
        }
        
        // Check each participant for better rank or score
        for (const participant of challenge.participants) {
            const participantScore = participantScores.get(participant.username.toLowerCase());
            if (!participantScore) continue;
            
            // First check by rank (preferred method)
            if (participantScore.rank && participantScore.rank > 0) {
                if (bestRank === Number.MAX_SAFE_INTEGER || participantScore.rank < bestRank) {
                    winnerId = participant.userId;
                    winnerUsername = participant.username;
                    bestRank = participantScore.rank;
                    bestScore = participantScore.value;
                }
            } 
            // Fall back to score comparison if no rank
            else if (participantScore.value !== 0 && (bestScore === null || bestRank === Number.MAX_SAFE_INTEGER)) {
                if (bestScore === null || 
                    (isTimeBased && participantScore.value < bestScore) || 
                    (!isTimeBased && participantScore.value > bestScore)) {
                    winnerId = participant.userId;
                    winnerUsername = participant.username;
                    bestScore = participantScore.value;
                }
            }
        }
        
        // Calculate total pot (creator + all participants)
        const totalWagered = challenge.wagerAmount * (1 + challenge.participants.length);
        
        // Award pot to winner
        if (winnerId) {
            const winner = await User.findOne({ discordId: winnerId });
            if (winner) {
                await this.trackGpTransaction(
                    winner,
                    totalWagered,
                    'Won open challenge',
                    `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
                );
                
                // Update stats
                winner.arenaStats = winner.arenaStats || {};
                winner.arenaStats.wins = (winner.arenaStats.wins || 0) + 1;
                winner.arenaStats.gpWon = (winner.arenaStats.gpWon || 0) + totalWagered - challenge.wagerAmount;
                await winner.save();
            }
        }
        
        // Update challenge data
        challenge.status = 'completed';
        challenge.winnerId = winnerId;
        challenge.winnerUsername = winnerUsername;
        
        // Save the updated challenge
        await challenge.save();
        
        // Process bet payouts
        await this.processBetsForOpenChallenge(challenge, winnerId, winnerUsername);
        
        // Notify about the completed challenge
        await this.notifyChallengeUpdate(challenge);
    }

    async processCompletedDirectChallenge(challenge) {
        // Get final scores
        const [challengerScore, challengeeScore] = await this.getChallengersScores(challenge);
        
        // Determine the winner - now using ApiRank as primary criteria
        let winnerId, winnerUsername;
        
        // First try to determine by ApiRank (global position)
        if (challengerScore.rank && challengeeScore.rank) {
            if (challengerScore.rank < challengeeScore.rank) {
                winnerId = challenge.challengerId;
                winnerUsername = challenge.challengerUsername;
            } else if (challengeeScore.rank < challengerScore.rank) {
                winnerId = challenge.challengeeId;
                winnerUsername = challenge.challengeeUsername;
            } else {
                // Ranks are identical - fall back to score
                winnerId = null;
                winnerUsername = 'Tie';
            }
        } 
        // Fall back to score-based comparison if ranks aren't available
        else {
            const isTimeBased = isTimeBasedLeaderboard(challenge);
            
            if (isTimeBased) {
                // Time-based (lower is better)
                if (challengerScore.value < challengeeScore.value) {
                    winnerId = challenge.challengerId;
                    winnerUsername = challenge.challengerUsername;
                } else if (challengeeScore.value < challengerScore.value) {
                    winnerId = challenge.challengeeId;
                    winnerUsername = challenge.challengeeUsername;
                } else {
                    winnerId = null;
                    winnerUsername = 'Tie';
                }
            } else {
                // Score-based (higher is better)
                if (challengerScore.value > challengeeScore.value) {
                    winnerId = challenge.challengerId;
                    winnerUsername = challenge.challengerUsername;
                } else if (challengeeScore.value > challengerScore.value) {
                    winnerId = challenge.challengeeId;
                    winnerUsername = challenge.challengeeUsername;
                } else {
                    winnerId = null;
                    winnerUsername = 'Tie';
                }
            }
        }
        
        // Update challenge data
        challenge.status = 'completed';
        challenge.challengerScore = challengerScore.formattedScore;
        challenge.challengeeScore = challengeeScore.formattedScore;
        challenge.winnerId = winnerId;
        challenge.winnerUsername = winnerUsername;
        
        // Save the updated challenge
        await challenge.save();
        
        // Process wager transfers and bet payouts
        await this.processPayouts(challenge, winnerId, winnerUsername);
        
        // Notify about the completed challenge
        await this.notifyChallengeUpdate(challenge);
    }

    // Bet processing
    async processBetsForOpenChallenge(challenge, winnerId, winnerUsername) {
        // Skip if no bets
        if (!challenge.bets || challenge.bets.length === 0) return;
        
        // If no winner, return all bets
        if (!winnerId) {
            for (const bet of challenge.bets) {
                const bettor = await User.findOne({ discordId: bet.userId });
                if (bettor) {
                    await this.trackGpTransaction(
                        bettor,
                        bet.betAmount,
                        'Challenge ended with no winner - bet refund',
                        `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
                    );
                }
            }
            return;
        }
        
        // Separate winning and losing bets
        const winningBets = challenge.bets.filter(bet => bet.targetPlayer === winnerUsername);
        const losingBets = challenge.bets.filter(bet => bet.targetPlayer !== winnerUsername);
        
        // Calculate total bet amounts
        const totalWinningBetsAmount = winningBets.reduce((total, bet) => total + bet.betAmount, 0);
        const totalLosingBetsAmount = losingBets.reduce((total, bet) => total + bet.betAmount, 0);
        
        // Track total house contribution
        let totalHouseContribution = 0;
        
        // Process winning bets
        for (const bet of winningBets) {
            try {
                const bettor = await User.findOne({ discordId: bet.userId });
                if (!bettor) continue;
                
                let payoutAmount = bet.betAmount; // Start with getting the original bet back
                let houseContribution = 0;
                
                // If no losing bets, apply 50% house guarantee
                if (totalLosingBetsAmount === 0) {
                    houseContribution = Math.floor(bet.betAmount * 0.5);
                    payoutAmount += houseContribution;
                } 
                // Otherwise, distribute losing bets proportionally
                else {
                    const proportion = bet.betAmount / totalWinningBetsAmount;
                    const shareOfLosingBets = Math.floor(totalLosingBetsAmount * proportion);
                    payoutAmount += shareOfLosingBets;
                }
                
                // Track total house contribution
                totalHouseContribution += houseContribution;
                
                // Add payout to user
                await this.trackGpTransaction(
                    bettor,
                    payoutAmount,
                    'Won bet',
                    `Challenge ID: ${challenge._id}, Bet on: ${winnerUsername}, Profit: ${payoutAmount - bet.betAmount} GP`
                );
                
                // Update stats
                bettor.arenaStats = bettor.arenaStats || {};
                bettor.arenaStats.betsWon = (bettor.arenaStats.betsWon || 0) + 1;
                bettor.arenaStats.gpWon = (bettor.arenaStats.gpWon || 0) + (payoutAmount - bet.betAmount);
                
                // Mark bet as paid
                bet.paid = true;
                bet.payout = payoutAmount;
                bet.houseContribution = houseContribution;
                
                await bettor.save();
            } catch (error) {
                console.error(`Error processing bet for user ${bet.userId}:`, error);
            }
        }
        
        // Store the house contribution
        challenge.houseContribution = totalHouseContribution;
        
        // Save the challenge with updated bet info
        await challenge.save();
    }

    async processPayouts(challenge, winnerId, winnerUsername) {
        // Skip payouts if it's a tie
        if (!winnerId) {
            return;
        }
        
        // Get the users
        const challenger = await User.findOne({ discordId: challenge.challengerId });
        const challengee = await User.findOne({ discordId: challenge.challengeeId });
        
        if (!challenger || !challengee) {
            return;
        }
        
        // Transfer wager amount from loser to winner
        if (winnerId === challenge.challengerId) {
            // Challenger won
            await this.trackGpTransaction(
                challenger,
                challenge.wagerAmount * 2,
                'Won challenge',
                `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
            );
            
            // Update stats
            challenger.arenaStats = challenger.arenaStats || {};
            challenger.arenaStats.wins = (challenger.arenaStats.wins || 0) + 1;
            challenger.arenaStats.gpWon = (challenger.arenaStats.gpWon || 0) + challenge.wagerAmount;
            
            challengee.arenaStats = challengee.arenaStats || {};
            challengee.arenaStats.losses = (challengee.arenaStats.losses || 0) + 1;
            challengee.arenaStats.gpLost = (challengee.arenaStats.gpLost || 0) + challenge.wagerAmount;
            
            await challenger.save();
            await challengee.save();
        } else {
            // Challengee won
            await this.trackGpTransaction(
                challengee,
                challenge.wagerAmount * 2,
                'Won challenge',
                `Challenge ID: ${challenge._id}, Game: ${challenge.gameTitle}`
            );
            
            // Update stats
            challengee.arenaStats = challengee.arenaStats || {};
            challengee.arenaStats.wins = (challengee.arenaStats.wins || 0) + 1;
            challengee.arenaStats.gpWon = (challengee.arenaStats.gpWon || 0) + challenge.wagerAmount;
            
            challenger.arenaStats = challenger.arenaStats || {};
            challenger.arenaStats.losses = (challenger.arenaStats.losses || 0) + 1;
            challenger.arenaStats.gpLost = (challenger.arenaStats.gpLost || 0) + challenge.wagerAmount;
            
            await challengee.save();
            await challenger.save();
        }
        
        // Process bets
        if (challenge.bets && challenge.bets.length > 0) {
            await this.processBetsForOpenChallenge(challenge, winnerId, winnerUsername);
        }
    }

    async updateCompletedFeed(challenge) {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel || !challenge.messageId) return;
            
            // Try to fetch the message
            try {
                const message = await feedChannel.messages.fetch(challenge.messageId);
                
                // Calculate days from hours for display
                const durationDays = Math.floor(challenge.durationHours / 24);
                
                // Use the utility function to create the completed challenge embed
                const embed = createCompletedChallengeEmbed(
                    challenge, 
                    durationDays
                );
                
                // Update the message
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

    // GP Transaction Management
    async trackGpTransaction(user, amount, reason, context = '') {
        try {
            if (!user || !user.discordId) return false;

            // Get fresh user data
            const freshUser = await User.findOne({ discordId: user.discordId });
            if (!freshUser) return false;

            // Record old balance and update
            const oldBalance = freshUser.gp || 0;
            freshUser.gp = oldBalance + amount;
            
            // Add transaction record
            if (!freshUser.gpTransactions) {
                freshUser.gpTransactions = [];
            }
            
            freshUser.gpTransactions.push({
                amount,
                oldBalance,
                newBalance: freshUser.gp,
                reason,
                context,
                timestamp: new Date()
            });
            
            // Keep only recent transactions
            if (freshUser.gpTransactions.length > 10) {
                freshUser.gpTransactions = freshUser.gpTransactions.slice(-10);
            }
            
            // Save changes
            await freshUser.save();
            
            // Update original object
            user.gp = freshUser.gp;
            
            return true;
        } catch (error) {
            console.error(`Error tracking GP transaction:`, error);
            return false;
        }
    }

    // User-facing commands
    async checkAndGrantMonthlyGP(user) {
        try {
            // Prevent concurrent processing
            if (user._monthlyGpProcessing) {
                return false;
            }
            
            user._monthlyGpProcessing = true;
            
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            // Get fresh user data
            const freshUser = await User.findOne({ discordId: user.discordId });
            const lastClaim = freshUser.lastMonthlyGpClaim ? new Date(freshUser.lastMonthlyGpClaim) : null;
            
            // Check if eligible for monthly GP
            if (!lastClaim || 
                lastClaim.getMonth() !== currentMonth || 
                lastClaim.getFullYear() !== currentYear) {
                
                // Award the GP
                freshUser.gp = (freshUser.gp || 0) + 1000;
                freshUser.lastMonthlyGpClaim = now;
                await freshUser.save();
                
                // Update the original user object
                user.gp = freshUser.gp;
                user.lastMonthlyGpClaim = freshUser.lastMonthlyGpClaim;
                
                // Clear the flag
                delete user._monthlyGpProcessing;
                return true;
            }
            
            // Clear the flag
            delete user._monthlyGpProcessing;
            return false;
        } catch (error) {
            console.error(`Error checking monthly GP:`, error);
            delete user._monthlyGpProcessing;
            return false;
        }
    }

    async checkExistingChallenge(user1, user2) {
        return await ArenaChallenge.findOne({
            $or: [
                {
                    challengerId: user1.discordId,
                    challengeeId: user2.discordId,
                    status: { $in: ['pending', 'active'] }
                },
                {
                    challengerId: user2.discordId,
                    challengeeId: user1.discordId,
                    status: { $in: ['pending', 'active'] }
                }
            ]
        });
    }

    // Add these new methods for the leaderboard refresh functionality
    async refreshDirectChallengeLeaderboard(interaction, challenge) {
        return refreshDirectChallengeLeaderboard(interaction, challenge);
    }

    async refreshOpenChallengeLeaderboard(interaction, challenge) {
        return refreshOpenChallengeLeaderboard(interaction, challenge);
    }

    // Helper method to show GP leaderboard when requested via command
    async showGpLeaderboard(interaction) {
        try {
            await interaction.deferUpdate();
            
            // Get top users by GP
            const topUsers = await User.find({ gp: { $gt: 0 } })
                .sort({ gp: -1 })
                .limit(10);
            
            if (topUsers.length === 0) {
                return interaction.editReply('No GP leaderboard data is available yet.');
            }
            
            // Create leaderboard embed
            const embed = new EmbedBuilder()
                .setTitle('💰 GP Leaderboard')
                .setColor(COLORS.WARNING) // Yellow color for GP leaderboard
                .setDescription(
                    'These are the users with the most GP (Gold Points).\n' +
                    'Earn GP by winning Arena challenges and bets!'
                );
            
            // Build leaderboard text with medals
            let leaderboardText = '';
            
            topUsers.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} **${user.raUsername}**: ${user.gp.toLocaleString()} GP\n`;
            });
            
            embed.addFields({ name: 'Top 10 Rankings', value: leaderboardText });
            
            // Add information about earning GP
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
            
            // Create back button
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
