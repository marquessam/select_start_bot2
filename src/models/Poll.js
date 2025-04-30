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

// Method to find the active poll
pollSchema.statics.findActivePoll = async function() {
    const now = new Date();
    return this.findOne({
        endDate: { $gt: now },
        isProcessed: false
    }).sort({ createdAt: -1 }); // Get the most recent poll
};

// Method to process poll results and determine the winner
pollSchema.methods.processResults = function() {
    if (this.isProcessed) return this.winner || null;
    
    const results = this.getVoteCounts();
    if (results.length === 0) return null;
    
    // Set the winner
    this.winner = results[0];
    this.isProcessed = true;
    
    return this.winner;
};

export const Poll = mongoose.model('Poll', pollSchema);
export default Poll;
