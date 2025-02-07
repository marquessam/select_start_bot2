// File: src/services/achievementFeedService.js
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const PlayerProgress = require('../models/PlayerProgress');
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
        this.checkInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
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

            // Get current month and year
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            // Get current monthly and shadow games
            const challengeGames = await Game.find({
                month: currentMonth,
                year: currentYear,
                type: { $in: ['MONTHLY', 'SHADOW'] }
            });

            // Process achievements for each user
            for (const user of users) {
                try {
                    await this.checkUserAchievements(user, challengeGames);
                } catch (error) {
                    console.error(`Error checking achievements for ${user.raUsername}:`, error);
                    // Continue to next user if an error occurs
                }
            }

            // Update the last check timestamp
            this.lastCheck = currentDate;
            console.log('Achievement check completed');
        } catch (error) {
            console.error('Error in achievement feed service:', error);
        }
    }

    async checkUserAchievements(user, challengeGames) {
        try {
            // Get user's recent achievements
            const recentAchievements = await this.raAPI.getUserRecentAchievements(user.raUsername);
            if (!recentAchievements || !Array.isArray(recentAchievements)) {
                console.log(`No recent achievements for ${user.raUsername}`);
                return;
            }

            // Get or create progress record
            for (const game of challengeGames) {
                let progress = await PlayerProgress.findOne({
                    raUsername: user.raUsername,
                    gameId: game.gameId
                });

                if (!progress) {
                    progress = new PlayerProgress({
                        raUsername: user.raUsername,
                        gameId: game.gameId,
                        lastAchievementTimestamp: new Date(0),
                        announcedAchievements: []
                    });
                }

                // Filter achievements for this game
                const gameAchievements = recentAchievements.filter(ach => 
                    String(ach.GameID) === String(game.gameId) &&
                    new Date(ach.Date) > progress.lastAchievementTimestamp &&
                    !progress.announcedAchievements.includes(ach.ID)
                );

                // Announce new achievements
                for (const achievement of gameAchievements) {
                    await this.announceAchievement(user.raUsername, achievement, game);
                    progress.announcedAchievements.push(achievement.ID);
                }

                // Update progress if new achievements were found
                if (gameAchievements.length > 0) {
                    progress.lastAchievementTimestamp = new Date();
                    await progress.save();
                }
            }
        } catch (error) {
            console.error(`Error processing achievements for ${user.raUsername}:`, error);
            throw error;
        }
    }

    async announceAchievement(username, achievement, challengeGame) {
        try {
            const channel = await this.client.channels.fetch(this.feedChannelId);
            if (!channel) {
                console.error('Achievement feed channel not found');
                return;
            }

            // Create badge URL (use fall back if needed)
            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';

            // Get user icon URL
            const userIconUrl = `https://media.retroachievements.org/UserPic/${username}.png`;

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(challengeGame.type === 'SHADOW' ? '#FFD700' : '#00BFFF')
                .setTitle(achievement.GameTitle || challengeGame.title)
                .setAuthor({
                    name: challengeGame.type === 'SHADOW' ? 'SHADOW GAME 🌘' : 'MONTHLY CHALLENGE 🏆',
                    iconURL: 'attachment://game_logo.png'
                })
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

            // Send the announcement
            await channel.send({ 
                embeds: [embed],
                files: [{
                    attachment: './assets/logo_simple.png',
                    name: 'game_logo.png'
                }]
            });

        } catch (error) {
            console.error('Error announcing achievement:', error);
        }
    }
}

module.exports = AchievementFeedService;