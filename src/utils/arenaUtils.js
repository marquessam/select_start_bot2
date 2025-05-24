// src/utils/arenaUtils.js
import { EmbedBuilder } from 'discord.js';
import { 
    COLORS, 
    EMOJIS, 
    formatTimeRemaining, 
    getDiscordTimestamp
} from './FeedUtils.js';
import RetroAPIUtils from './RetroAPIUtils.js';

// Re-export functions from FeedUtils for backward compatibility
export { formatTimeRemaining };

/**
 * Get leaderboard entries - re-export for compatibility
 */
export const getLeaderboardEntries = RetroAPIUtils.getLeaderboardEntries;



/**
 * Process raw leaderboard entries - simplified to use rank only
 */
export function processLeaderboardEntries(rawEntries) {
    if (!rawEntries || !Array.isArray(rawEntries)) {
        console.error('Invalid leaderboard entries received:', rawEntries);
        return [];
    }
    
    // Process the entries with improved handling for different formats
    const entries = rawEntries.map(entry => {
        if (!entry) return null;
        
        // Handle different field names that might be used
        const user = entry.User || entry.user || entry.username || '';
        const score = entry.Score || entry.score || entry.Value || entry.value || 0;
        const formattedScore = entry.FormattedScore || entry.formattedScore || 
                             entry.ScoreFormatted || entry.scoreFormatted || score.toString();
        const rank = entry.Rank || entry.rank || entry.ApiRank || entry.apiRank || 0;
        
        return {
            ApiRank: parseInt(rank, 10) || 0,
            User: user.trim(),
            RawScore: score,
            FormattedScore: formattedScore.toString().trim() || score.toString(),
            Value: parseFloat(score) || 0
        };
    }).filter(entry => entry !== null); // Remove any null entries
    
    // Sort entries by their API Rank (lower is better)
    entries.sort((a, b) => a.ApiRank - b.ApiRank);
    
    console.log(`Processed ${entries.length} valid leaderboard entries`);
    
    return entries;
}

/**
 * Find a user in leaderboard entries - re-export for compatibility
 */
export const findUserInLeaderboard = RetroAPIUtils.findUserInLeaderboard;

/**
 * Get estimated winner based on API rank only
 * @param {Object} challenge - The challenge object
 * @param {Object} challengerScore - Challenger's score info
 * @param {Object|null} challengeeScore - Challengee's score info (may be null for open challenges)
 * @returns {string|null} - Username of estimated winner or null if can't determine
 */
export function getEstimatedWinner(challenge, challengerScore, challengeeScore) {
    // For open challenges, we don't determine a winner this way
    if (challenge.isOpenChallenge || !challengeeScore) {
        return null;
    }
    
    // Add usernames if needed
    challengerScore.username = challenge.challengerUsername;
    challengeeScore.username = challenge.challengeeUsername;
    
    // If either player doesn't have a score, can't determine
    if (!challengerScore.exists || !challengeeScore.exists) {
        return null;
    }
    
    // Use ApiRank for determining winner (lower rank is better)
    if (challengerScore.rank && challengeeScore.rank) {
        if (challengerScore.rank < challengeeScore.rank) {
            return challengerScore.username;
        } else if (challengeeScore.rank < challengerScore.rank) {
            return challengeeScore.username;
        }
        // Ranks are equal - it's a tie
        return 'Tie';
    }
    
    // If no ranks available, can't determine winner
    return null;
}

/**
 * Check for position changes in the leaderboard - ENHANCED VERSION
 * Now supports ties and open challenges
 * @param {Object} challenge - The challenge
 * @param {Object} challengerScore - Challenger's current score
 * @param {Object} challengeeScore - Challengee's current score (may be null for open challenges)
 * @param {string} previousChallengerScore - Challenger's previous score (for comparison)
 * @param {string} previousChallengeeScore - Challengee's previous score (for comparison)
 * @returns {Object|null} Position change info or null if no change
 */
export function checkPositionChanges(challenge, challengerScore, challengeeScore, previousChallengerScore, previousChallengeeScore) {
    // Handle open challenges differently
    if (challenge.isOpenChallenge) {
        return checkOpenChallengePositionChanges(challenge, challengerScore, challengeeScore);
    }
    
    // Handle direct challenges (1v1)
    return checkDirectChallengePositionChanges(challenge, challengerScore, challengeeScore, previousChallengerScore, previousChallengeeScore);
}

/**
 * Check position changes for direct challenges (1v1)
 * @private
 */
function checkDirectChallengePositionChanges(challenge, challengerScore, challengeeScore, previousChallengerScore, previousChallengeeScore) {
    // Skip if either player doesn't have a score yet
    if (!challengerScore.exists || !challengeeScore.exists) {
        return null;
    }
    
    // Skip if we don't have valid ranks
    if (!challengerScore.rank || !challengeeScore.rank) {
        return null;
    }
    
    // Check if scores have changed from what's stored in the challenge
    const challengerScoreChanged = challenge.challengerScore && challenge.challengerScore !== challengerScore.formattedScore;
    const challengeeScoreChanged = challenge.challengeeScore && challenge.challengeeScore !== challengeeScore.formattedScore;
    
    // Only notify if at least one score changed
    if (!challengerScoreChanged && !challengeeScoreChanged) {
        return null;
    }
    
    // Determine current leader based on rank (lower rank is better)
    let currentLeader = null;
    if (challengerScore.rank < challengeeScore.rank) {
        currentLeader = challenge.challengerUsername;
    } else if (challengeeScore.rank < challengerScore.rank) {
        currentLeader = challenge.challengeeUsername;
    } else {
        currentLeader = 'Tie';
    }
    
    // Now we notify for ANY position change, including ties
    return {
        newLeader: currentLeader,
        scoreChange: true,
        isTie: currentLeader === 'Tie',
        challengerChanged: challengerScoreChanged,
        challengeeChanged: challengeeScoreChanged
    };
}

/**
 * Check position changes for open challenges (multiple participants)
 * @private
 */
function checkOpenChallengePositionChanges(challenge, challengerScore, challengeeScore) {
    // For open challenges, we need to check all participants
    if (!challenge.participants || challenge.participants.length === 0) {
        return null; // No participants yet, nothing to notify
    }
    
    // Check if the creator's (challenger's) score changed
    const challengerScoreChanged = challenge.challengerScore && challenge.challengerScore !== challengerScore.formattedScore;
    
    // Check if any participant scores changed
    let anyParticipantScoreChanged = false;
    const participantChanges = [];
    
    if (challenge.participants) {
        challenge.participants.forEach(participant => {
            if (participant.score && participant.score !== (participant.previousScore || 'No score yet')) {
                anyParticipantScoreChanged = true;
                participantChanges.push({
                    username: participant.username,
                    oldScore: participant.previousScore || 'No score yet',
                    newScore: participant.score
                });
            }
        });
    }
    
    // Only notify if someone's score changed
    if (!challengerScoreChanged && !anyParticipantScoreChanged) {
        return null;
    }
    
    // For basic open challenge detection, just note that scores changed
    return {
        newLeader: 'Position changes detected',
        scoreChange: true,
        isTie: false,
        isOpenChallenge: true,
        participantChanges: participantChanges
    };
}

/**
 * Enhanced version that works with participant scores map
 * This should be called from arenaService with proper participant score data
 */
export function checkPositionChangesWithParticipants(challenge, challengerScore, challengeeScore, participantScores = null) {
    // Handle open challenges with proper participant data
    if (challenge.isOpenChallenge && participantScores) {
        return checkOpenChallengePositionChangesEnhanced(challenge, challengerScore, participantScores);
    }
    
    // Handle direct challenges
    if (!challenge.isOpenChallenge && challengeeScore) {
        return checkDirectChallengePositionChanges(challenge, challengerScore, challengeeScore);
    }
    
    return null;
}

/**
 * Enhanced open challenge position checking with full participant data
 * @private
 */
function checkOpenChallengePositionChangesEnhanced(challenge, challengerScore, participantScores) {
    // Check if the creator's score changed
    const challengerScoreChanged = challenge.challengerScore && challenge.challengerScore !== challengerScore.formattedScore;
    
    // Check if any participant scores changed
    let anyParticipantScoreChanged = false;
    const participantChanges = [];
    
    if (challenge.participants && participantScores) {
        challenge.participants.forEach(participant => {
            const currentScore = participantScores.get(participant.username.toLowerCase());
            if (currentScore && participant.score !== currentScore.formattedScore) {
                anyParticipantScoreChanged = true;
                participantChanges.push({
                    username: participant.username,
                    oldScore: participant.score || 'No score yet',
                    newScore: currentScore.formattedScore,
                    rank: currentScore.rank
                });
            }
        });
    }
    
    // Only notify if someone's score changed
    if (!challengerScoreChanged && !anyParticipantScoreChanged) {
        return null;
    }
    
    // Find the current leader(s) based on ranks
    const allPlayers = [];
    
    // Add creator
    if (challengerScore.exists && challengerScore.rank && challengerScore.rank > 0) {
        allPlayers.push({
            username: challenge.challengerUsername,
            rank: challengerScore.rank,
            isCreator: true
        });
    }
    
    // Add participants with valid ranks
    if (challenge.participants && participantScores) {
        challenge.participants.forEach(participant => {
            const scoreInfo = participantScores.get(participant.username.toLowerCase());
            if (scoreInfo && scoreInfo.exists && scoreInfo.rank && scoreInfo.rank > 0) {
                allPlayers.push({
                    username: participant.username,
                    rank: scoreInfo.rank,
                    isCreator: false
                });
            }
        });
    }
    
    if (allPlayers.length === 0) {
        return null; // No valid players with ranks
    }
    
    // Sort by rank (lower is better)
    allPlayers.sort((a, b) => a.rank - b.rank);
    
    // Find the best rank
    const bestRank = allPlayers[0].rank;
    const leaders = allPlayers.filter(player => player.rank === bestRank);
    
    let currentLeader;
    const isTie = leaders.length > 1;
    
    if (isTie) {
        currentLeader = `Tie between ${leaders.map(l => l.username).join(', ')}`;
    } else {
        currentLeader = leaders[0].username;
    }
    
    return {
        newLeader: currentLeader,
        scoreChange: true,
        isTie: isTie,
        isOpenChallenge: true,
        participantChanges: participantChanges,
        tiedPlayers: isTie ? leaders.map(l => l.username) : null,
        allPlayers: allPlayers
    };
}

/**
 * Determine if a leaderboard is time-based (deprecated - no longer needed)
 * @deprecated Use ApiRank instead
 */
export function isTimeBasedLeaderboard(challenge) {
    // This function is deprecated since we now use ApiRank
    // Keeping for backward compatibility but always return false
    return false;
}

/**
 * Create a challenge embed for Discord
 * @param {Object} challenge - The challenge object
 * @param {Object} challengerScore - Challenger's score info
 * @param {Object|null} challengeeScore - Challengee's score info (may be null for open challenges)
 * @param {Map} participantScores - Map of participant scores (for open challenges)
 * @returns {Object} - Discord embed object
 */
export function createChallengeEmbed(challenge, challengerScore, challengeeScore, participantScores) {
    // Calculate time remaining
    const timeLeft = formatTimeRemaining(challenge.endDate);
    
    // Create the embed with the correct color based on challenge type
    const embed = new EmbedBuilder();
    
    // Set color based on challenge type - BLUE for open challenges, RED for direct challenges
    if (challenge.isOpenChallenge) {
        embed.setColor(COLORS.PRIMARY); // Blue for open challenges
    } else {
        embed.setColor(COLORS.DANGER);  // Red for direct challenges
    }
    
    // Add thumbnail if available
    if (challenge.iconUrl) {
        embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
    }
    
    // Handle open challenges with participants separately
    if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
        createOpenChallengeEmbed(challenge, challengerScore, participantScores, embed, timeLeft);
    } else if (!challenge.isOpenChallenge && challengeeScore) {
        createDirectChallengeEmbed(challenge, challengerScore, challengeeScore, embed, timeLeft);
    } else {
        // Fallback for any edge cases (like empty open challenges)
        createBasicChallengeEmbed(challenge, challengerScore, embed, timeLeft);
    }
    
    embed.setTimestamp();
    return embed;
}

/**
 * Create a basic fallback embed for edge cases
 * @private
 */
function createBasicChallengeEmbed(challenge, challengerScore, embed, timeLeft) {
    // Build leaderboard URL
    const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
    
    // Set title
    embed.setTitle(challenge.gameTitle);
    
    // Description with basic info
    embed.setDescription(`**Challenge** created by ${challenge.challengerUsername}\n[View Leaderboard](${leaderboardUrl})`);
    
    // Add description if available
    if (challenge.description) {
        embed.addFields({ name: 'Challenge', value: challenge.description });
    }
    
    // Add challenge details
    embed.addFields({
        name: 'Details', 
        value: `**Wager:** ${challenge.wagerAmount} GP\n` +
               `**Ends:** ${timeLeft}`
    });
    
    // Add creator's score information with global rank
    if (challengerScore.exists) {
        const rankDisplay = challengerScore.rank ? ` (Global: #${challengerScore.rank})` : '';
        embed.addFields({
            name: 'Creator\'s Score',
            value: `**${challenge.challengerUsername}**: ${challengerScore.formattedScore}${rankDisplay}`
        });
    } else {
        embed.addFields({
            name: 'Creator\'s Score',
            value: `**${challenge.challengerUsername}**: No score yet`
        });
    }
}

/**
 * Helper to create embed for open challenges
 * @private
 */
function createOpenChallengeEmbed(challenge, challengerScore, participantScores, embed, timeLeft) {
    // Build leaderboard URL
    const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
    
    // Set title for open challenge with game info including platform
    const platformText = challenge.platform ? ` (${challenge.platform})` : '';
    embed.setTitle(`${challenge.gameTitle}${platformText}`);
    
    // Description now just shows creator info
    embed.setDescription(`**Creator:** ${challenge.challengerUsername} | [View Leaderboard](${leaderboardUrl})`);
    
    // Add description if available
    if (challenge.description) {
        embed.addFields({ name: 'Challenge', value: challenge.description });
    }
    
    // Add challenge details - more concise format
    embed.addFields({
        name: 'Details', 
        value: `**Wager:** ${challenge.wagerAmount} GP per player\n` +
               `**Ends:** ${timeLeft}\n` +
               `**Participants:** ${challenge.participants.length + 1}` // +1 for the creator
    });
    
    // Sort participants by global rank (ApiRank)
    const allParticipants = [];
    
    // Add creator with rank
    allParticipants.push({
        username: challenge.challengerUsername,
        isCreator: true,
        score: challengerScore.formattedScore,
        globalRank: challengerScore.rank || 999999,
        exists: challengerScore.exists
    });
    
    // Add each participant
    if (challenge.participants) {
        challenge.participants.forEach(participant => {
            const scoreInfo = participantScores?.get?.(participant.username.toLowerCase());
            const score = scoreInfo?.formattedScore || participant.score || 'No score yet';
            const globalRank = scoreInfo?.rank || 999999;
            
            allParticipants.push({
                username: participant.username,
                isCreator: false,
                score: score,
                globalRank: globalRank,
                exists: !!scoreInfo?.exists
            });
        });
    }
    
    // Sort participants by global rank (lower is better)
    allParticipants.sort((a, b) => {
        // Put participants with scores first
        if (a.exists && !b.exists) return -1;
        if (!a.exists && b.exists) return 1;
        
        // If both have scores, sort by global rank
        if (a.exists && b.exists) {
            return a.globalRank - b.globalRank;
        }
        
        return 0;
    });
    
    // Create standings field with crown for the leader
    let participantsText = '';
    
    allParticipants.forEach((participant, index) => {
        if (participant.exists) {
            // Add crown emoji only for the top position (leader)
            const prefixEmoji = index === 0 ? `${EMOJIS.CROWN} ` : '';
            const creatorTag = participant.isCreator ? ' (Creator)' : '';
            const rankDisplay = participant.globalRank < 999999 ? ` (Global: #${participant.globalRank})` : '';
            
            participantsText += `${prefixEmoji}**${participant.username}${creatorTag}**: ${participant.score}${rankDisplay}\n`;
        } else {
            const creatorTag = participant.isCreator ? ' (Creator)' : '';
            participantsText += `• **${participant.username}${creatorTag}**: ${participant.score}\n`;
        }
    });
    
    if (participantsText) {
        embed.addFields({
            name: 'Current Standings', 
            value: participantsText
        });
    } else {
        embed.addFields({
            name: 'Current Standings',
            value: 'No participants have scores yet.'
        });
    }
    
    // Calculate total pot
    const wagerPool = challenge.wagerAmount * (challenge.participants.length + 1); // all participants + creator
    const betPool = challenge.bets ? challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0) : 0;
    
    // Add betting info section
    embed.addFields({
        name: `${EMOJIS.MONEY} Bets`,
        value: 
            `**Total Prize Pool:** ${wagerPool + betPool} GP\n` +
            `**Bets Placed:** ${challenge.bets ? challenge.bets.length : 0} total bets\n` +
            `Use \`/arena\` → "Place a Bet"`
    });
}

/**
 * Helper to create embed for direct challenges
 * @private
 */
function createDirectChallengeEmbed(challenge, challengerScore, challengeeScore, embed, timeLeft) {
    // Get the winner based on rank
    const leader = getEstimatedWinner(challenge, challengerScore, challengeeScore);
    
    // More concise title
    embed.setTitle(`${challenge.challengerUsername} vs ${challenge.challengeeUsername}`);
    
    // Build leaderboard URL
    const leaderboardUrl = `https://retroachievements.org/leaderboardinfo.php?i=${challenge.leaderboardId}`;
    
    // Add platform information if available
    const platformText = challenge.platform ? ` (${challenge.platform})` : '';
    
    // Add game info with the game title as a link to the leaderboard
    embed.setDescription(`**Game:** [${challenge.gameTitle}${platformText}](${leaderboardUrl})`);
    
    // Add description if available
    if (challenge.description) {
        embed.addFields({ name: 'Challenge', value: challenge.description });
    }
    
    // Calculate status text based on leader
    const statusText = leader === 'Tie' ? 'Challenge is tied!'
                     : leader === challenge.challengerUsername ? `${challenge.challengerUsername} leads`
                     : leader === challenge.challengeeUsername ? `${challenge.challengeeUsername} leads` 
                     : 'No leader yet';
    
    // Add challenge details in more concise format
    embed.addFields({
        name: 'Details', 
        value: `**Wager:** ${challenge.wagerAmount} GP each\n` +
               `**Ends:** ${timeLeft}\n` +
               `**Status:** ${statusText}`
    });
    
    // Add current scores with crown notation - sorted by global rank
    const participants = [
        {
            username: challenge.challengerUsername,
            score: challengerScore.formattedScore,
            globalRank: challengerScore.rank || 999999,
            exists: challengerScore.exists,
            isLeader: leader === challenge.challengerUsername
        },
        {
            username: challenge.challengeeUsername,
            score: challengeeScore.formattedScore,
            globalRank: challengeeScore.rank || 999999,
            exists: challengeeScore.exists,
            isLeader: leader === challenge.challengeeUsername
        }
    ];
    
    // Sort by global rank (lower is better)
    participants.sort((a, b) => {
        if (a.exists && !b.exists) return -1;
        if (!a.exists && b.exists) return 1;
        
        if (a.exists && b.exists) {
            return a.globalRank - b.globalRank;
        }
        
        return 0;
    });
    
    let scoresText = '';
    participants.forEach((participant) => {
        // Use crown for leader, nothing for others
        const prefixEmoji = participant.isLeader ? `${EMOJIS.CROWN} ` : '';
        const rankDisplay = participant.globalRank < 999999 ? ` (Global: #${participant.globalRank})` : '';
        
        scoresText += `${prefixEmoji}**${participant.username}:** ${participant.score}${rankDisplay}\n`;
    });
    
    embed.addFields({
        name: `${EMOJIS.CHART} Current Scores`,
        value: scoresText
    });
    
    // Calculate bets for each player
    const challengerBets = challenge.bets?.filter(b => b.targetPlayer === challenge.challengerUsername).length || 0;
    const challengeeBets = challenge.bets?.filter(b => b.targetPlayer === challenge.challengeeUsername).length || 0;
    
    // Calculate total pot
    const wagerPool = challenge.wagerAmount * 2;
    const betPool = challenge.bets ? challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0) : 0;
    const totalPool = wagerPool + betPool;
    
    // Add betting info in more concise format
    embed.addFields({
        name: `${EMOJIS.MONEY} Bets`,
        value: 
            `**Total Prize Pool:** ${totalPool} GP\n` +
            `**Bets on ${challenge.challengerUsername}:** ${challengerBets}\n` +
            `**Bets on ${challenge.challengeeUsername}:** ${challengeeBets}\n` +
            `Use \`/arena\` → "Place a Bet"`
    });
}

/**
 * Add betting results to a completed challenge embed
 * @param {Object} challenge - The challenge object
 * @param {Object} embed - Discord embed to add results to
 */
export function addBettingResultsToEmbed(challenge, embed) {
    if (!challenge.bets || challenge.bets.length === 0) return;
    
    if (challenge.winnerUsername && challenge.winnerUsername !== 'Tie' && challenge.winnerUsername !== 'No Winner') {
        // Get winning and losing bets
        const winningBets = challenge.bets.filter(bet => bet.targetPlayer === challenge.winnerUsername);
        const losingBets = challenge.bets.filter(bet => bet.targetPlayer !== challenge.winnerUsername);
        
        // Calculate total amounts
        const totalWinningBetsAmount = winningBets.reduce((total, bet) => total + bet.betAmount, 0);
        const totalLosingBetsAmount = losingBets.reduce((total, bet) => total + bet.betAmount, 0);
        
        // Show house contribution if any
        const houseContribution = challenge.houseContribution || 0;
        
        // Create betting results text
        let bettingText = `**Total Bets:** ${challenge.bets.length} (${challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0)} GP)\n` +
                        `**Winning Bets:** ${winningBets.length} bets totaling ${totalWinningBetsAmount} GP\n` +
                        `**Losing Bets:** ${losingBets.length} bets totaling ${totalLosingBetsAmount} GP\n`;
        
        if (houseContribution > 0) {
            bettingText += `**House Contribution:** ${houseContribution} GP (50% profit for sole bettors)\n`;
        }
        
        bettingText += '\n';
        
        // List top bet winners
        if (winningBets.length > 0) {
            bettingText += '**Top Bet Winners:**\n';
            
            // Sort by payout amount (highest first)
            const sortedBets = [...winningBets]
                .sort((a, b) => (b.payout || 0) - (a.payout || 0));
            
            // Show top 3 or fewer
            const topBets = sortedBets.slice(0, 3);
            topBets.forEach((bet, index) => {
                // Use the saved payout amount
                const payoutAmount = bet.payout || 0;
                const profit = payoutAmount - bet.betAmount;
                
                bettingText += `${index + 1}. ${bet.raUsername}: Bet ${bet.betAmount} GP, won ${payoutAmount} GP (profit: ${profit} GP)\n`;
            });
        } else {
            bettingText += 'No winning bets were placed.';
        }
        
        embed.addFields({
            name: `${EMOJIS.MONEY} Betting Results`,
            value: bettingText
        });
    } else {
        // For ties or no winner
        embed.addFields({
            name: `${EMOJIS.MONEY} Betting Results`,
            value: `Since there was no clear winner, all ${challenge.bets.length} bets (${challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0)} GP) were returned to their owners.`
        });
    }
}

/**
 * Create an overview embed for the Arena system
 * @param {Object} stats - Stats about active challenges and bets
 * @returns {Object} - Discord embed object
 */
export function createArenaOverviewEmbed(stats) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING) // YELLOW for overview
        .setTitle(`${EMOJIS.ARENA} Arena System - Quick Guide`)
        .setDescription(
            'The Arena lets you challenge other members to competitions on RetroAchievements leaderboards. ' +
            'Win GP by beating your opponents or betting on winners!'
        );
        
    // Add command information
    embed.addFields({
        name: '📋 How to Participate',
        value: 
            '• **Challenge:** Use `/arena` and select "Challenge User"\n' +
            '• **Browse Challenges:** Use `/arena` and select "Browse Open Challenges"\n' +
            '• **Place Bets:** Use `/arena` and select "Place a Bet"\n' +
            '• **View Challenges:** Check out the Arena Feed channel'
    });
    
    // Add betting information
    embed.addFields({
        name: `${EMOJIS.MONEY} Betting System`,
        value: 
            '• All bets go into the prize pool\n' +
            '• If your player wins, you get your bet back plus a share of losing bets\n' +
            '• Your share is proportional to how much you bet\n' +
            '• Betting closes 72 hours after a challenge starts\n' +
            '• Max bet: 100 GP per challenge'
    });
    
    // Add stats if provided
    if (stats) {
        embed.addFields({
            name: '📊 Current Activity',
            value: 
                `• **Active Challenges:** ${stats.activeCount || 0}\n` +
                `• **Total Prize Pool:** ${stats.totalPrizePool || 0} GP\n` +
                `• **Open Challenges:** ${stats.openCount || 0}\n` +
                `• **Active Bets:** ${stats.totalBets || 0}`
        });
    }
    
    return embed;
}

/**
 * Create an embed for completed challenge results
 * @param {Object} challenge - The challenge object
 * @param {number} durationDays - Duration in days for display
 * @returns {Object} - Discord embed object
 */
export function createCompletedChallengeEmbed(challenge, durationDays) {
    const embed = new EmbedBuilder();
    
    // Set color based on challenge type
    if (challenge.isOpenChallenge) {
        embed.setColor(COLORS.PRIMARY); // Blue for open challenges
    } else {
        embed.setColor(COLORS.DANGER);  // Red for direct challenges
    }
        
    if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
        createCompletedOpenChallengeEmbed(challenge, embed, durationDays);
    } else {
        createCompletedDirectChallengeEmbed(challenge, embed, durationDays);
    }
    
    embed.setTimestamp();
    
    // Add betting results using the existing function
    addBettingResultsToEmbed(challenge, embed);
    
    return embed;
}

/**
 * Helper to create embed for completed open challenges
 * @private
 */
function createCompletedOpenChallengeEmbed(challenge, embed, durationDays) {
    // Set title for open challenge
    embed.setTitle(`🏁 Completed Open Challenge: ${challenge.gameTitle}`);
    embed.setDescription(`**Creator:** ${challenge.challengerUsername}`);
    
    // Add description if available
    if (challenge.description) {
        embed.addFields({ name: 'Description', value: challenge.description });
    }
    
    // Calculate participant count and total pot
    const participantCount = challenge.participants.length + 1; // +1 for creator
    const wagerPool = challenge.wagerAmount * participantCount;
    
    // Add challenge details
    embed.addFields({
        name: 'Challenge Details',
        value: `**Wager:** ${challenge.wagerAmount} GP per player\n` +
            `**Total Participants:** ${participantCount}\n` +
            `**Duration:** ${durationDays} days\n` +
            `**Started:** ${challenge.startDate.toLocaleString()}\n` +
            `**Ended:** ${challenge.endDate.toLocaleString()}\n\n` +
            `**Result:** ${challenge.winnerUsername === 'Tie' || !challenge.winnerUsername ? 
                'No clear winner determined.' : 
                `${challenge.winnerUsername} won!`}`
    });
    
    // Add thumbnail if available
    if (challenge.iconUrl) {
        embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
    }
    
    // Add final scores for all participants
    let scoresText = '';
    
    // Get all participants and add the creator
    const allParticipants = [
        {
            username: challenge.challengerUsername,
            score: challenge.challengerScore || 'No score',
            isCreator: true,
            isWinner: challenge.winnerUsername === challenge.challengerUsername
        }
    ];
    
    // Add all participants
    if (challenge.participants) {
        challenge.participants.forEach(participant => {
            allParticipants.push({
                username: participant.username,
                score: participant.score || 'No score',
                isCreator: false,
                isWinner: challenge.winnerUsername === participant.username
            });
        });
    }
    
    // Sort with winner first, then creator, then others
    allParticipants.sort((a, b) => {
        if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
        if (a.isCreator !== b.isCreator) return a.isCreator ? -1 : 1;
        return a.username.localeCompare(b.username);
    });
    
    // Format scores with medal emojis for top 3
    allParticipants.forEach((participant, index) => {
        const creatorTag = participant.isCreator ? ' (Creator)' : '';
        const medalEmoji = participant.isWinner ? `${EMOJIS.WINNER} ` : 
                         (index === 0 ? `${EMOJIS.RANK_1} ` : 
                          index === 1 ? `${EMOJIS.RANK_2} ` : 
                          index === 2 ? `${EMOJIS.RANK_3} ` : '');
        
        scoresText += `${medalEmoji}**${participant.username}${creatorTag}**: ${participant.score}\n`;
    });
    
    embed.addFields({
        name: `${EMOJIS.CHART} Final Scores`,
        value: scoresText
    });
}

/**
 * Helper to create embed for completed direct challenges
 * @private
 */
function createCompletedDirectChallengeEmbed(challenge, embed, durationDays) {
    // Regular 1v1 challenge completion
    embed.setTitle(`🏁 Completed Challenge: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`);
    embed.setDescription(`**Game:** ${challenge.gameTitle}`);
    
    // Add description if available
    if (challenge.description) {
        embed.addFields({ name: 'Description', value: challenge.description });
    }
    
    // Add challenge details
    embed.addFields({
        name: 'Challenge Details',
        value: `**Wager:** ${challenge.wagerAmount} GP each\n` +
            `**Duration:** ${durationDays} days\n` +
            `**Started:** ${challenge.startDate.toLocaleString()}\n` +
            `**Ended:** ${challenge.endDate.toLocaleString()}\n\n` +
            `**Result:** ${challenge.winnerUsername === 'Tie' ? 'The challenge ended in a tie!' : `${challenge.winnerUsername} won!`}`
    });
    
    // Add thumbnail if available
    if (challenge.iconUrl) {
        embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
    }
    
    // Format participants with the winner first
    const participants = [
        {
            username: challenge.challengerUsername,
            score: challenge.challengerScore || 'No score',
            isWinner: challenge.winnerUsername === challenge.challengerUsername
        },
        {
            username: challenge.challengeeUsername,
            score: challenge.challengeeScore || 'No score',
            isWinner: challenge.winnerUsername === challenge.challengeeUsername
        }
    ];
    
    // Sort with winner first
    participants.sort((a, b) => a.isWinner === b.isWinner ? 0 : (a.isWinner ? -1 : 1));
    
    // Add final scores with medal emojis
    let scoresText = '';
    participants.forEach((participant, index) => {
        const medalEmoji = participant.isWinner ? `${EMOJIS.WINNER} ` : 
                         (index === 0 ? `${EMOJIS.RANK_1} ` : `${EMOJIS.RANK_2} `);
                         
        scoresText += `${medalEmoji}**${participant.username}**: ${participant.score}\n`;
    });
    
    embed.addFields({
        name: `${EMOJIS.CHART} Final Scores`,
        value: scoresText
    });
}

/**
 * Calculate betting odds based on current bets
 * @param {Array} bets - Array of bet objects
 * @param {string} targetPlayerName - Name of player to calculate odds for
 * @returns {Object} - Odds information
 */
export function calculateBettingOdds(bets, targetPlayerName) {
    if (!bets || bets.length === 0) {
        return { 
            odds: '1:1', 
            description: 'No bets placed yet. House guarantee: 50% profit if you win.' 
        };
    }
    
    // Group bets by player
    const betsByPlayer = {};
    let totalBetAmount = 0;
    
    bets.forEach(bet => {
        betsByPlayer[bet.targetPlayer] = (betsByPlayer[bet.targetPlayer] || 0) + bet.betAmount;
        totalBetAmount += bet.betAmount;
    });
    
    // If only one player has bets
    const playerNames = Object.keys(betsByPlayer);
    if (playerNames.length === 1) {
        return {
            odds: '1:1',
            description: `All ${totalBetAmount} GP has been bet on ${playerNames[0]}. House guarantee: 50% profit if you win.`
        };
    }
    
    // Calculate odds for target player
    const targetAmount = betsByPlayer[targetPlayerName] || 0;
    const opposingAmount = totalBetAmount - targetAmount;
    
    if (targetAmount === 0) {
        // Calculate simple odds
        const ratio = (opposingAmount / 100).toFixed(2);
        return {
            odds: `${ratio}:1`,
            description: `Bet 100 GP to win approximately ${Math.floor(opposingAmount)} GP if ${targetPlayerName} wins.`
        };
    } else {
        // Calculate payout ratio
        const ratio = (opposingAmount / targetAmount).toFixed(2);
        return {
            odds: `${ratio}:1`,
            description: `Current pot distribution: ${targetAmount} GP on ${targetPlayerName}, ${opposingAmount} GP against.`
        };
    }
}

// Export all functions as a default object for backward compatibility
export default {
    formatTimeRemaining,
    calculateBettingOdds,
    isTimeBasedLeaderboard,
    getEstimatedWinner,
    getLeaderboardEntries,
    findUserInLeaderboard,
    processLeaderboardEntries,
    checkPositionChanges,
    checkPositionChangesWithParticipants,
    createChallengeEmbed,
    addBettingResultsToEmbed,
    createArenaOverviewEmbed,
    createCompletedChallengeEmbed
};
