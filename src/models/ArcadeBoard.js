import mongoose from 'mongoose';

/**
 * This model represents arcade leaderboards in the system.
 * They can be of three types:
 * 1. arcade - Regular arcade boards that persist year-round
 * 2. racing - Monthly racing challenges with awards given to top 3 finishers
 * 3. tiebreaker - Special boards for resolving ties in the monthly challenge
 */
const arcadeBoardSchema = new mongoose.Schema({
    // Board identifier (used in commands)
    boardId: {
        type: String,
        required: true,
        unique: true
    },
    
    // Type of board (arcade, racing, tiebreaker)
    boardType: {
        type: String,
        required: true,
        enum: ['arcade', 'racing', 'tiebreaker'],
        default: 'arcade'
    },
    
    // RetroAchievements leaderboard ID
    leaderboardId: {
        type: Number,
        required: true
    },
    
    // RetroAchievements game ID
    gameId: {
        type: Number,
        required: true
    },
    
    // Game title and info
    gameTitle: {
        type: String,
        required: true
    },
    
    // Console name (e.g., "SNES", "NES", "Genesis")
    consoleName: {
        type: String,
        required: true
    },
    
    // Track name (for racing challenges - e.g., "Mario Circuit")
    trackName: {
        type: String,
        default: ""
    },
    
    // Description of the leaderboard challenge
    description: {
        type: String,
        required: true
    },
    
    // Date range for when this board is active (especially for racing/tiebreakers)
    startDate: {
        type: Date,
        default: new Date('2000-01-01')
    },
    
    endDate: {
        type: Date,
        default: new Date('2099-12-31')
    },
    
    // For tiebreaker boards: list of usernames who are in the tiebreaker
    tiedUsers: {
        type: [String],
        default: []
    },
    
    // For racing boards: track which month this is for (e.g., "2025-01")
    monthKey: {
        type: String
    },
    
    // Whether points have been awarded for this board (for racing boards)
    pointsAwarded: {
        type: Boolean,
        default: false
    },
    
    // The results (top 3) of the racing board, stored after it's completed
    results: {
        type: [{
            username: String,
            rank: Number,
            time: String,
            points: Number
        }],
        default: []
    },
    
    // Track when this board was added
    createdAt: {
        type: Date,
        default: Date.now
    },
    
    // Flag for racing games (used when selecting monthly racing challenges)
    isRacing: {
        type: Boolean,
        default: false
    },
    
    // NEW: Tiebreaker-breaker fields (for when tiebreaker is also tied)
    // These fields are used to resolve ties within the primary tiebreaker
    tiebreakerBreakerLeaderboardId: {
        type: Number,
        required: false,
        default: null
    },
    
    tiebreakerBreakerGameId: {
        type: Number,
        required: false,
        default: null
    },
    
    tiebreakerBreakerGameTitle: {
        type: String,
        required: false,
        default: null
    },
    
    tiebreakerBreakerDescription: {
        type: String,
        required: false,
        default: null
    }
});

// Create indexes for frequently queried fields
arcadeBoardSchema.index({ boardType: 1, startDate: 1, endDate: 1 });
arcadeBoardSchema.index({ boardType: 1, monthKey: 1 });

// NEW: Add index for tiebreaker-breaker queries
arcadeBoardSchema.index({ 
    boardType: 1, 
    tiebreakerBreakerLeaderboardId: 1,
    startDate: 1, 
    endDate: 1 
});

// Static method to find racing board by month name or month key
arcadeBoardSchema.statics.findRacingBoardByMonth = async function(monthInput) {
    // If input is in YYYY-MM format
    if (/^\d{4}-\d{2}$/.test(monthInput)) {
        return this.findOne({
            boardType: 'racing',
            monthKey: monthInput
        });
    }
    
    // Try to parse as a month name
    const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ];
    
    const monthIndex = monthNames.findIndex(m => 
        m.toLowerCase() === monthInput.toLowerCase()
    );
    
    if (monthIndex === -1) {
        return null; // Invalid month name
    }
    
    // First try current year
    const now = new Date();
    const currentYear = now.getFullYear();
    
    const currentYearMonthKey = `${currentYear}-${(monthIndex + 1).toString().padStart(2, '0')}`;
    
    const currentYearBoard = await this.findOne({
        boardType: 'racing',
        monthKey: currentYearMonthKey
    });
    
    if (currentYearBoard) {
        return currentYearBoard;
    }
    
    // Try previous year if not found
    const prevYearMonthKey = `${currentYear - 1}-${(monthIndex + 1).toString().padStart(2, '0')}`;
    
    return this.findOne({
        boardType: 'racing',
        monthKey: prevYearMonthKey
    });
};

// Statics method to find active racing board
arcadeBoardSchema.statics.findActiveRacingBoard = function() {
    const now = new Date();
    return this.findOne({
        boardType: 'racing',
        startDate: { $lte: now },
        endDate: { $gte: now }
    });
};

// Statics method to find active tiebreaker
arcadeBoardSchema.statics.findActiveTiebreaker = function() {
    const now = new Date();
    return this.findOne({
        boardType: 'tiebreaker',
        startDate: { $lte: now },
        endDate: { $gte: now }
    });
};

// NEW: Statics method to find active tiebreaker with tiebreaker-breaker
arcadeBoardSchema.statics.findActiveTiebreakerWithBreaker = function() {
    const now = new Date();
    return this.findOne({
        boardType: 'tiebreaker',
        startDate: { $lte: now },
        endDate: { $gte: now },
        tiebreakerBreakerLeaderboardId: { $exists: true, $ne: null }
    });
};

// Statics method to find all arcade boards
arcadeBoardSchema.statics.findAllArcadeBoards = function() {
    return this.find({ boardType: 'arcade' }).sort({ gameTitle: 1 });
};

// Statics method to find all racing boards
arcadeBoardSchema.statics.findAllRacingBoards = function() {
    return this.find({ 
        boardType: 'racing' 
    }).sort({ startDate: -1 }); // Sort by start date descending (newest first)
};

// Method to check if a racing board is completed but points not yet awarded
arcadeBoardSchema.methods.isCompletedWithoutPoints = function() {
    const now = new Date();
    return this.boardType === 'racing' && 
           this.endDate < now && 
           !this.pointsAwarded;
};

// NEW: Method to check if this tiebreaker has a tiebreaker-breaker configured
arcadeBoardSchema.methods.hasTiebreakerBreaker = function() {
    return this.boardType === 'tiebreaker' && 
           this.tiebreakerBreakerLeaderboardId && 
           this.tiebreakerBreakerGameId;
};

// NEW: Method to get tiebreaker-breaker info safely
arcadeBoardSchema.methods.getTiebreakerBreakerInfo = function() {
    if (!this.hasTiebreakerBreaker()) {
        return null;
    }
    
    return {
        leaderboardId: this.tiebreakerBreakerLeaderboardId,
        gameId: this.tiebreakerBreakerGameId,
        gameTitle: this.tiebreakerBreakerGameTitle,
        description: this.tiebreakerBreakerDescription
    };
};

// NEW: Method to clear tiebreaker-breaker data
arcadeBoardSchema.methods.clearTiebreakerBreaker = function() {
    this.tiebreakerBreakerLeaderboardId = null;
    this.tiebreakerBreakerGameId = null;
    this.tiebreakerBreakerGameTitle = null;
    this.tiebreakerBreakerDescription = null;
};

// NEW: Method to set tiebreaker-breaker data
arcadeBoardSchema.methods.setTiebreakerBreaker = function(leaderboardId, gameId, gameTitle, description = null) {
    this.tiebreakerBreakerLeaderboardId = leaderboardId;
    this.tiebreakerBreakerGameId = gameId;
    this.tiebreakerBreakerGameTitle = gameTitle;
    this.tiebreakerBreakerDescription = description;
};

// NEW: Virtual to check if board is a tiebreaker with tiebreaker-breaker
arcadeBoardSchema.virtual('isTiebreakerWithBreaker').get(function() {
    return this.hasTiebreakerBreaker();
});

export const ArcadeBoard = mongoose.model('ArcadeBoard', arcadeBoardSchema);
export default ArcadeBoard;
