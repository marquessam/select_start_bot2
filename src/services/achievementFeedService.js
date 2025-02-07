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
    }

    async initialize() {
        console.log('Achievement feed service initialized');
    }

    async checkRecentAchievements() {
        try {
            console.log('Checking for recent achievements...');
            const users = await User.find({ isActive: true });
            
            // Get current month's challenge games
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();
            
            const challengeGames = await Game.find({
                month: currentMonth,
                year: currentYear
            });

            // Check each user's progress
            for (const user of users) {
                for (const game of challengeGames) {
                    await this.checkUserGameAchievements(user.raUsername, game);
                }
            }

        } catch (error) {
            console.error('Error in achievement feed service:', error);
        }
    }

    async checkUserGameAchievements(username, game) {
        try {
            // Get or create progress tracking
            let progress = await PlayerProgress.findOne({
                raUsername: username,
                gameId: game.gameId
            });

            if (!progress) {
                progress = new PlayerProgress({
                    raUsername: username,
                    gameId: game.gameId,
                    lastAchievementTimestamp: new Date(0),
                    announcedAchievements: []
                });
            }

            // Get recent achievements since last check
            const recentAchievements = await this.raAPI.getUserRecentAchievements(username);
            
            // Filter achievements for this game earned since last check
            const gameAchievements = recentAchievements.filter(ach => 
                ach.GameID === game.gameId &&
                new Date(ach.Date) > progress.lastAchievementTimestamp &&
                !progress.announcedAchievements.includes(ach.ID)
            );

            // Announce new achievements
            for (const achievement of gameAchievements) {
                await this.announceAchievement(username, achievement, game);
                progress.announcedAchievements.push(achievement.ID);
            }

            // Update last check time and save
            if (gameAchievements.length > 0) {
                progress.lastAchievementTimestamp = new Date();
                await progress.save();
            }

        } catch (error) {
            console.error(`Error checking achievements for ${username} in ${game.title}:`, error);
        }
    }

    async announceAchievement(username, achievement, challengeGame) {
        try {
            const channel = await this.client.channels.fetch(this.feedChannelId);
            if (!channel) {
                console.error('Achievement feed channel not found');
                return;
            }

            // Build the embed
            const badgeUrl = achievement.BadgeName
                ? `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`
                : 'https://media.retroachievements.org/Badge/00000.png';
            
            const userIconUrl = `https://media.retroachievements.org/UserPic/${username}.png`;

            const embed = new EmbedBuilder()
                .setColor(challengeGame.type === 'SHADOW' ? '#FFD700' : '#00BFFF')
                .setTitle(achievement.GameTitle)
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
