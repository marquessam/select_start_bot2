// File: src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        unique: true
    },
    raUsernameLower: {
        type: String,
        required: true,
        unique: true,
        set: v => v.toLowerCase()
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

// Pre-save middleware to set lowercase username
userSchema.pre('save', function(next) {
    if (this.raUsername) {
        this.raUsernameLower = this.raUsername.toLowerCase();
    }
    next();
});

module.exports = mongoose.model('User', userSchema);
