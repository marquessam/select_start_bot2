// src/utils/FeedUtils.js
import { EmbedBuilder } from 'discord.js';

// Standard colors for embeds
export const COLORS = {
    PRIMARY: '#3498DB',      // Blue - primary color
    SUCCESS: '#2ECC71',      // Green - success/completed
    WARNING: '#F1C40F',      // Yellow - warnings/alerts
    DANGER: '#E74C3C',       // Red - errors/failures
    INFO: '#9B59B6',         // Purple - information
    NEUTRAL: '#95A5A6',      // Gray - neutral/inactive
    GOLD: '#FFD700',         // Gold - special achievements
    SILVER: '#C0C0C0',       // Silver
    BRONZE: '#CD7F32',       // Bronze
    ERROR: '#FF0000'         // Red - errors/failures (alias)
};

// Standard emojis (updated with tiebreaker-breaker support)
export const EMOJIS = {
    // Rank emojis
    RANK_1: '🥇',
    RANK_2: '🥈',
    RANK_3: '🥉',
    
    // Award emojis
    MASTERY: '✨',
    BEATEN: '⭐',
    PARTICIPATION: '🏁',
    
    // Competition emojis
    TIEBREAKER: '⚔️',
    TIEBREAKER_BREAKER: '⚡', // Lightning bolt for tiebreaker-breaker
    
    // Status emojis
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    
    // General emojis
    WINNER: '🏆',
    CROWN: '👑',
    GAME: '🎮',
    ARCADE: '🕹️',
    RACING: '🏎️',
    ARENA: '🏟️',
    CHART: '📊',
    MONEY: '💰',
    
    // Action emojis
    UP_ARROW: '⬆️',
    DOWN_ARROW: '⬇️',
    FIRE: '🔥',
    TROPHY: '🏆',
    
    // Additional game emojis
    SHADOW: '👥'
};

/**
 * Format time remaining in a human-readable format
 */
export function formatTimeRemaining(endDate) {
    if (!endDate) return 'Unknown';
    
    const now = new Date();
    const remainingMs = endDate - now;
    
    if (remainingMs <= 0) {
        return 'Ended';
    }
    
    const seconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
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
 * Get Discord timestamp string
 */
export function getDiscordTimestamp(date, format = 'f') {
    if (!date) return 'Unknown';
    const timestamp = Math.floor(date.getTime() / 1000);
    return `<t:${timestamp}:${format}>`;
}

/**
 * Create standard header for feeds
 */
export function createHeaderEmbed(title, description, options = {}) {
    const {
        color = COLORS.PRIMARY,
        thumbnail = null,
        footer = null,
        timestamp = true,
        url = null,
        fields = null
    } = options;
    
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(description);
    
    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }
    
    if (url) {
        embed.setURL(url);
    }
    
    if (footer) {
        embed.setFooter(footer);
    }
    
    if (fields) {
        embed.addFields(fields);
    }
    
    if (timestamp) {
        embed.setTimestamp();
    }
    
    return embed;
}

/**
 * Create standard leaderboard embed
 */
export function createLeaderboardEmbed(title, entries, options = {}) {
    const {
        color = COLORS.PRIMARY,
        fieldName = 'Leaderboard',
        maxEntries = 10,
        showValues = true,
        thumbnail = null,
        description = '',
        footer = null,
        pageNumber = 1,
        totalPages = 1
    } = options;
    
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color);
    
    if (description) {
        embed.setDescription(description);
    }
    
    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }
    
    // Format leaderboard entries
    let leaderboardText = '';
    
    if (entries && entries.length > 0) {
        entries.slice(0, maxEntries).forEach((entry, index) => {
            const rank = entry.rank || index + 1;
            const rankEmoji = rank <= 3 ? EMOJIS[`RANK_${rank}`] : `#${rank}`;
            
            let line = `${rankEmoji} **${entry.name}**`;
            
            if (entry.award) {
                line += ` ${entry.award}`;
            }
            
            if (showValues && entry.value) {
                line += `: ${entry.value}`;
            }
            
            leaderboardText += `${line}\n`;
        });
    } else {
        leaderboardText = 'No entries found.';
    }
    
    // Add pagination info to field name if needed
    let displayFieldName = fieldName;
    if (totalPages > 1) {
        displayFieldName += ` (Page ${pageNumber}/${totalPages})`;
    }
    
    embed.addFields({ name: displayFieldName, value: leaderboardText });
    
    if (footer) {
        embed.setFooter(footer);
    }
    
    return embed;
}

// NEW: Helper function to get rank emoji
export function getRankEmoji(rank) {
    if (rank <= 3) {
        return EMOJIS[`RANK_${rank}`];
    }
    return `#${rank}`;
}

// NEW: Helper function to get award emoji
export function getAwardEmoji(points) {
    if (points === 7) return EMOJIS.MASTERY;
    if (points === 4) return EMOJIS.BEATEN;
    if (points === 1) return EMOJIS.PARTICIPATION;
    return '';
}

// NEW: Helper function to format tiebreaker display
export function formatTiebreakerDisplay(user, showOnlyTop5 = true) {
    let display = '';
    
    // Only show tiebreaker info for top 5 if specified
    if (!showOnlyTop5 || user.displayRank <= 5) {
        if (user.hasTiebreaker && user.tiebreakerScore) {
            display += `${EMOJIS.TIEBREAKER} ${user.tiebreakerScore}`;
            if (user.tiebreakerGame) {
                display += ` in ${user.tiebreakerGame}`;
            }
            display += '\n';
        }
        
        if (user.hasTiebreakerBreaker && user.tiebreakerBreakerScore) {
            display += `${EMOJIS.TIEBREAKER_BREAKER} ${user.tiebreakerBreakerScore}`;
            if (user.tiebreakerBreakerGame) {
                display += ` in ${user.tiebreakerBreakerGame}`;
            }
            display += '\n';
        }
    }
    
    return display;
}

// NEW: Helper function to create comprehensive user display text
export function formatUserDisplayText(user, totalAchievements, showOnlyTop5Tiebreakers = true) {
    let displayText = '';
    
    // Rank and username
    const rankEmoji = getRankEmoji(user.displayRank);
    const award = getAwardEmoji(user.points);
    
    displayText += `${rankEmoji} **[${user.username}](https://retroachievements.org/user/${user.username})** ${award}\n`;
    
    // Achievement stats
    displayText += `${user.achieved || user.achievements}/${totalAchievements} (${user.percentage}%)\n`;
    
    // Tiebreaker information
    displayText += formatTiebreakerDisplay(user, showOnlyTop5Tiebreakers);
    
    return displayText;
}

// NEW: Helper function to validate tiebreaker-breaker configuration
export function validateTiebreakerBreakerConfig(tiebreakerLeaderboardId, tiebreakerBreakerLeaderboardId) {
    if (!tiebreakerBreakerLeaderboardId) {
        return { valid: true, data: null };
    }
    
    if (tiebreakerLeaderboardId === tiebreakerBreakerLeaderboardId) {
        return {
            valid: false,
            error: 'Tiebreaker and tiebreaker-breaker cannot use the same leaderboard'
        };
    }
    
    return { valid: true };
}

// NEW: Helper function to format tiebreaker description for embeds
export function formatTiebreakerDescription(tiebreakerInfo) {
    if (!tiebreakerInfo || !tiebreakerInfo.isActive) {
        return null;
    }
    
    let description = `${EMOJIS.TIEBREAKER} **Tiebreaker Game:** ${tiebreakerInfo.gameTitle}\n` +
                     `*Tiebreaker results are used to determine final ranking for tied users in top positions.*`;
    
    if (tiebreakerInfo.hasTiebreakerBreaker) {
        description += `\n${EMOJIS.TIEBREAKER_BREAKER} **Tiebreaker-Breaker Game:** ${tiebreakerInfo.tiebreakerBreakerGameTitle}\n` +
                      `*Used to resolve ties within the tiebreaker itself.*`;
    }
    
    return description;
}

/**
 * Parse a score string into numeric value
 */
export function parseScoreString(scoreString) {
    if (!scoreString || scoreString === 'No score yet') {
        return -1;
    }
    
    // Remove non-numeric characters (except decimal point)
    return parseFloat(scoreString.replace(/[^\d.-]/g, '')) || 0;
}

/**
 * Parse a time string (e.g. "1:23.456") into seconds
 */
export function parseTimeToSeconds(timeString) {
    if (!timeString || timeString === 'No score yet') {
        return Infinity;
    }
    
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
 * Check if a leaderboard is time-based (lower is better)
 */
export function isTimeBasedLeaderboard(challenge) {
    const description = typeof challenge === 'string' ? challenge : 
                      (challenge.description || challenge.gameTitle || '');
    
    if (!description) return false;
    
    const timeKeywords = [
        'time', 'fastest', 'quickest', 'speed', 'speedrun', 'quick', 'race'
    ];
    
    const descLower = description.toLowerCase();
    
    // Check for time keywords
    for (const keyword of timeKeywords) {
        if (descLower.includes(keyword)) {
            return true;
        }
    }
    
    // Check for time format in scores
    if (typeof challenge === 'object') {
        if (challenge.challengerScore && challenge.challengerScore.includes(':')) {
            return true;
        }
        
        if (challenge.challengeeScore && challenge.challengeeScore.includes(':')) {
            return true;
        }
    }
    
    return false;
}

export default {
    COLORS,
    EMOJIS,
    formatTimeRemaining,
    getDiscordTimestamp,
    createHeaderEmbed,
    createLeaderboardEmbed,
    getRankEmoji,
    getAwardEmoji,
    formatTiebreakerDisplay,
    formatUserDisplayText,
    validateTiebreakerBreakerConfig,
    formatTiebreakerDescription,
    parseScoreString,
    parseTimeToSeconds,
    isTimeBasedLeaderboard
};
