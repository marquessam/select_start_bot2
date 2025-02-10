// File: src/models/Award.js
const mongoose = require('mongoose');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

const awardSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        set: v => v.toLowerCase()  // Normalize username on save
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
    // Store the highest award level achieved (using AwardType numeric values)
    highestAwardKind: {
        type: Number,
        enum: Object.values(AwardType),
        default: AwardType.NONE,
        required: true
    },
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
    userCompletion: {
        type: String,
        required: true,
        default: "0.00%"
    },
    // Fields for manual awards
    reason: {
        type: String,
        default: null  // Stores the reason for manual point awards
    },
    awardedBy: {
        type: String,
        default: null  // Stores who awarded the points
    },
    // Timestamps for tracking
    lastChecked: {
        type: Date,
        required: true,
        default: Date.now
    },
    awardedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true  // Automatically adds createdAt and updatedAt fields
});

// Indexes for efficient queries
awardSchema.index({ raUsername: 1, gameId: 1, year: 1, month: 1 }, { unique: true });
awardSchema.index({ raUsername: 1, year: 1 });
awardSchema.index({ lastChecked: 1 });

// Virtual getter for point value.
// For manual awards (identified by gameId === 'manual'), we use totalAchievements;
// otherwise, we compute points from the highestAwardKind using AwardFunctions.getPoints.
awardSchema.virtual('points').get(function() {
    if (this.gameId === 'manual') {
        return this.totalAchievements;
    }
    return AwardFunctions.getPoints(this.highestAwardKind);
});

// Helper methods
awardSchema.methods = {
    isManualAward() {
        return this.gameId === 'manual';
    },

    getDisplayName() {
        if (this.isManualAward()) {
            return this.reason || 'Community Award';
        }
        return AwardFunctions.getName(this.highestAwardKind);
    },

    getPoints() {
        return this.points;
    }
};

// Static methods for common queries
awardSchema.statics = {
    async getUserYearlyPoints(username, year) {
        const awards = await this.find({
            raUsername: username,
            year: year
        });

        return awards.reduce((total, award) => total + award.points, 0);
    },

    async getManualAwards(username, year) {
        return await this.find({
            raUsername: username,
            gameId: 'manual',
            year: year
        }).sort({ awardedAt: -1 });
    }
};

module.exports = mongoose.model('Award', awardSchema);
