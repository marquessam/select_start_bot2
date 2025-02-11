// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const User = require('../models/User');
const Award = require('../models/Award');

async function getCurrentProgress(awardService, username, canonicalUsername) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const currentGames = await Game.find({
        month: currentMonth,
        year: currentYear
    });

    const currentProgress = [];
    for (const game of currentGames) {
        const award = await Award.findOne({
            raUsername: username.toLowerCase(),
            gameId: game.gameId,
            month: currentMonth,
            year: currentYear
        });
        
        if (award && award.achievementCount > 0) {
            currentProgress.push({
                title: game.title,
                type: game.type,
                progress: `${award.achievementCount}/${award.totalAchievements}`,
                completion: award.userCompletion || 'N/A',
                award: award.award
            });
        }
    }

    return currentProgress;
}

module.exports = {
    name: 'profile',
    description: 'Shows user profile with detailed statistics and awards',
    async execute(message, args) {
        try {
            const requestedUsername = args[0] || message.author.username;
            const loadingMsg = await message.channel.send('Fetching profile data...');

            // Verify required services are available
            if (!message.client.usernameUtils || !message.client.awardService) {
                console.error('Required services not available:', {
                    hasUsernameUtils: !!message.client.usernameUtils,
                    hasAwardService: !!message.client.awardService
                });
                throw new Error('Required services not available');
            }

            // Get services from client
            const { usernameUtils, awardService } = message.client;

            // Get canonical username
            const canonicalUsername = await usernameUtils.getCanonicalUsername(requestedUsername);
            if (!canonicalUsername) {
                await loadingMsg.delete();
                return message.reply('User not found on RetroAchievements.');
            }

            // Find user in database
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${canonicalUsername}$`, 'i') }
            });
            if (!user) {
                await loadingMsg.delete();
                return message.reply('User not found in our database. They need to register first!');
            }

            // Get profile URLs using username utils
            const profilePicUrl = await usernameUtils.getProfilePicUrl(canonicalUsername);
            const profileUrl = await usernameUtils.getProfileUrl(canonicalUsername);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`User Profile: ${canonicalUsername}`)
                .setThumbnail(profilePicUrl)
                .setURL(profileUrl);

            // Get current monthly progress
            const currentProgress = await getCurrentProgress(awardService, canonicalUsername, canonicalUsername);
            if (currentProgress.length > 0) {
                let progressText = '';
                currentProgress.forEach(progress => {
                    const type = progress.type === 'MONTHLY' ? '☀️' : '🌑';
                    progressText += `${type} **${progress.title}**\n`;
                    progressText += `Progress: ${progress.progress} (${progress.completion})\n`;
                    if (progress.award) {
                        const emoji = progress.award === 7 ? '✨' : progress.award === 4 ? '⭐' : '🏁';
                        progressText += `Current Award: ${emoji}\n`;
                    }
                    progressText += '\n';
                });
                embed.addFields({ name: '🎮 Current Challenges', value: progressText });
            }

            // Get yearly stats using award service
            const yearlyStats = await awardService.getYearlyStats(canonicalUsername);
            
            // Get all awards for the current year
            const currentYear = new Date().getFullYear();
            const yearlyAwards = await Award.find({
                raUsername: canonicalUsername.toLowerCase(),
                year: currentYear,
                gameId: { $ne: 'manual' }  // Exclude manual awards
            }).populate('gameId');

            // Group awards by level
            const gameAwards = {
                mastered: [],
                beaten: [],
                participation: []
            };

            const processedGames = new Set();
            for (const award of yearlyAwards) {
                const gameKey = `${award.gameId}-${award.month}`;
                if (processedGames.has(gameKey)) continue;
                processedGames.add(gameKey);

                const game = await Game.findOne({ gameId: award.gameId });
                if (!game) continue;

                const progressStr = `${award.achievementCount}/${award.totalAchievements} (${award.userCompletion})`;
                const gameInfo = `${game.title}: ${progressStr}`;

                if (award.award >= 7) {
                    gameAwards.mastered.push(gameInfo);
                } else if (award.award >= 4) {
                    gameAwards.beaten.push(gameInfo);
                } else if (award.award >= 1) {
                    gameAwards.participation.push(gameInfo);
                }
            }

            let gameAwardsText = '';
            if (gameAwards.mastered.length > 0) {
                gameAwardsText += '**Mastered Games** ✨\n';
                gameAwards.mastered.forEach(game => {
                    gameAwardsText += `• ${game}\n`;
                });
                gameAwardsText += '\n';
            }
            if (gameAwards.beaten.length > 0) {
                gameAwardsText += '**Beaten Games** ⭐\n';
                gameAwards.beaten.forEach(game => {
                    gameAwardsText += `• ${game}\n`;
                });
                gameAwardsText += '\n';
            }
            if (gameAwards.participation.length > 0) {
                gameAwardsText += '**Participation** 🏁\n';
                gameAwards.participation.forEach(game => {
                    gameAwardsText += `• ${game}\n`;
                });
            }

            if (gameAwardsText) {
                embed.addFields({ 
                    name: '🎮 Game Awards', 
                    value: gameAwardsText 
                });
            }

            // Get manual awards
            const manualAwards = await awardService.getManualAwards(canonicalUsername);
            if (manualAwards && manualAwards.length > 0) {
                let awardText = '';
                for (const award of manualAwards) {
                    if (award.metadata?.type === 'placement') {
                        awardText += `${award.metadata.emoji} ${award.metadata.name} - ${award.metadata.month}: ${award.totalAchievements} points\n`;
                    } else {
                        awardText += `• ${award.reason}: ${award.totalAchievements} points\n`;
                    }
                }

                embed.addFields({
                    name: '🎖️ Community Awards',
                    value: awardText
                });
            }

            // Add points summary
            embed.addFields({
                name: '🏆 Points Summary',
                value: 
                    `Total: ${yearlyStats.totalPoints}\n` +
                    `• Challenge: ${yearlyStats.totalPoints - yearlyStats.manualPoints}\n` +
                    `• Community: ${yearlyStats.manualPoints}`
            });

            await loadingMsg.delete();
            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error showing profile:', error);
            await message.reply('Error getting profile data. Please try again.');
        }
    }
};
