import mongoose from 'mongoose';

const gameSchema = new mongoose.Schema({
    gameId: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['MONTHLY', 'SHADOW'],
        required: true
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    year: {
        type: Number,
        required: true
    },
    progression: [{
        type: String,  // Achievement IDs for progression
        required: true
    }],
    winCondition: [{
        type: String,  // Achievement IDs for win conditions
        required: true
    }],
    requireProgression: {
        type: Boolean,
        default: false
    },
    requireAllWinConditions: {
        type: Boolean,
        default: false
    },
    masteryCheck: {
        type: Boolean,
        default: false
    },
    active: {
        type: Boolean,
        default: true
    },
    meta: {
        type: new mongoose.Schema({
            pieces: [String],
            description: String,
            revealed: {
                type: Boolean,
                default: false
            }
        }, { _id: false }),
        default: null
    }
});

// Add method to check if shadow game is revealed
gameSchema.methods.isShadowGameRevealed = function() {
    return this.type === 'SHADOW' && this.meta?.revealed === true;
};

// Add method to get meta pieces
gameSchema.methods.getMetaPieces = function() {
    return this.meta?.pieces || [];
};

// Add method to get meta description
gameSchema.methods.getMetaDescription = function() {
    return this.meta?.description || 'No meta challenge description available.';
};

// Add indexes for common queries
gameSchema.index({ type: 1, month: 1, year: 1 });
gameSchema.index({ active: 1 });

// Add methods for game status checks
gameSchema.methods.isCurrentGame = function() {
    const now = new Date();
    return this.month === now.getMonth() + 1 && this.year === now.getFullYear();
};

gameSchema.methods.isEligibleForMastery = function() {
    return this.type === 'MONTHLY' && this.masteryCheck;
};

export const Game = mongoose.model('Game', gameSchema);
export default Game;
