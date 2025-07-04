// src/index.js - Optimized with performance improvements
import { Client, Collection, Events, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { config, validateConfig } from './config/config.js';
import { connectDB, checkDatabaseHealth } from './models/index.js';
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
import gpRewardService from './services/gpRewardService.js';
import gachaMachine from './services/gachaMachine.js';
import combinationService from './services/combinationService.js';
import { User } from './models/User.js';
import { ArcadeBoard } from './models/ArcadeBoard.js';

// Import handlers
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

// PERFORMANCE: User cache to avoid repeated database queries
const userCache = new Map();
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to get user with caching
async function getCachedUser(discordId) {
    const cached = userCache.get(discordId);
    if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
        return cached.user;
    }
    
    const user = await User.findOne({ discordId });
    userCache.set(discordId, { user, timestamp: Date.now() });
    return user;
}

// Clear expired cache entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of userCache.entries()) {
        if (now - value.timestamp > USER_CACHE_TTL) {
            userCache.delete(key);
        }
    }
}, USER_CACHE_TTL);

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
        
        if (error.code === 10062) return; // Expired interaction
        
        const errorMessage = {
            content: 'There was an error executing this command.',
            ephemeral: true
        };
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            console.error('Error sending command error response:', replyError);
        }
    }
});

// OPTIMIZED: Button interactions with early routing and minimal database queries
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;
    
    try {
        const customId = interaction.customId;
        
        // OPTIMIZATION: Route directly to handlers without redundant checks
        
        // Nominations pagination - no user lookup needed
        if (customId === 'nominations_prev' || customId === 'nominations_next') {
            const nominationsCommand = client.commands.get('nominations');
            if (nominationsCommand?.handlePaginationInteraction) {
                await nominationsCommand.handlePaginationInteraction(interaction);
            } else {
                await interaction.reply({
                    content: 'Pagination data not found. Please run the command again.',
                    ephemeral: true
                });
            }
            return;
        }

        // Combination buttons - delegate to service
        if (customId.startsWith('combo_')) {
            const handled = await combinationService.handleCombinationInteraction(interaction);
            if (handled) return;
        }

        // Gacha machine buttons - only lookup user when needed
        if (customId === 'gacha_single_pull' || 
            customId === 'gacha_multi_pull' || 
            customId === 'gacha_collection') {
            
            await interaction.deferReply({ ephemeral: true });

            const user = await getCachedUser(interaction.user.id);
            if (!user) {
                return interaction.editReply({
                    content: '❌ You are not registered! Please ask an admin to register you first.',
                    ephemeral: true
                });
            }

            switch (customId) {
                case 'gacha_single_pull':
                    await gachaMachine.handlePull(interaction, user, 'single');
                    break;
                case 'gacha_multi_pull':
                    await gachaMachine.handlePull(interaction, user, 'multi');
                    break;
                case 'gacha_collection':
                    await gachaMachine.handleCollection(interaction, user);
                    break;
            }
            return;
        }

        // Gacha admin buttons
        if (customId.startsWith('gacha_')) {
            const gachaAdminCommand = client.commands.get('gacha-admin');
            if (gachaAdminCommand?.handleButtonInteraction) {
                await gachaAdminCommand.handleButtonInteraction(interaction);
            }
            return;
        }

        // Recipes buttons
        if (customId.startsWith('recipes_')) {
            const recipesCommand = client.commands.get('recipes');
            if (recipesCommand?.handleButtonInteraction) {
                await recipesCommand.handleButtonInteraction(interaction);
            } else {
                await interaction.reply({
                    content: '❌ Recipes feature not available.',
                    ephemeral: true
                });
            }
            return;
        }

        // Collection buttons
        if (customId.startsWith('coll_')) {
            const collectionCommand = client.commands.get('collection');
            if (collectionCommand?.handleInteraction) {
                await collectionCommand.handleInteraction(interaction);
            } else {
                await interaction.reply({
                    content: '❌ Collection feature not available.',
                    ephemeral: true
                });
            }
            return;
        }
        
        // Nomination buttons
        if (customId.startsWith('nominate_')) {
            await handleNominationButtonInteraction(interaction);
            return;
        }
        
        // Restriction buttons
        if (customId.startsWith('restrictions_')) {
            await handleRestrictionButtonInteraction(interaction);
            return;
        }
        
        // Arena buttons
        if (customId.startsWith('arena_') || customId.startsWith('admin_arena_')) {
            await handleArenaButtonInteraction(interaction);
            return;
        }
        
        // Generic command-based button handling
        const commandName = customId.split('_')[0];
        const command = client.commands.get(commandName);
        
        if (command?.handleButtonInteraction) {
            await command.handleButtonInteraction(interaction);
        }
    } catch (error) {
        console.error('Error handling button interaction:', error);
        try {
            if (error.code === 10062) return; // Expired interaction
            
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

// OPTIMIZED: Select menu interactions with streamlined routing
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    
    try {
        const customId = interaction.customId;
        
        // Combination select menus
        if (customId.startsWith('combo_')) {
            const handled = await combinationService.handleCombinationInteraction(interaction);
            if (handled) return;
        }

        // Gacha store purchases - only lookup user when needed
        if (customId === 'gacha_store_purchase') {
            const user = await getCachedUser(interaction.user.id);
            if (!user) {
                return interaction.reply({
                    content: '❌ You are not registered! Please ask an admin to register you first.',
                    ephemeral: true
                });
            }

            const selectedValue = interaction.values[0];
            if (selectedValue.startsWith('store_buy_')) {
                const itemId = selectedValue.replace('store_buy_', '');
                await gachaMachine.handleStorePurchase(interaction, user, itemId);
            } else {
                await interaction.reply({
                    content: '❌ Invalid store selection.',
                    ephemeral: true
                });
            }
            return;
        }

        // Collection select menus
        if (customId.startsWith('coll_')) {
            const collectionCommand = client.commands.get('collection');
            if (collectionCommand?.handleInteraction) {
                await collectionCommand.handleInteraction(interaction);
            } else {
                await interaction.reply({
                    content: '❌ Collection feature not available.',
                    ephemeral: true
                });
            }
            return;
        }
        
        // Nomination select menus
        if (customId.startsWith('nominate_')) {
            await handleNominationSelectMenu(interaction);
            return;
        }
        
        // Restriction select menus
        if (customId.startsWith('restrictions_')) {
            await handleRestrictionSelectMenu(interaction);
            return;
        }
        
        // Arena select menus
        if (customId.startsWith('arena_')) {
            await handleArenaSelectMenu(interaction);
            return;
        }
        
        // Generic command-based select menu handling
        const commandName = customId.split('_')[0];
        const command = client.commands.get(commandName);
        
        if (command?.handleSelectMenuInteraction) {
            await command.handleSelectMenuInteraction(interaction);
        }
    } catch (error) {
        console.error('Error handling select menu interaction:', error);
        try {
            if (error.code === 10062) return; // Expired interaction
            
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

// OPTIMIZED: Modal submit interactions with direct routing
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;
    
    try {
        const customId = interaction.customId;
        
        // Collection modals
        if (customId.startsWith('coll_give_details_')) {
            const collectionCommand = client.commands.get('collection');
            if (collectionCommand?.handleModalSubmit) {
                await collectionCommand.handleModalSubmit(interaction);
            } else {
                await interaction.reply({
                    content: '❌ Collection feature not available.',
                    ephemeral: true
                });
            }
            return;
        }

        // Gacha admin modals
        if (customId === 'gacha_add_combo_modal') {
            const gachaAdminCommand = client.commands.get('gacha-admin');
            if (gachaAdminCommand?.handleModalSubmit) {
                await gachaAdminCommand.handleModalSubmit(interaction);
            } else {
                await interaction.reply({
                    content: '❌ Gacha admin feature not available.',
                    ephemeral: true
                });
            }
            return;
        }
        
        // Nomination modals
        if (customId.startsWith('nomination_')) {
            await handleNominationModalSubmit(interaction);
            return;
        }
        
        // Restriction modals
        if (customId.startsWith('restrictions_')) {
            await handleRestrictionModalSubmit(interaction);
            return;
        }
        
        // Arena modals
        if (customId.startsWith('arena_')) {
            await handleArenaModalSubmit(interaction);
            return;
        }
        
        // Generic command-based modal handling
        const commandName = customId.split('_')[0];
        const command = client.commands.get(commandName);
        
        if (command?.handleModalSubmit) {
            await command.handleModalSubmit(interaction);
        }
    } catch (error) {
        console.error('Error handling modal submission:', error);
        try {
            if (error.code === 10062) return; // Expired interaction
            
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

// Weekly comprehensive yearly sync
async function handleWeeklyComprehensiveSync() {
    try {
        console.log('🔄 Starting weekly comprehensive yearly sync...');
        
        const currentYear = new Date().getFullYear();
        const yearlyboardCommand = client.commands.get('yearlyboard');
        if (!yearlyboardCommand) {
            console.error('Yearlyboard command not found for weekly sync');
            return;
        }
        
        const mockInteraction = {
            deferReply: async () => {},
            editReply: async (message) => {
                if (typeof message === 'string') {
                    console.log('Weekly sync progress:', message);
                } else if (message.embeds?.length > 0) {
                    const embed = message.embeds[0];
                    if (embed.title) {
                        console.log(`Weekly sync: ${embed.title}`);
                    }
                }
            },
            member: { 
                roles: { 
                    cache: { 
                        has: () => true
                    } 
                } 
            },
            options: {
                getInteger: (option) => option === 'year' ? currentYear : null,
                getBoolean: (option) => {
                    if (option === 'sync') return true;
                    if (option === 'debug') return false;
                    return false;
                },
                getString: () => null
            }
        };
        
        await yearlyboardCommand.execute(mockInteraction);
        console.log('✅ Weekly comprehensive yearly sync completed successfully');
        
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

// Month-end tiebreaker expiration
async function handleMonthEndTiebreakerExpiration() {
    try {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        if (tomorrow.getDate() === 1) {
            console.log('📅 Month transition detected - expiring tiebreakers...');
            
            const expirationResult = await monthlyTasksService.expireOldTiebreakers();
            
            if (expirationResult.success) {
                console.log(`✅ Month-end tiebreaker expiration complete. Expired ${expirationResult.expired.length} tiebreaker(s).`);
                
                if (expirationResult.expired.length > 0) {
                    expirationResult.expired.forEach(tb => {
                        console.log(`   - ${tb.gameTitle} (${tb.monthKey})`);
                    });
                }
                
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
        }
    } catch (error) {
        console.error('❌ Error in month-end tiebreaker expiration:', error);
    }
}

// Month-start tiebreaker cleanup
async function handleMonthStartTiebreakerCleanup() {
    try {
        const cleanupResult = await monthlyTasksService.cleanupOldTiebreakers(90);
        
        if (cleanupResult.count > 0) {
            console.log(`🗑️ Cleaned up ${cleanupResult.count} old tiebreaker(s)`);
            
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
        }
        
        console.log('✅ Month-start tiebreaker cleanup complete');
        
    } catch (error) {
        console.error('❌ Error in month-start tiebreaker cleanup:', error);
    }
}

// Fix duplicate index issues
async function fixDuplicateIndexes() {
    try {
        const indexes = await ArcadeBoard.collection.indexes();
        const expiredAtIndexes = indexes.filter(index => index.name === 'expiredAt_1');
        
        if (expiredAtIndexes.length > 0) {
            for (const index of expiredAtIndexes) {
                try {
                    await ArcadeBoard.collection.dropIndex('expiredAt_1');
                    console.log('✅ Successfully dropped expiredAt index');
                } catch (dropError) {
                    console.log('Index may have already been dropped:', dropError.message);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
                await ArcadeBoard.collection.createIndex(
                    { expiredAt: 1 }, 
                    { sparse: true, background: true }
                );
                console.log('✅ Created new sparse expiredAt index');
            } catch (createError) {
                console.log('Index creation handled by schema:', createError.message);
            }
        }
        
    } catch (error) {
        console.error('Error in index fixing:', error);
    }
}

// MAIN READY EVENT - OPTIMIZED
client.once(Events.ClientReady, async () => {
    try {
        console.log(`Logged in as ${client.user.tag}`);

        // Connect to MongoDB
        await connectDB();
        console.log('✅ Connected to MongoDB with all models initialized');

        // Database health check
        const healthCheck = await checkDatabaseHealth();
        if (healthCheck.healthy) {
            console.log(`🏥 Database health: OK (${healthCheck.latency}ms ping)`);
        } else {
            console.warn('⚠️ Database health check failed:', healthCheck.error);
        }

        // OPTIMIZED: Non-blocking emoji initialization
        console.log('🎭 Starting emoji cache initialization...');
        
        const emojiPromises = [
            import('./config/gachaEmojis.js').catch(error => {
                console.error('Failed to import gacha emojis config:', error.message);
                return { error: error.message };
            }),
            import('./config/trophyEmojis.js').catch(error => {
                console.error('Failed to import trophy emojis config:', error.message);
                return { error: error.message };
            })
        ];

        Promise.race([
            Promise.allSettled(emojiPromises),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Emoji loading timeout')), 30000)
            )
        ]).then(results => {
            const successCount = results.filter(r => r.status === 'fulfilled' && !r.value?.error).length;
            console.log(`🎭 Emoji loading complete: ${successCount}/${results.length} successful`);
        }).catch(() => {
            console.warn('⚠️ Emoji loading timed out, using fallbacks');
        });

        // Continue initialization without waiting
        await fixDuplicateIndexes();
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
        combinationService.setClient(client);

        // Start services
        monthlyGPService.start();
        console.log('✅ Monthly GP Service initialized');

        // OPTIMIZED: GP reward service initialization
        console.log('🎁 Initializing GP reward service...');
        try {
            gpRewardService.initialize();
            console.log('✅ GP reward service initialized successfully');
        } catch (gpInitError) {
            console.error('❌ Failed to initialize GP reward service:', gpInitError);
        }

        // OPTIMIZED: Non-blocking gacha machine start
        gachaMachine.start().then(() => {
            console.log('✅ Gacha Machine and Store initialized');
        }).catch(error => {
            console.error('❌ Failed to start Gacha Machine:', error);
        });

        // Schedule emoji cache refresh (non-blocking)
        cron.schedule('*/30 * * * *', async () => {
            try {
                const gachaModule = await import('./config/gachaEmojis.js');
                if (gachaModule.safeCacheRefresh) {
                    await Promise.race([
                        gachaModule.safeCacheRefresh(),
                        new Promise(resolve => setTimeout(resolve, 5000))
                    ]);
                }
            } catch (error) {
                // Silent fail for emoji refresh
            }
        });

        // Schedule all other tasks (unchanged)
        cron.schedule('*/30 * * * *', () => {
            statsUpdateService.start().catch(error => {
                console.error('Error in scheduled stats update:', error);
            });
        });

        cron.schedule('*/15 * * * *', () => {
            achievementFeedService.start().catch(error => {
                console.error('Error in achievement feed check:', error);
            });
        });

        cron.schedule('0 3 * * 0', () => {
            handleWeeklyComprehensiveSync().catch(error => {
                console.error('Error in weekly comprehensive yearly sync:', error);
            });
        });

        cron.schedule('30 23 28-31 * *', () => {
            handleMonthEndTiebreakerExpiration().catch(error => {
                console.error('Error in month-end tiebreaker expiration:', error);
            });
        });

        cron.schedule('1 0 1 * *', () => {
            monthlyTasksService.clearAllNominations().catch(error => {
                console.error('Error clearing nominations:', error);
            });
        });

        cron.schedule('0 2 1 * *', () => {
            handleMonthStartTiebreakerCleanup().catch(error => {
                console.error('Error in month-start tiebreaker cleanup:', error);
            });
        });

        cron.schedule('15 0 * * *', () => {
            arcadeService.start().catch(error => {
                console.error('Error in scheduled arcade service:', error);
            });
        });

        cron.schedule('*/15 * * * *', () => {
            leaderboardFeedService.updateLeaderboard().catch(error => {
                console.error('Error in leaderboard feed update:', error);
            });
        });

        cron.schedule('0 * * * *', () => {
            arcadeAlertService.checkForRankChanges(true).catch(error => {
                console.error('Error in arcade alerts check:', error);
            });
        });

        cron.schedule('10 * * * *', () => {
            arcadeFeedService.updateArcadeFeed().catch(error => {
                console.error('Error in arcade feed update:', error);
            });
        });

        cron.schedule('*/15 * * * *', () => {
            arenaAlertService.update().catch(error => {
                console.error('Error in arena alerts check:', error);
            });
        });

        cron.schedule('*/30 * * * *', () => {
            arenaFeedService.update().catch(error => {
                console.error('Error in arena feed update:', error);
            });
        });

        cron.schedule('*/15 * * * *', () => {
            arenaService.checkCompletedChallenges().catch(error => {
                console.error('Error in arena completed challenges check:', error);
            });
        });

        cron.schedule('45 * * * *', () => {
            arenaService.checkAndProcessTimeouts().catch(error => {
                console.error('Error in arena timeout check:', error);
            });
        });

        cron.schedule('0 3 * * *', () => {
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

        // Check if we need to finalize previous month's leaderboard on startup
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

        // Check for arena timeouts that occurred while bot was offline
        arenaService.checkAndProcessTimeouts().catch(error => {
            console.error('Error in startup timeout check:', error);
        });

        console.log('🤖 Bot is ready!');
        console.log('✅ All systems initialized with performance optimizations:');
        console.log('  • User caching: 5-minute TTL to reduce database queries');
        console.log('  • Interaction routing: Streamlined with early returns');
        console.log('  • Emoji loading: Non-blocking with timeout protection');
        console.log('  • Gacha Machine: Non-blocking initialization');
        console.log('  • All services: Running on optimized schedules');
        
    } catch (error) {
        console.error('❌ Error during initialization:', error);
        
        if (error.message.includes('buffering timed out')) {
            console.error('🔧 Database timeout detected. Check MongoDB connection.');
        }
        
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        } else {
            console.log('⚠️ Development mode: continuing with limited functionality');
        }
    }
});

// Handle errors
client.on(Events.Error, error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    monthlyGPService.stop();
    gachaMachine.stop();
    try {
        gpRewardService.stop();
        console.log('✅ GP reward service stopped cleanly');
    } catch (stopError) {
        console.error('❌ Error stopping GP reward service:', stopError);
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down...');
    monthlyGPService.stop();
    gachaMachine.stop();
    try {
        gpRewardService.stop();
        console.log('✅ GP reward service stopped cleanly');
    } catch (stopError) {
        console.error('❌ Error stopping GP reward service:', stopError);
    }
    process.exit(0);
});

// Login to Discord
client.login(config.discord.token).catch(error => {
    console.error('Error logging in to Discord:', error);
    process.exit(1);
});
