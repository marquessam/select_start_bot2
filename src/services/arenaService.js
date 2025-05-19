// src/services/arenaService.js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { config } from '../config/config.js';
import { 
    formatTimeRemaining, getLeaderboardEntries, processLeaderboardEntries, 
    isTimeBasedLeaderboard, createChallengeEmbed, checkPositionChanges 
} from '../utils/arenaUtils.js';

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

    // Get Discord channels
    async getArenaChannel() {
        if (!this.client) return null;

        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) return null;
            
            return await guild.channels.fetch(this.arenaChannelId);
        } catch (error) {
            console.error('Error getting arena channel:', error);
            return null;
        }
    }

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
            
            // Fetch messages in batches (Discord API limitation)
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
            this.headerMessageId = null;
            this.gpLeaderboardMessageId = null;
            
            return true;
        } catch (error) {
            console.error('Error clearing arena feed channel:', error);
            return false;
        }
    }

    // Notification methods
    async notifyNewChallenge(challenge) {
        try {
            const channel = await this.getArenaChannel();
            if (!channel) return;
            
            // Create an embed for the new challenge
            const embed = new EmbedBuilder()
                .setTitle('🏟️ New Arena Challenge Issued!')
                .setColor('#3498DB');
            
            // Set description based on challenge type
            if (challenge.isOpenChallenge) {
                embed.setDescription(
                    `**${challenge.challengerUsername}** has created an open challenge for anyone to join!`
                );
            } else {
                embed.setDescription(
                    `**${challenge.challengerUsername}** has challenged **${challenge.challengeeUsername}** to a competition!`
                );
            }
            
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
            
            embed.setTimestamp();
            
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
            
            // Set title, description, and color based on challenge status
            if (challenge.isOpenChallenge) {
                switch(challenge.status) {
                    case 'active':
                        title = '🏟️ Open Arena Challenge Started!';
                        description = `The open challenge created by **${challenge.challengerUsername}** has begun!`;
                        color = '#2ECC71';
                        break;
                    case 'cancelled':
                        title = '🏟️ Open Arena Challenge Cancelled';
                        description = `The open challenge created by **${challenge.challengerUsername}** has been cancelled.`;
                        color = '#95A5A6';
                        break;
                    case 'completed':
                        title = '🏟️ Open Arena Challenge Completed!';
                        description = `The open challenge created by **${challenge.challengerUsername}** has ended!`;
                        color = '#F1C40F';
                        break;
                    default:
                        return; // Don't notify for other statuses
                }
            } else {
                switch(challenge.status) {
                    case 'active':
                        title = '🏟️ Arena Challenge Accepted!';
                        description = `**${challenge.challengeeUsername}** has accepted the challenge from **${challenge.challengerUsername}**!`;
                        color = '#2ECC71';
                        break;
                    case 'declined':
                        title = '🏟️ Arena Challenge Declined';
                        description = `**${challenge.challengeeUsername}** has declined the challenge from **${challenge.challengerUsername}**.`;
                        color = '#E74C3C';
                        break;
                    case 'cancelled':
                        title = '🏟️ Arena Challenge Cancelled';
                        description = `The challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}** has been cancelled.`;
                        color = '#95A5A6';
                        break;
                    case 'completed':
                        title = '🏟️ Arena Challenge Completed!';
                        description = `The challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}** has ended!`;
                        color = '#F1C40F';
                        break;
                    default:
                        return; // Don't notify for other statuses
                }
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor(color)
                .setDescription(description)
                .addFields({ name: 'Game', value: challenge.gameTitle, inline: false });
                
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
                
                // Send with button and follow-up instructions
                const message = await channel.send({ 
                    embeds: [embed],
                    components: [buttonsRow],
                    content: `A new Arena challenge has begun!`
                });
                
                await channel.send({
                    content: 'To place a bet, use the `/arena` command and select "Place a Bet". Pot Betting System: Your bet joins the total prize pool. If your chosen player wins, you get your bet back plus a share of the losing bets proportional to your bet amount!',
                    reply: { messageReference: message.id }
                });
                
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
            }
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            embed.setTimestamp();
            
            // Send notification without button for non-active statuses
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending challenge update notification:', error);
        }
    }
    
    async notifyParticipantJoined(challenge, participantUsername) {
        try {
            const channel = await this.getArenaChannel();
            if (!channel) return;
            
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
            
            const embed = new EmbedBuilder()
                .setTitle('🏟️ Arena Standings Update!')
                .setColor('#9B59B6')
                .setDescription(
                    `There's been a change in the leaderboard for the active challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}**!`
                )
                .addFields(
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
            
            embed.setFooter({ text: `Follow the challenge in the arena feed channel!` })
                 .setTimestamp();
            
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending standings change notification:', error);
        }
    }
    
    // Arena feed updates
    async updateArenaFeeds() {
        try {
            // Update header and leaderboard
            await this.updateArenaHeader();
            await this.updateGpLeaderboard();
            
            // Update active challenge feeds
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: new Date() }
            });
            
            for (const challenge of activeChallengers) {
                await this.createOrUpdateArenaFeed(challenge);
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
            
            // Create embed for the challenge
            const embed = createChallengeEmbed(
                challenge, challengerScore, challengeeScore, 
                participantScores, EmbedBuilder
            );
            
            // Send or update the message
            const challengeId = challenge._id.toString();
            
            if (this.feedMessageIds.has(challengeId)) {
                try {
                    const messageId = this.feedMessageIds.get(challengeId);
                    const message = await feedChannel.messages.fetch(messageId);
                    await message.edit({ embeds: [embed] });
                } catch (error) {
                    if (error.message.includes('Unknown Message')) {
                        const message = await feedChannel.send({ embeds: [embed] });
                        this.feedMessageIds.set(challengeId, message.id);
                        challenge.messageId = message.id;
                        await challenge.save();
                    } else {
                        throw error;
                    }
                }
            } else {
                const message = await feedChannel.send({ embeds: [embed] });
                this.feedMessageIds.set(challengeId, message.id);
                challenge.messageId = message.id;
                await challenge.save();
            }
        } catch (error) {
            console.error('Error creating/updating arena feed:', error);
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
            
            // Create header content
            const unixTimestamp = Math.floor(Date.now() / 1000);
            let headerContent = 
                `# 🏟️ The Arena - Active Challenges\n` +
                `Currently there ${activeCount === 1 ? 'is' : 'are'} **${activeCount}** active challenge${activeCount === 1 ? '' : 's'} in the Arena.\n`;
                
            if (openCount > 0) {
                headerContent += `There ${openCount === 1 ? 'is' : 'are'} also **${openCount}** open challenge${openCount === 1 ? '' : 's'} awaiting participants.\n`;
            }
                
            headerContent += `**Last Updated:** <t:${unixTimestamp}:f> | **Updates:** Every hour\n` +
                `Use \`/arena\` to challenge others, place bets, or view your challenges`;
            
            // Update or create the header message
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

async updateGpLeaderboard() {
    try {
        const feedChannel = await this.getArenaFeedChannel();
        if (!feedChannel) return;
        
        // Get top users by GP
        const topUsers = await User.find({ gp: { $gt: 0 } })
            .sort({ gp: -1 })
            .limit(10);
        
        if (topUsers.length === 0) return;
        
        // Create leaderboard embed with exact timestamp
        const formattedDate = new Date().toLocaleString();
        
        const embed = new EmbedBuilder()
            .setTitle('💰 GP Leaderboard')
            .setColor('#FFD700')
            .setDescription(
                'These are the users with the most GP (Gold Points).\n' +
                'Earn GP by winning Arena challenges and bets. Everyone receives 1,000 GP automatically each month.\n\n' +
                `**Last Updated:** ${formattedDate}`
            )
            .setFooter({ 
                text: 'Updates hourly | Year-end champion receives a special title and award!' 
            });
        
        // Build leaderboard text with medals
        let leaderboardText = '';
        
        topUsers.forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            leaderboardText += `${medal} **${user.raUsername}**: ${user.gp.toLocaleString()} GP\n`;
            
            if (index === 2) {
                leaderboardText += '──────────────\n';
            }
        });
        
        embed.addFields({ name: 'Top 10 Rankings', value: leaderboardText });
        embed.addFields({ 
            name: 'Monthly Allowance', 
            value: 'You automatically receive 1,000 GP at the beginning of each month!' 
        });
        
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
            // Get leaderboard entries
            const rawEntries = await getLeaderboardEntries(challenge.leaderboardId);
            
            // Process entries based on whether this is a time-based leaderboard
            const isTimeBased = isTimeBasedLeaderboard(challenge);
            const leaderboardEntries = processLeaderboardEntries(rawEntries, isTimeBased);
            
            // Find challenger entry
            const challengerEntry = leaderboardEntries.find(entry => 
                entry.User.toLowerCase() === challenge.challengerUsername.toLowerCase()
            );
            
            // Find challengee entry
            const challengeeEntry = leaderboardEntries.find(entry => 
                entry.User.toLowerCase() === challenge.challengeeUsername.toLowerCase()
            );
            
            // Format challenger score - UPDATED to include ApiRank
            const challengerScore = {
                value: challengerEntry ? challengerEntry.Value : 0,
                formattedScore: challengerEntry ? challengerEntry.FormattedScore : 'No score yet',
                exists: !!challengerEntry,
                rank: challengerEntry ? challengerEntry.ApiRank : 0
            };
            
            // Format challengee score - UPDATED to include ApiRank
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
            // Get leaderboard entries
            const rawEntries = await getLeaderboardEntries(challenge.leaderboardId);
            
            // Process entries based on whether this is a time-based leaderboard
            const isTimeBased = isTimeBasedLeaderboard(challenge);
            const leaderboardEntries = processLeaderboardEntries(rawEntries, isTimeBased);
            
            // Find entry for this participant
            const participantEntry = leaderboardEntries.find(entry => 
                entry.User.toLowerCase() === participantUsername.toLowerCase()
            );
            
            // Format score - UPDATED to preserve ApiRank
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
                    formattedScore: 'No score',
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
                
                // Create a completed challenge embed
                const embed = new EmbedBuilder()
                    .setColor('#27AE60');
                
                // Handle open challenges differently
                if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                    this.createCompletedOpenChallengeEmbed(challenge, embed, durationDays);
                } else {
                    this.createCompletedDirectChallengeEmbed(challenge, embed, durationDays);
                }
                
                embed.setTimestamp();
                
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

    createCompletedOpenChallengeEmbed(challenge, embed, durationDays) {
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
        
        // Add betting results
        this.addBettingResultsToEmbed(challenge, embed);
    }

    createCompletedDirectChallengeEmbed(challenge, embed, durationDays) {
        // Regular 1v1 challenge completion
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
        this.addBettingResultsToEmbed(challenge, embed);
    }

    addBettingResultsToEmbed(challenge, embed) {
        if (!challenge.bets || challenge.bets.length === 0) return;
        
        if (challenge.winnerUsername && challenge.winnerUsername !== 'Tie' && challenge.winnerUsername !== 'No Winner') {
            // Get winning and losing bets
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
            // For ties or no winner
            embed.addFields({
                name: '💰 Betting Results',
                value: `Since there was no clear winner, all ${challenge.bets.length} bets (${challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0)} GP) were returned to their owners.`
            });
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

    // UI Methods
    async showActiveChallengesToUser(interaction) {
        await interaction.deferUpdate();
        
        try {
            // Get active challenges
            const activeChallengers = await ArenaChallenge.find({
                status: 'active',
                endDate: { $gt: new Date() }
            }).sort({ endDate: 1 }); // Sort by end date (earliest first)
            
            if (activeChallengers.length === 0) {
                return interaction.editReply('There are no active challenges right now.');
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('Active Arena Challenges')
                .setColor('#FF5722')
                .setDescription(
                    'These are the currently active challenges in the Arena.\n' +
                    'Use `/arena` and select "Place Bet" to bet on these challenges.\n\n' +
                    '**Pot Betting System:** Your bet joins the total prize pool. ' +
                    'If your chosen player wins, you get your bet back plus a share of the losing bets proportional to your bet amount.' +
                    '\n**Note:** Betting is only available during the first 72 hours of a challenge. Maximum bet: 100 GP.'
                )
                .setFooter({ text: 'All challenge updates are posted in the Arena channel' });
            
            // Add each active challenge
            activeChallengers.forEach((challenge, index) => {
                const timeRemaining = formatTimeRemaining(challenge.endDate);
                const now = new Date();
                const bettingOpen = (now - challenge.startDate) / (1000 * 60 * 60) <= 72;
                const bettingStatus = bettingOpen ? 'Open' : 'Closed';
                
                // Add leaderboard link
                const leaderboardLink = `[View Leaderboard](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
                
                if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                    // For open challenges with participants
                    const participantCount = challenge.participants.length + 1; // +1 for creator
                    const wagerPool = challenge.wagerAmount * participantCount;
                    const totalPool = (challenge.totalPool || 0) + wagerPool;
                    
                    // Create a list of participants
                    let participantsText = `${challenge.challengerUsername} (Creator)`;
                    challenge.participants.forEach((participant, pIndex) => {
                        if (pIndex < 3) { // Show max 3 participants directly
                            participantsText += `, ${participant.username}`;
                        }
                    });
                    
                    if (challenge.participants.length > 3) {
                        participantsText += ` and ${challenge.participants.length - 3} more`;
                    }
                    
                    embed.addFields({
                        name: `${index + 1}. ${challenge.gameTitle} (Open Challenge)`,
                        value: `**Creator:** ${challenge.challengerUsername}\n` +
                               (challenge.description ? `**Description:** ${challenge.description}\n` : '') +
                               `**Participants:** ${participantCount} (${participantsText})\n` +
                               `**Wager:** ${challenge.wagerAmount} GP per player\n` +
                               `**Total Pool:** ${totalPool} GP\n` +
                               `**Ends:** ${challenge.endDate.toLocaleDateString()} (${timeRemaining})\n` +
                               `**Betting:** ${bettingStatus} | **Bets:** ${challenge.bets?.length || 0}\n` +
                               `${leaderboardLink}`
                    });
                } else {
                    // For regular 1v1 challenges
                    embed.addFields({
                        name: `${index + 1}. ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`,
                        value: `**Game:** ${challenge.gameTitle}\n` +
                               (challenge.description ? `**Description:** ${challenge.description}\n` : '') +
                               `**Wager:** ${challenge.wagerAmount} GP each\n` +
                               `**Total Pool:** ${(challenge.totalPool || 0) + (challenge.wagerAmount * 2)} GP\n` +
                               `**Ends:** ${challenge.endDate.toLocaleDateString()} (${timeRemaining})\n` +
                               `**Betting:** ${bettingStatus} | **Bets:** ${challenge.bets?.length || 0}\n` +
                               `${leaderboardLink}`
                    });
                }
            });
            
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
                components: [backRow]
            });
        } catch (error) {
            console.error('Error showing active challenges:', error);
            await interaction.editReply('An error occurred while displaying active challenges.');
        }
    }

    async showGpLeaderboard(interaction) {
        await interaction.deferUpdate();
        
        try {
            // Get top users by GP
            const topUsers = await User.find({ gp: { $gt: 0 } })
                .sort({ gp: -1 })
                .limit(10);
            
            if (topUsers.length === 0) {
                return interaction.editReply('No users with GP found.');
            }
            
            // Create leaderboard embed
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
            
            // Build leaderboard text
            let leaderboardText = '';
            
            topUsers.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} **${user.raUsername}**: ${user.gp.toLocaleString()} GP\n`;
                
                if (index === 2) {
                    leaderboardText += '──────────────\n';
                }
            });
            
            embed.addFields({ name: 'Top 10 Rankings', value: leaderboardText });
            embed.addFields({ 
                name: 'Monthly Allowance', 
                value: 'You automatically receive 1,000 GP at the beginning of each month!' 
            });
            
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
                components: [backRow]
            });
        } catch (error) {
            console.error('Error showing GP leaderboard:', error);
            await interaction.editReply('An error occurred while displaying the GP leaderboard.');
        }
    }

    async refreshOpenChallengeLeaderboard(interaction, challenge) {
        try {
            // For open challenges, we need to check all participants
            const creatorScore = { exists: false, formattedScore: 'No entry', rank: 0, value: 0 };
            const participantScores = [];
            
            // Get leaderboard entries
            const rawEntries = await getLeaderboardEntries(challenge.leaderboardId);
            const isTimeBased = isTimeBasedLeaderboard(challenge);
            const processedEntries = processLeaderboardEntries(rawEntries, isTimeBased);
            
            // Look up creator's score
            const creatorEntry = processedEntries.find(entry => 
                entry.User.toLowerCase() === challenge.challengerUsername.toLowerCase()
            );
            
            if (creatorEntry) {
                creatorScore.exists = true;
                creatorScore.formattedScore = creatorEntry.FormattedScore;
                creatorScore.rank = creatorEntry.ApiRank;
                creatorScore.value = creatorEntry.Value;
            }
            
            // Look up each participant's score
            for (const participant of challenge.participants) {
                const participantEntry = processedEntries.find(entry => 
                    entry.User.toLowerCase() === participant.username.toLowerCase()
                );
                
                const participantScore = {
                    userId: participant.userId,
                    username: participant.username,
                    exists: false,
                    formattedScore: 'No entry',
                    rank: 0,
                    value: 0
                };
                
                if (participantEntry) {
                    participantScore.exists = true;
                    participantScore.formattedScore = participantEntry.FormattedScore;
                    participantScore.rank = participantEntry.ApiRank;
                    participantScore.value = participantEntry.Value;
                }
                
                participantScores.push(participantScore);
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`${challenge.gameTitle} - Leaderboard Refreshed`)
                .setDescription(`**Open Challenge** created by ${challenge.challengerUsername}\n**Description:** ${challenge.description || 'No description provided'}`);
            
            // Add leaderboard link
            const leaderboardLink = `[View on RetroAchievements](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
            
            // Create leaderboard table
            let leaderboardText = `**Current Rankings (Refreshed at ${new Date().toLocaleTimeString()}):**\n\n`;
            
            // Add creator's score with global rank
            leaderboardText += `1. **${challenge.challengerUsername} (Creator):** ${creatorScore.exists ? creatorScore.formattedScore : 'No score yet'}` + 
                             (creatorScore.rank ? ` (Global Rank: #${creatorScore.rank})` : '') + `\n`;
            
            // Add participants' scores with global ranks
            participantScores.forEach((score, index) => {
                leaderboardText += `${index + 2}. **${score.username}:** ${score.exists ? score.formattedScore : 'No score yet'}` + 
                                 (score.rank ? ` (Global Rank: #${score.rank})` : '') + `\n`;
            });
            
            leaderboardText += `\n**Leaderboard:** ${leaderboardLink}`;
            
            embed.addFields({ name: 'Current Standings', value: leaderboardText });
            
            // Add time remaining
            const timeRemaining = formatTimeRemaining(challenge.endDate);
            embed.addFields({ 
                name: 'Challenge Info', 
                value: `**Wager:** ${challenge.wagerAmount} GP per player\n` +
                       `**Participants:** ${challenge.participants.length + 1}\n` +
                       `**Total Pool:** ${(challenge.totalPool || 0) + (challenge.wagerAmount * (challenge.participants.length + 1))} GP\n` +
                       `**Ends:** ${timeRemaining}`
            });
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Add action buttons
            const buttonsRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arena_refresh_leaderboard_${challenge._id}`)
                        .setLabel('Refresh Again')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄'),
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            return interaction.editReply({
                embeds: [embed],
                components: [buttonsRow]
            });
        } catch (error) {
            console.error('Error refreshing open challenge leaderboard:', error);
            return interaction.editReply('An error occurred while refreshing the leaderboard data.');
        }
    }

    async refreshDirectChallengeLeaderboard(interaction, challenge) {
        try {
            // Get fresh scores
            const [challengerScore, challengeeScore] = await this.getChallengersScores(challenge);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`${challenge.gameTitle} - Leaderboard Refreshed`)
                .setDescription(`**Challenge:** ${challenge.challengerUsername} vs ${challenge.challengeeUsername}\n**Description:** ${challenge.description || 'No description provided'}`);
            
            // Add leaderboard link
            const leaderboardLink = `[View on RetroAchievements](https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId})`;
            
            // Create leaderboard table
            let leaderboardText = `**Current Standings (Refreshed at ${new Date().toLocaleTimeString()}):**\n\n`;
            
            // Add challenger with global rank
            if (challengerScore.exists) {
                leaderboardText += `• **${challenge.challengerUsername}:** ${challengerScore.formattedScore}` + 
                                 (challengerScore.rank ? ` (Global Rank: #${challengerScore.rank})` : '') + `\n`;
            } else {
                leaderboardText += `• **${challenge.challengerUsername}:** No score yet\n`;
            }
            
            // Add challengee with global rank
            if (challengeeScore.exists) {
                leaderboardText += `• **${challenge.challengeeUsername}:** ${challengeeScore.formattedScore}` + 
                                 (challengeeScore.rank ? ` (Global Rank: #${challengeeScore.rank})` : '') + `\n`;
            } else {
                leaderboardText += `• **${challenge.challengeeUsername}:** No score yet\n`;
            }
            
            leaderboardText += `\n**Leaderboard:** ${leaderboardLink}`;
            
            embed.addFields({ name: 'Current Standings', value: leaderboardText });
            
            // Add time remaining
            const timeRemaining = formatTimeRemaining(challenge.endDate);
            embed.addFields({ 
                name: 'Challenge Info', 
                value: `**Wager:** ${challenge.wagerAmount} GP each\n` +
                       `**Total Pool:** ${(challenge.totalPool || 0) + (challenge.wagerAmount * 2)} GP\n` +
                       `**Ends:** ${timeRemaining}`
            });
            
            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }
            
            // Add action buttons
            const buttonsRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`arena_refresh_leaderboard_${challenge._id}`)
                        .setLabel('Refresh Again')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄'),
                    new ButtonBuilder()
                        .setCustomId('arena_back_to_main')
                        .setLabel('Back to Arena')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            return interaction.editReply({
                embeds: [embed],
                components: [buttonsRow]
            });
        } catch (error) {
            console.error('Error refreshing leaderboard:', error);
            return interaction.editReply('An error occurred while refreshing the leaderboard data.');
        }
    }
    async fetchLeaderboardPositions(challenge) {
    return await this.getChallengersScores(challenge);
}
}

// Create singleton instance
const arenaService = new ArenaService();
export default arenaService;
