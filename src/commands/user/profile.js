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

            // Get current month-year string for filtering out current challenge
            const currentDateStr = currentChallenge ? User.formatDateKey(currentChallenge.date) : '';

            // Process monthly challenges data from user document
            for (const [dateStr, data] of user.monthlyChallenges) {
                // Skip current month's challenge for the 2025 Games section
                if (dateStr === currentDateStr) continue;
                
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
                }
            }
            
            // Process shadow challenges data from user document
            for (const [dateStr, data] of user.shadowChallenges) {
                // Skip current month's challenge for the 2025 Games section
                if (dateStr === currentDateStr) continue;
                
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
                }
            }

            // Get community awards for the current year
            const currentYear = new Date().getFullYear();
            const communityAwards = user.getCommunityAwardsForYear(currentYear);
            
            // Sort community awards chronologically (oldest first)
            communityAwards.sort((a, b) => new Date(a.awardedAt) - new Date(b.awardedAt));
            
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

            // 2025 Games Section (replacing "Beaten Games")
            // Sort games by date (newest first)
            const sortByDate = (a, b) => b.date - a.date;
            masteredGames.sort(sortByDate);
            beatenGames.sort(sortByDate);
            participationGames.sort(sortByDate);
            
            let gamesAwardsField = '';
            
            // Count total games completed with beatenGames and masteredGames combined
            const totalCompletedGames = beatenGames.length + masteredGames.length;
            
            // Create the 2025 Games section header with completed count
            gamesAwardsField += `**2025 Games**\n`;
            
            if (masteredGames.length > 0) {
                gamesAwardsField += `**Mastered Games ${AWARD_EMOJIS.MASTERY}**\n`;
                masteredGames.forEach(game => {
                    gamesAwardsField += `${game.title}: ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
                gamesAwardsField += '\n';
            }

            if (beatenGames.length > 0) {
                gamesAwardsField += `**Beaten Games ${AWARD_EMOJIS.BEATEN}**\n`;
                beatenGames.forEach(game => {
                    gamesAwardsField += `${game.title}: ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
                gamesAwardsField += '\n';
            }

            if (participationGames.length > 0) {
                gamesAwardsField += `**Participation ${AWARD_EMOJIS.PARTICIPATION}**\n`;
                participationGames.forEach(game => {
                    gamesAwardsField += `${game.title}: ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
            }

            if (gamesAwardsField) {
                embed.addFields({ name: `🎮 2025 Games`, value: gamesAwardsField });
            }

            // Community Awards Section - Already sorted chronologically (oldest first)
            if (communityAwards.length > 0) {
                let communityAwardsField = '';
                
                communityAwards.forEach(award => {
                    const awardDate = new Date(award.awardedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                    
                    // Use rank emoji if available, otherwise use star emoji
                    const rankEmoji = award.rank && RANK_EMOJIS[award.rank] 
                        ? RANK_EMOJIS[award.rank] 
                        : '🌟';
                        
                    communityAwardsField += `${rankEmoji} **${award.month} - ${award.title}** (${award.points} points) - ${awardDate}\n`;
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
