// src/services/leaderboardFeedService.js
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS, createHeaderEmbed, getDiscordTimestamp } from '../utils/FeedUtils.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertUtils from '../utils/AlertUtils.js';

const UPDATE_INTERVAL = 15 * 60 * 1000; // 15 minutes

// Constants for awards and ranks - now using shared EMOJIS
const AWARD_EMOJIS = {
    MASTERY: EMOJIS.MASTERY,
    BEATEN: EMOJIS.BEATEN,
    PARTICIPATION: EMOJIS.PARTICIPATION
};

const TIEBREAKER_EMOJI = '⚔️'; // Emoji to indicate tiebreaker status
const TIEBREAKER_BREAKER_EMOJI = '🗡️'; // NEW: Emoji for tiebreaker-breaker

const USERS_PER_EMBED = 10; // Number of users to display per embed

class LeaderboardFeedService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.leaderboardFeedChannelId || '1371350718505811989');
        this.alertsChannelId = config.discord.rankAlertsChannelId || this.channelId;
        this.previousTopRanks = new Map(); // Store previous top positions
        
        // Set the alerts channel for notifications
        AlertUtils.setAlertsChannel(this.alertsChannelId);
    }

    async start() {
        // Call the parent class's start method with our interval
        await super.start(UPDATE_INTERVAL);
    }

    // Override the update method from base class
    async update() {
        await this.updateLeaderboard();
    }

    async updateLeaderboard() {
        try {
            const channel = await this.getChannel();
            if (!channel) {
                console.error('Leaderboard feed channel not found or inaccessible');
                return;
            }
            
            // Generate monthly leaderboard embeds
            const { headerEmbed, participantEmbeds, sortedUsers } = await this.generateLeaderboardEmbeds();
            if (!headerEmbed || !participantEmbeds || participantEmbeds.length === 0 || !sortedUsers) {
                console.error('Failed to generate monthly leaderboard embeds');
                return;
            }

            // Generate yearly leaderboard embeds
            const { yearlyHeaderEmbed, yearlyParticipantEmbeds } = await this.generateYearlyLeaderboardEmbeds();

            // Check for rank changes before updating the message
            if (sortedUsers.length > 0) {
                await this.checkForRankChanges(sortedUsers);
            }

            // Format timestamp using our utility
            const timestamp = getDiscordTimestamp(new Date());
            
            const monthlyHeaderContent = `**Monthly Challenge Leaderboard** • ${timestamp} • Updates every 15 minutes`;
            
            // Calculate how many messages we need in total
            const totalMessagesNeeded = 1 + participantEmbeds.length; // Monthly header + monthly participants
            const yearlyMessagesNeeded = yearlyHeaderEmbed ? (1 + yearlyParticipantEmbeds.length) : 0; // Yearly header + yearly participants
            const completeMessagesNeeded = totalMessagesNeeded + yearlyMessagesNeeded;

            // Add update frequency to the footer of the first and last participant embeds
            if (participantEmbeds.length > 0) {
                // First embed
                participantEmbeds[0].setFooter({
                    text: `Group 1/${participantEmbeds.length} • Updates every 15 minutes • Use /help points for more information`,
                    iconURL: headerEmbed.data.thumbnail?.url || null
                });
                
                // Last embed (if different from first)
                if (participantEmbeds.length > 1) {
                    participantEmbeds[participantEmbeds.length - 1].setFooter({
                        text: `Group ${participantEmbeds.length}/${participantEmbeds.length} • Updates every 15 minutes • Use /help points for more information`,
                        iconURL: headerEmbed.data.thumbnail?.url || null
                    });
                }
            }
            
            // Add update frequency to yearly embeds
            if (yearlyParticipantEmbeds && yearlyParticipantEmbeds.length > 0) {
                // First yearly embed
                yearlyParticipantEmbeds[0].setFooter({
                    text: `Group 1/${yearlyParticipantEmbeds.length} • Updates every 15 minutes • Use /help points for more information`
                });
                
                // Last yearly embed (if different from first)
                if (yearlyParticipantEmbeds.length > 1) {
                    yearlyParticipantEmbeds[yearlyParticipantEmbeds.length - 1].setFooter({
                        text: `Group ${yearlyParticipantEmbeds.length}/${yearlyParticipantEmbeds.length} • Updates every 15 minutes • Use /help points for more information`
                    });
                }
            }

            // Check if we need to update or create new messages
            if (this.messageIds.size === completeMessagesNeeded) {
                // Update existing messages
                try {
                    // Update monthly header message
                    await this.updateMessage('monthly_header', { content: monthlyHeaderContent, embeds: [headerEmbed] }, true);
                    
                    // Update monthly participant messages
                    for (let i = 0; i < participantEmbeds.length; i++) {
                        await this.updateMessage(
                            `monthly_participants_${i}`, 
                            { content: '', embeds: [participantEmbeds[i]] }
                        );
                    }
                    
                    // Update yearly messages if they exist
                    if (yearlyHeaderEmbed) {
                        await this.updateMessage(
                            'yearly_header',
                            { content: '**Yearly Leaderboard**', embeds: [yearlyHeaderEmbed] }
                        );
                        
                        for (let i = 0; i < yearlyParticipantEmbeds.length; i++) {
                            await this.updateMessage(
                                `yearly_participants_${i}`,
                                { content: '', embeds: [yearlyParticipantEmbeds[i]] }
                            );
                        }
                    }
                } catch (error) {
                    console.error('Error updating leaderboard messages:', error);
                    // If update fails, recreate all messages
                    this.messageIds.clear();
                }
            } 
            
            // If message count doesn't match or we failed to update, recreate all messages
            if (this.messageIds.size !== completeMessagesNeeded) {
                // Delete any existing messages first
                await this.clearChannel();
                
                // Create new monthly messages
                await this.updateMessage('monthly_header', { content: monthlyHeaderContent, embeds: [headerEmbed] }, true);
                
                // Create monthly participant messages
                for (let i = 0; i < participantEmbeds.length; i++) {
                    await this.updateMessage(
                        `monthly_participants_${i}`, 
                        { content: '', embeds: [participantEmbeds[i]] }
                    );
                }
                
                // Create yearly messages if they exist
                if (yearlyHeaderEmbed) {
                    await this.updateMessage(
                        'yearly_header',
                        { content: '**Yearly Leaderboard**', embeds: [yearlyHeaderEmbed] }
                    );
                    
                    for (let i = 0; i < yearlyParticipantEmbeds.length; i++) {
                        await this.updateMessage(
                            `yearly_participants_${i}`,
                            { content: '', embeds: [yearlyParticipantEmbeds[i]] }
                        );
                    }
                }
            }
        } catch (error) {
            console.error('Error updating leaderboard:', error);
        }
    }

    // Helper function to check if date is in current month
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

    // Helper function to get month key from date
    getMonthKey(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }

    // UPDATED: Enhanced generateLeaderboardEmbeds with tiebreaker-breaker support
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
                return { headerEmbed: null, participantEmbeds: null, sortedUsers: null };
            }

            // Get game info using RetroAPIUtils
            let gameTitle = currentChallenge.monthly_game_title;
            let gameImageUrl = currentChallenge.monthly_game_icon_url;
            let gameInfo;

            if (!gameTitle || !gameImageUrl) {
                try {
                    gameInfo = await RetroAPIUtils.getGameInfo(currentChallenge.monthly_challange_gameid);
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

            // Get progress for all users
            const userProgress = await Promise.all(users.map(async (user) => {
                try {
                    // Use RetroAPIUtils for caching
                    const progress = await RetroAPIUtils.getUserGameProgress(
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
                } catch (error) {
                    console.error(`Error processing user progress for ${user.raUsername}:`, error);
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

            // NEW: Get tiebreaker and tiebreaker-breaker data if there's an active tiebreaker
            let tiebreakerEntries = [];
            let tiebreakerBreakerEntries = [];
            
            if (activeTiebreaker) {
                try {
                    // Fetch multiple batches of leaderboard entries
                    const batch1 = await RetroAPIUtils.getLeaderboardEntries(activeTiebreaker.leaderboardId, 500);
                    const batch2 = await RetroAPIUtils.getLeaderboardEntries(activeTiebreaker.leaderboardId, 500, 500);
                    
                    // Combine the batches
                    let rawEntries = [];
                    
                    // Process first batch
                    if (batch1) {
                        rawEntries = [...rawEntries, ...batch1];
                    }
                    
                    // Process second batch
                    if (batch2) {
                        rawEntries = [...rawEntries, ...batch2];
                    }
                    
                    console.log(`Total tiebreaker entries fetched: ${rawEntries.length}`);
                    
                    // Process tiebreaker entries
                    tiebreakerEntries = rawEntries.map(entry => {
                        const user = entry.User || '';
                        const score = entry.Score || entry.Value || 0;
                        const formattedScore = entry.FormattedScore || score.toString();
                        const rank = entry.Rank || 0;
                        
                        return {
                            username: user.trim().toLowerCase(),
                            score: formattedScore,
                            apiRank: parseInt(rank, 10)
                        };
                    });

                    // NEW: Fetch tiebreaker-breaker entries if available
                    if (activeTiebreaker.hasTiebreakerBreaker()) {
                        try {
                            const tbInfo = activeTiebreaker.getTiebreakerBreakerInfo();
                            const tbBatch1 = await RetroAPIUtils.getLeaderboardEntries(tbInfo.leaderboardId, 500);
                            const tbBatch2 = await RetroAPIUtils.getLeaderboardEntries(tbInfo.leaderboardId, 500, 500);
                            
                            // Combine the tiebreaker-breaker batches
                            let tbRawEntries = [];
                            
                            if (tbBatch1) {
                                tbRawEntries = [...tbRawEntries, ...tbBatch1];
                            }
                            
                            if (tbBatch2) {
                                tbRawEntries = [...tbRawEntries, ...tbBatch2];
                            }
                            
                            console.log(`Total tiebreaker-breaker entries fetched: ${tbRawEntries.length}`);
                            
                            // Process tiebreaker-breaker entries
                            tiebreakerBreakerEntries = tbRawEntries.map(entry => {
                                const user = entry.User || '';
                                const score = entry.Score || entry.Value || 0;
                                const formattedScore = entry.FormattedScore || score.toString();
                                const rank = entry.Rank || 0;
                                
                                return {
                                    username: user.trim().toLowerCase(),
                                    score: formattedScore,
                                    apiRank: parseInt(rank, 10)
                                };
                            });
                        } catch (error) {
                            console.error('Error fetching tiebreaker-breaker leaderboard:', error);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching tiebreaker leaderboard:', error);
                }
            }

            // NEW: Process tiebreaker and assign ranks correctly with tiebreaker-breaker support
            this.assignRanks(workingSorted, tiebreakerEntries, tiebreakerBreakerEntries, activeTiebreaker);

            // Get month name for the title
            const monthName = now.toLocaleString('default', { month: 'long' });
            
            // Calculate challenge end date and time remaining using getDiscordTimestamp
            const challengeEndDate = new Date(nextMonthStart);
            challengeEndDate.setDate(challengeEndDate.getDate() - 1); // Last day of current month
            challengeEndDate.setHours(23, 59, 59);  // Set to 11:59 PM
            
            // Format dates using Discord timestamps
            const endDateFormatted = getDiscordTimestamp(challengeEndDate, 'F');
            const timeRemaining = getDiscordTimestamp(challengeEndDate, 'R');
            const updateTimestamp = getDiscordTimestamp(new Date());

            // Create the header embed using our utility
            const headerEmbed = createHeaderEmbed(
                `${monthName} Challenge Leaderboard`,
                `**Game:** [${gameTitle}](https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid})\n` +
                `**Total Achievements:** ${currentChallenge.monthly_challange_game_total}\n` +
                `**Challenge Ends:** ${endDateFormatted}\n` +
                `**Time Remaining:** ${timeRemaining}\n` +
                `**Last Updated:** ${updateTimestamp}\n\n` +
                `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`,
                {
                    color: COLORS.GOLD,
                    thumbnail: `https://retroachievements.org${gameImageUrl}`
                }
            );

            // NEW: Add enhanced tiebreaker info if active
            if (activeTiebreaker) {
                let tiebreakerText = `${TIEBREAKER_EMOJI} **${activeTiebreaker.gameTitle}**\n` +
                                   `*Tiebreaker results are used to determine final ranking for tied users in top positions.*`;
                
                // Add tiebreaker-breaker info if available
                if (activeTiebreaker.hasTiebreakerBreaker()) {
                    const tbInfo = activeTiebreaker.getTiebreakerBreakerInfo();
                    tiebreakerText += `\n\n${TIEBREAKER_BREAKER_EMOJI} **Tiebreaker-Breaker:** ${tbInfo.gameTitle}\n` +
                                    `*Used to resolve ties within the tiebreaker itself.*`;
                }
                
                headerEmbed.addFields({
                    name: 'Active Tiebreaker',
                    value: tiebreakerText
                });
            }
            
            // Add note about hardcore mode
            headerEmbed.addFields({
                name: 'Rules',
                value: `*Note: Only achievements earned during ${monthName} **in Hardcore Mode** count toward challenge status.*\n` +
                       `⚠️ *Save states and rewind features are not allowed. Fast forward is permitted.*`
            });

            if (workingSorted.length === 0) {
                headerEmbed.addFields({
                    name: 'No Participants',
                    value: 'No one has earned achievements in this challenge this month yet!'
                });
                
                return { headerEmbed, participantEmbeds: [], sortedUsers: [] };
            }

            // Create participant embeds (one for each group of USERS_PER_EMBED users)
            const participantEmbeds = [];
            const totalPages = Math.ceil(workingSorted.length / USERS_PER_EMBED);
            
            for (let page = 0; page < totalPages; page++) {
                // Get users for this page
                const startIndex = page * USERS_PER_EMBED;
                const endIndex = Math.min((page + 1) * USERS_PER_EMBED, workingSorted.length);
                const usersOnPage = workingSorted.slice(startIndex, endIndex);
                
                // Create embed for this page
                const participantEmbed = createHeaderEmbed(
                    `${monthName} Challenge - Participants (${startIndex + 1}-${endIndex})`,
                    `This page shows participants ranked ${startIndex + 1} to ${endIndex} out of ${workingSorted.length} total.`,
                    {
                        color: COLORS.GOLD,
                        thumbnail: `https://retroachievements.org${gameImageUrl}`,
                        footer: { 
                            text: `Group ${page + 1}/${totalPages} • Use /help points for more information`
                        }
                    }
                );
                
                // NEW: Format leaderboard text for this page with tiebreaker-breaker support
                let leaderboardText = '';
                
                for (const user of usersOnPage) {
                    // Use the pre-calculated displayRank
                    const rankEmoji = user.displayRank <= 3 ? EMOJIS[`RANK_${user.displayRank}`] : `#${user.displayRank}`;
                    
                    // Add the main user entry to leaderboard with link to profile
                    leaderboardText += `${rankEmoji} **[${user.username}](https://retroachievements.org/user/${user.username})** ${user.award}\n`;
                    
                    // Add the achievement stats
                    leaderboardText += `${user.achieved}/${currentChallenge.monthly_challange_game_total} (${user.percentage}%)\n`;
                    
                    // Add tiebreaker information if the user has it
                    if (user.hasTiebreaker && user.tiebreakerScore) {
                        leaderboardText += `${TIEBREAKER_EMOJI} ${user.tiebreakerScore} in ${user.tiebreakerGame}\n`;
                    }
                    
                    // NEW: Add tiebreaker-breaker information if the user has it
                    if (user.hasTiebreakerBreaker && user.tiebreakerBreakerScore) {
                        leaderboardText += `${TIEBREAKER_BREAKER_EMOJI} ${user.tiebreakerBreakerScore} in ${user.tiebreakerBreakerGame}\n`;
                    }
                    
                    leaderboardText += '\n';
                }
                
                participantEmbed.addFields({
                    name: `Rankings ${startIndex + 1}-${endIndex} (${workingSorted.length} total participants)`,
                    value: leaderboardText || 'No rankings available.'
                });
                
                participantEmbeds.push(participantEmbed);
            }

            return { headerEmbed, participantEmbeds, sortedUsers: workingSorted };
        } catch (error) {
            console.error('Error generating leaderboard embeds:', error);
            return { headerEmbed: null, participantEmbeds: null, sortedUsers: null };
        }
    },

    // New method to generate yearly leaderboard embeds
    async generateYearlyLeaderboardEmbeds() {
        try {
            // Get current year
            const currentYear = new Date().getFullYear();
            
            // Create the yearly header embed with a distinct color
            const yearlyHeaderEmbed = createHeaderEmbed(
                `${currentYear} Yearly Challenge Leaderboard`,
                `Top players based on all monthly challenges in ${currentYear}. ` +
                `Players earn points for each challenge completion: ` +
                `${EMOJIS.MASTERY} Mastery (7pts), ${EMOJIS.BEATEN} Beaten (4pts), ${EMOJIS.PARTICIPATION} Part. (1pt)`,
                {
                    color: COLORS.INFO,  // Purple instead of gold for the monthly
                    thumbnail: null,
                    footer: { text: 'Updates every 15 minutes • Use /help points for more information' }
                }
            );

            // Get all users to check for annual records
            const users = await User.find();
            
            // Extract yearly data from users
            const yearKey = `annual_${currentYear}`;
            const userPoints = [];
            
            for (const user of users) {
                if (user.annualRecords && user.annualRecords.has(yearKey)) {
                    const annualData = user.annualRecords.get(yearKey);
                    
                    if (annualData && annualData.totalPoints > 0) {
                        userPoints.push({
                            username: user.raUsername,
                            totalPoints: annualData.totalPoints,
                            challengePoints: annualData.challengePoints,
                            communityPoints: annualData.communityPoints,
                            rank: annualData.rank,
                            displayRank: annualData.rank, // Used for display
                            stats: annualData.stats || {
                                mastery: 0,
                                beaten: 0,
                                participation: 0,
                                shadowBeaten: 0,
                                shadowParticipation: 0
                            }
                        });
                    }
                }
            }
            
            // If no users have annual data, return null
            if (userPoints.length === 0) {
                yearlyHeaderEmbed.addFields({
                    name: 'No Participants',
                    value: `No users have earned points for ${currentYear} yet.`
                });
                
                return { yearlyHeaderEmbed, yearlyParticipantEmbeds: [] };
            }
            
            // Sort by total points (descending)
            userPoints.sort((a, b) => b.totalPoints - a.totalPoints);
            
            // Handle ties by assigning the same rank
            let currentRank = 1;
            let currentPoints = userPoints[0].totalPoints;
            
            for (let i = 0; i < userPoints.length; i++) {
                if (userPoints[i].totalPoints < currentPoints) {
                    currentRank = i + 1;
                    currentPoints = userPoints[i].totalPoints;
                }
                userPoints[i].displayRank = currentRank;
            }
            
            // Create participant embeds (paginated)
            const USERS_PER_PAGE = 5; // Reduced to stay within Discord's field character limits
            const yearlyParticipantEmbeds = [];
            const totalPages = Math.ceil(userPoints.length / USERS_PER_PAGE);
            
            for (let page = 0; page < totalPages; page++) {
                // Get users for this page
                const startIndex = page * USERS_PER_PAGE;
                const endIndex = Math.min((page + 1) * USERS_PER_PAGE, userPoints.length);
                const usersOnPage = userPoints.slice(startIndex, endIndex);
                
                // Create embed for this page
                const participantEmbed = createHeaderEmbed(
                    `${currentYear} Yearly Challenge - Leaderboard`,
                    `Top players ranked ${startIndex + 1} to ${endIndex} out of ${userPoints.length} total.`,
                    {
                        color: COLORS.INFO, // Purple to distinguish from monthly
                        footer: { 
                            text: `Group ${page + 1}/${totalPages} • Use /help points for more information`
                        }
                    }
                );
                
                // Add users individually to avoid field length limits
                for (let i = 0; i < usersOnPage.length; i++) {
                    const user = usersOnPage[i];
                    
                    // Get rank emoji
                    const rankEmoji = user.displayRank <= 3 ? EMOJIS[`RANK_${user.displayRank}`] : `#${user.displayRank}`;
                    
                    // Get stats in compact format
                    const m = user.stats.mastery;
                    const b = user.stats.beaten;
                    const p = user.stats.participation;
                    const sb = user.stats.shadowBeaten;
                    const sp = user.stats.shadowParticipation;
                    
                    // Format user stats
                    const userStatsText = 
                        `Challenges: ${user.challengePoints} pts | Community: ${user.communityPoints} pts\n` +
                        `Reg: ${m}✨ ${b}⭐ ${p}🏁 | Shadow: ${sb}⭐ ${sp}🏁`;
                    
                    // Add each user as a separate field to avoid length limits
                    participantEmbed.addFields({
                        name: `${rankEmoji} ${user.username} - ${user.totalPoints} pts`,
                        value: userStatsText
                    });
                }
                
                // Add point system explanation to each page
                participantEmbed.addFields({
                    name: 'Point System',
                    value: '✨ Mastery: 7pts | ⭐ Beaten: 4pts | 🏁 Participation: 1pt | Shadow max: 4pts'
                });
                
                yearlyParticipantEmbeds.push(participantEmbed);
            }
            
            return { yearlyHeaderEmbed, yearlyParticipantEmbeds };
        } catch (error) {
            console.error('Error generating yearly leaderboard embeds:', error);
            return { yearlyHeaderEmbed: null, yearlyParticipantEmbeds: null };
        }
    },

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
            }

            // Store current ranks for next comparison
            this.storeTopRanks(currentRanks);
        } catch (error) {
            console.error('Error checking for rank changes:', error);
        }
    },

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
    },

    // Find which user previously held a specific rank
    findUserByPreviousRank(rank) {
        for (const [username, prevRank] of this.previousTopRanks.entries()) {
            if (prevRank === rank) {
                return { username };
            }
        }
        return null;
    },

    // NEW: Enhanced sendRankChangeAlerts with tiebreaker-breaker support
    async sendRankChangeAlerts(alerts) {
        try {
            // Get current challenge game info for embedding
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
                console.log('No active challenge found for the current month.');
                return;
            }

            // Get month name
            const monthName = now.toLocaleString('default', { month: 'long' });

            // Format position changes
            const changes = [];
            for (const alert of alerts) {
                if (alert.type === 'overtake') {
                    changes.push({
                        username: alert.user.username,
                        newRank: alert.newRank
                    });
                } else if (alert.type === 'newEntry') {
                    changes.push({
                        username: alert.user.username,
                        newRank: alert.newRank
                    });
                }
            }

            // Get current top standings for the alert
            const { sortedUsers } = await this.generateLeaderboardEmbeds();
            const currentStandings = [];
            
            if (sortedUsers && sortedUsers.length > 0) {
                // Get top 5
                const topFive = sortedUsers.slice(0, 5);
                
                for (const user of topFive) {
                    // NEW: Create score text with tiebreaker and tiebreaker-breaker information if available
                    let scoreText = `${user.achieved}/${currentChallenge.monthly_challange_game_total} achievements (${user.percentage}%)`;
                    
                    // Add tiebreaker information if the user has it
                    if (user.hasTiebreaker && user.tiebreakerScore) {
                        scoreText += `\n${TIEBREAKER_EMOJI} Tiebreaker: ${user.tiebreakerScore} in ${user.tiebreakerGame}`;
                    }
                    
                    // NEW: Add tiebreaker-breaker information if the user has it
                    if (user.hasTiebreakerBreaker && user.tiebreakerBreakerScore) {
                        scoreText += `\n${TIEBREAKER_BREAKER_EMOJI} TB-Breaker: ${user.tiebreakerBreakerScore} in ${user.tiebreakerBreakerGame}`;
                    }
                    
                    currentStandings.push({
                        username: user.username,
                        rank: user.displayRank,
                        score: scoreText
                    });
                }
            }

            // Get thumbnail URL
            let thumbnailUrl = null;
            if (currentChallenge.monthly_game_icon_url) {
                thumbnailUrl = `https://retroachievements.org${currentChallenge.monthly_game_icon_url}`;
            }

            // Send alert using AlertUtils with MONTHLY alert type
            await AlertUtils.sendPositionChangeAlert({
                title: `📊 ${monthName} Challenge Update!`,
                description: `The leaderboard for **${currentChallenge.monthly_challange_title || 'the monthly challenge'}** has been updated!`,
                changes: changes,
                currentStandings: currentStandings,
                thumbnail: thumbnailUrl,
                color: COLORS.INFO, // Purple to match monthly challenge color scheme
                footer: { text: 'Data provided by RetroAchievements • Rankings update every 15 minutes' }
            }, 'monthly'); // Specify 'monthly' alert type for proper channel routing
            
            console.log(`Sent monthly challenge leaderboard alert to MONTHLY channel with ${changes.length} position changes`);
        } catch (error) {
            console.error('Error sending monthly challenge rank change alerts:', error);
        }
    },

    // NEW: Enhanced assignRanks method with full tiebreaker-breaker support
    assignRanks(users, tiebreakerEntries, tiebreakerBreakerEntries, activeTiebreaker) {
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

        // NEW: Add tiebreaker-breaker info to users
        if (tiebreakerBreakerEntries && tiebreakerBreakerEntries.length > 0 && activeTiebreaker && activeTiebreaker.hasTiebreakerBreaker()) {
            const tbInfo = activeTiebreaker.getTiebreakerBreakerInfo();
            for (const user of users) {
                const entry = tiebreakerBreakerEntries.find(e => 
                    e.username === user.username.toLowerCase()
                );
                
                if (entry) {
                    user.tiebreakerBreakerScore = entry.score;
                    user.tiebreakerBreakerRank = entry.apiRank;
                    user.tiebreakerBreakerGame = tbInfo.gameTitle;
                    user.hasTiebreakerBreaker = true;
                } else {
                    user.hasTiebreakerBreaker = false;
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
    },

    // NEW: Enhanced processTieGroup method with tiebreaker-breaker support
    processTieGroup(users, tieGroupIndices, startIdx) {
        // Only apply special tiebreaker logic to top 3 positions
        const isTopThree = startIdx < 3;
        
        if (isTopThree) {
            // Separate users by their tiebreaker status
            const withTiebreaker = tieGroupIndices.filter(idx => users[idx].hasTiebreaker);
            const withoutTiebreaker = tieGroupIndices.filter(idx => !users[idx].hasTiebreaker);
            
            if (withTiebreaker.length > 0) {
                // Sort users with tiebreakers by their tiebreaker rank
                withTiebreaker.sort((a, b) => users[a].tiebreakerRank - users[b].tiebreakerRank);
                
                // NEW: Now check for ties within the tiebreaker ranks and apply tiebreaker-breaker
                let currentTiebreakerRank = -1;
                let tiebreakerTieGroup = [];
                let assignedRank = startIdx + 1;
                
                for (let i = 0; i < withTiebreaker.length; i++) {
                    const userIdx = withTiebreaker[i];
                    const user = users[userIdx];
                    
                    if (user.tiebreakerRank === currentTiebreakerRank) {
                        // This user is tied in tiebreaker with previous user(s)
                        tiebreakerTieGroup.push(userIdx);
                    } else {
                        // Process previous tiebreaker tie group if it exists
                        if (tiebreakerTieGroup.length > 1) {
                            this.processTiebreakerTieGroup(users, tiebreakerTieGroup, assignedRank - tiebreakerTieGroup.length);
                        } else if (tiebreakerTieGroup.length === 1) {
                            users[tiebreakerTieGroup[0]].displayRank = assignedRank - 1;
                        }
                        
                        // Start new tiebreaker tie group
                        tiebreakerTieGroup = [userIdx];
                        currentTiebreakerRank = user.tiebreakerRank;
                        assignedRank = startIdx + 1 + i;
                    }
                }
                
                // Process the last tiebreaker tie group
                if (tiebreakerTieGroup.length > 1) {
                    this.processTiebreakerTieGroup(users, tiebreakerTieGroup, assignedRank - tiebreakerTieGroup.length + 1);
                } else if (tiebreakerTieGroup.length === 1) {
                    users[tiebreakerTieGroup[0]].displayRank = assignedRank;
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
    },

    // NEW: Method to process tiebreaker tie groups using tiebreaker-breaker
    processTiebreakerTieGroup(users, tieGroupIndices, startRank) {
        // Check if any users in this tiebreaker tie group have tiebreaker-breaker scores
        const withTiebreakerBreaker = tieGroupIndices.filter(idx => users[idx].hasTiebreakerBreaker);
        const withoutTiebreakerBreaker = tieGroupIndices.filter(idx => !users[idx].hasTiebreakerBreaker);
        
        if (withTiebreakerBreaker.length > 0) {
            // Sort users with tiebreaker-breakers by their tiebreaker-breaker rank
            withTiebreakerBreaker.sort((a, b) => users[a].tiebreakerBreakerRank - users[b].tiebreakerBreakerRank);
            
            // Assign individual ranks to users with tiebreaker-breakers
            for (let i = 0; i < withTiebreakerBreaker.length; i++) {
                users[withTiebreakerBreaker[i]].displayRank = startRank + i;
            }
            
            // All users without tiebreaker-breakers share the next rank
            const nextRank = startRank + withTiebreakerBreaker.length;
            for (const idx of withoutTiebreakerBreaker) {
                users[idx].displayRank = nextRank;
            }
        } else {
            // No tiebreaker-breakers - all share the same rank
            for (const idx of tieGroupIndices) {
                users[idx].displayRank = startRank;
            }
        }
    }
}

// Create singleton instance
const leaderboardFeedService = new LeaderboardFeedService();
export default leaderboardFeedService;
