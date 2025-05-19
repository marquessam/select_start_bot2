// src/utils/arenaUtils.js
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
 * @param {string} description - Challenge description to analyze
 * @returns {boolean} - True if time-based, false if score-based
 */
export function isTimeBasedLeaderboard(description) {
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
    
    return false;
}

/**
 * Get estimated winner based on current scores
 * @param {Object} challengerScore - Challenger's score info
 * @param {Object} challengeeScore - Challengee's score info
 * @param {boolean} isTimeBased - Whether leaderboard is time-based
 * @returns {string|null} - Username of estimated winner or null if can't determine
 */
export function getEstimatedWinner(challengerScore, challengeeScore, isTimeBased) {
    // If either player doesn't have a score, can't determine
    if (!challengerScore.exists || !challengeeScore.exists) {
        return null;
    }
    
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
 * @returns {number} - Time in seconds, or 0 if invalid format
 */
export function parseTimeToSeconds(timeString) {
    if (!timeString) return 0;
    
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
        return 0;
    }
    
    return hours * 3600 + minutes * 60 + seconds + milliseconds;
}

export default {
    formatTimeRemaining,
    formatGP,
    calculateBettingOdds,
    isTimeBasedLeaderboard,
    getEstimatedWinner,
    parseTimeToSeconds
};