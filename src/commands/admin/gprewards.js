// src/commands/admin/gprewards.js - Admin commands for GP reward system with bulk distribution
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import gpRewardService, { GP_REWARDS } from '../../services/gpRewardService.js';
import gpUtils from '../../utils/gpUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gprewards')
        .setDescription('Manage GP reward system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View GP reward system statistics')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('award')
                .setDescription('Manually award GP to a user')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('RetroAchievements username')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of reward')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Nomination (20 GP)', value: 'nomination' },
                            { name: 'Vote (20 GP)', value: 'vote' },
                            { name: 'Monthly Participation (20 GP)', value: 'monthly_participation' },
                            { name: 'Monthly Beaten (50 GP)', value: 'monthly_beaten' },
                            { name: 'Monthly Mastery (100 GP)', value: 'monthly_mastery' },
                            { name: 'Shadow Participation (20 GP)', value: 'shadow_participation' },
                            { name: 'Shadow Beaten (50 GP)', value: 'shadow_beaten' },
                            { name: 'Shadow Mastery (100 GP)', value: 'shadow_mastery' },
                            { name: 'Regular Beaten (20 GP)', value: 'regular_beaten' },
                            { name: 'Regular Mastery (20 GP)', value: 'regular_mastery' }
                        )
                )
                .addStringOption(option =>
                    option.setName('game')
                        .setDescription('Game name (for game-related rewards)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('giveall')
                .setDescription('Give GP to ALL registered users')
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of GP to give to each user')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10000)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the GP distribution')
                        .setRequired(true)
                        .setMaxLength(200)
                )
                .addBooleanOption(option =>
                    option.setName('confirm')
                        .setDescription('Confirm you want to give GP to ALL users (required)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('recent')
                .setDescription('View recent GP reward transactions')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('RetroAchievements username (optional)')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of transactions to show (default: 20)')
                        .setMinValue(1)
                        .setMaxValue(50)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('breakdown')
                .setDescription('Show detailed GP rewards breakdown')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'stats':
                await this.showStats(interaction);
                break;
            case 'award':
                await this.awardGP(interaction);
                break;
            case 'giveall':
                await this.giveAllUsers(interaction);
                break;
            case 'recent':
                await this.showRecent(interaction);
                break;
            case 'breakdown':
                await this.showBreakdown(interaction);
                break;
        }
    },

    async showStats(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Get reward service stats
            const rewardStats = gpRewardService.getRewardStats();
            
            // Get overall GP stats
            const systemStats = await gpUtils.getSystemGPStats();
            
            // Get reward transaction counts
            const rewardTransactionStats = await User.aggregate([
                { $unwind: '$gpTransactions' },
                { $match: { 'gpTransactions.type': { $in: ['nomination', 'vote', 'challenge_award', 'game_completion'] } } },
                { $group: { 
                    _id: '$gpTransactions.type',
                    count: { $sum: 1 },
                    totalGP: { $sum: '$gpTransactions.amount' }
                }},
                { $sort: { totalGP: -1 } }
            ]);

            const embed = new EmbedBuilder()
                .setTitle('🎁 GP Reward System Statistics')
                .setColor('#FFD700')
                .setTimestamp();

            // Reward amounts
            let rewardAmountsText = '';
            for (const [key, value] of Object.entries(GP_REWARDS)) {
                const label = key.replace(/_/g, ' ').toLowerCase()
                    .replace(/\b\w/g, l => l.toUpperCase());
                rewardAmountsText += `**${label}**: ${value} GP\n`;
            }

            embed.addFields({
                name: '💰 Reward Amounts',
                value: rewardAmountsText,
                inline: true
            });

            // System stats
            embed.addFields({
                name: '📊 System Overview',
                value: `**Total Users**: ${systemStats.totalUsers.toLocaleString()}\n` +
                       `**Total GP in System**: ${systemStats.totalGP.toLocaleString()}\n` +
                       `**Users with GP**: ${systemStats.usersWithGP.toLocaleString()}\n` +
                       `**Average GP**: ${systemStats.avgGP.toLocaleString()}`,
                inline: true
            });

            // Reward transaction stats
            let rewardStatsText = '';
            if (rewardTransactionStats.length > 0) {
                for (const stat of rewardTransactionStats) {
                    const typeLabel = stat._id.replace(/_/g, ' ').toUpperCase();
                    rewardStatsText += `**${typeLabel}**: ${stat.count} awards (${stat.totalGP.toLocaleString()} GP)\n`;
                }
            } else {
                rewardStatsText = 'No reward transactions found';
            }

            embed.addFields({
                name: '🏆 Reward Distribution',
                value: rewardStatsText,
                inline: false
            });

            embed.addFields({
                name: '🔧 Service Status',
                value: `**Session History Size**: ${rewardStats.rewardHistorySize}\n` +
                       `**Status**: Active`,
                inline: true
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error getting GP reward stats:', error);
            await interaction.editReply('Error retrieving GP reward statistics.');
        }
    },

    async awardGP(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const username = interaction.options.getString('username');
            const type = interaction.options.getString('type');
            const gameName = interaction.options.getString('game') || 'Unknown Game';

            // Find user
            const user = await User.findOne({ raUsername: username });
            if (!user) {
                return interaction.editReply(`User "${username}" not found.`);
            }

            // Award GP based on type
            let success = false;
            let description = '';

            switch (type) {
                case 'nomination':
                    success = await gpRewardService.awardNominationGP(user, gameName);
                    description = `nomination of "${gameName}"`;
                    break;
                case 'vote':
                    success = await gpRewardService.awardVotingGP(user, 'monthly');
                    description = 'voting in poll';
                    break;
                case 'monthly_participation':
                    success = await gpRewardService.awardChallengeGP(user, gameName, 'participation', 'monthly');
                    description = `monthly challenge participation in "${gameName}"`;
                    break;
                case 'monthly_beaten':
                    success = await gpRewardService.awardChallengeGP(user, gameName, 'beaten', 'monthly');
                    description = `beating "${gameName}" in monthly challenge`;
                    break;
                case 'monthly_mastery':
                    success = await gpRewardService.awardChallengeGP(user, gameName, 'mastery', 'monthly');
                    description = `mastering "${gameName}" in monthly challenge`;
                    break;
                case 'shadow_participation':
                    success = await gpRewardService.awardChallengeGP(user, gameName, 'participation', 'shadow');
                    description = `shadow challenge participation in "${gameName}"`;
                    break;
                case 'shadow_beaten':
                    success = await gpRewardService.awardChallengeGP(user, gameName, 'beaten', 'shadow');
                    description = `beating "${gameName}" in shadow challenge`;
                    break;
                case 'shadow_mastery':
                    success = await gpRewardService.awardChallengeGP(user, gameName, 'mastery', 'shadow');
                    description = `mastering "${gameName}" in shadow challenge`;
                    break;
                case 'regular_beaten':
                    success = await gpRewardService.awardRegularGameGP(user, gameName, false);
                    description = `beating "${gameName}"`;
                    break;
                case 'regular_mastery':
                    success = await gpRewardService.awardRegularGameGP(user, gameName, true);
                    description = `mastering "${gameName}"`;
                    break;
            }

            if (success) {
                // Reload user to get updated balance
                await user.reload();
                
                const embed = new EmbedBuilder()
                    .setTitle('✅ GP Reward Awarded')
                    .setColor('#00FF00')
                    .setDescription(`Successfully awarded GP to **${username}** for ${description}`)
                    .addFields({
                        name: 'New Balance',
                        value: `${user.gpBalance.toLocaleString()} GP`,
                        inline: true
                    })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply(`Failed to award GP to ${username}. This might be a duplicate reward.`);
            }

        } catch (error) {
            console.error('Error awarding GP:', error);
            await interaction.editReply('Error awarding GP reward.');
        }
    },

    async giveAllUsers(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const amount = interaction.options.getInteger('amount');
            const reason = interaction.options.getString('reason');
            const confirm = interaction.options.getBoolean('confirm');

            // Safety check
            if (!confirm) {
                return interaction.editReply('❌ You must set the `confirm` option to `True` to give GP to all users.');
            }

            // Additional safety check for large amounts
            if (amount > 5000) {
                return interaction.editReply('❌ Maximum amount per distribution is 5,000 GP. Use multiple smaller distributions if needed.');
            }

            // Get all registered users
            const allUsers = await User.find({});
            
            if (allUsers.length === 0) {
                return interaction.editReply('❌ No registered users found.');
            }

            // Confirm the action
            const totalGP = amount * allUsers.length;
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Confirm Mass GP Distribution')
                .setColor('#FF9900')
                .setDescription(`You are about to give **${amount.toLocaleString()} GP** to **${allUsers.length} users**.`)
                .addFields(
                    { name: 'Total GP to be distributed', value: `${totalGP.toLocaleString()} GP`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Action Required', value: 'React with ✅ to confirm or ❌ to cancel', inline: false }
                )
                .setFooter({ text: 'This action cannot be undone!' })
                .setTimestamp();

            const confirmMessage = await interaction.editReply({ 
                embeds: [confirmEmbed] 
            });

            // Add reactions
            await confirmMessage.react('✅');
            await confirmMessage.react('❌');

            // Wait for reaction
            const filter = (reaction, user) => {
                return ['✅', '❌'].includes(reaction.emoji.name) && user.id === interaction.user.id;
            };

            try {
                const collected = await confirmMessage.awaitReactions({ 
                    filter, 
                    max: 1, 
                    time: 30000,
                    errors: ['time'] 
                });

                const reaction = collected.first();

                if (reaction.emoji.name === '❌') {
                    return interaction.editReply({
                        content: '❌ Mass GP distribution cancelled.',
                        embeds: []
                    });
                }

                if (reaction.emoji.name === '✅') {
                    // Proceed with distribution
                    const progressEmbed = new EmbedBuilder()
                        .setTitle('🔄 Distributing GP...')
                        .setColor('#3498DB')
                        .setDescription(`Processing ${allUsers.length} users...`)
                        .setTimestamp();

                    await interaction.editReply({ embeds: [progressEmbed] });

                    // Track results
                    let successCount = 0;
                    let errorCount = 0;
                    const errors = [];

                    // Process users in batches to avoid overwhelming the database
                    const batchSize = 50;
                    for (let i = 0; i < allUsers.length; i += batchSize) {
                        const batch = allUsers.slice(i, i + batchSize);
                        
                        await Promise.all(batch.map(async (user) => {
                            try {
                                await gpUtils.awardGP(
                                    user,
                                    amount,
                                    'admin_mass_distribution',
                                    `Mass distribution: ${reason}`,
                                    null
                                );
                                successCount++;
                            } catch (error) {
                                console.error(`Error giving GP to ${user.raUsername}:`, error);
                                errorCount++;
                                errors.push(`${user.raUsername}: ${error.message}`);
                            }
                        }));

                        // Update progress
                        const processed = Math.min(i + batchSize, allUsers.length);
                        const progressPercent = Math.round((processed / allUsers.length) * 100);
                        
                        const updateEmbed = new EmbedBuilder()
                            .setTitle('🔄 Distributing GP...')
                            .setColor('#3498DB')
                            .setDescription(`Progress: ${processed}/${allUsers.length} users (${progressPercent}%)`)
                            .addFields({
                                name: 'Status',
                                value: `✅ Success: ${successCount}\n❌ Errors: ${errorCount}`,
                                inline: true
                            })
                            .setTimestamp();

                        await interaction.editReply({ embeds: [updateEmbed] });

                        // Small delay between batches
                        if (i + batchSize < allUsers.length) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }

                    // Final results
                    const resultEmbed = new EmbedBuilder()
                        .setTitle('✅ Mass GP Distribution Complete')
                        .setColor(errorCount > 0 ? '#FF9900' : '#00FF00')
                        .setDescription(`Successfully distributed **${amount.toLocaleString()} GP** to users.`)
                        .addFields(
                            { name: 'Total Users Processed', value: allUsers.length.toString(), inline: true },
                            { name: 'Successful', value: successCount.toString(), inline: true },
                            { name: 'Errors', value: errorCount.toString(), inline: true },
                            { name: 'Total GP Distributed', value: `${(successCount * amount).toLocaleString()} GP`, inline: true },
                            { name: 'Reason', value: reason, inline: false }
                        )
                        .setTimestamp();

                    if (errors.length > 0 && errors.length <= 10) {
                        resultEmbed.addFields({
                            name: 'Errors (first 10)',
                            value: errors.slice(0, 10).join('\n').substring(0, 1024),
                            inline: false
                        });
                    }

                    await interaction.editReply({ embeds: [resultEmbed] });

                    // Log the mass distribution
                    console.log(`Mass GP distribution completed by ${interaction.user.tag}: ${amount} GP to ${successCount}/${allUsers.length} users. Reason: ${reason}`);
                }

            } catch (error) {
                await interaction.editReply({
                    content: '❌ Confirmation timed out. Mass distribution cancelled.',
                    embeds: []
                });
            }

        } catch (error) {
            console.error('Error in mass GP distribution:', error);
            await interaction.editReply('❌ Error during mass GP distribution. Check logs for details.');
        }
    },

    async showRecent(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const username = interaction.options.getString('username');
            const limit = interaction.options.getInteger('limit') || 20;

            let query = { 'gpTransactions.type': { $in: ['nomination', 'vote', 'challenge_award', 'game_completion'] } };
            
            if (username) {
                query.raUsername = username;
            }

            const users = await User.find(query)
                .select('raUsername gpTransactions')
                .lean();

            // Flatten and sort transactions
            let allTransactions = [];
            
            for (const user of users) {
                if (user.gpTransactions) {
                    const userTransactions = user.gpTransactions
                        .filter(t => ['nomination', 'vote', 'challenge_award', 'game_completion'].includes(t.type))
                        .map(t => ({
                            ...t,
                            username: user.raUsername
                        }));
                    allTransactions = [...allTransactions, ...userTransactions];
                }
            }

            // Sort by timestamp (newest first) and limit
            allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            allTransactions = allTransactions.slice(0, limit);

            if (allTransactions.length === 0) {
                return interaction.editReply('No recent reward transactions found.');
            }

            const embed = new EmbedBuilder()
                .setTitle(`🎁 Recent GP Reward Transactions${username ? ` for ${username}` : ''}`)
                .setColor('#FFD700')
                .setTimestamp();

            let transactionText = '';
            for (const transaction of allTransactions) {
                const date = new Date(transaction.timestamp).toLocaleDateString();
                const amount = transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount;
                const typeEmoji = {
                    nomination: '📝',
                    vote: '🗳️',
                    challenge_award: '🏆',
                    game_completion: '🎮'
                }[transaction.type] || '💰';

                transactionText += `${typeEmoji} **${transaction.username}**: ${amount} GP\n`;
                transactionText += `   ${transaction.description} _(${date})_\n\n`;
            }

            // Split into multiple fields if too long
            if (transactionText.length > 1024) {
                const chunks = transactionText.match(/[\s\S]{1,1024}/g);
                chunks.forEach((chunk, index) => {
                    embed.addFields({
                        name: index === 0 ? 'Recent Transactions' : '\u200b',
                        value: chunk,
                        inline: false
                    });
                });
            } else {
                embed.addFields({
                    name: 'Recent Transactions',
                    value: transactionText,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error getting recent GP transactions:', error);
            await interaction.editReply('Error retrieving recent GP transactions.');
        }
    },

    async showBreakdown(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const embed = new EmbedBuilder()
                .setTitle('💰 Complete GP Rewards Breakdown')
                .setColor('#FFD700')
                .setDescription('Here\'s everything you can earn GP for in the community!')
                .setTimestamp();

            // Community Participation
            embed.addFields({
                name: '🤝 Community Participation',
                value: `🎮 **Nominate a game**: ${GP_REWARDS.NOMINATION} GP per nomination (max 2/month)\n` +
                       `🗳️ **Vote in polls**: ${GP_REWARDS.VOTE} GP per vote (including tiebreakers)`,
                inline: false
            });

            // Monthly Challenges
            embed.addFields({
                name: '🏆 Monthly Challenge Awards',
                value: `🏁 **Participation**: ${GP_REWARDS.MONTHLY_PARTICIPATION} GP (earn ≥1 achievement)\n` +
                       `⭐ **Beaten**: ${GP_REWARDS.MONTHLY_BEATEN} GP (complete core achievements)\n` +
                       `✨ **Mastery**: ${GP_REWARDS.MONTHLY_MASTERY} GP (earn all achievements)`,
                inline: false
            });

            // Shadow Challenges
            embed.addFields({
                name: '👥 Shadow Challenge Awards',
                value: `🏁 **Participation**: ${GP_REWARDS.SHADOW_PARTICIPATION} GP (earn ≥1 achievement)\n` +
                       `⭐ **Beaten**: ${GP_REWARDS.SHADOW_BEATEN} GP (complete core achievements)\n` +
                       `✨ **Mastery**: ${GP_REWARDS.SHADOW_MASTERY} GP (earn all achievements)`,
                inline: false
            });

            // Regular Games
            embed.addFields({
                name: '🎮 Regular Game Awards',
                value: `⭐ **Beaten any game**: ${GP_REWARDS.REGULAR_BEATEN} GP (announced in achievement feed)\n` +
                       `✨ **Mastery any game**: ${GP_REWARDS.REGULAR_MASTERY} GP (announced in achievement feed)`,
                inline: false
            });

            // Monthly Grant
            embed.addFields({
                name: '🎁 Monthly Grant',
                value: '💰 **1,000 GP** automatically given on the 1st of each month',
                inline: false
            });

            // Monthly Potential
            const maxMonthly = GP_REWARDS.NOMINATION * 2 + GP_REWARDS.VOTE + 
                              GP_REWARDS.MONTHLY_MASTERY + GP_REWARDS.SHADOW_MASTERY + 1000;
            
            embed.addFields({
                name: '📊 Maximum Monthly Potential',
                value: `**Base Monthly**: ~${maxMonthly.toLocaleString()} GP\n` +
                       `• Community: ${GP_REWARDS.NOMINATION * 2 + GP_REWARDS.VOTE} GP (2 nominations + 1 vote)\n` +
                       `• Monthly Challenge: ${GP_REWARDS.MONTHLY_MASTERY} GP (mastery)\n` +
                       `• Shadow Challenge: ${GP_REWARDS.SHADOW_MASTERY} GP (mastery)\n` +
                       `• Monthly Grant: 1,000 GP\n` +
                       `• **Plus unlimited GP from regular games!** (${GP_REWARDS.REGULAR_MASTERY} GP each)`,
                inline: false
            });

            embed.addFields({
                name: '💡 Pro Tips',
                value: '• Participate in nominations and voting each month\n' +
                       '• Aim for mastery in both monthly and shadow challenges\n' +
                       '• Regular game completions add up quickly!\n' +
                       '• Check your GP balance with `/gp balance`',
                inline: false
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing GP breakdown:', error);
            await interaction.editReply('Error retrieving GP breakdown.');
        }
    }
};
