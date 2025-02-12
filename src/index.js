// File: src/index.js
const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    Events,
    EmbedBuilder 
} = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Models
const User = require('./models/User');
const Game = require('./models/Game');
const Award = require('./models/Award');

// Load environment variables
require('dotenv').config();

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Initialize collections
client.commands = new Collection();

// RetroAchievements API helper
async function raAPI(endpoint, params = {}) {
    const fullParams = {
        ...params,
        z: process.env.RA_USERNAME,
        y: process.env.RA_API_KEY,
    };

    try {
        const response = await axios.get(`https://retroachievements.org/API/${endpoint}`, { params: fullParams });
        return response.data;
    } catch (error) {
        console.error('API Error:', error.message);
        return null;
    }
}

// Achievement checking function
async function checkAchievements() {
    try {
        const users = await User.find({ isActive: true });
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        const challengeGames = await Game.find({
            month: currentMonth,
            year: currentYear
        });

        for (const user of users) {
            try {
                const achievements = await raAPI('API_GetUserRecentAchievements.php', {
                    u: user.raUsername,
                    c: 50
                });

                if (!Array.isArray(achievements)) continue;

                for (const achievement of achievements) {
                    // Skip if achievement is older than 10 minutes
                    const achievementDate = new Date(achievement.Date);
                    if (Date.now() - achievementDate.getTime() > 10 * 60 * 1000) continue;

                    // Is it a challenge game?
                    const game = challengeGames.find(g => g.gameId === achievement.GameID.toString());
                    
                    // Create announcement embed
                    const embed = new EmbedBuilder()
                        .setColor(game ? '#0099ff' : '#00ff00')
                        .setTitle(achievement.GameTitle)
                        .setDescription(
                            `**${user.raUsername}** earned **${achievement.Title}**\n\n` +
                            `*${achievement.Description || 'No description available'}*`
                        );

                    // Add game type if it's a challenge game
                    if (game) {
                        embed.setAuthor({
                            name: game.type === 'MONTHLY' ? 'MONTHLY CHALLENGE ☀️' : 'SHADOW GAME 🌑',
                            iconURL: 'attachment://game_logo.png'
                        });
                    }

                    if (achievement.BadgeName) {
                        embed.setThumbnail(`https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`);
                    }

                    // Send announcement
                    const channel = await client.channels.fetch(process.env.ACHIEVEMENT_FEED_CHANNEL);
                    await channel.send({ embeds: [embed] });

                    // Update awards if it's a challenge game
                    if (game) {
                        await updateAwards(user.raUsername, game);
                    }

                    // Rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Error checking achievements for ${user.raUsername}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in achievement check:', error);
    }
}

// Update awards for a user
async function updateAwards(username, game) {
    try {
        const progress = await raAPI('API_GetGameInfoAndUserProgress.php', {
            u: username,
            g: game.gameId
        });

        if (!progress) return;

        let award = await Award.findOne({
            raUsername: username.toLowerCase(),
            gameId: game.gameId,
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear()
        });

        if (!award) {
            award = new Award({
                raUsername: username.toLowerCase(),
                gameId: game.gameId,
                month: new Date().getMonth() + 1,
                year: new Date().getFullYear(),
                achievementCount: 0,
                totalAchievements: progress.NumAchievements
            });
        }

        award.achievementCount = progress.NumAwardedToUser || 0;
        award.userCompletion = progress.UserCompletion || "0.00%";
        await award.save();
    } catch (error) {
        console.error(`Error updating awards for ${username}:`, error);
    }
}

// Load commands
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if (command.name && typeof command.execute === 'function') {
                client.commands.set(command.name.toLowerCase(), command);
                console.log(`Loaded command: ${command.name}`);
            }
        } catch (error) {
            console.error(`Error loading command ${file}:`, error);
        }
    }
}

// Event Handlers
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    // Start achievement checking
    setInterval(checkAchievements, 5 * 60 * 1000); // Every 5 minutes
    checkAchievements(); // Initial check
});

// Message handler
client.on(Events.MessageCreate, async message => {
    try {
        if (message.author.bot) return;

        // Process RetroAchievements profile links in registration channel
        if (message.channel.id === process.env.REGISTRATION_CHANNEL_ID) {
            const match = message.content.match(/retroachievements\.org\/user\/([^\/\s]+)/i);
            if (match) {
                const username = match[1];
                
                // Check if user exists in RA
                const raUser = await raAPI('API_GetUserProfile.php', { u: username });
                if (!raUser) {
                    await message.reply('User not found on RetroAchievements.');
                    return;
                }

                // Add or update user
                await User.findOneAndUpdate(
                    { raUsername: { $regex: new RegExp(`^${username}$`, 'i') } },
                    { 
                        raUsername: username,
                        isActive: true 
                    },
                    { upsert: true }
                );

                await message.react('✅');
                return;
            }
        }

        // Handle commands
        if (message.content.startsWith('!')) {
            const args = message.content.slice(1).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            
            const command = client.commands.get(commandName);
            if (!command) return;

            try {
                // Attach helper functions to client for commands to use
                client.raAPI = raAPI;
                
                await command.execute(message, args);
            } catch (error) {
                console.error('Error executing command:', error);
                await message.reply('There was an error executing that command.');
            }
        }
    } catch (error) {
        console.error('Error in message handler:', error);
    }
});

// Error handlers
client.on('error', console.error);
process.on('unhandledRejection', console.error);

// Start the bot
async function main() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Load commands
        await loadCommands();
        console.log('Commands loaded');

        // Login to Discord
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('Startup error:', error);
        process.exit(1);
    }
}

main();
