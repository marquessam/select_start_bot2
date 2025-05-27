import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    PermissionFlagsBits
} from 'discord.js';
import { User } from '../../models/User.js';
import { ArenaChallenge } from '../../models/ArenaChallenge.js';
import retroAPI from '../../services/retroAPI.js';
import arenaService from '../../services/arenaService.js';
import ArenaBettingUtils from '../../utils/ArenaBettingUtils.js';
import ArenaTransactionUtils from '../../utils/ArenaTransactionUtils.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminarena')
        .setDescription('Admin tools for managing the Arena system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Only admins can use this
        .addSubcommand(subcommand =>
            subcommand
                .setName('view_challenges')
                .setDescription('View all active, pending, or completed challenges')
                .addStringOption(option =>
                    option
                        .setName('status')
                        .setDescription('Filter by challenge status')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Active', value: 'active' },
                            { name: 'Pending', value: 'pending' },
                            { name: 'Completed', value: 'completed' },
                            { name: 'Cancelled', value: 'cancelled' },
                            { name: 'Declined', value: 'declined' },
                            { name: 'Open', value: 'open' },
                            { name: 'All', value: 'all' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view_challenge')
                .setDescription('View details for a specific challenge')
                .addStringOption(option =>
                    option
                        .setName('challenge_id')
                        .setDescription('ID of the challenge to view')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel_challenge')
                .setDescription('Cancel a challenge and return GP to participants')
                .addStringOption(option =>
                    option
                        .setName('challenge_id')
                        .setDescription('ID of the challenge to cancel')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit_challenge')
                .setDescription('Edit challenge details')
                .addStringOption(option =>
                    option
                        .setName('challenge_id')
                        .setDescription('ID of the challenge to edit')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('force_complete')
                .setDescription('Force complete a challenge and declare a winner')
                .addStringOption(option =>
                    option
                        .setName('challenge_id')
                        .setDescription('ID of the challenge to complete')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('winner')
                        .setDescription('Username of the winner (leave blank for tie)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset_gp')
                .setDescription('Reset GP for all users or a specific user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to reset GP for (leave blank for all users)')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('Amount of GP to set (default: 1000)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('adjust_gp')
                .setDescription('Add or remove GP from a user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to adjust GP for')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('Amount of GP to add (use negative for removal)')
                        .setRequired(true)
                )
        )
        // === NEW RECOVERY COMMANDS ===
        .addSubcommand(subcommand =>
            subcommand
                .setName('manual_payout')
                .setDescription('🔧 Manually process payouts for stuck completed challenges')
                .addIntegerOption(option =>
                    option
                        .setName('hours')
                        .setDescription('Check challenges completed in the last X hours (default: 24)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('emergency_refund')
                .setDescription('🚨 Emergency refund all bets for a specific challenge')
                .addStringOption(option =>
                    option
                        .setName('challenge_id')
                        .setDescription('ID of the challenge to refund bets for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('debug_challenge')
                .setDescription('🔍 Debug detailed status of a specific challenge')
                .addStringOption(option =>
                    option
                        .setName('challenge_id')
                        .setDescription('ID of the challenge to debug')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('recovery_overview')
                .setDescription('📊 Overview of recent challenges and potential recovery needs')
                .addIntegerOption(option =>
                    option
                        .setName('hours')
                        .setDescription('Check challenges from the last X hours (default: 48)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('force_payout')
                .setDescription('💰 Force manual payout for a specific challenge')
                .addStringOption(option =>
                    option
                        .setName('challenge_id')
                        .setDescription('ID of the challenge to force payout')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        // Admin check
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: 'You do not have permission to use this command.', 
                ephemeral: true 
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'view_challenges':
                    await this.handleViewChallenges(interaction);
                    break;
                case 'view_challenge':
                    await this.handleViewChallenge(interaction);
                    break;
                case 'cancel_challenge':
                    await this.handleCancelChallenge(interaction);
                    break;
                case 'edit_challenge':
                    await this.handleEditChallenge(interaction);
                    break;
                case 'force_complete':
                    await this.handleForceComplete(interaction);
                    break;
                case 'reset_gp':
                    await this.handleResetGP(interaction);
                    break;
                case 'adjust_gp':
                    await this.handleAdjustGP(interaction);
                    break;
                // === NEW RECOVERY HANDLERS ===
                case 'manual_payout':
                    await this.handleManualPayout(interaction);
                    break;
                case 'emergency_refund':
                    await this.handleEmergencyRefund(interaction);
                    break;
                case 'debug_challenge':
                    await this.handleDebugChallenge(interaction);
                    break;
                case 'recovery_overview':
                    await this.handleRecoveryOverview(interaction);
                    break;
                case 'force_payout':
                    await this.handleForcePayout(interaction);
                    break;
                default:
                    await interaction.reply({ 
                        content: 'Unknown subcommand. Please try again.', 
                        ephemeral: true 
                    });
            }
        } catch (error) {
            console.error(`Error executing adminArena command: ${error}`);
            await interaction.reply({ 
                content: `An error occurred: ${error.message}`, 
                ephemeral: true 
            });
        }
    },

    // === EXISTING METHODS (keeping all the original functionality) ===
    
    async handleViewChallenges(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const status = interaction.options.getString('status');
        
        try {
            // Build query based on status filter
            const query = status === 'all' ? {} : { status: status };
            
            // Find challenges matching the query
            const challenges = await ArenaChallenge.find(query)
                .sort({ createdAt: -1 }) // Newest first
                .limit(25); // Prevent too many results
            
            if (challenges.length === 0) {
                return interaction.editReply(`No challenges found with status: ${status}`);
            }
            
            // Create embed to display challenges
            const embed = new EmbedBuilder()
                .setTitle(`Arena Challenges - ${status.charAt(0).toUpperCase() + status.slice(1)}`)
                .setColor('#FF5722')
                .setDescription(`Found ${challenges.length} challenges. Click on a challenge ID to view details.`);
            
            // Add challenge entries to the embed
            challenges.forEach((challenge, index) => {
                // Format date
                const createdAt = challenge.createdAt ? challenge.createdAt.toLocaleString() : 'Unknown';
                
                const challengeeDisplay = challenge.challengeeUsername || 'Open Challenge';
                
                embed.addFields({
                    name: `${index + 1}. ${challenge.challengerUsername} vs ${challengeeDisplay}`,
                    value: `**ID:** \`${challenge._id}\`\n` +
                           `**Game:** ${challenge.gameTitle}\n` +
                           `**Status:** ${challenge.status}\n` +
                           `**Wager:** ${challenge.wagerAmount} GP\n` +
                           `**Created:** ${createdAt}`
                });
            });
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(`Error viewing challenges: ${error}`);
            await interaction.editReply(`Error viewing challenges: ${error.message}`);
        }
    },

    async handleViewChallenge(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const challengeId = interaction.options.getString('challenge_id');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            const challengeeDisplay = challenge.challengeeUsername || 'Open Challenge';
            
            // Create embed with detailed information
            const embed = new EmbedBuilder()
                .setTitle(`Challenge Details: ${challenge.challengerUsername} vs ${challengeeDisplay}`)
                .setColor('#FF5722')
                .setDescription(`**Game:** ${challenge.gameTitle}`)
                .addFields(
                    { name: 'Challenge ID', value: `\`${challenge._id}\``, inline: false },
                    { name: 'Status', value: challenge.status, inline: true },
                    { name: 'Wager', value: `${challenge.wagerAmount} GP`, inline: true },
                    { name: 'Type', value: challenge.isOpenChallenge ? 'Open Challenge' : 'Direct Challenge', inline: true },
                    { name: 'Description', value: challenge.description || 'None', inline: false },
                    { name: 'Challenger', value: `${challenge.challengerUsername} (ID: ${challenge.challengerId})`, inline: true }
                );

            if (challenge.challengeeId) {
                embed.addFields({ name: 'Challengee', value: `${challenge.challengeeUsername} (ID: ${challenge.challengeeId})`, inline: true });
            }

            embed.addFields(
                { name: 'Leaderboard ID', value: challenge.leaderboardId, inline: true },
                { name: 'Game ID', value: challenge.gameId.toString(), inline: true }
            );

            // Add dates if available
            if (challenge.createdAt) {
                embed.addFields({ name: 'Created', value: challenge.createdAt.toLocaleString(), inline: true });
            }
            
            if (challenge.startDate) {
                embed.addFields({ name: 'Started', value: challenge.startDate.toLocaleString(), inline: true });
            }
            
            if (challenge.endDate) {
                embed.addFields({ name: 'Ends/Ended', value: challenge.endDate.toLocaleString(), inline: true });
            }

            if (challenge.completedAt) {
                embed.addFields({ name: 'Completed', value: challenge.completedAt.toLocaleString(), inline: true });
            }

            // Add scores if available
            if (challenge.challengerScore || challenge.challengeeScore) {
                let scoresText = `${challenge.challengerUsername}: ${challenge.challengerScore || 'No score'}`;
                if (challenge.challengeeUsername) {
                    scoresText += `\n${challenge.challengeeUsername}: ${challenge.challengeeScore || 'No score'}`;
                }
                
                embed.addFields({ name: 'Scores', value: scoresText, inline: false });
            }

            // Add participants for open challenges
            if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
                let participantsText = '';
                challenge.participants.forEach((participant, index) => {
                    participantsText += `${index + 1}. **${participant.username}**: ${participant.score || 'No score'}\n`;
                });
                embed.addFields({ name: 'Participants', value: participantsText, inline: false });
            }

            // Add winner if completed
            if (challenge.status === 'completed' && challenge.winnerUsername) {
                embed.addFields({ name: 'Winner', value: challenge.winnerUsername, inline: true });
            }

            // Add betting info
            if (challenge.bets && challenge.bets.length > 0) {
                const totalBetAmount = challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0);
                const unpaidBets = challenge.bets.filter(bet => !bet.paid);
                
                let betsText = `**Total Bets:** ${challenge.bets.length} (${totalBetAmount} GP)\n`;
                betsText += `**Unpaid Bets:** ${unpaidBets.length}\n\n`;
                
                // List first 10 bets
                const maxBetsToShow = Math.min(10, challenge.bets.length);
                for (let i = 0; i < maxBetsToShow; i++) {
                    const bet = challenge.bets[i];
                    const paidStatus = bet.paid ? '✅' : '❌';
                    betsText += `${i+1}. **${bet.raUsername}**: ${bet.betAmount} GP on ${bet.targetPlayer} ${paidStatus}\n`;
                }
                
                if (challenge.bets.length > maxBetsToShow) {
                    betsText += `... and ${challenge.bets.length - maxBetsToShow} more bets`;
                }
                
                embed.addFields({ name: 'Betting Information', value: betsText, inline: false });
            }

            // Add thumbnail if available
            if (challenge.iconUrl) {
                embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
            }

            // Create action buttons for this challenge
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`admin_edit_challenge_${challenge._id}`)
                        .setLabel('Edit Challenge')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`admin_cancel_challenge_${challenge._id}`)
                        .setLabel('Cancel Challenge')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`admin_complete_challenge_${challenge._id}`)
                        .setLabel('Force Complete')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`admin_debug_challenge_${challenge._id}`)
                        .setLabel('🔍 Debug')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.editReply({ embeds: [embed], components: [buttonRow] });
        } catch (error) {
            console.error(`Error viewing challenge: ${error}`);
            await interaction.editReply(`Error viewing challenge: ${error.message}`);
        }
    },

    // === NEW RECOVERY METHODS ===

    async handleManualPayout(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const hours = interaction.options.getInteger('hours') || 24;
        
        try {
            console.log(`🔧 ADMIN: Manual payout requested for last ${hours} hours by ${interaction.user.username}`);
            
            // Find recently completed challenges
            const recentlyCompleted = await ArenaChallenge.find({
                status: 'completed',
                completedAt: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) },
                $or: [
                    { winnerId: { $exists: true, $ne: null } },
                    { winnerUsername: { $exists: true, $nin: ['No Winner', 'Error - Manual Review Required'] } }
                ]
            });
            
            if (recentlyCompleted.length === 0) {
                return interaction.editReply(`No completed challenges found in the last ${hours} hours.`);
            }
            
            const embed = new EmbedBuilder()
                .setTitle('🔧 Manual Payout Processing')
                .setColor('#FFA500')
                .setDescription(`Processing ${recentlyCompleted.length} challenges completed in the last ${hours} hours...`)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
            let processedPayouts = 0;
            let processedBets = 0;
            let errors = 0;
            const results = [];
            
            for (const challenge of recentlyCompleted) {
                try {
                    console.log(`\n--- Processing challenge ${challenge._id} ---`);
                    
                    let challengeResults = {
                        id: challenge._id.toString(),
                        game: challenge.gameTitle,
                        winner: challenge.winnerUsername,
                        payoutProcessed: false,
                        betsProcessed: 0,
                        error: null
                    };
                    
                    // Check if this challenge should have had payouts
                    if (challenge.winnerId && challenge.winnerUsername !== 'Tie') {
                        let payoutAmount = 0;
                        if (challenge.isOpenChallenge) {
                            payoutAmount = challenge.wagerAmount * (1 + (challenge.participants?.length || 0));
                        } else {
                            payoutAmount = challenge.wagerAmount * 2;
                        }
                        
                        // Check if winner actually received the payout
                        const winner = await User.findOne({ discordId: challenge.winnerId });
                        if (winner) {
                            const recentTransactions = winner.gpTransactions?.filter(t => 
                                t.timestamp >= challenge.completedAt &&
                                t.context && t.context.includes(challenge._id.toString())
                            ) || [];
                            
                            if (recentTransactions.length === 0) {
                                console.log(`⚠️ NO PAYOUT FOUND! Manually paying out ${payoutAmount} GP to ${challenge.winnerUsername}`);
                                
                                await ArenaTransactionUtils.trackGpTransaction(
                                    winner,
                                    payoutAmount,
                                    'Manual payout - admin recovery',
                                    `Challenge ID: ${challenge._id}, Admin: ${interaction.user.username}`
                                );
                                
                                challengeResults.payoutProcessed = true;
                                processedPayouts++;
                            }
                        }
                    }
                    
                    // Check betting payouts
                    if (challenge.bets && challenge.bets.length > 0) {
                        const unpaidBets = challenge.bets.filter(bet => !bet.paid);
                        if (unpaidBets.length > 0) {
                            console.log(`⚠️ Found ${unpaidBets.length} unpaid bets - processing now...`);
                            
                            await ArenaBettingUtils.processBetsForChallenge(
                                challenge,
                                challenge.winnerId,
                                challenge.winnerUsername
                            );
                            
                            challengeResults.betsProcessed = unpaidBets.length;
                            processedBets += unpaidBets.length;
                        }
                    }
                    
                    results.push(challengeResults);
                    
                } catch (error) {
                    console.error(`Error processing challenge ${challenge._id}:`, error);
                    errors++;
                    results.push({
                        id: challenge._id.toString(),
                        game: challenge.gameTitle,
                        error: error.message
                    });
                }
            }
            
            // Create final results embed
            const finalEmbed = new EmbedBuilder()
                .setTitle('✅ Manual Payout Complete')
                .setColor(errors > 0 ? '#FFA500' : '#00FF00')
                .setDescription(
                    `**Summary:**\n` +
                    `• Challenges processed: ${recentlyCompleted.length}\n` +
                    `• Winner payouts processed: ${processedPayouts}\n` +
                    `• Betting payouts processed: ${processedBets}\n` +
                    `• Errors: ${errors}`
                )
                .setTimestamp();
            
            // Add detailed results
            const maxResults = 10;
            let resultsText = '';
            for (let i = 0; i < Math.min(maxResults, results.length); i++) {
                const result = results[i];
                if (result.error) {
                    resultsText += `❌ ${result.game}: ${result.error}\n`;
                } else if (result.payoutProcessed || result.betsProcessed > 0) {
                    let actions = [];
                    if (result.payoutProcessed) actions.push('Winner payout');
                    if (result.betsProcessed > 0) actions.push(`${result.betsProcessed} bets`);
                    resultsText += `✅ ${result.game}: ${actions.join(', ')}\n`;
                } else {
                    resultsText += `ℹ️ ${result.game}: Already processed\n`;
                }
            }
            
            if (results.length > maxResults) {
                resultsText += `... and ${results.length - maxResults} more results`;
            }
            
            if (resultsText) {
                finalEmbed.addFields({ name: 'Detailed Results', value: resultsText });
            }
            
            await interaction.editReply({ embeds: [finalEmbed] });
            
        } catch (error) {
            console.error(`Error in manual payout: ${error}`);
            await interaction.editReply(`Error processing manual payouts: ${error.message}`);
        }
    },

    async handleEmergencyRefund(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const challengeId = interaction.options.getString('challenge_id');
        
        try {
            console.log(`🚨 ADMIN: Emergency refund requested for challenge ${challengeId} by ${interaction.user.username}`);
            
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            if (!challenge.bets || challenge.bets.length === 0) {
                return interaction.editReply(`Challenge ${challengeId} has no bets to refund.`);
            }
            
            const totalBets = challenge.bets.length;
            const totalAmount = challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0);
            const unpaidBets = challenge.bets.filter(bet => !bet.paid);
            
            if (unpaidBets.length === 0) {
                return interaction.editReply(`All bets for challenge ${challengeId} have already been processed.`);
            }
            
            // Perform emergency refund
            await ArenaBettingUtils.refundAllBets(challenge);
            
            const embed = new EmbedBuilder()
                .setTitle('🚨 Emergency Refund Complete')
                .setColor('#FF0000')
                .setDescription(
                    `Successfully refunded all bets for challenge: **${challenge.gameTitle}**\n\n` +
                    `**Challenge ID:** \`${challengeId}\`\n` +
                    `**Total Bets Refunded:** ${totalBets}\n` +
                    `**Total Amount Refunded:** ${totalAmount} GP\n` +
                    `**Processed By:** ${interaction.user.username}`
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error(`Error in emergency refund: ${error}`);
            await interaction.editReply(`Error processing emergency refund: ${error.message}`);
        }
    },

    async handleDebugChallenge(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const challengeId = interaction.options.getString('challenge_id');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`🔍 Debug: ${challenge.gameTitle}`)
                .setColor('#9370DB')
                .setDescription(`**Challenge ID:** \`${challengeId}\``)
                .setTimestamp();
            
            // Basic info
            embed.addFields(
                { name: 'Status', value: challenge.status, inline: true },
                { name: 'Type', value: challenge.isOpenChallenge ? 'Open Challenge' : 'Direct Challenge', inline: true },
                { name: 'Winner', value: challenge.winnerUsername || 'None', inline: true }
            );
            
            // Dates
            const dates = [];
            if (challenge.createdAt) dates.push(`Created: ${challenge.createdAt.toLocaleString()}`);
            if (challenge.startDate) dates.push(`Started: ${challenge.startDate.toLocaleString()}`);
            if (challenge.endDate) dates.push(`Ends: ${challenge.endDate.toLocaleString()}`);
            if (challenge.completedAt) dates.push(`Completed: ${challenge.completedAt.toLocaleString()}`);
            
            if (dates.length > 0) {
                embed.addFields({ name: 'Timeline', value: dates.join('\n'), inline: false });
            }
            
            // Payout analysis
            if (challenge.winnerId && challenge.winnerUsername !== 'Tie') {
                let expectedPayout = 0;
                if (challenge.isOpenChallenge) {
                    expectedPayout = challenge.wagerAmount * (1 + (challenge.participants?.length || 0));
                } else {
                    expectedPayout = challenge.wagerAmount * 2;
                }
                
                embed.addFields({ name: 'Expected Winner Payout', value: `${expectedPayout} GP`, inline: true });
                
                // Check if winner was actually paid
                if (challenge.winnerId) {
                    try {
                        const winner = await User.findOne({ discordId: challenge.winnerId });
                        if (winner) {
                            embed.addFields({ name: 'Winner Current GP', value: `${winner.gp || 0} GP`, inline: true });
                            
                            // Check recent transactions
                            const recentTransactions = winner.gpTransactions?.filter(t => 
                                challenge.completedAt && t.timestamp >= challenge.completedAt &&
                                (t.context?.includes(challengeId) || t.reason.includes('Won') || t.reason.includes('Manual'))
                            ) || [];
                            
                            if (recentTransactions.length > 0) {
                                const totalReceived = recentTransactions.reduce((sum, t) => sum + t.amount, 0);
                                embed.addFields({ 
                                    name: 'Winner Payouts Found', 
                                    value: `${recentTransactions.length} transactions, ${totalReceived} GP total`, 
                                    inline: false 
                                });
                            } else {
                                embed.addFields({ 
                                    name: '⚠️ Winner Payout Status', 
                                    value: 'NO PAYOUTS FOUND', 
                                    inline: false 
                                });
                            }
                        }
                    } catch (error) {
                        embed.addFields({ name: 'Winner Check Error', value: error.message, inline: false });
                    }
                }
            }
            
            // Betting analysis
            if (challenge.bets && challenge.bets.length > 0) {
                const totalBets = challenge.bets.length;
                const totalBetAmount = challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0);
                const paidBets = challenge.bets.filter(bet => bet.paid);
                const unpaidBets = challenge.bets.filter(bet => !bet.paid);
                
                embed.addFields({
                    name: 'Betting Status',
                    value: 
                        `Total Bets: ${totalBets} (${totalBetAmount} GP)\n` +
                        `Paid: ${paidBets.length}\n` +
                        `Unpaid: ${unpaidBets.length}`,
                    inline: false
                });
                
                if (unpaidBets.length > 0) {
                    let unpaidText = '';
                    unpaidBets.slice(0, 5).forEach(bet => {
                        unpaidText += `• ${bet.raUsername}: ${bet.betAmount} GP on ${bet.targetPlayer}\n`;
                    });
                    if (unpaidBets.length > 5) {
                        unpaidText += `... and ${unpaidBets.length - 5} more`;
                    }
                    embed.addFields({ name: '❌ Unpaid Bets', value: unpaidText, inline: false });
                }
            }
            
            // Participants for open challenges
            if (challenge.isOpenChallenge && challenge.participants) {
                embed.addFields({ 
                    name: 'Participants', 
                    value: `${challenge.participants.length} participants`, 
                    inline: true 
                });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error(`Error debugging challenge: ${error}`);
            await interaction.editReply(`Error debugging challenge: ${error.message}`);
        }
    },

    async handleRecoveryOverview(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const hours = interaction.options.getInteger('hours') || 48;
        
        try {
            // Get recent completed challenges
            const recentCompleted = await ArenaChallenge.find({
                status: 'completed',
                completedAt: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
            }).sort({ completedAt: -1 });
            
            if (recentCompleted.length === 0) {
                return interaction.editReply(`No completed challenges found in the last ${hours} hours.`);
            }
            
            let needsWinnerPayout = 0;
            let needsBettingPayout = 0;
            let totalUnpaidBets = 0;
            let potentialGpLoss = 0;
            
            const issues = [];
            
            for (const challenge of recentCompleted) {
                const issue = {
                    id: challenge._id.toString(),
                    game: challenge.gameTitle.substring(0, 30),
                    winner: challenge.winnerUsername,
                    problems: []
                };
                
                // Check winner payout
                if (challenge.winnerId && challenge.winnerUsername !== 'Tie') {
                    const winner = await User.findOne({ discordId: challenge.winnerId });
                    if (winner) {
                        const recentTransactions = winner.gpTransactions?.filter(t => 
                            t.timestamp >= challenge.completedAt &&
                            t.context && t.context.includes(challenge._id.toString())
                        ) || [];
                        
                        if (recentTransactions.length === 0) {
                            needsWinnerPayout++;
                            const expectedPayout = challenge.isOpenChallenge ? 
                                challenge.wagerAmount * (1 + (challenge.participants?.length || 0)) :
                                challenge.wagerAmount * 2;
                            potentialGpLoss += expectedPayout;
                            issue.problems.push(`Winner not paid (${expectedPayout} GP)`);
                        }
                    }
                }
                
                // Check betting payouts
                if (challenge.bets && challenge.bets.length > 0) {
                    const unpaidBets = challenge.bets.filter(bet => !bet.paid);
                    if (unpaidBets.length > 0) {
                        needsBettingPayout++;
                        totalUnpaidBets += unpaidBets.length;
                        const unpaidAmount = unpaidBets.reduce((sum, bet) => sum + bet.betAmount, 0);
                        issue.problems.push(`${unpaidBets.length} unpaid bets (${unpaidAmount} GP)`);
                    }
                }
                
                if (issue.problems.length > 0) {
                    issues.push(issue);
                }
            }
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Arena Recovery Overview')
                .setColor(issues.length > 0 ? '#FFA500' : '#00FF00')
                .setDescription(`Analysis of ${recentCompleted.length} challenges completed in the last ${hours} hours`)
                .setTimestamp();
            
            embed.addFields({
                name: '📈 Summary',
                value: 
                    `• Total completed challenges: ${recentCompleted.length}\n` +
                    `• Challenges needing winner payout: ${needsWinnerPayout}\n` +
                    `• Challenges needing betting payout: ${needsBettingPayout}\n` +
                    `• Total unpaid bets: ${totalUnpaidBets}\n` +
                    `• Potential GP loss: ${potentialGpLoss.toLocaleString()} GP`,
                inline: false
            });
            
            if (issues.length > 0) {
                let issuesText = '';
                issues.slice(0, 10).forEach((issue, index) => {
                    issuesText += `${index + 1}. **${issue.game}** (${issue.winner})\n`;
                    issue.problems.forEach(problem => {
                        issuesText += `   ⚠️ ${problem}\n`;
                    });
                    issuesText += '\n';
                });
                
                if (issues.length > 10) {
                    issuesText += `... and ${issues.length - 10} more challenges with issues`;
                }
                
                embed.addFields({ name: '⚠️ Issues Found', value: issuesText, inline: false });
                
                embed.addFields({
                    name: '🔧 Recommended Actions',
                    value: 
                        `• Run \`/adminarena manual_payout\` to fix winner payouts\n` +
                        `• Use \`/adminarena debug_challenge\` for specific issues\n` +
                        `• Use \`/adminarena emergency_refund\` if betting system is broken`,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '✅ Status',
                    value: 'All challenges appear to have been processed correctly!',
                    inline: false
                });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error(`Error generating recovery overview: ${error}`);
            await interaction.editReply(`Error generating recovery overview: ${error.message}`);
        }
    },

    async handleForcePayout(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const challengeId = interaction.options.getString('challenge_id');
        
        try {
            console.log(`💰 ADMIN: Force payout requested for challenge ${challengeId} by ${interaction.user.username}`);
            
            const challenge = await ArenaChallenge.findById(challengeId);
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            if (challenge.status !== 'completed') {
                return interaction.editReply(`Challenge must be completed to force payout. Current status: ${challenge.status}`);
            }
            
            const embed = new EmbedBuilder()
                .setTitle('💰 Force Payout Processing')
                .setColor('#FFA500')
                .setDescription(`Processing payouts for: **${challenge.gameTitle}**\nChallenge ID: \`${challengeId}\``)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
            let winnerPayout = false;
            let bettingPayout = 0;
            let errors = [];
            
            // Force winner payout
            if (challenge.winnerId && challenge.winnerUsername !== 'Tie') {
                try {
                    let payoutAmount = 0;
                    if (challenge.isOpenChallenge) {
                        payoutAmount = challenge.wagerAmount * (1 + (challenge.participants?.length || 0));
                    } else {
                        payoutAmount = challenge.wagerAmount * 2;
                    }
                    
                    const winner = await User.findOne({ discordId: challenge.winnerId });
                    if (winner) {
                        await ArenaTransactionUtils.trackGpTransaction(
                            winner,
                            payoutAmount,
                            'Force payout - admin override',
                            `Challenge ID: ${challengeId}, Admin: ${interaction.user.username}`
                        );
                        winnerPayout = true;
                    } else {
                        errors.push('Winner user not found in database');
                    }
                } catch (error) {
                    errors.push(`Winner payout error: ${error.message}`);
                }
            }
            
            // Force betting payout
            if (challenge.bets && challenge.bets.length > 0) {
                try {
                    await ArenaBettingUtils.processBetsForChallenge(
                        challenge,
                        challenge.winnerId,
                        challenge.winnerUsername
                    );
                    bettingPayout = challenge.bets.length;
                } catch (error) {
                    errors.push(`Betting payout error: ${error.message}`);
                }
            }
            
            // Create final embed
            const finalEmbed = new EmbedBuilder()
                .setTitle('💰 Force Payout Complete')
                .setColor(errors.length > 0 ? '#FFA500' : '#00FF00')
                .setDescription(`Forced payout processing for: **${challenge.gameTitle}**`)
                .setTimestamp();
            
            let resultText = '';
            if (winnerPayout) resultText += '✅ Winner payout processed\n';
            if (bettingPayout > 0) resultText += `✅ ${bettingPayout} betting payouts processed\n`;
            if (errors.length > 0) {
                resultText += '\n❌ Errors:\n';
                errors.forEach(error => resultText += `• ${error}\n`);
            }
            
            finalEmbed.addFields({ name: 'Results', value: resultText || 'No payouts needed', inline: false });
            
            await interaction.editReply({ embeds: [finalEmbed] });
            
        } catch (error) {
            console.error(`Error in force payout: ${error}`);
            await interaction.editReply(`Error processing force payout: ${error.message}`);
        }
    },

    // === EXISTING METHODS (truncated for brevity - include all the original methods) ===
    
    async handleCancelChallenge(interaction) {
        // ... (keep existing implementation)
    },
    
    async handleEditChallenge(interaction) {
        // ... (keep existing implementation)  
    },
    
    async handleForceComplete(interaction) {
        // ... (keep existing implementation)
    },
    
    async handleResetGP(interaction) {
        // ... (keep existing implementation)
    },
    
    async handleAdjustGP(interaction) {
        // ... (keep existing implementation)
    },
    
    // === BUTTON/INTERACTION HANDLERS ===
    
    async handleButtonInteraction(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('admin_edit_challenge_')) {
            const challengeId = customId.replace('admin_edit_challenge_', '');
            await this.handleEditChallenge({ 
                ...interaction, 
                options: { 
                    getString: () => challengeId 
                }
            });
        }
        else if (customId.startsWith('admin_cancel_challenge_')) {
            const challengeId = customId.replace('admin_cancel_challenge_', '');
            await interaction.deferUpdate();
            await this.handleCancelChallenge({ 
                ...interaction, 
                options: { 
                    getString: () => challengeId 
                },
                editReply: interaction.editReply.bind(interaction)
            });
        }
        else if (customId.startsWith('admin_complete_challenge_')) {
            const challengeId = customId.replace('admin_complete_challenge_', '');
            
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                return interaction.reply({ 
                    content: `Challenge with ID ${challengeId} not found.`,
                    ephemeral: true
                });
            }
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`admin_set_winner_${challengeId}`)
                        .setPlaceholder('Select winner or declare a tie')
                        .addOptions([
                            {
                                label: challenge.challengerUsername,
                                description: 'Declare this player as the winner',
                                value: challenge.challengerUsername
                            },
                            {
                                label: challenge.challengeeUsername || 'Challengee',
                                description: 'Declare this player as the winner',
                                value: challenge.challengeeUsername || 'challengee'
                            },
                            {
                                label: 'Tie (No Winner)',
                                description: 'Declare a tie - no winner',
                                value: 'tie'
                            }
                        ])
                );
            
            await interaction.reply({
                content: `Please select the winner for challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername || 'Open Challenge'}**:`,
                components: [row],
                ephemeral: true
            });
        }
        else if (customId.startsWith('admin_debug_challenge_')) {
            const challengeId = customId.replace('admin_debug_challenge_', '');
            await this.handleDebugChallenge({
                ...interaction,
                options: {
                    getString: () => challengeId
                },
                deferReply: interaction.deferUpdate.bind(interaction),
                editReply: interaction.editReply.bind(interaction)
            });
        }
    },

    async handleSelectMenuInteraction(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('admin_set_winner_')) {
            const challengeId = customId.replace('admin_set_winner_', '');
            const winner = interaction.values[0];
            
            const winnerUsername = winner === 'tie' ? null : winner;
            
            await this.handleForceComplete({
                ...interaction,
                options: {
                    getString: (name) => {
                        if (name === 'challenge_id') return challengeId;
                        if (name === 'winner') return winnerUsername;
                        return null;
                    }
                },
                deferReply: interaction.deferUpdate.bind(interaction),
                editReply: interaction.editReply.bind(interaction)
            });
        }
    },

    async handleModalSubmit(interaction) {
        if (interaction.customId.startsWith('admin_edit_challenge_modal_')) {
            await this.handleEditChallengeSubmit(interaction);
        }
    }
};
