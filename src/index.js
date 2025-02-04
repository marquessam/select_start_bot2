// File: src/index.js
require('dotenv').config();
const { Client, Events, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const { initializeGames } = require('./utils/initializeGames');
const { initializeUsers } = require('./utils/initializeUsers');
const scheduler = require('./services/scheduler');
const achievementTracker = require('./services/achievementTracker');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Connect to MongoDB and initialize data
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB');
        
        // Initialize users and games
        await initializeUsers();
        console.log('Users initialized');
        
        await initializeGames();
        console.log('Games initialized');

        // Do an initial achievement check
        console.log('Starting initial achievement check...');
        await achievementTracker.checkAllUsers();
        console.log('Initial achievement check completed');

        // Start the scheduler
        scheduler.startAll();
        console.log('Scheduler started');
    })
    .catch(err => console.error('Error during startup:', err));

// Event handler for when the bot is ready
client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Message handler for ! commands
client.on(Events.MessageCreate, async message => {
    console.log('Message received:', message.content);
    
    if (!message.content.startsWith('!') || message.author.bot) {
        return;
    }

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    console.log('Command received:', commandName, 'with args:', args);

    // Get command file
    try {
        const commandFile = require(`./commands/${commandName}.js`);
        console.log('Command file found:', commandFile);
        await commandFile.execute(message, args);
    } catch (error) {
        console.error('Error executing command:', error);
        message.reply('There was an error executing that command!');
    }
});
// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    scheduler.stopAll();
    await mongoose.connection.close();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
