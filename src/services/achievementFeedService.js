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
        this.isProcessing = false;
        this.batchSize = 5; // Process users in small batches
        this.delayBetweenBatches = 60000; // 1 minute between batches
    }

    setClient(client) {
        this.client = client;
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for achievement feed service');
            return;
        }

        if (this.isProcessing) {
            console.log('Achievement feed service is already processing');
            return;
        }

        try {
            this.isProcessing = true;
            await this.checkForNewAchievements();
        } catch (error) {
            console.error('Error in achievement feed service:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async checkForNewAchievements() {
        console.log("Starting achievement feed check...");
        
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
        if (users.length === 0) {
            console.log('No users found for achievement feed');
            return;
        }

        // Get the announcement channel
        const announcementChannel = await this.getAnnouncementChannel();
        if (!announcementChannel) {
            console.error('Achievement announcement channel not found');
            return;
        }
        
        console.log(`Found ${users.length} users to check for new achievements, processing in batches of ${this.batchSize}`);

        // Process users in small batches to avoid overwhelming the RetroAchievements API
        const activeUsers = [];
        for (const user of users) {
            if (await this.isGuildMember(user.discordId)) {
                activeUsers.push(user);
            }
        }
        
        console.log(`${activeUsers.length} active guild members to process`);
        
        // Process in small batches with delay between batches
        for (let i = 0; i < activeUsers.length; i += this.batchSize) {
            const userBatch = activeUsers.slice(i, i + this.batchSize);
            console.log(`Processing batch ${Math.floor(i/this.batchSize) + 1} of ${Math.ceil(activeUsers.length/this.batchSize)}, with ${userBatch.length} users`);
            
            // Process each user in the batch sequentially
            for (const user of userBatch) {
                try {
                    await this.checkUserProgress(user, currentChallenge, announcementChannel);
                    // Add small delay between users within a batch
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (error) {
                    console.error(`Error checking achievements for user ${user.raUsername}:`, error);
                }
            }
            
            // If this isn't the last batch, wait before processing the next batch
            if (i + this.batchSize < activeUsers.length) {
                console.log(`Waiting ${this.delayBetweenBatches/1000} seconds before processing next batch...`);
                await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
            }
        }
        
        console.log("Achievement feed check completed");
    }

    async checkUserProgress(user, challenge, channel) {
        try {
            console.log(`Checking progress for user: ${user.raUsername}`);
            
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
                // Add a delay before checking shadow challenge to be gentler with the API
                await new Promise(resolve => setTimeout(resolve, 3000));
                
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
        console.log(`Checking ${isShadow ? 'shadow' : 'main'} game progress for ${user.raUsername} on game ${gameId}`);
        
        const progress = await retroAPI.getUserGameProgress(
            user.raUsername,
            gameId
        );

        if (!progress || !progress.achievements) {
            console.log(`No progress data found for ${user.raUsername} on game ${gameId}`);
            return;
        }

        // Get game info with a delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        const gameInfo = await retroAPI.getGameInfo(gameId);

        // Get the user's earned achievements
        const userEarnedAchievements = Object.entries(progress.achievements)
            .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
            .map(([id, data]) => ({
                id,
                ...data
            }));
            
        console.log(`${user.raUsername} has earned ${userEarnedAchievements.length} achievements in ${gameInfo.title}`);

        // Current month achievements (using strict date check)
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const achievementsEarnedThisMonth = userEarnedAchievements.filter(achievement => {
            if (!achievement.dateEarned) return false;
            const earnedDate = new Date(achievement.dateEarned);
            return earnedDate >= currentMonthStart;
        });
        
        console.log(`${user.raUsername} has earned ${achievementsEarnedThisMonth.length} achievements this month in ${gameInfo.title}`);

        // If no achievements earned this month, skip further processing
        if (achievementsEarnedThisMonth.length === 0) {
            return;
        }

        // Announce individual achievements for progression and win conditions
        const achievementsToCheck = [...progressionAchievements, ...winAchievements];
        
        for (const achievementId of achievementsToCheck) {
            const achievement = progress.achievements[achievementId];
            
            if (achievement && achievement.dateEarned) {
                const earnedDate = new Date(achievement.dateEarned);
                
                // Only announce achievements earned this month
                if (earnedDate >= currentMonthStart) {
                    // Generate unique achievement identifier
                    const achievementIdentifier = `${gameId}:${achievementId}`;
                    
                    // Check if this achievement has already been announced
                    if (!user.announcedAchievements.includes(achievementIdentifier)) {
                        console.log(`New achievement to announce for ${user.raUsername}: ${achievement.title}`);
                        
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
                        
                        // Add delay between individual achievement announcements
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        }

        // Determine current award level
        let currentAward = null;
        
        // Check if user has all achievements (Mastery)
        const hasAllAchievements = userEarnedAchievements.length === totalAchievements;
        
        // Check if user has completed all progression achievements
        const earnedProgressionIds = userEarnedAchievements.map(a => a.id);
        const hasAllProgressionAchievements = progressionAchievements.length > 0 && 
            progressionAchievements.every(id => earnedProgressionIds.includes(id));
        
        // Check if user has at least one win condition (if any exist)
        const hasWinCondition = winAchievements.length === 0 || 
            winAchievements.some(id => earnedProgressionIds.includes(id));
        
        // Determine the award
        if (hasAllAchievements) {
            currentAward = 'MASTERY';
        } else if (hasAllProgressionAchievements && hasWinCondition) {
            currentAward = 'BEATEN';
        } else if (userEarnedAchievements.length > 0) {
            currentAward = 'PARTICIPATION';
        }

        // Generate award identifier
        const awardIdentifier = `award:${gameId}:${currentAward}`;
        
        // Check if award has been announced
        if (currentAward && !user.announcedAchievements.includes(awardIdentifier)) {
            console.log(`New award to announce for ${user.raUsername}: ${currentAward}`);
            
            // User has reached a new award level, announce it
            await this.announceAchievement(
                channel,
                user,
                gameInfo,
                currentAward,
                userEarnedAchievements.length,
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
            console.log(`Sent individual achievement announcement for ${user.raUsername}`);

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
            console.log(`Sent award announcement for ${user.raUsername}: ${awardLevel}`);

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
            console.log(`Looking for achievement channel with ID: ${config.discord.achievementChannelId}`);
            const channel = await guild.channels.fetch(config.discord.achievementChannelId);
            
            if (!channel) {
                console.error('Achievement channel not found');
                return null;
            }
            
            console.log(`Found achievement channel: ${channel.name}`);
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
          
            // If the guild doesn't exist or the bot isn't in it
            if (!guild) {
                console.error('Guild not found');
                return false;
            }
          
            // Try to get the member from the guild
            try {
                const member = await guild.members.fetch(discordId);
                return Boolean(member);
            } catch {
                // Member not found in guild
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
