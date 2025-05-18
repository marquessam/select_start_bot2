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
                .setColor('#3498DB')
                .setDescription(
                    `**${challenge.challengerUsername}** has challenged **${challenge.challengeeUsername}** to a competition!\n\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Wager:** ${challenge.wagerAmount} GP each\n` +
                    `**Duration:** ${Math.floor(challenge.durationHours / 24)} days\n\n` +
                    `${challenge.challengeeUsername} can use \`/arena\` to view and respond to this challenge.`
                )
                .setTimestamp();
            
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
            
            switch (challenge.status) {
                case 'active':
                    title = '🏟️ Arena Challenge Accepted!';
                    description = 
                        `**${challenge.challengeeUsername}** has accepted the challenge from **${challenge.challengerUsername}**!\n\n` +
                        `**Game:** ${challenge.gameTitle}\n` +
                        `**Wager:** ${challenge.wagerAmount} GP each\n` +
                        `**Duration:** ${durationDays} days\n` +
                        `**Ends:** ${challenge.endDate.toLocaleString()}\n\n` +
                        `The challenge has begun! Watch the leaderboard updates in <#${this.arenaFeedChannelId}>.\n` +
                        `Want to bet on the outcome? Use \`/arena\` and select "Place a Bet"!`;
                    color = '#2ECC71';
                    break;
                case 'declined':
                    title = '🏟️ Arena Challenge Declined';
                    description = 
                        `**${challenge.challengeeUsername}** has declined the challenge from **${challenge.challengerUsername}**.\n\n` +
                        `**Game:** ${challenge.gameTitle}\n` +
                        `**Wager:** ${challenge.wagerAmount} GP`;
                    color = '#E74C3C';
                    break;
                case 'cancelled':
                    title = '🏟️ Arena Challenge Cancelled';
                    description = 
                        `The challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}** has been cancelled.\n\n` +
                        `**Game:** ${challenge.gameTitle}\n` +
                        `**Wager:** ${challenge.wagerAmount} GP`;
                    color = '#95A5A6';
                    break;
                case 'completed':
                    title = '🏟️ Arena Challenge Completed!';
                    description = 
                        `The challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}** has ended!\n\n` +
                        `**Game:** ${challenge.gameTitle}\n` +
                        `**Winner:** ${challenge.winnerUsername}\n` +
                        `**Wager:** ${challenge.wagerAmount} GP each\n` +
                        `**Final Scores:**\n` +
                        `• ${challenge.challengerUsername}: ${challenge.challengerScore}\n` +
                        `• ${challenge.challengeeUsername}: ${challenge.challengeeScore}\n\n` +
                        `Congratulations to the winner! All bets have been paid out.`;
                    color = '#F1C40F';
                    break;
                default:
                    return; // Don't notify for other statuses
            }
            
            // Create an embed for the update
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor(color)
                .setDescription(description)
                .setTimestamp();
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
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
                
                // Send the notification with button
                const message = await channel.send({ 
                    embeds: [embed],
                    components: components,
                    content: `<@&${config.discord.memberRoleId || '1234567890'}> A new Arena challenge has begun!`
                });
                
                // Add a followup message explaining how to bet
                await channel.send({
                    content: 'To place a bet, use the `/arena` command and select "Place a Bet". You can bet on either player to win!',
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
                    `There's been a change in the leaderboard for the active challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}**!\n\n` +
                    `**Game:** [${challenge.gameTitle}](${leaderboardUrl})\n\n` +
                    `**${changedPosition.newLeader}** has overtaken **${changedPosition.previousLeader}**!\n` +
                    `Current scores:\n` +
                    `• **${challenge.challengerUsername}**: ${challenge.challengerScore}\n` +
                    `• **${challenge.challengeeUsername}**: ${challenge.challengeeScore}\n\n` +
                    `Follow the challenge in <#${this.arenaFeedChannelId}>!`
                )
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

    createChallengeEmbed(challenge, challengerScore, challengeeScore) {
        // Calculate time remaining
        const now = new Date();
        const timeRemaining = this.formatTimeRemaining(challenge.endDate);
        
        // Determine who's winning
        let winningText = 'The challenge is tied!';
        let winningUser = null;
        
        if (challengerScore.value > challengeeScore.value) {
            winningText = `${challenge.challengerUsername} is in the lead!`;
            winningUser = challenge.challengerUsername;
        } else if (challengeeScore.value > challengerScore.value) {
            winningText = `${challenge.challengeeUsername} is in the lead!`;
            winningUser = challenge.challengeeUsername;
        }
        
        // Calculate bet distribution
        const totalBets = challenge.bets.length;
        let challengerBets = 0;
        let challengeeBets = 0;
        let challengerBetAmount = 0;
        let challengeeBetAmount = 0;
        
        challenge.bets.forEach(bet => {
            if (bet.targetPlayer === challenge.challengerUsername) {
                challengerBets++;
                challengerBetAmount += bet.betAmount;
            } else if (bet.targetPlayer === challenge.challengeeUsername) {
                challengeeBets++;
                challengeeBetAmount += bet.betAmount;
            }
        });
        
        // Calculate total pot (wagers + bets)
        const wagerPool = challenge.wagerAmount * 2;
        const betPool = challengerBetAmount + challengeeBetAmount;
        const totalPool = wagerPool + betPool;
        
        // Calculate days from hours for display
        const durationDays = Math.floor(challenge.durationHours / 24);
        
        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle(`🏟️ Arena Challenge: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`)
            .setColor(challenge.endDate > now ? '#3498DB' : '#E74C3C')
            .setDescription(
                `**Game:** ${challenge.gameTitle}\n` +
                `**Wager:** ${challenge.wagerAmount} GP each\n` +
                `**Duration:** ${durationDays} days\n` +
                `**Started:** ${challenge.startDate.toLocaleString()}\n` +
                `**Ends:** ${challenge.endDate.toLocaleString()} (${timeRemaining})\n\n` +
                `**Current Status:** ${winningText}`
            )
            .setTimestamp();
        
        // Add thumbnail if available
        if (challenge.iconUrl) {
            embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
        }
        
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
                `Use \`/arena\` and select "Place a Bet" to bet on the outcome!`
        });
        
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
            
            // Get current Unix timestamp for Discord formatting
            const unixTimestamp = Math.floor(Date.now() / 1000);
            
            // Create header content
            const headerContent = 
                `# 🏟️ The Arena - Active Challenges\n` +
                `Currently there ${activeCount === 1 ? 'is' : 'are'} **${activeCount}** active challenge${activeCount === 1 ? '' : 's'} in the Arena.\n` +
                `**Last Updated:** <t:${unixTimestamp}:f> | **Updates:** Every hour\n` +
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
            
            // Create an embed for the leaderboard
            const embed = new EmbedBuilder()
                .setTitle('💰 GP Leaderboard')
                .setColor('#FFD700')
                .setDescription(
                    'These are the users with the most GP (Gold Points).\n' +
                    'Earn GP by winning Arena challenges and bets. Everyone receives 1,000 GP automatically each month.'
                )
                .setFooter({ 
                    text: 'The user with the most GP at the end of the year will receive a special title and award points!' 
                });
            
            let leaderboardText = '';
            
            topUsers.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} **${user.raUsername}**: ${user.gp} GP\n`;
                
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
        } catch (error) {
            console.error(`Error processing completed challenge ${challenge._id}:`, error);
        }
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
            challenger.gp = (challenger.gp || 0) + challenge.wagerAmount;
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
            challengee.gp = (challengee.gp || 0) + challenge.wagerAmount;
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
            // Calculate total bet amount
            const totalBets = challenge.bets.reduce((total, bet) => total + bet.betAmount, 0);
            
            // Get winning bets (bets placed on the winner)
            const winningBets = challenge.bets.filter(bet => bet.targetPlayer === winnerUsername);
            const totalWinningBets = winningBets.reduce((total, bet) => total + bet.betAmount, 0);
            
            // Track total house contribution
            let totalHouseContribution = 0;
            
            if (winningBets.length > 0 && totalWinningBets > 0) {
                // Process each winning bet
                for (const bet of winningBets) {
                    try {
                        // Find the user who placed the bet
                        const bettor = await User.findOne({ discordId: bet.userId });
                        
                        if (bettor) {
                            // Calculate standard payout ratio based on bet amount relative to total winning bets
                            const payoutRatio = bet.betAmount / totalWinningBets;
                            
                            // Calculate standard payout amount from the betting pool
                            const standardPayout = Math.floor(totalBets * payoutRatio);
                            
                            // Calculate guaranteed minimum payout (original bet + equal profit, up to 500 GP house match)
                            const guaranteedProfit = Math.min(bet.betAmount, 500);
                            const guaranteedPayout = bet.betAmount + guaranteedProfit;
                            
                            // Determine how much the house needs to contribute (if any)
                            let houseContribution = Math.max(0, guaranteedPayout - standardPayout);
                            
                            // Calculate final payout (including house contribution)
                            const payoutAmount = standardPayout + houseContribution;
                            
                            // Track total house contribution
                            totalHouseContribution += houseContribution;
                            
                            // Add payout to user
                            bettor.gp = (bettor.gp || 0) + payoutAmount;
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
            } else {
                console.log(`No winning bets for challenge ${challenge._id}`);
            }
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
                    .setTitle(`🏁 Completed Challenge: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`)
                    .setColor('#27AE60')
                    .setDescription(
                        `**Game:** ${challenge.gameTitle}\n` +
                        `**Wager:** ${challenge.wagerAmount} GP each\n` +
                        `**Duration:** ${durationDays} days\n` +
                        `**Started:** ${challenge.startDate.toLocaleString()}\n` +
                        `**Ended:** ${challenge.endDate.toLocaleString()}\n\n` +
                        `**Result:** ${challenge.winnerUsername === 'Tie' ? 'The challenge ended in a tie!' : `${challenge.winnerUsername} won!`}`
                    )
                    .setTimestamp();
                
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
                    // Calculate total bet amount
                    const totalBets = challenge.bets.reduce((total, bet) => total + bet.betAmount, 0);
                    
                    if (challenge.winnerUsername !== 'Tie') {
                        // Get winning bets (bets placed on the winner)
                        const winningBets = challenge.bets.filter(bet => bet.targetPlayer === challenge.winnerUsername);
                        const totalWinningBets = winningBets.reduce((total, bet) => total + bet.betAmount, 0);
                        
                        // Create betting results text
                        let bettingText = `**Total Betting Pool:** ${totalBets} GP\n` +
                                         `**Number of Bets:** ${challenge.bets.length} total bets\n` +
                                         `**Winning Bets:** ${winningBets.length} bets totaling ${totalWinningBets} GP\n\n`;
                        
                        // List top bet winners
                        if (winningBets.length > 0) {
                            bettingText += '**Top Bet Winners:**\n';
                            
                            // Sort by bet amount (highest first)
                            const sortedBets = [...winningBets].sort((a, b) => b.betAmount - a.betAmount);
                            
                            // Show top 3 or fewer
                            const topBets = sortedBets.slice(0, 3);
                            topBets.forEach((bet, index) => {
                                const payoutRatio = bet.betAmount / totalWinningBets;
                                const payoutAmount = Math.floor(totalBets * payoutRatio);
                                
                                bettingText += `${index + 1}. ${bet.raUsername}: Bet ${bet.betAmount} GP, won ${payoutAmount} GP\n`;
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
                            value: `Since the challenge ended in a tie, all ${challenge.bets.length} bets (${totalBets} GP) were returned to their owners.`
                        });
                    }
                }
                
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
