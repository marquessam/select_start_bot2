// File: src/index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { initializeGames } = require('./utils/initializeGames');
const { initializeUsers } = require('./utils/initializeUsers');
const Scheduler = require('./services/scheduler');
const achievementTracker = require('./services/achievementTracker');

// Create a new Discord client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

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

// Create scheduler instance
const scheduler = new Scheduler(client);

/**
 * Graceful shutdown handler
 */
async function shutdown() {
    console.log('Shutting down gracefully...');
    scheduler.stopAll();
    try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
    } catch (error) {
        console.error('Error closing MongoDB connection:', error);
    }
    process.exit(0);
}

/**
 * Main initialization function
 */
async function main() {
    try {
        // First, login to Discord
        console.log('Logging into Discord...');
        await client.login(process.env.DISCORD_TOKEN);
        console.log(`Logged in as ${client.user.tag}`);

        // Wait for client to be ready
        await new Promise((resolve) => {
            if (client.isReady()) resolve();
            else client.once('ready', resolve);
        });
        console.log('Discord client is ready');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Initialize users and games
        await initializeUsers();
        console.log('Users initialized');

        await initializeGames();
        console.log('Games initialized');

        // Initialize scheduler (which will initialize achievement feed)
        await scheduler.initialize();
        scheduler.startAll();
        console.log('Scheduler started');

        // Perform initial achievement check
        console.log('Starting initial achievement check...');
        await achievementTracker.checkAllUsers();
        console.log('Initial achievement check completed');

    } catch (error) {
        console.error('Error during startup:', error);
        process.exit(1);
    }
}

// Message handler
client.on(Events.MessageCreate, async message => {
    // Ignore messages that don't start with prefix or are from bots
    if (!message.content.startsWith('!') || message.author.bot) return;

    // Parse command and arguments
    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    console.log(`Command received: ${commandName} with args: ${args.join(' ')}`);

    // Get command
    const command = client.commands.get(commandName);
    if (!command) {
        console.log(`Command ${commandName} not found`);
        return;
    }

    // Execute command
    try {
        await command.execute(message, args);
    } catch (error) {
        console.error('Error executing command:', error);
        message.reply('There was an error executing that command!');
    }
});

// Error handlers
client.on(Events.Error, error => {
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
main();
