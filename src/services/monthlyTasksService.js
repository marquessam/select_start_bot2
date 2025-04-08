import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
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
            const gameInfoPromises = selectedGames.map(gameId => retroAPI.getGameInfo(gameId));
            const games = await Promise.all(gameInfoPromises);

            // Create embed for the poll
            const embed = new EmbedBuilder()
                .setTitle('🎮 Vote for Next Month\'s Challenge!')
                .setDescription('React with the corresponding number to vote for a game. You can vote for up to two games!\n\n' +
                    games.map((game, index) => 
                        `${index + 1}️⃣ **${game.title}**\n` +
                        `└ Achievements: ${game.achievements.length}\n` +
                        `└ [View Game](https://retroachievements.org/game/${game.id})`
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

            console.log('Voting poll created successfully');
            
        } catch (error) {
            console.error('Error creating voting poll:', error);
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
