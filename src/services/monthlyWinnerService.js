// src/services/monthlyWinnerService.js - Automated monthly winner announcements and awards
import { User } from '../models/User.js';
import { Challenge } from '../models/Challenge.js';
import { config } from '../config/config.js';
import RetroAPIUtils from '../utils/RetroAPIUtils.js';
import AlertService from '../utils/AlertService.js';
import { ALERT_TYPES } from '../utils/AlertService.js';

const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // Check daily
const WINNER_AWARDS = {
    1: { points: 5, title: "1st Place Monthly Challenge Winner" },
    2: { points: 3, title: "2nd Place Monthly Challenge Winner" },
    3: { points: 2, title: "3rd Place Monthly Challenge Winner" }
};

class MonthlyWinnerService {
    constructor() {
        this.client = null;
        this.lastProcessedMonth = null;
        this.isRunning = false;
        this.interval = null;
        
        // Initialize with current month to prevent immediate processing on startup
        const now = new Date();
        this.lastProcessedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        console.log('MonthlyWinnerService initialized for month:', this.lastProcessedMonth);
    }

    setClient(client) {
        this.client = client;
        AlertService.setClient(client);
        console.log('MonthlyWinnerService client configured');
    }

    start() {
        if (this.isRunning) {
            console.log('MonthlyWinnerService already running');
            return;
        }

        this.isRunning = true;
        console.log('Starting MonthlyWinnerService...');
        
        // Run initial check after a short delay
        setTimeout(() => this.checkForNewMonth(), 10000);
        
        // Set up interval for daily checks
        this.interval = setInterval(() => {
            this.checkForNewMonth();
        }, CHECK_INTERVAL);
        
        console.log('MonthlyWinnerService started with daily checks');
    }

    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        console.log('MonthlyWinnerService stopped');
    }

    async checkForNewMonth() {
        try {
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            
            if (this.lastProcessedMonth !== currentMonth) {
                console.log(`MonthlyWinnerService: New month detected! ${this.lastProcessedMonth} → ${currentMonth}`);
                await this.processMonthlyWinners();
                this.lastProcessedMonth = currentMonth;
            } else {
                console.log(`MonthlyWinnerService: Same month (${currentMonth}), no action needed`);
            }
        } catch (error) {
            console.error('Error checking for new month:', error);
        }
    }

    async processMonthlyWinners() {
        try {
            console.log('MonthlyWinnerService: Processing monthly winners...');
            
            // Get previous month's challenge
            const previousMonth = this.getPreviousMonth();
            const challenge = await this.getPreviousMonthChallenge(previousMonth);
            
            if (!challenge) {
                console.log('MonthlyWinnerService: No challenge found for previous month');
                return;
            }

            console.log(`MonthlyWinnerService: Found challenge for ${previousMonth.year}-${previousMonth.month}: ${challenge.monthly_game_title || challenge.monthly_challange_gameid}`);

            // Get final rankings for the previous month
            const winners = await this.calculateFinalRankings(challenge);
            
            if (!winners || winners.length === 0) {
                console.log('MonthlyWinnerService: No participants found for previous month');
                return;
            }

            console.log(`MonthlyWinnerService: Found ${winners.length} participants, processing top 3...`);

            // Award points to top 3
            const awardedWinners = await this.awardWinnerPoints(winners.slice(0, 3), challenge);
            
            // Send announcement
            await this.announceWinners(awardedWinners, challenge, previousMonth);
            
            console.log('MonthlyWinnerService: Monthly winners processing completed successfully');
            
        } catch (error) {
            console.error('MonthlyWinnerService: Error processing monthly winners:', error);
        }
    }

    getPreviousMonth() {
        const now = new Date();
        const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const month = now.getMonth() === 0 ? 12 : now.getMonth();
        
        return { year, month };
    }

    async getPreviousMonthChallenge(previousMonth) {
        const startDate = new Date(previousMonth.year, previousMonth.month - 1, 1);
        const endDate = new Date(previousMonth.year, previousMonth.month, 1);
        
        return await Challenge.findOne({
            date: { $gte: startDate, $lt: endDate }
        });
    }

    async calculateFinalRankings(challenge) {
        try {
            const users = await User.find({});
            
            const userProgress = await Promise.all(users.map(async (user) => {
                try {
                    const progress = await RetroAPIUtils.getUserGameProgress(
                        user.raUsername,
                        challenge.monthly_challange_gameid
                    );

                    if (progress.numAwardedToUser === 0) return null;

                    // Check achievements earned during the challenge month
                    const achievementsEarnedInMonth = Object.entries(progress.achievements)
                        .filter(([id, data]) => {
                            if (!data.hasOwnProperty('dateEarned')) return false;
                            return this.isDateInChallengeMonth(data.dateEarned, challenge.date);
                        })
                        .map(([id, data]) => id);
                    
                    if (achievementsEarnedInMonth.length === 0) return null;

                    const { award, points } = this.calculateAwardAndPoints(
                        achievementsEarnedInMonth, 
                        challenge
                    );

                    return {
                        user,
                        username: user.raUsername,
                        discordId: user.discordId,
                        achieved: achievementsEarnedInMonth.length,
                        percentage: (achievementsEarnedInMonth.length / challenge.monthly_challange_game_total * 100).toFixed(2),
                        award,
                        points,
                        earnedInMonth: achievementsEarnedInMonth.length
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
                })
                .map((user, index) => ({ ...user, rank: index + 1 }));
                
        } catch (error) {
            console.error('Error calculating final rankings:', error);
            return [];
        }
    }

    isDateInChallengeMonth(dateString, challengeDate) {
        const inputDate = new Date(dateString);
        const challengeMonth = challengeDate.getMonth();
        const challengeYear = challengeDate.getFullYear();
        
        // Handle end-of-month edge case (last day of previous month)
        const lastDayOfPrevMonth = new Date(challengeYear, challengeMonth, 0);
        const isLastDayOfPrevMonth = inputDate.getFullYear() === lastDayOfPrevMonth.getFullYear() &&
                                    inputDate.getMonth() === lastDayOfPrevMonth.getMonth() &&
                                    inputDate.getDate() === lastDayOfPrevMonth.getDate();
        
        const isChallengeMonth = inputDate.getFullYear() === challengeYear &&
                               inputDate.getMonth() === challengeMonth;
        
        return isChallengeMonth || isLastDayOfPrevMonth;
    }

    calculateAwardAndPoints(achievementsEarnedInMonth, challenge) {
        const hasAllAchievements = achievementsEarnedInMonth.length === challenge.monthly_challange_game_total;

        if (achievementsEarnedInMonth.length > 0 && hasAllAchievements) {
            return { award: '✨', points: 7 }; // Mastery
        }

        const progressionAchievements = challenge.monthly_challange_progression_achievements || [];
        const winAchievements = challenge.monthly_challange_win_achievements || [];
        
        const earnedProgressionInMonth = progressionAchievements.filter(id => 
            achievementsEarnedInMonth.includes(id)
        );
        const earnedWinInMonth = winAchievements.filter(id => 
            achievementsEarnedInMonth.includes(id)
        );

        const hasAllProgression = earnedProgressionInMonth.length === progressionAchievements.length;
        const hasRequiredWin = winAchievements.length === 0 || earnedWinInMonth.length > 0;
        const hasEarnedInMonth = earnedProgressionInMonth.length > 0 || earnedWinInMonth.length > 0;

        if (hasAllProgression && hasRequiredWin && hasEarnedInMonth) {
            return { award: '⭐', points: 4 }; // Beaten
        }

        return { award: '🏁', points: 1 }; // Participation
    }

    async awardWinnerPoints(winners, challenge) {
        const awardedWinners = [];
        
        for (const winner of winners) {
            if (winner.rank <= 3) {
                const awardInfo = WINNER_AWARDS[winner.rank];
                
                try {
                    // Check if user already has this award to prevent duplicates
                    const monthKey = `${challenge.date.getFullYear()}-${String(challenge.date.getMonth() + 1).padStart(2, '0')}`;
                    const existingAward = winner.user.communityAwards?.find(award => 
                        award.title === awardInfo.title && 
                        award.awardedAt.getFullYear() === challenge.date.getFullYear() &&
                        award.awardedAt.getMonth() === challenge.date.getMonth()
                    );

                    if (existingAward) {
                        console.log(`MonthlyWinnerService: ${winner.username} already has ${awardInfo.title} for this month, skipping`);
                        awardedWinners.push({ ...winner, ...awardInfo, alreadyAwarded: true });
                        continue;
                    }

                    // Add community award
                    winner.user.communityAwards.push({
                        title: awardInfo.title,
                        points: awardInfo.points,
                        awardedBy: 'Monthly Winner System',
                        awardedAt: new Date()
                    });

                    await winner.user.save();
                    
                    console.log(`MonthlyWinnerService: Awarded ${awardInfo.points} points to ${winner.username} for ${awardInfo.title}`);
                    
                    awardedWinners.push({ ...winner, ...awardInfo, newlyAwarded: true });
                    
                } catch (error) {
                    console.error(`MonthlyWinnerService: Error awarding points to ${winner.username}:`, error);
                    awardedWinners.push({ ...winner, ...awardInfo, awardError: true });
                }
            }
        }
        
        return awardedWinners;
    }

    async announceWinners(winners, challenge, previousMonth) {
        try {
            if (!winners || winners.length === 0) {
                console.log('MonthlyWinnerService: No winners to announce');
                return;
            }

            const monthName = new Date(previousMonth.year, previousMonth.month - 1).toLocaleString('default', { month: 'long' });
            const gameTitle = challenge.monthly_game_title || `Game ${challenge.monthly_challange_gameid}`;
            
            // Create announcement embed
            const announcement = {
                title: `🏆 ${monthName} ${previousMonth.year} Challenge Winners! 🏆`,
                description: `The results are in for the **${gameTitle}** challenge!\n\nCongratulations to our top performers:`,
                gameTitle: gameTitle,
                gameId: challenge.monthly_challange_gameid,
                thumbnail: challenge.monthly_game_icon_url ? 
                    `https://retroachievements.org${challenge.monthly_game_icon_url}` : null,
                fields: [],
                footer: { text: 'Community awards have been automatically distributed • Monthly challenges reset on the 1st' }
            };

            // Add winner fields
            const rankEmojis = ['🥇', '🥈', '🥉'];
            for (let i = 0; i < Math.min(winners.length, 3); i++) {
                const winner = winners[i];
                const rankEmoji = rankEmojis[i];
                
                let statusText = '';
                if (winner.newlyAwarded) {
                    statusText = ` (+${winner.points} community points awarded!)`;
                } else if (winner.alreadyAwarded) {
                    statusText = ` (points previously awarded)`;
                }
                
                announcement.fields.push({
                    name: `${rankEmoji} ${winner.rank}${this.getOrdinalSuffix(winner.rank)} Place`,
                    value: `**[${winner.username}](https://retroachievements.org/user/${winner.username})** ${winner.award}\n` +
                           `${winner.achieved}/${challenge.monthly_challange_game_total} achievements (${winner.percentage}%)${statusText}`,
                    inline: false
                });
            }

            // Add participation summary if there were more participants
            if (winners.length > 3) {
                announcement.fields.push({
                    name: '📊 Challenge Summary',
                    value: `Total participants: **${winners.length}**\n` +
                           `Thank you to everyone who participated in the ${monthName} challenge!`,
                    inline: false
                });
            }

            // Send announcement
            await AlertService.sendAnnouncementAlert({
                alertType: ALERT_TYPES.NEW_CHALLENGE, // This goes to announcement channels
                ...announcement
            });

            console.log(`MonthlyWinnerService: Successfully announced ${winners.length} winners for ${monthName} ${previousMonth.year}`);

        } catch (error) {
            console.error('MonthlyWinnerService: Error announcing winners:', error);
        }
    }

    getOrdinalSuffix(num) {
        const j = num % 10;
        const k = num % 100;
        if (j == 1 && k != 11) return "st";
        if (j == 2 && k != 12) return "nd";
        if (j == 3 && k != 13) return "rd";
        return "th";
    }
}

// Create and export singleton instance
const monthlyWinnerService = new MonthlyWinnerService();
export default monthlyWinnerService;
