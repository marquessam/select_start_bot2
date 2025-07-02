// src/services/arenaAlertService.js - SIMPLIFIED with alert logic removed
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { User } from '../models/User.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import arenaUtils from '../utils/arenaUtils.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertService from '../utils/AlertService.js';

class ArenaAlertService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arenaChannelId || '1373570850912997476');
        this.previousChallengeStates = new Map();
        this.processedChallenges = new Set();
    }

    setClient(client) {
        super.setClient(client);
        AlertService.setClient(client);
        console.log('AlertService configured for arena alerts via setClient');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for arena alert service');
            return;
        }

        try {
            console.log('Starting arena alert service...');
            AlertService.setClient(this.client);
            console.log('AlertService configured for arena alerts');
            
            // Initial check (without alerts, just to build baseline states)
            await this.checkForArenaChanges(false);
            
            // Call the parent start method with our custom interval
            await super.start(15 * 60 * 1000); // Check every 15 minutes
        } catch (error) {
            console.error('Error starting arena alert service:', error);
        }
    }

    // Override the update method from base class
    async update() {
        await this.checkForArenaChanges(true);
    }

    async checkForArenaChanges(sendAlerts = true) {
        try {
            console.log(`Checking for arena changes (sendAlerts=${sendAlerts})...`);
            
            const activeChallenges = await ArenaChallenge.find({
                status: { $in: ['pending', 'active'] }
            });
            
            console.log(`Found ${activeChallenges.length} active arena challenges to monitor`);
            
            const alerts = [];
            
            // Process each challenge
            for (const challenge of activeChallenges) {
                try {
                    // Check for participant changes and rank updates (only for active challenges)
                    if (challenge.status === 'active') {
                        await this.checkChallengeRankChanges(challenge, alerts, sendAlerts);
                    }
                    
                } catch (challengeError) {
                    console.error(`Error processing arena challenge ${challenge.challengeId}:`, challengeError);
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // SIMPLIFIED: Send alerts using centralized AlertService
            if (sendAlerts && alerts.length > 0) {
                console.log(`Found ${alerts.length} arena ranking changes to notify`);
                await this.sendCentralizedAlerts(alerts);
            } else if (sendAlerts) {
                console.log('No arena rank changes detected');
            } else {
                console.log('Baseline arena states established');
            }
            
        } catch (error) {
            console.error('Error checking arena changes:', error);
        }
    }

    async checkChallengeRankChanges(challenge, alerts, sendAlerts) {
        try {
            // Get current leaderboard scores for participants using FIXED API
            const participantUsernames = challenge.participants.map(p => p.raUsername);
            const currentScores = await this.fetchLeaderboardScoresFixed(
                challenge.gameId,
                challenge.leaderboardId,
                participantUsernames
            );
            
            if (!currentScores || currentScores.length === 0) {
                return; // No scores available
            }
            
            // Sort by rank (lower is better, null ranks go to end)
            currentScores.sort((a, b) => {
                if (a.rank === null && b.rank === null) return 0;
                if (a.rank === null) return 1;
                if (b.rank === null) return -1;
                return a.rank - b.rank;
            });
            
            const challengeKey = challenge.challengeId;
            const previousScores = this.previousChallengeStates.get(challengeKey);
            
            if (sendAlerts && previousScores) {
                // Check for rank changes
                await this.detectChallengeRankChanges(challenge, currentScores, previousScores, alerts);
            }
            
            // Update stored state
            this.previousChallengeStates.set(challengeKey, currentScores);
            
        } catch (error) {
            console.error(`Error checking rank changes for challenge ${challenge.challengeId}:`, error);
        }
    }

    async fetchLeaderboardScoresFixed(gameId, leaderboardId, raUsernames) {
        try {
            console.log(`Fetching leaderboard scores for game ${gameId}, leaderboard ${leaderboardId}`);

            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(leaderboardId, 1000);
            
            if (!rawEntries || rawEntries.length === 0) {
                console.log('No leaderboard data received');
                return [];
            }

            console.log(`Processed ${rawEntries.length} leaderboard entries`);

            const userScores = [];
            
            for (const username of raUsernames) {
                const entry = rawEntries.find(entry => {
                    return entry.User && entry.User.toLowerCase() === username.toLowerCase();
                });

                if (entry) {
                    userScores.push({
                        raUsername: username,
                        rank: entry.Rank,
                        score: entry.FormattedScore || entry.Score?.toString() || 'No score',
                        fetchedAt: new Date()
                    });
                } else {
                    userScores.push({
                        raUsername: username,
                        rank: null,
                        score: 'No score',
                        fetchedAt: new Date()
                    });
                }
            }

            return userScores;
        } catch (error) {
            console.error('Error fetching leaderboard scores:', error);
            return [];
        }
    }

    async detectChallengeRankChanges(challenge, currentScores, previousScores, alerts) {
        try {
            // Create lookup maps for easier comparison
            const prevRankMap = new Map();
            previousScores.forEach(score => {
                prevRankMap.set(score.raUsername.toLowerCase(), score.rank);
            });
            
            const currentRankMap = new Map();
            currentScores.forEach(score => {
                currentRankMap.set(score.raUsername.toLowerCase(), score.rank);
            });
            
            // Check for rank improvements
            for (const currentScore of currentScores) {
                const username = currentScore.raUsername.toLowerCase();
                const prevRank = prevRankMap.get(username);
                const currentRank = currentScore.rank;
                
                // Skip if no valid ranks to compare
                if (currentRank === null || prevRank === null) continue;
                
                // Check for rank improvement (lower rank number is better)
                if (prevRank > currentRank) {
                    alerts.push({
                        type: 'rank_improved',
                        challengeId: challenge.challengeId,
                        challengeTitle: `${challenge.gameTitle} - ${challenge.leaderboardTitle}`,
                        username: currentScore.raUsername,
                        prevRank: prevRank,
                        newRank: currentRank,
                        score: currentScore.score,
                        description: challenge.description,
                        leaderboardId: challenge.leaderboardId,
                        gameId: challenge.gameId
                    });
                }
            }
            
            console.log(`Challenge ${challenge.challengeId}: ${alerts.filter(a => a.challengeId === challenge.challengeId).length} rank changes detected`);
            
        } catch (error) {
            console.error(`Error detecting rank changes for challenge ${challenge.challengeId}:`, error);
        }
    }

    // SIMPLIFIED: Use centralized AlertService
    async sendCentralizedAlerts(alerts) {
        if (!alerts || alerts.length === 0) {
            console.log('No arena rank change alerts to send');
            return;
        }

        // Group alerts by challenge
        const challengeAlerts = new Map();
        
        for (const alert of alerts) {
            if (!challengeAlerts.has(alert.challengeId)) {
                challengeAlerts.set(alert.challengeId, []);
            }
            challengeAlerts.get(alert.challengeId).push(alert);
        }
        
        // Process each challenge's alerts
        for (const [challengeId, challengeAlertsList] of challengeAlerts.entries()) {
            await this.sendChallengeAlert(challengeAlertsList);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // ULTRA SIMPLIFIED: Single method call to AlertService
    async sendChallengeAlert(challengeAlertsList) {
        try {
            const firstAlert = challengeAlertsList[0];
            
            // Get challenge details
            const challenge = await ArenaChallenge.findOne({ challengeId: firstAlert.challengeId });
            if (!challenge) {
                console.warn(`Challenge not found for challengeId ${firstAlert.challengeId}`);
                return;
            }
            
            // Get game info for thumbnail
            let thumbnailUrl = null;
            try {
                const gameInfo = await arenaUtils.getGameInfo(challenge.gameId);
                if (gameInfo?.imageIcon) {
                    thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                }
            } catch (error) {
                console.error('Error fetching game info for rank change alert:', error);
            }
            
            // Prepare position changes
            const changes = challengeAlertsList
                .filter(alert => alert.type === 'rank_improved')
                .map(alert => ({
                    username: alert.username,
                    newRank: alert.newRank,
                    type: 'overtake'
                }));
            
            // Get current standings
            const currentStandings = [];
            try {
                const participantUsernames = challenge.participants.map(p => p.raUsername);
                const scores = await this.fetchLeaderboardScoresFixed(
                    challenge.gameId,
                    challenge.leaderboardId,
                    participantUsernames
                );
                
                if (scores && scores.length > 0) {
                    const sortedScores = scores
                        .filter(s => s.rank !== null)
                        .sort((a, b) => a.rank - b.rank);
                    
                    sortedScores.forEach((score, index) => {
                        const standing = index + 1;
                        const creatorIndicator = score.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                        
                        currentStandings.push({
                            username: score.raUsername,
                            rank: standing,
                            score: `${score.score} (Global: #${score.rank})`,
                            globalRank: score.rank
                        });
                    });
                }
            } catch (error) {
                console.error('Error fetching current standings for alert:', error);
            }
            
            // SINGLE LINE: Send alert using centralized service
            await AlertService.sendArenaRankAlert({
                gameTitle: challenge.gameTitle,
                gameId: challenge.gameId,
                leaderboardTitle: challenge.leaderboardTitle,
                leaderboardId: challenge.leaderboardId,
                changes: changes,
                currentStandings: currentStandings,
                thumbnail: thumbnailUrl,
                challengeId: challenge.challengeId,
                description: challenge.description,
                footer: { 
                    text: `Challenge ID: ${challenge.challengeId} • Data from RetroAchievements.org` 
                }
            });
            
        } catch (error) {
            console.error('Error sending challenge alert:', error);
        }
    }
}

// Create singleton instance
const arenaAlertService = new ArenaAlertService();
export default arenaAlertService;
