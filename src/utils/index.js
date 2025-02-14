import dateUtils from './dateUtils.js';
import formatUtils from './formatUtils.js';
import permissions from './permissions.js';

// Re-export individual utilities
export const {
    getCurrentPeriod,
    getPreviousPeriod,
    formatPeriod,
    formatRelativeTime,
    isValidPeriod,
    getPeriodDates,
    isDateInPeriod,
    formatDuration
} = dateUtils;

export const {
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
} = formatUtils;

export const {
    isAdmin,
    canManageNominations,
    canManageGames,
    canManageUsers,
    canManageAwards
} = permissions;

// Export all utilities as namespaces
export {
    dateUtils,
    formatUtils,
    permissions
};

// Default export
export default {
    dateUtils,
    formatUtils,
    permissions
};
