import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

// Helper function for processing historical challenges
async function processHistoricalChallenges(user) {
    try {
        // Get all challenges
        const allChallenges = await Challenge.find({}).sort({ date: 1 });
        
        // Process each challenge
        for (const challenge of allChallenges) {
            const dateKey = User.formatDateKey(challenge.date);
            
            // Skip if user already has data for this challenge
            if (user.monthlyChallenges.has(dateKey)) {
                continue;
            }
            
            // Process main challenge
            if (challenge.monthly_challange_gameid) {
                try {
                    const progress = await retroAPI.getUserGameProgress(
                        user.raUsername, 
                        challenge.monthly_challange_gameid
                    );
                    
                    // Calculate points based on achievements
                    let monthlyPoints = 0;
                    
                    if (progress.numAwardedToUser > 0) {
                        // Get user earned achievements
                        const userEarnedAchievements = Object.entries(progress.achievements)
                            .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
                            .map(([id, data]) => id);
                        
                        // Check progression and win conditions
                        const hasAllProgressionAchievements = challenge.monthly_challange_progression_achievements.every(
                            id => userEarnedAchievements.includes(id)
                        );
                        
                        const hasWinCondition = challenge.monthly_challange_win_achievements.length === 0 || 
                            challenge.monthly_challange_win_achievements.some(id => userEarnedAchievements.includes(id));
                        
                        const hasAllAchievements = progress.numAwardedToUser === challenge.monthly_challange_game_total;
                        
                        if (hasAllAchievements) {
                            monthlyPoints = 3; // Mastery
                        } else if (hasAllProgressionAchievements && hasWinCondition) {
                            monthlyPoints = 3; // Beaten
                        } else {
                            monthlyPoints = 1; // Participation
                        }
                        
                        // Update monthly challenge progress
                        user.monthlyChallenges.set(dateKey, { progress: monthlyPoints });
                    }
                } catch (error) {
                    console.error(`Error processing main challenge for ${user.raUsername}:`, error);
                }
            }
            
            // Process shadow challenge
            if (challenge.shadow_challange_gameid) {
                try {
                    const shadowProgress = await retroAPI.getUserGameProgress(
                        user.raUsername, 
                        challenge.shadow_challange_gameid
                    );
                    
                    // Calculate points based on achievements
                    let shadowPoints = 0;
                    
                    if (shadowProgress.numAwardedToUser > 0) {
                        // Get user earned achievements
                        const userEarnedAchievements = Object.entries(shadowProgress.achievements)
                            .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
                            .map(([id, data]) => id);
                        
                        // Check progression and win conditions
                        const hasAllProgressionAchievements = challenge.shadow_challange_progression_achievements.every(
                            id => userEarnedAchievements.includes(id)
                        );
                        
                        const hasWinCondition = challenge.shadow_challange_win_achievements.length === 0 || 
                            challenge.shadow_challange_win_achievements.some(id => userEarnedAchievements.includes(id));
                        
                        const hasAllAchievements = shadowProgress.numAwardedToUser === challenge.shadow_challange_game_total;
                        
                        if (hasAllAchievements) {
                            shadowPoints = 3; // Mastery
                        } else if (hasAllProgressionAchievements && hasWinCondition) {
                            shadowPoints = 3; // Beaten
                        } else {
                            shadowPoints = 1; // Participation
                        }
                        
                        // Update shadow challenge progress
                        user.shadowChallenges.set(dateKey, { progress: shadowPoints });
                    }
                } catch (error) {
                    console.error(`Error processing shadow challenge for ${user.raUsername}:`, error);
                }
            }
        }
        
        // Save user with updated challenge data
        await user.save();
        console.log(`Historical challenge data processed for ${user.raUsername}`);
        
    } catch (error) {
        console.error(`Error processing historical challenges for ${user.raUsername}:`, error);
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register a new user for challenges')
        .addUserOption(option =>
            option.setName('discord_user')
            .setDescription('The Discord username or ID (can be for users not on server)')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('ra_username')
            .setDescription('The RetroAchievements username')
            .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const discordUser = interaction.options.getUser('discord_user');
            const raUsername = interaction.options.getString('ra_username');

            // Check if user already exists
            const existingUser = await User.findOne({
                $or: [
                    { discordId: discordUser.id },
                    { raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') } }
                ]
            });

            if (existingUser) {
                return interaction.editReply(
                    'This user is already registered. ' +
                    `${existingUser.discordId === discordUser.id ? 'Discord ID' : 'RA username'} is already in use.`
                );
            }

            // Validate RA username exists
            const isValidUser = await retroAPI.validateUser(raUsername);
            if (!isValidUser) {
                return interaction.editReply('Invalid RetroAchievements username. Please check the username and try again.');
            }

            // Create new user
            const user = new User({
                raUsername,
                discordId: discordUser.id
            });

            await user.save();

            // Process historical challenges for this user
            await processHistoricalChallenges(user);

            // Get user info for a more detailed response
            const raUserInfo = await retroAPI.getUserInfo(raUsername);

            return interaction.editReply({
                content: `Successfully registered user!\n` +
                    `Discord: ${discordUser.tag}\n` +
                    `RA Username: ${raUsername}\n` +
                    `RA Profile: https://retroachievements.org/user/${raUsername}\n` +
                    `Total Points: ${raUserInfo.points}\n` +
                    `Total Games: ${raUserInfo.totalGames}\n\n` +
                    `Historical challenge data has been processed.`
            });

        } catch (error) {
            console.error('Error registering user:', error);
            return interaction.editReply('An error occurred while registering the user. Please try again.');
        }
    }
};
