// File: src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        unique: true,
        // Don't automatically convert to lowercase
        set: function(username) {
            // Store the username exactly as provided
            // The UsernameUtils class will handle case sensitivity
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
});

// Add case-insensitive index on the lowercase field
userSchema.index({ raUsernameLower: 1 }, { unique: true });

// Pre-save middleware to ensure raUsernameLower is always set
userSchema.pre('save', function(next) {
    if (this.raUsername) {
        this.raUsernameLower = this.raUsername.toLowerCase();
    }
    next();
});

module.exports = mongoose.model('User', userSchema);
