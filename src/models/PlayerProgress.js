const mongoose = require('mongoose');
const { AwardType } = require('../enums/AwardType');

const playerProgressSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        set: v => v.toLowerCase()
    },
    gameId: {
        type: String,
        required: true
    },
    lastAchievementTimestamp: {
        type: Date,
        required: true,
        default: Date.now
    },
    // Track the last award type announced to prevent duplicate announcements
    lastAwardType: {
        type: Number,
        enum: Object.values(AwardType),
        default: AwardType.NONE
    },
    // We'll use this to track which achievements have been announced
    announcedAchievements: [{
        type: String  // Achievement IDs
    }]
}, {
    timestamps: true
});

// Index for efficient queries
playerProgressSchema.index({ raUsername: 1, gameId: 1 }, { unique: true });

module.exports = mongoose.model('PlayerProgress', playerProgressSchema);
