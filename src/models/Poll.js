import mongoose from 'mongoose';

const pollSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true
    },
    channelId: {
        type: String,
        required: true
    },
    selectedGames: [{
        gameId: String,
        title: String,
        consoleName: String,
        imageIcon: String
    }],
    votes: {
        type: Map,
        of: [String], // Array of gameIds that the user voted for
        default: () => new Map()
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true
    },
    isProcessed: {
        type: Boolean,
        default: false
    },
    // To store the winner after voting is processed
    winner: {
        gameId: String,
        title: String,
        consoleName: String,
        imageIcon: String,
        votes: Number
    },
    // Store the name of the scheduled job that will end this poll
    scheduledJobName: {
        type: String
    }
});

// Method to check if a user has already voted
pollSchema.methods.hasUserVoted = function(userId) {
    return this.votes.has(userId);
};

// Method to add a vote for a user
pollSchema.methods.addVote = function(userId, gameIds) {
    // Ensure gameIds is an array and contains valid game IDs from this poll
    const validGameIds = gameIds.filter(gameId => 
        this.selectedGames.some(game => game.gameId === gameId)
    );
    
    if (validGameIds.length > 0) {
        this.votes.set(userId, validGameIds);
        return true;
    }
    return false;
};

// Method to get vote counts for all games
pollSchema.methods.getVoteCounts = function() {
    const counts = {};
    
    // Initialize all games with 0 votes
    this.selectedGames.forEach(game => {
        counts[game.gameId] = {
            gameId: game.gameId,
            title: game.title,
            consoleName: game.consoleName,
            imageIcon: game.imageIcon,
            votes: 0
        };
    });
    
    // Count all votes
    for (const userVotes of this.votes.values()) {
        for (const gameId of userVotes) {
            if (counts[gameId]) {
                counts[gameId].votes += 1;
            }
        }
    }
    
    return Object.values(counts).sort((a, b) => b.votes - a.votes);
};

// Method to find the active poll
pollSchema.statics.findActivePoll = function() {
    const now = new Date();
    return this.findOne({
        endDate: { $gt: now },
        isProcessed: false
    }).sort({ createdAt: -1 }); // Get the most recent poll
};

// Method to process poll results and determine the winner
pollSchema.methods.processResults = function() {
    if (this.isProcessed) return null;
    
    const results = this.getVoteCounts();
    if (results.length === 0) return null;
    
    // Set the winner
    this.winner = results[0];
    this.isProcessed = true;
    
    return this.winner;
};

export const Poll = mongoose.model('Poll', pollSchema);
export default Poll;
