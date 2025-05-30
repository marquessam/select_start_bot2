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
    // Add explicit results channel ID field
    resultsChannelId: {
        type: String
    },
    selectedGames: [{
        gameId: String,
        title: String,
        consoleName: String,
        imageIcon: String
    }],
    // Use Array structure for votes instead of Map for better MongoDB compatibility
    votes: [{
        userId: String,
        gameIds: [String]
    }],
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
    },
    // Tiebreaker tracking
    isTiebreaker: {
        type: Boolean,
        default: false
    },
    originalPollId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Poll'
    },
    tiebreakerPollId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Poll'
    },
    // Track the final resolution method
    resolutionMethod: {
        type: String,
        enum: ['normal', 'tiebreaker', 'random_after_tiebreaker'],
        default: 'normal'
    }
});

// Method to check if a user has already voted
pollSchema.methods.hasUserVoted = function(userId) {
    if (!this.votes) this.votes = [];
    return this.votes.some(vote => vote.userId === userId);
};

// Method to add a vote for a user
pollSchema.methods.addVote = function(userId, gameIds) {
    // Initialize votes array if it doesn't exist
    if (!this.votes) this.votes = [];
    
    // Ensure gameIds is an array and contains valid game IDs from this poll
    const validGameIds = gameIds.filter(gameId => 
        this.selectedGames.some(game => game.gameId === gameId)
    );
    
    if (validGameIds.length > 0) {
        // Remove any existing votes for this user
        this.votes = this.votes.filter(vote => vote.userId !== userId);
        
        // Add the new vote
        this.votes.push({
            userId: userId,
            gameIds: validGameIds
        });
        
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
    if (this.votes && Array.isArray(this.votes)) {
        for (const vote of this.votes) {
            if (vote.gameIds && Array.isArray(vote.gameIds)) {
                for (const gameId of vote.gameIds) {
                    if (counts[gameId]) {
                        counts[gameId].votes += 1;
                    }
                }
            }
        }
    }
    
    return Object.values(counts).sort((a, b) => b.votes - a.votes);
};

// Method to find the active poll (excluding tiebreaker polls in this query)
pollSchema.statics.findActivePoll = async function() {
    const now = new Date();
    return this.findOne({
        endDate: { $gt: now },
        isProcessed: false
    }).sort({ createdAt: -1 }); // Get the most recent poll
};

// Method to find any active poll including tiebreakers
pollSchema.statics.findAnyActivePoll = async function() {
    const now = new Date();
    return this.findOne({
        endDate: { $gt: now },
        isProcessed: false
    }).sort({ createdAt: -1 });
};

// Method to process poll results and determine if tiebreaker is needed
pollSchema.methods.processResults = function() {
    if (this.isProcessed) return this.winner || null;
    
    const results = this.getVoteCounts();
    if (results.length === 0) return null;
    
    // Check for ties at the top position
    const topVotes = results[0].votes;
    const tiedWinners = results.filter(result => result.votes === topVotes);
    
    // If there's a tie with more than one game and votes > 0
    if (tiedWinners.length > 1 && topVotes > 0) {
        return {
            isTie: true,
            tiedGames: tiedWinners,
            allResults: results
        };
    }
    
    // No tie, set the winner
    this.winner = results[0];
    this.isProcessed = true;
    
    return {
        isTie: false,
        winner: this.winner,
        allResults: results
    };
};

export const Poll = mongoose.model('Poll', pollSchema);
export default Poll;
