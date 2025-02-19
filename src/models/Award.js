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
    },
    // Time window validation
    startDate: {
        type: Date,
        required: true,
        default: function() {
            const date = new Date();
            date.setDate(1); // First day of month
            date.setHours(0, 0, 0, 0);
            return date;
        }
    },
    endDate: {
        type: Date,
        required: true,
        default: function() {
            const date = new Date();
            date.setMonth(date.getMonth() + 1, 0); // Last day of month
            date.setHours(23, 59, 59, 999);
            return date;
        }
    }
}, {
    timestamps: true
});

// Add indexes for common queries
awardSchema.index({ raUsername: 1, month: 1, year: 1 });
awardSchema.index({ month: 1, year: 1 }); // For leaderboard queries

// Method to check if award is within valid time window
awardSchema.methods.isWithinTimeWindow = function() {
    const now = new Date();
    
    // For mastery awards, allow the entire year
    if (this.award === AwardType.MASTERY) {
        const yearStart = new Date(this.year, 0, 1, 0, 0, 0, 0);
        const yearEnd = new Date(this.year, 11, 31, 23, 59, 59, 999);
        return now >= yearStart && now <= yearEnd;
    }
    
    // For all other awards, strictly enforce monthly boundaries
    return now >= this.startDate && now <= this.endDate;
};

// Method to validate award eligibility
awardSchema.methods.validateEligibility = function() {
    const now = new Date();
    
    // Check if award is for current or past month
    const awardMonth = new Date(this.year, this.month - 1);
    const currentMonth = new Date(now.getFullYear(), now.getMonth());
    
    if (awardMonth > currentMonth) {
        throw new Error('Cannot earn awards for future months');
    }
    
    // For past months, only allow mastery awards
    if (awardMonth < currentMonth && this.award !== AwardType.MASTERY) {
        throw new Error('Can only earn mastery awards for past months');
    }
    
    // For current month, check time window
    if (awardMonth.getTime() === currentMonth.getTime() && !this.isWithinTimeWindow()) {
        throw new Error('Award outside valid time window');
    }
    
    return true;
};

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
    const now = new Date();
    const requestedMonth = new Date(year, month - 1);
    const currentMonth = new Date(now.getFullYear(), now.getMonth());
    
    // For future months, return 0
    if (requestedMonth > currentMonth) {
        return 0;
    }
    
    const awards = await this.find({
        raUsername: raUsername.toLowerCase(),
        month,
        year
    });

    return awards.reduce((total, award) => {
        // For past months, only count verified awards
        if (requestedMonth < currentMonth && !award.verified) {
            return total;
        }
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
