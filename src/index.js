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

// Create a new Discord client with the required intents.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Dynamically load command files from the "commands" directory.
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if (command.name && typeof command.execute === 'function') {
    client.commands.set(command.name.toLowerCase(), command);
    console.log(`Loaded command: ${command.name}`);
  } else {
    console.warn(`The command file ${file} is missing a required "name" or "execute" property.`);
  }
}

// Create a scheduler instance with the Discord client.
const scheduler = new Scheduler(client);

/**
 * Graceful shutdown: stops the scheduler, closes the MongoDB connection, and exits.
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
 * The main function that initializes everything.
 */
async function main() {
  try {
    // Connect to MongoDB.
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Initialize users and games.
    await initializeUsers();
    console.log('Users initialized');

    await initializeGames();
    console.log('Games initialized');

    // Perform an initial achievement check.
    console.log('Starting initial achievement check...');
    await achievementTracker.checkAllUsers();
    console.log('Initial achievement check completed');

    // Initialize and start the scheduler.
    await scheduler.initialize();
    scheduler.startAll();
    console.log('Scheduler started');

    // Login to Discord.
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`Logged in as ${client.user.tag}`);
  } catch (error) {
    console.error('Error during startup:', error);
    process.exit(1);
  }
}

// Event handler: when a message is created.
client.on(Events.MessageCreate, async message => {
  // Ignore messages that don't start with the prefix or are from bots.
  if (!message.content.startsWith('!') || message.author.bot) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  
  console.log(`Command received: ${commandName} with args: ${args.join(' ')}`);

  const command = client.commands.get(commandName);
  if (!command) {
    console.log(`Command ${commandName} not found.`);
    return;
  }

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error('Error executing command:', error);
    message.reply('There was an error executing that command!');
  }
});

// Log client errors.
client.on(Events.Error, error => {
  console.error('Discord client error:', error);
});

// Global error handling.
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  shutdown();
});

// Listen for termination signals.
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the bot.
main();
