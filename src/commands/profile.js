// File: src/commands/profile.js

const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

async function fetchUserProfile(username) {
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

    const currentGames = await Game.find({
        month: currentMonth,
        year: currentYear
    });

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
        gameId: { $ne: 'manual' } // Exclude manual awards
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

        stats.totalAchievements += award.achievementCount;
        
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

async function getManualAwards(username) {
    const currentYear = new Date().getFullYear();
    const manualAwards = await Award.find({
        raUsername: username,
        gameId: 'manual',
        year: currentYear
    }).sort({ lastChecked: -1 });

    return manualAwards;
}

function formatGameList(games) {
    if (!games.length) return 'None';
    return games.map(g => `• ${g}`).join('\n');
}

function formatManualAwards(manualAwards) {
    if (!manualAwards.length) return 'None';
    
    let totalExtraPoints = 0;
    const awardStrings = manualAwards.map(award => {
        const points = award.totalAchievements || 0;
        totalExtraPoints += points;
        return `• **${award.reason}**: ${points} point${points !== 1 ? 's' : ''}`;
    });

    return `Total Extra Points: **${totalExtraPoints}**\n\n${awardStrings.join('\n')}`;
}

module.exports = {
    name: 'profile',
    description: 'Shows user profile information with detailed statistics',
    async execute(message, args) {
        try {
            const requestedUsername = args[0] || message.author.username;
            const loadingMsg = await message.channel.send('Fetching profile data...');

            // Get user info
            const user = await fetchUserProfile(requestedUsername);
            const raUsername = user.raUsername;

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`User Profile: ${raUsername}`)
                .setThumbnail(`https://retroachievements.org/UserPic/${raUsername}.png`)
                .setURL(`https://retroachievements.org/user/${raUsername}`)
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
            const manualAwards = await getManualAwards(raUsername);
            
            // Calculate total points including manual awards
            const manualPoints = manualAwards.reduce((sum, award) => sum + (award.totalAchievements || 0), 0);
            const totalPoints = yearlyStats.totalPoints + manualPoints;
            
            // Add overall statistics
            const statsText = 
                `**Total Points:** ${totalPoints} (${yearlyStats.totalPoints} + ${manualPoints} bonus)\n` +
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

            // Add manual awards with improved formatting
            const manualAwardsText = formatManualAwards(manualAwards);
            embed.addFields({
                name: '🫂 **Community Awards**',
                value: manualAwardsText
            });

            // Send the profile embed
            await loadingMsg.delete();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing profile:', error);
            await message.reply('Error getting profile data. Please try again.');
        }
    }
};
