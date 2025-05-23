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
import RetroAPIUtils from '../../utils/RetroAPIUtils.js';
import AlertUtils, { ALERT_TYPES } from '../../utils/AlertUtils.js';

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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('debug-mastery')
                .setDescription('Debug mastery detection for a specific user/game with detailed logging')
                .addStringOption(option => 
                    option
                        .setName('username')
                        .setDescription('RetroAchievements username')
                        .setRequired(true)
                )
                .addStringOption(option => 
                    option
                        .setName('gameid')
                        .setDescription('RetroAchievements game ID to debug')
                        .setRequired(true)
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
            case 'debug-mastery':
                await this.handleDebugMastery(interaction);
                break;
            default:
                await interaction.reply({
                    content: 'Invalid subcommand. Please try again.',
                    ephemeral: true
                });
        }
    },

    /**
     * Normalize award kind strings to handle API variations
     */
    normalizeAwardKind(awardKind) {
        if (!awardKind) return null;
        
        const normalized = awardKind.toString().toLowerCase().trim();
        
        // Map various API responses to standard values
        const mappings = {
            'mastered': 'mastery',
            'mastery': 'mastery',
            'master': 'mastery',
            'mastery/completion': 'mastery',
            'completed': 'completion',
            'completion': 'completion',
            'beaten': 'completion',
            'complete': 'completion',
            'game beaten': 'completion',
            'participated': 'participation',
            'participation': 'participation'
        };
        
        return mappings[normalized] || normalized;
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
                return result;
            }
            
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
                            awardAnnounced = await this.forceCheckGameAwards(user, gameId, false, forceAnnounce);
                        } else if (achievementType === 'shadow') {
                            awardAnnounced = await this.forceCheckGameAwards(user, gameId, true, forceAnnounce);
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
     * UPDATED: Force check for game mastery using getUserAwards API
     * @private
     */
    async forceCheckGameMastery(user, gameId, achievement, forceAnnounce) {
        if (!user || !gameId) return false;

        try {
            console.log(`Force checking game mastery for ${user.raUsername} on game ${gameId}, force=${forceAnnounce}`);
            
            // If not forcing, just use the regular method
            if (!forceAnnounce) {
                return await gameAwardService.checkForGameMastery(user, gameId, achievement);
            }
            
            // UPDATED: Use getUserAwards API to get actual award data
            const userAwards = await retroAPI.getUserAwards(user.raUsername);
            
            if (!userAwards || !userAwards.visibleUserAwards) {
                console.log(`No user awards found for ${user.raUsername}`);
                return false;
            }
            
            console.log(`Found ${userAwards.visibleUserAwards.length} visible awards for ${user.raUsername}`);
            
            // Find awards for this specific game
            const gameAwards = userAwards.visibleUserAwards.filter(award => {
                const awardGameId = String(award.awardData || award.AwardData);
                return awardGameId === String(gameId);
            });
            
            console.log(`Found ${gameAwards.length} awards for game ${gameId}`);
            
            if (gameAwards.length === 0) {
                console.log(`No awards found for ${user.raUsername} on game ${gameId}`);
                return false;
            }
            
            // Find the highest award for this game
            let highestAward = null;
            let isMastery = false;
            let isBeaten = false;
            
            for (const award of gameAwards) {
                const awardType = award.awardType || award.AwardType || '';
                const awardExtra = award.awardDataExtra || award.AwardDataExtra || 0;
                
                console.log(`Award: type="${awardType}", extra=${awardExtra}, date=${award.awardedAt || award.AwardedAt}`);
                
                const normalizedType = this.normalizeAwardKind(awardType);
                
                if (normalizedType === 'mastery') {
                    if (awardExtra === 1) { // Hardcore
                        isMastery = true;
                        highestAward = award;
                        console.log(`Found mastery award for game ${gameId}`);
                        break; // Mastery is highest, stop looking
                    }
                }
                
                if (normalizedType === 'completion') {
                    if (awardExtra === 1) { // Hardcore beaten
                        isBeaten = true;
                        if (!highestAward) {
                            highestAward = award;
                            console.log(`Found beaten award for game ${gameId}`);
                        }
                    }
                }
            }
            
            if (!highestAward) {
                console.log(`No mastery or beaten award found for ${user.raUsername} on game ${gameId}`);
                return false;
            }
            
            // Get game info
            const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
            
            // Create the award identifier with timestamp
            const systemType = gameAwardService.getGameSystemType(gameId);
            const awardType = isMastery ? 'mastery' : 'completion';
            const awardDate = new Date(highestAward.awardedAt || highestAward.AwardedAt);
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${awardType}:${awardDate.getTime()}`;
            
            console.log(`Award identifier: ${awardIdentifier}`);
            
            // For force mode, temporarily remove from session history
            const wasInSession = gameAwardService.sessionAwardHistory.has(awardIdentifier);
            if (wasInSession) {
                gameAwardService.sessionAwardHistory.delete(awardIdentifier);
                console.log(`Temporarily removed from session history for force announcement`);
            }
            
            // For force mode, temporarily remove from user's announced awards
            let wasInUserAwards = false;
            let userAwardsBackup = null;
            if (user.announcedAwards) {
                // Check for any award with same user, system, game, and type (regardless of timestamp)
                const existingAwardIndex = user.announcedAwards.findIndex(existing => {
                    const parts = existing.split(':');
                    const existingParts = awardIdentifier.split(':');
                    
                    return parts.length >= 4 && existingParts.length >= 4 &&
                           parts[0] === existingParts[0] && // username
                           parts[1] === existingParts[1] && // system
                           parts[2] === existingParts[2] && // gameId
                           parts[3] === existingParts[3];   // awardType
                });
                
                if (existingAwardIndex !== -1) {
                    wasInUserAwards = true;
                    userAwardsBackup = [...user.announcedAwards];
                    user.announcedAwards.splice(existingAwardIndex, 1);
                    await user.save();
                    console.log(`Temporarily removed similar award from user's announced awards for force announcement`);
                }
            }
            
            try {
                // Get user's profile image and thumbnail
                const profileImageUrl = await gameAwardService.getUserProfileImageUrl(user.raUsername);
                const thumbnailUrl = gameInfo?.imageIcon ? 
                    `https://retroachievements.org${gameInfo.imageIcon}` : null;
                
                // Manually send the alert using AlertUtils
                await AlertUtils.sendAchievementAlert({
                    username: user.raUsername,
                    achievementTitle: isMastery ? `Mastery of ${gameInfo.title}` : `Beaten ${gameInfo.title}`,
                    achievementDescription: isMastery ? 
                        `${user.raUsername} has mastered ${gameInfo.title} by earning all achievements in hardcore mode!` :
                        `${user.raUsername} has beaten ${gameInfo.title} by completing all core achievements!`,
                    gameTitle: gameInfo.title,
                    gameId: gameId,
                    thumbnail: thumbnailUrl,
                    badgeUrl: profileImageUrl,
                    color: isMastery ? '#FFD700' : '#C0C0C0',
                    isMastery: isMastery,
                    isBeaten: isBeaten
                }, ALERT_TYPES.MASTERY);
                
                // Add to session history and user awards (permanently this time)
                gameAwardService.sessionAwardHistory.add(awardIdentifier);
                
                if (!user.announcedAwards) {
                    user.announcedAwards = [];
                }
                user.announcedAwards.push(awardIdentifier);
                await user.save();
                
                console.log(`Successfully force-announced ${isMastery ? 'mastery' : 'beaten'} for ${user.raUsername} on ${gameInfo.title}`);
                return true;
                
            } catch (alertError) {
                console.error(`Error sending forced alert:`, alertError);
                
                // Restore previous state if announcement failed
                if (wasInSession) {
                    gameAwardService.sessionAwardHistory.add(awardIdentifier);
                }
                if (wasInUserAwards && userAwardsBackup) {
                    user.announcedAwards = userAwardsBackup;
                    await user.save();
                }
                
                return false;
            }
            
        } catch (error) {
            console.error(`Error force checking game mastery for ${user.raUsername} on game ${gameId}:`, error);
            return false;
        }
    },

    /**
     * UPDATED: Force check for monthly/shadow game awards using getUserAwards API
     * @private
     */
    async forceCheckGameAwards(user, gameId, isShadow, forceAnnounce) {
        if (!user || !gameId) return false;

        try {
            console.log(`Force checking ${isShadow ? 'shadow' : 'monthly'} game awards for ${user.raUsername} on game ${gameId}, force=${forceAnnounce}`);
            
            // If not forcing, use regular method
            if (!forceAnnounce) {
                return await gameAwardService.checkForGameAwards(user, gameId, isShadow);
            }

            // UPDATED: Use getUserAwards API to get actual award data
            const userAwards = await retroAPI.getUserAwards(user.raUsername);
            
            if (!userAwards || !userAwards.visibleUserAwards) {
                console.log(`No user awards found for ${user.raUsername}`);
                return false;
            }
            
            // Find awards for this specific game
            const gameAwards = userAwards.visibleUserAwards.filter(award => {
                const awardGameId = String(award.awardData || award.AwardData);
                return awardGameId === String(gameId);
            });
            
            console.log(`Found ${gameAwards.length} awards for ${isShadow ? 'shadow' : 'monthly'} game ${gameId}`);
            
            if (gameAwards.length === 0) {
                console.log(`No awards found for ${user.raUsername} on ${isShadow ? 'shadow' : 'monthly'} game ${gameId}`);
                return false;
            }
            
            // Find the highest award for this game
            let highestAward = null;
            let awardType = '';
            
            for (const award of gameAwards) {
                const type = award.awardType || award.AwardType || '';
                const extra = award.awardDataExtra || award.AwardDataExtra || 0;
                
                console.log(`Award: type="${type}", extra=${extra}, date=${award.awardedAt || award.AwardedAt}`);
                
                const normalizedType = this.normalizeAwardKind(type);
                
                if (normalizedType === 'mastery') {
                    if (extra === 1) { // Hardcore
                        awardType = 'mastery';
                        highestAward = award;
                        console.log(`Found mastery award for ${isShadow ? 'shadow' : 'monthly'} game ${gameId}`);
                        break;
                    }
                }
                
                if (normalizedType === 'completion') {
                    if (extra === 1) { // Hardcore
                        awardType = 'beaten';
                        if (!highestAward) {
                            highestAward = award;
                            console.log(`Found beaten award for ${isShadow ? 'shadow' : 'monthly'} game ${gameId}`);
                        }
                    }
                }
                
                if (normalizedType === 'participation') {
                    awardType = 'participation';
                    if (!highestAward) {
                        highestAward = award;
                        console.log(`Found participation award for ${isShadow ? 'shadow' : 'monthly'} game ${gameId}`);
                    }
                }
            }
            
            if (!highestAward) {
                console.log(`No mastery, beaten, or participation award found for ${user.raUsername} on ${isShadow ? 'shadow' : 'monthly'} game ${gameId}`);
                return false;
            }

            const systemType = isShadow ? 'shadow' : 'monthly';
            const awardDate = new Date(highestAward.awardedAt || highestAward.AwardedAt);
            const awardIdentifier = `${user.raUsername}:${systemType}:${gameId}:${awardType}:${awardDate.getTime()}`;

            // Temporarily bypass history checks
            const wasInSession = gameAwardService.sessionAwardHistory.has(awardIdentifier);
            if (wasInSession) {
                gameAwardService.sessionAwardHistory.delete(awardIdentifier);
            }

            let wasInUserAwards = false;
            let userAwardsBackup = null;
            if (user.announcedAwards) {
                const existingAwardIndex = user.announcedAwards.findIndex(existing => {
                    const parts = existing.split(':');
                    const existingParts = awardIdentifier.split(':');
                    
                    return parts.length >= 4 && existingParts.length >= 4 &&
                           parts[0] === existingParts[0] && // username
                           parts[1] === existingParts[1] && // system
                           parts[2] === existingParts[2] && // gameId
                           parts[3] === existingParts[3];   // awardType
                });
                
                if (existingAwardIndex !== -1) {
                    wasInUserAwards = true;
                    userAwardsBackup = [...user.announcedAwards];
                    user.announcedAwards.splice(existingAwardIndex, 1);
                    await user.save();
                }
            }

            try {
                // Manually construct and send the alert
                const gameInfo = await RetroAPIUtils.getGameInfo(gameId);
                let awardTitle = '';
                let awardColor = '';

                if (awardType === 'mastery') {
                    awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Mastery`;
                    awardColor = '#FFD700';
                } else if (awardType === 'beaten') {
                    awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Beaten`;
                    awardColor = '#C0C0C0';
                } else if (awardType === 'participation') {
                    awardTitle = `${systemType === 'shadow' ? 'Shadow' : 'Monthly'} Challenge Participation`;
                    awardColor = '#CD7F32';
                } else {
                    console.log(`Unknown award type "${awardType}" for ${systemType} game`);
                    return false;
                }

                const profileImageUrl = await gameAwardService.getUserProfileImageUrl(user.raUsername);
                const thumbnailUrl = gameInfo?.imageIcon ? 
                    `https://retroachievements.org${gameInfo.imageIcon}` : null;

                const alertType = isShadow ? ALERT_TYPES.SHADOW : ALERT_TYPES.MONTHLY;

                await AlertUtils.sendAchievementAlert({
                    username: user.raUsername,
                    achievementTitle: awardTitle,
                    achievementDescription: `${user.raUsername} has earned ${awardTitle.toLowerCase()} for ${gameInfo.title}!`,
                    gameTitle: gameInfo.title,
                    gameId: gameId,
                    thumbnail: thumbnailUrl,
                    badgeUrl: profileImageUrl,
                    color: awardColor,
                    isAward: true
                }, alertType);

                // Add to session history and user awards
                gameAwardService.sessionAwardHistory.add(awardIdentifier);
                
                if (!user.announcedAwards) {
                    user.announcedAwards = [];
                }
                user.announcedAwards.push(awardIdentifier);
                await user.save();

                console.log(`Successfully force-announced ${systemType} ${awardType} award for ${user.raUsername} on ${gameInfo.title}`);
                return true;

            } catch (alertError) {
                console.error(`Error sending forced ${systemType} alert:`, alertError);
                
                // Restore previous state
                if (wasInSession) {
                    gameAwardService.sessionAwardHistory.add(awardIdentifier);
                }
                if (wasInUserAwards && userAwardsBackup) {
                    user.announcedAwards = userAwardsBackup;
                    await user.save();
                }
                
                return false;
            }

        } catch (error) {
            console.error(`Error force checking ${isShadow ? 'shadow' : 'monthly'} game awards for ${user.raUsername} on game ${gameId}:`, error);
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
            
            // Check which system this game belongs to
            const systemType = gameAwardService.getGameSystemType(gameId);
            
            let result = false;
            
            if (systemType === 'monthly') {
                result = await this.forceCheckGameAwards(user, gameId, false, forceAnnounce);
            } else if (systemType === 'shadow') {
                result = await this.forceCheckGameAwards(user, gameId, true, forceAnnounce);
            } else {
                result = await this.forceCheckGameMastery(user, gameId, null, forceAnnounce);
            }
            
            if (result) {
                return interaction.editReply(`Successfully announced ${systemType} mastery/beaten for ${username} on ${gameInfo.title}!`);
            } else {
                return interaction.editReply(`No mastery/beaten award found for ${username} on ${gameInfo.title}.`);
            }
            
        } catch (error) {
            console.error('Error checking mastery:', error);
            return interaction.editReply('An error occurred while checking mastery. Please try again.');
        }
    },

    /**
     * Handle debugging mastery detection with detailed logging
     */
    async handleDebugMastery(interaction) {
        await interaction.deferReply();

        try {
            const username = interaction.options.getString('username');
            const gameId = interaction.options.getString('gameid');
            
            const user = await User.findOne({ raUsername: username });
            
            if (!user) {
                return interaction.editReply(`User ${username} not found in the database.`);
            }
            
            await interaction.editReply(`🔍 Running debug mastery check for ${username} on game ${gameId}...\n\n**Check the console logs for detailed output.**`);
            
            // Call the debug method
            await gameAwardService.debugCheckForGameMastery(user, gameId);
            
            // Get game info for the response
            let gameTitle = 'Unknown Game';
            try {
                const gameInfo = await retroAPI.getGameInfo(gameId);
                gameTitle = gameInfo.title;
            } catch (error) {
                // Use fallback title
            }
            
            return interaction.editReply(
                `✅ **Debug analysis completed!**\n\n` +
                `**User:** ${username}\n` +
                `**Game:** ${gameTitle} (ID: ${gameId})\n\n` +
                `📋 **Check your console logs for detailed information.**`
            );
            
        } catch (error) {
            console.error('Error in debug mastery check:', error);
            return interaction.editReply(`❌ **Error during debug check:**\n\`\`\`${error.message}\`\`\`\n\nCheck console logs for more details.`);
        }
    }
};
