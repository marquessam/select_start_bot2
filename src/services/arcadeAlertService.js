// src/services/arcadeAlertService.js
import { EmbedBuilder } from 'discord.js';
import { User } from '../models/User.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';

const CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour (60 minutes * 60 seconds * 1000 ms)
const MEDAL_EMOJIS = {
    1: '🥇',
    2: '🥈',
    3: '🥉'
};

class ArcadeAlertService {
    constructor() {
        this.client = null;
        this.alertsChannelId = config.discord.arcadeAlertsChannelId || '1300941091335438471'; // Channel for arcade alerts
        this.updateInterval = null;
        
        // Store previous arcade standings for comparison
        // Structure: { boardId: { username: { rank: number, score: string } } }
        this.previousStandings = new Map();
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for arcade alert service');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for arcade alert service');
            return;
        }

        try {
            console.log('Starting arcade alert service...');
            
            // Initial check (without alerts, just to build baseline standings)
            await this.checkForRankChanges(false);
            
            // Set up recurring checks
            this.updateInterval = setInterval(() => {
                this.checkForRankChanges(true).catch(error => {
                    console.error('Error checking arcade standings:', error);
                });
            }, CHECK_INTERVAL);
            
            console.log(`Arcade alert service started. Checks will occur every ${CHECK_INTERVAL / 60000} minutes.`);
        } catch (error) {
            console.error('Error starting arcade alert service:', error);
        }
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('Arcade alert service stopped.');
        }
    }

    // Get the alerts channel
    async getAlertsChannel() {
        if (!this.client || !this.alertsChannelId) {
            return null;
        }

        try {
            const guildId = config.discord.guildId;
            const guild = await this.client.guilds.fetch(guildId);
            
            if (!guild) {
                return null;
            }

            return await guild.channels.fetch(this.alertsChannelId);
        } catch (error) {
            console.error('Error getting arcade alerts channel:', error);
            return null;
        }
    }

    async checkForRankChanges(sendAlerts = true) {
        try {
            console.log(`Checking for arcade rank changes (sendAlerts=${sendAlerts})...`);
            
            // Get alerts channel
            const alertsChannel = sendAlerts ? await this.getAlertsChannel() : null;
            if (sendAlerts && !alertsChannel) {
                console.error('Arcade alerts channel not found or inaccessible');
                return;
            }

            // Get all arcade boards
            const boards = await ArcadeBoard.find({ boardType: 'arcade' });
            
            if (boards.length === 0) {
                console.log('No arcade boards found to monitor');
                return;
            }
            
            console.log(`Found ${boards.length} arcade boards to check`);
            
            // Get all registered users
            const users = await User.find({});
            
            // Create mapping of RA usernames (lowercase) to user info
            const registeredUsers = new Map();
            for (const user of users) {
                registeredUsers.set(user.raUsername.toLowerCase(), {
                    username: user.raUsername,
                    discordId: user.discordId
                });
            }
            
            // Process each arcade board
            const alerts = [];
            for (const board of boards) {
                try {
                    // Get the current standings for this board
                    const currentStandings = await this.getArcadeBoardStandings(board, registeredUsers);
                    
                    // Skip if no results
                    if (!currentStandings || currentStandings.size === 0) {
                        continue;
                    }
                    
                    // Compare with previous standings to check for changes
                    if (sendAlerts && this.previousStandings.has(board.boardId)) {
                        const prevStandings = this.previousStandings.get(board.boardId);
                        
                        // Find users who fell in rank within the top 3
                        for (const [username, prevInfo] of Object.entries(prevStandings)) {
                            // Only check users who were in top 3
                            if (prevInfo.rank > 3) continue;
                            
                            // Get current ranking
                            const currentInfo = currentStandings.get(username);
                            
                            // Check if user no longer in standings or fell in rank
                            if (!currentInfo) {
                                // User completely fell off the board
                                const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                                if (discordId) {
                                    alerts.push({
                                        type: 'dropped',
                                        user: { username, discordId },
                                        prevRank: prevInfo.rank,
                                        prevScore: prevInfo.score,
                                        boardName: board.gameTitle,
                                        boardId: board.boardId
                                    });
                                }
                            } else if (currentInfo.rank > prevInfo.rank && currentInfo.rank <= 3) {
                                // User rank decreased but still in top 3
                                // Find who passed them
                                let passer = null;
                                for (const [otherUser, otherInfo] of currentStandings.entries()) {
                                    if (otherInfo.rank === prevInfo.rank) {
                                        passer = {
                                            username: otherUser,
                                            score: otherInfo.score
                                        };
                                        break;
                                    }
                                }
                                
                                const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                                if (discordId && passer) {
                                    alerts.push({
                                        type: 'overtaken',
                                        user: { username, discordId },
                                        prevRank: prevInfo.rank,
                                        newRank: currentInfo.rank,
                                        passer: passer,
                                        boardName: board.gameTitle,
                                        boardId: board.boardId
                                    });
                                }
                            } else if (currentInfo.rank > 3 && prevInfo.rank <= 3) {
                                // User fell out of top 3
                                const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                                if (discordId) {
                                    alerts.push({
                                        type: 'out_of_top3',
                                        user: { username, discordId },
                                        prevRank: prevInfo.rank,
                                        newRank: currentInfo.rank,
                                        boardName: board.gameTitle,
                                        boardId: board.boardId
                                    });
                                }
                            }
                        }
                        
                        // Also check for users who newly entered the top 3
                        for (const [username, currentInfo] of currentStandings.entries()) {
                            // Only care about users currently in top 3
                            if (currentInfo.rank > 3) continue;
                            
                            // Check if user wasn't in previous standings or was ranked lower
                            const prevInfo = prevStandings[username];
                            if (!prevInfo || prevInfo.rank > 3) {
                                const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                                if (discordId) {
                                    alerts.push({
                                        type: 'entered_top3',
                                        user: { username, discordId },
                                        newRank: currentInfo.rank,
                                        score: currentInfo.score,
                                        boardName: board.gameTitle,
                                        boardId: board.boardId
                                    });
                                }
                            }
                        }
                    }
                    
                    // Update previous standings with current ones
                    this.previousStandings.set(board.boardId, Object.fromEntries(currentStandings));
                    
                } catch (boardError) {
                    console.error(`Error processing arcade board ${board.gameTitle}:`, boardError);
                    // Continue with next board
                }
                
                // Add a small delay between boards to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Send alerts if any were found
            if (sendAlerts && alerts.length > 0) {
                console.log(`Found ${alerts.length} arcade ranking changes to notify`);
                await this.sendRankChangeAlerts(alertsChannel, alerts);
            } else if (sendAlerts) {
                console.log('No arcade rank changes detected');
            }
        } catch (error) {
            console.error('Error checking arcade rank changes:', error);
        }
    }

    // Get the current standings for a specific arcade board
    async getArcadeBoardStandings(board, registeredUsers) {
        try {
            // Fetch leaderboard entries from RetroAchievements
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
            
            // Process the entries
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
            
            // Build standings map
            const standings = new Map();
            filteredEntries.forEach((entry, index) => {
                const displayRank = index + 1; // Our internal rank (1-based)
                standings.set(entry.username, {
                    rank: displayRank,
                    score: entry.score,
                    apiRank: entry.apiRank
                });
            });
            
            return standings;
        } catch (error) {
            console.error(`Error fetching standings for arcade board ${board.gameTitle}:`, error);
            return new Map();
        }
    }

    // Send alerts for rank changes - STREAMLINED VERSION
    async sendRankChangeAlerts(alertsChannel, alerts) {
        if (!alertsChannel) {
            console.log('No alerts channel configured, skipping arcade rank change notifications');
            return;
        }

        // Group alerts by boardId
        const boardAlerts = new Map();
        
        for (const alert of alerts) {
            if (!boardAlerts.has(alert.boardId)) {
                boardAlerts.set(alert.boardId, []);
            }
            boardAlerts.get(alert.boardId).push(alert);
        }
        
        // Process each board's alerts
        for (const [boardId, boardAlertsList] of boardAlerts.entries()) {
            try {
                // Get the first alert to extract board info
                const firstAlert = boardAlertsList[0];
                const boardName = firstAlert.boardName;
                
                // Get board details
                const board = await ArcadeBoard.findOne({ boardId: boardId });
                if (!board) {
                    console.warn(`Board not found for boardId ${boardId}`);
                    continue;
                }
                
                // Get game info for thumbnail
                let thumbnailUrl = null;
                try {
                    const gameInfo = await retroAPI.getGameInfo(board.gameId);
                    if (gameInfo?.imageIcon) {
                        thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                    }
                } catch (error) {
                    console.error('Error fetching game info for embed thumbnail:', error);
                    // Continue without the thumbnail
                }
                
                // Get current Unix timestamp for Discord formatting
                const unixTimestamp = Math.floor(Date.now() / 1000);
                
                // Create leaderboard URL for the title link
                const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${board.leaderboardId}`;
                
                // Create embed with streamlined format
                const embed = new EmbedBuilder()
                    .setColor('#9B59B6') // Purple color
                    .setTitle(`🕹️ Arcade Alert!`)
                    .setURL(leaderboardUrl)
                    .setDescription(`The leaderboard for **[${boardName}](${leaderboardUrl})** has been updated!\n**Time:** <t:${unixTimestamp}:f>`)
                    .setTimestamp()
                    .setFooter({ text: 'Data provided by RetroAchievements • Rankings update hourly' });
                    
                if (thumbnailUrl) {
                    embed.setThumbnail(thumbnailUrl);
                }
                
                // Create simple position change messages
                let positionMessages = [];
                
                // Process various types of alerts to create simple messages
                for (const alert of boardAlertsList) {
                    let message = '';
                    
                    if (alert.type === 'overtaken' && alert.passer) {
                        // Someone passed another user
                        const rankEmoji = MEDAL_EMOJIS[alert.prevRank] || `#${alert.prevRank}`;
                        message = `**@${alert.passer.username}** is now in ${rankEmoji} place!`;
                    } else if (alert.type === 'entered_top3') {
                        // User entered top 3
                        const rankEmoji = MEDAL_EMOJIS[alert.newRank] || `#${alert.newRank}`;
                        message = `**@${alert.user.username}** is now in ${rankEmoji} place!`;
                    }
                    
                    if (message && !positionMessages.includes(message)) {
                        positionMessages.push(message);
                    }
                }
                
                // Add position changes if any exist
                if (positionMessages.length > 0) {
                    embed.addFields({ 
                        name: 'Position Changes', 
                        value: positionMessages.join('\n') 
                    });
                }
                
                // Now get the current top 5 standings (increased from top 3)
                try {
                    const currentStandings = await this.getArcadeBoardStandings(board, await this.getRegisteredUsers());
                    
                    if (currentStandings && currentStandings.size > 0) {
                        // Convert to array for sorting
                        const standingsArray = Array.from(currentStandings.entries())
                            .map(([username, data]) => ({
                                username,
                                rank: data.rank,
                                score: data.score
                            }))
                            .sort((a, b) => a.rank - b.rank);
                        
                        // Get top 5 (increased from 3)
                        const topFive = standingsArray.filter(entry => entry.rank <= 5);
                        
                        if (topFive.length > 0) {
                            let currentStandingsText = '';
                            topFive.forEach(entry => {
                                const rankEmoji = MEDAL_EMOJIS[entry.rank] || `#${entry.rank}`;
                                currentStandingsText += `${rankEmoji} **@${entry.username}**: ${entry.score}\n`;
                            });
                            
                            embed.addFields({ name: 'Current Top 5', value: currentStandingsText });
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching current standings for ${boardName}:`, error);
                }
                
                // Send the embed if there are position changes
                if (positionMessages.length > 0) {
                    await alertsChannel.send({ embeds: [embed] });
                    console.log(`Sent streamlined arcade alert for board: ${boardName}`);
                }
                
                // Add a delay between sending embeds for different boards
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error sending arcade rank change alert for board ${boardId}:`, error);
            }
        }
    }
    
    // Helper method to get all registered users
    async getRegisteredUsers() {
        const users = await User.find({});
        const registeredUsers = new Map();
        for (const user of users) {
            registeredUsers.set(user.raUsername.toLowerCase(), {
                username: user.raUsername,
                discordId: user.discordId
            });
        }
        return registeredUsers;
    }
}

// Create singleton instance
const arcadeAlertService = new ArcadeAlertService();
export default arcadeAlertService;
