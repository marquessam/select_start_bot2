// File: src/models/Award.js
const mongoose = require('mongoose');

const AwardType = {
  NONE: 'NONE',
  PARTICIPATION: 'PARTICIPATION',
  BEATEN: 'BEATEN',
  MASTERED: 'MASTERED',
};

const awardSchema = new mongoose.Schema({
  userId: {
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
  type: {
    type: String,
    enum: Object.values(AwardType),
    default: AwardType.NONE,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  }
});

// Compound index for efficient queries
awardSchema.index({ userId: 1, gameId: 1, year: 1, month: 1 }, { unique: true });

// Static method to calculate points
awardSchema.statics.calculatePoints = function(type) {
  switch(type) {
    case AwardType.MASTERED:
      return 5;
    case AwardType.BEATEN:
      return 3;
    case AwardType.PARTICIPATION:
      return 1;
    default:
      return 0;
  }
};

module.exports = {
  Award: mongoose.model('Award', awardSchema),
  AwardType
};
