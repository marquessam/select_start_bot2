// File: src/deploy-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
console.log('Starting command registration process...');

// Log environment variables (excluding sensitive data)
console.log('CLIENT_ID exists:', !!process.env.CLIENT_ID);
console.log('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);

// Grab all command files
const commandsPath = path.join(__dirname, 'commands');
console.log('Commands directory:', commandsPath);

const commandFiles = fs.readdirSync(commandsPath).filter(file => 
    file.endsWith('.js') && 
    file !== 'index.js'
);
console.log('Found command files:', commandFiles);

for (const file of commandFiles) {
    try {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if (command.data && typeof command.data.toJSON === 'function') {
            commands.push(command.data.toJSON());
            console.log(`Successfully loaded command: ${file}`);
        } else {
            console.log(`Command ${file} is missing required data property`);
        }
    } catch (error) {
        console.error(`Error loading command ${file}:`, error);
    }
}

console.log('Commands to register:', commands);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        console.log('Registered commands:', data.map(cmd => cmd.name));
    } catch (error) {
        console.error('Error deploying commands:', error);
        console.error('Error details:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
})();
