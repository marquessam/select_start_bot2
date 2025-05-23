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
                    
                    // Get the current standings for this board using our utility
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
                        
                        // ENHANCED: Check for rank changes AND score improvements
                        await this.detectChanges(board, currentStandings, prevStandings, registeredUsers, alerts);
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
                console.log(`Found ${alerts.length} arcade ranking/score changes to notify`);
                await this.sendRankChangeAlerts(alertsChannel, alerts);
            } else if (sendAlerts) {
                console.log('No arcade rank/score changes detected');
            } else {
                console.log('Baseline standings established for all arcade boards');
            }
        } catch (error) {
            console.error('Error checking arcade rank changes:', error);
        }
    }

    // ENHANCED: Detect both rank changes and score improvements
    async detectChanges(board, currentStandings, prevStandings, registeredUsers, alerts) {
        try {
            // Track rank changes
            const rankChangeAlerts = [];
            const scoreImprovementAlerts = [];
            
            // Check for rank changes (existing logic)
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
                        rankChangeAlerts.push({
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
                        rankChangeAlerts.push({
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
                        rankChangeAlerts.push({
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
            
            // Check for users who newly entered the top 3
            for (const [username, currentInfo] of currentStandings.entries()) {
                // Only care about users currently in top 3
                if (currentInfo.rank > 3) continue;
                
                // Check if user wasn't in previous standings or was ranked lower
                const prevInfo = prevStandings[username];
                if (!prevInfo || prevInfo.rank > 3) {
                    const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                    if (discordId) {
                        rankChangeAlerts.push({
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
            
            // ENHANCED: Check for score improvements without rank changes (top 5)
            for (const [username, currentInfo] of currentStandings.entries()) {
                // Only check users in top 5 to keep alerts manageable
                if (currentInfo.rank > 5) continue;
                
                const prevInfo = prevStandings[username];
                if (prevInfo && currentInfo.rank === prevInfo.rank) {
                    // Same rank, check if score improved
                    const scoreImproved = this.hasScoreImproved(prevInfo.score, currentInfo.score, board);
                    
                    if (scoreImproved) {
                        const discordId = registeredUsers.get(username.toLowerCase())?.discordId;
                        if (discordId) {
                            scoreImprovementAlerts.push({
                                type: 'score_improved',
                                user: { username, discordId },
                                rank: currentInfo.rank,
                                prevScore: prevInfo.score,
                                newScore: currentInfo.score,
                                boardName: board.gameTitle,
                                boardId: board.boardId,
                                improvement: this.calculateImprovement(prevInfo.score, currentInfo.score, board)
                            });
                        }
                    }
                }
            }
            
            // Add all alerts to the main alerts array
            alerts.push(...rankChangeAlerts, ...scoreImprovementAlerts);
            
            console.log(`Board ${board.gameTitle}: ${rankChangeAlerts.length} rank changes, ${scoreImprovementAlerts.length} score improvements`);
            
        } catch (error) {
            console.error(`Error detecting changes for board ${board.gameTitle}:`, error);
        }
    }

    // ENHANCED: Improved score comparison logic
    hasScoreImproved(prevScore, currentScore, board) {
        try {
            // For most arcade games, higher scores are better
            const prevNumeric = this.parseScoreValue(prevScore);
            const currentNumeric = this.parseScoreValue(currentScore);
            
            // Check if both scores are valid numbers
            if (isNaN(prevNumeric) || isNaN(currentNumeric)) {
                console.log(`Invalid score comparison: "${prevScore}" vs "${currentScore}"`);
                return false;
            }
            
            // Skip if either score is 0 (likely uninitialized)
            if (prevNumeric === 0 || currentNumeric === 0) {
                return false;
            }
            
            // ENHANCED: Better detection of time-based games
            const isTimeBased = this.isTimeBasedGame(board, prevScore, currentScore);
            
            if (isTimeBased) {
                // For time-based games, lower is better
                const improved = currentNumeric < prevNumeric;
                console.log(`Time-based comparison for ${board.gameTitle}: ${prevScore} -> ${currentScore} (${improved ? 'IMPROVED' : 'no change'})`);
                return improved;
            } else {
                // For score-based games, higher is better
                const improved = currentNumeric > prevNumeric;
                console.log(`Score-based comparison for ${board.gameTitle}: ${prevScore} -> ${currentScore} (${improved ? 'IMPROVED' : 'no change'})`);
                return improved;
            }
        } catch (error) {
            console.error('Error comparing scores:', error);
            return false;
        }
    }

    // ENHANCED: Better detection of time-based games
    isTimeBasedGame(board, prevScore, currentScore) {
        // Check board title for time-related keywords
        const titleKeywords = ['time', 'fastest', 'quickest', 'speed', 'speedrun', 'quick', 'race', 'lap'];
        const title = board.gameTitle?.toLowerCase() || '';
        const description = board.description?.toLowerCase() || '';
        
        const hasTimeKeyword = titleKeywords.some(keyword => 
            title.includes(keyword) || description.includes(keyword)
        );
        
        // Check if scores look like time formats
        const hasTimeFormat = this.looksLikeTime(prevScore) || this.looksLikeTime(currentScore);
        
        return hasTimeKeyword || hasTimeFormat;
    }

    // Helper to detect time-like score formats
    looksLikeTime(scoreString) {
        if (!scoreString) return false;
        
        // Check for common time patterns
        const timePatterns = [
            /^\d+:\d+(\.\d+)?$/,        // MM:SS.ms or MM:SS
            /^\d+:\d+:\d+(\.\d+)?$/,    // HH:MM:SS.ms or HH:MM:SS
            /^\d+m\d+s/,                // 1m23s
            /^\d+'\d+"/,                // 1'23"
            /\d+\.\d+s$/,               // 123.45s
        ];
        
        return timePatterns.some(pattern => pattern.test(scoreString.toString()));
    }

    // ENHANCED: Better score parsing with more formats
    parseScoreValue(scoreString) {
        if (!scoreString || scoreString === 'No score yet' || scoreString === 'No entry') {
            return 0;
        }
        
        const scoreStr = scoreString.toString().trim();
        
        // Handle time formats
        if (this.looksLikeTime(scoreStr)) {
            return this.parseTimeToSeconds(scoreStr);
        }
        
        // Handle regular numbers with commas, dots, etc.
        const cleanedScore = scoreStr.replace(/[^\d.-]/g, '');
        const parsed = parseFloat(cleanedScore);
        
        return isNaN(parsed) ? 0 : parsed;
    }

    // ENHANCED: Comprehensive time parsing
    parseTimeToSeconds(timeString) {
        if (!timeString) return 0;
        
        const timeStr = timeString.toString().trim();
        
        // Pattern: HH:MM:SS.ms or MM:SS.ms
        if (timeStr.includes(':')) {
            const parts = timeStr.split(':');
            let totalSeconds = 0;
            
            if (parts.length === 2) { // MM:SS.ms
                const minutes = parseInt(parts[0]) || 0;
                const seconds = parseFloat(parts[1]) || 0;
                totalSeconds = minutes * 60 + seconds;
            } else if (parts.length === 3) { // HH:MM:SS.ms
                const hours = parseInt(parts[0]) || 0;
                const minutes = parseInt(parts[1]) || 0;
                const seconds = parseFloat(parts[2]) || 0;
                totalSeconds = hours * 3600 + minutes * 60 + seconds;
            }
            
            return totalSeconds;
        }
        
        // Pattern: 1m23s456ms
        const minutesMatch = timeStr.match(/(\d+)m/);
        const secondsMatch = timeStr.match(/(\d+)s/);
        const msMatch = timeStr.match(/(\d+)ms/);
        
        if (minutesMatch || secondsMatch) {
            const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
            const seconds = secondsMatch ? parseInt(secondsMatch[1]) : 0;
            const ms = msMatch ? parseInt(msMatch[1]) : 0;
            
            return minutes * 60 + seconds + ms / 1000;
        }
        
        // Pattern: 1'23"456
        const minutesQuoteMatch = timeStr.match(/(\d+)'/);
        const secondsQuoteMatch = timeStr.match(/(\d+)"/);
        
        if (minutesQuoteMatch || secondsQuoteMatch) {
            const minutes = minutesQuoteMatch ? parseInt(minutesQuoteMatch[1]) : 0;
            const seconds = secondsQuoteMatch ? parseInt(secondsQuoteMatch[1]) : 0;
            
            return minutes * 60 + seconds;
        }
        
        // Pattern: 123.45s
        const secondsOnlyMatch = timeStr.match(/(\d+(?:\.\d+)?)s$/);
        if (secondsOnlyMatch) {
            return parseFloat(secondsOnlyMatch[1]);
        }
        
        // Fallback: try to parse as a decimal number (seconds)
        const parsed = parseFloat(timeStr.replace(/[^\d.-]/g, ''));
        return isNaN(parsed) ? 0 : parsed;
    }

    // NEW: Calculate improvement percentage or difference
    calculateImprovement(prevScore, currentScore, board) {
        const prevNumeric = this.parseScoreValue(prevScore);
        const currentNumeric = this.parseScoreValue(currentScore);
        
        if (prevNumeric === 0 || currentNumeric === 0) return '';
        
        const isTimeBased = this.isTimeBasedGame(board, prevScore, currentScore);
        
        if (isTimeBased) {
            // For time-based, show time saved
            const timeSaved = prevNumeric - currentNumeric;
            if (timeSaved > 0) {
                if (timeSaved >= 60) {
                    const minutes = Math.floor(timeSaved / 60);
                    const seconds = (timeSaved % 60).toFixed(2);
                    return `(-${minutes}m ${seconds}s)`;
                } else {
                    return `(-${timeSaved.toFixed(2)}s)`;
                }
            }
        } else {
            // For score-based, show score increase
            const scoreIncrease = currentNumeric - prevNumeric;
            if (scoreIncrease > 0) {
                return `(+${scoreIncrease.toLocaleString()})`;
            }
        }
        
        return '';
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

    // ENHANCED: Send alerts with better organization
    async sendRankChangeAlerts(alertsChannel, alerts) {
        if (!alertsChannel) {
            console.log('No alerts channel configured, skipping arcade rank change notifications');
            return;
        }

        // Group alerts by type and board
        const rankChangeAlerts = alerts.filter(alert => alert.type !== 'score_improved');
        const scoreImprovementAlerts = alerts.filter(alert => alert.type === 'score_improved');

        // Send rank change alerts (existing logic)
        if (rankChangeAlerts.length > 0) {
            const boardAlerts = new Map();
            
            for (const alert of rankChangeAlerts) {
                if (!boardAlerts.has(alert.boardId)) {
                    boardAlerts.set(alert.boardId, []);
                }
                boardAlerts.get(alert.boardId).push(alert);
            }
            
            // Process each board's rank change alerts
            for (const [boardId, boardAlertsList] of boardAlerts.entries()) {
                await this.sendBoardRankChangeAlerts(boardAlertsList);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // ENHANCED: Send score improvement alerts
        if (scoreImprovementAlerts.length > 0) {
            console.log(`Sending ${scoreImprovementAlerts.length} score improvement alerts`);
            
            for (const alert of scoreImprovementAlerts) {
                await this.sendScoreImprovementAlert(alert);
                // Small delay between score improvement alerts
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
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
            
            // Use AlertUtils for rank changes with the ARCADE alert type
            await AlertUtils.sendPositionChangeAlert({
                title: '🕹️ Arcade Alert!',
                description: `The leaderboard for **${boardName}** has been updated!`,
                changes: changes,
                currentStandings: currentStandings,
                thumbnail: thumbnailUrl,
                color: COLORS.INFO,
                footer: { text: 'Data provided by RetroAchievements • Rankings update hourly' }
            }, ALERT_TYPES.ARCADE);
            
        } catch (error) {
            console.error('Error sending board rank change alerts:', error);
        }
    }

    // ENHANCED: Send individual score improvement alerts
    async sendScoreImprovementAlert(alert) {
        try {
            const { user, rank, prevScore, newScore, boardName, improvement } = alert;
            
            // Get board details for thumbnail
            const board = await ArcadeBoard.findOne({ boardId: alert.boardId });
            let thumbnailUrl = null;
            
            if (board) {
                try {
                    const gameInfo = await RetroAPIUtils.getGameInfo(board.gameId);
                    if (gameInfo?.imageIcon) {
                        thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                    }
                } catch (error) {
                    console.error('Error fetching game info for score improvement alert:', error);
                }
            }
            
            // Create a focused alert for score improvements
            const embed = {
                color: COLORS.WARNING, // Yellow for score improvements (different from rank changes)
                title: '🕹️ Arcade Score Improvement!',
                description: `**${user.username}** improved their score in **${boardName}**!`,
                fields: [
                    {
                        name: '📊 Score Update',
                        value: `**Previous:** ${prevScore}\n**New:** ${newScore} ${improvement}\n**Rank:** #${rank} (maintained)`,
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Score improvement detected • Updates hourly'
                }
            };
            
            if (thumbnailUrl) {
                embed.thumbnail = { url: thumbnailUrl };
            }
            
            // Send using AlertUtils with ARCADE type
            const alertsChannel = await AlertUtils.getAlertsChannel(ALERT_TYPES.ARCADE);
            if (alertsChannel) {
                await alertsChannel.send({ embeds: [embed] });
                console.log(`Sent score improvement alert for ${user.username} in ${boardName}`);
            }
        } catch (error) {
            console.error('Error sending score improvement alert:', error);
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
