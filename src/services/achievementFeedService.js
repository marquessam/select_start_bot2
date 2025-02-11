// File: src/services/achievementFeedService.js
const { EmbedBuilder } = require('discord.js');
const Cache = require('../utils/cache');

class AchievementFeedService {
    constructor(client, usernameUtils) {
        if (!client) {
            throw new Error('Discord client is required');
        }
        if (!usernameUtils) {
            throw new Error('Username utils is required');
        }

        this.client = client;
        this.usernameUtils = usernameUtils;
        this.feedChannelId = process.env.ACHIEVEMENT_FEED_CHANNEL;
        
        if (!this.feedChannelId) {
            throw new Error('Achievement Feed Error: No channel ID provided in environment variables');
        }

        // Initialize caches
        this.announcementCache = new Cache(3600000); // 1 hour for announcement history
        this.announcementQueue = [];
        this.isProcessingQueue = false;
        this.isPaused = false;

        console.log('Achievement Feed Service initialized with channel:', this.feedChannelId);
    }

    async initialize() {
        try {
            // Verify channel exists and bot has permissions
            const channel = await this.client.channels.fetch(this.feedChannelId);
            if (!channel) {
                throw new Error('Feed channel not found');
            }

            // Verify permissions
            const permissions = channel.permissionsFor(this.client.user);
            if (!permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
                throw new Error('Bot lacks required permissions in feed channel');
            }

            console.log('Achievement feed service initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing achievement feed service:', error);
            throw error;
        }
    }

    async announceAchievement(username, achievement, game) {
        if (this.isPaused) return;

        try {
            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(username);
            const announcementKey = `${canonicalUsername}-${achievement.ID}-${achievement.Date}`;
            
            if (this.announcementCache.get(announcementKey)) return;

            const profilePicUrl = await this.usernameUtils.getProfilePicUrl(canonicalUsername);
            const profileUrl = await this.usernameUtils.getProfileUrl(canonicalUsername);

            let authorName = '';
            let color = '#00FF00'; // Default color
            let files = [];

            const logoFile = {
                attachment: './assets/logo_simple.png',
                name: 'game_logo.png'
            };

            if (game) {
                if (game.type === 'SHADOW') {
                    authorName = 'SHADOW GAME 🌑';
                    color = '#FFD700'; // Gold
                    files = [logoFile];
                } else if (game.type === 'MONTHLY') {
                    authorName = 'MONTHLY CHALLENGE ☀️';
                    color = '#00BFFF'; // Blue
                    files = [logoFile];
                }
            }

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(achievement.GameTitle)
                .setDescription(
                    `**${canonicalUsername}** earned **${achievement.Title}**\n\n` +
                    `*${achievement.Description || 'No description available'}*`
                )
                .setURL(profileUrl);

            if (achievement.BadgeName) {
                embed.setThumbnail(`https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`);
            }

            if (authorName) {
                embed.setAuthor({
                    name: authorName,
                    iconURL: 'attachment://game_logo.png'
                });
            }

            embed.setFooter({
                text: `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`,
                iconURL: profilePicUrl
            });

            await this.queueAnnouncement({ embeds: [embed], files });
            this.announcementCache.set(announcementKey, true);
        } catch (error) {
            console.error('Error announcing achievement:', error);
        }
    }

    async announceGameAward(username, game, awardType, achievementCount, totalAchievements) {
        if (this.isPaused) return;

        try {
            const canonicalUsername = await this.usernameUtils.getCanonicalUsername(username);
            const announcementKey = `award-${canonicalUsername}-${game.gameId}-${awardType}-${Date.now()}`;
            
            if (this.announcementCache.get(announcementKey)) return;

            const profilePicUrl = await this.usernameUtils.getProfilePicUrl(canonicalUsername);
            const profileUrl = await this.usernameUtils.getProfileUrl(canonicalUsername);

            let awardEmoji, awardName, color;
            switch(awardType) {
                case AwardType.MASTERED:
                    awardEmoji = '✨';
                    awardName = 'Mastery';
                    color = '#FFD700';
                    break;
                case AwardType.BEATEN:
                    awardEmoji = '⭐';
                    awardName = 'Beaten';
                    color = '#C0C0C0';
                    break;
                case AwardType.PARTICIPATION:
                    awardEmoji = '🏁';
                    awardName = 'Participation';
                    color = '#CD7F32';
                    break;
                default:
                    return;
            }

            const gameTypeEmoji = game.type === 'SHADOW' ? '🌑' : '☀️';
            const files = [{
                attachment: './assets/logo_simple.png',
                name: 'game_logo.png'
            }];

            const embed = new EmbedBuilder()
                .setColor(color)
                .setAuthor({
                    name: `${game.type === 'SHADOW' ? 'SHADOW GAME' : 'MONTHLY CHALLENGE'} ${gameTypeEmoji}`,
                    iconURL: 'attachment://game_logo.png'
                })
                .setTitle(`${awardEmoji} ${awardName} Award Earned!`)
                .setDescription(
                    `**${canonicalUsername}** has earned the **${awardName} Award** for ${game.title}!\n` +
                    `Progress: ${achievementCount}/${totalAchievements} (${((achievementCount/totalAchievements)*100).toFixed(2)}%)`
                )
                .setURL(profileUrl)
                .setFooter({
                    text: `Game Awards • ${new Date().toLocaleTimeString()}`,
                    iconURL: profilePicUrl
                });

            await this.queueAnnouncement({ embeds: [embed], files });
            this.announcementCache.set(announcementKey, true);
        } catch (error) {
            console.error('Error announcing game award:', error);
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
            const channel = await this.client.channels.fetch(this.feedChannelId);
            while (this.announcementQueue.length > 0) {
                const messageOptions = this.announcementQueue.shift();
                await channel.send(messageOptions);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Error processing announcement queue:', error);
        } finally {
            this.isProcessingQueue = false;
        }
    }

    setPaused(paused) {
        this.isPaused = paused;
        console.log(`Achievement feed ${paused ? 'paused' : 'resumed'}`);
    }

    clearCache() {
        this.announcementCache.clear();
        console.log('Achievement feed cache cleared');
    }
}

module.exports = AchievementFeedService;
