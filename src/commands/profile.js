// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const Game = require('../models/Game');
const Award = require('../models/Award');

module.exports = {
    name: 'profile',
    description: 'Shows user profile with detailed statistics and awards',
    async execute(message, args) {
        try {
            const requestedUsername = args[0] || message.author.username;
            const loadingMsg = await message.channel.send('Fetching profile data...');

            // Find user in database (case-insensitive)
            const user = await User.findOne({
                raUsername: { $regex: new RegExp(`^${requestedUsername}$`, 'i') }
            });

            if (!user) {
                await loadingMsg.delete();
                return message.reply('User not found. They need to register first!');
            }

            // Get RA profile data
            const raProfile = await message.client.raAPI('API_GetUserProfile.php', {
                u: user.raUsername
            });

            if (!raProfile) {
                await loadingMsg.delete();
                return message.reply('Error fetching RetroAchievements profile.');
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`User Profile: ${user.raUsername}`)
                .setThumbnail(`https://retroachievements.org/UserPic/${user.raUsername}.png`)
                .setURL(`https://retroachievements.org/user/${user.raUsername}`);

            // Get current challenges
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const currentGames = await Game.find({
                month: currentMonth,
                year: currentYear
            });

            // Get progress for current games
            if (currentGames.length > 0) {
                let progressText = '';
                
                for (const game of currentGames) {
                    // Get game progress from RA
                    const progress = await message.client.raAPI('API_GetGameInfoAndUserProgress.php', {
                        u: user.raUsername,
                        g: game.gameId
                    });

                    if (progress) {
                        const type = game.type === 'MONTHLY' ? '☀️' : '🌑';
                        progressText += `${type} **${game.title}**\n`;
                        progressText += `Progress: ${progress.NumAwardedToUser}/${progress.NumAchievements} (${progress.UserCompletion})\n`;

                        // Get award status
                        const award = await Award.findOne({
                            raUsername: user.raUsername.toLowerCase(),
                            gameId: game.gameId,
                            month: currentMonth,
                            year: currentYear
                        });

                        if (award) {
                            const emojis = [];
                            if (award.mastered) emojis.push('✨');
                            else if (award.beaten) emojis.push('⭐');
                            else if (award.achievementCount > 0) emojis.push('🏁');
                            
                            if (emojis.length > 0) {
                                progressText += `Current Awards: ${emojis.join(' ')}\n`;
                            }
                        }
                        
                        progressText += '\n';
                    }
                }

                if (progressText) {
                    embed.addFields({ name: '🎮 Current Challenges', value: progressText });
                }
            }

            // Get yearly awards
            const yearlyAwards = await Award.find({
                raUsername: user.raUsername.toLowerCase(),
                year: currentYear,
                isManual: false
            });

            // Group awards by type
            const gameAwards = {
                mastered: [],
                beaten: [],
                participation: []
            };

            const processedGames = new Set();
            let challengePoints = 0;

            for (const award of yearlyAwards) {
                const gameKey = `${award.gameId}-${award.month}`;
                if (processedGames.has(gameKey)) continue;
                processedGames.add(gameKey);

                const game = await Game.findOne({ gameId: award.gameId });
                if (!game) continue;

                const points = award.getPoints();
                challengePoints += points;

                if (award.mastered) {
                    gameAwards.mastered.push(`${game.title} (${points} pts)`);
                } else if (award.beaten) {
                    gameAwards.beaten.push(`${game.title} (${points} pts)`);
                } else if (award.achievementCount > 0) {
                    gameAwards.participation.push(`${game.title} (${points} pt)`);
                }
            }

            // Add game awards to embed
            let awardsText = '';
            if (gameAwards.mastered.length > 0) {
                awardsText += '**Mastered Games** ✨\n';
                gameAwards.mastered.forEach(game => awardsText += `• ${game}\n`);
                awardsText += '\n';
            }
            if (gameAwards.beaten.length > 0) {
                awardsText += '**Beaten Games** ⭐\n';
                gameAwards.beaten.forEach(game => awardsText += `• ${game}\n`);
                awardsText += '\n';
            }
            if (gameAwards.participation.length > 0) {
                awardsText += '**Participation** 🏁\n';
                gameAwards.participation.forEach(game => awardsText += `• ${game}\n`);
            }

            if (awardsText) {
                embed.addFields({ name: '🏆 Game Awards', value: awardsText });
            }

            // Get manual awards
            const manualAwards = await Award.find({
                raUsername: user.raUsername.toLowerCase(),
                year: currentYear,
                isManual: true
            });

            let manualPoints = 0;
            if (manualAwards.length > 0) {
                let manualText = '';
                manualAwards.forEach(award => {
                    manualPoints += award.manualPoints;
                    manualText += `• ${award.reason}: ${award.manualPoints} points\n`;
                });

                embed.addFields({ name: '🎖️ Community Awards', value: manualText });
            }

            // Add points summary
            embed.addFields({
                name: '📊 Points Summary',
                value: 
                    `Total: ${challengePoints + manualPoints}\n` +
                    `• Challenge: ${challengePoints}\n` +
                    `• Community: ${manualPoints}`
            });

            await loadingMsg.delete();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing profile:', error);
            await message.reply('Error getting profile data. Please try again.');
        }
    }
};
