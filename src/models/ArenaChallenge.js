// src/models/ArenaChallenge.js
import mongoose from 'mongoose';

const arenaChallengeSchema = new mongoose.Schema({
    // Basic challenge info
    challengeId: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        enum: ['direct', 'open'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'completed', 'cancelled'],
        default: 'pending'
    },
    
    // Game details
    gameId: {
        type: String,
        required: true
    },
    gameTitle: {
        type: String,
        required: true
    },
    leaderboardId: {
        type: String,
        required: true
    },
    leaderboardTitle: {
        type: String,
        required: true
    },
    
    // NEW: Challenge description field
    description: {
        type: String,
        default: '',
        maxlength: 200 // Limit to 200 characters to keep it concise
    },
    
    // Creator info
    creatorId: {
        type: String,
        required: true
    },
    creatorUsername: {
        type: String,
        required: true
    },
    creatorRaUsername: {
        type: String,
        required: true
    },
    
    // Target user (for direct challenges only)
    targetId: {
        type: String,
        default: null
    },
    targetUsername: {
        type: String,
        default: null
    },
    targetRaUsername: {
        type: String,
        default: null
    },
    
    // Challenge participants and wagers
    participants: [{
        userId: String,
        username: String,
        raUsername: String,
        wager: Number,
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Betting system
    bets: [{
        userId: String,
        username: String,
        targetRaUsername: String, // Who they're betting on
        amount: Number,
        placedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Timing
    createdAt: {
        type: Date,
        default: Date.now
    },
    startedAt: {
        type: Date,
        default: null
    },
    endedAt: {
        type: Date,
        default: null
    },
    bettingClosedAt: {
        type: Date,
        default: null
    },
    
    // Results
    winnerRaUsername: {
        type: String,
        default: null
    },
    winnerUserId: {
        type: String,
        default: null
    },
    finalScores: [{
        raUsername: String,
        rank: Number,
        score: String,
        fetchedAt: Date
    }],
    
    // Processing flags
    processed: {
        type: Boolean,
        default: false
    },
    processedAt: {
        type: Date,
        default: null
    },
    
    // Arena feed message tracking
    feedMessageId: {
        type: String,
        default: null
    },
    feedMessageUpdatedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
arenaChallengeSchema.index({ status: 1 });
arenaChallengeSchema.index({ creatorId: 1 });
arenaChallengeSchema.index({ 'participants.userId': 1 });
arenaChallengeSchema.index({ endedAt: 1 });
arenaChallengeSchema.index({ processed: 1 });

// Helper methods
arenaChallengeSchema.methods.getTotalWager = function() {
    return this.participants.reduce((total, p) => total + p.wager, 0);
};

arenaChallengeSchema.methods.getTotalBets = function() {
    return this.bets.reduce((total, b) => total + b.amount, 0);
};

arenaChallengeSchema.methods.getBetsForUser = function(raUsername) {
    return this.bets.filter(bet => bet.targetRaUsername === raUsername);
};

arenaChallengeSchema.methods.isParticipant = function(userId) {
    return this.participants.some(p => p.userId === userId);
};

arenaChallengeSchema.methods.canJoin = function() {
    return this.type === 'open' && this.status === 'active';
};

arenaChallengeSchema.methods.canBet = function() {
    return this.status === 'active' && 
           (!this.bettingClosedAt || new Date() < this.bettingClosedAt);
};

arenaChallengeSchema.methods.shouldComplete = function() {
    return this.status === 'active' && 
           this.endedAt && 
           new Date() >= this.endedAt && 
           !this.processed;
};

export const ArenaChallenge = mongoose.model('ArenaChallenge', arenaChallengeSchema);
