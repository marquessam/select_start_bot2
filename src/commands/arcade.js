// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');
const User = require('../models/User');

// Arcade configuration: each entry defines a known leaderboard.
const arcadeConfigs = [
    {
        id: 1143,           // Leaderboard ID
        gameId: 291,        // Actual Game ID for Mario Kart Super Circuit
        name: "Mario Kart: Super Circuit (GBA) - Mario Circuit",
        leaderboardId: 1
    },
    {
        id: 18937,          // Leaderboard ID
        gameId: 1,          // Game ID for THPS
        name: "Tony Hawk's Pro Skater (PSX) - Warehouse, Woodland Hills",
        leaderboardId: 1
    },
    {
        id: 24,             // Leaderboard ID
        gameId: 2,          // Game ID for Tetris
        name: "Tetris (GB) - A-Type Challenge",
        leaderboardId: 1
    }
];

async function fetchLeaderboardEntries(gameId, leaderboardId = 1) {
    const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
    try {
        console.log(`Fetching leaderboard data for game ${gameId}, leaderboard ${leaderboardId}`);
        const data = await raAPI.getLeaderboardEntries(gameId, leaderboardId);
        console.log('Raw leaderboard response:', data);
        
        // Handle the response format
        if (!data || typeof data !== 'object') {
            console.log('No leaderboard data received or invalid format');
            return [];
        }

        // Convert the response into an array format we can use
        const entries = Object.entries(data).map(([rank, entry]) => ({
            Rank: parseInt(rank),
            User: entry.user || entry.User,  // Handle both possible field names
            Score: entry.score || entry.Score
        })).filter(entry => entry.User && entry.Score);

        // Sort by rank
        const sortedEntries = entries.sort((a, b) => a.Rank - b.Rank);
        console.log('Processed entries:', sortedEntries);
        return sortedEntries;
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        throw error;
    }
}

function formatEntry(entry) {
    let rankEmoji = '';
    if (entry.Rank === 1) {
        rankEmoji = '👑';
    } else if (entry.Rank === 2) {
        rankEmoji = '🥈';
    } else if (entry.Rank === 3) {
        rankEmoji = '🥉';
    }
    return `${rankEmoji} Rank #${entry.Rank} - ${entry.User}: ${entry.Score}`;
}

module.exports = {
    name: 'arcade',
    description: 'Displays highscore lists for preset arcade games (for registered users only)',
    async execute(message, args) {
        try {
            // If no argument is provided, list available leaderboards
            if (!args[0]) {
                let listText = '**Available Arcade Leaderboards:**\n\n';
                arcadeConfigs.forEach((config, index) => {
                    listText += `${index + 1}. ${config.name}\n`;
                });
                listText += `\nType \`!arcade <number>\` to view that leaderboard.`;
                
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Arcade Leaderboards')
                    .setDescription(listText)
                    .setFooter({ text: 'Data provided by RetroAchievements.org' });
                
                return message.channel.send({ embeds: [embed] });
            }

            // Parse the selection number
            const selection = parseInt(args[0]);
            if (isNaN(selection) || selection < 1 || selection > arcadeConfigs.length) {
                return message.reply(`Invalid selection. Please choose a number between 1 and ${arcadeConfigs.length}.`);
            }

            const selectedConfig = arcadeConfigs[selection - 1];

            // Show loading message
            const loadingMessage = await message.channel.send('Fetching leaderboard data...');

            // Fetch leaderboard entries using the leaderboard ID
            let leaderboardEntries = await fetchLeaderboardEntries(
                selectedConfig.id,  // Use the leaderboard ID for fetching entries
                selectedConfig.leaderboardId
            );

            // Retrieve registered users from database
            const users = await User.find({});
            const registeredUserSet = new Set(users.map(u => u.raUsername.toLowerCase()));

            // Filter entries to only include registered users
            leaderboardEntries = leaderboardEntries.filter(entry => {
                const username = entry.User?.toLowerCase();
                return username && registeredUserSet.has(username);
            });

            // Build the output text
            let output = `**${selectedConfig.name}**\n`;
            output += `**Game ID:** ${selectedConfig.id}\n\n`;
            output += '**User Highscores:**\n\n';

            // Display up to the top 15 entries
            const displayEntries = leaderboardEntries.slice(0, 15);
            if (displayEntries.length > 0) {
                for (const entry of displayEntries) {
                    output += formatEntry(entry) + '\n';
                }
            } else {
                output += 'No leaderboard entries found for your users.';
            }

            // Fetch game info for thumbnail using the actual game ID
            const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
            const gameInfo = await raAPI.getGameInfo(selectedConfig.gameId);  // Use gameId here
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Arcade Highscores')
                .setDescription(output)
                .setFooter({ text: 'Data provided by RetroAchievements.org' });

            if (gameInfo?.ImageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.ImageIcon}`);
            }

            // Delete loading message and send results
            await loadingMessage.delete();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Arcade command error:', error);
            await message.reply('Error fetching arcade leaderboard. The game or leaderboard might not be available.');
        }
    }
};