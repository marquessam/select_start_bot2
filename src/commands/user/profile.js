import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType
} from 'discord.js';
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
            // Store profile data in a single object to pass between pages
            const profileData = {};
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
            profileData.raUserInfo = raUserInfo;

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
            profileData.currentGamesProgress = currentGamesProgress;

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

            // Get recent achievements data
            const recentAchievements = await retroAPI.getUserRecentAchievements(raUsername, 5);
            profileData.recentAchievements = recentAchievements;

            // Sort past games arrays by date (newest first)
            const sortByDate = (a, b) => b.date - a.date;
            masteredGames.sort(sortByDate);
            beatenGames.sort(sortByDate);
            participationGames.sort(sortByDate);
            beatenShadowGames.sort(sortByDate);
            participationShadowGames.sort(sortByDate);

            // Store game awards in profile data
            profileData.masteredGames = masteredGames;
            profileData.beatenGames = beatenGames;
            profileData.participationGames = participationGames;
            profileData.beatenShadowGames = beatenShadowGames;
            profileData.participationShadowGames = participationShadowGames;

            // Get community awards for the current year
            const currentYear = new Date().getFullYear();
            const communityAwards = user.getCommunityAwardsForYear(currentYear);
            communityPoints = user.getCommunityPointsForYear(currentYear);
            profileData.communityAwards = communityAwards;
            profileData.communityPoints = communityPoints;

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

            profileData.currentChallengePoints = currentChallengePoints;
            profileData.pastChallengePoints = pastChallengePoints;
            profileData.totalChallengePoints = currentChallengePoints + pastChallengePoints;
            profileData.totalPoints = profileData.totalChallengePoints + communityPoints;
            
            // Now that we have all the data, display the profile with pagination
            await this.displayPaginatedProfile(interaction, raUsername, profileData);

        } catch (error) {
            console.error('Error displaying profile:', error);
            return interaction.editReply('An error occurred while fetching the profile. Please try again.');
        }
    },

    async displayPaginatedProfile(interaction, raUsername, profileData) {
        // Create the overview embed (main page)
        const overviewEmbed = await this.createOverviewEmbed(raUsername, profileData);

        // Create navigation buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('overview')
                    .setLabel('Overview')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('👤'),
                new ButtonBuilder()
                    .setCustomId('awards')
                    .setLabel('Awards')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🏆'),
                new ButtonBuilder()
                    .setCustomId('shadow')
                    .setLabel('Shadow Games')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('👥'),
                new ButtonBuilder()
                    .setCustomId('community')
                    .setLabel('Community')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🌟'),
                new ButtonBuilder()
                    .setCustomId('points')
                    .setLabel('Points')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📊')
            );

        // Send the initial message with buttons
        const message = await interaction.editReply({
            embeds: [overviewEmbed],
            components: [row]
        });

        // Create collector for button interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // Time limit: 5 minutes
        });

        // Handle button clicks
        collector.on('collect', async (i) => {
            // We need to defer the update to avoid interaction timeouts
            await i.deferUpdate();

            // Handle different button clicks
            switch (i.customId) {
                case 'overview':
                    const overviewEmbed = await this.createOverviewEmbed(raUsername, profileData);
                    await i.editReply({ embeds: [overviewEmbed], components: [row] });
                    break;
                case 'awards':
                    const awardsEmbed = await this.createAwardsEmbed(raUsername, profileData);
                    await i.editReply({ embeds: [awardsEmbed], components: [row] });
                    break;
                case 'shadow':
                    const shadowEmbed = await this.createShadowEmbed(raUsername, profileData);
                    await i.editReply({ embeds: [shadowEmbed], components: [row] });
                    break;
                case 'community':
                    const communityEmbed = await this.createCommunityEmbed(raUsername, profileData);
                    await i.editReply({ embeds: [communityEmbed], components: [row] });
                    break;
                case 'points':
                    const pointsEmbed = await this.createPointsEmbed(raUsername, profileData);
                    await i.editReply({ embeds: [pointsEmbed], components: [row] });
                    break;
            }
        });

        // When the collector expires
        collector.on('end', async () => {
            try {
                // Disable all buttons when time expires
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        row.components[0].setDisabled(true),
                        row.components[1].setDisabled(true),
                        row.components[2].setDisabled(true),
                        row.components[3].setDisabled(true),
                        row.components[4].setDisabled(true)
                    );

                // Update with disabled buttons
                await interaction.editReply({
                    embeds: [overviewEmbed.setFooter({ text: 'Profile session expired • Use /help for more information' })],
                    components: [disabledRow]
                });
            } catch (error) {
                console.error('Error disabling buttons:', error);
            }
        });
    },

    // Create separate embeds for each page
async createOverviewEmbed(raUsername, profileData) {
    const raUserInfo = profileData.raUserInfo;
    const currentGamesProgress = profileData.currentGamesProgress;
    const recentAchievements = profileData.recentAchievements;
    
    const embed = new EmbedBuilder()
        .setTitle(`User Profile: ${raUsername}`)
        .setURL(`https://retroachievements.org/user/${raUsername}`)
        .setThumbnail(raUserInfo.profileImageUrl)
        .setColor('#0099ff');
    
    // Add RetroAchievements site info with improved formatting and more details
    if (raUserInfo) {
        // Calculate percentage ranking if possible
        let rankPercentage = '';
        if (raUserInfo.rank && raUserInfo.totalRanked) {
            const percentage = (raUserInfo.rank / raUserInfo.totalRanked * 100).toFixed(2);
            rankPercentage = ` (Top ${percentage}%)`;
        }
        
        // Format dates - handle different possible formats from API
        const memberSince = raUserInfo.memberSince || raUserInfo.created || raUserInfo.createdDate || raUserInfo.registrationDate;
        const formattedMemberSince = memberSince ? 
            new Date(memberSince).toLocaleDateString('en-US', {
                year: 'numeric', 
                month: 'short', 
                day: 'numeric'
            }) : 'Unknown';
        
        // Format the lastActivity object properly
        let lastActivity = 'Unknown';
        if (raUserInfo.lastActivity) {
            if (typeof raUserInfo.lastActivity === 'object') {
                // Try to extract meaningful information
                lastActivity = "Recently active"; // Default friendly message
                
                // If timestamp exists and is valid, use that
                if (raUserInfo.lastActivity.timestamp && raUserInfo.lastActivity.timestamp !== 'null') {
                    try {
                        const timestamp = new Date(raUserInfo.lastActivity.timestamp);
                        lastActivity = timestamp.toLocaleString();
                    } catch (e) {
                        // If we can't parse the timestamp, fall back to a simple message
                        lastActivity = "Recently active";
                    }
                }
            } else if (typeof raUserInfo.lastActivity === 'string') {
                lastActivity = raUserInfo.lastActivity;
            }
        } else if (raUserInfo.lastLogin) {
            lastActivity = raUserInfo.lastLogin;
        }
        
        // Build RA site stats section with direct property access
        const raStatsValue = [
            `🏆 **Points:** ${raUserInfo.totalPoints || 0}${raUserInfo.hardcorePoints ? ` (HC: ${raUserInfo.hardcorePoints})` : ''}`,
            `🎮 **Achievements:** ${raUserInfo.totalAchievements || raUserInfo.numAchievements || 0}`,
            `⭐ **Mastered Games:** ${raUserInfo.totalCompletedGames || raUserInfo.masteredGamesCount || 0}`,
            `📈 **Site Rank:** #${raUserInfo.rank || '—'}${rankPercentage}`,
            `📊 **RetroRatio:** ${raUserInfo.retroRatio || '—'}`,
            `🎯 **Completion Rate:** ${raUserInfo.completionPercentage ? `${raUserInfo.completionPercentage}%` : '—'}`,
            `📅 **Member Since:** ${formattedMemberSince}`,
            `⏱️ **Last Activity:** ${lastActivity}`
        ].join('\n');
        
        embed.addFields({
            name: '📊 RetroAchievements Site Info',
            value: raStatsValue
        });
    }
    
    // Add rich presence if available
    const richPresence = raUserInfo.richPresenceMsg || raUserInfo.richPresence || raUserInfo.currentlyPlaying;
    if (richPresence) {
        // Check if it's a string or an object
        let displayValue = typeof richPresence === 'string' ? 
            richPresence : 
            (richPresence.msg || richPresence.message || JSON.stringify(richPresence));
            
        embed.addFields({
            name: '🎮 Currently Playing',
            value: displayValue
        });
    }
    
    // Recent achievements section
    if (recentAchievements && recentAchievements.length > 0) {
        let recentAchievementsField = '';
        
        for (let i = 0; i < Math.min(recentAchievements.length, 3); i++) {
            const achievement = recentAchievements[i];
            const dateEarned = achievement.DateEarned ? 
                new Date(achievement.DateEarned).toLocaleDateString() : 'Unknown date';
            
            recentAchievementsField += `**${achievement.Title}** (${achievement.Points} pts)\n` +
                                      `Game: ${achievement.GameTitle}\n` +
                                      `Earned: ${dateEarned}\n\n`;
        }
        
        if (recentAchievementsField) {
            embed.addFields({
                name: '🆕 Recent Achievements',
                value: recentAchievementsField || 'No recent achievements.'
            });
        }
    }
    
    // Current Challenges Section
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
                    awardText = 'Beaten';
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
                    awardText = 'Mastery';
                    pointsEarned = POINTS.MASTERY;
                } else if (game.award === 'Beaten') {
                    award = AWARD_EMOJIS.BEATEN;
                    awardText = 'Beaten';
                    pointsEarned = POINTS.BEATEN;
                } else if (game.earned > 0) {
                    award = AWARD_EMOJIS.PARTICIPATION;
                    awardText = 'Participation';
                    pointsEarned = POINTS.PARTICIPATION;
                }
                
                currentChallengesField += `**${game.title}**\n`;
            }
            
            currentChallengesField += 
                `Progress: ${game.earned}/${game.total} (${game.percentage}%)\n` +
                `Achievements Earned This Month: ${game.earnedThisMonth}\n` +
                `Award: ${award} ${awardText} (${pointsEarned} pts)\n\n`;
        }
        
        if (currentChallengesField) {
            embed.addFields({ 
                name: '🎯 Community Challenge Progress', 
                value: currentChallengesField 
            });
        } else {
            embed.addFields({ 
                name: '🎯 Community Challenge Progress', 
                value: 'No achievements earned in the current challenge month.\nUse `/challenge` to see this month\'s games.'
            });
        }
    } else {
        embed.addFields({ 
            name: '🎯 Community Challenge Progress', 
            value: 'No achievements earned in the current challenge month.\nUse `/challenge` to see this month\'s games.'
        });
    }
    
    // Add community points summary teaser
    embed.addFields({
        name: '🏆 Community Points Summary',
        value: `**Total Community Points: ${profileData.totalPoints}**\n` +
               `*These points are specific to our community and separate from RetroAchievements site points*`
    });
    
    // Add a recently played games section if available
    if (raUserInfo.recentlyPlayedGames && raUserInfo.recentlyPlayedGames.length > 0) {
        let recentGamesField = '';
        
        for (let i = 0; i < Math.min(raUserInfo.recentlyPlayedGames.length, 3); i++) {
            const game = raUserInfo.recentlyPlayedGames[i];
            recentGamesField += `**${game.title || game.Title}**\n` +
                              `Console: ${game.consoleName || game.ConsoleName || 'Unknown'}\n` +
                              `Last played: ${game.lastPlayed || game.LastPlayed || 'Unknown'}\n\n`;
        }
        
        if (recentGamesField) {
            embed.addFields({
                name: '🎮 Recently Played Games',
                value: recentGamesField
            });
        }
    }
    
    embed.setFooter({ text: 'Use the buttons below to navigate • For community info use /help' })
         .setTimestamp();
    
    return embed;
},
    
    async createAwardsEmbed(raUsername, profileData) {
        const masteredGames = profileData.masteredGames;
        const beatenGames = profileData.beatenGames;
        const participationGames = profileData.participationGames;
        
        const embed = new EmbedBuilder()
            .setTitle(`Game Awards: ${raUsername}`)
            .setURL(`https://retroachievements.org/user/${raUsername}`)
            .setThumbnail(profileData.raUserInfo.profileImageUrl)
            .setColor('#E67E22');
        
        // Game Awards Section
        let gameAwardsField = '';
        
        if (masteredGames.length > 0) {
            gameAwardsField += `**Mastered Games ${AWARD_EMOJIS.MASTERY}**\n`;
            masteredGames.slice(0, 5).forEach(game => {
                const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                gameAwardsField += `${game.title} (${monthYear}): ${game.earned}/${game.total} (${game.percentage}%)\n`;
            });
            
            if (masteredGames.length > 5) {
                gameAwardsField += `*...and ${masteredGames.length - 5} more mastered games*\n`;
            }
            
            gameAwardsField += '\n';
        }

        if (beatenGames.length > 0) {
            gameAwardsField += `**Beaten Games ${AWARD_EMOJIS.BEATEN}**\n`;
            beatenGames.slice(0, 5).forEach(game => {
                const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                gameAwardsField += `${game.title} (${monthYear}): ${game.earned}/${game.total} (${game.percentage}%)\n`;
            });
            
            if (beatenGames.length > 5) {
                gameAwardsField += `*...and ${beatenGames.length - 5} more beaten games*\n`;
            }
            
            gameAwardsField += '\n';
        }

        if (participationGames.length > 0) {
            gameAwardsField += `**Participation ${AWARD_EMOJIS.PARTICIPATION}**\n`;
            participationGames.slice(0, 5).forEach(game => {
                const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                gameAwardsField += `${game.title} (${monthYear}): ${game.earned}/${game.total} (${game.percentage}%)\n`;
            });
            
            if (participationGames.length > 5) {
                gameAwardsField += `*...and ${participationGames.length - 5} more participation games*\n`;
            }
            
            gameAwardsField += '\n';
        }

        if (gameAwardsField) {
            embed.addFields({ name: '🎮 Past Game Awards', value: gameAwardsField });
        } else {
            embed.addFields({ name: '🎮 Past Game Awards', value: 'No past game awards.' });
        }
        
        // Add RA awards if available
        if (profileData.raUserInfo.awards && profileData.raUserInfo.awards.length > 0) {
            let raAwardsField = '';
            const raAwards = profileData.raUserInfo.awards.slice(0, 5);
            
            raAwards.forEach(award => {
                const awardDate = new Date(award.awardedAt || award.AwardedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                raAwardsField += `🏅 **${award.title || award.Title}** - ${awardDate}\n`;
                if (award.description || award.Description) {
                    raAwardsField += `${award.description || award.Description}\n`;
                }
                raAwardsField += '\n';
            });
            
            if (profileData.raUserInfo.awards.length > 5) {
                raAwardsField += `*...and ${profileData.raUserInfo.awards.length - 5} more RetroAchievements awards*\n`;
            }
            
            embed.addFields({ name: '🏅 RetroAchievements Site Awards', value: raAwardsField });
        }
        
        // Simple awards count
        const totalGames = masteredGames.length + beatenGames.length + participationGames.length;
        const summaryField = 
            `**Total Challenge Games:** ${totalGames}\n` +
            `**Mastered Games:** ${masteredGames.length}\n` +
            `**Beaten Games:** ${beatenGames.length}\n` +
            `**Participation Games:** ${participationGames.length}\n\n` +
            `For information about points, check out \`/help points\``;
        
        embed.addFields({ name: '📊 Awards Summary', value: summaryField });
        
        embed.setFooter({ text: 'Use the buttons below to navigate • For challenges info use /help challenges' })
             .setTimestamp();
        
        return embed;
    },

    async createShadowEmbed(raUsername, profileData) {
        const beatenShadowGames = profileData.beatenShadowGames;
        const participationShadowGames = profileData.participationShadowGames;
        
        const embed = new EmbedBuilder()
            .setTitle(`Shadow Game Awards: ${raUsername}`)
            .setURL(`https://retroachievements.org/user/${raUsername}`)
            .setThumbnail(profileData.raUserInfo.profileImageUrl)
            .setColor('#9B59B6');
        
        // Simple description with help reference
        embed.setDescription(
            'Shadow games are bonus challenges hidden within the community.\n' +
            'Use `/help shadow` for more information about shadow games.\n' +
            'Use `/shadowguess` to try guessing the current shadow game.'
        );
        
        // Shadow Game Awards
        let shadowAwardsField = '';
        
        if (beatenShadowGames.length > 0) {
            shadowAwardsField += `**Beaten Shadow Games ${AWARD_EMOJIS.BEATEN}**\n`;
            beatenShadowGames.forEach(game => {
                const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                shadowAwardsField += `${game.title} (${monthYear}): ${game.earned}/${game.total} (${game.percentage}%)\n`;
            });
            shadowAwardsField += '\n';
        }

        if (participationShadowGames.length > 0) {
            shadowAwardsField += `**Participation in Shadow Games ${AWARD_EMOJIS.PARTICIPATION}**\n`;
            participationShadowGames.forEach(game => {
                const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                shadowAwardsField += `${game.title} (${monthYear}): ${game.earned}/${game.total} (${game.percentage}%)\n`;
            });
            shadowAwardsField += '\n';
        }

        if (shadowAwardsField) {
            embed.addFields({ name: '👥 Shadow Game Awards', value: shadowAwardsField });
        } else {
            embed.addFields({ name: '👥 Shadow Game Awards', value: 'No shadow game awards yet.' });
        }
        
        // Current shadow game challenge (if available)
        const currentShadowGame = profileData.currentGamesProgress?.find(game => game.isShadow);
        if (currentShadowGame) {
            embed.addFields({
                name: '🎮 Current Shadow Game Challenge',
                value: `**Game:** ${currentShadowGame.title}\n` +
                       `**Progress:** ${currentShadowGame.earned}/${currentShadowGame.total} (${currentShadowGame.percentage}%)\n` +
                       `**Achievements Earned This Month:** ${currentShadowGame.earnedThisMonth}\n` +
                       `**Award:** ${currentShadowGame.award === 'Beaten' ? AWARD_EMOJIS.BEATEN + ' Beaten' : AWARD_EMOJIS.PARTICIPATION + ' Participation'}`
            });
        }
        
        // Simpler summary
        embed.addFields({ 
            name: '📊 Shadow Games Summary', 
            value: `**Total Shadow Games:** ${beatenShadowGames.length + participationShadowGames.length}\n` +
                   `**Beaten Shadow Games:** ${beatenShadowGames.length}\n` +
                   `**Participation Games:** ${participationShadowGames.length}`
        });
        
        embed.setFooter({ text: 'Use the buttons below to navigate • Check /challenge for current games' })
             .setTimestamp();
        
        return embed;
    },

    async createCommunityEmbed(raUsername, profileData) {
        const communityAwards = profileData.communityAwards;
        const communityPoints = profileData.communityPoints;
        
        const embed = new EmbedBuilder()
            .setTitle(`Community Awards: ${raUsername}`)
            .setURL(`https://retroachievements.org/user/${raUsername}`)
            .setThumbnail(profileData.raUserInfo.profileImageUrl)
            .setColor('#2ECC71');
        
        // Brief description
        embed.setDescription(
            'Community awards are special recognitions given by administrators.\n' +
            'Use `/help community` for information about our community rules and guidelines.'
        );
        
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
                if (award.description) {
                    communityAwardsField += `${award.description}\n`;
                }
                communityAwardsField += '\n';
            });
            embed.addFields({ name: '🏅 Community Awards', value: communityAwardsField });
        } else {
            embed.addFields({ name: '🏅 Community Awards', value: 'No community awards yet.' });
        }
        
        // Points reference instead of explanation
        embed.addFields({
            name: '🏆 Community Points',
            value: 'Community points are earned through monthly challenges, shadow games, ' +
                   'racing events, arcade leaderboards, and special awards.\n\n' +
                   'For detailed information about how points are earned, use `/help points`.'
        });
        
        // Simple summary of community points
        embed.addFields({ 
            name: '📊 Community Points Summary', 
            value: `**Total Community Award Points:** ${communityPoints}\n` +
                   `**Total Community Awards:** ${communityAwards.length}`
        });
        
        embed.setFooter({ text: 'Use the buttons below to navigate • For more info use /help' })
             .setTimestamp();
        
        return embed;
    },
    
    async createPointsEmbed(raUsername, profileData) {
        const embed = new EmbedBuilder()
            .setTitle(`Points Summary: ${raUsername}`)
            .setURL(`https://retroachievements.org/user/${raUsername}`)
            .setThumbnail(profileData.raUserInfo.profileImageUrl)
            .setColor('#3498DB');
        
        // Calculate points from different categories
        const masteryPoints = profileData.masteredGames.length * POINTS.MASTERY;
        const beatenPoints = profileData.beatenGames.length * POINTS.BEATEN;
        const participationPoints = profileData.participationGames.length * POINTS.PARTICIPATION;
        
        const beatenShadowPoints = profileData.beatenShadowGames.length * SHADOW_MAX_POINTS;
        const partShadowPoints = profileData.participationShadowGames.length * POINTS.PARTICIPATION;
        
        const currentPoints = profileData.currentChallengePoints;
        const communityPoints = profileData.communityPoints;
        
        const totalGamePoints = masteryPoints + beatenPoints + participationPoints;
        const totalShadowPoints = beatenShadowPoints + partShadowPoints;
        const totalChallengePoints = totalGamePoints + totalShadowPoints + currentPoints;
        const totalPoints = totalChallengePoints + communityPoints;
        
        // Simple reference to point system
        embed.setDescription(
            'This is a summary of your earned community points.\n' +
            'For detailed information about the points system, use `/help points`.'
        );
        
        // Points breakdown
        embed.addFields({
            name: '🏆 Total Points',
            value: `**Total Community Points: ${totalPoints}**`
        });
        
        // Current month points
        embed.addFields({
            name: '📅 Current Month',
            value: `**Points from Current Challenges:** ${currentPoints}`
        });
        
        // Regular game points
        embed.addFields({
            name: '🎮 Regular Game Points',
            value: `**Total Game Challenge Points:** ${totalGamePoints}\n` +
                   `• Mastery: ${masteryPoints} points\n` +
                   `• Beaten: ${beatenPoints} points\n` +
                   `• Participation: ${participationPoints} points`
        });
        
        // Shadow games
        embed.addFields({
            name: '👥 Shadow Game Points',
            value: `**Total Shadow Game Points:** ${totalShadowPoints}\n` +
                   `• Beaten: ${beatenShadowPoints} points\n` +
                   `• Participation: ${partShadowPoints} points`
        });
        
        // Community awards
        embed.addFields({
            name: '🌟 Community Awards',
            value: `**Total Community Award Points:** ${communityPoints}`
        });
        
        // Year-end reference
        embed.addFields({
            name: '🏅 Year-End Rankings',
            value: 'All points are totaled on December 1st for year-end prizes.\n' +
                   'Check yearly standings with `/yearlyboard`.'
        });
        
        embed.setFooter({ text: 'Use the buttons below to navigate • For details use /help points' })
             .setTimestamp();
        
        return embed;
    }
};
