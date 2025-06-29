// src/services/arenaAlertService.js - UPDATED with centralized AlertService
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { User } from '../models/User.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import arenaUtils from '../utils/arenaUtils.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertService from '../utils/AlertService.js'; // NEW: Use centralized service

class ArenaAlertService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arenaChannelId || '1373570850912997476');
        // Store previous challenge states for comparison
        this.previousChallengeStates = new Map();
        this.processedChallenges = new Set(); // Track new challenges we've already alerted about
    }

    setClient(client) {
        super.setClient(client);
        // NEW: Set the client for AlertService when the service gets its client
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
            
            // Set the Discord client for AlertService
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
            
            // Get all active challenges
            const activeChallenges = await ArenaChallenge.find({
                status: { $in: ['pending', 'active'] }
            });
            
            console.log(`Found ${activeChallenges.length} active arena challenges to monitor`);
            
            const alerts = [];
            
            // Process each challenge
            for (const challenge of activeChallenges) {
                try {
                    // NOTE: We DON'T check for new challenges here since immediate alerts
                    // are sent directly from arenaService.js when challenges are created
                    
                    // Check for participant changes and rank updates (only for active challenges)
                    if (challenge.status === 'active') {
                        await this.checkChallengeRankChanges(challenge, alerts, sendAlerts);
                    }
                    
                } catch (challengeError) {
                    console.error(`Error processing arena challenge ${challenge.challengeId}:`, challengeError);
                    // Continue with next challenge
                }
                
                // Add a small delay between challenges to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Send rank change alerts if any were found
            if (sendAlerts && alerts.length > 0) {
                console.log(`Found ${alerts.length} arena ranking changes to notify`);
                await this.sendRankChangeAlerts(alerts);
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

    /**
     * Use reliable API utilities like arcade system
     */
    async fetchLeaderboardScoresFixed(gameId, leaderboardId, raUsernames) {
        try {
            console.log(`Fetching leaderboard scores for game ${gameId}, leaderboard ${leaderboardId}`);

            // Use the same reliable API utilities as arcade system
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(leaderboardId, 1000);
            
            if (!rawEntries || rawEntries.length === 0) {
                console.log('No leaderboard data received');
                return [];
            }

            console.log(`Processed ${rawEntries.length} leaderboard entries`);

            // Find entries for our target users
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
                        leaderboardId: challenge.leaderboardId, // For creating links
                        gameId: challenge.gameId // For creating links
                    });
                }
            }
            
            console.log(`Challenge ${challenge.challengeId}: ${alerts.filter(a => a.challengeId === challenge.challengeId).length} rank changes detected`);
            
        } catch (error) {
            console.error(`Error detecting rank changes for challenge ${challenge.challengeId}:`, error);
        }
    }

    async sendRankChangeAlerts(alerts) {
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
            await this.sendChallengeRankChangeAlerts(challengeAlertsList);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // MASSIVELY SIMPLIFIED: Send challenge rank change alerts using AlertService
    async sendChallengeRankChangeAlerts(challengeAlertsList) {
        try {
            const firstAlert = challengeAlertsList[0];
            const challengeTitle = firstAlert.challengeTitle;
            const leaderboardId = firstAlert.leaderboardId;
            
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
            
            // Prepare the position changes
            const changes = [];
            
            // Process alerts to create change notifications
            for (const alert of challengeAlertsList) {
                if (alert.type === 'rank_improved') {
                    changes.push({
                        username: alert.username,
                        newRank: alert.newRank
                    });
                }
            }
            
            // Get current standings for the challenge using FIXED API
            const currentStandings = [];
            try {
                const participantUsernames = challenge.participants.map(p => p.raUsername);
                const scores = await this.fetchLeaderboardScoresFixed(
                    challenge.gameId,
                    challenge.leaderboardId,
                    participantUsernames
                );
                
                if (scores && scores.length > 0) {
                    // Sort by rank and convert to standings format
                    const sortedScores = scores
                        .filter(s => s.rank !== null)
                        .sort((a, b) => a.rank - b.rank);
                    
                    sortedScores.forEach((score, index) => {
                        const standing = index + 1;
                        // Crown only for #1, gear for creator
                        const positionEmoji = standing === 1 ? '👑' : `${standing}.`;
                        const creatorIndicator = score.raUsername === challenge.creatorRaUsername ? ' ⚙️' : '';
                        
                        currentStandings.push({
                            username: score.raUsername,
                            rank: standing, // Community rank (1-based)
                            score: `${score.score} (Global: #${score.rank})`, // Include global rank in score
                            globalRank: score.rank, // Global RetroAchievements rank
                            displayText: `${positionEmoji} ${score.raUsername}${creatorIndicator}`
                        });
                    });
                }
            } catch (error) {
                console.error('Error fetching current standings for alert:', error);
            }
            
            // SIMPLIFIED: Single method call with all link generation handled automatically
            await AlertService.sendArenaRankAlert({
                title: '🏟️ Arena Alert!',
                description: `The leaderboard has been updated!`,
                changes: changes,
                currentStandings: currentStandings,
                gameTitle: challenge.gameTitle,        // AlertService creates game link
                gameId: challenge.gameId,              // AlertService creates game link
                leaderboardTitle: challenge.leaderboardTitle, // AlertService creates leaderboard link
                leaderboardId: challenge.leaderboardId, // AlertService creates leaderboard link
                thumbnail: thumbnailUrl,
                footer: { 
                    text: `Challenge ID: ${challenge.challengeId} • Data from RetroAchievements.org` 
                }
            });
            
        } catch (error) {
            console.error('Error sending challenge rank change alerts:', error);
        }
    }
}

// Create singleton instance
const arenaAlertService = new ArenaAlertService();
export default arenaAlertService;
