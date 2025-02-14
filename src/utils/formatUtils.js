import { EmbedBuilder } from 'discord.js';
import { formatRelativeTime } from './dateUtils.js';

/**
 * Create a standard error embed
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @returns {EmbedBuilder} Discord embed
 */
export const createErrorEmbed = (title, description) => {
    return new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setTimestamp();
};

/**
 * Create a standard success embed
 * @param {string} title - Success title
 * @param {string} description - Success description
 * @returns {EmbedBuilder} Discord embed
 */
export const createSuccessEmbed = (title, description) => {
    return new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setTimestamp();
};

/**
 * Format a percentage
 * @param {number} value - Value to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage
 */
export const formatPercentage = (value, decimals = 2) => {
    return `${value.toFixed(decimals)}%`;
};

/**
 * Format a list of items for display
 * @param {Array} items - Array of items
 * @param {string} conjunction - Conjunction to use (default: "and")
 * @returns {string} Formatted list
 */
export const formatList = (items, conjunction = 'and') => {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
    
    return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`;
};

/**
 * Format achievement requirements
 * @param {Array} progression - Array of progression achievement IDs
 * @param {Array} winCondition - Array of win condition achievement IDs
 * @param {boolean} requireProgression - Whether all progression achievements are required
 * @param {boolean} requireAllWinConditions - Whether all win conditions are required
 * @returns {string} Formatted requirements
 */
export const formatRequirements = (progression, winCondition, requireProgression, requireAllWinConditions) => {
    const parts = [];

    if (progression.length > 0) {
        parts.push(`${requireProgression ? 'Complete all' : 'Complete any'} progression achievements`);
    }

    if (winCondition.length > 0) {
        parts.push(`${requireAllWinConditions ? 'Complete all' : 'Complete any'} win conditions`);
    }

    return parts.join(' and ');
};

/**
 * Format achievement progress
 * @param {number} current - Current achievements
 * @param {number} total - Total achievements
 * @returns {string} Formatted progress
 */
export const formatProgress = (current, total) => {
    const percentage = (current / total * 100).toFixed(2);
    return `${current}/${total} (${percentage}%)`;
};

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export const truncateText = (text, maxLength = 1024) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
};

/**
 * Format a game title with its type
 * @param {Object} game - Game object
 * @returns {string} Formatted game title
 */
export const formatGameTitle = (game) => {
    const icon = game.type === 'MONTHLY' ? '🎮' : '👻';
    return `${icon} ${game.title}`;
};

/**
 * Format achievement data for display
 * @param {Object} achievement - Achievement data
 * @param {Object} game - Optional game object
 * @returns {string} Formatted achievement string
 */
export const formatAchievement = (achievement, game = null) => {
    const gameType = game ? ` (${game.type} Challenge)` : '';
    const time = formatRelativeTime(new Date(achievement.dateEarned));
    return `${achievement.title} in ${achievement.gameTitle}${gameType} - ${time}`;
};

/**
 * Validate RetroAchievements username
 * @param {string} username - Username to validate
 * @returns {boolean} Whether the username is valid
 */
export const isValidRAUsername = (username) => {
    // RetroAchievements usernames can only contain alphanumeric characters and underscores
    return /^[a-zA-Z0-9_]+$/.test(username);
};

/**
 * Validate game ID
 * @param {string|number} gameId - Game ID to validate
 * @returns {boolean} Whether the game ID is valid
 */
export const isValidGameId = (gameId) => {
    const id = parseInt(gameId);
    return !isNaN(id) && id > 0;
};

export default {
    createErrorEmbed,
    createSuccessEmbed,
    formatPercentage,
    formatList,
    formatRequirements,
    formatProgress,
    truncateText,
    formatGameTitle,
    formatAchievement,
    isValidRAUsername,
    isValidGameId
};
