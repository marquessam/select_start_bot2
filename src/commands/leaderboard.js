// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');

function padString(str, length) {
    return str.toString().slice(0, length).padEnd(length);
}

async function displayMonthlyLeaderboard() {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Get both monthly and shadow games
    const games = await Game.find({
        month: currentMonth,
        year: currentYear
    });

    if (games.length === 0) {
        throw new Error('No games found for current month.');
    }

    // Get all awards for current games
    const monthlyGame = games.find(g => g.type === 'MONTHLY');
    const shadowGame = games.find(g => g.type === 'SHADOW');

    const awards = await Award.find({
        gameId: { $in: games.map(g => g.gameId) },
        month: currentMonth,
        year: currentYear,
        isManual: false,
        achievementCount: { $gt: 0 }
    });

    // Group awards by user
    const userProgress = new Map();
    for (const award of awards) {
        const user = await User.findOne({
            raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
        });
        if (!user) continue;

        const key = user.raUsername;
        if (!userProgress.has(key)) {
            userProgress.set(key, {
                monthly: null,
                shadow: null
            });
        }

        const progress = userProgress.get(key);
        if (award.gameId === monthlyGame.gameId) {
            progress.monthly = award;
        } else if (award.gameId === shadowGame.gameId) {
            progress.shadow = award;
        }
    }

    // Calculate scores and sort users
    const rankings = Array.from(userProgress.entries())
        .map(([username, progress]) => {
            const monthlyPoints = progress.monthly ? progress.monthly.getPoints() : 0;
            const shadowPoints = progress.shadow ? progress.shadow.getPoints() : 0;
            const totalPoints = monthlyPoints + shadowPoints;

            return {
                username,
                totalPoints,
                monthlyProgress: progress.monthly ? 
                    `${progress.monthly.achievementCount}/${progress.monthly.totalAchievements}` : '0/0',
                shadowProgress: progress.shadow ?
                    `${progress.shadow.achievementCount}/${progress.shadow.totalAchievements}` : '0/0'
            };
        })
        .sort((a, b) => {
            // Sort by total points, then by monthly progress if tied
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            const [aCount] = a.monthlyProgress.split('/').map(Number);
            const [bCount] = b.monthlyProgress.split('/').map(Number);
            return bCount - aCount;
        });

    // Create embed
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Monthly Challenge Rankings')
        .setDescription(`**Monthly Game:** ${monthlyGame.title}\n**Shadow Game:** ${shadowGame.title}`);

    // Format rankings
    if (rankings.length > 0) {
        const topTen = rankings.slice(0, 10);
        const others = rankings.slice(10);

        let topTenText = '';
        topTen.forEach((rank, index) => {
            const rankNum = padString(index + 1, 2);
            const username = padString(rank.username, 13);
            topTenText += `${rankNum} ${username} ${rank.monthlyProgress} | ${rank.shadowProgress}\n`;
        });

        embed.addFields({
            name: 'Top Rankings',
            value: '```\n' + topTenText + '```'
        });

        if (others.length > 0) {
            let othersText = others
                .map(rank => `${rank.username}: ${rank.monthlyProgress} | ${rank.shadowProgress}`)
                .join('\n');
            embed.addFields({
                name: 'Also Participating',
                value: '```\n' + othersText + '```'
            });
        }

        embed.addFields({
            name: 'Legend',
            value: 'Format: Username MonthlyProgress | ShadowProgress'
        });
    }

    return embed;
}

async function displayYearlyLeaderboard() {
    const currentYear = new Date().getFullYear();
    const users = await User.find({ isActive: true });

    // Get all awards for the year
    const yearlyStats = [];
    for (const user of users) {
        const awards = await Award.find({
            raUsername: user.raUsername.toLowerCase(),
            year: currentYear
        });

        let challengePoints = 0;
        let manualPoints = 0;
        const processedGames = new Set();

        for (const award of awards) {
            if (award.isManual) {
                manualPoints += award.manualPoints;
                continue;
            }

            const gameKey = `${award.gameId}-${award.month}`;
            if (!processedGames.has(gameKey)) {
                processedGames.add(gameKey);
                challengePoints += award.getPoints();
            }
        }

        const totalPoints = challengePoints + manualPoints;
        if (totalPoints > 0) {
            yearlyStats.push({
                username: user.raUsername,
                total: totalPoints,
                challenge: challengePoints,
                community: manualPoints
            });
        }
    }

    // Sort by total points
    yearlyStats.sort((a, b) => b.total - a.total);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${currentYear} Yearly Rankings`);

    if (yearlyStats.length > 0) {
        let text = '';
        yearlyStats.forEach((stat, index) => {
            const rank = padString(index + 1, 2);
            const name = padString(stat.username, 13);
            const total = padString(stat.total, 4);
            const challenge = padString(stat.challenge, 4);
            const community = padString(stat.community, 4);
            
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
    description: 'Shows monthly or yearly leaderboard',
    async execute(message, args) {
        try {
            const type = args[0]?.toLowerCase() || 'month';
            let embed;

            const loadingMsg = await message.channel.send('Fetching leaderboard data...');

            try {
                if (type === 'month' || type === 'm') {
                    embed = await displayMonthlyLeaderboard();
                } else if (type === 'year' || type === 'y') {
                    embed = await displayYearlyLeaderboard();
                } else {
                    await loadingMsg.delete();
                    return message.reply('Invalid command. Use !leaderboard month/m or !leaderboard year/y');
                }

                await loadingMsg.delete();
                await message.channel.send({ embeds: [embed] });

            } catch (error) {
                await loadingMsg.delete();
                throw error;
            }

        } catch (error) {
            console.error('Leaderboard error:', error);
            await message.reply('Error getting leaderboard data. Please try again.');
        }
    }
};
