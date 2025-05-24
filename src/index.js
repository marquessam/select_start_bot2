// src/index.js
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { config, validateConfig } from './config/config.js';
import { connectDB } from './models/index.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import statsUpdateService from './services/statsUpdateService.js';
import achievementFeedService from './services/achievementFeedService.js';
import monthlyTasksService from './services/monthlyTasksService.js';
import arcadeService from './services/arcadeService.js';
import leaderboardFeedService from './services/leaderboardFeedService.js';
import arcadeAlertService from './services/arcadeAlertService.js';
import arcadeFeedService from './services/arcadeFeedService.js';
import membershipCheckService from './services/membershipCheckService.js';
import arenaService from './services/arenaService.js';
import gameAwardService from './services/gameAwardService.js';
import { User } from './models/User.js';

// Import nomination and restriction handlers
import { 
    handleNominationButtonInteraction, 
    handleNominationModalSubmit, 
    handleNominationSelectMenu 
} from './handlers/nominationHandlers.js';
import { 
    handleRestrictionButtonInteraction, 
    handleRestrictionModalSubmit, 
    handleRestrictionSelectMenu 
} from './handlers/restrictionHandlers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Validate environment variables
validateConfig();

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// Initialize commands collection
client.commands = new Collection();

// Load commands
const loadCommands = async () => {
    const commandsPath = join(__dirname, 'commands');

    // Load admin commands
    const adminCommandsPath = join(commandsPath, 'admin');
    const adminCommandFiles = readdirSync(adminCommandsPath).filter(file => file.endsWith('.js'));

    for (const file of adminCommandFiles) {
        const filePath = join(adminCommandsPath, file);
        const command = await import(`file://${filePath}`);
        if ('data' in command.default && 'execute' in command.default) {
            client.commands.set(command.default.data.name, command.default);
        }
    }

    // Load user commands
    const userCommandsPath = join(commandsPath, 'user');
    const userCommandFiles = readdirSync(userCommandsPath).filter(file => file.endsWith('.js'));

    for (const file of userCommandFiles) {
        const filePath = join(userCommandsPath, file);
        const command = await import(`file://${filePath}`);
        if ('data' in command.default && 'execute' in command.default) {
            client.commands.set(command.default.data.name, command.default);
        }
    }
};

// Handle slash command interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Error executing command:', error);
        const errorMessage = {
            content: 'There was an error executing this command.',
            ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

// Handle button interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    
    try {
        // Check if this is a nomination-related button
        if (interaction.customId.startsWith('nominate_')) {
            await handleNominationButtonInteraction(interaction);
            return;
        }
        
        // Check if this is a restriction-related button
        if (interaction.customId.startsWith('restrictions_')) {
            await handleRestrictionButtonInteraction(interaction);
            return;
        }
        
        // Handle other button interactions
        const commandName = interaction.customId.split('_')[0];
        const command = client.commands.get(commandName);
        
        if (command && typeof command.handleButtonInteraction === 'function') {
            await command.handleButtonInteraction(interaction);
        } else {
            console.log(`No button handler found for customId: ${interaction.customId}`);
        }
    } catch (error) {
        console.error('Error handling button interaction:', error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error processing this button.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error processing this button.', ephemeral: true });
            }
        } catch (replyError) {
            console.error('Error sending error response:', replyError);
        }
    }
});

// Handle select menu interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    
    try {
        // Check if this is a nomination-related select menu
        if (interaction.customId.startsWith('nominate_')) {
            await handleNominationSelectMenu(interaction);
            return;
        }
        
        // Check if this is a restriction-related select menu
        if (interaction.customId.startsWith('restrictions_')) {
            await handleRestrictionSelectMenu(interaction);
            return;
        }
        
        // Handle other select menu interactions
        const commandName = interaction.customId.split('_')[0];
        const command = client.commands.get(commandName);
        
        if (command && typeof command.handleSelectMenuInteraction === 'function') {
            await command.handleSelectMenuInteraction(interaction);
        } else {
            console.log(`No select menu handler found for customId: ${interaction.customId}`);
        }
    } catch (error) {
        console.error('Error handling select menu interaction:', error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error processing this selection.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error processing this selection.', ephemeral: true });
            }
        } catch (replyError) {
            console.error('Error sending error response:', replyError);
        }
    }
});

// Handle modal submit interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;
    
    try {
        // Check if this is a nomination-related modal
        if (interaction.customId.startsWith('nomination_')) {
            await handleNominationModalSubmit(interaction);
            return;
        }
        
        // Check if this is a restriction-related modal
        if (interaction.customId.startsWith('restrictions_')) {
            await handleRestrictionModalSubmit(interaction);
            return;
        }
        
        // Handle other modal interactions
        const commandName = interaction.customId.split('_')[0];
        const command = client.commands.get(commandName);
        
        if (command && typeof command.handleModalSubmit === 'function') {
            await command.handleModalSubmit(interaction);
        } else {
            console.log(`No modal handler found for customId: ${interaction.customId}`);
        }
    } catch (error) {
        console.error('Error handling modal submission:', error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error processing your submission.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error processing your submission.', ephemeral: true });
            }
        } catch (replyError) {
            console.error('Error sending error response:', replyError);
        }
    }
});

// Function to handle monthly GP allowance reset
async function handleMonthlyGpAllowance() {
    try {
        const now = new Date();
        // Only run on the 1st day of each month
        if (now.getDate() === 1) {
            console.log('Starting monthly GP allowance process...');
            
            // Reset lastMonthlyGpClaim for all users
            await User.updateMany(
                {}, 
                { $set: { lastMonthlyGpClaim: null } }
            );
            
            console.log('Reset monthly GP claim status for all users');
            
            // Optionally send a notification to the Arena channel
            try {
                const arenaChannel = await client.channels.fetch(config.discord.arenaChannelId);
                if (arenaChannel) {
                    await arenaChannel.send({
                        content: 
                            `# 🎉 Monthly GP Allowance Reset!\n` +
                            `It's a new month, and your GP allowance has been reset!\n` +
                            `Use \`/arena claim\` to claim your 1,000 GP for this month.\n\n` +
                            `Don't forget to check the Arena leaderboard - who will be on top this month?`
                    });
                }
            } catch (notifyError) {
                console.error('Error sending GP reset notification:', notifyError);
            }
        }
    } catch (error) {
        console.error('Error handling monthly GP allowance:', error);
    }
}

// Function to handle weekly comprehensive yearly sync
async function handleWeeklyComprehensiveSync() {
    try {
        console.log('🔄 Starting weekly comprehensive yearly sync...');
        
        const currentYear = new Date().getFullYear();
        
        // Find the yearlyboard command
        const yearlyboardCommand = client.commands.get('yearlyboard');
        if (!yearlyboardCommand) {
            console.error('Yearlyboard command not found for weekly sync');
            return;
        }
        
        // Create a mock interaction for the comprehensive sync
        const mockInteraction = {
            deferReply: async () => {
                console.log('Weekly sync: Deferring reply...');
            },
            editReply: async (message) => {
                if (typeof message === 'string') {
                    console.log('Weekly sync progress:', message);
                } else if (message.embeds && message.embeds.length > 0) {
                    const embed = message.embeds[0];
                    if (embed.title) {
                        console.log(`Weekly sync: ${embed.title}`);
                        if (embed.description) {
                            console.log(`Weekly sync: ${embed.description}`);
                        }
                    }
                }
            },
            member: { 
                roles: { 
                    cache: { 
                        has: () => true // Mock admin permissions
                    } 
                } 
            },
            options: {
                getInteger: (option) => {
                    if (option === 'year') return currentYear;
                    return null;
                },
                getBoolean: (option) => {
                    if (option === 'sync') return true; // Enable comprehensive sync
                    if (option === 'debug') return false;
                    return false;
                },
                getString: () => null // No specific username
            }
        };
        
        // Execute the comprehensive sync
        await yearlyboardCommand.execute(mockInteraction);
        
        console.log('✅ Weekly comprehensive yearly sync completed successfully');
        
        // Optional: Send notification to admin log channel
        try {
            const adminLogChannel = await client.channels.fetch(config.discord.adminLogChannelId);
            if (adminLogChannel) {
                await adminLogChannel.send({
                    content: `✅ **Weekly Comprehensive Sync Complete**\n` +
                             `Updated all user data for ${currentYear} yearly leaderboard.\n` +
                             `Next sync: ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}`
                });
            }
        } catch (notifyError) {
            console.error('Error sending weekly sync notification:', notifyError);
        }
        
    } catch (error) {
        console.error('❌ Error in weekly comprehensive sync:', error);
        
        // Send error notification to admin log
        try {
            const adminLogChannel = await client.channels.fetch(config.discord.adminLogChannelId);
            if (adminLogChannel) {
                await adminLogChannel.send({
                    content: `❌ **Weekly Comprehensive Sync Failed**\n` +
                             `Error: ${error.message}\n` +
                             `Please check logs and consider running manual sync.`
                });
            }
        } catch (notifyError) {
            console.error('Error sending sync error notification:', notifyError);
        }
    }
}

// Handle ready event
client.once(Events.ClientReady, async () => {
    try {
        console.log(`Logged in as ${client.user.tag}`);

        // Connect to MongoDB
        await connectDB();
        console.log('Connected to MongoDB');

        // Load commands
        await loadCommands();
        console.log('Commands loaded');

        // Set client for services
        achievementFeedService.setClient(client);
        monthlyTasksService.setClient(client);
        arcadeService.setClient(client);
        leaderboardFeedService.setClient(client);
        arcadeAlertService.setClient(client);
        arcadeFeedService.setClient(client);
        membershipCheckService.setClient(client);
        arenaService.setClient(client);
        gameAwardService.setClient(client);

        // Schedule stats updates every 30 minutes
        cron.schedule('*/30 * * * *', () => {
            console.log('Running scheduled stats update...');
            statsUpdateService.start().catch(error => {
                console.error('Error in scheduled stats update:', error);
            });
        });

        // Schedule achievement feed checks every 15 minutes
        cron.schedule('*/15 * * * *', () => {
            console.log('Running achievement feed check...');
            achievementFeedService.start().catch(error => {
                console.error('Error in achievement feed check:', error);
            });
        });

        // Schedule weekly comprehensive yearly sync (Sundays at 3:00 AM)
        cron.schedule('0 3 * * 0', () => {
            console.log('Running weekly comprehensive yearly sync...');
            handleWeeklyComprehensiveSync().catch(error => {
                console.error('Error in weekly comprehensive yearly sync:', error);
            });
        });

        // Schedule monthly tasks on the 1st of each month at 00:01
        cron.schedule('1 0 1 * *', () => {
            console.log('Running monthly tasks...');
            monthlyTasksService.clearAllNominations().catch(error => {
                console.error('Error clearing nominations:', error);
            });
            
            // Add the GP allowance reset to monthly tasks
            handleMonthlyGpAllowance().catch(error => {
                console.error('Error in monthly GP allowance reset:', error);
            });
        });

        // Schedule arcade service to run daily at 00:15 (just after midnight)
        // This will check for completed racing challenges and award points
        cron.schedule('15 0 * * *', () => {
            console.log('Running scheduled arcade service...');
            arcadeService.start().catch(error => {
                console.error('Error in scheduled arcade service:', error);
            });
        });

        // Schedule leaderboard feed updates every 15 minutes
        cron.schedule('*/15 * * * *', () => {
            console.log('Running leaderboard feed update...');
            leaderboardFeedService.updateLeaderboard().catch(error => {
                console.error('Error in leaderboard feed update:', error);
            });
        });

        // Schedule arcade alert checks every hour
        cron.schedule('0 * * * *', () => { // Runs at the start of every hour
            console.log('Running arcade alerts check...');
            arcadeAlertService.checkForRankChanges(true).catch(error => {
                console.error('Error in arcade alerts check:', error);
            });
        });

        // Schedule arcade feed updates every hour
        cron.schedule('10 * * * *', () => { // Runs at 10 minutes past every hour
            console.log('Running arcade feed update...');
            arcadeFeedService.updateArcadeFeed().catch(error => {
                console.error('Error in arcade feed update:', error);
            });
        });

        // Schedule arena feed updates every hour
        cron.schedule('15 * * * *', () => { // Runs at 15 minutes past every hour
            console.log('Running arena feed update...');
            arenaService.updateArenaFeeds().catch(error => {
                console.error('Error in arena feed update:', error);
            });
        });

        // Schedule completed arena challenges check every hour at 30 minutes past
        cron.schedule('30 * * * *', () => {
            console.log('Running arena completed challenges check...');
            arenaService.checkCompletedChallenges().catch(error => {
                console.error('Error in arena completed challenges check:', error);
            });
        });

        // Schedule arena timeout checks every hour at 45 minutes past
        cron.schedule('45 * * * *', () => {
            console.log('Running arena timeout check...');
            arenaService.checkAndProcessTimeouts().catch(error => {
                console.error('Error in arena timeout check:', error);
            });
        });

        // Schedule membership check daily at 3:00 AM
        cron.schedule('0 3 * * *', () => {
            console.log('Running scheduled membership check...');
            membershipCheckService.checkMemberships().catch(error => {
                console.error('Error in scheduled membership check:', error);
            });
        });

        // Schedule automated monthly leaderboard finalization
        // Run at 00:20 on the 1st of each month (after other monthly tasks)
        cron.schedule('20 0 1 * *', async () => {
            console.log('Finalizing previous month\'s leaderboard...');
            try {
                // Find the leaderboard command
                const leaderboardCommand = client.commands.get('leaderboard');
                if (leaderboardCommand) {
                    // Create a mock interaction for the finalize function
                    const mockInteraction = {
                        deferReply: async () => {},
                        editReply: async (message) => { 
                            if (typeof message === 'string') {
                                console.log('Finalization result:', message);
                            } else {
                                console.log('Finalization completed successfully');
                            }
                        },
                        fetchReply: async () => ({ 
                            createMessageComponentCollector: () => ({
                                on: () => {},
                                stop: () => {}
                            })
                        }),
                        guild: client.guilds.cache.first(),
                        member: { permissions: { has: () => true } }, // Mock admin permissions
                        options: { getBoolean: () => true }  // Mock finalize:true parameter
                    };
                    
                    // Execute the finalization function directly
                    await leaderboardCommand.finalizePreviousMonth(mockInteraction);
                }
            } catch (error) {
                console.error('Error in leaderboard finalization:', error);
            }
        });

        // Check if we need to finalize the previous month's leaderboard on startup
        // Only run the check if it's the first few days of the month (1-3)
        const now = new Date();
        const currentDay = now.getDate();
        if (currentDay <= 3) {
            console.log('Checking if previous month\'s leaderboard needs to be finalized...');
            try {
                const leaderboardCommand = client.commands.get('leaderboard');
                if (leaderboardCommand) {
                    // Create a mock interaction just like above
                    const mockInteraction = {
                        deferReply: async () => {},
                        editReply: async (message) => { 
                            if (typeof message === 'string') {
                                console.log('Finalization check result:', message);
                            } else {
                                console.log('Finalization check completed');
                            }
                        },
                        fetchReply: async () => ({ 
                            createMessageComponentCollector: () => ({
                                on: () => {},
                                stop: () => {}
                            })
                        }),
                        guild: client.guilds.cache.first(),
                        member: { permissions: { has: () => true } },
                        options: { getBoolean: () => true }
                    };
                    
                    await leaderboardCommand.finalizePreviousMonth(mockInteraction);
                }
            } catch (error) {
                console.error('Error in startup leaderboard finalization check:', error);
            }
        }

        // Schedule voting poll creation (runs at midnight UTC on days that are 8 days before end of month)
        cron.schedule('0 0 22-31 * *', async () => {
            const today = new Date();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            
            // Only run if it's exactly 8 days before the end of the month
            if (today.getDate() === daysInMonth - 8) {
                console.log('Running scheduled voting poll creation...');
                monthlyTasksService.createVotingPoll().catch(error => {
                    console.error('Error creating voting poll:', error);
                });
            }
        });

        // Schedule vote counting (runs at midnight UTC on days that are 1 day before end of month)
        cron.schedule('0 0 28-31 * *', async () => {
            const today = new Date();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            
            // Only run if it's exactly 1 day before the end of the month
            if (today.getDate() === daysInMonth - 1) {
                console.log('Running scheduled vote counting...');
                monthlyTasksService.countAndAnnounceVotes().catch(error => {
                    console.error('Error counting votes:', error);
                });
            }
        });

        // Run initial stats update
        await statsUpdateService.start();
        
        // Run initial achievement feed check
        await achievementFeedService.start();
        
        // Run initial arcade service check
        await arcadeService.start();
        
        // Start the leaderboard feed service
        await leaderboardFeedService.start();
        
        // Start the arcade alert service
        await arcadeAlertService.start();
        
        // Start the arcade feed service
        await arcadeFeedService.start();
        
        // Start the membership check service
        await membershipCheckService.start();
        
        // Start the arena service
        await arenaService.start();
        
        // Initialize the game award service
        await gameAwardService.initialize();
        console.log('Game Award Service initialized');
        
        // Check if monthly GP allowance should be handled on startup
        await handleMonthlyGpAllowance();

        // Check for any arena timeouts that may have occurred while the bot was offline
        console.log('Checking for any arena timeouts that occurred while offline...');
        arenaService.checkAndProcessTimeouts().catch(error => {
            console.error('Error in startup timeout check:', error);
        });

        console.log('Bot is ready!');
        console.log('📅 Scheduled tasks:');
        console.log('  • Stats updates: Every 30 minutes');
        console.log('  • Achievement feeds: Every 15 minutes');
        console.log('  • Weekly comprehensive yearly sync: Sundays at 3:00 AM');
        console.log('  • Monthly tasks: 1st of each month');
        console.log('  • Arcade service: Daily at 12:15 AM');
        console.log('  • Arena feeds: Hourly at 15 minutes past');
        console.log('  • Arena completed challenges: Hourly at 30 minutes past');
        console.log('  • Arena timeouts: Hourly at 45 minutes past');
        console.log('  • Various other feeds: Hourly');
        
    } catch (error) {
        console.error('Error during initialization:', error);
        process.exit(1);
    }
});

// Handle errors
client.on(Events.Error, error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(config.discord.token).catch(error => {
    console.error('Error logging in to Discord:', error);
    process.exit(1);
});
