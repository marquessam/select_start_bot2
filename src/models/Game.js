// File: src/models/Game.js
const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['MONTHLY', 'SHADOW'],
        required: true
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    year: {
        type: Number,
        required: true
    },
    // Achievement IDs required for completion
    winConditions: [{
        type: String
    }],
    // Whether all win conditions must be met (true) or just one (false)
    requireAllWinConditions: {
        type: Boolean,
        default: false
    }
});

// Index for finding current games
gameSchema.index({ month: 1, year: 1, type: 1 });

module.exports = mongoose.model('Game', gameSchema);
