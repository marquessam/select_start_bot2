// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const RetroAchievementsAPI = require('../services/retroAchievements');
const User = require('../models/User');

// Arcade configuration: each entry defines a known leaderboard
const arcadeConfigs = [
    {
        leaderboardId: 1143,
        gameId: 533,
        name: "Mario Kart: Super Circuit (GBA) - Mario Circuit",
    },
    {
        leaderboardId: 18937,
        gameId: 146,
        name: "Tony Hawk's Pro Skater (PSX) - Warehouse, Woodland Hills",
    },
    {
        leaderboardId: 24,
        gameId: 7,
        name: "Tetris (GB) - A-Type Challenge",
    }
];

/**
 * Normalize leaderboard entries.
 * Since duplicate keys are possible, this function ensures:
 *  - We use a single, trimmed user string with consistent casing.
 *  - We ensure that the numeric fields are valid.
 */
async function fetchLeaderboardEntries(leaderboardId) {
    const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
    try {
        console.log(`Fetching leaderboard data for leaderboard ID: ${leaderboardId}`);
        const data = await raAPI.getLeaderboardInfo(leaderboardId);
        console.log('Raw leaderboard response:', data);
        
        if (!data) {
            console.log('No leaderboard data received');
            return [];
        }

        // Handle various response formats.
        let entries = data;
        if (!Array.isArray(data)) {
            if (data.Entries && Array.isArray(data.Entries)) {
                entries = data.Entries;
            } else if (typeof data === 'object') {
                entries = Object.values(data);
            }
        }

        // Process and sanitize each entry.
        // We explicitly convert values to string, trim, and convert usernames to lowercase.
        const validEntries = entries
            .filter(entry => {
                // Only include entries that have a defined user and score.
                return entry && (entry.User || entry.user) && (entry.Score || entry.score);
            })
            .map(entry => {
                // Here the last occurrence of duplicate keys is used.
                const rawUser = entry.User || entry.user || '';
                return {
                    Rank: parseInt(entry.Rank || entry.rank || '0'),
                    User: rawUser.trim(),
                    Score: parseInt(entry.Score || entry.score || '0'),
                    DateSubmitted: entry.DateSubmitted || entry.dateSubmitted || null,
                };
            })
            .filter(entry => {
                return !isNaN(entry.Rank) && !isNaN(entry.Score) && entry.User.length > 0;
            });

        // Sort by rank.
        validEntries.sort((a, b) => a.Rank - b.Rank);

        console.log(`Processed ${validEntries.length} valid leaderboard entries`);
        return validEntries;
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
    
    const score = Number(entry.Score).toLocaleString();
    return `${rankEmoji} Rank #${entry.Rank} - ${entry.User}: ${score}`;
}

module.exports = {
    name: 'arcade',
    description: 'Displays highscore lists for preset arcade games (for registered users only)',
    async execute(message, args) {
        try {
            // List available leaderboards if no argument provided.
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

            const selection = parseInt(args[0]);
            if (isNaN(selection) || selection < 1 || selection > arcadeConfigs.length) {
                return message.reply(`Invalid selection. Please choose a number between 1 and ${arcadeConfigs.length}.`);
            }

            const selectedConfig = arcadeConfigs[selection - 1];
            const loadingMessage = await message.channel.send('Fetching leaderboard data...');

            // Retrieve and normalize leaderboard entries.
            let leaderboardEntries = await fetchLeaderboardEntries(selectedConfig.leaderboardId);

            // Retrieve registered users from the database.
            const users = await User.find({});
            console.log('Registered Users:', users.map(u => u.raUsername));
            const registeredUserSet = new Set(users.map(u => u.raUsername.toLowerCase()));

            console.log('Leaderboard entries before filtering:', leaderboardEntries.map(e => e.User));
            leaderboardEntries = leaderboardEntries.filter(entry => {
                return entry.User && registeredUserSet.has(entry.User.toLowerCase());
            });
            console.log('Leaderboard entries after filtering:', leaderboardEntries.map(e => e.User));

            let output = `**${selectedConfig.name}**\n\n`;
            output += '**User Highscores:**\n\n';

            if (leaderboardEntries.length > 0) {
                const displayEntries = leaderboardEntries.slice(0, 15);
                for (const entry of displayEntries) {
                    output += formatEntry(entry) + '\n';
                }
            } else {
                output += 'No leaderboard entries found for your users.';
            }

            // Fetch game info for thumbnail.
            const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);
            const gameInfo = await raAPI.getGameInfo(selectedConfig.gameId);
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Arcade Highscores')
                .setDescription(output)
                .setFooter({ text: 'Data provided by RetroAchievements.org' });

            if (gameInfo?.ImageIcon) {
                embed.setThumbnail(`https://retroachievements.org${gameInfo.ImageIcon}`);
            }

            await loadingMessage.delete();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Arcade command error:', error);
            await message.reply('Error fetching arcade leaderboard. The game or leaderboard might not be available.');
        }
    }
};