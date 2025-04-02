import { SlashCommandBuilder } from 'discord.js';
import { User } from '../../models/User.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

// Historical challenge data for January through April 2025
const HISTORICAL_CHALLENGES = [
    {
        month: 1, // January
        year: 2025,
        main: {
            gameId: "319",
            name: "Chrono Trigger",
            progression: ["2080", "2081", "2085", "2090", "2191", "2100", "2108", "2129", "2133"],
            win: ["2266", "2281"],
            total: 77
        },
        shadow: {
            gameId: "10024",
            name: "Mario Tennis",
            progression: [],
            win: ["48411", "48412"],
            total: 97
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
            total: 109
        },
        shadow: {
            gameId: "274",
            name: "UN Squadron",
            progression: ["6413", "6414", "6415", "6416", "6417", "6418", "6419", "6420", "6421"],
            win: ["6422"],
            total: 28
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
            total: 53
        },
        shadow: {
            gameId: "7181",
            name: "Monster Rancher Advance 2",
            progression: ["171381", "171382", "171383", "171384", "171385", 
                          "171386", "171387", "171388", "171389", "171390"],
            win: ["171391"],
            total: 103
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
            total: 63
        },
        shadow: {
            gameId: "506",
            name: "Advance Wars",
            progression: ["11353", "11355", "11357", "11359", "11487", "11488"],
            win: ["11489"],
            total: 92
        }
    }
];

export default {
    data: new SlashCommandBuilder()
        .setName('processhistorical')
        .setDescription('Process historical challenge data for users')
        .addSubcommand(subcommand =>
            subcommand
                .setName('all')
                .setDescription('Process all unprocessed users'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Process a specific user')
                .addStringOption(option =>
                    option.setName('username')
                    .setDescription('RetroAchievements username')
                    .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset a user\'s processed flag')
                .addStringOption(option =>
                    option.setName('username')
                    .setDescription('RetroAchievements username')
                    .setRequired(true))),

    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.bot.roles.admin)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true
            });
        }

        await interaction.deferReply();
        
        const subcommand = interaction.options.getSubcommand();
        
        try {
            const currentMonth = new Date().getMonth() + 1; // 1-12 (January is 1)
            const currentYear = new Date().getFullYear();
            
            if (subcommand === 'all') {
                // Process all users that haven't been processed yet
                const users = await User.find({ historicalDataProcessed: { $ne: true } });
                
                if (users.length === 0) {
                    return interaction.editReply('All users have already been processed. Use the reset subcommand if you need to reprocess any users.');
                }
                
                await interaction.editReply(`Starting to process historical data for ${users.length} users. This may take some time...`);
                
                let processedCount = 0;
                let updatedCount = 0;
                
                for (const user of users) {
                    let changesDetected = false;
                    
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
                                const progress = await this.processGame(
                                    user.raUsername,
                                    challenge.main.gameId,
                                    challenge.main.progression,
                                    challenge.main.win,
                                    challenge.main.total
                                );
                                
                                if (progress) {
                                    user.monthlyChallenges.set(dateKey, { progress: progress.points });
                                    changesDetected = true;
                                }
                                
                                // Wait to respect API rate limits
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            } catch (error) {
                                console.error(`Error processing main challenge for ${user.raUsername}:`, error);
                            }
                        }
                        
                        // Process shadow challenge
                        if (challenge.shadow && !user.shadowChallenges.has(dateKey)) {
                            try {
                                const progress = await this.processGame(
                                    user.raUsername,
                                    challenge.shadow.gameId,
                                    challenge.shadow.progression,
                                    challenge.shadow.win,
                                    challenge.shadow.total
                                );
                                
                                if (progress) {
                                    user.shadowChallenges.set(dateKey, { progress: progress.points });
                                    changesDetected = true;
                                }
                                
                                // Wait to respect API rate limits
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            } catch (error) {
                                console.error(`Error processing shadow challenge for ${user.raUsername}:`, error);
                            }
                        }
                    }
                    
                    // Mark user as processed
                    user.historicalDataProcessed = true;
                    await user.save();
                    
                    processedCount++;
                    if (changesDetected) {
                        updatedCount++;
                    }
                    
                    // Update the reply periodically to show progress
                    if (processedCount % 5 === 0 || processedCount === users.length) {
                        await interaction.editReply(`Processing historical data: ${processedCount}/${users.length} users processed (${updatedCount} updated)...`);
                    }
                    
                    // Add a delay between users to respect API rate limits
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                return interaction.editReply(`Historical data processing complete! Processed ${processedCount} users, updated ${updatedCount} user records.`);
                
            } else if (subcommand === 'user') {
                // Process a specific user
                const raUsername = interaction.options.getString('username');
                
                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
                });
                
                if (!user) {
                    return interaction.editReply(`User "${raUsername}" not found. Please check the username or register the user first.`);
                }
                
                await interaction.editReply(`Processing historical data for ${user.raUsername}...`);
                
                let changesDetected = false;
                
                // Process each historical challenge except the current month
                for (const challenge of HISTORICAL_CHALLENGES) {
                    // Skip current month's challenge
                    if (challenge.year === currentYear && challenge.month === currentMonth) {
                        continue;
                    }
                    
                    const dateStr = `${challenge.year}-${challenge.month.toString().padStart(2, '0')}-01`;
                    const dateKey = User.formatDateKey(new Date(dateStr));
                    
                    // Process main challenge
                    if (challenge.main) {
                        try {
                            const progress = await this.processGame(
                                user.raUsername,
                                challenge.main.gameId,
                                challenge.main.progression,
                                challenge.main.win,
                                challenge.main.total
                            );
                            
                            if (progress) {
                                user.monthlyChallenges.set(dateKey, { progress: progress.points });
                                changesDetected = true;
                                await interaction.editReply(`Processing ${user.raUsername}: Found progress on ${challenge.main.name} (${challenge.month}/${challenge.year})`);
                            }
                            
                            // Wait to respect API rate limits
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (error) {
                            console.error(`Error processing main challenge for ${user.raUsername}:`, error);
                        }
                    }
                    
                    // Process shadow challenge
                    if (challenge.shadow) {
                        try {
                            const progress = await this.processGame(
                                user.raUsername,
                                challenge.shadow.gameId,
                                challenge.shadow.progression,
                                challenge.shadow.win,
                                challenge.shadow.total
                            );
                            
                            if (progress) {
                                user.shadowChallenges.set(dateKey, { progress: progress.points });
                                changesDetected = true;
                                await interaction.editReply(`Processing ${user.raUsername}: Found progress on ${challenge.shadow.name} (Shadow) (${challenge.month}/${challenge.year})`);
                            }
                            
                            // Wait to respect API rate limits
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (error) {
                            console.error(`Error processing shadow challenge for ${user.raUsername}:`, error);
                        }
                    }
                }
                
                // Mark user as processed
                user.historicalDataProcessed = true;
                await user.save();
                
                if (changesDetected) {
                    return interaction.editReply(`Successfully updated historical data for ${user.raUsername}!`);
                } else {
                    return interaction.editReply(`Processed ${user.raUsername}, but no historical challenge progress was found.`);
                }
                
            } else if (subcommand === 'reset') {
                // Reset a user's processed flag
                const raUsername = interaction.options.getString('username');
                
                const user = await User.findOne({ 
                    raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
                });
                
                if (!user) {
                    return interaction.editReply(`User "${raUsername}" not found. Please check the username.`);
                }
                
                // Reset the processed flag
                user.historicalDataProcessed = false;
                await user.save();
                
                return interaction.editReply(`Successfully reset the historical data processed flag for ${user.raUsername}. You can now process their data again.`);
            }
        } catch (error) {
            console.error('Error processing historical data:', error);
            return interaction.editReply('An error occurred while processing historical data. Please check the logs for details.');
        }
    },

    // Helper method to process a user's achievements for a game
    async processGame(username, gameId, progressionIds, winIds, totalAchievements) {
        try {
            const progress = await retroAPI.getUserGameProgress(username, gameId);
            
            // Get user earned achievement ids
            const userEarnedAchievements = Object.entries(progress.achievements)
                .filter(([id, data]) => data.hasOwnProperty('dateEarned'))
                .map(([id, data]) => id);
            
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
            
            let points = 1; // Participation
            if (hasAllAchievements || (hasAllProgressionAchievements && hasWinCondition)) {
                points = 3; // Beaten or Mastery
            }
            
            return {
                earned: progress.numAwardedToUser,
                points
            };
        } catch (error) {
            console.error(`Error processing game achievements for ${username} in game ${gameId}:`, error);
            return null;
        }
    }
};
