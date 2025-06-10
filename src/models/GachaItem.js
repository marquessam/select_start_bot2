// src/models/GachaItem.js - UPDATED with non-destructive combination support
import mongoose from 'mongoose';

// UPDATED: Enhanced combination rule schema with non-destructive support
const combinationRuleSchema = new mongoose.Schema({
    ruleId: {
        type: String,
        required: true,
        unique: true
    },
    
    // What items are needed
    ingredients: [{
        itemId: String,
        quantity: { type: Number, default: 1 }
    }],
    
    // What you get
    result: {
        itemId: String,
        quantity: { type: Number, default: 1 }
    },
    
    // Auto-combine or manual only
    isAutomatic: {
        type: Boolean,
        default: false // true = combines automatically when you have ingredients
    },
    
    // NEW: Non-destructive combination flag
    isNonDestructive: {
        type: Boolean,
        default: false // true = keeps ingredients after combination
    },
    
    // Priority for auto-combines (higher = combines first)
    priority: {
        type: Number,
        default: 0
    },
    
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Discovery tracking fields
    discovered: {
        type: Boolean,
        default: false // Whether this combination has been discovered by the community
    },
    
    discoveredAt: {
        type: Date,
        default: null // When this combination was first discovered
    },
    
    discoveredBy: {
        type: String,
        default: null // Username of the first person to discover this combination
    },
    
    createdBy: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add index for efficient discovery queries
combinationRuleSchema.index({ discovered: 1, discoveredAt: 1 });
// Add index for non-destructive combinations
combinationRuleSchema.index({ isNonDestructive: 1 });

const gachaItemSchema = new mongoose.Schema({
    itemId: {
        type: String,
        unique: true,
        required: true
    },
    itemName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    flavorText: {
        type: String,
        maxlength: 500
    },
    
    // Enhanced emoji handling with animated support
    emojiId: String,
    emojiName: {
        type: String,
        required: true
    },
    isAnimated: {
        type: Boolean,
        default: false
    },
    
    itemType: {
        type: String,
        enum: ['trinket', 'collectible', 'series', 'special', 'trophy', 'combined'],
        required: true
    },
    
    rarity: {
        type: String,
        enum: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'],
        required: true
    },
    
    // Only items with dropRate > 0 appear in gacha
    dropRate: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    
    // Stacking
    maxStack: {
        type: Number,
        default: 1
    },
    
    // Series for completion tracking
    seriesId: String,
    
    // Display settings
    sortPriority: {
        type: Number,
        default: 0 // Higher numbers appear first in collections
    },
    
    // Availability
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Creation info
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: String,
    
    // Admin notes for management
    adminNotes: String
});

// Virtual for display with animated emoji support
gachaItemSchema.virtual('displayName').get(function() {
    let emoji = this.emojiName || '❓';
    if (this.emojiId && this.emojiName) {
        const prefix = this.isAnimated ? 'a' : '';
        emoji = `<${prefix}:${this.emojiName}:${this.emojiId}>`;
    }
    return `${emoji} ${this.itemName}`;
});

// Method to check if item appears in gacha
gachaItemSchema.methods.isInGacha = function() {
    return this.isActive && this.dropRate > 0;
};

// Method to format emoji for display
gachaItemSchema.methods.formatEmoji = function() {
    if (this.emojiId && this.emojiName) {
        const prefix = this.isAnimated ? 'a' : '';
        return `<${prefix}:${this.emojiName}:${this.emojiId}>`;
    }
    return this.emojiName || '❓';
};

// Method to get emoji data object
gachaItemSchema.methods.getEmojiData = function() {
    return {
        emojiId: this.emojiId,
        emojiName: this.emojiName,
        isAnimated: this.isAnimated || false
    };
};

// Static method to get gacha pool
gachaItemSchema.statics.getGachaPool = function() {
    return this.find({ isActive: true, dropRate: { $gt: 0 } });
};

// Static method to get all combination items (dropRate: 0)
gachaItemSchema.statics.getCombinationItems = function() {
    return this.find({ isActive: true, dropRate: 0 });
};

// Static method to get discovery statistics
combinationRuleSchema.statics.getDiscoveryStats = function() {
    return this.aggregate([
        {
            $group: {
                _id: null,
                totalRules: { $sum: 1 },
                discoveredRules: {
                    $sum: { $cond: [{ $eq: ['$discovered', true] }, 1, 0] }
                },
                undiscoveredRules: {
                    $sum: { $cond: [{ $eq: ['$discovered', false] }, 1, 0] }
                },
                nonDestructiveRules: {
                    $sum: { $cond: [{ $eq: ['$isNonDestructive', true] }, 1, 0] }
                }
            }
        }
    ]);
};

export const GachaItem = mongoose.model('GachaItem', gachaItemSchema);
export const CombinationRule = mongoose.model('CombinationRule', combinationRuleSchema);
export { gachaItemSchema, combinationRuleSchema };
