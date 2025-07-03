// src/config/config.js - DEPLOYMENT-SAFE VERSION with enhanced features
import dotenv from 'dotenv';
dotenv.config();

// DEPLOYMENT SAFETY: Environment detection
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Enum for award types
export const AwardType = {
    NONE: 0,
    PARTICIPATION: 1,
    BEATEN: 2,
    MASTERY: 3
};

// Configuration object with deployment safety enhancements
export const config = {
    // Discord Configuration
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID,
        guildId: process.env.DISCORD_GUILD_ID,
        achievementChannelId: process.env.ACHIEVEMENT_CHANNEL,
        announcementChannelId: process.env.ANNOUNCEMENT_CHANNEL,
        votingChannelId: process.env.VOTING_CHANNEL,
        registrationChannelId: process.env.REGISTRATION_CHANNEL,
        registrationMonitorChannelId: process.env.REGISTRATION_MONITOR_CHANNEL,
        shadowGameChannelId: process.env.SHADOW_GAME_CHANNEL,
        leaderboardFeedChannelId: process.env.LEADERBOARD_FEED_CHANNEL || '1371350718505811989',
        rankAlertsChannelId: process.env.RANK_ALERTS_CHANNEL || '1371350718505811989',
        arcadeAlertsChannelId: process.env.ARCADE_ALERTS_CHANNEL || '1300941091335438471',
        arcadeFeedChannelId: process.env.ARCADE_FEED_CHANNEL || '1371363491130114098',
        arenaChannelId: process.env.ARENA_CHANNEL || '1373570850912997476',
        arenaFeedChannelId: process.env.ARENA_FEED_CHANNEL || '1373570913882214410',
        memberRoleId: process.env.MEMBER_ROLE_ID || '1300941091335438469',
        adminLogChannelId: process.env.ADMIN_LOG_CHANNEL || '1304814893857374270',
        
        // DEPLOYMENT SAFETY: Request limits for Discord API
        requestsPerMinute: isProduction ? 30 : 60,
        maxConcurrentRequests: isProduction ? 5 : 10
    },
    
    // RetroAchievements API Configuration with deployment safety
    retroAchievements: {
        apiKey: process.env.RA_API_KEY,
        baseUrl: 'https://retroachievements.org/API',
        
        // DEPLOYMENT SAFETY: API timeouts and limits
        timeout: isProduction ? 8000 : 15000,
        retries: isProduction ? 2 : 3,
        retryDelay: isProduction ? 1000 : 2000,
        requestsPerMinute: isProduction ? 30 : 60
    },
    
    // MongoDB Configuration with deployment safety
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/select-start',
        
        // DEPLOYMENT SAFETY: Aggressive connection settings for production
        options: {
            // Connection timeouts (shorter for production)
            serverSelectionTimeoutMS: isProduction ? 10000 : 30000,
            connectTimeoutMS: isProduction ? 15000 : 30000,
            socketTimeoutMS: isProduction ? 20000 : 45000,
            heartbeatFrequencyMS: isProduction ? 10000 : 30000,
            
            // Connection pool settings
            maxPoolSize: isProduction ? 5 : 10,
            minPoolSize: isProduction ? 1 : 2,
            maxIdleTimeMS: isProduction ? 30000 : 60000,
            
            // Reliability settings
            retryWrites: true,
            retryReads: true,
            readPreference: 'primary',
            
            // DEPLOYMENT SAFETY: Critical - disable buffering for faster failures
            bufferCommands: false,
            bufferMaxEntries: 0,
            
            // SSL for production (Atlas)
            ssl: isProduction,
            family: 4 // Use IPv4
        }
    },
    
    // Bot Configuration with deployment optimizations
    bot: {
        // Achievement update interval in minutes
        updateInterval: isProduction ? 30 : 15,
        
        // Command prefix for legacy commands (if needed)
        prefix: '!',
        
        // Role IDs for permissions
        roles: {
            admin: process.env.ADMIN_ROLE_ID,
            member: process.env.MEMBER_ROLE_ID
        },
        
        // DEPLOYMENT SAFETY: Performance settings
        maxCacheSize: isProduction ? 1000 : 5000,
        cacheCleanupInterval: isProduction ? 300000 : 600000, // 5min vs 10min
        maxConcurrentOperations: isProduction ? 3 : 5
    },
    
    // Arena Configuration
    arena: {
        // Default monthly GP allowance
        monthlyGpAllowance: 1000,
        
        // Minimum bet amount
        minBetAmount: 10,
        
        // Maximum challenge duration in hours (1 week)
        maxChallengeDuration: 168,
        
        // Minimum challenge duration in hours
        minChallengeDuration: 1,
        
        // DEPLOYMENT SAFETY: Timeouts for arena operations
        challengeProcessingTimeout: isProduction ? 10000 : 20000,
        maxActiveArenas: isProduction ? 50 : 100
    },
    
    // DEPLOYMENT SAFETY: Gacha system configuration
    gacha: {
        maxCacheSize: isProduction ? 1000 : 5000,
        cacheCleanupInterval: isProduction ? 300000 : 600000,
        
        // Store refresh settings
        storeRefreshHour: 0, // UTC midnight
        storeItemCount: 4,
        
        // Pull costs
        singlePullCost: 50,
        multiPullCost: 150,
        
        // Database query timeouts
        queryTimeout: isProduction ? 5000 : 10000,
        initializationTimeout: isProduction ? 15000 : 30000
    },
    
    // DEPLOYMENT SAFETY: Service timeouts and limits
    services: {
        // Maximum time to wait for service initialization
        initializationTimeout: isProduction ? 15000 : 30000,
        
        // Maximum time for database queries during startup
        startupQueryTimeout: isProduction ? 5000 : 10000,
        
        // Cache initialization timeout
        cacheInitTimeout: isProduction ? 8000 : 15000,
        
        // Service health check timeout
        healthCheckTimeout: isProduction ? 5000 : 10000,
        
        // Background task timeout
        backgroundTaskTimeout: isProduction ? 30000 : 60000,
        
        // Maximum concurrent service operations
        maxConcurrentServices: isProduction ? 3 : 5
    },
    
    // DEPLOYMENT SAFETY: Performance and caching settings
    performance: {
        // Cache TTLs (shorter for production to save memory)
        userCacheTTL: isProduction ? 300000 : 600000, // 5min vs 10min
        embedCacheTTL: isProduction ? 900000 : 1800000, // 15min vs 30min
        queryCacheTTL: isProduction ? 180000 : 300000, // 3min vs 5min
        
        // Query limits
        maxQueryResults: isProduction ? 100 : 500,
        maxConcurrentQueries: isProduction ? 5 : 10,
        
        // Memory limits
        maxMemoryUsage: isProduction ? 512 : 1024, // MB
        cacheMemoryLimit: isProduction ? 128 : 256 // MB
    },
    
    // DEPLOYMENT SAFETY: Startup behavior configuration
    startup: {
        // Skip non-essential initialization in production
        skipBackgroundInit: isProduction,
        
        // Fail fast on critical errors
        failFastOnCriticalError: isProduction,
        
        // Maximum startup time before giving up
        maxStartupTime: isProduction ? 60000 : 120000, // 1min vs 2min
        
        // Database connection retry settings
        maxDbRetries: isProduction ? 3 : 5,
        dbRetryDelay: isProduction ? 2000 : 5000,
        
        // Service initialization mode
        useParallelInit: isProduction, // Faster startup in production
        useStaggeredInit: !isProduction // More careful in development
    },
    
    // Logging configuration
    logging: {
        level: isProduction ? 'warn' : 'info',
        enableDebug: isDevelopment,
        logToConsole: true,
        logToFile: isProduction,
        maxLogSize: isProduction ? 10 : 50, // MB
        enablePerformanceLogs: isDevelopment
    }
};

/**
 * DEPLOYMENT SAFETY: Enhanced validation with better error messages
 */
export function validateConfig() {
    console.log(`🔧 Validating configuration for ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} environment...`);
    
    const required = [
        'DISCORD_TOKEN',
        'DISCORD_CLIENT_ID',
        'DISCORD_GUILD_ID',
        'RA_API_KEY',
        'MONGODB_URI'
    ];

    const optional = [
        'ACHIEVEMENT_CHANNEL',
        'ANNOUNCEMENT_CHANNEL',
        'VOTING_CHANNEL',
        'REGISTRATION_CHANNEL',
        'REGISTRATION_MONITOR_CHANNEL',
        'SHADOW_GAME_CHANNEL',
        'LEADERBOARD_FEED_CHANNEL',
        'RANK_ALERTS_CHANNEL',
        'ARCADE_ALERTS_CHANNEL',
        'ARCADE_FEED_CHANNEL',
        'ARENA_CHANNEL',
        'ARENA_FEED_CHANNEL',
        'MEMBER_ROLE_ID',
        'ADMIN_LOG_CHANNEL'
    ];

    // Check required variables
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:', missing);
        throw new Error(`Missing required environment variables: ${missing.join(', ')}\n` +
            'Please check your .env file and ensure all required variables are set.');
    }

    // Check optional variables
    const missingOptional = optional.filter(key => !process.env[key]);
    if (missingOptional.length > 0) {
        console.warn(`⚠️ Missing optional environment variables: ${missingOptional.join(', ')}`);
        console.warn('Some features may be disabled until these are configured.');
    }

    // DEPLOYMENT SAFETY: Validate formats
    try {
        // Validate MongoDB URI
        if (!config.mongodb.uri.startsWith('mongodb')) {
            throw new Error('Invalid MongoDB URI format - must start with mongodb:// or mongodb+srv://');
        }

        // Validate Discord token
        if (config.discord.token && config.discord.token.length < 50) {
            throw new Error('Discord token appears to be invalid (too short)');
        }

        // Validate Discord IDs (should be snowflakes)
        const discordIds = [
            config.discord.clientId,
            config.discord.guildId
        ].filter(Boolean);

        for (const id of discordIds) {
            if (!/^\d{17,19}$/.test(id)) {
                console.warn(`⚠️ Discord ID may be invalid: ${id}`);
            }
        }

        console.log('✅ Configuration validation passed');
        
        // Log deployment mode info
        if (isProduction) {
            console.log('🚀 PRODUCTION MODE - Deployment safety optimizations enabled:');
            console.log('  • Reduced timeouts for faster failure detection');
            console.log('  • Smaller cache sizes for better memory usage');
            console.log('  • Background initialization disabled');
            console.log('  • Aggressive connection settings');
            console.log('  • Parallel service initialization');
        } else {
            console.log('🛠️ DEVELOPMENT MODE - Extended timeouts and debugging enabled:');
            console.log('  • Longer timeouts for debugging');
            console.log('  • Larger cache sizes');
            console.log('  • Background initialization enabled');
            console.log('  • Staggered service initialization');
        }

    } catch (validationError) {
        console.error('❌ Configuration validation failed:', validationError.message);
        throw validationError;
    }
}

/**
 * Get timeout value based on operation and environment
 */
export function getTimeout(operation) {
    const timeouts = {
        database: isProduction ? 10000 : 30000,
        api: isProduction ? 8000 : 15000,
        cache: isProduction ? 5000 : 10000,
        startup: isProduction ? 15000 : 30000,
        service: isProduction ? 10000 : 20000,
        query: isProduction ? 5000 : 10000,
        healthCheck: isProduction ? 5000 : 10000
    };
    
    return timeouts[operation] || timeouts.service;
}

/**
 * DEPLOYMENT SAFETY: Check if we should use fallback mode
 */
export function shouldUseFallbackMode() {
    return isProduction && (
        process.env.FORCE_FALLBACK === 'true' ||
        process.env.DISABLE_CACHE_INIT === 'true' ||
        process.env.MINIMAL_MODE === 'true'
    );
}

/**
 * DEPLOYMENT SAFETY: Get environment-specific settings
 */
export function getEnvironmentSettings() {
    return {
        isProduction,
        isDevelopment,
        skipBackgroundInit: config.startup.skipBackgroundInit,
        failFast: config.startup.failFastOnCriticalError,
        maxStartupTime: config.startup.maxStartupTime,
        useFallback: shouldUseFallbackMode()
    };
}

/**
 * DEPLOYMENT SAFETY: Get database configuration with environment optimizations
 */
export function getDatabaseConfig() {
    return {
        uri: config.mongodb.uri,
        options: config.mongodb.options
    };
}

/**
 * DEPLOYMENT SAFETY: Get performance settings
 */
export function getPerformanceSettings() {
    return {
        ...config.performance,
        environment: isProduction ? 'production' : 'development'
    };
}

// Export default config
export default config;
