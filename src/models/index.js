import Award from './Award.js';
import Game from './Game.js';
import Nomination from './Nomination.js';
import PlayerProgress from './PlayerProgress.js';
import User from './User.js';

export {
    Award,
    Game,
    Nomination,
    PlayerProgress,
    User
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
            Award.init(),
            Game.init(),
            Nomination.init(),
            PlayerProgress.init(),
            User.init()
        ]);
        
        console.log('Database indexes ensured');
        
        return conn;
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

export default {
    Award,
    Game,
    Nomination,
    PlayerProgress,
    User,
    connectDB
};
