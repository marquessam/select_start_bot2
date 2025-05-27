// src/services/arenaService.js
import { ArenaChallenge } from '../models/ArenaChallenge.js';
import { User } from '../models/User.js';
import { config } from '../config/config.js';
import arenaUtils from '../utils/arenaUtils.js';
import gpUtils from '../utils/gpUtils.js';
import AlertUtils, { ALERT_TYPES } from '../utils/AlertUtils.js';
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';

class ArenaService {
    constructor() {
        this.client = null;
        this.isProcessing = false;
    }

    setClient(client) {
        this.client = client;
    }

    async start() {
        if (!this.client) {
            console.error('Arena service: Client not set');
            return;
        }
        console.log('Arena service started');
    }

    /**
     * Generate a unique challenge ID
     */
    generateChallengeId() {
        return `arena_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    /**
     * Create a new arena challenge - UPDATED to accept description and send immediate alerts
     */
    async createChallenge(creatorUser, gameInfo, leaderboardInfo, wager, targetRaUsername = null, discordUsername = null, description = '') {
        try {
            // Validate creator has enough GP
            if (!creatorUser.hasEnoughGp(wager)) {
                throw new Error(`Insufficient GP. You have ${creatorUser.gpBalance} GP but need ${wager} GP.`);
            }
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
                description: description || '', // NEW: Set description field
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

            // SEND IMMEDIATE NEW CHALLENGE ALERT
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
                
                // Send the immediate new challenge alert
                await AlertUtils.sendPositionChangeAlert({
                    title: title,
                    description: alertDescription,
                    thumbnail: thumbnailUrl,
                    footer: { 
                        text: `Challenge ID: ${challengeId} • Use /arena to participate` 
                    }
                }, ALERT_TYPES.ARENA);
                
            } catch (alertError) {
                console.error('Error sending immediate new challenge alert:', alertError);
                // Don't throw - alert failures shouldn't break challenge creation
            }

            // Deduct wager from creator
            await gpUtils.deductGP(creatorUser, wager, 'wager', `Wager for challenge ${challengeId}`, challengeId);
            
            // Update creator stats
            if (!creatorUser.arenaStats) creatorUser.arenaStats = {};
            creatorUser.arenaStats.challengesCreated = (creatorUser.arenaStats.challengesCreated || 0) + 1;
            creatorUser.arenaStats.totalGpWagered = (creatorUser.arenaStats.totalGpWagered || 0) + wager;
            await creatorUser.save();
            
            return challenge;
        } catch (error) {
            console.error('Error creating challenge:', error);
            throw error;
        }
    }

    /**
     * Accept a direct challenge - UPDATED to send immediate alerts
     */
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

            // SEND IMMEDIATE CHALLENGE ACCEPTED ALERT
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
                
                // Send the challenge accepted alert
                await AlertUtils.sendPositionChangeAlert({
                    title: title,
                    description: alertDescription,
                    thumbnail: thumbnailUrl,
                    footer: { 
                        text: `Challenge ID: ${challengeId} • Battle duration: 7 days` 
                    }
                }, ALERT_TYPES.ARENA);
                
            } catch (alertError) {
                console.error('Error sending challenge accepted alert:', alertError);
                // Don't throw - alert failures shouldn't break challenge acceptance
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

    /**
     * Join an open challenge - UPDATED to send immediate alerts
     */
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

            // SEND IMMEDIATE NEW PARTICIPANT ALERT
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
                
                // Send the new participant alert
                await AlertUtils.sendPositionChangeAlert({
                    title: title,
                    description: alertDescription,
                    thumbnail: thumbnailUrl,
                    footer: { 
                        text: `Challenge ID: ${challengeId} • Battle duration: 7 days` 
                    }
                }, ALERT_TYPES.ARENA);
                
            } catch (alertError) {
                console.error('Error sending new participant alert:', alertError);
                // Don't throw - alert failures shouldn't break joining
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

    /**
     * Place a bet on a challenge
     */
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

    /**
     * Check for completed challenges and process them
     * This is the single point of truth for challenge completion
     */
    async checkCompletedChallenges() {
        if (this.isProcessing) {
            console.log('Arena service: Challenge completion check already in progress, skipping');
            return;
        }

        this.isProcessing = true;
        
        try {
            console.log('Arena service: Checking for completed challenges...');
            
            // Find challenges that should be completed
            const completedChallenges = await ArenaChallenge.find({
                status: 'active',
                endedAt: { $lte: new Date() },
                processed: false
            });

            console.log(`Arena service: Found ${completedChallenges.length} challenges to process`);

            for (const challenge of completedChallenges) {
                try {
                    await this.processCompletedChallenge(challenge);
                } catch (error) {
                    console.error(`Error processing challenge ${challenge.challengeId}:`, error);
                    
                    // Mark as processed even if there was an error to prevent retry loops
                    challenge.processed = true;
                    challenge.processedAt = new Date();
                    await challenge.save();
                }
            }
        } catch (error) {
            console.error('Error in checkCompletedChallenges:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process a single completed challenge
     * @private
     */
    async processCompletedChallenge(challenge) {
        console.log(`Processing completed challenge: ${challenge.challengeId}`);
        
        // Mark as processed immediately to prevent duplicate processing
        challenge.processed = true;
        challenge.processedAt = new Date();
        challenge.status = 'completed';
        await challenge.save();

        try {
            // Fetch final scores
            const finalScores = await arenaUtils.fetchLeaderboardScores(
                challenge.gameId, 
                challenge.leaderboardId,
                challenge.participants.map(p => p.raUsername)
            );

            challenge.finalScores = finalScores;
            
            // Determine winner
            const winner = arenaUtils.determineWinner(finalScores);
            
            if (winner) {
                challenge.winnerRaUsername = winner.raUsername;
                challenge.winnerUserId = challenge.participants.find(p => p.raUsername === winner.raUsername)?.userId;
            }

            await challenge.save();

            // Process payouts
            await this.processPayouts(challenge, winner);

            // Post results
            await this.postChallengeResults(challenge, winner, finalScores);

            console.log(`Successfully processed challenge: ${challenge.challengeId}`);
        } catch (error) {
            console.error(`Error in detailed processing of challenge ${challenge.challengeId}:`, error);
            
            // If there's an error in processing, refund everything
            await this.refundChallenge(challenge, 'Processing error occurred');
        }
    }

    /**
     * Process payouts for a completed challenge
     * @private
     */
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

    /**
     * Process bet payouts
     * @private
     */
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

    /**
     * Refund all participants and bettors for a challenge
     */
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

    /**
     * Post challenge results to the arena channel
     * @private
     */
    async postChallengeResults(challenge, winner, finalScores) {
        try {
            const arenaChannel = await this.client.channels.fetch(config.discord.arenaChannelId);
            if (!arenaChannel) {
                console.error('Arena channel not found');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('🏆 Challenge Complete!')
                .setColor(winner ? '#00FF00' : '#FFA500')
                .addFields(
                    { name: 'Challenge', value: `${challenge.challengeId}`, inline: true },
                    { name: 'Game', value: challenge.gameTitle, inline: true },
                    { name: 'Leaderboard', value: challenge.leaderboardTitle, inline: true }
                );

            // Add description if available
            if (challenge.description) {
                embed.addFields({ name: 'Description', value: challenge.description, inline: false });
            }

            if (winner) {
                embed.addFields(
                    { name: '🥇 Winner', value: `**${winner.raUsername}**\nRank: ${winner.rank}\nScore: ${winner.score}`, inline: false }
                );
                
                const winnerUser = await User.findOne({ discordId: challenge.winnerUserId });
                if (winnerUser) {
                    const totalWon = challenge.getTotalWager();
                    embed.addFields({ name: '💰 Prize', value: `${totalWon} GP`, inline: true });
                }
            } else {
                embed.addFields({ name: '🤝 Result', value: 'No winner determined - all wagers refunded', inline: false });
            }

            // Add final scores
            if (finalScores && finalScores.length > 0) {
                const scoresText = finalScores
                    .sort((a, b) => (a.rank || 999) - (b.rank || 999))
                    .map(score => `**${score.raUsername}**: Rank ${score.rank || 'N/A'} (${score.score || 'No score'})`)
                    .join('\n');
                embed.addFields({ name: '📊 Final Scores', value: scoresText, inline: false });
            }

            // Add betting results if there were bets
            if (challenge.bets.length > 0) {
                const totalBets = challenge.getTotalBets();
                embed.addFields({ name: '🎰 Total Bets', value: `${totalBets} GP from ${challenge.bets.length} bet(s)`, inline: true });
            }

            embed.setTimestamp();

            await arenaChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error posting challenge results:', error);
        }
    }

    /**
     * Check for and process challenge timeouts (pending challenges that were never accepted)
     */
    async checkAndProcessTimeouts() {
        try {
            const timeoutThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
            
            const timedOutChallenges = await ArenaChallenge.find({
                status: 'pending',
                createdAt: { $lt: timeoutThreshold },
                processed: false
            });

            console.log(`Arena service: Found ${timedOutChallenges.length} timed out challenges`);

            for (const challenge of timedOutChallenges) {
                try {
                    await this.refundChallenge(challenge, 'Challenge timed out (not accepted within 24 hours)');
                    console.log(`Timed out challenge ${challenge.challengeId} refunded`);
                } catch (error) {
                    console.error(`Error processing timeout for challenge ${challenge.challengeId}:`, error);
                }
            }
        } catch (error) {
            console.error('Error checking for timeouts:', error);
        }
    }

    /**
     * Update arena feeds (placeholder for feed management)
     */
    async updateArenaFeeds() {
        try {
            // This could be used to update embedded arena feed messages
            // For now, we'll just log that it ran
            console.log('Arena service: Arena feeds updated');
        } catch (error) {
            console.error('Error updating arena feeds:', error);
        }
    }

    /**
     * Get active challenges
     */
    async getActiveChallenges(limit = 10) {
        return await ArenaChallenge.find({ status: { $in: ['pending', 'active'] } })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    /**
     * Get challenges for a specific user
     */
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

    /**
     * Get challenge by ID
     */
    async getChallengeById(challengeId) {
        return await ArenaChallenge.findOne({ challengeId });
    }
}

export default new ArenaService();
