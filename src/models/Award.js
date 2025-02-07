// File: src/models/Award.js
const mongoose = require('mongoose');
const { AwardType } = require('../enums/AwardType');

const awardSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        set: v => v.toLowerCase()  // Normalize username on save
    },
    gameId: {
        type: String,
        required: true
    },
    month: {
        type: Number,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    // New enum-based award
    award: {
        type: Number,
        enum: Object.values(AwardType),
        default: AwardType.NONE,
        required: true
    },
    // Keep achievement counts for leaderboard display
    achievementCount: {
        type: Number,
        required: true,
        default: 0
    },
    totalAchievements: {
        type: Number,
        required: true,
        default: 0
    },
    userCompletion: {
        type: String,
        required: true,
        default: "0.00%"
    },
    lastChecked: {
        type: Date,
        required: true,
        default: Date.now
    }
});

// Index for efficient queries
awardSchema.index({ raUsername: 1, gameId: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Award', awardSchema);
