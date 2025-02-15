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
    // Activity tracking
    activityStatus: {
        type: String,
        enum: ['INACTIVE', 'ACTIVE', 'PARTICIPATING'],
        default: 'INACTIVE'
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    lastChecked: {
        type: Date,
        default: Date.now
    },
    joinDate: {
        type: Date,
        default: Date.now
    },
    // Points tracking
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
    },
    // Arcade points tracking
    arcadePoints: [{
        gameId: String,
        gameName: String,
        rank: Number,
        points: Number,
        expiresAt: Date
    }],
    // Nomination tracking
    monthlyNominations: {
        type: Map, // Key: YYYY-MM, Value: count
        of: Number,
        default: () => new Map()
    },
    monthlyVotes: {
        type: Map, // Key: YYYY-MM, Value: count
        of: Number,
        default: () => new Map()
    },
    // Profile customization
    profileImage: {
        type: String // URL to RA profile image
    },
    // Shadow game progress tracking
    shadowGameProgress: {
        type: Map, // Key: YYYY-MM, Value: { pieces: [String], completed: Boolean }
        of: new mongoose.Schema({
            pieces: [String],
            completed: Boolean
        }, { _id: false }),
        default: () => new Map()
    }
}, {
    timestamps: true,
    strict: true
});

// Add index for active users query only
userSchema.index({ activityStatus: 1, lastActivity: -1 });

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

// Method to update activity status
userSchema.methods.updateActivityStatus = function() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    
    if (this.lastActivity < thirtyDaysAgo) {
        this.activityStatus = 'INACTIVE';
    } else if (this.activityStatus === 'INACTIVE') {
        this.activityStatus = 'ACTIVE';
    }
    
    this.lastActivity = now;
};

// Method to add arcade points
userSchema.methods.addArcadePoints = function(gameId, gameName, rank) {
    const points = rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0;
    if (points === 0) return;

    // Remove any existing points for this game
    this.arcadePoints = this.arcadePoints.filter(ap => ap.gameId !== gameId);

    // Add new points with 30-day expiration
    if (points > 0) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        this.arcadePoints.push({
            gameId,
            gameName,
            rank,
            points,
            expiresAt
        });
    }
};

// Method to get current arcade points
userSchema.methods.getCurrentArcadePoints = function() {
    const now = new Date();
    // Filter out expired points
    this.arcadePoints = this.arcadePoints.filter(ap => ap.expiresAt > now);
    return this.arcadePoints.reduce((total, ap) => total + ap.points, 0);
};

// Method to check nomination limit
userSchema.methods.canNominate = function(month, year) {
    const monthKey = `${year}-${month}`;
    return (this.monthlyNominations.get(monthKey) || 0) < 2;
};

// Method to check voting limit
userSchema.methods.canVote = function(month, year) {
    const monthKey = `${year}-${month}`;
    return (this.monthlyVotes.get(monthKey) || 0) < 2;
};

// Method to format user data for display
userSchema.methods.formatUserProfile = function() {
    const currentYear = new Date().getFullYear();
    return {
        username: this.raUsername,
        profileImage: this.profileImage,
        totalPoints: this.totalPoints,
        yearlyPoints: this.getYearlyPoints(currentYear),
        arcadePoints: this.getCurrentArcadePoints(),
        activityStatus: this.activityStatus,
        joinDate: this.joinDate,
        lastActivity: this.lastActivity
    };
};

export const User = mongoose.model('User', userSchema);
export default User;
