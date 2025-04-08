// services/achievementFeed.js
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
        // Number of recent achievements to fetch per user
        this.recentAchievementsCount = 20;
    }

    setClient(client) {
        this.client = client;
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for achievement feed service');
            return;
        }

        try {
            // Check for all recent achievements (not just challenge-related)
            await this.checkForAllNewAchievements();
            
            // Check for challenge-specific achievements and award levels
            await this.checkForChallengeAchievements();
        } catch (error) {
            console.error('Error in achievement feed service:', error);
        }
    }

    async checkForAllNewAchievements() {
        // Get all users
        const users = await User.find({});
        if (users.length === 0) return;

        // Get the announcement channel
        const announcementChannel = await this.getAnnouncementChannel();
        if (!announcementChannel) {
            console.error('Announcement channel not found');
            return;
        }

        // Process each active user
        for (const user of users) {
            if (await this.isGuildMember(user.discordId)) {
                await this.processUserRecentAchievements(user, announcementChannel);
            }
        }
    }

    async processUserRecentAchievements(user, channel) {
        try {
            // Fetch recent achievements for this user
            const recentAchievements = await retroAPI.getUserRecentAchievements(
                user.raUsername, 
                this.recentAchievementsCount
            );

            if (!recentAchievements || recentAchievements.length === 0) {
                return;
            }

            // Create a set of achievement IDs that have already been announced
            const announcedAchievements = new Set(user.announcedAchievements);

            // Process each achievement
            for (const achievement of recentAchievements) {
                // Skip achievements without necessary data
                if (!achievement.GameID || !achievement.AchievementID) {
                    continue;
                }
                
                // Generate a unique identifier for this achievement
                const achievementIdentifier = `general:${achievement.GameID}:${achievement.AchievementID}`;
                
                // Check if this achievement has already been announced
                if (!announcedAchievements.has(achievementIdentifier)) {
                    try {
                        // Get game info for the achievement
                        const gameInfo = await retroAPI.getGameInfo(achievement.GameID);
                        
                        // Skip if unable to get game info
                        if (!gameInfo) {
                            console.log(`Skipping achievement for game ${achievement.GameID} - unable to fetch game info`);
                            continue;
                        }
                        
                        // Format the achievement object to match the expected structure
                        const formattedAchievement = {
                            title: achievement.Title || 'Achievement Unlocked',
                            description: achievement.Description || '',
                            badgeUrl: achievement.BadgeURL || '',
                            points: achievement.Points || 0,
                            dateEarned: achievement.Date // Use the date from the recent achievements API
                        };
                        
                        // Announce this achievement
                        await this.announceIndividualAchievement(
                            channel,
                            user,
                            gameInfo,
                            formattedAchievement,
                            'General Achievement', // Use a different type label for non-challenge achievements
                            achievement.GameID
                        );
                        
                        // Add to the list of announced achievements
                        user.announcedAchievements.push(achievementIdentifier);
                        
                        // Save to database after each announcement to prevent duplicates
                        await user.save();
                        
                        // Add a small delay to avoid rate limits on the Discord API
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (gameInfoError) {
                        console.error(`Error processing achievement for game ${achievement.GameID}:`, gameInfoError);
                        // Continue with next achievement
                        continue;
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing recent achievements for ${user.raUsername}:`, error);
        }
    }

    async checkForChallengeAchievements() {
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

        // If no current challenge, skip this step
        if (!currentChallenge) return;

        // Get all users
        const users = await User.find({});
        if (users.length === 0) return;

        // Get the announcement channel
        const announcementChannel = await this.getAnnouncementChannel();
        if (!announcementChannel) {
            console.error('Announcement channel not found');
            return;
        }

        // Check each user's progress
        for (const user of users) {
            if (await this.isGuildMember(user.discordId)) {
                await this.checkUserProgress(user, currentChallenge, announcementChannel);
            }
        }
    }

    async checkUserProgress(user, challenge, channel) {
        try {
            // Process main challenge
            await this.processGameChallenge(
                user,
                channel,
                challenge,
                challenge.monthly_challange_gameid,
                challenge.monthly_challange_progression_achievements,
                challenge.monthly_challange_win_achievements,
                challenge.monthly_challange_game_total,
                false // Not a shadow challenge
            );

            // Check shadow challenge if it's revealed
            if (challenge.shadow_challange_revealed && challenge.shadow_challange_gameid) {
                await this.processGameChallenge(
                    user,
                    channel,
                    challenge,
                    challenge.shadow_challange_gameid,
                    challenge.shadow_challange_progression_achievements,
                    challenge.shadow_challange_win_achievements,
                    challenge.shadow_challange_game_total,
                    true // Is a shadow challenge
                );
            }
        } catch (error) {
            console.error(`Error checking achievements for user ${user.raUsername}:`, error);
        }
    }

    async processGameChallenge(user, channel, challenge, gameId, progressionAchievements, winAchievements, totalAchievements, isShadow) {
        // Get user's game progress
        const progress = await retroAPI.getUserGameProgress(
            user.raUsername,
            gameId
        );

        // Get game info
        const gameInfo = await retroAPI.getGameInfo(gameId);

        // Get the user's earned achievements
        const userEarnedAchievements = Object.entries(progress.achievements)
            .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
            .map(([id, data]) => id);

        // Announce individual achievements for progression and win conditions
        const achievementsToCheck = [...progressionAchievements, ...winAchievements];
        
        for (const achievementId of achievementsToCheck) {
            const achievement = Object.entries(progress.achievements).find(([id, data]) => id === achievementId)?.[1];
            
            if (achievement && achievement.dateEarned) {
                // Generate unique achievement identifier with prefix for shadow games
                const achievementIdentifier = isShadow 
                    ? `shadow:${gameId}:${achievementId}` 
                    : `monthly:${gameId}:${achievementId}`;
                
                // Check if this achievement has already been announced
                if (!user.announcedAchievements.includes(achievementIdentifier)) {
                    // This is a newly earned achievement, announce it
                    await this.announceIndividualAchievement(
                        channel,
                        user,
                        gameInfo,
                        achievement,
                        isShadow ? 'Shadow Challenge' : 'Monthly Challenge',
                        gameId // Pass the game ID
                    );
                    
                    // Add to the list of announced achievements
                    user.announcedAchievements.push(achievementIdentifier);
                    
                    // Save to database after each announcement to prevent duplicates
                    await user.save();
                }
            }
        }

        // Determine current award level
        let currentAward = null;
        
        // Check if user has all achievements (Mastery)
        const hasAllAchievements = progress.numAwardedToUser === totalAchievements;
        
        // Check if user has completed all progression achievements
        const hasAllProgressionAchievements = progressionAchievements.every(id => 
            userEarnedAchievements.includes(id)
        );
        
        // Check if user has at least one win condition (if any exist)
        const hasWinCondition = winAchievements.length === 0 || 
            winAchievements.some(id => userEarnedAchievements.includes(id));
        
        // Determine the award
        if (hasAllAchievements) {
            currentAward = 'MASTERY';
        } else if (hasAllProgressionAchievements && hasWinCondition) {
            currentAward = 'BEATEN';
        } else if (progress.numAwardedToUser > 0) {
            currentAward = 'PARTICIPATION';
        }

        // Generate award identifier with prefix for shadow games
        const awardIdentifier = isShadow
            ? `shadow:award:${gameId}:${currentAward}`
            : `award:${gameId}:${currentAward}`;
        
        // Check if award has been announced
        if (currentAward && !user.announcedAchievements.includes(awardIdentifier)) {
            // User has reached a new award level, announce it
            await this.announceAchievement(
                channel,
                user,
                gameInfo,
                currentAward,
                progress.numAwardedToUser,
                totalAchievements,
                isShadow,
                hasAllProgressionAchievements,
                hasWinCondition,
                gameId // Pass the game ID
            );
            
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

    async announceIndividualAchievement(channel, user, gameInfo, achievement, challengeType, gameId) {
        try {
            // Determine color based on achievement type
            let color;
            switch (challengeType) {
                case 'Monthly Challenge':
                    color = '#0099ff'; // Blue
                    break;
                case 'Shadow Challenge':
                    color = '#9B59B6'; // Purple
                    break;
                case 'General Achievement':
                    color = '#2ECC71'; // Green
                    break;
                default:
                    color = '#0099ff';
            }
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`🏆 Achievement Unlocked!`)
                .setColor(color)
                .setTimestamp();

            // Get user's profile image URL
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);

            // Use RetroAchievements username as the author
            embed.setAuthor({
                name: user.raUsername,
                iconURL: profileImageUrl
            });

            // Set thumbnail to achievement image if available, otherwise use game image
            if (achievement.badgeUrl) {
                embed.setThumbnail(achievement.badgeUrl);
            } else if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Build description
            let description;
            if (challengeType === 'General Achievement') {
                description = `**${user.raUsername}** has earned a new achievement!\n\n`;
            } else {
                description = `**${user.raUsername}** has earned a new achievement in ${challengeType === 'Shadow Challenge' ? 'the shadow challenge' : 'this month\'s challenge'}!\n\n`;
            }
            
            description += `**${achievement.title}**\n`;
            if (achievement.description) {
                description += `*${achievement.description}*\n`;
            }
            
            // Add points if available
            if (achievement.points) {
                description += `**Points:** ${achievement.points}\n`;
            }
            
            embed.setDescription(description);

            // Add game info
            embed.addFields(
                { name: 'Game', value: gameInfo.title, inline: true },
                { name: 'Type', value: challengeType, inline: true }
            );

            // Add links
            embed.addFields({
                name: 'Links',
                value: `[Game Page](https://retroachievements.org/game/${gameId}) | [User Profile](https://retroachievements.org/user/${user.raUsername})`
            });

            // Send the announcement
            await channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error announcing individual achievement:', error);
        }
    }

    async announceAchievement(channel, user, gameInfo, awardLevel, achieved, total, isShadow, hasAllProgression, hasWinCondition, gameId) {
        try {
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
                iconURL: profileImageUrl
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

            // Send the announcement
            await channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error announcing achievement:', error);
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
        if (!this.client) return null;

        try {
            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Get the channel
            const channel = await guild.channels.fetch(config.discord.achievementChannelId);
            return channel;
        } catch (error) {
            console.error('Error getting announcement channel:', error);
            return null;
        }
    }

    async pruneInactiveUsers() {
        if (!this.client) return null;

        try {
            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Prune the inactive users
            await guild.members.prune({ dry: false, days: 14 });
        } catch (error) {
            console.error('Error pruning inactive users:', error);
            return null;
        }
    }

    async isGuildMember(discordId) {
        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
          
            // If the guild doesn't exist or the bot isn't in it
            if (!guild) {
                console.error('Guild not found');
                return false;
            }
          
            // Try to get the member from the guild
            try {
                const member = await guild.members.fetch(discordId);
                // If member exists in the cache, they're a member
                return !!member;
            } catch (memberError) {
                // If the error is "Unknown Member", the user isn't in the guild
                if (memberError.code === 10007) {
                    return false;
                }
                // For other errors, log and return false
                console.error(`Error fetching guild member ${discordId}:`, memberError);
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
