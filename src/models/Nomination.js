// File: src/models/Nomination.js
const mongoose = require('mongoose');

const nominationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  gameTitle: {
    type: String,
    required: true,
  },
  gameId: {
    type: Number,
    required: true,
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
