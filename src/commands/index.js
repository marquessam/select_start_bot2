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

    // Check if the command file exports the required properties.
    if (!command.data || !command.data.name || typeof command.execute !== 'function') {
      console.error(`The command at ${filePath} is missing a required "data" or "execute" property.`);
      continue;
    }

    // Store the command in the client's commands collection.
    client.commands.set(command.data.name, command);
    console.log(`Loaded command: ${command.data.name}`);
  }
};

module.exports = { loadCommands };
