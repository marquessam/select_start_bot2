import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Poll } from '../../models/Poll.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';
import monthlyTasksService from '../../services/monthlyTasksService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminvote')
        .setDescription('Manage voting polls for monthly challenges')
        .setDefaultMemberPermissions('0') // Only visible to users with Administrator permission
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a voting poll for next month\'s challenge')
                .addChannelOption(option =>
                    option.setName('channel')
                    .setDescription('The channel to create the poll announcement in')
                    .setRequired(true))
                .addChannelOption(option =>
                    option.setName('results_channel')
                    .setDescription('The channel to announce results in (defaults to same channel)')
                    .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('force')
                    .setDescription('Start a 7-day voting period immediately (bypasses monthly schedule)')
                    .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel the current voting poll without announcing results')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('End the current voting poll and announce results')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('recount')
                .setDescription('Manually recount votes for the most recent poll and announce correct results')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check the status of current voting polls')
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
            case 'start':
                await this.handleStartVoting(interaction);
                break;
            case 'cancel':
                await this.handleCancelVoting(interaction);
                break;
            case 'end':
                await this.handleEndVoting(interaction);
                break;
            case 'recount':
                await this.handleRecountVotes(interaction);
                break;
            case 'status':
                await this.handleStatusCheck(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand. Please try again.',
                    ephemeral: true
                });
        }
    },

    /**
     * Handle starting a voting poll
     */
    async handleStartVoting(interaction) {
        await interaction.deferReply();

        try {
            // Check if there's already an active poll (including tiebreakers)
            const existingPoll = await Poll.findAnyActivePoll();
            if (existingPoll) {
                const pollType = existingPoll.isTiebreaker ? 'tiebreaker' : 'regular';
                return interaction.editReply(`There is already an active ${pollType} voting poll. You must wait for it to end or cancel it first.`);
            }

            // Calculate start and end dates
            const now = new Date();
            const forceStart = interaction.options.getBoolean('force') ?? false;
            let endDate;
            
            if (forceStart) {
                // Force start: Simple 7-day voting period from now
                console.log("Force starting vote - setting 7-day voting period");
                endDate = new Date();
                endDate.setDate(endDate.getDate() + 7); // 7 days from now
                
            } else {
                // Normal schedule: Follow month-based timing
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                
                // Calculate the last day of the current month
                const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
                
                // Set end date to 24 hours before the end of the month
                endDate = new Date(lastDayOfMonth);
                endDate.setDate(endDate.getDate() - 1);
                
                // If we're already within 8 days of the end of the month, move to next month
                const startDate = new Date();
                if ((lastDayOfMonth - now) / (1000 * 60 * 60 * 24) < 8) {
                    console.log("Less than 8 days left in month, scheduling for next month");
                    const nextMonth = (currentMonth + 1) % 12;
                    const yearForNextMonth = nextMonth === 0 ? currentYear + 1 : currentYear;
                    
                    // Set end date to 24 hours before the end of next month
                    const lastDayOfNextMonth = new Date(yearForNextMonth, nextMonth + 1, 0);
                    endDate.setTime(lastDayOfNextMonth.getTime());
                    endDate.setDate(endDate.getDate() - 1);
                }
                
                // Set start date to 8 days before the end date
                startDate.setTime(endDate.getTime());
                startDate.setDate(startDate.getDate() - 7);
                
                // If start date is in the future and not forcing, inform admin and do not start yet
                if (startDate > now) {
                    return interaction.editReply(
                        `Voting should start on ${startDate.toLocaleDateString()} ` +
                        `(8 days before the end of the month) and end on ${endDate.toLocaleDateString()} ` +
                        `(24 hours before the end of the month). Please try again on the start date, or use the \`force:true\` option to start a **7-day voting period immediately**.`
                    );
                }
            }

            // Get all users
            const users = await User.find({});
            console.log(`Found ${users.length} users to process for nominations`);

            // Get all current nominations with better validation and error handling
            let allNominations = [];
            let skippedNominations = 0;

            for (const user of users) {
                const nominations = user.getCurrentNominations();
                console.log(`User ${user.raUsername || user.discordId} has ${nominations.length} nominations`);
                
                for (const nom of nominations) {
                    // Validate essential fields
                    if (!nom.gameId) {
                        console.warn(`Skipping nomination without gameId for user ${user.raUsername}:`, nom);
                        skippedNominations++;
                        continue;
                    }

                    // Check for missing title or console data
                    const title = nom.gameTitle;
                    const consoleName = nom.consoleName;

                    if (!title || !consoleName) {
                        console.warn(`Nomination missing data for user ${user.raUsername}, gameId ${nom.gameId}. Attempting to fetch...`);
                        
                        try {
                            // Try to fetch missing data from API
                            const gameInfo = await retroAPI.getGameInfo(nom.gameId);
                            
                            if (!gameInfo || !gameInfo.title) {
                                console.error(`Could not fetch valid game info for gameId ${nom.gameId}, skipping`);
                                skippedNominations++;
                                continue;
                            }

                            allNominations.push({
                                gameId: nom.gameId,
                                title: title || gameInfo.title,
                                consoleName: consoleName || gameInfo.consoleName
                            });
                            
                            console.log(`Successfully fetched missing data for "${gameInfo.title}" (${gameInfo.consoleName})`);
                            
                        } catch (error) {
                            console.error(`Failed to fetch game info for gameId ${nom.gameId}:`, error.message);
                            skippedNominations++;
                            continue;
                        }
                    } else {
                        // Nomination has all required data
                        allNominations.push({
                            gameId: nom.gameId,
                            title: title,
                            consoleName: consoleName
                        });
                    }
                }
            }

            console.log(`Processed nominations: ${allNominations.length} valid, ${skippedNominations} skipped`);

            if (allNominations.length === 0) {
                return interaction.editReply('No valid games have been nominated for next month. Please ensure users have nominated games with complete information.');
            }

            // Create a weighted pool based on nomination count
            const nominationCounts = {};
            const weightedPool = [];

            // Count nominations per game and build a weighted selection pool
            allNominations.forEach(nomination => {
                if (!nominationCounts[nomination.gameId]) {
                    nominationCounts[nomination.gameId] = {
                        count: 0,
                        game: nomination
                    };
                }
                nominationCounts[nomination.gameId].count++;
            });

            // Create the weighted pool - each game appears once per nomination
            Object.values(nominationCounts).forEach(entry => {
                // Add the game to the pool once for each nomination it received
                for (let i = 0; i < entry.count; i++) {
                    weightedPool.push(entry.game);
                }
            });

            // Randomly select 10 games (or less if there aren't enough unique games)
            const selectedCount = Math.min(10, Object.keys(nominationCounts).length);
            const selectedGames = [];
            const selectedGameIds = new Set();

            console.log(`Selecting ${selectedCount} games from ${Object.keys(nominationCounts).length} unique nominations`);

            // Keep selecting until we have the required number of unique games
            while (selectedGames.length < selectedCount && weightedPool.length > 0) {
                // Select a random game from the weighted pool
                const randomIndex = Math.floor(Math.random() * weightedPool.length);
                const selectedNomination = weightedPool[randomIndex];
                
                // If this game hasn't been selected yet, add it to our results
                if (!selectedGameIds.has(selectedNomination.gameId)) {
                    selectedGameIds.add(selectedNomination.gameId);
                    
                    // Get extended game info to get the image icon
                    try {
                        const gameInfo = await retroAPI.getGameInfoExtended(selectedNomination.gameId);
                        selectedGames.push({
                            gameId: selectedNomination.gameId,
                            title: selectedNomination.title || gameInfo.title || `Game ID ${selectedNomination.gameId}`,
                            consoleName: selectedNomination.consoleName || gameInfo.consoleName || 'Unknown Console',
                            imageIcon: gameInfo.imageIcon || null
                        });
                        console.log(`Selected: "${selectedNomination.title}" (${selectedNomination.consoleName})`);
                    } catch (error) {
                        console.error(`Error getting extended game info for ${selectedNomination.title}:`, error);
                        // Add without the image if we can't get extended info
                        selectedGames.push({
                            gameId: selectedNomination.gameId,
                            title: selectedNomination.title || `Game ID ${selectedNomination.gameId}`,
                            consoleName: selectedNomination.consoleName || 'Unknown Console',
                            imageIcon: null
                        });
                    }
                }
                
                // Remove this entry from the weighted pool to avoid re-selection
                weightedPool.splice(randomIndex, 1);
            }

            if (selectedGames.length === 0) {
                return interaction.editReply('Failed to select any valid games for voting. Please check the nominations and try again.');
            }

            // Validate all selected games have proper titles
            const invalidGames = selectedGames.filter(game => 
                !game.title || 
                game.title.includes('undefined') || 
                game.title === 'Unknown Game' ||
                game.title.startsWith('Game ID ')
            );

            if (invalidGames.length > 0) {
                console.error('Found games with invalid titles:', invalidGames);
                return interaction.editReply(
                    `Some selected games have invalid data. Please run the /fixnominations command and try again.\n` +
                    `Invalid games: ${invalidGames.map(g => `${g.title} (ID: ${g.gameId})`).join(', ')}`
                );
            }

            // Create embed for the poll announcement
            const embed = new EmbedBuilder()
                .setTitle('🗳️ Monthly Challenge Voting Started!')
                .setDescription(
                    `Voting for next month's challenge has begun! The following games have been nominated:\n\n` +
                    selectedGames.map((game, index) => 
                        `**${index + 1}. [${game.title}](https://retroachievements.org/game/${game.gameId})** (${game.consoleName})`
                    ).join('\n\n') +
                    `\n\n` +
                    `🗳️ **HOW TO VOTE:**\n` +
                    `🔸 Type \`/vote\` to open the interactive voting interface\n` +
                    `🔸 Select up to **2 games** using the dropdown menus\n` +
                    `🔸 Click "Submit Vote" to record your choices\n` +
                    `🔸 The interface shows game names - no need to remember numbers!\n\n` +
                    `⏰ Voting ends <t:${Math.floor(endDate.getTime() / 1000)}:R>` +
                    (forceStart ? ` (7-day voting period)\n\n` : `\n\n`) +
                    `✨ **Easy Voting System:** Use \`/vote\` for a user-friendly interface with dropdown menus!\n` +
                    `🔥 **New:** If there's a tie, a 24-hour tiebreaker vote will automatically start!` +
                    (forceStart ? `\n\n⚠️ **Special Note:** This is a 7-day force-started voting period, not following the normal monthly schedule.` : ``)
                )
                .setColor('#FF69B4')
                .addFields(
                    {
                        name: '🎯 Quick Start Guide',
                        value: 
                            `1️⃣ Type \`/vote\` in any channel\n` +
                            `2️⃣ Use dropdown menus to select games by name\n` +
                            `3️⃣ Choose 1 or 2 games (your choice!)\n` +
                            `4️⃣ Click "Submit Vote" to confirm\n` +
                            `5️⃣ See live results after voting!`,
                        inline: false
                    }
                )
                .setFooter({ 
                    text: `Voting ends ${endDate.toLocaleDateString()}${forceStart ? ' (7-day period)' : ''} • Automatic tiebreakers enabled!` 
                });

            // Get the specified channel
            const channel = interaction.options.getChannel('channel');
            const resultsChannel = interaction.options.getChannel('results_channel') || channel;
            const pollMessage = await channel.send({ embeds: [embed] });

            // Create the poll in the database
            const poll = new Poll({
                messageId: pollMessage.id,
                channelId: channel.id,
                resultsChannelId: resultsChannel.id,
                selectedGames: selectedGames,
                startDate: new Date(),
                endDate: endDate
            });

            await poll.save();

            // Try to schedule job if node-schedule is available
            try {
                // Dynamically import node-schedule
                const schedule = await import('node-schedule').catch(() => {
                    console.warn('node-schedule package not available, skipping automatic end scheduling');
                    return null;
                });
                
                if (schedule) {
                    // Schedule the end of voting event
                    const jobDate = new Date(endDate.getTime());
                    console.log(`Scheduling automatic vote ending for: ${jobDate}`);
                    
                    // Add a named job that can be identified and canceled if needed
                    const jobName = `end-poll-${poll._id}`;
                    const job = schedule.default.scheduleJob(jobName, jobDate, async function() {
                        try {
                            console.log(`Scheduled job for poll ${poll._id} triggered, ending the vote automatically`);
                            // Use the monthly tasks service to end the vote
                            await monthlyTasksService.countAndAnnounceVotes();
                        } catch (error) {
                            console.error('Error in scheduled job for ending voting:', error);
                        }
                    });
                    
                    // Store the job name with the poll for potential cancellation
                    poll.scheduledJobName = jobName;
                    await poll.save();
                    
                    console.log(`Scheduled job created with name: ${jobName}`);
                }
            } catch (scheduleError) {
                console.error('Error setting up scheduled job:', scheduleError);
                // Continue without scheduling - this is optional functionality
            }

            console.log(`Successfully created voting poll with ${selectedGames.length} games`);

            const successMessage = `Voting poll has been created with ${selectedGames.length} games! ` +
                (forceStart ? 
                    `**Force-started voting period:** 7 days from now (ends ${endDate.toLocaleDateString()}).` :
                    `The poll will be active until ${endDate.toLocaleDateString()}.`
                ) +
                ` Results will be announced in ${resultsChannel} when voting ends.` +
                (poll.scheduledJobName ? ' The poll will end automatically on the scheduled date.' : ' Note: Automatic ending is not available, manual end required.') +
                `\n\n🔥 **New Feature:** Automatic tiebreaker polls will be created if needed!` +
                (forceStart ? '\n\n⚠️ **Note:** This is a force-started 7-day voting period, not following the normal monthly schedule.' : '');

            return interaction.editReply(successMessage);

        } catch (error) {
            console.error('Error starting voting:', error);
            return interaction.editReply('An error occurred while starting the voting process. Please check the logs and try again.');
        }
    },

    /**
     * Handle ending a voting poll manually
     */
    async handleEndVoting(interaction) {
        await interaction.deferReply();

        try {
            // Find any active poll (including tiebreakers)
            const activePoll = await Poll.findAnyActivePoll();
            if (!activePoll) {
                return interaction.editReply('There is no active voting poll to end.');
            }

            const pollType = activePoll.isTiebreaker ? 'tiebreaker' : 'regular';

            // Cancel the scheduled job if it exists
            if (activePoll.scheduledJobName) {
                try {
                    // Dynamically import node-schedule only if needed
                    const schedule = await import('node-schedule').catch(() => {
                        console.warn('node-schedule package not available, cannot cancel scheduled job');
                        return { scheduledJobs: {} };
                    });
                    
                    const job = schedule.scheduledJobs?.[activePoll.scheduledJobName];
                    if (job) {
                        job.cancel();
                        console.log(`Canceled scheduled job: ${activePoll.scheduledJobName}`);
                    }
                } catch (scheduleError) {
                    console.error('Error canceling scheduled job:', scheduleError);
                    // Continue with poll ending even if job cancellation fails
                }
            }

            // Use the monthly tasks service to end the vote
            const winner = await monthlyTasksService.countAndAnnounceVotes();
            
            if (winner) {
                return interaction.editReply(`${pollType} voting poll has been ended successfully. "${winner.title}" won with ${winner.votes} votes!`);
            } else {
                return interaction.editReply(`${pollType} voting poll has been ended, but there was an issue determining the winner. Check the results channel for details.`);
            }

        } catch (error) {
            console.error('Error ending voting:', error);
            return interaction.editReply('An error occurred while ending the voting process. Please try again.');
        }
    },

    /**
     * Handle canceling a voting poll
     */
    async handleCancelVoting(interaction) {
        await interaction.deferReply();

        try {
            // Find any active poll (including tiebreakers)
            const activePoll = await Poll.findAnyActivePoll();
            if (!activePoll) {
                return interaction.editReply('There is no active voting poll to cancel.');
            }

            const pollType = activePoll.isTiebreaker ? 'tiebreaker' : 'regular';

            // Cancel the scheduled job if it exists
            if (activePoll.scheduledJobName) {
                try {
                    // Dynamically import node-schedule only if needed
                    const schedule = await import('node-schedule').catch(() => {
                        console.warn('node-schedule package not available, cannot cancel scheduled job');
                        return { scheduledJobs: {} };
                    });
                    
                    const job = schedule.scheduledJobs?.[activePoll.scheduledJobName];
                    if (job) {
                        job.cancel();
                        console.log(`Canceled scheduled job: ${activePoll.scheduledJobName}`);
                    }
                } catch (scheduleError) {
                    console.error('Error canceling scheduled job:', scheduleError);
                    // Continue with poll cancellation even if job cancellation fails
                }
            }

            // Mark the poll as processed so it doesn't get picked up again
            activePoll.isProcessed = true;
            await activePoll.save();

            // Update the original poll message
            try {
                const channel = interaction.client.channels.cache.get(activePoll.channelId);
                if (channel) {
                    const pollMessage = await channel.messages.fetch(activePoll.messageId);
                    
                    if (pollMessage) {
                        const titleText = activePoll.isTiebreaker ? 
                            '🔥 Monthly Challenge Tiebreaker (CANCELED)' : 
                            '🎮 Monthly Challenge Voting (CANCELED)';
                        
                        const updatedEmbed = new EmbedBuilder()
                            .setTitle(titleText)
                            .setDescription(
                                `This ${pollType} voting poll has been canceled by an administrator.`
                            )
                            .setColor('#FF0000') // Red to indicate it's canceled
                            .setFooter({ text: 'Voting has been canceled' });
                        
                        await pollMessage.edit({ embeds: [updatedEmbed] });
                    }
                }
            } catch (error) {
                console.error('Error updating original poll message:', error);
                // Continue even if updating the message fails
            }

            return interaction.editReply(`${pollType} voting poll has been canceled successfully.`);

        } catch (error) {
            console.error('Error canceling voting:', error);
            return interaction.editReply('An error occurred while canceling the voting process. Please try again.');
        }
    },

    /**
     * Handle manually recounting votes
     */
    async handleRecountVotes(interaction) {
        await interaction.deferReply();

        try {
            // Find the most recent poll
            const recentPoll = await Poll.findOne().sort({ createdAt: -1 });
            
            if (!recentPoll) {
                return interaction.editReply('No polls found to recount.');
            }

            // Get the actual vote counts from stored data
            const results = recentPoll.getVoteCounts();
            
            if (results.length === 0) {
                return interaction.editReply('No votes found in the poll data.');
            }

            console.log('Manual recount results:', results);

            // Check for ties
            const winner = results[0];
            const tiedWinners = results.filter(result => result.votes === winner.votes);
            
            let winnerMessage;
            let selectedWinner;
            
            if (tiedWinners.length > 1 && winner.votes > 0) {
                // For manual recount, pick the first tied winner rather than random
                selectedWinner = tiedWinners[0];
                winnerMessage = 
                    `There was a ${tiedWinners.length}-way tie between:\n` +
                    tiedWinners.map(game => `**${game.title}** (${game.votes} votes)`).join('\n') +
                    `\n\n**${selectedWinner.title}** has been selected as the winner!\n\n` +
                    `⚠️ **Note:** In normal operation, this would trigger a 24-hour tiebreaker vote.`;
            } else {
                selectedWinner = winner;
                winnerMessage = `**${selectedWinner.title}** won with ${selectedWinner.votes} votes!`;
            }

            // Create corrected announcement embed
            const pollTypeText = recentPoll.isTiebreaker ? 'Tiebreaker' : 'Monthly Challenge';
            const embed = new EmbedBuilder()
                .setTitle(`🔄 Corrected ${pollTypeText} Voting Results`)
                .setColor('#FF69B4')
                .setDescription(
                    `**CORRECTED RESULTS** - The previous results had a technical error.\n\n` +
                    `${winnerMessage}\n\n` +
                    `This game will be our next monthly challenge.`
                )
                .setTimestamp();
            
            // Add detailed results
            let resultsText = '';
            for (let i = 0; i < Math.min(10, results.length); i++) {
                const result = results[i];
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
                resultsText += `${medal} **[${result.title}](https://retroachievements.org/game/${result.gameId})** - ${result.votes} vote${result.votes !== 1 ? 's' : ''}\n`;
            }
            
            embed.addFields({ name: 'Full Results', value: resultsText });
            
            // Add game icon if available
            if (selectedWinner.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${selectedWinner.imageIcon}`);
            }

            // Update the poll with correct winner
            recentPoll.winner = {
                gameId: selectedWinner.gameId,
                title: selectedWinner.title,
                consoleName: selectedWinner.consoleName,
                imageIcon: selectedWinner.imageIcon,
                votes: selectedWinner.votes
            };
            await recentPoll.save();

            // Send corrected results to the results channel
            let resultsChannel;
            if (recentPoll.resultsChannelId) {
                try {
                    resultsChannel = await interaction.client.channels.fetch(recentPoll.resultsChannelId);
                } catch (error) {
                    console.error('Error fetching results channel:', error);
                }
            }

            if (resultsChannel) {
                await resultsChannel.send({ embeds: [embed] });
                await interaction.editReply(
                    `Votes have been recounted and corrected results posted to ${resultsChannel}.\n\n` +
                    `**Winner:** ${selectedWinner.title} with ${selectedWinner.votes} votes\n` +
                    `**Total votes counted:** ${results.reduce((sum, r) => sum + r.votes, 0)}\n` +
                    `**Poll Type:** ${recentPoll.isTiebreaker ? 'Tiebreaker' : 'Regular'}`
                );
            } else {
                await interaction.editReply({
                    content: `Votes have been recounted. Here are the corrected results:\n\n` +
                             `**Winner:** ${selectedWinner.title} with ${selectedWinner.votes} votes\n` +
                             `**Total votes counted:** ${results.reduce((sum, r) => sum + r.votes, 0)}\n` +
                             `**Poll Type:** ${recentPoll.isTiebreaker ? 'Tiebreaker' : 'Regular'}`,
                    embeds: [embed]
                });
            }

        } catch (error) {
            console.error('Error recounting votes:', error);
            return interaction.editReply('An error occurred while recounting votes. Please check the logs.');
        }
    },

    /**
     * Handle status check
     */
    async handleStatusCheck(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Find any active polls
            const activePolls = await Poll.find({ isProcessed: false }).sort({ createdAt: -1 });
            
            if (activePolls.length === 0) {
                return interaction.editReply('No active voting polls found.');
            }

            const embed = new EmbedBuilder()
                .setTitle('📊 Active Voting Polls Status')
                .setColor('#0099FF')
                .setTimestamp();

            for (const poll of activePolls) {
                const pollType = poll.isTiebreaker ? '🔥 Tiebreaker Poll' : '🎮 Regular Poll';
                const voteCounts = poll.getVoteCounts();
                const totalVotes = poll.votes ? poll.votes.length : 0;
                
                let statusText = `**Created:** <t:${Math.floor(poll.createdAt.getTime() / 1000)}:R>\n` +
                               `**Ends:** <t:${Math.floor(poll.endDate.getTime() / 1000)}:R>\n` +
                               `**Total Voters:** ${totalVotes}\n` +
                               `**Games:** ${poll.selectedGames.length}`;

                if (poll.isTiebreaker && poll.originalPollId) {
                    statusText += `\n**Original Poll ID:** ${poll.originalPollId}`;
                }

                // Show top 3 results
                if (voteCounts.length > 0) {
                    const topResults = voteCounts.slice(0, 3).map((result, index) => 
                        `${index + 1}. ${result.title}: ${result.votes} votes`
                    ).join('\n');
                    statusText += `\n\n**Current Top 3:**\n${topResults}`;
                }

                embed.addFields({
                    name: pollType,
                    value: statusText,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error checking poll status:', error);
            await interaction.editReply('An error occurred while checking poll status.');
        }
    }
};
