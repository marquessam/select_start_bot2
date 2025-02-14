/**
 * Get current month and year
 * @returns {Object} Object containing month (1-12) and year
 */
export const getCurrentPeriod = () => {
    const now = new Date();
    return {
        month: now.getMonth() + 1,
        year: now.getFullYear()
    };
};

/**
 * Get previous month and year
 * @returns {Object} Object containing month (1-12) and year
 */
export const getPreviousPeriod = () => {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    return {
        month: now.getMonth() + 1,
        year: now.getFullYear()
    };
};

/**
 * Format month and year as string
 * @param {number} month - Month number (1-12)
 * @param {number} year - Year
 * @returns {string} Formatted date string (e.g., "January 2025")
 */
export const formatPeriod = (month, year) => {
    const date = new Date(year, month - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
};

/**
 * Format date as relative time
 * @param {Date} date - Date to format
 * @returns {string} Relative time string (e.g., "2 hours ago", "yesterday")
 */
export const formatRelativeTime = (date) => {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
        return date.toLocaleDateString();
    } else if (days > 1) {
        return `${days} days ago`;
    } else if (days === 1) {
        return 'yesterday';
    } else if (hours > 1) {
        return `${hours} hours ago`;
    } else if (hours === 1) {
        return '1 hour ago';
    } else if (minutes > 1) {
        return `${minutes} minutes ago`;
    } else if (minutes === 1) {
        return '1 minute ago';
    } else {
        return 'just now';
    }
};

/**
 * Validate month and year
 * @param {number} month - Month number
 * @param {number} year - Year
 * @returns {boolean} Whether the month and year are valid
 */
export const isValidPeriod = (month, year) => {
    if (!month || !year) return false;
    if (month < 1 || month > 12) return false;
    if (year < 2000 || year > 2100) return false;
    return true;
};

/**
 * Get start and end dates for a period
 * @param {number} month - Month number (1-12)
 * @param {number} year - Year
 * @returns {Object} Object containing start and end dates
 */
export const getPeriodDates = (month, year) => {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    return { startDate, endDate };
};

/**
 * Check if a date is within a period
 * @param {Date} date - Date to check
 * @param {number} month - Month number (1-12)
 * @param {number} year - Year
 * @returns {boolean} Whether the date is within the period
 */
export const isDateInPeriod = (date, month, year) => {
    const { startDate, endDate } = getPeriodDates(month, year);
    return date >= startDate && date <= endDate;
};

/**
 * Format a duration in milliseconds
 * @param {number} duration - Duration in milliseconds
 * @returns {string} Formatted duration string (e.g., "2h 30m")
 */
export const formatDuration = (duration) => {
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 && parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
};

export default {
    getCurrentPeriod,
    getPreviousPeriod,
    formatPeriod,
    formatRelativeTime,
    isValidPeriod,
    getPeriodDates,
    isDateInPeriod,
    formatDuration
};
