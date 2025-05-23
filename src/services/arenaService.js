// src/services/arenaService.js - Updated with new AlertUtils integration
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { config } from '../config/config.js';
import { COLORS, EMOJIS } from '../utils/FeedUtils.js';
import AlertUtils, { ALERT_TYPES } from '../utils/AlertUtils.js';

class ArenaService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arenaChannelId || '1373570850912997476');
        this.arenaFeedChannelId = config.discord.arenaFeedChannelId || '1373570913882214410';
        this.tempMessageCleanupInterval = null;
        this.feedMessageIds = new Map(); // Map of challengeId -> messageId
        this.overviewEmbedId = null;
        this.gpLeaderboardMessageId = null;
        
        // No need to set the alerts channel here anymore
        // AlertUtils handles this through its initialization
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for arena service');
            return;
        }

        try {
            console.log('Starting arena service...');
            AlertUtils.setClient(this.client);  // Set the client for AlertUtils
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

    // When notifying standings changes
    async notifyStandingsChange(challenge, changedPosition) {
        try {
            // Use AlertUtils with ARENA type instead of getting channel directly
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
            
            // Use the new AlertUtils with ARENA type
            await AlertUtils.sendPositionChangeAlert({
                title: '🏟️ Arena Standings Update!',
                description: `There's been a change in the leaderboard for the active challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}**!`,
                changes: [
                    {
                        username: changedPosition.newLeader,
                        newRank: 1
                    }
                ],
                currentStandings: [
                    {
                        username: challenge.challengerUsername,
                        rank: 1,
                        score: challenge.challengerScore
                    },
                    {
                        username: challenge.challengeeUsername,
                        rank: 2,
                        score: challenge.challengeeScore
                    }
                ],
                thumbnail: challenge.iconUrl ? `https://retroachievements.org${challenge.iconUrl}` : null,
                color: challenge.isOpenChallenge ? COLORS.PRIMARY : COLORS.DANGER,
                footer: { text: `Follow the challenge in the arena feed channel!` }
            }, ALERT_TYPES.ARENA); // Specify ARENA alert type for proper channel routing
            
        } catch (error) {
            console.error('Error sending standings change notification:', error);
        }
    }

    // When notifying new challenges
    async notifyNewChallenge(challenge) {
        try {
            // Use AlertUtils with ARENA type instead of getting channel directly
            
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
            // Use AlertUtils to ensure the message goes to the correct channel
            const messageOptions = { embeds: [embed] };
            
            await this.sendTemporaryMessage(
                await AlertUtils.getAlertsChannel(ALERT_TYPES.ARENA), 
                messageOptions, 
                4, 
                'newChallenge'
            );
            
            // After sending the notification, refresh the entire feed to maintain alphabetical order
            await this.refreshEntireFeed();
        } catch (error) {
            console.error('Error sending new challenge notification:', error);
        }
    }

    // When notifying participant joined
    async notifyParticipantJoined(challenge, participantUsername) {
        try {
            // Use AlertUtils with ARENA type
            
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
            // Use AlertUtils to ensure the message goes to the correct channel
            const messageOptions = { embeds: [embed] };
            
            await this.sendTemporaryMessage(
                await AlertUtils.getAlertsChannel(ALERT_TYPES.ARENA), 
                messageOptions, 
                3, 
                'participantJoined'
            );
            
            // After a participant joins, refresh the entire feed to maintain alphabetical order
            await this.refreshEntireFeed();
        } catch (error) {
            console.error('Error sending participant joined notification:', error);
        }
    }

    // When notifying challenge updates
    async notifyChallengeUpdate(challenge) {
        try {
            // Use AlertUtils with ARENA type
            
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
                
                // Determine how long to keep the message based on status
                let hoursUntilDelete = 6; // Keep active notifications longer
                
                // Use AlertUtils to get the correct channel
                const alertsChannel = await AlertUtils.getAlertsChannel(ALERT_TYPES.ARENA);
                if (alertsChannel) {
                    // Send with button and follow-up instructions using temp message
                    const message = await this.sendTemporaryMessage(
                        alertsChannel,
                        { 
                            embeds: [embed], 
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 2,
                                            label: "Place a Bet",
                                            style: 1,
                                            emoji: { name: "💰" },
                                            custom_id: "not_used_here"
                                        }
                                    ]
                                }
                            ], 
                            content: `A new Arena challenge has begun!` 
                        },
                        hoursUntilDelete,
                        'challengeUpdate'
                    );
                    
                    if (message) {
                        // Follow-up message with same timer
                        await this.sendTemporaryMessage(
                            alertsChannel,
                            {
                                content: 'To place a bet, use the `/arena` command and select "Place a Bet". Pot Betting System: Your bet joins the total prize pool. If your chosen player wins, you get your bet back plus a share of the losing bets proportional to your bet amount!',
                                reply: { messageReference: message.id }
                            },
                            hoursUntilDelete,
                            'bettingInfo'
                        );
                    }
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
            
            // Send as a temporary message to the correct channel using AlertUtils
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

    // The rest of the service methods remain the same...
}

// Create singleton instance
const arenaService = new ArenaService();
export default arenaService;
