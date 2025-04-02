// src/services/enhancedAchievementFeedService.js
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

class EnhancedAchievementFeedService {
    constructor() {
        this.client = null;
        this.isUpdating = false;
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.announcementHistory = new Set();
        this.isInitializing = false;
        this.initializationComplete = false;
        this.lastCheckedTimestamps = new Map(); // username -> timestamp
    }

    setClient(client) {
        this.client = client;
    }

    async initialize() {
        if (this.isInitializing) {
            console.log('[ACHIEVEMENT FEED] Already initializing...');
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.isInitializing = true;
        try {
            console.log('[ACHIEVEMENT FEED] Initializing...');
            
            // Get all users
            const users = await User.find({});
            
            // Get all recent achievements for initialization
            const allAchievements = await this.fetchAllRecentAchievements(users);
            
            // Record the most recent achievement timestamp for each user
            // to avoid announcing old achievements
            for (const user of users) {
                const username = user.raUsername.toLowerCase();
                const recentAchievements = allAchievements.filter(a => 
                    a.username.toLowerCase() === username && a.achievements?.length > 0
                );
                
                if (recentAchievements.length > 0 && recentAchievements[0].achievements.length > 0) {
                    const mostRecent = recentAchievements[0].achievements[0];
                    const timestamp = new Date(mostRecent.dateEarned || mostRecent.DateEarned).getTime();
                    this.lastCheckedTimestamps.set(username, timestamp);
                }
            }
            
            this.initializationComplete = true;
            console.log('[ACHIEVEMENT FEED] Initialization complete');
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Initialization error:', error);
        } finally {
            this.isInitializing = false;
        }
    }

    async start() {
        if (!this.client) {
            console.error('[ACHIEVEMENT FEED] Discord client not set for achievement feed service');
            return;
        }

        if (this.isUpdating) {
            console.log('[ACHIEVEMENT FEED] Achievement check already in progress');
            return;
        }

        try {
            this.isUpdating = true;
            
            // Make sure we're initialized
            if (!this.initializationComplete) {
                await this.initialize();
            }
            
            await this.checkForNewAchievements();
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error in achievement feed service:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    async fetchAllRecentAchievements(users) {
        // This function fetches recent achievements for all users
        // We'll use a scaled approach that respects rate limits
        
        try {
            // We'll only check the most recently active users to save API calls
            const activeUsers = await this.getActiveUsers(users);
            
            console.log(`[ACHIEVEMENT FEED] Fetching recent achievements for ${activeUsers.length} active users`);
            
            // To avoid rate limiting, we'll process users in small chunks with delays
            const CHUNK_SIZE = 2; // Process 2 users at a time
            const CHUNK_DELAY = 2000; // 2 seconds between chunks
            const MAX_ACHIEVEMENTS = 20; // Recent achievements to fetch per user
            
            const results = [];
            
            for (let i = 0; i < activeUsers.length; i += CHUNK_SIZE) {
                const chunk = activeUsers.slice(i, i + CHUNK_SIZE);
                
                // Process users in the current chunk
                const chunkPromises = chunk.map(async (user) => {
                    try {
                        const achievements = await retroAPI.getUserRecentAchievements(user.raUsername, MAX_ACHIEVEMENTS);
                        return {
                            username: user.raUsername,
                            achievements: achievements || []
                        };
                    } catch (error) {
                        console.error(`[ACHIEVEMENT FEED] Error fetching achievements for ${user.raUsername}:`, error);
                        return {
                            username: user.raUsername,
                            achievements: []
                        };
                    }
                });
                
                const chunkResults = await Promise.all(chunkPromises);
                results.push(...chunkResults);
                
                // Add delay between chunks unless it's the last chunk
                if (i + CHUNK_SIZE < activeUsers.length) {
                    await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY));
                }
            }
            
            return results;
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error fetching all recent achievements:', error);
            return [];
        }
    }

    async getActiveUsers(allUsers, limit = 20) {
        try {
            // Get current month's challenge
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
                // If no current challenge, return random selection
                return this.getRandomUsers(allUsers, limit);
            }
            
            // Get users who have made progress in current challenge
            const activeUsers = [];
            
            for (const user of allUsers) {
                // Check if user has monthlyChallenges map entry for current month
                const monthKey = User.formatDateKey(currentChallenge.date);
                const hasProgress = user.monthlyChallenges.has(monthKey) || user.shadowChallenges.has(monthKey);
                
                if (hasProgress) {
                    activeUsers.push(user);
                    if (activeUsers.length >= limit) break;
                }
            }
            
            // If we don't have enough active users, add random users to meet the limit
            if (activeUsers.length < limit) {
                const remainingUsers = allUsers.filter(u => !activeUsers.includes(u));
                const randomUsers = this.getRandomUsers(remainingUsers, limit - activeUsers.length);
                activeUsers.push(...randomUsers);
            }
            
            return activeUsers;
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error getting active users:', error);
            return this.getRandomUsers(allUsers, limit);
        }
    }

    getRandomUsers(users, count) {
        // Shuffle array and take the first 'count' elements
        return [...users]
            .sort(() => 0.5 - Math.random())
            .slice(0, count);
    }

    async checkForNewAchievements() {
        // Get all users
        const users = await User.find({});
        if (users.length === 0) return;

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
            console.log('[ACHIEVEMENT FEED] No active challenge found');
            return;
        }

        // Get the announcement channel
        const announcementChannel = await this.getAnnouncementChannel();
        if (!announcementChannel) {
            console.error('[ACHIEVEMENT FEED] Announcement channel not found');
            return;
        }

        // Get recent achievements for active users
        const allRecentAchievements = await this.fetchAllRecentAchievements(users);
        
        // Process each user's achievements
        for (const { username, achievements } of allRecentAchievements) {
            if (!achievements || achievements.length === 0) continue;
            
            const user = users.find(u => u.raUsername.toLowerCase() === username.toLowerCase());
            if (!user) continue;
            
            // Get the last checked timestamp for this user
            const lastCheckedTimestamp = this.lastCheckedTimestamps.get(username.toLowerCase()) || 0;
            
            // Filter for new achievements since last check
            const newAchievements = achievements.filter(achievement => {
                const earnedDate = new Date(achievement.dateEarned || achievement.DateEarned);
                return earnedDate.getTime() > lastCheckedTimestamp;
            });
            
            if (newAchievements.length === 0) continue;
            
            // Update the timestamp to the most recent achievement
            if (newAchievements.length > 0) {
                const mostRecentAchievement = newAchievements[0];
                const timestamp = new Date(
                    mostRecentAchievement.dateEarned || mostRecentAchievement.DateEarned
                ).getTime();
                this.lastCheckedTimestamps.set(username.toLowerCase(), timestamp);
            }
            
            // Process the new achievements
            for (const achievement of newAchievements) {
                // Only announce achievements for monthly or shadow challenge games
                const gameId = achievement.gameId || achievement.GameID;
                
                if (gameId === currentChallenge.monthly_challange_gameid ||
                    (currentChallenge.shadow_challange_revealed && gameId === currentChallenge.shadow_challange_gameid)) {
                    
                    // Create a unique identifier for this achievement to avoid duplicates
                    const achievementKey = `${username}-${gameId}-${achievement.id || achievement.ID}`;
                    
                    // Check if we've already announced this
                    if (!this.announcementHistory.has(achievementKey)) {
                        await this.announceAchievement(
                            announcementChannel,
                            user,
                            achievement,
                            gameId === currentChallenge.shadow_challange_gameid
                        );
                        
                        // Mark as announced
                        this.announcementHistory.add(achievementKey);
                    }
                }
            }
            
            // Update the user record with the new achievements
            await this.updateUserProgress(user, currentChallenge, newAchievements);
            
            // Add a small delay between users to prevent rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    async updateUserProgress(user, challenge, newAchievements) {
        // Group achievements by game
        const achievementsByGame = {};
        
        for (const achievement of newAchievements) {
            const gameId = achievement.gameId || achievement.GameID;
            if (!achievementsByGame[gameId]) {
                achievementsByGame[gameId] = [];
            }
            achievementsByGame[gameId].push(achievement);
        }
        
        // Process each game's achievements
        for (const [gameId, achievements] of Object.entries(achievementsByGame)) {
            // Skip games that aren't part of the challenge
            if (gameId !== challenge.monthly_challange_gameid && 
                gameId !== challenge.shadow_challange_gameid) {
                continue;
            }
            
            // Determine if this is for the monthly or shadow challenge
            const isMonthly = (gameId === challenge.monthly_challange_gameid);
            const isShadow = (gameId === challenge.shadow_challange_gameid);
            
            if (isMonthly) {
                // Get full game progress to determine award level
                const progress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    gameId
                );
                
                // Calculate award based on achievements
                let awardLevel = 0;
                
                // For mastery (level 3), all achievements must be completed
                if (progress.numAwardedToUser === challenge.monthly_challange_game_total) {
                    awardLevel = 3;
                }
                // For beaten (level 2), all progression achievements must be completed
                else if (this.hasCompletedProgression(progress, challenge.monthly_challange_progression_achievements, challenge.monthly_challange_win_achievements)) {
                    awardLevel = 2;
                }
                // For participation (level 1), at least one achievement
                else if (progress.numAwardedToUser > 0) {
                    awardLevel = 1;
                }
                
                // Update user's monthly challenge progress if it's better than current
                const monthKey = User.formatDateKey(challenge.date);
                const currentProgress = user.monthlyChallenges.get(monthKey)?.progress || 0;
                
                if (awardLevel > currentProgress) {
                    user.monthlyChallenges.set(monthKey, { progress: awardLevel });
                    await user.save();
                }
            }
            
            else if (isShadow && challenge.shadow_challange_revealed) {
                // Get full game progress for shadow game
                const progress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    gameId
                );
                
                // Calculate award based on achievements
                let awardLevel = 0;
                
                // For shadow games, beaten (level 2) is the highest
                if (this.hasCompletedProgression(progress, challenge.shadow_challange_progression_achievements, challenge.shadow_challange_win_achievements)) {
                    awardLevel = 2;
                }
                // For participation (level 1), at least one achievement
                else if (progress.numAwardedToUser > 0) {
                    awardLevel = 1;
                }
                
                // Update user's shadow challenge progress if it's better than current
                const monthKey = User.formatDateKey(challenge.date);
                const currentProgress = user.shadowChallenges.get(monthKey)?.progress || 0;
                
                if (awardLevel > currentProgress) {
                    user.shadowChallenges.set(monthKey, { progress: awardLevel });
                    await user.save();
                }
            }
        }
    }

    hasCompletedProgression(progress, progressionAchievements, winAchievements) {
        // Check if all progression achievements have been earned
        const earnedAchievements = Object.entries(progress.achievements)
            .filter(([id, data]) => data.dateEarned || data.DateEarned)
            .map(([id]) => id);
        
        const hasAllProgression = progressionAchievements.every(id => 
            earnedAchievements.includes(id)
        );
        
        // Check if at least one win achievement is earned (if required)
        const hasWinCondition = winAchievements.length === 0 || 
            winAchievements.some(id => earnedAchievements.includes(id));
        
        return hasAllProgression && hasWinCondition;
    }

    async announceAchievement(channel, user, achievement, isShadow) {
        try {
            // Create achievement embed
            const embed = await this.createAchievementEmbed(user, achievement, isShadow);
            
            // Queue the announcement
            await this.queueAnnouncement({ embeds: [embed] });
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error announcing achievement:', error);
        }
    }

    async createAchievementEmbed(user, achievement, isShadow) {
        try {
            // Get game info
            const gameId = achievement.gameId || achievement.GameID;
            const gameInfo = await retroAPI.getGameInfo(gameId);
            
            // Get achievement details
            const title = achievement.title || achievement.Title || 'Unknown Achievement';
            const description = achievement.description || achievement.Description || 'No description available';
            const points = achievement.points || achievement.Points || 0;
            
            // Determine embed color based on challenge type
            const color = isShadow ? '#9B59B6' : '#32CD32';
            
            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(gameInfo.title)
                .setColor(color)
                .setDescription(`**${user.raUsername}** has earned a new achievement in the ${isShadow ? 'shadow' : 'monthly'} challenge!\n\n**${title}**\n*${description}*`)
                .setFooter({ 
                    text: `Points: ${points} • ${new Date().toLocaleTimeString()}`,
                    iconURL: `https://retroachievements.org/UserPic/${user.raUsername}.png`
                })
                .setTimestamp();
            
            // Add badge image if available
            if (achievement.badgeUrl || achievement.BadgeURL) {
                embed.setThumbnail(achievement.badgeUrl || achievement.BadgeURL);
            } else if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }
            
            // Add challenge type label
            embed.setAuthor({
                name: isShadow ? '🌓 SHADOW CHALLENGE' : '🏆 MONTHLY CHALLENGE',
                iconURL: gameInfo.imageIcon ? `https://retroachievements.org${gameInfo.imageIcon}` : null
            });
            
            return embed;
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error creating achievement embed:', error);
            
            // Fallback simple embed
            return new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Achievement Unlocked!')
                .setDescription(`**${user.raUsername}** has earned a new achievement!`)
                .setTimestamp();
        }
    }

    async queueAnnouncement(messageOptions) {
        this.announcementQueue.push(messageOptions);
        if (!this.isProcessingQueue) {
            await this.processAnnouncementQueue();
        }
    }

    async processAnnouncementQueue() {
        if (this.isProcessingQueue || this.announcementQueue.length === 0) return;

        this.isProcessingQueue = true;
        try {
            const channel = await this.getAnnouncementChannel();
            if (!channel) {
                console.error('[ACHIEVEMENT FEED] Announcement channel not found for queue processing');
                return;
            }
            
            console.log(`[ACHIEVEMENT FEED] Processing announcement queue with ${this.announcementQueue.length} items`);
            
            while (this.announcementQueue.length > 0) {
                const messageOptions = this.announcementQueue.shift();
                await channel.send(messageOptions);
                
                // Add a small delay between messages to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error processing announcement queue:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    async getAnnouncementChannel() {
        if (!this.client) return null;

        try {
            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('[ACHIEVEMENT FEED] Guild not found');
                return null;
            }

            // Get the channel
            return await guild.channels.fetch(config.discord.achievementChannelId);
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error getting announcement channel:', error);
            return null;
        }
    }

    async announceAward(channel, user, gameInfo, awardLevel, isShadow, progress, total) {
        try {
            // Create embed with award information
            const embed = new EmbedBuilder()
                .setTitle(`${AWARD_EMOJIS[awardLevel]} Challenge Complete!`)
                .setColor(this.getColorForAward(awardLevel))
                .setTimestamp();
            
            // Set author info
            let discordUser = null;
            try {
                discordUser = await this.client.users.fetch(user.discordId);
                embed.setAuthor({
                    name: discordUser.tag,
                    iconURL: discordUser.displayAvatarURL()
                });
            } catch (error) {
                console.error(`[ACHIEVEMENT FEED] Error fetching Discord user for ${user.raUsername}:`, error);
            }
            
            // Set thumbnail to game image if available
            if (gameInfo.imageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);
            }
            
            // Build description based on award level
            let description = `**${user.raUsername}** has earned `;
            
            switch (awardLevel) {
                case 'MASTERY':
                    description += `**MASTERY** status in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!\n`;
                    description += `They completed all achievements in the game!`;
                    break;
                case 'BEATEN':
                    description += `**BEATEN** status in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!\n`;
                    description += `They completed all progression requirements!`;
                    break;
                case 'PARTICIPATION':
                    description += `**PARTICIPATION** in ${isShadow ? 'the shadow challenge' : 'this month\'s challenge'}!`;
                    break;
            }
            
            embed.setDescription(description);
            
            // Add game info
            embed.addFields(
                { name: 'Game', value: gameInfo.title, inline: true },
                { name: 'Progress', value: `${progress}/${total} (${Math.round(progress/total*100)}%)`, inline: true },
                { name: 'Challenge Type', value: isShadow ? 'Shadow Challenge' : 'Monthly Challenge', inline: true }
            );
            
            // Add links
            embed.addFields({
                name: 'Links',
                value: `[Game Page](https://retroachievements.org/game/${gameInfo.id}) | [User Profile](https://retroachievements.org/user/${user.raUsername})`
            });
            
            // Queue the announcement
            await this.queueAnnouncement({ embeds: [embed] });
        } catch (error) {
            console.error('[ACHIEVEMENT FEED] Error announcing award:', error);
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
}

// Create singleton instance
const enhancedAchievementFeedService = new EnhancedAchievementFeedService();
export default enhancedAchievementFeedService;
