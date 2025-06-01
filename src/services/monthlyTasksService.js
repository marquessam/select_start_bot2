import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { Poll } from '../models/Poll.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import retroAPI from './retroAPI.js';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';

class MonthlyTasksService {
    constructor() {
        this.client = null;
    }

    setClient(client) {
        this.client = client;
    }

    async clearAllNominations() {
        if (!this.client) {
            console.error('Discord client not set for monthly tasks service');
            return;
        }

        try {
            console.log('Clearing all nominations for the current month...');
            
            // Get all users
            const users = await User.find({});
            
            // Clear nominations for each user
            for (const user of users) {
                user.clearCurrentNominations();
                await user.save();
            }
            
            console.log(`Cleared nominations for ${users.length} users`);
            
            // Announce in the designated channel
            await this.announceNominationsClear();
            
        } catch (error) {
            console.error('Error clearing nominations:', error);
        }
    }

    // NEW: Expire old tiebreakers automatically
    async expireOldTiebreakers() {
        try {
            console.log('🕐 Checking for tiebreakers that need expiration...');
            
            const now = new Date();
            
            // Find all active tiebreakers that should be expired
            const expiredTiebreakers = await ArcadeBoard.find({
                boardType: 'tiebreaker',
                endDate: { $lt: now }, // End date is in the past
                isActive: { $ne: false } // Not already marked as inactive
            });

            if (expiredTiebreakers.length === 0) {
                console.log('ℹ️ No tiebreakers found that need expiration.');
                return {
                    success: true,
                    message: 'No tiebreakers found that need expiration.',
                    expired: []
                };
            }

            const expiredResults = [];

            // Mark each tiebreaker as expired
            for (const tiebreaker of expiredTiebreakers) {
                // Mark as inactive
                tiebreaker.isActive = false;
                tiebreaker.expiredAt = now;
                
                // Clear any tiebreaker-breaker references since they're no longer valid
                if (tiebreaker.hasTiebreakerBreaker()) {
                    tiebreaker.clearTiebreakerBreaker();
                }
                
                await tiebreaker.save();
                
                expiredResults.push({
                    boardId: tiebreaker.boardId,
                    gameTitle: tiebreaker.gameTitle,
                    endDate: tiebreaker.endDate,
                    monthKey: tiebreaker.monthKey
                });
                
                console.log(`⏰ Expired tiebreaker: ${tiebreaker.gameTitle} (${tiebreaker.monthKey})`);
            }

            // Send notification to admin channel if configured
            await this.sendTiebreakerExpirationNotification(expiredResults);

            console.log(`✅ Successfully expired ${expiredResults.length} tiebreaker(s).`);
            
            return {
                success: true,
                message: `Successfully expired ${expiredResults.length} tiebreaker(s).`,
                expired: expiredResults
            };

        } catch (error) {
            console.error('❌ Error expiring old tiebreakers:', error);
            return {
                success: false,
                message: 'An error occurred while expiring tiebreakers.',
                error: error.message
            };
        }
    }

    // NEW: Clean up very old expired tiebreakers
    async cleanupOldTiebreakers(daysOld = 90) {
        try {
            console.log(`🧹 Cleaning up tiebreakers older than ${daysOld} days...`);
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const oldTiebreakers = await ArcadeBoard.find({
                boardType: 'tiebreaker',
                $or: [
                    { isActive: false, expiredAt: { $lt: cutoffDate } },
                    { endDate: { $lt: cutoffDate } }
                ]
            });

            if (oldTiebreakers.length === 0) {
                console.log(`ℹ️ No tiebreakers older than ${daysOld} days found for cleanup.`);
                return { count: 0, tiebreakers: [] };
            }

            const deletedTitles = oldTiebreakers.map(tb => tb.gameTitle);
            
            // Hard delete the old tiebreakers
            await ArcadeBoard.deleteMany({
                _id: { $in: oldTiebreakers.map(tb => tb._id) }
            });

            console.log(`🗑️ Deleted ${deletedTitles.length} old tiebreaker(s): ${deletedTitles.join(', ')}`);
            
            return { count: deletedTitles.length, tiebreakers: deletedTitles };

        } catch (error) {
            console.error('❌ Error cleaning up old tiebreakers:', error);
            return { count: 0, tiebreakers: [], error: error.message };
        }
    }

    // NEW: Send notification about tiebreaker expiration to admin channel
    async sendTiebreakerExpirationNotification(expiredTiebreakers) {
        if (!this.client || expiredTiebreakers.length === 0) {
            return;
        }

        try {
            // Get admin log channel
            const adminLogChannel = await this.getAdminLogChannel();
            if (!adminLogChannel) {
                console.log('⚠️ Admin log channel not found, skipping expiration notification');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#FF9900')
                .setTitle('⏰ Tiebreakers Automatically Expired')
                .setDescription(
                    `The following ${expiredTiebreakers.length} tiebreaker(s) have been automatically expired because they passed their end date:`
                )
                .setTimestamp();

            if (expiredTiebreakers.length <= 10) {
                const expiredList = expiredTiebreakers.map(tb => 
                    `• **${tb.gameTitle}** (${tb.monthKey}) - ended ${tb.endDate.toLocaleDateString()}`
                ).join('\n');
                
                embed.addFields({ 
                    name: 'Expired Tiebreakers', 
                    value: expiredList 
                });
            } else {
                embed.addFields({ 
                    name: 'Expired Tiebreakers', 
                    value: `${expiredTiebreakers.length} tiebreakers expired. Check logs for details.`
                });
            }

            await adminLogChannel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error sending tiebreaker expiration notification:', error);
        }
    }

    // NEW: Manual trigger for tiebreaker expiration (for testing or manual cleanup)
    async triggerTiebreakerExpiration() {
        console.log('🔧 Manual tiebreaker expiration triggered');
        return await this.expireOldTiebreakers();
    }

    // NEW: Manual trigger for tiebreaker cleanup
    async triggerTiebreakerCleanup(daysOld = 90) {
        console.log('🔧 Manual tiebreaker cleanup triggered');
        return await this.cleanupOldTiebreakers(daysOld);
    }

    async createVotingPoll() {
        if (!this.client) {
            console.error('Discord client not set for monthly tasks service');
            return;
        }

        try {
            console.log('Creating voting poll for next month\'s challenge...');
            
            // Check if we already have an active poll for this month
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            
            const existingPoll = await Poll.findOne({
                createdAt: { $gte: startOfMonth, $lte: endOfMonth },
                isProcessed: false
            });
            
            if (existingPoll) {
                console.log('Voting poll already exists for this month');
                return;
            }
            
            // Get all users
            const users = await User.find({});

            // Get all current nominations with duplicates maintained for weighted selection
            let allNominations = [];
            for (const user of users) {
                const nominations = user.getCurrentNominations();
                allNominations.push(...nominations.map(nom => ({
                    gameId: nom.gameId,
                    title: nom.gameTitle,
                    consoleName: nom.consoleName
                })));
            }

            if (allNominations.length === 0) {
                console.log('No games have been nominated for next month.');
                return;
            }

            // Create a weighted pool based on nomination count
            // This gives games with more nominations better odds of selection
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

            // Log the nomination counts for debugging
            console.log('Nomination counts:');
            Object.entries(nominationCounts).forEach(([gameId, data]) => {
                console.log(`Game ID ${gameId}: ${data.game.title} - ${data.count} nominations`);
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

            console.log(`Selecting ${selectedCount} games from a pool of ${weightedPool.length} entries (${Object.keys(nominationCounts).length} unique games)`);

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
                            title: selectedNomination.title,
                            consoleName: selectedNomination.consoleName,
                            imageIcon: gameInfo.imageIcon || null
                        });
                        console.log(`Selected: ${selectedNomination.title}`);
                    } catch (error) {
                        console.error(`Error getting extended game info for ${selectedNomination.title}:`, error);
                        // Add without the image if we can't get extended info
                        selectedGames.push({
                            gameId: selectedNomination.gameId,
                            title: selectedNomination.title,
                            consoleName: selectedNomination.consoleName,
                            imageIcon: null
                        });
                    }
                }
                
                // Remove this entry from the weighted pool to avoid re-selection
                weightedPool.splice(randomIndex, 1);
            }

            // Calculate end date (7 days from now)
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 7);

            // Create embed for the poll
            const embed = new EmbedBuilder()
                .setTitle('🎮 Vote for Next Month\'s Challenge!')
                .setDescription('React with the corresponding number to vote for a game. You can vote for up to two games!\n\n' +
                    selectedGames.map((game, index) => 
                        `${index + 1}️⃣ **[${game.title}](https://retroachievements.org/game/${game.gameId})** (${game.consoleName})`
                    ).join('\n\n'))
                .setColor('#FF69B4')
                .setFooter({ text: `Voting ends ${endDate.toLocaleDateString()}` });

            // Get the voting channel
            const votingChannel = await this.getVotingChannel();
            if (!votingChannel) {
                console.error('Voting channel not found');
                return;
            }

            // Send the poll
            const pollMessage = await votingChannel.send({ embeds: [embed] });

            // Add number reactions
            const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            for (let i = 0; i < selectedGames.length; i++) {
                await pollMessage.react(numberEmojis[i]);
            }

            // Store poll information in database
            const pollData = {
                messageId: pollMessage.id,
                channelId: votingChannel.id,
                selectedGames: selectedGames.map(game => ({
                    gameId: game.gameId,
                    title: game.title,
                    consoleName: game.consoleName,
                    imageIcon: game.imageIcon
                })),
                endDate: endDate,
                isProcessed: false
            };

            const poll = new Poll(pollData);
            await poll.save();

            // Announce the poll in the announcement channel
            await this.announceVotingStarted(votingChannel, endDate);

            console.log('Voting poll created successfully and stored in database');
            
        } catch (error) {
            console.error('Error creating voting poll:', error);
        }
    }

    async createTiebreakerPoll(originalPoll, tiedGames) {
        if (!this.client) {
            console.error('Discord client not set for monthly tasks service');
            return null;
        }

        try {
            console.log(`Creating tiebreaker poll for ${tiedGames.length} tied games...`);
            
            // Calculate end date (24 hours from now)
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 1);

            // Create embed for the tiebreaker poll
            const embed = new EmbedBuilder()
                .setTitle('🔥 TIEBREAKER VOTE - Monthly Challenge!')
                .setDescription(
                    `The main voting ended in a tie! The following games are tied for first place:\n\n` +
                    tiedGames.map((game, index) => 
                        `**${index + 1}. [${game.title}](https://retroachievements.org/game/${game.gameId})** (${game.consoleName}) - ${game.votes} votes`
                    ).join('\n\n') +
                    `\n\n🗳️ **TIEBREAKER VOTING:**\n` +
                    `🔸 Type \`/vote\` to open the voting interface\n` +
                    `🔸 Select up to **2 games** from the tied options\n` +
                    `🔸 This vote will decide the winner!\n\n` +
                    `⏰ Tiebreaker voting ends <t:${Math.floor(endDate.getTime() / 1000)}:R> (24 hours)\n\n` +
                    `🎯 **This is the final round!** If there's still a tie after this vote, a winner will be randomly selected.`
                )
                .setColor('#FF4500') // Orange for urgency
                .addFields(
                    {
                        name: '⚡ Quick Tiebreaker Guide',
                        value: 
                            `1️⃣ Type \`/vote\` in any channel\n` +
                            `2️⃣ Select from the tied games only\n` +
                            `3️⃣ Choose 1 or 2 games\n` +
                            `4️⃣ Click "Submit Vote"\n` +
                            `5️⃣ Winner announced in 24 hours!`,
                        inline: false
                    }
                )
                .setFooter({ 
                    text: `Tiebreaker ends ${endDate.toLocaleDateString()} • Final voting round!`
                });

            // Use the same channels as the original poll
            const votingChannel = await this.client.channels.fetch(originalPoll.channelId);
            const resultsChannel = originalPoll.resultsChannelId ? 
                await this.client.channels.fetch(originalPoll.resultsChannelId) : 
                votingChannel;

            // Send the tiebreaker poll
            const tiebreakerMessage = await votingChannel.send({ embeds: [embed] });

            // Create the tiebreaker poll in the database
            const tiebreakerPoll = new Poll({
                messageId: tiebreakerMessage.id,
                channelId: votingChannel.id,
                resultsChannelId: resultsChannel.id,
                selectedGames: tiedGames.map(game => ({
                    gameId: game.gameId,
                    title: game.title,
                    consoleName: game.consoleName,
                    imageIcon: game.imageIcon
                })),
                startDate: new Date(),
                endDate: endDate,
                isTiebreaker: true,
                originalPollId: originalPoll._id
            });

            await tiebreakerPoll.save();

            // Update the original poll to reference the tiebreaker
            originalPoll.tiebreakerPollId = tiebreakerPoll._id;
            originalPoll.resolutionMethod = 'tiebreaker';
            await originalPoll.save();

            // Schedule the tiebreaker to end automatically
            try {
                const schedule = await import('node-schedule').catch(() => {
                    console.warn('node-schedule package not available for tiebreaker scheduling');
                    return null;
                });
                
                if (schedule) {
                    const jobName = `end-tiebreaker-${tiebreakerPoll._id}`;
                    const job = schedule.default.scheduleJob(jobName, endDate, async function() {
                        try {
                            console.log(`Scheduled tiebreaker job triggered for poll ${tiebreakerPoll._id}`);
                            await monthlyTasksService.countAndAnnounceVotes();
                        } catch (error) {
                            console.error('Error in scheduled tiebreaker job:', error);
                        }
                    });
                    
                    tiebreakerPoll.scheduledJobName = jobName;
                    await tiebreakerPoll.save();
                }
            } catch (scheduleError) {
                console.error('Error scheduling tiebreaker job:', scheduleError);
            }

            // Announce the tiebreaker
            await this.announceTiebreaker(resultsChannel, tiedGames, endDate);

            console.log(`Tiebreaker poll created successfully with ${tiedGames.length} games`);
            return tiebreakerPoll;

        } catch (error) {
            console.error('Error creating tiebreaker poll:', error);
            return null;
        }
    }

    async countAndAnnounceVotes() {
        if (!this.client) {
            console.error('Discord client not set for monthly tasks service');
            return;
        }

        try {
            console.log('Counting votes and announcing results...');
            
            // Find all unprocessed polls
            const unprocessedPolls = await Poll.find({ isProcessed: false });
            
            if (unprocessedPolls.length === 0) {
                console.log('No unprocessed polls found');
                return;
            }
            
            // Process each poll
            for (const poll of unprocessedPolls) {
                try {
                    // Use the Poll model's processResults method
                    const result = poll.processResults();
                    
                    if (!result) {
                        console.log('No results found for this poll');
                        continue;
                    }

                    console.log('Vote processing result:', result);

                    // Handle tie situation
                    if (result.isTie) {
                        console.log(`Tie detected with ${result.tiedGames.length} games!`);
                        
                        // If this is already a tiebreaker poll, fall back to random selection
                        if (poll.isTiebreaker) {
                            console.log('Tiebreaker poll also ended in tie, selecting winner randomly');
                            
                            const randomIndex = Math.floor(Math.random() * result.tiedGames.length);
                            const selectedWinner = result.tiedGames[randomIndex];
                            
                            const winnerMessage = 
                                `The tiebreaker vote also ended in a tie between:\n` +
                                result.tiedGames.map(game => `**${game.title}** (${game.votes} votes)`).join('\n') +
                                `\n\nAfter a random selection, **${selectedWinner.title}** has been chosen as the winner!`;

                            await this.announceWinner(poll, selectedWinner, result.allResults, winnerMessage, 'random_after_tiebreaker');
                            
                        } else {
                            // Create tiebreaker poll
                            const tiebreakerPoll = await this.createTiebreakerPoll(poll, result.tiedGames);
                            
                            if (tiebreakerPoll) {
                                // Mark original poll as processed with tiebreaker status
                                poll.isProcessed = true;
                                poll.resolutionMethod = 'tiebreaker';
                                await poll.save();
                                
                                // Don't announce a winner yet - wait for tiebreaker
                                console.log('Tiebreaker poll created, waiting for resolution');
                                continue;
                            } else {
                                // Fallback to random if tiebreaker creation failed
                                const randomIndex = Math.floor(Math.random() * result.tiedGames.length);
                                const selectedWinner = result.tiedGames[randomIndex];
                                
                                const winnerMessage = 
                                    `There was a ${result.tiedGames.length}-way tie, but tiebreaker creation failed.\n` +
                                    result.tiedGames.map(game => `**${game.title}** (${game.votes} votes)`).join('\n') +
                                    `\n\nAfter a random selection, **${selectedWinner.title}** has been chosen as the winner!`;

                                await this.announceWinner(poll, selectedWinner, result.allResults, winnerMessage, 'random_after_tiebreaker');
                            }
                        }
                    } else {
                        // No tie, announce the winner
                        const selectedWinner = result.winner;
                        const winnerMessage = `**${selectedWinner.title}** won with ${selectedWinner.votes} votes!`;
                        
                        await this.announceWinner(poll, selectedWinner, result.allResults, winnerMessage, 'normal');
                    }

                } catch (pollError) {
                    console.error(`Error processing poll ${poll._id}:`, pollError);
                }
            }
        } catch (error) {
            console.error('Error counting and announcing votes:', error);
        }
    }

    async announceWinner(poll, winner, allResults, winnerMessage, resolutionMethod) {
        try {
            // Create announcement embed
            const announcementEmbed = new EmbedBuilder()
                .setTitle('🎮 Monthly Challenge Voting Results')
                .setColor('#FF69B4')
                .setDescription(
                    `The voting has ended for the next monthly challenge!\n\n` +
                    `${winnerMessage}\n\n` +
                    `This game will be our next monthly challenge. The admin team will set up the challenge soon.`
                )
                .setTimestamp();
            
            // Add results
            let resultsText = '';
            const resultsToShow = Math.min(5, allResults.length);
            for (let i = 0; i < resultsToShow; i++) {
                const result = allResults[i];
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
                resultsText += `${medal} **[${result.title}](https://retroachievements.org/game/${result.gameId})** - ${result.votes} vote${result.votes !== 1 ? 's' : ''}\n`;
            }
            
            if (allResults.length > 5) {
                resultsText += '\n*Other games received fewer votes.*';
            }
            
            announcementEmbed.addFields({ name: 'Results', value: resultsText });
            
            // Add special note for tiebreaker resolution
            if (resolutionMethod === 'tiebreaker') {
                announcementEmbed.addFields({
                    name: '🔥 Tiebreaker Resolution',
                    value: 'This winner was determined through a 24-hour tiebreaker vote!',
                    inline: false
                });
            } else if (resolutionMethod === 'random_after_tiebreaker') {
                announcementEmbed.addFields({
                    name: '🎲 Random Selection',
                    value: 'Winner was randomly selected after a tied tiebreaker vote.',
                    inline: false
                });
            }
            
            // Add game icon if available
            if (winner.imageIcon) {
                announcementEmbed.setThumbnail(`https://retroachievements.org${winner.imageIcon}`);
            }
            
            // Get the results channel
            let resultsChannel;
            if (poll.resultsChannelId) {
                try {
                    resultsChannel = await this.client.channels.fetch(poll.resultsChannelId);
                } catch (error) {
                    console.error('Error fetching results channel, falling back to announcement channel:', error);
                    resultsChannel = await this.getAnnouncementChannel();
                }
            } else {
                resultsChannel = await this.getAnnouncementChannel();
            }
            
            if (resultsChannel) {
                await resultsChannel.send({ embeds: [announcementEmbed] });
            } else {
                console.error('No results channel found');
            }
            
            // Update the original poll message
            try {
                const channel = await this.client.channels.fetch(poll.channelId);
                const pollMessage = await channel.messages.fetch(poll.messageId);
                
                const statusTitle = poll.isTiebreaker ? 
                    '🔥 Monthly Challenge Tiebreaker (ENDED)' : 
                    '🎮 Monthly Challenge Voting (ENDED)';
                
                const updatedEmbed = new EmbedBuilder()
                    .setTitle(statusTitle)
                    .setDescription(
                        `Voting has ended!\n\n` +
                        `${winnerMessage}\n\n` +
                        `Check the announcements channel for full results.`
                    )
                    .setColor('#808080')
                    .setFooter({ text: 'Voting has ended' });
                
                await pollMessage.edit({ embeds: [updatedEmbed] });
            } catch (messageError) {
                console.error('Error updating original poll message:', messageError);
            }
            
            // Mark poll as processed and store winner
            poll.isProcessed = true;
            poll.winner = {
                gameId: winner.gameId,
                title: winner.title,
                consoleName: winner.consoleName,
                imageIcon: winner.imageIcon,
                votes: winner.votes
            };
            poll.resolutionMethod = resolutionMethod;
            await poll.save();
            
            console.log(`Results announced: ${winner.title} won with ${winner.votes} votes (method: ${resolutionMethod})`);
            return winner;

        } catch (error) {
            console.error('Error announcing winner:', error);
        }
    }

    async announceTiebreaker(channel, tiedGames, endDate) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🔥 TIEBREAKER VOTE STARTED!')
                .setDescription(
                    `The main voting ended in a tie! A special 24-hour tiebreaker vote has been created.\n\n` +
                    `**Tied Games:**\n` +
                    tiedGames.map(game => `• **${game.title}** (${game.votes} votes)`).join('\n') +
                    `\n\n🗳️ Use \`/vote\` to participate in the tiebreaker!\n` +
                    `⏰ Tiebreaker ends <t:${Math.floor(endDate.getTime() / 1000)}:R>`
                )
                .setColor('#FF4500')
                .setTimestamp();

            await channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error announcing tiebreaker:', error);
        }
    }

    async announceNominationsClear() {
        try {
            // Get the announcement channel
            const announcementChannel = await this.getAnnouncementChannel();
            if (!announcementChannel) {
                console.error('Announcement channel not found');
                return;
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🔄 Monthly Reset')
                .setDescription('All nominations for the previous month have been cleared. You can now nominate games for the next challenge!')
                .setColor('#4CAF50')
                .setTimestamp();

            // Send the announcement
            await announcementChannel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error announcing nominations clear:', error);
        }
    }

    async announceVotingStarted(votingChannel, endDate) {
        try {
            // Get the announcement channel
            const announcementChannel = await this.getAnnouncementChannel();
            if (!announcementChannel) {
                console.error('Announcement channel not found');
                return;
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🎮 Monthly Challenge Voting Has Started!')
                .setDescription(
                    `The voting for next month's challenge game has begun! Head over to <#${votingChannel.id}> to see the nominees and cast your votes!\n\n` +
                    `Voting ends <t:${Math.floor(endDate.getTime() / 1000)}:R>`
                )
                .setColor('#FF69B4')
                .setTimestamp();

            // Send the announcement
            await announcementChannel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error announcing voting started:', error);
        }
    }

    async getAnnouncementChannel() {
        if (!this.client) return null;

        try {
            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Get the channel
            const channel = await guild.channels.fetch(config.discord.announcementChannelId);
            return channel;
        } catch (error) {
            console.error('Error getting announcement channel:', error);
            return null;
        }
    }

    async getVotingChannel() {
        if (!this.client) return null;

        try {
            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Get the channel
            const channel = await guild.channels.fetch(config.discord.votingChannelId);
            return channel;
        } catch (error) {
            console.error('Error getting voting channel:', error);
            return null;
        }
    }

    // NEW: Get admin log channel for notifications
    async getAdminLogChannel() {
        if (!this.client) return null;

        try {
            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Get the admin log channel
            const channel = await guild.channels.fetch(config.discord.adminLogChannelId);
            return channel;
        } catch (error) {
            console.error('Error getting admin log channel:', error);
            return null;
        }
    }
}

// Create singleton instance
const monthlyTasksService = new MonthlyTasksService();
export default monthlyTasksService;
