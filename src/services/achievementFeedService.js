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

    async checkUserProgress(user, challenge, channel) {
        try {
            // Get the challenge date key for storing in the database
            const challengeDateKey = Challenge.formatDateKey ? 
                Challenge.formatDateKey(challenge.date) : 
                challenge.date.toISOString().split('T')[0];
            
            // Initialize announcedAchievements for this challenge if it doesn't exist
            if (!user.announcedAchievements) {
                user.announcedAchievements = new Map();
            }
            
            // Get or initialize the achievement record for this challenge
            let achievementRecord = user.announcedAchievements.get(challengeDateKey);
            if (!achievementRecord) {
                achievementRecord = {
                    monthly: { award: null, achieved: 0, announcedAchievements: [] },
                    shadow: { award: null, achieved: 0, announcedAchievements: [] }
                };
            }
            
            // Ensure the announcedAchievements arrays exist
            if (!achievementRecord.monthly.announcedAchievements) {
                achievementRecord.monthly.announcedAchievements = [];
            }
            if (!achievementRecord.shadow.announcedAchievements) {
                achievementRecord.shadow.announcedAchievements = [];
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
            
            // Check each achievement and announce newly earned ones
            for (const achievementId of requiredAchievements) {
                if (userAchievements[achievementId] && userAchievements[achievementId].dateEarned) {
                    earnedRequiredCount++;
                    
                    // Check if this achievement has already been announced
                    if (!achievementRecord.monthly.announcedAchievements.includes(achievementId)) {
                        // This is a newly earned achievement, announce it
                        await this.announceIndividualAchievement(
                            channel,
                            user,
                            gameInfo,
                            userAchievements[achievementId],
                            false
                        );
                        
                        // Add to the list of announced achievements
                        achievementRecord.monthly.announcedAchievements.push(achievementId);
                        
                        // Save to database after each announcement to prevent duplicates
                        user.announcedAchievements.set(challengeDateKey, achievementRecord);
                        await user.save();
                    }
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
                
                // Check each shadow achievement and announce newly earned ones
                for (const achievementId of requiredShadowAchievements) {
                    if (userShadowAchievements[achievementId] && userShadowAchievements[achievementId].dateEarned) {
                        earnedRequiredShadowCount++;
                        
                        // Check if this achievement has already been announced
                        if (!achievementRecord.shadow.announcedAchievements.includes(achievementId)) {
                            // This is a newly earned achievement, announce it
                            await this.announceIndividualAchievement(
                                channel,
                                user,
                                shadowGameInfo,
                                userShadowAchievements[achievementId],
                                true
                            );
                            
                            // Add to the list of announced achievements
                            achievementRecord.shadow.announcedAchievements.push(achievementId);
                            
                            // Save to database after each announcement to prevent duplicates
                            user.announcedAchievements.set(challengeDateKey, achievementRecord);
                            await user.save();
                        }
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

    async announceIndividualAchievement(channel, user, gameInfo, achievement, isShadow) {
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
                .setColor('#0099ff')
                .setTimestamp();

            if (discordUser) {
                embed.setAuthor({
                    name: discordUser.tag,
                    iconURL: discordUser.displayAvatarURL()
                });
            }

            // Set thumbnail to achievement image if available, otherwise use game image
            if (achievement.badgeUrl) {
                embed.setThumbnail(achievement.badgeUrl);
            } else if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }

            // Build description
            let description = `**${user.raUsername}** has earned a new achievement in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!\n\n`;
            description += `**${achievement.title}**\n`;
            if (achievement.description) {
                description += `*${achievement.description}*\n`;
            }
            
            embed.setDescription(description);

            // Add game info
            embed.addFields(
                { name: 'Game', value: gameInfo.title, inline: true },
                { name: 'Points', value: `${achievement.points || 0}`, inline: true },
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
            console.error('Error announcing individual achievement:', error);
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
                .setTitle(`${AWARD_EMOJIS[awardLevel]} Challenge Complete!`)
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
