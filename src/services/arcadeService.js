// src/services/arcadeFeedService.js
import { EmbedBuilder } from 'discord.js';
import { User } from '../models/User.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';

const UPDATE_INTERVAL = 60 * 60 * 1000; // Update every hour (60 minutes * 60 seconds * 1000 ms)

class ArcadeFeedService {
    constructor() {
        this.client = null;
        this.channelId = config.discord.arcadeFeedChannelId || '1371363491130114098'; // Use provided channel ID
        this.updateInterval = null;
        this.lastMessageIds = new Map(); // Map of boardId -> messageId
        this.headerMessageId = null; // ID of the header message
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for arcade feed service');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for arcade feed service');
            return;
        }

        try {
            console.log('Starting arcade feed service...');
            
            // Clear the channel first
            await this.clearChannel();
            
            // Initial update
            await this.updateArcadeFeed();
            
            // Set up recurring updates
            this.updateInterval = setInterval(() => {
                this.updateArcadeFeed().catch(error => {
                    console.error('Error updating arcade feed:', error);
                });
            }, UPDATE_INTERVAL);
            
            console.log(`Arcade feed service started. Updates will occur every ${UPDATE_INTERVAL / 60000} minutes.`);
        } catch (error) {
            console.error('Error starting arcade feed service:', error);
        }
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('Arcade feed service stopped.');
        }
    }

    async clearChannel() {
        try {
            const channel = await this.getArcadeChannel();
            if (!channel) {
                console.error('Arcade feed channel not found or inaccessible');
                return;
            }
            
            console.log(`Clearing all messages in arcade feed channel (ID: ${this.channelId})...`);
            
            // Fetch messages in batches (Discord API limitation)
            let messagesDeleted = 0;
            let messages;
            
            do {
                messages = await channel.messages.fetch({ limit: 100 });
                if (messages.size > 0) {
                    // Use bulk delete for messages less than 14 days old
                    try {
                        await channel.bulkDelete(messages);
                        messagesDeleted += messages.size;
                        console.log(`Bulk deleted ${messages.size} messages`);
                    } catch (bulkError) {
                        // If bulk delete fails (messages older than 14 days), delete one by one
                        console.log(`Bulk delete failed, falling back to individual deletion: ${bulkError.message}`);
                        for (const [id, message] of messages) {
                            try {
                                await message.delete();
                                messagesDeleted++;
                            } catch (deleteError) {
                                console.error(`Error deleting message ${id}:`, deleteError.message);
                            }
                            
                            // Add a small delay to avoid rate limits
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }
            } while (messages.size >= 100); // Keep fetching until no more messages
            
            console.log(`Cleared ${messagesDeleted} messages from arcade feed channel`);
            
            // Reset state since we've cleared the channel
            this.lastMessageIds.clear();
            this.headerMessageId = null;
            
            return true;
        } catch (error) {
            console.error('Error clearing arcade channel:', error);
            return false;
        }
    }

    async getArcadeChannel() {
        if (!this.client) {
            console.error('Discord client not set');
            return null;
        }

        try {
            // Get the guild
            const guildId = config.discord.guildId;
            const guild = await this.client.guilds.fetch(guildId);
            
            if (!guild) {
                console.error(`Guild not found: ${guildId}`);
                return null;
            }

            // Get the channel
            const channel = await guild.channels.fetch(this.channelId);
            
            if (!channel) {
                console.error(`Channel not found: ${this.channelId}`);
                return null;
            }
            
            return channel;
        } catch (error) {
            console.error('Error getting arcade channel:', error);
            return null;
        }
    }

    async updateArcadeFeed() {
        try {
            const channel = await this.getArcadeChannel();
            if (!channel) {
                console.error('Arcade feed channel not found or inaccessible');
                return;
            }
            
            // Format current time for the header message
            const timestamp = new Date().toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            
            // Create or update header message
            await this.updateHeaderMessage(channel, timestamp);
            
            // Get all arcade boards
            const arcadeBoards = await ArcadeBoard.find({ boardType: 'arcade' })
                .sort({ gameTitle: 1 }); // Sort alphabetically by game title
            
            // Get current active racing board
            const now = new Date();
            const racingBoard = await ArcadeBoard.findOne({
                boardType: 'racing',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            // Update current racing challenge (if any)
            if (racingBoard) {
                await this.updateRacingBoardEmbed(channel, racingBoard);
            }
            
            // Update arcade board embeds
            for (const board of arcadeBoards) {
                await this.updateArcadeBoardEmbed(channel, board);
                
                // Add a small delay between boards to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log(`Updated arcade feed with ${arcadeBoards.length} boards and ${racingBoard ? '1' : '0'} racing challenges`);
        } catch (error) {
            console.error('Error updating arcade feed:', error);
        }
    }
    
    async updateHeaderMessage(channel, timestamp) {
        // Create header content
        const headerContent = `# 🎮 Arcade Leaderboards (Last updated: ${timestamp})\n` + 
                             `All active arcade boards and the current racing challenge are shown below.\n` +
                             `Leaderboards update hourly. Top 3 finishers in arcade boards earn points at the end of the year!`;
        
        try {
            if (this.headerMessageId) {
                // Try to update existing header
                const headerMessage = await channel.messages.fetch(this.headerMessageId);
                await headerMessage.edit({ content: headerContent });
                console.log(`Updated arcade feed header message (ID: ${this.headerMessageId})`);
            } else {
                // Create new header message
                const message = await channel.send({ content: headerContent });
                this.headerMessageId = message.id;
                console.log(`Created new arcade feed header message (ID: ${message.id})`);
                
                // Try to pin the header message
                try {
                    const pinnedMessages = await channel.messages.fetchPinned();
                    if (pinnedMessages.size >= 50) {
                        // Unpin oldest if limit reached
                        const oldestPinned = pinnedMessages.last();
                        await oldestPinned.unpin();
                    }
                    await message.pin();
                    console.log(`Pinned arcade feed header message (ID: ${message.id})`);
                } catch (pinError) {
                    console.error(`Error pinning message: ${pinError.message}`);
                }
            }
        } catch (error) {
            console.error('Error updating arcade feed header:', error);
            // If updating fails, try to create a new header
            if (error.message.includes('Unknown Message')) {
                try {
                    const message = await channel.send({ content: headerContent });
                    this.headerMessageId = message.id;
                    console.log(`Created new arcade feed header message after error (ID: ${message.id})`);
                } catch (sendError) {
                    console.error('Error creating new header after previous error:', sendError);
                }
            }
        }
    }

    async updateArcadeBoardEmbed(channel, board) {
        try {
            // Get all registered users
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
            // Fetch multiple batches of leaderboard entries
            const batch1 = await retroAPI.getLeaderboardEntriesDirect(board.leaderboardId, 0, 500);
            const batch2 = await retroAPI.getLeaderboardEntriesDirect(board.leaderboardId, 500, 500);
            
            // Combine the batches
            let rawEntries = [];
            
            // Process first batch
            if (batch1) {
                if (Array.isArray(batch1)) {
                    rawEntries = [...rawEntries, ...batch1];
                } else if (batch1.Results && Array.isArray(batch1.Results)) {
                    rawEntries = [...rawEntries, ...batch1.Results];
                }
            }
            
            // Process second batch
            if (batch2) {
                if (Array.isArray(batch2)) {
                    rawEntries = [...rawEntries, ...batch2];
                } else if (batch2.Results && Array.isArray(batch2.Results)) {
                    rawEntries = [...rawEntries, ...batch2.Results];
                }
            }
            
            const leaderboardEntries = rawEntries.map(entry => {
                const user = entry.User || entry.user || '';
                const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                const rank = entry.Rank || entry.rank || 0;
                
                return {
                    apiRank: parseInt(rank, 10),
                    username: user.trim(),
                    score: formattedScore.toString().trim() || score.toString()
                };
            });
            
            // Filter entries to only show registered users
            const filteredEntries = leaderboardEntries.filter(entry => {
                if (!entry.username) return false;
                const username = entry.username.toLowerCase().trim();
                return username && registeredUsers.has(username);
            });
            
            // Sort by API rank to ensure correct ordering
            filteredEntries.sort((a, b) => a.apiRank - b.apiRank);
            
            // Create clickable link to RetroAchievements leaderboard
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${board.leaderboardId}`;
            
            // Build the leaderboard embed
            const embed = new EmbedBuilder()
                .setColor('#9B59B6') // Purple color
                .setTitle(`🎮 ${board.gameTitle}`)
                .setURL(leaderboardUrl)
                .setDescription(`${board.description || 'Arcade Leaderboard'}\n\n*Note: Only users ranked 999 or lower in the global leaderboard are shown.*`)
                .setFooter({ text: `Board ID: ${board.boardId} • Data from RetroAchievements.org` });
            
            // Get game info for thumbnail
            try {
                const gameInfo = await retroAPI.getGameInfo(board.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error(`Error fetching game info for board ${board.boardId}:`, error);
                // Continue without the thumbnail
            }
            
            // Create leaderboard field
            if (filteredEntries.length > 0) {
                // Display top 10 entries or fewer if not enough
                const displayEntries = filteredEntries.slice(0, 10);
                let leaderboardText = '';
                
                displayEntries.forEach((entry, index) => {
                    const displayRank = index + 1;
                    const medalEmoji = displayRank === 1 ? '🥇' : (displayRank === 2 ? '🥈' : (displayRank === 3 ? '🥉' : `${displayRank}.`));
                    leaderboardText += `${medalEmoji} **${entry.username}**: ${entry.score} (Global Rank: #${entry.apiRank})\n`;
                });
                
                embed.addFields({ name: `Top ${displayEntries.length} Players`, value: leaderboardText });
                
                // Add total participants count
                embed.addFields({ 
                    name: 'Participants', 
                    value: `${filteredEntries.length} registered members on this leaderboard`
                });
            } else {
                embed.addFields({ name: 'No Players', value: 'No registered users have scores on this leaderboard yet.' });
            }
            
            // Send or update the message
            const boardId = board.boardId;
            try {
                if (this.lastMessageIds.has(boardId)) {
                    // Try to update existing message
                    const messageId = this.lastMessageIds.get(boardId);
                    const message = await channel.messages.fetch(messageId);
                    await message.edit({ embeds: [embed] });
                    console.log(`Updated arcade board embed for ${board.gameTitle} (ID: ${messageId})`);
                } else {
                    // Create new message
                    const message = await channel.send({ embeds: [embed] });
                    this.lastMessageIds.set(boardId, message.id);
                    console.log(`Created new arcade board embed for ${board.gameTitle} (ID: ${message.id})`);
                }
            } catch (error) {
                console.error(`Error updating arcade board embed for ${board.gameTitle}:`, error);
                // If updating fails, try to create a new message
                if (error.message.includes('Unknown Message')) {
                    try {
                        const message = await channel.send({ embeds: [embed] });
                        this.lastMessageIds.set(boardId, message.id);
                        console.log(`Created new arcade board embed after error for ${board.gameTitle} (ID: ${message.id})`);
                    } catch (sendError) {
                        console.error(`Error creating new message after previous error for ${board.gameTitle}:`, sendError);
                    }
                }
            }
        } catch (error) {
            console.error(`Error creating arcade board embed for ${board.gameTitle}:`, error);
        }
    }

    async updateRacingBoardEmbed(channel, racingBoard) {
        try {
            // Get all registered users
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to canonical usernames
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), user.raUsername);
            }
            
            // Fetch multiple batches of leaderboard entries
            const batch1 = await retroAPI.getLeaderboardEntriesDirect(racingBoard.leaderboardId, 0, 500);
            const batch2 = await retroAPI.getLeaderboardEntriesDirect(racingBoard.leaderboardId, 500, 500);
            
            // Combine the batches
            let rawEntries = [];
            
            // Process first batch
            if (batch1) {
                if (Array.isArray(batch1)) {
                    rawEntries = [...rawEntries, ...batch1];
                } else if (batch1.Results && Array.isArray(batch1.Results)) {
                    rawEntries = [...rawEntries, ...batch1.Results];
                }
            }
            
            // Process second batch
            if (batch2) {
                if (Array.isArray(batch2)) {
                    rawEntries = [...rawEntries, ...batch2];
                } else if (batch2.Results && Array.isArray(batch2.Results)) {
                    rawEntries = [...rawEntries, ...batch2.Results];
                }
            }
            
            const leaderboardEntries = rawEntries.map(entry => {
                const user = entry.User || entry.user || '';
                const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                const rank = entry.Rank || entry.rank || 0;
                
                return {
                    apiRank: parseInt(rank, 10),
                    username: user.trim(),
                    score: formattedScore.toString().trim() || score.toString()
                };
            });
            
            // Filter entries to only show registered users
            const filteredEntries = leaderboardEntries.filter(entry => {
                if (!entry.username) return false;
                const username = entry.username.toLowerCase().trim();
                return username && registeredUsers.has(username);
            });
            
            // Sort by API rank to ensure correct ordering
            filteredEntries.sort((a, b) => a.apiRank - b.apiRank);
            
            // Create clickable link to RetroAchievements leaderboard
            const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${racingBoard.leaderboardId}`;
            
            // Get current date for display
            const now = new Date();
            
            // Get the month name for display
            const raceDate = new Date(racingBoard.startDate);
            const monthName = raceDate.toLocaleString('default', { month: 'long' });
            const year = raceDate.getFullYear();
            
            // Generate full title with track name
            const trackDisplay = racingBoard.trackName 
                ? ` - ${racingBoard.trackName}`
                : '';
                
            const gameDisplay = `${racingBoard.gameTitle}${trackDisplay}`;
            
            // Calculate end date timestamp
            const endTimestamp = Math.floor(racingBoard.endDate.getTime() / 1000);
            
            // Build the leaderboard embed
            const embed = new EmbedBuilder()
                .setColor('#FF5722') // Orange color to distinguish from arcade boards
                .setTitle(`🏎️ ${monthName} ${year} Racing Challenge`)
                .setURL(leaderboardUrl)
                .setDescription(`**${gameDisplay}**\n${racingBoard.description || ''}\n\n` +
                               `⏱️ **Active Challenge**\nEnds <t:${endTimestamp}:F> (<t:${endTimestamp}:R>)\n\n` +
                               `Top 3 players at the end of the month will receive award points (3/2/1)!\n\n` +
                               `*Note: Only users ranked 999 or lower in the global leaderboard are shown.*`)
                .setFooter({ text: `Data from RetroAchievements.org` });
            
            // Get game info for thumbnail
            try {
                const gameInfo = await retroAPI.getGameInfo(racingBoard.gameId);
                if (gameInfo?.imageIcon) {
                    embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
                }
            } catch (error) {
                console.error(`Error fetching game info for racing ${racingBoard.gameTitle}:`, error);
                // Continue without the thumbnail
            }
            
            // Create leaderboard field
            if (filteredEntries.length > 0) {
                // Display top 10 entries
                const displayEntries = filteredEntries.slice(0, 10);
                let leaderboardText = '';
                
                displayEntries.forEach((entry, index) => {
                    const displayRank = index + 1;
                    const medalEmoji = displayRank === 1 ? '🥇' : (displayRank === 2 ? '🥈' : (displayRank === 3 ? '🥉' : `${displayRank}.`));
                    leaderboardText += `${medalEmoji} **${entry.username}**: ${entry.score}\n`;
                });
                
                embed.addFields({ name: 'Current Standings', value: leaderboardText });
                
                // Add total participants count
                embed.addFields({ 
                    name: 'Participants', 
                    value: `${filteredEntries.length} registered members participating in this racing challenge`
                });
            } else {
                embed.addFields({ name: 'No Participants', value: 'No registered users have posted times for this racing challenge yet.' });
            }
            
            // Send or update the message
            const boardId = `racing_${racingBoard.boardId}`;
            try {
                if (this.lastMessageIds.has(boardId)) {
                    // Try to update existing message
                    const messageId = this.lastMessageIds.get(boardId);
                    const message = await channel.messages.fetch(messageId);
                    await message.edit({ embeds: [embed] });
                    console.log(`Updated racing challenge embed for ${racingBoard.gameTitle} (ID: ${messageId})`);
                } else {
                    // Create new message
                    const message = await channel.send({ embeds: [embed] });
                    this.lastMessageIds.set(boardId, message.id);
                    console.log(`Created new racing challenge embed for ${racingBoard.gameTitle} (ID: ${message.id})`);
                }
            } catch (error) {
                console.error(`Error updating racing challenge embed for ${racingBoard.gameTitle}:`, error);
                // If updating fails, try to create a new message
                if (error.message.includes('Unknown Message')) {
                    try {
                        const message = await channel.send({ embeds: [embed] });
                        this.lastMessageIds.set(boardId, message.id);
                        console.log(`Created new racing challenge embed after error for ${racingBoard.gameTitle} (ID: ${message.id})`);
                    } catch (sendError) {
                        console.error(`Error creating new message after previous error for ${racingBoard.gameTitle}:`, sendError);
                    }
                }
            }
        } catch (error) {
            console.error(`Error creating racing challenge embed for ${racingBoard.gameTitle}:`, error);
        }
    }
}

// Create singleton instance
const arcadeFeedService = new ArcadeFeedService();
export default arcadeFeedService;
