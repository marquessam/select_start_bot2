// src/services/arenaService.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';

// Update interval (every hour)
const UPDATE_INTERVAL = 60 * 60 * 1000;

class ArenaService {
    constructor() {
        this.client = null;
        this.arenaChannelId = config.discord.arenaChannelId || '1373570850912997476';
        this.arenaFeedChannelId = config.discord.arenaFeedChannelId || '1373570913882214410';
        this.updateInterval = null;
        this.feedMessageIds = new Map(); // Map of challengeId -> messageId
        this.headerMessageId = null;
        this.gpLeaderboardMessageId = null;
        
        // Store previous standings for comparison (for alerts)
        this.previousStandings = new Map(); // Map of challengeId -> { username: { rank, score } }
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for arena service');
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
            
            // Set up recurring updates
            await this.updateArenaFeeds();
            
            this.updateInterval = setInterval(() => {
                this.updateArenaFeeds().catch(error => {
                    console.error('Error updating arena feeds:', error);
                });
            }, UPDATE_INTERVAL);
            
            // Also set up a check for completed challenges
            setInterval(() => {
                this.checkCompletedChallenges().catch(error => {
                    console.error('Error checking completed challenges:', error);
                });
            }, 15 * 60 * 1000); // Every 15 minutes
            
            console.log(`Arena service started. Updates will occur every ${UPDATE_INTERVAL / 60000} minutes.`);
        } catch (error) {
            console.error('Error starting arena service:', error);
        }
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('Arena service stopped.');
        }
    }

    async getArenaChannel() {
        if (!this.client) {
            console.error('Discord client not set');
            return null;
        }

        try {
            const guildId = config.discord.guildId;
            const guild = await this.client.guilds.fetch(guildId);
            
            if (!guild) {
                console.error(`Guild not found: ${guildId}`);
                return null;
            }
            
            const channel = await guild.channels.fetch(this.arenaChannelId);
            
            if (!channel) {
                console.error(`Arena channel not found: ${this.arenaChannelId}`);
                return null;
            }
            
            return channel;
        } catch (error) {
            console.error('Error getting arena channel:', error);
            return null;
        }
    }

    async getArenaFeedChannel() {
        if (!this.client) {
            console.error('Discord client not set');
            return null;
        }

        try {
            const guildId = config.discord.guildId;
            const guild = await this.client.guilds.fetch(guildId);
            
            if (!guild) {
                console.error(`Guild not found: ${guildId}`);
                return null;
            }
            
            const channel = await guild.channels.fetch(this.arenaFeedChannelId);
            
            if (!channel) {
                console.error(`Arena feed channel not found: ${this.arenaFeedChannelId}`);
                return null;
            }
            
            return channel;
        } catch (error) {
            console.error('Error getting arena feed channel:', error);
            return null;
        }
    }

    async clearArenaFeedChannel() {
        try {
            const channel = await this.getArenaFeedChannel();
            if (!channel) {
                console.error('Arena feed channel not found or inaccessible');
                return false;
            }
            
            console.log(`Clearing all messages in arena feed channel (ID: ${this.arenaFeedChannelId})...`);
            
            // Fetch messages in batches (Discord API limitation)
            let messagesDeleted = 0;
            let messages;
            
            do {
                messages = await channel.messages.fetch({ limit: 100 });
                if (messages.size > 0) {
                    // Use bulk delete for messages less than 14 days old
                    try {
                        await channel.bulkDelete(messages);
                        messagesDeleted += messages.size;
                        console.log(`Bulk deleted ${messages.size} messages from arena feed`);
                    } catch (bulkError) {
                        // If bulk delete fails (messages older than 14 days), delete one by one
                        console.log(`Bulk delete failed for arena feed, falling back to individual deletion: ${bulkError.message}`);
                        for (const [id, message] of messages) {
                            try {
                                await message.delete();
                                messagesDeleted++;
                            } catch (deleteError) {
                                console.error(`Error deleting message ${id}:`, deleteError.message);
                            }
                            
                            // Add a small delay to avoid rate limits
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }
            } while (messages.size >= 100); // Keep fetching until no more messages
            
            console.log(`Cleared ${messagesDeleted} messages from arena feed channel`);
            
            // Reset state since we've cleared the channel
            this.feedMessageIds.clear();
            this.headerMessageId = null;
            this.gpLeaderboardMessageId = null;
            
            return true;
        } catch (error) {
            console.error('Error clearing arena feed channel:', error);
            return false;
        }
    }

    async notifyNewChallenge(challenge) {
        try {
            const channel = await this.getArenaChannel();
            if (!channel) return;
            
            // Create an embed for the new challenge
            const embed = new EmbedBuilder()
                .setTitle('🏟️ New Arena Challenge Issued!')
                .setColor('#3498DB');
            
            // Different description for open vs direct challenges
            if (challenge.isOpenChallenge) {
                embed.setDescription(
                    `**${challenge.challengerUsername}** has created an open challenge for anyone to join!`
                );
            } else {
                embed.setDescription(
                    `**${challenge.challengerUsername}** has challenged **${challenge.challengeeUsername}** to a competition!`
                );
            }
            
            embed.addFields(
                { name: 'Game', value: challenge.gameTitle, inline: false }
            );
            
            // Add description if available
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description, inline: false });
            }
            
            // Add other details
            const fields = [
                { name: 'Wager', value: challenge.isOpenChallenge ? 
                    `${challenge.wagerAmount} GP per player` : 
                    `${challenge.wagerAmount} GP each`, 
                  inline: true },
                { name: 'Duration', value: `${Math.floor(challenge.durationHours / 24)} days`, inline: true }
            ];
            
            // Add max participants for open challenges
            if (challenge.isOpenChallenge && challenge.maxParticipants) {
                fields.push({ 
                    name: 'Max Participants', 
                    value: `${challenge.maxParticipants}`, 
                    inline: true 
                });
            }
            
            embed.addFields(fields);
            
            // Set appropriate footer based on challenge type
            if (challenge.isOpenChallenge) {
                embed.setFooter({ 
                    text: `Use /arena and select "Browse Open Challenges" to join this challenge.` 
                });
            } else {
                embed.setFooter({ 
                    text: `${challenge.challengeeUsername} can use /arena to view and respond to this challenge.` 
                });
            }
            
            embed.setTimestamp();
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Send the notification
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending new challenge notification:', error);
        }
    }

    async notifyChallengeUpdate(challenge) {
        try {
            const channel = await this.getArenaChannel();
            if (!channel) return;
            
            let title, description, color;
            const durationDays = Math.floor(challenge.durationHours / 24);
            
            // Different messages for open challenges
            if (challenge.isOpenChallenge) {
                switch(challenge.status) {
                    case 'active':
                        title = '🏟️ Open Arena Challenge Started!';
                        description = 
                            `The open challenge created by **${challenge.challengerUsername}** has begun!`;
                        color = '#2ECC71';
                        break;
                    case 'cancelled':
                        title = '🏟️ Open Arena Challenge Cancelled';
                        description = 
                            `The open challenge created by **${challenge.challengerUsername}** has been cancelled.`;
                        color = '#95A5A6';
                        break;
                    case 'completed':
                        title = '🏟️ Open Arena Challenge Completed!';
                        description = 
                            `The open challenge created by **${challenge.challengerUsername}** has ended!`;
                        color = '#F1C40F';
                        break;
                    default:
                        return; // Don't notify for other statuses
                }
            } else {
                // Original code for 1v1 challenges
                switch(challenge.status) {
                    case 'active':
                        title = '🏟️ Arena Challenge Accepted!';
                        description = 
                            `**${challenge.challengeeUsername}** has accepted the challenge from **${challenge.challengerUsername}**!`;
                        color = '#2ECC71';
                        break;
                    case 'declined':
                        title = '🏟️ Arena Challenge Declined';
                        description = 
                            `**${challenge.challengeeUsername}** has declined the challenge from **${challenge.challengerUsername}**.`;
                        color = '#E74C3C';
                        break;
                    case 'cancelled':
                        title = '🏟️ Arena Challenge Cancelled';
                        description = 
                            `The challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}** has been cancelled.`;
                        color = '#95A5A6';
                        break;
                    case 'completed':
                        title = '🏟️ Arena Challenge Completed!';
                        description = 
                            `The challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}** has ended!`;
                        color = '#F1C40F';
                        break;
                    default:
                        return; // Don't notify for other statuses
                }
            }
            
            // Create an embed for the update
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor(color)
                .setDescription(description)
                .addFields(
                    { name: 'Game', value: challenge.gameTitle, inline: false }
                );
                
            // Add description if available
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description, inline: false });
            }
            
            // Add other fields based on status
            if (challenge.status === 'active') {
                // Different fields for open vs direct challenges
                if (challenge.isOpenChallenge) {
                    const participantCount = challenge.participants.length + 1; // +1 for creator
                    
                    embed.addFields(
                        { name: 'Participants', value: `${participantCount} players`, inline: true },
                        { name: 'Wager', value: `${challenge.wagerAmount} GP per player`, inline: true },
                        { name: 'Duration', value: `${durationDays} days`, inline: true },
                        { name: 'Ends', value: challenge.endDate.toLocaleString(), inline: true }
                    )
                    .setFooter({ text: 'Watch the leaderboard updates in the arena feed channel! Use /arena to place bets.' });
                } else {
                    embed.addFields(
                        { name: 'Wager', value: `${challenge.wagerAmount} GP each`, inline: true },
                        { name: 'Duration', value: `${durationDays} days`, inline: true },
                        { name: 'Ends', value: challenge.endDate.toLocaleString(), inline: true }
                    )
                    .setFooter({ text: 'Watch the leaderboard updates in the arena feed channel! Use /arena to place bets.' });
                }
            } else if (challenge.status === 'completed') {
                // Handle completed challenges
                if (challenge.isOpenChallenge) {
                    // For open challenges
                    const participantCount = challenge.participants.length + 1; // +1 for creator
                    const totalPot = challenge.wagerAmount * participantCount;
                    
                    embed.addFields(
                        { name: 'Winner', value: challenge.winnerUsername || 'No Winner', inline: false },
                        { name: 'Participants', value: `${participantCount} players`, inline: true },
                        { name: 'Total Pot', value: `${totalPot} GP`, inline: true }
                    );
                    
                    // If there are participant scores, add them
                    if (challenge.participants && challenge.participants.length > 0) {
                        let scoresText = `• **${challenge.challengerUsername}** (Creator): ${challenge.challengerScore || 'No score'}\n`;
                        
                        challenge.participants.forEach(participant => {
                            scoresText += `• **${participant.username}**: ${participant.score || 'No score'}\n`;
                        });
                        
                        embed.addFields({ name: 'Final Scores', value: scoresText });
                    }
                } else {
                    // For regular 1v1 challenges
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
            }
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Set timestamp
            embed.setTimestamp();
            
            // Add betting button for active challenges
            let components = [];
            if (challenge.status === 'active') {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('not_used_here')
                            .setLabel('Place a Bet')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('💰')
                    );
                
                components = [row];
                
                // Send the notification with button - REMOVED ROLE MENTION
                const message = await channel.send({ 
                    embeds: [embed],
                    components: components,
                    content: `A new Arena challenge has begun!` // Removed the role mention
                });
                
                // Add a followup message explaining how to bet
                await channel.send({
                    content: 'To place a bet, use the `/arena` command and select "Place a Bet". Pot Betting System: Your bet joins the total prize pool. If your chosen player wins, you get your bet back plus a share of the losing bets proportional to your bet amount!',
                    reply: { messageReference: message.id }
                });
            } else {
                // Send the notification without button
                await channel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error sending challenge update notification:', error);
        }
    }
    
    // Add Notification for New Participant
    async notifyParticipantJoined(challenge, participantUsername) {
        try {
            const channel = await this.getArenaChannel();
            if (!channel) return;
            
            // Create an embed for the participant notification
            const embed = new EmbedBuilder()
                .setTitle('🏟️ New Participant Joined Challenge!')
                .setColor('#3498DB')
                .setDescription(
                    `**${participantUsername}** has joined the open challenge for **${challenge.gameTitle}**!`
                )
                .addFields(
                    { name: 'Challenge Creator', value: challenge.challengerUsername, inline: true },
                    { name: 'Wager', value: `${challenge.wagerAmount} GP`, inline: true },
                    { name: 'Total Participants', value: `${challenge.participants.length + 1}`, inline: true },
                    { name: 'Description', value: challenge.description || 'No description provided' }
                );
            
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending participant joined notification:', error);
        }
    }
    
    async notifyStandingsChange(challenge, changedPosition) {
        try {
            const channel = await this.getArenaChannel();
            if (!channel) return;
            
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
            
            // Create an embed for the standings change notification
            const embed = new EmbedBuilder()
                .setTitle('🏟️ Arena Standings Update!')
                .setColor('#9B59B6')
                .setDescription(
                    `There's been a change in the leaderboard for the active challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}**!`
                )
                .addFields(
                    { name: 'Game', value: `[${challenge.gameTitle}](${leaderboardUrl})`, inline: false }
                );
            
            // Add description if available
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description, inline: false });
            }
            
            // Add position change information
            embed.addFields({
                name: 'Position Change', 
                value: `**${changedPosition.newLeader}** has overtaken **${changedPosition.previousLeader}**!`
            });
            
            // Add current scores
            embed.addFields({
                name: 'Current Scores',
                value: `• **${challenge.challengerUsername}**: ${challenge.challengerScore}\n` +
                       `• **${challenge.challengeeUsername}**: ${challenge.challengeeScore}`
            });
            
            embed.setFooter({ text: `Follow the challenge in #${this.arenaFeedChannelId}!` })
                 .setTimestamp();
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Send the notification
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending standings change notification:', error);
        }
    }
    
    async updateArenaFeeds() {
        try {
            // Update header first
            await this.updateArenaHeader();
            
            // Update GP leaderboard
            await this.updateGpLeaderboard();
            
            // Get active challenges
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: new Date() }
            });
            
            console.log(`Updating ${activeChallengers.length} active arena challenges`);
            
            // Update each challenge feed
            for (const challenge of activeChallengers) {
                await this.createOrUpdateArenaFeed(challenge);
                
                // Add a small delay between updates
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Error updating arena feeds:', error);
        }
    }

    async createOrUpdateArenaFeed(challenge) {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            // Get leaderboard data for this challenge
            const [challengerScore, challengeeScore] = await this.getChallengersScores(challenge);
            
            // Store the previous scores before updating
            const previousChallengerScore = challenge.challengerScore;
            const previousChallengeeScore = challenge.challengeeScore;
            
            // Save the scores
            challenge.challengerScore = challengerScore.formattedScore;
            challenge.challengeeScore = challengeeScore.formattedScore;
            
            // Update participant scores for open challenges
            if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                // Get scores for each participant
                for (const participant of challenge.participants) {
                    try {
                        // Fetch the participant's leaderboard entry
                        const entry = await this.getParticipantScore(challenge, participant.username);
                        
                        // Update the participant's score in the challenge
                        participant.score = entry.formattedScore;
                    } catch (scoreError) {
                        console.error(`Error getting score for participant ${participant.username}:`, scoreError);
                    }
                }
            }
            
            await challenge.save();
            
            // Check for position changes and notify if needed
            await this.checkForPositionChanges(challenge, challengerScore, challengeeScore, previousChallengerScore, previousChallengeeScore);
            
            // Create embed for the challenge
            const embed = this.createChallengeEmbed(challenge, challengerScore, challengeeScore);
            
            // Send or update the message
            const challengeId = challenge._id.toString();
            
            try {
                if (this.feedMessageIds.has(challengeId)) {
                    // Try to update existing message
                    const messageId = this.feedMessageIds.get(challengeId);
                    try {
                        const message = await feedChannel.messages.fetch(messageId);
                        await message.edit({ embeds: [embed] });
                        console.log(`Updated arena feed for challenge ${challengeId}`);
                    } catch (fetchError) {
                        // If message not found, create a new one
                        if (fetchError.message.includes('Unknown Message')) {
                            const message = await feedChannel.send({ embeds: [embed] });
                            this.feedMessageIds.set(challengeId, message.id);
                            console.log(`Created new arena feed after failed fetch for challenge ${challengeId}`);
                            
                            // Store message ID in challenge
                            challenge.messageId = message.id;
                            await challenge.save();
                        } else {
                            throw fetchError; // Re-throw if it's some other error
                        }
                    }
                } else {
                    // Create new message
                    const message = await feedChannel.send({ embeds: [embed] });
                    this.feedMessageIds.set(challengeId, message.id);
                    console.log(`Created new arena feed for challenge ${challengeId}`);
                    
                    // Store message ID in challenge
                    challenge.messageId = message.id;
                    await challenge.save();
                }
            } catch (error) {
                console.error(`Error updating arena feed for challenge ${challengeId}:`, error);
                
                // If message not found, create a new one
                if (error.message.includes('Unknown Message')) {
                    try {
                        const message = await feedChannel.send({ embeds: [embed] });
                        this.feedMessageIds.set(challengeId, message.id);
                        console.log(`Created new arena feed after error for challenge ${challengeId}`);
                        
                        // Store message ID in challenge
                        challenge.messageId = message.id;
                        await challenge.save();
                    } catch (sendError) {
                        console.error(`Error creating message after failed update for challenge ${challengeId}:`, sendError);
                    }
                }
            }
        } catch (error) {
            console.error('Error creating/updating arena feed:', error);
        }
    }

    // Check for position changes in the leaderboard
    async checkForPositionChanges(challenge, challengerScore, challengeeScore, previousChallengerScore, previousChallengeeScore) {
        try {
            // Only check if we have previous scores
            if (!previousChallengerScore || !previousChallengeeScore) {
                return;
            }

            let positionChange = null;

            // Parse the numerical values for comparison (handling different score formats)
            let previousChallengerValue, previousChallengeeValue, currentChallengerValue, currentChallengeeValue;

            // For time-based challenges (lower is better), we need to parse the times
            if (challenge.gameTitle.toLowerCase().includes('racing') || 
                previousChallengerScore.includes(':') || 
                challengerScore.formattedScore.includes(':')) {
                
                // Parse times like "1:23.456" into seconds
                const parseTime = (timeString) => {
                    if (!timeString || timeString === 'No score yet') return Infinity;
                    
                    // Extract numbers from the string
                    const matches = timeString.match(/(\d+):(\d+)\.(\d+)/);
                    if (!matches) return Infinity;
                    
                    const minutes = parseInt(matches[1], 10);
                    const seconds = parseInt(matches[2], 10);
                    const milliseconds = parseInt(matches[3], 10);
                    
                    return (minutes * 60) + seconds + (milliseconds / 1000);
                };
                
                previousChallengerValue = parseTime(previousChallengerScore);
                previousChallengeeValue = parseTime(previousChallengeeScore);
                currentChallengerValue = parseTime(challengerScore.formattedScore);
                currentChallengeeValue = parseTime(challengeeScore.formattedScore);
                
                // For times, lower is better, so we need to invert the comparison
                // Check if challenger overtook challengee
                if (previousChallengerValue > previousChallengeeValue && currentChallengerValue <= currentChallengeeValue) {
                    positionChange = {
                        newLeader: challenge.challengerUsername,
                        previousLeader: challenge.challengeeUsername
                    };
                }
                // Check if challengee overtook challenger
                else if (previousChallengeeValue > previousChallengerValue && currentChallengeeValue <= currentChallengerValue) {
                    positionChange = {
                        newLeader: challenge.challengeeUsername,
                        previousLeader: challenge.challengerUsername
                    };
                }
            } 
            // For point-based challenges (higher is better)
            else {
                // Parse numbers from the strings, removing commas and other non-numeric characters
                const parseNumber = (numString) => {
                    if (!numString || numString === 'No score yet') return -1;
                    return parseFloat(numString.replace(/[^\d.-]/g, '')) || -1;
                };
                
                previousChallengerValue = parseNumber(previousChallengerScore);
                previousChallengeeValue = parseNumber(previousChallengeeScore);
                currentChallengerValue = parseNumber(challengerScore.formattedScore);
                currentChallengeeValue = parseNumber(challengeeScore.formattedScore);
                
                // Check if challenger overtook challengee
                if (previousChallengerValue < previousChallengeeValue && currentChallengerValue >= currentChallengeeValue) {
                    positionChange = {
                        newLeader: challenge.challengerUsername,
                        previousLeader: challenge.challengeeUsername
                    };
                }
                // Check if challengee overtook challenger
                else if (previousChallengeeValue < previousChallengerValue && currentChallengeeValue >= currentChallengerValue) {
                    positionChange = {
                        newLeader: challenge.challengeeUsername,
                        previousLeader: challenge.challengerUsername
                    };
                }
            }
            
            // If there was a position change, notify
            if (positionChange) {
                await this.notifyStandingsChange(challenge, positionChange);
            }
        } catch (error) {
            console.error('Error checking for position changes:', error);
        }
    }

    // Create Challenge Embed with support for open challenges
    createChallengeEmbed(challenge, challengerScore, challengeeScore) {
        // Calculate time remaining
        const now = new Date();
        const timeRemaining = this.formatTimeRemaining(challenge.endDate);
        
        // Determine who's winning for regular challenges
        let winningText = 'The challenge is tied!';
        let winningUser = null;
        
        // Create the embed
        const embed = new EmbedBuilder()
            .setColor(challenge.endDate > now ? '#3498DB' : '#E74C3C');
        
        // Add thumbnail if available
        if (challenge.iconUrl) {
            embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
        }
        
        // Handle open challenges with participants separately
        if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
            // Set title for open challenge
            embed.setTitle(`🏟️ Open Challenge: ${challenge.gameTitle}`);
            embed.setDescription(`**Creator:** ${challenge.challengerUsername}`);
            
            // Add description if available
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description });
            }
            
            // Add challenge details
            embed.addFields(
                { name: 'Challenge Details', 
                  value: `**Wager:** ${challenge.wagerAmount} GP per player\n` +
                         `**Duration:** ${Math.floor(challenge.durationHours / 24)} days\n` +
                         `**Started:** ${challenge.startDate.toLocaleString()}\n` +
                         `**Ends:** ${challenge.endDate.toLocaleString()} (${timeRemaining})\n\n` +
                         `**Participants:** ${challenge.participants.length + 1} total` // +1 for the creator
                }
            );
            
            // Cache participant scores
            const participantScores = new Map();
            
            // Get scores for participants from our API calls - implemented elsewhere
            if (challenge.participants) {
                challenge.participants.forEach(participant => {
                    participantScores.set(participant.username.toLowerCase(), participant.score);
                });
            }
            
            // Add participants with scores
            let participantsText = '';
            
            // Add creator
            participantsText += `• **${challenge.challengerUsername}** (Creator): ${challengerScore.formattedScore}\n`;
            
            // Add each participant
            challenge.participants.forEach(participant => {
                // Get participant score from our cached scores if available
                const participantScore = participantScores.get(participant.username.toLowerCase()) || 'No score yet';
                participantsText += `• **${participant.username}**: ${participantScore}\n`;
            });
            
            embed.addFields({
                name: `Participants (${challenge.participants.length + 1})`, 
                value: participantsText
            });
            
            // Calculate total pot
            const wagerPool = challenge.wagerAmount * (challenge.participants.length + 1); // all participants + creator
            const betPool = challenge.bets ? challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0) : 0;
            const totalPool = wagerPool + betPool;
            
            // Add betting info section
            embed.addFields({
                name: '💰 Betting Information',
                value: 
                    `**Total Prize Pool:** ${totalPool} GP\n` +
                    `• Wager Pool: ${wagerPool} GP\n` +
                    `• Betting Pool: ${betPool} GP\n\n` +
                    `**Bets Placed:** ${challenge.bets ? challenge.bets.length : 0} total bets\n\n` +
                    `Use \`/arena\` and select "Place a Bet" to bet on the outcome!\n` +
                    `**Pot Betting:** If your player wins, you get your bet back plus a share of the opposing bets proportional to your bet amount.`
            });
            
        } else {
            // Regular 1v1 challenge handling
            
            // Determine who's winning
            if (challengerScore.value > challengeeScore.value) {
                winningText = `${challenge.challengerUsername} is in the lead!`;
                winningUser = challenge.challengerUsername;
            } else if (challengeeScore.value > challengerScore.value) {
                winningText = `${challenge.challengeeUsername} is in the lead!`;
                winningUser = challenge.challengeeUsername;
            }
            
            // Calculate bet distribution
            const totalBets = challenge.bets ? challenge.bets.length : 0;
            let challengerBets = 0;
            let challengeeBets = 0;
            let challengerBetAmount = 0;
            let challengeeBetAmount = 0;
            
            if (challenge.bets) {
                challenge.bets.forEach(bet => {
                    if (bet.targetPlayer === challenge.challengerUsername) {
                        challengerBets++;
                        challengerBetAmount += bet.betAmount;
                    } else if (bet.targetPlayer === challenge.challengeeUsername) {
                        challengeeBets++;
                        challengeeBetAmount += bet.betAmount;
                    }
                });
            }
            
            // Calculate total pot (wagers + bets)
            const wagerPool = challenge.wagerAmount * 2;
            const betPool = challengerBetAmount + challengeeBetAmount;
            const totalPool = wagerPool + betPool;
            
            // Calculate days from hours for display
            const durationDays = Math.floor(challenge.durationHours / 24);
            
            // Set title and description
            embed.setTitle(`🏟️ Arena Challenge: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`);
            embed.setDescription(`**Game:** ${challenge.gameTitle}`);
            
            // Add description if available
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description });
            }
            
            // Add challenge details
            embed.addFields(
                { name: 'Challenge Details', 
                  value: `**Wager:** ${challenge.wagerAmount} GP each\n` +
                         `**Duration:** ${durationDays} days\n` +
                         `**Started:** ${challenge.startDate.toLocaleString()}\n` +
                         `**Ends:** ${challenge.endDate.toLocaleString()} (${timeRemaining})\n\n` +
                         `**Current Status:** ${winningText}`
                }
            );
            
            // Add current scores
            embed.addFields({
                name: '📊 Current Scores',
                value: 
                    `**${challenge.challengerUsername}:** ${challengerScore.formattedScore}\n` +
                    `**${challenge.challengeeUsername}:** ${challengeeScore.formattedScore}`
            });
            
            // Add betting info
            embed.addFields({
                name: '💰 Betting Information',
                value: 
                    `**Total Prize Pool:** ${totalPool} GP\n` +
                    `• Base Wager: ${wagerPool} GP\n` +
                    `• Betting Pool: ${betPool} GP\n\n` +
                    `**Bets Placed:** ${totalBets} total bets\n` +
                    `• On ${challenge.challengerUsername}: ${challengerBets} bets (${challengerBetAmount} GP)\n` +
                    `• On ${challenge.challengeeUsername}: ${challengeeBets} bets (${challengeeBetAmount} GP)\n\n` +
                    `Use \`/arena\` and select "Place a Bet" to bet on the outcome!\n` +
                    `**Pot Betting:** If your player wins, you get your bet back plus a share of the opposing bets proportional to your bet amount.`
            });
        }
        
        embed.setTimestamp();
        return embed;
    }

    async updateArenaHeader() {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            // Get the count of active challenges
            const activeCount = await ArenaChallenge.countDocuments({
                status: 'active',
                endDate: { $gt: new Date() }
            });
            
            // Get the count of open challenges awaiting participants
            const openCount = await ArenaChallenge.countDocuments({
                status: 'open',
                isOpenChallenge: true
            });
            
            // Get current Unix timestamp for Discord formatting
            const unixTimestamp = Math.floor(Date.now() / 1000);
            
            // Create header content
            let headerContent = 
                `# 🏟️ The Arena - Active Challenges\n` +
                `Currently there ${activeCount === 1 ? 'is' : 'are'} **${activeCount}** active challenge${activeCount === 1 ? '' : 's'} in the Arena.\n`;
                
            // Add open challenges count if any
            if (openCount > 0) {
                headerContent += `There ${openCount === 1 ? 'is' : 'are'} also **${openCount}** open challenge${openCount === 1 ? '' : 's'} awaiting participants.\n`;
            }
                
            headerContent += `**Last Updated:** <t:${unixTimestamp}:f> | **Updates:** Every hour\n` +
                `Use \`/arena\` to challenge others, place bets, or view your challenges`;
            
            try {
                if (this.headerMessageId) {
                    // Try to update existing header
                    try {
                        const headerMessage = await feedChannel.messages.fetch(this.headerMessageId);
                        await headerMessage.edit({ content: headerContent });
                        console.log(`Updated arena feed header message`);
                    } catch (fetchError) {
                        // If message not found, create a new one
                        if (fetchError.message.includes('Unknown Message')) {
                            const message = await feedChannel.send({ content: headerContent });
                            this.headerMessageId = message.id;
                            console.log(`Created new arena feed header after failed fetch`);
                            
                            // Try to pin the header message
                            try {
                                const pinnedMessages = await feedChannel.messages.fetchPinned();
                                if (pinnedMessages.size >= 50) {
                                    // Unpin oldest if limit reached
                                    const oldestPinned = pinnedMessages.last();
                                    await oldestPinned.unpin();
                                }
                                await message.pin();
                                console.log(`Pinned arena feed header message`);
                            } catch (pinError) {
                                console.error(`Error pinning message: ${pinError.message}`);
                            }
                        } else {
                            throw fetchError; // Re-throw if it's some other error
                        }
                    }
                } else {
                    // Create new header message
                    const message = await feedChannel.send({ content: headerContent });
                    this.headerMessageId = message.id;
                    console.log(`Created new arena feed header message`);
                    
                    // Try to pin the header message
                    try {
                        const pinnedMessages = await feedChannel.messages.fetchPinned();
                        if (pinnedMessages.size >= 50) {
                            // Unpin oldest if limit reached
                            const oldestPinned = pinnedMessages.last();
                            await oldestPinned.unpin();
                        }
                        await message.pin();
                        console.log(`Pinned arena feed header message`);
                    } catch (pinError) {
                        console.error(`Error pinning message: ${pinError.message}`);
                    }
                }
            } catch (error) {
                console.error('Error updating arena feed header:', error);
                
                // If message not found, create a new one
                if (error.message.includes('Unknown Message')) {
                    try {
                        const message = await feedChannel.send({ content: headerContent });
                        this.headerMessageId = message.id;
                        console.log(`Created new arena feed header after error`);
                    } catch (sendError) {
                        console.error('Error creating header after failed update:', sendError);
                    }
                }
            }
        } catch (error) {
            console.error('Error updating arena header:', error);
        }
    }

    async updateGpLeaderboard() {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            // Get top users by GP
            const topUsers = await User.find({ gp: { $gt: 0 } })
                .sort({ gp: -1 })
                .limit(10);
            
            if (topUsers.length === 0) {
                return; // No users to display
            }
            
            // Get current Unix timestamp for Discord formatting
            const unixTimestamp = Math.floor(Date.now() / 1000);
            
            // Create an embed for the leaderboard
            const embed = new EmbedBuilder()
                .setTitle('💰 GP Leaderboard')
                .setColor('#FFD700')
                .setDescription(
                    'These are the users with the most GP (Gold Points).\n' +
                    'Earn GP by winning Arena challenges and bets. Everyone receives 1,000 GP automatically each month.\n\n' +
                    `**Last Updated:** <t:${unixTimestamp}:R>` // Added Discord timestamp in relative format
                )
                .setFooter({ 
                    text: 'The user with the most GP at the end of the year will receive a special title and award points!' 
                });
            
            let leaderboardText = '';
            
            topUsers.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} **${user.raUsername}**: ${user.gp.toLocaleString()} GP\n`;
                
                // Add a visual divider after the top 3
                if (index === 2) {
                    leaderboardText += '──────────────\n';
                }
            });
            
            embed.addFields({ name: 'Top 10 Rankings', value: leaderboardText });
            
            // Add a note about monthly GP
            embed.addFields({ 
                name: 'Monthly Allowance', 
                value: 'You automatically receive 1,000 GP at the beginning of each month!' 
            });
            
            // Update or create the message
            try {
                if (this.gpLeaderboardMessageId) {
                    // Try to update existing leaderboard
                    try {
                        const gpMessage = await feedChannel.messages.fetch(this.gpLeaderboardMessageId);
                        await gpMessage.edit({ embeds: [embed] });
                        console.log(`Updated GP leaderboard message`);
                    } catch (fetchError) {
                        // If message not found, create a new one
                        if (fetchError.message.includes('Unknown Message')) {
                            const message = await feedChannel.send({ embeds: [embed] });
                            this.gpLeaderboardMessageId = message.id;
                            console.log(`Created new GP leaderboard after failed fetch`);
                        } else {
                            throw fetchError; // Re-throw if it's some other error
                        }
                    }
                } else {
                    // Create new leaderboard message
                    const message = await feedChannel.send({ embeds: [embed] });
                    this.gpLeaderboardMessageId = message.id;
                    console.log(`Created new GP leaderboard message`);
                }
            } catch (error) {
                console.error('Error updating GP leaderboard:', error);
                
                // If message not found, create a new one
                if (error.message.includes('Unknown Message')) {
                    try {
                        const message = await feedChannel.send({ embeds: [embed] });
                        this.gpLeaderboardMessageId = message.id;
                        console.log(`Created new GP leaderboard message after error`);
                    } catch (sendError) {
                        console.error('Error creating GP leaderboard after failed update:', sendError);
                    }
                }
            }
        } catch (error) {
            console.error('Error updating GP leaderboard:', error);
        }
    }

    async getChallengersScores(challenge) {
        try {
            // Get all registered users for filtering
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
            // Fetch multiple batches of leaderboard entries like in arcade.js
            const batch1 = await retroAPI.getLeaderboardEntriesDirect(challenge.leaderboardId, 0, 500);
            const batch2 = await retroAPI.getLeaderboardEntriesDirect(challenge.leaderboardId, 500, 500);
            
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
            
            console.log(`Total entries fetched for challenge ${challenge._id}: ${rawEntries.length}`);
            
            // Filter entries to those ≤ 999 rank
            rawEntries = rawEntries.filter(entry => {
                const rank = entry.Rank || entry.rank || 0;
                return parseInt(rank, 10) <= 999;
            });
            
            // Process the entries with appropriate handling for different formats
            const leaderboardEntries = rawEntries.map(entry => {
                // Standard properties that most entries have
                const user = entry.User || entry.user || '';
                const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                const rank = entry.Rank || entry.rank || 0;
                
                return {
                    ApiRank: parseInt(rank, 10),
                    User: user.trim(),
                    RawScore: score,
                    TrackTime: formattedScore.toString().trim() || score.toString(),
                    Value: parseFloat(score) || 0
                };
            });
            
            // Find the entries for the challengers
            const challengerEntry = leaderboardEntries.find(entry => 
                entry.User.toLowerCase() === challenge.challengerUsername.toLowerCase()
            );
            
            const challengeeEntry = leaderboardEntries.find(entry => 
                entry.User.toLowerCase() === challenge.challengeeUsername.toLowerCase()
            );
            
            // Format the challenger scores
            const challengerScore = {
                value: 0,
                formattedScore: 'No score yet'
            };
            
            if (challengerEntry) {
                challengerScore.value = challengerEntry.Value;
                challengerScore.formattedScore = challengerEntry.TrackTime;
            }
            
            // Format the challengee scores
            const challengeeScore = {
                value: 0,
                formattedScore: 'No score yet'
            };
            
            if (challengeeEntry) {
                challengeeScore.value = challengeeEntry.Value;
                challengeeScore.formattedScore = challengeeEntry.TrackTime;
            }
            
            return [challengerScore, challengeeScore];
        } catch (error) {
            console.error('Error getting challenger scores:', error);
            return [{ value: 0, formattedScore: 'Error retrieving score' }, { value: 0, formattedScore: 'Error retrieving score' }];
        }
    }

    // Helper method to get a participant's score from the leaderboard
    async getParticipantScore(challenge, participantUsername) {
        try {
            // Fetch leaderboard entries
            const batch1 = await retroAPI.getLeaderboardEntriesDirect(challenge.leaderboardId, 0, 500);
            const batch2 = await retroAPI.getLeaderboardEntriesDirect(challenge.leaderboardId, 500, 500);
            
            // Combine the batches
            let rawEntries = [];
            
            // Process batches similar to fetchLeaderboardPositions
            if (batch1) {
                if (Array.isArray(batch1)) {
                    rawEntries = [...rawEntries, ...batch1];
                } else if (batch1.Results && Array.isArray(batch1.Results)) {
                    rawEntries = [...rawEntries, ...batch1.Results];
                }
            }
            
            if (batch2) {
                if (Array.isArray(batch2)) {
                    rawEntries = [...rawEntries, ...batch2];
                } else if (batch2.Results && Array.isArray(batch2.Results)) {
                    rawEntries = [...rawEntries, ...batch2.Results];
                }
            }
            
            // Process the entries with appropriate handling for different formats
            const leaderboardEntries = rawEntries.map(entry => {
                // Standard properties that most entries have
                const user = entry.User || entry.user || '';
                const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                const rank = entry.Rank || entry.rank || 0;
                
                return {
                    ApiRank: parseInt(rank, 10),
                    User: user.trim(),
                    RawScore: score,
                    FormattedScore: formattedScore.toString().trim() || score.toString(),
                    Value: parseFloat(score) || 0
                };
            });
            
            // Find entry for this participant
            const participantEntry = leaderboardEntries.find(entry => 
                entry.User.toLowerCase() === participantUsername.toLowerCase()
            );
            
            // Format the score
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

    async checkCompletedChallenges() {
        try {
            // Find challenges that have ended but haven't been marked as completed
            const now = new Date();
            const endedChallenges = await ArenaChallenge.find({
                status: 'active',
                endDate: { $lte: now }
            });
            
            if (endedChallenges.length === 0) {
                return;
            }
            
            console.log(`Processing ${endedChallenges.length} completed arena challenges`);
            
            // Process each ended challenge
            for (const challenge of endedChallenges) {
                await this.processCompletedChallenge(challenge);
                
                // Add a small delay between processing
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Error checking completed challenges:', error);
        }
    }

    async processCompletedChallenge(challenge) {
        try {
            // For open challenges with multiple participants
            if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                // Get scores for all participants
                const participantScores = new Map();
                
                // Get challenger (creator) score
                const [challengerScore, _] = await this.getChallengersScores(challenge);
                
                // Add challenger to scores map
                participantScores.set(challenge.challengerUsername.toLowerCase(), {
                    exists: challengerScore.value > 0,
                    formattedScore: challengerScore.formattedScore,
                    value: challengerScore.value
                });
                
                // Store the challenger score
                challenge.challengerScore = challengerScore.formattedScore;
                
                // Get scores for each participant
                for (const participant of challenge.participants) {
                    try {
                        // Fetch the participant's leaderboard entry
                        const entry = await this.getParticipantScore(challenge, participant.username);
                        participantScores.set(participant.username.toLowerCase(), entry);
                        
                        // Update the participant's score in the challenge
                        participant.score = entry.formattedScore;
                    } catch (scoreError) {
                        console.error(`Error getting score for participant ${participant.username}:`, scoreError);
                        // Default score if not found
                        participantScores.set(participant.username.toLowerCase(), {
                            exists: false,
                            formattedScore: 'No score',
                            value: 0
                        });
                    }
                }
                
                // Determine winner (highest score/lowest time)
                let winnerId = null;
                let winnerUsername = 'No Winner';
                let bestScore = null;
                
                // Check if it's a time-based challenge (lower is better)
                const isTimeBased = 
                    challenge.gameTitle.toLowerCase().includes('racing') || 
                    challengerScore.formattedScore.includes(':');
                
                // Start with the creator as potential winner
                if (challengerScore.value !== 0) {
                    winnerId = challenge.challengerId;
                    winnerUsername = challenge.challengerUsername;
                    bestScore = challengerScore.value;
                }
                
                // Check each participant
                for (const participant of challenge.participants) {
                    const participantScore = participantScores.get(participant.username.toLowerCase());
                    if (!participantScore || participantScore.value === 0) continue;
                    
                    if (bestScore === null || 
                        (isTimeBased && participantScore.value < bestScore) || 
                        (!isTimeBased && participantScore.value > bestScore)) {
                        winnerId = participant.userId;
                        winnerUsername = participant.username;
                        bestScore = participantScore.value;
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
                
                // Process bet payouts based on winner
                await this.processBetsForOpenChallenge(challenge, winnerId, winnerUsername);
                
                // Notify about the completed challenge
                await this.notifyChallengeUpdate(challenge);
                
                // Update the feed message
                await this.updateCompletedFeed(challenge);
                
                console.log(`Processed completed open challenge ${challenge._id}: ${winnerUsername} won`);
            } 
            else {
                // Original code for regular 1v1 challenges
                
                // Get final scores
                const [challengerScore, challengeeScore] = await this.getChallengersScores(challenge);
                
                // Determine the winner
                let winnerId, winnerUsername, loserId, loserUsername;
                
                if (challengerScore.value > challengeeScore.value) {
                    winnerId = challenge.challengerId;
                    winnerUsername = challenge.challengerUsername;
                    loserId = challenge.challengeeId;
                    loserUsername = challenge.challengeeUsername;
                } else if (challengeeScore.value > challengerScore.value) {
                    winnerId = challenge.challengeeId;
                    winnerUsername = challenge.challengeeUsername;
                    loserId = challenge.challengerId;
                    loserUsername = challenge.challengerUsername;
                } else {
                    // It's a tie - no winner
                    winnerId = null;
                    winnerUsername = 'Tie';
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
                
                // Update the feed message
                await this.updateCompletedFeed(challenge);
                
                console.log(`Processed completed challenge ${challenge._id}: ${winnerUsername} won`);
            }
        } catch (error) {
            console.error(`Error processing completed challenge ${challenge._id}:`, error);
        }
    }

    // Method to Handle Bets on Open Challenges
    async processBetsForOpenChallenge(challenge, winnerId, winnerUsername) {
        // Skip if no bets were placed
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
                
                // Add payout to user with tracking
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
        
        // Store the house contribution in the challenge for records
        challenge.houseContribution = totalHouseContribution;
        
        // Save the challenge with updated bet info
        await challenge.save();
    }

    async processPayouts(challenge, winnerId, winnerUsername) {
        try {
            // Skip payouts if it's a tie
            if (!winnerId) {
                console.log(`Challenge ${challenge._id} ended in a tie - no payouts processed`);
                return;
            }
            
            // Get the users
            const challenger = await User.findOne({ discordId: challenge.challengerId });
            const challengee = await User.findOne({ discordId: challenge.challengeeId });
            
            if (!challenger || !challengee) {
                console.error(`Could not find users for challenge ${challenge._id}`);
                return;
            }
            
            // Transfer wager amount from loser to winner
            if (winnerId === challenge.challengerId) {
                // Challenger won
                await this.trackGpTransaction(
                    challenger,
                    challenge.wagerAmount,
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
                    challenge.wagerAmount,
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
            
            // Process bets - UPDATED FOR POT BETTING SYSTEM
            if (challenge.bets && challenge.bets.length > 0) {
                // Separate winning and losing bets
                const winningBets = challenge.bets.filter(bet => bet.targetPlayer === winnerUsername);
                const losingBets = challenge.bets.filter(bet => bet.targetPlayer !== winnerUsername);
                
                // Calculate total bet amounts
                const totalWinningBetsAmount = winningBets.reduce((total, bet) => total + bet.betAmount, 0);
                const totalLosingBetsAmount = losingBets.reduce((total, bet) => total + bet.betAmount, 0);
                
                // Track total house contribution
                let totalHouseContribution = 0;
                
                // Process winning bets - use pot betting system
                for (const bet of winningBets) {
                    try {
                        // Find the user who placed the bet
                        const bettor = await User.findOne({ discordId: bet.userId });
                        
                        if (bettor) {
                            let payoutAmount = bet.betAmount; // Start with getting the original bet back
                            let houseContribution = 0;
                            
                            // If there are no losing bets (or no other bets at all), apply 50% house guarantee
                            if (totalLosingBetsAmount === 0) {
                                // Calculate 50% profit guarantee
                                houseContribution = Math.floor(bet.betAmount * 0.5);
                                payoutAmount += houseContribution;
                            } 
                            // Otherwise, distribute losing bets proportionally
                            else {
                                // Calculate share of the losing bets based on proportion of winning bets
                                const proportion = bet.betAmount / totalWinningBetsAmount;
                                const shareOfLosingBets = Math.floor(totalLosingBetsAmount * proportion);
                                payoutAmount += shareOfLosingBets;
                            }
                            
                            // Track total house contribution
                            totalHouseContribution += houseContribution;
                            
                            // Add payout to user with tracking
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
                            
                            // Save user with updated GP
                            await bettor.save();
                            
                            console.log(`Paid ${payoutAmount} GP to ${bettor.raUsername} for winning bet (House contributed: ${houseContribution} GP)`);
                        }
                    } catch (betError) {
                        console.error(`Error processing winning bet for user ${bet.userId}:`, betError);
                    }
                }
                
                // Log the total house contribution
                console.log(`Total house contribution for challenge ${challenge._id}: ${totalHouseContribution} GP`);
                
                // Store the house contribution in the challenge for records
                challenge.houseContribution = totalHouseContribution;
            }
            
            // Save the challenge with updated bet info
            await challenge.save();
        } catch (error) {
            console.error(`Error processing payouts for challenge ${challenge._id}:`, error);
        }
    }

    async updateCompletedFeed(challenge) {
        try {
            const feedChannel = await this.getArenaFeedChannel();
            if (!feedChannel) return;
            
            if (!challenge.messageId) {
                console.log(`No message ID found for completed challenge ${challenge._id}`);
                return;
            }
            
            // Try to fetch the message
            try {
                const message = await feedChannel.messages.fetch(challenge.messageId);
                
                // Calculate days from hours for display
                const durationDays = Math.floor(challenge.durationHours / 24);
                
                // Create a completed challenge embed
                const embed = new EmbedBuilder()
                    .setColor('#27AE60');
                
                // Handle open challenges differently
                if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                    // Set title for open challenge
                    embed.setTitle(`🏁 Completed Open Challenge: ${challenge.gameTitle}`);
                    embed.setDescription(`**Creator:** ${challenge.challengerUsername}`);
                    
                    // Add description if available
                    if (challenge.description) {
                        embed.addFields({ name: 'Description', value: challenge.description });
                    }
                    
                    // Calculate participant count and total pot
                    const participantCount = challenge.participants.length + 1; // +1 for creator
                    const wagerPool = challenge.wagerAmount * participantCount;
                    
                    // Add challenge details
                    embed.addFields({
                        name: 'Challenge Details',
                        value: `**Wager:** ${challenge.wagerAmount} GP per player\n` +
                            `**Total Participants:** ${participantCount}\n` +
                            `**Duration:** ${durationDays} days\n` +
                            `**Started:** ${challenge.startDate.toLocaleString()}\n` +
                            `**Ended:** ${challenge.endDate.toLocaleString()}\n\n` +
                            `**Result:** ${challenge.winnerUsername === 'Tie' || !challenge.winnerUsername ? 
                                'No clear winner determined.' : 
                                `${challenge.winnerUsername} won!`}`
                    });
                    
                    // Add thumbnail if available
                    if (challenge.iconUrl) {
                        embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
                    }
                    
                    // Add final scores for all participants
                    let scoresText = `**${challenge.challengerUsername}** (Creator): ${challenge.challengerScore || 'No score'}\n`;
                    
                    challenge.participants.forEach(participant => {
                        scoresText += `**${participant.username}**: ${participant.score || 'No score'}\n`;
                    });
                    
                    embed.addFields({
                        name: '📊 Final Scores',
                        value: scoresText
                    });
                    
                    // Add betting results for open challenges
                    if (challenge.bets && challenge.bets.length > 0) {
                        if (challenge.winnerUsername && challenge.winnerUsername !== 'Tie' && challenge.winnerUsername !== 'No Winner') {
                            // Get winning bets
                            const winningBets = challenge.bets.filter(bet => bet.targetPlayer === challenge.winnerUsername);
                            const losingBets = challenge.bets.filter(bet => bet.targetPlayer !== challenge.winnerUsername);
                            
                            // Calculate total amounts
                            const totalWinningBetsAmount = winningBets.reduce((total, bet) => total + bet.betAmount, 0);
                            const totalLosingBetsAmount = losingBets.reduce((total, bet) => total + bet.betAmount, 0);
                            
                            // Show house contribution if any
                            const houseContribution = challenge.houseContribution || 0;
                            
                            // Create betting results text
                            let bettingText = `**Total Bets:** ${challenge.bets.length} (${challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0)} GP)\n` +
                                            `**Winning Bets:** ${winningBets.length} bets totaling ${totalWinningBetsAmount} GP\n` +
                                            `**Losing Bets:** ${losingBets.length} bets totaling ${totalLosingBetsAmount} GP\n`;
                            
                            if (houseContribution > 0) {
                                bettingText += `**House Contribution:** ${houseContribution} GP (50% profit for sole bettors)\n`;
                            }
                            
                            bettingText += '\n';
                            
                            // List top bet winners
                            if (winningBets.length > 0) {
                                bettingText += '**Top Bet Winners:**\n';
                                
                                // Sort by payout amount (highest first)
                                const sortedBets = [...winningBets]
                                    .sort((a, b) => (b.payout || 0) - (a.payout || 0));
                                
                                // Show top 3 or fewer
                                const topBets = sortedBets.slice(0, 3);
                                topBets.forEach((bet, index) => {
                                    // Use the saved payout amount
                                    const payoutAmount = bet.payout || 0;
                                    const profit = payoutAmount - bet.betAmount;
                                    
                                    bettingText += `${index + 1}. ${bet.raUsername}: Bet ${bet.betAmount} GP, won ${payoutAmount} GP (profit: ${profit} GP)\n`;
                                });
                            } else {
                                bettingText += 'No winning bets were placed.';
                            }
                            
                            embed.addFields({
                                name: '💰 Betting Results',
                                value: bettingText
                            });
                        } else {
                            // For ties or no winner, just show basic bet info
                            embed.addFields({
                                name: '💰 Betting Results',
                                value: `Since there was no clear winner, all ${challenge.bets.length} bets (${challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0)} GP) were returned to their owners.`
                            });
                        }
                    }
                } else {
                    // Regular 1v1 challenge completion (existing code)
                    embed.setTitle(`🏁 Completed Challenge: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`);
                    embed.setDescription(`**Game:** ${challenge.gameTitle}`);
                    
                    // Add description if available
                    if (challenge.description) {
                        embed.addFields({ name: 'Description', value: challenge.description });
                    }
                    
                    // Add challenge details
                    embed.addFields({
                        name: 'Challenge Details',
                        value: `**Wager:** ${challenge.wagerAmount} GP each\n` +
                            `**Duration:** ${durationDays} days\n` +
                            `**Started:** ${challenge.startDate.toLocaleString()}\n` +
                            `**Ended:** ${challenge.endDate.toLocaleString()}\n\n` +
                            `**Result:** ${challenge.winnerUsername === 'Tie' ? 'The challenge ended in a tie!' : `${challenge.winnerUsername} won!`}`
                    });
                    
                    // Add thumbnail if available
                    if (challenge.iconUrl) {
                        embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
                    }
                    
                    // Add final scores
                    embed.addFields({
                        name: '📊 Final Scores',
                        value: 
                            `**${challenge.challengerUsername}:** ${challenge.challengerScore}\n` +
                            `**${challenge.challengeeUsername}:** ${challenge.challengeeScore}`
                    });
                    
                    // Add betting results
                    if (challenge.bets && challenge.bets.length > 0) {
                        if (challenge.winnerUsername !== 'Tie') {
                            // Get winning bets
                            const winningBets = challenge.bets.filter(bet => bet.targetPlayer === challenge.winnerUsername);
                            const losingBets = challenge.bets.filter(bet => bet.targetPlayer !== challenge.winnerUsername);
                            
                            // Calculate total amounts
                            const totalWinningBetsAmount = winningBets.reduce((total, bet) => total + bet.betAmount, 0);
                            const totalLosingBetsAmount = losingBets.reduce((total, bet) => total + bet.betAmount, 0);
                            
                            // Show house contribution if any
                            const houseContribution = challenge.houseContribution || 0;
                            
                            // Create betting results text
                            let bettingText = `**Total Bets:** ${challenge.bets.length} (${challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0)} GP)\n` +
                                            `**Winning Bets:** ${winningBets.length} bets totaling ${totalWinningBetsAmount} GP\n` +
                                            `**Losing Bets:** ${losingBets.length} bets totaling ${totalLosingBetsAmount} GP\n`;
                            
                            if (houseContribution > 0) {
                                bettingText += `**House Contribution:** ${houseContribution} GP (50% profit for sole bettors)\n`;
                            }
                            
                            bettingText += '\n';
                            
                            // List top bet winners
                            if (winningBets.length > 0) {
                                bettingText += '**Top Bet Winners:**\n';
                                
                                // Sort by payout amount (highest first)
                                const sortedBets = [...winningBets]
                                    .sort((a, b) => (b.payout || 0) - (a.payout || 0));
                                
                                // Show top 3 or fewer
                                const topBets = sortedBets.slice(0, 3);
                                topBets.forEach((bet, index) => {
                                    // Use the saved payout amount
                                    const payoutAmount = bet.payout || 0;
                                    const profit = payoutAmount - bet.betAmount;
                                    
                                    bettingText += `${index + 1}. ${bet.raUsername}: Bet ${bet.betAmount} GP, won ${payoutAmount} GP (profit: ${profit} GP)\n`;
                                });
                            } else {
                                bettingText += 'No winning bets were placed.';
                            }
                            
                            embed.addFields({
                                name: '💰 Betting Results',
                                value: bettingText
                            });
                        } else {
                            // For ties, just show basic bet info
                            embed.addFields({
                                name: '💰 Betting Results',
                                value: `Since the challenge ended in a tie, all ${challenge.bets.length} bets (${challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0)} GP) were returned to their owners.`
                            });
                        }
                    }
                }
                
                embed.setTimestamp();
                
                // Update the message
                await message.edit({ embeds: [embed], components: [] });
                console.log(`Updated feed message for completed challenge ${challenge._id}`);
            } catch (error) {
                console.error(`Error updating feed message for completed challenge ${challenge._id}:`, error);
                
                // Remove message ID if not found
                if (error.message.includes('Unknown Message')) {
                    challenge.messageId = null;
                    await challenge.save();
                }
            }
        } catch (error) {
            console.error(`Error updating completed feed for challenge ${challenge._id}:`, error);
        }
    }

    /**
     * Utility method to track GP changes with detailed logging
     * @param {Object} user - User document from database
     * @param {Number} amount - Amount of GP to add (positive) or deduct (negative)
     * @param {String} reason - Description of why GP is being added/deducted
     * @param {String} context - Additional context (e.g., challengeId)
     * @returns {Promise<boolean>} - Success or failure
     */
    async trackGpTransaction(user, amount, reason, context = '') {
        try {
            if (!user || !user.discordId) {
                console.error(`[ARENA] Cannot track GP transaction: Invalid user`, { amount, reason, context });
                return false;
            }

            // Ensure we're working with fresh data
            const freshUser = await User.findOne({ discordId: user.discordId });
            if (!freshUser) {
                console.error(`[ARENA] Cannot track GP transaction: User not found`, { 
                    userId: user.discordId, 
                    amount, 
                    reason, 
                    context 
                });
                return false;
            }

            // Record previous balance
            const oldBalance = freshUser.gp || 0;
            
            // Update GP
            freshUser.gp = oldBalance + amount;
            
            // Add to transaction history if it doesn't exist
            if (!freshUser.gpTransactions) {
                freshUser.gpTransactions = [];
            }
            
            // Add transaction record
            freshUser.gpTransactions.push({
                amount,
                oldBalance,
                newBalance: freshUser.gp,
                reason,
                context,
                timestamp: new Date()
            });
            
            // Keep only the last 10 transactions to prevent document size issues
            if (freshUser.gpTransactions.length > 10) {
                freshUser.gpTransactions = freshUser.gpTransactions.slice(-10);
            }
            
            // Save changes
            await freshUser.save();
            
            // Log the transaction
            console.log(`[ARENA] GP Transaction: ${amount > 0 ? '+' : ''}${amount} GP to ${freshUser.raUsername} (${reason}) - Old: ${oldBalance} GP, New: ${freshUser.gp} GP ${context ? '| ' + context : ''}`);
            
            // Update the original user object
            user.gp = freshUser.gp;
            
            return true;
        } catch (error) {
            console.error(`[ARENA] Error tracking GP transaction:`, error, { 
                userId: user?.discordId, 
                username: user?.raUsername,
                amount, 
                reason, 
                context 
            });
            return false;
        }
    }

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
}

// Create singleton instance
const arenaService = new ArenaService();
export default arenaService;
