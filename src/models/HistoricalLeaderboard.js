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
    
    // Store the complete leaderboard data with tiebreaker-breaker support
    participants: [{
        username: String,
        achievements: Number,
        percentage: Number,
        award: String,
        points: Number,
        displayRank: Number,
        hasTiebreaker: Boolean,
        tiebreakerScore: String,
        tiebreakerRank: Number,
        // NEW: Tiebreaker-breaker fields
        hasTiebreakerBreaker: {
            type: Boolean,
            default: false
        },
        tiebreakerBreakerScore: {
            type: String,
            default: null
        },
        tiebreakerBreakerRank: {
            type: Number,
            default: null
        }
    }],
    
    // Winners for quick access (top 3) with tiebreaker-breaker support
    winners: [{
        rank: Number,
        username: String,
        achievements: Number,
        percentage: Number,
        award: String,
        points: Number,
        tiebreakerScore: String,
        // NEW: Tiebreaker-breaker fields for winners
        tiebreakerBreakerScore: {
            type: String,
            default: null
        }
    }],
    
    // Enhanced tiebreaker information with tiebreaker-breaker support
    tiebreakerInfo: {
        gameId: String,
        gameTitle: String,
        leaderboardId: Number,
        isActive: Boolean,
        // NEW: Tiebreaker-breaker information
        tiebreakerBreakerGameId: {
            type: Number,
            default: null
        },
        tiebreakerBreakerGameTitle: {
            type: String,
            default: null
        },
        tiebreakerBreakerLeaderboardId: {
            type: Number,
            default: null
        },
        hasTiebreakerBreaker: {
            type: Boolean,
            default: false
        }
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

// NEW: Method to check if this historical leaderboard had a tiebreaker-breaker
historicalLeaderboardSchema.methods.hadTiebreakerBreaker = function() {
    return this.tiebreakerInfo && 
           this.tiebreakerInfo.hasTiebreakerBreaker && 
           this.tiebreakerInfo.tiebreakerBreakerLeaderboardId;
};

// NEW: Method to get tiebreaker-breaker info safely
historicalLeaderboardSchema.methods.getTiebreakerBreakerInfo = function() {
    if (!this.hadTiebreakerBreaker()) {
        return null;
    }
    
    return {
        gameId: this.tiebreakerInfo.tiebreakerBreakerGameId,
        gameTitle: this.tiebreakerInfo.tiebreakerBreakerGameTitle,
        leaderboardId: this.tiebreakerInfo.tiebreakerBreakerLeaderboardId
    };
};

// NEW: Method to count participants who used tiebreaker-breaker
historicalLeaderboardSchema.methods.getTiebreakerBreakerParticipantCount = function() {
    if (!this.participants) return 0;
    
    return this.participants.filter(p => p.hasTiebreakerBreaker && p.tiebreakerBreakerScore).length;
};

// NEW: Method to get formatted tiebreaker description including tiebreaker-breaker
historicalLeaderboardSchema.methods.getFormattedTiebreakerDescription = function() {
    if (!this.tiebreakerInfo || !this.tiebreakerInfo.isActive) {
        return null;
    }
    
    let description = `⚔️ **Tiebreaker Game:** ${this.tiebreakerInfo.gameTitle}\n` +
                     `*Tiebreaker results were used to determine final ranking for tied users in top positions.*`;
    
    if (this.hadTiebreakerBreaker()) {
        description += `\n\n🗡️ **Tiebreaker-Breaker Game:** ${this.tiebreakerInfo.tiebreakerBreakerGameTitle}\n` +
                      `*Used to resolve ties within the tiebreaker itself.*`;
    }
    
    return description;
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

// NEW: Static method to find leaderboards that used tiebreaker-breakers
historicalLeaderboardSchema.statics.findWithTiebreakerBreakers = function(limit = 10) {
    return this.find({ 
        isFinalized: true,
        'tiebreakerInfo.hasTiebreakerBreaker': true 
    })
        .sort({ date: -1 })
        .limit(limit);
};

// NEW: Static method to get statistics about tiebreaker-breaker usage
historicalLeaderboardSchema.statics.getTiebreakerBreakerStats = async function() {
    const total = await this.countDocuments({ isFinalized: true });
    const withTiebreakers = await this.countDocuments({ 
        isFinalized: true,
        'tiebreakerInfo.isActive': true 
    });
    const withTiebreakerBreakers = await this.countDocuments({ 
        isFinalized: true,
        'tiebreakerInfo.hasTiebreakerBreaker': true 
    });
    
    return {
        totalLeaderboards: total,
        withTiebreakers: withTiebreakers,
        withTiebreakerBreakers: withTiebreakerBreakers,
        tiebreakerUsageRate: total > 0 ? (withTiebreakers / total * 100).toFixed(1) : 0,
        tiebreakerBreakerUsageRate: withTiebreakers > 0 ? (withTiebreakerBreakers / withTiebreakers * 100).toFixed(1) : 0
    };
};

export const HistoricalLeaderboard = mongoose.model('HistoricalLeaderboard', historicalLeaderboardSchema);
