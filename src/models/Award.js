// File: src/models/Award.js
const mongoose = require('mongoose');

const awardSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        set: v => v.toLowerCase(),  // Normalize username on save
    },
    gameId: {
        type: String,
        required: true,
    },
    month: {
        type: Number,
        required: true,
    },
    year: {
        type: Number,
        required: true,
    },
    achievementCount: {
        type: Number,
        required: true,
    },
    totalAchievements: {
        type: Number,
        required: true,
    },
    userCompletion: {
        type: String,
        required: true,
    },
    awards: {
        participation: {
            type: Boolean,
            default: false
        },
        beaten: {
            type: Boolean,
            default: false
        },
        mastered: {
            type: Boolean,
            default: false
        }
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
    }
});

// Index for efficient queries
awardSchema.index({ raUsername: 1, gameId: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Award', awardSchema);
