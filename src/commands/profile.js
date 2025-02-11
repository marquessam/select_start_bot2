// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const User = require('../models/User');
const Award = require('../models/Award');
const { AwardType } = require('../enums/AwardType');

/**
 * Get the user's current progress in active challenges
 */
async function getCurrentProgress(awardService, achievementTrackingService, canonicalUsername) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const currentGames = await Game.find({
        month: currentMonth,
        year: currentYear
    });

    const currentProgress = [];
    for (const game of currentGames) {
        const award = await achievementTrackingService.getCurrentAward(canonicalUsername, game.gameId);
        
        if (award && award.achievementCount > 0) {
            const emoji = game.type === 'MONTHLY' ? '☀️' : '🌑';
            const awardEmoji = award.award >= AwardType.MASTERED ? '✨' : 
                             award.award >= AwardType.BEATEN ? '⭐' : 
                             award.award >= AwardType.PARTICIPATION ? '🏁' : '';

            currentProgress.push({
                title: game.title,
                type: emoji,
                progress: `${award.achievementCount}/${award.totalAchievements}`,
                completion: award.userCompletion || 'N/A',
                award: awardEmoji,
                currentAward: award.award
            });
        }
    }

    return currentProgress;
}

/**
 * Format award display text
 */
function formatAwardText(awards) {
    let text = '';
    if (awards.mastered.length > 0) {
        text += '**Mastered Games** ✨\n';
        awards.mastered.forEach(game => {
            text += `• ${game}\n`;
        });
        text += '\n';
    }
    if (awards.beaten.length > 0) {
        text += '**Beaten Games** ⭐\n';
        awards.beaten.forEach(game => {
            text += `• ${game}\n`;
        });
        text += '\n';
    }
    if (awards.participation.length > 0) {
        text += '**Participation** 🏁\n';
        awards.participation.forEach(game => {
            text += `• ${game}\n`;
        });
    }
    return text || 'No awards yet!';
}

module.exports = {
    name: 'profile',
    description: 'Shows user profile with detailed statistics and awards',
    async execute(message, args) {
        try {
            const requestedUsername = args[0] || message.author.username;
            const loadingMsg = await message.channel.send('Fetching profile data...');

            // Verify required services are available
            if (!message.client.usernameUtils || !message.client.awardService || !message.client.achievementTrackingService) {
                console.error('Required services not available:', {
                    hasUsernameUtils: !!message.client.usernameUtils,
                    hasAwardService: !!message.client.awardService,
                    hasAchievementTrackingService: !!message.client.achievementTrackingService
                });
                throw new Error('Required services not available');
            }

            // Get services from client
            const { usernameUtils, awardService, achievementTrackingService } = message.client;

            // Get canonical username
            const canonicalUsername = await usernameUtils.getCanonicalUsername(requestedUsername);
            if (!canonicalUsername) {
                await loadingMsg.delete();
                return message.reply('User not found on RetroAchievements.');
            }

            // Find user in database
            const user = await User.findOne({
                raUsernameLower: canonicalUsername.toLowerCase()
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
            const currentProgress = await getCurrentProgress(
                awardService, 
                achievementTrackingService, 
                canonicalUsername
            );

            if (currentProgress.length > 0) {
                let progressText = '';
                currentProgress.forEach(progress => {
                    progressText += `${progress.type} **${progress.title}**\n`;
                    progressText += `Progress: ${progress.progress} (${progress.completion})\n`;
                    if (progress.award) {
                        progressText += `Current Award: ${progress.award}\n`;
                    }
                    progressText += '\n';
                });
                embed.addFields({ name: '🎮 Current Challenges', value: progressText });
            }

            // Get yearly stats using award service
            const yearlyStats = await awardService.getYearlyStats(canonicalUsername);
            
            let awardText = formatAwardText({
                mastered: yearlyStats.masteredGames || [],
                beaten: yearlyStats.beatenGames || [],
                participation: yearlyStats.participationGames || []
            });

            embed.addFields({ 
                name: '🏆 Game Awards', 
                value: awardText 
            });

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
                name: '📊 Points Summary',
                value: 
                    `Total: ${yearlyStats.totalPoints}\n` +
                    `• Challenge: ${yearlyStats.challengePoints}\n` +
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
