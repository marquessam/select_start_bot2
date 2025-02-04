// File: src/models/Game.js
const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: ['MONTHLY', 'SHADOW'],
        required: true,
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
    },
    year: {
        type: Number,
        required: true,
    },
    numAchievements: {
        type: Number,
        required: true,
    },
    progressionAchievements: [{
        id: String,
        title: String,
        description: String,
        points: Number,
    }],
    active: {
        type: Boolean,
        default: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

// Create and export the model directly
const Game = mongoose.model('Game', gameSchema);
module.exports = Game;
