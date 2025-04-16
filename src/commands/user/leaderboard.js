import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import { ArcadeBoard } from '../../models/ArcadeBoard.js'; // Add import for ArcadeBoard
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

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Display the current challenge leaderboard'),

    async execute(interaction) {
       await interaction.deferReply({ ephemeral: true });

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

            // Get game info
            const gameInfo = await retroAPI.getGameInfo(currentChallenge.monthly_challange_gameid);

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
            const monthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
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

            // NEW: Save the processed results to the database
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
                            gameTitle: gameInfo.title,
                            gameIconUrl: gameInfo.imageIcon
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
            
            // Format the end date
            const endDateFormatted = `${monthName} ${challengeEndDate.getDate()}${getDaySuffix(challengeEndDate.getDate())}, ${challengeEndDate.getFullYear()} at 11:59 PM`;
            
            // Calculate time remaining
            const timeRemaining = formatTimeRemaining(challengeEndDate, now);

            if (workingSorted.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle(`${monthName} Challenge Leaderboard`)
                    .setColor('#FFD700')
                    .setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`);

                // Add game details to description
                let description = `**Game:** ${gameInfo.title}\n` +
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

                return interaction.editReply({ embeds: [embed] });
            }

            // Create paginated embeds
            const embeds = this.createPaginatedEmbeds(workingSorted, monthName, gameInfo, currentChallenge, 
                endDateFormatted, timeRemaining, activeTiebreaker);

            // Display paginated leaderboard with navigation
            await this.displayPaginatedLeaderboard(interaction, embeds);

        } catch (error) {
            console.error('Error displaying leaderboard:', error);
            return interaction.editReply('An error occurred while fetching the leaderboard. Please try again.');
        }
    },

    // New method to handle assigning ranks with tiebreaker scores
    assignRanks(users, tiebreakerEntries, activeTiebreaker) {
        if (!users || users.length === 0) return;

        // First, add tiebreaker info to users
        if (tiebreakerEntries && tiebreakerEntries.length > 0) {
            for (const user of users) {
                const entry = tiebreakerEntries.find(e => 
                    e.username === user.username.toLowerCase()
                );
                
                if (entry) {
                    user.tiebreakerNote = `\n   (${entry.score} in ${activeTiebreaker.gameTitle})`;
                    user.tiebreakerRank = entry.apiRank;
                    user.hasTiebreaker = true;
                } else {
                    user.hasTiebreaker = false;
                }
            }
        }

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
            let description = `**Game:** ${gameInfo.title}\n` +
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
                
                // Add tiebreakerNote if available
                const tiebreakerNote = user.tiebreakerNote || '';
                
                // Add user entry to leaderboard
                leaderboardText += `${rankEmoji} **${user.username}** ${user.award}${tiebreakerNote}\n` +
                                  `${user.achieved}/${currentChallenge.monthly_challange_game_total} (${user.percentage}%)\n\n`;
            }

            embed.addFields({
                name: `Rankings (${workingSorted.length} participants)`,
                value: leaderboardText || 'No rankings available.'
            });

            embeds.push(embed);
        }

        return embeds;
    },

    async displayPaginatedLeaderboard(interaction, embeds) {
        // If only one page, just send it without buttons
        if (embeds.length === 1) {
            return interaction.editReply({ embeds: [embeds[0]] });
        }

        // Create navigation buttons
        const row = new ActionRowBuilder()
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

        let currentPage = 0;

        // Send the first page with navigation buttons
        const message = await interaction.editReply({
            embeds: [embeds[currentPage]],
            components: [row]
        });

        // Create collector for button interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes timeout
        });

        // Update buttons based on current page
        const updateButtons = (page) => {
            // Disable/enable buttons based on current page
            row.components[0].setDisabled(page === 0); // First
            row.components[1].setDisabled(page === 0); // Previous
            row.components[2].setDisabled(page === embeds.length - 1); // Next
            row.components[3].setDisabled(page === embeds.length - 1); // Last
            
            return row;
        };

        // Handle button clicks
        collector.on('collect', async (i) => {
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
                components: [updateButtons(currentPage)]
            });
        });

        // When the collector expires
        collector.on('end', async () => {
            try {
                // Disable all buttons when time expires
                const disabledRow = new ActionRowBuilder().addComponents(
                    row.components[0].setDisabled(true),
                    row.components[1].setDisabled(true),
                    row.components[2].setDisabled(true),
                    row.components[3].setDisabled(true)
                );

                // Update the message with disabled buttons
                await interaction.editReply({
                    embeds: [embeds[currentPage].setFooter({ 
                        text: 'Session expired • Use /yearlyboard to see annual rankings' 
                    })],
                    components: [disabledRow]
                });
            } catch (error) {
                console.error('Error disabling buttons:', error);
            }
        });

        // Initially update buttons based on first page
        return updateButtons(currentPage);
    }
};

// Helper function to get day suffix (st, nd, rd, th)
function getDaySuffix(day) {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

// Helper function to format time remaining
function formatTimeRemaining(end, now) {
    const diffMs = end - now;
    if (diffMs <= 0) return 'Challenge has ended';
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays === 0) {
        return `${diffHrs} hour${diffHrs !== 1 ? 's' : ''}`;
    } else {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} and ${diffHrs} hour${diffHrs !== 1 ? 's' : ''}`;
    }
}
