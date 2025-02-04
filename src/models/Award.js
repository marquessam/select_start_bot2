// File: src/models/Award.js
const awardSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    raUsername: {
        type: String,
        required: true,
    },
    gameId: {
        type: String,
        required: true,
    },
    month: {
        type: Number,
        required: true,
    },
    year: {
        type: Number,
        required: true,
    },
    awards: {
        participation: {
            type: Boolean,
            default: false
        },
        beaten: {
            type: Boolean,
            default: false
        },
        mastered: {
            type: Boolean,
            default: false
        }
    },
    achievementCount: {
        type: Number,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
    }
});

// Static method to calculate points
awardSchema.methods.calculatePoints = function() {
    if (this.awards.mastered) return 5;
    if (this.awards.beaten) return 3;
    if (this.awards.participation) return 1;
    return 0;
};

const Game = mongoose.model('Game', gameSchema);
const Award = mongoose.model('Award', awardSchema);

module.exports = { Game, Award };
