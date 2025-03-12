import mongoose from 'mongoose';

const communityAwardSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    points: {
        type: Number,
        required: true,
        min: 1
    },
    awardedAt: {
        type: Date,
        default: Date.now
    },
    awardedBy: {
        type: String,
        required: true
    }
});

const nominationSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true
    },
    nominatedAt: {
        type: Date,
        default: Date.now
    }
});

const userSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        unique: true
    },
    discordId: {
        type: String,
        required: true,
        sparse: true
    },
    monthlyChallenges: {
        type: Map,
        of: {
            progress: Number
        },
        default: () => new Map()
    },
    shadowChallenges: {
        type: Map,
        of: {
            progress: Number
        },
        default: () => new Map()
    },
    announcedAchievements: {
        type: Map,
        of: {
            monthly: {
                award: String,
                achieved: Number
            },
            shadow: {
                award: String,
                achieved: Number
            }
        },
        default: () => new Map()
    },
    // Add this new field to track achievement IDs that have been announced
    announcedAchievementIds: {
        type: [String],
        default: []
    },
    communityAwards: [communityAwardSchema],
    nominations: [nominationSchema]
}, {
    timestamps: true,
    strict: true
});

// Static method to find user by RetroAchievements username (case insensitive)
userSchema.statics.findByRAUsername = function(username) {
    return this.findOne({ raUsername: username });
};

// Static method to find user by Discord ID
userSchema.statics.findByDiscordId = function(discordId) {
    return this.findOne({ discordId });
};

// Helper method for consistent date key formatting
userSchema.statics.formatDateKey = function(date) {
    return date.toISOString().split('T')[0];
};

// raUsername is already indexed due to unique: true
// Add index for discordId if it's not already indexed by sparse: true
// userSchema.index({ discordId: 1 });

// Method to update standard challenge points
userSchema.methods.updatePoints = function(date, points) {
    const dateKey = this.constructor.formatDateKey(date instanceof Date ? date : new Date(date));
    this.monthlyChallenges.set(dateKey, points);
};

// Method to update shadow challenge points
userSchema.methods.updateShadowPoints = function(date, points) {
    const dateKey = this.constructor.formatDateKey(date instanceof Date ? date : new Date(date));
    this.shadowChallenges.set(dateKey, points);
};

// Method to get user's points for a specific challenge (by date)
userSchema.methods.getPoints = function(date) {
    const dateKey = this.constructor.formatDateKey(date instanceof Date ? date : new Date(date));
    return this.monthlyChallenges.get(dateKey) || 0;
};

// Method to get user's points for a specific shadow challenge (by date)
userSchema.methods.getShadowPoints = function(date) {
    const dateKey = this.constructor.formatDateKey(date instanceof Date ? date : new Date(date));
    return this.shadowChallenges.get(dateKey) || 0;
};

// Method to check if an achievement has been announced
userSchema.methods.isAchievementAnnounced = function(achievementId) {
    return this.announcedAchievementIds.includes(achievementId);
};

// Method to mark an achievement as announced
userSchema.methods.markAchievementAnnounced = function(achievementId) {
    if (!this.announcedAchievementIds.includes(achievementId)) {
        this.announcedAchievementIds.push(achievementId);
        
        // Limit the size of the array to prevent excessive growth
        if (this.announcedAchievementIds.length > 1000) {
            this.announcedAchievementIds = this.announcedAchievementIds.slice(-1000);
        }
    }
};

// Method to get user's community awards for a specific year
userSchema.methods.getCommunityAwardsForYear = function(year) {
    return this.communityAwards.filter(award => 
        award.awardedAt.getFullYear() === year
    );
};

// Method to get total community points for a specific year
userSchema.methods.getCommunityPointsForYear = function(year) {
    return this.getCommunityAwardsForYear(year)
        .reduce((total, award) => total + award.points, 0);
};

// Method to get current month's nominations
userSchema.methods.getCurrentNominations = function() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    return this.nominations.filter(nom => {
        const nomMonth = nom.nominatedAt.getMonth();
        const nomYear = nom.nominatedAt.getFullYear();
        return nomMonth === currentMonth && nomYear === currentYear;
    });
};

// Method to clear nominations for the current month
userSchema.methods.clearCurrentNominations = function() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    this.nominations = this.nominations.filter(nom => {
        const nomMonth = nom.nominatedAt.getMonth();
        const nomYear = nom.nominatedAt.getFullYear();
        return !(nomMonth === currentMonth && nomYear === currentYear);
    });
};

export const User = mongoose.model('User', userSchema);
export default User;
