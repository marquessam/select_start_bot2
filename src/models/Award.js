// File: src/models/Award.js
const mongoose = require('mongoose');

const awardSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    raUsername: {
        type: String,
        required: true,
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
    achievementCount: {
        type: Number,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
    }
});

// Compound index for efficient queries
awardSchema.index({ raUsername: 1, gameId: 1, year: 1, month: 1 }, { unique: true });

const Award = mongoose.model('Award', awardSchema);
module.exports = Award;
