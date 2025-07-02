// src/services/leaderboardFeedService.js - STREAMLINED and DRY-compliant
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { ArcadeBoard } from '../models/ArcadeBoard.js';
import { config } from '../config/config.js';
import { FeedManagerBase } from '../utils/FeedManagerBase.js';
import { COLORS, EMOJIS, createHeaderEmbed, getDiscordTimestamp } from '../utils/FeedUtils.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertService from '../utils/AlertService.js';

const UPDATE_INTERVAL = 15 * 60 * 1000;
const AWARD_EMOJIS = {
    MASTERY: EMOJIS.MASTERY,
    BEATEN: EMOJIS.BEATEN,
    PARTICIPATION: EMOJIS.PARTICIPATION
};
const TIEBREAKER_BREAKER_EMOJI = '⚡';
const USERS_PER_EMBED = 5;

class LeaderboardFeedService extends FeedManagerBase {
    constructor() {
        super(null, config.discord.leaderboardFeedChannelId || '1371350718505811989');
        this.previousDetailedRanks = new Map();
        this.lastAlertTime = new Map();
        this.alertCooldown = 5 * 60 * 1000;
        this.globalAlertCooldown = 60 * 60 * 1000;
        this.lastGlobalAlertTime = 0;
    }

    async start() {
        await super.start(UPDATE_INTERVAL);
    }

    setClient(client) {
        super.setClient(client);
        AlertService.setClient(client);
    }

    async update() {
        await this.updateLeaderboard();
    }

    async updateLeaderboard() {
        try {
            const channel = await this.getChannel();
            if (!channel) {
                console.error('Leaderboard feed channel not found');
                return;
            }
            
            const { headerEmbed, participantEmbeds, sortedUsers } = await this.generateLeaderboardEmbeds();
            if (!headerEmbed || !participantEmbeds) {
                console.error('Failed to generate leaderboard embeds');
                return;
            }

            const { yearlyHeaderEmbed, yearlyParticipantEmbeds } = await this.generateYearlyLeaderboardEmbeds();
            const pointsOverviewEmbed = this.generatePointsOverviewEmbed();

            if (sortedUsers?.length > 0) {
                await this.checkForRankChanges(sortedUsers);
            }

            await this.updateAllMessages(headerEmbed, participantEmbeds, yearlyHeaderEmbed, yearlyParticipantEmbeds, pointsOverviewEmbed);
        } catch (error) {
            console.error('Error updating leaderboard:', error);
        }
    }

    async updateAllMessages(headerEmbed, participantEmbeds, yearlyHeaderEmbed, yearlyParticipantEmbeds, pointsOverviewEmbed) {
        const timestamp = getDiscordTimestamp(new Date());
        const monthlyHeaderContent = `**Monthly Challenge Leaderboard** • ${timestamp} • Updates every 15 minutes`;
        
        const totalMessagesNeeded = 1 + participantEmbeds.length + 
            (yearlyHeaderEmbed ? 1 + yearlyParticipantEmbeds.length : 0) + 1;

        this.addFootersToEmbeds(participantEmbeds, yearlyParticipantEmbeds, headerEmbed);

        if (this.messageIds.size === totalMessagesNeeded) {
            try {
                await this.updateExistingMessages(monthlyHeaderContent, headerEmbed, participantEmbeds, yearlyHeaderEmbed, yearlyParticipantEmbeds, pointsOverviewEmbed);
            } catch (error) {
                console.error('Error updating existing messages:', error);
                this.messageIds.clear();
            }
        }
        
        if (this.messageIds.size !== totalMessagesNeeded) {
            await this.recreateAllMessages(monthlyHeaderContent, headerEmbed, participantEmbeds, yearlyHeaderEmbed, yearlyParticipantEmbeds, pointsOverviewEmbed);
        }
    }

    addFootersToEmbeds(participantEmbeds, yearlyParticipantEmbeds, headerEmbed) {
        if (participantEmbeds.length > 0) {
            const footerText = 'Updates every 15 minutes • Use /help points for more information';
            const iconURL = headerEmbed.data.thumbnail?.url || null;
            
            participantEmbeds[0].setFooter({
                text: `Group 1/${participantEmbeds.length} • ${footerText}`,
                iconURL
            });
            
            if (participantEmbeds.length > 1) {
                participantEmbeds[participantEmbeds.length - 1].setFooter({
                    text: `Group ${participantEmbeds.length}/${participantEmbeds.length} • ${footerText}`,
                    iconURL
                });
            }
        }
        
        if (yearlyParticipantEmbeds?.length > 0) {
            const footerText = 'Updates every 15 minutes • Use /help points for more information';
            
            yearlyParticipantEmbeds[0].setFooter({
                text: `Group 1/${yearlyParticipantEmbeds.length} • ${footerText}`
            });
            
            if (yearlyParticipantEmbeds.length > 1) {
                yearlyParticipantEmbeds[yearlyParticipantEmbeds.length - 1].setFooter({
                    text: `Group ${yearlyParticipantEmbeds.length}/${yearlyParticipantEmbeds.length} • ${footerText}`
                });
            }
        }
    }

    async updateExistingMessages(monthlyHeaderContent, headerEmbed, participantEmbeds, yearlyHeaderEmbed, yearlyParticipantEmbeds, pointsOverviewEmbed) {
        await this.updateMessage('monthly_header', { content: monthlyHeaderContent, embeds: [headerEmbed] }, true);
        
        for (let i = 0; i < participantEmbeds.length; i++) {
            await this.updateMessage(`monthly_participants_${i}`, { content: '', embeds: [participantEmbeds[i]] });
        }
        
        if (yearlyHeaderEmbed) {
            await this.updateMessage('yearly_header', { content: '**Yearly Leaderboard**', embeds: [yearlyHeaderEmbed] });
            
            for (let i = 0; i < yearlyParticipantEmbeds.length; i++) {
                await this.updateMessage(`yearly_participants_${i}`, { content: '', embeds: [yearlyParticipantEmbeds[i]] });
            }
        }

        await this.updateMessage('points_overview', { content: '', embeds: [pointsOverviewEmbed] });
    }

    async recreateAllMessages(monthlyHeaderContent, headerEmbed, participantEmbeds, yearlyHeaderEmbed, yearlyParticipantEmbeds, pointsOverviewEmbed) {
        await this.clearChannel();
        
        await this.updateMessage('monthly_header', { content: monthlyHeaderContent, embeds: [headerEmbed] }, true);
        
        for (let i = 0; i < participantEmbeds.length; i++) {
            await this.updateMessage(`monthly_participants_${i}`, { content: '', embeds: [participantEmbeds[i]] });
        }
        
        if (yearlyHeaderEmbed) {
            await this.updateMessage('yearly_header', { content: '**Yearly Leaderboard**', embeds: [yearlyHeaderEmbed] });
            
            for (let i = 0; i < yearlyParticipantEmbeds.length; i++) {
                await this.updateMessage(`yearly_participants_${i}`, { content: '', embeds: [yearlyParticipantEmbeds[i]] });
            }
        }

        await this.updateMessage('points_overview', { content: '', embeds: [pointsOverviewEmbed] });
    }

    generatePointsOverviewEmbed() {
        const embed = createHeaderEmbed(
            'How to Earn Points in Select Start Community',
            'Complete breakdown of all ways to earn points throughout the year:',
            {
                color: COLORS.INFO,
                footer: { text: 'Updates every 15 minutes • Use /help points for detailed information' }
            }
        );

        const pointsFields = [
            {
                name: '🎮 Monthly Challenge (Additive)',
                value: `${EMOJIS.PARTICIPATION} **Participation:** 1 point (earn any achievement)\n` +
                       `${EMOJIS.BEATEN} **Beaten:** +3 points (4 total - includes participation)\n` +
                       `${EMOJIS.MASTERY} **Mastery:** +3 points (7 total - includes participation + beaten)\n\n` +
                       `**⚠️ IMPORTANT:** Must be completed within the challenge month in **Hardcore Mode**!`
            },
            {
                name: '👥 Shadow Challenge (Additive)',
                value: `${EMOJIS.PARTICIPATION} **Participation:** 1 point (earn any achievement)\n` +
                       `${EMOJIS.BEATEN} **Beaten:** +3 points (4 total - includes participation)\n\n` +
                       `Shadow games are capped at "Beaten" status (4 points maximum)\n` +
                       `**⚠️ IMPORTANT:** Must be completed within the challenge month in **Hardcore Mode**!`
            },
            {
                name: '🏎️ Racing Challenge (Monthly Awards)',
                value: `${EMOJIS.RANK_1} **1st Place:** 3 points\n` +
                       `${EMOJIS.RANK_2} **2nd Place:** 2 points\n` +
                       `${EMOJIS.RANK_3} **3rd Place:** 1 point\n\n` +
                       `New racing challenges start on the 1st of each month. Points awarded at month end.`
            },
            {
                name: '🎮 Arcade Leaderboards (Year-End Awards)',
                value: `${EMOJIS.RANK_1} **1st Place:** 3 points per board\n` +
                       `${EMOJIS.RANK_2} **2nd Place:** 2 points per board\n` +
                       `${EMOJIS.RANK_3} **3rd Place:** 1 point per board\n\n` +
                       `Points awarded December 1st for each arcade board. New boards announced 2nd week of each month.`
            },
            {
                name: '⚔️ Arena Battles (GP Wagering)',
                value: `${EMOJIS.MONEY} **GP System:** Wager Gold Points in head-to-head competitions\n` +
                       `${EMOJIS.SUCCESS} **Monthly Allowance:** 1,000 GP automatically on the 1st\n` +
                       `${EMOJIS.WINNER} **Winner Takes All:** GP transferred from loser to winner\n\n` +
                       `Challenge other members or bet on ongoing battles during first 72 hours.`
            },
            {
                name: '📊 Track Your Progress',
                value: `\`/leaderboard\` - Monthly challenge standings\n` +
                       `\`/yearlyboard\` - Annual points leaderboard\n` +
                       `\`/profile [username]\` - Personal achievements and points\n` +
                       `\`/arena\` - Arena battle history and GP balance\n` +
                       `\`/help points\` - Detailed points information`
            }
        ];

        embed.addFields(pointsFields);
        return embed;
    }

    isDateInCurrentMonth(dateString) {
        const inputDate = new Date(dateString);
        const currentDate = new Date();
        
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0);
        const lastDayOfPrevMonth = new Date(firstDayOfMonth);
        lastDayOfPrevMonth.setDate(0);
        lastDayOfPrevMonth.setHours(23, 59, 59, 999);
        
        const isLastDayOfPrevMonth = inputDate.getFullYear() === lastDayOfPrevMonth.getFullYear() &&
                                    inputDate.getMonth() === lastDayOfPrevMonth.getMonth() &&
                                    inputDate.getDate() === lastDayOfPrevMonth.getDate();
        
        const isCurrentMonth = inputDate.getFullYear() === currentDate.getFullYear() &&
                            inputDate.getMonth() === currentDate.getMonth();
        
        return isCurrentMonth || isLastDayOfPrevMonth;
    }

    async getCurrentChallenge() {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        return await Challenge.findOne({
            date: { $gte: currentMonthStart, $lt: nextMonthStart }
        });
    }

    async getGameInfoForChallenge(challenge) {
        let gameTitle = challenge.monthly_game_title;
        let gameImageUrl = challenge.monthly_game_icon_url;

        if (!gameTitle || !gameImageUrl) {
            try {
                const gameInfo = await RetroAPIUtils.getGameInfo(challenge.monthly_challange_gameid);
                gameTitle = gameInfo.title;
                gameImageUrl = gameInfo.imageIcon;
                
                if (gameInfo) {
                    challenge.monthly_game_title = gameTitle;
                    challenge.monthly_game_icon_url = gameImageUrl;
                    challenge.monthly_game_console = gameInfo.consoleName;
                    await challenge.save();
                }
            } catch (error) {
                console.error('Error fetching game info:', error);
            }
        }

        return { gameTitle, gameImageUrl };
    }

    async processUserProgress(challenge) {
        const users = await User.find({});
        
        const userProgress = await Promise.all(users.map(async (user) => {
            try {
                const progress = await RetroAPIUtils.getUserGameProgress(
                    user.raUsername,
                    challenge.monthly_challange_gameid
                );

                if (progress.numAwardedToUser === 0) return null;

                const achievementsEarnedThisMonth = Object.entries(progress.achievements)
                    .filter(([id, data]) => data.hasOwnProperty('dateEarned') && this.isDateInCurrentMonth(data.dateEarned))
                    .map(([id, data]) => id);
                
                if (achievementsEarnedThisMonth.length === 0) return null;

                const { award, points } = this.calculateAwardAndPoints(
                    achievementsEarnedThisMonth, 
                    challenge
                );

                return {
                    user,
                    username: user.raUsername,
                    discordId: user.discordId,
                    achieved: achievementsEarnedThisMonth.length,
                    percentage: (achievementsEarnedThisMonth.length / challenge.monthly_challange_game_total * 100).toFixed(2),
                    award,
                    points,
                    earnedThisMonth: achievementsEarnedThisMonth.length
                };
            } catch (error) {
                console.error(`Error processing user progress for ${user.raUsername}:`, error);
                return null;
            }
        }));

        return userProgress
            .filter(progress => progress !== null)
            .sort((a, b) => {
                if (b.achieved !== a.achieved) return b.achieved - a.achieved;
                if (a.percentage == 100.00 && b.percentage == 100.00) return 0;
                return b.points - a.points;
            });
    }

    calculateAwardAndPoints(achievementsEarnedThisMonth, challenge) {
        const hasAllAchievements = achievementsEarnedThisMonth.length === challenge.monthly_challange_game_total;

        if (achievementsEarnedThisMonth.length > 0 && hasAllAchievements) {
            return { award: AWARD_EMOJIS.MASTERY, points: 7 };
        }

        const progressionAchievements = challenge.monthly_challange_progression_achievements || [];
        const winAchievements = challenge.monthly_challange_win_achievements || [];
        
        const earnedProgressionInMonth = progressionAchievements.filter(id => 
            achievementsEarnedThisMonth.includes(id)
        );
        const earnedWinInMonth = winAchievements.filter(id => 
            achievementsEarnedThisMonth.includes(id)
        );

        const hasAllProgression = earnedProgressionInMonth.length === progressionAchievements.length;
        const hasRequiredWin = winAchievements.length === 0 || earnedWinInMonth.length > 0;
        const hasEarnedThisMonth = earnedProgressionInMonth.length > 0 || earnedWinInMonth.length > 0;

        if (hasAllProgression && hasRequiredWin && hasEarnedThisMonth) {
            return { award: AWARD_EMOJIS.BEATEN, points: 4 };
        }

        return { award: AWARD_EMOJIS.PARTICIPATION, points: 1 };
    }

    async getTiebreakerData() {
        const now = new Date();
        const activeTiebreaker = await ArcadeBoard.findOne({
            boardType: 'tiebreaker',
            startDate: { $lte: now },
            endDate: { $gte: now }
        });

        if (!activeTiebreaker) return { activeTiebreaker: null, tiebreakerEntries: [], tiebreakerBreakerEntries: [] };

        let tiebreakerEntries = [];
        let tiebreakerBreakerEntries = [];

        try {
            tiebreakerEntries = await RetroAPIUtils.getLeaderboardEntries(activeTiebreaker.leaderboardId, 1000);

            if (activeTiebreaker.hasTiebreakerBreaker()) {
                const tiebreakerBreakerInfo = activeTiebreaker.getTiebreakerBreakerInfo();
                tiebreakerBreakerEntries = await RetroAPIUtils.getLeaderboardEntries(tiebreakerBreakerInfo.leaderboardId, 1000);
            }
        } catch (error) {
            console.error('Error fetching tiebreaker leaderboard:', error);
        }

        return { activeTiebreaker, tiebreakerEntries, tiebreakerBreakerEntries };
    }

    async generateLeaderboardEmbeds() {
        try {
            const currentChallenge = await this.getCurrentChallenge();
            if (!currentChallenge) {
                return { headerEmbed: null, participantEmbeds: null, sortedUsers: null };
            }

            const { gameTitle, gameImageUrl } = await this.getGameInfoForChallenge(currentChallenge);
            const sortedProgress = await this.processUserProgress(currentChallenge);
            const { activeTiebreaker, tiebreakerEntries, tiebreakerBreakerEntries } = await this.getTiebreakerData();

            const workingSorted = [...sortedProgress];
            this.assignRanks(workingSorted, tiebreakerEntries, tiebreakerBreakerEntries, activeTiebreaker);

            const headerEmbed = this.createHeaderEmbed(currentChallenge, gameTitle, gameImageUrl, activeTiebreaker);
            
            if (workingSorted.length === 0) {
                headerEmbed.addFields({
                    name: 'No Participants',
                    value: 'No one has earned achievements in this challenge this month yet!'
                });
                return { headerEmbed, participantEmbeds: [], sortedUsers: [] };
            }

            const participantEmbeds = this.createParticipantEmbeds(workingSorted, currentChallenge, gameTitle, gameImageUrl);

            return { headerEmbed, participantEmbeds, sortedUsers: workingSorted };
        } catch (error) {
            console.error('Error generating leaderboard embeds:', error);
            return { headerEmbed: null, participantEmbeds: null, sortedUsers: null };
        }
    }

    createHeaderEmbed(challenge, gameTitle, gameImageUrl, activeTiebreaker) {
        const now = new Date();
        const monthName = now.toLocaleString('default', { month: 'long' });
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const challengeEndDate = new Date(nextMonthStart);
        challengeEndDate.setDate(challengeEndDate.getDate() - 1);
        challengeEndDate.setHours(23, 59, 59);
        
        const headerEmbed = createHeaderEmbed(
            `${monthName} Challenge Leaderboard`,
            `**Game:** [${gameTitle}](https://retroachievements.org/game/${challenge.monthly_challange_gameid})\n` +
            `**Total Achievements:** ${challenge.monthly_challange_game_total}\n` +
            `**Challenge Ends:** ${getDiscordTimestamp(challengeEndDate, 'F')}\n` +
            `**Time Remaining:** ${getDiscordTimestamp(challengeEndDate, 'R')}\n` +
            `**Last Updated:** ${getDiscordTimestamp(new Date())}\n\n` +
            `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`,
            {
                color: COLORS.GOLD,
                thumbnail: `https://retroachievements.org${gameImageUrl}`
            }
        );

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
        
        headerEmbed.addFields({
            name: 'Rules',
            value: `*Note: Only achievements earned during ${monthName} **in Hardcore Mode** count toward challenge status.*\n` +
                   `⚠️ *Save states and rewind features are not allowed. Fast forward is permitted.*`
        });

        return headerEmbed;
    }

    createParticipantEmbeds(workingSorted, challenge, gameTitle, gameImageUrl) {
        const monthName = new Date().toLocaleString('default', { month: 'long' });
        const participantEmbeds = [];
        const totalPages = Math.ceil(workingSorted.length / USERS_PER_EMBED);
        
        for (let page = 0; page < totalPages; page++) {
            const startIndex = page * USERS_PER_EMBED;
            const endIndex = Math.min((page + 1) * USERS_PER_EMBED, workingSorted.length);
            const usersOnPage = workingSorted.slice(startIndex, endIndex);
            
            const participantEmbed = createHeaderEmbed(
                `${monthName} Challenge - Participants (${startIndex + 1}-${endIndex})`,
                `This page shows participants ranked ${startIndex + 1} to ${endIndex} out of ${workingSorted.length} total.`,
                {
                    color: COLORS.GOLD,
                    thumbnail: `https://retroachievements.org${gameImageUrl}`,
                    footer: { text: `Group ${page + 1}/${totalPages} • Use /help points for more information` }
                }
            );
            
            const leaderboardText = this.formatLeaderboardText(usersOnPage, challenge);
            
            participantEmbed.addFields({
                name: `Rankings ${startIndex + 1}-${endIndex} (${workingSorted.length} total participants)`,
                value: this.ensureFieldLength(leaderboardText) || 'No rankings available.'
            });
            
            participantEmbeds.push(participantEmbed);
        }

        return participantEmbeds;
    }

    formatLeaderboardText(users, challenge) {
        let leaderboardText = '';
        
        for (const user of users) {
            const rankEmoji = user.displayRank <= 3 ? EMOJIS[`RANK_${user.displayRank}`] : `#${user.displayRank}`;
            
            leaderboardText += `${rankEmoji} **[${user.username}](https://retroachievements.org/user/${user.username})** ${user.award}\n`;
            leaderboardText += `${user.achieved}/${challenge.monthly_challange_game_total} (${user.percentage}%)\n`;
            
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
        
        return leaderboardText;
    }

    ensureFieldLength(text, maxLength = 1024) {
        if (text.length <= maxLength) return text;
        
        const truncateAt = maxLength - 60;
        const truncated = text.substring(0, truncateAt);
        const lastUserEnd = truncated.lastIndexOf('\n\n');
        
        if (lastUserEnd > 0) {
            return truncated.substring(0, lastUserEnd) + '\n\n*[Use /leaderboard for full view]*';
        }
        
        return truncated + '\n*[Truncated]*';
    }

    async generateYearlyLeaderboardEmbeds() {
        try {
            const currentYear = new Date().getFullYear();
            const users = await User.find();
            const yearKey = `annual_${currentYear}`;
            
            const userPoints = users
                .filter(user => user.annualRecords?.has(yearKey))
                .map(user => {
                    const annualData = user.annualRecords.get(yearKey);
                    return annualData && annualData.totalPoints > 0 ? {
                        username: user.raUsername,
                        totalPoints: annualData.totalPoints,
                        challengePoints: annualData.challengePoints,
                        communityPoints: annualData.communityPoints,
                        rank: annualData.rank,
                        displayRank: annualData.rank,
                        stats: annualData.stats || { mastery: 0, beaten: 0, participation: 0, shadowBeaten: 0, shadowParticipation: 0 }
                    } : null;
                })
                .filter(Boolean)
                .sort((a, b) => b.totalPoints - a.totalPoints);
            
            const yearlyHeaderEmbed = createHeaderEmbed(
                `${currentYear} Yearly Challenge Leaderboard`,
                `Top players based on all monthly challenges in ${currentYear}. ` +
                `Players earn points for each challenge completion: ` +
                `${EMOJIS.MASTERY} Mastery (7pts), ${EMOJIS.BEATEN} Beaten (4pts), ${EMOJIS.PARTICIPATION} Part. (1pt)`,
                {
                    color: COLORS.INFO,
                    footer: { text: 'Updates every 15 minutes • Use /help points for more information' }
                }
            );

            if (userPoints.length === 0) {
                yearlyHeaderEmbed.addFields({
                    name: 'No Participants',
                    value: `No users have earned points for ${currentYear} yet.`
                });
                return { yearlyHeaderEmbed, yearlyParticipantEmbeds: [] };
            }
            
            // Assign display ranks
            this.assignDisplayRanks(userPoints);
            
            const yearlyParticipantEmbeds = this.createYearlyParticipantEmbeds(userPoints, currentYear);
            
            return { yearlyHeaderEmbed, yearlyParticipantEmbeds };
        } catch (error) {
            console.error('Error generating yearly leaderboard embeds:', error);
            return { yearlyHeaderEmbed: null, yearlyParticipantEmbeds: null };
        }
    }

    assignDisplayRanks(userPoints) {
        let currentRank = 1;
        let currentPoints = userPoints[0]?.totalPoints;
        
        for (let i = 0; i < userPoints.length; i++) {
            if (userPoints[i].totalPoints < currentPoints) {
                currentRank = i + 1;
                currentPoints = userPoints[i].totalPoints;
            }
            userPoints[i].displayRank = currentRank;
        }
    }

    createYearlyParticipantEmbeds(userPoints, currentYear) {
        const yearlyParticipantEmbeds = [];
        const totalPages = Math.ceil(userPoints.length / USERS_PER_EMBED);
        
        for (let page = 0; page < totalPages; page++) {
            const startIndex = page * USERS_PER_EMBED;
            const endIndex = Math.min((page + 1) * USERS_PER_EMBED, userPoints.length);
            const usersOnPage = userPoints.slice(startIndex, endIndex);
            
            const participantEmbed = createHeaderEmbed(
                `${currentYear} Yearly Challenge - Leaderboard`,
                `Top players ranked ${startIndex + 1} to ${endIndex} out of ${userPoints.length} total.`,
                {
                    color: COLORS.INFO,
                    footer: { text: `Group ${page + 1}/${totalPages} • Use /help points for more information` }
                }
            );
            
            for (const user of usersOnPage) {
                const rankEmoji = user.displayRank <= 3 ? EMOJIS[`RANK_${user.displayRank}`] : `#${user.displayRank}`;
                const { mastery: m, beaten: b, participation: p, shadowBeaten: sb, shadowParticipation: sp } = user.stats;
                
                const userStatsText = 
                    `Challenges: ${user.challengePoints} pts | Community: ${user.communityPoints} pts\n` +
                    `Reg: ${m}✨ ${b}⭐ ${p}🏁 | Shadow: ${sb}⭐ ${sp}🏁`;
                
                participantEmbed.addFields({
                    name: `${rankEmoji} ${user.username} - ${user.totalPoints} pts`,
                    value: userStatsText
                });
            }
            
            participantEmbed.addFields({
                name: 'Point System',
                value: '✨ Mastery: 7pts | ⭐ Beaten: 4pts | 🏁 Participation: 1pt | Shadow max: 4pts'
            });
            
            yearlyParticipantEmbeds.push(participantEmbed);
        }
        
        return yearlyParticipantEmbeds;
    }

    async checkForRankChanges(currentRanks) {
        try {
            if (!this.previousDetailedRanks.size) {
                this.storeDetailedRanks(currentRanks);
                return;
            }

            const now = Date.now();
            if (now - this.lastGlobalAlertTime < this.globalAlertCooldown) {
                this.storeDetailedRanks(currentRanks);
                return;
            }

            const alerts = this.detectRankChanges(currentRanks, now);

            if (alerts.length > 0) {
                await this.sendRankChangesToAlertService(alerts, currentRanks);
                this.lastGlobalAlertTime = now;
                alerts.forEach(alert => this.lastAlertTime.set(alert.username, now));
            }

            this.storeDetailedRanks(currentRanks);
        } catch (error) {
            console.error('Error checking rank changes:', error);
        }
    }

    detectRankChanges(currentRanks, now) {
        const alerts = [];
        const topUsers = currentRanks.filter(user => user.displayRank <= 5);

        for (const user of topUsers) {
            const currentState = this.getUserState(user);
            const previousState = this.previousDetailedRanks.get(user.username);
            
            if (now - (this.lastAlertTime.get(user.username) || 0) < this.alertCooldown) continue;
            
            if (!previousState && user.displayRank <= 3) {
                alerts.push({
                    type: 'newEntry',
                    username: user.username,
                    newRank: user.displayRank,
                    achievementCount: user.achieved,
                    reason: `Entered top rankings with ${user.achieved} achievements`
                });
            } else if (previousState && currentState.displayRank < previousState.displayRank) {
                alerts.push({
                    type: 'overtake',
                    username: user.username,
                    previousRank: previousState.displayRank,
                    newRank: currentState.displayRank,
                    achievementCount: currentState.achieved,
                    reason: this.determineChangeReason(previousState, currentState)
                });
            }
        }

        // Check for users who fell out of top 5
        for (const [username, previousState] of this.previousDetailedRanks.entries()) {
            if (previousState.displayRank <= 5) {
                const currentUser = currentRanks.find(u => u.username === username);
                if ((!currentUser || currentUser.displayRank > 5) && 
                    now - (this.lastAlertTime.get(username) || 0) >= this.alertCooldown) {
                    alerts.push({
                        type: 'fallOut',
                        username: username,
                        previousRank: previousState.displayRank,
                        newRank: currentUser?.displayRank || 'Outside Top 5'
                    });
                }
            }
        }

        return alerts;
    }

    async sendRankChangesToAlertService(alerts, currentRanks) {
        try {
            const currentChallenge = await this.getCurrentChallenge();
            if (!currentChallenge) return;

            const monthName = new Date().toLocaleString('default', { month: 'long' });
            const changes = alerts.map(alert => ({
                username: alert.username,
                newRank: alert.newRank,
                reason: alert.reason,
                type: alert.type
            }));

            const currentStandings = currentRanks.slice(0, 5).map(user => ({
                username: user.username,
                rank: user.displayRank,
                score: `${user.achieved}/${currentChallenge.monthly_challange_game_total} achievements (${user.percentage}%)`,
                achievementCount: user.achieved,
                totalAchievements: currentChallenge.monthly_challange_game_total
            }));

            let thumbnailUrl = null;
            if (currentChallenge.monthly_game_icon_url) {
                thumbnailUrl = `https://retroachievements.org${currentChallenge.monthly_game_icon_url}`;
            }

            await AlertService.sendMonthlyRankAlert({
                monthName: monthName,
                gameTitle: currentChallenge.monthly_game_title || currentChallenge.monthly_challange_title,
                gameId: currentChallenge.monthly_challange_gameid,
                changes: changes,
                currentStandings: currentStandings,
                thumbnail: thumbnailUrl,
                footer: { text: 'Alerts sent hourly • Leaderboard updates every 15 minutes • Data from RetroAchievements' }
            });
        } catch (error) {
            console.error('Error sending rank changes to AlertService:', error);
        }
    }

    getUserState(user) {
        return {
            username: String(user.username || ''),
            discordId: String(user.discordId || ''),
            displayRank: Number(user.displayRank || 0),
            achieved: Number(user.achieved || 0),
            percentage: String(user.percentage || '0.00'),
            points: Number(user.points || 0),
            award: String(user.award || ''),
            hasTiebreaker: Boolean(user.hasTiebreaker),
            tiebreakerRank: user.tiebreakerRank ? Number(user.tiebreakerRank) : null,
            tiebreakerScore: user.tiebreakerScore ? String(user.tiebreakerScore) : null,
            tiebreakerGame: user.tiebreakerGame ? String(user.tiebreakerGame) : null,
            hasTiebreakerBreaker: Boolean(user.hasTiebreakerBreaker),
            tiebreakerBreakerRank: user.tiebreakerBreakerRank ? Number(user.tiebreakerBreakerRank) : null,
            tiebreakerBreakerScore: user.tiebreakerBreakerScore ? String(user.tiebreakerBreakerScore) : null,
            tiebreakerBreakerGame: user.tiebreakerBreakerGame ? String(user.tiebreakerBreakerGame) : null,
            sortIndex: Number(user.originalIndex || 0)
        };
    }

    determineChangeReason(previousState, currentState) {
        if (!previousState) {
            return `Entered top rankings with ${currentState.achieved} achievements`;
        }

        if (currentState.achieved > previousState.achieved) {
            const newAchievements = currentState.achieved - previousState.achieved;
            return `Earned ${newAchievements} new achievement(s)`;
        }

        if (previousState.award !== currentState.award) {
            return `Achievement status improved: ${currentState.award}`;
        }

        return 'Ranking position updated';
    }

    storeDetailedRanks(ranks) {
        this.previousDetailedRanks.clear();
        
        for (const user of ranks) {
            if (user.displayRank <= 7) {
                this.previousDetailedRanks.set(user.username, this.getUserState(user));
            }
        }
        
        this.cleanupOldAlertCooldowns();
    }

    cleanupOldAlertCooldowns() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        for (const [username, lastAlertTime] of this.lastAlertTime.entries()) {
            if (now - lastAlertTime > oneHour) {
                this.lastAlertTime.delete(username);
            }
        }
        
        if (this.lastGlobalAlertTime > 0 && (now - this.lastGlobalAlertTime) > (24 * 60 * 60 * 1000)) {
            this.lastGlobalAlertTime = 0;
        }
    }

    // Ranking assignment logic - consolidated but kept for feed functionality
    assignRanks(users, tiebreakerEntries, tiebreakerBreakerEntries, activeTiebreaker) {
        if (!users?.length) return;

        this.addTiebreakerInfo(users, tiebreakerEntries, tiebreakerBreakerEntries, activeTiebreaker);
        users.forEach((user, index) => user.originalIndex = index);
        
        this.processRankingGroups(users);
        this.sortUsersByFinalRank(users);
    }

    addTiebreakerInfo(users, tiebreakerEntries, tiebreakerBreakerEntries, activeTiebreaker) {
        if (tiebreakerEntries?.length > 0) {
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

        if (tiebreakerBreakerEntries?.length > 0) {
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
    }

    processRankingGroups(users) {
        let currentTieGroup = [];
        let tieGroupStartIdx = 0;
        let lastAchieved = -1;
        let lastPoints = -1;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            if (i > 0 && user.achieved === lastAchieved && user.points === lastPoints) {
                currentTieGroup.push(i);
            } else {
                if (currentTieGroup.length > 1) {
                    this.processTieGroup(users, currentTieGroup, tieGroupStartIdx);
                } else if (currentTieGroup.length === 1) {
                    users[currentTieGroup[0]].displayRank = tieGroupStartIdx + 1;
                }
                
                currentTieGroup = [i];
                tieGroupStartIdx = i;
            }
            
            lastAchieved = user.achieved;
            lastPoints = user.points;
        }
        
        if (currentTieGroup.length > 1) {
            this.processTieGroup(users, currentTieGroup, tieGroupStartIdx);
        } else if (currentTieGroup.length === 1) {
            users[currentTieGroup[0]].displayRank = tieGroupStartIdx + 1;
        }

        // Ensure all users have display rank
        for (let i = 0; i < users.length; i++) {
            if (users[i].displayRank === undefined) {
                users[i].displayRank = i + 1;
            }
        }
    }

    processTieGroup(users, tieGroupIndices, startIdx) {
        const isTopFive = startIdx < 5;
        
        if (!isTopFive) {
            for (const idx of tieGroupIndices) {
                users[idx].displayRank = startIdx + 1;
            }
            return;
        }

        const withTiebreaker = tieGroupIndices.filter(idx => users[idx].hasTiebreaker);
        const withoutTiebreaker = tieGroupIndices.filter(idx => !users[idx].hasTiebreaker);
        
        if (withTiebreaker.length > 0) {
            withTiebreaker.sort((a, b) => users[a].tiebreakerRank - users[b].tiebreakerRank);
            
            let nextAvailableRank = startIdx + 1;
            let currentTbRank = users[withTiebreaker[0]].tiebreakerRank;
            let currentTbGroup = [];
            
            for (let i = 0; i < withTiebreaker.length; i++) {
                const userIdx = withTiebreaker[i];
                const user = users[userIdx];
                
                if (i > 0 && user.tiebreakerRank !== currentTbRank) {
                    if (currentTbGroup.length > 1) {
                        this.processTiebreakerBreakerGroup(users, currentTbGroup, nextAvailableRank);
                        nextAvailableRank += currentTbGroup.length;
                    } else {
                        users[currentTbGroup[0]].displayRank = nextAvailableRank;
                        nextAvailableRank++;
                    }
                    
                    currentTbGroup = [userIdx];
                    currentTbRank = user.tiebreakerRank;
                } else {
                    currentTbGroup.push(userIdx);
                }
            }
            
            if (currentTbGroup.length > 1) {
                this.processTiebreakerBreakerGroup(users, currentTbGroup, nextAvailableRank);
                nextAvailableRank += currentTbGroup.length;
            } else if (currentTbGroup.length === 1) {
                users[currentTbGroup[0]].displayRank = nextAvailableRank;
                nextAvailableRank++;
            }
            
            for (const idx of withoutTiebreaker) {
                users[idx].displayRank = nextAvailableRank;
            }
        } else {
            for (const idx of tieGroupIndices) {
                users[idx].displayRank = startIdx + 1;
            }
        }
    }

    processTiebreakerBreakerGroup(users, tieGroupIndices, startRank) {
        const withTiebreakerBreaker = tieGroupIndices.filter(idx => users[idx].hasTiebreakerBreaker);
        const withoutTiebreakerBreaker = tieGroupIndices.filter(idx => !users[idx].hasTiebreakerBreaker);
        
        if (withTiebreakerBreaker.length > 0) {
            withTiebreakerBreaker.sort((a, b) => users[a].tiebreakerBreakerRank - users[b].tiebreakerBreakerRank);
            
            for (let i = 0; i < withTiebreakerBreaker.length; i++) {
                users[withTiebreakerBreaker[i]].displayRank = startRank + i;
            }
            
            const nextRank = startRank + withTiebreakerBreaker.length;
            for (const idx of withoutTiebreakerBreaker) {
                users[idx].displayRank = nextRank;
            }
        } else {
            for (const idx of tieGroupIndices) {
                users[idx].displayRank = startRank;
            }
        }
    }

    sortUsersByFinalRank(users) {
        users.sort((a, b) => {
            if (a.displayRank !== b.displayRank) {
                return a.displayRank - b.displayRank;
            }
            return a.originalIndex - b.originalIndex;
        });
    }
}

const leaderboardFeedService = new LeaderboardFeedService();
export default leaderboardFeedService;
