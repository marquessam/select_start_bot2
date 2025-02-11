// File: src/commands/arcade.js
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');

// Updated arcade configuration with correct game IDs and descriptions
const arcadeConfigs = [
    {
        leaderboardId: 1143,
        gameId: 533,
        name: "Mario Kart: Super Circuit (GBA)",
        description: "Mario Circuit"
    },
    {
        leaderboardId: 18937,
        gameId: 113311,
        name: "Tony Hawk's Pro Skater (PSX)",
        description: "Warehouse, Woodland Hills"
    },
    {
        leaderboardId: 24,
        gameId: 508,
        name: "Tetris (GB)",
        description: "A-Type Challenge"
    },
    {
        leaderboardId: 2042,
        gameId: 1491,
        name: "Pac-Man (NES)",
        description: "Hi Score"
    },
    {
        leaderboardId: 95894,
        gameId: 2819,
        name: "The Raiden Project (PSX)",
        description: "First Credit Highscore [Raiden 1]"
    },
    {
        leaderboardId: 4651,
        gameId: 1216,
        name: "Super Ghouls 'n Ghosts (SNES)",
        description: "Hi Score"
    },
    {
        leaderboardId: 2592,
        gameId: 342,
        name: "Gradius III (SNES)",
        description: "Hi Score - Normal"
    }
];

function ordinal(n) {
    const s = ["th", "st", "nd", "rd"],
        v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

async function fetchLeaderboardEntries(leaderboardId, raAPI, usernameUtils) {
    try {
        console.log(`Fetching leaderboard data for leaderboard ID: ${leaderboardId}`);
        const data = await raAPI.getLeaderboardInfo(leaderboardId);
        
        if (!data) {
            console.log('No leaderboard data received');
            return [];
        }

        let entries = [];
        if (data.Results && Array.isArray(data.Results)) {
            entries = data.Results.map(result => result.UserEntry || result);
        } else if (Array.isArray(data)) {
            entries = data;
        } else if (data.Entries && Array.isArray(data.Entries)) {
            entries = data.Entries;
        } else if (typeof data === 'object') {
            entries = Object.values(data);
        }

        // Convert entries to a standard format with canonical usernames
        const processedEntries = await Promise.all(entries
            .filter(entry => {
                const hasUser = Boolean(entry && (entry.User || entry.user));
                const hasScore = Boolean(entry && (entry.Score || entry.score || entry.FormattedScore || entry.formattedScore));
                return hasUser && hasScore;
            })
            .map(async entry => {
                const rawUser = entry.User || entry.user || '';
                const apiRank = entry.Rank || entry.rank || '0';
                const formattedScore = entry.FormattedScore || entry.formattedScore;
                const fallbackScore = entry.Score || entry.score || '0';
                const trackTime = formattedScore ? formattedScore.trim() : fallbackScore.toString();
                
                // Get canonical username
                const canonicalUsername = await usernameUtils.getCanonicalUsername(rawUser.trim());
                
                return {
                    ApiRank: parseInt(apiRank, 10),
                    User: canonicalUsername || rawUser.trim(), // Fall back to raw if canonical not found
                    TrackTime: trackTime,
                    DateSubmitted: entry.DateSubmitted || entry.dateSubmitted || null,
                };
            }));

        return processedEntries.filter(entry => !isNaN(entry.ApiRank) && entry.User.length > 0);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        throw error;
    }
}

function formatEntry(displayRank, entry) {
    const ordinalRank = ordinal(displayRank);
    return `${ordinalRank} (Rank #${entry.ApiRank}) - ${entry.User}: ${entry.TrackTime}`;
}

module.exports = {
    name: 'arcade',
    description: 'Displays highscore lists for preset arcade games',
    async execute(message, args) {
        try {
            // Check required services
            const { raAPI, usernameUtils } = message.client;
            if (!raAPI || !usernameUtils) {
                console.error('Required services not available:', {
                    hasRaAPI: !!raAPI,
                    hasUsernameUtils: !!usernameUtils
                });
                throw new Error('Required services not available');
            }

            if (!args[0]) {
                let listText = '**Available Arcade Leaderboards:**\n\n';
                arcadeConfigs.forEach((config, index) => {
                    listText += `${index + 1}. ${config.name}\n   *${config.description}*\n`;
                });
                listText += `\n**Note:** Only players who are registered with our bot will appear in these rankings.\n\n`;
                listText += `Type \`!arcade <number>\` to view that leaderboard.`;

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Arcade Leaderboards')
                    .setDescription(listText)
                    .setFooter({ text: 'Data provided by RetroAchievements.org' });
                return message.channel.send({ embeds: [embed] });
            }

            const selection = parseInt(args[0], 10);
            if (isNaN(selection) || selection < 1 || selection > arcadeConfigs.length) {
                return message.reply(`Invalid selection. Please choose a number between 1 and ${arcadeConfigs.length}.`);
            }

            const selectedConfig = arcadeConfigs[selection - 1];
            const loadingMessage = await message.channel.send('Fetching leaderboard data...');

            let leaderboardEntries = await fetchLeaderboardEntries(selectedConfig.leaderboardId, raAPI, usernameUtils);
            console.log('Number of entries before user filtering:', leaderboardEntries.length);

            // Get registered users and create lookup map
            const users = await User.find({ isActive: true });
            const registeredUsers = new Map();
            for (const user of users) {
                const canonicalUsername = await usernameUtils.getCanonicalUsername(user.raUsername);
                if (canonicalUsername) {
                    registeredUsers.set(canonicalUsername.toLowerCase(), canonicalUsername);
                }
            }

            // Filter entries to only show registered users
            leaderboardEntries = leaderboardEntries.filter(entry => {
                return entry.User && registeredUsers.has(entry.User.toLowerCase());
            });

            let output = `**${selectedConfig.name}**\n`;
            output += `*${selectedConfig.description}*\n\n`;
            output += '**User Highscores:**\n\n';

            if (leaderboardEntries.length > 0) {
                const displayEntries = leaderboardEntries.slice(0, 15);
                displayEntries.forEach((entry, index) => {
                    output += formatEntry(index + 1, entry) + '\n';
                });
            } else {
                output += 'No leaderboard entries found for registered users.';
            }

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
            await message.reply('Error fetching arcade leaderboard. The game or leaderboard might not be unavailable.');
        }
    }
};
