const mongoose = require('mongoose');

const LeaderboardSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['monthly', 'yearly']
  },
  // The leaderboard data can be structured differently depending on type.
  // For monthly leaderboards, data includes the game info and leaderboardData array.
  // For yearly leaderboards, data is simply an array of leader objects.
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  lastUpdate: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Leaderboard', LeaderboardSchema);
