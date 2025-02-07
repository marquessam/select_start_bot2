// File: src/models/PlayerProgress.js
const mongoose = require('mongoose');

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
    // We'll use this to track which achievements have been announced
    // to avoid duplicate announcements
    announcedAchievements: [{
        type: String  // Achievement IDs
    }]
}, {
    timestamps: true
});

// Index for efficient queries
playerProgressSchema.index({ raUsername: 1, gameId: 1 }, { unique: true });

module.exports = mongoose.model('PlayerProgress', playerProgressSchema);
