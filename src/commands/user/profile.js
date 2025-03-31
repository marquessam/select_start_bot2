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
            console.log(`raUsername: ${raUsername}`);
            const raUserInfo = await retroAPI.getUserInfo(raUsername);

            // Get current game progress and update user's progress in the database
            let currentGamesProgress = [];
            if (currentChallenge) {
                // Get main challenge progress
                const mainGameProgress = await retroAPI.getUserGameProgress(
                    raUsername,
                    currentChallenge.monthly_challange_gameid
                );
                // Achievements
                const mainGameInfo = mainGameProgress;
                
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
                
                currentGamesProgress.push({
                    title: mainGameInfo.title,
                    earned: userEarnedAchievements.length,
                    total: currentChallenge.monthly_challange_progression_achievements.length,
                    percentage: currentChallenge.monthly_challange_progression_achievements.length > 0 ? 
                        Math.min((userEarnedAchievements.length / currentChallenge.monthly_challange_progression_achievements.length * 100).toFixed(2), 100) : "0.00",
                    award: award
                });

                // If shadow challenge is revealed, get its progress too
                var hasAllShadowProgressionAchievements = false;
                var hasShadowWinCondition = false;
                var hasAllShadowAchievements = false;
                if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                    const shadowGameProgress = await retroAPI.getUserGameProgress(
                        raUsername,
                        currentChallenge.shadow_challange_gameid
                    );
                    const shadowGameInfo = shadowGameProgress;

                    // Get the user's earned achievements from the shadow game progress data
                    const userEarnedShadowAchievements = Object.entries(shadowGameProgress.achievements)
                        .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
                        .map(([id, data]) => id);

                    // Check if user has all shadow progression achievements
                    hasAllShadowProgressionAchievements = currentChallenge.shadow_challange_progression_achievements.every(
                        id => userEarnedShadowAchievements.includes(id)
                    );

                    // Check if user has at least one shadow win condition (if any exist)
                    hasShadowWinCondition = currentChallenge.shadow_challange_win_achievements.length === 0 || 
                        currentChallenge.shadow_challange_win_achievements.some(id => userEarnedShadowAchievements.includes(id));

                    // Check if user has all achievements in the shadow game
                    hasAllShadowAchievements = shadowGameProgress.numAwardedToUser === currentChallenge.shadow_challange_game_total;

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
                        title: shadowGameInfo.title,
                        earned: userEarnedShadowAchievements.length,
                        total: currentChallenge.shadow_challange_progression_achievements.length,
                        percentage: currentChallenge.shadow_challange_progression_achievements.length > 0 ? 
                            Math.min((userEarnedShadowAchievements.length / currentChallenge.shadow_challange_progression_achievements.length * 100).toFixed(2), 100) : "0.00",
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

            // FIXME: Oops
            // Process monthly challenges data from user document
            for (const [dateStr, data] of user.monthlyChallenges) {
                const date = new Date(dateStr);
                const challenge = await Challenge.findOne({
                    date: {
                        $gte: new Date(date.getFullYear(), date.getMonth(), 1),
                        $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
                    }
                });
                
                var hasAllAchievements = false;
                var hasWinCondition = false;
                var hasAllProgressionAchievements = false;
                if (challenge) {
                    const progress = await retroAPI.getUserGameProgress(raUsername, challenge.monthly_challange_gameid);
                    const gameInfo = progress;
                    
                    // Check for specific achievements
                    const requiredAchievements = challenge.monthly_challange_achievement_ids || [];
                    const userAchievements = progress.achievements || {};
                    
                    // Count how many of the required achievements the user has earned
                    let earnedRequiredCount = 0;
                    for (const achievementId of requiredAchievements) {
                        if (userAchievements[achievementId] && userAchievements[achievementId].dateEarned) {
                            earnedRequiredCount++;
                        }
                    }
                    
                    // Get the user's earned achievements from the progress data
                   const userEarnedAchievements = Object.entries(progress.achievements)
                    .filter(([id, ach]) => ach.dateEarned !== null)
                    .map(([id, ach]) => id);

                    // Check if user has all progression achievements
                    hasAllProgressionAchievements = challenge.monthly_challange_progression_achievements.every(
                        id => userEarnedAchievements.includes(id)
                    );

                    // Check if user has at least one win condition (if any exist)
                    hasWinCondition = challenge.monthly_challange_win_achievements.length === 0 || 
                        challenge.monthly_challange_win_achievements.some(id => userEarnedAchievements.includes(id));

                    // Check if user has all achievements in the game
                    hasAllAchievements = progress.numAwardedToUser === challenge.monthly_challange_game_total;

                    if (hasAllAchievements) {
                        masteredGames.push({
                            title: gameInfo.title,
                            earned: progress.numAwardedToUser,
                            total: challenge.monthly_challange_game_total
                        });
                    } else if (hasAllProgressionAchievements && hasWinCondition) {
                        beatenGames.push({
                            title: gameInfo.title,
                            earned: progress.numAwardedToUser,
                            total: challenge.monthly_challange_game_total,
                            percentage: (progress.numAwardedToUser / challenge.monthly_challange_game_total * 100).toFixed(2)
                        });
                    } else if (progress.numAwardedToUser > 0) {
                        participationGames.push({
                            title: gameInfo.title,
                            earned: progress.numAwardedToUser,
                            total: challenge.monthly_challange_game_total,
                            percentage: (progress.numAwardedToUser / challenge.monthly_challange_game_total * 100).toFixed(2)
                        });
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

            // Game Awards Section
            let gameAwardsField = '';
            
            if (masteredGames.length > 0) {
                gameAwardsField += `**Mastered Games ${AWARD_EMOJIS.MASTERY}**\n`;
                masteredGames.forEach(game => {
                    gameAwardsField += `${game.title}\n`;
                });
                gameAwardsField += '\n';
            }

            if (beatenGames.length > 0) {
                gameAwardsField += `**Beaten Games ${AWARD_EMOJIS.BEATEN}**\n`;
                beatenGames.forEach(game => {
                    gameAwardsField += `${game.title}: ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
                gameAwardsField += '\n';
            }

            if (participationGames.length > 0) {
                gameAwardsField += `**Participation ${AWARD_EMOJIS.PARTICIPATION}**\n`;
                participationGames.forEach(game => {
                    gameAwardsField += `${game.title}: ${game.earned}/${game.total} (${game.percentage}%)\n`;
                });
            }

            if (gameAwardsField) {
                embed.addFields({ name: '🎮 Game Awards', value: gameAwardsField });
            }

            // Community Awards Section
            if (communityAwards.length > 0) {
                let communityAwardsField = '';
                communityAwards.forEach(award => {
                    communityAwardsField += `🌟 **${award.title}** (${award.points} points)\n`;
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
