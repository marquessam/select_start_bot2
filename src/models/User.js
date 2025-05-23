// src/models/User.js
import mongoose from 'mongoose';

const communityAwardSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    points: {
        type: Number,
        required: true,
        min: 1
    },
    awardedAt: {
        type: Date,
        default: Date.now
    },
    awardedBy: {
        type: String,
        required: true
    }
});

const nominationSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true
    },
    gameTitle: {
        type: String
    },
    consoleName: {
        type: String
    },
    nominatedAt: {
        type: Date,
        default: Date.now
    }
});

const userSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        unique: true
    },
    discordId: {
        type: String,
        required: true,
        sparse: true
    },
    monthlyChallenges: {
        type: Map,
        of: {
            progress: Number,
            achievements: Number,  // Number of achievements earned this month
            totalAchievements: Number, // Total achievements in the game
            percentage: Number     // Completion percentage
        },
        default: () => new Map()
    },
    shadowChallenges: {
        type: Map,
        of: {
            progress: Number,
            achievements: Number,  // Number of achievements earned this month
            totalAchievements: Number, // Total achievements in the game
            percentage: Number     // Completion percentage
        },
        default: () => new Map()
    },
    announcedAchievements: {
        type: [{ type: String }],
        default: []
    },
    // NEW: Field for tracking announced awards (mastery/beaten) to prevent duplicates
    announcedAwards: {
        type: [{ type: String }],
        default: []
    },
    // Add this new field to track the last time achievements were checked
    lastAchievementCheck: {
        type: Date,
        default: function() {
            return new Date(0); // Default to start of epoch
        }
    },
    communityAwards: [communityAwardSchema],
    nominations: [nominationSchema],
    // New field to track if historical data has been processed
    historicalDataProcessed: {
        type: Boolean,
        default: false
    },
    // New field to store annual records for yearly leaderboard caching
    annualRecords: {
        type: Map,
        of: {
            year: Number,
            totalPoints: Number,
            challengePoints: Number,
            communityPoints: Number,
            rank: Number,
            stats: Object
        },
        default: () => new Map()
    },
    // New field for Arena Gold Points (GP)
    gp: {
        type: Number,
        default: 1000 // Default starting GP
    },
    // New field to track when the user last claimed their monthly GP allowance
    lastMonthlyGpClaim: {
        type: Date,
        default: null
    },
    // New field to track arena statistics
    arenaStats: {
        wins: { 
            type: Number, 
            default: 0 
        },
        losses: { 
            type: Number, 
            default: 0 
        },
        challengesIssued: { 
            type: Number, 
            default: 0 
        },
        challengesAccepted: { 
            type: Number, 
            default: 0 
        },
        gpWon: { 
            type: Number, 
            default: 0 
        },
        gpLost: { 
            type: Number, 
            default: 0 
        },
        betsPlaced: { 
            type: Number, 
            default: 0 
        },
        betsWon: { 
            type: Number, 
            default: 0 
        }
    },
    // NEW: Field for tracking mastered games
    masteredGames: {
        type: [{
            gameId: {
                type: String,
                required: true
            },
            gameTitle: {
                type: String,
                required: true
            },
            consoleName: {
                type: String,
                default: 'Unknown'
            },
            totalAchievements: {
                type: Number,
                required: true
            },
            masteredAt: {
                type: Date,
                default: Date.now
            }
        }],
        default: []
    }
}, {
    timestamps: true,
    strict: false // Allow additional fields to be added
});

// Static method to find user by RetroAchievements username (case insensitive)
userSchema.statics.findByRAUsername = function(username) {
    return this.findOne({ raUsername: username });
};

// Static method to find user by Discord ID
userSchema.statics.findByDiscordId = function(discordId) {
    return this.findOne({ discordId });
};

// Helper method for consistent date key formatting
userSchema.statics.formatDateKey = function(date) {
    return date.toISOString().split('T')[0];
};

// raUsername is already indexed due to unique: true
// Add index for discordId if it's not already indexed by sparse: true
// userSchema.index({ discordId: 1 });

// Method to update standard challenge points
userSchema.methods.updatePoints = function(date, points) {
    const dateKey = this.constructor.formatDateKey(date instanceof Date ? date : new Date(date));
    this.monthlyChallenges.set(dateKey, points);
};

// Method to update shadow challenge points
userSchema.methods.updateShadowPoints = function(date, points) {
    const dateKey = this.constructor.formatDateKey(date instanceof Date ? date : new Date(date));
    this.shadowChallenges.set(dateKey, points);
};

// Method to get user's points for a specific challenge (by date)
userSchema.methods.getPoints = function(date) {
    const dateKey = this.constructor.formatDateKey(date instanceof Date ? date : new Date(date));
    return this.monthlyChallenges.get(dateKey) || 0;
};

// Method to get user's points for a specific shadow challenge (by date)
userSchema.methods.getShadowPoints = function(date) {
    const dateKey = this.constructor.formatDateKey(date instanceof Date ? date : new Date(date));
    return this.shadowChallenges.get(dateKey) || 0;
};

// Method to get user's community awards for a specific year
userSchema.methods.getCommunityAwardsForYear = function(year) {
    return this.communityAwards.filter(award => 
        award.awardedAt.getFullYear() === year
    );
};

// Method to get total community points for a specific year
userSchema.methods.getCommunityPointsForYear = function(year) {
    return this.getCommunityAwardsForYear(year)
        .reduce((total, award) => total + award.points, 0);
};

// UPDATED: Method to get current month's nominations with validation
userSchema.methods.getCurrentNominations = function() {
    if (!this.nominations || !Array.isArray(this.nominations)) {
        return [];
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Filter nominations for current month and validate required fields
    const currentNominations = this.nominations
        .filter(nomination => {
            // Check if nomination is from current month
            const nomMonth = nomination.nominatedAt.getMonth();
            const nomYear = nomination.nominatedAt.getFullYear();
            const isCurrentMonth = nomMonth === currentMonth && nomYear === currentYear;
            
            if (!isCurrentMonth) return false;
            
            // Validate required fields exist
            if (!nomination.gameId) {
                console.warn(`Invalid nomination without gameId for user ${this.raUsername}:`, nomination);
                return false;
            }
            
            // Check if title exists
            if (!nomination.gameTitle) {
                console.warn(`Invalid nomination without gameTitle for user ${this.raUsername}:`, nomination);
                return false;
            }
            
            if (!nomination.consoleName) {
                console.warn(`Invalid nomination without consoleName for user ${this.raUsername}:`, nomination);
                return false;
            }
            
            return true;
        });
    
    return currentNominations;
};

// Method to clear nominations for the current month
userSchema.methods.clearCurrentNominations = function() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    this.nominations = this.nominations.filter(nom => {
        const nomMonth = nom.nominatedAt.getMonth();
        const nomYear = nom.nominatedAt.getFullYear();
        return !(nomMonth === currentMonth && nomYear === currentYear);
    });
};

// New method to check if user has claimed their monthly GP allowance
userSchema.methods.hasClaimedMonthlyGp = function() {
    if (!this.lastMonthlyGpClaim) return false;
    
    const now = new Date();
    const lastClaim = new Date(this.lastMonthlyGpClaim);
    
    return lastClaim.getMonth() === now.getMonth() && 
           lastClaim.getFullYear() === now.getFullYear();
};

// New method to claim monthly GP allowance
userSchema.methods.claimMonthlyGp = function(amount = 1000) {
    if (this.hasClaimedMonthlyGp()) return false;
    
    this.gp = (this.gp || 0) + amount;
    this.lastMonthlyGpClaim = new Date();
    return true;
};

// NEW: Method to check if a game is mastered
userSchema.methods.isGameMastered = function(gameId) {
    if (!this.masteredGames) return false;
    
    return this.masteredGames.some(game => game.gameId === String(gameId));
};

// NEW: Method to get all mastered games
userSchema.methods.getMasteredGames = function() {
    return this.masteredGames || [];
};

// NEW: Method to count mastered games
userSchema.methods.getMasteredGameCount = function() {
    return this.masteredGames?.length || 0;
};

// NEW: Method to add a mastered game
userSchema.methods.addMasteredGame = function(gameId, gameTitle, consoleName, totalAchievements) {
    if (this.isGameMastered(gameId)) return false;
    
    if (!this.masteredGames) {
        this.masteredGames = [];
    }
    
    this.masteredGames.push({
        gameId: String(gameId),
        gameTitle: gameTitle || `Game ${gameId}`,
        consoleName: consoleName || 'Unknown',
        totalAchievements: totalAchievements || 0,
        masteredAt: new Date()
    });
    
    return true;
};

export const User = mongoose.model('User', userSchema);
export default User;
