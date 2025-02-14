import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    // Store the canonical (proper case) username
    raUsername: {
        type: String,
        required: true,
        unique: true
    },
    // Store lowercase version for case-insensitive lookups
    raUsernameLower: {
        type: String,
        required: true,
        unique: true,
        set: function(username) {
            return username.toLowerCase();
        }
    },
    discordId: {
        type: String,
        required: true,
        unique: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastChecked: {
        type: Date,
        default: Date.now
    },
    joinDate: {
        type: Date,
        default: Date.now
    },
    // Track total points for quick access
    totalPoints: {
        type: Number,
        default: 0
    },
    yearlyPoints: {
        type: Map,
        of: Number,
        default: () => new Map()
    },
    monthlyPoints: {
        type: Map,
        of: Number,
        default: () => new Map()
    }
}, {
    timestamps: true,
    strict: true
});

// Add index for active users query only
// We don't need to add indexes for raUsernameLower or discordId as they're already indexed due to unique: true
userSchema.index({ isActive: 1 });

// Static method to find user by RetroAchievements username (case insensitive)
userSchema.statics.findByRAUsername = function(username) {
    return this.findOne({ raUsernameLower: username.toLowerCase() });
};

// Static method to find user by Discord ID
userSchema.statics.findByDiscordId = function(discordId) {
    return this.findOne({ discordId });
};

// Method to update points
userSchema.methods.updatePoints = function(month, year, points) {
    // Update monthly points
    const monthKey = `${year}-${month}`;
    this.monthlyPoints.set(monthKey, (this.monthlyPoints.get(monthKey) || 0) + points);
    
    // Update yearly points
    this.yearlyPoints.set(year.toString(), (this.yearlyPoints.get(year.toString()) || 0) + points);
    
    // Update total points
    this.totalPoints += points;
};

// Method to get user's points for a specific month
userSchema.methods.getMonthlyPoints = function(month, year) {
    const monthKey = `${year}-${month}`;
    return this.monthlyPoints.get(monthKey) || 0;
};

// Method to get user's points for a specific year
userSchema.methods.getYearlyPoints = function(year) {
    return this.yearlyPoints.get(year.toString()) || 0;
};

// Method to format user data for display
userSchema.methods.formatUserProfile = function() {
    const currentYear = new Date().getFullYear();
    return {
        username: this.raUsername,
        totalPoints: this.totalPoints,
        yearlyPoints: this.getYearlyPoints(currentYear),
        joinDate: this.joinDate,
        isActive: this.isActive
    };
};

export const User = mongoose.model('User', userSchema);
export default User;
