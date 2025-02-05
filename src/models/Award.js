// File: src/models/Award.js
const mongoose = require('mongoose');

const awardSchema = new mongoose.Schema({
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
    achievementCount: {
        type: Number,
        required: true,
    },
    totalAchievements: {  // Add this field
        type: Number,
        required: true,
    },
    userCompletion: {     // Add this field
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

module.exports = mongoose.model('Award', awardSchema);