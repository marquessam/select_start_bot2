// src/models/GachaItem.js
import mongoose from 'mongoose';

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
    itemType: {
        type: String,
        enum: ['trinket', 'collectible', 'series', 'special', 'trophy'],
        required: true
    },
    seriesId: String, // For collection series like "triforce"
    rarity: {
        type: String,
        enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
        required: true
    },
    dropRate: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    emojiId: String, // Discord emoji ID
    emojiName: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    flavorText: String,
    
    // For series items - what items are needed to complete the series
    seriesRequirements: [String], // Array of itemIds needed for completion
    
    // Reward for completing a series
    completionReward: {
        itemId: String,
        itemName: String,
        emojiId: String,
        emojiName: String
    },
    
    // Stacking info
    maxStack: {
        type: Number,
        default: 1
    },
    
    // Seasonal availability
    seasonalStart: Date,
    seasonalEnd: Date,
    
    // Creation info
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: String
});

// Method to check if item is currently available
gachaItemSchema.methods.isAvailable = function() {
    if (!this.isActive) return false;
    
    const now = new Date();
    if (this.seasonalStart && now < this.seasonalStart) return false;
    if (this.seasonalEnd && now > this.seasonalEnd) return false;
    
    return true;
};

// Static method to get available items with their drop rates
gachaItemSchema.statics.getAvailableItems = function() {
    const now = new Date();
    return this.find({
        isActive: true,
        $or: [
            { seasonalStart: { $exists: false } },
            { seasonalStart: null },
            { seasonalStart: { $lte: now } }
        ],
        $or: [
            { seasonalEnd: { $exists: false } },
            { seasonalEnd: null },
            { seasonalEnd: { $gte: now } }
        ]
    });
};

export const GachaItem = mongoose.model('GachaItem', gachaItemSchema);
export default GachaItem;
