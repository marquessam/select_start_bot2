// File: src/services/achievementFeedService.js
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const RetroAchievementsAPI = require('./retroAchievements');
const path = require('path');

class AchievementFeedService {
    constructor(client) {
        this.client = client;
        this.feedChannelId = '1336339958503571487';
        this.raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );
        this.lastCheck = new Date();
        this.announcementHistory = new Set();
    }

    async initialize() {
        this.lastCheck = new Date();
        console.log('Achievement feed service initialized');
    }

    async checkRecentAchievements() {
        try {
            console.log('Checking for recent achievements...');
            const currentDate = new Date();
            const users = await User.find({ isActive: true });
            
            // Get current monthly and shadow games
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();
            
            const challengeGames = await Game.find({
                month: currentMonth,
                year: currentYear,
                type: { $in: ['MONTHLY', 'SHADOW'] }
            });

            for (const user of users) {
                try {
                    const recentAchievements = await this.raAPI.getUserRecentAchievements(user.raUsername);
                    
                    if (recentAchievements && recentAchievements.length > 0) {
                        for (const achievement of recentAchievements) {
                            const earnedDate = new Date(achievement.Date);
                            if (earnedDate > this.lastCheck) {
                                const challengeGame = challengeGames.find(g => g.gameId === String(achievement.GameID));
                                await this.announceAchievement(user.raUsername, achievement, challengeGame);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error checking achievements for ${user.raUsername}:`, error);
                    continue;
                }
            }

            this.lastCheck = currentDate;
            console.log('Achievement check completed');

        } catch (error) {
            console.error('Error in achievement feed service:', error);
        }
    }

    async announceAchievement(username, achievement, challengeGame) {
        try {
            const channel = await this.client.channels.fetch(this.feedChannelId);
            if (!channel) {
                console.error('Achievement feed channel not found');
                return;
            }

            // Create unique key for achievement
            const achievementKey = `${username}-${achievement.ID}-${achievement.GameTitle}-${achievement.Title}`;
            if (this.announcementHistory.has(achievementKey)) return;

            // Set up badge and user icon URLs
            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';
            const userIconUrl = `https://media.retroachievements.org/UserPic/${username}.png`;

            // Default embed setup
            let authorName = '';
            let authorIconUrl = '';
            let files = [];
            let color = '#00FF00'; // Default color

            // Add logo file for special games
            const logoFile = {
                attachment: path.join(__dirname, '../../assets/logo_simple.png'),
                name: 'game_logo.png'
            };

            // Handle special games
            if (challengeGame) {
                if (challengeGame.type === 'SHADOW') {
                    authorName = 'SHADOW GAME 🌘';
                    color = '#FFD700'; // Gold
                } else {
                    authorName = 'MONTHLY CHALLENGE 🏆';
                    color = '#00BFFF'; // Blue
                }
                files = [logoFile];
                authorIconUrl = 'attachment://game_logo.png';
            }

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(achievement.GameTitle)
                .setThumbnail(badgeUrl)
                .setDescription(
                    `**${username}** earned **${achievement.Title}**\n\n` +
                    `*${achievement.Description || 'No description available'}*`
                )
                .setFooter({
                    text: `Points: ${achievement.Points} • ${new Date(achievement.Date).toLocaleTimeString()}`,
                    iconURL: userIconUrl
                })
                .setTimestamp();

            if (authorName) {
                embed.setAuthor({ name: authorName, iconURL: authorIconUrl });
            }

            await channel.send({ embeds: [embed], files });
            this.announcementHistory.add(achievementKey);

            // Cleanup history if it gets too large
            if (this.announcementHistory.size > 1000) {
                this.announcementHistory.clear();
            }

        } catch (error) {
            console.error('Error announcing achievement:', error);
        }
    }
}

module.exports = AchievementFeedService;
