// src/services/arcadeAlertService.js - SIMPLIFIED with alert logic removed
import { User } from '../models/User.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertService from '../utils/AlertService.js';

class ArcadeAlertService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arcadeAlertsChannelId || '1300941091335438471');
        this.previousStandings = new Map();
        this.dataConsistencyIssues = new Map();
        this.lastAlertTime = new Map();
        this.minAlertInterval = 30 * 60 * 1000; // 30 minutes between alerts for same board
    }

    setClient(client) {
        super.setClient(client);
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
            
            const boards = await ArcadeBoard.find({ boardType: 'arcade' });
            
            if (boards.length === 0) {
                console.log('No arcade boards found to monitor');
                return;
            }
            
            console.log(`Found ${boards.length} arcade boards to check`);
            
            const registeredUsersMap = await this.getRegisteredUsersMap();
            console.log(`Found ${registeredUsersMap.size} registered users total`);
            
            const alerts = [];
            for (const board of boards) {
                try {
                    console.log(`Processing board: ${board.gameTitle} (ID: ${board.boardId})`);
                    
                    const currentStandings = await this.getArcadeBoardStandingsWithRetry(board, registeredUsersMap);
                    
                    if (!currentStandings || currentStandings.size === 0) {
                        console.log(`No registered users found on board: ${board.gameTitle}`);
                        continue;
                    }
                    
                    console.log(`Found ${currentStandings.size} registered users on board: ${board.gameTitle}`);
                    
                    if (sendAlerts && this.previousStandings.has(board.boardId)) {
                        const prevStandings = this.previousStandings.get(board.boardId);
                        
                        if (this.shouldSkipAlert(board.boardId)) {
                            console.log(`Skipping alert for board ${board.gameTitle} due to rate limiting`);
                            continue;
                        }
                        
                        if (this.isDataConsistent(currentStandings, prevStandings, board)) {
                            await this.detectRankChanges(board, currentStandings, prevStandings, registeredUsersMap, alerts);
                        } else {
                            console.log(`Data inconsistency detected for board ${board.gameTitle}, skipping alerts but updating baseline`);
                        }
                    }
                    
                    this.previousStandings.set(board.boardId, new Map(currentStandings));
                    
                } catch (boardError) {
                    console.error(`Error processing arcade board ${board.gameTitle}:`, boardError);
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // SIMPLIFIED: Send alerts using centralized AlertService
            if (sendAlerts && alerts.length > 0) {
                console.log(`Found ${alerts.length} arcade ranking changes to notify`);
                await this.sendCentralizedAlerts(alerts);
            } else if (sendAlerts) {
                console.log('No arcade rank changes detected');
            } else {
                console.log('Baseline standings established for all arcade boards');
            }
        } catch (error) {
            console.error('Error checking arcade rank changes:', error);
        }
    }

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

    isDataConsistent(currentStandings, prevStandings, board) {
        const currentSize = currentStandings.size;
        const prevSize = prevStandings.size;
        
        const sizeDifference = Math.abs(currentSize - prevSize);
        const maxAllowedDifference = Math.max(1, Math.floor(prevSize * 0.2));
        
        if (sizeDifference > maxAllowedDifference) {
            console.warn(`Large data inconsistency for board ${board.gameTitle}: ${prevSize} -> ${currentSize} users (diff: ${sizeDifference})`);
            
            const issueKey = board.boardId;
            if (!this.dataConsistencyIssues.has(issueKey)) {
                this.dataConsistencyIssues.set(issueKey, 0);
            }
            this.dataConsistencyIssues.set(issueKey, this.dataConsistencyIssues.get(issueKey) + 1);
            
            console.warn(`Board ${board.gameTitle} has had ${this.dataConsistencyIssues.get(issueKey)} consistency issues`);
            return false;
        }
        
        this.dataConsistencyIssues.delete(board.boardId);
        return true;
    }

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

    async getArcadeBoardStandingsWithRetry(board, registeredUsers, maxRetries = 2) {
        let lastResult = null;
        let consistentResult = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Fetching standings for ${board.gameTitle} (attempt ${attempt}/${maxRetries})`);
                
                const result = await this.getArcadeBoardStandings(board, registeredUsers);
                
                if (attempt === 1) {
                    lastResult = result;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
                
                if (this.areStandingsConsistent(lastResult, result, board)) {
                    console.log(`Consistent data confirmed for ${board.gameTitle} after ${attempt} attempts`);
                    consistentResult = result;
                    break;
                } else {
                    console.warn(`Inconsistent data between attempts for ${board.gameTitle}`);
                    if (attempt === maxRetries) {
                        const resultToUse = (result && result.size >= (lastResult?.size || 0)) ? result : lastResult;
                        console.log(`Using larger dataset for ${board.gameTitle}: ${resultToUse?.size || 0} users`);
                        return resultToUse;
                    }
                }
                
                lastResult = result;
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

    areStandingsConsistent(standings1, standings2, board) {
        if (!standings1 || !standings2) return false;
        
        const size1 = standings1.size;
        const size2 = standings2.size;
        
        if (Math.abs(size1 - size2) > 1) {
            console.warn(`Size mismatch for ${board.gameTitle}: ${size1} vs ${size2}`);
            return false;
        }
        
        let commonUsers = 0;
        for (const username of standings1.keys()) {
            if (standings2.has(username)) {
                commonUsers++;
            }
        }
        
        const expectedCommon = Math.min(size1, size2);
        const consistencyRatio = commonUsers / expectedCommon;
        
        if (consistencyRatio < 0.9) {
            console.warn(`User consistency issue for ${board.gameTitle}: ${consistencyRatio * 100}% overlap`);
            return false;
        }
        
        return true;
    }

    async detectRankChanges(board, currentStandings, prevStandings, registeredUsers, alerts) {
        try {
            const rankChangeAlerts = [];
            
            console.log(`Comparing standings for ${board.gameTitle}:`);
            console.log(`  Current: ${currentStandings.size} users`);
            console.log(`  Previous: ${prevStandings.size} users`);
            
            for (const [username, currentInfo] of currentStandings.entries()) {
                if (currentInfo.rank > 5) continue; // Only check top 5
                
                const prevInfo = prevStandings.get(username);
                if (!prevInfo) {
                    const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                    if (discordId) {
                        console.log(`User ${username} newly entered top 5 at rank ${currentInfo.rank}`);
                        rankChangeAlerts.push({
                            type: 'entered_top5',
                            username: username,
                            newRank: currentInfo.rank,
                            score: currentInfo.score,
                            globalRank: currentInfo.apiRank,
                            boardName: board.gameTitle,
                            boardId: board.boardId,
                            leaderboardId: board.leaderboardId,
                            gameId: board.gameId
                        });
                    }
                } else if (currentInfo.rank < prevInfo.rank) {
                    const rankImprovement = prevInfo.rank - currentInfo.rank;
                    if (rankImprovement >= 1) {
                        const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                        if (discordId) {
                            console.log(`User ${username} improved from rank ${prevInfo.rank} to ${currentInfo.rank}`);
                            rankChangeAlerts.push({
                                type: 'rank_improved',
                                username: username,
                                prevRank: prevInfo.rank,
                                newRank: currentInfo.rank,
                                score: currentInfo.score,
                                globalRank: currentInfo.apiRank,
                                boardName: board.gameTitle,
                                boardId: board.boardId,
                                leaderboardId: board.leaderboardId,
                                gameId: board.gameId
                            });
                        }
                    }
                } else if (currentInfo.rank > prevInfo.rank && prevInfo.rank <= 5) {
                    const rankDecrease = currentInfo.rank - prevInfo.rank;
                    if (rankDecrease >= 1) {
                        const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                        if (discordId) {
                            console.log(`User ${username} decreased from rank ${prevInfo.rank} to ${currentInfo.rank}`);
                            rankChangeAlerts.push({
                                type: 'rank_decreased',
                                username: username,
                                prevRank: prevInfo.rank,
                                newRank: currentInfo.rank,
                                score: currentInfo.score,
                                globalRank: currentInfo.apiRank,
                                boardName: board.gameTitle,
                                boardId: board.boardId,
                                leaderboardId: board.leaderboardId,
                                gameId: board.gameId
                            });
                        }
                    }
                }
            }
            
            // Check for users who fell out of top 5
            for (const [username, prevInfo] of prevStandings.entries()) {
                if (prevInfo.rank > 5) continue;
                
                const currentInfo = currentStandings.get(username);
                if (!currentInfo || currentInfo.rank > 5) {
                    const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                    if (discordId) {
                        console.log(`User ${username} fell out of top 5 from rank ${prevInfo.rank}`);
                        rankChangeAlerts.push({
                            type: 'fell_out_top5',
                            username: username,
                            prevRank: prevInfo.rank,
                            newRank: currentInfo?.rank || 999,
                            globalRank: currentInfo?.apiRank || 999,
                            boardName: board.gameTitle,
                            boardId: board.boardId,
                            leaderboardId: board.leaderboardId,
                            gameId: board.gameId
                        });
                    }
                }
            }
            
            alerts.push(...rankChangeAlerts);
            
            console.log(`Board ${board.gameTitle}: ${rankChangeAlerts.length} rank changes detected`);
            
            if (rankChangeAlerts.length > 0) {
                this.lastAlertTime.set(board.boardId, Date.now());
            }
            
        } catch (error) {
            console.error(`Error detecting changes for board ${board.gameTitle}:`, error);
        }
    }

    async getArcadeBoardStandings(board, registeredUsers) {
        try {
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(board.leaderboardId, 1000);
            
            if (!rawEntries || rawEntries.length === 0) {
                console.warn(`No raw entries returned for board ${board.gameTitle}`);
                return new Map();
            }
            
            console.log(`Retrieved ${rawEntries.length} raw entries for ${board.gameTitle}`);
            
            const leaderboardEntries = rawEntries.map(entry => {
                return {
                    apiRank: entry.Rank || 0,
                    username: entry.User || '',
                    score: entry.FormattedScore || entry.Score?.toString() || '0'
                };
            });
            
            const filteredEntries = leaderboardEntries.filter(entry => {
                if (!entry.username) return false;
                const username = entry.username.toLowerCase().trim();
                return username && registeredUsers.has(username);
            });
            
            console.log(`Filtered to ${filteredEntries.length} registered users for ${board.gameTitle}`);
            
            filteredEntries.sort((a, b) => a.apiRank - b.apiRank);
            
            const standings = new Map();
            filteredEntries.forEach((entry, index) => {
                const communityRank = index + 1;
                standings.set(entry.username, {
                    rank: communityRank,
                    score: entry.score,
                    apiRank: entry.apiRank
                });
            });
            
            console.log(`Final standings for ${board.gameTitle}:`, Array.from(standings.entries()).slice(0, 5));
            
            return standings;
        } catch (error) {
            console.error(`Error fetching standings for arcade board ${board.gameTitle}:`, error);
            return new Map();
        }
    }

    // COMPLETELY SIMPLIFIED: Use centralized AlertService
    async sendCentralizedAlerts(alerts) {
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
            await this.sendBoardAlert(boardAlertsList);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // ULTRA SIMPLIFIED: Single method call to AlertService
    async sendBoardAlert(boardAlertsList) {
        try {
            const firstAlert = boardAlertsList[0];
            
            // Get game info for thumbnail
            let thumbnailUrl = null;
            try {
                const gameInfo = await RetroAPIUtils.getGameInfo(firstAlert.gameId);
                if (gameInfo?.imageIcon) {
                    thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                }
            } catch (error) {
                console.error('Error fetching game info for embed thumbnail:', error);
            }
            
            // Prepare position changes
            const changes = boardAlertsList
                .filter(alert => alert.type === 'entered_top5' || alert.type === 'rank_improved')
                .map(alert => ({
                    username: alert.username,
                    newRank: alert.newRank,
                    type: alert.type === 'entered_top5' ? 'newEntry' : 'overtake'
                }));
            
            // Get current standings
            const currentStandings = [];
            const registeredUsers = await this.getRegisteredUsersMap();
            const board = await ArcadeBoard.findOne({ boardId: firstAlert.boardId });
            
            if (board) {
                const standings = await this.getArcadeBoardStandings(board, registeredUsers);
                if (standings && standings.size > 0) {
                    const standingsArray = Array.from(standings.entries())
                        .map(([username, data]) => ({
                            username,
                            rank: data.rank,
                            score: data.score,
                            globalRank: data.apiRank
                        }))
                        .sort((a, b) => a.rank - b.rank)
                        .filter(entry => entry.rank <= 5);
                    
                    currentStandings.push(...standingsArray);
                }
            }
            
            // SINGLE LINE: Send alert using centralized service
            await AlertService.sendArcadeRankAlert({
                gameTitle: firstAlert.boardName,
                gameId: firstAlert.gameId,
                leaderboardTitle: firstAlert.boardName,
                leaderboardId: firstAlert.leaderboardId,
                changes: changes,
                currentStandings: currentStandings,
                thumbnail: thumbnailUrl,
                footer: { text: 'Data provided by RetroAchievements • Rankings update hourly' }
            });
            
        } catch (error) {
            console.error('Error sending board alert:', error);
        }
    }
}

// Create singleton instance
const arcadeAlertService = new ArcadeAlertService();
export default arcadeAlertService;
