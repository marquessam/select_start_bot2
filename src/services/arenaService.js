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
                    `**Duration:** ${challenge.durationHours} hours\n\n` +
                    `${challenge.challengeeUsername} must use \`/arena respond\` to accept or decline this challenge.`
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
            
            switch (challenge.status) {
                case 'active':
                    title = '🏟️ Arena Challenge Accepted!';
                    description = 
                        `**${challenge.challengeeUsername}** has accepted the challenge from **${challenge.challengerUsername}**!\n\n` +
                        `**Game:** ${challenge.gameTitle}\n` +
                        `**Wager:** ${challenge.wagerAmount} GP each\n` +
                        `**Duration:** ${challenge.durationHours} hours\n` +
                        `**Ends:** ${challenge.endDate.toLocaleString()}\n\n` +
                        `The challenge has begun! Watch the leaderboard updates in <#${this.arenaFeedChannelId}>.\n` +
                        `Want to bet on the outcome? Use \`/arena bet\` to place your bets!`;
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
                    content: 'To place a bet, use the `/arena bet` command. You can bet on either player to win!',
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
            
            // Save the scores
            challenge.challengerScore = challengerScore.formattedScore;
            challenge.challengeeScore = challengeeScore.formattedScore;
            await challenge.save();
            
            // Create embed for the challenge
            const embed = this.createChallengeEmbed(challenge, challengerScore, challengeeScore);
            
            // Send or update the message
            const challengeId = challenge._id.toString();
            
            try {
                if (this.feedMessageIds.has(challengeId)) {
                    // Try to update existing message
                    const messageId = this.feedMessageIds.get(challengeId);
                    const message = await feedChannel.messages.fetch(messageId);
                    await message.edit({ embeds: [embed] });
                    console.log(`Updated arena feed for challenge ${challengeId}`);
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
        
        // Create the embed
        const embed = new EmbedBuilder()
            .setTitle(`🏟️ Arena Challenge: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`)
            .setColor(challenge.endDate > now ? '#3498DB' : '#E74C3C')
            .setDescription(
                `**Game:** ${challenge.gameTitle}\n` +
                `**Wager:** ${challenge.wagerAmount} GP each\n` +
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
                `Use \`/arena bet\` to place a bet on the outcome!`
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
                `Challenge others with \`/arena challenge\` or place bets with \`/arena bet\``;
            
            try {
                if (this.headerMessageId) {
                    // Try to update existing header
                    const headerMessage = await feedChannel.messages.fetch(this.headerMessageId);
                    await headerMessage.edit({ content: headerContent });
                    console.log(`Updated arena feed header message`);
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
                    'Earn GP by winning Arena challenges and bets, or claim your monthly allowance.'
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
            
            // Add a "how to claim" field
            embed.addFields({ 
                name: 'Monthly Allowance', 
                value: 'Remember to claim your monthly 1,000 GP allowance using `/arena claim`!' 
            });
            
            // Update or create the message
            try {
                if (this.gpLeaderboardMessageId) {
                    // Try to update existing leaderboard
                    const gpMessage = await feedChannel.messages.fetch(this.gpLeaderboardMessageId);
                    await gpMessage.edit({ embeds: [embed] });
                    console.log(`Updated GP leaderboard message`);
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
            // Fetch leaderboard entries from RetroAchievements
            const entries = await retroAPI.getLeaderboardEntriesDirect(challenge.leaderboardId, 0, 1000);
            
            // Process entries
            let rawEntries = [];
            
            if (entries) {
                if (Array.isArray(entries)) {
                    rawEntries = entries;
                } else if (entries.Results && Array.isArray(entries.Results)) {
                    rawEntries = entries.Results;
                }
            }
            
            // Find the entries for the challengers
            const challengerEntry = rawEntries.find(entry => {
                const user = entry.User || entry.user || '';
                return user.trim().toLowerCase() === challenge.challengerUsername.toLowerCase();
            });
            
            const challengeeEntry = rawEntries.find(entry => {
                const user = entry.User || entry.user || '';
                return user.trim().toLowerCase() === challenge.challengeeUsername.toLowerCase();
            });
            
            // Format the challenger scores
            const challengerScore = {
                value: 0,
                formattedScore: 'No score yet'
            };
            
            if (challengerEntry) {
                const score = challengerEntry.Score || challengerEntry.score || challengerEntry.Value || challengerEntry.value || 0;
                const formattedScore = challengerEntry.FormattedScore || challengerEntry.formattedScore || challengerEntry.ScoreFormatted || score.toString();
                
                challengerScore.value = parseFloat(score) || 0;
                challengerScore.formattedScore = formattedScore;
            }
            
            // Format the challengee scores
            const challengeeScore = {
                value: 0,
                formattedScore: 'No score yet'
            };
            
            if (challengeeEntry) {
                const score = challengeeEntry.Score || challengeeEntry.score || challengeeEntry.Value || challengeeEntry.value || 0;
                const formattedScore = challengeeEntry.FormattedScore || challengeeEntry.formattedScore || challengeeEntry.ScoreFormatted || score.toString();
                
                challengeeScore.value = parseFloat(score) || 0;
                challengeeScore.formattedScore = formattedScore;
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
                
                if (winningBets.length > 0 && totalWinningBets > 0) {
                    // Process each winning bet
                    for (const bet of winningBets) {
                        try {
                            // Find the user who placed the bet
                            const bettor = await User.findOne({ discordId: bet.userId });
                            
                            if (bettor) {
                                // Calculate payout ratio based on bet amount relative to total winning bets
                                const payoutRatio = bet.betAmount / totalWinningBets;
                                
                                // Calculate payout amount
                                const payoutAmount = Math.floor(totalBets * payoutRatio);
                                
                                // Add payout to user
                                bettor.gp = (bettor.gp || 0) + payoutAmount;
                                bettor.arenaStats = bettor.arenaStats || {};
                                bettor.arenaStats.betsWon = (bettor.arenaStats.betsWon || 0) + 1;
                                
                                // Mark bet as paid
                                bet.paid = true;
                                
                                // Save user with updated GP
                                await bettor.save();
                                
                                console.log(`Paid ${payoutAmount} GP to ${bettor.raUsername} for winning bet`);
                            }
                        } catch (betError) {
                            console.error(`Error processing winning bet for user ${bet.userId}:`, betError);
                        }
                    }
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
                
                // Create a completed challenge embed
                const embed = new EmbedBuilder()
                    .setTitle(`🏁 Completed Challenge: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`)
                    .setColor('#27AE60')
                    .setDescription(
                        `**Game:** ${challenge.gameTitle}\n` +
                        `**Wager:** ${challenge.wagerAmount} GP each\n` +
                        `**Duration:** ${challenge.durationHours} hours\n` +
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
