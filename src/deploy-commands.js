import { REST, Routes } from 'discord.js';
import { config } from './config/config.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = [];
const commandsPath = join(__dirname, 'commands');

// Load admin commands
const adminCommandsPath = join(commandsPath, 'admin');
const adminCommandFiles = readdirSync(adminCommandsPath).filter(file => file.endsWith('.js'));

for (const file of adminCommandFiles) {
    const filePath = join(adminCommandsPath, file);
    const command = await import(`file://${filePath}`);
    if ('data' in command.default && 'execute' in command.default) {
        commands.push(command.default.data.toJSON());
    }
}

// Load user commands
const userCommandsPath = join(commandsPath, 'user');
const userCommandFiles = readdirSync(userCommandsPath).filter(file => file.endsWith('.js'));

for (const file of userCommandFiles) {
    const filePath = join(userCommandsPath, file);
    const command = await import(`file://${filePath}`);
    if ('data' in command.default && 'execute' in command.default) {
        commands.push(command.default.data.toJSON());
    }
}

// Construct and prepare REST module
const rest = new REST().setToken(config.discord.token);

// Deploy commands
try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // The put method is used to fully refresh all commands
    const data = await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
} catch (error) {
    console.error(error);
}
