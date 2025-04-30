import Challenge from './Challenge.js';
import User from './User.js';
import ArcadeBoard from './ArcadeBoard.js';
import Poll from './Poll.js';

export {
    Challenge,
    User,
    ArcadeBoard,
    Poll
};

// Initialize MongoDB connection
import mongoose from 'mongoose';
import { config } from '../config/config.js';

mongoose.set('strictQuery', true);

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(config.mongodb.uri);

        console.log(`MongoDB Connected: ${conn.connection.host}`);
        
        // Create indexes for all models
        await Promise.all([
            Challenge.init(),
            User.init(),
            ArcadeBoard.init(),
            Poll.init()
        ]);
        
        console.log('Database indexes ensured');
        
        return conn;
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

export default {
    Challenge,
    User,
    ArcadeBoard,
    Poll,
    connectDB
};
