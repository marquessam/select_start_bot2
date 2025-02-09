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

            // Get current progress
            const currentProgress = await getCurrentProgress(raUsername);
            if (currentProgress.length > 0) {
                let progressText = '';
                for (const progress of currentProgress) {
                    // Remove box-drawing characters and award emojis
                    const typeEmoji = progress.type === 'SHADOW' ? '🌑' : '☀️';
                    progressText += `${typeEmoji} ${progress.title}\n`;
                    progressText += `Progress: ${progress.progress} (${progress.completion})\n`;
                    if (progress.award) {
                        progressText += `Award: ${AwardFunctions.getName(progress.award)}\n`;
                    }
                    progressText += `\n`;
                }
                embed.addFields({ name: '🎮 Current Challenges', value: progressText });
            }

            // Get yearly stats and manual awards
            const yearlyStats = await getYearlyStats(raUsername);
            const manualAwards = await getManualAwards(raUsername);
            const manualPoints = manualAwards.reduce((sum, award) => sum + (award.totalAchievements || 0), 0);
            const totalPoints = yearlyStats.totalPoints + manualPoints;

            // Build statistics section text
            const statsText = [
                '┌─ Progress ────────────┐',
                `│ Achievements: ${yearlyStats.totalAchievements}`,
                `│ Monthly Games: ${yearlyStats.monthlyGames}`,
                `│ Shadow Games: ${yearlyStats.shadowGames}`,
                '└────────────────────────┘',
                '',
                '┌─ Completion ──────────┐',
                `│ Participated: ${yearlyStats.gamesParticipated}`,
                `│ Beaten: ${yearlyStats.gamesBeaten}`,
                `│ Mastered: ${yearlyStats.gamesMastered}`,
                '└────────────────────────┘'
            ].join('\n');

            embed.addFields({ name: '📊 2025 Statistics', value: `\`\`\`ml\n${statsText}\n\`\`\`` });

            // Add games sections
            if (yearlyStats.participationGames.length > 0) {
                const participationText = [
                    'Games Participated (1pt):',
                    yearlyStats.participationGames.map(g => `• ${g}`).join('\n')
                ].join('\n');
                embed.addFields({
                    name: '🏁 Games Participated (1pt)',
                    value: `\`\`\`ml\n${participationText}\n\`\`\``
                });
            }

            if (yearlyStats.beatenGames.length > 0) {
                const beatenText = [
                    'Games Beaten (+3pts):',
                    yearlyStats.beatenGames.map(g => `• ${g}`).join('\n')
                ].join('\n');
                embed.addFields({
                    name: '⭐ Games Beaten (+3pts)',
                    value: `\`\`\`ml\n${beatenText}\n\`\`\``
                });
            }

            if (yearlyStats.masteredGames.length > 0) {
                const masteredText = [
                    'Games Mastered (+3pts):',
                    yearlyStats.masteredGames.map(g => `• ${g}`).join('\n')
                ].join('\n');
                embed.addFields({
                    name: '✨ Games Mastered (+3pts)',
                    value: `\`\`\`ml\n${masteredText}\n\`\`\``
                });
            }

            // Add community awards section
            if (manualAwards.length > 0) {
                const awardsText = [
                    `Total Extra Points: ${manualPoints}`,
                    '',
                    manualAwards.map(award => 
                        `• ${award.reason}: ${award.totalAchievements} point${award.totalAchievements !== 1 ? 's' : ''}`
                    ).join('\n')
                ].join('\n');
                
                embed.addFields({
                    name: '🫂 Community Awards',
                    value: `\`\`\`ml\n${awardsText}\n\`\`\``
                });
            } else {
                embed.addFields({
                    name: '🫂 Community Awards',
                    value: '```\nNone\n```'
                });
            }

            // Add points total at the very bottom (colored text using ml code block)
            const pointsText = [
                '┌─ Points ──────────────┐',
                `│ Total: ${totalPoints}`,
                `│ • Challenge: ${yearlyStats.totalPoints}`,
                `│ • Bonus: ${manualPoints}`,
                '└────────────────────────┘'
            ].join('\n');
            embed.addFields({ name: '🏆 Total Points', value: `\`\`\`ml\n${pointsText}\n\`\`\`` });

            // Send the profile embed
            await loadingMsg.delete();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing profile:', error);
            await message.reply('Error getting profile data. Please try again.');
        }
    }
};
