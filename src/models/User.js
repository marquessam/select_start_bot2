// src/models/User.js - Complete model with fixed gacha emoji support
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

// Trophy case schema
const trophyCaseSchema = new mongoose.Schema({
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
    awardLevel: {
        type: String,
        enum: ['mastery', 'beaten', 'participation', 'special'],
        required: true
    },
    challengeType: {
        type: String,
        enum: ['monthly', 'shadow', 'community', 'regular'],
        required: true
    },
    emojiId: String,        // Discord emoji ID
    emojiName: String,      // Emoji name for fallback
    earnedAt: {
        type: Date,
        default: Date.now
    },
    monthKey: String        // YYYY-MM format (null for community awards)
});

// UPDATED: Enhanced gacha collection schema with proper emoji support
const gachaCollectionSchema = new mongoose.Schema({
    itemId: {
        type: String,
        required: true
    },
    itemName: {
        type: String,
        required: true
    },
    itemType: {
        type: String,
        enum: ['trinket', 'collectible', 'series', 'special', 'trophy', 'combined'],
        required: true
    },
    seriesId: String,       // For collection series (e.g., "triforce")
    rarity: {
        type: String,
        enum: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
        required: true
    },
    // FIXED: Proper emoji support
    emojiId: {
        type: String,
        default: null       // Discord custom emoji ID
    },
    emojiName: {
        type: String,
        required: true      // Fallback emoji name (Unicode or custom name)
    },
    obtainedAt: {
        type: Date,
        default: Date.now
    },
    quantity: {             // For stackable items
        type: Number,
        default: 1,
        min: 1
    },
    // ADDED: Source tracking
    source: {
        type: String,
        enum: ['gacha', 'combined', 'series_completion', 'admin_grant', 'admin_test'],
        default: 'gacha'
    }
});

// Collection progress schema
const collectionProgressSchema = new mongoose.Schema({
    seriesId: {
        type: String,
        required: true
    },
    seriesName: {
        type: String,
        required: true
    },
    itemsOwned: [String],   // Array of itemIds
    itemsNeeded: [String],  // Array of itemIds still needed
    isComplete: {
        type: Boolean,
        default: false
    },
    completedAt: Date,
    rewardItemId: String    // Special item awarded for completion
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
            achievements: Number,
            totalAchievements: Number,
            percentage: Number,
            gameTitle: String,
            gameIconUrl: String
        },
        default: () => new Map()
    },
    shadowChallenges: {
        type: Map,
        of: {
            progress: Number,
            achievements: Number,
            totalAchievements: Number,
            percentage: Number,
            gameTitle: String,
            gameIconUrl: String
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
            enum: ['monthly_grant', 'wager', 'bet', 'win', 'refund', 'admin_adjust', 'gacha_pull'],
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
    },

    // ===== TROPHY SYSTEM FIELDS =====
    
    // Trophy Case - stores earned trophies from all sources
    trophyCase: [trophyCaseSchema],

    // ===== GACHA SYSTEM FIELDS =====
    
    // UPDATED: Gacha collection with enhanced emoji support
    gachaCollection: [gachaCollectionSchema]

}, {
    timestamps: true,
    strict: false // Allow additional fields to be added
});

// ===== INDEXES =====
// Add indexes for Arena system
userSchema.index({ 'arenaStats.challengesWon': -1 });
userSchema.index({ 'arenaStats.totalGpWon': -1 });
userSchema.index({ gpBalance: -1 });
userSchema.index({ lastMonthlyGpGrant: 1 });

// Add indexes for trophy system
userSchema.index({ 'trophyCase.challengeType': 1 });
userSchema.index({ 'trophyCase.earnedAt': -1 });

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

// ===== TROPHY SYSTEM METHODS =====

// Get user's trophies with filtering
userSchema.methods.getTrophies = function(filters = {}) {
    if (!this.trophyCase || this.trophyCase.length === 0) {
        return [];
    }

    let trophies = [...this.trophyCase];

    // Apply filters
    if (filters.challengeType) {
        trophies = trophies.filter(t => t.challengeType === filters.challengeType);
    }

    if (filters.awardLevel) {
        trophies = trophies.filter(t => t.awardLevel === filters.awardLevel);
    }

    if (filters.year) {
        trophies = trophies.filter(t => {
            const year = new Date(t.earnedAt).getFullYear();
            return year === filters.year;
        });
    }

    // Sort by earned date (most recent first)
    trophies.sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));

    return trophies;
};

// Get trophy count by type
userSchema.methods.getTrophyCount = function() {
    if (!this.trophyCase) return { total: 0, monthly: 0, shadow: 0, community: 0 };
    
    const counts = {
        total: this.trophyCase.length,
        monthly: 0,
        shadow: 0,
        community: 0,
        regular: 0
    };
    
    this.trophyCase.forEach(trophy => {
        if (counts[trophy.challengeType] !== undefined) {
            counts[trophy.challengeType]++;
        }
    });
    
    return counts;
};

// ===== GACHA SYSTEM METHODS =====

// Format gacha item emoji for display
userSchema.methods.formatGachaItemEmoji = function(item) {
    if (item.emojiId && item.emojiName) {
        return `<:${item.emojiName}:${item.emojiId}>`;
    } else if (item.emojiName) {
        return item.emojiName; // Fallback to Unicode emoji
    }
    return '❓'; // Ultimate fallback
};

// Get gacha item by ID from collection
userSchema.methods.getGachaItem = function(itemId) {
    if (!this.gachaCollection) return null;
    return this.gachaCollection.find(item => item.itemId === itemId);
};

// FIXED: Add or update gacha item in collection with proper emoji data transfer
userSchema.methods.addGachaItem = function(gachaItem, quantity = 1, source = 'gacha') {
    console.log('🔧 addGachaItem called with:', {
        itemId: gachaItem.itemId,
        itemName: gachaItem.itemName,
        emojiId: gachaItem.emojiId,
        emojiName: gachaItem.emojiName,
        quantity: quantity,
        source: source
    });

    if (!this.gachaCollection) {
        this.gachaCollection = [];
        console.log('📦 Initialized empty gachaCollection');
    }

    const existingItem = this.gachaCollection.find(item => item.itemId === gachaItem.itemId);
    
    if (existingItem && gachaItem.maxStack > 1) {
        // Stack the item
        const newQuantity = Math.min(existingItem.quantity + quantity, gachaItem.maxStack);
        const previousQuantity = existingItem.quantity;
        existingItem.quantity = newQuantity;
        
        // IMPORTANT: Update emoji data even when stacking in case it changed
        if (gachaItem.emojiId) {
            existingItem.emojiId = gachaItem.emojiId;
        }
        if (gachaItem.emojiName) {
            existingItem.emojiName = gachaItem.emojiName;
        }
        
        console.log('📚 Stacked item:', {
            itemName: existingItem.itemName,
            newQuantity: newQuantity,
            emojiId: existingItem.emojiId,
            emojiName: existingItem.emojiName
        });
        
        return {
            item: existingItem,
            isNew: false,
            wasStacked: true,
            previousQuantity: previousQuantity
        };
    } else if (!existingItem) {
        // Add new item with COMPLETE emoji data transfer
        const newItem = {
            itemId: gachaItem.itemId,
            itemName: gachaItem.itemName,
            itemType: gachaItem.itemType,
            seriesId: gachaItem.seriesId,
            rarity: gachaItem.rarity,
            // CRITICAL: Ensure emoji data is properly copied
            emojiId: gachaItem.emojiId || null,        // Explicitly copy emojiId
            emojiName: gachaItem.emojiName || '❓',     // Explicitly copy emojiName with fallback
            obtainedAt: new Date(),
            quantity: quantity,
            source: source
        };

        console.log('✨ Creating new collection item:', {
            itemId: newItem.itemId,
            itemName: newItem.itemName,
            emojiId: newItem.emojiId,
            emojiName: newItem.emojiName,
            source: newItem.source
        });

        this.gachaCollection.push(newItem);
        
        // VERIFICATION: Check that emoji data was saved correctly
        const savedItem = this.gachaCollection[this.gachaCollection.length - 1];
        console.log('🔍 Verification - saved item emoji data:', {
            emojiId: savedItem.emojiId,
            emojiName: savedItem.emojiName
        });
        
        if (gachaItem.emojiId && !savedItem.emojiId) {
            console.error('❌ CRITICAL: emojiId was not saved correctly!');
            console.error('Source emojiId:', gachaItem.emojiId);
            console.error('Saved emojiId:', savedItem.emojiId);
        }
        
        return {
            item: savedItem, // Return the actual saved item
            isNew: true,
            wasStacked: false
        };
    } else {
        // Item exists but can't stack more
        console.log('🚫 Item exists but cannot stack more:', existingItem.itemName);
        return {
            item: existingItem,
            isNew: false,
            wasStacked: false,
            atMaxStack: true
        };
    }
};

// Remove gacha item from collection
userSchema.methods.removeGachaItem = function(itemId, quantity = 1) {
    if (!this.gachaCollection) return false;
    
    const item = this.gachaCollection.find(item => item.itemId === itemId);
    if (!item) return false;
    
    if (item.quantity <= quantity) {
        // Remove item completely
        this.gachaCollection = this.gachaCollection.filter(item => item.itemId !== itemId);
        return true;
    } else {
        // Reduce quantity
        item.quantity -= quantity;
        return true;
    }
};

// Virtual field for backwards compatibility with existing `gp` field references
userSchema.virtual('gp').get(function() {
    return this.gpBalance;
}).set(function(value) {
    this.gpBalance = value;
});

export const User = mongoose.model('User', userSchema);
export default User;
