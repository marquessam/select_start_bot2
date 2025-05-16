import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { Poll } from '../models/Poll.js';
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
                    // Get the channel and message
                    const channel = await this.client.channels.fetch(poll.channelId);
                    const pollMessage = await channel.messages.fetch(poll.messageId);
                    
                    // Get reaction counts
                    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                    const results = [];
                    
                    for (let i = 0; i < poll.selectedGames.length; i++) {
                        const game = poll.selectedGames[i];
                        const emoji = numberEmojis[i];
                        const reaction = pollMessage.reactions.cache.find(r => r.emoji.name === emoji);
                        const count = reaction ? reaction.count - 1 : 0; // Subtract 1 to exclude the bot's reaction
                        
                        results.push({
                            gameId: game.gameId,
                            title: game.title,
                            consoleName: game.consoleName,
                            imageIcon: game.imageIcon,
                            votes: count,
                            index: i
                        });
                    }
                    
                    // Sort by vote count (highest first)
                    results.sort((a, b) => b.votes - a.votes);
                    
                    // Check for ties at the top position
                    const winner = results[0];
                    const tiedWinners = results.filter(result => result.votes === winner.votes);
                    
                    let winnerMessage;
                    let selectedWinner;
                    
                    if (tiedWinners.length > 1) {
                        console.log(`There was a ${tiedWinners.length}-way tie! Randomly selecting winner...`);
                        // Randomly select one of the tied games
                        const randomIndex = Math.floor(Math.random() * tiedWinners.length);
                        selectedWinner = tiedWinners[randomIndex];
                        
                        winnerMessage = 
                            `There was a ${tiedWinners.length}-way tie between:\n` +
                            tiedWinners.map(game => `**${game.title}** (${game.votes} votes)`).join('\n') +
                            `\n\nAfter a random tiebreaker, **${selectedWinner.title}** has been selected as our winner!`;
                    } else {
                        selectedWinner = winner;
                        winnerMessage = `**${selectedWinner.title}** won with ${selectedWinner.votes} votes!`;
                    }
                    
                    // Create announcement embed
                    const announcementEmbed = new EmbedBuilder()
                        .setTitle('🎮 Monthly Challenge Voting Results')
                        .setColor('#FF69B4')
                        .setDescription(`The voting has ended for the next monthly challenge!\n\n` +
                            `${winnerMessage}\n\n` +
                            `This game will be our next monthly challenge. The admin team will set up the challenge soon.`)
                        .setTimestamp();
                    
                    // Add top results
                    let resultsText = '';
                    for (let i = 0; i < Math.min(5, results.length); i++) {
                        const result = results[i];
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
                        resultsText += `${medal} **[${result.title}](https://retroachievements.org/game/${result.gameId})** - ${result.votes} votes\n`;
                    }
                    
                    if (results.length > 5) {
                        resultsText += '\n*Other games received fewer votes.*';
                    }
                    
                    announcementEmbed.addFields({ name: 'Results', value: resultsText });
                    
                    // Add game icon if available
                    if (selectedWinner.imageIcon) {
                        announcementEmbed.setThumbnail(`https://retroachievements.org${selectedWinner.imageIcon}`);
                    }
                    
                    // Get the announcements channel
                    const announcementChannel = await this.getAnnouncementChannel();
                    if (announcementChannel) {
                        await announcementChannel.send({ embeds: [announcementEmbed] });
                    } else {
                        console.error('Announcement channel not found');
                    }
                    
                    // Update the original poll message to show it's ended
                    const updatedEmbed = new EmbedBuilder()
                        .setTitle('🎮 Monthly Challenge Voting (ENDED)')
                        .setDescription(
                            `Voting for this month's challenge has ended!\n\n` +
                            `${winnerMessage}\n\n` +
                            `Check out the announcements channel for full voting results.`
                        )
                        .setColor('#808080') // Gray to indicate it's over
                        .setFooter({ text: 'Voting has ended' });
                    
                    await pollMessage.edit({ embeds: [updatedEmbed] });
                    
                    // Mark poll as processed
                    poll.isProcessed = true;
                    poll.winnerId = selectedWinner.gameId;
                    await poll.save();
                    
                    console.log(`Voting results announced: ${selectedWinner.title} won with ${selectedWinner.votes} votes`);
                    
                    return selectedWinner; // Return the winner for any calling functions
                } catch (pollError) {
                    console.error(`Error processing poll ${poll._id}:`, pollError);
                }
            }
        } catch (error) {
            console.error('Error counting and announcing votes:', error);
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
}

// Create singleton instance
const monthlyTasksService = new MonthlyTasksService();
export default monthlyTasksService;
