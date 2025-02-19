import mongoose from 'mongoose';
import { AwardType } from '../config/config.js';

const playerProgressSchema = new mongoose.Schema({
    raUsername: {
        type: String,
        required: true,
        set: v => v.toLowerCase()
    },
    gameId: {
        type: String,
        required: true
    },
    lastAchievementTimestamp: {
        type: Date,
        required: true,
        default: Date.now
    },
    // Track the last award type announced to prevent duplicate announcements
    lastAwardType: {
        type: Number,
        enum: Object.values(AwardType),
        default: AwardType.NONE
    },
    // Track which achievements have been announced
    announcedAchievements: [{
        type: String  // Achievement IDs
    }],
    // Track achievement counts for quick access
    currentAchievements: {
        type: Number,
        default: 0
    },
    totalGameAchievements: {
        type: Number,
        default: 0
    },
    // Track progression and win conditions separately
    progressionCompleted: [{
        type: String  // Achievement IDs that match progression requirements
    }],
    winConditionsCompleted: [{
        type: String  // Achievement IDs that match win conditions
    }]
}, {
    timestamps: true
});

// Add indexes for common queries
playerProgressSchema.index({ raUsername: 1, gameId: 1 }, { unique: true });
playerProgressSchema.index({ lastAchievementTimestamp: 1 });

// Helper methods for progress calculations
playerProgressSchema.methods.getCompletionPercentage = function() {
    if (this.totalGameAchievements === 0) return 0;
    return ((this.currentAchievements / this.totalGameAchievements) * 100).toFixed(2);
};

playerProgressSchema.methods.hasParticipation = function() {
    return this.currentAchievements > 0;
};

playerProgressSchema.methods.hasBeaten = function(game) {
    // Check if all required progression achievements are completed
    const hasProgression = !game.requireProgression || 
        game.progression.every(achId => this.progressionCompleted.includes(achId));

    // Check if win conditions are met based on game requirements
    const hasWinConditions = game.requireAllWinConditions ?
        game.winCondition.every(achId => this.winConditionsCompleted.includes(achId)) :
        game.winCondition.some(achId => this.winConditionsCompleted.includes(achId));

    return hasProgression && hasWinConditions;
};

playerProgressSchema.methods.hasMastery = function(game) {
    if (!game.masteryCheck || game.type !== 'MONTHLY') return false;
    return this.currentAchievements === this.totalGameAchievements;
};

// Method to check if an achievement should be announced
playerProgressSchema.methods.shouldAnnounceAchievement = function(achievementId) {
    return !this.announcedAchievements.includes(achievementId);
};

export const PlayerProgress = mongoose.model('PlayerProgress', playerProgressSchema);
export default PlayerProgress;
