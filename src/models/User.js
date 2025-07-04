// src/models/User.js - FIXED VERSION: Resolves validation errors
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

// FIXED: GP transaction schema with comprehensive enum values
const gpTransactionSchema = new mongoose.Schema({
    type: { 
        type: String, 
        enum: [
            // Original enum values
            'gacha_pull', 'monthly_bonus', 'achievement_bonus', 'admin_adjustment', 
            'combination_reward', 'series_completion', 'player_gift', 'store_purchase',
            'challenge_reward', 'leaderboard_reward', 'event_reward',
            // FIXED: Add missing enum values found in error
            'monthly_grant', 'wager', 'admin_award', 'game_completion', 
            'refund', 'challenge_award', 'bet', 'vote',
            // Additional common values for completeness
            'arena_win', 'arena_participation', 'daily_bonus', 'special_event',
            'compensation', 'manual_adjustment', 'system_adjustment'
        ], 
        required: true 
    },
    amount: { type: Number, required: true },
    description: String,
    timestamp: { type: Date, default: Date.now },
    relatedItemId: String,
    relatedUserId: String
}, { _id: false });

// FIXED: Community award schema with optional year and automatic calculation
const communityAwardSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    category: String,
    awardedAt: { type: Date, default: Date.now },
    awardedBy: String,
    // FIXED: Make year optional with automatic calculation from awardedAt
    year: { 
        type: Number, 
        required: false,  // Changed to false to prevent validation errors
        default: function() {
            // Automatically calculate year from awardedAt if not provided
            return this.awardedAt ? this.awardedAt.getFullYear() : new Date().getFullYear();
        }
    }
}, { _id: false });

// FIXED: User schema with validation error prevention
const userSchema = new mongoose.Schema({
    // Core user identification
    discordId: { 
        type: String, 
        required: true
    },
    raUsername: { 
        type: String, 
        required: true
    },
    raUserId: { 
        type: Number
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
    
    // FIXED: Community awards with proper validation
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
    collection: 'users',
    // Disable automatic index creation (handled manually)
    autoIndex: false
});

// FIXED: Pre-save middleware to ensure data integrity
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
    
    // FIXED: Ensure all community awards have a year
    if (this.communityAwards && this.communityAwards.length > 0) {
        this.communityAwards.forEach(award => {
            if (!award.year && award.awardedAt) {
                award.year = award.awardedAt.getFullYear();
                console.log(`🔧 Auto-assigned year ${award.year} to community award: ${award.title}`);
            } else if (!award.year) {
                award.year = new Date().getFullYear();
                console.log(`🔧 Auto-assigned current year ${award.year} to community award: ${award.title}`);
            }
        });
        this.markModified('communityAwards');
    }
    
    next();
});

// Enhanced addGachaItem method with cache invalidation
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

// Enhanced removeGachaItem method with cache invalidation
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

// FIXED: Enhanced GP transaction method with better type validation
userSchema.methods.addGpTransaction = function(type, amount, description = '', relatedItemId = null, relatedUserId = null) {
    if (!this.gpTransactions) {
        this.gpTransactions = [];
    }

    // FIXED: Validate transaction type against enum
    const validTypes = [
        'gacha_pull', 'monthly_bonus', 'achievement_bonus', 'admin_adjustment', 
        'combination_reward', 'series_completion', 'player_gift', 'store_purchase',
        'challenge_reward', 'leaderboard_reward', 'event_reward',
        'monthly_grant', 'wager', 'admin_award', 'game_completion', 
        'refund', 'challenge_award', 'bet', 'vote',
        'arena_win', 'arena_participation', 'daily_bonus', 'special_event',
        'compensation', 'manual_adjustment', 'system_adjustment'
    ];

    if (!validTypes.includes(type)) {
        console.warn(`⚠️ Unknown GP transaction type: ${type}, using 'manual_adjustment'`);
        type = 'manual_adjustment';
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

// GP management methods
userSchema.methods.hasEnoughGp = function(amount) {
    return (this.gpBalance || 0) >= amount;
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

// FIXED: Enhanced community award methods with automatic year handling
userSchema.methods.addCommunityAward = function(title, description, category, awardedBy, year = null) {
    if (!this.communityAwards) {
        this.communityAwards = [];
    }
    
    // Use provided year or calculate from current date
    const awardYear = year || new Date().getFullYear();
    
    // Check if award already exists for this year
    const existingAward = this.communityAwards.find(award => 
        award.title === title && award.year === awardYear
    );
    
    if (existingAward) {
        console.log(`Community award already exists for ${this.raUsername}: ${title} (${awardYear})`);
        return false;
    }
    
    const award = {
        title,
        description,
        category,
        awardedBy,
        awardedAt: new Date(),
        year: awardYear  // Explicitly set the year
    };
    
    this.communityAwards.push(award);
    this.markModified('communityAwards');
    
    console.log(`🌟 Added community award for ${this.raUsername}: ${title} (${awardYear})`);
    return true;
};

userSchema.methods.getCommunityAwardsForYear = function(year) {
    if (!this.communityAwards) return [];
    return this.communityAwards.filter(award => award.year === year);
};

// FIXED: Method to get community points with year validation
userSchema.methods.getCommunityPointsForYear = function(year) {
    const awards = this.getCommunityAwardsForYear(year);
    return awards.reduce((total, award) => {
        // Assign points based on award type or use default
        const defaultPoints = 5; // Default points per community award
        return total + (award.points || defaultPoints);
    }, 0);
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

// FIXED: Data migration static method
userSchema.statics.fixValidationIssues = async function() {
    console.log('🔧 Starting User model validation fixes...');
    
    try {
        // Fix missing years in community awards
        const usersWithAwards = await this.find({ 
            'communityAwards.0': { $exists: true } 
        });
        
        let fixedUsers = 0;
        
        for (const user of usersWithAwards) {
            let needsSave = false;
            
            if (user.communityAwards) {
                user.communityAwards.forEach(award => {
                    if (!award.year && award.awardedAt) {
                        award.year = award.awardedAt.getFullYear();
                        needsSave = true;
                        console.log(`🔧 Fixed year for ${user.raUsername}: ${award.title} -> ${award.year}`);
                    } else if (!award.year) {
                        award.year = new Date().getFullYear();
                        needsSave = true;
                        console.log(`🔧 Set current year for ${user.raUsername}: ${award.title} -> ${award.year}`);
                    }
                });
            }
            
            if (needsSave) {
                user.markModified('communityAwards');
                await user.save();
                fixedUsers++;
            }
        }
        
        console.log(`✅ Fixed community awards for ${fixedUsers} users`);
        
        // Report on GP transaction types that might cause issues
        const allUsers = await this.find({ 'gpTransactions.0': { $exists: true } });
        const unknownTypes = new Set();
        
        const validTypes = [
            'gacha_pull', 'monthly_bonus', 'achievement_bonus', 'admin_adjustment', 
            'combination_reward', 'series_completion', 'player_gift', 'store_purchase',
            'challenge_reward', 'leaderboard_reward', 'event_reward',
            'monthly_grant', 'wager', 'admin_award', 'game_completion', 
            'refund', 'challenge_award', 'bet', 'vote',
            'arena_win', 'arena_participation', 'daily_bonus', 'special_event',
            'compensation', 'manual_adjustment', 'system_adjustment'
        ];
        
        allUsers.forEach(user => {
            if (user.gpTransactions) {
                user.gpTransactions.forEach(transaction => {
                    if (!validTypes.includes(transaction.type)) {
                        unknownTypes.add(transaction.type);
                    }
                });
            }
        });
        
        if (unknownTypes.size > 0) {
            console.warn('⚠️ Found unknown GP transaction types:', Array.from(unknownTypes));
            console.warn('These should be added to the enum in the schema');
        } else {
            console.log('✅ All GP transaction types are valid');
        }
        
        return { 
            success: true, 
            fixedUsers,
            unknownTransactionTypes: Array.from(unknownTypes)
        };
        
    } catch (error) {
        console.error('❌ Error fixing validation issues:', error);
        return { success: false, error: error.message };
    }
};

// EMERGENCY: Index creation function
userSchema.statics.createIndexesSafely = async function() {
    console.log('🔨 Creating User model indexes safely...');
    
    try {
        const collection = this.collection;
        const timestamp = Date.now();
        
        const indexesToCreate = [
            {
                spec: { discordId: 1 },
                options: { 
                    unique: true, 
                    name: `discordId_unique_${timestamp}`,
                    background: true 
                },
                description: 'discordId unique index'
            },
            {
                spec: { raUsername: 1 },
                options: { 
                    unique: true, 
                    name: `raUsername_unique_${timestamp}`,
                    background: true 
                },
                description: 'raUsername unique index'
            },
            {
                spec: { raUserId: 1 },
                options: { 
                    unique: true, 
                    sparse: true, 
                    name: `raUserId_unique_sparse_${timestamp}`,
                    background: true 
                },
                description: 'raUserId unique sparse index'
            },
            {
                spec: { totalPoints: -1 },
                options: { 
                    name: `totalPoints_desc_${timestamp}`,
                    background: true 
                },
                description: 'totalPoints performance index'
            }
        ];
        
        for (const { spec, options, description } of indexesToCreate) {
            try {
                await collection.createIndex(spec, options);
                console.log(`✅ Created ${description}`);
            } catch (error) {
                if (error.code === 85 || error.code === 86) {
                    console.warn(`⚠️ ${description} already exists or conflicts, skipping`);
                } else {
                    console.warn(`⚠️ Error creating ${description}: ${error.message}`);
                }
            }
        }
        
        console.log('✅ User index creation complete');
        return true;
        
    } catch (error) {
        console.error('❌ Error in User index creation:', error);
        return false;
    }
};

// Post-save middleware for logging
userSchema.post('save', function(doc) {
    if (doc.isNew) {
        console.log(`✅ New user registered: ${doc.raUsername} (${doc.discordId})`);
    }
});

// Export model with fixes applied
export const User = mongoose.model('User', userSchema);
export { userSchema };
