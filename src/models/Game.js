// src/models/Game.js
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
  progressionAchievements: [{
    type: String,  // Achievement IDs that constitute "beating" the game
    required: true,
  }],
  active: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for efficient queries
gameSchema.index({ year: 1, month: 1, type: 1 });

module.exports = mongoose.model('Game', gameSchema);
