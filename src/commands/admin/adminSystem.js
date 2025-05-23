import { 
    SlashCommandBuilder,
    PermissionFlagsBits
} from 'discord.js';
import { config } from '../../config/config.js';
import statsUpdateService from '../../services/statsUpdateService.js';
import achievementFeedService from '../../services/achievementFeedService.js';
import gameAwardService from '../../services/gameAwardService.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';

export default {
    data: new SlashCommandBuilder()
        .setName('adminsystem')
        .setDescription('System-level administrative functions')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Force an immediate update of all user stats and leaderboards')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('scan-achievements')
                .setDescription('Scan recent achievements for missed alerts (esp. mastery)')
                .addStringOption(option => 
                    option
                        .setName('username')
                        .setDescription('RetroAchievements username to scan (leave empty for all users)')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName('count')
                        .setDescription('Number of recent achievements to scan (default: 50, max: 100)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(100)
                )
                .addBooleanOption(option =>
                    option
                        .setName('force')
                        .setDescription('Force announce even if already announced (default: false)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('check-mastery')
                .setDescription('Check if a user has mastered a game and announce if true')
                .addStringOption(option => 
                    option
                        .setName('username')
                        .setDescription('RetroAchievements username')
                        .setRequired(true)
                )
                .addStringOption(option => 
                    option
                        .setName('gameid')
                        .setDescription('RetroAchievements game ID to check')
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option
                        .setName('force')
                        .setDescription('Force announce even if already announced (default: false)')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        
        switch(subcommand) {
            case 'update':
                await this.handleForceUpdate(interaction);
                break;
            case 'scan-achievements':
                await this.handleScanAchievements(interaction);
                break;
            case 'check-mastery':
                await this.handleCheckMastery(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand. Please try again.',
                    ephemeral: true
                });
        }
    },

    /**
     * Handle force update stats
     */
    async handleForceUpdate(interaction) {
        await interaction.deferReply();

        try {
            // Check if an update is already in progress
            if (statsUpdateService.isUpdating) {
                return interaction.editReply('An update is already in progress. Please wait for it to complete.');
            }

            // Start the update
            await interaction.editReply('Starting stats update. This may take a few minutes...');
            
            // Force the update by bypassing the isUpdating check
            const originalIsUpdating = statsUpdateService.isUpdating;
            statsUpdateService.isUpdating = false;
            
            await statsUpdateService.start();
            
            // Restore the original state
            statsUpdateService.isUpdating = originalIsUpdating;

            return interaction.editReply('Stats update completed successfully!');
        } catch (error) {
            console.error('Error forcing stats update:', error);
            return interaction.editReply('An error occurred while updating stats. Please try again.');
        }
    },

    /**
     * Handle scanning achievements for missed alerts
     */
    async handleScanAchievements(interaction) {
        await interaction.deferReply();

        try {
            // Get options
            const username = interaction.options.getString('username');
            const achievementCount = interaction.options.getInteger('count') || 50;
            const forceAnnounce = interaction.options.getBoolean('force') || false;
            
            // If username is provided, scan just that user
            if (username) {
                const user = await User.findOne({ raUsername: username });
                
                if (!user) {
                    return interaction.editReply(`User ${username} not found in the database.`);
                }
                
                await interaction.editReply(`Scanning recent achievements for ${username}...`);
                const result = await this.scanUserAchievements(user, achievementCount, forceAnnounce);
                
                return interaction.editReply(
                    `Scan completed for ${username}:\n` +
                    `- Achievements processed: ${result.processed}\n` +
                    `- Achievements announced: ${result.announced}\n` +
                    `- Mastery/Beaten awards: ${result.awards}`
                );
            }
            
            // If no username, scan all users
            const users = await User.find({});
            
            if (users.length === 0) {
                return interaction.editReply('No users found in the database.');
            }
            
            await interaction.editReply(`Scanning recent achievements for ${users.length} users...`);
            
            let totalProcessed = 0;
            let totalAnnounced = 0;
            let totalAwards = 0;
            let processedUsers = 0;
            
            for (const user of users) {
                // Skip users without a RetroAchievements username
                if (!user.raUsername) continue;
                
                // Skip users who aren't guild members
                const isMember = await achievementFeedService.isGuildMember(user.discordId);
                if (!isMember) continue;
                
                // Process user
                try {
                    const result = await this.scanUserAchievements(user, achievementCount, forceAnnounce);
                    
                    totalProcessed += result.processed;
                    totalAnnounced += result.announced;
                    totalAwards += result.awards;
                    processedUsers++;
                    
                    // Update progress every 5 users
                    if (processedUsers % 5 === 0) {
                        await interaction.editReply(
                            `Scanning in progress: ${processedUsers}/${users.length} users processed...\n` +
                            `- Achievements processed so far: ${totalProcessed}\n` +
                            `- Achievements announced so far: ${totalAnnounced}\n` +
                            `- Mastery/Beaten awards so far: ${totalAwards}`
                        );
                    }
                    
                    // Add a small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error(`Error processing ${user.raUsername}:`, error);
                }
            }
            
            return interaction.editReply(
                `Scan completed for ${processedUsers} users:\n` +
                `- Total achievements processed: ${totalProcessed}\n` +
                `- Total achievements announced: ${totalAnnounced}\n` +
                `- Total mastery/beaten awards: ${totalAwards}`
            );
            
        } catch (error) {
            console.error('Error scanning achievements:', error);
            return interaction.editReply('An error occurred while scanning achievements. Please try again.');
        }
    },

    /**
     * Scan a user's recent achievements
     * @private
     */
    async scanUserAchievements(user, count, forceAnnounce) {
        const result = {
            processed: 0,
            announced: 0,
            awards: 0
        };
        
        if (!user || !user.raUsername) return result;
        
        try {
            // Get user's recent achievements
            const recentAchievements = await retroAPI.getUserRecentAchievements(user.raUsername, count);
            
            if (!recentAchievements || !Array.isArray(recentAchievements) || recentAchievements.length === 0) {
                console.log(`No recent achievements found for ${user.raUsername}`);
                return result;
            }
            
            console.log(`Found ${recentAchievements.length} recent achievements for ${user.raUsername}`);
            result.processed = recentAchievements.length;
            
            // Set up for achievement processing
            const announcementChannel = await achievementFeedService.getAnnouncementChannel();
            if (!announcementChannel) {
                console.error('Announcement channel not found or inaccessible');
                return result;
            }
            
            // Process each achievement
            for (const achievement of recentAchievements) {
                try {
                    // Basic null check
                    if (!achievement) continue;
                    
                    // Extract achievement info
                    const gameId = achievement.GameID ? String(achievement.GameID) : "unknown";
                    const achievementId = achievement.ID || "unknown";
                    
                    // Determine achievement type
                    const achievementType = achievementFeedService.getGameSystemType(gameId);
                    
                    // Create unique identifier for this achievement
                    const achievementBaseIdentifier = `${user.raUsername}:${achievementType}:${gameId}:${achievementId}`;
                    
                    // Check if this achievement is already in the session history and we're not forcing
                    const alreadyInSession = achievementFeedService.sessionAnnouncementHistory.has(achievementBaseIdentifier);
                    const alreadyInUser = user.announcedAchievements && user.announcedAchievements.some(id => {
                        const parts = id.split(':');
                        
                        // New format (with username as first part)
                        if (parts.length >= 4 && parts[0] === user.raUsername) {
                            return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}` === achievementBaseIdentifier;
                        }
                        
                        // Old format (without username)
                        if (parts.length >= 3) {
                            return `${user.raUsername}:${parts[0]}:${parts[1]}:${parts[2]}` === achievementBaseIdentifier;
                        }
                        
                        return false;
                    });
                    
                    if ((alreadyInSession || alreadyInUser) && !forceAnnounce) {
                        // Skip if already announced and not forcing
                        console.log(`Achievement ${achievement.Title} already announced for ${user.raUsername}, skipping`);
                        continue;
                    }
                    
                    // Get game info
                    let gameInfo;
                    try {
                        gameInfo = await retroAPI.getGameInfo(gameId);
                    } catch (gameInfoError) {
                        // Create fallback game info
                        gameInfo = {
                            id: gameId,
                            title: achievement.GameTitle || `Game ${gameId}`,
                            consoleName: achievement.ConsoleName || "Unknown",
                            imageIcon: ""
                        };
                    }
                    
                    // Announce the achievement
                    const announced = await achievementFeedService.announceAchievement(
                        announcementChannel, 
                        user, 
                        gameInfo, 
                        achievement, 
                        achievementType, 
                        gameId
                    );
                    
                    if (announced) {
                        result.announced++;
                        
                        // Add to session history
                        achievementFeedService.sessionAnnouncementHistory.add(achievementBaseIdentifier);
                        
                        // Add to user's announced achievements if not already there
                        if (!alreadyInUser) {
                            // Create identifier with timestamp
                            const achievementDate = new Date(achievement.DateEarned || achievement.dateEarned || 0);
                            const achievementIdentifier = `${achievementBaseIdentifier}:${achievementDate.getTime()}`;
                            
                            if (!user.announcedAchievements) {
                                user.announcedAchievements = [];
                            }
                            
                            user.announcedAchievements.push(achievementIdentifier);
                            
                            // Limit the size of the announcedAchievements array
                            if (user.announcedAchievements.length > achievementFeedService.maxAnnouncedAchievements) {
                                user.announcedAchievements = user.announcedAchievements.slice(-achievementFeedService.maxAnnouncedAchievements);
                            }
                            
                            await user.save();
                        }
                        
                        // Check for game mastery with force flag
                        let awardAnnounced = false;
                        
                        if (achievementType === 'regular') {
                            awardAnnounced = await this.forceCheckGameMastery(user, gameId, achievement, forceAnnounce);
                        } else if (achievementType === 'monthly') {
                            awardAnnounced = await gameAwardService.checkForGameAwards(user, gameId, false);
                        } else if (achievementType === 'shadow') {
                            awardAnnounced = await gameAwardService.checkForGameAwards(user, gameId, true);
                        }
                        
                        if (awardAnnounced) {
                            result.awards++;
                        }
                    }
                    
                    // Add a small delay between announcements
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (error) {
                    console.error(`Error processing achievement for ${user.raUsername}:`, error);
                }
            }
            
            return result;
            
        } catch (error) {
            console.error(`Error scanning achievements for ${user.raUsername}:`, error);
            return result;
        }
    },

    /**
     * Force check for game mastery
     * @private
     */
    async forceCheckGameMastery(user, gameId, achievement, forceAnnounce) {
        if (!user || !gameId) return false;

        try {
            // First, try the regular method
            const result = await gameAwardService.checkForGameMastery(user, gameId, achievement);
            
            // If it succeeded or we're not forcing, return the result
            if (result || !forceAnnounce) return result;
            
            // If we're forcing and the regular method didn't announce, 
            // we need to bypass the announcement history check
            
            // Create a temporary backup of session history
            const gameSystemType = achievementFeedService.getGameSystemType(gameId);
            const sessionBackup = new Set([...gameAwardService.sessionAwardHistory]);
            
            // Clear any existing award identifiers for this game/user
            const awardTypes = ['mastery', 'beaten', 'completion', 'participation'];
            for (const awardType of awardTypes) {
                const awardIdentifier = `${user.raUsername}:${gameSystemType}:${gameId}:${awardType}`;
                gameAwardService.sessionAwardHistory.delete(awardIdentifier);
            }
            
            // Try again with cleared history
            const forceResult = await gameAwardService.checkForGameMastery(user, gameId, achievement);
            
            // Restore the original session history
            gameAwardService.sessionAwardHistory = sessionBackup;
            
            return forceResult;
            
        } catch (error) {
            console.error(`Error force checking game mastery for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    },

    /**
     * Handle checking mastery for a specific game
     */
    async handleCheckMastery(interaction) {
        await interaction.deferReply();

        try {
            const username = interaction.options.getString('username');
            const gameId = interaction.options.getString('gameid');
            const forceAnnounce = interaction.options.getBoolean('force') || false;
            
            const user = await User.findOne({ raUsername: username });
            
            if (!user) {
                return interaction.editReply(`User ${username} not found in the database.`);
            }
            
            await interaction.editReply(`Checking if ${username} has mastered game ${gameId}...`);
            
            // Get game info for display
            let gameInfo;
            try {
                gameInfo = await retroAPI.getGameInfo(gameId);
            } catch (error) {
                return interaction.editReply(`Error fetching game info for ${gameId}. Please check the game ID.`);
            }
            
            // Force check for mastery
            const result = await this.forceCheckGameMastery(user, gameId, null, forceAnnounce);
            
            if (result) {
                return interaction.editReply(`Successfully announced mastery/beaten for ${username} on ${gameInfo.title}!`);
            } else {
                return interaction.editReply(`No mastery/beaten award found for ${username} on ${gameInfo.title}.`);
            }
            
        } catch (error) {
            console.error('Error checking mastery:', error);
            return interaction.editReply('An error occurred while checking mastery. Please try again.');
        }
    }
};
