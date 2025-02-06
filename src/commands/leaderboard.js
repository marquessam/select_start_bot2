// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');

function calculatePoints(awards) {
    let points = 0;
    if (awards.participation) points += 1;
    if (awards.beaten) points += 3;
    if (awards.mastered) points += 3;
    return points;
}

async function getMonthlyLeaderboard() {
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

    // Get all awards for this game with progress > 0
    const awards = await Award.find({
        gameId: monthlyGame.gameId,
        month: currentMonth,
        year: currentYear,
        achievementCount: { $gt: 0 }
    });

    // Sort by achievement count and handle ties
    const sortedAwards = awards.sort((a, b) => {
        return b.achievementCount - a.achievementCount;
    });

    // Assign ranks handling ties
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

    return {
        game: monthlyGame,
        topTen: sortedAwards.slice(0, 10),
        others: sortedAwards.slice(10)
    };
}

async function getYearlyLeaderboard() {
    const currentYear = new Date().getFullYear();
    const awards = await Award.find({ year: currentYear });

    // Group awards by user and calculate total points
    const userPoints = {};
    
    for (const award of awards) {
        if (!userPoints[award.raUsername]) {
            userPoints[award.raUsername] = {
                username: award.raUsername,
                totalPoints: 0,
                participations: 0,
                beaten: 0,
                mastered: 0
            };
        }

        const points = calculatePoints(award.awards);
        if (points > 0) {
            userPoints[award.raUsername].totalPoints += points;
            if (award.awards.participation) userPoints[award.raUsername].participations++;
            if (award.awards.beaten) userPoints[award.raUsername].beaten++;
            if (award.awards.mastered) userPoints[award.raUsername].mastered++;
        }
    }

    // Convert to array, filter out zero points, and sort
    const sortedUsers = Object.values(userPoints)
        .filter(user => user.totalPoints > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints);

    // Assign ranks handling ties
    let currentRank = 1;
    let currentPoints = -1;
    let increment = 0;

    sortedUsers.forEach(user => {
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

    return sortedUsers;
}

module.exports = {
    name: 'leaderboard',
    async execute(message, args) {
        try {
            const type = args[0]?.toLowerCase() || 'month';

            if (type === 'month') {
                const { game, topTen, others } = await getMonthlyLeaderboard();

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(`Monthly Challenge Leaderboard: ${game.title}`);

                // Top 10 Section
                let topTenText = '```\nRank  Player          Progress   Awards\n';
                topTenText += '----------------------------------------\n';
                
                topTen.forEach(award => {
                    const rank = award.rank.toString().padEnd(5);
                    const username = award.raUsername.padEnd(15);
                    const progress = `${award.achievementCount}/${game.numAchievements}`.padEnd(10);
                    let awardText = '';
                    if (award.awards.mastered) awardText = '✨';
                    else if (award.awards.beaten) awardText = '⭐';
                    else if (award.awards.participation) awardText = '🏁';
                    
                    topTenText += `${rank}${username}${progress}${awardText}\n`;
                });
                topTenText += '```';
                
                embed.addFields({ name: 'Top 10', value: topTenText });

                // Other Participants Section
                if (others.length > 0) {
                    let othersText = 'Also Participating:\n```\n';
                    others.forEach(award => {
                        othersText += `${award.raUsername} (${award.achievementCount}/${game.numAchievements})\n`;
                    });
                    othersText += '```';
                    embed.addFields({ name: 'Other Participants', value: othersText });
                }

                embed.setFooter({ text: '✨ = Mastered | ⭐ = Beaten | 🏁 = Participated' });
                
                message.channel.send({ embeds: [embed] });

            } else if (type === 'year') {
                const yearlyLeaderboard = await getYearlyLeaderboard();

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('2025 Overall Standings');

                let leaderboardText = '```\nRank  Player          Points  P  B  M\n';
                leaderboardText += '----------------------------------------\n';

                yearlyLeaderboard.forEach(user => {
                    const rank = user.rank.toString().padEnd(5);
                    const username = user.username.padEnd(15);
                    const points = user.totalPoints.toString().padEnd(7);
                    const p = user.participations.toString().padEnd(3);
                    const b = user.beaten.toString().padEnd(3);
                    const m = user.mastered.toString();
                    
                    leaderboardText += `${rank}${username}${points}${p}${b}${m}\n`;
                });
                leaderboardText += '```';

                embed.addFields({ 
                    name: 'Rankings', 
                    value: leaderboardText 
                });

                embed.setFooter({ text: 'P = Participations | B = Beaten | M = Mastered' });
                
                message.channel.send({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Leaderboard error:', error);
            message.reply('Error getting leaderboard data.');
        }
    }
};
