import mongoose from 'mongoose';

const historicalLeaderboardSchema = new mongoose.Schema({
    // Month and year for this leaderboard (YYYY-MM format)
    monthKey: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // Full date object of the challenge 
    date: {
        type: Date,
        required: true
    },
    
    // Reference to the challenge document
    challengeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Challenge'
    },
    
    // Game information
    gameId: {
        type: String, // String to match Challenge model
        required: true
    },
    
    gameTitle: {
        type: String,
        required: true
    },
    
    gameImageUrl: {
        type: String
    },
    
    consoleName: {
        type: String
    },
    
    totalAchievements: {
        type: Number,
        required: true
    },
    
    // Store progression and win achievement IDs for reference
    progressionAchievements: {
        type: [String],
        default: []
    },
    
    winAchievements: {
        type: [String],
        default: []
    },
    
    // Store the complete leaderboard data
    participants: [{
        username: String,
        achievements: Number,
        percentage: Number,
        award: String,
        points: Number,
        displayRank: Number,
        hasTiebreaker: Boolean,
        tiebreakerScore: String,
        tiebreakerRank: Number
    }],
    
    // Winners for quick access (top 3)
    winners: [{
        rank: Number,
        username: String,
        achievements: Number,
        percentage: Number,
        award: String,
        points: Number,
        tiebreakerScore: String
    }],
    
    // Tiebreaker information (if applicable)
    tiebreakerInfo: {
        gameId: String,
        gameTitle: String,
        leaderboardId: Number,
        isActive: Boolean
    },
    
    // Shadow challenge information (if applicable)
    shadowChallengeInfo: {
        gameId: String,
        gameTitle: String,
        gameImageUrl: String,
        totalAchievements: Number,
        wasRevealed: Boolean
    },
    
    // Whether final results have been announced
    resultsAnnounced: {
        type: Boolean,
        default: false
    },
    
    // Flag to indicate if this leaderboard is finalized
    isFinalized: {
        type: Boolean,
        default: false
    },
    
    // When this historical record was created
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add method to get a formatted title for the leaderboard
historicalLeaderboardSchema.methods.getFormattedTitle = function() {
    const date = new Date(this.date);
    const monthName = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    return `${monthName} ${year} Challenge Leaderboard`;
};

// Static method to find historical leaderboard by month name
historicalLeaderboardSchema.statics.findByMonthName = async function(monthName, year) {
    const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ];
    
    const monthIndex = monthNames.findIndex(m => 
        m.toLowerCase() === monthName.toLowerCase()
    );
    
    if (monthIndex === -1) {
        return null; // Invalid month name
    }
    
    // If year is not provided, use current year
    if (!year) {
        year = new Date().getFullYear();
    }
    
    const monthKey = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}`;
    
    return this.findOne({ monthKey });
};

// Static method to get most recent leaderboards
historicalLeaderboardSchema.statics.getRecentLeaderboards = function(limit = 10) {
    return this.find({ isFinalized: true })
        .sort({ date: -1 })
        .limit(limit);
};

export const HistoricalLeaderboard = mongoose.model('HistoricalLeaderboard', historicalLeaderboardSchema);
