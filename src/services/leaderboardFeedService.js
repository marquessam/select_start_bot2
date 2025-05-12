// src/services/leaderboardFeedService.js
import { EmbedBuilder } from 'discord.js';
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import retroAPI from './retroAPI.js';
import { config } from '../config/config.js';

const UPDATE_INTERVAL = 15 * 60 * 1000; // 15 minutes in milliseconds

// Constants copied from leaderboard.js
const AWARD_EMOJIS = {
    MASTERY: '✨',
    BEATEN: '⭐',
    PARTICIPATION: '🏁'
};

const RANK_EMOJIS = {
    1: '🥇',
    2: '🥈',
    3: '🥉'
};

const TIEBREAKER_EMOJI = '⚔️'; // Emoji to indicate tiebreaker status

// Role IDs for top positions (set these to match your server's role IDs)
const TOP_POSITION_ROLES = {
    1: null, // Monthly Champion role ID (set this to your actual role ID)
    2: null, // Runner-Up role ID (set this to your actual role ID)
    3: null  // Bronze Champion role ID (set this to your actual role ID)
};

// Whether to enable role-based notifications (set to false if you don't want to use roles)
const ENABLE_ROLE_NOTIFICATIONS = false;

class LeaderboardFeedService {
    constructor() {
        this.client = null;
        this.lastMessageId = null;
        this.channelId = config.discord.leaderboardFeedChannelId || '1371350718505811989'; // Use provided channel ID as fallback
        this.alertsChannelId = config.discord.rankAlertsChannelId;  // Channel for rank change alerts
        this.updateInterval = null;
        this.previousTopRanks = new Map(); // Store previous top 3 positions for detecting changes
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
            const { embeds, sortedUsers } = await this.generateLeaderboardEmbeds();
            if (!embeds || embeds.length === 0 || !sortedUsers) {
                console.error('Failed to generate leaderboard embeds');
                return;
            }

            // Check for rank changes before updating the message
            if (sortedUsers.length > 0) {
                await this.checkForRankChanges(sortedUsers);
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

    // Get the alerts channel
    async getAlertsChannel() {
        if (!this.client || !this.alertsChannelId) {
            return null;
        }

        try {
            const guildId = config.discord.guildId;
            const guild = await this.client.guilds.fetch(guildId);
            
            if (!guild) {
                return null;
            }

            return await guild.channels.fetch(this.alertsChannelId);
        } catch (error) {
            console.error('Error getting alerts channel:', error);
            return null;
        }
    }

    // Helper function to check if date is in current month (copied from leaderboard.js)
    isDateInCurrentMonth(dateString) {
        // Parse the input date string more reliably
        const inputDate = new Date(dateString);
        
        // Get the current date
        const currentDate = new Date();
        
        // Get the first day of the current month (at midnight)
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0);
        
        // Get the first day of the previous month (at midnight)
        const firstDayOfPrevMonth = new Date(firstDayOfMonth);
        firstDayOfPrevMonth.setMonth(firstDayOfPrevMonth.getMonth() - 1);
        
        // Get the last day of the previous month (end of day)
        const lastDayOfPrevMonth = new Date(firstDayOfMonth);
        lastDayOfPrevMonth.setDate(0); // This sets to the last day of previous month
        lastDayOfPrevMonth.setHours(23, 59, 59, 999); // End of day
        
        // The grace period includes the entire last day of the previous month
        // Check if the input date is on the last day of the previous month
        const isLastDayOfPrevMonth = inputDate.getFullYear() === lastDayOfPrevMonth.getFullYear() &&
                                    inputDate.getMonth() === lastDayOfPrevMonth.getMonth() &&
                                    inputDate.getDate() === lastDayOfPrevMonth.getDate();
        
        // Check if the input date is in the current month
        const isCurrentMonth = inputDate.getFullYear() === currentDate.getFullYear() &&
                            inputDate.getMonth() === currentDate.getMonth();
        
        return isCurrentMonth || isLastDayOfPrevMonth;
    }

    // Helper function to get month key from date (copied from leaderboard.js)
    getMonthKey(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
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
                return { embeds: null, sortedUsers: null };
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
                        .filter(([id, data]) => data.hasOwnProperty('dateEarned') && this.isDateInCurrentMonth(data.dateEarned))
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
                        award = AWARD_EMOJIS.MASTERY;
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
                            award = AWARD_EMOJIS.BEATEN;
                            points = 4;
                        }
                        // For participation, at least one achievement must be earned this month
                        else if (achievementsEarnedThisMonth.length > 0) {
                            award = AWARD_EMOJIS.PARTICIPATION;
                            points = 1;
                        }
                    }

                    return {
                        user,
                        username: user.raUsername,
                        discordId: user.discordId,
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
            const monthKey = this.getMonthKey(now);
            const activeTiebreaker = await ArcadeBoard.findOne({
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
            this.assignRanks(workingSorted, tiebreakerEntries, activeTiebreaker);

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
                                `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`;

                // Add tiebreaker info if active
                if (activeTiebreaker) {
                    description += `\n\n${TIEBREAKER_EMOJI} **Active Tiebreaker:** ${activeTiebreaker.gameTitle}\n` +
                                `*Tiebreaker results are used to determine final ranking for tied users in top positions.*`;
                }
                
                description += `\n\n*Note: Only achievements earned during ${monthName} **in Hardcore Mode** count toward challenge status.*`;
                description += `\n⚠️ *Save states and rewind features are not allowed. Fast forward is permitted.*`;
                
                embed.setDescription(description);

                embed.addFields({
                    name: 'No Participants',
                    value: 'No one has earned achievements in this challenge this month yet!'
                });
                
                return { embeds: [embed], sortedUsers: [] };
            }

            // Create embeds for the leaderboard
            const embeds = this.createPaginatedEmbeds(
                workingSorted,
                monthName,
                gameInfo,
                currentChallenge,
                endDateFormatted,
                timeRemaining,
                activeTiebreaker
            );

            return { embeds, sortedUsers: workingSorted };
        } catch (error) {
            console.error('Error generating leaderboard embeds:', error);
            return { embeds: null, sortedUsers: null };
        }
    }

    // Check for rank changes in the top 3 positions and notify affected users
    async checkForRankChanges(currentRanks) {
        try {
            // Only process if we have both previous and current ranks
            if (!this.previousTopRanks.size) {
                // First run, just store the current top ranks and exit
                this.storeTopRanks(currentRanks);
                return;
            }

            // Get top 3 users from current ranks
            const topUsers = currentRanks.filter(user => user.displayRank <= 3);
            
            if (topUsers.length === 0) {
                return; // No users in top 3, nothing to check
            }

            // Check for rank changes
            const alerts = [];
            
            for (const user of topUsers) {
                const currentRank = user.displayRank;
                const username = user.username;
                const discordId = user.discordId;
                
                // Skip if no Discord ID
                if (!discordId) continue;

                // Get previous rank (if any)
                const previousRank = this.previousTopRanks.get(username);
                
                // Check if user has moved up in rank
                if (previousRank && currentRank < previousRank) {
                    // Get the user they passed
                    const passedUser = this.findUserByPreviousRank(currentRank);
                    if (passedUser) {
                        alerts.push({
                            type: 'overtake',
                            user: { username, discordId },
                            passedUser: passedUser,
                            newRank: currentRank, 
                            oldRank: previousRank
                        });
                    }
                } 
                // Check if user is new to top 3
                else if (!previousRank && currentRank <= 3) {
                    alerts.push({
                        type: 'newEntry',
                        user: { username, discordId },
                        newRank: currentRank
                    });
                }
            }

            // Send notifications for any detected changes
            if (alerts.length > 0) {
                await this.sendRankChangeAlerts(alerts);
                
                // Also update roles if enabled
                if (ENABLE_ROLE_NOTIFICATIONS) {
                    await this.updateTopPositionRoles(currentRanks);
                }
            }

            // Store current ranks for next comparison
            this.storeTopRanks(currentRanks);
        } catch (error) {
            console.error('Error checking for rank changes:', error);
        }
    }

    // Store top ranks from current leaderboard for future comparison
    storeTopRanks(ranks) {
        // Clear previous data
        this.previousTopRanks.clear();
        
        // Store the username and rank of each user in the top standings
        for (const user of ranks) {
            if (user.displayRank <= 5) { // Store top 5 to catch movements in and out of top 3
                this.previousTopRanks.set(user.username, user.displayRank);
            }
        }
    }

    // Find which user previously held a specific rank
    findUserByPreviousRank(rank) {
        for (const [username, prevRank] of this.previousTopRanks.entries()) {
            if (prevRank === rank) {
                return { username };
            }
        }
        return null;
    }

    // Send alerts for rank changes
    async sendRankChangeAlerts(alerts) {
        const alertsChannel = await this.getAlertsChannel();
        if (!alertsChannel) {
            console.log('No alerts channel configured, skipping rank change notifications');
            return;
        }

        for (const alert of alerts) {
            try {
                let message = '';
                
                if (alert.type === 'overtake') {
                    // User passed another user
                    const rankEmoji = RANK_EMOJIS[alert.newRank] || `#${alert.newRank}`;
                    message = `🔄 <@${alert.user.discordId}> has passed **${alert.passedUser.username}** and is now in ${rankEmoji} place!`;
                } else if (alert.type === 'newEntry') {
                    // User entered top 3
                    const rankEmoji = RANK_EMOJIS[alert.newRank] || `#${alert.newRank}`;
                    message = `🆕 <@${alert.user.discordId}> has entered the top 3 and is now in ${rankEmoji} place!`;
                }
                
                if (message) {
                    await alertsChannel.send(message);
                    console.log(`Sent rank change alert: ${message}`);
                }
            } catch (error) {
                console.error('Error sending rank change alert:', error);
            }
        }
    }

    // Update roles for top 3 positions
    async updateTopPositionRoles(currentRanks) {
        if (!ENABLE_ROLE_NOTIFICATIONS) return;
        
        try {
            // Skip if any role ID is null
            if (!TOP_POSITION_ROLES[1] || !TOP_POSITION_ROLES[2] || !TOP_POSITION_ROLES[3]) {
                console.log('Top position roles not configured, skipping role updates');
                return;
            }

            const guildId = config.discord.guildId;
            const guild = await this.client.guilds.fetch(guildId);
            if (!guild) return;
            
            // Get role objects
            const roles = {
                1: await guild.roles.fetch(TOP_POSITION_ROLES[1]),
                2: await guild.roles.fetch(TOP_POSITION_ROLES[2]),
                3: await guild.roles.fetch(TOP_POSITION_ROLES[3])
            };
            
            // Remove all top position roles from all members first
            const membersWithRoles = await guild.members.fetch();
            for (const [memberId, member] of membersWithRoles) {
                let hasAnyTopRole = false;
                for (const rank of [1, 2, 3]) {
                    if (roles[rank] && member.roles.cache.has(roles[rank].id)) {
                        hasAnyTopRole = true;
                        await member.roles.remove(roles[rank]);
                        console.log(`Removed rank ${rank} role from user ${member.user.tag}`);
                    }
                }
            }
            
            // Assign roles to current top 3
            for (const user of currentRanks) {
                if (user.displayRank > 3) continue; // Only top 3
                if (!user.discordId) continue; // Skip if no Discord ID
                
                try {
                    const member = await guild.members.fetch(user.discordId);
                    if (member && roles[user.displayRank]) {
                        await member.roles.add(roles[user.displayRank]);
                        console.log(`Assigned rank ${user.displayRank} role to user ${member.user.tag}`);
                    }
                } catch (memberError) {
                    console.error(`Failed to get/update member ${user.username}:`, memberError);
                }
            }
        } catch (error) {
            console.error('Error updating top position roles:', error);
        }
    }

    // Code to assign ranks (copied from leaderboard.js with minimal changes)
    assignRanks(users, tiebreakerEntries, activeTiebreaker) {
        if (!users || users.length === 0) return;

        // First, add tiebreaker info to users
        if (tiebreakerEntries && tiebreakerEntries.length > 0) {
            for (const user of users) {
                const entry = tiebreakerEntries.find(e => 
                    e.username === user.username.toLowerCase()
                );
                
                if (entry) {
                    user.tiebreakerScore = entry.score;
                    user.tiebreakerRank = entry.apiRank;
                    user.tiebreakerGame = activeTiebreaker.gameTitle;
                    user.hasTiebreaker = true;
                } else {
                    user.hasTiebreaker = false;
                }
            }
        }

        // Store original order for stable sorting
        users.forEach((user, index) => {
            user.originalIndex = index;
        });

        // Identify tied groups and assign ranks
        let currentRank = 1;
        let lastAchieved = -1;
        let lastPoints = -1;
        let currentTieGroup = [];
        let tieGroupStartIdx = 0;

        // First pass: identify tie groups
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            // Check if this user is tied with the previous user
            if (i > 0 && user.achieved === lastAchieved && user.points === lastPoints) {
                // Add to current tie group
                currentTieGroup.push(i);
            } else {
                // Process previous tie group if it exists
                if (currentTieGroup.length > 1) {
                    // This is a tie group - handle it
                    this.processTieGroup(users, currentTieGroup, tieGroupStartIdx);
                } else if (currentTieGroup.length === 1) {
                    // Single user, just assign the rank
                    users[currentTieGroup[0]].displayRank = tieGroupStartIdx + 1;
                }
                
                // Start a new potential tie group
                currentTieGroup = [i];
                tieGroupStartIdx = i;
            }
            
            // Update for next comparison
            lastAchieved = user.achieved;
            lastPoints = user.points;
        }
        
        // Process the last tie group if it exists
        if (currentTieGroup.length > 1) {
            this.processTieGroup(users, currentTieGroup, tieGroupStartIdx);
        } else if (currentTieGroup.length === 1) {
            users[currentTieGroup[0]].displayRank = tieGroupStartIdx + 1;
        }

        // Final pass: ensure all users have a displayRank
        for (let i = 0; i < users.length; i++) {
            if (users[i].displayRank === undefined) {
                users[i].displayRank = i + 1;
            }
        }

        // Now re-sort the users array based on displayRank
        users.sort((a, b) => {
            // Primary sort: displayRank (lowest first)
            if (a.displayRank !== b.displayRank) {
                return a.displayRank - b.displayRank;
            }
            
            // Secondary sort: preserve original order for stable sort
            return a.originalIndex - b.originalIndex;
        });
    }

    // Helper method to process a tie group (copied from leaderboard.js with minimal changes)
    processTieGroup(users, tieGroupIndices, startIdx) {
        // Only apply special tiebreaker logic to top 3 positions
        const isTopThree = startIdx < 3;
        
        if (isTopThree) {
            // Check if any users in this tie group have tiebreaker scores
            const withTiebreaker = tieGroupIndices.filter(idx => users[idx].hasTiebreaker);
            const withoutTiebreaker = tieGroupIndices.filter(idx => !users[idx].hasTiebreaker);
            
            if (withTiebreaker.length > 0) {
                // Sort users with tiebreakers by their tiebreaker rank
                withTiebreaker.sort((a, b) => users[a].tiebreakerRank - users[b].tiebreakerRank);
                
                // Assign individual ranks to users with tiebreakers
                for (let i = 0; i < withTiebreaker.length; i++) {
                    users[withTiebreaker[i]].displayRank = startIdx + 1 + i;
                }
                
                // All users without tiebreakers share the next rank
                const nextRank = startIdx + 1 + withTiebreaker.length;
                for (const idx of withoutTiebreaker) {
                    users[idx].displayRank = nextRank;
                }
            } else {
                // No tiebreakers - all share the same rank
                for (const idx of tieGroupIndices) {
                    users[idx].displayRank = startIdx + 1;
                }
            }
        } else {
            // Outside top 3: all users in tie group share the same rank
            for (const idx of tieGroupIndices) {
                users[idx].displayRank = startIdx + 1;
            }
        }
    }
    
    // Create embedded messages for the leaderboard (copied from leaderboard.js with minimal changes)
    createPaginatedEmbeds(workingSorted, monthName, gameInfo, currentChallenge, endDateFormatted, timeRemaining, activeTiebreaker) {
        const embeds = [];
        const totalPages = Math.ceil(workingSorted.length / 10); // Show 10 users per page
    
        for (let page = 0; page < totalPages; page++) {
            // Get users for this page
            const startIndex = page * 10;
            const endIndex = Math.min((page + 1) * 10, workingSorted.length);
            const usersOnPage = workingSorted.slice(startIndex, endIndex);
    
            // Create embed for this page
            const embed = new EmbedBuilder()
                .setTitle(`${monthName} Challenge Leaderboard`)
                .setColor('#FFD700')
                .setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`)
                .setFooter({ text: `Page ${page + 1}/${totalPages} • Use /help points for more information` })
                .setTimestamp();
    
            // Create base description for all pages
            let description = `**Game:** [${gameInfo.title}](https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid})\n` +
                            `**Total Achievements:** ${currentChallenge.monthly_challange_game_total}\n` +
                            `**Challenge Ends:** ${endDateFormatted}\n` +
                            `**Time Remaining:** ${timeRemaining}\n\n` +
                            `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`;
    
            // Add tiebreaker info if active
            if (activeTiebreaker) {
                description += `\n\n${TIEBREAKER_EMOJI} **Active Tiebreaker:** ${activeTiebreaker.gameTitle}\n` +
                            `*Tiebreaker results are used to determine final ranking for tied users in top positions.*`;
            }
            
            description += `\n\n*Note: Only achievements earned during ${monthName} **in Hardcore Mode** count toward challenge status.*`;
            description += `\n⚠️ *Save states and rewind features are not allowed. Fast forward is permitted.*`;
            
            embed.setDescription(description);
    
            // Format leaderboard text using pre-calculated displayRanks
            let leaderboardText = '';
            
            for (const user of usersOnPage) {
                // Use the pre-calculated displayRank
                const rankEmoji = user.displayRank <= 3 ? RANK_EMOJIS[user.displayRank] : `#${user.displayRank}`;
                
                // Add the main user entry to leaderboard with link to profile
                leaderboardText += `${rankEmoji} **[${user.username}](https://retroachievements.org/user/${user.username})** ${user.award}\n`;
                
                // Add the achievement stats
                if (user.hasTiebreaker && user.tiebreakerScore) {
                    // For users with tiebreaker scores, show both regular and tiebreaker stats
                    leaderboardText += `${user.achieved}/${currentChallenge.monthly_challange_game_total} (${user.percentage}%)\n`;
                    leaderboardText += `${TIEBREAKER_EMOJI} ${user.tiebreakerScore} in ${user.tiebreakerGame}\n\n`;
                } else {
                    // For users without tiebreaker scores, just show regular stats
                    leaderboardText += `${user.achieved}/${currentChallenge.monthly_challange_game_total} (${user.percentage}%)\n\n`;
                }
            }
    
            embed.addFields({
                name: `Rankings (${workingSorted.length} participants)`,
                value: leaderboardText || 'No rankings available.'
            });
    
            embeds.push(embed);
        }
    
        return embeds;
    }
}

// Create singleton instance
const leaderboardFeedService = new LeaderboardFeedService();
export default leaderboardFeedService;
