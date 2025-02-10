// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType, AwardFunctions } = require('../enums/AwardType');
const RetroAchievementsAPI = require('../services/retroAchievements');
const UsernameUtils = require('../utils/usernameUtils');

/**
 * Create a compact box with title
 */
function createCompactBox(title, content) {
    return [
        `─${title}─`,
        content,
        '─'.repeat(Math.max(...content.split('\n').map(line => line.length)) + 2)
    ].join('\n');
}

/**
 * Get current monthly progress for user
 */
async function getCurrentProgress(username) {
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

        if (award) {
            currentProgress.push({
                title: game.title,
                type: game.type,
                progress: `${award.achievementCount}/${award.totalAchievements}`,
                completion: award.userCompletion,
                award: award.award
            });
        }
    }

    return currentProgress;
}

/**
 * Get yearly statistics for user
 */
async function getYearlyStats(username, client) {
    const currentYear = new Date().getFullYear();
    
    // First verify/fix any corrupted award data
    const achievementService = client.achievementService;
    if (!achievementService) {
        console.error('Achievement service not found on client');
        throw new Error('Achievement service not initialized');
    }

    await achievementService.verifyAwardData(username);
    
    const awards = await Award.find({
        raUsername: username.toLowerCase(),
        year: currentYear,
        gameId: { $ne: 'manual' }
    });

    const stats = {
        totalPoints: 0,
        totalAchievements: 0,
        gamesParticipated: 0,
        gamesBeaten: 0,
        gamesMastered: 0,
        monthlyGames: 0,
        shadowGames: 0,
        participationGames: new Set(),
        beatenGames: new Set(),
        masteredGames: new Set()
    };

    const processedGames = new Map(); // Use Map to track unique game-month combinations

    for (const award of awards) {
        if (!award.achievementCount || award.achievementCount <= 0) continue;

        const game = await Game.findOne({
            gameId: award.gameId,
            year: currentYear
        });

        if (!game) continue;

        const gameKey = `${game.gameId}-${award.month}`;
        if (processedGames.has(gameKey)) continue;
        processedGames.set(gameKey, true);

        // Add to total achievements regardless of award type
        stats.totalAchievements += award.achievementCount;

        // Track game type
        if (game.type === 'MONTHLY') {
            stats.monthlyGames++;
        } else if (game.type === 'SHADOW') {
            stats.shadowGames++;
        }

        // Calculate points and track completion based on award type
        switch (award.highestAwardKind) {
            case AwardType.MASTERED:
                stats.totalPoints += AwardFunctions.getPoints(AwardType.MASTERED);
                stats.gamesMastered++;
                stats.masteredGames.add(game.title);
                stats.gamesBeaten++;
                stats.beatenGames.add(game.title);
                stats.gamesParticipated++;
                stats.participationGames.add(game.title);
                break;
            case AwardType.BEATEN:
                stats.totalPoints += AwardFunctions.getPoints(AwardType.BEATEN);
                stats.gamesBeaten++;
                stats.beatenGames.add(game.title);
                stats.gamesParticipated++;
                stats.participationGames.add(game.title);
                break;
            case AwardType.PARTICIPATION:
                stats.totalPoints += AwardFunctions.getPoints(AwardType.PARTICIPATION);
                stats.gamesParticipated++;
                stats.participationGames.add(game.title);
                break;
        }
    }

    return {
        ...stats,
        participationGames: Array.from(stats.participationGames),
        beatenGames: Array.from(stats.beatenGames),
        masteredGames: Array.from(stats.masteredGames)
    };
}

/**
 * Get manual awards for user
 */
async function getManualAwards(username) {
    const currentYear = new Date().getFullYear();
    const manualAwards = await Award.find({
        raUsername: username.toLowerCase(),
        gameId: 'manual',
        year: currentYear
    }).sort({ lastChecked: -1 });

    return manualAwards;
}

module.exports = {
    name: 'profile',
    description: 'Shows user profile information with detailed statistics',
    async execute(message, args) {
        try {
            const requestedUsername = args[0] || message.author.username;
            const loadingMsg = await message.channel.send('Fetching profile data...');

            const raAPI = new RetroAchievementsAPI(
                process.env.RA_USERNAME,
                process.env.RA_API_KEY
            );
            const usernameUtils = new UsernameUtils(raAPI);

            // Get canonical username for display
            const canonicalUsername = await usernameUtils.getCanonicalUsername(requestedUsername);
            const user = await User.find({
                raUsername: { $regex: new RegExp(`^${requestedUsername}$`, 'i') }
            });

            if (!user) {
                await loadingMsg.delete();
                return message.reply('User not found.');
            }

            // Get profile URLs
            const profilePicUrl = await usernameUtils.getProfilePicUrl(canonicalUsername);
            const profileUrl = await usernameUtils.getProfileUrl(canonicalUsername);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`User Profile: ${canonicalUsername}`)
                .setThumbnail(profilePicUrl)
                .setURL(profileUrl)
                .setTimestamp();

            // Get current progress
            const currentProgress = await getCurrentProgress(canonicalUsername);
            if (currentProgress.length > 0) {
                let progressText = '';
                for (const progress of currentProgress) {
                    const typeEmoji = progress.type === 'SHADOW' ? '🌑' : '☀️';
                    progressText += `${typeEmoji} ${progress.title}\n`;
                    progressText += `Progress: ${progress.progress} (${progress.completion})\n`;
                    if (progress.award) {
                        progressText += `Award: ${AwardFunctions.getName(progress.award)} ${AwardFunctions.getEmoji(progress.award)}\n`;
                    }
                    progressText += '\n';
                }
                embed.addFields({ name: '🎮 Current Challenges', value: progressText });
            }

            // Get yearly stats
            const yearlyStats = await getYearlyStats(canonicalUsername, message.client);
            const manualAwards = await getManualAwards(canonicalUsername);
            const manualPoints = manualAwards.reduce((sum, award) => sum + (award.totalAchievements || 0), 0);
            const totalPoints = yearlyStats.totalPoints + manualPoints;

            // Build statistics section
            const statsText = createCompactBox('Progress',
                `Achievements: ${yearlyStats.totalAchievements}\n` +
                `Monthly Games: ${yearlyStats.monthlyGames}\n` +
                `Shadow Games: ${yearlyStats.shadowGames}\n`
            );

            const completionText = createCompactBox('Completion',
                `Participated: ${yearlyStats.gamesParticipated}\n` +
                `Beaten: ${yearlyStats.gamesBeaten}\n` +
                `Mastered: ${yearlyStats.gamesMastered}\n`
            );

            embed.addFields({ 
                name: '📊 2025 Statistics',
                value: '```ml\n' + statsText + '\n\n' + completionText + '\n```'
            });

            // Add games sections
            if (yearlyStats.participationGames.length > 0) {
                const participationText = yearlyStats.participationGames
                    .map(g => `• ${g}`).join('\n');
                embed.addFields({
                    name: '🏁 Games Participated (+1pt)',
                    value: '```ml\n' + participationText + '\n```'
                });
            }

            if (yearlyStats.beatenGames.length > 0) {
                const beatenText = yearlyStats.beatenGames
                    .map(g => `• ${g}`).join('\n');
                embed.addFields({
                    name: '⭐ Games Beaten (+3pts)',
                    value: '```ml\n' + beatenText + '\n```'
                });
            }

            if (yearlyStats.masteredGames.length > 0) {
                const masteredText = yearlyStats.masteredGames
                    .map(g => `• ${g}`).join('\n');
                embed.addFields({
                    name: '✨ Games Mastered (+3pts)',
                    value: '```ml\n' + masteredText + '\n```'
                });
            }

            // Add community awards section
            if (manualAwards.length > 0) {
                const awardsText = [
                    `Total Extra Points: ${manualPoints}`,
                    '',
                    ...manualAwards.map(award => {
                        if (award.metadata?.type === 'placement') {
                            return `• ${award.metadata.emoji || '🏆'} ${award.reason}: ${award.totalAchievements} points`;
                        }
                        return `• ${award.reason}: ${award.totalAchievements} point${award.totalAchievements !== 1 ? 's' : ''}`;
                    })
                ].join('\n');
                
                embed.addFields({
                    name: '🎖️ Community Awards',
                    value: '```ml\n' + awardsText + '\n```'
                });
            } else {
                embed.addFields({
                    name: '🎖️ Community Awards',
                    value: '```\nNone\n```'
                });
            }

            // Add points total with compact box
            const pointsText = createCompactBox('Points',
                `Total: ${totalPoints}\n` +
                `• Challenge: ${yearlyStats.totalPoints}\n` +
                `• Community: ${manualPoints}\n`
            );
            embed.addFields({ 
                name: '🏆 Total Points',
                value: '```ml\n' + pointsText + '\n```'
            });

            // Send the profile embed
            await loadingMsg.delete();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing profile:', error);
            console.error('Error details:', error.stack);
            await message.reply('Error getting profile data. Please try again.');
        }
    }
};
