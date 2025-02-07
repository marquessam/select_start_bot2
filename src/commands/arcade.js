// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');
const User = require('../models/User');

// Arcade configuration: each entry defines a known leaderboard.
const arcadeConfigs = [
    {
        id: 1143,
        name: "Mario Kart: Super Circuit (GBA) - Mario Circuit",
        leaderboardId: 1
    },
    {
        id: 18937,
        name: "Tony Hawk's Pro Skater (PSX) - Warehouse, Woodland Hills",
        leaderboardId: 1
    },
    {
        id: 24,
        name: "Tetris (GB) - A-Type Challenge",
        leaderboardId: 1
    },
];

async function fetchLeaderboardEntries(gameId, leaderboardId = 1) {
    const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
    try {
        const data = await raAPI.getLeaderboardEntries(gameId, leaderboardId);
        
        // Handle the response format
        if (!data || typeof data !== 'object') {
            throw new Error('No leaderboard data received');
        }

        // Convert the response into an array format we can use
        const entries = Object.entries(data).map(([rank, entry]) => ({
            Rank: parseInt(rank),
            User: entry.user,
            Score: entry.score
        })).filter(entry => entry.User && entry.Score);

        // Sort by rank
        return entries.sort((a, b) => a.Rank - b.Rank);
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

            // Fetch leaderboard entries
            let leaderboardEntries = await fetchLeaderboardEntries(
                selectedConfig.id, 
                selectedConfig.leaderboardId
            );

            // Retrieve registered users from database
            const users = await User.find({});
            const registeredUserSet = new Set(users.map(u => u.raUsername.toLowerCase()));

            // Filter entries to only include registered users
            leaderboardEntries = leaderboardEntries.filter(entry => 
                registeredUserSet.has(entry.User.toLowerCase())
            );

            // Build the output text
            let output = `**${selectedConfig.name}**\n`;
            output += `**Game ID:** ${selectedConfig.id}\n\n`;
            output += '**User Highscores:**\n\n';

            // Display up to the top 15 entries
            const displayEntries = leaderboardEntries.slice(0, 15);
            for (const entry of displayEntries) {
                output += formatEntry(entry) + '\n';
            }
            
            if (displayEntries.length === 0) {
                output += 'No leaderboard entries found for your users.';
            }

            // Fetch game info for thumbnail
            const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
            const gameInfo = await raAPI.getGameInfo(selectedConfig.id);
            
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