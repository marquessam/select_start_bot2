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

// List of historical challenges for 2025 (January through April)
const HISTORICAL_CHALLENGES = [
    {
        month: 1, // January
        year: 2025,
        main: {
            gameId: "319",
            name: "Chrono Trigger",
            progression: ["2080", "2081", "2085", "2090", "2191", "2100", "2108", "2129", "2133"],
            win: ["2266", "2281"],
            total: 108 // You may need to adjust this value based on the actual total
        },
        shadow: {
            gameId: "10024",
            name: "Mario Tennis",
            progression: [],
            win: ["48411", "48412"],
            total: 36 // You may need to adjust this value based on the actual total
        }
    },
    {
        month: 2, // February
        year: 2025,
        main: {
            gameId: "355",
            name: "A Link to the Past",
            progression: ["944", "2192", "2282", "980", "2288", "2291", "2292", "2296", "2315", "2336", "2351", 
                          "2357", "2359", "2361", "2365", "2334", "2354", "2368", "2350", "2372", "2387"],
            win: ["2389"],
            total: 85 // You may need to adjust this value based on the actual total
        },
        shadow: {
            gameId: "274",
            name: "UN Squadron",
            progression: ["6413", "6414", "6415", "6416", "6417", "6418", "6419", "6420", "6421"],
            win: ["6422"],
            total: 15 // You may need to adjust this value based on the actual total
        }
    },
    {
        month: 3, // March
        year: 2025,
        main: {
            gameId: "11335",
            name: "Mega Man X5",
            progression: ["87067", "87078", "87079"],
            win: ["87083", "87084", "87085"],
            total: 46 // You may need to adjust this value based on the actual total
        },
        shadow: {
            gameId: "7181",
            name: "Monster Rancher Advance 2",
            progression: ["171381", "171382", "171383", "171384", "171385", 
                          "171386", "171387", "171388", "171389", "171390"],
            win: ["171391"],
            total: 25 // You may need to adjust this value based on the actual total
        }
    },
    {
        month: 4, // April
        year: 2025,
        main: {
            gameId: "11283",
            name: "Ape Escape",
            progression: ["97947", "97948", "97950", "97951", "97953", "97954"],
            win: ["97955"],
            total: 68 // You may need to adjust this value based on the actual total
        },
        shadow: {
            gameId: "506",
            name: "Advance Wars",
            progression: ["11353", "11355", "11357", "11359", "11487", "11488"],
            win: ["11489"],
            total: 48 // You may need to adjust this value based on the actual total
        }
    }
];

// Helper function to process a user's achievements for a specific game
async function processGameAchievements(username, gameId, progressionIds, winIds, totalAchievements) {
    try {
        const progress = await retroAPI.getUserGameProgress(username, gameId);
        
        // Get user earned achievement ids
        const userEarnedAchievements = Object.entries(progress.achievements)
            .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
            .map(([id, data]) => id);
        
        // Calculate completion percentage
        const percentage = (progress.numAwardedToUser / totalAchievements * 100).toFixed(1);
        
        // Check if user has all progression achievements
        const hasAllProgressionAchievements = progressionIds.every(
            id => userEarnedAchievements.includes(id)
        );

        // Check if user has at least one win condition (if any exist)
        const hasWinCondition = winIds.length === 0 || 
            winIds.some(id => userEarnedAchievements.includes(id));

        // Check if user has all achievements in the game
        const hasAllAchievements = progress.numAwardedToUser === totalAchievements;
        
        if (progress.numAwardedToUser === 0) {
            return null; // User hasn't started this game
        }
        
        let award = 'PARTICIPATION';
        if (hasAllAchievements) {
            award = 'MASTERY';
        } else if (hasAllProgressionAchievements && hasWinCondition) {
            award = 'BEATEN';
        }
        
        return {
            title: progress.title,
            earned: progress.numAwardedToUser,
            total: totalAchievements,
            percentage,
            award
        };
    } catch (error) {
        console.error(`Error processing game achievements for ${username} in game ${gameId}:`, error);
        return null;
    }
}

// Helper function to check if a user has been updated with historical data
async function processHistoricalData(user) {
    // Check if user already has a flag indicating this was done
    if (user.historicalDataProcessed) {
        return false; // Already processed, no changes made
    }
    
    let changesDetected = false;
    const currentMonth = new Date().getMonth() + 1; // 1-12 (January is 1)
    const currentYear = new Date().getFullYear();
    
    // Process each historical challenge except the current month
    for (const challenge of HISTORICAL_CHALLENGES) {
        // Skip current month's challenge
        if (challenge.year === currentYear && challenge.month === currentMonth) {
            continue;
        }
        
        const dateStr = `${challenge.year}-${challenge.month.toString().padStart(2, '0')}-01`;
        const dateKey = User.formatDateKey(new Date(dateStr));
        
        // Process main challenge
        if (challenge.main && !user.monthlyChallenges.has(dateKey)) {
            try {
                const mainProgress = await processGameAchievements(
                    user.raUsername,
                    challenge.main.gameId,
                    challenge.main.progression,
                    challenge.main.win,
                    challenge.main.total
                );
                
                if (mainProgress) {
                    let points = 1; // Participation
                    if (mainProgress.award === 'MASTERY' || mainProgress.award === 'BEATEN') {
                        points = 3; // Beaten or Mastery
                    }
                    
                    user.monthlyChallenges.set(dateKey, { progress: points });
                    changesDetected = true;
                }
            } catch (error) {
                console.error(`Error processing historical main challenge for ${user.raUsername}:`, error);
            }
        }
        
        // Process shadow challenge
        if (challenge.shadow && !user.shadowChallenges.has(dateKey)) {
            try {
                const shadowProgress = await processGameAchievements(
                    user.raUsername,
                    challenge.shadow.gameId,
                    challenge.shadow.progression,
                    challenge.shadow.win,
                    challenge.shadow.total
                );
                
                if (shadowProgress) {
                    let points = 1; // Participation
                    if (shadowProgress.award === 'MASTERY' || shadowProgress.award === 'BEATEN') {
                        points = 3; // Beaten or Mastery
                    }
                    
                    user.shadowChallenges.set(dateKey, { progress: points });
                    changesDetected = true;
                }
            } catch (error) {
                console.error(`Error processing historical shadow challenge for ${user.raUsername}:`, error);
            }
        }
    }
    
    // Mark user as processed regardless of outcome
    user.historicalDataProcessed = true;
    await user.save();
    
    return changesDetected;
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

            // Check if historical data needs to be processed
            await processHistoricalData(user);

            // Get current date for finding current challenges
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const currentMonth = now.getMonth() + 1; // 1-12 (January is 1)
            const currentYear = now.getFullYear();

            // Get current challenges
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

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
                
                // Get the user's earned achievements from the progress data
                const userEarnedAchievements = Object.entries(mainGameProgress.achievements)
                    .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
                    .map(([id, data]) => id);

                // Check if user has all progression achievements
                const hasAllProgressionAchievements = currentChallenge.monthly_challange_progression_achievements.every(
                    id => userEarnedAchievements.includes(id)
                );

                // Check if user has at least one win condition (if any exist)
                const hasWinCondition = currentChallenge.monthly_challange_win_achievements.length === 0 || 
                    currentChallenge.monthly_challange_win_achievements.some(id => userEarnedAchievements.includes(id));

                // Check if user has all achievements in the game
                const hasAllAchievements = mainGameProgress.numAwardedToUser === currentChallenge.monthly_challange_game_total;

                // Calculate award level for monthly challenge based on specific achievements
                let monthlyPoints = 0;
                let award = 'Participation';
                if (hasAllAchievements) {
                    monthlyPoints = 3; // Mastery
                    award = 'Mastery';
                } else if (hasAllProgressionAchievements && hasWinCondition) {
                    monthlyPoints = 3; // Beaten
                    award = 'Beaten';
                } else if (mainGameProgress.numAwardedToUser > 0) {
                    monthlyPoints = 1; // Participation
                }
                
                // Update user's monthly challenge progress in the database
                const monthKey = User.formatDateKey(currentChallenge.date);
                user.monthlyChallenges.set(monthKey, { progress: monthlyPoints });
                
                // Add progress to the display array
                currentGamesProgress.push({
                    title: mainGameProgress.title,
                    earned: mainGameProgress.numAwardedToUser,
                    total: currentChallenge.monthly_challange_game_total,
                    percentage: (mainGameProgress.numAwardedToUser / currentChallenge.monthly_challange_game_total * 100).toFixed(1),
                    award: award
                });

                // If shadow challenge is revealed, get its progress too
                if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                    const shadowGameProgress = await retroAPI.getUserGameProgress(
                        raUsername,
                        currentChallenge.shadow_challange_gameid
                    );

                    // Get the user's earned achievements from the shadow game progress data
                    const userEarnedShadowAchievements = Object.entries(shadowGameProgress.achievements)
                        .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
                        .map(([id, data]) => id);

                    // Check if user has all shadow progression achievements
                    const hasAllShadowProgressionAchievements = currentChallenge.shadow_challange_progression_achievements.every(
                        id => userEarnedShadowAchievements.includes(id)
                    );

                    // Check if user has at least one shadow win condition (if any exist)
                    const hasShadowWinCondition = currentChallenge.shadow_challange_win_achievements.length === 0 || 
                        currentChallenge.shadow_challange_win_achievements.some(id => userEarnedShadowAchievements.includes(id));

                    // Check if user has all achievements in the shadow game
                    const hasAllShadowAchievements = shadowGameProgress.numAwardedToUser === currentChallenge.shadow_challange_game_total;

                    // Calculate award level for shadow challenge based on specific achievements
                    let shadowPoints = 0;
                    let award = 'Participation';
                    if (hasAllShadowAchievements) {
                        shadowPoints = 3; // Mastery
                        award = 'Mastery';
                    } else if (hasAllShadowProgressionAchievements && hasShadowWinCondition) {
                        shadowPoints = 3; // Beaten
                        award = 'Beaten';
                    } else if (shadowGameProgress.numAwardedToUser > 0) {
                        shadowPoints = 1; // Participation
                    }
                    
                    // Update user's shadow challenge progress in the database
                    user.shadowChallenges.set(monthKey, { progress: shadowPoints });
                    
                    currentGamesProgress.push({
                        title: shadowGameProgress.title + " (Shadow)",
                        earned: shadowGameProgress.numAwardedToUser,
                        total: currentChallenge.shadow_challange_game_total,
                        percentage: (shadowGameProgress.numAwardedToUser / currentChallenge.shadow_challange_game_total * 100).toFixed(1),
                        award: award
                    });
                }
                
                // Save the updated user data
                await user.save();
            }

            // Calculate awards and points
            let masteredGames = [];
            let beatenGames = [];
            let participationGames = [];
            let communityPoints = 0;
            
            // Get all challenges (not just current month's)
            const allChallenges = await Challenge.find({}).sort({ date: -1 });
            
            // Create a map for faster challenge lookups
            const challengeMap = new Map();
            for (const challenge of allChallenges) {
                const dateKey = User.formatDateKey(challenge.date);
                challengeMap.set(dateKey, challenge);
            }

            // Process monthly challenges data from user document
            for (const [dateStr, data] of user.monthlyChallenges) {
                // Skip current month when adding to historical lists
                const gameDate = new Date(dateStr);
                if (gameDate.getMonth() === now.getMonth() && gameDate.getFullYear() === now.getFullYear()) {
                    continue;
                }
                
                const challenge = challengeMap.get(dateStr);
                
                if (challenge) {
                    try {
                        const progress = await retroAPI.getUserGameProgress(raUsername, challenge.monthly_challange_gameid);
                        
                        // Get user achieved count
                        const userEarnedAchievements = Object.entries(progress.achievements)
                            .filter(([id, ach]) => ach.dateEarned !== null)
                            .map(([id, ach]) => id);
                            
                        // Calculate completion percentage
                        const percentage = (progress.numAwardedToUser / challenge.monthly_challange_game_total * 100).toFixed(1);
                        
                        // Check if user has all progression achievements
                        const hasAllProgressionAchievements = challenge.monthly_challange_progression_achievements.every(
                            id => userEarnedAchievements.includes(id)
                        );

                        // Check if user has at least one win condition (if any exist)
                        const hasWinCondition = challenge.monthly_challange_win_achievements.length === 0 || 
                            challenge.monthly_challange_win_achievements.some(id => userEarnedAchievements.includes(id));

                        // Check if user has all achievements in the game
                        const hasAllAchievements = progress.numAwardedToUser === challenge.monthly_challange_game_total;
                        
                        // Determine which array to add to based on completion state
                        if (hasAllAchievements) {
                            masteredGames.push({
                                title: progress.title,
                                date: new Date(dateStr),
                                earned: progress.numAwardedToUser,
                                total: challenge.monthly_challange_game_total,
                                percentage
                            });
                        } else if (hasAllProgressionAchievements && hasWinCondition) {
                            beatenGames.push({
                                title: progress.title,
                                date: new Date(dateStr),
                                earned: progress.numAwardedToUser,
                                total: challenge.monthly_challange_game_total,
                                percentage
                            });
                        } else if (progress.numAwardedToUser > 0) {
                            participationGames.push({
                                title: progress.title,
                                date: new Date(dateStr),
                                earned: progress.numAwardedToUser,
                                total: challenge.monthly_challange_game_total,
                                percentage
                            });
                        }
                    } catch (error) {
                        console.error(`Error getting game progress for ${dateStr}:`, error);
                    }
                } else {
                    // Try to find in historical data
                    const gameDate = new Date(dateStr);
                    const month = gameDate.getMonth() + 1; // 1-12
                    const year = gameDate.getFullYear();
                    
                    const historicalChallenge = HISTORICAL_CHALLENGES.find(
                        c => c.year === year && c.month === month
                    );
                    
                    if (historicalChallenge) {
                        try {
                            const progress = await retroAPI.getUserGameProgress(
                                raUsername, 
                                historicalChallenge.main.gameId
                            );
                            
                            // Get user achieved count
                            const userEarnedAchievements = Object.entries(progress.achievements)
                                .filter(([id, ach]) => ach.dateEarned !== null)
                                .map(([id, ach]) => id);
                                
                            // Calculate completion percentage
                            const percentage = (progress.numAwardedToUser / historicalChallenge.main.total * 100).toFixed(1);
                            
                            // Check if user has all progression achievements
                            const hasAllProgressionAchievements = historicalChallenge.main.progression.every(
                                id => userEarnedAchievements.includes(id)
                            );

                            // Check if user has at least one win condition (if any exist)
                            const hasWinCondition = historicalChallenge.main.win.length === 0 || 
                                historicalChallenge.main.win.some(id => userEarnedAchievements.includes(id));

                            // Check if user has all achievements in the game
                            const hasAllAchievements = progress.numAwardedToUser === historicalChallenge.main.total;
                            
                            if (hasAllAchievements) {
                                masteredGames.push({
                                    title: progress.title,
                                    date: new Date(dateStr),
                                    earned: progress.numAwardedToUser,
                                    total: historicalChallenge.main.total,
                                    percentage
                                });
                            } else if (hasAllProgressionAchievements && hasWinCondition) {
                                beatenGames.push({
                                    title: progress.title,
                                    date: new Date(dateStr),
                                    earned: progress.numAwardedToUser,
                                    total: historicalChallenge.main.total,
                                    percentage
                                });
                            } else if (progress.numAwardedToUser > 0) {
                                participationGames.push({
                                    title: progress.title,
                                    date: new Date(dateStr),
                                    earned: progress.numAwardedToUser,
                                    total: historicalChallenge.main.total,
                                    percentage
                                });
                            }
                        } catch (error) {
                            console.error(`Error getting historical game progress for ${dateStr}:`, error);
                        }
                    }
                }
            }
            
            // Process shadow challenges data from user document
            for (const [dateStr, data] of user.shadowChallenges) {
                // Skip current month when adding to historical lists
                const gameDate = new Date(dateStr);
                if (gameDate.getMonth() === now.getMonth() && gameDate.getFullYear() === now.getFullYear()) {
                    continue;
                }
                
                const challenge = challengeMap.get(dateStr);
                
                // Only process if the challenge exists and has a shadow game
                if (challenge && challenge.shadow_challange_gameid) {
                    try {
                        const progress = await retroAPI.getUserGameProgress(raUsername, challenge.shadow_challange_gameid);
                        
                        // Get user achieved count
                        const userEarnedAchievements = Object.entries(progress.achievements)
                            .filter(([id, ach]) => ach.dateEarned !== null)
                            .map(([id, ach]) => id);
                            
                        // Calculate completion percentage
                        const percentage = (progress.numAwardedToUser / challenge.shadow_challange_game_total * 100).toFixed(1);
                        
                        // Check if user has all progression achievements
                        const hasAllProgressionAchievements = challenge.shadow_challange_progression_achievements.every(
                            id => userEarnedAchievements.includes(id)
                        );

                        // Check if user has at least one win condition (if any exist)
                        const hasWinCondition = challenge.shadow_challange_win_achievements.length === 0 || 
                            challenge.shadow_challange_win_achievements.some(id => userEarnedAchievements.includes(id));

                        // Check if user has all achievements in the game
                        const hasAllAchievements = progress.numAwardedToUser === challenge.shadow_challange_game_total;
                        
                        // Only add to completed lists if the game has at least some progress
                        if (progress.numAwardedToUser > 0) {
                            const shadowTitle = `${progress.title} (Shadow)`;
                            
                            // Determine which array to add to based on completion state
                            if (hasAllAchievements) {
                                masteredGames.push({
                                    title: shadowTitle,
                                    date: new Date(dateStr),
                                    earned: progress.numAwardedToUser,
                                    total: challenge.shadow_challange_game_total,
                                    percentage
                                });
                            } else if (hasAllProgressionAchievements && hasWinCondition) {
                                beatenGames.push({
                                    title: shadowTitle,
                                    date: new Date(dateStr),
                                    earned: progress.numAwardedToUser,
                                    total: challenge.shadow_challange_game_total,
                                    percentage
                                });
                            } else {
                                participationGames.push({
                                    title: shadowTitle,
                                    date: new Date(dateStr),
                                    earned: progress.numAwardedToUser,
                                    total: challenge.shadow_challange_game_total,
                                    percentage
                                });
                            }
                        }
                    } catch (error) {
                        console.error(`Error getting shadow game progress for ${dateStr}:`, error);
                    }
                } else {
                    // Try to find in historical data
                    const gameDate = new Date(dateStr);
                    const month = gameDate.getMonth() + 1; // 1-12
                    const year = gameDate.getFullYear();
                    
                    const historicalChallenge = HISTORICAL_CHALLENGES.find(
                        c => c.year === year && c.month === month
                    );
                    
                    if (historicalChallenge && historicalChallenge.shadow) {
                        try {
                            const progress = await retroAPI.getUserGameProgress(
                                raUsername, 
                                historicalChallenge.shadow.gameId
                            );
                            
                            // Get user achieved count
                            const userEarnedAchievements = Object.entries(progress.achievements)
                                .filter(([id, ach]) => ach.dateEarned !== null)
                                .map(([id, ach]) => id);
                                
                            // Calculate completion percentage
                            const percentage = (progress.numAwardedToUser / historicalChallenge.shadow.total * 100).toFixed(1);
                            
                            // Check if user has all progression achievements
                            const hasAllProgressionAchievements = historicalChallenge.shadow.progression.every(
                                id => userEarnedAchievements.includes(id)
                            );

                            // Check if user has at least one win condition (if any exist)
                            const hasWinCondition = historicalChallenge.shadow.win.length === 0 || 
                                historicalChallenge.shadow.win.some(id => userEarnedAchievements.includes(id));

                            // Check if user has all achievements in the game
                            const hasAllAchievements = progress.numAwardedToUser === historicalChallenge.shadow.total;
                            
                            if (progress.numAwardedToUser > 0) {
                                const shadowTitle = `${progress.title} (Shadow)`;
                                
                                if (hasAllAchievements) {
                                    masteredGames.push({
                                        title: shadowTitle,
                                        date: new Date(dateStr),
                                        earned: progress.numAwardedToUser,
                                        total: historicalChallenge.shadow.total,
                                        percentage
                                    });
                                } else if (hasAllProgressionAchievements && hasWinCondition) {
                                    beatenGames.push({
                                        title: shadowTitle,
                                        date: new Date(dateStr),
                                        earned: progress.numAwardedToUser,
                                        total: historicalChallenge.shadow.total,
                                        percentage
                                    });
                                } else {
                                    participationGames.push({
                                        title: shadowTitle,
                                        date: new Date(dateStr),
                                        earned: progress.numAwardedToUser,
                                        total: historicalChallenge.shadow.total,
                                        percentage
                                    });
                                }
                            }
                        } catch (error) {
                            console.error(`Error getting historical shadow game progress for ${dateStr}:`, error);
                        }
                    }
                }
            }

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

            // Current Challenges Section
            let challengePoints = 0;
            if (currentGamesProgress.length > 0) {
                let currentChallengesField = '';
                for (const game of currentGamesProgress) {
                    let award = '';
                    let awardText = '';
                
                    if (game.award === 'Mastery') {
                        award = AWARD_EMOJIS.MASTERY;
                        awardText = 'Mastery - All achievements completed';
                        challengePoints += 3;
                    } else if (game.award === 'Beaten') {
                        award = AWARD_EMOJIS.BEATEN;
                        awardText = 'Beaten - All progression + at least 1 win condition';
                        challengePoints += 3;
                    } else if (game.earned > 0) {
                        award = AWARD_EMOJIS.PARTICIPATION;
                        awardText = 'Participation';
                        challengePoints += 1;
                    }
                    
                    currentChallengesField += `**${game.title}**\n` +
                        `Progress: ${game.earned}/${game.total} (${game.percentage}%)\n` +
                        `Current Award: ${award} ${awardText}\n\n`;
                }
                embed.addFields({ name: '📊 Current Challenges', value: currentChallengesField || 'No current challenges' });
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
                    gameAwardsField += `${game.title}: ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
                gameAwardsField += '\n';
            }

            if (beatenGames.length > 0) {
                gameAwardsField += `**Beaten Games ${AWARD_EMOJIS.BEATEN}**\n`;
                beatenGames.forEach(game => {
                    const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                    gameAwardsField += `${game.title}: ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
                gameAwardsField += '\n';
            }

            if (participationGames.length > 0) {
                gameAwardsField += `**Participation ${AWARD_EMOJIS.PARTICIPATION}**\n`;
                participationGames.forEach(game => {
                    const monthYear = game.date.toLocaleString('default', { month: 'short', year: 'numeric' });
                    gameAwardsField += `${game.title}: ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
            }

            if (gameAwardsField) {
                embed.addFields({ name: `🎮 2025 Games`, value: gameAwardsField });
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
            }

            // Points Summary Section
            const totalPoints = challengePoints + communityPoints;
            const pointsSummary = `Total: ${totalPoints}\n` +
                `Challenge: ${challengePoints}\n` +
                `Community: ${communityPoints}`;

            embed.addFields({ name: '🏆 Points Summary', value: pointsSummary });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error displaying profile:', error);
            return interaction.editReply('An error occurred while fetching the profile. Please try again.');
        }
    }
};
