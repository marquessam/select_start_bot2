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
        this.lastProgressMap = new Map(); // Store last known progress for each user
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
        const userKey = user.raUsername;
        
        try {
            // Get current progress for monthly challenge
            const monthlyProgress = await retroAPI.getUserGameProgress(
                user.raUsername,
                challenge.monthly_challange_gameid
            );

            // Get game info
            const gameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);

            // Calculate current award level
            let currentAward = null;
            if (monthlyProgress.numAwardedToUser === challenge.monthly_challange_game_total) {
                currentAward = 'MASTERY';
            } else if (monthlyProgress.numAwardedToUser >= challenge.monthly_challange_goal) {
                currentAward = 'BEATEN';
            } else if (monthlyProgress.numAwardedToUser > 0) {
                currentAward = 'PARTICIPATION';
            }

            // Get previous progress from our map
            const lastProgress = this.lastProgressMap.get(userKey) || {
                monthly: { achieved: 0, award: null },
                shadow: { achieved: 0, award: null }
            };

            // Check if award level has changed
            if (currentAward && currentAward !== lastProgress.monthly.award) {
                // User has reached a new award level, announce it
                await this.announceAchievement(
                    channel,
                    user,
                    gameInfo,
                    currentAward,
                    monthlyProgress.numAwardedToUser,
                    challenge.monthly_challange_game_total,
                    false
                );
            }

            // Update last known progress
            lastProgress.monthly = {
                achieved: monthlyProgress.numAwardedToUser,
                award: currentAward
            };

            // Check shadow challenge if it's revealed
            if (challenge.shadow_challange_revealed && challenge.shadow_challange_gameid) {
                const shadowProgress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    challenge.shadow_challange_gameid
                );

                const shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);

                // Calculate current shadow award level
                let currentShadowAward = null;
                if (shadowProgress.numAwardedToUser === challenge.shadow_challange_game_total) {
                    currentShadowAward = 'MASTERY';
                } else if (shadowProgress.numAwardedToUser >= challenge.shadow_challange_goal) {
                    currentShadowAward = 'BEATEN';
                } else if (shadowProgress.numAwardedToUser > 0) {
                    currentShadowAward = 'PARTICIPATION';
                }

                // Check if shadow award level has changed
                if (currentShadowAward && currentShadowAward !== lastProgress.shadow.award) {
                    // User has reached a new shadow award level, announce it
                    await this.announceAchievement(
                        channel,
                        user,
                        shadowGameInfo,
                        currentShadowAward,
                        shadowProgress.numAwardedToUser,
                        challenge.shadow_challange_game_total,
                        true
                    );
                }

                // Update last known shadow progress
                lastProgress.shadow = {
                    achieved: shadowProgress.numAwardedToUser,
                    award: currentShadowAward
                };
            }

            // Save updated progress to our map
            this.lastProgressMap.set(userKey, lastProgress);

        } catch (error) {
            console.error(`Error checking achievements for user ${user.raUsername}:`, error);
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
