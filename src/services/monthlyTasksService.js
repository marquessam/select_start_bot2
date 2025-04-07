import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';
import mongoose from 'mongoose';

class MonthlyTasksService {
    constructor() {
        this.client = null;
    }

    setClient(client) {
        this.client = client;
    }

    async clearAllNominations() {
        if (!this.client) {
            console.error('Discord client not set for monthly tasks service');
            return;
        }

        try {
            console.log('Clearing all nominations for the current month...');
            
            // Get all users
            const users = await User.find({});
            
            // Clear nominations for each user
            for (const user of users) {
                user.clearCurrentNominations();
                await user.save();
            }
            
            console.log(`Cleared nominations for ${users.length} users`);
            
            // Update nominations for web app
            await this.updateNominationsForWebapp();
            
            // Announce in the designated channel
            await this.announceNominationsClear();
            
        } catch (error) {
            console.error('Error clearing nominations:', error);
        }
    }

    async createVotingPoll() {
        if (!this.client) {
            console.error('Discord client not set for monthly tasks service');
            return;
        }

        try {
            console.log('Creating voting poll for next month\'s challenge...');
            
            // Get all users
            const users = await User.find({});

            // Get all current nominations
            let allNominations = [];
            for (const user of users) {
                const nominations = user.getCurrentNominations();
                allNominations.push(...nominations.map(nom => nom.gameId));
            }

            // Remove duplicates
            allNominations = [...new Set(allNominations)];

            if (allNominations.length === 0) {
                console.log('No games have been nominated for next month.');
                return;
            }

            // Randomly select 10 games (or less if there aren't enough nominations)
            const selectedCount = Math.min(10, allNominations.length);
            const selectedGames = [];
            while (selectedGames.length < selectedCount) {
                const randomIndex = Math.floor(Math.random() * allNominations.length);
                const gameId = allNominations[randomIndex];
                if (!selectedGames.includes(gameId)) {
                    selectedGames.push(gameId);
                }
            }

            // Get game info for all selected games
            const gameInfoPromises = selectedGames.map(gameId => retroAPI.getGameInfo(gameId));
            const games = await Promise.all(gameInfoPromises);

            // Create embed for the poll
            const embed = new EmbedBuilder()
                .setTitle('🎮 Vote for Next Month\'s Challenge!')
                .setDescription('React with the corresponding number to vote for a game. You can vote for up to two games!\n\n' +
                    games.map((game, index) => 
                        `${index + 1}️⃣ **${game.title}**\n` +
                        `└ Achievements: ${game.achievements.length}\n` +
                        `└ [View Game](https://retroachievements.org/game/${game.id})`
                    ).join('\n\n'))
                .setColor('#FF69B4')
                .setFooter({ text: 'Voting ends in 7 days' });

            // Get the voting channel
            const votingChannel = await this.getVotingChannel();
            if (!votingChannel) {
                console.error('Voting channel not found');
                return;
            }

            // Send the poll
            const pollMessage = await votingChannel.send({ embeds: [embed] });

            // Add number reactions
            const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            for (let i = 0; i < selectedGames.length; i++) {
                await pollMessage.react(numberEmojis[i]);
            }

            console.log('Voting poll created successfully');
            
        } catch (error) {
            console.error('Error creating voting poll:', error);
        }
    }

    async updateNominationsForWebapp() {
        try {
            console.log('Updating nominations for web app...');
            
            // Get all users
            const users = await User.find({});
            
            // Get current date in YYYY-MM format for the period key
            const currentPeriod = new Date().toISOString().slice(0, 7);
            
            // Get all current nominations
            let currentNominations = [];
            for (const user of users) {
                const userNominations = user.getCurrentNominations();
                
                // Only add if there are nominations
                if (userNominations.length > 0) {
                    for (const nom of userNominations) {
                        let game = "Unknown Game";
                        let platform = "Unknown Platform";
                        
                        // Get game info if not already in nomination
                        try {
                            if (nom.gameTitle && nom.consoleName) {
                                game = nom.gameTitle;
                                platform = nom.consoleName;
                            } else {
                                const gameInfo = await retroAPI.getGameInfo(nom.gameId);
                                game = gameInfo.title;
                                platform = gameInfo.consoleName;
                            }
                            
                            currentNominations.push({
                                game: game,
                                platform: platform,
                                discordUsername: user.raUsername,
                                discordId: user.discordId
                            });
                        } catch (error) {
                            console.error(`Error getting game info for nomination ${nom.gameId}:`, error);
                        }
                    }
                }
            }
            
            // Debug log
            console.log(`Found ${currentNominations.length} nominations for web app`);
            
            // Get MongoDB client
            const db = mongoose.connection.db;
            
            // Get existing nominations document
            const existingDoc = await db.collection('nominations').findOne({ _id: 'nominations' });
            
            let nominations = {};
            if (existingDoc && existingDoc.nominations) {
                nominations = existingDoc.nominations;
            }
            
            // Update current period nominations
            nominations[currentPeriod] = currentNominations;
            
            // Update or insert the nominations document
            await db.collection('nominations').updateOne(
                { _id: 'nominations' },
                { $set: { nominations, lastUpdated: new Date() } },
                { upsert: true }
            );
            
            // Also update the nominations status
            await db.collection('nominations').updateOne(
                { _id: 'status' },
                { $set: { isOpen: true, lastUpdated: new Date() } },
                { upsert: true }
            );
            
            console.log(`Updated ${currentNominations.length} nominations for web app`);
            
        } catch (error) {
            console.error('Error updating nominations for web app:', error);
        }
    }
    
    async syncWebAppData() {
        try {
            // Get current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            if (!currentChallenge) {
                console.log('No current challenge found for web sync');
                return;
            }

            // Get game info
            const gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);

            // Get all users with progress
            const users = await User.find({});
            const monthKey = User.formatDateKey(currentChallenge.date);
            const monthName = new Date(currentChallenge.date).toLocaleString('default', { month: 'long' });
            
            // Format leaderboard entries
            const leaderboardEntries = [];
            const monthlyStats = {};
            
            for (const user of users) {
                // Get monthly challenge progress
                const progress = user.monthlyChallenges.get(monthKey);
                if (!progress) continue;
                
                // Get game progress data
                try {
                    const gameProgress = await retroAPI.getUserGameProgress(
                        user.raUsername,
                        currentChallenge.monthly_challange_gameid
                    );
                    
                    if (gameProgress.numAwardedToUser > 0) {
                        // Calculate percentage
                        const percentage = (gameProgress.numAwardedToUser / currentChallenge.monthly_challange_game_total * 100).toFixed(2);
                        
                        leaderboardEntries.push({
                            username: user.raUsername,
                            completedAchievements: gameProgress.numAwardedToUser,
                            totalAchievements: currentChallenge.monthly_challange_game_total,
                            completionPercentage: parseFloat(percentage),
                            hasBeatenGame: progress.progress >= 2
                        });
                        
                        // Add to monthly stats for the web app format
                        if (!monthlyStats[user.raUsername.toLowerCase()]) {
                            monthlyStats[user.raUsername.toLowerCase()] = {
                                monthlyAchievements: {
                                    [now.getFullYear()]: {
                                        [`${now.getFullYear()}-${now.getMonth()}`]: gameProgress.numAwardedToUser
                                    }
                                },
                                completedGames: {}
                            };
                        }
                        
                        if (progress.progress >= 2) {
                            monthlyStats[user.raUsername.toLowerCase()].completedGames[`${now.getFullYear()}-${now.getMonth()}`] = true;
                        }
                    }
                } catch (error) {
                    console.error(`Error getting game progress for ${user.raUsername}:`, error);
                }
            }
            
            // Connect to the database directly to write to the web app collections
            const db = mongoose.connection.db;
            
            // Update challenges collection for the web app
            await db.collection('challenges').updateOne(
                { _id: 'current' },
                { 
                    $set: { 
                        gameName: gameInfo.title,
                        gameIcon: gameInfo.imageIcon || '',
                        totalAchievements: currentChallenge.monthly_challange_game_total,
                        endDate: nextMonthStart.toISOString()
                    } 
                },
                { upsert: true }
            );
            
            // Update userstats collection for the web app
            await db.collection('userstats').updateOne(
                { _id: 'stats' },
                { $set: { users: monthlyStats } },
                { upsert: true }
            );
            
            // Store valid users
            const validUsernames = users.map(u => u.raUsername);
            await db.collection('users').updateOne(
                { _id: 'validUsers' },
                { $set: { users: validUsernames } },
                { upsert: true }
            );
            
            console.log(`Synced web app data for ${leaderboardEntries.length} users`);
            
            // Also update the yearly leaderboard data
            await this.syncYearlyData();
        } catch (error) {
            console.error('Error syncing web app data:', error);
        }
    }
    
    async syncYearlyData() {
        try {
            // Get all users
            const users = await User.find({});
            const yearlyData = {};
            const currentYear = new Date().getFullYear().toString();
            
            // Calculate yearly points for each user
            for (const user of users) {
                let yearlyPoints = 0;
                
                // Sum points from monthly challenges
                for (const [dateStr, data] of user.monthlyChallenges.entries()) {
                    const date = new Date(dateStr);
                    if (date.getFullYear() === parseInt(currentYear)) {
                        // Add points based on progress level
                        if (data.progress === 3) {
                            yearlyPoints += 7; // Mastery (3+3+1)
                        } else if (data.progress === 2) {
                            yearlyPoints += 4; // Beaten (3+1)
                        } else if (data.progress === 1) {
                            yearlyPoints += 1; // Participation
                        }
                    }
                }
                
                // Add points from shadow challenges
                for (const [dateStr, data] of user.shadowChallenges.entries()) {
                    const date = new Date(dateStr);
                    if (date.getFullYear() === parseInt(currentYear)) {
                        // Add points based on progress level (shadow max is beaten)
                        if (data.progress === 2) {
                            yearlyPoints += 4; // Beaten
                        } else if (data.progress === 1) {
                            yearlyPoints += 1; // Participation
                        }
                    }
                }
                
                // Add community award points
                const communityPoints = user.getCommunityPointsForYear(parseInt(currentYear));
                yearlyPoints += communityPoints;
                
                // Only add users with points
                if (yearlyPoints > 0) {
                    yearlyData[user.raUsername.toLowerCase()] = {
                        yearlyPoints: {
                            [currentYear]: yearlyPoints
                        },
                        bonusPoints: user.communityAwards.map(award => ({
                            reason: award.title,
                            points: award.points,
                            date: award.awardedAt.toISOString()
                        })).filter(award => new Date(award.date).getFullYear() === parseInt(currentYear)),
                        achievements: 0 // This could be calculated if needed
                    };
                }
            }
            
            // Update the database
            const db = mongoose.connection.db;
            await db.collection('userstats').updateOne(
                { _id: 'yearlyStats' },
                { $set: { users: yearlyData } },
                { upsert: true }
            );
            
            console.log(`Synced yearly data for ${Object.keys(yearlyData).length} users`);
        } catch (error) {
            console.error('Error syncing yearly data:', error);
        }
    }

    async announceNominationsClear() {
        try {
            // Get the announcement channel
            const announcementChannel = await this.getAnnouncementChannel();
            if (!announcementChannel) {
                console.error('Announcement channel not found');
                return;
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🔄 Monthly Reset')
                .setDescription('All nominations for the previous month have been cleared. You can now nominate games for the next challenge!')
                .setColor('#4CAF50')
                .setTimestamp();

            // Send the announcement
            await announcementChannel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Error announcing nominations clear:', error);
        }
    }

    async getAnnouncementChannel() {
        if (!this.client) return null;

        try {
            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Get the channel
            const channel = await guild.channels.fetch(config.discord.announcementChannelId);
            return channel;
        } catch (error) {
            console.error('Error getting announcement channel:', error);
            return null;
        }
    }

    async getVotingChannel() {
        if (!this.client) return null;

        try {
            // Get the guild
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error('Guild not found');
                return null;
            }

            // Get the channel
            const channel = await guild.channels.fetch(config.discord.votingChannelId);
            return channel;
        } catch (error) {
            console.error('Error getting voting channel:', error);
            return null;
        }
    }
}

// Create singleton instance
const monthlyTasksService = new MonthlyTasksService();
export default monthlyTasksService;
