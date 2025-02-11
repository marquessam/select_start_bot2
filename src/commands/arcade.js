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

async function fetchLeaderboardEntries(leaderboardId, raAPI) {
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

        const validEntries = entries
            .filter(entry => {
                const hasUser = Boolean(entry && (entry.User || entry.user));
                const hasScore = Boolean(entry && (entry.Score || entry.score || entry.FormattedScore || entry.formattedScore));
                return hasUser && hasScore;
            })
            .map(entry => {
                const rawUser = entry.User || entry.user || '';
                const apiRank = entry.Rank || entry.rank || '0';
                const formattedScore = entry.FormattedScore || entry.formattedScore;
                const fallbackScore = entry.Score || entry.score || '0';
                const trackTime = formattedScore ? formattedScore.trim() : fallbackScore.toString();
                
                return {
                    ApiRank: parseInt(apiRank, 10),
                    User: rawUser.trim(),
                    TrackTime: trackTime,
                    DateSubmitted: entry.DateSubmitted || entry.dateSubmitted || null,
                };
            })
            .filter(entry => !isNaN(entry.ApiRank) && entry.User.length > 0);

        return validEntries;
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
            if (!args[0]) {
                let listText = '**Available Arcade Leaderboards:**\n\n';
                arcadeConfigs.forEach((config, index) => {
                    listText += `${index + 1}. ${config.name}\n   *${config.description}*\n`;
                });
                listText += `\n**Note:** Only players in the top 100 on RetroAchievements' leaderboard `;
                listText += `who are registered with our bot will appear in these rankings.\n\n`;
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

            // Get required services from client
            const { raAPI, usernameUtils } = message.client;

            let leaderboardEntries = await fetchLeaderboardEntries(selectedConfig.leaderboardId, raAPI);
            console.log('Number of entries before user filtering:', leaderboardEntries.length);

            // Get registered users and convert to canonical form
            const users = await User.find({});
            const registeredUsers = new Map(); // Map of lowercase to canonical usernames
            for (const user of users) {
                const canonicalUsername = await usernameUtils.getCanonicalUsername(user.raUsername);
                if (canonicalUsername) {
                    registeredUsers.set(canonicalUsername.toLowerCase(), canonicalUsername);
                }
            }

            // Filter and update usernames to canonical form
            leaderboardEntries = await Promise.all(leaderboardEntries
                .map(async entry => {
                    const canonicalUsername = await usernameUtils.getCanonicalUsername(entry.User);
                    if (canonicalUsername && registeredUsers.has(canonicalUsername.toLowerCase())) {
                        return {
                            ...entry,
                            User: canonicalUsername
                        };
                    }
                    return null;
                }));

            leaderboardEntries = leaderboardEntries.filter(entry => entry !== null);

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
            await message.reply('Error fetching arcade leaderboard. The game or leaderboard might not be available.');
        }
    }
};
