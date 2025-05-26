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

const TIEBREAKER_BREAKER_EMOJI = '⚡'; // Lightning bolt for tiebreaker-breaker

const USERS_PER_EMBED = 5; // Clean 5 users per embed - first embed shows top 5 with tiebreaker info

/**
 * Helper function to ensure field values don't exceed Discord's 1024 character limit
 */
function ensureFieldLength(text, maxLength = 1024) {
    if (text.length <= maxLength) {
        return text;
    }
    
    console.warn(`Field text length ${text.length} exceeds Discord limit of ${maxLength}, truncating...`);
    
    // If text is too long, truncate and add notice
    const truncateAt = maxLength - 60; // Leave room for truncation notice
    const truncated = text.substring(0, truncateAt);
    
    // Find the last complete user entry to avoid cutting off mid-entry
    const lastUserEnd = truncated.lastIndexOf('\n\n');
    if (lastUserEnd > 0) {
        return truncated.substring(0, lastUserEnd) + '\n\n*[Use /leaderboard for full view]*';
    }
    
    return truncated + '\n*[Truncated]*';
}

/**
 * Calculate optimal user count per embed based on tiebreaker status
 */
function calculateOptimalUserCount(activeTiebreaker) {
    // Consistent 5 users per embed for clean, predictable pagination
    // First embed shows top 5 (most important with tiebreaker info)
    // Subsequent embeds show 5 more users each
    return 5;
}

class LeaderboardFeedService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.leaderboardFeedChannelId || '1371350718505811989');
        this.alertsChannelId = config.discord.rankAlertsChannelId || this.channelId;
        this.previousDetailedRanks = new Map(); // Enhanced tracking instead of simple previousTopRanks
        
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
    }

    // New method to generate points overview embed
    async generatePointsOverviewEmbed() {
        try {
            const pointsOverviewEmbed = createHeaderEmbed(
                'How to Earn Points in Select Start Community',
                'Complete breakdown of all ways to earn points throughout the year:',
                {
                    color: COLORS.INFO,
                    footer: { text: 'Updates every 15 minutes • Use /help points for detailed information' }
                }
            );

            // Monthly Challenge Points
            pointsOverviewEmbed.addFields({
                name: '🎮 Monthly Challenge (Additive)',
                value: `${EMOJIS.PARTICIPATION} **Participation:** 1 point (earn any achievement)\n` +
                       `${EMOJIS.BEATEN} **Beaten:** +3 points (4 total - includes participation)\n` +
                       `${EMOJIS.MASTERY} **Mastery:** +3 points (7 total - includes participation + beaten)\n\n` +
                       `**⚠️ IMPORTANT:** Must be completed within the challenge month in **Hardcore Mode**!`
            });

            // Shadow Challenge Points
            pointsOverviewEmbed.addFields({
                name: '👥 Shadow Challenge (Additive)',
                value: `${EMOJIS.PARTICIPATION} **Participation:** 1 point (earn any achievement)\n` +
                       `${EMOJIS.BEATEN} **Beaten:** +3 points (4 total - includes participation)\n\n` +
                       `Shadow games are capped at "Beaten" status (4 points maximum)\n` +
                       `**⚠️ IMPORTANT:** Must be completed within the challenge month in **Hardcore Mode**!`
            });

            // Racing Challenge Points
            pointsOverviewEmbed.addFields({
                name: '🏎️ Racing Challenge (Monthly Awards)',
                value: `${EMOJIS.RANK_1} **1st Place:** 3 points\n` +
                       `${EMOJIS.RANK_2} **2nd Place:** 2 points\n` +
                       `${EMOJIS.RANK_3} **3rd Place:** 1 point\n\n` +
                       `New racing challenges start on the 1st of each month. Points awarded at month end.`
            });

            // Arcade Leaderboard Points
            pointsOverviewEmbed.addFields({
                name: '🎮 Arcade Leaderboards (Year-End Awards)',
                value: `${EMOJIS.RANK_1} **1st Place:** 3 points per board\n` +
                       `${EMOJIS.RANK_2} **2nd Place:** 2 points per board\n` +
                       `${EMOJIS.RANK_3} **3rd Place:** 1 point per board\n\n` +
                       `Points awarded December 1st for each arcade board. New boards announced 2nd week of each month.`
            });

            // Arena Battles
            pointsOverviewEmbed.addFields({
                name: '⚔️ Arena Battles (GP Wagering)',
                value: `${EMOJIS.MONEY} **GP System:** Wager Gold Points in head-to-head competitions\n` +
                       `${EMOJIS.SUCCESS} **Monthly Allowance:** 1,000 GP automatically on the 1st\n` +
                       `${EMOJIS.WINNER} **Winner Takes All:** GP transferred from loser to winner\n\n` +
                       `Challenge other members or bet on ongoing battles during first 72 hours.`
            });

            // Commands and Tracking
            pointsOverviewEmbed.addFields({
                name: '📊 Track Your Progress',
                value: `\`/leaderboard\` - Monthly challenge standings\n` +
                       `\`/yearlyboard\` - Annual points leaderboard\n` +
                       `\`/profile [username]\` - Personal achievements and points\n` +
                       `\`/arena\` - Arena battle history and GP balance\n` +
                       `\`/help points\` - Detailed points information`
            });

            return pointsOverviewEmbed;
        } catch (error) {
            console.error('Error generating points overview embed:', error);
            
            // Fallback embed
            return createHeaderEmbed(
                'Points Overview',
                'Use `/help points` for detailed information about earning points in the Select Start Community.',
                {
                    color: COLORS.INFO,
                    footer: { text: 'Updates every 15 minutes' }
                }
            );
        }
            
            // Generate monthly leaderboard embeds
            const { headerEmbed, participantEmbeds, sortedUsers } = await this.generateLeaderboardEmbeds();
            if (!headerEmbed || !participantEmbeds || participantEmbeds.length === 0 || !sortedUsers) {
                console.error('Failed to generate monthly leaderboard embeds');
                return;
            }

            // Generate yearly leaderboard embeds
            const { yearlyHeaderEmbed, yearlyParticipantEmbeds } = await this.generateYearlyLeaderboardEmbeds();

            // Generate points overview embed
            const pointsOverviewEmbed = await this.generatePointsOverviewEmbed();

            // Check for rank changes before updating the message (ENHANCED VERSION)
            if (sortedUsers.length > 0) {
                await this.checkForRankChanges(sortedUsers);
            }

            // Format timestamp using our utility
            const timestamp = getDiscordTimestamp(new Date());
            
            const monthlyHeaderContent = `**Monthly Challenge Leaderboard** • ${timestamp} • Updates every 15 minutes`;
            
            // Calculate how many messages we need in total
            const totalMessagesNeeded = 1 + participantEmbeds.length; // Monthly header + monthly participants
            const yearlyMessagesNeeded = yearlyHeaderEmbed ? (1 + yearlyParticipantEmbeds.length) : 0; // Yearly header + yearly participants
            const pointsOverviewNeeded = 1; // Points overview embed
            const completeMessagesNeeded = totalMessagesNeeded + yearlyMessagesNeeded + pointsOverviewNeeded;

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
                // Update existing messages in proper order
                try {
                    // 1. Update monthly header message
                    await this.updateMessage('monthly_header', { content: monthlyHeaderContent, embeds: [headerEmbed] }, true);
                    
                    // 2. Update monthly participant messages
                    for (let i = 0; i < participantEmbeds.length; i++) {
                        await this.updateMessage(
                            `monthly_participants_${i}`, 
                            { content: '', embeds: [participantEmbeds[i]] }
                        );
                    }
                    
                    // 3. Update yearly messages if they exist
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

                    // 4. Update points overview message
                    await this.updateMessage(
                        'points_overview',
                        { content: '', embeds: [pointsOverviewEmbed] }
                    );
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
                
                // Create new messages in proper order:
                // 1. Create monthly header message
                await this.updateMessage('monthly_header', { content: monthlyHeaderContent, embeds: [headerEmbed] }, true);
                
                // 2. Create monthly participant messages
                for (let i = 0; i < participantEmbeds.length; i++) {
                    await this.updateMessage(
                        `monthly_participants_${i}`, 
                        { content: '', embeds: [participantEmbeds[i]] }
                    );
                }
                
                // 3. Create yearly messages if they exist
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

                // 4. Create points overview message
                await this.updateMessage(
                    'points_overview',
                    { content: '', embeds: [pointsOverviewEmbed] }
                );
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

            // Filter out null entries and sort by THREE-TIER hierarchy: Challenge → Tiebreaker → Tiebreaker-Breaker
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
            let tiebreakerBreakerEntries = [];
            if (activeTiebreaker) {
                try {
                    // Use RetroAPIUtils to fetch leaderboard entries for main tiebreaker
                    tiebreakerEntries = await RetroAPIUtils.getLeaderboardEntries(activeTiebreaker.leaderboardId, 1000);
                    console.log(`Total tiebreaker entries fetched: ${tiebreakerEntries.length}`);

                    // Fetch tiebreaker-breaker data if available
                    if (activeTiebreaker.hasTiebreakerBreaker()) {
                        try {
                            const tiebreakerBreakerInfo = activeTiebreaker.getTiebreakerBreakerInfo();
                            console.log(`Fetching tiebreaker-breaker entries for leaderboard ${tiebreakerBreakerInfo.leaderboardId}`);
                            
                            // Use RetroAPIUtils to fetch tiebreaker-breaker entries
                            tiebreakerBreakerEntries = await RetroAPIUtils.getLeaderboardEntries(tiebreakerBreakerInfo.leaderboardId, 1000);
                            console.log(`Total tiebreaker-breaker entries fetched: ${tiebreakerBreakerEntries.length}`);
                        } catch (tbError) {
                            console.error('Error fetching tiebreaker-breaker leaderboard:', tbError);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching tiebreaker leaderboard:', error);
                }
            }

            // Process tiebreaker and tiebreaker-breaker data, then assign ranks
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

            // Add tiebreaker info if active
            if (activeTiebreaker) {
                headerEmbed.addFields({
                    name: 'Active Tiebreaker',
                    value: `⚔️ **${activeTiebreaker.gameTitle}**\n` +
                           `*Tiebreaker results are used to determine final ranking for tied users in top positions.*` +
                           (activeTiebreaker.hasTiebreakerBreaker() ? 
                               `\n${TIEBREAKER_BREAKER_EMOJI} **Tiebreaker-Breaker:** ${activeTiebreaker.getTiebreakerBreakerInfo().gameTitle}\n` +
                               `*Used to resolve ties within the tiebreaker itself.*` : '')
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

            // Create participant embeds (one for each group of users)
            const participantEmbeds = [];
            const usersPerPage = calculateOptimalUserCount(activeTiebreaker);
            const totalPages = Math.ceil(workingSorted.length / usersPerPage);
            
            for (let page = 0; page < totalPages; page++) {
                // Get users for this page
                const startIndex = page * usersPerPage;
                const endIndex = Math.min((page + 1) * usersPerPage, workingSorted.length);
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
                
                // Format leaderboard text for this page
                let leaderboardText = '';
                
                for (const user of usersOnPage) {
                    // Use the pre-calculated displayRank
                    const rankEmoji = user.displayRank <= 3 ? EMOJIS[`RANK_${user.displayRank}`] : `#${user.displayRank}`;
                    
                    // Add the main user entry to leaderboard with link to profile
                    leaderboardText += `${rankEmoji} **[${user.username}](https://retroachievements.org/user/${user.username})** ${user.award}\n`;
                    
                    // Add the achievement stats
                    leaderboardText += `${user.achieved}/${currentChallenge.monthly_challange_game_total} (${user.percentage}%)\n`;
                    
                    // Show tiebreaker and tiebreaker-breaker scores only for top 5
                    if (user.displayRank <= 5) {
                        if (user.hasTiebreaker && user.tiebreakerScore) {
                            leaderboardText += `⚔️ ${user.tiebreakerScore} in ${user.tiebreakerGame}\n`;
                        }
                        
                        if (user.hasTiebreakerBreaker && user.tiebreakerBreakerScore) {
                            leaderboardText += `${TIEBREAKER_BREAKER_EMOJI} ${user.tiebreakerBreakerScore} in ${user.tiebreakerBreakerGame}\n`;
                        }
                    }
                    
                    leaderboardText += '\n';
                }
                
                participantEmbed.addFields({
                    name: `Rankings ${startIndex + 1}-${endIndex} (${workingSorted.length} total participants)`,
                    value: ensureFieldLength(leaderboardText) || 'No rankings available.'
                });
                
                participantEmbeds.push(participantEmbed);
            }

            return { headerEmbed, participantEmbeds, sortedUsers: workingSorted };
        } catch (error) {
            console.error('Error generating leaderboard embeds:', error);
            return { headerEmbed: null, participantEmbeds: null, sortedUsers: null };
        }
    }

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
            const YEARLY_USERS_PER_PAGE = 5; // Consistent 5 users per page
            const yearlyParticipantEmbeds = [];
            const totalPages = Math.ceil(userPoints.length / YEARLY_USERS_PER_PAGE);
            
            for (let page = 0; page < totalPages; page++) {
                // Get users for this page
                const startIndex = page * YEARLY_USERS_PER_PAGE;
                const endIndex = Math.min((page + 1) * YEARLY_USERS_PER_PAGE, userPoints.length);
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
                let pointSystemText = '✨ Mastery: 7pts | ⭐ Beaten: 4pts | 🏁 Participation: 1pt | Shadow max: 4pts';
                
                participantEmbed.addFields({
                    name: 'Point System',
                    value: pointSystemText
                });
                
                yearlyParticipantEmbeds.push(participantEmbed);
            }
            
            return { yearlyHeaderEmbed, yearlyParticipantEmbeds };
        } catch (error) {
            console.error('Error generating yearly leaderboard embeds:', error);
            return { yearlyHeaderEmbed: null, yearlyParticipantEmbeds: null };
        }
    }

    // ==========================================
    // ENHANCED CHANGE DETECTION SYSTEM
    // ==========================================

    // Enhanced method to check for rank changes including tiebreaker nuances
    async checkForRankChanges(currentRanks) {
        try {
            if (!this.previousDetailedRanks.size) {
                this.storeDetailedRanks(currentRanks);
                return;
            }

            const alerts = [];
            const topUsers = currentRanks.filter(user => user.displayRank <= 5);
            
            if (topUsers.length === 0) return;

            // Enhanced change detection
            for (const user of topUsers) {
                const currentState = this.getUserState(user);
                const previousState = this.previousDetailedRanks.get(user.username);
                
                if (!previousState) {
                    // New user in top 5
                    if (user.displayRank <= 3) {
                        alerts.push({
                            type: 'newEntry',
                            user: { username: user.username, discordId: user.discordId },
                            newRank: user.displayRank,
                            reason: this.determineChangeReason(null, currentState)
                        });
                    }
                    continue;
                }

                // Detect various types of changes
                const changeInfo = this.analyzeRankChange(previousState, currentState);
                
                if (changeInfo.hasChange) {
                    alerts.push({
                        type: changeInfo.type,
                        user: { username: user.username, discordId: user.discordId },
                        previousRank: previousState.displayRank,
                        newRank: currentState.displayRank,
                        reason: changeInfo.reason,
                        details: changeInfo.details,
                        previousState,
                        currentState
                    });
                }
            }

            // Check for users who fell out of top 5
            for (const [username, previousState] of this.previousDetailedRanks.entries()) {
                if (previousState.displayRank <= 5) {
                    const currentUser = currentRanks.find(u => u.username === username);
                    if (!currentUser || currentUser.displayRank > 5) {
                        alerts.push({
                            type: 'fallOut',
                            user: { username, discordId: previousState.discordId },
                            previousRank: previousState.displayRank,
                            newRank: currentUser?.displayRank || 'Outside Top 5'
                        });
                    }
                }
            }

            if (alerts.length > 0) {
                await this.sendEnhancedRankChangeAlerts(alerts, currentRanks);
            }

            this.storeDetailedRanks(currentRanks);
        } catch (error) {
            console.error('Error in enhanced rank change detection:', error);
        }
    }

    // Create detailed state object for a user
    getUserState(user) {
        return {
            username: user.username,
            discordId: user.discordId,
            displayRank: user.displayRank,
            achieved: user.achieved,
            percentage: user.percentage,
            points: user.points,
            award: user.award,
            
            // Tiebreaker information
            hasTiebreaker: user.hasTiebreaker || false,
            tiebreakerRank: user.tiebreakerRank || null,
            tiebreakerScore: user.tiebreakerScore || null,
            tiebreakerGame: user.tiebreakerGame || null,
            
            // Tiebreaker-breaker information
            hasTiebreakerBreaker: user.hasTiebreakerBreaker || false,
            tiebreakerBreakerRank: user.tiebreakerBreakerRank || null,
            tiebreakerBreakerScore: user.tiebreakerBreakerScore || null,
            tiebreakerBreakerGame: user.tiebreakerBreakerGame || null,
            
            // Internal sort position for detecting subtle changes
            sortIndex: user.originalIndex || 0
        };
    }

    // Analyze the type and reason for rank changes
    analyzeRankChange(previousState, currentState) {
        // No change if everything is identical
        if (this.statesAreIdentical(previousState, currentState)) {
            return { hasChange: false };
        }

        let changeType = 'update';
        let reason = 'Unknown';
        let details = {};

        // Display rank changed
        if (previousState.displayRank !== currentState.displayRank) {
            if (currentState.displayRank < previousState.displayRank) {
                changeType = 'overtake';
                reason = this.determineChangeReason(previousState, currentState);
            } else {
                changeType = 'fallBack';
                reason = 'Fell behind in the rankings';
            }
        }
        // Same display rank but internal changes
        else {
            // Check for achievement progress
            if (currentState.achieved > previousState.achieved) {
                changeType = 'achievement_progress';
                reason = `Earned ${currentState.achieved - previousState.achieved} more achievement(s)`;
            }
            // Check for tiebreaker changes
            else if (this.hasTiebreakerChange(previousState, currentState)) {
                changeType = 'tiebreaker_change';
                reason = this.describeTiebreakerChange(previousState, currentState);
            }
            // Check for award status change
            else if (previousState.award !== currentState.award) {
                changeType = 'award_change';
                reason = `Achievement status changed: ${currentState.award}`;
            }
        }

        return {
            hasChange: true,
            type: changeType,
            reason,
            details
        };
    }

    // Determine the reason for a rank change
    determineChangeReason(previousState, currentState) {
        if (!previousState) {
            return `Entered top rankings with ${currentState.achieved} achievements`;
        }

        // Achievement progress
        if (currentState.achieved > previousState.achieved) {
            const newAchievements = currentState.achieved - previousState.achieved;
            return `Earned ${newAchievements} new achievement(s)`;
        }

        // Award status change
        if (previousState.award !== currentState.award) {
            return `Achievement status improved: ${currentState.award}`;
        }

        // Tiebreaker improvement
        if (this.hasTiebreakerImprovement(previousState, currentState)) {
            return this.describeTiebreakerChange(previousState, currentState);
        }

        return 'Ranking position updated';
    }

    // Check if there's a tiebreaker-related change
    hasTiebreakerChange(previous, current) {
        // New tiebreaker participation
        if (!previous.hasTiebreaker && current.hasTiebreaker) return true;
        if (!previous.hasTiebreakerBreaker && current.hasTiebreakerBreaker) return true;

        // Tiebreaker rank changes
        if (previous.tiebreakerRank !== current.tiebreakerRank) return true;
        if (previous.tiebreakerBreakerRank !== current.tiebreakerBreakerRank) return true;

        // Score changes (even if rank stays same)
        if (previous.tiebreakerScore !== current.tiebreakerScore) return true;
        if (previous.tiebreakerBreakerScore !== current.tiebreakerBreakerScore) return true;

        return false;
    }

    // Check if tiebreaker improved (rank got better)
    hasTiebreakerImprovement(previous, current) {
        if (current.hasTiebreaker && previous.hasTiebreaker) {
            if (current.tiebreakerRank < previous.tiebreakerRank) return true;
        }
        
        if (current.hasTiebreakerBreaker && previous.hasTiebreakerBreaker) {
            if (current.tiebreakerBreakerRank < previous.tiebreakerBreakerRank) return true;
        }

        return false;
    }

    // Describe tiebreaker changes in human-readable form
    describeTiebreakerChange(previous, current) {
        let description = '';

        // New tiebreaker participation
        if (!previous.hasTiebreaker && current.hasTiebreaker) {
            description += `Joined tiebreaker in ${current.tiebreakerGame}`;
        }
        // Tiebreaker rank improvement
        else if (current.hasTiebreaker && previous.hasTiebreaker && 
                 current.tiebreakerRank < previous.tiebreakerRank) {
            description += `Improved tiebreaker rank from #${previous.tiebreakerRank} to #${current.tiebreakerRank}`;
        }

        // Tiebreaker-breaker changes
        if (!previous.hasTiebreakerBreaker && current.hasTiebreakerBreaker) {
            if (description) description += ' and ';
            description += `joined tiebreaker-breaker in ${current.tiebreakerBreakerGame}`;
        }
        else if (current.hasTiebreakerBreaker && previous.hasTiebreakerBreaker && 
                 current.tiebreakerBreakerRank < previous.tiebreakerBreakerRank) {
            if (description) description += ' and ';
            description += `improved tiebreaker-breaker rank from #${previous.tiebreakerBreakerRank} to #${current.tiebreakerBreakerRank}`;
        }

        return description || 'Tiebreaker position updated';
    }

    // Check if two states are completely identical
    statesAreIdentical(state1, state2) {
        const keys = [
            'displayRank', 'achieved', 'percentage', 'points', 'award',
            'hasTiebreaker', 'tiebreakerRank', 'tiebreakerScore',
            'hasTiebreakerBreaker', 'tiebreakerBreakerRank', 'tiebreakerBreakerScore'
        ];

        return keys.every(key => state1[key] === state2[key]);
    }

    // Store detailed state for all top users
    storeDetailedRanks(ranks) {
        this.previousDetailedRanks.clear();
        
        for (const user of ranks) {
            if (user.displayRank <= 7) { // Store top 7 to catch movements in/out of top 5
                this.previousDetailedRanks.set(user.username, this.getUserState(user));
            }
        }
    }

    // Enhanced alert sending with more detailed information
    async sendEnhancedRankChangeAlerts(alerts, currentRanks) {
        try {
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            if (!currentChallenge) return;

            const monthName = now.toLocaleString('default', { month: 'long' });

            // Group alerts by type for better messaging
            const groupedAlerts = {
                overtake: alerts.filter(a => a.type === 'overtake'),
                newEntry: alerts.filter(a => a.type === 'newEntry'),
                tiebreakerChange: alerts.filter(a => a.type === 'tiebreaker_change'),
                achievementProgress: alerts.filter(a => a.type === 'achievement_progress'),
                other: alerts.filter(a => !['overtake', 'newEntry', 'tiebreaker_change', 'achievement_progress'].includes(a.type))
            };

            // Create enhanced alert message
            const changes = [];
            
            // Process different types of changes
            for (const alert of groupedAlerts.overtake) {
                changes.push({
                    username: alert.user.username,
                    newRank: alert.newRank,
                    reason: alert.reason,
                    type: 'overtake'
                });
            }

            for (const alert of groupedAlerts.newEntry) {
                changes.push({
                    username: alert.user.username,
                    newRank: alert.newRank,
                    reason: alert.reason,
                    type: 'newEntry'
                });
            }

            // Include significant tiebreaker changes even if rank didn't change
            for (const alert of groupedAlerts.tiebreakerChange) {
                if (alert.currentState.displayRank <= 3) { // Only for top 3
                    changes.push({
                        username: alert.user.username,
                        newRank: alert.newRank,
                        reason: `🔥 ${alert.reason}`,
                        type: 'tiebreaker'
                    });
                }
            }

            // Get current standings with enhanced formatting
            const currentStandings = this.formatEnhancedStandings(currentRanks, currentChallenge);

            // Get thumbnail URL
            let thumbnailUrl = null;
            if (currentChallenge.monthly_game_icon_url) {
                thumbnailUrl = `https://retroachievements.org${currentChallenge.monthly_game_icon_url}`;
            }

            // Send enhanced alert
            await AlertUtils.sendPositionChangeAlert({
                title: `📊 ${monthName} Challenge Update!`,
                description: `The leaderboard for **${currentChallenge.monthly_challange_title || 'the monthly challenge'}** has been updated with enhanced tracking!`,
                changes: changes,
                currentStandings: currentStandings,
                thumbnail: thumbnailUrl,
                color: COLORS.INFO,
                footer: { 
                    text: 'Enhanced alerts now track tiebreaker changes • Data from RetroAchievements • Updates every 15 minutes' 
                }
            }, 'monthly');
            
            console.log(`Sent enhanced monthly challenge alert with ${changes.length} changes detected`);
        } catch (error) {
            console.error('Error sending enhanced rank change alerts:', error);
        }
    }

    // Format current standings with enhanced tiebreaker information
    formatEnhancedStandings(sortedUsers, currentChallenge) {
        const standings = [];
        const topFive = sortedUsers.slice(0, 5);
        
        for (const user of topFive) {
            let scoreText = `${user.achieved}/${currentChallenge.monthly_challange_game_total} achievements (${user.percentage}%)`;
            
            // Enhanced tiebreaker display
            if (user.hasTiebreaker && user.tiebreakerScore) {
                scoreText += `\n⚔️ Tiebreaker: #${user.tiebreakerRank} - ${user.tiebreakerScore} in ${user.tiebreakerGame}`;
            }
            
            if (user.hasTiebreakerBreaker && user.tiebreakerBreakerScore) {
                scoreText += `\n⚡ TB-Breaker: #${user.tiebreakerBreakerRank} - ${user.tiebreakerBreakerScore} in ${user.tiebreakerBreakerGame}`;
            }
            
            standings.push({
                username: user.username,
                rank: user.displayRank,
                score: scoreText
            });
        }
        
        return standings;
    }

    // ==========================================
    // EXISTING RANK ASSIGNMENT SYSTEM (UNCHANGED)
    // ==========================================

    // Updated assignRanks method to handle tiebreaker-breaker with THREE-TIER hierarchy
    assignRanks(users, tiebreakerEntries, tiebreakerBreakerEntries, activeTiebreaker) {
        if (!users || users.length === 0) return;

        // First, add tiebreaker info to users
        if (tiebreakerEntries && tiebreakerEntries.length > 0) {
            for (const user of users) {
                const entry = tiebreakerEntries.find(e => 
                    e.User?.toLowerCase() === user.username.toLowerCase()
                );
                
                if (entry) {
                    user.tiebreakerScore = entry.FormattedScore;
                    user.tiebreakerRank = entry.Rank;
                    user.tiebreakerGame = activeTiebreaker.gameTitle;
                    user.hasTiebreaker = true;
                } else {
                    user.hasTiebreaker = false;
                }
            }
        }

        // Add tiebreaker-breaker info to users
        if (tiebreakerBreakerEntries && tiebreakerBreakerEntries.length > 0) {
            const tiebreakerBreakerInfo = activeTiebreaker.getTiebreakerBreakerInfo();
            for (const user of users) {
                const entry = tiebreakerBreakerEntries.find(e => 
                    e.User?.toLowerCase() === user.username.toLowerCase()
                );
                
                if (entry) {
                    user.tiebreakerBreakerScore = entry.FormattedScore;
                    user.tiebreakerBreakerRank = entry.Rank;
                    user.tiebreakerBreakerGame = tiebreakerBreakerInfo.gameTitle;
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

        // Identify tied groups and assign ranks based on THREE-TIER HIERARCHY
        let currentRank = 1;
        let lastAchieved = -1;
        let lastPoints = -1;
        let currentTieGroup = [];
        let tieGroupStartIdx = 0;

        // First pass: identify tie groups based on challenge performance
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            // Check if this user is tied with the previous user in CHALLENGE performance
            if (i > 0 && user.achieved === lastAchieved && user.points === lastPoints) {
                // Add to current tie group
                currentTieGroup.push(i);
            } else {
                // Process previous tie group if it exists
                if (currentTieGroup.length > 1) {
                    // This is a tie group - handle it with tiebreaker hierarchy
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

    // Helper method to process a tie group with THREE-TIER hierarchy
    processTieGroup(users, tieGroupIndices, startIdx) {
        // Only apply special tiebreaker logic to top 5 positions
        const isTopFive = startIdx < 5;
        
        if (isTopFive) {
            // Separate users by tiebreaker participation
            const withTiebreaker = tieGroupIndices.filter(idx => users[idx].hasTiebreaker);
            const withoutTiebreaker = tieGroupIndices.filter(idx => !users[idx].hasTiebreaker);
            
            if (withTiebreaker.length > 0) {
                // First, sort by tiebreaker rank (TIER 2)
                withTiebreaker.sort((a, b) => users[a].tiebreakerRank - users[b].tiebreakerRank);
                
                // Now check for ties within the tiebreaker and use tiebreaker-breaker (TIER 3)
                let currentTbRank = users[withTiebreaker[0]].tiebreakerRank;
                let currentTbGroup = [];
                let nextAvailableRank = startIdx + 1;
                
                for (let i = 0; i < withTiebreaker.length; i++) {
                    const userIdx = withTiebreaker[i];
                    const user = users[userIdx];
                    
                    if (i > 0 && user.tiebreakerRank !== currentTbRank) {
                        // Process the previous tiebreaker group
                        if (currentTbGroup.length > 1) {
                            // Multiple users tied in tiebreaker - use tiebreaker-breaker
                            this.processTiebreakerBreakerGroup(users, currentTbGroup, nextAvailableRank);
                            nextAvailableRank += currentTbGroup.length;
                        } else {
                            // Single user, assign rank
                            users[currentTbGroup[0]].displayRank = nextAvailableRank;
                            nextAvailableRank++;
                        }
                        
                        // Start new group
                        currentTbGroup = [userIdx];
                        currentTbRank = user.tiebreakerRank;
                    } else {
                        // Add to current group
                        currentTbGroup.push(userIdx);
                    }
                }
                
                // Process the last tiebreaker group
                if (currentTbGroup.length > 1) {
                    this.processTiebreakerBreakerGroup(users, currentTbGroup, nextAvailableRank);
                    nextAvailableRank += currentTbGroup.length;
                } else if (currentTbGroup.length === 1) {
                    users[currentTbGroup[0]].displayRank = nextAvailableRank;
                    nextAvailableRank++;
                }
                
                // All users without tiebreakers share the next rank
                for (const idx of withoutTiebreaker) {
                    users[idx].displayRank = nextAvailableRank;
                }
            } else {
                // No tiebreakers - all share the same rank
                for (const idx of tieGroupIndices) {
                    users[idx].displayRank = startIdx + 1;
                }
            }
        } else {
            // Outside top 5: all users in tie group share the same rank
            for (const idx of tieGroupIndices) {
                users[idx].displayRank = startIdx + 1;
            }
        }
    }

    // Method to handle tiebreaker-breaker group processing (TIER 3)
    processTiebreakerBreakerGroup(users, tieGroupIndices, startRank) {
        // Separate users by tiebreaker-breaker participation
        const withTiebreakerBreaker = tieGroupIndices.filter(idx => users[idx].hasTiebreakerBreaker);
        const withoutTiebreakerBreaker = tieGroupIndices.filter(idx => !users[idx].hasTiebreakerBreaker);
        
        if (withTiebreakerBreaker.length > 0) {
            // Sort by tiebreaker-breaker rank
            withTiebreakerBreaker.sort((a, b) => users[a].tiebreakerBreakerRank - users[b].tiebreakerBreakerRank);
            
            // Assign individual ranks
            for (let i = 0; i < withTiebreakerBreaker.length; i++) {
                users[withTiebreakerBreaker[i]].displayRank = startRank + i;
            }
            
            // Users without tiebreaker-breaker share the next rank
            const nextRank = startRank + withTiebreakerBreaker.length;
            for (const idx of withoutTiebreakerBreaker) {
                users[idx].displayRank = nextRank;
            }
        } else {
            // No tiebreaker-breaker scores - all share the same rank
            for (const idx of tieGroupIndices) {
                users[idx].displayRank = startRank;
            }
        }
    }
}

// Create singleton instance
const leaderboardFeedService = new LeaderboardFeedService();
export default leaderboardFeedService;
