// src/services/arenaService.js - FIXED: Use consistent API method for challenge completion
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { User } from '../models/User.js';
import { config } from '../config/config.js';
import arenaUtils from '../utils/arenaUtils.js';
import gpUtils from '../utils/gpUtils.js';
import alertService, { ALERT_TYPES } from '../utils/AlertService.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js'; // ADDED: Import RetroAPIUtils directly
import retroAPI from '../services/retroAPI.js';
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';

class ArenaService {
    constructor() {
        this.client = null;
        this.isProcessing = false;
        this.processingChallenges = new Set();
        this.lastProcessingTime = 0;
        this.processingDelay = 5000;
    }

    setClient(client) {
        this.client = client;
        alertService.setClient(client);
    }

    async start() {
        if (!this.client) {
            console.error('Arena service: Client not set');
            return;
        }
        console.log('Arena service started with rate limiting support');
    }

    generateChallengeId() {
        return `arena_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    async createChallenge(creatorUser, gameInfo, leaderboardInfo, wager, targetRaUsername = null, discordUsername = null, description = '') {
        try {
            console.log(`Creating challenge for user ${creatorUser.raUsername}...`);
            
            // Validate creator has enough GP
            if (!creatorUser.hasEnoughGp(wager)) {
                throw new Error(`Insufficient GP. You have ${creatorUser.gpBalance} GP but need ${wager} GP.`);
            }

            // VALIDATE LEADERBOARD BEFORE CREATING CHALLENGE
            const leaderboardId = leaderboardInfo.id || leaderboardInfo.ID;
            console.log(`Validating leaderboard ${leaderboardId} before creating challenge...`);
            
            const isValidLeaderboard = await retroAPI.validateLeaderboard(leaderboardId);
            if (!isValidLeaderboard) {
                throw new Error(`Leaderboard ${leaderboardId} is not accessible or does not exist. Please verify the leaderboard ID.`);
            }
            console.log(`Leaderboard ${leaderboardId} validation passed`);

            // Validate target user exists if specified (direct challenge)
            let targetUser = null;
            if (targetRaUsername) {
                targetUser = await User.findOne({ raUsername: targetRaUsername });
                if (!targetUser) {
                    throw new Error(`Target user "${targetRaUsername}" not found in the database.`);
                }
                if (targetUser.discordId === creatorUser.discordId) {
                    throw new Error(`You cannot challenge yourself.`);
                }
            }

            const challengeId = this.generateChallengeId();
            const type = targetRaUsername ? 'direct' : 'open';
            const now = new Date();
            
            // Create challenge with proper field mapping including description
            const challenge = new ArenaChallenge({
                challengeId,
                type,
                status: type === 'direct' ? 'pending' : 'active',
                gameId: gameInfo.id || gameInfo.ID,
                gameTitle: gameInfo.title || gameInfo.Title,
                leaderboardId: leaderboardInfo.id || leaderboardInfo.ID,
                leaderboardTitle: leaderboardInfo.title || leaderboardInfo.Title,
                description: description || '',
                creatorId: creatorUser.discordId,
                creatorUsername: discordUsername || creatorUser.username || 'Unknown',
                creatorRaUsername: creatorUser.raUsername,
                targetId: targetUser?.discordId || null,
                targetUsername: targetUser?.username || null,
                targetRaUsername: targetRaUsername || null,
                participants: [{
                    userId: creatorUser.discordId,
                    username: discordUsername || creatorUser.username || 'Unknown',
                    raUsername: creatorUser.raUsername,
                    wager,
                    joinedAt: now
                }],
                startedAt: type === 'open' ? now : null,
                endedAt: type === 'open' ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) : null,
                bettingClosedAt: type === 'open' ? new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) : null
            });

            await challenge.save();

            // Send immediate new challenge alert using new AlertService
            try {
                // Get game info for thumbnail
                let thumbnailUrl = null;
                try {
                    const gameInfo_alert = await arenaUtils.getGameInfo(challenge.gameId);
                    if (gameInfo_alert?.imageIcon) {
                        thumbnailUrl = `https://retroachievements.org${gameInfo_alert.imageIcon}`;
                    }
                } catch (error) {
                    console.error('Error fetching game info for new challenge alert:', error);
                }
                
                // Determine alert title and description based on challenge type
                let title, alertDescription;
                if (challenge.type === 'direct') {
                    title = '⚔️ New Direct Challenge!';
                    alertDescription = `**${creatorUser.raUsername}** has challenged **${targetRaUsername}** to a duel!\n\n` +
                                     `**Game:** ${challenge.gameTitle}\n` +
                                     `**Leaderboard:** ${challenge.leaderboardTitle}\n` +
                                     `**Description:** ${description || 'No description provided'}\n` +
                                     `**Wager:** ${wager} GP each\n\n` +
                                     `The challenge expires in 24 hours if not accepted!`;
                } else {
                    title = '🌍 New Open Challenge!';
                    alertDescription = `**${creatorUser.raUsername}** has created an open challenge for everyone!\n\n` +
                                     `**Game:** ${challenge.gameTitle}\n` +
                                     `**Leaderboard:** ${challenge.leaderboardTitle}\n` +
                                     `**Description:** ${description || 'No description provided'}\n` +
                                     `**Wager:** ${wager} GP to join\n\n` +
                                     `Anyone can join this challenge!`;
                }
                
                await alertService.sendNewArenaChallengeAlert({
                    title: title,
                    description: alertDescription,
                    gameTitle: challenge.gameTitle,
                    gameId: challenge.gameId,
                    leaderboardTitle: challenge.leaderboardTitle,
                    leaderboardId: challenge.leaderboardId,
                    thumbnail: thumbnailUrl,
                    footer: { 
                        text: `Challenge ID: ${challengeId} • Use /arena to participate` 
                    }
                });
                
            } catch (alertError) {
                console.error('Error sending immediate new challenge alert:', alertError);
            }

            // Deduct wager from creator
            await gpUtils.deductGP(creatorUser, wager, 'wager', `Wager for challenge ${challengeId}`, challengeId);
            
            // Update creator stats
            if (!creatorUser.arenaStats) creatorUser.arenaStats = {};
            creatorUser.arenaStats.challengesCreated = (creatorUser.arenaStats.challengesCreated || 0) + 1;
            creatorUser.arenaStats.totalGpWagered = (creatorUser.arenaStats.totalGpWagered || 0) + wager;
            await creatorUser.save();
            
            console.log(`Successfully created challenge ${challengeId}`);
            return challenge;
        } catch (error) {
            console.error('Error creating challenge:', error);
            throw error;
        }
    }

    async acceptChallenge(challengeId, acceptingUser) {
        try {
            const challenge = await ArenaChallenge.findOne({ challengeId, status: 'pending' });
            if (!challenge) {
                throw new Error('Challenge not found or no longer pending.');
            }

            // Verify user is the target
            if (challenge.targetId !== acceptingUser.discordId) {
                throw new Error('You are not the target of this challenge.');
            }

            // Get the wager amount from the creator's participation
            const creatorParticipation = challenge.participants[0];
            const wager = creatorParticipation.wager;

            // Validate accepting user has enough GP
            if (!acceptingUser.hasEnoughGp(wager)) {
                throw new Error(`Insufficient GP. You have ${acceptingUser.gpBalance} GP but need ${wager} GP.`);
            }

            const now = new Date();

            // Add accepting user as participant
            challenge.participants.push({
                userId: acceptingUser.discordId,
                username: acceptingUser.username,
                raUsername: acceptingUser.raUsername,
                wager,
                joinedAt: now
            });

            // Update challenge status and timing
            challenge.status = 'active';
            challenge.startedAt = now;
            challenge.endedAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            challenge.bettingClosedAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

            await challenge.save();

            // Send immediate challenge accepted alert using new AlertService
            try {
                // Get game info for thumbnail
                let thumbnailUrl = null;
                try {
                    const gameInfo = await arenaUtils.getGameInfo(challenge.gameId);
                    if (gameInfo?.imageIcon) {
                        thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                    }
                } catch (error) {
                    console.error('Error fetching game info for challenge accepted alert:', error);
                }
                
                const title = '⚔️ Challenge Accepted!';
                const alertDescription = `**${acceptingUser.raUsername}** has accepted the challenge from **${challenge.creatorRaUsername}**!\n\n` +
                                       `**Game:** ${challenge.gameTitle}\n` +
                                       `**Description:** ${challenge.description || 'No description provided'}\n` +
                                       `**Wager:** ${wager} GP each\n` +
                                       `**Total Prize Pool:** ${challenge.getTotalWager()} GP\n\n` +
                                       `Let the battle begin! The challenge runs for 7 days. 🔥`;
                
                await alertService.sendAnnouncementAlert({
                    alertType: ALERT_TYPES.NEW_ARENA_CHALLENGE,
                    title: title,
                    description: alertDescription,
                    gameTitle: challenge.gameTitle,
                    gameId: challenge.gameId,
                    leaderboardTitle: challenge.leaderboardTitle,
                    leaderboardId: challenge.leaderboardId,
                    thumbnail: thumbnailUrl,
                    footer: { 
                        text: `Challenge ID: ${challengeId} • Battle duration: 7 days` 
                    }
                });
                
            } catch (alertError) {
                console.error('Error sending challenge accepted alert:', alertError);
            }

            // Deduct wager from accepting user
            await gpUtils.deductGP(acceptingUser, wager, 'wager', `Wager for challenge ${challengeId}`, challengeId);

            // Update accepting user stats
            if (!acceptingUser.arenaStats) acceptingUser.arenaStats = {};
            acceptingUser.arenaStats.challengesParticipated = (acceptingUser.arenaStats.challengesParticipated || 0) + 1;
            acceptingUser.arenaStats.totalGpWagered = (acceptingUser.arenaStats.totalGpWagered || 0) + wager;
            await acceptingUser.save();

            // Update creator stats
            const creatorUser = await User.findOne({ discordId: challenge.creatorId });
            if (creatorUser) {
                if (!creatorUser.arenaStats) creatorUser.arenaStats = {};
                creatorUser.arenaStats.challengesParticipated = (creatorUser.arenaStats.challengesParticipated || 0) + 1;
                await creatorUser.save();
            }

            return challenge;
        } catch (error) {
            console.error('Error accepting challenge:', error);
            throw error;
        }
    }

    async joinChallenge(challengeId, joiningUser) {
        try {
            const challenge = await ArenaChallenge.findOne({ challengeId, status: 'active', type: 'open' });
            if (!challenge) {
                throw new Error('Challenge not found or not joinable.');
            }

            // Check if user is already a participant
            if (challenge.isParticipant(joiningUser.discordId)) {
                throw new Error('You are already participating in this challenge.');
            }

            // Get the wager amount from existing participants
            const wager = challenge.participants[0].wager;

            // Validate joining user has enough GP
            if (!joiningUser.hasEnoughGp(wager)) {
                throw new Error(`Insufficient GP. You have ${joiningUser.gpBalance} GP but need ${wager} GP.`);
            }

            // Add user as participant
            challenge.participants.push({
                userId: joiningUser.discordId,
                username: joiningUser.username,
                raUsername: joiningUser.raUsername,
                wager,
                joinedAt: new Date()
            });

            await challenge.save();

            // Send immediate new participant alert using new AlertService
            try {
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
                const alertDescription = `**${joiningUser.raUsername}** has joined the arena challenge!\n\n` +
                                       `**Challenge:** ${challenge.gameTitle}\n` +
                                       `**Description:** ${challenge.description || 'No description provided'}\n` +
                                       `**Total Participants:** ${challenge.participants.length}\n` +
                                       `**Total Prize Pool:** ${challenge.getTotalWager()} GP\n\n` +
                                       `The competition heats up! 🔥`;
                
                await alertService.sendAnnouncementAlert({
                    alertType: ALERT_TYPES.NEW_ARENA_CHALLENGE,
                    title: title,
                    description: alertDescription,
                    gameTitle: challenge.gameTitle,
                    gameId: challenge.gameId,
                    leaderboardTitle: challenge.leaderboardTitle,
                    leaderboardId: challenge.leaderboardId,
                    thumbnail: thumbnailUrl,
                    footer: { 
                        text: `Challenge ID: ${challengeId} • Battle duration: 7 days` 
                    }
                });
                
            } catch (alertError) {
                console.error('Error sending new participant alert:', alertError);
            }

            // Deduct wager from joining user
            await gpUtils.deductGP(joiningUser, wager, 'wager', `Wager for challenge ${challengeId}`, challengeId);

            // Update joining user stats
            if (!joiningUser.arenaStats) joiningUser.arenaStats = {};
            joiningUser.arenaStats.challengesParticipated = (joiningUser.arenaStats.challengesParticipated || 0) + 1;
            joiningUser.arenaStats.totalGpWagered = (joiningUser.arenaStats.totalGpWagered || 0) + wager;
            await joiningUser.save();

            return challenge;
        } catch (error) {
            console.error('Error joining challenge:', error);
            throw error;
        }
    }

    async placeBet(challengeId, bettingUser, targetRaUsername, amount) {
        try {
            const challenge = await ArenaChallenge.findOne({ challengeId, status: 'active' });
            if (!challenge) {
                throw new Error('Challenge not found or not active.');
            }

            // Check if betting is still open
            if (!challenge.canBet()) {
                throw new Error('Betting is closed for this challenge.');
            }

            // Check if user is a participant
            if (challenge.isParticipant(bettingUser.discordId)) {
                throw new Error('Participants cannot bet on their own challenge.');
            }

            // Validate target user is a participant
            const targetParticipant = challenge.participants.find(p => p.raUsername === targetRaUsername);
            if (!targetParticipant) {
                throw new Error('Target user is not participating in this challenge.');
            }

            // Validate betting user has enough GP
            if (!bettingUser.hasEnoughGp(amount)) {
                throw new Error(`Insufficient GP. You have ${bettingUser.gpBalance} GP but need ${amount} GP.`);
            }

            // Check if user already has a bet on this challenge
            const existingBet = challenge.bets.find(bet => bet.userId === bettingUser.discordId);
            if (existingBet) {
                throw new Error('You already have a bet on this challenge.');
            }

            // Add bet
            challenge.bets.push({
                userId: bettingUser.discordId,
                username: bettingUser.username,
                targetRaUsername,
                amount,
                placedAt: new Date()
            });

            await challenge.save();

            // Deduct bet amount from user
            await gpUtils.deductGP(bettingUser, amount, 'bet', `Bet on ${targetRaUsername} in challenge ${challengeId}`, challengeId);

            // Update betting user stats
            if (!bettingUser.arenaStats) bettingUser.arenaStats = {};
            bettingUser.arenaStats.betsPlaced = (bettingUser.arenaStats.betsPlaced || 0) + 1;
            bettingUser.arenaStats.totalGpBet = (bettingUser.arenaStats.totalGpBet || 0) + amount;
            await bettingUser.save();

            return challenge;
        } catch (error) {
            console.error('Error placing bet:', error);
            throw error;
        }
    }

    async checkCompletedChallenges() {
        const now = Date.now();
        
        // Enforce minimum delay between processing cycles
        if (now - this.lastProcessingTime < this.processingDelay) {
            console.log('Arena service: Skipping check - too soon since last processing cycle');
            return;
        }

        if (this.isProcessing) {
            console.log('Arena service: Challenge completion check already in progress, skipping');
            return;
        }

        this.isProcessing = true;
        this.lastProcessingTime = now;
        
        try {
            console.log('Arena service: Checking for completed challenges...');
            
            // Find challenges that should be completed
            const completedChallenges = await ArenaChallenge.find({
                status: 'active',
                endedAt: { $lte: new Date() },
                processed: false
            });

            console.log(`Arena service: Found ${completedChallenges.length} challenges to process`);

            // Process challenges one at a time with delays to avoid rate limiting
            for (const challenge of completedChallenges) {
                // Skip if this challenge is already being processed
                if (this.processingChallenges.has(challenge.challengeId)) {
                    console.log(`Skipping ${challenge.challengeId} - already being processed`);
                    continue;
                }

                try {
                    this.processingChallenges.add(challenge.challengeId);
                    await this.processCompletedChallenge(challenge);
                    
                    // Add delay between challenges to avoid overwhelming the API
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } catch (error) {
                    console.error(`Error processing challenge ${challenge.challengeId}:`, error);
                    
                    // Mark as processed even if there was an error to prevent retry loops
                    challenge.processed = true;
                    challenge.processedAt = new Date();
                    await challenge.save();
                } finally {
                    this.processingChallenges.delete(challenge.challengeId);
                }
            }
        } catch (error) {
            console.error('Error in checkCompletedChallenges:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async processCompletedChallenge(challenge) {
        console.log(`Processing completed challenge: ${challenge.challengeId}`);
        
        // Mark as processed immediately to prevent duplicate processing
        challenge.processed = true;
        challenge.processedAt = new Date();
        challenge.status = 'completed';
        await challenge.save();

        try {
            // Check if leaderboard is valid before processing
            if (arenaUtils.isLeaderboardInvalid(challenge.leaderboardId)) {
                console.log(`Challenge ${challenge.challengeId} has invalid leaderboard, refunding`);
                await this.refundChallenge(challenge, 'Leaderboard is no longer accessible');
                return;
            }

            // FIXED: Use the same reliable API method as the feed service
            console.log(`Fetching final scores for challenge ${challenge.challengeId} using reliable RetroAPIUtils...`);
            const finalScores = await this.fetchLeaderboardScoresUsingRetroAPIUtils(
                challenge.leaderboardId,
                challenge.participants.map(p => p.raUsername)
            );

            console.log(`Final scores for ${challenge.challengeId}:`, finalScores);
            challenge.finalScores = finalScores;
            
            // Determine winner
            const winner = this.determineWinnerFixed(finalScores);
            console.log(`Winner determination for ${challenge.challengeId}:`, winner);
            
            if (winner) {
                challenge.winnerRaUsername = winner.raUsername;
                challenge.winnerUserId = challenge.participants.find(p => p.raUsername === winner.raUsername)?.userId;
                console.log(`Winner found: ${winner.raUsername} (rank ${winner.rank})`);
            } else {
                console.log(`No winner determined for challenge ${challenge.challengeId}`);
            }

            await challenge.save();

            // Process payouts
            await this.processPayouts(challenge, winner);

            // Post results using new AlertService
            await this.postChallengeResults(challenge, winner, finalScores);

            console.log(`Successfully processed challenge: ${challenge.challengeId}`);
        } catch (error) {
            console.error(`Error in detailed processing of challenge ${challenge.challengeId}:`, error);
            
            // If there's an error in processing, refund everything
            await this.refundChallenge(challenge, 'Processing error occurred');
        }
    }

    /**
     * FIXED: Use the same reliable API method as arenaFeedService.js
     * This should match exactly what the feed service uses
     * @private
     */
    async fetchLeaderboardScoresUsingRetroAPIUtils(leaderboardId, raUsernames) {
        try {
            console.log(`Fetching leaderboard scores using RetroAPIUtils for leaderboard ${leaderboardId}`);
            console.log('Target users:', raUsernames);

            // Use the exact same method as arenaFeedService.js
            const rawEntries = await RetroAPIUtils.getLeaderboardEntries(leaderboardId, 1000);
            
            if (!rawEntries || rawEntries.length === 0) {
                console.log('No leaderboard data received from RetroAPIUtils');
                return this.createNoScoreResults(raUsernames);
            }

            console.log(`Processed ${rawEntries.length} leaderboard entries from RetroAPIUtils`);

            // Find entries for our target users - exact same logic as feed service
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
                    console.log(`Found score for ${username}: rank ${entry.Rank}, score ${entry.FormattedScore || entry.Score}`);
                } else {
                    userScores.push({
                        raUsername: username,
                        rank: null,
                        score: 'No score',
                        fetchedAt: new Date()
                    });
                    console.log(`No score found for ${username}`);
                }
            }

            return userScores;
        } catch (error) {
            console.error('Error fetching leaderboard scores with RetroAPIUtils:', error);
            
            // Return no-score results for all users on error
            return this.createNoScoreResults(raUsernames);
        }
    }

    /**
     * Create no-score results for all users
     * @private
     */
    createNoScoreResults(raUsernames) {
        return raUsernames.map(username => ({
            raUsername: username,
            rank: null,
            score: 'No score',
            fetchedAt: new Date()
        }));
    }

    determineWinnerFixed(finalScores) {
        try {
            console.log('=== DETERMINING WINNER ===');
            console.log('Raw final scores:', finalScores);

            if (!finalScores || finalScores.length === 0) {
                console.log('No scores to evaluate');
                return null;
            }

            // Filter out users with no valid rank
            const validScores = finalScores.filter(score => {
                const hasValidRank = score.rank !== null && 
                                   score.rank !== undefined && 
                                   !isNaN(score.rank) && 
                                   score.rank > 0;
                console.log(`${score.raUsername}: rank=${score.rank}, valid=${hasValidRank}`);
                return hasValidRank;
            });

            console.log('Valid scores after filtering:', validScores);

            if (validScores.length === 0) {
                console.log('No valid scores found - no winner');
                return null;
            }

            // Sort by rank (lower is better)
            validScores.sort((a, b) => a.rank - b.rank);
            console.log('Scores sorted by rank:', validScores);

            const bestRank = validScores[0].rank;
            const winners = validScores.filter(score => score.rank === bestRank);

            console.log(`Best rank: ${bestRank}`);
            console.log(`Winners with this rank:`, winners);

            if (winners.length > 1) {
                console.log('Tie detected - multiple users with same best rank');
                return null; // Tie
            }

            const winner = winners[0];
            console.log(`Winner determined: ${winner.raUsername} with rank ${winner.rank}`);
            console.log('=== WINNER DETERMINATION COMPLETE ===');
            return winner;
        } catch (error) {
            console.error('Error determining winner:', error);
            return null;
        }
    }

    async processPayouts(challenge, winner) {
        const totalWager = challenge.getTotalWager();
        const totalBets = challenge.getTotalBets();

        try {
            // Process wager payouts
            if (winner && winner.raUsername) {
                // Winner takes all wagers
                const winnerUser = await User.findOne({ discordId: challenge.winnerUserId });
                if (winnerUser) {
                    await gpUtils.awardGP(winnerUser, totalWager, 'win', `Won challenge ${challenge.challengeId}`, challenge.challengeId);
                    
                    // Update winner stats
                    if (!winnerUser.arenaStats) winnerUser.arenaStats = {};
                    winnerUser.arenaStats.challengesWon = (winnerUser.arenaStats.challengesWon || 0) + 1;
                    winnerUser.arenaStats.totalGpWon = (winnerUser.arenaStats.totalGpWon || 0) + totalWager;
                    await winnerUser.save();
                }
            } else {
                // No winner - refund all wagers
                for (const participant of challenge.participants) {
                    const user = await User.findOne({ discordId: participant.userId });
                    if (user) {
                        await gpUtils.awardGP(user, participant.wager, 'refund', `Refund for challenge ${challenge.challengeId} (no winner)`, challenge.challengeId);
                    }
                }
            }

            // Process bet payouts
            if (challenge.bets.length > 0) {
                await this.processBetPayouts(challenge, winner);
            }
        } catch (error) {
            console.error('Error processing payouts:', error);
            throw error;
        }
    }

    async processBetPayouts(challenge, winner) {
        if (!winner || !winner.raUsername) {
            // No winner - refund all bets
            for (const bet of challenge.bets) {
                const bettor = await User.findOne({ discordId: bet.userId });
                if (bettor) {
                    await gpUtils.awardGP(bettor, bet.amount, 'refund', `Bet refund for challenge ${challenge.challengeId} (no winner)`, challenge.challengeId);
                }
            }
            return;
        }

        const winningBets = challenge.getBetsForUser(winner.raUsername);
        const losingBets = challenge.bets.filter(bet => bet.targetRaUsername !== winner.raUsername);
        
        const totalWinningBets = winningBets.reduce((sum, bet) => sum + bet.amount, 0);
        const totalLosingBets = losingBets.reduce((sum, bet) => sum + bet.amount, 0);

        // If no winning bets, refund all bets
        if (winningBets.length === 0) {
            for (const bet of challenge.bets) {
                const bettor = await User.findOne({ discordId: bet.userId });
                if (bettor) {
                    await gpUtils.awardGP(bettor, bet.amount, 'refund', `Bet refund for challenge ${challenge.challengeId} (no winning bets)`, challenge.challengeId);
                }
            }
            return;
        }

        // Calculate winnings for each winning bet
        for (const bet of winningBets) {
            const bettor = await User.findOne({ discordId: bet.userId });
            if (!bettor) continue;

            // Return original bet
            let payout = bet.amount;

            // Add proportional share of losing bets
            if (totalLosingBets > 0) {
                const proportionalShare = (bet.amount / totalWinningBets) * totalLosingBets;
                
                // House guarantee: if only one winning bettor, they get at least 50% of losing bets
                if (winningBets.length === 1) {
                    payout += Math.max(proportionalShare, totalLosingBets * 0.5);
                } else {
                    payout += proportionalShare;
                }
            }

            payout = Math.floor(payout); // Round down to avoid fractional GP
            
            await gpUtils.awardGP(bettor, payout, 'win', `Bet winnings for challenge ${challenge.challengeId}`, challenge.challengeId);
            
            // Update bettor stats
            if (!bettor.arenaStats) bettor.arenaStats = {};
            bettor.arenaStats.betsWon = (bettor.arenaStats.betsWon || 0) + 1;
            await bettor.save();
        }
    }

    async refundChallenge(challenge, reason) {
        try {
            console.log(`Refunding challenge ${challenge.challengeId}: ${reason}`);
            
            // Refund all wagers
            for (const participant of challenge.participants) {
                const user = await User.findOne({ discordId: participant.userId });
                if (user) {
                    await gpUtils.awardGP(user, participant.wager, 'refund', `Refund for challenge ${challenge.challengeId}: ${reason}`, challenge.challengeId);
                }
            }

            // Refund all bets
            for (const bet of challenge.bets) {
                const bettor = await User.findOne({ discordId: bet.userId });
                if (bettor) {
                    await gpUtils.awardGP(bettor, bet.amount, 'refund', `Bet refund for challenge ${challenge.challengeId}: ${reason}`, challenge.challengeId);
                }
            }

            // Update challenge status
            challenge.status = 'cancelled';
            challenge.processed = true;
            challenge.processedAt = new Date();
            await challenge.save();

            console.log(`Successfully refunded challenge ${challenge.challengeId}`);
        } catch (error) {
            console.error(`Error refunding challenge ${challenge.challengeId}:`, error);
            throw error;
        }
    }

    async postChallengeResults(challenge, winner, finalScores) {
        try {
            // Prepare the data for AlertService
            let title = '🏆 Challenge Complete!';
            let description = '';
            
            // Build basic challenge info
            description += `**Challenge ID:** ${challenge.challengeId}\n`;
            description += `**Game:** ${challenge.gameTitle}\n`;
            description += `**Leaderboard:** ${challenge.leaderboardTitle}\n`;
            
            // Add description if available
            if (challenge.description) {
                description += `**Description:** ${challenge.description}\n`;
            }
            
            description += `\n`;

            // Add winner information
            if (winner) {
                description += `🥇 **Winner:** **${winner.raUsername}**\n`;
                description += `**Rank:** ${winner.rank}\n`;
                description += `**Score:** ${winner.score}\n\n`;
                
                const totalWon = challenge.getTotalWager();
                description += `💰 **Prize:** ${totalWon} GP\n\n`;
            } else {
                description += `🤝 **Result:** No winner determined - all wagers refunded\n\n`;
            }

            // Add final scores
            if (finalScores && finalScores.length > 0) {
                description += `📊 **Final Scores:**\n`;
                const sortedScores = finalScores
                    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
                
                for (const score of sortedScores) {
                    description += `**${score.raUsername}**: Rank ${score.rank || 'N/A'} (${score.score || 'No score'})\n`;
                }
                description += `\n`;
            }

            // Add betting results if there were bets
            if (challenge.bets.length > 0) {
                const totalBets = challenge.getTotalBets();
                description += `🎰 **Total Bets:** ${totalBets} GP from ${challenge.bets.length} bet(s)\n`;
            }

            // Get game thumbnail
            let thumbnailUrl = null;
            try {
                const gameInfo = await arenaUtils.getGameInfo(challenge.gameId);
                if (gameInfo?.imageIcon) {
                    thumbnailUrl = `https://retroachievements.org${gameInfo.imageIcon}`;
                }
            } catch (error) {
                console.error('Error fetching game info for results thumbnail:', error);
            }

            // Use new AlertService to post results
            await alertService.sendAnnouncementAlert({
                alertType: ALERT_TYPES.NEW_ARENA_CHALLENGE,
                title: title,
                description: description,
                gameTitle: challenge.gameTitle,
                gameId: challenge.gameId,
                leaderboardTitle: challenge.leaderboardTitle,
                leaderboardId: challenge.leaderboardId,
                thumbnail: thumbnailUrl,
                footer: {
                    text: `Challenge ID: ${challenge.challengeId} • Data from RetroAchievements.org`
                }
            });

        } catch (error) {
            console.error('Error posting challenge results:', error);
        }
    }

    async checkAndProcessTimeouts() {
        try {
            const timeoutThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
            
            const timedOutChallenges = await ArenaChallenge.find({
                status: 'pending',
                createdAt: { $lt: timeoutThreshold },
                processed: false
            });

            console.log(`Arena service: Found ${timedOutChallenges.length} timed out challenges`);

            // Process timeouts one at a time with delays
            for (const challenge of timedOutChallenges) {
                try {
                    await this.refundChallenge(challenge, 'Challenge timed out (not accepted within 24 hours)');
                    console.log(`Timed out challenge ${challenge.challengeId} refunded`);
                    
                    // Add delay between timeout processing
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error(`Error processing timeout for challenge ${challenge.challengeId}:`, error);
                }
            }
        } catch (error) {
            console.error('Error checking for timeouts:', error);
        }
    }

    async updateArenaFeeds() {
        try {
            console.log('Arena service: Arena feeds updated');
        } catch (error) {
            console.error('Error updating arena feeds:', error);
        }
    }

    async getActiveChallenges(limit = 10) {
        return await ArenaChallenge.find({ status: { $in: ['pending', 'active'] } })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    async getUserChallenges(userId, limit = 10) {
        return await ArenaChallenge.find({
            $or: [
                { creatorId: userId },
                { targetId: userId },
                { 'participants.userId': userId }
            ]
        })
        .sort({ createdAt: -1 })
        .limit(limit);
    }

    async getChallengeById(challengeId) {
        return await ArenaChallenge.findOne({ challengeId });
    }

    getProcessingStats() {
        return {
            isProcessing: this.isProcessing,
            processingChallenges: Array.from(this.processingChallenges),
            lastProcessingTime: this.lastProcessingTime,
            processingDelay: this.processingDelay
        };
    }

    forceRefreshProcessing() {
        this.isProcessing = false;
        this.processingChallenges.clear();
        this.lastProcessingTime = 0;
        console.log('Arena service processing state reset');
    }
}

export default new ArenaService();
