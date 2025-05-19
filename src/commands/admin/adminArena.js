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

    // View challenges with filtering by status
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
                
                embed.addFields({
                    name: `${index + 1}. ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`,
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

    // View a specific challenge by ID
    async handleViewChallenge(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const challengeId = interaction.options.getString('challenge_id');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            // Create embed with detailed information
            const embed = new EmbedBuilder()
                .setTitle(`Challenge Details: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`)
                .setColor('#FF5722')
                .setDescription(`**Game:** ${challenge.gameTitle}`)
                .addFields(
                    { name: 'Challenge ID', value: `\`${challenge._id}\``, inline: false },
                    { name: 'Status', value: challenge.status, inline: true },
                    { name: 'Wager', value: `${challenge.wagerAmount} GP`, inline: true },
                    { name: 'Description', value: challenge.description || 'None', inline: false },
                    { name: 'Challenger', value: `${challenge.challengerUsername} (ID: ${challenge.challengerId})`, inline: true },
                    { name: 'Challengee', value: `${challenge.challengeeUsername} (ID: ${challenge.challengeeId || 'Open Challenge'})`, inline: true },
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

            // Add scores if available
            if (challenge.challengerScore || challenge.challengeeScore) {
                embed.addFields({
                    name: 'Scores',
                    value: `${challenge.challengerUsername}: ${challenge.challengerScore || 'No score'}\n` +
                           `${challenge.challengeeUsername}: ${challenge.challengeeScore || 'No score'}`,
                    inline: false
                });
            }

            // Add winner if completed
            if (challenge.status === 'completed' && challenge.winnerUsername) {
                embed.addFields({ name: 'Winner', value: challenge.winnerUsername, inline: true });
            }

            // Add betting info
            if (challenge.bets && challenge.bets.length > 0) {
                const totalBetAmount = challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0);
                
                let betsText = `**Total Bets:** ${challenge.bets.length} (${totalBetAmount} GP)\n\n`;
                
                // List first 10 bets
                const maxBetsToShow = Math.min(10, challenge.bets.length);
                for (let i = 0; i < maxBetsToShow; i++) {
                    const bet = challenge.bets[i];
                    betsText += `${i+1}. **${bet.raUsername}**: ${bet.betAmount} GP on ${bet.targetPlayer}\n`;
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
                        .setStyle(ButtonStyle.Success)
                );
            
            await interaction.editReply({ embeds: [embed], components: [buttonRow] });
        } catch (error) {
            console.error(`Error viewing challenge: ${error}`);
            await interaction.editReply(`Error viewing challenge: ${error.message}`);
        }
    },

    // Cancel a challenge
    async handleCancelChallenge(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const challengeId = interaction.options.getString('challenge_id');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            // Can only cancel active or pending challenges
            if (challenge.status !== 'active' && challenge.status !== 'pending' && challenge.status !== 'open') {
                return interaction.editReply(`Cannot cancel a challenge with status: ${challenge.status}`);
            }
            
            // Return GP to participants
            if (challenge.status === 'active') {
                // For active challenges, need to return GP to both participants
                const challenger = await User.findOne({ discordId: challenge.challengerId });
                if (challenger) {
                    challenger.gp = (challenger.gp || 0) + challenge.wagerAmount;
                    await challenger.save();
                }
                
                const challengee = await User.findOne({ discordId: challenge.challengeeId });
                if (challengee) {
                    challengee.gp = (challengee.gp || 0) + challenge.wagerAmount;
                    await challengee.save();
                }
            } else if (challenge.status === 'pending') {
                // For pending challenges, only return GP to challenger
                const challenger = await User.findOne({ discordId: challenge.challengerId });
                if (challenger) {
                    challenger.gp = (challenger.gp || 0) + challenge.wagerAmount;
                    await challenger.save();
                }
            }

            // Return GP to all bettors if there are any
            if (challenge.bets && challenge.bets.length > 0) {
                for (const bet of challenge.bets) {
                    const bettor = await User.findOne({ discordId: bet.userId });
                    if (bettor) {
                        bettor.gp = (bettor.gp || 0) + bet.betAmount;
                        await bettor.save();
                    }
                }
            }
            
            // Update challenge status
            challenge.status = 'cancelled';
            await challenge.save();
            
            // Notify arena about cancellation
            await arenaService.notifyChallengeUpdate(challenge);
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Challenge Cancelled')
                .setDescription(
                    `Successfully cancelled the challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}**.\n\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Wager:** ${challenge.wagerAmount} GP\n\n` +
                    `✅ All GP has been returned to participants${challenge.bets && challenge.bets.length > 0 ? ' and bettors' : ''}.`
                );
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(`Error cancelling challenge: ${error}`);
            await interaction.editReply(`Error cancelling challenge: ${error.message}`);
        }
    },

    // Show modal to edit challenge
    async handleEditChallenge(interaction) {
        const challengeId = interaction.options.getString('challenge_id');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                await interaction.reply({ 
                    content: `Challenge with ID ${challengeId} not found.`,
                    ephemeral: true
                });
                return;
            }
            
            // Can only edit active or pending challenges
            if (challenge.status !== 'active' && challenge.status !== 'pending' && challenge.status !== 'open') {
                await interaction.reply({ 
                    content: `Cannot edit a challenge with status: ${challenge.status}`,
                    ephemeral: true
                });
                return;
            }
            
            // Create edit modal
            const modal = new ModalBuilder()
                .setCustomId(`admin_edit_challenge_modal_${challengeId}`)
                .setTitle('Edit Challenge');
            
            // Description input
            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Challenge Description')
                .setValue(challenge.description || '')
                .setRequired(false)
                .setStyle(TextInputStyle.Paragraph);
            
            // Wager amount input
            const wagerInput = new TextInputBuilder()
                .setCustomId('wager_amount')
                .setLabel('Wager Amount (GP)')
                .setValue(challenge.wagerAmount.toString())
                .setRequired(true)
                .setStyle(TextInputStyle.Short);
            
            // Duration (hours) input - only for pending challenges
            const durationInput = new TextInputBuilder()
                .setCustomId('duration_hours')
                .setLabel('Duration in Hours')
                .setValue(challenge.durationHours.toString())
                .setPlaceholder('168 for 1 week')
                .setRequired(false)
                .setStyle(TextInputStyle.Short);
            
            // Add inputs to modal
            modal.addComponents(
                new ActionRowBuilder().addComponents(descriptionInput),
                new ActionRowBuilder().addComponents(wagerInput)
            );
            
            // Only add duration for pending challenges
            if (challenge.status === 'pending' || challenge.status === 'open') {
                modal.addComponents(new ActionRowBuilder().addComponents(durationInput));
            }
            
            // Show the modal
            await interaction.showModal(modal);
        } catch (error) {
            console.error(`Error preparing edit challenge modal: ${error}`);
            await interaction.reply({ 
                content: `Error preparing edit form: ${error.message}`,
                ephemeral: true
            });
        }
    },

    // Handle modal submit for editing challenge
    async handleEditChallengeSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        // Extract challenge ID from modal custom ID
        const modalId = interaction.customId;
        const challengeId = modalId.replace('admin_edit_challenge_modal_', '');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            // Get values from modal
            const newDescription = interaction.fields.getTextInputValue('description');
            const newWagerAmount = parseInt(interaction.fields.getTextInputValue('wager_amount'), 10);
            
            // Validate wager
            if (isNaN(newWagerAmount) || newWagerAmount < 10) {
                return interaction.editReply('Wager amount must be at least 10 GP.');
            }
            
            // Store old values for comparison
            const oldWagerAmount = challenge.wagerAmount;
            
            // Update challenge fields
            challenge.description = newDescription;
            challenge.wagerAmount = newWagerAmount;
            
            // Update duration if provided (only for pending challenges)
            if ((challenge.status === 'pending' || challenge.status === 'open') && interaction.fields.has('duration_hours')) {
                const newDurationHours = parseInt(interaction.fields.getTextInputValue('duration_hours'), 10);
                
                if (!isNaN(newDurationHours) && newDurationHours > 0) {
                    challenge.durationHours = newDurationHours;
                }
            }
            
            // Handle wager amount changes for challenger/challengee 
            if (newWagerAmount !== oldWagerAmount) {
                // For active challenges
                if (challenge.status === 'active') {
                    const difference = newWagerAmount - oldWagerAmount;
                    
                    // If wager increased, deduct the difference
                    if (difference > 0) {
                        // Deduct from challenger
                        const challenger = await User.findOne({ discordId: challenge.challengerId });
                        if (challenger) {
                            if ((challenger.gp || 0) < difference) {
                                return interaction.editReply(`Cannot increase wager: Challenger ${challenge.challengerUsername} doesn't have enough GP (needs ${difference} more).`);
                            }
                            challenger.gp = (challenger.gp || 0) - difference;
                            await challenger.save();
                        }
                        
                        // Deduct from challengee 
                        const challengee = await User.findOne({ discordId: challenge.challengeeId });
                        if (challengee) {
                            if ((challengee.gp || 0) < difference) {
                                return interaction.editReply(`Cannot increase wager: Challengee ${challenge.challengeeUsername} doesn't have enough GP (needs ${difference} more).`);
                            }
                            challengee.gp = (challengee.gp || 0) - difference;
                            await challengee.save();
                        }
                    } 
                    // If wager decreased, return the difference
                    else if (difference < 0) {
                        const refund = Math.abs(difference);
                        
                        // Refund challenger
                        const challenger = await User.findOne({ discordId: challenge.challengerId });
                        if (challenger) {
                            challenger.gp = (challenger.gp || 0) + refund;
                            await challenger.save();
                        }
                        
                        // Refund challengee
                        const challengee = await User.findOne({ discordId: challenge.challengeeId });
                        if (challengee) {
                            challengee.gp = (challengee.gp || 0) + refund;
                            await challengee.save();
                        }
                    }
                }
                // For pending challenges
                else if (challenge.status === 'pending') {
                    const difference = newWagerAmount - oldWagerAmount;
                    
                    // If wager increased, deduct the difference from challenger
                    if (difference > 0) {
                        const challenger = await User.findOne({ discordId: challenge.challengerId });
                        if (challenger) {
                            if ((challenger.gp || 0) < difference) {
                                return interaction.editReply(`Cannot increase wager: Challenger ${challenge.challengerUsername} doesn't have enough GP (needs ${difference} more).`);
                            }
                            challenger.gp = (challenger.gp || 0) - difference;
                            await challenger.save();
                        }
                    } 
                    // If wager decreased, return the difference to challenger
                    else if (difference < 0) {
                        const refund = Math.abs(difference);
                        
                        const challenger = await User.findOne({ discordId: challenge.challengerId });
                        if (challenger) {
                            challenger.gp = (challenger.gp || 0) + refund;
                            await challenger.save();
                        }
                    }
                }
            }
            
            // Save the challenge
            await challenge.save();
            
            // Update the arena feed if needed
            if (challenge.status === 'active') {
                await arenaService.createOrUpdateArenaFeed(challenge);
            }
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Challenge Updated')
                .setDescription(
                    `Successfully updated the challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}**.\n\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**New Wager:** ${challenge.wagerAmount} GP\n` +
                    `**New Description:** ${challenge.description || 'None'}\n` +
                    `**Duration:** ${Math.floor(challenge.durationHours / 24)} days`
                );
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(`Error editing challenge: ${error}`);
            await interaction.editReply(`Error editing challenge: ${error.message}`);
        }
    },

    // Force complete a challenge
    async handleForceComplete(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const challengeId = interaction.options.getString('challenge_id');
        const winnerUsername = interaction.options.getString('winner');
        
        try {
            const challenge = await ArenaChallenge.findById(challengeId);
            
            if (!challenge) {
                return interaction.editReply(`Challenge with ID ${challengeId} not found.`);
            }
            
            // Can only force complete active challenges
            if (challenge.status !== 'active') {
                return interaction.editReply(`Cannot force complete a challenge with status: ${challenge.status}`);
            }
            
            // Determine the winner
            let winnerId = null;
            let finalWinnerUsername = 'Tie';
            
            if (winnerUsername) {
                // Check if winner matches either participant
                if (winnerUsername.toLowerCase() === challenge.challengerUsername.toLowerCase()) {
                    winnerId = challenge.challengerId;
                    finalWinnerUsername = challenge.challengerUsername;
                } else if (winnerUsername.toLowerCase() === challenge.challengeeUsername.toLowerCase()) {
                    winnerId = challenge.challengeeId;
                    finalWinnerUsername = challenge.challengeeUsername;
                } else {
                    return interaction.editReply(`Winner username "${winnerUsername}" doesn't match either participant in this challenge.`);
                }
            }
            
            // Update challenge
            challenge.status = 'completed';
            challenge.winnerId = winnerId;
            challenge.winnerUsername = finalWinnerUsername;
            challenge.endDate = new Date(); // Set end date to now
            await challenge.save();
            
            // Process payouts
            await arenaService.processPayouts(challenge, winnerId, finalWinnerUsername);
            
            // Notify arena about completion
            await arenaService.notifyChallengeUpdate(challenge);
            
            // Update the feed message
            await arenaService.updateCompletedFeed(challenge);
            
            // Create response embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Challenge Force Completed')
                .setDescription(
                    `Successfully completed the challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}**.\n\n` +
                    `**Game:** ${challenge.gameTitle}\n` +
                    `**Result:** ${finalWinnerUsername === 'Tie' ? 'Tie (no winner)' : `${finalWinnerUsername} wins!`}\n\n` +
                    `✅ All payouts have been processed.`
                );
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(`Error force completing challenge: ${error}`);
            await interaction.editReply(`Error force completing challenge: ${error.message}`);
        }
    },

    // Reset GP for all users or a specific user
    async handleResetGP(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount') || 1000;
        
        try {
            if (user) {
                // Reset GP for specific user
                const dbUser = await User.findOne({ discordId: user.id });
                
                if (!dbUser) {
                    return interaction.editReply(`User ${user.username} is not registered in the Arena system.`);
                }
                
                // Set GP and last claim date
                const now = new Date();
                dbUser.gp = amount;
                dbUser.lastMonthlyGpClaim = now;
                await dbUser.save();
                
                return interaction.editReply(`✅ Successfully reset GP for **${dbUser.raUsername}** to **${amount} GP**.`);
            } else {
                // Reset GP for all users
                const now = new Date();
                
                // Update all users
                const result = await User.updateMany(
                    {}, // Match all users
                    {
                        $set: { 
                            gp: amount,
                            lastMonthlyGpClaim: now
                        }
                    }
                );
                
                return interaction.editReply(`✅ Reset GP for **${result.modifiedCount} users** to **${amount} GP** each.`);
            }
        } catch (error) {
            console.error(`Error resetting GP: ${error}`);
            await interaction.editReply(`Error resetting GP: ${error.message}`);
        }
    },

    // Adjust GP for a specific user
    async handleAdjustGP(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.options.getUser('user');
        const adjustAmount = interaction.options.getInteger('amount');
        
        try {
            // Find user in database
            const dbUser = await User.findOne({ discordId: user.id });
            
            if (!dbUser) {
                return interaction.editReply(`User ${user.username} is not registered in the Arena system.`);
            }
            
            // Calculate new GP balance
            const oldGP = dbUser.gp || 0;
            const newGP = oldGP + adjustAmount;
            
            if (newGP < 0) {
                return interaction.editReply(`Cannot adjust GP: User would have negative GP (${newGP}). Current GP: ${oldGP}`);
            }
            
            // Update GP
            dbUser.gp = newGP;
            await dbUser.save();
            
            // Create response
            const action = adjustAmount >= 0 ? 'added' : 'removed';
            const absAmount = Math.abs(adjustAmount);
            
            return interaction.editReply(
                `✅ Successfully ${action} **${absAmount} GP** ${adjustAmount >= 0 ? 'to' : 'from'} **${dbUser.raUsername}**.\n` +
                `New balance: **${newGP} GP** (was ${oldGP} GP)`
            );
        } catch (error) {
            console.error(`Error adjusting GP: ${error}`);
            await interaction.editReply(`Error adjusting GP: ${error.message}`);
        }
    },

    // Handle button interactions
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
            
            // Create a select menu for winner
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
                                label: challenge.challengeeUsername,
                                description: 'Declare this player as the winner',
                                value: challenge.challengeeUsername
                            },
                            {
                                label: 'Tie (No Winner)',
                                description: 'Declare a tie - no winner',
                                value: 'tie'
                            }
                        ])
                );
            
            await interaction.reply({
                content: `Please select the winner for challenge between **${challenge.challengerUsername}** and **${challenge.challengeeUsername}**:`,
                components: [row],
                ephemeral: true
            });
        }
    },

    // Handle select menu for setting winner
    async handleSelectMenuInteraction(interaction) {
        const customId = interaction.customId;
        
        if (customId.startsWith('admin_set_winner_')) {
            const challengeId = customId.replace('admin_set_winner_', '');
            const winner = interaction.values[0];
            
            // Process tie case
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

    // Handle modal submits (for editing challenges)
    async handleModalSubmit(interaction) {
        if (interaction.customId.startsWith('admin_edit_challenge_modal_')) {
            await this.handleEditChallengeSubmit(interaction);
        }
    }
};
