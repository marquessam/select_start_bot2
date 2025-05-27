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
        // === RECOVERY COMMANDS ===
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
        )
        // === NEW GP DUPLICATE CLEANUP COMMANDS ===
        .addSubcommand(subcommand =>
            subcommand
                .setName('diagnose_gp_duplicates')
                .setDescription('🔍 Diagnose GP duplicate issues across all users')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup_gp_duplicates')
                .setDescription('🧹 Clean up duplicate GP awards (automatic duplicate detection)')
                .addBooleanOption(option =>
                    option
                        .setName('execute')
                        .setDescription('Actually remove duplicates (default: false for preview)')
                        .setRequired(false)
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
                // === RECOVERY HANDLERS ===
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
                // === NEW GP DUPLICATE HANDLERS ===
                case 'diagnose_gp_duplicates':
                    await this.handleDiagnoseGpDuplicates(interaction);
                    break;
                case 'cleanup_gp_duplicates':
                    await this.handleCleanupGpDuplicates(interaction);
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

    // === GP DUPLICATE DIAGNOSTIC AND CLEANUP METHODS ===

    async diagnoseGpDuplicates() {
        console.log('🔍 Starting GP duplicate diagnosis...');
        
        const users = await User.find({
            $and: [
                { gp: { $gt: 0 } },
                { gpTransactions: { $exists: true, $ne: [] } }
            ]
        });
        
        const analysis = {
            totalUsers: users.length,
            usersWithIssues: 0,
            totalExcessGp: 0,
            duplicateTypes: {
                monthlyAwards: 0,
                challengePayouts: 0,
                rapidFire: 0
            },
            topOffenders: []
        };
        
        for (const user of users) {
            let userExcessGp = 0;
            let userIssues = [];
            
            // Check for duplicate monthly awards
            const monthlyAwards = user.gpTransactions.filter(t => 
                t.reason && t.reason.includes('Monthly GP')
            );
            
            if (monthlyAwards.length > 1) {
                const monthlyGroups = {};
                monthlyAwards.forEach(award => {
                    const month = award.timestamp.toISOString().substring(0, 7); // YYYY-MM
                    if (!monthlyGroups[month]) monthlyGroups[month] = [];
                    monthlyGroups[month].push(award);
                });
                
                let monthlyDuplicates = 0;
                Object.values(monthlyGroups).forEach(group => {
                    if (group.length > 1) {
                        monthlyDuplicates += group.length - 1;
                        userExcessGp += (group.length - 1) * 1000; // Monthly awards are 1000 GP
                    }
                });
                
                if (monthlyDuplicates > 0) {
                    userIssues.push(`${monthlyDuplicates} duplicate monthly awards`);
                    analysis.duplicateTypes.monthlyAwards += monthlyDuplicates;
                }
            }
            
            // Check for duplicate challenge payouts
            const challengePayouts = user.gpTransactions.filter(t => 
                t.reason && (t.reason.includes('Won') || t.reason.includes('Challenge'))
            );
            
            if (challengePayouts.length > 1) {
                const challengeGroups = {};
                challengePayouts.forEach(payout => {
                    const key = `${payout.reason}_${payout.amount}_${payout.timestamp.toISOString().substring(0, 10)}`;
                    if (!challengeGroups[key]) challengeGroups[key] = [];
                    challengeGroups[key].push(payout);
                });
                
                let challengeDuplicates = 0;
                Object.values(challengeGroups).forEach(group => {
                    if (group.length > 1) {
                        challengeDuplicates += group.length - 1;
                        userExcessGp += (group.length - 1) * group[0].amount;
                    }
                });
                
                if (challengeDuplicates > 0) {
                    userIssues.push(`${challengeDuplicates} duplicate challenge payouts`);
                    analysis.duplicateTypes.challengePayouts += challengeDuplicates;
                }
            }
            
            // Check for rapid-fire identical transactions (within 1 minute)
            const sortedTransactions = user.gpTransactions.sort((a, b) => a.timestamp - b.timestamp);
            let rapidFireDuplicates = 0;
            
            for (let i = 1; i < sortedTransactions.length; i++) {
                const current = sortedTransactions[i];
                const previous = sortedTransactions[i - 1];
                
                const timeDiff = current.timestamp - previous.timestamp;
                const sameAmount = current.amount === previous.amount;
                const sameReason = current.reason === previous.reason;
                
                if (timeDiff < 60000 && sameAmount && sameReason) { // Within 1 minute
                    rapidFireDuplicates++;
                    userExcessGp += current.amount;
                }
            }
            
            if (rapidFireDuplicates > 0) {
                userIssues.push(`${rapidFireDuplicates} rapid-fire duplicates`);
                analysis.duplicateTypes.rapidFire += rapidFireDuplicates;
            }
            
            if (userIssues.length > 0) {
                analysis.usersWithIssues++;
                analysis.totalExcessGp += userExcessGp;
                
                analysis.topOffenders.push({
                    username: user.raUsername,
                    discordId: user.discordId,
                    currentGp: user.gp,
                    excessGp: userExcessGp,
                    legitimateGp: user.gp - userExcessGp,
                    issues: userIssues
                });
            }
        }
        
        // Sort top offenders by excess GP
        analysis.topOffenders.sort((a, b) => b.excessGp - a.excessGp);
        analysis.topOffenders = analysis.topOffenders.slice(0, 10); // Top 10
        
        return analysis;
    },

    async cleanupDuplicateGp(dryRun = true) {
        console.log(`🧹 Starting GP cleanup (${dryRun ? 'DRY RUN' : 'EXECUTING'})...`);
        
        const users = await User.find({
            $and: [
                { gp: { $gt: 0 } },
                { gpTransactions: { $exists: true, $ne: [] } }
            ]
        });
        
        const cleanupResults = {
            usersProcessed: 0,
            totalGpRemoved: 0,
            transactionsRemoved: 0,
            userResults: []
        };
        
        for (const user of users) {
            let userGpRemoved = 0;
            let userTransactionsRemoved = 0;
            let cleanedTransactions = [...user.gpTransactions];
            const removedTransactions = [];
            
            // Remove duplicate monthly awards (keep only 1 per month)
            const monthlyGroups = {};
            const monthlyIndices = [];
            
            cleanedTransactions.forEach((transaction, index) => {
                if (transaction.reason && transaction.reason.includes('Monthly GP')) {
                    const month = transaction.timestamp.toISOString().substring(0, 7);
                    if (!monthlyGroups[month]) {
                        monthlyGroups[month] = { kept: index, duplicates: [] };
                    } else {
                        monthlyGroups[month].duplicates.push(index);
                    }
                    monthlyIndices.push(index);
                }
            });
            
            // Mark monthly duplicates for removal
            Object.values(monthlyGroups).forEach(group => {
                group.duplicates.forEach(index => {
                    removedTransactions.push({
                        index,
                        transaction: cleanedTransactions[index],
                        reason: 'Duplicate monthly award'
                    });
                    userGpRemoved += cleanedTransactions[index].amount;
                    userTransactionsRemoved++;
                });
            });
            
            // Remove duplicate challenge payouts
            const challengeGroups = {};
            cleanedTransactions.forEach((transaction, index) => {
                if (transaction.reason && (transaction.reason.includes('Won') || transaction.reason.includes('Challenge'))) {
                    // Group by challenge context if available, otherwise by reason + amount + day
                    const key = transaction.context || 
                               `${transaction.reason}_${transaction.amount}_${transaction.timestamp.toISOString().substring(0, 10)}`;
                    
                    if (!challengeGroups[key]) {
                        challengeGroups[key] = { kept: index, duplicates: [] };
                    } else {
                        challengeGroups[key].duplicates.push(index);
                    }
                }
            });
            
            // Mark challenge duplicates for removal
            Object.values(challengeGroups).forEach(group => {
                group.duplicates.forEach(index => {
                    removedTransactions.push({
                        index,
                        transaction: cleanedTransactions[index],
                        reason: 'Duplicate challenge payout'
                    });
                    userGpRemoved += cleanedTransactions[index].amount;
                    userTransactionsRemoved++;
                });
            });
            
            // Remove rapid-fire duplicates (identical transactions within 1 minute)
            const sortedIndices = cleanedTransactions
                .map((_, index) => index)
                .sort((a, b) => cleanedTransactions[a].timestamp - cleanedTransactions[b].timestamp);
            
            for (let i = 1; i < sortedIndices.length; i++) {
                const currentIndex = sortedIndices[i];
                const previousIndex = sortedIndices[i - 1];
                
                const current = cleanedTransactions[currentIndex];
                const previous = cleanedTransactions[previousIndex];
                
                // Skip if already marked for removal
                if (removedTransactions.some(r => r.index === currentIndex)) continue;
                
                const timeDiff = current.timestamp - previous.timestamp;
                const sameAmount = current.amount === previous.amount;
                const sameReason = current.reason === previous.reason;
                
                if (timeDiff < 60000 && sameAmount && sameReason) { // Within 1 minute
                    removedTransactions.push({
                        index: currentIndex,
                        transaction: current,
                        reason: 'Rapid-fire duplicate'
                    });
                    userGpRemoved += current.amount;
                    userTransactionsRemoved++;
                }
            }
            
            // Apply cleanup if not dry run
            if (!dryRun && userTransactionsRemoved > 0) {
                // Remove marked transactions (sort by index descending to maintain indices)
                const indicesToRemove = removedTransactions
                    .map(r => r.index)
                    .sort((a, b) => b - a);
                
                indicesToRemove.forEach(index => {
                    cleanedTransactions.splice(index, 1);
                });
                
                // Update user GP and transactions
                const newGp = Math.max(0, user.gp - userGpRemoved);
                
                await User.findByIdAndUpdate(user._id, {
                    $set: {
                        gp: newGp,
                        gpTransactions: cleanedTransactions
                    }
                });
                
                // Add cleanup transaction record
                await User.findByIdAndUpdate(user._id, {
                    $push: {
                        gpTransactions: {
                            amount: -userGpRemoved,
                            oldBalance: user.gp,
                            newBalance: newGp,
                            reason: 'Admin cleanup - duplicate removal',
                            context: `Removed ${userTransactionsRemoved} duplicate transactions`,
                            timestamp: new Date()
                        }
                    }
                });
            }
            
            if (userTransactionsRemoved > 0) {
                cleanupResults.usersProcessed++;
                cleanupResults.totalGpRemoved += userGpRemoved;
                cleanupResults.transactionsRemoved += userTransactionsRemoved;
                
                cleanupResults.userResults.push({
                    username: user.raUsername,
                    discordId: user.discordId,
                    oldGp: user.gp,
                    newGp: user.gp - userGpRemoved,
                    gpRemoved: userGpRemoved,
                    transactionsRemoved: userTransactionsRemoved,
                    removedDetails: removedTransactions.map(r => ({
                        amount: r.transaction.amount,
                        reason: r.transaction.reason,
                        removalReason: r.reason,
                        timestamp: r.transaction.timestamp
                    }))
                });
            }
        }
        
        return cleanupResults;
    },

    async handleDiagnoseGpDuplicates(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            console.log(`🔍 ADMIN: GP duplicate diagnosis requested by ${interaction.user.username}`);
            
            const analysis = await this.diagnoseGpDuplicates();
            
            const embed = new EmbedBuilder()
                .setTitle('🔍 GP Duplicate Diagnosis')
                .setColor('#FFA500')
                .setDescription('Analysis of GP duplicate issues across all users')
                .setTimestamp();
            
            embed.addFields({
                name: '📊 Overview',
                value: 
                    `• Total users with GP: ${analysis.totalUsers}\n` +
                    `• Users with duplicate issues: ${analysis.usersWithIssues}\n` +
                    `• Total excess GP: ${analysis.totalExcessGp.toLocaleString()}\n` +
                    `• Percentage affected: ${((analysis.usersWithIssues / analysis.totalUsers) * 100).toFixed(1)}%`,
                inline: false
            });
            
            embed.addFields({
                name: '🔢 Duplicate Types',
                value: 
                    `• Monthly award duplicates: ${analysis.duplicateTypes.monthlyAwards}\n` +
                    `• Challenge payout duplicates: ${analysis.duplicateTypes.challengePayouts}\n` +
                    `• Rapid-fire duplicates: ${analysis.duplicateTypes.rapidFire}`,
                inline: false
            });
            
            if (analysis.topOffenders.length > 0) {
                let offendersText = '';
                analysis.topOffenders.slice(0, 5).forEach((user, index) => {
                    offendersText += `${index + 1}. **${user.username}**\n`;
                    offendersText += `   Current: ${user.currentGp} GP → Legitimate: ${user.legitimateGp} GP\n`;
                    offendersText += `   Excess: ${user.excessGp} GP (${user.issues.join(', ')})\n\n`;
                });
                
                embed.addFields({ name: '🎯 Top Affected Users', value: offendersText, inline: false });
            }
            
            embed.addFields({
                name: '🔧 Recommended Action',
                value: 
                    analysis.usersWithIssues > 0 
                        ? 'Run `/adminarena cleanup_gp_duplicates execute:false` to preview cleanup, then with `execute:true` to apply.'
                        : '✅ No duplicate issues found! Your GP system is clean.',
                inline: false
            });
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error(`Error diagnosing GP duplicates: ${error}`);
            await interaction.editReply(`Error diagnosing GP duplicates: ${error.message}`);
        }
    },

    async handleCleanupGpDuplicates(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const execute = interaction.options.getBoolean('execute') || false;
        
        try {
            console.log(`🧹 ADMIN: GP cleanup requested (${execute ? 'EXECUTE' : 'PREVIEW'}) by ${interaction.user.username}`);
            
            const results = await this.cleanupDuplicateGp(!execute); // dryRun = !execute
            
            const embed = new EmbedBuilder()
                .setTitle(execute ? '🧹 GP Cleanup Complete' : '🔍 GP Cleanup Preview')
                .setColor(execute ? '#00FF00' : '#FFA500')
                .setDescription(execute ? 'Duplicate GP cleanup has been executed.' : 'Preview of what would be cleaned up.')
                .setTimestamp();
            
            embed.addFields({
                name: '📊 Summary',
                value: 
                    `• Users processed: ${results.usersProcessed}\n` +
                    `• Total GP ${execute ? 'removed' : 'to be removed'}: ${results.totalGpRemoved.toLocaleString()}\n` +
                    `• Transactions ${execute ? 'removed' : 'to be removed'}: ${results.transactionsRemoved}`,
                inline: false
            });
            
            if (results.userResults.length > 0) {
                let resultsText = '';
                const maxResults = 8;
                
                results.userResults.slice(0, maxResults).forEach((user, index) => {
                    resultsText += `${index + 1}. **${user.username}**\n`;
                    resultsText += `   ${user.oldGp} GP → ${user.newGp} GP (-${user.gpRemoved})\n`;
                    resultsText += `   Removed ${user.transactionsRemoved} duplicate transactions\n\n`;
                });
                
                if (results.userResults.length > maxResults) {
                    resultsText += `... and ${results.userResults.length - maxResults} more users`;
                }
                
                embed.addFields({ 
                    name: execute ? '✅ Users Cleaned Up' : '👀 Users To Be Cleaned Up', 
                    value: resultsText, 
                    inline: false 
                });
            }
            
            if (!execute && results.usersProcessed > 0) {
                embed.addFields({
                    name: '⚠️ Next Step',
                    value: 'To actually perform the cleanup, run this command again with `execute:true`',
                    inline: false
                });
            } else if (execute && results.usersProcessed > 0) {
                embed.addFields({
                    name: '✅ Cleanup Complete',
                    value: 'All duplicate GP issues have been resolved. Users have been notified via transaction logs.',
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '✅ Status',
                    value: 'No duplicate GP issues found. Your system is clean!',
                    inline: false
                });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error(`Error cleaning up GP duplicates: ${error}`);
            await interaction.editReply(`Error cleaning up GP duplicates: ${error.message}`);
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

    // === RECOVERY METHODS ===

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
                { name: 'Winner', value: challenge.winnerUsername || 'None', inline: true },
                { name: 'Payout Processed', value: challenge.payoutProcessed ? '✅ Yes' : '❌ No', inline: true }
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

    // === ORIGINAL ADMIN METHODS ===
    
    async handleCancelChallenge(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const challengeId = interaction.options.getString('challenge_id');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            if (challenge.status === 'completed' || challenge.status === 'cancelled') {
                return interaction.editReply(`Cannot cancel a challenge that is already ${challenge.status}.`);
            }
            
            // Return GP to participants
            const refunds = [];
            
            // Refund challenger
            if (challenge.challengerId) {
                const challenger = await User.findOne({ discordId: challenge.challengerId });
                if (challenger) {
                    await ArenaTransactionUtils.trackGpTransaction(
                        challenger,
                        challenge.wagerAmount,
                        'Challenge cancelled - refund',
                        `Challenge ID: ${challengeId}, Admin: ${interaction.user.username}`
                    );
                    refunds.push(`${challenge.challengerUsername}: ${challenge.wagerAmount} GP`);
                }
            }
            
            // Refund challengee (if direct challenge)
            if (challenge.challengeeId && !challenge.isOpenChallenge) {
                const challengee = await User.findOne({ discordId: challenge.challengeeId });
                if (challengee) {
                    await ArenaTransactionUtils.trackGpTransaction(
                        challengee,
                        challenge.wagerAmount,
                        'Challenge cancelled - refund',
                        `Challenge ID: ${challengeId}, Admin: ${interaction.user.username}`
                    );
                    refunds.push(`${challenge.challengeeUsername}: ${challenge.wagerAmount} GP`);
                }
            }
            
            // Refund open challenge participants
            if (challenge.isOpenChallenge && challenge.participants) {
                for (const participant of challenge.participants) {
                    const user = await User.findOne({ discordId: participant.discordId });
                    if (user) {
                        await ArenaTransactionUtils.trackGpTransaction(
                            user,
                            challenge.wagerAmount,
                            'Challenge cancelled - refund',
                            `Challenge ID: ${challengeId}, Admin: ${interaction.user.username}`
                        );
                        refunds.push(`${participant.username}: ${challenge.wagerAmount} GP`);
                    }
                }
            }
            
            // Refund all bets
            if (challenge.bets && challenge.bets.length > 0) {
                await ArenaBettingUtils.refundAllBets(challenge);
            }
            
            // Update challenge status
            await ArenaChallenge.findByIdAndUpdate(challengeId, {
                status: 'cancelled',
                completedAt: new Date()
            });
            
            const embed = new EmbedBuilder()
                .setTitle('Challenge Cancelled')
                .setColor('#FF0000')
                .setDescription(`Successfully cancelled challenge: **${challenge.gameTitle}**`)
                .addFields(
                    { name: 'Challenge ID', value: `\`${challengeId}\``, inline: false },
                    { name: 'Refunds Processed', value: refunds.join('\n') || 'No refunds needed', inline: false },
                    { name: 'Cancelled By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error(`Error cancelling challenge: ${error}`);
            await interaction.editReply(`Error cancelling challenge: ${error.message}`);
        }
    },
    
    async handleEditChallenge(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const challengeId = interaction.options.getString('challenge_id');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            // Create modal for editing challenge details
            const modal = new ModalBuilder()
                .setCustomId(`admin_edit_challenge_modal_${challengeId}`)
                .setTitle('Edit Challenge Details');
            
            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Challenge Description')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(challenge.description || '')
                .setRequired(false);
            
            const wagerInput = new TextInputBuilder()
                .setCustomId('wager')
                .setLabel('Wager Amount (GP)')
                .setStyle(TextInputStyle.Short)
                .setValue(challenge.wagerAmount.toString())
                .setRequired(true);
            
            const endDateInput = new TextInputBuilder()
                .setCustomId('endDate')
                .setLabel('End Date (YYYY-MM-DD HH:MM)')
                .setStyle(TextInputStyle.Short)
                .setValue(challenge.endDate ? challenge.endDate.toISOString().slice(0, 16).replace('T', ' ') : '')
                .setRequired(false);
            
            const row1 = new ActionRowBuilder().addComponents(descriptionInput);
            const row2 = new ActionRowBuilder().addComponents(wagerInput);
            const row3 = new ActionRowBuilder().addComponents(endDateInput);
            
            modal.addComponents(row1, row2, row3);
            
            await interaction.showModal(modal);
            
        } catch (error) {
            console.error(`Error preparing edit challenge: ${error}`);
            await interaction.editReply(`Error preparing edit challenge: ${error.message}`);
        }
    },

    async handleEditChallengeSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const challengeId = interaction.customId.replace('admin_edit_challenge_modal_', '');
        const description = interaction.fields.getTextInputValue('description');
        const wagerAmount = parseInt(interaction.fields.getTextInputValue('wager'));
        const endDateString = interaction.fields.getTextInputValue('endDate');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            const updateData = {
                description: description || challenge.description,
                wagerAmount: wagerAmount || challenge.wagerAmount
            };
            
            if (endDateString) {
                const endDate = new Date(endDateString);
                if (!isNaN(endDate.getTime())) {
                    updateData.endDate = endDate;
                }
            }
            
            await ArenaChallenge.findByIdAndUpdate(challengeId, updateData);
            
            const embed = new EmbedBuilder()
                .setTitle('Challenge Updated')
                .setColor('#00FF00')
                .setDescription(`Successfully updated challenge: **${challenge.gameTitle}**`)
                .addFields(
                    { name: 'Challenge ID', value: `\`${challengeId}\``, inline: false },
                    { name: 'Description', value: updateData.description || 'None', inline: false },
                    { name: 'Wager Amount', value: `${updateData.wagerAmount} GP`, inline: true },
                    { name: 'End Date', value: updateData.endDate ? updateData.endDate.toLocaleString() : 'No change', inline: true },
                    { name: 'Updated By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error(`Error updating challenge: ${error}`);
            await interaction.editReply(`Error updating challenge: ${error.message}`);
        }
    },
    
    async handleForceComplete(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const challengeId = interaction.options.getString('challenge_id');
        const winnerUsername = interaction.options.getString('winner');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            if (challenge.status === 'completed') {
                return interaction.editReply(`Challenge ${challengeId} is already completed.`);
            }
            
            let winnerId = null;
            let finalWinnerUsername = 'Tie';
            
            // Determine winner
            if (winnerUsername && winnerUsername !== 'tie') {
                if (winnerUsername === challenge.challengerUsername) {
                    winnerId = challenge.challengerId;
                    finalWinnerUsername = challenge.challengerUsername;
                } else if (winnerUsername === challenge.challengeeUsername) {
                    winnerId = challenge.challengeeId;
                    finalWinnerUsername = challenge.challengeeUsername;
                } else if (challenge.isOpenChallenge) {
                    // Find participant with matching username
                    const participant = challenge.participants?.find(p => p.username === winnerUsername);
                    if (participant) {
                        winnerId = participant.discordId;
                        finalWinnerUsername = participant.username;
                    }
                }
            }
            
            // Update challenge
            await ArenaChallenge.findByIdAndUpdate(challengeId, {
                status: 'completed',
                completedAt: new Date(),
                winnerId: winnerId,
                winnerUsername: finalWinnerUsername
            });
            
            // Process payouts
            if (winnerId && finalWinnerUsername !== 'Tie') {
                const winner = await User.findOne({ discordId: winnerId });
                if (winner) {
                    let payoutAmount = 0;
                    if (challenge.isOpenChallenge) {
                        payoutAmount = challenge.wagerAmount * (1 + (challenge.participants?.length || 0));
                    } else {
                        payoutAmount = challenge.wagerAmount * 2;
                    }
                    
                    await ArenaTransactionUtils.trackGpTransaction(
                        winner,
                        payoutAmount,
                        'Force complete - admin payout',
                        `Challenge ID: ${challengeId}, Admin: ${interaction.user.username}`
                    );
                }
            }
            
            // Process betting payouts
            if (challenge.bets && challenge.bets.length > 0) {
                await ArenaBettingUtils.processBetsForChallenge(
                    challenge,
                    winnerId,
                    finalWinnerUsername
                );
            }
            
            const embed = new EmbedBuilder()
                .setTitle('Challenge Force Completed')
                .setColor('#00FF00')
                .setDescription(`Successfully force completed challenge: **${challenge.gameTitle}**`)
                .addFields(
                    { name: 'Challenge ID', value: `\`${challengeId}\``, inline: false },
                    { name: 'Winner', value: finalWinnerUsername, inline: true },
                    { name: 'Completed By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error(`Error force completing challenge: ${error}`);
            await interaction.editReply(`Error force completing challenge: ${error.message}`);
        }
    },
    
    async handleResetGP(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount') || 1000;
        
        try {
            if (targetUser) {
                // Reset specific user
                const user = await User.findOne({ discordId: targetUser.id });
                if (!user) {
                    return interaction.editReply(`User ${targetUser.username} not found in database.`);
                }
                
                const oldGp = user.gp || 0;
                
                await User.findByIdAndUpdate(user._id, {
                    $set: { gp: amount },
                    $push: {
                        gpTransactions: {
                            amount: amount - oldGp,
                            oldBalance: oldGp,
                            newBalance: amount,
                            reason: 'Admin GP reset',
                            context: `Reset by admin: ${interaction.user.username}`,
                            timestamp: new Date()
                        }
                    }
                });
                
                const embed = new EmbedBuilder()
                    .setTitle('GP Reset Complete')
                    .setColor('#FFA500')
                    .setDescription(`Reset GP for user: **${user.raUsername || targetUser.username}**`)
                    .addFields(
                        { name: 'Old GP', value: `${oldGp} GP`, inline: true },
                        { name: 'New GP', value: `${amount} GP`, inline: true },
                        { name: 'Reset By', value: interaction.user.username, inline: true }
                    )
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
                
            } else {
                // Reset all users
                const users = await User.find({ gp: { $exists: true } });
                
                for (const user of users) {
                    const oldGp = user.gp || 0;
                    
                    await User.findByIdAndUpdate(user._id, {
                        $set: { gp: amount },
                        $push: {
                            gpTransactions: {
                                amount: amount - oldGp,
                                oldBalance: oldGp,
                                newBalance: amount,
                                reason: 'Admin GP reset - all users',
                                context: `Mass reset by admin: ${interaction.user.username}`,
                                timestamp: new Date()
                            }
                        }
                    });
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('Mass GP Reset Complete')
                    .setColor('#FF5722')
                    .setDescription(`Reset GP for **${users.length}** users`)
                    .addFields(
                        { name: 'New GP Amount', value: `${amount} GP`, inline: true },
                        { name: 'Users Affected', value: `${users.length}`, inline: true },
                        { name: 'Reset By', value: interaction.user.username, inline: true }
                    )
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
            }
            
        } catch (error) {
            console.error(`Error resetting GP: ${error}`);
            await interaction.editReply(`Error resetting GP: ${error.message}`);
        }
    },
    
    async handleAdjustGP(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        
        try {
            const user = await User.findOne({ discordId: targetUser.id });
            if (!user) {
                return interaction.editReply(`User ${targetUser.username} not found in database.`);
            }
            
            const oldGp = user.gp || 0;
            const newGp = Math.max(0, oldGp + amount);
            
            await ArenaTransactionUtils.trackGpTransaction(
                user,
                amount,
                amount > 0 ? 'Admin GP adjustment (addition)' : 'Admin GP adjustment (removal)',
                `Adjusted by admin: ${interaction.user.username}`
            );
            
            const embed = new EmbedBuilder()
                .setTitle('GP Adjustment Complete')
                .setColor(amount > 0 ? '#00FF00' : '#FF0000')
                .setDescription(`Adjusted GP for user: **${user.raUsername || targetUser.username}**`)
                .addFields(
                    { name: 'Old GP', value: `${oldGp} GP`, inline: true },
                    { name: 'Adjustment', value: `${amount > 0 ? '+' : ''}${amount} GP`, inline: true },
                    { name: 'New GP', value: `${newGp} GP`, inline: true },
                    { name: 'Adjusted By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error(`Error adjusting GP: ${error}`);
            await interaction.editReply(`Error adjusting GP: ${error.message}`);
        }
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
