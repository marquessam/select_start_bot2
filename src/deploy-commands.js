// File: src/commands/deployCommands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
// Grab all command files
const commandFiles = fs.readdirSync(__dirname).filter(file => 
    file.endsWith('.js') && 
    file !== 'deployCommands.js' && 
    file !== 'index.js'
);

for (const file of commandFiles) {
    try {
        const command = require(`./${file}`);
        // Check if command has the required data property
        if (command.data && typeof command.data.toJSON === 'function') {
            commands.push(command.data.toJSON());
            console.log(`Loaded command: ${file}`);
        } else {
            console.log(`Command ${file} is missing required data property`);
        }
    } catch (error) {
        console.error(`Error loading command ${file}:`, error);
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
console.log('Commands to register:', commands);

// Deploy commands
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
})();
