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
        imageIcon: String
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
    }
});

export const Poll = mongoose.model('Poll', pollSchema);
export default Poll;
