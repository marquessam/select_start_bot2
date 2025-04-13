import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';

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

// Award points constants - with hierarchical values
const POINTS = {
    MASTERY: 7,
    BEATEN: 4,
    PARTICIPATION: 1
};

// Shadow games are limited to beaten status maximum
const SHADOW_MAX_POINTS = POINTS.BEATEN;

// Helper function to check if a challenge is from a past month
function isPastChallenge(challengeDate, now) {
    // Challenge is in the past if it's from a previous month or previous year
    return (challengeDate.getFullYear() < now.getFullYear()) ||
           (challengeDate.getFullYear() === now.getFullYear() && 
            challengeDate.getMonth() < now.getMonth());
}

// Function to check if a date is in the current month
function isCurrentMonth(date, now) {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

// Fixed version: Properly checks if date is in current month or last day of previous month
function isDateInCurrentMonth(dateString) {
    // Parse the input date string
    const inputDate = new Date(dateString.replace(' ', 'T'));
    
    // Get the current date
    const currentDate = new Date();
    
    // Get the first day of the current month
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    
    // Get the last day of the previous month
    const lastDayOfPrevMonth = new Date(firstDayOfMonth);
    lastDayOfPrevMonth.setDate(lastDayOfPrevMonth.getDate() - 1);
    
    // Check if the input date is in the current month
    const isCurrentMonth = inputDate.getMonth() === currentDate.getMonth() && 
                           inputDate.getFullYear() === currentDate.getFullYear();
                           
    // Check if the input date is the last day of the previous month
    const isLastDayOfPrevMonth = inputDate.getDate() === lastDayOfPrevMonth.getDate() &&
                                inputDate.getMonth() === lastDayOfPrevMonth.getMonth() &&
                                inputDate.getFullYear() === lastDayOfPrevMonth.getFullYear();
    
    return isCurrentMonth || isLastDayOfPrevMonth;
}

// New helper function: Check if an achievement was earned during its challenge month
function wasEarnedDuringChallengeMonth(dateEarned, challengeDate) {
    if (!dateEarned) return false;
    
    const earnedDate = new Date(dateEarned.replace(' ', 'T'));
    
    // Get first day of challenge month
    const challengeMonthStart = new Date(challengeDate.getFullYear(), challengeDate.getMonth(), 1);
    
    // Get first day of next month
    const nextMonthStart = new Date(challengeDate.getFullYear(), challengeDate.getMonth() + 1, 1);
    
    // Get last day of previous month (for grace period)
    const prevMonthLastDay = new Date(challengeMonthStart);
    prevMonthLastDay.setDate(prevMonthLastDay.getDate() - 1);
    
    // Check if achievement was earned during challenge month
    const inChallengeMonth = earnedDate >= challengeMonthStart && earnedDate < nextMonthStart;
    
    // Check if achievement was earned on the last day of previous month (grace period)
    const isLastDayOfPrevMonth = 
        earnedDate.getDate() === prevMonthLastDay.getDate() &&
        earnedDate.getMonth() === prevMonthLastDay.getMonth() &&
        earnedDate.getFullYear() === prevMonthLastDay.getFullYear();
    
    return inChallengeMonth || isLastDayOfPrevMonth;
}

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Display user profile and achievements')
        .addStringOption(option =>
            option.setName('username')
            .setDescription('RetroAchievements username (optional)')
            .setRequired(false)),

    async execute(interaction) {
      await interaction.deferReply({ ephemeral: true });

        try {
            let raUsername = interaction.options.getString('username');
            let user;

            if (!raUsername) {
                // Look up user by Discord ID
                user = await User.findOne({ discordId: interaction.user.id });
                if (!user) {
                    return interaction.editReply('You are not registered. Please ask an admin to register you first.');
                }
                raUsername = user.raUsername;
            } else {
                // Look up user by RA username
                user = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
                });
                if (!user) {
                    return interaction.editReply('User not found. Please check the username or ask an admin to register this user.');
                }
            }

            // Get current date for finding current challenges
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            // Get current challenges
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            // Get ALL challenges for processing past awards
            const allChallenges = await Challenge.find({}).sort({ date: -1 });
            
            // Create a map for faster challenge lookups
            const challengeMap = new Map();
            for (const challenge of allChallenges) {
                const dateKey = User.formatDateKey(challenge.date);
                challengeMap.set(dateKey, challenge);
            }

            // Get user's RA info
            const raUserInfo = await retroAPI.getUserInfo(raUsername);

            // Get current game progress and update user's progress in the database
            let currentGamesProgress = [];
            if (currentChallenge) {
                // Get main challenge progress
                const mainGameProgress = await retroAPI.getUserGameProgress(
                    raUsername,
                    currentChallenge.monthly_challange_gameid
                );
                
                // Get the user's earned achievements (all-time)
                const achievementsEarnedThisMonth = Object.entries(mainGameProgress.achievements)
                    .filter(([id, data]) => data.hasOwnProperty('dateEarned') && isDateInCurrentMonth(data.dateEarned))
                    .map(([id, data]) => id);

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
                
                // Count total valid progression achievements (either earned this month or previously)
                const totalValidProgressionAchievements = progressionAchievements.filter(id => 
                    achievementsEarnedThisMonth.includes(id)
                );
                
                // Count total valid win achievements (either earned this month or previously)
                const totalValidWinAchievements = winAchievements.filter(id => 
                    achievementsEarnedThisMonth.includes(id)
                );

                // Calculate award level for monthly challenge based on specific achievements
                let monthlyPoints = 0;
                let award = 'None';
                
                // Check if user has all achievements in the game
                const hasAllAchievements = achievementsEarnedThisMonth.length === currentChallenge.monthly_challange_game_total;

                // To get mastery points this month, user must have earned at least one achievement this month
                // AND have the game 100% completed now
                if (achievementsEarnedThisMonth.length > 0 && hasAllAchievements) {
                    monthlyPoints = 7; // Mastery
                    award = 'Mastery';
                } 
                // For beaten status, the user must have all progression achievements AND at least one win achievement (if any required)
                // AND at least one of those achievements must have been earned this month
                else if (totalValidProgressionAchievements.length === progressionAchievements.length && 
                         (winAchievements.length === 0 || totalValidWinAchievements.length > 0) &&
                         (earnedProgressionInMonth.length > 0 || earnedWinInMonth.length > 0)) {
                    monthlyPoints = 4; // Beaten - using this same value for database consistency
                    award = 'Beaten';
                } 
                // For participation, at least one achievement must be earned this month
                else if (achievementsEarnedThisMonth.length > 0) {
                    monthlyPoints = 1; // Participation
                    award = 'Participation';
                }
                
                // Update user's monthly challenge progress in the database
                const monthKey = User.formatDateKey(currentChallenge.date);
                user.monthlyChallenges.set(monthKey, { progress: monthlyPoints });
                
                // Add progress to the display array
                if (achievementsEarnedThisMonth.length > 0) {
                    currentGamesProgress.push({
                        title: mainGameProgress.title,
                        earned: achievementsEarnedThisMonth.length,
                        total: currentChallenge.monthly_challange_game_total,
                        percentage: (achievementsEarnedThisMonth.length / currentChallenge.monthly_challange_game_total * 100).toFixed(1),
                        award: award,
                        earnedThisMonth: achievementsEarnedThisMonth.length,
                        isShadow: false
                    });
                }

                // If shadow challenge is revealed, get its progress too
                if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                    const shadowGameProgress = await retroAPI.getUserGameProgress(
                        raUsername,
                        currentChallenge.shadow_challange_gameid
                    );

                    // Check for shadow achievements earned during the challenge month
                    const userShadowAchievements = shadowGameProgress.achievements || {};
                    
                    // Filter shadow achievements earned during the current month
                    let shadowAchievementsEarnedThisMonth = Object.entries(userShadowAchievements)
                        .filter(([id, data]) => {
                            if (!data.dateEarned) return false;
                            const earnedDate = new Date(data.dateEarned);
                            return earnedDate >= currentMonthStart;
                        })
                        .map(([id]) => id);

                    // Get all shadow achievements earned (all-time)
                    const allEarnedShadowAchievements = Object.entries(shadowGameProgress.achievements)
                        .filter(([id, data]) => data.hasOwnProperty('dateEarned') && isDateInCurrentMonth(data.dateEarned))
                        .map(([id, data]) => id);

                    // Check for progression shadow achievements earned this month
                    const progressionShadowAchievements = currentChallenge.shadow_challange_progression_achievements || [];
                    const earnedShadowProgressionInMonth = progressionShadowAchievements.filter(id => 
                        shadowAchievementsEarnedThisMonth.includes(id)
                    );
                    
                    // Check for win shadow achievements earned this month
                    const winShadowAchievements = currentChallenge.shadow_challange_win_achievements || [];
                    const earnedShadowWinInMonth = winShadowAchievements.filter(id => 
                        shadowAchievementsEarnedThisMonth.includes(id)
                    );
                    
                    // Count total valid progression shadow achievements (either earned this month or previously)
                    const totalValidShadowProgressionAchievements = progressionShadowAchievements.filter(id => 
                        allEarnedShadowAchievements.includes(id)
                    );
                    
                    // Count total valid win shadow achievements (either earned this month or previously)
                    const totalValidShadowWinAchievements = winShadowAchievements.filter(id => 
                        allEarnedShadowAchievements.includes(id)
                    );

                    // Calculate award level for shadow challenge based on specific achievements
                    let shadowPoints = 0;
                    let shadowAward = 'None';
                    
                    // Check if user has all progression achievements in the shadow game
                    const hasAllProgressionShadowAchievements = 
                        progressionShadowAchievements.length > 0 && 
                        progressionShadowAchievements.every(id => allEarnedShadowAchievements.includes(id));

                    // Check if user has at least one win achievement in the shadow game (if required)
                    const hasWinShadowAchievement = 
                        winShadowAchievements.length === 0 || 
                        winShadowAchievements.some(id => allEarnedShadowAchievements.includes(id));

                    // For shadow games, "Beaten" is the highest status possible (4 points max)
                    if (shadowAchievementsEarnedThisMonth.length > 0 && 
                        hasAllProgressionShadowAchievements && 
                        hasWinShadowAchievement) {
                        shadowPoints = SHADOW_MAX_POINTS; // Beaten (max for shadow)
                        shadowAward = 'Beaten';
                    } 
                    // For participation, at least one achievement must be earned this month
                    else if (shadowAchievementsEarnedThisMonth.length > 0) {
                        shadowPoints = 1; // Participation
                        shadowAward = 'Participation';
                    }
                    
                    // Update user's shadow challenge progress in the database
                    user.shadowChallenges.set(monthKey, { progress: shadowPoints });
                    
                    if (shadowAchievementsEarnedThisMonth.length > 0) {
                        currentGamesProgress.push({
                            title: shadowGameProgress.title,
                            earned: shadowGameProgress.numAwardedToUser,
                            total: currentChallenge.shadow_challange_game_total,
                            percentage: (shadowAchievementsEarnedThisMonth.length / currentChallenge.shadow_challange_game_total * 100).toFixed(1),
                            award: shadowAward,
                            earnedThisMonth: shadowAchievementsEarnedThisMonth.length,
                            isShadow: true
                        });
                    }
                }
            }

            // Calculate awards and points
            let masteredGames = [];
            let beatenGames = [];
            let participationGames = [];
            // New separate arrays for shadow games
            let beatenShadowGames = [];
            let participationShadowGames = [];
            let communityPoints = 0;
            let pastChallengePoints = 0; // Track points from past challenges
            
            // Flag to track if we need to update the user data
            let needDatabaseUpdate = false;
            
            // Process past challenges data
            // Important addition: Process all past challenges even if not in user's monthlyChallenges
            for (const challenge of allChallenges) {
                const challengeDate = challenge.date;
                
                // Skip current month's challenge for past awards section
                if (isCurrentMonth(challengeDate, now)) {
                    continue;
                }
                
                const dateKey = User.formatDateKey(challengeDate);
                const userData = user.monthlyChallenges.get(dateKey);
                
                // Check if user has progress for this challenge or attempt to fetch it
                try {
                    // This is a past challenge - get progress
                    const progress = await retroAPI.getUserGameProgress(
                        raUsername, 
                        challenge.monthly_challange_gameid
                    );
                    
                    // If user has earned at least one achievement
                    if (progress.numAwardedToUser > 0) {
                        // Calculate completion percentage
                        const percentage = (progress.numAwardedToUser / challenge.monthly_challange_game_total * 100).toFixed(1);
                        
                        // Get only achievements earned during the challenge month
                        const earnedDuringChallenge = Object.entries(progress.achievements)
                            .filter(([id, data]) => wasEarnedDuringChallengeMonth(data.dateEarned, challengeDate))
                            .map(([id]) => id);
                        
                        // If no achievements were earned during the challenge month, skip this challenge
                        if (earnedDuringChallenge.length === 0) {
                            continue;
                        }
                        
                        // Determine status based on achievements earned during the challenge
                        const allEarnedDuringChallenge = progress.numAwardedToUser === challenge.monthly_challange_game_total &&
                            earnedDuringChallenge.length === challenge.monthly_challange_game_total;
                        
                        if (allEarnedDuringChallenge) {
                            // Mastery - only if ALL achievements were earned during the challenge month
                            masteredGames.push({
                                title: progress.title,
                                date: challengeDate,
                                earned: progress.numAwardedToUser,
                                total: challenge.monthly_challange_game_total,
                                percentage
                            });
                            
                            // Add points to past challenge total
                            pastChallengePoints += POINTS.MASTERY;
                            
                            // Save this to user's record if not already present
                            if (!userData || userData.progress < 3) {
                                user.monthlyChallenges.set(dateKey, { progress: 3 });
                                needDatabaseUpdate = true;
                            }
                        } else {
                            // Get progression and win achievements earned during the challenge
                            const progressionAchievements = challenge.monthly_challange_progression_achievements || [];
                            const winAchievements = challenge.monthly_challange_win_achievements || [];
                            
                            const progressionCompletedInChallenge = progressionAchievements.length > 0 && 
                                progressionAchievements.every(id => earnedDuringChallenge.includes(id));
                            
                            const hasWinConditionInChallenge = winAchievements.length === 0 || 
                                winAchievements.some(id => earnedDuringChallenge.includes(id));
                            
                            // Check if game is beaten during the challenge month
                            if (progressionCompletedInChallenge && hasWinConditionInChallenge) {
                                // Beaten status
                                beatenGames.push({
                                    title: progress.title,
                                    date: challengeDate,
                                    earned: earnedDuringChallenge.length,
                                    total: challenge.monthly_challange_game_total,
                                    percentage
                                });
                                
                                // Add points to past challenge total
                                pastChallengePoints += POINTS.BEATEN;
                                
                                // Update database if needed
                                if (!userData || userData.progress < 2) {
                                    user.monthlyChallenges.set(dateKey, { progress: 2 });
                                    needDatabaseUpdate = true;
                                }
                            } else if (userData && userData.progress === 2) {
                                // If the database already says it's beaten, trust that (backwards compatibility)
                                beatenGames.push({
                                    title: progress.title,
                                    date: challengeDate,
                                    earned: progress.numAwardedToUser,
                                    total: challenge.monthly_challange_game_total,
                                    percentage
                                });
                                
                                // Add points to past challenge total
                                pastChallengePoints += POINTS.BEATEN;
                            } else if (earnedDuringChallenge.length > 0) {
                                // Participation - earned at least one achievement during challenge month
                                participationGames.push({
                                    title: progress.title,
                                    date: challengeDate,
                                    earned: earnedDuringChallenge.length,
                                    total: challenge.monthly_challange_game_total,
                                    percentage
                                });
                                
                                // Add points to past challenge total
                                pastChallengePoints += POINTS.PARTICIPATION;
                                
                                // Save participation status if not already present
                                if (!userData || userData.progress < 1) {
                                    user.monthlyChallenges.set(dateKey, { progress: 1 });
                                    needDatabaseUpdate = true;
                                }
                            }
                        }
                    }
                    
                    // Also check shadow games for past months - ALWAYS process them regardless of revealed flag
                    // For past months, we treat all shadow games as revealed
                    if (challenge.shadow_challange_gameid) {
                        // Always process shadow games for past challenges
                        const shadowProgress = await retroAPI.getUserGameProgress(
                            raUsername, 
                            challenge.shadow_challange_gameid
                        );
                        
                        if (shadowProgress.numAwardedToUser > 0) {
                            // Calculate completion percentage
                            const percentage = (shadowProgress.numAwardedToUser / challenge.shadow_challange_game_total * 100).toFixed(1);
                            
                            const shadowUserData = user.shadowChallenges.get(dateKey);
                            
                            // Get only shadow achievements earned during the challenge month
                            const earnedShadowDuringChallenge = Object.entries(shadowProgress.achievements)
                                .filter(([id, data]) => wasEarnedDuringChallengeMonth(data.dateEarned, challengeDate))
                                .map(([id]) => id);
                            
                            // If no shadow achievements were earned during the challenge month, skip this challenge
                            if (earnedShadowDuringChallenge.length === 0) {
                                continue;
                            }
                            
                            // Check progression and win requirements for shadow games
                            const progressionAchievements = challenge.shadow_challange_progression_achievements || [];
                            const winAchievements = challenge.shadow_challange_win_achievements || [];
                            
                            const progressionCompletedInChallenge = progressionAchievements.length > 0 && 
                                progressionAchievements.every(id => earnedShadowDuringChallenge.includes(id));
                            
                            const hasWinConditionInChallenge = winAchievements.length === 0 || 
                                winAchievements.some(id => earnedShadowDuringChallenge.includes(id));
                            
                            // For shadow games, cap at "Beaten" status (4 points)
                            if (progressionCompletedInChallenge && hasWinConditionInChallenge) {
                                // Beaten is the highest status for shadow games
                                beatenShadowGames.push({
                                    title: shadowProgress.title,
                                    date: challengeDate,
                                    earned: shadowProgress.numAwardedToUser,
                                    total: challenge.shadow_challange_game_total,
                                    percentage
                                });
                                
                                // Add points to past challenge total (max SHADOW_MAX_POINTS)
                                pastChallengePoints += SHADOW_MAX_POINTS;
                                
                                // Save this to user's record (max 2 for shadow)
                                if (!shadowUserData || shadowUserData.progress < 2) {
                                    user.shadowChallenges.set(dateKey, { progress: 2 });
                                    needDatabaseUpdate = true;
                                }
                            } else if (earnedShadowDuringChallenge.length > 0) {
                                // Participation for shadow game
                                participationShadowGames.push({
                                    title: shadowProgress.title,
                                    date: challengeDate,
                                    earned: shadowProgress.numAwardedToUser,
                                    total: challenge.shadow_challange_game_total,
                                    percentage
                                });
                                
                                // Add points to past challenge total
                                pastChallengePoints += POINTS.PARTICIPATION;
                                
                                // Save participation status if not already present
                                if (!shadowUserData) {
                                    user.shadowChallenges.set(dateKey, { progress: 1 });
                                    needDatabaseUpdate = true;
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing past challenge for ${dateKey}:`, error);
                }
            }
            
            // Save user with possibly updated challenge records
            if (needDatabaseUpdate) {
                await user.save();
            }

            // Get community awards for the current year
            const currentYear = new Date().getFullYear();
            const communityAwards = user.getCommunityAwardsForYear(currentYear);
            communityPoints = user.getCommunityPointsForYear(currentYear);

            // Calculate total challenge points (current + past)
            let currentChallengePoints = 0;
            currentGamesProgress.forEach(game => {
                if (game.isShadow) {
                    // Shadow games are capped at SHADOW_MAX_POINTS
                    if (game.award === 'Beaten') {
                        currentChallengePoints += SHADOW_MAX_POINTS;
                    } else if (game.award === 'Participation') {
                        currentChallengePoints += POINTS.PARTICIPATION;
                    }
                } else {
                    // Regular games get full points
                    if (game.award === 'Mastery') {
                        currentChallengePoints += POINTS.MASTERY;
                    } else if (game.award === 'Beaten') {
                        currentChallengePoints += POINTS.BEATEN;
                    } else if (game.earned > 0) {
                        currentChallengePoints += POINTS.PARTICIPATION;
                    }
                }
            });

            const totalChallengePoints = currentChallengePoints + pastChallengePoints;

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`User Profile: ${raUsername}`)
                .setURL(`https://retroachievements.org/user/${raUsername}`)
                .setThumbnail(raUserInfo.profileImageUrl)
                .setColor('#0099ff');

            // Current Challenges Section - Using hierarchical points calculation
            let challengePoints = 0;
            if (currentGamesProgress.length > 0) {
                let currentChallengesField = '';
                
                for (const game of currentGamesProgress) {
                    let award = '';
                    let awardText = '';
                    let pointsEarned = 0;
                
                    if (game.isShadow) {
                        // Shadow games
                        if (game.award === 'Beaten') {
                            award = AWARD_EMOJIS.BEATEN;
                            awardText = 'Beaten - All progression + at least 1 win condition';
                            pointsEarned = SHADOW_MAX_POINTS;
                        } else if (game.earned > 0) {
                            award = AWARD_EMOJIS.PARTICIPATION;
                            awardText = 'Participation';
                            pointsEarned = POINTS.PARTICIPATION;
                        }
                        
                        currentChallengesField += `**${game.title} (Shadow)**\n`;
                    } else {
                        // Regular games
                        if (game.award === 'Mastery') {
                            award = AWARD_EMOJIS.MASTERY;
                            awardText = 'Mastery - All achievements completed';
                            pointsEarned = POINTS.MASTERY;
                        } else if (game.award === 'Beaten') {
                            award = AWARD_EMOJIS.BEATEN;
                            awardText = 'Beaten - All progression + at least 1 win condition';
                            pointsEarned = POINTS.BEATEN;
                        } else if (game.earned > 0) {
                            award = AWARD_EMOJIS.PARTICIPATION;
                            awardText = 'Participation';
                            pointsEarned = POINTS.PARTICIPATION;
                        }
                        
                        currentChallengesField += `**${game.title}**\n`;
                    }
                    
                    challengePoints += pointsEarned;
                    
                    currentChallengesField += 
                        `Progress: ${game.earned}/${game.total} (${game.percentage}%)\n` +
                        `Achievements Earned This Month: ${game.earnedThisMonth}\n` +
                        `Current Award: ${award} ${awardText} (${pointsEarned} points)\n\n`;
                }
                
                if (currentChallengesField) {
                    embed.addFields({ 
                        name: '📊 Current Challenges', 
                        value: currentChallengesField 
                    });
                } else {
                    embed.addFields({ 
                        name: '📊 Current Challenges', 
                        value: 'No achievements earned in the current challenge month.'
                    });
                }
            } else {
                embed.addFields({ 
                    name: '📊 Current Challenges', 
                    value: 'No achievements earned in the current challenge month.'
                });
            }

            // Game Awards Section - Sort games by date (newest first)
            const sortByDate = (a, b) => b.date - a.date;
            masteredGames.sort(sortByDate);
            beatenGames.sort(sortByDate);
            participationGames.sort(sortByDate);
            beatenShadowGames.sort(sortByDate);
            participationShadowGames.sort(sortByDate);
            
            let gameAwardsField = '';
            
            if (masteredGames.length > 0) {
                gameAwardsField += `**Mastered Games ${AWARD_EMOJIS.MASTERY}**\n`;
                masteredGames.forEach(game => {
                    const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                    gameAwardsField += `${game.title} (${monthYear}): ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
                gameAwardsField += '\n';
            }

            if (beatenGames.length > 0) {
                gameAwardsField += `**Beaten Games ${AWARD_EMOJIS.BEATEN}**\n`;
                beatenGames.forEach(game => {
                    const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                    gameAwardsField += `${game.title} (${monthYear}): ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
                gameAwardsField += '\n';
            }

            if (participationGames.length > 0) {
                gameAwardsField += `**Participation ${AWARD_EMOJIS.PARTICIPATION}**\n`;
                participationGames.forEach(game => {
                    const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                    gameAwardsField += `${game.title} (${monthYear}): ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
                gameAwardsField += '\n';
            }

            if (gameAwardsField) {
                embed.addFields({ name: '🎮 Past Game Awards', value: gameAwardsField });
            } else {
                embed.addFields({ name: '🎮 Past Game Awards', value: 'No past game awards.' });
            }

            // New section for Shadow Game Awards
            let shadowAwardsField = '';
            
            if (beatenShadowGames.length > 0) {
                shadowAwardsField += `**Beaten ${AWARD_EMOJIS.BEATEN}**\n`;
                beatenShadowGames.forEach(game => {
                    const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                    shadowAwardsField += `${game.title} (${monthYear}): ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
                shadowAwardsField += '\n';
            }

            if (participationShadowGames.length > 0) {
                shadowAwardsField += `**Participation ${AWARD_EMOJIS.PARTICIPATION}**\n`;
                participationShadowGames.forEach(game => {
                    const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                    shadowAwardsField += `${game.title} (${monthYear}): ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
                shadowAwardsField += '\n';
            }

            if (shadowAwardsField) {
                shadowAwardsField += "*Shadow games are ineligible for mastery awards*";
                embed.addFields({ name: '👥 Shadow Game Awards', value: shadowAwardsField });
            }

            // Community Awards Section
            if (communityAwards.length > 0) {
                let communityAwardsField = '';
                communityAwards.forEach(award => {
                    const awardDate = new Date(award.awardedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                    communityAwardsField += `🌟 **${award.title}** (${award.points} points) - ${awardDate}\n`;
                });
                embed.addFields({ name: '🏅 Community Awards', value: communityAwardsField });
            } else {
                embed.addFields({ name: '🏅 Community Awards', value: 'No community awards yet.' });
            }

            // Points Summary Section - Now includes past challenge points
            const totalPoints = totalChallengePoints + communityPoints;
            const pointsSummary = `**Total Current Points:** ${totalPoints}\n` +
                `**Monthly Challenges:** ${totalChallengePoints}\n` +
                `**Community Awards:** ${communityPoints}\n\n` +
                `*Note: Only achievements earned during the challenge month count toward points.*`;

            embed.addFields({ name: '🏆 Points Summary', value: pointsSummary });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error displaying profile:', error);
            return interaction.editReply('An error occurred while fetching the profile. Please try again.');
        }
    }
};
