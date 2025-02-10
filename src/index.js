// File: src/index.js
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
const MigrationService = require('./services/migrationService');

// Load environment variables
require('dotenv').config();

// Required environment variables with descriptions
const requiredEnvVars = {
    DISCORD_TOKEN: 'Discord bot token for authentication',
    MONGODB_URI: 'MongoDB connection string',
    RA_USERNAME: 'RetroAchievements API username',
    RA_API_KEY: 'RetroAchievements API key',
    ACHIEVEMENT_FEED_CHANNEL: 'Channel ID for achievement announcements',
    REGISTRATION_CHANNEL_ID: 'Channel ID for user registration',
    CLIENT_ID: 'Discord application client ID'
};

// Verify all required environment variables
const missingVars = Object.entries(requiredEnvVars)
    .filter(([key]) => !process.env[key])
    .map(([key, desc]) => `${key}: ${desc}`);

if (missingVars.length > 0) {
    console.error('Missing required environment variables:\n', missingVars.join('\n'));
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
let migrationService;

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
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
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
        // Run migrations first
        migrationService = new MigrationService();
        await migrationService.runMigrations();
        console.log('Migrations completed');

        // Initialize user tracker
        userTracker = new UserTracker();
        await userTracker.initialize();
        console.log('User tracker initialized');

        // Initialize scheduler and achievement service
        scheduler = new Scheduler(client);
        await scheduler.initialize();
        console.log('Scheduler and achievement service initialized');

        // Store services on client for global access
        client.userTracker = userTracker;
        client.scheduler = scheduler;
        client.achievementService = scheduler.achievementService;

        // Initialize games and users
        await initializeUsers();
        console.log('Users initialized');

        await initializeGames();
        console.log('Games initialized');

        // Start scheduled jobs
        scheduler.startAll();
        console.log('Scheduled jobs started');

    } catch (error) {
        console.error('Error initializing services:', error);
        throw error;
    }
}

/**
 * Display service status
 */
function displayStatus() {
    const status = {
        client: client.isReady(),
        mongodb: mongoose.connection.readyState === 1,
        services: {
            userTracker: userTracker?.initialized || false,
            scheduler: scheduler?.initialized || false,
            achievementService: scheduler?.achievementService?.initialized || false
        },
        stats: scheduler?.getStats() || {}
    };
    console.log('Current System Status:', status);
    return status;
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

        // Display initial status
        displayStatus();

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

        // Handle commands
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

// Interaction handler for slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Error executing interaction:', error);
        const replyContent = {
            content: 'There was an error executing this command.',
            ephemeral: true
        };
        
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(replyContent);
        } else {
            await interaction.reply(replyContent);
        }
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
