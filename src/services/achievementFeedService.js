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
        this.isChecking = false;
    }

    setClient(client) {
        this.client = client;
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for achievement feed service');
            return;
        }

        if (this.isChecking) {
            console.log('Achievement check already in progress');
            return;
        }

        try {
            this.isChecking = true;
            await this.checkForNewAchievements();
            await this.checkForAllUserAchievements();
        } catch (error) {
            console.error('Error in achievement feed service:', error);
        } finally {
            this.isChecking = false;
        }
    }

    async checkForNewAchievements() {
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
            console.log('No active challenge found for achievement feed');
            return;
        }

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
            await this.checkUserProgress(user, currentChallenge, announcementChannel);
        }
    }

    async checkForAllUserAchievements() {
        // Get all users
        const users = await User.find({});
        if (users.length === 0) return;

        // Get the announcement channel
        const announcementChannel = await this.getAnnouncementChannel();
        if (!announcementChannel) {
            console.error('Announcement channel not found');
            return;
        }

        // Get current challenge for reference
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const currentChallenge = await Challenge.findOne({
            date: {
                $gte: currentMonthStart,
                $lt: nextMonthStart
            }
        });

        // Time window for checking recent achievements (2 hours in milliseconds)
        const timeWindow = 2 * 60 * 60 * 1000;
        const checkTime = new Date(Date.now() - timeWindow);

        // Check each user's recent achievements
        for (const user of users) {
            await this.checkUserRecentAchievements(user, announcementChannel, currentChallenge, checkTime);
        }
    }

    async checkUserProgress(user, challenge, channel) {
        try {
            // Get the challenge date key for storing in the database
            const challengeDateKey = user.constructor.formatDateKey ? 
                user.constructor.formatDateKey(challenge.date) : 
                challenge.date.toISOString().split('T')[0];
            
            // Initialize announcedAchievements for this challenge if it doesn't exist
            if (!user.announcedAchievements) {
                user.announcedAchievements = new Map();
            }
            
            // Get or initialize the achievement record for this challenge
            let achievementRecord = user.announcedAchievements.get(challengeDateKey);
            if (!achievementRecord) {
                achievementRecord = {
                    monthly: { award: null, achieved: 0 },
                    shadow: { award: null, achieved: 0 }
                };
            }

            // Get current progress for monthly challenge
            const monthlyProgress = await retroAPI.getUserGameProgress(
                user.raUsername,
                challenge.monthly_challange_gameid
            );

            // Get game info
            const gameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);

            // Check for specific achievements
            const requiredAchievements = challenge.monthly_challange_achievement_ids || [];
            const userAchievements = monthlyProgress.achievements || {};
            
            // Count how many of the required achievements the user has earned
            let earnedRequiredCount = 0;
            for (const achievementId of requiredAchievements) {
                if (userAchievements[achievementId] && userAchievements[achievementId].dateEarned) {
                    earnedRequiredCount++;
                }
            }
            
            // Calculate current award level based on specific achievements
            let currentAward = null;
            if (earnedRequiredCount === requiredAchievements.length && requiredAchievements.length > 0) {
                currentAward = 'MASTERY';
            } else if (earnedRequiredCount >= challenge.monthly_challange_goal) {
                currentAward = 'BEATEN';
            } else if (earnedRequiredCount > 0) {
                currentAward = 'PARTICIPATION';
            }

            // Check if award level has changed
            if (currentAward && currentAward !== achievementRecord.monthly.award) {
                // User has reached a new award level, announce it
                await this.announceAchievement(
                    channel,
                    user,
                    gameInfo,
                    currentAward,
                    earnedRequiredCount,
                    requiredAchievements.length,
                    false
                );
                
                // Update the achievement record
                achievementRecord.monthly = {
                    award: currentAward,
                    achieved: earnedRequiredCount
                };
                
                // Save to database
                user.announcedAchievements.set(challengeDateKey, achievementRecord);
                await user.save();
            }

            // Check shadow challenge if it's revealed
            if (challenge.shadow_challange_revealed && challenge.shadow_challange_gameid) {
                const shadowProgress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    challenge.shadow_challange_gameid
                );

                const shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);

                // Check for specific shadow achievements
                const requiredShadowAchievements = challenge.shadow_challange_achievement_ids || [];
                const userShadowAchievements = shadowProgress.achievements || {};
                
                // Count how many of the required shadow achievements the user has earned
                let earnedRequiredShadowCount = 0;
                for (const achievementId of requiredShadowAchievements) {
                    if (userShadowAchievements[achievementId] && userShadowAchievements[achievementId].dateEarned) {
                        earnedRequiredShadowCount++;
                    }
                }
                
                // Calculate current shadow award level based on specific achievements
                let currentShadowAward = null;
                if (earnedRequiredShadowCount === requiredShadowAchievements.length && requiredShadowAchievements.length > 0) {
                    currentShadowAward = 'MASTERY';
                } else if (earnedRequiredShadowCount >= challenge.shadow_challange_goal) {
                    currentShadowAward = 'BEATEN';
                } else if (earnedRequiredShadowCount > 0) {
                    currentShadowAward = 'PARTICIPATION';
                }

                // Check if shadow award level has changed
                if (currentShadowAward && currentShadowAward !== achievementRecord.shadow.award) {
                    // User has reached a new shadow award level, announce it
                    await this.announceAchievement(
                        channel,
                        user,
                        shadowGameInfo,
                        currentShadowAward,
                        earnedRequiredShadowCount,
                        requiredShadowAchievements.length,
                        true
                    );
                    
                    // Update the achievement record
                    achievementRecord.shadow = {
                        award: currentShadowAward,
                        achieved: earnedRequiredShadowCount
                    };
                    
                    // Save to database
                    user.announcedAchievements.set(challengeDateKey, achievementRecord);
                    await user.save();
                }
            }

        } catch (error) {
            console.error(`Error checking achievements for user ${user.raUsername}:`, error);
        }
    }

    async checkUserRecentAchievements(user, channel, currentChallenge, checkTime) {
        try {
            // Initialize the array to track announced achievement IDs if it doesn't exist
            if (!user.announcedAchievementIds) {
                user.announcedAchievementIds = [];
            }

            // Get recent achievements for the user
            const recentAchievements = await retroAPI.getUserRecentAchievements(user.raUsername, 100);
            
            if (!recentAchievements || !Array.isArray(recentAchievements)) {
                console.log(`No recent achievements found for ${user.raUsername}`);
                return;
            }

            // Track if we need to save the user document
            let needsSave = false;

            // Check each achievement
            for (const achievement of recentAchievements) {
                // Skip if we've already announced this achievement
                if (user.announcedAchievementIds.includes(achievement.achievementId)) {
                    continue;
                }

                // Check if the achievement is within our time window
                const achievementDate = new Date(achievement.dateEarned);
                if (achievementDate < checkTime) {
                    continue;
                }

                // Determine if this achievement is part of the monthly or shadow challenge
                let isMonthlyChallenge = false;
                let isShadowChallenge = false;

                if (currentChallenge) {
                    isMonthlyChallenge = achievement.gameId === currentChallenge.monthly_challange_gameid;
                    
                    if (currentChallenge.shadow_challange_revealed && 
                        currentChallenge.shadow_challange_gameid) {
                        isShadowChallenge = achievement.gameId === currentChallenge.shadow_challange_gameid;
                    }
                }

                // Announce the achievement
                await this.announceIndividualAchievement(
                    channel,
                    user,
                    achievement,
                    isMonthlyChallenge,
                    isShadowChallenge
                );

                // Add to announced list
                user.announcedAchievementIds.push(achievement.achievementId);
                needsSave = true;
            }

            // Limit the size of the announced achievements array to prevent excessive growth
            if (user.announcedAchievementIds.length > 1000) {
                user.announcedAchievementIds = user.announcedAchievementIds.slice(-1000);
                needsSave = true;
            }

            // Save the user if needed
            if (needsSave) {
                await user.save();
            }

        } catch (error) {
            console.error(`Error checking recent achievements for user ${user.raUsername}:`, error);
        }
    }

    async announceAchievement(channel, user, gameInfo, awardLevel, achieved, total, isShadow) {
        try {
            // Get Discord user if possible
            let discordUser = null;
            try {
                discordUser = await this.client.users.fetch(user.discordId);
            } catch (error) {
                console.error(`Error fetching Discord user for ${user.raUsername}:`, error);
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`${AWARD_EMOJIS[awardLevel]} New Achievement Unlocked!`)
                .setColor(this.getColorForAward(awardLevel))
                .setTimestamp();

            if (discordUser) {
                embed.setAuthor({
                    name: discordUser.tag,
                    iconURL: discordUser.displayAvatarURL()
                });
            }

            // Set thumbnail to game image if available
            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Build description
            let description = `**${user.raUsername}** has earned `;
            
            switch (awardLevel) {
                case 'MASTERY':
                    description += `**MASTERY** status in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!`;
                    break;
                case 'BEATEN':
                    description += `**BEATEN** status in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!`;
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
                value: `[Game Page](https://retroachievements.org/game/${gameInfo.id}) | [User Profile](https://retroachievements.org/user/${user.raUsername})`
            });

            // Send the announcement
            await channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error announcing achievement:', error);
        }
    }

    async announceIndividualAchievement(channel, user, achievement, isMonthlyChallenge, isShadowChallenge) {
        try {
            // Get Discord user if possible
            let discordUser = null;
            try {
                discordUser = await this.client.users.fetch(user.discordId);
            } catch (error) {
                console.error(`Error fetching Discord user for ${user.raUsername}:`, error);
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`🏆 Achievement Unlocked!`)
                .setColor(isMonthlyChallenge ? '#FFD700' : isShadowChallenge ? '#800080' : '#4CAF50')
                .setTimestamp();

            if (discordUser) {
                embed.setAuthor({
                    name: discordUser.tag,
                    iconURL: discordUser.displayAvatarURL()
                });
            }

            // Set thumbnail to achievement badge if available
            if (achievement.badgeUrl) {
                embed.setThumbnail(achievement.badgeUrl);
            }

            // Build description
            let description = `**${user.raUsername}** has earned an achievement in **${achievement.gameTitle}**!\n\n`;
            description += `**${achievement.title}** (${achievement.points} points)\n`;
            
            if (achievement.description) {
                description += `*${achievement.description}*\n\n`;
            }

            // Add challenge tag if applicable
            if (isMonthlyChallenge) {
                description += `🌟 *Part of this month's challenge!*`;
            } else if (isShadowChallenge) {
                description += `👻 *Part of the shadow challenge!*`;
            }

            embed.setDescription(description);

            // Add links
            const gameId = achievement.gameId;
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
}

// Create singleton instance
const achievementFeedService = new AchievementFeedService();
export default achievementFeedService;
