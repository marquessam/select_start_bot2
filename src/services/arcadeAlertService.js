// src/services/arcadeAlertService.js
import { User } from '../models/User.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS } from '../utils/FeedUtils.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertUtils from '../utils/AlertUtils.js';

class ArcadeAlertService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arcadeAlertsChannelId || '1300941091335438471');
        // Store previous arcade standings for comparison
        this.previousStandings = new Map();
        
        // Configure AlertUtils
        AlertUtils.setAlertsChannel(this.channelId);
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
            
            // Call the parent start method with our custom interval
            await super.start(60 * 60 * 1000); // Check every hour
        } catch (error) {
            console.error('Error starting arcade alert service:', error);
        }
    }

    // Override the update method from base class
    async update() {
        await this.checkForRankChanges(true);
    }

    async checkForRankChanges(sendAlerts = true) {
        try {
            console.log(`Checking for arcade rank changes (sendAlerts=${sendAlerts})...`);
            
            // We can use the base class getChannel method
            const alertsChannel = sendAlerts ? await this.getChannel() : null;
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
            
            // Create mapping of RA usernames to user info
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
                    // Get the current standings for this board using our utility
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
            // Use our utility function to get leaderboard entries
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(board.leaderboardId, 1000);
            
            // Process the entries
            const leaderboardEntries = rawEntries.map(entry => {
                return {
                    apiRank: entry.Rank || 0,
                    username: entry.User || '',
                    score: entry.FormattedScore || entry.Score?.toString() || '0'
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

    // Send alerts for rank changes - using our AlertUtils
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
                    const gameInfo = await RetroAPIUtils.getGameInfo(board.gameId);
                    if (gameInfo?.imageIcon) {
                        thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                    }
                } catch (error) {
                    console.error('Error fetching game info for embed thumbnail:', error);
                }
                
                // Prepare the position changes
                const changes = [];
                
                // Process various types of alerts to create simple messages
                for (const alert of boardAlertsList) {
                    if (alert.type === 'overtaken' && alert.passer) {
                        changes.push({
                            username: alert.passer.username,
                            newRank: alert.prevRank
                        });
                    } else if (alert.type === 'entered_top3') {
                        changes.push({
                            username: alert.user.username,
                            newRank: alert.newRank
                        });
                    }
                }
                
                // Get current standings
                const currentStandings = [];
                const standings = await this.getArcadeBoardStandings(board, await this.getRegisteredUsers());
                if (standings && standings.size > 0) {
                    // Convert to array for sorting
                    const standingsArray = Array.from(standings.entries())
                        .map(([username, data]) => ({
                            username,
                            rank: data.rank,
                            score: data.score
                        }))
                        .sort((a, b) => a.rank - b.rank);
                    
                    // Get top 5
                    const topFive = standingsArray.filter(entry => entry.rank <= 5);
                    currentStandings.push(...topFive);
                }
                
                // Use our AlertUtils
                await AlertUtils.sendPositionChangeAlert({
                    title: '🕹️ Arcade Alert!',
                    description: `The leaderboard for **${boardName}** has been updated!`,
                    changes: changes,
                    currentStandings: currentStandings,
                    thumbnail: thumbnailUrl,
                    color: COLORS.INFO,
                    footer: { text: 'Data provided by RetroAchievements • Rankings update hourly' }
                });
                
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
