// src/services/arenaAlertService.js
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { User } from '../models/User.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS } from '../utils/FeedUtils.js';
import arenaUtils from '../utils/arenaUtils.js';
import AlertUtils, { ALERT_TYPES } from '../utils/AlertUtils.js';

class ArenaAlertService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.arenaChannelId || '1373570850912997476');
        // Store previous challenge states for comparison
        this.previousChallengeStates = new Map();
        this.processedChallenges = new Set(); // Track new challenges we've already alerted about
    }

    setClient(client) {
        super.setClient(client);
        // Set the client for AlertUtils when the service gets its client
        AlertUtils.setClient(client);
        console.log('AlertUtils client configured for arena alerts via setClient');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for arena alert service');
            return;
        }

        try {
            console.log('Starting arena alert service...');
            
            // Set the Discord client for AlertUtils
            AlertUtils.setClient(this.client);
            console.log('AlertUtils client configured for arena alerts');
            
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
            
            const alertsChannel = sendAlerts ? await this.getChannel() : null;
            if (sendAlerts && !alertsChannel) {
                console.error('Arena alerts channel not found or inaccessible');
                return;
            }

            // Get all active challenges
            const activeChallenges = await ArenaChallenge.find({
                status: { $in: ['pending', 'active'] }
            });
            
            console.log(`Found ${activeChallenges.length} active arena challenges to monitor`);
            
            const alerts = [];
            
            // Process each challenge
            for (const challenge of activeChallenges) {
                try {
                    // Check for new challenges
                    if (sendAlerts && !this.processedChallenges.has(challenge.challengeId)) {
                        await this.handleNewChallenge(challenge);
                        this.processedChallenges.add(challenge.challengeId);
                    }
                    
                    // Check for participant changes and rank updates
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
                await this.sendRankChangeAlerts(alertsChannel, alerts);
            } else if (sendAlerts) {
                console.log('No arena rank changes detected');
            } else {
                console.log('Baseline arena states established');
            }
            
        } catch (error) {
            console.error('Error checking arena changes:', error);
        }
    }

    async handleNewChallenge(challenge) {
        try {
            console.log(`New arena challenge detected: ${challenge.challengeId}`);
            
            // Get game info for thumbnail
            let thumbnailUrl = null;
            try {
                const gameInfo = await arenaUtils.getGameInfo(challenge.gameId);
                if (gameInfo?.imageIcon) {
                    thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                }
            } catch (error) {
                console.error('Error fetching game info for new challenge alert:', error);
            }
            
            // Determine alert title and description based on challenge type
            let title, description;
            if (challenge.type === 'direct') {
                title = '⚔️ New Direct Challenge!';
                description = `**${challenge.creatorRaUsername}** has challenged **${challenge.targetRaUsername}** to a duel!\n\n` +
                             `**Game:** ${challenge.gameTitle}\n` +
                             `**Leaderboard:** ${challenge.leaderboardTitle}\n` +
                             `**Description:** ${challenge.description || 'No description provided'}\n` +
                             `**Wager:** ${challenge.participants[0]?.wager || 0} GP each\n\n` +
                             `The challenge expires in 24 hours if not accepted!`;
            } else {
                title = '🌍 New Open Challenge!';
                description = `**${challenge.creatorRaUsername}** has created an open challenge for everyone!\n\n` +
                             `**Game:** ${challenge.gameTitle}\n` +
                             `**Leaderboard:** ${challenge.leaderboardTitle}\n` +
                             `**Description:** ${challenge.description || 'No description provided'}\n` +
                             `**Wager:** ${challenge.participants[0]?.wager || 0} GP to join\n\n` +
                             `Anyone can join this challenge!`;
            }
            
            // Send the new challenge alert using AlertUtils
            await AlertUtils.sendPositionChangeAlert({
                title: title,
                description: description,
                thumbnail: thumbnailUrl,
                footer: { 
                    text: `Challenge ID: ${challenge.challengeId} • Use /arena to participate` 
                }
            }, ALERT_TYPES.ARENA);
            
        } catch (error) {
            console.error(`Error sending new challenge alert for ${challenge.challengeId}:`, error);
        }
    }

    async checkChallengeRankChanges(challenge, alerts, sendAlerts) {
        try {
            // Get current leaderboard scores for participants
            const participantUsernames = challenge.participants.map(p => p.raUsername);
            const currentScores = await arenaUtils.fetchLeaderboardScores(
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
                
                // Check for new participants (someone joined an open challenge)
                const previousParticipants = new Set(previousScores.map(s => s.raUsername.toLowerCase()));
                const currentParticipants = new Set(currentScores.map(s => s.raUsername.toLowerCase()));
                
                for (const currentUser of currentParticipants) {
                    if (!previousParticipants.has(currentUser)) {
                        // New participant joined!
                        const userScore = currentScores.find(s => s.raUsername.toLowerCase() === currentUser);
                        if (userScore) {
                            await this.handleNewParticipant(challenge, userScore.raUsername);
                        }
                    }
                }
            }
            
            // Update stored state
            this.previousChallengeStates.set(challengeKey, currentScores);
            
        } catch (error) {
            console.error(`Error checking rank changes for challenge ${challenge.challengeId}:`, error);
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
            
            // Check for rank improvements or new leaders
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
                        description: challenge.description
                    });
                }
            }
            
            console.log(`Challenge ${challenge.challengeId}: ${alerts.length} rank changes detected`);
            
        } catch (error) {
            console.error(`Error detecting rank changes for challenge ${challenge.challengeId}:`, error);
        }
    }

    async handleNewParticipant(challenge, username) {
        try {
            console.log(`New participant joined challenge ${challenge.challengeId}: ${username}`);
            
            // Get game info for thumbnail
            let thumbnailUrl = null;
            try {
                const gameInfo = await arenaUtils.getGameInfo(challenge.gameId);
                if (gameInfo?.imageIcon) {
                    thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                }
            } catch (error) {
                console.error('Error fetching game info for new participant alert:', error);
            }
            
            const title = '👥 New Challenger Approaches!';
            const description = `**${username}** has joined the arena challenge!\n\n` +
                               `**Challenge:** ${challenge.gameTitle}\n` +
                               `**Description:** ${challenge.description || 'No description provided'}\n` +
                               `**Total Participants:** ${challenge.participants.length}\n` +
                               `**Total Prize Pool:** ${challenge.getTotalWager()} GP\n\n` +
                               `The competition heats up! 🔥`;
            
            // Send the new participant alert
            await AlertUtils.sendPositionChangeAlert({
                title: title,
                description: description,
                thumbnail: thumbnailUrl,
                footer: { 
                    text: `Challenge ID: ${challenge.challengeId} • Battle duration: 7 days` 
                }
            }, ALERT_TYPES.ARENA);
            
        } catch (error) {
            console.error(`Error sending new participant alert for ${challenge.challengeId}:`, error);
        }
    }

    async sendRankChangeAlerts(alertsChannel, alerts) {
        if (!alertsChannel) {
            console.log('No alerts channel configured, skipping arena rank change notifications');
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

    async sendChallengeRankChangeAlerts(challengeAlertsList) {
        try {
            const firstAlert = challengeAlertsList[0];
            const challengeTitle = firstAlert.challengeTitle;
            
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
            
            // Get current standings for the challenge
            const currentStandings = [];
            try {
                const participantUsernames = challenge.participants.map(p => p.raUsername);
                const scores = await arenaUtils.fetchLeaderboardScores(
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
                        currentStandings.push({
                            username: score.raUsername,
                            rank: index + 1, // Community rank (1-based)
                            score: score.score,
                            globalRank: score.rank // Global RetroAchievements rank
                        });
                    });
                }
            } catch (error) {
                console.error('Error fetching current standings for alert:', error);
            }
            
            // Use AlertUtils for rank changes with the ARENA alert type
            await AlertUtils.sendPositionChangeAlert({
                title: '🏟️ Arena Alert!',
                description: `The leaderboard for **${challengeTitle}** has been updated!\n\n` +
                            `**Description:** ${challenge.description || 'No description provided'}\n` +
                            `**Prize Pool:** ${challenge.getTotalWager()} GP`,
                changes: changes,
                currentStandings: currentStandings,
                thumbnail: thumbnailUrl,
                footer: { 
                    text: `Challenge ID: ${challenge.challengeId} • Data from RetroAchievements.org` 
                }
            }, ALERT_TYPES.ARENA);
            
        } catch (error) {
            console.error('Error sending challenge rank change alerts:', error);
        }
    }
}

// Create singleton instance
const arenaAlertService = new ArenaAlertService();
export default arenaAlertService;
