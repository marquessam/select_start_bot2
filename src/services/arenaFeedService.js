// src/services/arenaFeedService.js
import { User } from '../models/User.js';
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS, createHeaderEmbed, createLeaderboardEmbed, getDiscordTimestamp } from '../utils/FeedUtils.js';
import { EmbedBuilder } from 'discord.js';
import gpUtils from '../utils/gpUtils.js';
import arenaUtils from '../utils/arenaUtils.js';

class ArenaFeedService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arenaFeedChannelId || '1373570913882214410');
        this.headerMessageId = null;
        this.overviewMessageId = null;
        this.directChallengesMessageId = null;
        this.openChallengesMessageId = null;
        this.leaderboardMessageId = null;
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
            
            console.log('Updating arena feed...');
            
            // Update header first
            await this.updateArenaHeader();
            
            // Update overview embed (yellow)
            await this.updateArenaOverview();
            
            // Update direct challenges (red)
            await this.updateDirectChallenges();
            
            // Update open challenges (blue)
            await this.updateOpenChallenges();
            
            // Update GP leaderboard last (yellow) - NOW STANDARDIZED
            await this.updateGPLeaderboard();
            
            console.log('Arena feed update completed');
        } catch (error) {
            console.error('Error updating arena feed:', error);
        }
    }

    async updateArenaHeader() {
        // Format current time for the header message
        const now = new Date();
        const timestamp = getDiscordTimestamp(now);
        
        // Create header content
        const headerContent = 
            `# ${EMOJIS.ARENA} Arena Challenge System\n` + 
            `Active challenges, betting opportunities, and GP rankings are shown below.\n` +
            `**Last Updated:** ${timestamp} | **Updates:** Every 30 minutes\n` +
            `Use \`/arena\` to participate in challenges, place bets, and claim your monthly GP!`;
        
        // Use the base class method to update the header
        this.headerMessageId = await this.updateHeader({ content: headerContent });
    }

    /**
     * Create or update the arena overview embed
     */
    async updateArenaOverview() {
        try {
            const channel = await this.getChannel();
            if (!channel) return;

            // Get stats for the overview
            const now = new Date();
            
            // Count challenges by type and status
            const directChallenges = await ArenaChallenge.countDocuments({
                type: 'direct',
                status: { $in: ['pending', 'active'] }
            });
            
            const openChallenges = await ArenaChallenge.countDocuments({
                type: 'open',
                status: 'active'
            });
            
            const completedToday = await ArenaChallenge.countDocuments({
                status: 'completed',
                processedAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
            });
            
            // Get total GP in circulation
            const systemStats = await gpUtils.getSystemGPStats();
            
            // Create embed using standardized utility
            const embed = createHeaderEmbed(
                `${EMOJIS.ARENA} Arena System Overview`,
                'The **Arena Challenge System** lets you compete against other players on RetroAchievements leaderboards!\n\n' +
                '**How It Works:**\n' +
                `• **Create Challenges:** Start direct 1v1 or open challenges\n` +
                `• **Place Bets:** Bet GP on who will win active challenges\n` +
                `• **Earn GP:** Win challenges and bets to earn Game Points\n` +
                `• **Monthly Allowance:** Claim 1,000 GP free each month\n\n` +
                '**Current Activity:**',
                {
                    color: COLORS.WARNING, // Yellow for overview
                    timestamp: false
                }
            );
                
            // Add current status
            let statusField = '';
            statusField += `• **Direct Challenges:** ${directChallenges} (1v1 pending/active)\n`;
            statusField += `• **Open Challenges:** ${openChallenges} (anyone can join)\n`;
            statusField += `• **Completed Today:** ${completedToday} challenges\n`;
            statusField += `• **Total GP in System:** ${gpUtils.formatGP(systemStats.totalGP)}\n`;
            statusField += `• **Active Users:** ${systemStats.usersWithGP} with GP balances`;
            
            embed.addFields({ name: 'System Status', value: statusField });
            
            // Add participation info
            embed.addFields({ 
                name: 'How to Participate', 
                value: 'Use `/arena` to access the full Arena menu where you can create challenges, place bets, claim your monthly GP, and view leaderboards!\n\nOnly registered RetroAchievements users can participate. Use `/register` to link your account.'
            });
            
            // Add footer
            embed.setFooter({ 
                text: 'Challenges run for 7 days • Betting closes 3 days after start • Winners determined by RA leaderboard rank'
            });
            
            // Send or update the overview embed
            this.overviewMessageId = await this.updateMessage('arena_overview', { embeds: [embed] });
        } catch (error) {
            console.error('Error updating arena overview:', error);
        }
    }

    /**
     * Update direct challenges embed (red)
     */
    async updateDirectChallenges() {
        try {
            const channel = await this.getChannel();
            if (!channel) return;

            // Get direct challenges (pending and active)
            const directChallenges = await ArenaChallenge.find({
                type: 'direct',
                status: { $in: ['pending', 'active'] }
            }).sort({ createdAt: -1 }).limit(10);

            // Create embed using standardized utility
            const embed = createHeaderEmbed(
                `⚔️ Direct Challenges (1v1)`,
                directChallenges.length === 0 ?
                    'No active direct challenges at the moment.\n\n' +
                    'Direct challenges are 1v1 competitions where you challenge a specific player. ' +
                    'The target player has 24 hours to accept, then you compete for 7 days!' :
                    `Currently **${directChallenges.length}** active direct challenge(s).\n\n` +
                    'These are 1v1 competitions between specific players. Non-participants can bet on the outcome!',
                {
                    color: COLORS.DANGER, // Red for direct challenges
                    timestamp: true
                }
            );

            if (directChallenges.length === 0) {
                embed.addFields({ 
                    name: 'No Active Challenges', 
                    value: 'Be the first to create a direct challenge with `/arena`!',
                    inline: false 
                });
            } else {
                // Group challenges by status
                const pendingChallenges = directChallenges.filter(c => c.status === 'pending');
                const activeChallenges = directChallenges.filter(c => c.status === 'active');

                // Add pending challenges
                if (pendingChallenges.length > 0) {
                    const pendingText = pendingChallenges
                        .map(challenge => {
                            const timeLeft = Math.max(0, (challenge.createdAt.getTime() + 24 * 60 * 60 * 1000) - Date.now());
                            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
                            return `**${challenge.challengeId}** - ${challenge.gameTitle}\n` +
                                   `${challenge.creatorRaUsername} → ${challenge.targetRaUsername}\n` +
                                   `Wager: ${gpUtils.formatGP(challenge.participants[0]?.wager || 0)} | ` +
                                   `Expires: ${hoursLeft}h`;
                        })
                        .join('\n\n');
                    
                    embed.addFields({ 
                        name: `⏳ Pending Acceptance (${pendingChallenges.length})`, 
                        value: pendingText,
                        inline: false 
                    });
                }

                // Add active challenges
                if (activeChallenges.length > 0) {
                    const activeText = activeChallenges
                        .map(challenge => {
                            const timeLeft = Math.max(0, challenge.endedAt.getTime() - Date.now());
                            const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                            const canBet = challenge.canBet() ? ' 🎰' : '';
                            return `**${challenge.challengeId}** - ${challenge.gameTitle}${canBet}\n` +
                                   `${challenge.participants.map(p => p.raUsername).join(' vs ')}\n` +
                                   `Prize Pool: ${gpUtils.formatGP(challenge.getTotalWager())} | ` +
                                   `${daysLeft}d left` +
                                   (challenge.bets.length > 0 ? ` | Bets: ${gpUtils.formatGP(challenge.getTotalBets())}` : '');
                        })
                        .join('\n\n');
                    
                    embed.addFields({ 
                        name: `🔥 Active Competition (${activeChallenges.length})`, 
                        value: activeText,
                        inline: false 
                    });
                }
            }

            embed.addFields({ 
                name: 'Create Your Own', 
                value: 'Use `/arena` → "Create Challenge" to start a direct 1v1 challenge!',
                inline: false 
            });
            
            this.directChallengesMessageId = await this.updateMessage('direct_challenges', { embeds: [embed] });
        } catch (error) {
            console.error('Error updating direct challenges:', error);
        }
    }

    /**
     * Update open challenges embed (blue)
     */
    async updateOpenChallenges() {
        try {
            const channel = await this.getChannel();
            if (!channel) return;

            // Get open challenges (active only)
            const openChallenges = await ArenaChallenge.find({
                type: 'open',
                status: 'active'
            }).sort({ createdAt: -1 }).limit(10);

            // Create embed using standardized utility
            const embed = createHeaderEmbed(
                `🌍 Open Challenges (Free-for-All)`,
                openChallenges.length === 0 ?
                    'No open challenges at the moment.\n\n' +
                    'Open challenges are competitions where anyone can join! ' +
                    'Multiple players compete and the winner takes the entire prize pool.' :
                    `Currently **${openChallenges.length}** open challenge(s) accepting participants.\n\n` +
                    'Anyone can join these challenges! The more participants, the bigger the prize pool.',
                {
                    color: COLORS.PRIMARY, // Blue for open challenges
                    timestamp: true
                }
            );

            if (openChallenges.length === 0) {
                embed.addFields({ 
                    name: 'No Open Challenges', 
                    value: 'Create an open challenge with `/arena` for everyone to join!',
                    inline: false 
                });
            } else {
                const challengeText = openChallenges
                    .map(challenge => {
                        const timeLeft = Math.max(0, challenge.endedAt.getTime() - Date.now());
                        const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                        const canJoin = challenge.canJoin() ? ' 🚀' : '';
                        const canBet = challenge.canBet() ? ' 🎰' : '';
                        
                        return `**${challenge.challengeId}** - ${challenge.gameTitle}${canJoin}${canBet}\n` +
                               `Created by: ${challenge.creatorRaUsername}\n` +
                               `Participants: ${challenge.participants.length} | ` +
                               `Prize Pool: ${gpUtils.formatGP(challenge.getTotalWager())}\n` +
                               `Entry Fee: ${gpUtils.formatGP(challenge.participants[0]?.wager || 0)} | ` +
                               `${daysLeft}d left` +
                               (challenge.bets.length > 0 ? `\nBets: ${gpUtils.formatGP(challenge.getTotalBets())} from ${challenge.bets.length} bettor(s)` : '');
                    })
                    .join('\n\n');
                
                embed.addFields({ 
                    name: `🎯 Join the Competition!`, 
                    value: challengeText,
                    inline: false 
                });

                // Add legend
                embed.addFields({ 
                    name: 'Symbols', 
                    value: '🚀 = Can join | 🎰 = Can bet | Use `/arena challenge <id>` for details',
                    inline: false 
                });
            }

            embed.addFields({ 
                name: 'Create Your Own', 
                value: 'Use `/arena` → "Create Challenge" and leave target empty for an open challenge!',
                inline: false 
            });
            
            this.openChallengesMessageId = await this.updateMessage('open_challenges', { embeds: [embed] });
        } catch (error) {
            console.error('Error updating open challenges:', error);
        }
    }

    /**
     * Update GP leaderboard embed (yellow) - STANDARDIZED TO MATCH ARCADE FEED
     */
    async updateGPLeaderboard() {
        try {
            const channel = await this.getChannel();
            if (!channel) return;

            // Get top 10 GP users (increased from 5 to match arcade feed style)
            const gpLeaderboard = await gpUtils.getGPLeaderboard(10);
            
            // Get system stats
            const systemStats = await gpUtils.getSystemGPStats();

            // Current timestamp in Discord format
            const timestamp = getDiscordTimestamp(new Date());

            // Create embed using standardized utility - MATCHING ARCADE FEED STYLE
            const embed = createHeaderEmbed(
                '🏆 GP Balance Leaderboard',
                `**Top 10 users by current GP balance**\n\n` +
                `Game Points (GP) are used to create challenges and place bets. ` +
                `Everyone gets 1,000 GP free each month!\n\n` +
                `**Last Updated:** ${timestamp}\n\n` +
                `*Note: Only users with GP balances greater than 0 are shown.*`,
                {
                    color: COLORS.WARNING, // Yellow for leaderboard - matching arcade feed
                    timestamp: true,
                    footer: { 
                        text: 'GP rankings update every 30 minutes • Use /arena for full leaderboards and stats'
                    }
                }
            );

            // STANDARDIZED LEADERBOARD FORMATTING - MATCHING ARCADE FEED EXACTLY
            if (gpLeaderboard.length > 0) {
                // Process leaderboard entries to match arcade feed format
                const displayEntries = gpLeaderboard.slice(0, 10);
                let leaderboardText = '';
                
                displayEntries.forEach((user, index) => {
                    const displayRank = index + 1;
                    const medalEmoji = displayRank <= 3 ? EMOJIS[`RANK_${displayRank}`] : `${displayRank}.`;
                    
                    // Format additional info (win rate) similar to global rank in arcade
                    const additionalInfo = user.winRate > 0 ? ` (Win Rate: ${user.winRate}%)` : '';
                    
                    // EXACT SAME FORMAT AS ARCADE FEED: emoji + username + score + additional info
                    leaderboardText += `${medalEmoji} **${user.raUsername}**: ${gpUtils.formatGP(user.gpBalance)}${additionalInfo}\n`;
                });
                
                embed.addFields({ 
                    name: 'Current Top 10', 
                    value: leaderboardText,
                    inline: false 
                });
                
                // Add total participants count - matching arcade feed style
                embed.addFields({ 
                    name: 'Participants', 
                    value: `${systemStats.usersWithGP} registered members have GP balances`
                });
            } else {
                embed.addFields({ 
                    name: 'No GP Rankings', 
                    value: 'No users have GP balances yet. Claim your free 1,000 GP with `/arena claim`!',
                    inline: false 
                });
            }

            // Add system statistics - similar to arcade points summary
            embed.addFields({
                name: '📊 System Statistics',
                value: 
                    `**Total Users:** ${systemStats.totalUsers}\n` +
                    `**Users with GP:** ${systemStats.usersWithGP}\n` +
                    `**Total GP in Circulation:** ${gpUtils.formatGP(systemStats.totalGP)}\n` +
                    `**Total Challenges Created:** ${systemStats.totalChallengesCreated}\n` +
                    `**Average GP per User:** ${gpUtils.formatGP(systemStats.avgGP)}`,
                inline: false
            });

            embed.addFields({ 
                name: 'Claim Your GP', 
                value: 'Use `/arena claim` to get your free 1,000 GP monthly allowance!',
                inline: false 
            });
            
            this.leaderboardMessageId = await this.updateMessage('gp_leaderboard', { embeds: [embed] });
        } catch (error) {
            console.error('Error updating GP leaderboard:', error);
        }
    }

    /**
     * Override shouldClearOnStart to prevent clearing the arena feed on startup
     */
    shouldClearOnStart() {
        return false; // Don't clear the arena feed on startup to preserve message IDs
    }

    /**
     * Manual method to clear and reset the feed (for admin use)
     */
    async clearAndResetFeed() {
        await this.clearChannel();
        this.headerMessageId = null;
        this.overviewMessageId = null;
        this.directChallengesMessageId = null;
        this.openChallengesMessageId = null;
        this.leaderboardMessageId = null;
        console.log('Arena feed cleared and reset');
    }
}

// Create singleton instance
const arenaFeedService = new ArenaFeedService();
export default arenaFeedService;
