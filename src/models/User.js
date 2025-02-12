// File: src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    joinDate: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Add case-insensitive index
userSchema.index({ raUsername: 1 }, { 
    unique: true,
    collation: { locale: 'en', strength: 2 } // Makes the index case-insensitive
});

module.exports = mongoose.model('User', userSchema);
