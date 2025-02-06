// File: src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        unique: true,
        set: v => v.toLowerCase(),  // Normalize username on save
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
