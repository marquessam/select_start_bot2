// File: src/commands/leaderboard.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

function padString(str, length) {
    return str.toString().slice(0, length).padEnd(length);
}

async function displayMonthlyLeaderboard() {
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

    // Get all awards with progress from database
    const awards = await Award.find({
        gameId: monthlyGame.gameId,
        month: currentMonth,
        year: currentYear,
        achievementCount: { $gt: 0 }
    });

    // Group by canonical username
    const uniqueAwards = {};
    for (const award of awards) {
        const user = await User.findOne({
            raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
        });
        
        if (user) {
            const canonicalUsername = user.raUsername;
            if (!uniqueAwards[canonicalUsername] || 
                award.achievementCount > uniqueAwards[canonicalUsername].achievementCount) {
                award.raUsername = canonicalUsername;
                uniqueAwards[canonicalUsername] = award;
            }
        }
    }

    // Sort by achievement count
    const sortedAwards = Object.values(uniqueAwards)
        .sort((a, b) => b.achievementCount - a.achievementCount);

    // Handle ties
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
        .setDescription(`**${monthlyGame.title}**`);

    const topTen = sortedAwards.slice(0, 10);
    const others = sortedAwards.slice(10);

    if (topTen.length > 0) {
        let topTenText = 'Rank  Player         Progress\n';
        topTenText += '--------------------------------\n';
        
        topTen.forEach(award => {
            const rank = padString(award.rank, 4);
            const username = padString(award.raUsername, 13);
            const progress = `${award.achievementCount}/${award.totalAchievements}`;
            const awardEmoji = AwardFunctions.getEmoji(award.award);
            
            topTenText += `${rank} ${username} ${progress} ${awardEmoji}\n`;
        });

        embed.addFields({ 
            name: 'Top Rankings', 
            value: '```\n' + topTenText + '```' 
        });

        if (others.length > 0) {
            const othersText = others
                .map(a => `${a.raUsername}: ${a.achievementCount}/${a.totalAchievements} ${AwardFunctions.getEmoji(a.award)}`)
                .join('\n');
            embed.addFields({ 
                name: 'Also Participating', 
                value: '```\n' + othersText + '```' 
            });
        }
    }

    return embed;
}

async function displayYearlyLeaderboard() {
    const currentYear = new Date().getFullYear();
    const awards = await Award.find({ year: currentYear });

    const userPoints = {};

    // Group by canonical username
    for (const award of awards) {
        const user = await User.findOne({
            raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
        });

        if (user) {
            const canonicalUsername = user.raUsername;
            if (!userPoints[canonicalUsername]) {
                userPoints[canonicalUsername] = {
                    username: canonicalUsername,
                    totalPoints: 0,
                    participations: 0,
                    beaten: 0,
                    mastered: 0,
                    processedGames: new Set()
                };
            }

            const gameKey = `${award.gameId}-${award.month}`;
            if (!userPoints[canonicalUsername].processedGames.has(gameKey)) {
                const points = AwardFunctions.getPoints(award.award);
                if (points > 0) {
                    userPoints[canonicalUsername].totalPoints += points;
                    if (award.award >= AwardType.PARTICIPATION) userPoints[canonicalUsername].participations++;
                    if (award.award >= AwardType.BEATEN) userPoints[canonicalUsername].beaten++;
                    if (award.award >= AwardType.MASTERED) userPoints[canonicalUsername].mastered++;
                    userPoints[canonicalUsername].processedGames.add(gameKey);
                }
            }
        }
    }

    // Convert to array and sort by points
    const leaderboard = Object.values(userPoints)
        .filter(user => user.totalPoints > 0)
        .map(({ processedGames, ...user }) => user)
        .sort((a, b) => b.totalPoints - a.totalPoints);

    // Handle ties
    let currentRank = 1;
    let currentPoints = -1;
    let increment = 0;

    leaderboard.forEach(user => {
        if (user.totalPoints !== currentPoints) {
            currentRank += increment;
            increment = 1;
            currentPoints = user.totalPoints;
            user.rank = currentRank;
        } else {
            user.rank = currentRank;
            increment++;
        }
    });

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('2025 Yearly Rankings');

    if (leaderboard.length > 0) {
        let text = 'Rank  Player         Pts  P  B  M\n';
        text += '--------------------------------\n';

        leaderboard.forEach(user => {
            const rank = padString(user.rank, 4);
            const name = padString(user.username, 13);
            const points = padString(user.totalPoints, 4);
            const p = padString(user.participations, 2);
            const b = padString(user.beaten, 2);
            const m = padString(user.mastered, 2);
            
            text += `${rank} ${name} ${points} ${p} ${b} ${m}\n`;
        });

        embed.addFields({ name: 'Rankings', value: '```\n' + text + '```' });
    } else {
        embed.addFields({ 
            name: 'Rankings', 
            value: 'No points earned yet!' 
        });
    }

    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the leaderboard')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of leaderboard to display')
                .setRequired(false)
                .addChoices(
                    { name: 'Monthly', value: 'month' },
                    { name: 'Yearly', value: 'year' }
                )),

    async execute(interaction) {
        try {
            const isSlashCommand = interaction.isChatInputCommand?.();
            const args = isSlashCommand 
                ? [interaction.options.getString('type')] 
                : interaction.content.slice(1).trim().split(/ +/).slice(1);
            
            const type = args[0]?.toLowerCase() || 'month';
            let embed;

            if (type === 'month' || type === 'm') {
                embed = await displayMonthlyLeaderboard();
            } else if (type === 'year' || type === 'y') {
                embed = await displayYearlyLeaderboard();
            } else {
                const response = 'Invalid command. Use !leaderboard month/m or !leaderboard year/y';
                return isSlashCommand ? interaction.reply(response) : interaction.reply(response);
            }

            if (isSlashCommand) {
                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.channel.send({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Leaderboard error:', error);
        const response = 'Error getting leaderboard data.';
            if (isSlashCommand) {
                await interaction.reply(response);
            } else {
                await interaction.reply(response);
            }
        }
    }
};
