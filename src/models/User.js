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
    // Field for tracking announced awards (mastery/beaten) to prevent duplicates
    announcedAwards: {
        type: [{ type: String }],
        default: []
    },
    // Add this field to track the last time achievements were checked
    lastAchievementCheck: {
        type: Date,
        default: function() {
            return new Date(0); // Default to start of epoch
        }
    },
    communityAwards: [communityAwardSchema],
    nominations: [nominationSchema],
    // Field to track if historical data has been processed
    historicalDataProcessed: {
        type: Boolean,
        default: false
    },
    // Field to store annual records for yearly leaderboard caching
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
    // Field for tracking mastered games
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
    },

    // ===== ARENA SYSTEM FIELDS =====
    
    // GP (Game Points) balance for Arena system
    gpBalance: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // Monthly GP grant tracking (AUTOMATIC - replaces manual claims)
    lastMonthlyGpGrant: {
        type: Date,
        default: null
    },
    
    // GP transaction history (keep last 100 transactions)
    gpTransactions: [{
        type: {
            type: String,
            enum: ['monthly_grant', 'wager', 'bet', 'win', 'refund', 'admin_adjust'],
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        challengeId: {
            type: String,
            default: null
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Arena statistics
    arenaStats: {
        challengesCreated: {
            type: Number,
            default: 0
        },
        challengesWon: {
            type: Number,
            default: 0
        },
        challengesParticipated: {
            type: Number,
            default: 0
        },
        totalGpWon: {
            type: Number,
            default: 0
        },
        totalGpWagered: {
            type: Number,
            default: 0
        },
        totalGpBet: {
            type: Number,
            default: 0
        },
        betsWon: {
            type: Number,
            default: 0
        },
        betsPlaced: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true,
    strict: false // Allow additional fields to be added
});

// ===== INDEXES =====
// Add indexes for Arena system
userSchema.index({ 'arenaStats.challengesWon': -1 });
userSchema.index({ 'arenaStats.totalGpWon': -1 });
userSchema.index({ gpBalance: -1 });
userSchema.index({ lastMonthlyGpGrant: 1 }); // Changed from lastMonthlyGpClaim

// ===== STATIC METHODS =====

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

// ===== INSTANCE METHODS =====

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

// Method to get current month's nominations with validation
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

// Method to check if a game is mastered
userSchema.methods.isGameMastered = function(gameId) {
    if (!this.masteredGames) return false;
    
    return this.masteredGames.some(game => game.gameId === String(gameId));
};

// Method to get all mastered games
userSchema.methods.getMasteredGames = function() {
    return this.masteredGames || [];
};

// Method to count mastered games
userSchema.methods.getMasteredGameCount = function() {
    return this.masteredGames?.length || 0;
};

// Method to add a mastered game
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

// ===== ARENA SYSTEM METHODS =====

// Add GP transaction and update balance
userSchema.methods.addGpTransaction = function(type, amount, description, challengeId = null) {
    if (!this.gpTransactions) {
        this.gpTransactions = [];
    }
    
    this.gpTransactions.push({
        type,
        amount,
        description,
        challengeId,
        timestamp: new Date()
    });
    
    // Keep only the last 100 transactions
    if (this.gpTransactions.length > 100) {
        this.gpTransactions = this.gpTransactions.slice(-100);
    }
    
    // Update balance
    this.gpBalance += amount;
    
    // Ensure balance doesn't go below 0
    if (this.gpBalance < 0) {
        this.gpBalance = 0;
    }
};

// Check if user has enough GP
userSchema.methods.hasEnoughGp = function(amount) {
    return this.gpBalance >= amount;
};

// Get win rate percentage
userSchema.methods.getGpWinRate = function() {
    if (!this.arenaStats || this.arenaStats.challengesParticipated === 0) return 0;
    return (this.arenaStats.challengesWon / this.arenaStats.challengesParticipated * 100).toFixed(1);
};

// Get bet win rate percentage
userSchema.methods.getBetWinRate = function() {
    if (!this.arenaStats || this.arenaStats.betsPlaced === 0) return 0;
    return (this.arenaStats.betsWon / this.arenaStats.betsPlaced * 100).toFixed(1);
};

// Virtual field for backwards compatibility with existing `gp` field references
userSchema.virtual('gp').get(function() {
    return this.gpBalance;
}).set(function(value) {
    this.gpBalance = value;
});

export const User = mongoose.model('User', userSchema);
export default User;
