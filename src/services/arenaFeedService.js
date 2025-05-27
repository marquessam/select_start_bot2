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
     * Create or update a challenge embed - MATCHING ARCADE FEED STYLE EXACTLY
     */
    async createOrUpdateChallengeEmbed(challenge) {
        try {
            const channel = await this.getChannel();
            if (!channel) return;
            
            // Determine color based on status and type - MATCHING ARCADE COLORS
            let embedColor;
            if (challenge.status === 'pending') {
                embedColor = COLORS.WARNING; // Yellow for pending
            } else if (challenge.type === 'direct') {
                embedColor = COLORS.DANGER; // Red for direct challenges
            } else if (challenge.type === 'open') {
                embedColor = COLORS.PRIMARY; // Blue for open challenges
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
            
            // Determine title and status info
            const typeEmoji = challenge.type === 'direct' ? '⚔️' : '🌍';
            const statusEmoji = challenge.status === 'pending' ? '⏳' : '🔥';
            const typeText = challenge.type === 'direct' ? 'Direct Challenge' : 'Open Challenge';
            
            // Create description with timing info
            let description = `${statusEmoji} **${challenge.status.toUpperCase()}** ${typeText}\n` +
                             `${challenge.leaderboardTitle}\n\n` +
                             `**Description:** ${challenge.description || 'No description provided'}\n` +
                             `**Created by:** ${challenge.creatorRaUsername}\n`;
            
            if (challenge.type === 'direct' && challenge.targetRaUsername) {
                description += `**Opponent:** ${challenge.targetRaUsername}\n`;
            }
            
            description += `**Entry Wager:** ${gpUtils.formatGP(challenge.participants[0]?.wager || 0)}\n` +
                          `**Total Prize Pool:** ${gpUtils.formatGP(challenge.getTotalWager())}`;
            
            // Add timing information
            if (challenge.status === 'pending') {
                const timeoutDate = new Date(challenge.createdAt.getTime() + 24 * 60 * 60 * 1000);
                const timeoutTimestamp = getDiscordTimestamp(timeoutDate, 'R');
                description += `\n\n**Expires:** ${timeoutTimestamp} if not accepted`;
            } else if (challenge.status === 'active') {
                const endTimestamp = getDiscordTimestamp(challenge.endedAt, 'R');
                const bettingEndTimestamp = getDiscordTimestamp(challenge.bettingClosedAt, 'R');
                description += `\n\n**Challenge Ends:** ${endTimestamp}\n**Betting Closes:** ${bettingEndTimestamp}`;
            }
            
            description += `\n\n*Note: Only users ranked 999 or lower in the global leaderboard are shown.*`;
            
            // Create embed using standardized utility - EXACT ARCADE STYLE
            const embed = createHeaderEmbed(
                `${typeEmoji} ${challenge.gameTitle}`,
                description,
                {
                    color: embedColor,
                    thumbnail: thumbnailUrl,
                    url: leaderboardUrl,
                    footer: { 
                        text: `Challenge ID: ${challenge.challengeId} • Data from RetroAchievements.org` 
                    }
                }
            );
            
            // Add current standings/participants - MATCHING ARCADE LEADERBOARD FORMAT
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
                            
                            // FORMAT EXACTLY LIKE ARCADE FEED
                            currentScores.forEach((score, index) => {
                                const displayRank = index + 1;
                                const medalEmoji = displayRank <= 3 ? EMOJIS[`RANK_${displayRank}`] : `${displayRank}.`;
                                const globalRank = score.rank ? ` (Global Rank: #${score.rank})` : '';
                                const scoreText = score.score !== 'No score' ? `: ${score.score}` : ': No score yet';
                                
                                participantsText += `${medalEmoji} **${score.raUsername}**${scoreText}${globalRank}\n`;
                            });
                        } else {
                            // Fallback to participant list without scores
                            challenge.participants.forEach((participant, index) => {
                                const displayRank = index + 1;
                                const medalEmoji = displayRank <= 3 ? EMOJIS[`RANK_${displayRank}`] : `${displayRank}.`;
                                participantsText += `${medalEmoji} **${participant.raUsername}**: No score yet\n`;
                            });
                        }
                    } catch (error) {
                        console.error(`Error fetching scores for challenge ${challenge.challengeId}:`, error);
                        // Fallback to participant list without scores
                        challenge.participants.forEach((participant, index) => {
                            const displayRank = index + 1;
                            const medalEmoji = displayRank <= 3 ? EMOJIS[`RANK_${displayRank}`] : `${displayRank}.`;
                            participantsText += `${medalEmoji} **${participant.raUsername}**: No score yet\n`;
                        });
                    }
                } else {
                    // For pending challenges, just list participants with numbers
                    challenge.participants.forEach((participant, index) => {
                        const number = index + 1;
                        participantsText += `${number}. **${participant.raUsername}**\n`;
                    });
                }
                
                // Add participants count like arcade feed
                participantsText += `\n${challenge.participants.length} registered member${challenge.participants.length !== 1 ? 's' : ''} participating in this challenge`;
                
                embed.addFields({ 
                    name: challenge.status === 'active' ? 'Current Standings' : `Participants (${challenge.participants.length})`, 
                    value: participantsText || 'No participants yet',
                    inline: false 
                });
            }
            
            // Add betting information if there are bets - MATCHING ARCADE STYLE
            if (challenge.bets.length > 0) {
                const totalBets = challenge.getTotalBets();
                embed.addFields({
                    name: '🎰 Total Bets',
                    value: `${gpUtils.formatGP(totalBets)} from ${challenge.bets.length} bet${challenge.bets.length !== 1 ? 's' : ''}`,
                    inline: true
                });
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
     * Update the GP leaderboard embed - MATCHING ARCADE POINTS SUMMARY EXACTLY
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
            
            // Create the GP leaderboard embed - MATCHING ARCADE POINTS SUMMARY STYLE
            const embed = createHeaderEmbed(
                '🏆 GP (Game Points) Leaderboard',
                `**Current GP standings for all arena participants**\n\n` +
                `Game Points (GP) are earned by winning challenges and used to create new challenges or place bets.\n\n` +
                `**Last Updated:** ${timestamp} | **Updates:** Every 30 minutes\n\n` +
                `*Use the </arena:1234567890> command to participate in challenges and earn GP.*`,
                {
                    color: COLORS.WARNING, // Yellow for leaderboard - matching arcade
                    footer: { 
                        text: 'GP balances update in real-time • Monthly 1,000 GP grants are automatic' 
                    }
                }
            );
            
            // Create the standings field - EXACT ARCADE FORMAT
            if (leaderboard.length > 0) {
                // Break standings into groups of 15 to avoid embed field size limits (matching arcade)
                const maxUsersPerField = 15;
                const numFields = Math.ceil(leaderboard.length / maxUsersPerField);
                
                for (let fieldIndex = 0; fieldIndex < numFields; fieldIndex++) {
                    const startIndex = fieldIndex * maxUsersPerField;
                    const endIndex = Math.min((fieldIndex + 1) * maxUsersPerField, leaderboard.length);
                    const usersInThisField = leaderboard.slice(startIndex, endIndex);
                    
                    let standingsText = '';
                    
                    // Add each user with GP balance - EXACT ARCADE FORMAT
                    usersInThisField.forEach(user => {
                        standingsText += `**${user.raUsername}**: ${gpUtils.formatGP(user.gpBalance)}\n`;
                    });
                    
                    const fieldTitle = numFields > 1 
                        ? `Standings (${startIndex + 1}-${endIndex})`
                        : 'Current Standings';
                    
                    embed.addFields({ 
                        name: fieldTitle, 
                        value: standingsText || 'No users have GP yet.' 
                    });
                }
            } else {
                embed.addFields({ 
                    name: 'No Standings', 
                    value: 'No users have GP balances yet.' 
                });
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
