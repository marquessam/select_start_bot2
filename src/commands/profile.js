// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const User = require('../models/User');

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
        const award = await awardService.getHighestAward(
            username,
            game.gameId,
            currentMonth,
            currentYear
        );
        
        if (award && award.achievementCount > 0) {
            currentProgress.push({
                title: game.title,
                progress: `${award.achievementCount}/${award.totalAchievements}`,
                completion: award.userCompletion || 'N/A'
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
            const currentProgress = await getCurrentProgress(awardService, canonicalUsername.toLowerCase(), canonicalUsername);
            if (currentProgress.length > 0) {
                let progressText = '';
                currentProgress.forEach(progress => {
                    progressText += `${progress.title}\n`;
                    progressText += `Progress: ${progress.progress} (${progress.completion})\n\n`;
                });
                embed.addFields({ name: '🎮 Current Challenges', value: progressText });
            }

            // Get yearly stats using award service
            const yearlyStats = await awardService.getYearlyStats(canonicalUsername);
            
            let gameAwardsText = '';
            if (yearlyStats.mastered > 0) {
                gameAwardsText += `✨ Mastered: ${yearlyStats.mastered} games\n`;
            }
            if (yearlyStats.beaten > 0) {
                gameAwardsText += `⭐ Beaten: ${yearlyStats.beaten} games\n`;
            }
            if (yearlyStats.participation > 0) {
                gameAwardsText += `🏁 Participation: ${yearlyStats.participation} games\n`;
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
