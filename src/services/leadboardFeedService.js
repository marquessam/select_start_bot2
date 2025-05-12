// src/services/leaderboardFeedService.js
import { EmbedBuilder } from 'discord.js';
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';
import leaderboardCommand from '../commands/user/leaderboard.js';

const UPDATE_INTERVAL = 15 * 60 * 1000; // 15 minutes in milliseconds

class LeaderboardFeedService {
    constructor() {
        this.client = null;
        this.lastMessageId = null;
        this.channelId = config.discord.leaderboardFeedChannelId || '1371350718505811989'; // Use provided channel ID as fallback
        this.updateInterval = null;
    }

    setClient(client) {
        this.client = client;
        console.log('Discord client set for leaderboard feed service');
    }

    async start() {
        if (!this.client) {
            console.error('Discord client not set for leaderboard feed service');
            return;
        }

        try {
            console.log('Starting leaderboard feed service...');
            
            // Initial update
            await this.updateLeaderboard();
            
            // Set up recurring updates
            this.updateInterval = setInterval(() => {
                this.updateLeaderboard().catch(error => {
                    console.error('Error updating leaderboard feed:', error);
                });
            }, UPDATE_INTERVAL);
            
            console.log(`Leaderboard feed service started. Updates will occur every ${UPDATE_INTERVAL / 60000} minutes.`);
        } catch (error) {
            console.error('Error starting leaderboard feed service:', error);
        }
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('Leaderboard feed service stopped.');
        }
    }

    async updateLeaderboard() {
        try {
            const channel = await this.getLeaderboardChannel();
            if (!channel) {
                console.error('Leaderboard feed channel not found or inaccessible');
                return;
            }
            
            // Generate leaderboard embed
            const embeds = await this.generateLeaderboardEmbeds();
            if (!embeds || embeds.length === 0) {
                console.error('Failed to generate leaderboard embeds');
                return;
            }

            // Format current time for the message
            const timestamp = new Date().toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            
            const content = `**Current Challenge Leaderboard** (Last updated: ${timestamp})`;

            if (this.lastMessageId) {
                try {
                    // Try to edit the existing message
                    const message = await channel.messages.fetch(this.lastMessageId);
                    await message.edit({ content, embeds: [embeds[0]] });
                    console.log(`Leaderboard message updated (ID: ${this.lastMessageId})`);
                } catch (editError) {
                    console.log(`Could not edit leaderboard message: ${editError.message}`);
                    console.log('Posting new leaderboard message...');
                    // If editing fails, post a new message
                    this.lastMessageId = null;
                }
            }
            
            if (!this.lastMessageId) {
                // Post a new message
                const message = await channel.send({ content, embeds: [embeds[0]] });
                this.lastMessageId = message.id;
                console.log(`New leaderboard message posted (ID: ${message.id})`);
            }
        } catch (error) {
            console.error('Error updating leaderboard:', error);
        }
    }

    async getLeaderboardChannel() {
        if (!this.client) {
            console.error('Discord client not set');
            return null;
        }

        try {
            // Get the guild
            const guildId = config.discord.guildId;
            const guild = await this.client.guilds.fetch(guildId);
            
            if (!guild) {
                console.error(`Guild not found: ${guildId}`);
                return null;
            }

            // Get the channel
            const channel = await guild.channels.fetch(this.channelId);
            
            if (!channel) {
                console.error(`Channel not found: ${this.channelId}`);
                return null;
            }
            
            return channel;
        } catch (error) {
            console.error('Error getting leaderboard channel:', error);
            return null;
        }
    }

    async generateLeaderboardEmbeds() {
        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            if (!currentChallenge) {
                console.log('No active challenge found for the current month.');
                return null;
            }

            // Get game info - use stored metadata if available
            let gameTitle = currentChallenge.monthly_game_title;
            let gameImageUrl = currentChallenge.monthly_game_icon_url;
            let gameInfo;

            if (!gameTitle || !gameImageUrl) {
                try {
                    gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);
                    gameTitle = gameInfo.title;
                    gameImageUrl = gameInfo.imageIcon;
                    
                    // Update challenge with metadata for future use
                    if (gameInfo) {
                        currentChallenge.monthly_game_title = gameTitle;
                        currentChallenge.monthly_game_icon_url = gameImageUrl;
                        currentChallenge.monthly_game_console = gameInfo.consoleName;
                        await currentChallenge.save();
                    }
                } catch (error) {
                    console.error('Error fetching game info:', error);
                }
            } else {
                // Create gameInfo object from stored data for consistency
                gameInfo = {
                    title: gameTitle,
                    imageIcon: gameImageUrl
                };
            }

            // Get all registered users
            const users = await User.find({});

            // Get progress for all users (reusing code from leaderboard.js)
            const userProgress = await Promise.all(users.map(async (user) => {
                const progress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    currentChallenge.monthly_challange_gameid
                );

                // Only include users who have at least started the game
                if (progress.numAwardedToUser > 0) {
                    // EXACTLY MATCHING PROFILE.JS LOGIC FOR CALCULATING ACHIEVEMENTS
                    // Get achievements earned during this month (including grace period)
                    const achievementsEarnedThisMonth = Object.entries(progress.achievements)
                        .filter(([id, data]) => data.hasOwnProperty('dateEarned') && leaderboardCommand.isDateInCurrentMonth(data.dateEarned))
                        .map(([id, data]) => id);
                    
                    // If no achievements were earned this month, skip this user
                    if (achievementsEarnedThisMonth.length === 0) {
                        return null;
                    }

                    // Check if user has all achievements in the game
                    const hasAllAchievements = achievementsEarnedThisMonth.length === currentChallenge.monthly_challange_game_total;

                    let award = '';
                    let points = 0;

                    // To get mastery points this month, user must have earned at least one achievement this month
                    // AND have the game 100% completed now
                    if (achievementsEarnedThisMonth.length > 0 && hasAllAchievements) {
                        award = leaderboardCommand.AWARD_EMOJIS.MASTERY;
                        points = 7;
                    } 
                    // For beaten status, check progression and win achievements
                    else {
                        // Check for progression achievements earned this month
                        const progressionAchievements = currentChallenge.monthly_challange_progression_achievements || [];
                        const earnedProgressionInMonth = progressionAchievements.filter(id => 
                            achievementsEarnedThisMonth.includes(id)
                        );
                        
                        // Check for win achievements earned this month
                        const winAchievements = currentChallenge.monthly_challange_win_achievements || [];
                        const earnedWinInMonth = winAchievements.filter(id => 
                            achievementsEarnedThisMonth.includes(id)
                        );
                        
                        // Count total valid progression achievements
                        const totalValidProgressionAchievements = progressionAchievements.filter(id => 
                            achievementsEarnedThisMonth.includes(id)
                        );
                        
                        // Count total valid win achievements
                        const totalValidWinAchievements = winAchievements.filter(id => 
                            achievementsEarnedThisMonth.includes(id)
                        );

                        // For beaten status, the user must have all progression achievements AND at least one win achievement (if any required)
                        // AND at least one of those achievements must have been earned this month
                        if (totalValidProgressionAchievements.length === progressionAchievements.length && 
                            (winAchievements.length === 0 || totalValidWinAchievements.length > 0) &&
                            (earnedProgressionInMonth.length > 0 || earnedWinInMonth.length > 0)) {
                            award = leaderboardCommand.AWARD_EMOJIS.BEATEN;
                            points = 4;
                        }
                        // For participation, at least one achievement must be earned this month
                        else if (achievementsEarnedThisMonth.length > 0) {
                            award = leaderboardCommand.AWARD_EMOJIS.PARTICIPATION;
                            points = 1;
                        }
                    }

                    return {
                        user,
                        username: user.raUsername,
                        achieved: achievementsEarnedThisMonth.length,
                        percentage: (achievementsEarnedThisMonth.length / currentChallenge.monthly_challange_game_total * 100).toFixed(2),
                        award,
                        points,
                        earnedThisMonth: achievementsEarnedThisMonth.length
                    };
                }
                return null;
            }));

            // Filter out null entries and sort by achievements first, then by points as tiebreaker
            const sortedProgress = userProgress
                .filter(progress => progress !== null)
                .sort((a, b) => {
                    // Primary sort: Number of achievements (descending)
                    if (b.achieved !== a.achieved) {
                        return b.achieved - a.achieved;
                    }
                    
                    // Special case: If both users have 100% completion, treat them as tied
                    if (a.percentage == 100.00 && b.percentage == 100.00) {
                        return 0;
                    }
                    
                    // Secondary sort: Points from awards (descending)
                    return b.points - a.points;
                });

            // Check for an active tiebreaker for the current month
            const monthKey = leaderboardCommand.getMonthKey(now);
            const activeTiebreaker = await leaderboardCommand.ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });

            // Create a working copy of sortedProgress for tiebreaker processing
            const workingSorted = [...sortedProgress];

            // Get tiebreaker data if there's an active tiebreaker
            let tiebreakerEntries = [];
            if (activeTiebreaker) {
                try {
                    // Fetch multiple batches of leaderboard entries
                    const batch1 = await retroAPI.getLeaderboardEntriesDirect(activeTiebreaker.leaderboardId, 0, 500);
                    const batch2 = await retroAPI.getLeaderboardEntriesDirect(activeTiebreaker.leaderboardId, 500, 500);
                    
                    // Combine the batches
                    let rawEntries = [];
                    
                    // Process first batch
                    if (batch1) {
                        if (Array.isArray(batch1)) {
                            rawEntries = [...rawEntries, ...batch1];
                        } else if (batch1.Results && Array.isArray(batch1.Results)) {
                            rawEntries = [...rawEntries, ...batch1.Results];
                        }
                    }
                    
                    // Process second batch
                    if (batch2) {
                        if (Array.isArray(batch2)) {
                            rawEntries = [...rawEntries, ...batch2];
                        } else if (batch2.Results && Array.isArray(batch2.Results)) {
                            rawEntries = [...rawEntries, ...batch2.Results];
                        }
                    }
                    
                    console.log(`Total tiebreaker entries fetched: ${rawEntries.length}`);
                    
                    // Process tiebreaker entries
                    tiebreakerEntries = rawEntries.map(entry => {
                        const user = entry.User || entry.user || '';
                        const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                        const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                        const rank = entry.Rank || entry.rank || 0;
                        
                        return {
                            username: user.trim().toLowerCase(),
                            score: formattedScore,
                            apiRank: parseInt(rank, 10)
                        };
                    });
                } catch (error) {
                    console.error('Error fetching tiebreaker leaderboard:', error);
                }
            }

            // Process tiebreaker and assign ranks correctly
            leaderboardCommand.assignRanks(workingSorted, tiebreakerEntries, activeTiebreaker);

            // Get month name for the title
            const monthName = now.toLocaleString('default', { month: 'long' });
            
            // Calculate challenge end date and time remaining
            const challengeEndDate = new Date(nextMonthStart);
            challengeEndDate.setDate(challengeEndDate.getDate() - 1); // Last day of current month
            challengeEndDate.setHours(23, 59, 59);  // Set to 11:59 PM
            
            // Convert to UNIX timestamp for Discord formatting
            const endDateTimestamp = Math.floor(challengeEndDate.getTime() / 1000);
            
            // Format the end date for display (using Discord timestamps)
            const endDateFormatted = `<t:${endDateTimestamp}:F>`;
            
            // Use Discord's relative time format
            const timeRemaining = `<t:${endDateTimestamp}:R>`;

            if (workingSorted.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle(`${monthName} Challenge Leaderboard`)
                    .setColor('#FFD700')
                    .setThumbnail(`https://retroachievements.org${gameImageUrl}`);

                // Add game details to description
                let description = `**Game:** [${gameTitle}](https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid})\n` +
                                `**Total Achievements:** ${currentChallenge.monthly_challange_game_total}\n` +
                                `**Challenge Ends:** ${endDateFormatted}\n` +
                                `**Time Remaining:** ${timeRemaining}\n\n` +
                                `${leaderboardCommand.AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${leaderboardCommand.AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${leaderboardCommand.AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`;

                // Add tiebreaker info if active
                if (activeTiebreaker) {
                    description += `\n\n${leaderboardCommand.TIEBREAKER_EMOJI} **Active Tiebreaker:** ${activeTiebreaker.gameTitle}\n` +
                                `*Tiebreaker results are used to determine final ranking for tied users in top positions.*`;
                }
                
                description += `\n\n*Note: Only achievements earned during ${monthName} **in Hardcore Mode** count toward challenge status.*`;
                description += `\n⚠️ *Save states and rewind features are not allowed. Fast forward is permitted.*`;
                
                embed.setDescription(description);

                embed.addFields({
                    name: 'No Participants',
                    value: 'No one has earned achievements in this challenge this month yet!'
                });
                
                return [embed];
            }

            // Create embeds using leaderboard command's function
            return leaderboardCommand.createPaginatedEmbeds(
                workingSorted,
                monthName,
                gameInfo,
                currentChallenge,
                endDateFormatted,
                timeRemaining,
                activeTiebreaker
            );
        } catch (error) {
            console.error('Error generating leaderboard embeds:', error);
            return null;
        }
    }
}

// Create singleton instance
const leaderboardFeedService = new LeaderboardFeedService();
export default leaderboardFeedService;
