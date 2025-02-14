import mongoose from 'mongoose';
import { AwardType } from '../config/config.js';

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
    // Manual award fields
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
    timestamps: true
});

// Add indexes for common queries
awardSchema.index({ raUsername: 1, month: 1, year: 1 });
awardSchema.index({ month: 1, year: 1 }); // For leaderboard queries

// Static method to calculate points
awardSchema.statics.calculatePoints = function(award) {
    switch (award) {
        case AwardType.PARTICIPATION:
            return 1;
        case AwardType.BEATEN:
        case AwardType.MASTERY:
            return 3;
        default:
            return 0;
    }
};

// Method to get user's total points for a specific month/year
awardSchema.statics.getUserMonthlyPoints = async function(raUsername, month, year) {
    const awards = await this.find({
        raUsername: raUsername.toLowerCase(),
        month,
        year
    });

    return awards.reduce((total, award) => {
        return total + this.calculatePoints(award.award);
    }, 0);
};

// Method to get user's total points for a year
awardSchema.statics.getUserYearlyPoints = async function(raUsername, year) {
    const awards = await this.find({
        raUsername: raUsername.toLowerCase(),
        year
    });

    return awards.reduce((total, award) => {
        return total + this.calculatePoints(award.award);
    }, 0);
};

// Method to get monthly leaderboard
awardSchema.statics.getMonthlyLeaderboard = async function(month, year) {
    const awards = await this.find({ month, year });
    return this.calculateLeaderboard(awards);
};

// Method to get yearly leaderboard
awardSchema.statics.getYearlyLeaderboard = async function(year) {
    const awards = await this.find({ year });
    return this.calculateLeaderboard(awards);
};

// Helper method to calculate leaderboard from awards
awardSchema.statics.calculateLeaderboard = function(awards) {
    const pointsMap = new Map();

    // Calculate points for each user
    awards.forEach(award => {
        const username = award.raUsername;
        const points = this.calculatePoints(award.award);
        pointsMap.set(username, (pointsMap.get(username) || 0) + points);
    });

    // Convert to array and sort
    return Array.from(pointsMap.entries())
        .map(([username, points]) => ({ username, points }))
        .sort((a, b) => b.points - a.points);
};

export const Award = mongoose.model('Award', awardSchema);
export default Award;
