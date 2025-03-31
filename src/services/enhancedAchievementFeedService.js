import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';

class EnhancedAchievementFeedService {
    constructor() {
        this.client = null;
        this.feedChannel = null;
        this.checkInterval = 15 * 60 * 1000; // Check every 15 minutes
        this.announcementHistory = new Set();
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isUpdating = false;
    }

    setClient(client) {
        this.client = client;
        console.log('Achievement Feed Service: Client set');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for achievement feed service');
            return;
        }

        if (this.isUpdating) {
            console.log('Achievement Feed Service: Already checking, skipping...');
            return;
        }

        this.isUpdating = true;
        try {
            await this.checkNewAchievements();
        } catch (error) {
            console.error('Error in achievement feed service:', error);
        } finally {
            this.isUpdating = false;
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
                console.error('Achievement feed channel not found');
                return;
            }

            console.log(`Processing announcement queue with ${this.announcementQueue.length} items`);
            
            while (this.announcementQueue.length > 0) {
                const messageOptions = this.announcementQueue.shift();
                await channel.send(messageOptions);
                // Add a small delay between messages to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Error processing announcements:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    async checkNewAchievements() {
        try {
            console.log('Checking recent achievements...');
            
            // Get all registered users
            const users = await User.find({});
            if (users.length === 0) {
                console.log('No registered users found');
                return;
            }

            // Get last achievement timestamps from user objects
            const storedTimestamps = new Map();
            for (const user of users) {
                // Use a 'lastAchievementCheck' field if it exists, otherwise default to 0
                storedTimestamps.set(user.raUsername.toLowerCase(), 
                                     user.lastAchievementCheck || 0);
            }

            // Fetch recent achievements for all users
            const allAchievements = await retroAPI.fetchAllRecentAchievements();
            
            // Get current monthly and shadow challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            // Track monthly and shadow game IDs
            const monthlyGameId = currentChallenge?.monthly_challange_gameid;
            const shadowGameId = currentChallenge?.shadow_challange_gameid;
            const isShadowRevealed = currentChallenge?.shadow_challange_revealed || false;

            // Process achievements for each user
            for (const { username, achievements } of allAchievements) {
                // Find the user in our database
                const user = users.find(u => 
                    u.raUsername.toLowerCase() === username.toLowerCase());
                
                if (!user) continue;

                const lastCheckedTime = storedTimestamps.get(username.toLowerCase()) || 0;
                
                // Filter for new achievements since last check
                const newAchievements = achievements
                    .filter(a => new Date(a.Date).getTime() > lastCheckedTime)
                    .sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());

                if (newAchievements.length > 0) {
                    console.log(`Found ${newAchievements.length} new achievements for ${username}`);
                    
                    // Update the last checked timestamp
                    const latestTime = Math.max(
                        ...newAchievements.map(a => new Date(a.Date).getTime())
                    );
                    
                    // Update the user's last achievement check timestamp
                    user.lastAchievementCheck = latestTime;
                    await user.save();

                    // Announce each achievement
                    for (const achievement of newAchievements) {
                        await this.announceAchievement(
                            user, 
                            achievement, 
                            achievement.GameID === monthlyGameId,
                            achievement.GameID === shadowGameId && isShadowRevealed
                        );
                        
                        // Add a small delay between announcements
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        } catch (error) {
            console.error('Error checking achievements:', error);
        }
    }

    async announceAchievement(user, achievement, isMonthly, isShadow) {
        try {
            if (!user || !achievement) return;

            const achievementKey = `${user.raUsername}-${achievement.ID}-${achievement.GameTitle}-${achievement.Title}`;
            if (this.announcementHistory.has(achievementKey)) return;

            console.log(`Announcing achievement: ${user.raUsername} - ${achievement.GameTitle} - ${achievement.Title}`);

            // Get the badge URL if available
            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : null;

            // Special handling for monthly and shadow challenges
            let authorName = '';
            let color = '#00FF00';  // Default color

            if (isMonthly) {
                authorName = 'MONTHLY CHALLENGE 🏆';
                color = '#00BFFF';  // Blue color
            } else if (isShadow) {
                authorName = 'SHADOW GAME 🌘';
                color = '#800080';  // Purple color
            }

            // Create the embed
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(achievement.GameTitle)
                .setDescription(`**${user.raUsername}** earned **${achievement.Title}**\n\n*${achievement.Description || 'No description available'}*`)
                .setTimestamp(new Date(achievement.Date))
                .setFooter({ 
                    text: `Points: ${achievement.Points || 0}` 
                });

            if (badgeUrl) {
                embed.setThumbnail(badgeUrl);
            }

            if (authorName) {
                embed.setAuthor({ name: authorName });
            }

            // Queue the announcement
            await this.queueAnnouncement({ embeds: [embed] });
            this.announcementHistory.add(achievementKey);

            // Limit the size of the announcement history to prevent memory issues
            if (this.announcementHistory.size > 1000) {
                this.announcementHistory.clear();
            }
        } catch (error) {
            console.error('Error announcing achievement:', error);
        }
    }

    async getAnnouncementChannel() {
        if (!this.client) return null;

        try {
            if (this.feedChannel) return this.feedChannel;

            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Get the announcement channel
            this.feedChannel = await guild.channels.fetch(config.discord.achievementChannelId);
            return this.feedChannel;
        } catch (error) {
            console.error('Error getting announcement channel:', error);
            return null;
        }
    }

    async testAnnouncement() {
        try {
            const channel = await this.getAnnouncementChannel();
            if (!channel) {
                console.error('Achievement feed channel not found');
                return false;
            }
            
            const testEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Achievement Feed Test')
                .setDescription('This is a test message to verify the achievement feed is working.')
                .setTimestamp();
            
            await channel.send({ embeds: [testEmbed] });
            return true;
        } catch (error) {
            console.error('Error sending test announcement:', error);
            return false;
        }
    }
}

// Create singleton instance
const enhancedAchievementFeedService = new EnhancedAchievementFeedService();
export default enhancedAchievementFeedService;
