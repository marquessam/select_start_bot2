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

// Function to check if a date is in the current month
function isCurrentMonth(date, now) {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

// TODO: Revert this back to just the current month.
function isDateInCurrentMonth(dateString) {
    // Parse the input date string
    const inputDate = new Date(dateString.replace(' ', 'T'));
    
    // Get the current date
    const currentDate = new Date();
    
    // Check if the input date's month and year match the current month and year
    return (inputDate.getMonth() === currentDate.getMonth() || inputDate.getMonth() === currentDate.getMonth() - 1) && 
           inputDate.getFullYear() === currentDate.getFullYear();
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
        await interaction.deferReply();

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
                        earnedThisMonth: achievementsEarnedThisMonth.length
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
                    
                    // Check if user has all achievements in the shadow game
                    const hasAllShadowAchievements = shadowAchievementsEarnedThisMonth.length === currentChallenge.shadow_challange_game_total;

                    // To get mastery points this month, user must have earned at least one achievement this month
                    // AND have the game 100% completed now
                    if (shadowAchievementsEarnedThisMonth.length > 0 && hasAllShadowAchievements) {
                        shadowPoints = 7; // Mastery
                        shadowAward = 'Mastery';
                    } 
                    // For beaten status, the user must have all progression achievements AND at least one win achievement (if any required)
                    // AND at least one of those achievements must have been earned this month
                    else if (totalValidShadowProgressionAchievements.length === progressionShadowAchievements.length && 
                             (winShadowAchievements.length === 0 || totalValidShadowWinAchievements.length > 0) &&
                             (earnedShadowProgressionInMonth.length > 0 || earnedShadowWinInMonth.length > 0)) {
                        shadowPoints = 4; // Beaten - using this same value for database consistency
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
                            title: shadowGameProgress.title + " (Shadow)",
                            earned: shadowGameProgress.numAwardedToUser,
                            total: currentChallenge.shadow_challange_game_total,
                            percentage: (shadowAchievementsEarnedThisMonth.length / currentChallenge.shadow_challange_game_total * 100).toFixed(1),
                            award: shadowAward,
                            earnedThisMonth: shadowAchievementsEarnedThisMonth.length
                        });
                    }
                }
            }

            // Calculate awards and points
            let masteredGames = [];
            let beatenGames = [];
            let participationGames = [];
            let communityPoints = 0;
            
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
                        
                        // Determine status based on achievement count
                        if (progress.numAwardedToUser === challenge.monthly_challange_game_total) {
                            // Mastery
                            masteredGames.push({
                                title: progress.title,
                                date: challengeDate,
                                earned: progress.numAwardedToUser,
                                total: challenge.monthly_challange_game_total,
                                percentage
                            });
                            
                            // Save this to user's record if not already present
                            if (!userData || userData.progress < 3) {
                                user.monthlyChallenges.set(dateKey, { progress: 3 });
                            }
                        } else if (userData && userData.progress === 2) {
                            // Beaten (use stored status)
                            beatenGames.push({
                                title: progress.title,
                                date: challengeDate,
                                earned: progress.numAwardedToUser,
                                total: challenge.monthly_challange_game_total,
                                percentage
                            });
                        } else if (userData && userData.progress === 1) {
                            // Participation
                            participationGames.push({
                                title: progress.title,
                                date: challengeDate,
                                earned: progress.numAwardedToUser,
                                total: challenge.monthly_challange_game_total,
                                percentage
                            });
                        } else {
                            // No stored status, but has some achievements - add as participation
                            participationGames.push({
                                title: progress.title,
                                date: challengeDate,
                                earned: progress.numAwardedToUser,
                                total: challenge.monthly_challange_game_total,
                                percentage
                            });
                            
                            // Save participation status if not already present
                            if (!userData) {
                                user.monthlyChallenges.set(dateKey, { progress: 1 });
                            }
                        }
                    }
                    
                    // Also check shadow games for past months
                    if (challenge.shadow_challange_gameid && challenge.shadow_challange_revealed) {
                        const shadowProgress = await retroAPI.getUserGameProgress(
                            raUsername, 
                            challenge.shadow_challange_gameid
                        );
                        
                        if (shadowProgress.numAwardedToUser > 0) {
                            // Calculate completion percentage
                            const percentage = (shadowProgress.numAwardedToUser / challenge.shadow_challange_game_total * 100).toFixed(1);
                            const shadowTitle = `${shadowProgress.title} (Shadow)`;
                            
                            const shadowUserData = user.shadowChallenges.get(dateKey);
                            
                            if (shadowProgress.numAwardedToUser === challenge.shadow_challange_game_total) {
                                // Mastery
                                masteredGames.push({
                                    title: shadowTitle,
                                    date: challengeDate,
                                    earned: shadowProgress.numAwardedToUser,
                                    total: challenge.shadow_challange_game_total,
                                    percentage
                                });
                                
                                // Save this to user's record if not already present
                                if (!shadowUserData || shadowUserData.progress < 3) {
                                    user.shadowChallenges.set(dateKey, { progress: 3 });
                                }
                            } else if (shadowUserData && shadowUserData.progress === 2) {
                                // Beaten (use stored status)
                                beatenGames.push({
                                    title: shadowTitle,
                                    date: challengeDate,
                                    earned: shadowProgress.numAwardedToUser,
                                    total: challenge.shadow_challange_game_total,
                                    percentage
                                });
                            } else if (shadowUserData && shadowUserData.progress === 1) {
                                // Participation
                                participationGames.push({
                                    title: shadowTitle,
                                    date: challengeDate,
                                    earned: shadowProgress.numAwardedToUser,
                                    total: challenge.shadow_challange_game_total,
                                    percentage
                                });
                            } else {
                                // No stored status, but has some achievements - add as participation
                                participationGames.push({
                                    title: shadowTitle,
                                    date: challengeDate,
                                    earned: shadowProgress.numAwardedToUser,
                                    total: challenge.shadow_challange_game_total,
                                    percentage
                                });
                                
                                // Save participation status if not already present
                                if (!shadowUserData) {
                                    user.shadowChallenges.set(dateKey, { progress: 1 });
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing past challenge for ${dateKey}:`, error);
                }
            }
            
            // Save user with possibly updated challenge records
            await user.save();

            // Get community awards for the current year
            const currentYear = new Date().getFullYear();
            const communityAwards = user.getCommunityAwardsForYear(currentYear);
            communityPoints = user.getCommunityPointsForYear(currentYear);

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
                    
                    challengePoints += pointsEarned;
                    
                    currentChallengesField += `**${game.title}**\n` +
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
            }

            if (gameAwardsField) {
                embed.addFields({ name: '🎮 Past Game Awards', value: gameAwardsField });
            } else {
                embed.addFields({ name: '🎮 Past Game Awards', value: 'No past game awards.' });
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

            // Points Summary Section
            const totalPoints = challengePoints + communityPoints;
            const pointsSummary = `**Total Current Points:** ${totalPoints}\n` +
                `**Monthly Challenges:** ${challengePoints}\n` +
                `**Community Awards:** ${communityPoints}\n\n` +
                `*Note: Only achievements earned during the current month count toward challenge points.*`;

            embed.addFields({ name: '🏆 Points Summary', value: pointsSummary });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error displaying profile:', error);
            return interaction.editReply('An error occurred while fetching the profile. Please try again.');
        }
    }
};
