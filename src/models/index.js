// src/models/index.js - DEPLOYMENT-SAFE VERSION with all models and enhanced timeout handling
import mongoose from 'mongoose';
import { config, getTimeout, getDatabaseConfig, getEnvironmentSettings } from '../config/config.js';

// Import all models
import Challenge from './Challenge.js';
import User from './User.js';
import ArcadeBoard from './ArcadeBoard.js';
import Poll from './Poll.js';
import { HistoricalLeaderboard } from './HistoricalLeaderboard.js';
import { GachaItem, CombinationRule } from './GachaItem.js';
import { TrophyEmoji } from './TrophyEmoji.js';

// DEPLOYMENT SAFETY: Global mongoose configuration
mongoose.set('strictQuery', true);
mongoose.set('bufferCommands', false); // CRITICAL: Disable buffering to prevent hangs
mongoose.set('bufferMaxEntries', 0);

// DEPLOYMENT SAFETY: Connection state tracking
let connectionState = {
    isConnected: false,
    isConnecting: false,
    connectionAttempts: 0,
    lastError: null,
    connectionTime: null,
    initializationComplete: false
};

/**
 * DEPLOYMENT SAFETY: Enhanced database connection with aggressive timeouts and error handling
 */
export const connectDB = async () => {
    const envSettings = getEnvironmentSettings();
    const maxRetries = envSettings.isProduction ? 3 : 5;
    
    // Prevent multiple simultaneous connection attempts
    if (connectionState.isConnecting) {
        console.log('🔗 Database connection already in progress, waiting...');
        return await waitForConnection();
    }

    if (connectionState.isConnected) {
        console.log('✅ Database already connected');
        return mongoose.connection;
    }

    connectionState.isConnecting = true;
    connectionState.connectionAttempts++;

    try {
        console.log(`🔌 Connecting to MongoDB (attempt ${connectionState.connectionAttempts}/${maxRetries})...`);
        
        // DEPLOYMENT SAFETY: Get environment-optimized database config
        const dbConfig = getDatabaseConfig();
        const connectTimeout = getTimeout('database');
        
        console.log(`⏱️ Using ${envSettings.isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} timeouts (${connectTimeout}ms)`);
        
        // Create connection promise with timeout
        const connectPromise = mongoose.connect(dbConfig.uri, dbConfig.options);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Database connection timeout after ${connectTimeout}ms`)), connectTimeout);
        });

        // Race connection against timeout
        const conn = await Promise.race([connectPromise, timeoutPromise]);

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);
        
        // DEPLOYMENT SAFETY: Immediate connection health check
        const pingStart = Date.now();
        const healthCheckTimeout = getTimeout('healthCheck');
        
        try {
            const pingPromise = mongoose.connection.db.admin().ping();
            const pingTimeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Ping timeout')), healthCheckTimeout);
            });
            
            await Promise.race([pingPromise, pingTimeoutPromise]);
            const pingTime = Date.now() - pingStart;
            
            console.log(`🏓 Database ping: ${pingTime}ms`);
            
            if (pingTime > 3000) {
                console.warn('⚠️ High database latency detected');
            }
        } catch (pingError) {
            console.warn('⚠️ Database ping failed (non-critical):', pingError.message);
        }

        // Update connection state
        connectionState.isConnected = true;
        connectionState.isConnecting = false;
        connectionState.connectionTime = new Date();
        connectionState.lastError = null;

        // DEPLOYMENT SAFETY: Re-disable buffering after connection (critical)
        mongoose.set('bufferCommands', false);
        console.log('🔧 Confirmed command buffering disabled after connection');

        // DEPLOYMENT SAFETY: Initialize models with timeout protection
        await initializeAllModels(envSettings);

        // Set up connection monitoring
        setupConnectionHandlers();
        
        connectionState.initializationComplete = true;
        console.log('✅ Database connection and initialization complete');
        
        return conn;
        
    } catch (error) {
        connectionState.isConnecting = false;
        connectionState.lastError = error;
        
        console.error(`❌ MongoDB connection failed (attempt ${connectionState.connectionAttempts}/${maxRetries}):`, error.message);
        
        // DEPLOYMENT SAFETY: Provide specific error guidance
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            console.error('💡 Connection failed - check:');
            console.error('   - MongoDB server is running');
            console.error('   - Network connectivity');
            console.error('   - Connection string is correct');
        }
        
        if (error.message.includes('Authentication failed')) {
            console.error('💡 Authentication failed - check username/password');
        }
        
        if (error.message.includes('IP') || error.message.includes('whitelist')) {
            console.error('💡 If using Atlas, check IP whitelist settings');
        }

        if (error.message.includes('timeout')) {
            console.error('💡 Connection timeout - possible network issues or server overload');
        }
        
        // DEPLOYMENT SAFETY: Fail fast in production, retry in development
        if (envSettings.isProduction || connectionState.connectionAttempts >= maxRetries) {
            console.error('❌ Maximum connection attempts reached or production mode - exiting');
            throw error;
        } else {
            console.log('🔄 Retrying connection in 3 seconds...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return await connectDB();
        }
    }
};

/**
 * DEPLOYMENT SAFETY: Wait for existing connection attempt with timeout
 */
async function waitForConnection(maxWait = 30000) {
    const startTime = Date.now();
    
    while (connectionState.isConnecting && (Date.now() - startTime) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (connectionState.isConnected) {
        return mongoose.connection;
    }
    
    if (connectionState.lastError) {
        throw connectionState.lastError;
    }
    
    throw new Error('Database connection wait timeout');
}

/**
 * DEPLOYMENT SAFETY: Initialize all models with enhanced timeout protection and fallback handling
 */
async function initializeAllModels(envSettings) {
    console.log('🔧 Initializing database models and indexes...');
    
    const models = [
        { name: 'Challenge', model: Challenge, critical: true },
        { name: 'User', model: User, critical: true },
        { name: 'ArcadeBoard', model: ArcadeBoard, critical: true },
        { name: 'Poll', model: Poll, critical: false },
        { name: 'HistoricalLeaderboard', model: HistoricalLeaderboard, critical: false },
        { name: 'GachaItem', model: GachaItem, critical: false },
        { name: 'CombinationRule', model: CombinationRule, critical: false },
        { name: 'TrophyEmoji', model: TrophyEmoji, critical: false }
    ];

    // DEPLOYMENT SAFETY: Use different timeouts for production vs development
    const initTimeout = envSettings.isProduction ? 8000 : 15000;
    
    if (envSettings.isProduction) {
        // PRODUCTION: Initialize critical models first, then non-critical in parallel
        console.log('🚀 Production mode: Prioritizing critical models');
        await initializeCriticalModels(models.filter(m => m.critical), initTimeout);
        await initializeNonCriticalModels(models.filter(m => !m.critical), initTimeout);
    } else {
        // DEVELOPMENT: Initialize all models in parallel with longer timeout
        console.log('🛠️ Development mode: Initializing all models in parallel');
        const initPromises = models.map(({ name, model, critical }) => 
            initModelSafely(name, model, initTimeout, critical)
        );
        
        await Promise.allSettled(initPromises);
    }
    
    console.log('✅ Model initialization complete');
}

/**
 * DEPLOYMENT SAFETY: Initialize critical models sequentially for reliability
 */
async function initializeCriticalModels(criticalModels, timeout) {
    console.log('⚡ Initializing critical models sequentially...');
    
    for (const { name, model } of criticalModels) {
        try {
            await initModelSafely(name, model, timeout, true);
        } catch (error) {
            console.error(`❌ Critical model ${name} failed to initialize:`, error.message);
            throw error; // Fail fast for critical models
        }
    }
}

/**
 * DEPLOYMENT SAFETY: Initialize non-critical models in parallel with fallbacks
 */
async function initializeNonCriticalModels(nonCriticalModels, timeout) {
    console.log('🔄 Initializing non-critical models in parallel...');
    
    const initPromises = nonCriticalModels.map(({ name, model }) => 
        initModelSafely(name, model, timeout, false).catch(error => {
            console.warn(`⚠️ Non-critical model ${name} failed (continuing):`, error.message);
            return { success: false, modelName: name, error: error.message };
        })
    );
    
    await Promise.allSettled(initPromises);
}

/**
 * DEPLOYMENT SAFETY: Safe model initialization with aggressive timeout and error handling
 */
async function initModelSafely(modelName, model, timeoutMs, isCritical = false) {
    try {
        console.log(`  🔧 Initializing ${modelName}${isCritical ? ' (critical)' : ''}...`);
        
        // DEPLOYMENT SAFETY: Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${modelName} initialization timeout after ${timeoutMs}ms`)), timeoutMs);
        });
        
        // DEPLOYMENT SAFETY: Race model initialization against timeout
        await Promise.race([
            model.init(),
            timeoutPromise
        ]);
        
        console.log(`  ✅ ${modelName} initialized successfully`);
        return { success: true, modelName, isCritical };
        
    } catch (error) {
        const errorMsg = `${modelName} initialization failed: ${error.message}`;
        
        if (isCritical) {
            console.error(`  ❌ CRITICAL: ${errorMsg}`);
            throw error;
        } else {
            console.warn(`  ⚠️ NON-CRITICAL: ${errorMsg}`);
            console.log(`     ↩️ Continuing without ${modelName}`);
            return { success: false, modelName, error: error.message, isCritical };
        }
    }
}

/**
 * DEPLOYMENT SAFETY: Enhanced connection event handlers with monitoring
 */
function setupConnectionHandlers() {
    // Error handler with classification
    mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
        connectionState.lastError = err;
        
        // Classify error types for different handling
        if (err.message.includes('timeout') || err.message.includes('ECONNRESET')) {
            console.log('🔄 Network error detected - automatic reconnection will be attempted');
        } else if (err.message.includes('Authentication')) {
            console.error('🔐 Authentication error - check credentials');
        } else if (err.message.includes('ENOTFOUND')) {
            console.error('🌐 DNS resolution error - check connection string');
        }
    });
    
    // Disconnection handler with auto-reconnect logic
    mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected');
        connectionState.isConnected = false;
        connectionState.initializationComplete = false;
        
        // DEPLOYMENT SAFETY: Auto-reconnect only in development or for network errors
        if (!getEnvironmentSettings().isProduction) {
            setTimeout(() => {
                if (mongoose.connection.readyState === 0) {
                    console.log('🔄 Attempting automatic reconnection...');
                    connectDB().catch(reconnectError => {
                        console.error('❌ Auto-reconnection failed:', reconnectError.message);
                    });
                }
            }, 5000);
        }
    });
    
    // Reconnection handler
    mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected successfully');
        connectionState.isConnected = true;
        connectionState.lastError = null;
    });
    
    // Connection established handler
    mongoose.connection.on('connected', () => {
        console.log('🔗 MongoDB connection established');
        connectionState.isConnected = true;
    });
    
    // DEPLOYMENT SAFETY: Graceful shutdown handlers
    const gracefulShutdown = async (signal) => {
        console.log(`\n📴 Received ${signal}, closing database connection...`);
        try {
            await mongoose.connection.close();
            console.log('🔌 MongoDB connection closed successfully');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error closing MongoDB connection:', error);
            process.exit(1);
        }
    };
    
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart
}

/**
 * DEPLOYMENT SAFETY: Enhanced health check with detailed diagnostics
 */
export const checkDatabaseHealth = async () => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return { 
                healthy: false, 
                error: 'Not connected',
                readyState: mongoose.connection.readyState,
                connectionState: connectionState
            };
        }
        
        const start = Date.now();
        const healthTimeout = getTimeout('healthCheck');
        
        // Create ping promise with timeout
        const pingPromise = mongoose.connection.db.admin().ping();
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Health check timeout')), healthTimeout);
        });
        
        await Promise.race([pingPromise, timeoutPromise]);
        const latency = Date.now() - start;
        
        return { 
            healthy: true, 
            latency,
            connectionState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            database: mongoose.connection.name,
            initializationComplete: connectionState.initializationComplete,
            connectionTime: connectionState.connectionTime,
            connectionAttempts: connectionState.connectionAttempts
        };
    } catch (error) {
        return { 
            healthy: false, 
            error: error.message,
            connectionState: mongoose.connection.readyState,
            lastError: connectionState.lastError?.message
        };
    }
};

/**
 * DEPLOYMENT SAFETY: Enhanced safe query wrapper with environment-specific timeouts
 */
export const safeQuery = async (queryFn, customTimeout = null, fallback = null) => {
    try {
        // Check connection state first
        if (mongoose.connection.readyState !== 1) {
            if (fallback !== null) {
                console.warn('Database not connected, using fallback value');
                return fallback;
            }
            throw new Error('Database not connected');
        }
        
        // Use custom timeout or get environment-appropriate timeout
        const timeout = customTimeout || getTimeout('query');
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout);
        });
        
        // Race query against timeout
        const result = await Promise.race([queryFn(), timeoutPromise]);
        return result;
        
    } catch (error) {
        console.error('Safe query failed:', error.message);
        
        if (fallback !== null) {
            console.log('Using fallback value due to query failure');
            return fallback;
        }
        
        throw error;
    }
};

/**
 * DEPLOYMENT SAFETY: Batch query executor with concurrency control
 */
export const safeBatchQuery = async (queryFunctions, options = {}) => {
    const {
        concurrency = getEnvironmentSettings().isProduction ? 3 : 5,
        timeout = getTimeout('query'),
        continueOnError = true
    } = options;
    
    const results = [];
    const errors = [];
    
    // Process queries in batches
    for (let i = 0; i < queryFunctions.length; i += concurrency) {
        const batch = queryFunctions.slice(i, i + concurrency);
        
        const batchPromises = batch.map(async (queryFn, index) => {
            try {
                const result = await safeQuery(queryFn, timeout);
                return { success: true, index: i + index, result };
            } catch (error) {
                const errorResult = { success: false, index: i + index, error: error.message };
                if (continueOnError) {
                    return errorResult;
                } else {
                    throw error;
                }
            }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, batchIndex) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                errors.push({ index: i + batchIndex, error: result.reason.message });
            }
        });
    }
    
    return { results, errors, totalProcessed: queryFunctions.length };
};

/**
 * DEPLOYMENT SAFETY: Get connection statistics for monitoring
 */
export const getConnectionStats = () => {
    return {
        ...connectionState,
        mongooseReadyState: mongoose.connection.readyState,
        readyStateDescription: {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        }[mongoose.connection.readyState] || 'unknown',
        host: mongoose.connection.host,
        database: mongoose.connection.name,
        collections: Object.keys(mongoose.connection.collections || {}),
        environment: getEnvironmentSettings()
    };
};

/**
 * DEPLOYMENT SAFETY: Force database reconnection with cleanup
 */
export const forceReconnect = async () => {
    console.log('🔄 Forcing database reconnection...');
    
    try {
        // Close existing connection
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        
        // Reset connection state
        connectionState = {
            isConnected: false,
            isConnecting: false,
            connectionAttempts: 0,
            lastError: null,
            connectionTime: null,
            initializationComplete: false
        };
        
        // Reconnect
        return await connectDB();
    } catch (error) {
        console.error('❌ Force reconnection failed:', error);
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
    GachaItem,
    CombinationRule,
    TrophyEmoji
};

// Default export with enhanced functionality
export default {
    // Models
    Challenge,
    User,
    ArcadeBoard,
    Poll,
    HistoricalLeaderboard,
    GachaItem,
    CombinationRule,
    TrophyEmoji,
    
    // Connection functions
    connectDB,
    checkDatabaseHealth,
    getConnectionStats,
    forceReconnect,
    
    // Query functions
    safeQuery,
    safeBatchQuery
};
