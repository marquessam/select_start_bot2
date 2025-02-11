// File: src/commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType } = require('../enums/AwardType');

/**
 * Helper function to pad strings for consistent formatting
 */
function padString(str, length) {
    return str.toString().slice(0, length).padEnd(length);
}

module.exports = {
    name: 'leaderboard',
    description: 'Shows monthly or yearly leaderboard',
    async execute(message, args) {
        try {
            // Check services are available
            const { leaderboardService } = message.client;
            if (!leaderboardService) {
                console.error('Leaderboard service not available');
                throw new Error('Required services not available');
            }

            // Determine whether to show the monthly or yearly leaderboard
            const type = args[0]?.toLowerCase() || 'month';
            let embed;

            const loadingMsg = await message.channel.send('Fetching leaderboard data...');

            try {
                if (type === 'month' || type === 'm') {
                    // Try to get from cache first
                    embed = await leaderboardService.getMonthlyLeaderboardCache();
                    if (!embed) {
                        embed = await leaderboardService.displayMonthlyLeaderboard();
                    }
                } else if (type === 'year' || type === 'y') {
                    // Try to get from cache first
                    embed = await leaderboardService.getYearlyLeaderboardCache();
                    if (!embed) {
                        embed = await leaderboardService.displayYearlyLeaderboard();
                    }
                } else {
                    await loadingMsg.delete();
                    return message.reply('Invalid command. Use !leaderboard month/m or !leaderboard year/y');
                }

                await loadingMsg.delete();
                await message.channel.send({ embeds: [embed] });

            } catch (error) {
                await loadingMsg.delete();
                console.error('Error getting leaderboard:', error);
                throw new Error('Error retrieving leaderboard data');
            }

        } catch (error) {
            if (error.message === 'Required services not available') {
                await message.reply('Bot services are currently unavailable. Please try again later.');
            } else {
                console.error('Leaderboard error:', error);
                await message.reply('Error getting leaderboard data. Please try again.');
            }
        }
    }
};
