// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType } = require('../enums/AwardType');

function padString(str, length) {
    return str.toString().slice(0, length).padEnd(length);
}

async function displayMonthlyLeaderboard(usernameUtils) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const monthlyGame = await Game.findOne({
        month: currentMonth,
        year: currentYear,
        type: 'MONTHLY'
    });

    if (!monthlyGame) {
        throw new Error('No monthly game found for current month.');
    }

    const awards = await Award.find({
        gameId: monthlyGame.gameId,
        month: currentMonth,
        year: currentYear,
        achievementCount: { $gt: 0 }
    });

    // Process awards using canonical usernames
    const uniqueAwards = new Map();
    for (const award of awards) {
        const canonicalUsername = await usernameUtils.getCanonicalUsername(award.raUsername);
        if (canonicalUsername) {
            const existingAward = uniqueAwards.get(canonicalUsername);
            if (!existingAward || award.achievementCount > existingAward.achievementCount) {
                award.canonicalUsername = canonicalUsername;
                uniqueAwards.set(canonicalUsername, award);
            }
        }
    }

    const sortedAwards = Array.from(uniqueAwards.values())
        .sort((a, b) => b.achievementCount - a.achievementCount);

    // Assign ranks, handling ties
    let currentRank = 1;
    let currentScore = -1;
    let increment = 0;

    sortedAwards.forEach(award => {
        if (award.achievementCount !== currentScore) {
            currentRank += increment;
            increment = 1;
            currentScore = award.achievementCount;
            award.rank = currentRank;
        } else {
            award.rank = currentRank;
            increment++;
        }
    });

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Monthly Challenge:')
        .setDescription(`**${monthlyGame.title}**`)
        .setThumbnail('https://media.retroachievements.org/Images/022504.png');

    const topTen = sortedAwards.slice(0, 10);
    const others = sortedAwards.slice(10);

    if (topTen.length > 0) {
        let topTenText = '';
        
        topTen.forEach(award => {
            const rank = padString(award.rank, 2);
            const username = award.canonicalUsername.padEnd(13);
            const progress = `${award.achievementCount}/${award.totalAchievements}`;
            
            topTenText += `${rank} ${username} ${progress}\n`;
        });

        embed.addFields({ 
            name: 'Top Rankings', 
            value: '```\n' + topTenText + '```' 
        });

        if (others.length > 0) {
            const othersText = others
                .map(a => `${a.canonicalUsername}: ${a.achievementCount}/${a.totalAchievements}`)
                .join('\n');
            embed.addFields({ 
                name: 'Also Participating', 
                value: '```\n' + othersText + '```' 
            });
        }
    }

    return embed;
}

async function displayYearlyLeaderboard(usernameUtils, awardService) {
    const currentYear = new Date().getFullYear();
    const users = await User.find({ isActive: true });
    const leaderboardData = [];

    for (const user of users) {
        const canonicalUsername = await usernameUtils.getCanonicalUsername(user.raUsername);
        const stats = await awardService.getYearlyStats(canonicalUsername);
        
        if (stats.totalPoints > 0) {
            leaderboardData.push({
                username: canonicalUsername,
                ...stats
            });
        }
    }

    const sortedData = leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints);

    // Assign ranks, handling ties
    let currentRank = 1;
    let currentPoints = -1;
    let increment = 0;

    sortedData.forEach(entry => {
        if (entry.totalPoints !== currentPoints) {
            currentRank += increment;
            increment = 1;
            currentPoints = entry.totalPoints;
            entry.rank = currentRank;
        } else {
            entry.rank = currentRank;
            increment++;
        }
    });

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('2025 Yearly Rankings');

    if (sortedData.length > 0) {
        let text = '';
        sortedData.forEach(entry => {
            const rank = padString(entry.rank, 2);
            const name = entry.username.padEnd(13);
            const total = padString(entry.totalPoints, 4);
            const challenge = padString(entry.totalPoints - entry.manualPoints, 4);
            const community = padString(entry.manualPoints, 4);
            
            text += `${rank} ${name} ${total} (${challenge}+${community})\n`;
        });

        embed.addFields(
            { 
                name: 'Rankings', 
                value: '```\n' + text + '```' 
            },
            {
                name: 'Legend',
                value: 'Rank Username    Total (Challenge+Community)'
            }
        );
    } else {
        embed.addFields({ 
            name: 'Rankings', 
            value: 'No points earned yet!' 
        });
    }

    return embed;
}

module.exports = {
    name: 'leaderboard',
    description: 'Shows the leaderboard',
    async execute(message, args) {
        try {
            const type = args[0]?.toLowerCase() || 'month';
            let embed;

            // Get services from client
            const { usernameUtils, awardService } = message.client;

            if (type === 'month' || type === 'm') {
                embed = await displayMonthlyLeaderboard(usernameUtils);
            } else if (type === 'year' || type === 'y') {
                embed = await displayYearlyLeaderboard(usernameUtils, awardService);
            } else {
                return message.reply('Invalid command. Use !leaderboard month/m or !leaderboard year/y');
            }

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Leaderboard error:', error);
            await message.reply('Error getting leaderboard data.');
        }
    }
};
