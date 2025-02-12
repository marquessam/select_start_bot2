// File: src/models/Nomination.js
const mongoose = require('mongoose');

const nominationSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    gameTitle: {
        type: String,
        required: true
    },
    gameId: {
        type: String,
        required: true
    },
    platform: {
        type: String
    },
    nominatedBy: {
        type: String,
        required: true
    },
    voteMonth: {
        type: String,
        required: true,
        index: true
    }
}, { 
    timestamps: true
});

// Index for looking up user's nominations for current month
nominationSchema.index({ userId: 1, voteMonth: 1 });

module.exports = mongoose.model('Nomination', nominationSchema);
