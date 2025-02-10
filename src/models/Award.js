// File: src/models/Award.js

const mongoose = require('mongoose');
const { AwardType } = require('../enums/AwardType');

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
    // Award type using enum
    award: {
        type: Number,
        enum: Object.values(AwardType),
        default: AwardType.NONE,
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
    userCompletion: {
        type: String,
        required: true,
        default: "0.00%"
    },
    // New fields for manual awards
    reason: {
        type: String,
        default: null  // Stores the reason for manual point awards
    },
    awardedBy: {
        type: String,
        default: null  // Stores who awarded the points
    },
    // Timestamps
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
    timestamps: true  // Adds createdAt and updatedAt
});

// Indexes for efficient queries
awardSchema.index({ raUsername: 1, gameId: 1, year: 1, month: 1 }, { unique: true });
awardSchema.index({ raUsername: 1, year: 1 });
awardSchema.index({ lastChecked: 1 });

// Virtual getter for point value
awardSchema.virtual('points').get(function() {
    if (this.gameId === 'manual') {
        return this.totalAchievements; // For manual awards, totalAchievements stores the points
    }
    return AwardType.getPoints(this.award);
});

// Add some helper methods
awardSchema.methods = {
    isManualAward() {
        return this.gameId === 'manual';
    },

    getDisplayName() {
        if (this.isManualAward()) {
            return this.reason || 'Community Award';
        }
        return AwardFunctions.getName(this.award);
    },

    getPoints() {
        return this.points;
    }
};

// Add some static methods for common queries
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
