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
            await this.checkForChallengeAchievements();
        } catch (error) {
            console.error('Error in achievement feed service:', error);
        }
    }

    async checkForChallengeAchievements() {
        console.log('Checking for challenge achievements...');
        
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

        if (!currentChallenge) {
            console.log('No active challenge found for the current month.');
            return;
        }
        
        console.log(`Found current challenge with game ID: ${currentChallenge.monthly_challange_gameid}`);
        
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
                    // console.log(`Skipping user ${user.raUsername} - not a guild member`);
                    continue;
                }
                
                console.log(`Checking achievements for user: ${user.raUsername}`);
                
                // Check monthly challenge
                await this.checkUserChallengeGame(
                    user,
                    announcementChannel,
                    currentChallenge,
                    currentChallenge.monthly_challange_gameid,
                    false // Not a shadow game
                );
                
                // Check shadow challenge if it's revealed
                if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                    await this.checkUserChallengeGame(
                        user,
                        announcementChannel,
                        currentChallenge,
                        currentChallenge.shadow_challange_gameid,
                        true // Is a shadow game
                    );
                }
                
                // Add a delay between users to prevent rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error processing user ${user.raUsername}:`, error);
            }
        }
        
        console.log('Finished checking for challenge achievements');
    }

    async checkUserChallengeGame(user, channel, challenge, gameId, isShadow) {
        console.log(`Checking ${isShadow ? 'shadow' : 'monthly'} challenge progress for ${user.raUsername}, game ${gameId}`);
        
        // Get user's recent achievements (last 50)
        const recentAchievements = await retroAPI.getUserRecentAchievements(user.raUsername, 50);
        
        if (!recentAchievements || !Array.isArray(recentAchievements) || recentAchievements.length === 0) {
            console.log(`No recent achievements found for ${user.raUsername}`);
            return;
        }
        
        console.log(`Found ${recentAchievements.length} recent achievements for ${user.raUsername}`);
        
        // Filter to only achievements for this game
        const gameAchievements = recentAchievements.filter(achievement => {
            return String(achievement.GameID) === String(gameId);
        });
        
        if (gameAchievements.length === 0) {
            console.log(`No achievements found for ${user.raUsername} in game ${gameId}`);
            return;
        }
        
        console.log(`Found ${gameAchievements.length} achievements for ${user.raUsername} in game ${gameId}`);
        
        // Get game info for the announcement
        const gameInfo = await retroAPI.getGameInfo(gameId);
        
        // Initialize user's announcedAchievements array if it doesn't exist
        if (!user.announcedAchievements) {
            user.announcedAchievements = [];
        }
        
        // Announce each achievement that hasn't been announced yet
        for (const achievement of gameAchievements) {
            // Create unique achievement identifier
            const achievementId = achievement.ID;
            const achievementIdentifier = `${isShadow ? 'shadow' : 'monthly'}:${gameId}:${achievementId}`;
            
            // Check if already announced
            if (user.announcedAchievements.includes(achievementIdentifier)) {
                continue;
            }
            
            console.log(`Announcing new achievement for ${user.raUsername}: ${achievement.Title}`);
            
            // Announce the achievement
            await this.announceAchievement(
                channel,
                user,
                gameInfo,
                achievement,
                isShadow,
                gameId
            );
            
            // Add to announced achievements
            user.announcedAchievements.push(achievementIdentifier);
            await user.save();
            
            // Add a small delay between announcements
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Also check for awards (mastery, beaten, etc.)
        await this.checkForGameAwards(user, channel, challenge, gameId, isShadow);
    }

    async checkForGameAwards(user, channel, challenge, gameId, isShadow) {
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
        const awardIdentifier = isShadow
            ? `shadow:award:${gameId}:${currentAward}`
            : `award:${gameId}:${currentAward}`;
        
        // Check if award has been announced
        if (user.announcedAchievements.includes(awardIdentifier)) {
            return;
        }
        
        console.log(`Announcing ${currentAward} award for ${user.raUsername} in ${isShadow ? 'shadow' : 'monthly'} challenge`);
        
        // User has reached a new award level, announce it
        await this.announceGameAward(
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
        
        // Add to announced achievements
        user.announcedAchievements.push(awardIdentifier);
        await user.save();
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

    async announceAchievement(channel, user, gameInfo, achievement, isShadow, gameId) {
        try {
            console.log(`Creating embed for achievement announcement: ${achievement.Title}`);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`🏆 Achievement Unlocked!`)
                .setColor('#0099ff')
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
            let description = `**${user.raUsername}** has earned a new achievement in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!\n\n`;
            description += `**${achievement.Title}**\n`;
            if (achievement.Description) {
                description += `*${achievement.Description}*\n`;
            }
            
            embed.setDescription(description);

            // Add game info
            embed.addFields(
                { name: 'Game', value: gameInfo.title, inline: true },
                { name: 'Challenge Type', value: isShadow ? 'Shadow Challenge' : 'Monthly Challenge', inline: true }
            );

            // Add links
            embed.addFields({
                name: 'Links',
                value: `[Game Page](https://retroachievements.org/game/${gameId}) | [User Profile](https://retroachievements.org/user/${user.raUsername})`
            });

            console.log(`Sending achievement announcement to channel`);
            
            // Send the announcement
            await channel.send({ embeds: [embed] });
            console.log(`Successfully sent achievement announcement`);

        } catch (error) {
            console.error('Error announcing individual achievement:', error);
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
            await channel.send({ embeds: [embed] });
            console.log(`Successfully sent award announcement`);

        } catch (error) {
            console.error('Error announcing achievement award:', error);
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
            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error(`Guild not found: ${config.discord.guildId}`);
                return null;
            }

            console.log(`Fetching achievement channel: ${config.discord.achievementChannelId}`);
            
            // Get the channel
            const channel = await guild.channels.fetch(config.discord.achievementChannelId);
            if (!channel) {
                console.error(`Channel not found: ${config.discord.achievementChannelId}`);
                return null;
            }
            
            // Verify permissions
            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions || !permissions.has('SendMessages')) {
                console.error(`Missing permission to send messages in channel: ${channel.name}`);
                return null;
            }
            
            return channel;
        } catch (error) {
            console.error('Error getting announcement channel:', error);
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