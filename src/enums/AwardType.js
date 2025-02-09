// File: src/enums/AwardType.js

const AwardType = {
    NONE: 0,
    PARTICIPATION: 1,
    BEATEN: 4,     // 1 (participation) + 3 (beaten)
    MASTERED: 7,   // 1 (participation) + 3 (beaten) + 3 (mastery)
    MANUAL: 999    // Special type for manual awards
};

// Make the enum immutable
Object.freeze(AwardType);

// Helper functions
const AwardFunctions = {
    // Get points directly from award type
    getPoints: (awardType) => {
        if (awardType === AwardType.MANUAL) {
            return 0; // Manual awards use totalAchievements for points
        }
        return awardType;
    },

    // Get award name for display
    getName: (awardType) => {
        switch(awardType) {
            case AwardType.MASTERED:
                return 'Mastered';
            case AwardType.BEATEN:
                return 'Beaten';
            case AwardType.PARTICIPATION:
                return 'Participation';
            case AwardType.MANUAL:
                return 'Manual Award';
            default:
                return 'None';
        }
    },

    // Get award emoji for display
    getEmoji: (awardType) => {
        switch(awardType) {
            case AwardType.MASTERED:
                return '✨';
            case AwardType.BEATEN:
                return '⭐';
            case AwardType.PARTICIPATION:
                return '🏁';
            case AwardType.MANUAL:
                return '🎖️';
            default:
                return '';
        }
    },

    // Validate award type
    isValid: (awardType) => {
        return Object.values(AwardType).includes(awardType);
    },

    // Check if award type qualifies for points
    qualifiesForPoints: (awardType) => {
        return awardType > AwardType.NONE;
    }
};

module.exports = {
    AwardType,
    AwardFunctions
};
