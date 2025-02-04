// File: src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        unique: true
    },
    discordId: {
        type: String,
        sparse: true  // Allows null/undefined while still maintaining uniqueness
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

module.exports = mongoose.model('User', userSchema);
