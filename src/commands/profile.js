// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const RetroAchievementsAPI = require('../services/retroAchievements');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

module.exports = {
    name: 'profile',
    description: 'Shows user profile information',
    async execute(message, args) {
        try {
            // Get username (default to message author if none provided)
            const requestedUsername = args[0] || "Royek";

            // Find user in database
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${requestedUsername}$`, 'i') }
            });

            if (!user) {
                return message.reply(`User **${requestedUsername}** not found.`);
            }

            const raAPI = new RetroAchievementsAPI(
                process.env.RA_USERNAME,
                process.env.RA_API_KEY
            );

            // Create base embed
            const raUsername = user.raUsername;
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Profile: ${raUsername}`)
                .setThumbnail(`https://media.retroachievements.org/UserPic/${raUsername}.png`);

            // Get current month's progress
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const currentGames = await Game.find({
                month: currentMonth,
                year: currentYear
            });

            // Get current progress for active games
            for (const game of currentGames) {
                const award = await Award.findOne({
                    raUsername,
                    gameId: game.gameId,
                    month: currentMonth,
                    year: currentYear
                });

                // Get live progress from API
                const progress = await raAPI.getUserGameProgress(raUsername, game.gameId);
                
                const gameProgress = {
                    title: game.title,
                    type: game.type,
                    earned: progress.earnedAchievements || 0,
                    total: progress.totalAchievements || 0,
                    completion: progress.userCompletion || "0.00%",
                    award: award ? award.award : AwardType.NONE
                };

                embed.addFields({
                    name: `${game.type === 'SHADOW' ? '🌘' : '🏆'} ${gameProgress.title}`,
                    value: 
                        `**Progress:** ${gameProgress.earned}/${gameProgress.total} (${gameProgress.completion})\n` +
                        `**Award:** ${AwardFunctions.getEmoji(gameProgress.award)} ${AwardFunctions.getName(gameProgress.award)}\n` +
                        `**Points:** ${AwardFunctions.getPoints(gameProgress.award)}`
                });
            }

            // Get yearly stats
            const yearlyAwards = await Award.find({
                raUsername,
                year: currentYear
            });

            // Calculate yearly statistics
            const yearStats = {
                totalPoints: 0,
                participationCount: 0,
                beatenCount: 0,
                masteredCount: 0,
                monthlyGames: 0,
                shadowGames: 0
            };

            // Lists for each award type
            const participationGames = [];
            const beatenGames = [];
            const masteredGames = [];

            // Process each award
            for (const award of yearlyAwards) {
                const game = await Game.findOne({ 
                    gameId: award.gameId,
                    year: currentYear
                });

                if (!game) continue;

                yearStats.totalPoints += AwardFunctions.getPoints(award.award);

                if (game.type === 'MONTHLY') {
                    yearStats.monthlyGames++;
                } else {
                    yearStats.shadowGames++;
                }

                // Add to appropriate lists based on award level
                switch(award.award) {
                    case AwardType.MASTERED:
                        yearStats.masteredCount++;
                        masteredGames.push(game.title);
                        // Falls through to add to beaten and participation counts
                    case AwardType.BEATEN:
                        yearStats.beatenCount++;
                        beatenGames.push(game.title);
                        // Falls through to add to participation count
                    case AwardType.PARTICIPATION:
                        yearStats.participationCount++;
                        participationGames.push(game.title);
                        break;
                }
            }

            // Add yearly statistics
            embed.addFields({
                name: '📊 2025 Statistics',
                value: 
                    `**Total Points:** ${yearStats.totalPoints}\n` +
                    `**Monthly Games:** ${yearStats.monthlyGames}\n` +
                    `**Shadow Games:** ${yearStats.shadowGames}\n` +
                    `**Games Participated:** ${yearStats.participationCount}\n` +
                    `**Games Beaten:** ${yearStats.beatenCount}\n` +
                    `**Games Mastered:** ${yearStats.masteredCount}`
            });

            // Helper function for formatting game lists
            const formatGameList = games => games.length ? games.map(g => `• ${g}`).join('\n') : 'None';

            // Add game lists if they have any entries
            if (participationGames.length > 0) {
                embed.addFields({
                    name: '🏁 Games Participated (1pt)',
                    value: formatGameList(participationGames)
                });
            }

            if (beatenGames.length > 0) {
                embed.addFields({
                    name: '⭐ Games Beaten (+3pts)',
                    value: formatGameList(beatenGames)
                });
            }

            if (masteredGames.length > 0) {
                embed.addFields({
                    name: '✨ Games Mastered (+3pts)',
                    value: formatGameList(masteredGames)
                });
            }

            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing profile:', error);
            await message.reply('Error getting profile data.');
        }
    }
};
