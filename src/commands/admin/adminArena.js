// src/commands/admin/adminArena.js
import { 
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle
} from 'discord.js';
import { config } from '../../config/config.js';
import { User } from '../../models/User.js';
import { ArenaChallenge } from '../../models/ArenaChallenge.js';
import arenaService from '../../services/arenaService.js';
import gpUtils from '../../utils/gpUtils.js';
import arenaUtils from '../../utils/arenaUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminarena')
        .setDescription('Administrative functions for the Arena system')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View overall Arena system status and statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('challenges')
                .setDescription('View and manage all challenges')
                .addStringOption(option =>
                    option.setName('status')
                        .setDescription('Filter by challenge status')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All', value: 'all' },
                            { name: 'Pending', value: 'pending' },
                            { name: 'Active', value: 'active' },
                            { name: 'Completed', value: 'completed' },
                            { name: 'Cancelled', value: 'cancelled' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('challenge')
                .setDescription('Manage a specific challenge')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('Challenge ID')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'View Details', value: 'view' },
                            { name: 'Force Complete', value: 'complete' },
                            { name: 'Cancel & Refund', value: 'cancel' },
                            { name: 'Reprocess', value: 'reprocess' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Manage user GP and arena stats')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('RetroAchievements username')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'View Stats', value: 'view' },
                            { name: 'Adjust GP', value: 'adjust' },
                            { name: 'Reset Stats', value: 'reset' },
                            { name: 'Force Monthly Claim', value: 'claim' }
                        )
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('GP amount for adjustment (positive or negative)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for adjustment')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('system')
                .setDescription('System-level arena operations')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('System action to perform')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Check Completed Challenges', value: 'check_completed' },
                            { name: 'Process Timeouts', value: 'process_timeouts' },
                            { name: 'Update Feeds', value: 'update_feeds' },
                            { name: 'Emergency Stop', value: 'emergency_stop' },
                            { name: 'System Stats', value: 'stats' },
                            { name: 'RESET ENTIRE SYSTEM', value: 'reset_system' }
                        )
                )
                .addBooleanOption(option =>
                    option.setName('confirm_reset')
                        .setDescription('REQUIRED: Set to true to confirm system reset (DESTRUCTIVE!)')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        switch(subcommand) {
            case 'status':
                await this.handleSystemStatus(interaction);
                break;
            case 'challenges':
                await this.handleViewChallenges(interaction);
                break;
            case 'challenge':
                await this.handleManageChallenge(interaction);
                break;
            case 'user':
                await this.handleManageUser(interaction);
                break;
            case 'system':
                await this.handleSystemAction(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand. Please try again.',
                    ephemeral: true
                });
        }
    },

    /**
     * Display overall Arena system status
     */
    async handleSystemStatus(interaction) {
        await interaction.deferReply();

        try {
            // Get system statistics
            const systemStats = await gpUtils.getSystemGPStats();
            
            // Get challenge statistics
            const challengeStats = await ArenaChallenge.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalWagers: { $sum: { $size: '$participants' } },
                        totalBets: { $sum: { $size: '$bets' } }
                    }
                }
            ]);

            // Get recent activity
            const recentChallenges = await ArenaChallenge.find({})
                .sort({ createdAt: -1 })
                .limit(5)
                .select('challengeId gameTitle status createdAt participants');

            const embed = new EmbedBuilder()
                .setTitle('🏟️ Arena System Status')
                .setDescription('Complete overview of the Arena challenge system')
                .setColor('#0099FF')
                .setTimestamp();

            // System GP Statistics
            embed.addFields({
                name: '💰 GP System Statistics',
                value: 
                    `**Total Users:** ${systemStats.totalUsers}\n` +
                    `**Users with GP:** ${systemStats.usersWithGP}\n` +
                    `**Total GP in Circulation:** ${gpUtils.formatGP(systemStats.totalGP)}\n` +
                    `**Average GP per User:** ${gpUtils.formatGP(systemStats.avgGP)}\n` +
                    `**Richest User:** ${gpUtils.formatGP(systemStats.maxGP)}`,
                inline: false
            });

            // Challenge Statistics
            let challengeStatusText = '';
            let totalChallenges = 0;
            let totalWagers = 0;
            let totalBets = 0;

            challengeStats.forEach(stat => {
                const statusEmoji = {
                    'pending': '⏳',
                    'active': '🔥',
                    'completed': '✅',
                    'cancelled': '❌'
                };
                challengeStatusText += `${statusEmoji[stat._id] || '❓'} **${stat._id}:** ${stat.count}\n`;
                totalChallenges += stat.count;
                totalWagers += stat.totalWagers;
                totalBets += stat.totalBets;
            });

            embed.addFields({
                name: '🏆 Challenge Statistics',
                value: 
                    challengeStatusText +
                    `\n**Total Challenges:** ${totalChallenges}\n` +
                    `**Total Wagers Placed:** ${totalWagers}\n` +
                    `**Total Bets Placed:** ${totalBets}`,
                inline: true
            });

            // Arena Activity Statistics
            embed.addFields({
                name: '📊 Arena Activity',
                value: 
                    `**Challenges Created:** ${systemStats.totalChallengesCreated}\n` +
                    `**Challenges Won:** ${systemStats.totalChallengesWon}\n` +
                    `**Total GP Won:** ${gpUtils.formatGP(systemStats.totalGpWon)}\n` +
                    `**Total GP Wagered:** ${gpUtils.formatGP(systemStats.totalGpWagered)}\n` +
                    `**Bets Placed:** ${systemStats.totalBetsPlaced}\n` +
                    `**Bets Won:** ${systemStats.totalBetsWon}`,
                inline: true
            });

            // Recent Challenges
            if (recentChallenges.length > 0) {
                const recentText = recentChallenges
                    .map(challenge => {
                        const statusEmoji = {
                            'pending': '⏳',
                            'active': '🔥',
                            'completed': '✅',
                            'cancelled': '❌'
                        };
                        return `${statusEmoji[challenge.status]} **${challenge.challengeId}**\n` +
                               `Game: ${challenge.gameTitle}\n` +
                               `Participants: ${challenge.participants.length}\n` +
                               `Created: ${challenge.createdAt.toLocaleDateString()}`;
                    })
                    .join('\n\n');

                embed.addFields({
                    name: '🕒 Recent Challenges',
                    value: recentText.length > 1024 ? recentText.substring(0, 1021) + '...' : recentText,
                    inline: false
                });
            }

            // System Health Check
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            
            const recentCompletions = await ArenaChallenge.countDocuments({
                status: 'completed',
                processedAt: { $gte: oneHourAgo }
            });

            const stuckChallenges = await ArenaChallenge.countDocuments({
                status: 'active',
                endedAt: { $lt: now },
                processed: false
            });

            const healthStatus = stuckChallenges === 0 ? '🟢 Healthy' : `🔴 ${stuckChallenges} stuck challenge(s)`;
            
            embed.addFields({
                name: '🏥 System Health',
                value: 
                    `**Status:** ${healthStatus}\n` +
                    `**Recent Completions (1h):** ${recentCompletions}\n` +
                    `**Processing Service:** ${arenaService.isProcessing ? '🔄 Running' : '✅ Idle'}\n` +
                    `**Last Check:** ${now.toLocaleTimeString()}`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching arena system status:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching system status. Please try again.'
            });
        }
    },

    /**
     * View and manage challenges
     */
    async handleViewChallenges(interaction) {
        await interaction.deferReply();

        try {
            const statusFilter = interaction.options.getString('status') || 'all';
            
            let filter = {};
            if (statusFilter !== 'all') {
                filter.status = statusFilter;
            }

            const challenges = await ArenaChallenge.find(filter)
                .sort({ createdAt: -1 })
                .limit(10);

            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${statusFilter === 'all' ? 'All' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Challenges`)
                .setDescription(`Showing up to 10 most recent challenges`)
                .setColor('#0099FF')
                .setTimestamp();

            if (challenges.length === 0) {
                embed.addFields({
                    name: 'No Challenges Found',
                    value: `No challenges found with status: ${statusFilter}`,
                    inline: false
                });
            } else {
                for (const challenge of challenges) {
                    const statusEmoji = {
                        'pending': '⏳',
                        'active': '🔥',
                        'completed': '✅',
                        'cancelled': '❌'
                    };

                    let fieldValue = 
                        `${statusEmoji[challenge.status]} **Status:** ${challenge.status}\n` +
                        `**Type:** ${challenge.type === 'direct' ? '⚔️ Direct' : '🌍 Open'}\n` +
                        `**Creator:** ${challenge.creatorRaUsername}\n` +
                        `**Participants:** ${challenge.participants.length}\n` +
                        `**Total Wager:** ${gpUtils.formatGP(challenge.getTotalWager())}\n` +
                        `**Bets:** ${challenge.bets.length} (${gpUtils.formatGP(challenge.getTotalBets())})\n` +
                        `**Created:** ${challenge.createdAt.toLocaleDateString()}`;

                    if (challenge.status === 'active' && challenge.endedAt) {
                        const timeLeft = Math.max(0, challenge.endedAt.getTime() - Date.now());
                        const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
                        fieldValue += `\n**Time Left:** ${hoursLeft > 0 ? `${hoursLeft}h` : 'Ending soon'}`;
                    }

                    if (challenge.status === 'completed' && challenge.winnerRaUsername) {
                        fieldValue += `\n**Winner:** ${challenge.winnerRaUsername}`;
                    }

                    embed.addFields({
                        name: `${challenge.challengeId} - ${challenge.gameTitle}`,
                        value: fieldValue,
                        inline: true
                    });
                }
            }

            // Add action buttons
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('admin_arena_refresh_challenges')
                        .setLabel('Refresh')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔄'),
                    new ButtonBuilder()
                        .setCustomId('admin_arena_check_completed')
                        .setLabel('Check Completed')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('✅'),
                    new ButtonBuilder()
                        .setCustomId('admin_arena_process_timeouts')
                        .setLabel('Process Timeouts')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('⏰')
                );

            await interaction.editReply({ 
                embeds: [embed],
                components: [buttons]
            });
        } catch (error) {
            console.error('Error fetching challenges:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching challenges. Please try again.'
            });
        }
    },

    /**
     * Manage a specific challenge
     */
    async handleManageChallenge(interaction) {
        await interaction.deferReply();

        try {
            const challengeId = interaction.options.getString('id');
            const action = interaction.options.getString('action');

            const challenge = await ArenaChallenge.findOne({ challengeId });
            if (!challenge) {
                return interaction.editReply(`❌ Challenge "${challengeId}" not found.`);
            }

            switch (action) {
                case 'view':
                    await this.viewChallengeDetails(interaction, challenge);
                    break;
                case 'complete':
                    await this.forceCompleteChallenge(interaction, challenge);
                    break;
                case 'cancel':
                    await this.cancelChallenge(interaction, challenge);
                    break;
                case 'reprocess':
                    await this.reprocessChallenge(interaction, challenge);
                    break;
                default:
                    await interaction.editReply('Invalid action specified.');
            }
        } catch (error) {
            console.error('Error managing challenge:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    /**
     * View detailed challenge information
     * @private
     */
    async viewChallengeDetails(interaction, challenge) {
        const embed = new EmbedBuilder()
            .setTitle(`🔍 Challenge Details: ${challenge.challengeId}`)
            .setDescription(`Complete information for challenge ${challenge.challengeId}`)
            .setColor('#0099FF')
            .setTimestamp();

        // Basic info
        embed.addFields({
            name: '📋 Basic Information',
            value: 
                `**ID:** ${challenge.challengeId}\n` +
                `**Type:** ${challenge.type === 'direct' ? '⚔️ Direct' : '🌍 Open'}\n` +
                `**Status:** ${challenge.status}\n` +
                `**Game:** ${challenge.gameTitle} (ID: ${challenge.gameId})\n` +
                `**Leaderboard:** ${challenge.leaderboardTitle} (ID: ${challenge.leaderboardId})\n` +
                `**Created:** ${challenge.createdAt.toISOString()}\n` +
                `**Processed:** ${challenge.processed ? '✅ Yes' : '❌ No'}`,
            inline: false
        });

        // Creator and target info
        let creatorTargetText = `**Creator:** ${challenge.creatorRaUsername} (${challenge.creatorId})`;
        if (challenge.targetRaUsername) {
            creatorTargetText += `\n**Target:** ${challenge.targetRaUsername} (${challenge.targetId})`;
        }
        embed.addFields({
            name: '👥 Creator & Target',
            value: creatorTargetText,
            inline: true
        });

        // Timing info
        let timingText = `**Created:** ${challenge.createdAt.toLocaleString()}`;
        if (challenge.startedAt) {
            timingText += `\n**Started:** ${challenge.startedAt.toLocaleString()}`;
        }
        if (challenge.endedAt) {
            timingText += `\n**Ends:** ${challenge.endedAt.toLocaleString()}`;
        }
        if (challenge.bettingClosedAt) {
            timingText += `\n**Betting Closes:** ${challenge.bettingClosedAt.toLocaleString()}`;
        }
        if (challenge.processedAt) {
            timingText += `\n**Processed:** ${challenge.processedAt.toLocaleString()}`;
        }
        embed.addFields({
            name: '⏰ Timing',
            value: timingText,
            inline: true
        });

        // Participants
        if (challenge.participants.length > 0) {
            const participantsText = challenge.participants
                .map(p => `• **${p.raUsername}** - ${gpUtils.formatGP(p.wager)} (${p.joinedAt.toLocaleDateString()})`)
                .join('\n');
            embed.addFields({
                name: '🎯 Participants',
                value: participantsText,
                inline: false
            });
        }

        // Bets
        if (challenge.bets.length > 0) {
            const betsText = challenge.bets
                .map(b => `• **${b.username}** bet ${gpUtils.formatGP(b.amount)} on **${b.targetRaUsername}** (${b.placedAt.toLocaleDateString()})`)
                .join('\n');
            embed.addFields({
                name: '🎰 Bets',
                value: betsText.length > 1024 ? betsText.substring(0, 1021) + '...' : betsText,
                inline: false
            });
        }

        // Final scores (if completed)
        if (challenge.finalScores && challenge.finalScores.length > 0) {
            const scoresText = challenge.finalScores
                .sort((a, b) => (a.rank || 999) - (b.rank || 999))
                .map(score => `• **${score.raUsername}**: Rank ${score.rank || 'N/A'} (${score.score})`)
                .join('\n');
            embed.addFields({
                name: '📊 Final Scores',
                value: scoresText,
                inline: false
            });
        }

        // Winner info
        if (challenge.winnerRaUsername) {
            embed.addFields({
                name: '🏆 Winner',
                value: `**${challenge.winnerRaUsername}** won ${gpUtils.formatGP(challenge.getTotalWager())}`,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    /**
     * Force complete a challenge
     * @private
     */
    async forceCompleteChallenge(interaction, challenge) {
        if (challenge.status !== 'active') {
            return interaction.editReply(`❌ Challenge must be active to force complete. Current status: ${challenge.status}`);
        }

        await interaction.editReply('🔄 Force completing challenge...');

        try {
            await arenaService.processCompletedChallenge(challenge);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Challenge Force Completed')
                .setDescription(
                    `Challenge ${challenge.challengeId} has been force completed.\n\n` +
                    `**Status:** Completed\n` +
                    `**Winner:** ${challenge.winnerRaUsername || 'No winner'}\n` +
                    `**Total Wager:** ${gpUtils.formatGP(challenge.getTotalWager())}\n` +
                    `**Total Bets:** ${gpUtils.formatGP(challenge.getTotalBets())}`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error force completing challenge:', error);
            await interaction.editReply(`❌ Error force completing challenge: ${error.message}`);
        }
    },

    /**
     * Cancel and refund a challenge
     * @private
     */
    async cancelChallenge(interaction, challenge) {
        if (challenge.status === 'completed' || challenge.status === 'cancelled') {
            return interaction.editReply(`❌ Cannot cancel challenge with status: ${challenge.status}`);
        }

        await interaction.editReply('🔄 Cancelling and refunding challenge...');

        try {
            await arenaService.refundChallenge(challenge, 'Admin cancellation');
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Challenge Cancelled')
                .setDescription(
                    `Challenge ${challenge.challengeId} has been cancelled and all participants refunded.\n\n` +
                    `**Participants Refunded:** ${challenge.participants.length}\n` +
                    `**Bettors Refunded:** ${challenge.bets.length}\n` +
                    `**Total Refunded:** ${gpUtils.formatGP(challenge.getTotalWager() + challenge.getTotalBets())}`
                )
                .setColor('#FFA500')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error cancelling challenge:', error);
            await interaction.editReply(`❌ Error cancelling challenge: ${error.message}`);
        }
    },

    /**
     * Reprocess a completed challenge
     * @private
     */
    async reprocessChallenge(interaction, challenge) {
        if (challenge.status !== 'completed') {
            return interaction.editReply(`❌ Can only reprocess completed challenges. Current status: ${challenge.status}`);
        }

        await interaction.editReply('🔄 Reprocessing challenge...');

        try {
            // Reset processing flags
            challenge.processed = false;
            challenge.processedAt = null;
            challenge.status = 'active';
            challenge.winnerRaUsername = null;
            challenge.winnerUserId = null;
            challenge.finalScores = [];
            await challenge.save();

            // Process again
            await arenaService.processCompletedChallenge(challenge);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Challenge Reprocessed')
                .setDescription(
                    `Challenge ${challenge.challengeId} has been reprocessed.\n\n` +
                    `**New Winner:** ${challenge.winnerRaUsername || 'No winner'}\n` +
                    `**Status:** ${challenge.status}`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error reprocessing challenge:', error);
            await interaction.editReply(`❌ Error reprocessing challenge: ${error.message}`);
        }
    },

    /**
     * Manage user GP and stats
     */
    async handleManageUser(interaction) {
        await interaction.deferReply();

        try {
            const username = interaction.options.getString('username');
            const action = interaction.options.getString('action');
            const amount = interaction.options.getInteger('amount');
            const reason = interaction.options.getString('reason');

            const user = await User.findOne({ raUsername: username });
            if (!user) {
                return interaction.editReply(`❌ User "${username}" not found in database.`);
            }

            switch (action) {
                case 'view':
                    await this.viewUserStats(interaction, user);
                    break;
                case 'adjust':
                    if (amount === null) {
                        return interaction.editReply('❌ Amount is required for GP adjustment.');
                    }
                    if (!reason) {
                        return interaction.editReply('❌ Reason is required for GP adjustment.');
                    }
                    await this.adjustUserGP(interaction, user, amount, reason);
                    break;
                case 'reset':
                    await this.resetUserStats(interaction, user);
                    break;
                case 'claim':
                    await this.forceMonthlyGP(interaction, user);
                    break;
                default:
                    await interaction.editReply('Invalid action specified.');
            }
        } catch (error) {
            console.error('Error managing user:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    /**
     * View detailed user statistics
     * @private
     */
    async viewUserStats(interaction, user) {
        const embed = new EmbedBuilder()
            .setTitle(`👤 User Stats: ${user.raUsername}`)
            .setDescription(`Complete Arena statistics for ${user.raUsername}`)
            .setColor('#0099FF')
            .setTimestamp();

        // Basic info
        embed.addFields({
            name: '📋 Basic Information',
            value: 
                `**Discord ID:** ${user.discordId}\n` +
                `**Username:** ${user.username}\n` +
                `**RA Username:** ${user.raUsername}\n` +
                `**GP Balance:** ${gpUtils.formatGP(user.gpBalance)}\n` +
                `**Last Monthly Claim:** ${user.lastMonthlyGpClaim ? user.lastMonthlyGpClaim.toLocaleDateString() : 'Never'}\n` +
                `**Can Claim Now:** ${user.canClaimMonthlyGp() ? '✅ Yes' : '❌ No'}`,
            inline: false
        });

        // Arena stats
        if (user.arenaStats) {
            embed.addFields({
                name: '🏆 Arena Statistics',
                value: 
                    `**Challenges Created:** ${user.arenaStats.challengesCreated || 0}\n` +
                    `**Challenges Won:** ${user.arenaStats.challengesWon || 0}\n` +
                    `**Challenges Participated:** ${user.arenaStats.challengesParticipated || 0}\n` +
                    `**Win Rate:** ${user.getGpWinRate()}%\n` +
                    `**Total GP Won:** ${gpUtils.formatGP(user.arenaStats.totalGpWon || 0)}\n` +
                    `**Total GP Wagered:** ${gpUtils.formatGP(user.arenaStats.totalGpWagered || 0)}`,
                inline: true
            });

            embed.addFields({
                name: '🎰 Betting Statistics',
                value: 
                    `**Bets Placed:** ${user.arenaStats.betsPlaced || 0}\n` +
                    `**Bets Won:** ${user.arenaStats.betsWon || 0}\n` +
                    `**Bet Win Rate:** ${user.getBetWinRate()}%\n` +
                    `**Total GP Bet:** ${gpUtils.formatGP(user.arenaStats.totalGpBet || 0)}`,
                inline: true
            });
        }

        // Recent transactions
        const transactions = await gpUtils.getTransactionHistory(user, 5);
        if (transactions.length > 0) {
            const transactionText = transactions
                .map(tx => {
                    const formatted = gpUtils.formatTransaction(tx);
                    return `${formatted.emoji} **${formatted.amount} GP** - ${formatted.description}`;
                })
                .join('\n');
            embed.addFields({
                name: '💳 Recent Transactions (Last 5)',
                value: transactionText,
                inline: false
            });
        }

        // Current challenges
        const userChallenges = await arenaService.getUserChallenges(user.discordId, 3);
        if (userChallenges.length > 0) {
            const challengeText = userChallenges
                .map(challenge => {
                    const statusEmoji = {
                        'pending': '⏳',
                        'active': '🔥',
                        'completed': '✅',
                        'cancelled': '❌'
                    };
                    return `${statusEmoji[challenge.status]} **${challenge.challengeId}** - ${challenge.gameTitle}`;
                })
                .join('\n');
            embed.addFields({
                name: '🎯 Recent Challenges',
                value: challengeText,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    /**
     * Adjust user's GP balance
     * @private
     */
    async adjustUserGP(interaction, user, amount, reason) {
        const oldBalance = user.gpBalance;
        
        try {
            await gpUtils.adminAdjustGP(user, amount, reason, interaction.user.username);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ GP Adjustment Complete')
                .setDescription(
                    `GP balance adjusted for **${user.raUsername}**\n\n` +
                    `**Previous Balance:** ${gpUtils.formatGP(oldBalance)}\n` +
                    `**Adjustment:** ${amount > 0 ? '+' : ''}${gpUtils.formatGP(amount)}\n` +
                    `**New Balance:** ${gpUtils.formatGP(user.gpBalance)}\n` +
                    `**Reason:** ${reason}\n` +
                    `**Adjusted By:** ${interaction.user.username}`
                )
                .setColor(amount > 0 ? '#00FF00' : '#FFA500')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error adjusting user GP:', error);
            await interaction.editReply(`❌ Error adjusting GP: ${error.message}`);
        }
    },

    /**
     * Reset user's arena statistics
     * @private
     */
    async resetUserStats(interaction, user) {
        try {
            user.arenaStats = {
                challengesCreated: 0,
                challengesWon: 0,
                challengesParticipated: 0,
                totalGpWon: 0,
                totalGpWagered: 0,
                totalGpBet: 0,
                betsWon: 0,
                betsPlaced: 0
            };
            await user.save();
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Stats Reset Complete')
                .setDescription(
                    `Arena statistics have been reset for **${user.raUsername}**\n\n` +
                    `All challenge and betting statistics have been set to 0.\n` +
                    `GP balance was not affected: ${gpUtils.formatGP(user.gpBalance)}`
                )
                .setColor('#FFA500')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error resetting user stats:', error);
            await interaction.editReply(`❌ Error resetting stats: ${error.message}`);
        }
    },

    /**
     * Force monthly GP claim for user
     * @private
     */
    async forceMonthlyGP(interaction, user) {
        try {
            // Reset the claim date to allow claiming
            user.lastMonthlyGpClaim = null;
            await user.save();
            
            // Now claim the GP
            const result = await gpUtils.claimMonthlyGP(user);
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Forced Monthly GP Claim')
                .setDescription(
                    `Monthly GP forcibly granted to **${user.raUsername}**\n\n` +
                    `**Amount Granted:** ${gpUtils.formatGP(result.amount)}\n` +
                    `**New Balance:** ${gpUtils.formatGP(result.newBalance)}\n` +
                    `**Forced By:** ${interaction.user.username}`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error forcing monthly GP claim:', error);
            await interaction.editReply(`❌ Error forcing monthly claim: ${error.message}`);
        }
    },

    /**
     * Handle system-level actions
     */
    async handleSystemAction(interaction) {
        await interaction.deferReply();

        const action = interaction.options.getString('action');

        try {
            switch (action) {
                case 'check_completed':
                    await this.systemCheckCompleted(interaction);
                    break;
                case 'process_timeouts':
                    await this.systemProcessTimeouts(interaction);
                    break;
                case 'update_feeds':
                    await this.systemUpdateFeeds(interaction);
                    break;
                case 'emergency_stop':
                    await this.systemEmergencyStop(interaction);
                    break;
                case 'stats':
                    await this.handleSystemStatus(interaction);
                    break;
                       case 'reset_system':  // <-- ADD THIS CASE
                    await this.systemResetEntireSystem(interaction);
                    break;
                default:
                    await interaction.editReply('Invalid system action specified.');
            }
        } catch (error) {
            console.error('Error in system action:', error);
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    /**
     * Manually trigger completed challenges check
     * @private
     */
    async systemCheckCompleted(interaction) {
        await interaction.editReply('🔄 Checking for completed challenges...');

        try {
            await arenaService.checkCompletedChallenges();
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Completed Challenges Check')
                .setDescription(
                    `Manual check for completed challenges has been executed.\n\n` +
                    `Check the console logs for detailed results.\n` +
                    `Any completed challenges should now be processed.`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error checking completed challenges:', error);
            await interaction.editReply(`❌ Error checking completed challenges: ${error.message}`);
        }
    },

    /**
     * Manually trigger timeout processing
     * @private
     */
    async systemProcessTimeouts(interaction) {
        await interaction.editReply('🔄 Processing challenge timeouts...');

        try {
            await arenaService.checkAndProcessTimeouts();
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Timeout Processing Complete')
                .setDescription(
                    `Manual timeout processing has been executed.\n\n` +
                    `Any challenges that have timed out (pending for >24h) have been cancelled and refunded.\n` +
                    `Check the console logs for detailed results.`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error processing timeouts:', error);
            await interaction.editReply(`❌ Error processing timeouts: ${error.message}`);
        }
    },

    /**
     * Manually update arena feeds
     * @private
     */
    async systemUpdateFeeds(interaction) {
        await interaction.editReply('🔄 Updating arena feeds...');

        try {
            await arenaService.updateArenaFeeds();
            
            const embed = new EmbedBuilder()
                .setTitle('✅ Arena Feeds Updated')
                .setDescription(
                    `Arena feeds have been manually updated.\n\n` +
                    `This includes any embedded arena status messages and feed updates.`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error updating arena feeds:', error);
            await interaction.editReply(`❌ Error updating arena feeds: ${error.message}`);
        }
    },

    /**
     * NUCLEAR OPTION: Reset the entire arena system
     * @private
     */
    async systemResetEntireSystem(interaction) {
        await interaction.deferReply();

        const confirmReset = interaction.options.getBoolean('confirm_reset');
        
        if (!confirmReset) {
            const embed = new EmbedBuilder()
                .setTitle('⚠️ Arena System Reset')
                .setDescription(
                    `**WARNING: This will COMPLETELY RESET the Arena system!**\n\n` +
                    `This action will:\n` +
                    `• ❌ Delete ALL challenges (pending, active, completed)\n` +
                    `• ❌ Reset ALL user GP balances to 0\n` +
                    `• ❌ Clear ALL user arena statistics\n` +
                    `• ❌ Remove ALL GP transaction history\n` +
                    `• ❌ Reset ALL monthly GP claims\n\n` +
                    `**THIS CANNOT BE UNDONE!**\n\n` +
                    `To confirm this destructive action, run the command again with \`confirm_reset: True\``
                )
                .setColor('#FF0000')
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        try {
            await interaction.editReply('🔄 **RESETTING ENTIRE ARENA SYSTEM...**\nThis may take a few minutes...');

            let deletedChallenges = 0;
            let resetUsers = 0;
            let errors = 0;

            // Step 1: Delete all challenges
            try {
                const challengeDeleteResult = await ArenaChallenge.deleteMany({});
                deletedChallenges = challengeDeleteResult.deletedCount;
                console.log(`Deleted ${deletedChallenges} challenges`);
            } catch (error) {
                console.error('Error deleting challenges:', error);
                errors++;
            }

            // Step 2: Reset all users' arena data
            try {
                const users = await User.find({});
                
                for (const user of users) {
                    // Reset GP balance
                    user.gpBalance = 0;
                    
                    // Reset monthly claim
                    user.lastMonthlyGpClaim = null;
                    
                    // Clear GP transactions
                    user.gpTransactions = [];
                    
                    // Reset arena stats
                    user.arenaStats = {
                        challengesCreated: 0,
                        challengesWon: 0,
                        challengesParticipated: 0,
                        totalGpWon: 0,
                        totalGpWagered: 0,
                        totalGpBet: 0,
                        betsWon: 0,
                        betsPlaced: 0
                    };
                    
                    await user.save();
                    resetUsers++;
                    
                    // Progress update every 50 users
                    if (resetUsers % 50 === 0) {
                        await interaction.editReply(
                            `🔄 **RESETTING ARENA SYSTEM...**\n` +
                            `Progress: ${resetUsers}/${users.length} users reset...`
                        );
                    }
                }
                
                console.log(`Reset arena data for ${resetUsers} users`);
            } catch (error) {
                console.error('Error resetting users:', error);
                errors++;
            }

            // Step 3: Reset arena service state
            try {
                arenaService.isProcessing = false;
                console.log('Reset arena service processing state');
            } catch (error) {
                console.error('Error resetting service state:', error);
                errors++;
            }

            // Create completion report
            const embed = new EmbedBuilder()
                .setTitle(errors > 0 ? '⚠️ Arena System Reset Completed with Errors' : '✅ Arena System Reset Complete')
                .setDescription(
                    `**ARENA SYSTEM HAS BEEN COMPLETELY RESET**\n\n` +
                    `**Results:**\n` +
                    `• 🗑️ Challenges Deleted: ${deletedChallenges}\n` +
                    `• 👥 Users Reset: ${resetUsers}\n` +
                    `• ❌ Errors Encountered: ${errors}\n\n` +
                    `**What was reset:**\n` +
                    `• All challenge data removed\n` +
                    `• All GP balances set to 0\n` +
                    `• All arena statistics cleared\n` +
                    `• All transaction history wiped\n` +
                    `• All monthly claims reset\n\n` +
                    `**The Arena system is now in a fresh state.**\n` +
                    `Users can start claiming their monthly 1,000 GP immediately.`
                )
                .setColor(errors > 0 ? '#FFA500' : '#00FF00')
                .setTimestamp();

            if (errors > 0) {
                embed.addFields({
                    name: '⚠️ Errors Encountered',
                    value: `${errors} error(s) occurred during reset. Check console logs for details.`,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

            // Log the reset action
            console.log(`ARENA SYSTEM RESET completed by ${interaction.user.username} (${interaction.user.id})`);
            console.log(`Results: ${deletedChallenges} challenges deleted, ${resetUsers} users reset, ${errors} errors`);

        } catch (error) {
            console.error('Critical error during arena system reset:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Arena System Reset Failed')
                .setDescription(
                    `**CRITICAL ERROR DURING RESET**\n\n` +
                    `The reset process encountered a critical error and may have been partially completed.\n\n` +
                    `**Error:** ${error.message}\n\n` +
                    `**IMPORTANT:** The arena system may be in an inconsistent state. ` +
                    `Manual database inspection and cleanup may be required.`
                )
                .setColor('#FF0000')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    /**
     * Emergency stop arena processing
     * @private
     */
    async systemEmergencyStop(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🚨 Emergency Stop Not Implemented')
            .setDescription(
                `Emergency stop functionality is not implemented in this simple system.\n\n` +
                `The arena service is designed to be stateless and safe.\n` +
                `If needed, restart the bot to reset any processing flags.`
            )
            .setColor('#FF0000')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
