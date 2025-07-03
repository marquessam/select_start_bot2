// src/models/User.js - FIXED: Resolved index conflicts and duplicate schema warnings
import mongoose from 'mongoose';

// FIXED: Lazy load cache invalidation function to avoid circular imports
let invalidateUserCollectionCache = null;

async function getInvalidateFunction() {
    if (!invalidateUserCollectionCache) {
        try {
            const collectionModule = await import('../commands/user/collection.js');
            invalidateUserCollectionCache = collectionModule.invalidateUserCollectionCache;
        } catch (error) {
            console.warn('Could not import cache invalidation function:', error.message);
            invalidateUserCollectionCache = () => {}; // No-op fallback
        }
    }
    return invalidateUserCollectionCache;
}

// Gacha collection item schema
const gachaCollectionItemSchema = new mongoose.Schema({
    itemId: { type: String, required: true },
    itemName: { type: String, required: true },
    emojiId: String,
    emojiName: String,
    isAnimated: { type: Boolean, default: false },
    rarity: { 
        type: String, 
        enum: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'], 
        required: true 
    },
    itemType: { 
        type: String, 
        enum: ['trinket', 'collectible', 'series', 'special', 'trophy', 'combined'], 
        required: true 
    },
    seriesId: String,
    description: String,
    flavorText: String,
    quantity: { type: Number, default: 1, min: 1 },
    source: { 
        type: String, 
        enum: ['gacha', 'combined', 'series_completion', 'admin_grant', 'player_transfer', 'store_purchase'], 
        default: 'gacha' 
    },
    obtainedAt: { type: Date, default: Date.now }
}, { _id: false });

// Trophy case item schema
const trophyCaseItemSchema = new mongoose.Schema({
    gameId: { type: String, required: true },
    gameTitle: { type: String, required: true },
    consoleName: String,
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
    emojiId: String,
    emojiName: String,
    isAnimated: { type: Boolean, default: false },
    earnedAt: { type: Date, default: Date.now },
    monthKey: String // Format: "2024-01" for monthly/shadow challenges
}, { _id: false });

// GP transaction schema
const gpTransactionSchema = new mongoose.Schema({
    type: { 
        type: String, 
        enum: [
            'gacha_pull', 'monthly_bonus', 'achievement_bonus', 'admin_adjustment', 
            'combination_reward', 'series_completion', 'player_gift', 'store_purchase',
            'challenge_reward', 'leaderboard_reward', 'event_reward'
        ], 
        required: true 
    },
    amount: { type: Number, required: true },
    description: String,
    timestamp: { type: Date, default: Date.now },
    relatedItemId: String,
    relatedUserId: String
}, { _id: false });

// Community award schema
const communityAwardSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    category: String,
    awardedAt: { type: Date, default: Date.now },
    awardedBy: String,
    year: { type: Number, required: true }
}, { _id: false });

// FIXED: User schema with proper index definitions (no conflicts)
const userSchema = new mongoose.Schema({
    // FIXED: No automatic index creation - we'll handle indexes manually
    discordId: { 
        type: String, 
        required: true
        // REMOVED: unique: true and index: true to prevent conflicts
    },
    raUsername: { 
        type: String, 
        required: true
        // REMOVED: unique: true and index: true to prevent conflicts
    },
    raUserId: { 
        type: Number
        // REMOVED: unique: true, sparse: true to prevent conflicts
    },
    discordUsername: String,
    
    // Achievements and points
    totalAchievements: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    totalRetroPoints: { type: Number, default: 0 },
    totalTruePoints: { type: Number, default: 0 },
    
    // Rankings
    achievementRank: Number,
    pointsRank: Number,
    
    // Monthly challenge progress
    monthlyChallenges: {
        type: Map,
        of: {
            gameId: Number,
            gameTitle: String,
            progress: { type: Number, default: 0 },
            lastUpdated: { type: Date, default: Date.now },
            isCompleted: { type: Boolean, default: false }
        },
        default: () => new Map()
    },
    
    // Shadow challenge progress
    shadowChallenges: {
        type: Map,
        of: {
            gameId: Number,
            gameTitle: String,
            progress: { type: Number, default: 0 },
            lastUpdated: { type: Date, default: Date.now },
            isCompleted: { type: Boolean, default: false }
        },
        default: () => new Map()
    },
    
    // Gacha system
    gachaCollection: [gachaCollectionItemSchema],
    gpBalance: { type: Number, default: 0 },
    gpTransactions: [gpTransactionSchema],
    
    // Trophy case
    trophyCase: [trophyCaseItemSchema],
    
    // Community awards
    communityAwards: [communityAwardSchema],
    
    // Arcade and arena tracking
    arcadeBoards: [{
        gameId: Number,
        gameTitle: String,
        position: Number,
        score: Number,
        lastUpdated: Date
    }],
    
    arenaParticipation: [{
        seasonId: String,
        gameId: Number,
        gameTitle: String,
        position: Number,
        score: Number,
        lastUpdated: Date
    }],
    
    // User preferences and settings
    preferences: {
        notifications: { type: Boolean, default: true },
        publicProfile: { type: Boolean, default: true },
        showTrophies: { type: Boolean, default: true }
    },
    
    // Membership and status
    isActive: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now },
    registeredAt: { type: Date, default: Date.now }
}, {
    timestamps: true,
    collection: 'users'
});

// FIXED: Manual index creation with proper names to avoid conflicts
userSchema.index({ discordId: 1 }, { 
    unique: true, 
    name: 'discordId_unique_idx',
    background: true 
});

userSchema.index({ raUsername: 1 }, { 
    unique: true, 
    name: 'raUsername_unique_idx',
    background: true 
});

userSchema.index({ raUserId: 1 }, { 
    unique: true, 
    sparse: true, 
    name: 'raUserId_unique_sparse_idx',
    background: true 
});

// Performance indexes with custom names
userSchema.index({ totalPoints: -1 }, { 
    name: 'totalPoints_desc_idx',
    background: true 
});

userSchema.index({ totalAchievements: -1 }, { 
    name: 'totalAchievements_desc_idx',
    background: true 
});

userSchema.index({ totalRetroPoints: -1 }, { 
    name: 'totalRetroPoints_desc_idx',
    background: true 
});

userSchema.index({ lastSeen: -1 }, { 
    name: 'lastSeen_desc_idx',
    background: true 
});

userSchema.index({ 'gachaCollection.itemId': 1 }, { 
    name: 'gachaCollection_itemId_idx',
    background: true 
});

userSchema.index({ 'gpTransactions.timestamp': -1 }, { 
    name: 'gpTransactions_timestamp_desc_idx',
    background: true 
});

// FIXED: Enhanced addGachaItem method with cache invalidation
userSchema.methods.addGachaItem = function(gachaItem, quantity = 1, source = 'gacha') {
    if (!this.gachaCollection) {
        this.gachaCollection = [];
    }

    let existingItem = null;
    let existingIndex = -1;

    // Check for existing item if stackable
    if (gachaItem.maxStack > 1) {
        existingIndex = this.gachaCollection.findIndex(item => item.itemId === gachaItem.itemId);
        if (existingIndex !== -1) {
            existingItem = this.gachaCollection[existingIndex];
        }
    }

    let resultItem;
    let isNew = false;
    let wasStacked = false;
    let atMaxStack = false;

    if (existingItem && gachaItem.maxStack > 1) {
        // Stack with existing item
        const currentQuantity = existingItem.quantity || 1;
        const newQuantity = Math.min(currentQuantity + quantity, gachaItem.maxStack);
        const actualAdded = newQuantity - currentQuantity;
        
        existingItem.quantity = newQuantity;
        existingItem.obtainedAt = new Date();
        
        // Update source if we actually added items
        if (actualAdded > 0) {
            existingItem.source = source;
        }
        
        wasStacked = true;
        atMaxStack = newQuantity >= gachaItem.maxStack;
        resultItem = existingItem;
        
        console.log(`📚 Stacked ${actualAdded} ${gachaItem.itemName} (total: ${newQuantity})`);
    } else {
        // Add as new item
        const newItem = {
            itemId: gachaItem.itemId,
            itemName: gachaItem.itemName,
            emojiId: gachaItem.emojiId,
            emojiName: gachaItem.emojiName,
            isAnimated: gachaItem.isAnimated || false,
            rarity: gachaItem.rarity,
            itemType: gachaItem.itemType,
            seriesId: gachaItem.seriesId,
            description: gachaItem.description,
            flavorText: gachaItem.flavorText,
            quantity: Math.min(quantity, gachaItem.maxStack || 1),
            source: source,
            obtainedAt: new Date()
        };
        
        this.gachaCollection.push(newItem);
        isNew = true;
        resultItem = newItem;
        atMaxStack = newItem.quantity >= (gachaItem.maxStack || 1);
        
        console.log(`✨ Added new item ${gachaItem.itemName} (quantity: ${newItem.quantity})`);
    }

    this.markModified('gachaCollection');
    
    // FIXED: Invalidate caches when collection changes (async, non-blocking)
    setImmediate(async () => {
        try {
            const invalidateFn = await getInvalidateFunction();
            if (invalidateFn && typeof invalidateFn === 'function') {
                invalidateFn(this);
            }
        } catch (error) {
            console.warn('Error invalidating collection cache:', error.message);
        }
    });

    return {
        item: resultItem,
        isNew,
        wasStacked,
        atMaxStack,
        actualQuantityAdded: wasStacked ? 
            (resultItem.quantity - (existingItem ? (existingItem.quantity || 1) - quantity : 0)) : 
            resultItem.quantity
    };
};

// FIXED: Enhanced removeGachaItem method with cache invalidation
userSchema.methods.removeGachaItem = function(itemId, quantityToRemove = 1) {
    if (!this.gachaCollection || this.gachaCollection.length === 0) {
        console.warn(`⚠️ Cannot remove ${itemId}: collection is empty`);
        return false;
    }

    const itemIndex = this.gachaCollection.findIndex(item => item.itemId === itemId);
    if (itemIndex === -1) {
        console.warn(`⚠️ Cannot remove ${itemId}: item not found in collection`);
        return false;
    }

    const item = this.gachaCollection[itemIndex];
    const currentQuantity = item.quantity || 1;

    if (currentQuantity < quantityToRemove) {
        console.warn(`⚠️ Cannot remove ${quantityToRemove}x ${itemId}: only have ${currentQuantity}`);
        return false;
    }

    if (currentQuantity === quantityToRemove) {
        // Remove the entire item
        this.gachaCollection.splice(itemIndex, 1);
        console.log(`🗑️ Removed ${item.itemName} completely`);
    } else {
        // Reduce quantity
        item.quantity = currentQuantity - quantityToRemove;
        console.log(`📉 Reduced ${item.itemName} quantity to ${item.quantity}`);
    }

    this.markModified('gachaCollection');
    
    // FIXED: Invalidate caches when collection changes (async, non-blocking)
    setImmediate(async () => {
        try {
            const invalidateFn = await getInvalidateFunction();
            if (invalidateFn && typeof invalidateFn === 'function') {
                invalidateFn(this);
            }
        } catch (error) {
            console.warn('Error invalidating collection cache:', error.message);
        }
    });

    return true;
};

// GP management methods
userSchema.methods.hasEnoughGp = function(amount) {
    return (this.gpBalance || 0) >= amount;
};

userSchema.methods.addGpTransaction = function(type, amount, description = '', relatedItemId = null, relatedUserId = null) {
    if (!this.gpTransactions) {
        this.gpTransactions = [];
    }

    // Update balance
    this.gpBalance = (this.gpBalance || 0) + amount;
    
    // Add transaction record
    const transaction = {
        type,
        amount,
        description,
        timestamp: new Date(),
        relatedItemId,
        relatedUserId
    };
    
    this.gpTransactions.push(transaction);
    
    // Keep only last 100 transactions per user
    if (this.gpTransactions.length > 100) {
        this.gpTransactions = this.gpTransactions.slice(-100);
    }
    
    this.markModified('gpTransactions');
    
    console.log(`💰 GP transaction for ${this.raUsername}: ${amount > 0 ? '+' : ''}${amount} GP (${type})`);
    console.log(`💰 New balance: ${this.gpBalance} GP`);
    
    return transaction;
};

// Challenge management methods
userSchema.methods.updateMonthlyChallenge = function(monthKey, gameId, gameTitle, progress) {
    if (!this.monthlyChallenges) {
        this.monthlyChallenges = new Map();
    }
    
    const existing = this.monthlyChallenges.get(monthKey) || {};
    const updated = {
        gameId: gameId || existing.gameId,
        gameTitle: gameTitle || existing.gameTitle,
        progress: progress !== undefined ? progress : existing.progress,
        lastUpdated: new Date(),
        isCompleted: progress >= 3
    };
    
    this.monthlyChallenges.set(monthKey, updated);
    this.markModified('monthlyChallenges');
    
    return updated;
};

userSchema.methods.updateShadowChallenge = function(monthKey, gameId, gameTitle, progress) {
    if (!this.shadowChallenges) {
        this.shadowChallenges = new Map();
    }
    
    const existing = this.shadowChallenges.get(monthKey) || {};
    const updated = {
        gameId: gameId || existing.gameId,
        gameTitle: gameTitle || existing.gameTitle,
        progress: progress !== undefined ? progress : existing.progress,
        lastUpdated: new Date(),
        isCompleted: progress >= 2 // Shadow challenges complete at 2
    };
    
    this.shadowChallenges.set(monthKey, updated);
    this.markModified('shadowChallenges');
    
    return updated;
};

// Trophy management methods
userSchema.methods.addTrophy = function(gameId, gameTitle, awardLevel, challengeType, monthKey = null, emojiData = {}) {
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
        console.log(`Trophy already exists for ${this.raUsername}: ${gameTitle} (${challengeType})`);
        return false;
    }
    
    const trophy = {
        gameId: String(gameId),
        gameTitle,
        consoleName: 'Unknown',
        awardLevel,
        challengeType,
        emojiId: emojiData.emojiId || null,
        emojiName: emojiData.emojiName || this.getDefaultTrophyEmoji(awardLevel),
        isAnimated: emojiData.isAnimated || false,
        earnedAt: new Date(),
        monthKey
    };
    
    this.trophyCase.push(trophy);
    this.markModified('trophyCase');
    
    console.log(`🏆 Added trophy for ${this.raUsername}: ${gameTitle} (${awardLevel})`);
    return true;
};

userSchema.methods.getDefaultTrophyEmoji = function(awardLevel) {
    const emojiMap = {
        mastery: '✨',
        beaten: '⭐',
        participation: '🏁',
        special: '🏆'
    };
    return emojiMap[awardLevel] || '🏆';
};

// Community award methods
userSchema.methods.addCommunityAward = function(title, description, category, awardedBy) {
    if (!this.communityAwards) {
        this.communityAwards = [];
    }
    
    const currentYear = new Date().getFullYear();
    
    // Check if award already exists for this year
    const existingAward = this.communityAwards.find(award => 
        award.title === title && award.year === currentYear
    );
    
    if (existingAward) {
        console.log(`Community award already exists for ${this.raUsername}: ${title} (${currentYear})`);
        return false;
    }
    
    const award = {
        title,
        description,
        category,
        awardedBy,
        awardedAt: new Date(),
        year: currentYear
    };
    
    this.communityAwards.push(award);
    this.markModified('communityAwards');
    
    console.log(`🌟 Added community award for ${this.raUsername}: ${title}`);
    return true;
};

userSchema.methods.getCommunityAwardsForYear = function(year) {
    if (!this.communityAwards) return [];
    return this.communityAwards.filter(award => award.year === year);
};

// Utility methods
userSchema.methods.getCollectionValue = function() {
    if (!this.gachaCollection) return 0;
    
    const rarityValues = {
        common: 1,
        uncommon: 2,
        rare: 5,
        epic: 10,
        legendary: 25,
        mythic: 50
    };
    
    return this.gachaCollection.reduce((total, item) => {
        const value = rarityValues[item.rarity] || 1;
        return total + (value * (item.quantity || 1));
    }, 0);
};

userSchema.methods.getCollectionStats = function() {
    if (!this.gachaCollection || this.gachaCollection.length === 0) {
        return {
            totalItems: 0,
            uniqueItems: 0,
            rarityBreakdown: {},
            seriesBreakdown: {},
            sourceBreakdown: {}
        };
    }
    
    const stats = {
        totalItems: 0,
        uniqueItems: this.gachaCollection.length,
        rarityBreakdown: {},
        seriesBreakdown: {},
        sourceBreakdown: {}
    };
    
    this.gachaCollection.forEach(item => {
        const quantity = item.quantity || 1;
        stats.totalItems += quantity;
        
        // Rarity breakdown
        stats.rarityBreakdown[item.rarity] = (stats.rarityBreakdown[item.rarity] || 0) + quantity;
        
        // Series breakdown
        const series = item.seriesId || 'Individual';
        stats.seriesBreakdown[series] = (stats.seriesBreakdown[series] || 0) + quantity;
        
        // Source breakdown
        const source = item.source || 'gacha';
        stats.sourceBreakdown[source] = (stats.sourceBreakdown[source] || 0) + quantity;
    });
    
    return stats;
};

userSchema.methods.updateLastSeen = function() {
    this.lastSeen = new Date();
    this.markModified('lastSeen');
};

// Virtual properties
userSchema.virtual('profileUrl').get(function() {
    return `https://retroachievements.org/user/${this.raUsername}`;
});

userSchema.virtual('totalTrophies').get(function() {
    return this.trophyCase ? this.trophyCase.length : 0;
});

userSchema.virtual('gpBalanceFormatted').get(function() {
    return (this.gpBalance || 0).toLocaleString();
});

// Static methods
userSchema.statics.findByDiscordId = function(discordId) {
    return this.findOne({ discordId });
};

userSchema.statics.findByRAUsername = function(raUsername) {
    return this.findOne({ raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') } });
};

userSchema.statics.getTopByPoints = function(limit = 10) {
    return this.find({ isActive: true })
        .sort({ totalPoints: -1 })
        .limit(limit)
        .select('raUsername totalPoints totalAchievements pointsRank');
};

userSchema.statics.getTopByAchievements = function(limit = 10) {
    return this.find({ isActive: true })
        .sort({ totalAchievements: -1 })
        .limit(limit)
        .select('raUsername totalAchievements totalPoints achievementRank');
};

userSchema.statics.findWithGachaItems = function() {
    return this.find({ 
        gachaCollection: { $exists: true, $ne: [] },
        isActive: true 
    });
};

// Pre-save middleware
userSchema.pre('save', function(next) {
    // Update last seen on any save
    if (!this.isNew) {
        this.lastSeen = new Date();
    }
    
    // Ensure GP balance is never negative
    if (this.gpBalance < 0) {
        console.warn(`⚠️ Negative GP balance detected for ${this.raUsername}: ${this.gpBalance}, setting to 0`);
        this.gpBalance = 0;
    }
    
    next();
});

// Post-save middleware for logging
userSchema.post('save', function(doc) {
    if (doc.isNew) {
        console.log(`✅ New user registered: ${doc.raUsername} (${doc.discordId})`);
    }
});

// FIXED: Export model
export const User = mongoose.model('User', userSchema);
export { userSchema };
