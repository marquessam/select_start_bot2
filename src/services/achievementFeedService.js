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
            .filter(([id, data]) => data.dateEarned !== null)
            .map(([id, data]) => id);

        // Announce individual achievements for progression and win conditions
        const achievementsToCheck = [...progressionAchievements, ...winAchievements];
        
        for (const achievementId of achievementsToCheck) {
            const achievement = Object.entries(progress.achievements).find(([id, data]) => id === achievementId)[1];
            
            if (achievement && achievement.dateEarned) {
                // Generate unique achievement identifier
                const achievementIdentifier = `${gameId}:${achievementId}`;
                
                // Check if this achievement has already been announced
                if (!user.announcedAchievements.includes(achievementIdentifier)) {
                    // This is a newly earned achievement, announce it
                    await this.announceIndividualAchievement(
                        channel,
                        user,
                        gameInfo,
                        achievement,
                        isShadow
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

        // Generate award identifier
        const awardIdentifier = `award:${gameId}:${currentAward}`;
        
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
                hasWinCondition
            );
            
            // Add to announced achievements
            user.announcedAchievements.push(awardIdentifier);
            await user.save();
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

    async announceAchievement(channel, user, gameInfo, awardLevel, achieved, total, isShadow, hasAllProgression, hasWinCondition) {
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