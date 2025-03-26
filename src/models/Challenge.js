import mongoose from 'mongoose';

const challengeSchema = new mongoose.Schema({
    date: {
        type: Date,
        unique: true,
        required: true
    },
    monthly_challange_gameid: {
        type: String,
        required: true
    },
    monthly_challange_achievement_ids: {
        type: [String],
        required: true,
        default: []
    },
    monthly_challange_game_total: {
        type: Number,
        required: true
    },
    monthly_challange_progression_achievements: {
        type: [String],
        required: false,
        default: []
    },
    monthly_challange_win_achievements: {
        type: [String],
        required: false,
        default: []
    },
    shadow_challange_gameid: {
        type: String,
        required: false
    },
    shadow_challange_achievement_ids: {
        type: [String],
        required: false,
        default: []
    },
    shadow_challange_game_total: {
        type: Number,
        required: false
    },
    shadow_challange_progression_achievements: {
        type: [String],
        required: false,
        default: []
    },
    shadow_challange_win_achievements: {
        type: [String],
        required: false,
        default: []
    },
    shadow_challange_revealed: {
        type: Boolean,
        required: true
    },
});

// Add method to check if shadow game is revealed
challengeSchema.methods.isShadowGameRevealed = function() {
    return this.shadow_challange_revealed === true;
};

// Add methods for game status checks
challengeSchema.methods.isCurrentGame = function() {
    const now = new Date();
    const challengeMonth = this.date.getMonth();
    const challengeYear = this.date.getFullYear();
    return challengeMonth === now.getMonth() && challengeYear === now.getFullYear();
};

// The date field is already indexed due to unique: true

export const Challenge = mongoose.model('Challenge', challengeSchema);
export default Challenge;