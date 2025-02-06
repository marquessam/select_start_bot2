// File: src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    raUsername: {
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
    }
});

// Add case-insensitive index
userSchema.index({ raUsername: 1 }, { 
    unique: true,
    collation: { locale: 'en', strength: 2 }
});

module.exports = mongoose.model('User', userSchema);
