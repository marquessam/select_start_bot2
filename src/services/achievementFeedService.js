// src/services/achievementFeedService.js
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';

const AWARD_EMOJIS = {
    MASTERY: '✨',
    BEATEN: '⭐',
    PARTICIPATION: '🏁'
};

class AchievementFeedService {
    constructor() {
        this.client = null;
        // Cache to store user profile image URLs to reduce API calls
        this.profileImageCache = new Map();
        // Cache TTL in milliseconds (30 minutes)
        this.cacheTTL = 30 * 60 * 1000;
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for achievement feed service');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for achievement feed service');
            return;
        }

        try {
            console.log('Starting achievement feed service check...');
            await this.checkForNewAchievements();
        } catch (error) {
            console.error('Error in achievement feed service:', error);
        }
    }

    async testAchievementChannel() {
        if (!this.client) {
            console.error('Discord client not set');
            return false;
        }

        try {
            // Get the channel
            const channel = await this.getAnnouncementChannel();
            if (!channel) {
                console.error('Could not get announcement channel');
                return false;
            }

            console.log(`Found announcement channel: ${channel.name} (ID: ${channel.id})`);
            
            // Test sending a message
            try {
                const testMessage = await channel.send('🔍 Achievement feed test message - please delete');
                console.log(`Successfully sent test message to channel ${channel.name}, message ID: ${testMessage.id}`);
                
                // Delete the test message after a moment
                setTimeout(async () => {
                    try {
                        await testMessage.delete();
                        console.log('Test message deleted');
                    } catch (deleteError) {
                        console.log('Could not delete test message:', deleteError.message);
                    }
                }, 5000);
                
                return true;
            } catch (sendError) {
                console.error(`Failed to send test message to channel: ${sendError.message}`);
                console.error('This indicates a permissions issue!');
                
                // Check permissions explicitly
                const botUser = this.client.user;
                if (botUser) {
                    const permissions = channel.permissionsFor(botUser);
                    console.log('Bot permissions in channel:');
                    console.log('- Send Messages:', permissions?.has('SendMessages') ? 'YES' : 'NO');
                    console.log('- Embed Links:', permissions?.has('EmbedLinks') ? 'YES' : 'NO');
                    console.log('- View Channel:', permissions?.has('ViewChannel') ? 'YES' : 'NO');
                }
                
                return false;
            }
        } catch (error) {
            console.error('Error testing achievement channel:', error);
            return false;
        }
    }

    async checkForNewAchievements() {
        console.log('Checking for new achievements...');
        
        // Get current challenge
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const currentChallenge = await Challenge.findOne({
            date: {
                $gte: currentMonthStart,
                $lt: nextMonthStart
            }
        });

        // Store monthly and shadow game IDs for quick lookup
        let monthlyGameId = null;
        let shadowGameId = null;
        
        if (currentChallenge) {
            monthlyGameId = currentChallenge.monthly_challange_gameid;
            if (currentChallenge.shadow_challange_revealed) {
                shadowGameId = currentChallenge.shadow_challange_gameid;
            }
            console.log(`Current monthly game: ${monthlyGameId}, shadow game: ${shadowGameId || 'Not revealed'}`);
        } else {
            console.log('No active challenge found for the current month.');
        }
        
        // Get announcement channel
        const announcementChannel = await this.getAnnouncementChannel();
        if (!announcementChannel) {
            console.error('Announcement channel not found or inaccessible');
            return;
        }
        
        console.log(`Successfully found announcement channel: ${announcementChannel.name}`);

        // Get all users
        const users = await User.find({});
        console.log(`Processing ${users.length} users for achievements`);

        for (const user of users) {
            try {
                // Verify user is a guild member
                const isMember = await this.isGuildMember(user.discordId);
                if (!isMember) {
                    // Skip non-members silently
                    continue;
                }
                
                console.log(`Checking achievements for user: ${user.raUsername}`);
                
                // Get user's recent achievements (last 50)
                const recentAchievements = await retroAPI.getUserRecentAchievements(user.raUsername, 50);
                
                if (!recentAchievements || !Array.isArray(recentAchievements) || recentAchievements.length === 0) {
                    console.log(`No recent achievements found for ${user.raUsername}`);
                    continue;
                }
                
                console.log(`Found ${recentAchievements.length} recent achievements for ${user.raUsername}`);
                
                // Initialize user's announcedAchievements array if it doesn't exist
                if (!user.announcedAchievements) {
                    user.announcedAchievements = [];
                }
                
                // Process each achievement
                for (const achievement of recentAchievements) {
                    if (!achievement || !achievement.GameID || !achievement.ID) {
                        console.log('Skipping invalid achievement');
                        continue;
                    }
                    
                    const gameId = String(achievement.GameID);
                    const achievementId = achievement.ID;
                    
                    // Determine achievement type (monthly, shadow, or regular)
                    let achievementType = 'regular';
                    if (gameId === String(monthlyGameId)) {
                        achievementType = 'monthly';
                    } else if (gameId === String(shadowGameId)) {
                        achievementType = 'shadow';
                    }
                    
                    // Create a unique identifier for this achievement
                    const achievementIdentifier = `${achievementType}:${gameId}:${achievementId}`;
                    
                    // Check if already announced
                    if (user.announcedAchievements.includes(achievementIdentifier)) {
                        // Already announced, skip
                        continue;
                    }
                    
                    console.log(`New achievement for ${user.raUsername}: ${achievement.Title} (${achievementType})`);
                    
                    // Get game info
                    const gameInfo = await retroAPI.getGameInfo(gameId);
                    
                    // Announce the achievement with proper type
                    const announced = await this.announceAchievement(
                        announcementChannel,
                        user,
                        gameInfo,
                        achievement,
                        achievementType,
                        gameId
                    );
                    
                    if (announced) {
                        // Add to user's announced achievements
                        user.announcedAchievements.push(achievementIdentifier);
                        await user.save();
                        console.log(`Saved announcement for ${user.raUsername}: ${achievementIdentifier}`);
                    }
                    
                    // Add a small delay between announcements
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                // Also check for awards for monthly and shadow challenges
                if (currentChallenge) {
                    if (monthlyGameId) {
                        await this.checkForGameAwards(user, announcementChannel, currentChallenge, monthlyGameId, false);
                    }
                    
                    if (shadowGameId) {
                        await this.checkForGameAwards(user, announcementChannel, currentChallenge, shadowGameId, true);
                    }
                }
                
                // Add a delay between users to prevent rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error processing user ${user.raUsername}:`, error);
            }
        }
        
        console.log('Finished checking for achievements');
    }

    async checkForGameAwards(user, channel, challenge, gameId, isShadow) {
        const gameIdString = String(gameId);
        console.log(`Checking for awards for ${user.raUsername} in ${isShadow ? 'shadow' : 'monthly'} game ${gameIdString}`);
        
        // Skip if already processed
        const awardIdentifierPrefix = isShadow ? 'shadow:award' : 'monthly:award';
        const existingAwards = user.announcedAchievements.filter(id => 
            id.startsWith(`${awardIdentifierPrefix}:${gameIdString}:`)
        );
        
        if (existingAwards.length >= 3) {  // All 3 award types already processed
            console.log(`All awards already processed for ${user.raUsername} in game ${gameIdString}`);
            return;
        }
        
        // Get user's game progress
        const progress = await retroAPI.getUserGameProgress(user.raUsername, gameId);
        
        // Get game info
        const gameInfo = await retroAPI.getGameInfo(gameId);
        
        // Get relevant achievement lists
        const progressionAchievements = isShadow 
            ? challenge.shadow_challange_progression_achievements 
            : challenge.monthly_challange_progression_achievements;
            
        const winAchievements = isShadow
            ? challenge.shadow_challange_win_achievements
            : challenge.monthly_challange_win_achievements;
            
        const totalAchievements = isShadow
            ? challenge.shadow_challange_game_total
            : challenge.monthly_challange_game_total;
        
        // Get the user's earned achievements
        const userEarnedAchievements = Object.entries(progress.achievements)
            .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
            .map(([id]) => id);
        
        // Determine current award level
        let currentAward = null;
        
        // Check if user has all achievements (Mastery) - only for monthly, not shadow
        const hasAllAchievements = progress.numAwardedToUser === totalAchievements;
        
        // Check if user has completed all progression achievements
        const hasAllProgressionAchievements = progressionAchievements.every(id => 
            userEarnedAchievements.includes(id)
        );
        
        // Check if user has at least one win condition (if any exist)
        const hasWinCondition = winAchievements.length === 0 || 
            winAchievements.some(id => userEarnedAchievements.includes(id));
        
        // Determine the award
        if (hasAllAchievements && !isShadow) {
            // Mastery is only for monthly challenges, not shadow
            currentAward = 'MASTERY';
        } else if (hasAllProgressionAchievements && hasWinCondition) {
            currentAward = 'BEATEN';
        } else if (progress.numAwardedToUser > 0) {
            currentAward = 'PARTICIPATION';
        }

        // Skip if no award achieved
        if (!currentAward) {
            return;
        }
        
        // Generate award identifier with prefix for shadow games
        const awardIdentifier = `${awardIdentifierPrefix}:${gameIdString}:${currentAward}`;
        
        // Check if award has been announced
        if (user.announcedAchievements.includes(awardIdentifier)) {
            return;
        }
        
        console.log(`Announcing ${currentAward} award for ${user.raUsername} in ${isShadow ? 'shadow' : 'monthly'} challenge`);
        
        // User has reached a new award level, announce it
        const announced = await this.announceGameAward(
            channel,
            user,
            gameInfo,
            currentAward,
            progress.numAwardedToUser,
            totalAchievements,
            isShadow,
            hasAllProgressionAchievements,
            hasWinCondition,
            gameId
        );
        
        if (announced) {
            // Add to announced achievements
            user.announcedAchievements.push(awardIdentifier);
            await user.save();
        }
    }

    // Get user's profile image URL with caching
    async getUserProfileImageUrl(username) {
        // Check if we have a cached entry
        const now = Date.now();
        if (this.profileImageCache.has(username)) {
            const { url, timestamp } = this.profileImageCache.get(username);
            // If cache is still valid, return the cached URL
            if (now - timestamp < this.cacheTTL) {
                return url;
            }
        }
        
        try {
            // Get user info from RetroAPI
            const userInfo = await retroAPI.getUserInfo(username);
            // Store in cache
            this.profileImageCache.set(username, {
                url: userInfo.profileImageUrl,
                timestamp: now
            });
            return userInfo.profileImageUrl;
        } catch (error) {
            console.error(`Error fetching profile image for ${username}:`, error);
            // Fallback to legacy URL format if API call fails
            return `https://retroachievements.org/UserPic/${username}.png`;
        }
    }

    async announceAchievement(channel, user, gameInfo, achievement, achievementType, gameId) {
        try {
            console.log(`Creating embed for achievement announcement: ${achievement.Title} (${achievementType})`);
            
            // Set color and title based on achievement type
            let color = '#9370DB';  // Default purple for regular achievements
            let challengeTypeText = "Achievement";
            let emoji = "🎮";
            
            if (achievementType === 'monthly') {
                color = '#0099ff';  // Blue for monthly
                challengeTypeText = "Monthly Challenge";
                emoji = "🏆";
            } else if (achievementType === 'shadow') {
                color = '#800080';  // Dark purple for shadow
                challengeTypeText = "Shadow Challenge";
                emoji = "👥";
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`${emoji} Achievement Unlocked!`)
                .setColor(color)
                .setTimestamp();

            // Get user's profile image URL
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);

            // Use RetroAchievements username as the author
            embed.setAuthor({
                name: user.raUsername,
                iconURL: profileImageUrl,
                url: `https://retroachievements.org/user/${user.raUsername}`
            });

            // Set thumbnail to achievement image if available, otherwise use game image
            if (achievement.BadgeName) {
                embed.setThumbnail(`https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`);
            } else if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Build description
            let description = '';
            if (achievementType === 'monthly' || achievementType === 'shadow') {
                description = `**${user.raUsername}** has earned a new achievement in ${achievementType === 'shadow' ? 'the shadow challenge' : 'this month\'s challenge'}!\n\n`;
            } else {
                description = `**${user.raUsername}** has earned a new achievement!\n\n`;
            }
            
            description += `**${achievement.Title}**\n`;
            
            if (achievement.Description) {
                description += `*${achievement.Description}*\n`;
            }
            
            // Add points if available
            if (achievement.Points) {
                description += `\nPoints: **${achievement.Points}**`;
            }
            
            embed.setDescription(description);

            // Add game info
            const fields = [
                { name: 'Game', value: gameInfo.title, inline: true }
            ];
            
            // Only add challenge type field for challenge games
            if (achievementType === 'monthly' || achievementType === 'shadow') {
                fields.push({ 
                    name: 'Challenge Type', 
                    value: challengeTypeText, 
                    inline: true 
                });
            }
            
            embed.addFields(fields);

            // Add links
            embed.addFields({
                name: 'Links',
                value: `[Game Page](https://retroachievements.org/game/${gameId}) | [User Profile](https://retroachievements.org/user/${user.raUsername})`
            });

            console.log(`Sending achievement announcement to channel`);
            
            // Send the announcement
            try {
                const sentMessage = await channel.send({ embeds: [embed] });
                console.log(`Successfully sent achievement announcement, message ID: ${sentMessage.id}`);
                return true;
            } catch (sendError) {
                console.error(`Failed to send announcement: ${sendError.message}`);
                
                // Try a plain text fallback
                try {
                    const fallbackText = `${emoji} **${user.raUsername}** earned "${achievement.Title}" in ${gameInfo.title}`;
                    await channel.send(fallbackText);
                    console.log('Sent plain text fallback message');
                    return true;
                } catch (fallbackError) {
                    console.error(`Even fallback message failed: ${fallbackError.message}`);
                    return false;
                }
            }

        } catch (error) {
            console.error('Error announcing achievement:', error);
            return false;
        }
    }

    async announceGameAward(channel, user, gameInfo, awardLevel, achieved, total, isShadow, hasAllProgression, hasWinCondition, gameId) {
        try {
            console.log(`Creating embed for ${awardLevel} award announcement for ${user.raUsername}`);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`${AWARD_EMOJIS[awardLevel]} Challenge Complete!`)
                .setColor(this.getColorForAward(awardLevel))
                .setTimestamp();

            // Get user's profile image URL
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);

            // Use RetroAchievements username as the author
            embed.setAuthor({
                name: user.raUsername,
                iconURL: profileImageUrl,
                url: `https://retroachievements.org/user/${user.raUsername}`
            });

            // Set thumbnail to game image if available
            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Build description
            let description = `**${user.raUsername}** has earned `;
            
            switch (awardLevel) {
                case 'MASTERY':
                    description += `**MASTERY** status in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!\n`;
                    description += `They completed all achievements in the game!`;
                    break;
                case 'BEATEN':
                    description += `**BEATEN** status in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!\n`;
                    description += `They completed all progression achievements and ${hasWinCondition ? 'at least one win condition' : 'no win conditions were required'}!`;
                    break;
                case 'PARTICIPATION':
                    description += `**PARTICIPATION** in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!`;
                    break;
            }

            embed.setDescription(description);

            // Add game info
            embed.addFields(
                { name: 'Game', value: gameInfo.title, inline: true },
                { name: 'Progress', value: `${achieved}/${total} (${Math.round(achieved/total*100)}%)`, inline: true },
                { name: 'Challenge Type', value: isShadow ? 'Shadow Challenge' : 'Monthly Challenge', inline: true }
            );

            // Add links
            embed.addFields({
                name: 'Links',
                value: `[Game Page](https://retroachievements.org/game/${gameId}) | [User Profile](https://retroachievements.org/user/${user.raUsername})`
            });

            console.log(`Sending award announcement to channel`);
            
            // Send the announcement
            try {
                const sentMessage = await channel.send({ embeds: [embed] });
                console.log(`Successfully sent award announcement, message ID: ${sentMessage.id}`);
                return true;
            } catch (sendError) {
                console.error(`Failed to send award announcement: ${sendError.message}`);
                
                // Try a plain text fallback
                try {
                    const emoji = AWARD_EMOJIS[awardLevel];
                    const fallbackText = `${emoji} **${user.raUsername}** has earned ${awardLevel} status in ${gameInfo.title}!`;
                    await channel.send(fallbackText);
                    console.log('Sent plain text fallback message for award');
                    return true;
                } catch (fallbackError) {
                    console.error(`Even fallback message failed: ${fallbackError.message}`);
                    return false;
                }
            }

        } catch (error) {
            console.error('Error announcing award:', error);
            return false;
        }
    }

    getColorForAward(awardLevel) {
        switch (awardLevel) {
            case 'MASTERY':
                return '#FFD700'; // Gold
            case 'BEATEN':
                return '#C0C0C0'; // Silver
            case 'PARTICIPATION':
                return '#CD7F32'; // Bronze
            default:
                return '#0099ff';
        }
    }

    async getAnnouncementChannel() {
        if (!this.client) {
            console.error('Discord client not set');
            return null;
        }

        try {
            // Get the configuration
            const channelId = config.discord.achievementChannelId;
            const guildId = config.discord.guildId;
            
            console.log(`Looking for channel ID ${channelId} in guild ${guildId}`);
            
            // Get the guild
            const guild = await this.client.guilds.fetch(guildId);
            if (!guild) {
                console.error(`Guild not found: ${guildId}`);
                return null;
            }

            // Get the channel
            const channel = await guild.channels.fetch(channelId);
            if (!channel) {
                console.error(`Channel not found: ${channelId}`);
                return null;
            }
            
            // Log channel details
            console.log(`Found channel: ${channel.name} (${channel.type})`);
            
            return channel;
        } catch (error) {
            console.error('Error getting announcement channel:', error);
            
            // More specific error handling
            if (error.code === 10003) {
                console.error('Channel not found - check ACHIEVEMENT_CHANNEL environment variable');
            } else if (error.code === 50001) {
                console.error('Missing access to channel - check bot permissions');
            }
            
            return null;
        }
    }

    async isGuildMember(discordId) {
        if (!discordId) return false;
        
        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) return false;
            
            try {
                const member = await guild.members.fetch(discordId);
                return !!member;
            } catch (memberError) {
                // Member not found
                return false;
            }
        } catch (error) {
            console.error('Error checking guild membership:', error);
            return false;
        }
    }
}

// Create singleton instance
const achievementFeedService = new AchievementFeedService();
export default achievementFeedService;