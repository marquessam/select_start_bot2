// src/index.js - Complete updated version with all new features
import { Client, Collection, Events, GatewayIntentBits, EmbedBuilder } from 'discord.js';
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
import arenaAlertService from './services/arenaAlertService.js';
import arenaFeedService from './services/arenaFeedService.js';
import gameAwardService from './services/gameAwardService.js';
import monthlyGPService from './services/monthlyGPService.js';
import gachaMachine from './services/gachaMachine.js';
import combinationService from './services/combinationService.js';
import { User } from './models/User.js';
import { ArcadeBoard } from './models/ArcadeBoard.js';

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

// Import arena handlers
import { 
    handleArenaButtonInteraction, 
    handleArenaModalSubmit, 
    handleArenaSelectMenu 
} from './handlers/arenaHandlers.js';

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

// Handle button interactions - UPDATED VERSION with all new features
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    
    console.log('=== BUTTON INTERACTION RECEIVED ===');
    console.log('CustomId:', interaction.customId);
    console.log('User:', interaction.user.username);
    console.log('Channel:', interaction.channel?.name);
    
    try {
        // Check if this is a gacha-related button - HANDLE DIRECTLY HERE
        if (interaction.customId.startsWith('gacha_')) {
            console.log('Routing to gacha machine handler');
            
            await interaction.deferReply({ ephemeral: true });

            const user = await User.findOne({ discordId: interaction.user.id });
            if (!user) {
                return interaction.editReply({
                    content: '❌ You are not registered! Please ask an admin to register you first.',
                    ephemeral: true
                });
            }

            switch (interaction.customId) {
                case 'gacha_single_pull':
                    await gachaMachine.handlePull(interaction, user, 'single');
                    break;
                case 'gacha_multi_pull':
                    await gachaMachine.handlePull(interaction, user, 'multi');
                    break;
                case 'gacha_collection':
                    await gachaMachine.handleCollection(interaction, user);
                    break;
                default:
                    // Handle gacha admin buttons
                    const gachaAdminCommand = client.commands.get('gacha-admin');
                    if (gachaAdminCommand && typeof gachaAdminCommand.handleButtonInteraction === 'function') {
                        await gachaAdminCommand.handleButtonInteraction(interaction);
                    }
            }
            return;
        }

        // Check if this is a collection-related button - UPDATED ROUTING
        if (interaction.customId.startsWith('coll_')) {
            console.log('Routing to collection handler');
            const collectionCommand = client.commands.get('collection');
            if (collectionCommand && typeof collectionCommand.handleInteraction === 'function') {
                await collectionCommand.handleInteraction(interaction);
            } else {
                console.log('Collection command interaction handler not found');
                await interaction.reply({
                    content: '❌ Collection feature not available.',
                    ephemeral: true
                });
            }
            return;
        }
        
        // Check if this is a nomination-related button
        if (interaction.customId.startsWith('nominate_')) {
            console.log('Routing to nomination handler');
            await handleNominationButtonInteraction(interaction);
            return;
        }
        
        // Check if this is a restriction-related button
        if (interaction.customId.startsWith('restrictions_')) {
            console.log('Routing to restriction handler');
            await handleRestrictionButtonInteraction(interaction);
            return;
        }
        
        // Check if this is an arena-related button
        if (interaction.customId.startsWith('arena_') || interaction.customId.startsWith('admin_arena_')) {
            console.log('Routing to arena handler');
            await handleArenaButtonInteraction(interaction);
            return;
        }
        
        // Handle other button interactions by command
        console.log('Checking for command-based button handler');
        const commandName = interaction.customId.split('_')[0];
        const command = client.commands.get(commandName);
        
        if (command && typeof command.handleButtonInteraction === 'function') {
            console.log(`Found command handler for: ${commandName}`);
            await command.handleButtonInteraction(interaction);
        } else {
            console.log(`No button handler found for customId: ${interaction.customId}`);
            console.log(`Available commands:`, Array.from(client.commands.keys()));
        }
    } catch (error) {
        console.error('Error handling button interaction:', error);
        console.error('Error stack:', error.stack);
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

// Handle select menu interactions - UPDATED VERSION
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    
    try {
        // Check if this is a collection-related select menu - CLEAN ROUTING
        if (interaction.customId.startsWith('coll_')) {
            console.log('Routing to collection select menu handler');
            const collectionCommand = client.commands.get('collection');
            if (collectionCommand && typeof collectionCommand.handleInteraction === 'function') {
                await collectionCommand.handleInteraction(interaction);
            } else {
                await interaction.reply({
                    content: '❌ Collection feature not available.',
                    ephemeral: true
                });
            }
            return;
        }
        
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
        
        // Check if this is an arena-related select menu
        if (interaction.customId.startsWith('arena_')) {
            await handleArenaSelectMenu(interaction);
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

// Handle modal submit interactions - UPDATED VERSION with all new features
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;
    
    try {
        // Check if this is a collection give item modal
        if (interaction.customId.startsWith('coll_give_modal_')) {
            console.log('Routing to collection give modal handler');
            const collectionCommand = client.commands.get('collection');
            if (collectionCommand && typeof collectionCommand.handleModalSubmit === 'function') {
                await collectionCommand.handleModalSubmit(interaction);
            } else {
                await interaction.reply({
                    content: '❌ Collection feature not available.',
                    ephemeral: true
                });
            }
            return;
        }

        // Check if this is a gacha admin combination modal
        if (interaction.customId === 'gacha_add_combo_modal') {
            console.log('Routing to gacha admin combination modal handler');
            const gachaAdminCommand = client.commands.get('gacha-admin');
            if (gachaAdminCommand && typeof gachaAdminCommand.handleModalSubmit === 'function') {
                await gachaAdminCommand.handleModalSubmit(interaction);
            } else {
                await interaction.reply({
                    content: '❌ Gacha admin feature not available.',
                    ephemeral: true
                });
            }
            return;
        }
        
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
        
        // Check if this is an arena-related modal
        if (interaction.customId.startsWith('arena_')) {
            await handleArenaModalSubmit(interaction);
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

// Function to handle month-end tiebreaker expiration
async function handleMonthEndTiebreakerExpiration() {
    try {
        console.log('🌅 Starting month-end tiebreaker expiration...');
        
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Check if tomorrow is the first day of a new month
        if (tomorrow.getDate() === 1) {
            console.log('📅 Month transition detected - expiring tiebreakers...');
            
            // Expire old tiebreakers
            const expirationResult = await monthlyTasksService.expireOldTiebreakers();
            
            // Log results
            if (expirationResult.success) {
                console.log(`✅ Month-end tiebreaker expiration complete. Expired ${expirationResult.expired.length} tiebreaker(s).`);
                
                if (expirationResult.expired.length > 0) {
                    expirationResult.expired.forEach(tb => {
                        console.log(`   - ${tb.gameTitle} (${tb.monthKey})`);
                    });
                }
                
                // Send notification to admin log channel
                try {
                    const adminLogChannel = await client.channels.fetch(config.discord.adminLogChannelId);
                    if (adminLogChannel) {
                        const embed = new EmbedBuilder()
                            .setColor('#FF9900')
                            .setTitle('🌅 Monthly Transition - Tiebreaker Expiration')
                            .setDescription('Automated month-end tiebreaker expiration has completed.')
                            .setTimestamp();

                        if (expirationResult.expired.length > 0) {
                            const expiredList = expirationResult.expired.map(tb => 
                                `• ${tb.gameTitle} (${tb.monthKey})`
                            ).join('\n');
                            
                            embed.addFields({ 
                                name: `Expired Tiebreakers (${expirationResult.expired.length})`, 
                                value: expiredList 
                            });
                        } else {
                            embed.addFields({ 
                                name: 'Result', 
                                value: 'No tiebreakers needed expiration.' 
                            });
                        }

                        await adminLogChannel.send({ embeds: [embed] });
                    }
                } catch (notifyError) {
                    console.error('Error sending tiebreaker expiration notification:', notifyError);
                }
            } else {
                console.error('❌ Month-end tiebreaker expiration failed:', expirationResult.error);
            }
        } else {
            console.log('ℹ️ Not a month transition day, skipping tiebreaker expiration...');
        }
    } catch (error) {
        console.error('❌ Error in month-end tiebreaker expiration:', error);
    }
}

// Function to handle month-start tiebreaker cleanup
async function handleMonthStartTiebreakerCleanup() {
    try {
        console.log('🧹 Starting month-start tiebreaker cleanup...');
        
        // Clean up very old tiebreakers (older than 90 days)
        const cleanupResult = await monthlyTasksService.cleanupOldTiebreakers(90);
        
        if (cleanupResult.count > 0) {
            console.log(`🗑️ Cleaned up ${cleanupResult.count} old tiebreaker(s)`);
            
            // Send notification to admin log channel
            try {
                const adminLogChannel = await client.channels.fetch(config.discord.adminLogChannelId);
                if (adminLogChannel) {
                    const embed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('🧹 Monthly Cleanup - Old Tiebreakers')
                        .setDescription('Automated month-start tiebreaker cleanup has completed.')
                        .addFields({
                            name: `Old Tiebreakers Deleted (${cleanupResult.count})`,
                            value: cleanupResult.tiebreakers.slice(0, 10).join(', ') + 
                                   (cleanupResult.count > 10 ? '...' : '')
                        })
                        .setTimestamp();

                    await adminLogChannel.send({ embeds: [embed] });
                }
            } catch (notifyError) {
                console.error('Error sending cleanup notification:', notifyError);
            }
        } else {
            console.log('ℹ️ No old tiebreakers found for cleanup');
        }
        
        console.log('✅ Month-start tiebreaker cleanup complete');
        
    } catch (error) {
        console.error('❌ Error in month-start tiebreaker cleanup:', error);
    }
}

// Function to fix duplicate index issues automatically
async function fixDuplicateIndexes() {
    try {
        console.log('🔧 Checking for duplicate indexes...');
        
        // Get all indexes for the collection
        const indexes = await ArcadeBoard.collection.indexes();
        console.log('Current indexes:', indexes.map(i => ({ name: i.name, sparse: i.sparse })));
        
        // Find any expiredAt indexes
        const expiredAtIndexes = indexes.filter(index => index.name === 'expiredAt_1');
        
        if (expiredAtIndexes.length > 0) {
            console.log(`Found ${expiredAtIndexes.length} expiredAt index(es)`);
            
            // Drop ALL expiredAt indexes to start fresh
            for (const index of expiredAtIndexes) {
                console.log(`🗑️ Dropping existing expiredAt index: ${JSON.stringify(index)}`);
                try {
                    await ArcadeBoard.collection.dropIndex('expiredAt_1');
                    console.log('✅ Successfully dropped expiredAt index');
                } catch (dropError) {
                    console.log('Index may have already been dropped:', dropError.message);
                }
            }
            
            // Wait a moment for the drop to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Now create the correct sparse index
            console.log('🔨 Creating new sparse expiredAt index...');
            try {
                await ArcadeBoard.collection.createIndex(
                    { expiredAt: 1 }, 
                    { sparse: true, background: true }
                );
                console.log('✅ Created new sparse expiredAt index');
            } catch (createError) {
                console.log('Index creation handled by schema:', createError.message);
            }
        } else {
            console.log('✅ No expiredAt indexes found - schema will create the correct one');
        }
        
        // Verify the final state
        const finalIndexes = await ArcadeBoard.collection.indexes();
        const finalExpiredAtIndex = finalIndexes.find(i => i.name === 'expiredAt_1');
        if (finalExpiredAtIndex) {
            console.log('Final expiredAt index:', JSON.stringify(finalExpiredAtIndex));
        }
        
    } catch (error) {
        console.error('Error in index fixing:', error);
        console.log('⚠️ Index issues may need manual resolution');
    }
}

// Handle ready event
client.once(Events.ClientReady, async () => {
    try {
        console.log(`Logged in as ${client.user.tag}`);

        // Connect to MongoDB
        await connectDB();
        console.log('Connected to MongoDB');

        // Fix any duplicate index issues automatically
        await fixDuplicateIndexes();

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
        arenaAlertService.setClient(client);
        arenaFeedService.setClient(client);
        gameAwardService.setClient(client);
        gachaMachine.setClient(client);
        combinationService.setClient(client); // NEW: Set client for combination alerts

        // START MONTHLY GP SERVICE
        monthlyGPService.start();
        console.log('✅ Monthly GP Service initialized - automatic grants on 1st of each month');

        // START GACHA MACHINE
        await gachaMachine.start();
        console.log('✅ Gacha Machine initialized and pinned in gacha channel');

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

        // Schedule month-end tiebreaker expiration (last 4 days of month at 11:30 PM)
        cron.schedule('30 23 28-31 * *', () => {
            console.log('Running month-end tiebreaker expiration check...');
            handleMonthEndTiebreakerExpiration().catch(error => {
                console.error('Error in month-end tiebreaker expiration:', error);
            });
        });

        // Schedule monthly tasks on the 1st of each month at 00:01
        cron.schedule('1 0 1 * *', () => {
            console.log('Running monthly tasks...');
            monthlyTasksService.clearAllNominations().catch(error => {
                console.error('Error clearing nominations:', error);
            });
        });

        // Schedule month-start tiebreaker cleanup on the 1st of each month at 02:00
        cron.schedule('0 2 1 * *', () => {
            console.log('Running month-start tiebreaker cleanup...');
            handleMonthStartTiebreakerCleanup().catch(error => {
                console.error('Error in month-start tiebreaker cleanup:', error);
            });
        });

        // Schedule arcade service to run daily at 00:15 (just after midnight)
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
        cron.schedule('0 * * * *', () => {
            console.log('Running arcade alerts check...');
            arcadeAlertService.checkForRankChanges(true).catch(error => {
                console.error('Error in arcade alerts check:', error);
            });
        });

        // Schedule arcade feed updates every hour
        cron.schedule('10 * * * *', () => {
            console.log('Running arcade feed update...');
            arcadeFeedService.updateArcadeFeed().catch(error => {
                console.error('Error in arcade feed update:', error);
            });
        });

        // Schedule arena alert checks every 15 minutes
        cron.schedule('*/15 * * * *', () => {
            console.log('Running arena alerts check...');
            arenaAlertService.update().catch(error => {
                console.error('Error in arena alerts check:', error);
            });
        });

        // Schedule arena feed updates every 30 minutes
        cron.schedule('*/30 * * * *', () => {
            console.log('Running arena feed update...');
            arenaFeedService.update().catch(error => {
                console.error('Error in arena feed update:', error);
            });
        });

        // Schedule completed arena challenges check every 15 minutes
        cron.schedule('*/15 * * * *', () => {
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
        cron.schedule('20 0 1 * *', async () => {
            console.log('Finalizing previous month\'s leaderboard...');
            try {
                const leaderboardCommand = client.commands.get('leaderboard');
                if (leaderboardCommand) {
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
                        member: { permissions: { has: () => true } },
                        options: { getBoolean: () => true }
                    };
                    
                    await leaderboardCommand.finalizePreviousMonth(mockInteraction);
                }
            } catch (error) {
                console.error('Error in leaderboard finalization:', error);
            }
        });

        // Check if we need to finalize the previous month's leaderboard on startup
        const now = new Date();
        const currentDay = now.getDate();
        if (currentDay <= 3) {
            console.log('Checking if previous month\'s leaderboard needs to be finalized...');
            try {
                const leaderboardCommand = client.commands.get('leaderboard');
                if (leaderboardCommand) {
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

        // Check for any tiebreakers that should have been expired on startup
        if (currentDay <= 3) {
            console.log('Checking for any tiebreakers that should have been expired...');
            try {
                const expirationResult = await monthlyTasksService.expireOldTiebreakers();
                if (expirationResult.success && expirationResult.expired.length > 0) {
                    console.log(`⏰ Startup: Expired ${expirationResult.expired.length} overdue tiebreaker(s)`);
                    expirationResult.expired.forEach(tb => {
                        console.log(`   - ${tb.gameTitle} (${tb.monthKey})`);
                    });
                }
            } catch (error) {
                console.error('Error in startup tiebreaker expiration check:', error);
            }
        }

        // Schedule voting poll creation
        cron.schedule('0 0 22-31 * *', async () => {
            const today = new Date();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            
            if (today.getDate() === daysInMonth - 8) {
                console.log('Running scheduled voting poll creation...');
                monthlyTasksService.createVotingPoll().catch(error => {
                    console.error('Error creating voting poll:', error);
                });
            }
        });

        // Schedule vote counting
        cron.schedule('0 0 28-31 * *', async () => {
            const today = new Date();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            
            if (today.getDate() === daysInMonth - 1) {
                console.log('Running scheduled vote counting...');
                monthlyTasksService.countAndAnnounceVotes().catch(error => {
                    console.error('Error counting votes:', error);
                });
            }
        });

        // Run initial services
        await statsUpdateService.start();
        await achievementFeedService.start();
        await arcadeService.start();
        await leaderboardFeedService.start();
        await arcadeAlertService.start();
        await arcadeFeedService.start();
        await membershipCheckService.start();
        await arenaService.start();
        await arenaAlertService.start();
        await arenaFeedService.start();
        await gameAwardService.initialize();

        // Check for any arena timeouts that may have occurred while the bot was offline
        console.log('Checking for any arena timeouts that occurred while offline...');
        arenaService.checkAndProcessTimeouts().catch(error => {
            console.error('Error in startup timeout check:', error);
        });

        console.log('Bot is ready!');
        console.log('📅 Scheduled tasks:');
        console.log('  • Stats updates: Every 30 minutes');
        console.log('  • Achievement feeds: Every 15 minutes');
        console.log('  • Arena completed challenges: Every 15 minutes');
        console.log('  • Arena alerts: Every 15 minutes');
        console.log('  • Monthly GP grants: Automatic on 1st of each month');
        console.log('  • Weekly comprehensive yearly sync: Sundays at 3:00 AM');
        console.log('  • Monthly tasks: 1st of each month');
        console.log('  • Tiebreaker expiration: Last 4 days of month at 11:30 PM');
        console.log('  • Tiebreaker cleanup: 1st of each month at 2:00 AM');
        console.log('  • Arcade service: Daily at 12:15 AM');
        console.log('  • Arena feeds: Every 30 minutes');
        console.log('  • Arena timeouts: Hourly at 45 minutes past');
        console.log('  • Gacha Machine: Active and pinned');
        console.log('  • Automatic Combinations: Background processing with alerts');
        console.log('  • Collection Viewer: Clean interface with player item giving');
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

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('Shutting down...');
    monthlyGPService.stop();
    gachaMachine.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down...');
    monthlyGPService.stop();
    gachaMachine.stop();
    process.exit(0);
});

// Login to Discord
client.login(config.discord.token).catch(error => {
    console.error('Error logging in to Discord:', error);
    process.exit(1);
});
