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
    
    // FIXED: Always use ApiRank for determining winner
    // Lower ApiRank is better (1st place is better than 2nd)
    if (challengerScore.rank && challengeeScore.rank) {
        // Global rank comparison - LOWER IS BETTER
        if (challengerScore.rank < challengeeScore.rank) {
            return challengerScore.username;
        } else if (challengeeScore.rank < challengerScore.rank) {
            return challengeeScore.username;
        }
        // If ranks are equal (extremely unlikely), fall through to time/score comparison
    }
    
    // Fallback to value-based comparison if ranks aren't available
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
        // Only fetch up to rank 1000 as requested
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
            } else if (batch1.data && Array.isArray(batch1.data)) {
                rawEntries = [...rawEntries, ...batch1.data];
            } else if (typeof batch1 === 'object') {
                // Try to extract entries from unknown format
                const possibleEntries = Object.values(batch1).find(val => Array.isArray(val));
                if (possibleEntries) {
                    rawEntries = [...rawEntries, ...possibleEntries];
                }
            }
        }
        
        // Process second batch
        if (batch2) {
            if (Array.isArray(batch2)) {
                rawEntries = [...rawEntries, ...batch2];
            } else if (batch2.Results && Array.isArray(batch2.Results)) {
                rawEntries = [...rawEntries, ...batch2.Results];
            } else if (batch2.data && Array.isArray(batch2.data)) {
                rawEntries = [...rawEntries, ...batch2.data];
            } else if (typeof batch2 === 'object') {
                // Try to extract entries from unknown format
                const possibleEntries = Object.values(batch2).find(val => Array.isArray(val));
                if (possibleEntries) {
                    rawEntries = [...rawEntries, ...possibleEntries];
                }
            }
        }
        
        // Debug log the count of entries
        console.log(`Retrieved ${rawEntries.length} entries for leaderboard ${leaderboardId}`);
        
        return rawEntries;
    } catch (error) {
        console.error('Error fetching leaderboard entries:', error);
        return [];
    }
}

/**
 * Find a user in leaderboard entries with improved matching
 * @param {Array} entries - Leaderboard entries
 * @param {string} username - Username to find
 * @returns {Object|null} - Found entry or null
 */
export function findUserInLeaderboard(entries, username) {
    if (!entries || !Array.isArray(entries) || entries.length === 0 || !username) {
        return null;
    }
    
    // Try exact match first (case insensitive)
    const exactMatch = entries.find(entry => {
        const entryUser = entry.User || entry.user || '';
        return entryUser.toLowerCase() === username.toLowerCase();
    });
    
    if (exactMatch) return exactMatch;
    
    // If no exact match, try fuzzy matching (for usernames with spaces or special chars)
    const fuzzyMatch = entries.find(entry => {
        const entryUser = entry.User || entry.user || '';
        // Replace spaces and special chars for comparison
        const normalizedEntry = entryUser.toLowerCase().replace(/[_\s-]+/g, '');
        const normalizedUsername = username.toLowerCase().replace(/[_\s-]+/g, '');
        return normalizedEntry === normalizedUsername;
    });
    
    return fuzzyMatch;
}

/**
 * Process raw leaderboard entries into a consistent format
 * @param {Array} rawEntries - Raw entries from RetroAchievements API
 * @param {boolean} isTimeBased - Whether the leaderboard is time-based (lower is better)
 * @returns {Array} - Processed entries
 */
export function processLeaderboardEntries(rawEntries, isTimeBased = false) {
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
    
    // Sort entries based on their original API Rank (global rank)
    entries.sort((a, b) => a.ApiRank - b.ApiRank);
    
    // Log the number of processed entries
    console.log(`Processed ${entries.length} valid leaderboard entries`);
    
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
    
    // Check if ranks have changed
    if (challengerScore.rank && challengeeScore.rank) {
        // Get previous ranks
        let previousChallengerRank = Infinity;
        let previousChallengeeRank = Infinity;
        
        // Try to extract ranks from previous state
        // This would only work if we stored ranks earlier, but we'll improve it gradually
        
        // Fall back to checking if the leader changed based on score values        
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
    }
    
    return positionChange;
}

/**
 * Create a challenge embed for Discord
 * @param {Object} challenge - The challenge object
 * @param {Object} challengerScore - Challenger's score info
 * @param {Object|null} challengeeScore - Challengee's score info (may be null for open challenges)
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
    
    // Sort participants by rank first, then by score
    const allParticipants = [];
    
    // Add creator with rank
    allParticipants.push({
        username: challenge.challengerUsername,
        isCreator: true,
        score: challengerScore.formattedScore,
        rank: challengerScore.rank || 999999,
        exists: challengerScore.exists
    });
    
    // Add each participant
    if (challenge.participants) {
        challenge.participants.forEach(participant => {
            const scoreInfo = participantScores?.get?.(participant.username.toLowerCase());
            const score = scoreInfo?.formattedScore || participant.score || 'No score yet';
            const rank = scoreInfo?.rank || 0;
            
            allParticipants.push({
                username: participant.username,
                isCreator: false,
                score: score,
                rank: rank || 999999,
                exists: !!scoreInfo?.exists
            });
        });
    }
    
    // Determine if time-based for sorting
    const isTimeBased = isTimeBasedLeaderboard(challenge);
    
    // Sort participants by:
    // 1. First by who has scores (exists flag)
    // 2. Then by global rank or score value
    allParticipants.sort((a, b) => {
        // Put participants with scores first
        if (a.exists && !b.exists) return -1;
        if (!a.exists && b.exists) return 1;
        
        // If both have scores, sort by rank or score
        if (a.exists && b.exists) {
            if (a.rank !== 999999 && b.rank !== 999999) {
                return a.rank - b.rank; // Lower rank is better
            } else if (isTimeBased) {
                const aValue = parseTimeToSeconds(a.score);
                const bValue = parseTimeToSeconds(b.score);
                return aValue - bValue; // Lower time is better
            } else {
                const aValue = parseScoreString(a.score);
                const bValue = parseScoreString(b.score);
                return bValue - aValue; // Higher score is better
            }
        }
        
        return 0; // No preference if neither has scores
    });
    
    // Create standings field with crown for the leader
    let participantsText = '';
    
    allParticipants.forEach((participant, index) => {
        if (participant.exists) {
            // Add crown emoji only for the top position (leader)
            const prefixEmoji = index === 0 ? '👑 ' : '';
            const creatorTag = participant.isCreator ? ' (Creator)' : '';
            const rankDisplay = participant.rank < 999999 ? ` (Rank: #${participant.rank})` : '';
            
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
    
    // Calculate total pot (more concise)
    const wagerPool = challenge.wagerAmount * (challenge.participants.length + 1); // all participants + creator
    const betPool = challenge.bets ? challenge.bets.reduce((sum, bet) => sum + bet.betAmount, 0) : 0;
    
    // Add betting info section
    embed.addFields({
        name: '💰 Bets',
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
    
    // Calculate status text based on correct leader
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
    
    // Add current scores with crown notation
    // Sort challenger and challengee by rank or score
    const participants = [
        {
            username: challenge.challengerUsername,
            score: challengerScore.formattedScore,
            rank: challengerScore.rank || 999999,
            exists: challengerScore.exists,
            isLeader: leader === challenge.challengerUsername
        },
        {
            username: challenge.challengeeUsername,
            score: challengeeScore.formattedScore,
            rank: challengeeScore.rank || 999999,
            exists: challengeeScore.exists,
            isLeader: leader === challenge.challengeeUsername
        }
    ];
    
    // Sort by rank first (lower is better)
    participants.sort((a, b) => {
        if (a.exists && !b.exists) return -1;
        if (!a.exists && b.exists) return 1;
        
        if (a.exists && b.exists) {
            if (a.rank !== 999999 && b.rank !== 999999) {
                return a.rank - b.rank;
            }
        }
        
        // Default to showing the leader first
        return (a.isLeader === b.isLeader) ? 0 : (a.isLeader ? -1 : 1);
    });
    
    let scoresText = '';
    participants.forEach((participant, index) => {
        // Use crown for leader, nothing for others
        const prefixEmoji = participant.isLeader ? '👑 ' : '';
        const rankDisplay = participant.rank < 999999 ? ` (Rank: #${participant.rank})` : '';
        
        scoresText += `${prefixEmoji}**${participant.username}:** ${participant.score}${rankDisplay}\n`;
    });
    
    embed.addFields({
        name: '📊 Current Scores',
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
        name: '💰 Bets',
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

/**
 * Create an overview embed for the Arena system
 * @param {Object} EmbedBuilder - Discord.js EmbedBuilder class
 * @param {Object} stats - Stats about active challenges and bets
 * @returns {Object} - Discord embed object
 */
export function createArenaOverviewEmbed(EmbedBuilder, stats) {
    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('🏟️ Arena System - Quick Guide')
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
        name: '💰 Betting System',
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
 * @param {Object} EmbedBuilder - Discord.js EmbedBuilder class
 * @param {number} durationDays - Duration in days for display
 * @returns {Object} - Discord embed object
 */
export function createCompletedChallengeEmbed(challenge, EmbedBuilder, durationDays) {
    const embed = new EmbedBuilder()
        .setColor('#27AE60'); // Green for completed challenges
        
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
        const medalEmoji = participant.isWinner ? '🏆 ' : 
                         (index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : '');
        
        scoresText += `${medalEmoji}**${participant.username}${creatorTag}**: ${participant.score}\n`;
    });
    
    embed.addFields({
        name: '📊 Final Scores',
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
        const medalEmoji = participant.isWinner ? '🏆 ' : 
                         (index === 0 ? '🥇 ' : '🥈 ');
                         
        scoresText += `${medalEmoji}**${participant.username}**: ${participant.score}\n`;
    });
    
    embed.addFields({
        name: '📊 Final Scores',
        value: scoresText
    });
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
    findUserInLeaderboard,
    processLeaderboardEntries,
    checkPositionChanges,
    createChallengeEmbed,
    addBettingResultsToEmbed,
    createArenaOverviewEmbed,
    createCompletedChallengeEmbed
};
