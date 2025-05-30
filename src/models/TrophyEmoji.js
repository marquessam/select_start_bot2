// src/models/TrophyEmoji.js - Database model for trophy emoji storage
import mongoose from 'mongoose';

const trophyEmojiSchema = new mongoose.Schema({
    challengeType: {
        type: String,
        enum: ['monthly', 'shadow', 'community'],
        required: true
    },
    monthKey: {
        type: String,
        required: true // Format: "2025-01", "2025-02", etc.
    },
    emojiId: {
        type: String,
        required: true // Discord emoji ID
    },
    emojiName: {
        type: String,
        required: true // Discord emoji name
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure one emoji per challenge type + month combination
trophyEmojiSchema.index({ challengeType: 1, monthKey: 1 }, { unique: true });

// Update the updatedAt field on save
trophyEmojiSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Static method to get emoji for a specific challenge and month
trophyEmojiSchema.statics.getEmoji = async function(challengeType, monthKey) {
    return await this.findOne({ challengeType, monthKey });
};

// Static method to set or update emoji
trophyEmojiSchema.statics.setEmoji = async function(challengeType, monthKey, emojiId, emojiName) {
    return await this.findOneAndUpdate(
        { challengeType, monthKey },
        { 
            challengeType,
            monthKey,
            emojiId,
            emojiName,
            updatedAt: new Date()
        },
        { 
            upsert: true, 
            new: true,
            runValidators: true
        }
    );
};

// Static method to clear emoji (delete record)
trophyEmojiSchema.statics.clearEmoji = async function(challengeType, monthKey) {
    return await this.findOneAndDelete({ challengeType, monthKey });
};

// Static method to get all emojis for a challenge type
trophyEmojiSchema.statics.getEmojisByType = async function(challengeType) {
    return await this.find({ challengeType }).sort({ monthKey: 1 });
};

// Static method to get all emojis
trophyEmojiSchema.statics.getAllEmojis = async function() {
    return await this.find({}).sort({ challengeType: 1, monthKey: 1 });
};

export const TrophyEmoji = mongoose.model('TrophyEmoji', trophyEmojiSchema);
export default TrophyEmoji;
