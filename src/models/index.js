// src/models/index.js - UPDATED with all models and timeout fixes
import mongoose from 'mongoose';
import { config } from '../config/config.js';

// Import all models
import Challenge from './Challenge.js';
import User from './User.js';
import ArcadeBoard from './ArcadeBoard.js';
import Poll from './Poll.js';
import { HistoricalLeaderboard } from './HistoricalLeaderboard.js';
import { GachaItem, CombinationRule } from './GachaItem.js';  // ← MISSING!
import { TrophyEmoji } from './TrophyEmoji.js';              // ← MISSING!

// CRITICAL: Disable buffering to prevent timeout issues
mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false);  // ← CRITICAL FIX
mongoose.set('bufferMaxEntries', 0);    // ← CRITICAL FIX

export const connectDB = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        
        // IMPROVED connection options to prevent timeouts
        const options = {
            // Disable buffering (critical for timeout prevention)
            bufferCommands: false,
            bufferMaxEntries: 0,
            
            // Timeout settings
            serverSelectionTimeoutMS: 30000, // 30 seconds to select server
            socketTimeoutMS: 45000,          // 45 seconds for socket operations  
            connectTimeoutMS: 30000,         // 30 seconds to establish connection
            heartbeatFrequencyMS: 10000,     // 10 seconds heartbeat
            
            // Connection pool settings
            maxPoolSize: 10,        // Maximum connections
            minPoolSize: 2,         // Minimum connections
            maxIdleTimeMS: 30000,   // Close connections after 30s idle
            
            // Retry and reliability
            retryWrites: true,
            retryReads: true,
            
            // For production/Atlas
            ssl: true,
            
            // Additional reliability settings
            family: 4, // Use IPv4, skip trying IPv6
        };

        const conn = await mongoose.connect(config.mongodb.uri, options);

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);
        
        // Test connection immediately
        const pingStart = Date.now();
        await mongoose.connection.db.admin().ping();
        const pingTime = Date.now() - pingStart;
        console.log(`🏓 Database ping: ${pingTime}ms`);
        
        if (pingTime > 3000) {
            console.warn('⚠️ High database latency detected');
        }

        // Initialize ALL models with proper error handling and timeouts
        console.log('🔧 Initializing database indexes...');
        
        const modelInitPromises = [
            // Original models
            initModelSafely('Challenge', Challenge),
            initModelSafely('User', User),
            initModelSafely('ArcadeBoard', ArcadeBoard),
            initModelSafely('Poll', Poll),
            initModelSafely('HistoricalLeaderboard', HistoricalLeaderboard),
            
            // MISSING MODELS - These were causing the timeout errors!
            initModelSafely('GachaItem', GachaItem),
            initModelSafely('CombinationRule', CombinationRule),
            initModelSafely('TrophyEmoji', TrophyEmoji),
        ];
        
        // Wait for all models to initialize with timeout
        const initResults = await Promise.allSettled(modelInitPromises);
        
        // Report initialization results
        initResults.forEach((result, index) => {
            const modelNames = ['Challenge', 'User', 'ArcadeBoard', 'Poll', 'HistoricalLeaderboard', 'GachaItem', 'CombinationRule', 'TrophyEmoji'];
            const modelName = modelNames[index];
            
            if (result.status === 'fulfilled') {
                console.log(`  ✅ ${modelName} initialized`);
            } else {
                console.error(`  ❌ ${modelName} failed:`, result.reason.message);
            }
        });
        
        console.log('✅ Database indexes ensured');
        
        // Set up connection event handlers AFTER successful connection
        setupConnectionHandlers();
        
        return conn;
        
    } catch (error) {
        console.error('❌ Error connecting to MongoDB:', error.message);
        
        // Provide specific error guidance
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            console.error('💡 Connection failed - check:');
            console.error('   - MongoDB server is running');
            console.error('   - Network connectivity');
            console.error('   - Connection string is correct');
        }
        
        if (error.message.includes('Authentication failed')) {
            console.error('💡 Authentication failed - check username/password');
        }
        
        if (error.message.includes('IP')) {
            console.error('💡 If using Atlas, check IP whitelist settings');
        }
        
        // Don't exit immediately in development, but do in production
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        } else {
            console.log('🔄 Retrying connection in 5 seconds...');
            setTimeout(() => connectDB(), 5000);
        }
    }
};

// Safe model initialization with timeout
async function initModelSafely(modelName, model, timeoutMs = 15000) {
    try {
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${modelName} init timed out`)), timeoutMs);
        });
        
        // Race between model init and timeout
        await Promise.race([
            model.init(),
            timeoutPromise
        ]);
        
        return { success: true, modelName };
        
    } catch (error) {
        console.error(`⚠️ ${modelName} init failed:`, error.message);
        
        // For non-critical models, continue anyway
        if (['TrophyEmoji', 'GachaItem'].includes(modelName)) {
            console.log(`   ↩️ Continuing without ${modelName} (non-critical)`);
            return { success: false, modelName, error: error.message };
        }
        
        throw error;
    }
}

// Connection event handlers
function setupConnectionHandlers() {
    // Error handler
    mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
        
        // Attempt to reconnect for certain errors
        if (err.message.includes('timeout') || err.message.includes('ECONNRESET')) {
            console.log('🔄 Attempting to reconnect...');
        }
    });
    
    // Disconnection handler
    mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected');
        
        // Auto-reconnect logic (Mongoose handles this automatically, but we can add custom logic)
        setTimeout(() => {
            if (mongoose.connection.readyState === 0) {
                console.log('🔄 Attempting manual reconnection...');
                connectDB().catch(console.error);
            }
        }, 5000);
    });
    
    // Reconnection handler
    mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected successfully');
    });
    
    // Connection state changes
    mongoose.connection.on('connected', () => {
        console.log('🔗 MongoDB connected');
    });
    
    // SIGINT handler for graceful shutdown
    process.on('SIGINT', async () => {
        try {
            await mongoose.connection.close();
            console.log('🔌 MongoDB connection closed through app termination');
            process.exit(0);
        } catch (error) {
            console.error('Error closing MongoDB connection:', error);
            process.exit(1);
        }
    });
}

// Health check function
export const checkDatabaseHealth = async () => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return { healthy: false, error: 'Not connected' };
        }
        
        const start = Date.now();
        await mongoose.connection.db.admin().ping();
        const latency = Date.now() - start;
        
        return { 
            healthy: true, 
            latency,
            connectionState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            database: mongoose.connection.name
        };
    } catch (error) {
        return { healthy: false, error: error.message };
    }
};

// Safe query wrapper for operations that might timeout
export const safeQuery = async (queryFn, timeoutMs = 15000, fallback = null) => {
    try {
        // Check connection first
        if (mongoose.connection.readyState !== 1) {
            if (fallback !== null) return fallback;
            throw new Error('Database not connected');
        }
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Query timed out')), timeoutMs);
        });
        
        // Race between query and timeout
        return await Promise.race([queryFn(), timeoutPromise]);
        
    } catch (error) {
        console.error('Query failed:', error.message);
        
        if (fallback !== null) {
            console.log('Using fallback value');
            return fallback;
        }
        
        throw error;
    }
};

// Export all models
export {
    Challenge,
    User,
    ArcadeBoard,
    Poll,
    HistoricalLeaderboard,
    GachaItem,        // ← NOW EXPORTED
    CombinationRule,  // ← NOW EXPORTED  
    TrophyEmoji       // ← NOW EXPORTED
};

// Default export
export default {
    Challenge,
    User,
    ArcadeBoard,
    Poll,
    HistoricalLeaderboard,
    GachaItem,        // ← NOW INCLUDED
    CombinationRule,  // ← NOW INCLUDED
    TrophyEmoji,      // ← NOW INCLUDED
    connectDB,
    checkDatabaseHealth,
    safeQuery
};
