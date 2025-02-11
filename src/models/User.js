// File: src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Store the canonical (proper case) username
    raUsername: {
        type: String,
        required: true,
        unique: true,
        set: function(username) {
            // Store the username exactly as provided
            // The UsernameUtils class will handle canonicalization
            return username;
        }
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
    }
}, {
    timestamps: true, // Adds createdAt and updatedAt fields
    strict: true // Only allow fields defined in the schema
});

// Add case-insensitive index on the lowercase field
userSchema.index({ raUsernameLower: 1 }, { 
    unique: true,
    collation: { locale: 'en', strength: 2 }
});

// Add standard index on canonical username
userSchema.index({ raUsername: 1 }, { unique: true });

// Add index for active users
userSchema.index({ isActive: 1 });

// Pre-save middleware to ensure raUsernameLower is always set
userSchema.pre('save', function(next) {
    if (this.raUsername) {
        this.raUsernameLower = this.raUsername.toLowerCase();
    }
    next();
});

// Static methods for common operations
userSchema.statics = {
    /**
     * Find a user by username (case-insensitive)
     */
    async findByUsername(username) {
        return this.findOne({
            raUsernameLower: username.toLowerCase()
        });
    },

    /**
     * Find a user by canonical username (case-sensitive)
     */
    async findByCanonicalUsername(username) {
        return this.findOne({
            raUsername: username
        });
    },

    /**
     * Get all active users
     */
    async getActiveUsers() {
        return this.find({ isActive: true });
    }
};

// Instance methods
userSchema.methods = {
    /**
     * Update the canonical username
     */
    async updateCanonicalUsername(newCanonicalUsername) {
        this.raUsername = newCanonicalUsername;
        this.raUsernameLower = newCanonicalUsername.toLowerCase();
        return this.save();
    },

    /**
     * Deactivate user
     */
    async deactivate() {
        this.isActive = false;
        return this.save();
    },

    /**
     * Reactivate user
     */
    async reactivate() {
        this.isActive = true;
        return this.save();
    }
};

// Virtual getter for profile URL
userSchema.virtual('profileUrl').get(function() {
    return `https://retroachievements.org/user/${this.raUsername}`;
});

// Virtual getter for profile picture URL
userSchema.virtual('profilePicUrl').get(function() {
    return `https://retroachievements.org/UserPic/${this.raUsername}.png`;
});

const User = mongoose.model('User', userSchema);

module.exports = User;
