// src/utils/arenaUtils.js
import retroAPI from '../services/retroAPI.js';

/**
 * Utility functions for the Arena system
 */

/**
 * Format time remaining in a human-readable format
 * @param {Date} endDate - The date to calculate time remaining until
 * @returns {string} - Formatted time remaining string
 */
export function formatTimeRemaining(endDate) {
    if (!endDate) return 'Unknown';
    
    const now = new Date();
    const remainingMs = endDate - now;
    
    // If time has passed
    if (remainingMs <= 0) {
        return 'Ended';
    }
    
    // Calculate time components
    const seconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    // Format the output based on how much time is left
    if (days > 7) {
        const weeks = Math.floor(days / 7);
        const remainingDays = days % 7;
        if (remainingDays === 0) {
            return `${weeks} week${weeks !== 1 ? 's' : ''}`;
        }
        return `${weeks} week${weeks !== 1 ? 's' : ''}, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
    } 
    else if (days > 0) {
        const remainingHours = hours % 24;
        if (remainingHours === 0) {
            return `${days} day${days !== 1 ? 's' : ''}`;
        }
        return `${days} day${days !== 1 ? 's' : ''}, ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
    } 
    else if (hours > 0) {
        const remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        return `${hours} hour${hours !== 1 ? 's' : ''}, ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    } 
    else {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
}

/**
 * Format a GP amount with commas for thousands
 * @param {number} amount - GP amount to format
 * @returns {string} - Formatted GP string
 */
export function formatGP(amount) {
    return amount.toLocaleString();
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

/**
 * Check if a leaderboard is time-based (lower is better) or score-based (higher is better)
 * @param {Object|string} challenge - Challenge object or description
 * @returns {boolean} - True if time-based, false if score-based
 */
export function isTimeBasedLeaderboard(challenge) {
    // Handle both cases where we get a challenge object or directly a description string
    const description = typeof challenge === 'string' ? challenge : 
                       (challenge.description || challenge.gameTitle || '');
    
    if (!description) return false;
    
    const timeKeywords = [
        'time', 'fastest', 'quickest', 'speed', 'speedrun', 'quick', 'race',
        'second', 'seconds', 'minute', 'minutes', 'fps', 'frame', 'frames'
    ];
    
    const descLower = description.toLowerCase();
    
    // Check for time keywords
    for (const keyword of timeKeywords) {
        if (descLower.includes(keyword)) {
            return true;
        }
    }
    
    // Check for time format patterns (00:00.00, 00'00"00, etc.)
    const timePatterns = [
        /\d+:\d+/, // 00:00
        /\d+'\d+"/, // 00'00"
        /\d+m\s*\d+s/, // 00m 00s
    ];
    
    for (const pattern of timePatterns) {
        if (pattern.test(descLower)) {
            return true;
        }
    }
    
    // Check scores if we have a challenge object
    if (typeof challenge === 'object') {
        // Check if scores contain time format
        if (challenge.challengerScore && challenge.challengerScore.includes(':')) {
            return true;
        }
        
        if (challenge.challengeeScore && challenge.challengeeScore.includes(':')) {
            return true;
        }
    }
    
    return false;
}

/**
 * Get estimated winner based on current scores
 * @param {Object} challenge - Challenge object
 * @param {Object} challengerScore - Challenger's score info
 * @param {Object} challengeeScore - Challengee's score info
 * @returns {string|null} - Username of estimated winner or null if can't determine
 */
export function getEstimatedWinner(challenge, challengerScore, challengeeScore) {
    // Add usernames if needed
    challengerScore.username = challenge.challengerUsername;
    challengeeScore.username = challenge.challengeeUsername;
    
    // If either player doesn't have a score, can't determine
    if (!challengerScore.exists || !challengeeScore.exists) {
        return null;
    }
    
    const isTimeBased = isTimeBasedLeaderboard(challenge);
    
    // For time-based leaderboards, lower value is better
    if (isTimeBased) {
        if (challengerScore.value < challengeeScore.value) {
            return challengerScore.username;
        } else if (challengeeScore.value < challengerScore.value) {
            return challengeeScore.username;
        }
    } 
    // For score-based leaderboards, higher value is better
    else {
        if (challengerScore.value > challengeeScore.value) {
            return challengerScore.username;
        } else if (challengeeScore.value > challengerScore.value) {
            return challengeeScore.username;
        }
    }
    
    // Scores are equal
    return 'Tie';
}

/**
 * Parse a formatted time string into seconds
 * @param {string} timeString - Time string to parse (e.g. "1:23.456")
 * @returns {number} - Time in seconds, or Infinity if invalid format
 */
export function parseTimeToSeconds(timeString) {
    if (!timeString || timeString === 'No score yet' || timeString === 'No entry') {
        return Infinity;
    }
    
    // Try to handle various time formats
    
    // Format: MM:SS.ms or HH:MM:SS.ms
    const colonFormat = /^(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?$/;
    
    // Format: MM'SS"ms
    const quoteFormat = /^(\d+)'(\d+)"(\d+)?$/;
    
    // Format: MMmSSs
    const letterFormat = /^(?:(\d+)m)?(?:(\d+)s)?(?:(\d+)ms)?$/;
    
    let hours = 0, minutes = 0, seconds = 0, milliseconds = 0;
    
    if (colonFormat.test(timeString)) {
        const match = timeString.match(colonFormat);
        if (match[1]) { // HH:MM:SS format
            hours = parseInt(match[1]) || 0;
            minutes = parseInt(match[2]) || 0;
            seconds = parseInt(match[3]) || 0;
            milliseconds = parseInt(match[4] || 0) / Math.pow(10, (match[4] || '').length);
        } else { // MM:SS format
            minutes = parseInt(match[2]) || 0;
            seconds = parseInt(match[3]) || 0;
            milliseconds = parseInt(match[4] || 0) / Math.pow(10, (match[4] || '').length);
        }
    } else if (quoteFormat.test(timeString)) {
        const match = timeString.match(quoteFormat);
        minutes = parseInt(match[1]) || 0;
        seconds = parseInt(match[2]) || 0;
        milliseconds = parseInt(match[3] || 0) / Math.pow(10, (match[3] || '').length);
    } else if (letterFormat.test(timeString)) {
        const match = timeString.match(letterFormat);
        minutes = parseInt(match[1]) || 0;
        seconds = parseInt(match[2]) || 0;
        milliseconds = parseInt(match[3] || 0) / 1000;
    } else {
        // Try to parse as a simple number of seconds
        const asNumber = parseFloat(timeString);
        if (!isNaN(asNumber)) {
            return asNumber;
        }
        return Infinity;
    }
    
    return hours * 3600 + minutes * 60 + seconds + milliseconds;
}

/**
 * Parse score strings into numbers for comparison
 * @param {string} scoreString - Score string
 * @returns {number} - Numeric score
 */
export function parseScoreString(scoreString) {
    if (!scoreString || scoreString === 'No score yet' || scoreString === 'No entry') {
        return -1;
    }
    
    // Try to extract numeric values from the string
    return parseFloat(scoreString.replace(/[^\d.-]/g, '')) || -1;
}

/**
 * Get leaderboard entries from RetroAchievements API
 * @param {string} leaderboardId - The leaderboard ID 
 * @returns {Promise<Array>} - Raw leaderboard entries
 */
export async function getLeaderboardEntries(leaderboardId) {
    try {
        // Fetch leaderboard entries to verify the leaderboard exists
        const batch1 = await retroAPI.getLeaderboardEntriesDirect(leaderboardId, 0, 500);
        const batch2 = await retroAPI.getLeaderboardEntriesDirect(leaderboardId, 500, 500);
        
        // Combine the batches
        let rawEntries = [];
        
        // Process first batch
        if (batch1) {
            if (Array.isArray(batch1)) {
                rawEntries = [...rawEntries, ...batch1];
            } else if (batch1.Results && Array.isArray(batch1.Results)) {
                rawEntries = [...rawEntries, ...batch1.Results];
            }
        }
        
        // Process second batch
        if (batch2) {
            if (Array.isArray(batch2)) {
                rawEntries = [...rawEntries, ...batch2];
            } else if (batch2.Results && Array.isArray(batch2.Results)) {
                rawEntries = [...rawEntries, ...batch2.Results];
            }
        }
        
        return rawEntries;
    } catch (error) {
        console.error('Error fetching leaderboard entries:', error);
        return [];
    }
}

/**
 * Process raw leaderboard entries into a consistent format
 * @param {Array} rawEntries - Raw entries from RetroAchievements API
 * @param {boolean} isTimeBased - Whether the leaderboard is time-based (lower is better)
 * @returns {Array} - Processed entries
 */
export function processLeaderboardEntries(rawEntries, isTimeBased = false) {
    // Process the entries with appropriate handling for different formats
    const entries = rawEntries.map(entry => {
        // Standard properties that most entries have
        const user = entry.User || entry.user || '';
        const score = entry.Score || entry.score || entry.Value || entry.value || 0;
        const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
        const rank = entry.Rank || entry.rank || 0;
        
        return {
            ApiRank: parseInt(rank, 10),
            User: user.trim(),
            RawScore: score,
            FormattedScore: formattedScore.toString().trim() || score.toString(),
            Value: parseFloat(score) || 0
        };
    });
    
    // Sort entries properly based on leaderboard type
    if (isTimeBased) {
        // For time-based leaderboards, lower is better
        entries.sort((a, b) => a.Value - b.Value);
    } else {
        // For score-based leaderboards, higher is better
        entries.sort((a, b) => b.Value - a.Value);
    }
    
    // Reassign ranks based on proper sorting
    entries.forEach((entry, index) => {
        entry.ApiRank = index + 1;
    });
    
    return entries;
}

/**
 * Check for position changes in the leaderboard 
 * @param {Object} challenge - The challenge
 * @param {Object} challengerScore - Challenger's current score
 * @param {Object} challengeeScore - Challengee's current score
 * @param {string} previousChallengerScore - Challenger's previous score
 * @param {string} previousChallengeeScore - Challengee's previous score
 * @returns {Object|null} Position change info or null if no change
 */
export function checkPositionChanges(challenge, challengerScore, challengeeScore, previousChallengerScore, previousChallengeeScore) {
    // Only check if we have previous scores
    if (!previousChallengerScore || !previousChallengeeScore) {
        return null;
    }

    let positionChange = null;
    
    // Determine if it's a time-based leaderboard
    const isTimeBased = isTimeBasedLeaderboard(challenge);
    
    // Parse the numerical values for comparison
    let previousChallengerValue, previousChallengeeValue, currentChallengerValue, currentChallengeeValue;
    
    if (isTimeBased) {
        // Parse times for time-based challenges
        previousChallengerValue = parseTimeToSeconds(previousChallengerScore);
        previousChallengeeValue = parseTimeToSeconds(previousChallengeeScore);
        currentChallengerValue = parseTimeToSeconds(challengerScore.formattedScore);
        currentChallengeeValue = parseTimeToSeconds(challengeeScore.formattedScore);
        
        // For times, lower is better
        // Check if challenger overtook challengee
        if (previousChallengerValue > previousChallengeeValue && currentChallengerValue <= currentChallengeeValue) {
            positionChange = {
                newLeader: challenge.challengerUsername,
                previousLeader: challenge.challengeeUsername
            };
        }
        // Check if challengee overtook challenger
        else if (previousChallengeeValue > previousChallengerValue && currentChallengeeValue <= currentChallengerValue) {
            positionChange = {
                newLeader: challenge.challengeeUsername,
                previousLeader: challenge.challengerUsername
            };
        }
    } else {
        // Parse scores for score-based challenges
        previousChallengerValue = parseScoreString(previousChallengerScore);
        previousChallengeeValue = parseScoreString(previousChallengeeScore);
        currentChallengerValue = parseScoreString(challengerScore.formattedScore);
        currentChallengeeValue = parseScoreString(challengeeScore.formattedScore);
        
        // For scores, higher is better
        // Check if challenger overtook challengee
        if (previousChallengerValue < previousChallengeeValue && currentChallengerValue >= currentChallengeeValue) {
            positionChange = {
                newLeader: challenge.challengerUsername,
                previousLeader: challenge.challengeeUsername
            };
        }
        // Check if challengee overtook challenger
        else if (previousChallengeeValue < previousChallengerValue && currentChallengeeValue >= currentChallengerValue) {
            positionChange = {
                newLeader: challenge.challengeeUsername,
                previousLeader: challenge.challengerUsername
            };
        }
    }
    
    return positionChange;
}

/**
 * Create a challenge embed for Discord
 * @param {Object} challenge - The challenge object
 * @param {Object} challengerScore - Challenger's score info
 * @param {Object} challengeeScore - Challengee's score info
 * @param {Map} participantScores - Map of participant scores (for open challenges)
 * @param {Object} EmbedBuilder - Discord.js EmbedBuilder class
 * @returns {Object} - Discord embed object
 */
export function createChallengeEmbed(challenge, challengerScore, challengeeScore, participantScores, EmbedBuilder) {
    // Calculate time remaining
    const now = new Date();
    const timeLeft = formatTimeRemaining(challenge.endDate);
    
    // Create the embed
    const embed = new EmbedBuilder()
        .setColor(challenge.endDate > now ? '#3498DB' : '#E74C3C');
    
    // Add thumbnail if available
    if (challenge.iconUrl) {
        embed.setThumbnail(`https://retroachievements.org${challenge.iconUrl}`);
    }
    
    // Handle open challenges with participants separately
    if (challenge.isOpenChallenge && challenge.participants && challenge.participants.length > 0) {
        createOpenChallengeEmbed(challenge, challengerScore, participantScores, embed, timeLeft);
    } else {
        createDirectChallengeEmbed(challenge, challengerScore, challengeeScore, embed, timeLeft);
    }
    
    embed.setTimestamp();
    return embed;
}

/**
 * Helper to create embed for open challenges
 * @private
 */
function createOpenChallengeEmbed(challenge, challengerScore, participantScores, embed, timeLeft) {
    // Set title for open challenge
    embed.setTitle(`🏟️ Open Challenge: ${challenge.gameTitle}`);
    embed.setDescription(`**Creator:** ${challenge.challengerUsername}`);
    
    // Add description if available
    if (challenge.description) {
        embed.addFields({ name: 'Description', value: challenge.description });
    }
    
    // Add challenge details
    embed.addFields(
        { name: 'Challenge Details', 
          value: `**Wager:** ${challenge.wagerAmount} GP per player\n` +
                 `**Duration:** ${Math.floor(challenge.durationHours / 24)} days\n` +
                 `**Started:** ${challenge.startDate.toLocaleString()}\n` +
                 `**Ends:** ${challenge.endDate.toLocaleString()} (${timeLeft})\n\n` +
                 `**Participants:** ${challenge.participants.length + 1} total` // +1 for the creator
        }
    );
    
    // Add participants with scores
    let participantsText = '';
    
    // Add creator
    participantsText += `• **${challenge.challengerUsername}** (Creator): ${challengerScore.formattedScore}\n`;
    
    // Add each participant
    if (challenge.participants) {
        challenge.participants.forEach(participant => {
            const score = participantScores?.get?.(participant.username.toLowerCase()) || participant.score || 'No score yet';
            participantsText += `• **${participant.username}**: ${score}\n`;
        });
    }
    
    embed.addFields({
        name: `Participants (${challenge.participants.length + 1})`, 
        value: participantsText
    });
    
    // Calculate total pot
    const wagerPool = challenge.wagerAmount * (challenge.participants.length + 1); // all participants + creator
    const betPool = challenge.bets ? challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0) : 0;
    const totalPool = wagerPool + betPool;
    
    // Add betting info section
    embed.addFields({
        name: '💰 Betting Information',
        value: 
            `**Total Prize Pool:** ${totalPool} GP\n` +
            `• Wager Pool: ${wagerPool} GP\n` +
            `• Betting Pool: ${betPool} GP\n\n` +
            `**Bets Placed:** ${challenge.bets ? challenge.bets.length : 0} total bets\n\n` +
            `Use \`/arena\` and select "Place a Bet" to bet on the outcome!\n` +
            `**Pot Betting:** If your player wins, you get your bet back plus a share of the opposing bets proportional to your bet amount.`
    });
}

/**
 * Helper to create embed for direct challenges
 * @private
 */
function createDirectChallengeEmbed(challenge, challengerScore, challengeeScore, embed, timeLeft) {
    // Determine who's winning
    let winningText = 'The challenge is tied!';
    const estimatedWinner = getEstimatedWinner(challenge, challengerScore, challengeeScore);
    
    if (estimatedWinner === challengerScore.username) {
        winningText = `${challenge.challengerUsername} is in the lead!`;
    } else if (estimatedWinner === challengeeScore.username) {
        winningText = `${challenge.challengeeUsername} is in the lead!`;
    }
    
    // Calculate bet distribution
    const totalBets = challenge.bets ? challenge.bets.length : 0;
    let challengerBets = 0;
    let challengeeBets = 0;
    let challengerBetAmount = 0;
    let challengeeBetAmount = 0;
    
    if (challenge.bets) {
        challenge.bets.forEach(bet => {
            if (bet.targetPlayer === challenge.challengerUsername) {
                challengerBets++;
                challengerBetAmount += bet.betAmount;
            } else if (bet.targetPlayer === challenge.challengeeUsername) {
                challengeeBets++;
                challengeeBetAmount += bet.betAmount;
            }
        });
    }
    
    // Calculate total pot (wagers + bets)
    const wagerPool = challenge.wagerAmount * 2;
    const betPool = challengerBetAmount + challengeeBetAmount;
    const totalPool = wagerPool + betPool;
    
    // Calculate days from hours for display
    const durationDays = Math.floor(challenge.durationHours / 24);
    
    // Set title and description
    embed.setTitle(`🏟️ Arena Challenge: ${challenge.challengerUsername} vs ${challenge.challengeeUsername}`);
    embed.setDescription(`**Game:** ${challenge.gameTitle}`);
    
    // Add description if available
    if (challenge.description) {
        embed.addFields({ name: 'Description', value: challenge.description });
    }
    
    // Add challenge details
    embed.addFields(
        { name: 'Challenge Details', 
          value: `**Wager:** ${challenge.wagerAmount} GP each\n` +
                 `**Duration:** ${durationDays} days\n` +
                 `**Started:** ${challenge.startDate.toLocaleString()}\n` +
                 `**Ends:** ${challenge.endDate.toLocaleString()} (${timeLeft})\n\n` +
                 `**Current Status:** ${winningText}`
        }
    );
    
    // Add current scores
    embed.addFields({
        name: '📊 Current Scores',
        value: 
            `**${challenge.challengerUsername}:** ${challengerScore.formattedScore}\n` +
            `**${challenge.challengeeUsername}:** ${challengeeScore.formattedScore}`
    });
    
    // Add betting info
    embed.addFields({
        name: '💰 Betting Information',
        value: 
            `**Total Prize Pool:** ${totalPool} GP\n` +
            `• Base Wager: ${wagerPool} GP\n` +
            `• Betting Pool: ${betPool} GP\n\n` +
            `**Bets Placed:** ${totalBets} total bets\n` +
            `• On ${challenge.challengerUsername}: ${challengerBets} bets (${challengerBetAmount} GP)\n` +
            `• On ${challenge.challengeeUsername}: ${challengeeBets} bets (${challengeeBetAmount} GP)\n\n` +
            `Use \`/arena\` and select "Place a Bet" to bet on the outcome!\n` +
            `**Pot Betting:** If your player wins, you get your bet back plus a share of the opposing bets proportional to your bet amount.`
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
            name: '💰 Betting Results',
            value: bettingText
        });
    } else {
        // For ties or no winner
        embed.addFields({
            name: '💰 Betting Results',
            value: `Since there was no clear winner, all ${challenge.bets.length} bets (${challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0)} GP) were returned to their owners.`
        });
    }
}

// Export all functions as a default object as well
export default {
    formatTimeRemaining,
    formatGP,
    calculateBettingOdds,
    isTimeBasedLeaderboard,
    getEstimatedWinner,
    parseTimeToSeconds,
    parseScoreString,
    getLeaderboardEntries,
    processLeaderboardEntries,
    checkPositionChanges,
    createChallengeEmbed,
    addBettingResultsToEmbed
};
