// File: src/models/Nomination.js
const mongoose = require('mongoose');

const nominationSchema = new mongoose.Schema({
  userId: {
    type: String,
    default: 'legacy', // For legacy nominations, userId is set to 'legacy'
  },
  gameTitle: {
    type: String,
    required: true,
  },
  gameId: {
    type: Number, // For legacy nominations you might not have a gameId, so you can consider it optional or assign 0.
    default: 0,
  },
  platform: {
    type: String,
  },
  nominatedBy: {
    type: String, // The nominator's name (e.g., Legacy Import or a username)
  },
  voteMonth: {
    type: String,
    required: true,
    index: true,
  },
  dateNominated: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Nomination', nominationSchema);
