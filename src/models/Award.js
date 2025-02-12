// File: src/models/Award.js
const mongoose = require('mongoose');

const awardSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true
    },
    gameId: {
        type: String,
        required: true
    },
    month: {
        type: Number,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    // Achievement tracking
    achievementCount: {
        type: Number,
        required: true,
        default: 0
    },
    totalAchievements: {
        type: Number,
        required: true,
        default: 0
    },
    beaten: {
        type: Boolean,
        default: false
    },
    mastered: {
        type: Boolean,
        default: false
    },
    // For manual awards (points given by admins)
    isManual: {
        type: Boolean,
        default: false
    },
    manualPoints: {
        type: Number,
        default: 0
    },
    reason: String,
    awardedBy: String
}, { timestamps: true });

// Indexes
awardSchema.index({ raUsername: 1, gameId: 1, month: 1, year: 1 }, { unique: true });
awardSchema.index({ raUsername: 1, year: 1 });

// Helper method to calculate points
awardSchema.methods.getPoints = function() {
    if (this.isManual) return this.manualPoints;
    
    let points = 0;
    if (this.achievementCount > 0) points += 1; // Participation
    if (this.beaten) points += 3;               // Beaten bonus
    if (this.mastered) points += 3;             // Mastery bonus
    return points;
};

module.exports = mongoose.model('Award', awardSchema);
