import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { Poll } from '../models/Poll.js'; // New import
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

            // Get all current nominations
            let allNominations = [];
            for (const user of users) {
                const nominations = user.getCurrentNominations();
                allNominations.push(...nominations.map(nom => nom.gameId));
            }

            // Remove duplicates
            allNominations = [...new Set(allNominations)];

            if (allNominations.length === 0) {
                console.log('No games have been nominated for next month.');
                return;
            }

            // Randomly select 10 games (or less if there aren't enough nominations)
            const selectedCount = Math.min(10, allNominations.length);
            const selectedGames = [];
            while (selectedGames.length < selectedCount) {
                const randomIndex = Math.floor(Math.random() * allNominations.length);
                const gameId = allNominations[randomIndex];
                if (!selectedGames.includes(gameId)) {
                    selectedGames.push(gameId);
                }
            }

            // Get game info for all selected games
            const gameInfoPromises = selectedGames.map(gameId => retroAPI.getGameInfoExtended(gameId));
            const games = await Promise.all(gameInfoPromises);

            // Create embed for the poll
            const embed = new EmbedBuilder()
                .setTitle('🎮 Vote for Next Month\'s Challenge!')
                .setDescription('React with the corresponding number to vote for a game. You can vote for up to two games!\n\n' +
                    games.map((game, index) => 
                        `${index + 1} **[${game.title}](https://retroachievements.org/game/${game.id})**`
                    ).join('\n\n'))
                .setColor('#FF69B4')
                .setFooter({ text: 'Voting ends in 7 days' });

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

            // Calculate end date (7 days from now)
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 7);

            // Store poll information in database
            const pollData = {
                messageId: pollMessage.id,
                channelId: votingChannel.id,
                selectedGames: games.map((game, index) => ({
                    gameId: selectedGames[index],
                    title: game.title,
                    imageIcon: game.imageIcon
                })),
                endDate: endDate,
                isProcessed: false
            };

            const poll = new Poll(pollData);
            await poll.save();

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
                            gameTitle: game.title,
                            imageIcon: game.imageIcon,
                            votes: count,
                            index: i
                        });
                    }
                    
                    // Sort by vote count (highest first)
                    results.sort((a, b) => b.votes - a.votes);
                    
                    // Get the winner
                    const winner = results[0];
                    
                    // Create announcement embed
                    const announcementEmbed = new EmbedBuilder()
                        .setTitle('🎮 Monthly Challenge Voting Results')
                        .setColor('#FF69B4')
                        .setDescription(`The voting has ended for the next monthly challenge!\n\n` +
                            `**Winner:** [${winner.gameTitle}](https://retroachievements.org/game/${winner.gameId}) with ${winner.votes} votes!\n\n` +
                            `This game will be our next monthly challenge. The admin team will set up the challenge soon.`)
                        .setTimestamp();
                    
                    // Add top 3 results
                    let resultsText = '';
                    for (let i = 0; i < Math.min(3, results.length); i++) {
                        const result = results[i];
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                        resultsText += `${medal} **[${result.gameTitle}](https://retroachievements.org/game/${result.gameId})** - ${result.votes} votes\n`;
                    }
                    
                    if (results.length > 3) {
                        resultsText += '\n*All other games received fewer votes.*';
                    }
                    
                    announcementEmbed.addFields({ name: 'Top Results', value: resultsText });
                    
                    // Add game icon if available
                    if (winner.imageIcon) {
                        announcementEmbed.setThumbnail(`https://retroachievements.org${winner.imageIcon}`);
                    }
                    
                    // Get the announcements channel
                    const announcementChannel = await this.client.channels.fetch('1360409399264416025');
                    await announcementChannel.send({ embeds: [announcementEmbed] });
                    
                    // Mark poll as processed
                    poll.isProcessed = true;
                    await poll.save();
                    
                    console.log(`Voting results announced: ${winner.gameTitle} won with ${winner.votes} votes`);
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
