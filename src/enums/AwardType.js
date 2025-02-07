// File: src/enums/AwardType.js

const AwardType = {
    NONE: 0,
    PARTICIPATION: 1,
    BEATEN: 4,     // 1 (participation) + 3 (beaten)
    MASTERED: 7    // 1 (participation) + 3 (beaten) + 3 (mastery)
};

// Make the enum immutable
Object.freeze(AwardType);

// Helper functions
const AwardFunctions = {
    // Get points directly from award type
    getPoints: (awardType) => awardType,

    // Get award name for display
    getName: (awardType) => {
        switch(awardType) {
            case AwardType.MASTERED:
                return 'Mastered';
            case AwardType.BEATEN:
                return 'Beaten';
            case AwardType.PARTICIPATION:
                return 'Participation';
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
            default:
                return '';
        }
    }
};

module.exports = {
    AwardType,
    AwardFunctions
};
