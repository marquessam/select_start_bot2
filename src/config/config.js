import dotenv from 'dotenv';
dotenv.config();

// Enum for award types
export const AwardType = {
    NONE: 0,
    PARTICIPATION: 1,
    BEATEN: 2,
    MASTERY: 3
};

// Configuration object
export const config = {
    // Discord Configuration
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID,
        guildId: process.env.DISCORD_GUILD_ID,
        achievementChannelId: process.env.ACHIEVEMENT_CHANNEL
    },
    
    // RetroAchievements API Configuration
    retroAchievements: {
        apiKey: process.env.RA_API_KEY
    },
    
    // MongoDB Configuration
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/select-start'
    },
    
    // Bot Configuration
    bot: {
        // Achievement update interval in minutes
        updateInterval: 30,
        
        // Command prefix for legacy commands (if needed)
        prefix: '!',
        
        // Role IDs for permissions
        roles: {
            admin: process.env.ADMIN_ROLE_ID
        }
    }
};

// Validation function to ensure all required environment variables are set
export function validateConfig() {
    const required = [
        'DISCORD_TOKEN',
        'DISCORD_CLIENT_ID',
        'DISCORD_GUILD_ID',
        'RA_API_KEY',
        'MONGODB_URI',
        'ACHIEVEMENT_CHANNEL'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}\n` +
            'Please check your .env file and ensure all required variables are set.');
    }
}

// Export default config
export default config;
