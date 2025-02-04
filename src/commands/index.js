// File: src/commands/index.js
const fs = require('node:fs');
const path = require('node:path');

const loadCommands = (client) => {
    const commandsPath = path.join(__dirname);
    const commandFiles = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }
};

module.exports = { loadCommands };
