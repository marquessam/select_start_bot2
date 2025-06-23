// src/services/arcadeAlertService.js - UPDATED with centralized AlertService
import { User } from '../models/User.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertService from '../utils/AlertService.js'; // NEW: Use centralized service

class ArcadeAlertService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arcadeAlertsChannelId || '1300941091335438471');
        // Store previous arcade standings for comparison
        this.previousStandings = new Map();
        // Track data consistency issues
        this.dataConsistencyIssues = new Map();
        // Minimum time between alerts for same board (prevent spam)
        this.lastAlertTime = new Map();
        this.minAlertInterval = 30 * 60 * 1000; // 30 minutes between alerts for same board
    }

    setClient(client) {
        super.setClient(client);
        // NEW: Set the client for AlertService when the service gets its client
        AlertService.setClient(client);
        console.log('AlertService configured for arcade alerts via setClient');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for arcade alert service');
            return;
        }

        try {
            console.log('Starting arcade alert service...');
            
            // Set the Discord client for AlertService
            AlertService.setClient(this.client);
            console.log('AlertService configured for arcade alerts');
            
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
            
            // Get all arcade boards
            const boards = await ArcadeBoard.find({ boardType: 'arcade' });
            
            if (boards.length === 0) {
                console.log('No arcade boards found to monitor');
                return;
            }
            
            console.log(`Found ${boards.length} arcade boards to check`);
            
            // Get all registered users ONCE and reuse
            const registeredUsersMap = await this.getRegisteredUsersMap();
            console.log(`Found ${registeredUsersMap.size} registered users total`);
            
            // Process each arcade board
            const alerts = [];
            for (const board of boards) {
                try {
                    console.log(`Processing board: ${board.gameTitle} (ID: ${board.boardId})`);
                    
                    // Get current standings with consistency checks
                    const currentStandings = await this.getArcadeBoardStandingsWithRetry(board, registeredUsersMap);
                    
                    // Skip if no results
                    if (!currentStandings || currentStandings.size === 0) {
                        console.log(`No registered users found on board: ${board.gameTitle}`);
                        continue;
                    }
                    
                    console.log(`Found ${currentStandings.size} registered users on board: ${board.gameTitle}`);
                    
                    // Only compare if we have consistent data
                    if (sendAlerts && this.previousStandings.has(board.boardId)) {
                        const prevStandings = this.previousStandings.get(board.boardId);
                        
                        // Check if this board should be alerted (rate limiting)
                        if (this.shouldSkipAlert(board.boardId)) {
                            console.log(`Skipping alert for board ${board.gameTitle} due to rate limiting`);
                            continue;
                        }
                        
                        // Only proceed if data sets are consistent in size
                        if (this.isDataConsistent(currentStandings, prevStandings, board)) {
                            await this.detectRankChanges(board, currentStandings, prevStandings, registeredUsersMap, alerts);
                        } else {
                            console.log(`Data inconsistency detected for board ${board.gameTitle}, skipping alerts but updating baseline`);
                        }
                    }
                    
                    // Update previous standings with current ones (keep as Map)
                    this.previousStandings.set(board.boardId, new Map(currentStandings));
                    
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
                await this.sendRankChangeAlerts(alerts);
            } else if (sendAlerts) {
                console.log('No arcade rank changes detected');
            } else {
                console.log('Baseline standings established for all arcade boards');
            }
        } catch (error) {
            console.error('Error checking arcade rank changes:', error);
        }
    }

    // Get registered users map once and reuse
    async getRegisteredUsersMap() {
        const users = await User.find({});
        const registeredUsers = new Map();
        for (const user of users) {
            if (user.raUsername) {
                registeredUsers.set(user.raUsername.toLowerCase(), {
                    username: user.raUsername,
                    discordId: user.discordId
                });
            }
        }
        return registeredUsers;
    }

    // Check if data is consistent between calls
    isDataConsistent(currentStandings, prevStandings, board) {
        const currentSize = currentStandings.size;
        const prevSize = prevStandings.size;
        
        // Allow for small differences (1-2 users) but flag large differences
        const sizeDifference = Math.abs(currentSize - prevSize);
        const maxAllowedDifference = Math.max(1, Math.floor(prevSize * 0.2)); // 20% or 1 user, whichever is larger
        
        if (sizeDifference > maxAllowedDifference) {
            console.warn(`Large data inconsistency for board ${board.gameTitle}: ${prevSize} -> ${currentSize} users (diff: ${sizeDifference})`);
            
            // Track consistency issues
            const issueKey = board.boardId;
            if (!this.dataConsistencyIssues.has(issueKey)) {
                this.dataConsistencyIssues.set(issueKey, 0);
            }
            this.dataConsistencyIssues.set(issueKey, this.dataConsistencyIssues.get(issueKey) + 1);
            
            console.warn(`Board ${board.gameTitle} has had ${this.dataConsistencyIssues.get(issueKey)} consistency issues`);
            return false;
        }
        
        // Reset consistency issues counter on good data
        this.dataConsistencyIssues.delete(board.boardId);
        return true;
    }

    // Rate limiting for alerts to prevent spam
    shouldSkipAlert(boardId) {
        const lastAlert = this.lastAlertTime.get(boardId);
        if (lastAlert) {
            const timeSinceLastAlert = Date.now() - lastAlert;
            if (timeSinceLastAlert < this.minAlertInterval) {
                const minutesRemaining = Math.ceil((this.minAlertInterval - timeSinceLastAlert) / (60 * 1000));
                console.log(`Last alert for board ${boardId} was ${Math.floor(timeSinceLastAlert / (60 * 1000))} minutes ago, waiting ${minutesRemaining} more minutes`);
                return true;
            }
        }
        return false;
    }

    // Get arcade board standings with retry logic and consistency checks
    async getArcadeBoardStandingsWithRetry(board, registeredUsers, maxRetries = 2) {
        let lastResult = null;
        let consistentResult = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Fetching standings for ${board.gameTitle} (attempt ${attempt}/${maxRetries})`);
                
                const result = await this.getArcadeBoardStandings(board, registeredUsers);
                
                if (attempt === 1) {
                    lastResult = result;
                    // If first attempt, continue to second attempt for consistency check
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
                    continue;
                }
                
                // Check consistency between attempts
                if (this.areStandingsConsistent(lastResult, result, board)) {
                    console.log(`Consistent data confirmed for ${board.gameTitle} after ${attempt} attempts`);
                    consistentResult = result;
                    break;
                } else {
                    console.warn(`Inconsistent data between attempts for ${board.gameTitle}`);
                    if (attempt === maxRetries) {
                        // Use the larger dataset as it's more likely to be complete
                        const resultToUse = (result && result.size >= (lastResult?.size || 0)) ? result : lastResult;
                        console.log(`Using larger dataset for ${board.gameTitle}: ${resultToUse?.size || 0} users`);
                        return resultToUse;
                    }
                }
                
                lastResult = result;
                // Small delay between retries
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error fetching standings for ${board.gameTitle} (attempt ${attempt}):`, error);
                if (attempt === maxRetries) {
                    return lastResult || new Map();
                }
            }
        }
        
        return consistentResult || lastResult || new Map();
    }

    // Check if two standings results are consistent
    areStandingsConsistent(standings1, standings2, board) {
        if (!standings1 || !standings2) return false;
        
        const size1 = standings1.size;
        const size2 = standings2.size;
        
        // Allow for small size differences
        if (Math.abs(size1 - size2) > 1) {
            console.warn(`Size mismatch for ${board.gameTitle}: ${size1} vs ${size2}`);
            return false;
        }
        
        // Check if the same users are present in both
        let commonUsers = 0;
        for (const username of standings1.keys()) {
            if (standings2.has(username)) {
                commonUsers++;
            }
        }
        
        const expectedCommon = Math.min(size1, size2);
        const consistencyRatio = commonUsers / expectedCommon;
        
        if (consistencyRatio < 0.9) { // 90% of users should be the same
            console.warn(`User consistency issue for ${board.gameTitle}: ${consistencyRatio * 100}% overlap`);
            return false;
        }
        
        return true;
    }

    // Detect rank changes using consistent Map comparison with better validation
    async detectRankChanges(board, currentStandings, prevStandings, registeredUsers, alerts) {
        try {
            const rankChangeAlerts = [];
            
            // Log detailed comparison info
            console.log(`Comparing standings for ${board.gameTitle}:`);
            console.log(`  Current: ${currentStandings.size} users`);
            console.log(`  Previous: ${prevStandings.size} users`);
            
            // Check for rank changes (top 5 only to keep alerts manageable)
            for (const [username, currentInfo] of currentStandings.entries()) {
                // Only check users currently in top 5
                if (currentInfo.rank > 5) continue;
                
                const prevInfo = prevStandings.get(username);
                if (!prevInfo) {
                    // More strict checking for new top 5 entries
                    const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                    if (discordId) {
                        console.log(`User ${username} newly entered top 5 at rank ${currentInfo.rank}`);
                        rankChangeAlerts.push({
                            type: 'entered_top5',
                            user: { username, discordId },
                            newRank: currentInfo.rank,
                            score: currentInfo.score,
                            globalRank: currentInfo.apiRank,
                            boardName: board.gameTitle,
                            boardId: board.boardId,
                            leaderboardId: board.leaderboardId
                        });
                    }
                } else if (currentInfo.rank < prevInfo.rank) {
                    // Validate that this is a meaningful rank improvement
                    const rankImprovement = prevInfo.rank - currentInfo.rank;
                    if (rankImprovement >= 1) { // Only alert for improvements of 1+ ranks
                        const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                        if (discordId) {
                            console.log(`User ${username} improved from rank ${prevInfo.rank} to ${currentInfo.rank}`);
                            rankChangeAlerts.push({
                                type: 'rank_improved',
                                user: { username, discordId },
                                prevRank: prevInfo.rank,
                                newRank: currentInfo.rank,
                                score: currentInfo.score,
                                globalRank: currentInfo.apiRank,
                                boardName: board.gameTitle,
                                boardId: board.boardId,
                                leaderboardId: board.leaderboardId
                            });
                        }
                    }
                } else if (currentInfo.rank > prevInfo.rank && prevInfo.rank <= 5) {
                    // Validate meaningful rank decrease
                    const rankDecrease = currentInfo.rank - prevInfo.rank;
                    if (rankDecrease >= 1) { // Only alert for decreases of 1+ ranks
                        const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                        if (discordId) {
                            console.log(`User ${username} decreased from rank ${prevInfo.rank} to ${currentInfo.rank}`);
                            rankChangeAlerts.push({
                                type: 'rank_decreased',
                                user: { username, discordId },
                                prevRank: prevInfo.rank,
                                newRank: currentInfo.rank,
                                score: currentInfo.score,
                                globalRank: currentInfo.apiRank,
                                boardName: board.gameTitle,
                                boardId: board.boardId,
                                leaderboardId: board.leaderboardId
                            });
                        }
                    }
                }
            }
            
            // Check for users who fell out of top 5
            for (const [username, prevInfo] of prevStandings.entries()) {
                if (prevInfo.rank > 5) continue; // They weren't in top 5 before
                
                const currentInfo = currentStandings.get(username);
                if (!currentInfo || currentInfo.rank > 5) {
                    // User fell out of top 5
                    const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                    if (discordId) {
                        console.log(`User ${username} fell out of top 5 from rank ${prevInfo.rank}`);
                        rankChangeAlerts.push({
                            type: 'fell_out_top5',
                            user: { username, discordId },
                            prevRank: prevInfo.rank,
                            newRank: currentInfo?.rank || 999,
                            globalRank: currentInfo?.apiRank || 999,
                            boardName: board.gameTitle,
                            boardId: board.boardId,
                            leaderboardId: board.leaderboardId
                        });
                    }
                }
            }
            
            // Add all alerts to the main alerts array
            alerts.push(...rankChangeAlerts);
            
            console.log(`Board ${board.gameTitle}: ${rankChangeAlerts.length} rank changes detected`);
            
            // Update last alert time if alerts were generated
            if (rankChangeAlerts.length > 0) {
                this.lastAlertTime.set(board.boardId, Date.now());
            }
            
        } catch (error) {
            console.error(`Error detecting changes for board ${board.gameTitle}:`, error);
        }
    }

    // Get the current standings for a specific arcade board
    async getArcadeBoardStandings(board, registeredUsers) {
        try {
            // Use our utility function to get leaderboard entries
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(board.leaderboardId, 1000);
            
            if (!rawEntries || rawEntries.length === 0) {
                console.warn(`No raw entries returned for board ${board.gameTitle}`);
                return new Map();
            }
            
            console.log(`Retrieved ${rawEntries.length} raw entries for ${board.gameTitle}`);
            
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
            
            console.log(`Filtered to ${filteredEntries.length} registered users for ${board.gameTitle}`);
            
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
            
            // Log final standings for debugging
            console.log(`Final standings for ${board.gameTitle}:`, Array.from(standings.entries()).slice(0, 5));
            
            return standings;
        } catch (error) {
            console.error(`Error fetching standings for arcade board ${board.gameTitle}:`, error);
            return new Map();
        }
    }

    // UPDATED: Send alerts using centralized AlertService
    async sendRankChangeAlerts(alerts) {
        if (!alerts || alerts.length === 0) {
            console.log('No arcade rank change alerts to send');
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

    // MASSIVELY SIMPLIFIED: Send rank change alerts using AlertService
    async sendBoardRankChangeAlerts(boardAlertsList) {
        try {
            const firstAlert = boardAlertsList[0];
            const boardName = firstAlert.boardName;
            const leaderboardId = firstAlert.leaderboardId;
            
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
            const registeredUsers = await this.getRegisteredUsersMap();
            const standings = await this.getArcadeBoardStandings(board, registeredUsers);
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
            
            // SIMPLIFIED: Single method call with all link generation handled automatically
            await AlertService.sendArcadeRankAlert({
                title: '🕹️ Arcade Alert!',
                description: `The leaderboard has been updated!`,
                changes: changes,
                currentStandings: currentStandings,
                gameTitle: board.gameTitle,           // AlertService creates game link
                gameId: board.gameId,                 // AlertService creates game link
                leaderboardTitle: board.gameTitle,    // AlertService creates leaderboard link
                leaderboardId: board.leaderboardId,   // AlertService creates leaderboard link
                thumbnail: thumbnailUrl,
                footer: { text: 'Data provided by RetroAchievements • Rankings update hourly' }
            });
            
        } catch (error) {
            console.error('Error sending board rank change alerts:', error);
        }
    }
}

// Create singleton instance
const arcadeAlertService = new ArcadeAlertService();
export default arcadeAlertService;
