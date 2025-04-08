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
        // Store timestamps of last checked achievements to avoid duplicates
        this.lastCheckedTimestamps = new Map();
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
            await this.checkForNewAchievements();
        } catch (error) {
            console.error('Error in achievement feed service:', error);
        }
    }

    async checkForNewAchievements() {
        // Get current challenge for special handling
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const currentChallenge = await Challenge.findOne({
            date: {
                $gte: currentMonthStart,
                $lt: nextMonthStart
            }
        });

        // Get all users
        const users = await User.find({});
        if (users.length === 0) return;

        // Get the announcement channel
        const announcementChannel = await this.getAnnouncementChannel();
        if (!announcementChannel) {
            console.error('Announcement channel not found');
            return;
        }

        // Prune inactive users from discord
        await this.pruneInactiveUsers();

        // For each user, fetch recent achievements (all games)
        for (const user of users) {
            if (!await this.isGuildMember(user.discordId)) continue;
            
            try {
                // Get the last timestamp we checked for this user
                const lastCheckedTime = this.lastCheckedTimestamps.get(user.raUsername) || 0;
                
                // Fetch recent achievements (limit to 50)
                const recentAchievements = await retroAPI.getUserRecentAchievements(user.raUsername, 50);
                
                if (!recentAchievements || recentAchievements.length === 0) continue;
                
                console.log(`Fetched ${recentAchievements.length} recent achievements for ${user.raUsername}`);
                
                // Filter to new achievements only based on timestamp
                const newAchievements = recentAchievements.filter(achievement => {
                    const achievementDate = new Date(achievement.Date || achievement.date);
                    return achievementDate.getTime() > lastCheckedTime;
                });
                
                if (newAchievements.length === 0) continue;
                
                console.log(`Found ${newAchievements.length} new achievements for ${user.raUsername}`);
                
                // Update the last checked timestamp
                const mostRecentDate = newAchievements.reduce((latest, achievement) => {
                    const achievementDate = new Date(achievement.Date || achievement.date);
                    return Math.max(latest, achievementDate.getTime());
                }, lastCheckedTime);
                
                this.lastCheckedTimestamps.set(user.raUsername, mostRecentDate);
                
                // Process each achievement
                for (const achievement of newAchievements) {
                    // Determine if this is a monthly or shadow challenge game
                    const gameId = String(achievement.GameID || achievement.gameId);
                    const isMonthlyGame = currentChallenge && String(currentChallenge.monthly_challange_gameid) === gameId;
                    const isShadowGame = currentChallenge && currentChallenge.shadow_challange_revealed && 
                                        String(currentChallenge.shadow_challange_gameid) === gameId;
                    
                    // Generate a unique identifier for this achievement
                    const achievementId = achievement.ID || achievement.id;
                    const achievementIdentifier = `${user.raUsername}:${gameId}:${achievementId}`;
                    
                    // Check if already announced
                    if (user.announcedAchievements.includes(achievementIdentifier)) {
                        continue;
                    }
                    
                    // Get game info
                    const gameInfo = await retroAPI.getGameInfo(gameId);
                    
                    // Announce achievement
                    if (isMonthlyGame || isShadowGame) {
                        // Use special formatting for challenge games
                        await this.announceIndividualAchievement(
                            announcementChannel,
                            user,
                            gameInfo,
                            achievement,
                            isShadowGame,
                            gameId
                        );
                    } else {
                        // Use general announcement for other games
                        await this.announceGeneralAchievement(
                            announcementChannel,
                            user,
                            gameInfo,
                            achievement,
                            gameId
                        );
                    }
                    
                    // Add to the list of announced achievements
                    user.announcedAchievements.push(achievementIdentifier);
                    await user.save();
                }
                
                // If there were achievements from challenge games, also check for awards
                if (currentChallenge && newAchievements.some(a => 
                    String(a.GameID || a.gameId) === String(currentChallenge.monthly_challange_gameid) ||
                    (currentChallenge.shadow_challange_revealed && 
                     String(a.GameID || a.gameId) === String(currentChallenge.shadow_challange_gameid))
                )) {
                    await this.checkUserAwards(user, currentChallenge, announcementChannel);
                }
                
            } catch (error) {
                console.error(`Error processing achievements for user ${user.raUsername}:`, error);
            }
        }
    }

    async checkUserAwards(user, challenge, channel) {
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
            console.error(`Error checking awards for user ${user.raUsername}:`, error);
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

    // New method for announcing general achievements (non-challenge games)
    async announceGeneralAchievement(channel, user, gameInfo, achievement, gameId) {
        try {
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`🎮 Achievement Unlocked!`)
                .setColor('#9370DB') // Medium Purple color for non-challenge achievements
                .setTimestamp();

            // Get user's profile image URL
            const profileImageUrl = await this.getUserProfileImageUrl(user.raUsername);

            // Use RetroAchievements username as the author
            embed.setAuthor({
                name: user.raUsername,
                iconURL: profileImageUrl
            });

            // Set thumbnail to achievement image if available, otherwise use game image
            if (achievement.BadgeName) {
                embed.setThumbnail(`https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`);
            } else if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Build description
            let description = `**${user.raUsername}** has earned a new achievement!\n\n`;
            description += `**${achievement.Title || achievement.title}**\n`;
            if (achievement.Description || achievement.description) {
                description += `*${achievement.Description || achievement.description}*\n`;
            }
            
            // Add points info if available
            const points = achievement.Points || achievement.points || 0;
            if (points) {
                description += `Points: ${points}\n`;
            }
            
            embed.setDescription(description);

            // Add game info
            embed.addFields(
                { name: 'Game', value: gameInfo.title, inline: true },
                { name: 'Console', value: gameInfo.consoleName || 'Unknown', inline: true }
            );

            // Add links
            embed.addFields({
                name: 'Links',
                value: `[Game Page](https://retroachievements.org/game/${gameId}) | [User Profile](https://retroachievements.org/user/${user.raUsername})`
            });

            // Send the announcement
            await channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error announcing general achievement:', error);
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

    async announceIndividualAchievement(channel, user, gameInfo, achievement, isShadow, gameId) {
        try {
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
                iconURL: profileImageUrl
            });

            // Set thumbnail to achievement image if available, otherwise use game image
            if (achievement.BadgeName) {
                embed.setThumbnail(`https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`);
            } else if (achievement.badgeUrl) {
                embed.setThumbnail(achievement.badgeUrl);
            } else if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Build description
            let description = `**${user.raUsername}** has earned a new achievement in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!\n\n`;
            description += `**${achievement.Title || achievement.title}**\n`;
            if (achievement.Description || achievement.description) {
                description += `*${achievement.Description || achievement.description}*\n`;
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
                return null;
            }
          
            // Try to get the member from the guild
            const member = await guild.members.fetch(discordId);
          
            // If member exists in the cache, they're a member
            return !!member;
          
        } catch (error) {
            console.error('Error checking guild membership:', error);
            return false;
        }
    }
}

// Create singleton instance
const achievementFeedService = new AchievementFeedService();
export default achievementFeedService;
