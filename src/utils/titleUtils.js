// src/utils/titleUtils.js - Discord title truncation utilities
/**
 * Discord character limits for various components
 */
export const DISCORD_LIMITS = {
    EMBED_TITLE: 256,
    EMBED_DESCRIPTION: 4096,
    EMBED_FIELD_NAME: 256,
    EMBED_FIELD_VALUE: 1024,
    EMBED_FOOTER: 2048,
    EMBED_AUTHOR_NAME: 256,
    BUTTON_LABEL: 80,
    SELECT_OPTION_LABEL: 100,
    SELECT_OPTION_DESCRIPTION: 100,
    MODAL_TITLE: 45,
    TEXT_INPUT_LABEL: 45,
    TOTAL_EMBED_CHARS: 6000 // Total across all embeds in a message
};

/**
 * Truncate text to fit Discord limits with smart ellipsis handling
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum allowed length
 * @param {string} suffix - Suffix to add when truncated (default: '...')
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength, suffix = '...') {
    if (!text || typeof text !== 'string') {
        return '';
    }
    
    if (text.length <= maxLength) {
        return text;
    }
    
    // Reserve space for the suffix
    const reservedLength = maxLength - suffix.length;
    
    if (reservedLength <= 0) {
        // If even the suffix won't fit, return empty or just the suffix
        return maxLength > 0 ? suffix.slice(0, maxLength) : '';
    }
    
    return text.slice(0, reservedLength) + suffix;
}

/**
 * Truncate game title for embed titles
 * @param {string} gameTitle - The game title to truncate
 * @returns {string} Truncated title suitable for embed titles
 */
export function truncateGameTitleForEmbed(gameTitle) {
    return truncateText(gameTitle, DISCORD_LIMITS.EMBED_TITLE);
}

/**
 * Truncate game title for button labels
 * @param {string} gameTitle - The game title to truncate
 * @param {string} prefix - Any prefix text (e.g., "1. Join ")
 * @returns {string} Truncated title suitable for button labels
 */
export function truncateGameTitleForButton(gameTitle, prefix = '') {
    const availableLength = DISCORD_LIMITS.BUTTON_LABEL - prefix.length;
    return prefix + truncateText(gameTitle, availableLength);
}

/**
 * Truncate game title for select menu options
 * @param {string} gameTitle - The game title to truncate
 * @returns {string} Truncated title suitable for select options
 */
export function truncateGameTitleForSelectOption(gameTitle) {
    return truncateText(gameTitle, DISCORD_LIMITS.SELECT_OPTION_LABEL);
}

/**
 * Smart truncate game title with console info preservation
 * Prioritizes keeping the main game name and console info
 * @param {string} gameTitle - The game title to truncate
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Smartly truncated title
 */
export function smartTruncateGameTitle(gameTitle, maxLength) {
    if (!gameTitle || gameTitle.length <= maxLength) {
        return gameTitle || '';
    }
    
    // Try to preserve console info in parentheses at the end
    const consoleMatch = gameTitle.match(/^(.+?)\s*\(([^)]+)\)$/);
    
    if (consoleMatch) {
        const [, mainTitle, consoleInfo] = consoleMatch;
        const consoleText = `(${consoleInfo})`;
        const availableForMain = maxLength - consoleText.length - 1; // -1 for space
        
        if (availableForMain > 10) { // Only do this if we have reasonable space
            const truncatedMain = truncateText(mainTitle.trim(), availableForMain, '...');
            return `${truncatedMain} ${consoleText}`;
        }
    }
    
    // Fallback to simple truncation
    return truncateText(gameTitle, maxLength);
}

/**
 * Create a short display name for games, useful for buttons and compact displays
 * @param {string} gameTitle - The game title
 * @param {number} maxLength - Maximum length (default: 40)
 * @returns {string} Shortened display name
 */
export function createShortGameDisplayName(gameTitle, maxLength = 40) {
    if (!gameTitle) return '';
    
    // Remove common prefixes and suffixes that take up space
    let shortened = gameTitle
        .replace(/^(The\s+)/i, '') // Remove "The " at start
        .replace(/\s*\(.*?\)$/, '') // Remove anything in parentheses at the end
        .replace(/\s*-\s*.*$/, '') // Remove anything after a dash
        .replace(/\s*:\s*.*$/, '') // Remove anything after a colon
        .trim();
    
    return truncateText(shortened, maxLength);
}

/**
 * Format challenge title for various Discord contexts
 * @param {Object} challenge - Challenge object with gameTitle and type
 * @param {string} context - Context: 'embed', 'button', 'select', 'short'
 * @param {string} prefix - Optional prefix for buttons
 * @returns {string} Formatted title
 */
export function formatChallengeTitle(challenge, context = 'embed', prefix = '') {
    if (!challenge?.gameTitle) {
        return 'Unknown Game';
    }
    
    const typeEmoji = challenge.type === 'direct' ? '⚔️' : '🌍';
    
    switch (context) {
        case 'embed':
            return `${typeEmoji} ${smartTruncateGameTitle(challenge.gameTitle, DISCORD_LIMITS.EMBED_TITLE - 3)}`;
        
        case 'button':
            const buttonText = `${typeEmoji} ${challenge.gameTitle}`;
            return truncateGameTitleForButton(buttonText, prefix);
        
        case 'select':
            return truncateGameTitleForSelectOption(`${typeEmoji} ${challenge.gameTitle}`);
        
        case 'short':
            return `${typeEmoji} ${createShortGameDisplayName(challenge.gameTitle, 30)}`;
        
        default:
            return smartTruncateGameTitle(challenge.gameTitle, DISCORD_LIMITS.EMBED_TITLE);
    }
}

/**
 * Validate that an embed won't exceed Discord's total character limit
 * @param {Object} embed - Discord embed object
 * @returns {Object} { valid: boolean, totalChars: number, limit: number }
 */
export function validateEmbedLength(embed) {
    let totalChars = 0;
    
    // Count characters from all text fields
    if (embed.title) totalChars += embed.title.length;
    if (embed.description) totalChars += embed.description.length;
    if (embed.footer?.text) totalChars += embed.footer.text.length;
    if (embed.author?.name) totalChars += embed.author.name.length;
    
    // Count field characters
    if (embed.fields) {
        for (const field of embed.fields) {
            if (field.name) totalChars += field.name.length;
            if (field.value) totalChars += field.value.length;
        }
    }
    
    return {
        valid: totalChars <= DISCORD_LIMITS.TOTAL_EMBED_CHARS,
        totalChars,
        limit: DISCORD_LIMITS.TOTAL_EMBED_CHARS
    };
}

/**
 * Truncate leaderboard title for display
 * @param {string} leaderboardTitle - The leaderboard title
 * @param {number} maxLength - Maximum length (default: 100)
 * @returns {string} Truncated leaderboard title
 */
export function truncateLeaderboardTitle(leaderboardTitle, maxLength = 100) {
    if (!leaderboardTitle) return 'Unknown Leaderboard';
    
    // Common patterns to make more readable
    let cleaned = leaderboardTitle
        .replace(/^Leaderboard\s*[-:]\s*/i, '') // Remove "Leaderboard - " prefix
        .replace(/\s*\(.*?\)$/, '') // Remove parenthetical info at end
        .trim();
    
    return truncateText(cleaned, maxLength);
}

/**
 * Format challenge description for embeds, handling length limits
 * @param {string} description - Challenge description
 * @param {number} maxLength - Maximum length (default: 200)
 * @returns {string} Formatted description
 */
export function formatChallengeDescription(description, maxLength = 200) {
    if (!description || !description.trim()) {
        return 'No description provided';
    }
    
    return truncateText(description.trim(), maxLength);
}

/**
 * Create safe field values for embeds that won't exceed limits
 * @param {string} content - Content for the field
 * @param {number} maxLength - Maximum length (default: field value limit)
 * @returns {string} Safe field value
 */
export function createSafeFieldValue(content, maxLength = DISCORD_LIMITS.EMBED_FIELD_VALUE) {
    if (!content) return 'No data';
    
    return truncateText(content, maxLength);
}

/**
 * Batch truncate multiple titles for consistent display
 * @param {Array} items - Array of objects with titles to truncate
 * @param {string} titleKey - Key name for the title property
 * @param {number} maxLength - Maximum length for each title
 * @returns {Array} Array with truncated titles
 */
export function batchTruncateTitles(items, titleKey = 'title', maxLength = 50) {
    return items.map(item => ({
        ...item,
        [titleKey]: truncateText(item[titleKey], maxLength)
    }));
}

/**
 * Helper to ensure button labels are safe
 * @param {string} label - Button label
 * @param {string} fallback - Fallback label if original is too long
 * @returns {string} Safe button label
 */
export function ensureSafeButtonLabel(label, fallback = 'Action') {
    if (!label) return fallback;
    
    const truncated = truncateText(label, DISCORD_LIMITS.BUTTON_LABEL);
    return truncated.length < 3 ? fallback : truncated; // Ensure meaningful label
}

// Export all functions as default object for convenient importing
export default {
    DISCORD_LIMITS,
    truncateText,
    truncateGameTitleForEmbed,
    truncateGameTitleForButton,
    truncateGameTitleForSelectOption,
    smartTruncateGameTitle,
    createShortGameDisplayName,
    formatChallengeTitle,
    validateEmbedLength,
    truncateLeaderboardTitle,
    formatChallengeDescription,
    createSafeFieldValue,
    batchTruncateTitles,
    ensureSafeButtonLabel
};
