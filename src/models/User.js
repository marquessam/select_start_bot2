// src/models/User.js - Complete updated User model with proper gacha collection schema
import mongoose from 'mongoose';

// GP Transaction Schema
const gpTransactionSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: [
            'monthly_grant',
            'challenge_reward',
            'arena_win',
            'arena_bet_win',
            'arena_refund',
            'gacha_pull',
            'admin_adjust',
            'community_award',
            'bonus'
        ]
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
}, { _id: false });

// Community Award Schema
const communityAwardSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    points: {
        type: Number,
        required: true,
        min: 0
    },
    awardedAt: {
        type: Date,
        default: Date.now
    },
    awardedBy: {
        type: String,
        default: 'System'
    },
    year: {
        type: Number,
        required: true
    }
}, { _id: false });

// Arena Stats Schema
const arenaStatsSchema = new mongoose.Schema({
    challengesCreated: {
        type: Number,
        default: 0
    },
    challengesParticipated: {
        type: Number,
        default: 0
    },
    challengesWon: {
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
    betsPlaced: {
        type: Number,
        default: 0
    },
    betsWon: {
        type: Number,
        default: 0
    },
    lastActivityAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

// UPDATED: Proper schema for gacha collection items
const gachaCollectionItemSchema = new mongoose.Schema({
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
    seriesId: {
        type: String,
        default: null
    },
    rarity: {
        type: String,
        enum: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
        required: true
    },
    // IMPORTANT: Proper emoji field definitions
    emojiId: {
        type: String,
        default: null // Can be null for standard Unicode emojis
    },
    emojiName: {
        type: String,
        required: true // Always required - fallback to Unicode emoji if no custom emoji
    },
    obtainedAt: {
        type: Date,
        default: Date.now
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1
    },
    source: {
        type: String,
        enum: ['gacha', 'combined', 'series_completion', 'admin_grant'],
        default: 'gacha'
    }
}, { _id: false }); // Disable _id for subdocuments

// Trophy Case Schema (for achievement trophies)
const trophyCaseItemSchema = new mongoose.Schema({
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
        enum: ['monthly', 'shadow', 'community'],
        required: true
    },
    emojiId: {
        type: String,
        default: null
    },
    emojiName: {
        type: String,
        required: true
    },
    earnedAt: {
        type: Date,
        default: Date.now
    },
    monthKey: {
        type: String,
        default: null // Format: "2025-01", "2025-02", etc.
    }
}, { _id: false });

// Challenge Progress Schema (for monthly/shadow challenges)
const challengeProgressSchema = new mongoose.Schema({
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 3 // 0=none, 1=participation, 2=beaten, 3=mastery
    },
    achievements: {
        type: Number,
        default: 0
    },
    totalAchievements: {
        type: Number,
        default: 0
    },
    percentage: {
        type: Number,
        default: 0
    },
    gameTitle: {
        type: String,
        default: ''
    },
    gameIconUrl: {
        type: String,
        default: ''
    }
}, { _id: false });

// Main User Schema
const userSchema = new mongoose.Schema({
    discordId: {
        type: String,
        required: true,
        unique: true
    },
    username: {
        type: String,
        required: true
    },
    raUsername: {
        type: String,
        required: true,
        unique: true
    },
    
    // GP System
    gpBalance: {
        type: Number,
        default: 0,
        min: 0
    },
    gpTransactions: {
        type: [gpTransactionSchema],
        default: []
    },
    monthlyGpGranted: {
        type: Date,
        default: null // Track when last monthly GP was granted
    },
    
    // Challenge Progress (using Maps for flexible date keys)
    monthlyChallenges: {
        type: Map,
        of: challengeProgressSchema,
        default: new Map()
    },
    shadowChallenges: {
        type: Map,
        of: challengeProgressSchema,
        default: new Map()
    },
    
    // Community System
    communityAwards: {
        type: [communityAwardSchema],
        default: []
    },
    
    // Arena System
    arenaStats: {
        type: arenaStatsSchema,
        default: () => ({})
    },
    
    // UPDATED: Gacha system with proper schema
    gachaCollection: {
        type: [gachaCollectionItemSchema],
        default: []
    },
    
    // Trophy case for achievement trophies
    trophyCase: {
        type: [trophyCaseItemSchema],
        default: []
    },
    
    // Metadata
    isActive: {
        type: Boolean,
        default: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// ============================================================================
// INSTANCE METHODS
// ============================================================================

// GP Management Methods
userSchema.methods.hasEnoughGp = function(amount) {
    return this.gpBalance >= amount;
};

userSchema.methods.addGpTransaction = function(type, amount, description, challengeId = null) {
    this.gpTransactions.push({
        type,
        amount,
        description,
        challengeId,
        timestamp: new Date()
    });
    
    this.gpBalance += amount;
    
    // Ensure balance doesn't go negative
    if (this.gpBalance < 0) {
        this.gpBalance = 0;
    }
    
    this.lastUpdated = new Date();
};

userSchema.methods.getGpWinRate = function() {
    if (!this.arenaStats || this.arenaStats.challengesParticipated === 0) {
        return 0;
    }
    return Math.round((this.arenaStats.challengesWon / this.arenaStats.challengesParticipated) * 100);
};

userSchema.methods.getBetWinRate = function() {
    if (!this.arenaStats || this.arenaStats.betsPlaced === 0) {
        return 0;
    }
    return Math.round((this.arenaStats.betsWon / this.arenaStats.betsPlaced) * 100);
};

// Community Award Methods
userSchema.methods.addCommunityAward = function(title, description, points, awardedBy = 'System') {
    const currentYear = new Date().getFullYear();
    
    this.communityAwards.push({
        title,
        description,
        points,
        awardedBy,
        year: currentYear,
        awardedAt: new Date()
    });
    
    // Add GP transaction for the award
    this.addGpTransaction(
        'community_award',
        points,
        `Community Award: ${title}`,
        null
    );
    
    this.lastUpdated = new Date();
    return this.communityAwards[this.communityAwards.length - 1];
};

userSchema.methods.getCommunityAwardsForYear = function(year) {
    return this.communityAwards.filter(award => award.year === year);
};

userSchema.methods.getCommunityPointsForYear = function(year) {
    return this.getCommunityAwardsForYear(year)
        .reduce((total, award) => total + award.points, 0);
};

userSchema.methods.removeCommunityAward = function(awardIndex) {
    if (awardIndex >= 0 && awardIndex < this.communityAwards.length) {
        const removedAward = this.communityAwards[awardIndex];
        this.communityAwards.splice(awardIndex, 1);
        this.lastUpdated = new Date();
        return removedAward;
    }
    return null;
};

// ============================================================================
// GACHA COLLECTION METHODS (NEW)
// ============================================================================

userSchema.methods.formatGachaItemEmoji = function(item) {
    if (item.emojiId && item.emojiName) {
        return `<:${item.emojiName}:${item.emojiId}>`;
    } else if (item.emojiName) {
        return item.emojiName; // Fallback to Unicode emoji
    }
    return '❓'; // Ultimate fallback
};

userSchema.methods.getGachaItem = function(itemId) {
    if (!this.gachaCollection) return null;
    return this.gachaCollection.find(item => item.itemId === itemId);
};

userSchema.methods.addGachaItem = function(gachaItem, quantity = 1, source = 'gacha') {
    if (!this.gachaCollection) {
        this.gachaCollection = [];
    }

    const existingItem = this.gachaCollection.find(item => item.itemId === gachaItem.itemId);
    
    if (existingItem && gachaItem.maxStack > 1) {
        // Stack the item
        const newQuantity = Math.min(existingItem.quantity + quantity, gachaItem.maxStack);
        const previousQuantity = existingItem.quantity;
        existingItem.quantity = newQuantity;
        return {
            item: existingItem,
            isNew: false,
            wasStacked: true,
            previousQuantity: previousQuantity
        };
    } else if (!existingItem) {
        // Add new item with proper emoji data
        const newItem = {
            itemId: gachaItem.itemId,
            itemName: gachaItem.itemName,
            itemType: gachaItem.itemType,
            seriesId: gachaItem.seriesId,
            rarity: gachaItem.rarity,
            emojiId: gachaItem.emojiId, // Ensure this is properly saved
            emojiName: gachaItem.emojiName, // Ensure this is properly saved
            obtainedAt: new Date(),
            quantity: quantity,
            source: source
        };

        this.gachaCollection.push(newItem);
        return {
            item: newItem,
            isNew: true,
            wasStacked: false
        };
    } else {
        // Item exists but can't stack more
        return {
            item: existingItem,
            isNew: false,
            wasStacked: false,
            atMaxStack: true
        };
    }
};

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

// ============================================================================
// TROPHY CASE METHODS
// ============================================================================

userSchema.methods.addTrophy = function(gameId, gameTitle, awardLevel, challengeType, monthKey = null) {
    if (!this.trophyCase) {
        this.trophyCase = [];
    }

    // Check if trophy already exists
    const existingTrophy = this.trophyCase.find(trophy => 
        trophy.gameId === String(gameId) && 
        trophy.challengeType === challengeType &&
        trophy.monthKey === monthKey
    );

    if (existingTrophy) {
        return false; // Trophy already exists
    }

    // Get default emoji for award level
    const emojiMap = {
        mastery: '✨',
        beaten: '⭐', 
        participation: '🏁',
        special: '🎖️'
    };

    const trophy = {
        gameId: String(gameId),
        gameTitle: gameTitle,
        consoleName: 'Unknown',
        awardLevel: awardLevel,
        challengeType: challengeType,
        emojiId: null, // Will be filled when custom emoji is uploaded
        emojiName: emojiMap[awardLevel] || '🏆',
        earnedAt: new Date(),
        monthKey: monthKey
    };

    this.trophyCase.push(trophy);
    this.lastUpdated = new Date();
    return true;
};

// ============================================================================
// STATIC METHODS
// ============================================================================

userSchema.statics.formatDateKey = function(date) {
    if (!date) return null;
    
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
};

userSchema.statics.findByRaUsername = function(raUsername) {
    return this.findOne({ 
        raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
    });
};

userSchema.statics.findByDiscordId = function(discordId) {
    return this.findOne({ discordId: discordId });
};

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Update lastUpdated timestamp on save
userSchema.pre('save', function(next) {
    this.lastUpdated = new Date();
    next();
});

// ============================================================================
// INDEXES
// ============================================================================

userSchema.index({ discordId: 1 });
userSchema.index({ raUsername: 1 });
userSchema.index({ gpBalance: -1 });
userSchema.index({ lastUpdated: -1 });
userSchema.index({ 'arenaStats.challengesWon': -1 });
userSchema.index({ 'arenaStats.totalGpWon': -1 });

// ============================================================================
// EXPORT
// ============================================================================

export const User = mongoose.model('User', userSchema);
export default User;
