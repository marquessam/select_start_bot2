// src/deploy-commands.js - DEPLOYMENT-SAFE VERSION with forced exit
import { REST, Routes } from 'discord.js';
import { config, validateConfig } from './config/config.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// DEPLOYMENT SAFETY: Set aggressive timeout for entire deployment process
const DEPLOYMENT_TIMEOUT = 120000; // 2 minutes max
const COMMAND_LOAD_TIMEOUT = 30000; // 30 seconds for loading commands
const DISCORD_API_TIMEOUT = 60000; // 1 minute for Discord API

// DEPLOYMENT SAFETY: Force exit timer
const forceExitTimer = setTimeout(() => {
    console.error('❌ Deployment process timed out after 2 minutes - forcing exit');
    process.exit(1);
}, DEPLOYMENT_TIMEOUT);

// DEPLOYMENT SAFETY: Graceful shutdown handler
let isShuttingDown = false;
const gracefulShutdown = (code = 0, reason = 'normal') => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`🔄 Shutting down deployment process (${reason})`);
    clearTimeout(forceExitTimer);
    
    // Close any potential hanging connections
    if (global.gc) {
        global.gc();
    }
    
    setTimeout(() => {
        console.log(`✅ Deployment process exiting with code ${code}`);
        process.exit(code);
    }, 100);
};

// DEPLOYMENT SAFETY: Handle process signals
process.on('SIGINT', () => gracefulShutdown(0, 'SIGINT'));
process.on('SIGTERM', () => gracefulShutdown(0, 'SIGTERM'));
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception in deployment:', error);
    gracefulShutdown(1, 'uncaught exception');
});
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection in deployment:', error);
    gracefulShutdown(1, 'unhandled rejection');
});

/**
 * DEPLOYMENT SAFETY: Load commands with timeout protection
 */
async function loadCommandsWithTimeout() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Command loading timed out'));
        }, COMMAND_LOAD_TIMEOUT);

        loadCommands()
            .then((commands) => {
                clearTimeout(timeout);
                resolve(commands);
            })
            .catch((error) => {
                clearTimeout(timeout);
                reject(error);
            });
    });
}

/**
 * DEPLOYMENT SAFETY: Load commands without initializing database-dependent services
 */
async function loadCommands() {
    const commands = [];
    const commandsPath = join(__dirname, 'commands');

    try {
        console.log('📦 Loading admin commands...');
        
        // Load admin commands
        const adminCommandsPath = join(commandsPath, 'admin');
        const adminCommandFiles = readdirSync(adminCommandsPath).filter(file => file.endsWith('.js'));

        for (const file of adminCommandFiles) {
            try {
                const filePath = join(adminCommandsPath, file);
                const command = await import(`file://${filePath}`);
                
                if ('data' in command.default && 'execute' in command.default) {
                    commands.push(command.default.data.toJSON());
                    console.log(`  ✅ Loaded admin command: ${command.default.data.name}`);
                } else {
                    console.warn(`  ⚠️ Skipped invalid admin command file: ${file}`);
                }
            } catch (error) {
                console.error(`  ❌ Failed to load admin command ${file}:`, error.message);
                // Continue loading other commands
            }
        }

        console.log('📦 Loading user commands...');
        
        // Load user commands
        const userCommandsPath = join(commandsPath, 'user');
        const userCommandFiles = readdirSync(userCommandsPath).filter(file => file.endsWith('.js'));

        for (const file of userCommandFiles) {
            try {
                const filePath = join(userCommandsPath, file);
                const command = await import(`file://${filePath}`);
                
                if ('data' in command.default && 'execute' in command.default) {
                    commands.push(command.default.data.toJSON());
                    console.log(`  ✅ Loaded user command: ${command.default.data.name}`);
                } else {
                    console.warn(`  ⚠️ Skipped invalid user command file: ${file}`);
                }
            } catch (error) {
                console.error(`  ❌ Failed to load user command ${file}:`, error.message);
                // Continue loading other commands
            }
        }

        console.log(`📦 Successfully loaded ${commands.length} commands total`);
        return commands;
        
    } catch (error) {
        console.error('❌ Error loading commands:', error);
        throw error;
    }
}

/**
 * DEPLOYMENT SAFETY: Deploy commands with timeout protection
 */
async function deployCommandsWithTimeout(commands) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Discord API deployment timed out'));
        }, DISCORD_API_TIMEOUT);

        deployToDiscord(commands)
            .then((result) => {
                clearTimeout(timeout);
                resolve(result);
            })
            .catch((error) => {
                clearTimeout(timeout);
                reject(error);
            });
    });
}

/**
 * DEPLOYMENT SAFETY: Deploy to Discord with retry logic
 */
async function deployToDiscord(commands) {
    const rest = new REST().setToken(config.discord.token);
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🚀 Deploying to Discord (attempt ${attempt}/${maxRetries})...`);
            console.log(`Started refreshing ${commands.length} application (/) commands.`);

            const data = await rest.put(
                Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
                { body: commands }
            );

            console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
            return data;
            
        } catch (error) {
            console.error(`❌ Deployment attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Wait before retry
            const retryDelay = attempt * 2000; // 2s, 4s, 6s
            console.log(`⏳ Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
}

/**
 * DEPLOYMENT SAFETY: Main deployment function with comprehensive error handling
 */
async function main() {
    try {
        console.log('🚀 Starting command deployment process...');
        
        // DEPLOYMENT SAFETY: Validate config first (but don't connect to database)
        console.log('🔧 Validating configuration...');
        validateConfig();
        console.log('✅ Configuration validation passed');

        // DEPLOYMENT SAFETY: Load commands with timeout
        console.log('📦 Loading commands with timeout protection...');
        const commands = await loadCommandsWithTimeout();
        
        if (commands.length === 0) {
            console.warn('⚠️ No commands found to deploy');
            gracefulShutdown(0, 'no commands');
            return;
        }

        // DEPLOYMENT SAFETY: Deploy to Discord with timeout
        console.log('🚀 Deploying commands to Discord with timeout protection...');
        await deployCommandsWithTimeout(commands);
        
        console.log('✅ Command deployment completed successfully');
        gracefulShutdown(0, 'success');
        
    } catch (error) {
        console.error('❌ Command deployment failed:', error);
        
        // Provide specific error guidance
        if (error.message.includes('Missing Access')) {
            console.error('💡 Bot may not have permission to manage application commands');
        } else if (error.message.includes('Invalid Token')) {
            console.error('💡 Check your Discord bot token in environment variables');
        } else if (error.message.includes('timeout')) {
            console.error('💡 Network or Discord API timeout - check connection');
        } else if (error.message.includes('rate limit')) {
            console.error('💡 Rate limited by Discord API - wait before retrying');
        }
        
        gracefulShutdown(1, 'error');
    }
}

// DEPLOYMENT SAFETY: Prevent database connections during command deployment
const originalConnect = globalThis.connectDB;
if (originalConnect) {
    globalThis.connectDB = () => {
        console.log('🚫 Database connection blocked during command deployment');
        return Promise.resolve({ connection: { host: 'blocked' } });
    };
}

// DEPLOYMENT SAFETY: Block mongoose if it gets imported
const originalMongoose = globalThis.mongoose;
if (originalMongoose) {
    globalThis.mongoose = {
        connect: () => {
            console.log('🚫 Mongoose connection blocked during command deployment');
            return Promise.resolve({ connection: { host: 'blocked' } });
        },
        set: () => {},
        connection: { readyState: 0 }
    };
}

// DEPLOYMENT SAFETY: Start deployment with timeout protection
console.log('🔧 Starting deployment with safety timeouts...');
console.log(`⏱️ Maximum deployment time: ${DEPLOYMENT_TIMEOUT / 1000} seconds`);

main().catch((error) => {
    console.error('❌ Fatal error in main deployment function:', error);
    gracefulShutdown(1, 'fatal error');
});

// DEPLOYMENT SAFETY: Additional fallback exit timer
setTimeout(() => {
    if (!isShuttingDown) {
        console.warn('⚠️ Deployment taking longer than expected, checking status...');
        
        setTimeout(() => {
            if (!isShuttingDown) {
                console.error('❌ Deployment process appears stuck - forcing exit');
                process.exit(1);
            }
        }, 30000); // Additional 30 seconds
    }
}, 90000); // 90 seconds warning
