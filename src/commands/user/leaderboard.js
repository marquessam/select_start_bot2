import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js';
import { HistoricalLeaderboard } from '../../models/HistoricalLeaderboard.js';
import retroAPI from '../../services/retroAPI.js';
import { config } from '../../config/config.js';

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

const TIEBREAKER_EMOJI = '⚔️'; // Emoji to indicate tiebreaker status

// Number of users to show per page
const USERS_PER_PAGE = 10;

function isDateInCurrentMonth(dateString) {
    // Parse the input date string more reliably
    const inputDate = new Date(dateString);
    
    // Get the current date
    const currentDate = new Date();
    
    // Get the first day of the current month (at midnight)
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0);
    
    // Get the first day of the previous month (at midnight)
    const firstDayOfPrevMonth = new Date(firstDayOfMonth);
    firstDayOfPrevMonth.setMonth(firstDayOfPrevMonth.getMonth() - 1);
    
    // Get the last day of the previous month (end of day)
    const lastDayOfPrevMonth = new Date(firstDayOfMonth);
    lastDayOfPrevMonth.setDate(0); // This sets to the last day of previous month
    lastDayOfPrevMonth.setHours(23, 59, 59, 999); // End of day
    
    // The grace period includes the entire last day of the previous month
    // Check if the input date is on the last day of the previous month
    const isLastDayOfPrevMonth = inputDate.getFullYear() === lastDayOfPrevMonth.getFullYear() &&
                                 inputDate.getMonth() === lastDayOfPrevMonth.getMonth() &&
                                 inputDate.getDate() === lastDayOfPrevMonth.getDate();
    
    // Check if the input date is in the current month
    const isCurrentMonth = inputDate.getFullYear() === currentDate.getFullYear() &&
                           inputDate.getMonth() === currentDate.getMonth();
    
    return isCurrentMonth || isLastDayOfPrevMonth;
}

// Helper function to get month key from date (YYYY-MM format)
function getMonthKey(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
}

// Helper function to format ordinal numbers (1st, 2nd, 3rd, etc.)
function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Display the current or historical challenge leaderboard'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        await this.displayCurrentLeaderboard(interaction);
    },

    async displayCurrentLeaderboard(interaction) {
        try {
            // Get current date for finding current challenge
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

            // Get current challenge
            const currentChallenge = await Challenge.findOne({
                date: {
                    $gte: currentMonthStart,
                    $lt: nextMonthStart
                }
            });

            if (!currentChallenge) {
                return interaction.editReply('No active challenge found for the current month.');
            }

            // Get game info - use stored metadata if available
            let gameTitle = currentChallenge.monthly_game_title;
            let gameImageUrl = currentChallenge.monthly_game_icon_url;
            let gameInfo;

            if (!gameTitle || !gameImageUrl) {
                try {
                    gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);
                    gameTitle = gameInfo.title;
                    gameImageUrl = gameInfo.imageIcon;
                    
                    // Update challenge with metadata for future use
                    if (gameInfo) {
                        currentChallenge.monthly_game_title = gameTitle;
                        currentChallenge.monthly_game_icon_url = gameImageUrl;
                        currentChallenge.monthly_game_console = gameInfo.consoleName;
                        await currentChallenge.save();
                    }
                } catch (error) {
                    console.error('Error fetching game info:', error);
                    // Continue with null gameInfo
                }
            } else {
                // Create gameInfo object from stored data for consistency
                gameInfo = {
                    title: gameTitle,
                    imageIcon: gameImageUrl
                };
            }

            // Get all registered users
            const users = await User.find({});

            // Get progress for all users
            const userProgress = await Promise.all(users.map(async (user) => {
                const progress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    currentChallenge.monthly_challange_gameid
                );

                // Only include users who have at least started the game
                if (progress.numAwardedToUser > 0) {
                    // EXACTLY MATCHING PROFILE.JS LOGIC FOR CALCULATING ACHIEVEMENTS
                    // Get achievements earned during this month (including grace period)
                    const achievementsEarnedThisMonth = Object.entries(progress.achievements)
                        .filter(([id, data]) => data.hasOwnProperty('dateEarned') && isDateInCurrentMonth(data.dateEarned))
                        .map(([id, data]) => id);
                    
                    // If no achievements were earned this month, skip this user
                    if (achievementsEarnedThisMonth.length === 0) {
                        return null;
                    }

                    // Check if user has all achievements in the game
                    const hasAllAchievements = achievementsEarnedThisMonth.length === currentChallenge.monthly_challange_game_total;

                    let award = '';
                    let points = 0;

                    // To get mastery points this month, user must have earned at least one achievement this month
                    // AND have the game 100% completed now
                    if (achievementsEarnedThisMonth.length > 0 && hasAllAchievements) {
                        award = AWARD_EMOJIS.MASTERY;
                        points = 7;
                    } 
                    // For beaten status, check progression and win achievements
                    else {
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
                        
                        // Count total valid progression achievements
                        const totalValidProgressionAchievements = progressionAchievements.filter(id => 
                            achievementsEarnedThisMonth.includes(id)
                        );
                        
                        // Count total valid win achievements
                        const totalValidWinAchievements = winAchievements.filter(id => 
                            achievementsEarnedThisMonth.includes(id)
                        );

                        // For beaten status, the user must have all progression achievements AND at least one win achievement (if any required)
                        // AND at least one of those achievements must have been earned this month
                        if (totalValidProgressionAchievements.length === progressionAchievements.length && 
                            (winAchievements.length === 0 || totalValidWinAchievements.length > 0) &&
                            (earnedProgressionInMonth.length > 0 || earnedWinInMonth.length > 0)) {
                            award = AWARD_EMOJIS.BEATEN;
                            points = 4;
                        }
                        // For participation, at least one achievement must be earned this month
                        else if (achievementsEarnedThisMonth.length > 0) {
                            award = AWARD_EMOJIS.PARTICIPATION;
                            points = 1;
                        }
                    }

                    return {
                        user,
                        username: user.raUsername,
                        achieved: achievementsEarnedThisMonth.length,
                        percentage: (achievementsEarnedThisMonth.length / currentChallenge.monthly_challange_game_total * 100).toFixed(2),
                        award,
                        points,
                        earnedThisMonth: achievementsEarnedThisMonth.length
                    };
                }
                return null;
            }));

            // Filter out null entries and sort by achievements first, then by points as tiebreaker
            const sortedProgress = userProgress
                .filter(progress => progress !== null)
                .sort((a, b) => {
                    // Primary sort: Number of achievements (descending)
                    if (b.achieved !== a.achieved) {
                        return b.achieved - a.achieved;
                    }
                    
                    // Special case: If both users have 100% completion, treat them as tied
                    // This ensures all users with 100% are considered tied for first place
                    if (a.percentage == 100.00 && b.percentage == 100.00) {
                        return 0;
                    }
                    
                    // Secondary sort: Points from awards (descending)
                    return b.points - a.points;
                });

            // Check for an active tiebreaker for the current month
            const monthKey = getMonthKey(now);
            const activeTiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });

            // Create a working copy of sortedProgress for tiebreaker processing
            const workingSorted = [...sortedProgress];

            // Get tiebreaker data if there's an active tiebreaker
            let tiebreakerEntries = [];
            if (activeTiebreaker) {
                try {
                    // Fetch multiple batches of leaderboard entries
                    const batch1 = await retroAPI.getLeaderboardEntriesDirect(activeTiebreaker.leaderboardId, 0, 500);
                    const batch2 = await retroAPI.getLeaderboardEntriesDirect(activeTiebreaker.leaderboardId, 500, 500);
                    
                    // Combine the batches
                    let rawEntries = [];
                    
                    // Process first batch
                    if (batch1) {
                        if (Array.isArray(batch1)) {
                            rawEntries = [...rawEntries, ...batch1];
                        } else if (batch1.Results && Array.isArray(batch1.Results)) {
                            rawEntries = [...rawEntries, ...batch1.Results];
                        }
                    }
                    
                    // Process second batch
                    if (batch2) {
                        if (Array.isArray(batch2)) {
                            rawEntries = [...rawEntries, ...batch2];
                        } else if (batch2.Results && Array.isArray(batch2.Results)) {
                            rawEntries = [...rawEntries, ...batch2.Results];
                        }
                    }
                    
                    console.log(`Total tiebreaker entries fetched: ${rawEntries.length}`);
                    
                    // Process tiebreaker entries
                    tiebreakerEntries = rawEntries.map(entry => {
                        const user = entry.User || entry.user || '';
                        const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                        const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                        const rank = entry.Rank || entry.rank || 0;
                        
                        return {
                            username: user.trim().toLowerCase(),
                            score: formattedScore,
                            apiRank: parseInt(rank, 10)
                        };
                    });
                } catch (error) {
                    console.error('Error fetching tiebreaker leaderboard:', error);
                }
            }

            // Process tiebreaker and assign ranks correctly
            this.assignRanks(workingSorted, tiebreakerEntries, activeTiebreaker);

            // Save the processed results to the database (for individual users)
            const monthKeyForDB = User.formatDateKey(currentChallenge.date);
            try {
                console.log(`Saving processed leaderboard data for ${sortedProgress.length} users to database...`);
                
                // Process each user's data in parallel
                await Promise.all(sortedProgress.map(async (progress) => {
                    try {
                        const { user, achieved, percentage, points } = progress;
                        
                        // Save the PROCESSED data to the database
                        user.monthlyChallenges.set(monthKeyForDB, { 
                            progress: points,
                            achievements: achieved, // This is the time-gated count
                            totalAchievements: currentChallenge.monthly_challange_game_total,
                            percentage: parseFloat(percentage),
                            gameTitle: gameTitle,
                            gameIconUrl: gameImageUrl
                        });
                        
                        await user.save();
                    } catch (userError) {
                        console.error(`Error saving data for user ${progress.username}:`, userError);
                    }
                }));
                
                // Notify the API to refresh its cache
                try {
                    console.log('Notifying API to refresh data...');
                    const response = await fetch('https://select-start-api-production.up.railway.app/api/admin/force-update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': '0000'
                        },
                        body: JSON.stringify({ target: 'leaderboards' })
                    });
                    
                    console.log('API response:', response.ok ? 'Success' : 'Failed');
                } catch (apiError) {
                    console.error('Error notifying API:', apiError);
                }
            } catch (saveError) {
                console.error('Error saving processed data:', saveError);
                // Continue execution to at least show the leaderboard
            }

            // Get month name for the title
            const monthName = now.toLocaleString('default', { month: 'long' });
            
            // Calculate challenge end date and time remaining
            const challengeEndDate = new Date(nextMonthStart);
            challengeEndDate.setDate(challengeEndDate.getDate() - 1); // Last day of current month
            challengeEndDate.setHours(23, 59, 59);  // Set to 11:59 PM
            
            // Convert to UNIX timestamp for Discord formatting
            const endDateTimestamp = Math.floor(challengeEndDate.getTime() / 1000);
            
            // Format the end date for display (using Discord timestamps)
            const endDateFormatted = `<t:${endDateTimestamp}:F>`;
            
            // Use Discord's relative time format
            const timeRemaining = `<t:${endDateTimestamp}:R>`;

            if (workingSorted.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle(`${monthName} Challenge Leaderboard`)
                    .setColor('#FFD700')
                    .setThumbnail(`https://retroachievements.org${gameImageUrl}`);

                // Add game details to description
                let description = `**Game:** [${gameTitle}](https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid})\n` +
                                `**Total Achievements:** ${currentChallenge.monthly_challange_game_total}\n` +
                                `**Challenge Ends:** ${endDateFormatted}\n` +
                                `**Time Remaining:** ${timeRemaining}\n\n` +
                                `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`;

                // Add tiebreaker info if active
                if (activeTiebreaker) {
                    description += `\n\n${TIEBREAKER_EMOJI} **Active Tiebreaker:** ${activeTiebreaker.gameTitle}\n` +
                                `*Tiebreaker results are used to determine final ranking for tied users in top positions.*`;
                }
                
                description += `\n\n*Note: Only achievements earned during ${monthName} count toward challenge status.*`;
                
                embed.setDescription(description);

                embed.addFields({
                    name: 'No Participants',
                    value: 'No one has earned achievements in this challenge this month yet!'
                });
                
                // Create a button to view historical leaderboards
                const historyButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('view_history')
                            .setLabel('View Historical Leaderboards')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📚')
                    );

                // Return response with the history button
                return interaction.editReply({ 
                    embeds: [embed],
                    components: [historyButton]
                });
            }

            // Create paginated embeds
            const embeds = this.createPaginatedEmbeds(workingSorted, monthName, gameInfo, currentChallenge, 
                endDateFormatted, timeRemaining, activeTiebreaker);

            // Display paginated leaderboard with navigation
            await this.displayPaginatedLeaderboard(interaction, embeds, true);

        } catch (error) {
            console.error('Error displaying leaderboard:', error);
            return interaction.editReply('An error occurred while fetching the leaderboard. Please try again.');
        }
    },

    async showHistoricalSelector(interaction) {
        try {
            // Get list of all available historical leaderboards
            const historicalLeaderboards = await HistoricalLeaderboard.find()
                .sort({ date: -1 }); // Sort by date descending (newest first)
            
            if (historicalLeaderboards.length === 0) {
                return interaction.editReply('No historical leaderboards are available yet.');
            }
            
            // Create embed for selector
            const embed = new EmbedBuilder()
                .setTitle('📚 Historical Leaderboards')
                .setColor('#FFD700')
                .setDescription('Select a month to view its challenge leaderboard:')
                .setFooter({ text: 'Historical leaderboards are preserved at the end of each month' });
                
            // Create a select menu with available months
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('historical_select')
                .setPlaceholder('Select a month...');
                
            // Add options for each historical leaderboard (up to 25, the Discord limit)
            const options = historicalLeaderboards.slice(0, 25).map(leaderboard => {
                const date = new Date(leaderboard.date);
                const monthName = date.toLocaleString('default', { month: 'long' });
                const year = date.getFullYear();
                
                return new StringSelectMenuOptionBuilder()
                    .setLabel(`${monthName} ${year}`)
                    .setDescription(`${leaderboard.gameTitle} - ${leaderboard.participants.length} participants`)
                    .setValue(leaderboard.monthKey);
            });
            
            selectMenu.addOptions(options);
            
            // Add a button to return to current leaderboard
            const currentButton = new ButtonBuilder()
                .setCustomId('current_leaderboard')
                .setLabel('Current Leaderboard')
                .setStyle(ButtonStyle.Primary);
                
            // Create action rows
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            const buttonRow = new ActionRowBuilder().addComponents(currentButton);
            
            // Send the selector
            const message = await interaction.editReply({
                embeds: [embed],
                components: [selectRow, buttonRow]
            });
            
            // Create collector for interactions
            const collector = message.createMessageComponentCollector({
                time: 300000 // 5 minutes
            });
            
            // Handle interactions
            collector.on('collect', async (i) => {
                if (i.customId === 'current_leaderboard') {
                    // Show current leaderboard
                    await i.deferUpdate();
                    await this.displayCurrentLeaderboard(interaction);
                    collector.stop();
                } 
                else if (i.customId === 'historical_select') {
                    // Show the selected historical leaderboard
                    await i.deferUpdate();
                    const selectedMonthKey = i.values[0];
                    await this.displayHistoricalLeaderboard(interaction, selectedMonthKey);
                    collector.stop();
                }
            });
            
            // When collector expires
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        // Disable the components
                        const disabledSelectRow = new ActionRowBuilder().addComponents(
                            selectMenu.setDisabled(true)
                        );
                        const disabledButtonRow = new ActionRowBuilder().addComponents(
                            currentButton.setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embed.setFooter({ text: 'Session expired • Use /leaderboard again to try again' })],
                            components: [disabledSelectRow, disabledButtonRow]
                        });
                    } catch (error) {
                        console.error('Error disabling components:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Error showing historical selector:', error);
            return interaction.editReply('An error occurred while retrieving historical leaderboards.');
        }
    },

    async displayHistoricalLeaderboard(interaction, monthKey) {
        try {
            // Get the historical leaderboard data
            const leaderboard = await HistoricalLeaderboard.findOne({ monthKey });
            
            if (!leaderboard) {
                return interaction.editReply(`No historical leaderboard found for ${monthKey}.`);
            }
            
            // Create the leaderboard embeds from historical data
            const date = new Date(leaderboard.date);
            const monthName = date.toLocaleString('default', { month: 'long' });
            const year = date.getFullYear();
            
            // Format gameInfo to match structure expected by createPaginatedEmbeds
            const gameInfo = {
                title: leaderboard.gameTitle,
                imageIcon: leaderboard.gameImageUrl
            };
            
            // Create paginated embeds using stored participant data
            const embeds = this.createHistoricalEmbeds(leaderboard);
            
            // Display paginated leaderboard with navigation
            await this.displayPaginatedLeaderboard(interaction, embeds, false);
            
        } catch (error) {
            console.error('Error displaying historical leaderboard:', error);
            return interaction.editReply('An error occurred while retrieving the historical leaderboard.');
        }
    },

    createHistoricalEmbeds(leaderboard) {
        const embeds = [];
        const totalPages = Math.ceil(leaderboard.participants.length / USERS_PER_PAGE);
        
        // Get month name and year
        const date = new Date(leaderboard.date);
        const monthName = date.toLocaleString('default', { month: 'long' });
        const year = date.getFullYear();
        
        for (let page = 0; page < totalPages; page++) {
            // Get participants for this page
            const startIndex = page * USERS_PER_PAGE;
            const endIndex = Math.min((page + 1) * USERS_PER_PAGE, leaderboard.participants.length);
            const participantsOnPage = leaderboard.participants.slice(startIndex, endIndex);
            
            // Create embed for this page
            const embed = new EmbedBuilder()
                .setTitle(`${monthName} ${year} Challenge Leaderboard (Historical)`)
                .setColor('#FFD700')
                .setFooter({ text: `Page ${page + 1}/${totalPages} • Historical record` })
                .setTimestamp(new Date(leaderboard.createdAt));
                
            // Add thumbnail if available
            if (leaderboard.gameImageUrl) {
                embed.setThumbnail(`https://retroachievements.org${leaderboard.gameImageUrl}`);
            }
            
            // Create description
            let description = `**Game:** [${leaderboard.gameTitle}](https://retroachievements.org/game/${leaderboard.gameId})\n` +
                            `**Total Achievements:** ${leaderboard.totalAchievements}\n` +
                            `**Challenge Period:** ${monthName} ${year}\n\n` +
                            `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`;
            
            // Add tiebreaker info if applicable
            if (leaderboard.tiebreakerInfo && leaderboard.tiebreakerInfo.isActive) {
                description += `\n\n${TIEBREAKER_EMOJI} **Tiebreaker Game:** ${leaderboard.tiebreakerInfo.gameTitle}\n` +
                            `*Tiebreaker results were used to determine final ranking for tied users in top positions.*`;
            }
                            
            description += `\n\n*This is a historical record of the ${monthName} ${year} challenge.*`;
            
            embed.setDescription(description);
            
            // Format leaderboard text
            let leaderboardText = '';
            
            for (const participant of participantsOnPage) {
                // Use the stored displayRank
                const rankEmoji = participant.displayRank <= 3 ? RANK_EMOJIS[participant.displayRank] : `#${participant.displayRank}`;
                
                // Add the participant entry
                leaderboardText += `${rankEmoji} **[${participant.username}](https://retroachievements.org/user/${participant.username})** ${participant.award}\n`;
                
                // Add achievement stats
                if (participant.hasTiebreaker && participant.tiebreakerScore) {
                    leaderboardText += `${participant.achievements}/${leaderboard.totalAchievements} (${participant.percentage}%)\n`;
                    leaderboardText += `${TIEBREAKER_EMOJI} ${participant.tiebreakerScore}\n\n`;
                } else {
                    leaderboardText += `${participant.achievements}/${leaderboard.totalAchievements} (${participant.percentage}%)\n\n`;
                }
            }
            
            embed.addFields({
                name: `Final Rankings (${leaderboard.participants.length} participants)`,
                value: leaderboardText || 'No participants found.'
            });
            
            // Add winners section if this is the first page
            if (page === 0 && leaderboard.winners && leaderboard.winners.length > 0) {
                let winnersText = '';
                leaderboard.winners.forEach(winner => {
                    const medalEmoji = winner.rank === 1 ? '🥇' : (winner.rank === 2 ? '🥈' : '🥉');
                    winnersText += `${medalEmoji} **${winner.username}**: ${winner.achievements}/${leaderboard.totalAchievements} (${winner.percentage}%) ${winner.award}\n`;
                    
                    // Add tiebreaker info if available
                    if (winner.tiebreakerScore) {
                        winnersText += `   ${TIEBREAKER_EMOJI} Tiebreaker: ${winner.tiebreakerScore}\n`;
                    }
                });
                
                embed.addFields({
                    name: '🏆 Winners',
                    value: winnersText
                });
            }
            
            // Add shadow challenge info if applicable
            if (page === 0 && leaderboard.shadowChallengeInfo && leaderboard.shadowChallengeInfo.wasRevealed) {
                embed.addFields({
                    name: 'Shadow Challenge',
                    value: `This month also featured a shadow challenge: **${leaderboard.shadowChallengeInfo.gameTitle}**`
                });
            }
            
            embeds.push(embed);
        }
        
        return embeds;
    },

    async displayPaginatedLeaderboard(interaction, embeds, isCurrentMonth) {
        // If only one page, just send it with appropriate components
        if (embeds.length === 1) {
            // Create a button to view historical leaderboards if viewing current month
            const historyButton = isCurrentMonth ? 
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('view_history')
                            .setLabel('View Historical Leaderboards')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📚')
                    )
                : new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('current_leaderboard')
                            .setLabel('Current Leaderboard')
                            .setStyle(ButtonStyle.Primary)
                    );
                
            return interaction.editReply({ 
                embeds: [embeds[0]], 
                components: [historyButton]
            });
        }

        // Create navigation buttons
        const navRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('first')
                    .setLabel('First')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏮️'),
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('◀️'),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('▶️'),
                new ButtonBuilder()
                    .setCustomId('last')
                    .setLabel('Last')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏭️')
            );
            
        // Add a button to view history or current leaderboard
        const actionButton = isCurrentMonth ?
            new ButtonBuilder()
                .setCustomId('view_history')
                .setLabel('View Historical Leaderboards')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📚')
            : new ButtonBuilder()
                .setCustomId('current_leaderboard')
                .setLabel('Current Leaderboard')
                .setStyle(ButtonStyle.Primary);
                
        const actionRow = new ActionRowBuilder().addComponents(actionButton);

        let currentPage = 0;

        // Send the first page with navigation buttons
        const message = await interaction.editReply({
            embeds: [embeds[currentPage]],
            components: [navRow, actionRow]
        });

        // Create collector for button interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes timeout
        });

        // Update buttons based on current page
        const updateButtons = (page) => {
            // Disable/enable buttons based on current page
            navRow.components[0].setDisabled(page === 0); // First
            navRow.components[1].setDisabled(page === 0); // Previous
            navRow.components[2].setDisabled(page === embeds.length - 1); // Next
            navRow.components[3].setDisabled(page === embeds.length - 1); // Last
            
            return navRow;
        };

        // Handle button clicks
        collector.on('collect', async (i) => {
            try {
                // Handle navigation buttons
                if (['first', 'previous', 'next', 'last'].includes(i.customId)) {
                    // Defer the update to avoid interaction timeouts
                    await i.deferUpdate();

                    // Handle different button clicks
                    switch (i.customId) {
                        case 'first':
                            currentPage = 0;
                            break;
                        case 'previous':
                            currentPage = Math.max(0, currentPage - 1);
                            break;
                        case 'next':
                            currentPage = Math.min(embeds.length - 1, currentPage + 1);
                            break;
                        case 'last':
                            currentPage = embeds.length - 1;
                            break;
                    }

                    // Update the message with the new page and updated buttons
                    await i.editReply({
                        embeds: [embeds[currentPage]],
                        components: [updateButtons(currentPage), actionRow]
                    });
                }
                // Handle action buttons
                else if (i.customId === 'view_history') {
                    await i.deferUpdate();
                    await this.showHistoricalSelector(interaction);
                    collector.stop();
                }
                else if (i.customId === 'current_leaderboard') {
                    await i.deferUpdate();
                    await this.displayCurrentLeaderboard(interaction);
                    collector.stop();
                }
            } catch (error) {
                console.error('Error handling button interaction:', error);
                // Try to recover by not stopping the collector
            }
        });

        // When the collector expires
        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                try {
                    // Disable all buttons when time expires
                    const disabledNavRow = new ActionRowBuilder().addComponents(
                        navRow.components[0].setDisabled(true),
                        navRow.components[1].setDisabled(true),
                        navRow.components[2].setDisabled(true),
                        navRow.components[3].setDisabled(true)
                    );
                    
                    const disabledActionRow = new ActionRowBuilder().addComponents(
                        actionButton.setDisabled(true)
                    );

                    // Update the message with disabled buttons
                    await interaction.editReply({
                        embeds: [embeds[currentPage].setFooter({ 
                            text: 'Session expired • Use /leaderboard again to start a new session' 
                        })],
                        components: [disabledNavRow, disabledActionRow]
                    });
                } catch (error) {
                    console.error('Error disabling buttons:', error);
                }
            }
        });

        // Initially update buttons based on first page
        return updateButtons(currentPage);
    },

    // Method to handle assigning ranks with tiebreaker scores
    assignRanks(users, tiebreakerEntries, activeTiebreaker) {
        if (!users || users.length === 0) return;

        // First, add tiebreaker info to users
        if (tiebreakerEntries && tiebreakerEntries.length > 0) {
            for (const user of users) {
                const entry = tiebreakerEntries.find(e => 
                    e.username === user.username.toLowerCase()
                );
                
                if (entry) {
                    user.tiebreakerScore = entry.score;
                    user.tiebreakerRank = entry.apiRank;
                    user.tiebreakerGame = activeTiebreaker.gameTitle;
                    user.hasTiebreaker = true;
                } else {
                    user.hasTiebreaker = false;
                }
            }
        }

        // Store original order for stable sorting
        users.forEach((user, index) => {
            user.originalIndex = index;
        });

        // Identify tied groups and assign ranks
        let currentRank = 1;
        let lastAchieved = -1;
        let lastPoints = -1;
        let currentTieGroup = [];
        let tieGroupStartIdx = 0;

        // First pass: identify tie groups
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            // Check if this user is tied with the previous user
            if (i > 0 && user.achieved === lastAchieved && user.points === lastPoints) {
                // Add to current tie group
                currentTieGroup.push(i);
            } else {
                // Process previous tie group if it exists
                if (currentTieGroup.length > 1) {
                    // This is a tie group - handle it
                    this.processTieGroup(users, currentTieGroup, tieGroupStartIdx);
                } else if (currentTieGroup.length === 1) {
                    // Single user, just assign the rank
                    users[currentTieGroup[0]].displayRank = tieGroupStartIdx + 1;
                }
                
                // Start a new potential tie group
                currentTieGroup = [i];
                tieGroupStartIdx = i;
            }
            
            // Update for next comparison
            lastAchieved = user.achieved;
            lastPoints = user.points;
        }
        
        // Process the last tie group if it exists
        if (currentTieGroup.length > 1) {
            this.processTieGroup(users, currentTieGroup, tieGroupStartIdx);
        } else if (currentTieGroup.length === 1) {
            users[currentTieGroup[0]].displayRank = tieGroupStartIdx + 1;
        }

        // Final pass: ensure all users have a displayRank
        for (let i = 0; i < users.length; i++) {
            if (users[i].displayRank === undefined) {
                users[i].displayRank = i + 1;
            }
        }

        // Now re-sort the users array based on displayRank
        users.sort((a, b) => {
            // Primary sort: displayRank (lowest first)
            if (a.displayRank !== b.displayRank) {
                return a.displayRank - b.displayRank;
            }
            
            // Secondary sort: preserve original order for stable sort
            return a.originalIndex - b.originalIndex;
        });
    },

    // Helper method to process a tie group
    processTieGroup(users, tieGroupIndices, startIdx) {
        // Only apply special tiebreaker logic to top 3 positions
        const isTopThree = startIdx < 3;
        
        if (isTopThree) {
            // Check if any users in this tie group have tiebreaker scores
            const withTiebreaker = tieGroupIndices.filter(idx => users[idx].hasTiebreaker);
            const withoutTiebreaker = tieGroupIndices.filter(idx => !users[idx].hasTiebreaker);
            
            if (withTiebreaker.length > 0) {
                // Sort users with tiebreakers by their tiebreaker rank
                withTiebreaker.sort((a, b) => users[a].tiebreakerRank - users[b].tiebreakerRank);
                
                // Assign individual ranks to users with tiebreakers
                for (let i = 0; i < withTiebreaker.length; i++) {
                    users[withTiebreaker[i]].displayRank = startIdx + 1 + i;
                }
                
                // All users without tiebreakers share the next rank
                const nextRank = startIdx + 1 + withTiebreaker.length;
                for (const idx of withoutTiebreaker) {
                    users[idx].displayRank = nextRank;
                }
            } else {
                // No tiebreakers - all share the same rank
                for (const idx of tieGroupIndices) {
                    users[idx].displayRank = startIdx + 1;
                }
            }
        } else {
            // Outside top 3: all users in tie group share the same rank
            for (const idx of tieGroupIndices) {
                users[idx].displayRank = startIdx + 1;
            }
        }
    },

    createPaginatedEmbeds(workingSorted, monthName, gameInfo, currentChallenge, endDateFormatted, timeRemaining, activeTiebreaker) {
        const embeds = [];
        const totalPages = Math.ceil(workingSorted.length / USERS_PER_PAGE);

        for (let page = 0; page < totalPages; page++) {
            // Get users for this page
            const startIndex = page * USERS_PER_PAGE;
            const endIndex = Math.min((page + 1) * USERS_PER_PAGE, workingSorted.length);
            const usersOnPage = workingSorted.slice(startIndex, endIndex);

            // Create embed for this page
            const embed = new EmbedBuilder()
                .setTitle(`${monthName} Challenge Leaderboard`)
                .setColor('#FFD700')
                .setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`)
                .setFooter({ text: `Page ${page + 1}/${totalPages} • Use /help points for more information` })
                .setTimestamp();

            // Create base description for all pages
            let description = `**Game:** [${gameInfo.title}](https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid})\n` +
                            `**Total Achievements:** ${currentChallenge.monthly_challange_game_total}\n` +
                            `**Challenge Ends:** ${endDateFormatted}\n` +
                            `**Time Remaining:** ${timeRemaining}\n\n` +
                            `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`;

            // Add tiebreaker info if active
            if (activeTiebreaker) {
                description += `\n\n${TIEBREAKER_EMOJI} **Active Tiebreaker:** ${activeTiebreaker.gameTitle}\n` +
                            `*Tiebreaker results are used to determine final ranking for tied users in top positions.*`;
            }
            
            description += `\n\n*Note: Only achievements earned during ${monthName} count toward challenge status.*`;
            
            embed.setDescription(description);

            // Format leaderboard text using pre-calculated displayRanks
            let leaderboardText = '';
            
            for (const user of usersOnPage) {
                // Use the pre-calculated displayRank
                const rankEmoji = user.displayRank <= 3 ? RANK_EMOJIS[user.displayRank] : `#${user.displayRank}`;
                
                // Add the main user entry to leaderboard with link to profile
                leaderboardText += `${rankEmoji} **[${user.username}](https://retroachievements.org/user/${user.username})** ${user.award}\n`;
                
                // Add the achievement stats
                if (user.hasTiebreaker && user.tiebreakerScore) {
                    // For users with tiebreaker scores, show both regular and tiebreaker stats
                    leaderboardText += `${user.achieved}/${currentChallenge.monthly_challange_game_total} (${user.percentage}%)\n`;
                    leaderboardText += `${TIEBREAKER_EMOJI} ${user.tiebreakerScore} in ${user.tiebreakerGame}\n\n`;
                } else {
                    // For users without tiebreaker scores, just show regular stats
                    leaderboardText += `${user.achieved}/${currentChallenge.monthly_challange_game_total} (${user.percentage}%)\n\n`;
                }
            }

            embed.addFields({
                name: `Rankings (${workingSorted.length} participants)`,
                value: leaderboardText || 'No rankings available.'
            });

            embeds.push(embed);
        }

        return embeds;
    },

    // Method to finalize the previous month's leaderboard - used by cron job, not user facing
    async finalizePreviousMonth(interaction) {
        try {
            // Get current date
            const now = new Date();
            
            // Get previous month's date range
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            // Calculate previous month
            let prevMonth = currentMonth - 1;
            let prevYear = currentYear;
            if (prevMonth < 0) {
                prevMonth = 11;  // December
                prevYear = currentYear - 1;
            }
            
            const prevMonthStart = new Date(prevYear, prevMonth, 1);
            const prevMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59); // Last day of prev month
            
            // Format month key for lookup
            const monthKey = getMonthKey(prevMonthStart);
            
            // Check if we already have a finalized leaderboard for this month
            const existingLeaderboard = await HistoricalLeaderboard.findOne({ 
                monthKey,
                isFinalized: true 
            });
            
            if (existingLeaderboard) {
                // If results haven't been announced yet but leaderboard exists
                if (!existingLeaderboard.resultsAnnounced) {
                    // When called by cron job (not interactive), announce now
                    if (!interaction.guild) {
                        await this.announceResults(null, existingLeaderboard);
                        return;
                    }
                    
                    // Otherwise ask for confirmation
                    return interaction.editReply({
                        content: `Leaderboard for ${monthKey} is already finalized but hasn't been announced. Would you like to announce the results now?`,
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('announce_results')
                                    .setLabel('Announce Results')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId('cancel_announce')
                                    .setLabel('Cancel')
                                    .setStyle(ButtonStyle.Secondary)
                            )
                        ]
                    });
                } else {
                    return interaction.editReply ? 
                        interaction.editReply(`Leaderboard for ${monthKey} is already finalized and results have been announced.`) : 
                        console.log(`Leaderboard for ${monthKey} is already finalized and results have been announced.`);
                }
            }
            
            // Get the challenge for the previous month
            const challenge = await Challenge.findOne({
                date: {
                    $gte: prevMonthStart,
                    $lt: prevMonthEnd
                }
            });
            
            if (!challenge) {
                return interaction.editReply ? 
                    interaction.editReply(`No challenge found for ${monthKey}.`) : 
                    console.log(`No challenge found for ${monthKey}.`);
            }
            
            // Get game info - use stored metadata if available
            let gameTitle = challenge.monthly_game_title;
            let gameImageUrl = challenge.monthly_game_icon_url;
            let consoleName = challenge.monthly_game_console;
            
            // If metadata isn't stored in the Challenge model, fetch it
            if (!gameTitle || !gameImageUrl) {
                try {
                    const gameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);
                    gameTitle = gameInfo.title;
                    gameImageUrl = gameInfo.imageIcon;
                    consoleName = gameInfo.consoleName;
                    
                    // Update the challenge with this metadata for future use
                    if (gameInfo) {
                        challenge.monthly_game_title = gameTitle;
                        challenge.monthly_game_icon_url = gameImageUrl;
                        challenge.monthly_game_console = consoleName;
                        await challenge.save();
                    }
                } catch (error) {
                    console.error(`Error fetching game info for ${challenge.monthly_challange_gameid}:`, error);
                    if (interaction.editReply) {
                        return interaction.editReply('An error occurred while fetching game information. Please try again.');
                    }
                    return;
                }
            }
            
            // Get all users and their progress data as stored by statsUpdateService
            const users = await User.find({});
            const monthKeyForUser = User.formatDateKey(challenge.date);
            
            // Get all users who participated in the challenge - directly use statsUpdateService's data
            const participants = users.filter(user => 
                user.monthlyChallenges && 
                user.monthlyChallenges.has(monthKeyForUser) &&
                user.monthlyChallenges.get(monthKeyForUser).achievements > 0
            );
            
            if (participants.length === 0) {
                return interaction.editReply ? 
                    interaction.editReply(`No participants found for the ${monthKey} challenge.`) : 
                    console.log(`No participants found for the ${monthKey} challenge.`);
            }
            
            // Map user data to the format needed for the historical leaderboard
            // This uses the cached data from statsUpdateService
            const leaderboardParticipants = participants.map(user => {
                const challengeData = user.monthlyChallenges.get(monthKeyForUser);
                const points = challengeData.progress || 0;
                
                // Determine award emoji based on points
                let award = '';
                if (points === 7) award = AWARD_EMOJIS.MASTERY;
                else if (points === 4) award = AWARD_EMOJIS.BEATEN;
                else if (points === 1) award = AWARD_EMOJIS.PARTICIPATION;
                
                return {
                    username: user.raUsername,
                    achievements: challengeData.achievements,
                    percentage: challengeData.percentage,
                    points: points,
                    award: award
                };
            });
            
            // Sort participants by achievements and points
            leaderboardParticipants.sort((a, b) => {
                if (b.achievements !== a.achievements) {
                    return b.achievements - a.achievements;
                }
                return b.points - a.points;
            });
            
            // Check if there was a tiebreaker for this month
            const tiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                monthKey: monthKey
            });
            
            // Process tiebreaker information if available
            let tiebreakerEntries = [];
            let tiebreakerInfo = null;
            
            if (tiebreaker) {
                try {
                    // Fetch tiebreaker leaderboard entries
                    const batch1 = await retroAPI.getLeaderboardEntriesDirect(tiebreaker.leaderboardId, 0, 500);
                    const batch2 = await retroAPI.getLeaderboardEntriesDirect(tiebreaker.leaderboardId, 500, 500);
                    
                    // Process entries (similar to the display logic)
                    let rawEntries = [];
                    
                    if (batch1) {
                        if (Array.isArray(batch1)) {
                            rawEntries = [...rawEntries, ...batch1];
                        } else if (batch1.Results && Array.isArray(batch1.Results)) {
                            rawEntries = [...rawEntries, ...batch1.Results];
                        }
                    }
                    
                    if (batch2) {
                        if (Array.isArray(batch2)) {
                            rawEntries = [...rawEntries, ...batch2];
                        } else if (batch2.Results && Array.isArray(batch2.Results)) {
                            rawEntries = [...rawEntries, ...batch2.Results];
                        }
                    }
                    
                    tiebreakerEntries = rawEntries.map(entry => {
                        const user = entry.User || entry.user || '';
                        const score = entry.Score || entry.score || entry.Value || entry.value || 0;
                        const formattedScore = entry.FormattedScore || entry.formattedScore || entry.ScoreFormatted || score.toString();
                        const rank = entry.Rank || entry.rank || 0;
                        
                        return {
                            username: user.trim().toLowerCase(),
                            score: formattedScore,
                            apiRank: parseInt(rank, 10)
                        };
                    });
                    
                    // Store tiebreaker info
                    tiebreakerInfo = {
                        gameId: tiebreaker.gameId,
                        gameTitle: tiebreaker.gameTitle,
                        leaderboardId: tiebreaker.leaderboardId,
                        isActive: true
                    };
                } catch (error) {
                    console.error('Error fetching tiebreaker entries:', error);
                }
            }
            
            // Store original order for stable sorting
            leaderboardParticipants.forEach((participant, index) => {
                participant.originalIndex = index;
            });
            
            // Add tiebreaker info to participants
            if (tiebreakerEntries && tiebreakerEntries.length > 0) {
                for (const participant of leaderboardParticipants) {
                    const entry = tiebreakerEntries.find(e => 
                        e.username === participant.username.toLowerCase()
                    );
                    
                    if (entry) {
                        participant.tiebreakerScore = entry.score;
                        participant.tiebreakerRank = entry.apiRank;
                        participant.hasTiebreaker = true;
                    } else {
                        participant.hasTiebreaker = false;
                    }
                }
            }
            
            // Apply the same rank calculation logic as in the display function
            this.assignRanks(leaderboardParticipants, tiebreakerEntries, tiebreaker);
            
            // Create winners array (top 3 participants)
            const winners = leaderboardParticipants
                .filter(p => p.displayRank <= 3)
                .map(p => ({
                    rank: p.displayRank,
                    username: p.username,
                    achievements: p.achievements,
                    percentage: p.percentage,
                    award: p.award,
                    points: p.points,
                    tiebreakerScore: p.tiebreakerScore || null
                }));
            
            // Check for shadow challenge info
            let shadowChallengeInfo = null;
            if (challenge.shadow_challange_gameid && challenge.shadow_challange_revealed) {
                // Get shadow game info - use stored metadata if available
                let shadowGameTitle = challenge.shadow_game_title;
                let shadowGameImageUrl = challenge.shadow_game_icon_url;
                
                // If metadata isn't stored in the Challenge model, fetch it
                if (!shadowGameTitle || !shadowGameImageUrl) {
                    try {
                        const shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);
                        shadowGameTitle = shadowGameInfo.title;
                        shadowGameImageUrl = shadowGameInfo.imageIcon;
                        
                        // Update the challenge with this metadata for future use
                        if (shadowGameInfo) {
                            challenge.shadow_game_title = shadowGameTitle;
                            challenge.shadow_game_icon_url = shadowGameImageUrl;
                            await challenge.save();
                        }
                    } catch (error) {
                        console.error(`Error fetching shadow game info for ${challenge.shadow_challange_gameid}:`, error);
                    }
                }
                
                shadowChallengeInfo = {
                    gameId: challenge.shadow_challange_gameid,
                    gameTitle: shadowGameTitle,
                    gameImageUrl: shadowGameImageUrl,
                    totalAchievements: challenge.shadow_challange_game_total,
                    wasRevealed: true
                };
            }
                
            // Create the historical leaderboard record
            const historicalLeaderboard = new HistoricalLeaderboard({
                monthKey: monthKey,
                date: prevMonthStart,
                challengeId: challenge._id,
                gameId: challenge.monthly_challange_gameid,
                gameTitle: gameTitle,
                gameImageUrl: gameImageUrl,
                consoleName: consoleName,
                totalAchievements: challenge.monthly_challange_game_total,
                progressionAchievements: challenge.monthly_challange_progression_achievements || [],
                winAchievements: challenge.monthly_challange_win_achievements || [],
                participants: leaderboardParticipants,
                winners: winners,
                tiebreakerInfo: tiebreakerInfo,
                shadowChallengeInfo: shadowChallengeInfo,
                isFinalized: true,
                resultsAnnounced: false
            });
            
            // Save the historical leaderboard
            await historicalLeaderboard.save();
            
            // If this is called by cron job (not interactive), announce immediately
            if (!interaction.guild) {
                console.log(`Leaderboard for ${monthKey} has been finalized. Announcing results automatically.`);
                await this.announceResults(null, historicalLeaderboard);
                return;
            }
            
            // Notify the user and provide options to announce
            await interaction.editReply({
                content: `Successfully finalized the leaderboard for ${monthKey}. Would you like to announce the results now?`,
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('announce_results')
                            .setLabel('Announce Results')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('cancel_announce')
                            .setLabel('Later')
                            .setStyle(ButtonStyle.Secondary)
                    )
                ]
            });
            
            // Create collector for button interaction
            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000 // 1 minute
            });
            
            collector.on('collect', async (i) => {
                await i.deferUpdate();
                
                if (i.customId === 'announce_results') {
                    // Announce the results
                    await this.announceResults(interaction, historicalLeaderboard);
                    collector.stop();
                } else if (i.customId === 'cancel_announce') {
                    await interaction.editReply({
                        content: `Leaderboard for ${monthKey} has been finalized. You can announce the results later using \`/leaderboard\` and the automated monthly system.`,
                        components: []
                    });
                    collector.stop();
                }
            });
            
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await interaction.editReply({
                        content: `Leaderboard for ${monthKey} has been finalized. Results will be announced automatically at the start of next month.`,
                        components: []
                    });
                }
            });
            
        } catch (error) {
            console.error('Error finalizing leaderboard:', error);
            if (interaction.editReply) {
                return interaction.editReply('An error occurred while finalizing the leaderboard.');
            }
        }
    },
    
    async announceResults(interaction, leaderboard) {
        try {
            // Get the announcement channel from config
            const announcementChannelId = config.discord.announcementChannelId;
            
            if (!announcementChannelId) {
                const errorMsg = 'Announcement channel ID is not configured. Please check your config.js file.';
                if (interaction) {
                    return interaction.editReply(errorMsg);
                }
                console.error(errorMsg);
                return;
            }
            
            // Get the guild and channel
            let guild;
            if (interaction && interaction.guild) {
                guild = interaction.guild;
            } else {
                guild = this.client ? this.client.guilds.cache.first() : null;
                if (!guild) {
                    const errorMsg = 'Could not find guild for announcement';
                    if (interaction) return interaction.editReply(errorMsg);
                    console.error(errorMsg);
                    return;
                }
            }
            
            const announcementChannel = await guild.channels.fetch(announcementChannelId);
            
            if (!announcementChannel) {
                const errorMsg = `Announcement channel with ID ${announcementChannelId} not found.`;
                if (interaction) return interaction.editReply(errorMsg);
                console.error(errorMsg);
                return;
            }
            
            // Format date for display
            const date = new Date(leaderboard.date);
            const monthName = date.toLocaleString('default', { month: 'long' });
            const year = date.getFullYear();
            
            // Create the announcement embed
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${monthName} ${year} Challenge Results 🏆`)
                .setColor('#FFD700')
                .setDescription(`The results for the **${monthName} ${year}** monthly challenge are in! Congratulations to all participants who tackled **${leaderboard.gameTitle}**!`)
                .setThumbnail(`https://retroachievements.org${leaderboard.gameImageUrl}`);
                
            // Add winners section
            if (leaderboard.winners && leaderboard.winners.length > 0) {
                let winnersText = '';
                
                leaderboard.winners.forEach(winner => {
                    const medalEmoji = winner.rank === 1 ? '🥇' : (winner.rank === 2 ? '🥈' : '🥉');
                    winnersText += `${medalEmoji} **${winner.username}**: ${winner.achievements}/${leaderboard.totalAchievements} (${winner.percentage}%) ${winner.award}\n`;
                    
                    // Add tiebreaker info if available
                    if (winner.tiebreakerScore) {
                        winnersText += `   ${TIEBREAKER_EMOJI} Tiebreaker: ${winner.tiebreakerScore}\n`;
                    }
                });
                
                embed.addFields({
                    name: 'Winners',
                    value: winnersText
                });
            } else {
                embed.addFields({
                    name: 'No Winners',
                    value: 'No participants qualified for the top 3 positions.'
                });
            }
            
            // Add total participants count
            embed.addFields({
                name: 'Participation',
                value: `A total of **${leaderboard.participants.length}** members participated in this challenge.`
            });
            
            // Add shadow challenge info if applicable
            if (leaderboard.shadowChallengeInfo && leaderboard.shadowChallengeInfo.wasRevealed) {
                embed.addFields({
                    name: 'Shadow Challenge',
                    value: `This month also featured a shadow challenge: **${leaderboard.shadowChallengeInfo.gameTitle}**`
                });
            }
            
            // Add view leaderboard instructions
            embed.addFields({
                name: 'View Complete Leaderboard',
                value: 'Use `/leaderboard` and click the "View Historical Leaderboards" button to see all participants.'
            });
            
            embed.setFooter({ text: 'Monthly Challenge • RetroAchievements' });
            embed.setTimestamp();
            
            // Send the announcement
            await announcementChannel.send({ embeds: [embed] });
            
            // Update the historical leaderboard to mark as announced
            leaderboard.resultsAnnounced = true;
            await leaderboard.save();
            
            // Attempt to notify the API to refresh its cache
            try {
                const response = await fetch('https://select-start-api-production.up.railway.app/api/admin/force-update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': '0000'
                    },
                    body: JSON.stringify({ target: 'leaderboards' })
                });
                
                console.log('API notification response:', response.ok ? 'Success' : 'Failed');
            } catch (apiError) {
                console.error('Error notifying API:', apiError);
                // Continue execution even if API notification fails
            }
            
            // Notify the admin
            if (interaction) {
                return interaction.editReply(`Successfully announced the results for ${monthName} ${year} in ${announcementChannel}.`);
            }
            console.log(`Successfully announced the results for ${monthName} ${year}`);
            
        } catch (error) {
            console.error('Error announcing results:', error);
            if (interaction) {
                return interaction.editReply('An error occurred while announcing the results.');
            }
        }
    }
};
