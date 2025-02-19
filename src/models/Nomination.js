import mongoose from 'mongoose';

const nominationSchema = new mongoose.Schema({
    userId: {
        type: String,
        default: 'legacy', // For legacy nominations
    },
    gameTitle: {
        type: String,
        required: true,
    },
    gameId: {
        type: Number,
        default: 0,
    },
    platform: {
        type: String,
    },
    nominatedBy: {
        type: String,
    },
    voteMonth: {
        type: String,
        required: true
    },
    dateNominated: {
        type: Date,
        default: Date.now,
    },
    // Additional fields for nomination status
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'SELECTED'],
        default: 'PENDING'
    },
    votes: {
        type: Number,
        default: 0
    },
    voters: [{
        type: String // Discord user IDs of voters
    }],
    notes: {
        type: String // Admin notes about the nomination
    }
});

// Add indexes for common queries
nominationSchema.index({ voteMonth: 1, status: 1 });
nominationSchema.index({ dateNominated: -1 });

// Static method to get nominations for a specific month
nominationSchema.statics.getMonthNominations = function(month, year) {
    const voteMonth = `${year}-${month.toString().padStart(2, '0')}`;
    return this.find({ 
        voteMonth,
        status: { $in: ['PENDING', 'APPROVED'] }
    }).sort({ votes: -1, dateNominated: 1 });
};

// Static method to get selected games for a month
nominationSchema.statics.getSelectedGames = function(month, year) {
    const voteMonth = `${year}-${month.toString().padStart(2, '0')}`;
    return this.find({
        voteMonth,
        status: 'SELECTED'
    });
};

// Method to add a vote
nominationSchema.methods.addVote = function(userId) {
    if (!this.voters.includes(userId)) {
        this.voters.push(userId);
        this.votes = this.voters.length;
        return true;
    }
    return false;
};

// Method to remove a vote
nominationSchema.methods.removeVote = function(userId) {
    const index = this.voters.indexOf(userId);
    if (index > -1) {
        this.voters.splice(index, 1);
        this.votes = this.voters.length;
        return true;
    }
    return false;
};

// Method to format nomination for display
nominationSchema.methods.formatNomination = function() {
    return {
        gameTitle: this.gameTitle,
        platform: this.platform,
        nominatedBy: this.nominatedBy,
        votes: this.votes,
        status: this.status,
        dateNominated: this.dateNominated
    };
};

export const Nomination = mongoose.model('Nomination', nominationSchema);
export default Nomination;
