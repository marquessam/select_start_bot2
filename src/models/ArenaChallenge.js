// src/models/ArenaChallenge.js
import mongoose from 'mongoose';

// Schema for bets placed on challenges
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

// Schema for participants in open challenges
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

// Main ArenaChallenge schema
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
        type: String,
        required: true
    },
    gameId: {
        type: Number, // Changed from String to Number to match our updated implementation
        required: true
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
        max: 336 // Max 2 weeks (14 days)
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
    
    // Open challenge fields
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

// Add index for more efficient queries
arenaChallengeSchema.index({ status: 1 });
arenaChallengeSchema.index({ challengerId: 1, status: 1 });
arenaChallengeSchema.index({ challengeeId: 1, status: 1 });
arenaChallengeSchema.index({ 'participants.userId': 1, status: 1 });
arenaChallengeSchema.index({ endDate: 1 });
arenaChallengeSchema.index({ isOpenChallenge: 1, status: 1 });

// Virtuals and methods
arenaChallengeSchema.virtual('isActive').get(function() {
    return this.status === 'active';
});

arenaChallengeSchema.virtual('isPending').get(function() {
    return this.status === 'pending';
});

arenaChallengeSchema.virtual('isOpen').get(function() {
    return this.status === 'open';
});

arenaChallengeSchema.virtual('isCompleted').get(function() {
    return this.status === 'completed';
});

arenaChallengeSchema.virtual('participantCount').get(function() {
    if (!this.isOpenChallenge) {
        return 2; // Standard challenge has 2 participants
    }
    return (this.participants?.length || 0) + 1; // +1 for creator
});

// Calculate total pot (wagers + bets)
arenaChallengeSchema.virtual('totalPrizePool').get(function() {
    // Calculate wager pool
    let wagerPool = 0;
    if (this.isOpenChallenge) {
        wagerPool = this.wagerAmount * this.participantCount;
    } else {
        wagerPool = this.wagerAmount * 2;
    }
    
    // Add betting pool
    return wagerPool + (this.totalPool || 0);
});

// Export the model
export const ArenaChallenge = mongoose.model('ArenaChallenge', arenaChallengeSchema);
