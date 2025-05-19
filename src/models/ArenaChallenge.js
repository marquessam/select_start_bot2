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
    },
    payout: {
        type: Number,
        default: 0 // Total amount paid to user including their original bet
    },
    houseContribution: {
        type: Number,
        default: 0 // Amount the house contributed to guarantee minimum returns
    }
});

// Define participant schema for open challenges
const participantSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true // Discord ID
    },
    username: {
        type: String,
        required: true // RA username
    },
    joinedAt: {
        type: Date,
        default: Date.now
    },
    score: {
        type: String,
        default: 'No score yet'
    },
    rank: {
        type: Number,
        default: 0
    },
    wagerPaid: {
        type: Boolean,
        default: false
    },
    completed: {
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
        required: function() { return !this.isOpenChallenge; } // Required unless it's an open challenge
    },
    challengeeUsername: {
        type: String,
        required: true // Will be "Open Challenge" for open challenges
    },
    leaderboardId: {
        type: String,
        required: true
    },
    gameTitle: {
        type: String
    },
    gameId: {
        type: Number // Changed from String to Number to match our updated implementation
    },
    iconUrl: {
        type: String
    },
    consoleName: {
        type: String,
        default: 'Unknown'
    },
    description: {
        type: String,
        default: '' // Challenge description field
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
        max: 336 // Max 2 weeks (increased from 1 week)
    },
    status: {
        type: String,
        enum: ['pending', 'open', 'active', 'completed', 'declined', 'cancelled'],
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
    },
    houseContribution: {
        type: Number,
        default: 0 // Total house contribution for this challenge
    },
    // New fields for open challenges
    isOpenChallenge: {
        type: Boolean,
        default: false
    },
    participants: [participantSchema], // Array of participants for open challenges
    maxParticipants: {
        type: Number,
        default: null // Optional max participants (null for unlimited)
    }
}, {
    timestamps: true
});

export const ArenaChallenge = mongoose.model('ArenaChallenge', arenaChallengeSchema);
