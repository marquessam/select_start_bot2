import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';

class MonthlyTasksService {
    constructor() {
        this.client = null;
        this.isProcessing = false;
        this.nominationBatchSize = 10; // Process nominations in batches
        this.delayBetweenGameInfo = 2000; // 2 seconds between game info requests
    }

    setClient(client) {
        this.client = client;
    }

    async clearAllNominations() {
        if (!this.client) {
            console.error('Discord client not set for monthly tasks service');
            return;
        }

        if (this.isProcessing) {
            console.log('Monthly tasks service is already processing');
            return;
        }

        try {
            this.isProcessing = true;
            console.log('Clearing all nominations for the current month...');
            
            // Get all users
            const users = await User.find({});
            
            // Clear nominations for each user
            let clearedCount = 0;
            for (const user of users) {
                const before = user.nominations.length;
                user.clearCurrentNominations();
                const after = user.nominations.length;
                
                if (before !== after) {
                    await user.save();
                    clearedCount++;
                }
            }
            
            console.log(`Cleared nominations for ${clearedCount} users`);
            
            // Announce in the designated channel
            await this.announceNominationsClear();
            
        } catch (error) {
            console.error('Error clearing nominations:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async createVotingPoll() {
        if (!this.client) {
            console.error('Discord client not set for monthly tasks service');
            return;
        }

        if (this.isProcessing) {
            console.log('Monthly tasks service is already processing');
            return;
        }

        try {
            this.isProcessing = true;
            console.log('Creating voting poll for next month\'s challenge...');
            
            // Get all users
            const users = await User.find({});

            // Get all current nominations
            let allNominations = [];
            for (const user of users) {
                const nominations = user.getCurrentNominations();
                allNominations.push(...nominations.map(nom => ({
                    gameId: nom.gameId,
                    nominatedBy: user.raUsername
                })));
            }

            if (allNominations.length === 0) {
                console.log('No games have been nominated for next month.');
                return;
            }

            // Count nominations per game
            const gameCountMap = new Map();
            const gameNominatorsMap = new Map();
            
            allNominations.forEach(nom => {
                // Track count
                const currentCount = gameCountMap.get(nom.gameId) || 0;
                gameCountMap.set(nom.gameId, currentCount + 1);
                
                // Track who nominated
                const currentNominators = gameNominatorsMap.get(nom.gameId) || [];
                if (!currentNominators.includes(nom.nominatedBy)) {
                    currentNominators.push(nom.nominatedBy);
                }
                gameNominatorsMap.set(nom.gameId, currentNominators);
            });
            
            // Get unique game IDs
            const uniqueGameIds = [...gameCountMap.keys()];
            
            // Sort games by nomination count (most to least)
            uniqueGameIds.sort((a, b) => 
                (gameCountMap.get(b) || 0) - (gameCountMap.get(a) || 0)
            );
            
            console.log(`Found ${uniqueGameIds.length} unique games nominated`);
            
            // Select top nominees (up to 10)
            const selectedCount = Math.min(10, uniqueGameIds.length);
            const selectedGames = uniqueGameIds.slice(0, selectedCount);
            
            console.log(`Selected ${selectedGames.length} games for voting poll`);

            // Get game info for selected games in small batches to avoid rate limits
            const games = [];
            
            for (let i = 0; i < selectedGames.length; i++) {
                const gameId = selectedGames[i];
                try {
                    // Add delay between API calls
                    if (i > 0) {
                        await new Promise(resolve => setTimeout(resolve, this.delayBetweenGameInfo));
                    }
                    
                    console.log(`Fetching game info for game ${gameId}`);
                    const gameInfo = await retroAPI.getGameInfo(gameId);
                    
                    // Add nominators to the game info
                    gameInfo.nominatedBy = gameNominatorsMap.get(gameId) || [];
                    gameInfo.nominationCount = gameCountMap.get(gameId) || 0;
                    
                    games.push(gameInfo);
                } catch (error) {
                    console.error(`Error fetching game info for ${gameId}:`, error);
                }
            }

            // Get the voting channel
            const votingChannel = await this.getVotingChannel();
            if (!votingChannel) {
                console.error('Voting channel not found');
                return;
            }
            
            // Create embed for the poll
            const embed = new EmbedBuilder()
                .setTitle('🎮 Vote for Next Month\'s Challenge!')
                .setDescription('React with the corresponding number to vote for a game. You can vote for up to two games!\n\n' +
                    games.map((game, index) => {
                        const nominators = game.nominatedBy.length <= 3 
                            ? game.nominatedBy.join(', ')
                            : `${game.nominatedBy.slice(0, 2).join(', ')} and ${game.nominatedBy.length - 2} more`;
                            
                        return `${index + 1}️⃣ **${game.title}** (${game.nominationCount} nomination${game.nominationCount !== 1 ? 's' : ''})\n` +
                               `└ Nominated by: ${nominators}\n` +
                               `└ [View Game](https://retroachievements.org/game/${game.id})`;
                    }).join('\n\n'))
                .setColor('#FF69B4')
                .setFooter({ text: 'Voting ends in 7 days' });

            // Send the poll
            console.log('Sending voting poll to channel');
            const pollMessage = await votingChannel.send({ embeds: [embed] });

            // Add number reactions
            const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            for (let i = 0; i < games.length; i++) {
                // Add delay between reactions to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
                await pollMessage.react(numberEmojis[i]);
            }

            console.log('Voting poll created successfully');
            
        } catch (error) {
            console.error('Error creating voting poll:', error);
        } finally {
            this.isProcessing = false;
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
            console.log('Sent nominations clear announcement');
            
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
            console.log(`Looking for announcement channel with ID: ${config.discord.announcementChannelId}`);
            const channel = await guild.channels.fetch(config.discord.announcementChannelId);
            
            if (!channel) {
                console.error('Announcement channel not found');
                return null;
            }
            
            console.log(`Found announcement channel: ${channel.name}`);
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
            console.log(`Looking for voting channel with ID: ${config.discord.votingChannelId}`);
            const channel = await guild.channels.fetch(config.discord.votingChannelId);
            
            if (!channel) {
                console.error('Voting channel not found');
                return null;
            }
            
            console.log(`Found voting channel: ${channel.name}`);
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
