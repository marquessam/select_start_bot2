import mongoose from 'mongoose';

const betSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    raUsername: {
        type: String,
        required: true
    },
    betAmount: {
        type: Number,
        required: true,
        min: 10
    },
    targetPlayer: {
        type: String,
        required: true // Username of player bet is placed on
    },
    placedAt: {
        type: Date,
        default: Date.now
    },
    paid: {
        type: Boolean,
        default: false
    }
});

const arenaChallengeSchema = new mongoose.Schema({
    challengerId: {
        type: String, 
        required: true // Discord ID
    },
    challengerUsername: {
        type: String,
        required: true // RA username
    },
    challengeeId: {
        type: String,
        required: true
    },
    challengeeUsername: {
        type: String,
        required: true
    },
    leaderboardId: {
        type: String,
        required: true
    },
    gameTitle: {
        type: String
    },
    gameId: {
        type: String
    },
    iconUrl: {
        type: String
    },
    wagerAmount: {
        type: Number,
        required: true,
        min: 10
    },
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    durationHours: {
        type: Number,
        required: true,
        min: 1,
        max: 168 // Max 1 week
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'completed', 'declined', 'cancelled'],
        default: 'pending'
    },
    messageId: {
        type: String // Discord message ID for the challenge in the feed
    },
    bets: [betSchema],
    winnerId: {
        type: String // Set when challenge completes
    },
    winnerUsername: {
        type: String
    },
    challengerScore: {
        type: String
    },
    challengeeScore: {
        type: String  
    },
    totalPool: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

export const ArenaChallenge = mongoose.model('ArenaChallenge', arenaChallengeSchema);
