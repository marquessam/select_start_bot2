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
    progression: [{
        type: String,  // Achievement IDs for progression
    }],
    winCondition: [{
        type: String,  // Achievement IDs for win conditions
    }],
    requireProgression: {
        type: Boolean,
        default: false
    },
    requireAllWinConditions: {
        type: Boolean,
        default: false
    },
    masteryCheck: {
        type: Boolean,
        default: false
    },
    active: {
        type: Boolean,
        default: true,
    }
});

module.exports = mongoose.model('Game', gameSchema);
