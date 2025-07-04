// src/models/User.js - FIXED: Removed automatic unique constraint to avoid index conflicts
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

// UPDATED: Enhanced gacha collection schema with store_purchase source
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
    // Enhanced emoji support with animation flag
    emojiId: {
        type: String,
        default: null       // Discord custom emoji ID
    },
    emojiName: {
        type: String,
        required: true      // Fallback emoji name (Unicode or custom name)
    },
    isAnimated: {
        type: Boolean,
        default: false      // Whether the emoji is animated
    },
    description: String,    // Item description for reference
    flavorText: String,     // Item flavor text for reference
    obtainedAt: {
        type: Date,
        default: Date.now
    },
    quantity: {             // For stackable items
        type: Number,
        default: 1,
        min: 1
    },
    source: {
        type: String,
        enum: ['gacha', 'combined', 'series_completion', 'admin_grant', 'admin_test', 'player_transfer', 'store_purchase'], // ADDED store_purchase
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
        required: true
        // REMOVED: unique: true - we'll handle this with explicit indexing
    },
    discordId: {
        type: String,
        required: true
        // REMOVED: sparse: true - we'll handle this with explicit indexing
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
    
    // GP transaction history with ALL reward types included
    gpTransactions: [{
        type: {
            type: String,
            enum: [
                'monthly_grant', 'wager', 'bet', 'win', 'refund', 'admin_adjust', 'gacha_pull',
                // GP REWARD TYPES
                'nomination', 'vote', 'challenge_award', 'game_completion', 'admin_award', 'admin_mass_distribution'
            ],
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
    
    // UPDATED: Gacha collection with enhanced emoji support including animation
    gachaCollection: [gachaCollectionSchema]

}, {
    timestamps: true,
    strict: false // Allow additional fields to be added
});

// ===== CUSTOM INDEX CREATION WITH SAFE HANDLING =====
// Create indexes manually with proper error handling

// CRITICAL: We need to create indexes after schema definition but handle conflicts gracefully
userSchema.post('init', async function() {
    try {
        const collection = this.constructor.collection;
        
        // Get existing indexes
        const existingIndexes = await collection.indexes();
        const indexNames = existingIndexes.map(idx => idx.name);
        
        console.log('📋 Existing User indexes before creation:', indexNames);
        
        // Handle raUsername unique index
        const hasProperRAUsernameIndex = indexNames.includes('raUsername_1');
        const hasConflictingRAIndex = indexNames.some(name => 
            name.includes('raUsername') && name !== 'raUsername_1' && name !== '_id_'
        );
        
        if (hasConflictingRAIndex && !hasProperRAUsernameIndex) {
            console.log('🚨 Conflicting raUsername index detected, attempting to resolve...');
            
            // Drop conflicting indexes
            for (const indexName of indexNames) {
                if (indexName.includes('raUsername') && indexName !== 'raUsername_1' && indexName !== '_id_') {
                    try {
                        await collection.dropIndex(indexName);
                        console.log(`✅ Dropped conflicting index: ${indexName}`);
                    } catch (dropError) {
                        console.log(`⚠️ Could not drop index ${indexName}:`, dropError.message);
                    }
                }
            }
            
            // Wait a moment
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Create proper raUsername unique index
        if (!hasProperRAUsernameIndex) {
            try {
                await collection.createIndex(
                    { raUsername: 1 }, 
                    { unique: true, background: true, name: 'raUsername_1' }
                );
                console.log('✅ Created raUsername unique index');
            } catch (createError) {
                if (createError.code === 85) {
                    console.log('ℹ️ raUsername index conflict - trying to resolve...');
                    // The index exists but with a different name, we need to handle this at the application level
                } else {
                    console.error('❌ Error creating raUsername index:', createError.message);
                }
            }
        }
        
        // Handle discordId sparse index
        const hasProperDiscordIdIndex = indexNames.some(name => 
            name.includes('discordId') && name.includes('sparse')
        );
        
        if (!hasProperDiscordIdIndex) {
            try {
                await collection.createIndex(
                    { discordId: 1 }, 
                    { sparse: true, background: true, name: 'discordId_sparse_1' }
                );
                console.log('✅ Created discordId sparse index');
            } catch (createError) {
                console.log('ℹ️ discordId index already exists or conflict:', createError.message);
            }
        }
        
    } catch (error) {
        console.error('❌ Error in User schema index creation:', error.message);
        // Don't throw - allow the model to be created even if indexes fail
    }
});

// ===== REGULAR INDEXES (these should work fine) =====
// Add indexes for Arena system
userSchema.index({ 'arenaStats.challengesWon': -1 }, { background: true });
userSchema.index({ 'arenaStats.totalGpWon': -1 }, { background: true });
userSchema.index({ gpBalance: -1 }, { background: true });
userSchema.index({ lastMonthlyGpGrant: 1 }, { background: true });

// Add indexes for trophy system
userSchema.index({ 'trophyCase.challengeType': 1 }, { background: true });
userSchema.index({ 'trophyCase.earnedAt': -1 }, { background: true });

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

// Add GP transaction and update balance with enhanced logging
userSchema.methods.addGpTransaction = function(type, amount, description, challengeId = null) {
    if (!this.gpTransactions) {
        this.gpTransactions = [];
    }
    
    // Log the transaction for debugging
    console.log(`💰 Adding GP transaction: ${amount} GP for ${this.raUsername} (${type}: ${description})`);
    
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
    const oldBalance = this.gpBalance || 0;
    this.gpBalance = oldBalance + amount;
    
    // Ensure balance doesn't go below 0
    if (this.gpBalance < 0) {
        this.gpBalance = 0;
    }
    
    console.log(`💰 GP Balance updated: ${oldBalance} → ${this.gpBalance} (${amount >= 0 ? '+' : ''}${amount})`);
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

// Method to reload user from database (for testing)
userSchema.methods.reload = async function() {
    const updated = await this.constructor.findById(this._id);
    if (updated) {
        Object.assign(this, updated.toObject());
    }
    return this;
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

// UPDATED: Format gacha item emoji for display with animated support
userSchema.methods.formatGachaItemEmoji = function(item) {
    if (item.emojiId && item.emojiName) {
        const prefix = item.isAnimated ? 'a' : '';
        return `<${prefix}:${item.emojiName}:${item.emojiId}>`;
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

// UPDATED: Add or update gacha item in collection with animated emoji support
userSchema.methods.addGachaItem = function(gachaItem, quantity = 1, source = 'gacha') {
    console.log('🔧 addGachaItem called with:', {
        itemId: gachaItem.itemId,
        itemName: gachaItem.itemName,
        emojiId: gachaItem.emojiId,
        emojiName: gachaItem.emojiName,
        isAnimated: gachaItem.isAnimated,
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
        if (gachaItem.isAnimated !== undefined) {
            existingItem.isAnimated = gachaItem.isAnimated;
        }
        
        console.log('📚 Stacked item:', {
            itemName: existingItem.itemName,
            newQuantity: newQuantity,
            emojiId: existingItem.emojiId,
            emojiName: existingItem.emojiName,
            isAnimated: existingItem.isAnimated
        });
        
        return {
            item: existingItem,
            isNew: false,
            wasStacked: true,
            previousQuantity: previousQuantity
        };
    } else if (!existingItem) {
        // Add new item with COMPLETE emoji data transfer including animation
        const newItem = {
            itemId: gachaItem.itemId,
            itemName: gachaItem.itemName,
            itemType: gachaItem.itemType,
            seriesId: gachaItem.seriesId,
            rarity: gachaItem.rarity,
            description: gachaItem.description,
            flavorText: gachaItem.flavorText,
            // CRITICAL: Ensure ALL emoji data is properly copied
            emojiId: gachaItem.emojiId || null,
            emojiName: gachaItem.emojiName || '❓',
            isAnimated: gachaItem.isAnimated || false,  // UPDATED: Copy animation flag
            obtainedAt: new Date(),
            quantity: quantity,
            source: source
        };

        console.log('✨ Creating new collection item:', {
            itemId: newItem.itemId,
            itemName: newItem.itemName,
            emojiId: newItem.emojiId,
            emojiName: newItem.emojiName,
            isAnimated: newItem.isAnimated,
            source: newItem.source
        });

        this.gachaCollection.push(newItem);
        
        // VERIFICATION: Check that emoji data was saved correctly
        const savedItem = this.gachaCollection[this.gachaCollection.length - 1];
        console.log('🔍 Verification - saved item emoji data:', {
            emojiId: savedItem.emojiId,
            emojiName: savedItem.emojiName,
            isAnimated: savedItem.isAnimated
        });
        
        if (gachaItem.emojiId && !savedItem.emojiId) {
            console.error('❌ CRITICAL: emojiId was not saved correctly!');
            console.error('Source emojiId:', gachaItem.emojiId);
            console.error('Saved emojiId:', savedItem.emojiId);
        }
        
        if (gachaItem.isAnimated !== undefined && gachaItem.isAnimated !== savedItem.isAnimated) {
            console.error('❌ CRITICAL: isAnimated was not saved correctly!');
            console.error('Source isAnimated:', gachaItem.isAnimated);
            console.error('Saved isAnimated:', savedItem.isAnimated);
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

// Remove gacha item from collection with enhanced debug logging
userSchema.methods.removeGachaItem = function(itemId, quantity = 1) {
    console.log(`🗑️ removeGachaItem called: itemId=${itemId}, quantity=${quantity}`);
    
    if (!this.gachaCollection) {
        console.log('❌ No gachaCollection found');
        return false;
    }
    
    console.log('📦 Current collection before removal:', this.gachaCollection.map(item => ({
        itemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity || 1
    })));
    
    const item = this.gachaCollection.find(item => item.itemId === itemId);
    if (!item) {
        console.log(`❌ Item ${itemId} not found in collection`);
        return false;
    }
    
    const currentQuantity = item.quantity || 1;
    console.log(`📦 Found item: ${item.itemName} with quantity ${currentQuantity}`);
    console.log(`🔢 Trying to remove ${quantity} from ${currentQuantity}`);
    
    if (currentQuantity <= quantity) {
        // Remove item completely
        console.log(`🗑️ Removing item completely (${currentQuantity} <= ${quantity})`);
        const beforeLength = this.gachaCollection.length;
        
        // More robust filtering to ensure removal
        this.gachaCollection = this.gachaCollection.filter(collectionItem => {
            const shouldKeep = collectionItem.itemId !== itemId;
            if (!shouldKeep) {
                console.log(`🗑️ Filtering out item: ${collectionItem.itemName} (ID: ${collectionItem.itemId})`);
            }
            return shouldKeep;
        });
        
        const afterLength = this.gachaCollection.length;
        console.log(`📊 Collection length: ${beforeLength} → ${afterLength}`);
        
        if (beforeLength === afterLength) {
            console.log('❌ WARNING: Item was not actually removed from collection!');
            // Additional debugging
            console.log('Items in collection with same ID:', this.gachaCollection.filter(i => i.itemId === itemId));
            return false;
        }
        
        console.log(`✅ Successfully removed ${item.itemName} completely`);
        console.log('📦 Collection after removal:', this.gachaCollection.map(item => ({
            itemId: item.itemId,
            itemName: item.itemName,
            quantity: item.quantity || 1
        })));
        return true;
    } else {
        // Reduce quantity
        console.log(`🔢 Reducing quantity: ${currentQuantity} → ${currentQuantity - quantity}`);
        item.quantity = currentQuantity - quantity;
        console.log(`✅ Successfully reduced ${item.itemName} quantity to ${item.quantity}`);
        console.log('📦 Collection after quantity reduction:', this.gachaCollection.map(item => ({
            itemId: item.itemId,
            itemName: item.itemName,
            quantity: item.quantity || 1
        })));
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
