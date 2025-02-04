// File: src/commands/leaderboard.js
const { SlashCommandBuilder } = require('discord.js');
const leaderboardService = require('../services/leaderboardService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the leaderboards')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Which leaderboard to view')
                .setRequired(false)
                .addChoices(
                    { name: 'Monthly', value: 'monthly' },
                    { name: 'Yearly', value: 'yearly' }
                )),

    async execute(message, args) {
        try {
            const type = args ? args[0]?.toLowerCase() : 'monthly';

            if (type === 'monthly' || !type) {
                const monthlyData = await leaderboardService.getCurrentMonthlyProgress();
                const formattedMessage = formatMonthlyLeaderboard(monthlyData);
                await message.channel.send(formattedMessage);
            }
            else if (type === 'yearly') {
                const yearlyData = await leaderboardService.getYearlyPoints();
                const formattedMessage = formatYearlyLeaderboard(yearlyData);
                await message.channel.send(formattedMessage);
            }
            else {
                await message.reply('Invalid command. Use !leaderboard, !leaderboard monthly, or !leaderboard yearly');
            }
        } catch (error) {
            console.error('Error displaying leaderboard:', error);
            await message.reply('There was an error getting the leaderboard data!');
        }
    }
};

function formatMonthlyLeaderboard(data) {
    const { game, leaderboard } = data;
    let message = `🏆 Current Monthly Challenge: ${game}\n\n`;
    message += "```\n";
    message += "Rank  Player             Progress  Percent\n";
    message += "----------------------------------------\n";

    leaderboard.forEach((entry, index) => {
        const rank = (index + 1).toString().padEnd(4);
        const username = entry.username.padEnd(18);
        const progress = `${entry.achievements}/${entry.totalAchievements}`.padEnd(8);
        const percent = `${entry.percentage}%`.padEnd(6);
        
        message += `${rank} ${username} ${progress} ${percent}\n`;
    });

    message += "```";
    return message;
}

function formatYearlyLeaderboard(leaderboard) {
    let message = "🏆 2024 Overall Standings\n\n";
    message += "```\n";
    message += "Rank  Player             Points  Monthly  Shadow\n";
    message += "----------------------------------------------\n";

    leaderboard.forEach((entry, index) => {
        const rank = (index + 1).toString().padEnd(4);
        const username = entry.username.padEnd(18);
        const points = entry.totalPoints.toString().padEnd(7);
        const monthly = entry.monthlyGames.toString().padEnd(8);
        const shadow = entry.shadowGames.toString();
        
        message += `${rank} ${username} ${points} ${monthly} ${shadow}\n`;
    });

    message += "```";
    return message;
}
