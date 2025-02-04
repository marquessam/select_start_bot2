// File: src/index.js
require('dotenv').config();
const { Client, Events, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const { initializeGames } = require('./utils/initializeGames');
const { initializeUsers } = require('./utils/initializeUsers');

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
        
        // Initialize users first
        await initializeUsers();
        console.log('Users initialized');
        
        // Then initialize games
        await initializeGames();
        console.log('Games initialized');
    })
    .catch(err => console.error('Error during startup:', err));

// Event handler for when the bot is ready
client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Message handler for ! commands
client.on(Events.MessageCreate, async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'ping') {
        message.reply('Pong!');
    }
    // Add other commands here
});

client.login(process.env.DISCORD_TOKEN);
