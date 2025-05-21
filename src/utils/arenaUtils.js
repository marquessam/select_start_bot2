// src/utils/arenaUtils.js
import { EmbedBuilder } from 'discord.js';
import { 
    COLORS, 
    EMOJIS, 
    formatTimeRemaining, 
    parseTimeToSeconds, 
    parseScoreString, 
    isTimeBasedLeaderboard 
} from './FeedUtils.js';
import RetroAPIUtils from './RetroAPIUtils.js';

// Re-export functions from FeedUtils for backward compatibility
export { formatTimeRemaining, parseTimeToSeconds, parseScoreString, isTimeBasedLeaderboard };

/**
 * Get leaderboard entries - re-export for compatibility
 */
export const getLeaderboardEntries = RetroAPIUtils.getLeaderboardEntries;

/**
 * Process raw leaderboard entries
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
 * Find a user in leaderboard entries - re-export for compatibility
 */
export const findUserInLeaderboard = RetroAPIUtils.findUserInLeaderboard;

/**
 * Get estimated winner based on current scores
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
    
    // First use ApiRank for determining winner
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
    const isTimeBasedChallenge = isTimeBasedLeaderboard(challenge);
    
    // For time-based leaderboards, lower value is better
    if (isTimeBasedChallenge) {
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
        const isTimeBasedChallenge = isTimeBasedLeaderboard(challenge);
        
        // Parse the numerical values for comparison
        let previousChallengerValue, previousChallengeeValue, currentChallengerValue, currentChallengeeValue;
        
        if (isTimeBasedChallenge) {
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
 * @returns {Object} - Discord embed object
 */
export function createChallengeEmbed(challenge, challengerScore, challengeeScore, participantScores) {
    // Calculate time remaining
    const now = new Date();
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
    
    // Add creator's score information
    if (challengerScore.exists) {
        const rankDisplay = challengerScore.rank ? ` (Rank: #${challengerScore.rank})` : '';
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
    const isTimeBasedChallenge = isTimeBasedLeaderboard(challenge);
    
    // Sort participants
    allParticipants.sort((a, b) => {
        // Put participants with scores first
        if (a.exists && !b.exists) return -1;
        if (!a.exists && b.exists) return 1;
        
        // If both have scores, sort by rank or score
        if (a.exists && b.exists) {
            if (a.rank !== 999999 && b.rank !== 999999) {
                return a.rank - b.rank; // Lower rank is better
            } else if (isTimeBasedChallenge) {
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
            const prefixEmoji = index === 0 ? `${EMOJIS.CROWN} ` : '';
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
    participants.forEach((participant) => {
        // Use crown for leader, nothing for others
        const prefixEmoji = participant.isLeader ? `${EMOJIS.CROWN} ` : '';
        const rankDisplay = participant.rank < 999999 ? ` (Rank: #${participant.rank})` : '';
        
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
