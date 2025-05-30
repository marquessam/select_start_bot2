// src/models/GachaItem.js - Simplified version focused on combinations
import mongoose from 'mongoose';

// Simple combination rule schema
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
    
    // Priority for auto-combines (higher = combines first)
    priority: {
        type: Number,
        default: 0
    },
    
    isActive: {
        type: Boolean,
        default: true
    },
    
    createdBy: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

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
    
    // Emoji handling
    emojiId: String,
    emojiName: {
        type: String,
        required: true
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

// Virtual for display
gachaItemSchema.virtual('displayName').get(function() {
    const emoji = this.emojiId ? `<:${this.emojiName}:${this.emojiId}>` : this.emojiName;
    return `${emoji} ${this.itemName}`;
});

// Method to check if item appears in gacha
gachaItemSchema.methods.isInGacha = function() {
    return this.isActive && this.dropRate > 0;
};

// Static method to get gacha pool
gachaItemSchema.statics.getGachaPool = function() {
    return this.find({ isActive: true, dropRate: { $gt: 0 } });
};

// Static method to get all combination items (dropRate: 0)
gachaItemSchema.statics.getCombinationItems = function() {
    return this.find({ isActive: true, dropRate: 0 });
};

export const GachaItem = mongoose.model('GachaItem', gachaItemSchema);
export const CombinationRule = mongoose.model('CombinationRule', combinationRuleSchema);
export { gachaItemSchema, combinationRuleSchema };
