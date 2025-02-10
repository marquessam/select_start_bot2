// File: src/services/leaderboardService.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const Leaderboard = require('../models/Leaderboard');
const User = require('../models/User');
const { AwardType, AwardFunctions } = require('../enums/AwardType');

class LeaderboardService {
  constructor() {
    console.log('Leaderboard service initialized');
  }

  /**
   * Displays the monthly leaderboard.
   */
  async displayMonthlyLeaderboard() {
    try {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      // Look up the monthly game
      const monthlyGame = await Game.findOne({
        month: currentMonth,
        year: currentYear,
        type: 'MONTHLY'
      });

      if (!monthlyGame) {
        throw new Error('No monthly game found for current month.');
      }

      // Get all awards for the monthly game with achievements
      const awards = await Award.find({
        gameId: monthlyGame.gameId,
        month: currentMonth,
        year: currentYear,
        achievementCount: { $gt: 0 }
      });

      // Build a unique set of awards keyed by canonical username
      const uniqueAwards = {};
      for (const award of awards) {
        const user = await User.findOne({
          raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
        });
        if (user) {
          const canonicalUsername = user.raUsername;
          if (!uniqueAwards[canonicalUsername] || 
              award.achievementCount > uniqueAwards[canonicalUsername].achievementCount) {
            award.raUsername = canonicalUsername;
            uniqueAwards[canonicalUsername] = award;
          }
        }
      }

      // Sort by achievement count
      const sortedAwards = Object.values(uniqueAwards)
        .sort((a, b) => b.achievementCount - a.achievementCount);

      // Assign ranks, handling ties
      let currentRank = 1;
      let currentScore = -1;
      let increment = 0;

      sortedAwards.forEach(award => {
        if (award.achievementCount !== currentScore) {
          currentRank += increment;
          increment = 1;
          currentScore = award.achievementCount;
          award.rank = currentRank;
        } else {
          award.rank = currentRank;
          increment++;
        }
      });

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Monthly Challenge:')
        .setDescription(`**${monthlyGame.title}**`)
        .setThumbnail('https://media.retroachievements.org/Images/022504.png');

      const topTen = sortedAwards.slice(0, 10);
      const others = sortedAwards.slice(10);

      if (topTen.length > 0) {
        let topTenText = '';
        
        topTen.forEach(award => {
          const rank = this.padString(award.rank, 2);
          const username = award.raUsername.padEnd(13);
          const progress = `${award.achievementCount}/${award.totalAchievements}`;
          
          topTenText += `${rank} ${username} ${progress}\n`;
        });

        embed.addFields({ 
          name: 'Top Rankings', 
          value: '```\n' + topTenText + '```' 
        });

        if (others.length > 0) {
          const othersText = others
            .map(a => `${a.raUsername}: ${a.achievementCount}/${a.totalAchievements}`)
            .join('\n');
          embed.addFields({ 
            name: 'Also Participating', 
            value: '```\n' + othersText + '```' 
          });
        }
      }

      return embed;
    } catch (error) {
      console.error('Error generating monthly leaderboard:', error);
      throw error;
    }
  }

  /**
   * Displays the yearly leaderboard.
   */
  async displayYearlyLeaderboard() {
    try {
      const currentYear = new Date().getFullYear();
      const awards = await Award.find({ year: currentYear });

      const userPoints = {};

      for (const award of awards) {
        const user = await User.findOne({
          raUsername: { $regex: new RegExp(`^${award.raUsername}$`, 'i') }
        });
        if (user) {
          const canonicalUsername = user.raUsername;
          if (!userPoints[canonicalUsername]) {
            userPoints[canonicalUsername] = {
              username: canonicalUsername,
              totalPoints: 0,
              communityPoints: 0,
              challengePoints: 0,
              participations: 0,
              beaten: 0,
              mastered: 0,
              processedGames: new Set()
            };
          }

          // Handle manual (community) awards separately
          if (award.gameId === 'manual') {
            userPoints[canonicalUsername].communityPoints += (award.totalAchievements || 0);
            userPoints[canonicalUsername].totalPoints += (award.totalAchievements || 0);
            continue;
          }
          
          const gameKey = `${award.gameId}-${award.month}`;
          if (!userPoints[canonicalUsername].processedGames.has(gameKey)) {
            let points = 0;
            if (award.award >= AwardType.MASTERED) {
              points = 7;
              userPoints[canonicalUsername].mastered++;
            } else if (award.award >= AwardType.BEATEN) {
              points = 4;
              userPoints[canonicalUsername].beaten++;
            } else if (award.award >= AwardType.PARTICIPATION) {
              points = 1;
              userPoints[canonicalUsername].participations++;
            }

            userPoints[canonicalUsername].challengePoints += points;
            userPoints[canonicalUsername].totalPoints += points;
            userPoints[canonicalUsername].processedGames.add(gameKey);
          }
        }
      }

      const leaderboard = Object.values(userPoints)
        .filter(user => user.totalPoints > 0)
        .map(({ processedGames, ...user }) => user)
        .sort((a, b) => b.totalPoints - a.totalPoints);

      // Rank users, handling ties
      let currentRank = 1;
      let currentPoints = -1;
      let increment = 0;

      leaderboard.forEach(user => {
        if (user.totalPoints !== currentPoints) {
          currentRank += increment;
          increment = 1;
          currentPoints = user.totalPoints;
          user.rank = currentRank;
        } else {
          user.rank = currentRank;
          increment++;
        }
      });

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('2025 Yearly Rankings');

      if (leaderboard.length > 0) {
        let text = '';
        leaderboard.forEach(user => {
          const rank = this.padString(user.rank, 2);
          const name = user.username.padEnd(13);
          const total = this.padString(user.totalPoints, 4);
          const challenge = this.padString(user.challengePoints, 4);
          const community = this.padString(user.communityPoints, 4);
          
          text += `${rank} ${name} ${total} (${challenge}+${community})\n`;
        });

        embed.addFields(
          { 
            name: 'Rankings', 
            value: '```\n' + text + '```' 
          },
          {
            name: 'Legend',
            value: 'Rank Username    Total (Challenge+Community)'
          }
        );
      } else {
        embed.addFields({ 
          name: 'Rankings', 
          value: 'No points earned yet!' 
        });
      }

      return embed;
    } catch (error) {
      console.error('Error generating yearly leaderboard:', error);
      throw error;
    }
  }

  /**
   * Updates both monthly and yearly leaderboard caches
   */
  async updateAllLeaderboards() {
    try {
      const [monthlyData, yearlyData] = await Promise.all([
        this.displayMonthlyLeaderboard(),
        this.displayYearlyLeaderboard()
      ]);

      await Promise.all([
        Leaderboard.findOneAndUpdate(
          { type: 'monthly' },
          { 
            data: monthlyData,
            lastUpdate: new Date()
          },
          { upsert: true }
        ),
        Leaderboard.findOneAndUpdate(
          { type: 'yearly' },
          { 
            data: yearlyData,
            lastUpdate: new Date()
          },
          { upsert: true }
        )
      ]);

      console.log('Leaderboard caches updated at', new Date());
    } catch (error) {
      console.error('Error updating leaderboard caches:', error);
      throw error;
    }
  }

  padString(str, length) {
    return str.toString().slice(0, length).padEnd(length);
  }

  /**
   * Gets the cached monthly leaderboard
   */
  async getMonthlyLeaderboardCache() {
    const cached = await Leaderboard.findOne({ type: 'monthly' });
    return cached?.data || null;
  }

  /**
   * Gets the cached yearly leaderboard
   */
  async getYearlyLeaderboardCache() {
    const cached = await Leaderboard.findOne({ type: 'yearly' });
    return cached?.data || null;
  }
}

module.exports = LeaderboardService;
