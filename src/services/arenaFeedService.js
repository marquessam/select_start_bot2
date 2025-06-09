// src/services/arenaFeedService.js - UPDATED with title truncation and reliable API
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { User } from '../models/User.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS, createHeaderEmbed, getDiscordTimestamp } from '../utils/FeedUtils.js';
import { EmbedBuilder } from 'discord.js';
import arenaUtils from '../utils/arenaUtils.js';
import gpUtils from '../utils/gpUtils.js';
import titleUtils from '../utils/titleUtils.js'; // NEW: Import title utilities
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import { GP_REWARDS } from './gpRewardService.js';

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
            
            // 1. Update header first
            await this.updateArenaHeader();
            
            // 2. Update overview embed (always second)
            await this.updateArenaOverview();
            
            // 3. Update DIRECT challenges first (sorted alphabetically by game title)
            console.log('Updating direct challenges...');
            const directChallenges = await ArenaChallenge.find({
                status: { $in: ['pending', 'active'] },
                type: 'direct'
            }).sort({ gameTitle: 1 }); // Sort alphabetically by game title (A-Z)
            
            for (const challenge of directChallenges) {
                await this.createOrUpdateChallengeEmbed(challenge);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // 4. Update OPEN challenges second (sorted alphabetically by game title)
            console.log('Updating open challenges...');
            const openChallenges = await ArenaChallenge.find({
                status: { $in: ['pending', 'active'] },
                type: 'open'
            }).sort({ gameTitle: 1 }); // Sort alphabetically by game title (A-Z)
            
            for (const challenge of openChallenges) {
                await this.createOrUpdateChallengeEmbed(challenge);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // 5. Update GP overview at the bottom (ALWAYS LAST EMBED IN FEED)
            console.log('Updating GP overview...');
            await this.updateGPOverviewEmbed();
            
            console.log(`Arena feed updated: ${directChallenges.length} direct + ${openChallenges.length} open challenges (sorted alphabetically by game title) + GP overview`);
            
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
            `Use </arena:1234567890> to create challenges, join existing ones, and compete for GP!`;
        
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
                    `• **GP (Gold Points):** Earn 1,000 GP automatically each month\n\n` +
                    '**Current Status:**'
                );
                
            // Add active challenges info
            let contentField = '';
            contentField += `• **Active Challenges:** ${activeChallengeCount} challenges accepting participants/bets\n`;
            contentField += `• **Registered Users:** ${totalUsers} total, ${usersWithGP} with GP\n`;
            contentField += `• **Total GP in System:** ${gpUtils.formatGP(systemStats.totalGP)}\n`;
            contentField += `• **GP Earning Guide:** See bottom of feed for complete earning methods`;
            
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
     * UPDATED: Create or update a challenge embed with title truncation
     */
    async createOrUpdateChallengeEmbed(challenge) {
        try {
            const channel = await this.getChannel();
            if (!channel) return;
            
            // Determine color based on status and type
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
            
            // Determine title and status info with title truncation
            const typeEmoji = challenge.type === 'direct' ? '⚔️' : '🌍';
            const statusEmoji = challenge.status === 'pending' ? '⏳' : '🔥';
            const typeText = challenge.type === 'direct' ? 'Direct Challenge' : 'Open Challenge';
            
            // UPDATED: Use title truncation for embed title
            const embedTitle = titleUtils.formatChallengeTitle(challenge, 'embed');
            
            // UPDATED: Create description with proper truncation
            const gameTitle = titleUtils.truncateGameTitleForEmbed(challenge.gameTitle);
            const leaderboardTitle = titleUtils.truncateLeaderboardTitle(challenge.leaderboardTitle);
            const challengeDescription = titleUtils.formatChallengeDescription(challenge.description);
            
            let description = `${statusEmoji} **${challenge.status.toUpperCase()}** ${typeText}\n` +
                             `${leaderboardTitle}\n\n` +
                             `**Description:** ${challengeDescription}\n` +
                             `**Created by:** ⚙️ ${challenge.creatorRaUsername}\n`;
            
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
            
            description += `\n\n*Use </arena:1234567890> to join challenges or place bets.*`;
            
            // Create embed using standardized utility
            const embed = createHeaderEmbed(
                embedTitle,
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
            
            // Add current standings/participants
            if (challenge.participants.length > 0) {
                let participantsText = '';
                
                // If challenge is active, try to get current scores using reliable API
                if (challenge.status === 'active') {
                    try {
                        const participantUsernames = challenge.participants.map(p => p.raUsername);
                        const currentScores = await this.fetchLeaderboardScoresReliable(
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
                            
                            // Crown for #1, numbers for others, gear for creator
                            currentScores.forEach((score, index) => {
                                const displayRank = index + 1;
                                const positionEmoji = displayRank === 1 ? '👑' : `${displayRank}.`;
                                const globalRank = score.rank ? ` (Global Rank: #${score.rank})` : '';
                                const scoreText = score.score !== 'No score' ? `: ${score.score}` : ': No score yet';
                                
                                // Gear indicator for creator
                                const creatorIndicator = score.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                                
                                participantsText += `${positionEmoji} **${score.raUsername}**${creatorIndicator}${scoreText}${globalRank}\n`;
                            });
                        } else {
                            // Fallback to participant list without scores
                            challenge.participants.forEach((participant, index) => {
                                const displayRank = index + 1;
                                const positionEmoji = displayRank === 1 ? '👑' : `${displayRank}.`;
                                const creatorIndicator = participant.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                                participantsText += `${positionEmoji} **${participant.raUsername}**${creatorIndicator}: No score yet\n`;
                            });
                        }
                    } catch (error) {
                        console.error(`Error fetching scores for challenge ${challenge.challengeId}:`, error);
                        // Fallback to participant list without scores
                        challenge.participants.forEach((participant, index) => {
                            const displayRank = index + 1;
                            const positionEmoji = displayRank === 1 ? '👑' : `${displayRank}.`;
                            const creatorIndicator = participant.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                            participantsText += `${positionEmoji} **${participant.raUsername}**${creatorIndicator}: No score yet\n`;
                        });
                    }
                } else {
                    // For pending challenges, just list participants
                    challenge.participants.forEach((participant, index) => {
                        const number = index + 1;
                        const creatorIndicator = participant.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                        participantsText += `${number}. **${participant.raUsername}**${creatorIndicator}\n`;
                    });
                }
                
                embed.addFields({ 
                    name: challenge.status === 'active' ? 'Current Standings' : `Participants (${challenge.participants.length})`, 
                    value: titleUtils.createSafeFieldValue(participantsText || 'No participants yet'),
                    inline: false 
                });
            }
            
            // Add betting information if there are bets
            if (challenge.bets.length > 0) {
                const totalBets = challenge.getTotalBets();
                embed.addFields({
                    name: '🎰 Total Bets',
                    value: `${gpUtils.formatGP(totalBets)} from ${challenge.bets.length} bet${challenge.bets.length !== 1 ? 's' : ''}`,
                    inline: true
                });
            }
            
            // Validate embed length before sending
            const validation = titleUtils.validateEmbedLength(embed.toJSON());
            if (!validation.valid) {
                console.warn(`Challenge embed too long (${validation.totalChars}/${validation.limit}), truncating...`);
                // Remove or truncate fields to fit
                if (embed.data.fields && embed.data.fields.length > 1) {
                    embed.spliceFields(-1, 1); // Remove last field
                }
            }
            
            // Update the message (no action buttons - feed is display only)
            await this.updateMessage(
                `challenge_${challenge.challengeId}`, 
                { embeds: [embed] }
            );
        } catch (error) {
            console.error(`Error creating challenge embed for ${challenge.challengeId}:`, error);
        }
    }

    /**
     * UPDATED: Use the same reliable API method as the arena service
     */
    async fetchLeaderboardScoresReliable(gameId, leaderboardId, raUsernames) {
        try {
            console.log(`Fetching leaderboard scores for game ${gameId}, leaderboard ${leaderboardId}`);
            console.log('Target users:', raUsernames);

            // Use the same reliable API utilities as arena service
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(leaderboardId, 1000);
            
            if (!rawEntries || rawEntries.length === 0) {
                console.log('No leaderboard data received from reliable API');
                return this.createNoScoreResults(raUsernames);
            }

            console.log(`Processed ${rawEntries.length} leaderboard entries from reliable API`);

            // Find entries for our target users
            const userScores = [];
            
            for (const username of raUsernames) {
                const entry = rawEntries.find(entry => {
                    return entry.User && entry.User.toLowerCase() === username.toLowerCase();
                });

                if (entry) {
                    userScores.push({
                        raUsername: username,
                        rank: entry.Rank,
                        score: entry.FormattedScore || entry.Score?.toString() || 'No score',
                        fetchedAt: new Date()
                    });
                    console.log(`Found score for ${username}: rank ${entry.Rank}, score ${entry.FormattedScore || entry.Score}`);
                } else {
                    userScores.push({
                        raUsername: username,
                        rank: null,
                        score: 'No score',
                        fetchedAt: new Date()
                    });
                    console.log(`No score found for ${username}`);
                }
            }

            return userScores;
        } catch (error) {
            console.error('Error fetching reliable leaderboard scores:', error);
            
            // Return no-score results for all users on error
            return this.createNoScoreResults(raUsernames);
        }
    }

    /**
     * Create no-score results for all users
     * @private
     */
    createNoScoreResults(raUsernames) {
        return raUsernames.map(username => ({
            raUsername: username,
            rank: null,
            score: 'No score',
            fetchedAt: new Date()
        }));
    }

    /**
     * Update the GP overview embed (replaces the leaderboard) - NEW VERSION
     */
    async updateGPOverviewEmbed() {
        try {
            console.log('Updating GP overview embed...');
            
            // Get the #1 richest user
            const topUser = await gpUtils.getGPLeaderboard(1);
            const richestUser = topUser && topUser.length > 0 ? topUser[0] : null;
            
            // Current timestamp in Discord format
            const timestamp = getDiscordTimestamp(new Date());
            
            // Create the GP overview embed
            const embed = createHeaderEmbed(
                '💰 GP (Game Points) - How to Earn & Spend',
                `**Complete guide to earning and spending GP**\n\n` +
                `Game Points (GP) are used for arena challenges, betting, and collecting gacha items.\n\n` +
                `**Current GP Leader:** ${richestUser ? `👑 **${richestUser.raUsername}** with ${gpUtils.formatGP(richestUser.gpBalance)}` : 'No users with GP yet'}\n\n` +
                `**Last Updated:** ${timestamp} | **Updates:** Every 30 minutes`,
                {
                    color: COLORS.SUCCESS, // Green for earning guide
                    footer: { 
                        text: 'GP balances update in real-time • Monthly 1,000 GP grants are automatic' 
                    }
                }
            );
            
            // Arena System rewards
            embed.addFields({
                name: '⚔️ Arena System',
                value: 
                    `• **Win Challenge**: Take all entry wagers + betting pool\n` +
                    `• **Win Bet**: Share losing bets proportionally\n` +
                    `• **Monthly Grant**: ${gpUtils.formatGP(1000)} on the 1st of each month`,
                inline: false
            });
            
            // Monthly/Shadow Challenge rewards
            embed.addFields({
                name: '🏆 Challenge Completions',
                value: 
                    `• **Monthly Mastery**: ${gpUtils.formatGP(GP_REWARDS.MONTHLY_MASTERY)} \n` +
                    `• **Monthly Beaten**: ${gpUtils.formatGP(GP_REWARDS.MONTHLY_BEATEN)} \n` +
                    `• **Monthly Participation**: ${gpUtils.formatGP(GP_REWARDS.MONTHLY_PARTICIPATION)} \n` +
                    `• **Shadow Mastery**: ${gpUtils.formatGP(GP_REWARDS.SHADOW_MASTERY)} \n` +
                    `• **Shadow Beaten**: ${gpUtils.formatGP(GP_REWARDS.SHADOW_BEATEN)} \n` +
                    `• **Shadow Participation**: ${gpUtils.formatGP(GP_REWARDS.SHADOW_PARTICIPATION)} `,
                inline: true
            });
            
            // Regular game completion rewards
            embed.addFields({
                name: '🎮 Regular Games',
                value: 
                    `• **Game Mastery**: ${gpUtils.formatGP(GP_REWARDS.REGULAR_MASTERY)} \n` +
                    `• **Game Beaten**: ${gpUtils.formatGP(GP_REWARDS.REGULAR_BEATEN)} \n\n` +
                    `*From achievement feed*`,
                inline: true
            });
            
            // Community participation rewards
            embed.addFields({
                name: '🗳️ Community Participation',
                value: 
                    `• **Nominate Game**: ${gpUtils.formatGP(GP_REWARDS.NOMINATION)} \n` +
                    `• **Vote in Poll**: ${gpUtils.formatGP(GP_REWARDS.VOTE)} \n\n` +
                    `*Monthly challenge polls*`,
                inline: true
            });
            
            // How to use GP
            embed.addFields({
                name: '💸 How to Spend GP',
                value: 
                    `• **Arena Challenges**: Create or join challenges\n` +
                    `• **Arena Betting**: Bet on active challenges\n` +
                    `• **Gacha Machine**: Pull for collectible items in <#1377092881885696022>\n` +
                    `  - Single Pull: ${gpUtils.formatGP(50)} \n` +
                    `  - Multi Pull: ${gpUtils.formatGP(150)}  (4 items)\n\n` +
                    `*Use </arena:1234567890> for arena system*`,
                inline: false
            });
            
            // Update or create the GP overview message
            await this.updateMessage(
                'gp_overview',
                { embeds: [embed] }
            );
            
            console.log('GP overview embed updated successfully');
        } catch (error) {
            console.error('Error creating GP overview embed:', error);
        }
    }
}

// Create singleton instance
const arenaFeedService = new ArenaFeedService();
export default arenaFeedService;
