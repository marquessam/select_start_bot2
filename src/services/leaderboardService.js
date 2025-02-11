// File: src/services/leaderboardService.js
const { EmbedBuilder } = require('discord.js');
const Game = require('../models/Game');
const Award = require('../models/Award');
const User = require('../models/User');
const Leaderboard = require('../models/Leaderboard');
const { AwardType } = require('../enums/AwardType');

class LeaderboardService {
    constructor(usernameUtils) {
        if (!usernameUtils) {
            throw new Error('UsernameUtils is required');
        }
        this.usernameUtils = usernameUtils;
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
            const uniqueAwards = new Map();
            for (const award of awards) {
                const canonicalUsername = await this.usernameUtils.getCanonicalUsername(award.raUsername);
                if (canonicalUsername) {
                    const existingAward = uniqueAwards.get(canonicalUsername);
                    if (!existingAward || award.achievementCount > existingAward.achievementCount) {
                        award.canonicalUsername = canonicalUsername;
                        uniqueAwards.set(canonicalUsername, award);
                    }
                }
            }

            // Sort by achievement count
            const sortedAwards = Array.from(uniqueAwards.values())
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
                    const username = award.canonicalUsername.padEnd(13);
                    const progress = `${award.achievementCount}/${award.totalAchievements}`;
                    
                    topTenText += `${rank} ${username} ${progress}\n`;
                });

                embed.addFields({ 
                    name: 'Top Rankings', 
                    value: '```\n' + topTenText + '```' 
                });

                if (others.length > 0) {
                    const othersText = others
                        .map(a => `${a.canonicalUsername}: ${a.achievementCount}/${a.totalAchievements}`)
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
            const users = await User.find({ isActive: true });
            const userPoints = new Map();

            // Process all awards for each user
            for (const user of users) {
                const canonicalUsername = await this.usernameUtils.getCanonicalUsername(user.raUsername);
                if (!canonicalUsername) continue;

                const awards = await Award.find({
                    raUsername: user.raUsername.toLowerCase(),
                    year: currentYear
                });

                const stats = {
                    username: canonicalUsername,
                    totalPoints: 0,
                    communityPoints: 0,
                    challengePoints: 0,
                    mastered: 0,
                    beaten: 0,
                    participation: 0,
                    processedGames: new Set()
                };

                for (const award of awards) {
                    if (award.gameId === 'manual') {
                        stats.communityPoints += award.totalAchievements;
                        stats.totalPoints += award.totalAchievements;
                        continue;
                    }

                    const gameKey = `${award.gameId}-${award.month}`;
                    if (!stats.processedGames.has(gameKey)) {
                        stats.processedGames.add(gameKey);

                        if (award.award >= AwardType.MASTERED) {
                            stats.mastered++;
                            stats.challengePoints += 7;
                        } else if (award.award >= AwardType.BEATEN) {
                            stats.beaten++;
                            stats.challengePoints += 4;
                        } else if (award.award >= AwardType.PARTICIPATION) {
                            stats.participation++;
                            stats.challengePoints += 1;
                        }
                    }
                }

                stats.totalPoints = stats.challengePoints + stats.communityPoints;
                if (stats.totalPoints > 0) {
                    userPoints.set(canonicalUsername, stats);
                }
            }

            // Sort users by total points
            const sortedUsers = Array.from(userPoints.values())
                .sort((a, b) => b.totalPoints - a.totalPoints);

            // Assign ranks, handling ties
            let currentRank = 1;
            let currentPoints = -1;
            let increment = 0;

            sortedUsers.forEach(user => {
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

            if (sortedUsers.length > 0) {
                let text = '';
                sortedUsers.forEach(user => {
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
