// src/commands/user/arena.js
import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ButtonBuilder, 
    ActionRowBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { User } from '../../models/User.js';
import { ArenaChallenge } from '../../models/ArenaChallenge.js';
import arenaService from '../../services/arenaService.js';
import arenaUtils from '../../utils/arenaUtils.js';
import gpUtils from '../../utils/gpUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('arena')
        .setDescription('Access the Arena challenge system - create challenges, place bets, and compete!'),

    async execute(interaction) {
        // Get or create user
        let user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
            return interaction.reply({
                content: '❌ You need to register with the bot first. Please use `/register` to link your RetroAchievements account.',
                ephemeral: true
            });
        }

        await this.showArenaMenu(interaction, user);
    },

    async showArenaMenu(interaction, user) {
        // Get active challenges count
        const activeChallenges = await arenaService.getActiveChallenges(5);
        const userChallenges = await arenaService.getUserChallenges(user.discordId, 3);
        
        const embed = new EmbedBuilder()
            .setTitle('🏟️ Welcome to the Arena!')
            .setDescription(
                `**${user.raUsername}**, ready to compete?\n\n` +
                `💰 **Your GP Balance:** ${gpUtils.formatGP(user.gpBalance || 0)}\n` +
                `🏆 **Challenges Won:** ${user.arenaStats?.challengesWon || 0}\n` +
                `🎯 **Win Rate:** ${user.getGpWinRate()}%\n` +
                `📊 **Monthly Claim:** ${user.canClaimMonthlyGp() ? '✅ Available (1,000 GP)' : '❌ Already claimed'}\n\n` +
                `🔥 **Active Challenges:** ${activeChallenges.length}\n` +
                `📋 **Your Active:** ${userChallenges.filter(c => c.status === 'active' || c.status === 'pending').length}\n\n` +
                `Select an action from the menu below:`
            )
            .setColor('#00FF00')
            .setThumbnail('https://cdn.discordapp.com/emojis/853287407997755412.png') // Arena icon
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('arena_action_select')
            .setPlaceholder('🎮 Choose your arena action...')
            .addOptions([
                {
                    label: 'Create Challenge',
                    description: 'Start a new 1v1 or open challenge',
                    value: 'create_challenge',
                    emoji: '⚔️'
                },
                {
                    label: 'View Active Challenges',
                    description: 'See all current challenges you can join',
                    value: 'view_active',
                    emoji: '🔥'
                },
                {
                    label: 'My Challenges',
                    description: 'View your challenge history and status',
                    value: 'my_challenges',
                    emoji: '📋'
                },
                {
                    label: 'Place Bet',
                    description: 'Browse challenges to bet on',
                    value: 'browse_betting',
                    emoji: '🎰'
                },
                {
                    label: 'Claim Monthly GP',
                    description: 'Claim your 1,000 GP monthly allowance',
                    value: 'claim_gp',
                    emoji: '🎁'
                },
                {
                    label: 'View Balance & Transactions',
                    description: 'Check your GP balance and transaction history',
                    value: 'view_balance',
                    emoji: '💰'
                },
                {
                    label: 'Leaderboards',
                    description: 'View GP and arena statistics rankings',
                    value: 'leaderboards',
                    emoji: '🏆'
                },
                {
                    label: 'How to Play',
                    description: 'Learn how the Arena system works',
                    value: 'help',
                    emoji: '❓'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Quick action buttons for the most common actions
        const quickButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('arena_quick_create')
                    .setLabel('Quick Challenge')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚔️'),
                new ButtonBuilder()
                    .setCustomId('arena_quick_claim')
                    .setLabel('Claim GP')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎁')
                    .setDisabled(!user.canClaimMonthlyGp()),
                new ButtonBuilder()
                    .setCustomId('arena_quick_active')
                    .setLabel('Active Challenges')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔥'),
                new ButtonBuilder()
                    .setCustomId('arena_refresh')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄')
            );

        await interaction.reply({
            embeds: [embed],
            components: [row, quickButtons],
            ephemeral: false
        });
    },

    async handleClaimGP(interaction, user) {
        try {
            const result = await gpUtils.claimMonthlyGP(user);
            
            const embed = new EmbedBuilder()
                .setTitle('🎁 Monthly GP Claimed!')
                .setDescription(
                    `You've successfully claimed your monthly GP allowance!\n\n` +
                    `💰 **Amount Received:** ${gpUtils.formatGP(result.amount)}\n` +
                    `💳 **New Balance:** ${gpUtils.formatGP(result.newBalance)}\n\n` +
                    `You can claim your next allowance at the start of next month.`
                )
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            const embed = new EmbedBuilder()
                .setTitle('❌ GP Claim Failed')
                .setDescription(error.message)
                .setColor('#FF0000');

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async handleBalance(interaction, user) {
        const transactions = await gpUtils.getTransactionHistory(user, 10);
        
        const embed = new EmbedBuilder()
            .setTitle('💰 Your Arena Balance')
            .setDescription(
                `**Current Balance:** ${gpUtils.formatGP(user.gpBalance || 0)}\n` +
                `**Monthly Claim:** ${user.canClaimMonthlyGp() ? '✅ Available' : '❌ Already claimed'}\n\n` +
                `**Arena Stats:**\n` +
                `🏆 Challenges Won: ${user.arenaStats?.challengesWon || 0}\n` +
                `🎯 Challenges Participated: ${user.arenaStats?.challengesParticipated || 0}\n` +
                `💎 Total GP Won: ${gpUtils.formatGP(user.arenaStats?.totalGpWon || 0)}\n` +
                `💸 Total GP Wagered: ${gpUtils.formatGP(user.arenaStats?.totalGpWagered || 0)}\n` +
                `🎰 Bets Won: ${user.arenaStats?.betsWon || 0}/${user.arenaStats?.betsPlaced || 0}`
            )
            .setColor('#0099FF')
            .setTimestamp();

        if (transactions.length > 0) {
            const transactionText = transactions
                .map(tx => {
                    const formatted = gpUtils.formatTransaction(tx);
                    const date = tx.timestamp.toLocaleDateString();
                    return `${formatted.emoji} **${formatted.amount} GP** - ${formatted.description} *(${date})*`;
                })
                .join('\n');
            
            embed.addFields({
                name: '📝 Recent Transactions (Last 10)',
                value: transactionText.length > 1024 ? transactionText.substring(0, 1021) + '...' : transactionText,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },

    async handleLeaderboard(interaction) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('arena_leaderboard_select')
            .setPlaceholder('Choose leaderboard type')
            .addOptions([
                {
                    label: 'GP Balance',
                    description: 'Top users by current GP balance',
                    value: 'gp',
                    emoji: '💰'
                },
                {
                    label: 'Challenges Won',
                    description: 'Top users by challenges won',
                    value: 'wins',
                    emoji: '🏆'
                },
                {
                    label: 'Total GP Won',
                    description: 'Top users by total GP won',
                    value: 'total_won',
                    emoji: '💎'
                },
                {
                    label: 'Bet Win Rate',
                    description: 'Top users by betting success',
                    value: 'bet_rate',
                    emoji: '🎰'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: '🏆 **Arena Leaderboards**\nSelect which leaderboard you\'d like to view:',
            components: [row],
            ephemeral: true
        });
    },

    async displayLeaderboard(interaction, type) {
        await interaction.deferUpdate();

        let leaderboard, title, description;

        try {
            switch (type) {
                case 'gp':
                    leaderboard = await gpUtils.getGPLeaderboard(10);
                    title = '💰 GP Balance Leaderboard';
                    description = 'Top users by current GP balance';
                    break;
                case 'wins':
                    leaderboard = await gpUtils.getArenaStatsLeaderboard('challengesWon', 10);
                    title = '🏆 Challenge Winners Leaderboard';
                    description = 'Top users by challenges won';
                    break;
                case 'total_won':
                    leaderboard = await gpUtils.getArenaStatsLeaderboard('totalGpWon', 10);
                    title = '💎 Total GP Won Leaderboard';
                    description = 'Top users by total GP won from challenges';
                    break;
                case 'bet_rate':
                    leaderboard = await gpUtils.getArenaStatsLeaderboard('betsWon', 10);
                    title = '🎰 Betting Champions Leaderboard';
                    description = 'Top users by betting success';
                    break;
                default:
                    leaderboard = await gpUtils.getGPLeaderboard(10);
                    title = '💰 GP Balance Leaderboard';
                    description = 'Top users by current GP balance';
            }

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor('#FFD700')
                .setTimestamp();

            if (leaderboard.length === 0) {
                embed.addFields({ name: 'No Data', value: 'No users found for this leaderboard.', inline: false });
            } else {
                const leaderboardText = leaderboard
                    .map(user => {
                        const medal = user.rank === 1 ? '🥇' : user.rank === 2 ? '🥈' : user.rank === 3 ? '🥉' : `${user.rank}.`;
                        
                        switch (type) {
                            case 'gp':
                                return `${medal} **${user.raUsername}** - ${gpUtils.formatGP(user.gpBalance)}`;
                            case 'wins':
                                return `${medal} **${user.raUsername}** - ${user.challengesWon} wins (${user.winRate}% win rate)`;
                            case 'total_won':
                                return `${medal} **${user.raUsername}** - ${gpUtils.formatGP(user.totalGpWon)} total won`;
                            case 'bet_rate':
                                return `${medal} **${user.raUsername}** - ${user.betsWon}/${user.betsPlaced} bets (${user.betWinRate}%)`;
                            default:
                                return `${medal} **${user.raUsername}** - ${gpUtils.formatGP(user.gpBalance)}`;
                        }
                    })
                    .join('\n');

                embed.addFields({ name: 'Rankings', value: leaderboardText, inline: false });
            }

            // Add system stats
            const systemStats = await gpUtils.getSystemGPStats();
            embed.addFields({
                name: '📊 System Statistics',
                value: 
                    `Total Users: ${systemStats.totalUsers}\n` +
                    `Users with GP: ${systemStats.usersWithGP}\n` +
                    `Total GP in circulation: ${gpUtils.formatGP(systemStats.totalGP)}\n` +
                    `Total challenges created: ${systemStats.totalChallengesCreated}`,
                inline: false
            });

            await interaction.editReply({ embeds: [embed], components: [] });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching the leaderboard. Please try again.',
                components: []
            });
        }
    },

    async handleViewActive(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const activeChallenges = await arenaService.getActiveChallenges(10);
            
            const embed = new EmbedBuilder()
                .setTitle('🔥 Active Challenges')
                .setDescription('Current challenges you can join or bet on')
                .setColor('#FF6600')
                .setTimestamp();

            if (activeChallenges.length === 0) {
                embed.addFields({ 
                    name: 'No Active Challenges', 
                    value: 'No challenges are currently active. Be the first to create one!', 
                    inline: false 
                });
            } else {
                for (const challenge of activeChallenges) {
                    const description = arenaUtils.formatChallengeDisplay(challenge);
                    embed.addFields({
                        name: `${challenge.challengeId || 'Unknown'} - ${challenge.gameTitle}`,
                        value: description,
                        inline: false
                    });
                }
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching active challenges:', error);
            await interaction.editReply({ content: 'Error fetching active challenges.' });
        }
    },

    async handleHistory(interaction, user) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const challenges = await arenaService.getUserChallenges(user.discordId, 10);
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Your Challenge History')
                .setDescription(`Recent challenges for **${user.raUsername}**`)
                .setColor('#0099FF')
                .setTimestamp();

            if (challenges.length === 0) {
                embed.addFields({ name: 'No Challenges', value: 'You haven\'t participated in any challenges yet.', inline: false });
            } else {
                for (const challenge of challenges) {
                    const statusEmoji = {
                        'pending': '⏳',
                        'active': '🔥',
                        'completed': '✅',
                        'cancelled': '❌'
                    };

                    let resultText = '';
                    if (challenge.status === 'completed') {
                        if (challenge.winnerUserId === user.discordId) {
                            resultText = ' 🏆 **WON**';
                        } else if (challenge.winnerUserId) {
                            resultText = ' 😔 Lost';
                        } else {
                            resultText = ' 🤝 No winner';
                        }
                    }

                    const value = 
                        `${statusEmoji[challenge.status]} **${challenge.gameTitle}**${resultText}\n` +
                        `Type: ${challenge.type === 'direct' ? 'Direct' : 'Open'} | ` +
                        `Wager: ${challenge.participants.find(p => p.userId === user.discordId)?.wager || 0} GP\n` +
                        `Created: ${challenge.createdAt.toLocaleDateString()}`;

                    // Fix for the error - ensure challengeId exists and is a string
                    const fieldName = (challenge.challengeId || `Challenge-${challenge._id || 'Unknown'}`).toString();

                    embed.addFields({
                        name: fieldName,
                        value: value,
                        inline: true
                    });
                }
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching user challenge history:', error);
            await interaction.editReply({
                content: 'An error occurred while fetching your challenge history.'
            });
        }
    },

    async handleHelp(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('❓ How to Play Arena')
            .setDescription('Learn the Arena challenge system!')
            .setColor('#00BFFF')
            .addFields(
                {
                    name: '💰 GP (Game Points)',
                    value: 
                        '• Get 1,000 GP free each month\n' +
                        '• Use GP to create challenges and place bets\n' +
                        '• Win challenges to earn more GP',
                    inline: false
                },
                {
                    name: '⚔️ Direct Challenges',
                    value: 
                        '• Challenge a specific player\n' +
                        '• They have 24 hours to accept\n' +
                        '• Winner takes both wagers',
                    inline: true
                },
                {
                    name: '🌍 Open Challenges',
                    value: 
                        '• Anyone can join your challenge\n' +
                        '• Multiple participants possible\n' +
                        '• Winner takes all wagers',
                    inline: true
                },
                {
                    name: '🎰 Betting System',
                    value: 
                        '• Bet on active challenges\n' +
                        '• Non-participants only\n' +
                        '• Betting closes 3 days after start\n' +
                        '• Winners split losing bets proportionally',
                    inline: false
                },
                {
                    name: '🏆 How Winners Are Determined',
                    value: 
                        '• Based on RetroAchievements leaderboard rank\n' +
                        '• Lower rank wins (Rank 1 beats Rank 2)\n' +
                        '• Challenges run for 7 days\n' +
                        '• Ties result in refunds',
                    inline: false
                },
                {
                    name: '📊 Tips for Success',
                    value: 
                        '• Start small with low wagers\n' +
                        '• Check leaderboards before challenging\n' +
                        '• Bet wisely on other challenges\n' +
                        '• Claim your monthly GP regularly',
                    inline: false
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
