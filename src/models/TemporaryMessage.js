// src/models/TemporaryMessage.js
import mongoose from 'mongoose';

const tempMessageSchema = new mongoose.Schema({
    messageId: { type: String, required: true },
    channelId: { type: String, required: true },
    deleteAt: { type: Date, required: true, index: true },
    type: { type: String, default: 'notification' }
});

export const TemporaryMessage = mongoose.model('TemporaryMessage', tempMessageSchema);
