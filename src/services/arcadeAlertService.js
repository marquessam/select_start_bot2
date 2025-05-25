// src/services/arcadeAlertService.js
import { User } from '../models/User.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS } from '../utils/FeedUtils.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertUtils, { ALERT_TYPES } from '../utils/AlertUtils.js';

class ArcadeAlertService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arcadeAlertsChannelId || '1300941091335438471');
        // Store previous arcade standings for comparison
        this.previousStandings = new Map();
    }

    setClient(client) {
        super.setClient(client);
        // Set the client for AlertUtils when the service gets its client
        AlertUtils.setClient(client);
        console.log('AlertUtils client configured for arcade alerts via setClient');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for arcade alert service');
            return;
        }

        try {
            console.log('Starting arcade alert service...');
            
            // Set the Discord client for AlertUtils
            AlertUtils.setClient(this.client);
            console.log('AlertUtils client configured for arcade alerts');
            
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
            console.log(`Found ${users.length} registered users total`);
            
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
                    console.log(`Processing board: ${board.gameTitle} (ID: ${board.boardId})`);
                    
                    // Get the current standings for this board
                    const currentStandings = await this.getArcadeBoardStandings(board, registeredUsers);
                    
                    // Skip if no results
                    if (!currentStandings || currentStandings.size === 0) {
                        console.log(`No registered users found on board: ${board.gameTitle}`);
                        continue;
                    }
                    
                    console.log(`Found ${currentStandings.size} registered users on board: ${board.gameTitle}`);
                    
                    // Compare with previous standings to check for changes
                    if (sendAlerts && this.previousStandings.has(board.boardId)) {
                        const prevStandings = this.previousStandings.get(board.boardId);
                        
                        // Check for rank changes (simplified - just use rank)
                        await this.detectRankChanges(board, currentStandings, prevStandings, registeredUsers, alerts);
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
            } else {
                console.log('Baseline standings established for all arcade boards');
            }
        } catch (error) {
            console.error('Error checking arcade rank changes:', error);
        }
    }

    // Simplified: Detect rank changes using ApiRank only
    async detectRankChanges(board, currentStandings, prevStandings, registeredUsers, alerts) {
        try {
            const rankChangeAlerts = [];
            
            // Check for rank changes (top 5 only to keep alerts manageable)
            for (const [username, currentInfo] of currentStandings.entries()) {
                // Only check users currently in top 5
                if (currentInfo.rank > 5) continue;
                
                const prevInfo = prevStandings[username];
                if (!prevInfo) {
                    // User newly entered the top 5
                    const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                    if (discordId) {
                        rankChangeAlerts.push({
                            type: 'entered_top5',
                            user: { username, discordId },
                            newRank: currentInfo.rank,
                            score: currentInfo.score,
                            globalRank: currentInfo.apiRank,
                            boardName: board.gameTitle,
                            boardId: board.boardId
                        });
                    }
                } else if (currentInfo.rank < prevInfo.rank) {
                    // User improved their rank
                    const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                    if (discordId) {
                        rankChangeAlerts.push({
                            type: 'rank_improved',
                            user: { username, discordId },
                            prevRank: prevInfo.rank,
                            newRank: currentInfo.rank,
                            score: currentInfo.score,
                            globalRank: currentInfo.apiRank,
                            boardName: board.gameTitle,
                            boardId: board.boardId
                        });
                    }
                } else if (currentInfo.rank > prevInfo.rank && prevInfo.rank <= 5) {
                    // User's rank decreased (someone passed them)
                    const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                    if (discordId) {
                        rankChangeAlerts.push({
                            type: 'rank_decreased',
                            user: { username, discordId },
                            prevRank: prevInfo.rank,
                            newRank: currentInfo.rank,
                            score: currentInfo.score,
                            globalRank: currentInfo.apiRank,
                            boardName: board.gameTitle,
                            boardId: board.boardId
                        });
                    }
                }
            }
            
            // Check for users who fell out of top 5
            for (const [username, prevInfo] of Object.entries(prevStandings)) {
                if (prevInfo.rank > 5) continue; // They weren't in top 5 before
                
                const currentInfo = currentStandings.get(username);
                if (!currentInfo || currentInfo.rank > 5) {
                    // User fell out of top 5
                    const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                    if (discordId) {
                        rankChangeAlerts.push({
                            type: 'fell_out_top5',
                            user: { username, discordId },
                            prevRank: prevInfo.rank,
                            newRank: currentInfo?.rank || 999,
                            globalRank: currentInfo?.apiRank || 999,
                            boardName: board.gameTitle,
                            boardId: board.boardId
                        });
                    }
                }
            }
            
            // Add all alerts to the main alerts array
            alerts.push(...rankChangeAlerts);
            
            console.log(`Board ${board.gameTitle}: ${rankChangeAlerts.length} rank changes detected`);
            
        } catch (error) {
            console.error(`Error detecting changes for board ${board.gameTitle}:`, error);
        }
    }

    // Get the current standings for a specific arcade board
    async getArcadeBoardStandings(board, registeredUsers) {
        try {
            // Use our utility function to get leaderboard entries
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(board.leaderboardId, 1000);
            
            // Process the entries - simplified, just use the rank
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
            
            // Sort by API rank (lower is better)
            filteredEntries.sort((a, b) => a.apiRank - b.apiRank);
            
            // Build standings map with community rank (1-based)
            const standings = new Map();
            filteredEntries.forEach((entry, index) => {
                const communityRank = index + 1; // Our internal rank (1-based)
                standings.set(entry.username, {
                    rank: communityRank,
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

    // Send alerts with proper organization
    async sendRankChangeAlerts(alertsChannel, alerts) {
        if (!alertsChannel) {
            console.log('No alerts channel configured, skipping arcade rank change notifications');
            return;
        }

        // Group alerts by board
        const boardAlerts = new Map();
        
        for (const alert of alerts) {
            if (!boardAlerts.has(alert.boardId)) {
                boardAlerts.set(alert.boardId, []);
            }
            boardAlerts.get(alert.boardId).push(alert);
        }
        
        // Process each board's alerts
        for (const [boardId, boardAlertsList] of boardAlerts.entries()) {
            await this.sendBoardRankChangeAlerts(boardAlertsList);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Send rank change alerts for a specific board
    async sendBoardRankChangeAlerts(boardAlertsList) {
        try {
            const firstAlert = boardAlertsList[0];
            const boardName = firstAlert.boardName;
            
            // Get board details
            const board = await ArcadeBoard.findOne({ boardId: firstAlert.boardId });
            if (!board) {
                console.warn(`Board not found for boardId ${firstAlert.boardId}`);
                return;
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
            
            // Process alerts to create change notifications
            for (const alert of boardAlertsList) {
                if (alert.type === 'entered_top5' || alert.type === 'rank_improved') {
                    changes.push({
                        username: alert.user.username,
                        newRank: alert.newRank
                    });
                }
            }
            
            // Get current standings for top 5
            const currentStandings = [];
            const standings = await this.getArcadeBoardStandings(board, await this.getRegisteredUsers());
            if (standings && standings.size > 0) {
                // Convert to array for sorting
                const standingsArray = Array.from(standings.entries())
                    .map(([username, data]) => ({
                        username,
                        rank: data.rank,
                        score: data.score,
                        globalRank: data.apiRank
                    }))
                    .sort((a, b) => a.rank - b.rank);
                
                // Get top 5
                const topFive = standingsArray.filter(entry => entry.rank <= 5);
                currentStandings.push(...topFive);
            }
            
            // Use AlertUtils for rank changes with the ARCADE alert type
            await AlertUtils.sendPositionChangeAlert({
                title: '🕹️ Arcade Alert!',
                description: `The leaderboard for **${boardName}** has been updated!`,
                changes: changes,
                currentStandings: currentStandings,
                thumbnail: thumbnailUrl,
                footer: { text: 'Data provided by RetroAchievements • Rankings update hourly' }
            }, ALERT_TYPES.ARCADE);
            
        } catch (error) {
            console.error('Error sending board rank change alerts:', error);
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
