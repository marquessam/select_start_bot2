import mongoose from 'mongoose';

const suggestionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['arcade', 'racing', 'bot', 'other'],
        required: true
    },
    gameId: {
        type: String,
        required: function() {
            return this.type === 'arcade' || this.type === 'racing';
        }
    },
    leaderboardId: {
        type: String,
        required: function() {
            return this.type === 'arcade' || this.type === 'racing';
        }
    },
    gameTitle: {
        type: String,
        required: function() {
            return this.type === 'arcade' || this.type === 'racing';
        }
    },
    consoleName: {
        type: String,
        required: function() {
            return this.type === 'arcade' || this.type === 'racing';
        }
    },
    trackName: {
        type: String,
        default: '',
        // Only applicable for racing suggestions
    },
    title: {
        type: String,
        required: function() {
            return this.type === 'bot' || this.type === 'other';
        }
    },
    description: {
        type: String,
        required: true
    },
    suggestedBy: {
        type: String,
        required: true
    },
    discordId: {
        type: String,
        required: true
    },
    suggestionDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'implemented'],
        default: 'pending'
    },
    adminResponse: {
        type: String,
        default: ''
    },
    adminResponseDate: {
        type: Date
    },
    adminRespondedBy: {
        type: String
    }
});

// Add virtual for date formatting
suggestionSchema.virtual('formattedDate').get(function() {
    return this.suggestionDate.toLocaleDateString();
});

// Add method to get recent suggestions
suggestionSchema.statics.getRecentSuggestions = async function(days = 30) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    
    return this.find({
        suggestionDate: { $gte: date }
    }).sort({ suggestionDate: -1 });
};

// Add method to get suggestions by type
suggestionSchema.statics.getSuggestionsByType = async function(type) {
    return this.find({ type }).sort({ suggestionDate: -1 });
};

// Create model
const Suggestion = mongoose.model('Suggestion', suggestionSchema);

export { Suggestion };
