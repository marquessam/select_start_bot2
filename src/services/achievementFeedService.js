// File: src/services/achievementFeedService.js
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const RetroAchievementsAPI = require('./retroAchievements');

class AchievementFeedService {
    constructor(client) {
        this.client = client;
        this.feedChannelId = '1336339958503571487';
        this.raAPI = new RetroAchievementsAPI(
            process.env.RA_USERNAME,
            process.env.RA_API_KEY
        );
        this.lastCheck = new Date();
    }

    async initialize() {
        // Set initial last check time
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
                    // Get user's recent achievements
                    const recentAchievements = await this.raAPI.getUserRecentAchievements(user.raUsername);
                    
                    if (recentAchievements && recentAchievements.length > 0) {
                        for (const achievement of recentAchievements) {
                            // Check if achievement was earned after last check
                            const earnedDate = new Date(achievement.Date);
                            if (earnedDate > this.lastCheck) {
                                // Find if it's a challenge game
                                const challengeGame = challengeGames.find(g => g.gameId === achievement.GameID);
                                
                                await this.announceAchievement(user.raUsername, achievement, challengeGame);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error checking achievements for ${user.raUsername}:`, error);
                    continue;  // Continue with next user
                }
            }

            // Update last check time
            this.lastCheck = currentDate;
            console.log('Achievement check completed');

        } catch (error) {
            console.error('Error in achievement feed service:', error);
        }
    }

    async announceAchievement(username, achievement, challengeGame) {
        const channel = await this.client.channels.fetch(this.feedChannelId);
        if (!channel) {
            console.error('Achievement feed channel not found');
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setAuthor({
                name: username,
                iconURL: `https://media.retroachievements.org/UserPic/${username}.png`
            })
            .setThumbnail(`https://media.retroachievements.org${achievement.BadgeURL}`);

        if (challengeGame) {
            // Set title based on challenge type
            const challengeType = challengeGame.type === 'MONTHLY' ? 'Monthly Challenge' : 'Shadow Game';
            embed.setTitle(`${challengeType}: ${achievement.GameTitle}`)
                .setDescription(`**${achievement.Title}** (${achievement.Points} points)\n${achievement.Description}`);
        } else {
            embed.setDescription(`**${achievement.GameTitle}**\n${achievement.Title} (${achievement.Points} points)\n${achievement.Description}`);
        }

        await channel.send({ embeds: [embed] });
    }
}

module.exports = AchievementFeedService;
