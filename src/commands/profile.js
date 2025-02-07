// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models// File: src/commands/profile.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

async function fetchUserProfile(username) {
    // Find the user using a case-insensitive search
    const user = await User.findOne({
        raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
    });

    if (!user) {
        throw new Error(`User ${username} not found.`);
    }

    return user;
}

async function getCurrentProgress(username) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Get current games
    const currentGames = await Game.find({
        month: currentMonth,
        year: currentYear
    });

    // Get awards for current games
    const currentProgress = [];
    for (const game of currentGames) {
        const award = await Award.findOne({
            raUsername: username,
            gameId: game.gameId,
            month: currentMonth,
            year: currentYear
        });

        if (award) {
            currentProgress.push({
                title: game.title,
                type: game.type,
                progress: `${award.achievementCount}/${award.totalAchievements}`,
                completion: award.userCompletion,
                award: award.award
            });
        }
    }

    return currentProgress;
}

async function getYearlyStats(username) {
    const currentYear = new Date().getFullYear();
    const awards = await Award.find({
        raUsername: username,
        year: currentYear
    });

    const stats = {
        totalPoints: 0,
        totalAchievements: 0,
        gamesParticipated: 0,
        gamesBeaten: 0,
        gamesMastered: 0,
        monthlyGames: 0,
        shadowGames: 0,
        participationGames: [],
        beatenGames: [],
        masteredGames: []
    };

    // Process each award
    const processedGames = new Set();
    for (const award of awards) {
        const game = await Game.findOne({
            gameId: award.gameId,
            year: currentYear
        });

        if (!game) continue;

        const gameKey = `${game.gameId}-${game.month}`;
        if (processedGames.has(gameKey)) continue;
        processedGames.add(gameKey);

        // Add points and track achievements
        stats.totalPoints += AwardFunctions.getPoints(award.award);
        stats.totalAchievements += award.achievementCount;

        // Track game types
        if (game.type === 'MONTHLY') {
            stats.monthlyGames++;
        } else {
            stats.shadowGames++;
        }

        // Track award levels
        if (award.award >= AwardType.MASTERED) {
            stats.gamesMastered++;
            stats.masteredGames.push(game.title);
            stats.gamesBeaten++;
            stats.beatenGames.push(game.title);
            stats.gamesParticipated++;
            stats.participationGames.push(game.title);
        } else if (award.award >= AwardType.BEATEN) {
            stats.gamesBeaten++;
            stats.beatenGames.push(game.title);
            stats.gamesParticipated++;
            stats.participationGames.push(game.title);
        } else if (award.award >= AwardType.PARTICIPATION) {
            stats.gamesParticipated++;
            stats.participationGames.push(game.title);
        }
    }

    return stats;
}

function formatGameList(games) {
    return games.length ? games.map(g => `• ${g}`).join('\n') : 'None';
}

module.exports = {
    name: 'profile',
    description: 'Shows user profile information',
    async execute(message, args) {
        try {
            const requestedUsername = args[0] || message.author.username;
            const loadingMsg = await message.channel.send('Fetching profile data...');

            // Get user info
            const user = await fetchUserProfile(requestedUsername);
            const raUsername = user.raUsername;

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`User Profile: ${raUsername}`)
                .setThumbnail(`https://media.retroachievements.org/UserPic/${raUsername}.png`);

            // Get and display current progress
            const currentProgress = await getCurrentProgress(raUsername);
            if (currentProgress.length > 0) {
                let progressText = '';
                for (const progress of currentProgress) {
                    const emoji = progress.type === 'SHADOW' ? '🌘' : '🏆';
                    progressText += `${emoji} **${progress.title}**\n`;
                    progressText += `Progress: ${progress.progress} (${progress.completion})\n`;
                    if (progress.award) {
                        progressText += `Award: ${AwardFunctions.getEmoji(progress.award)} ${AwardFunctions.getName(progress.award)}\n`;
                    }
                    progressText += '\n';
                }
                embed.addFields({ name: 'Current Challenges', value: progressText });
            }

            // Get and display yearly stats
            const yearlyStats = await getYearlyStats(raUsername);
            
            // Add overall statistics
            const statsText = 
                `**Total Points:** ${yearlyStats.totalPoints}\n` +
                `**Achievements Earned:** ${yearlyStats.totalAchievements}\n` +
                `**Monthly Games:** ${yearlyStats.monthlyGames}\n` +
                `**Shadow Games:** ${yearlyStats.shadowGames}\n` +
                `**Games Participated:** ${yearlyStats.gamesParticipated}\n` +
                `**Games Beaten:** ${yearlyStats.gamesBeaten}\n` +
                `**Games Mastered:** ${yearlyStats.gamesMastered}`;

            embed.addFields({ name: '2025 Statistics', value: statsText });

            // Add game lists
            if (yearlyStats.participationGames.length > 0) {
                embed.addFields({
                    name: '🏁 Games Participated (1pt)',
                    value: formatGameList(yearlyStats.participationGames)
                });
            }

            if (yearlyStats.beatenGames.length > 0) {
                embed.addFields({
                    name: '⭐ Games Beaten (+3pts)',
                    value: formatGameList(yearlyStats.beatenGames)
                });
            }

            if (yearlyStats.masteredGames.length > 0) {
                embed.addFields({
                    name: '✨ Games Mastered (+3pts)',
                    value: formatGameList(yearlyStats.masteredGames)
                });
            }

            // Send the profile
            await loadingMsg.delete();
            await message.channel.send({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing profile:', error);
            await message.reply('Error getting profile data.');
        }
    }
};/User');
const RetroAchievementsAPI = require('../services/retroAchievements');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

module.exports = {
  name: 'profile',
  description: 'Shows user profile information',
  async execute(message, args) {
    try {
      // Get username (defaults to "Royek" if none provided)
      const requestedUsername = args[0] || "Royek";

      // Find the user in the database (case-insensitive)
      const user = await User.findOne({
        raUsername: { $regex: new RegExp(`^${requestedUsername}$`, 'i') }
      });

      if (!user) {
        return message.reply(`User **${requestedUsername}** not found.`);
      }

      const raUsername = user.raUsername;
      const raProfileImageUrl = `https://media.retroachievements.org/UserPic/${raUsername}.png`;

      // Create the base embed.
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Profile: ${raUsername}`)
        .setThumbnail(raProfileImageUrl);

      // Get the current month and year.
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      // Get current games for this month.
      const currentGames = await Game.find({
        month: currentMonth,
        year: currentYear
      });

      const raAPI = new RetroAchievementsAPI(process.env.RA_USERNAME, process.env.RA_API_KEY);

      // For each current game, retrieve progress and award.
      for (const game of currentGames) {
        const award = await Award.findOne({
          raUsername,
          gameId: game.gameId,
          month: currentMonth,
          year: currentYear
        });

        // Retrieve live progress from the API.
        const progress = await raAPI.getUserGameProgress(raUsername, game.gameId);
        const gameProgress = {
          title: game.title,
          type: game.type,
          earned: progress.earnedAchievements || 0,
          total: progress.totalAchievements || 0,
          completion: progress.userCompletion || "0.00%",
          award: award ? award.award : AwardType.NONE
        };

        // Determine the challenge emoji: 
        // Use a sunny emoji for main (monthly) challenges, and an 8-pointed black star for shadow challenges.
        const challengeEmoji = (game.type === 'SHADOW') ? '✴️' : '🌞';

        // Custom award emoji mapping:
        // Participation → star, Beaten → sparkles, Mastered → fire.
        let customAwardEmoji = "";
        if (gameProgress.award === AwardType.PARTICIPATION) {
          customAwardEmoji = "⭐";
        } else if (gameProgress.award === AwardType.BEATEN) {
          customAwardEmoji = "✨";
        } else if (gameProgress.award === AwardType.MASTERED) {
          customAwardEmoji = "🔥";
        } else {
          customAwardEmoji = "";
        }

        embed.addFields({
          name: `${challengeEmoji} ${gameProgress.title}`,
          value:
            `**Progress:** ${gameProgress.earned}/${gameProgress.total} (${gameProgress.completion})\n` +
            `**Award:** ${customAwardEmoji}\n` +
            `**Points:** ${AwardFunctions.getPoints(gameProgress.award)}`
        });
      }

      // Get yearly awards for the user.
      const yearlyAwards = await Award.find({
        raUsername,
        year: currentYear
      });

      // Calculate yearly statistics.
      const yearStats = {
        totalPoints: 0,
        participationCount: 0,
        beatenCount: 0,
        masteredCount: 0,
        monthlyGames: 0,
        shadowGames: 0
      };

      // Lists for each award type.
      const participationGames = [];
      const beatenGames = [];
      const masteredGames = [];

      // Process each award.
      for (const award of yearlyAwards) {
        const game = await Game.findOne({
          gameId: award.gameId,
          year: currentYear
        });
        if (!game) continue;

        yearStats.totalPoints += AwardFunctions.getPoints(award.award);
        if (game.type === 'MONTHLY') {
          yearStats.monthlyGames++;
        } else {
          yearStats.shadowGames++;
        }

        // Add to appropriate lists based on award level.
        switch (award.award) {
          case AwardType.MASTERED:
            yearStats.masteredCount++;
            masteredGames.push(game.title);
            // Fall through intended.
          case AwardType.BEATEN:
            yearStats.beatenCount++;
            beatenGames.push(game.title);
            // Fall through intended.
          case AwardType.PARTICIPATION:
            yearStats.participationCount++;
            participationGames.push(game.title);
            break;
        }
      }

      // Add yearly statistics.
      embed.addFields({
        name: '📊 2025 Statistics',
        value:
          `**Monthly Games:** ${yearStats.monthlyGames}\n` +
          `**Shadow Games:** ${yearStats.shadowGames}\n` +
          `**Games Participated:** ${yearStats.participationCount}\n` +
          `**Games Beaten:** ${yearStats.beatenCount}\n` +
          `**Games Mastered:** ${yearStats.masteredCount}`
      });

      // Helper function for formatting game lists.
      const formatGameList = games => games.length ? games.map(g => `• ${g}`).join('\n') : 'None';

      // Add game lists.
      if (participationGames.length > 0) {
        embed.addFields({
          name: '🏁 Games Participated (1pt)',
          value: formatGameList(participationGames)
        });
      }
      if (beatenGames.length > 0) {
        embed.addFields({
          name: '⭐ Games Beaten (+3pts)',
          value: formatGameList(beatenGames)
        });
      }
      if (masteredGames.length > 0) {
        embed.addFields({
          name: '✨ Games Mastered (+3pts)',
          value: formatGameList(masteredGames)
        });
      }

      // Add total points at the very bottom.
      embed.addFields({
        name: '💎 Total Points',
        value: `**${yearStats.totalPoints} points earned in 2025**`
      });

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error showing profile:', error);
      await message.reply('Error getting profile data.');
    }
  }
};
