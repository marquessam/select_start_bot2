const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    Events 
} = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { initializeGames } = require('./utils/initializeGames');
const { initializeUsers } = require('./utils/initializeUsers');
const UserTracker = require('./services/userTracker');
const Scheduler = require('./services/scheduler');
const leaderboardService = require('./services/leaderboardService'); // Import leaderboard service

// Load environment variables
require('dotenv').config();

// Verify Railway environment variables
const requiredRailwayVars = [
    'DISCORD_TOKEN',
    'MONGODB_URI',
    'RA_USERNAME',
    'RA_API_KEY'
];

// Verify .env environment variables
const requiredDotEnvVars = [
    'ACHIEVEMENT_FEED_CHANNEL',
    'REGISTRATION_CHANNEL_ID'
];

const missingRailwayVars = requiredRailwayVars.filter(varName => !process.env[varName]);
const missingDotEnvVars = requiredDotEnvVars.filter(varName => !process.env[varName]);

if (missingRailwayVars.length > 0) {
    console.error('Missing required Railway environment variables:', missingRailwayVars.join(', '));
    console.error('Please configure these in your Railway project settings.');
    process.exit(1);
}

if (missingDotEnvVars.length > 0) {
    console.error('Missing required .env variables:', missingDotEnvVars.join(', '));
    console.error('Please configure these in your .env file.');
    process.exit(1);
}

// Create Discord client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Initialize collections
client.commands = new Collection();

// Global services
let scheduler;
let userTracker;

/**
 * Load commands from the commands directory
 */
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if (command.name && typeof command.execute === 'function') {
                client.commands.set(command.name.toLowerCase(), command);
                console.log(`Loaded command: ${command.name}`);
            } else {
                console.warn(`Command file ${file} is missing required name or execute property`);
            }
        } catch (error) {
            console.error(`Error loading command file ${file}:`, error);
        }
    }
}

/**
 * Initialize MongoDB connection
 */
async function initializeMongoDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw error;
    }
}

/**
 * Initialize all required services
 */
async function initializeServices() {
    try {
        // Initialize user tracker
        userTracker = new UserTracker();
        await userTracker.initialize();
        console.log('User tracker initialized');

        // Initialize scheduler and achievement service
        scheduler = new Scheduler(client);
        await scheduler.initialize();
        scheduler.startAll();
        console.log('Scheduler and achievement service initialized');

        // Store services on client for global access
        client.userTracker = userTracker;
        client.scheduler = scheduler;

        // Initialize games and users
        await initializeUsers();
        console.log('Users initialized');

        await initializeGames();
        console.log('Games initialized');
    } catch (error) {
        console.error('Error initializing services:', error);
        throw error;
    }
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
    console.log('Shutting down gracefully...');
    
    try {
        if (scheduler) {
            await scheduler.shutdown();
            console.log('Scheduler shut down');
        }

        await mongoose.connection.close();
        console.log('MongoDB connection closed');

        // Destroy the Discord client
        if (client) {
            client.destroy();
            console.log('Discord client destroyed');
        }
    } catch (error) {
        console.error('Error during shutdown:', error);
    } finally {
        process.exit(0);
    }
}

/**
 * Main initialization function
 */
async function main() {
    try {
        // Load commands first
        await loadCommands();
        console.log('Commands loaded');

        // Connect to MongoDB
        await initializeMongoDB();

        // Login to Discord
        await client.login(process.env.DISCORD_TOKEN);
        console.log(`Logged in as ${client.user.tag}`);

        // Wait for client to be ready
        await new Promise((resolve) => {
            if (client.isReady()) resolve();
            else client.once('ready', resolve);
        });
        console.log('Discord client is ready');

        // Initialize services after client is ready
        await initializeServices();
        console.log('All services initialized');

        // Update leaderboard caches immediately on startup
        await leaderboardService.updateAllLeaderboards()
            .then(() => console.log('Leaderboard caches updated successfully on startup.'))
            .catch(err => console.error('Error updating leaderboard caches on startup:', err));

        // Schedule periodic leaderboard cache refresh every 5 minutes.
        setInterval(() => {
            leaderboardService.updateAllLeaderboards()
                .then(() => console.log('Leaderboard caches refreshed successfully.'))
                .catch(err => console.error('Error refreshing leaderboard caches:', err));
        }, 5 * 60 * 1000);

    } catch (error) {
        console.error('Error during startup:', error);
        process.exit(1);
    }
}

// Event Handlers

// Ready event
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('Achievement Feed Channel:', process.env.ACHIEVEMENT_FEED_CHANNEL);
    console.log('Registration Channel:', process.env.REGISTRATION_CHANNEL_ID);
});

// Message handler
client.on(Events.MessageCreate, async message => {
    try {
        // Ignore messages from bots
        if (message.author.bot) return;

        // Process RetroAchievements profile links if in registration channel
        if (message.channel.id === process.env.REGISTRATION_CHANNEL_ID) {
            await userTracker.processMessage(message);
            return;
        }

        // Handle commands with prefix "!"
        if (message.content.startsWith('!')) {
            const args = message.content.slice(1).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            
            const command = client.commands.get(commandName);
            if (!command) return;

            try {
                await command.execute(message, args);
            } catch (error) {
                console.error('Error executing command:', error);
                await message.reply('There was an error executing that command.');
            }
        }
    } catch (error) {
        console.error('Error in message handler:', error);
    }
});

// Error handlers
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    shutdown();
});

// Handle termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the bot
main().catch(error => {
    console.error('Fatal error during startup:', error);
    process.exit(1);
});
