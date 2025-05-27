// src/services/arenaFeedService.js
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { User } from '../models/User.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS, createHeaderEmbed, getDiscordTimestamp } from '../utils/FeedUtils.js';
import { EmbedBuilder } from 'discord.js';
import arenaUtils from '../utils/arenaUtils.js';
import gpUtils from '../utils/gpUtils.js';

class ArenaFeedService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arenaFeedChannelId || '1373570913882214410');
        this.headerMessageId = null;
        this.overviewEmbedId = null;
    }

    // Override the update method from base class
    async update() {
        await this.updateArenaFeed();
    }

    async updateArenaFeed() {
        try {
            const channel = await this.getChannel();
            if (!channel) {
                console.error('Arena feed channel not found or inaccessible');
                return;
            }
            
            // Update header first
            await this.updateArenaHeader();
            
            // Update overview embed
            await this.updateArenaOverview();
            
            // Update active challenges (pending and active)
            const activeChallenges = await ArenaChallenge.find({
                status: { $in: ['pending', 'active'] }
            }).sort({ createdAt: -1 }); // Sort by creation date, newest first
            
            for (const challenge of activeChallenges) {
                await this.createOrUpdateChallengeEmbed(challenge);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Update GP leaderboard at the bottom
            await this.updateGPLeaderboardEmbed();
            
        } catch (error) {
            console.error('Error updating arena feeds:', error);
        }
    }

    async updateArenaHeader() {
        // Format current time for the header message
        const now = new Date();
        const timestamp = getDiscordTimestamp(now);
        
        // Create header content with cleaner formatting and update frequency note
        const headerContent = 
            `# ${EMOJIS.ARENA} Arena Challenges\n` + 
            `All active arena challenges and GP leaderboard are shown below.\n` +
            `**Last Updated:** ${timestamp} | **Updates:** Every 30 minutes\n` +
            `Create challenges, place bets, and compete for GP (Game Points)!`;
        
        // Use the base class method to update the header
        this.headerMessageId = await this.updateHeader({ content: headerContent });
    }

    /**
     * Create or update the arena overview embed at the top of the feed
     */
    async updateArenaOverview() {
        try {
            const channel = await this.getChannel();
            if (!channel) return;

            // Get stats for the overview
            const activeChallengeCount = await ArenaChallenge.countDocuments({
                status: { $in: ['pending', 'active'] }
            });
            
            const totalUsers = await User.countDocuments({});
            const usersWithGP = await User.countDocuments({ gpBalance: { $gt: 0 } });
            
            // Get system GP stats
            const systemStats = await gpUtils.getSystemGPStats();
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(COLORS.WARNING) // Yellow for overview
                .setTitle(`${EMOJIS.ARENA} Arena System Overview`)
                .setDescription(
                    'The **Arena System** lets you create challenges and bet GP on RetroAchievements leaderboards.\n\n' +
                    '**How It Works:**\n' +
                    `• **Direct Challenges:** Challenge a specific player to a 1v1 duel\n` +
                    `• **Open Challenges:** Create challenges anyone can join\n` +
                    `• **Betting System:** Bet GP on active challenges you're not participating in\n` +
                    `• **GP (Game Points):** Earn 1,000 GP automatically each month\n\n` +
                    '**Current Status:**'
                );
                
            // Add active challenges info
            let contentField = '';
            contentField += `• **Active Challenges:** ${activeChallengeCount} challenges accepting participants/bets\n`;
            contentField += `• **Registered Users:** ${totalUsers} total, ${usersWithGP} with GP\n`;
            contentField += `• **Total GP in System:** ${gpUtils.formatGP(systemStats.totalGP)}\n`;
            contentField += `• **GP Leaderboard:** See bottom of feed for current standings`;
            
            embed.addFields({ name: 'Current Status', value: contentField });
            
            // Add participation info
            embed.addFields({ 
                name: 'How to Participate', 
                value: 'Use `/arena` to create challenges, join existing ones, or place bets! You automatically receive 1,000 GP on the 1st of each month.\n\nChallenges run for 7 days, and betting closes 3 days after a challenge starts.'
            });
            
            // Add footer
            embed.setFooter({ 
                text: 'Winners take all wagers • Bet winners split losing bets proportionally'
            });
            
            // Send or update the overview embed
            if (this.overviewEmbedId) {
                try {
                    const message = await channel.messages.fetch(this.overviewEmbedId);
                    await message.edit({ embeds: [embed] });
                } catch (error) {
                    if (error.message.includes('Unknown Message')) {
                        const message = await channel.send({ embeds: [embed] });
                        this.overviewEmbedId = message.id;
                    } else {
                        throw error;
                    }
                }
            } else {
                const message = await channel.send({ embeds: [embed] });
                this.overviewEmbedId = message.id;
            }
        } catch (error) {
            console.error('Error updating arena overview:', error);
        }
    }

    /**
     * Create or update a challenge embed
     */
    async createOrUpdateChallengeEmbed(challenge) {
        try {
            const channel = await this.getChannel();
            if (!channel) return;
            
            // Determine color based on status
            let embedColor;
            if (challenge.status === 'pending') {
                embedColor = COLORS.WARNING; // Yellow for pending
            } else if (challenge.status === 'active') {
                embedColor = COLORS.PRIMARY; // Blue for active
            } else {
                embedColor = COLORS.NEUTRAL; // Gray for other statuses
            }
            
            // Get game info for thumbnail
            let thumbnailUrl = null;
            try {
                const gameInfo = await arenaUtils.getGameInfo(challenge.gameId);
                if (gameInfo?.imageIcon) {
                    thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                }
            } catch (error) {
                console.error(`Error fetching game info for challenge ${challenge.challengeId}:`, error);
            }
            
            // Create clickable link to RetroAchievements leaderboard
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
            
            // Determine title based on challenge type
            const typeEmoji = challenge.type === 'direct' ? '⚔️' : '🌍';
            const typeText = challenge.type === 'direct' ? 'Direct Challenge' : 'Open Challenge';
            const statusEmoji = challenge.status === 'pending' ? '⏳' : '🔥';
            
            // Create embed using our utility functions
            const embed = createHeaderEmbed(
                `${typeEmoji} ${typeText} - ${challenge.gameTitle}`,
                `${statusEmoji} **${challenge.status.toUpperCase()}** | ${challenge.leaderboardTitle}\n\n` +
                `**Description:** ${challenge.description || 'No description provided'}\n` +
                `**Created by:** ${challenge.creatorRaUsername}\n` +
                (challenge.type === 'direct' ? `**Opponent:** ${challenge.targetRaUsername || 'Unknown'}\n` : '') +
                `**Wager:** ${challenge.participants[0]?.wager || 0} GP ${challenge.type === 'direct' ? 'each' : 'to join'}\n` +
                `**Total Prize Pool:** ${challenge.getTotalWager()} GP`,
                {
                    color: embedColor,
                    thumbnail: thumbnailUrl,
                    url: leaderboardUrl,
                    footer: { 
                        text: `Challenge ID: ${challenge.challengeId} • Data from RetroAchievements.org` 
                    }
                }
            );
            
            // Add timing information
            let timingInfo = '';
            if (challenge.status === 'pending') {
                const timeoutDate = new Date(challenge.createdAt.getTime() + 24 * 60 * 60 * 1000);
                const timeoutTimestamp = getDiscordTimestamp(timeoutDate, 'R');
                timingInfo = `**Expires:** ${timeoutTimestamp} if not accepted`;
            } else if (challenge.status === 'active') {
                const endTimestamp = getDiscordTimestamp(challenge.endedAt, 'R');
                const bettingEndTimestamp = getDiscordTimestamp(challenge.bettingClosedAt, 'R');
                timingInfo = `**Challenge Ends:** ${endTimestamp}\n**Betting Closes:** ${bettingEndTimestamp}`;
            }
            
            if (timingInfo) {
                embed.addFields({ name: 'Timing', value: timingInfo });
            }
            
            // Add participants information
            if (challenge.participants.length > 0) {
                let participantsText = '';
                
                // If challenge is active, try to get current scores
                if (challenge.status === 'active') {
                    try {
                        const participantUsernames = challenge.participants.map(p => p.raUsername);
                        const currentScores = await arenaUtils.fetchLeaderboardScores(
                            challenge.gameId,
                            challenge.leaderboardId,
                            participantUsernames
                        );
                        
                        if (currentScores && currentScores.length > 0) {
                            // Sort by rank (lower is better, null ranks go to end)
                            currentScores.sort((a, b) => {
                                if (a.rank === null && b.rank === null) return 0;
                                if (a.rank === null) return 1;
                                if (b.rank === null) return -1;
                                return a.rank - b.rank;
                            });
                            
                            currentScores.forEach((score, index) => {
                                const rank = index + 1;
                                const rankEmoji = rank <= 3 ? EMOJIS[`RANK_${rank}`] : `${rank}.`;
                                const globalRank = score.rank ? ` (Global: #${score.rank})` : '';
                                const scoreText = score.score !== 'No score' ? `: ${score.score}` : ': No score yet';
                                
                                participantsText += `${rankEmoji} **${score.raUsername}**${scoreText}${globalRank}\n`;
                            });
                        } else {
                            // Fallback to participant list without scores
                            challenge.participants.forEach((participant, index) => {
                                const rank = index + 1;
                                const rankEmoji = rank <= 3 ? EMOJIS[`RANK_${rank}`] : `${rank}.`;
                                participantsText += `${rankEmoji} **${participant.raUsername}**: No score yet\n`;
                            });
                        }
                    } catch (error) {
                        console.error(`Error fetching scores for challenge ${challenge.challengeId}:`, error);
                        // Fallback to participant list without scores
                        challenge.participants.forEach((participant, index) => {
                            const rank = index + 1;
                            const rankEmoji = rank <= 3 ? EMOJIS[`RANK_${rank}`] : `${rank}.`;
                            participantsText += `${rankEmoji} **${participant.raUsername}**: No score yet\n`;
                        });
                    }
                } else {
                    // For pending challenges, just list participants
                    challenge.participants.forEach((participant, index) => {
                        const number = index + 1;
                        participantsText += `${number}. **${participant.raUsername}**\n`;
                    });
                }
                
                embed.addFields({ 
                    name: `Participants (${challenge.participants.length})`, 
                    value: participantsText || 'No participants yet'
                });
            }
            
            // Add betting information if there are bets
            if (challenge.bets.length > 0) {
                const totalBets = challenge.getTotalBets();
                let bettingText = `**Total Betting Pool:** ${gpUtils.formatGP(totalBets)}\n`;
                bettingText += `**Number of Bets:** ${challenge.bets.length}\n\n`;
                
                // Group bets by target
                const betsByTarget = new Map();
                challenge.bets.forEach(bet => {
                    if (!betsByTarget.has(bet.targetRaUsername)) {
                        betsByTarget.set(bet.targetRaUsername, []);
                    }
                    betsByTarget.get(bet.targetRaUsername).push(bet);
                });
                
                // Show betting distribution
                for (const [targetUser, bets] of betsByTarget.entries()) {
                    const totalBetsOnUser = bets.reduce((sum, bet) => sum + bet.amount, 0);
                    bettingText += `**${targetUser}:** ${gpUtils.formatGP(totalBetsOnUser)} (${bets.length} bet${bets.length !== 1 ? 's' : ''})\n`;
                }
                
                embed.addFields({ name: 'Betting Pool', value: bettingText });
            }
            
            // Use our base class updateMessage method
            await this.updateMessage(
                `challenge_${challenge.challengeId}`, 
                { embeds: [embed] }
            );
        } catch (error) {
            console.error(`Error creating challenge embed for ${challenge.challengeId}:`, error);
        }
    }

    /**
     * Update the GP leaderboard embed at the bottom
     */
    async updateGPLeaderboardEmbed() {
        try {
            // Get GP leaderboard
            const leaderboard = await gpUtils.getGPLeaderboard(15);
            
            if (!leaderboard || leaderboard.length === 0) {
                return; // No GP data to display
            }
            
            // Current timestamp in Discord format
            const timestamp = getDiscordTimestamp(new Date());
            
            // Create the GP leaderboard embed
            const embed = createHeaderEmbed(
                '💰 GP (Game Points) Leaderboard',
                `**Current GP standings for all arena participants**\n\n` +
                `GP is earned by winning challenges and is automatically granted (1,000 GP) on the 1st of each month.\n\n` +
                `**Last Updated:** ${timestamp} | **Updates:** Every 30 minutes\n\n` +
                `*Use the </arena:1234567890> command to participate in challenges and earn GP.*`,
                {
                    color: COLORS.GOLD, // Use gold for GP leaderboard
                    footer: { 
                        text: 'GP balances update in real-time • Monthly GP grants are automatic' 
                    }
                }
            );
            
            // Create the standings field
            let standingsText = '';
            
            leaderboard.forEach(user => {
                const rankEmoji = user.rank <= 3 ? EMOJIS[`RANK_${user.rank}`] : `${user.rank}.`;
                standingsText += `${rankEmoji} **${user.raUsername}**: ${gpUtils.formatGP(user.gpBalance)}\n`;
            });
            
            embed.addFields({ 
                name: 'Current Standings', 
                value: standingsText
            });
            
            // Add system statistics
            try {
                const systemStats = await gpUtils.getSystemGPStats();
                embed.addFields({
                    name: 'System Statistics',
                    value: 
                        `**Total Users:** ${systemStats.totalUsers}\n` +
                        `**Users with GP:** ${systemStats.usersWithGP}\n` +
                        `**Total GP in Circulation:** ${gpUtils.formatGP(systemStats.totalGP)}\n` +
                        `**Total Challenges Created:** ${systemStats.totalChallengesCreated || 0}`
                });
            } catch (error) {
                console.error('Error fetching system GP stats:', error);
            }
            
            // Update or create the GP leaderboard message
            await this.updateMessage(
                'gp_leaderboard',
                { embeds: [embed] }
            );
        } catch (error) {
            console.error('Error creating GP leaderboard embed:', error);
        }
    }
}

// Create singleton instance
const arenaFeedService = new ArenaFeedService();
export default arenaFeedService;
