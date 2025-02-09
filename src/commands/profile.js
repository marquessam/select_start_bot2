/**
 * File: src/commands/profile.js
 * Description: This command displays a detailed points profile for a user.
 * It retrieves Award documents from the database for the provided RA username,
 * separates them into game awards, manual (points command) awards, and then formats
 * the information in an embed with distinct headers.
 */

const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

async function fetchUserProfile(username) {
    // Find the user using a case-insensitive search
    const user = await User.findOne({
        raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
    });

    if (!user) {
        throw new Error(`User ${username} not found.`);
    }

    return user;
}

async function getCurrentProgress(username) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Get current games
    const currentGames = await Game.find({
        month: currentMonth,
        year: currentYear
    });

    // Get awards for current games
    const currentProgress = [];
    for (const game of currentGames) {
        const award = await Award.findOne({
            raUsername: username,
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

async function getYearlyStats(username) {
    const currentYear = new Date().getFullYear();
    const awards = await Award.find({
        raUsername: username,
        year: currentYear,
        gameId: { $ne: "manual" } // Exclude manual awards
    });

    const stats = {
        totalPoints: 0,
        totalAchievements: 0,
        gamesParticipated: 0,
        gamesBeaten: 0,
        gamesMastered: 0,
        monthlyGames: 0,
        shadowGames: 0,
        participationGames: [],
        beatenGames: [],
        masteredGames: []
    };

    // Process each award (non-manual)
    const processedGames = new Set();
    for (const award of awards) {
        const game = await Game.findOne({
            gameId: award.gameId,
            year: currentYear
        });

        if (!game) continue;

        const gameKey = `${game.gameId}-${game.month}`;
        if (processedGames.has(gameKey)) continue;
        processedGames.add(gameKey);

        // Add points and track achievements
        stats.totalAchievements += award.achievementCount;
        
        // Track game types
        if (game.type === 'MONTHLY') {
            stats.monthlyGames++;
        } else {
            stats.shadowGames++;
        }

        // Track award levels and points
        switch (award.award) {
            case AwardType.MASTERED:
                stats.totalPoints += AwardFunctions.getPoints(AwardType.MASTERED);
                stats.gamesMastered++;
                stats.masteredGames.push(game.title);
                stats.gamesBeaten++;
                stats.beatenGames.push(game.title);
                stats.gamesParticipated++;
                stats.participationGames.push(game.title);
                break;
            case AwardType.BEATEN:
                stats.totalPoints += AwardFunctions.getPoints(AwardType.BEATEN);
                stats.gamesBeaten++;
                stats.beatenGames.push(game.title);
                stats.gamesParticipated++;
                stats.participationGames.push(game.title);
                break;
            case AwardType.PARTICIPATION:
                stats.totalPoints += AwardFunctions.getPoints(AwardType.PARTICIPATION);
                stats.gamesParticipated++;
                stats.participationGames.push(game.title);
                break;
        }
    }

    return stats;
}

async function getManualAwards(username) {
    const currentYear = new Date().getFullYear();
    // Manual awards are those added via the points command with gameId "manual"
    const manualAwards = await Award.find({
        raUsername: username,
        gameId: "manual",
        year: currentYear
    });
    return manualAwards;
}

function formatGameList(games) {
    return games.length ? games.map(g => `• ${g}`).join('\n') : 'None';
}

function formatManualAwards(manualAwards) {
    if (!manualAwards.length) return 'None';
    // Each manual award will display its reason (or fallback text) and the associated points.
    return manualAwards.map(award => {
        const reasonText = award.reason ? award.reason : "Manual Award";
        return `• **${reasonText}**: ${award.totalAchievements} point${award.totalAchievements !== 1 ? 's' : ''}`;
    }).join('\n\n');
}

module.exports = {
    name: 'profile',
    description: 'Shows user profile information with detailed statistics and manual awards',
    async execute(message, args) {
        try {
            const requestedUsername = args[0] || "Royek";  // Default to Royek if no username provided
            const loadingMsg = await message.channel.send('Fetching profile data...');

            // Get user info
            const user = await fetchUserProfile(requestedUsername);
            const raUsername = user.raUsername;

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`User Profile: ${raUsername}`)
                .setThumbnail(`https://media.retroachievements.org/UserPic/${raUsername}.png`)
                .setDescription("Below is your detailed profile including game achievements and manual awards.")
                .setTimestamp();

            // Get and display current progress
            const currentProgress = await getCurrentProgress(raUsername);
            if (currentProgress.length > 0) {
                let progressText = '';
                for (const progress of currentProgress) {
                    const emoji = progress.type === 'SHADOW' ? '🌘' : '🏆';
                    progressText += `${emoji} **${progress.title}**\n`;
                    progressText += `Progress: ${progress.progress} (${progress.completion})\n`;
                    if (progress.award) {
                        progressText += `Award: ${AwardFunctions.getEmoji(progress.award)} ${AwardFunctions.getName(progress.award)}\n`;
                    }
                    progressText += '\n';
                }
                embed.addFields({ name: '**Current Challenges**', value: progressText });
            }

            // Get and display yearly stats
            const yearlyStats = await getYearlyStats(raUsername);
            
            // Add overall statistics
            const statsText = 
                `**Total Points:** ${yearlyStats.totalPoints}\n` +
                `**Achievements Earned:** ${yearlyStats.totalAchievements}\n` +
                `**Monthly Games:** ${yearlyStats.monthlyGames}\n` +
                `**Shadow Games:** ${yearlyStats.shadowGames}\n` +
                `**Games Participated:** ${yearlyStats.gamesParticipated}\n` +
                `**Games Beaten:** ${yearlyStats.gamesBeaten}\n` +
                `**Games Mastered:** ${yearlyStats.gamesMastered}`;
            embed.addFields({ name: '**2025 Statistics**', value: statsText });

            // Add game lists
            if (yearlyStats.participationGames.length > 0) {
                embed.addFields({
                    name: '🏁 **Games Participated (1pt)**',
                    value: formatGameList(yearlyStats.participationGames)
                });
            }

            if (yearlyStats.beatenGames.length > 0) {
                embed.addFields({
                    name: '⭐ **Games Beaten (+3pts)**',
                    value: formatGameList(yearlyStats.beatenGames)
                });
            }

            if (yearlyStats.masteredGames.length > 0) {
                embed.addFields({
                    name: '✨ **Games Mastered (+3pts)**',
                    value: formatGameList(yearlyStats.masteredGames)
                });
            }

            // Get and display manual awards (added via the points command)
            const manualAwards = await getManualAwards(raUsername);
            const manualAwardsText = formatManualAwards(manualAwards);
            embed.addFields({
                name: '🛠️ **Manual Awards**',
                value: manualAwardsText
            });

            // Send the profile embed
            await loadingMsg.delete();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing profile:', error);
            await message.reply('Error getting profile data.');
        }
    }
};
