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
                
                // Check for specific achievements
                const requiredAchievements = currentChallenge.monthly_challange_achievement_ids || [];
                const userAchievements = mainGameProgress.achievements || {};
                
                // Count how many of the required achievements the user has earned
                let earnedRequiredCount = 0;
                for (const achievementId of requiredAchievements) {
                    if (userAchievements[achievementId] && userAchievements[achievementId].dateEarned) {
                        earnedRequiredCount++;
                    }
                }
                
                // Calculate award level for monthly challenge based on specific achievements
                let monthlyPoints = 0;
                if (earnedRequiredCount === requiredAchievements.length && requiredAchievements.length > 0) {
                    monthlyPoints = 3; // Mastery
                } else if (earnedRequiredCount >= currentChallenge.monthly_challange_goal) {
                    monthlyPoints = 2; // Beaten
                } else if (earnedRequiredCount > 0) {
                    monthlyPoints = 1; // Participation
                }
                
                // Update user's monthly challenge progress in the database
                const monthKey = User.formatDateKey(currentChallenge.date);
                user.monthlyChallenges.set(monthKey, { progress: monthlyPoints });
                
                currentGamesProgress.push({
                    title: mainGameInfo.title,
                    earned: earnedRequiredCount,
                    total: requiredAchievements.length,
                    goal: currentChallenge.monthly_challange_goal,
                    percentage: requiredAchievements.length > 0 ? 
                        (earnedRequiredCount / requiredAchievements.length * 100).toFixed(2) : "0.00",
                    specificAchievements: true
                });

                // If shadow challenge is revealed, get its progress too
                if (currentChallenge.shadow_challange_revealed && currentChallenge.shadow_challange_gameid) {
                    const shadowGameProgress = await retroAPI.getUserGameProgress(
                        raUsername,
                        currentChallenge.shadow_challange_gameid
                    );
                    const shadowGameInfo = shadowGameProgress;

                    // Check for specific shadow achievements
                    const requiredShadowAchievements = currentChallenge.shadow_challange_achievement_ids || [];
                    const userShadowAchievements = shadowGameProgress.achievements || {};
                    
                    // Count how many of the required shadow achievements the user has earned
                    let earnedRequiredShadowCount = 0;
                    for (const achievementId of requiredShadowAchievements) {
                        if (userShadowAchievements[achievementId] && userShadowAchievements[achievementId].dateEarned) {
                            earnedRequiredShadowCount++;
                        }
                    }
                    
                    // Calculate award level for shadow challenge based on specific achievements
                    let shadowPoints = 0;
                    if (earnedRequiredShadowCount === requiredShadowAchievements.length && requiredShadowAchievements.length > 0) {
                        shadowPoints = 3; // Mastery
                    } else if (earnedRequiredShadowCount >= currentChallenge.shadow_challange_goal) {
                        shadowPoints = 2; // Beaten
                    } else if (earnedRequiredShadowCount > 0) {
                        shadowPoints = 1; // Participation
                    }
                    
                    // Update user's shadow challenge progress in the database
                    user.shadowChallenges.set(monthKey, { progress: shadowPoints });

                    currentGamesProgress.push({
                        title: shadowGameInfo.title,
                        earned: earnedRequiredShadowCount,
                        total: requiredShadowAchievements.length,
                        goal: currentChallenge.shadow_challange_goal,
                        percentage: requiredShadowAchievements.length > 0 ? 
                            (earnedRequiredShadowCount / requiredShadowAchievements.length * 100).toFixed(2) : "0.00",
                        specificAchievements: true
                    });
                }
                
                // Save the updated user data
                await user.save();
            }

            // Calculate awards and points
            let masteredGames = [];
            let beatenGames = [];
            let participationGames = [];
            let challengePoints = 0;
            let communityPoints = 0;

            // Process monthly challenges data from user document
            for (const [dateStr, data] of user.monthlyChallenges) {
                const date = new Date(dateStr);
                const challenge = await Challenge.findOne({
                    date: {
                        $gte: new Date(date.getFullYear(), date.getMonth(), 1),
                        $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
                    }
                });

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
                    
                    if (earnedRequiredCount === requiredAchievements.length && requiredAchievements.length > 0) {
                        masteredGames.push({
                            title: gameInfo.title,
                            earned: earnedRequiredCount,
                            total: requiredAchievements.length
                        });
                        challengePoints += 3;
                    } else if (earnedRequiredCount >= challenge.monthly_challange_goal) {
                        beatenGames.push({
                            title: gameInfo.title,
                            earned: earnedRequiredCount,
                            total: requiredAchievements.length,
                            percentage: requiredAchievements.length > 0 ? 
                                (earnedRequiredCount / requiredAchievements.length * 100).toFixed(2) : "0.00"
                        });
                        challengePoints += 2;
                    } else if (earnedRequiredCount > 0) {
                        participationGames.push({
                            title: gameInfo.title,
                            earned: earnedRequiredCount,
                            total: requiredAchievements.length,
                            percentage: requiredAchievements.length > 0 ? 
                                (earnedRequiredCount / requiredAchievements.length * 100).toFixed(2) : "0.00"
                        });
                        challengePoints += 1;
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
            if (currentGamesProgress.length > 0) {
                let currentChallengesField = '';
                for (const game of currentGamesProgress) {
                    let award = '';
                    if (game.earned === game.total) award = AWARD_EMOJIS.MASTERY;
                    else if (game.earned >= game.goal) award = AWARD_EMOJIS.BEATEN;
                    else if (game.earned > 0) award = AWARD_EMOJIS.PARTICIPATION;

                    currentChallengesField += `**${game.title}**\n` +
                        `Progress: ${game.earned}/${game.total} (${game.percentage}%)\n` +
                        `Current Award: ${award}\n` +
                        `${game.specificAchievements ? 'Based on specific achievements' : ''}\n\n`;
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
