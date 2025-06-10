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

const TIEBREAKER_EMOJI = '⚔️';
const TIEBREAKER_BREAKER_EMOJI = '⚡';
const USERS_PER_PAGE = 5;

/**
 * Helper function to ensure field values don't exceed Discord's 1024 character limit
 */
function ensureFieldLength(text, maxLength = 1024) {
    if (text.length <= maxLength) {
        return text;
    }
    
    const truncateAt = maxLength - 60;
    const truncated = text.substring(0, truncateAt);
    
    const lastUserEnd = truncated.lastIndexOf('\n\n');
    if (lastUserEnd > 0) {
        return truncated.substring(0, lastUserEnd) + '\n\n*[Use /leaderboard for full view]*';
    }
    
    return truncated + '\n*[Truncated]*';
}

function isDateInCurrentMonth(dateString) {
    const inputDate = new Date(dateString);
    const currentDate = new Date();
    
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0);
    const lastDayOfPrevMonth = new Date(firstDayOfMonth);
    lastDayOfPrevMonth.setDate(0);
    lastDayOfPrevMonth.setHours(23, 59, 59, 999);
    
    const isLastDayOfPrevMonth = inputDate.getFullYear() === lastDayOfPrevMonth.getFullYear() &&
                                 inputDate.getMonth() === lastDayOfPrevMonth.getMonth() &&
                                 inputDate.getDate() === lastDayOfPrevMonth.getDate();
    
    const isCurrentMonth = inputDate.getFullYear() === currentDate.getFullYear() &&
                           inputDate.getMonth() === currentDate.getMonth();
    
    return isCurrentMonth || isLastDayOfPrevMonth;
}

function getMonthKey(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
}

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
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

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
                    
                    if (gameInfo) {
                        currentChallenge.monthly_game_title = gameTitle;
                        currentChallenge.monthly_game_icon_url = gameImageUrl;
                        currentChallenge.monthly_game_console = gameInfo.consoleName;
                        await currentChallenge.save();
                    }
                } catch (error) {
                    console.error('Error fetching game info:', error);
                }
            } else {
                gameInfo = {
                    title: gameTitle,
                    imageIcon: gameImageUrl
                };
            }

            const users = await User.find({});

            const userProgress = await Promise.all(users.map(async (user) => {
                const progress = await retroAPI.getUserGameProgress(
                    user.raUsername,
                    currentChallenge.monthly_challange_gameid
                );

                if (progress.numAwardedToUser > 0) {
                    const achievementsEarnedThisMonth = Object.entries(progress.achievements)
                        .filter(([id, data]) => data.hasOwnProperty('dateEarned') && isDateInCurrentMonth(data.dateEarned))
                        .map(([id, data]) => id);
                    
                    if (achievementsEarnedThisMonth.length === 0) {
                        return null;
                    }

                    const hasAllAchievements = achievementsEarnedThisMonth.length === currentChallenge.monthly_challange_game_total;

                    let award = '';
                    let points = 0;

                    if (achievementsEarnedThisMonth.length > 0 && hasAllAchievements) {
                        award = AWARD_EMOJIS.MASTERY;
                        points = 7;
                    } 
                    else {
                        const progressionAchievements = currentChallenge.monthly_challange_progression_achievements || [];
                        const earnedProgressionInMonth = progressionAchievements.filter(id => 
                            achievementsEarnedThisMonth.includes(id)
                        );
                        
                        const winAchievements = currentChallenge.monthly_challange_win_achievements || [];
                        const earnedWinInMonth = winAchievements.filter(id => 
                            achievementsEarnedThisMonth.includes(id)
                        );
                        
                        const totalValidProgressionAchievements = progressionAchievements.filter(id => 
                            achievementsEarnedThisMonth.includes(id)
                        );
                        
                        const totalValidWinAchievements = winAchievements.filter(id => 
                            achievementsEarnedThisMonth.includes(id)
                        );

                        if (totalValidProgressionAchievements.length === progressionAchievements.length && 
                            (winAchievements.length === 0 || totalValidWinAchievements.length > 0) &&
                            (earnedProgressionInMonth.length > 0 || earnedWinInMonth.length > 0)) {
                            award = AWARD_EMOJIS.BEATEN;
                            points = 4;
                        }
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

            const sortedProgress = userProgress
                .filter(progress => progress !== null)
                .sort((a, b) => {
                    if (b.achieved !== a.achieved) {
                        return b.achieved - a.achieved;
                    }
                    
                    if (a.percentage == 100.00 && b.percentage == 100.00) {
                        return 0;
                    }
                    
                    return b.points - a.points;
                });

            const monthKey = getMonthKey(now);
            const activeTiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });

            const workingSorted = [...sortedProgress];

            let tiebreakerEntries = [];
            let tiebreakerBreakerEntries = [];
            if (activeTiebreaker) {
                try {
                    const batch1 = await retroAPI.getLeaderboardEntriesDirect(activeTiebreaker.leaderboardId, 0, 500);
                    const batch2 = await retroAPI.getLeaderboardEntriesDirect(activeTiebreaker.leaderboardId, 500, 500);
                    
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

                    if (activeTiebreaker.hasTiebreakerBreaker()) {
                        try {
                            const tiebreakerBreakerInfo = activeTiebreaker.getTiebreakerBreakerInfo();
                            
                            const tbBatch1 = await retroAPI.getLeaderboardEntriesDirect(tiebreakerBreakerInfo.leaderboardId, 0, 500);
                            const tbBatch2 = await retroAPI.getLeaderboardEntriesDirect(tiebreakerBreakerInfo.leaderboardId, 500, 500);
                            
                            let tbRawEntries = [];
                            
                            if (tbBatch1) {
                                if (Array.isArray(tbBatch1)) {
                                    tbRawEntries = [...tbRawEntries, ...tbBatch1];
                                } else if (tbBatch1.Results && Array.isArray(tbBatch1.Results)) {
                                    tbRawEntries = [...tbRawEntries, ...tbBatch1.Results];
                                }
                            }
                            
                            if (tbBatch2) {
                                if (Array.isArray(tbBatch2)) {
                                    tbRawEntries = [...tbRawEntries, ...tbBatch2];
                                } else if (tbBatch2.Results && Array.isArray(tbBatch2.Results)) {
                                    tbRawEntries = [...tbRawEntries, ...tbBatch2.Results];
                                }
                            }
                            
                            tiebreakerBreakerEntries = tbRawEntries.map(entry => {
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
                        } catch (tbError) {
                            console.error('Error fetching tiebreaker-breaker leaderboard:', tbError);
                        }
                    }
                } catch (error) {
                    console.error('Error fetching tiebreaker leaderboard:', error);
                }
            }

            this.assignRanks(workingSorted, tiebreakerEntries, tiebreakerBreakerEntries, activeTiebreaker);

            // FIXED: Save the processed results with correct status codes
            const monthKeyForDB = User.formatDateKey(currentChallenge.date);
            try {
                await Promise.all(sortedProgress.map(async (progress) => {
                    try {
                        const { user, achieved, percentage, points } = progress;
                        
                        // FIXED: Convert points to status codes for database storage
                        let statusCode = 0;
                        if (points === 7) statusCode = 3; // mastery
                        else if (points === 4) statusCode = 2; // beaten  
                        else if (points === 1) statusCode = 1; // participation
                        
                        user.monthlyChallenges.set(monthKeyForDB, { 
                            progress: statusCode, // Store status code, not point value
                            achievements: achieved,
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
                    const response = await fetch('https://select-start-api-production.up.railway.app/api/admin/force-update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': '0000'
                        },
                        body: JSON.stringify({ target: 'leaderboards' })
                    });
                } catch (apiError) {
                    console.error('Error notifying API:', apiError);
                }
            } catch (saveError) {
                console.error('Error saving processed data:', saveError);
            }

            const monthName = now.toLocaleString('default', { month: 'long' });
            
            const challengeEndDate = new Date(nextMonthStart);
            challengeEndDate.setDate(challengeEndDate.getDate() - 1);
            challengeEndDate.setHours(23, 59, 59);
            
            const endDateTimestamp = Math.floor(challengeEndDate.getTime() / 1000);
            const endDateFormatted = `<t:${endDateTimestamp}:F>`;
            const timeRemaining = `<t:${endDateTimestamp}:R>`;

            if (workingSorted.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle(`${monthName} Challenge Leaderboard`)
                    .setColor('#FFD700')
                    .setThumbnail(`https://retroachievements.org${gameImageUrl}`);

                let description = `**Game:** [${gameTitle}](https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid})\n` +
                                `**Total Achievements:** ${currentChallenge.monthly_challange_game_total}\n` +
                                `**Challenge Ends:** ${endDateFormatted}\n` +
                                `**Time Remaining:** ${timeRemaining}\n\n` +
                                `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`;

                if (activeTiebreaker) {
                    description += `\n\n${TIEBREAKER_EMOJI} **Active Tiebreaker:** ${activeTiebreaker.gameTitle}\n` +
                                `*Tiebreaker results are used to determine final ranking for tied users in top positions.*`;
                    
                    if (activeTiebreaker.hasTiebreakerBreaker()) {
                        const tiebreakerBreakerInfo = activeTiebreaker.getTiebreakerBreakerInfo();
                        description += `\n${TIEBREAKER_BREAKER_EMOJI} **Tiebreaker-Breaker:** ${tiebreakerBreakerInfo.gameTitle}\n` +
                                      `*Used to resolve ties within the tiebreaker itself.*`;
                    }
                }
                
                description += `\n\n*Note: Only achievements earned during ${monthName} **in Hardcore Mode** count toward challenge status.*`;
                description += `\n⚠️ *Save states and rewind features are not allowed. Fast forward is permitted.*`;
                
                embed.setDescription(description);

                embed.addFields({
                    name: 'No Participants',
                    value: 'No one has earned achievements in this challenge this month yet!'
                });
                
                const historyButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('view_history')
                            .setLabel('View Historical Leaderboards')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📚')
                    );

                const message = await interaction.editReply({ 
                    embeds: [embed],
                    components: [historyButton]
                });
                
                const collector = message.createMessageComponentCollector({
                    time: 300000
                });
                
                collector.on('collect', async (i) => {
                    if (i.customId === 'view_history') {
                        await i.deferUpdate();
                        await this.showHistoricalSelector(interaction);
                        collector.stop();
                    }
                });
                
                collector.on('end', async (collected, reason) => {
                    if (reason === 'time') {
                        try {
                            const disabledButton = new ActionRowBuilder().addComponents(
                                ButtonBuilder.from(historyButton.components[0]).setDisabled(true)
                            );
                            
                            await interaction.editReply({
                                embeds: [embed],
                                components: [disabledButton]
                            });
                        } catch (error) {
                            console.error('Error disabling button:', error);
                        }
                    }
                });
                
                return;
            }

            const embeds = this.createPaginatedEmbeds(workingSorted, monthName, gameInfo, currentChallenge, 
                endDateFormatted, timeRemaining, activeTiebreaker);

            await this.displayPaginatedLeaderboard(interaction, embeds, true);

        } catch (error) {
            console.error('Error displaying leaderboard:', error);
            return interaction.editReply('An error occurred while fetching the leaderboard. Please try again.');
        }
    },

    async showHistoricalSelector(interaction) {
        try {
            const historicalLeaderboards = await HistoricalLeaderboard.find()
                .sort({ date: -1 });
            
            if (historicalLeaderboards.length === 0) {
                return interaction.editReply('No historical leaderboards are available yet.');
            }
            
            const embed = new EmbedBuilder()
                .setTitle('📚 Historical Leaderboards')
                .setColor('#FFD700')
                .setDescription('Select a month to view its challenge leaderboard:')
                .setFooter({ text: 'Historical leaderboards are preserved at the end of each month' });
                
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('historical_select')
                .setPlaceholder('Select a month...');
                
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
            
            const currentButton = new ButtonBuilder()
                .setCustomId('current_leaderboard')
                .setLabel('Current Leaderboard')
                .setStyle(ButtonStyle.Primary);
                
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            const buttonRow = new ActionRowBuilder().addComponents(currentButton);
            
            const message = await interaction.editReply({
                embeds: [embed],
                components: [selectRow, buttonRow]
            });
            
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000
            });
            
            collector.on('collect', async (i) => {
                if (i.customId === 'current_leaderboard') {
                    await i.deferUpdate();
                    await this.displayCurrentLeaderboard(interaction);
                    collector.stop();
                } 
                else if (i.customId === 'historical_select') {
                    await i.deferUpdate();
                    const selectedMonthKey = i.values[0];
                    await this.displayHistoricalLeaderboard(interaction, selectedMonthKey);
                    collector.stop();
                }
            });
            
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
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
            const leaderboard = await HistoricalLeaderboard.findOne({ monthKey });
            
            if (!leaderboard) {
                return interaction.editReply(`No historical leaderboard found for ${monthKey}.`);
            }
            
            const gameInfo = {
                title: leaderboard.gameTitle,
                imageIcon: leaderboard.gameImageUrl
            };
            
            const embeds = this.createHistoricalEmbeds(leaderboard);
            await this.displayPaginatedLeaderboard(interaction, embeds, false);
            
        } catch (error) {
            console.error('Error displaying historical leaderboard:', error);
            return interaction.editReply('An error occurred while retrieving the historical leaderboard.');
        }
    },

    createHistoricalEmbeds(leaderboard) {
        const embeds = [];
        const totalPages = Math.ceil(leaderboard.participants.length / USERS_PER_PAGE);
        
        const date = new Date(leaderboard.date);
        const monthName = date.toLocaleString('default', { month: 'long' });
        const year = date.getFullYear();
        
        for (let page = 0; page < totalPages; page++) {
            const startIndex = page * USERS_PER_PAGE;
            const endIndex = Math.min((page + 1) * USERS_PER_PAGE, leaderboard.participants.length);
            const participantsOnPage = leaderboard.participants.slice(startIndex, endIndex);
            
            const embed = new EmbedBuilder()
                .setTitle(`${monthName} ${year} Challenge Leaderboard (Historical)`)
                .setColor('#FFD700')
                .setFooter({ text: `Page ${page + 1}/${totalPages} • Historical record` })
                .setTimestamp(new Date(leaderboard.createdAt));
                
            if (leaderboard.gameImageUrl) {
                embed.setThumbnail(`https://retroachievements.org${leaderboard.gameImageUrl}`);
            }
            
            let description = `**Game:** [${leaderboard.gameTitle}](https://retroachievements.org/game/${leaderboard.gameId})\n` +
                            `**Total Achievements:** ${leaderboard.totalAchievements}\n` +
                            `**Challenge Period:** ${monthName} ${year}\n\n` +
                            `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`;
            
            if (leaderboard.tiebreakerInfo && leaderboard.tiebreakerInfo.isActive) {
                description += `\n\n${TIEBREAKER_EMOJI} **Tiebreaker Game:** ${leaderboard.tiebreakerInfo.gameTitle}\n` +
                            `*Tiebreaker results were used to determine final ranking for tied users in top positions.*`;
                
                if (leaderboard.tiebreakerInfo.hasTiebreakerBreaker) {
                    description += `\n${TIEBREAKER_BREAKER_EMOJI} **Tiebreaker-Breaker Game:** ${leaderboard.tiebreakerInfo.tiebreakerBreakerGameTitle}\n` +
                                  `*Used to resolve ties within the tiebreaker itself.*`;
                }
            }
                            
            description += `\n\n*This is a historical record of the ${monthName} ${year} challenge.*`;
            description += `\n*⚠️ All achievements were earned in Hardcore Mode with no save states or rewind.*`;
            
            embed.setDescription(description);
            
            let leaderboardText = '';
            
            for (const participant of participantsOnPage) {
                const rankEmoji = participant.displayRank <= 3 ? RANK_EMOJIS[participant.displayRank] : `#${participant.displayRank}`;
                
                leaderboardText += `${rankEmoji} **[${participant.username}](https://retroachievements.org/user/${participant.username})** ${participant.award}\n`;
                leaderboardText += `${participant.achievements}/${leaderboard.totalAchievements} (${participant.percentage}%)\n`;
                
                if (participant.displayRank <= 5) {
                    if (participant.hasTiebreaker && participant.tiebreakerScore) {
                        leaderboardText += `${TIEBREAKER_EMOJI} ${participant.tiebreakerScore}\n`;
                    }
                    
                    if (participant.hasTiebreakerBreaker && participant.tiebreakerBreakerScore) {
                        leaderboardText += `${TIEBREAKER_BREAKER_EMOJI} ${participant.tiebreakerBreakerScore}\n`;
                    }
                }
                
                leaderboardText += '\n';
            }
            
            embed.addFields({
                name: `Final Rankings (${leaderboard.participants.length} participants)`,
                value: ensureFieldLength(leaderboardText) || 'No participants found.'
            });
            
            if (page === 0 && leaderboard.winners && leaderboard.winners.length > 0) {
                let winnersText = '';
                leaderboard.winners.forEach(winner => {
                    const medalEmoji = winner.rank === 1 ? '🥇' : (winner.rank === 2 ? '🥈' : '🥉');
                    winnersText += `${medalEmoji} **${winner.username}**: ${winner.achievements}/${leaderboard.totalAchievements} (${winner.percentage}%) ${winner.award}\n`;
                    
                    if (winner.tiebreakerScore) {
                        winnersText += `   ${TIEBREAKER_EMOJI} Tiebreaker: ${winner.tiebreakerScore}\n`;
                    }
                    
                    if (winner.tiebreakerBreakerScore) {
                        winnersText += `   ${TIEBREAKER_BREAKER_EMOJI} Tiebreaker-Breaker: ${winner.tiebreakerBreakerScore}\n`;
                    }
                });
                
                embed.addFields({
                    name: '🏆 Winners',
                    value: winnersText
                });
            }
            
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
        if (embeds.length === 1) {
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
            
            const message = await interaction.editReply({ 
                embeds: [embeds[0]], 
                components: [historyButton]
            });
            
            const collector = message.createMessageComponentCollector({
                time: 300000
            });
            
            collector.on('collect', async (i) => {
                if (i.customId === 'view_history') {
                    await i.deferUpdate();
                    await this.showHistoricalSelector(interaction);
                    collector.stop();
                } else if (i.customId === 'current_leaderboard') {
                    await i.deferUpdate();
                    await this.displayCurrentLeaderboard(interaction);
                    collector.stop();
                }
            });
            
            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    try {
                        const disabledButton = new ActionRowBuilder().addComponents(
                            ButtonBuilder.from(historyButton.components[0]).setDisabled(true)
                        );
                        
                        await interaction.editReply({
                            embeds: [embeds[0]],
                            components: [disabledButton]
                        });
                    } catch (error) {
                        console.error('Error disabling button:', error);
                    }
                }
            });
            
            return;
        }

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

        const message = await interaction.editReply({
            embeds: [embeds[currentPage]],
            components: [navRow, actionRow]
        });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000
        });

        const updateButtons = (page) => {
            navRow.components[0].setDisabled(page === 0);
            navRow.components[1].setDisabled(page === 0);
            navRow.components[2].setDisabled(page === embeds.length - 1);
            navRow.components[3].setDisabled(page === embeds.length - 1);
            
            return navRow;
        };

        collector.on('collect', async (i) => {
            try {
                if (['first', 'previous', 'next', 'last'].includes(i.customId)) {
                    await i.deferUpdate();

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

                    await i.editReply({
                        embeds: [embeds[currentPage]],
                        components: [updateButtons(currentPage), actionRow]
                    });
                }
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
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                try {
                    const disabledNavRow = new ActionRowBuilder().addComponents(
                        navRow.components[0].setDisabled(true),
                        navRow.components[1].setDisabled(true),
                        navRow.components[2].setDisabled(true),
                        navRow.components[3].setDisabled(true)
                    );
                    
                    const disabledActionRow = new ActionRowBuilder().addComponents(
                        actionButton.setDisabled(true)
                    );

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

        return updateButtons(currentPage);
    },

    createPaginatedEmbeds(workingSorted, monthName, gameInfo, currentChallenge, endDateFormatted, timeRemaining, activeTiebreaker) {
        const embeds = [];
        const totalPages = Math.ceil(workingSorted.length / USERS_PER_PAGE);

        for (let page = 0; page < totalPages; page++) {
            const startIndex = page * USERS_PER_PAGE;
            const endIndex = Math.min((page + 1) * USERS_PER_PAGE, workingSorted.length);
            const usersOnPage = workingSorted.slice(startIndex, endIndex);

            const embed = new EmbedBuilder()
                .setTitle(`${monthName} Challenge Leaderboard`)
                .setColor('#FFD700')
                .setThumbnail(`https://retroachievements.org${gameInfo.imageIcon}`)
                .setFooter({ text: `Page ${page + 1}/${totalPages} • Use /help points for more information` })
                .setTimestamp();

            let description = `**Game:** [${gameInfo.title}](https://retroachievements.org/game/${currentChallenge.monthly_challange_gameid})\n` +
                            `**Total Achievements:** ${currentChallenge.monthly_challange_game_total}\n` +
                            `**Challenge Ends:** ${endDateFormatted}\n` +
                            `**Time Remaining:** ${timeRemaining}\n\n` +
                            `${AWARD_EMOJIS.MASTERY} Mastery (7pts) | ${AWARD_EMOJIS.BEATEN} Beaten (4pts) | ${AWARD_EMOJIS.PARTICIPATION} Part. (1pt)`;

            if (activeTiebreaker) {
                description += `\n\n${TIEBREAKER_EMOJI} **Active Tiebreaker:** ${activeTiebreaker.gameTitle}\n` +
                            `*Tiebreaker results are used to determine final ranking for tied users in top positions.*`;
                
                if (activeTiebreaker.hasTiebreakerBreaker()) {
                    const tiebreakerBreakerInfo = activeTiebreaker.getTiebreakerBreakerInfo();
                    description += `\n${TIEBREAKER_BREAKER_EMOJI} **Tiebreaker-Breaker:** ${tiebreakerBreakerInfo.gameTitle}\n` +
                                  `*Used to resolve ties within the tiebreaker itself.*`;
                }
            }
            
            description += `\n\n*Note: Only achievements earned during ${monthName} **in Hardcore Mode** count toward challenge status.*`;
            description += `\n⚠️ *Save states and rewind features are not allowed. Fast forward is permitted.*`;
            
            embed.setDescription(description);

            let leaderboardText = '';
            
            for (const user of usersOnPage) {
                const rankEmoji = user.displayRank <= 3 ? RANK_EMOJIS[user.displayRank] : `#${user.displayRank}`;
                
                leaderboardText += `${rankEmoji} **[${user.username}](https://retroachievements.org/user/${user.username})** ${user.award}\n`;
                leaderboardText += `${user.achieved}/${currentChallenge.monthly_challange_game_total} (${user.percentage}%)\n`;
                
                if (user.displayRank <= 5) {
                    if (user.hasTiebreaker && user.tiebreakerScore) {
                        leaderboardText += `${TIEBREAKER_EMOJI} ${user.tiebreakerScore} in ${user.tiebreakerGame}\n`;
                    }
                    
                    if (user.hasTiebreakerBreaker && user.tiebreakerBreakerScore) {
                        leaderboardText += `${TIEBREAKER_BREAKER_EMOJI} ${user.tiebreakerBreakerScore} in ${user.tiebreakerBreakerGame}\n`;
                    }
                }
                
                leaderboardText += '\n';
            }

            embed.addFields({
                name: `Rankings (${workingSorted.length} participants)`,
                value: ensureFieldLength(leaderboardText) || 'No rankings available.'
            });

            embeds.push(embed);
        }

        return embeds;
    },

    assignRanks(users, tiebreakerEntries, tiebreakerBreakerEntries, activeTiebreaker) {
        if (!users || users.length === 0) return;

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

        if (tiebreakerBreakerEntries && tiebreakerBreakerEntries.length > 0) {
            const tiebreakerBreakerInfo = activeTiebreaker.getTiebreakerBreakerInfo();
            for (const user of users) {
                const entry = tiebreakerBreakerEntries.find(e => 
                    e.username === user.username.toLowerCase()
                );
                
                if (entry) {
                    user.tiebreakerBreakerScore = entry.score;
                    user.tiebreakerBreakerRank = entry.apiRank;
                    user.tiebreakerBreakerGame = tiebreakerBreakerInfo.gameTitle;
                    user.hasTiebreakerBreaker = true;
                } else {
                    user.hasTiebreakerBreaker = false;
                }
            }
        }

        users.forEach((user, index) => {
            user.originalIndex = index;
        });

        let currentRank = 1;
        let lastAchieved = -1;
        let lastPoints = -1;
        let currentTieGroup = [];
        let tieGroupStartIdx = 0;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            if (i > 0 && user.achieved === lastAchieved && user.points === lastPoints) {
                currentTieGroup.push(i);
            } else {
                if (currentTieGroup.length > 1) {
                    this.processTieGroup(users, currentTieGroup, tieGroupStartIdx);
                } else if (currentTieGroup.length === 1) {
                    users[currentTieGroup[0]].displayRank = tieGroupStartIdx + 1;
                }
                
                currentTieGroup = [i];
                tieGroupStartIdx = i;
            }
            
            lastAchieved = user.achieved;
            lastPoints = user.points;
        }
        
        if (currentTieGroup.length > 1) {
            this.processTieGroup(users, currentTieGroup, tieGroupStartIdx);
        } else if (currentTieGroup.length === 1) {
            users[currentTieGroup[0]].displayRank = tieGroupStartIdx + 1;
        }

        for (let i = 0; i < users.length; i++) {
            if (users[i].displayRank === undefined) {
                users[i].displayRank = i + 1;
            }
        }

        users.sort((a, b) => {
            if (a.displayRank !== b.displayRank) {
                return a.displayRank - b.displayRank;
            }
            
            return a.originalIndex - b.originalIndex;
        });
    },

    processTieGroup(users, tieGroupIndices, startIdx) {
        const isTopFive = startIdx < 5;
        
        if (isTopFive) {
            const withTiebreaker = tieGroupIndices.filter(idx => users[idx].hasTiebreaker);
            const withoutTiebreaker = tieGroupIndices.filter(idx => !users[idx].hasTiebreaker);
            
            if (withTiebreaker.length > 0) {
                withTiebreaker.sort((a, b) => users[a].tiebreakerRank - users[b].tiebreakerRank);
                
                let currentTbRank = users[withTiebreaker[0]].tiebreakerRank;
                let currentTbGroup = [];
                let nextAvailableRank = startIdx + 1;
                
                for (let i = 0; i < withTiebreaker.length; i++) {
                    const userIdx = withTiebreaker[i];
                    const user = users[userIdx];
                    
                    if (i > 0 && user.tiebreakerRank !== currentTbRank) {
                        if (currentTbGroup.length > 1) {
                            this.processTiebreakerBreakerGroup(users, currentTbGroup, nextAvailableRank);
                            nextAvailableRank += currentTbGroup.length;
                        } else {
                            users[currentTbGroup[0]].displayRank = nextAvailableRank;
                            nextAvailableRank++;
                        }
                        
                        currentTbGroup = [userIdx];
                        currentTbRank = user.tiebreakerRank;
                    } else {
                        currentTbGroup.push(userIdx);
                    }
                }
                
                if (currentTbGroup.length > 1) {
                    this.processTiebreakerBreakerGroup(users, currentTbGroup, nextAvailableRank);
                    nextAvailableRank += currentTbGroup.length;
                } else if (currentTbGroup.length === 1) {
                    users[currentTbGroup[0]].displayRank = nextAvailableRank;
                    nextAvailableRank++;
                }
                
                for (const idx of withoutTiebreaker) {
                    users[idx].displayRank = nextAvailableRank;
                }
            } else {
                for (const idx of tieGroupIndices) {
                    users[idx].displayRank = startIdx + 1;
                }
            }
        } else {
            for (const idx of tieGroupIndices) {
                users[idx].displayRank = startIdx + 1;
            }
        }
    },

    processTiebreakerBreakerGroup(users, tieGroupIndices, startRank) {
        const withTiebreakerBreaker = tieGroupIndices.filter(idx => users[idx].hasTiebreakerBreaker);
        const withoutTiebreakerBreaker = tieGroupIndices.filter(idx => !users[idx].hasTiebreakerBreaker);
        
        if (withTiebreakerBreaker.length > 0) {
            withTiebreakerBreaker.sort((a, b) => users[a].tiebreakerBreakerRank - users[b].tiebreakerBreakerRank);
            
            for (let i = 0; i < withTiebreakerBreaker.length; i++) {
                users[withTiebreakerBreaker[i]].displayRank = startRank + i;
            }
            
            const nextRank = startRank + withTiebreakerBreaker.length;
            for (const idx of withoutTiebreakerBreaker) {
                users[idx].displayRank = nextRank;
            }
        } else {
            for (const idx of tieGroupIndices) {
                users[idx].displayRank = startRank;
            }
        }
    },

    async finalizePreviousMonth(interaction) {
        try {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            let prevMonth = currentMonth - 1;
            let prevYear = currentYear;
            if (prevMonth < 0) {
                prevMonth = 11;
                prevYear = currentYear - 1;
            }
            
            const prevMonthStart = new Date(prevYear, prevMonth, 1);
            const prevMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59);
            
            const monthKey = getMonthKey(prevMonthStart);
            
            const existingLeaderboard = await HistoricalLeaderboard.findOne({ 
                monthKey,
                isFinalized: true 
            });
            
            if (existingLeaderboard) {
                if (!existingLeaderboard.resultsAnnounced) {
                    if (!interaction.guild) {
                        await this.announceResults(null, existingLeaderboard);
                        return;
                    }
                    
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
            
            let gameTitle = challenge.monthly_game_title;
            let gameImageUrl = challenge.monthly_game_icon_url;
            let consoleName = challenge.monthly_game_console;
            
            if (!gameTitle || !gameImageUrl) {
                try {
                    const gameInfo = await retroAPI.getGameInfo(challenge.monthly_challange_gameid);
                    gameTitle = gameInfo.title;
                    gameImageUrl = gameInfo.imageIcon;
                    consoleName = gameInfo.consoleName;
                    
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
            
            const users = await User.find({});
            const monthKeyForUser = User.formatDateKey(challenge.date);
            
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
            
            const leaderboardParticipants = participants.map(user => {
                const challengeData = user.monthlyChallenges.get(monthKeyForUser);
                const points = challengeData.progress || 0;
                
                let award = '';
                if (points === 3) award = AWARD_EMOJIS.MASTERY; // status code 3 = mastery
                else if (points === 2) award = AWARD_EMOJIS.BEATEN; // status code 2 = beaten
                else if (points === 1) award = AWARD_EMOJIS.PARTICIPATION; // status code 1 = participation
                
                return {
                    username: user.raUsername,
                    achievements: challengeData.achievements,
                    percentage: challengeData.percentage,
                    points: points,
                    award: award
                };
            });
            
            leaderboardParticipants.sort((a, b) => {
                if (b.achievements !== a.achievements) {
                    return b.achievements - a.achievements;
                }
                return b.points - a.points;
            });
            
            const tiebreaker = await ArcadeBoard.findOne({
                boardType: 'tiebreaker',
                monthKey: monthKey
            });
            
            let tiebreakerEntries = [];
            let tiebreakerBreakerEntries = [];
            let tiebreakerInfo = null;
            
            if (tiebreaker) {
                try {
                    const batch1 = await retroAPI.getLeaderboardEntriesDirect(tiebreaker.leaderboardId, 0, 500);
                    const batch2 = await retroAPI.getLeaderboardEntriesDirect(tiebreaker.leaderboardId, 500, 500);
                    
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

                    if (tiebreaker.hasTiebreakerBreaker()) {
                        try {
                            const tiebreakerBreakerInfo = tiebreaker.getTiebreakerBreakerInfo();
                            
                            const tbBatch1 = await retroAPI.getLeaderboardEntriesDirect(tiebreakerBreakerInfo.leaderboardId, 0, 500);
                            const tbBatch2 = await retroAPI.getLeaderboardEntriesDirect(tiebreakerBreakerInfo.leaderboardId, 500, 500);
                            
                            let tbRawEntries = [];
                            
                            if (tbBatch1) {
                                if (Array.isArray(tbBatch1)) {
                                    tbRawEntries = [...tbRawEntries, ...tbBatch1];
                                } else if (tbBatch1.Results && Array.isArray(tbBatch1.Results)) {
                                    tbRawEntries = [...tbRawEntries, ...tbBatch1.Results];
                                }
                            }
                            
                            if (tbBatch2) {
                                if (Array.isArray(tbBatch2)) {
                                    tbRawEntries = [...tbRawEntries, ...tbBatch2];
                                } else if (tbBatch2.Results && Array.isArray(tbBatch2.Results)) {
                                    tbRawEntries = [...tbRawEntries, ...tbBatch2.Results];
                                }
                            }
                            
                            tiebreakerBreakerEntries = tbRawEntries.map(entry => {
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
                        } catch (tbError) {
                            console.error('Error fetching historical tiebreaker-breaker entries:', tbError);
                        }
                    }
                    
                    tiebreakerInfo = {
                        gameId: tiebreaker.gameId,
                        gameTitle: tiebreaker.gameTitle,
                        leaderboardId: tiebreaker.leaderboardId,
                        isActive: true
                    };

                    if (tiebreaker.hasTiebreakerBreaker()) {
                        const tiebreakerBreakerInfo = tiebreaker.getTiebreakerBreakerInfo();
                        tiebreakerInfo.tiebreakerBreakerGameId = tiebreakerBreakerInfo.gameId;
                        tiebreakerInfo.tiebreakerBreakerGameTitle = tiebreakerBreakerInfo.gameTitle;
                        tiebreakerInfo.tiebreakerBreakerLeaderboardId = tiebreakerBreakerInfo.leaderboardId;
                        tiebreakerInfo.hasTiebreakerBreaker = true;
                    } else {
                        tiebreakerInfo.hasTiebreakerBreaker = false;
                    }
                } catch (error) {
                    console.error('Error fetching tiebreaker entries:', error);
                }
            }
            
            leaderboardParticipants.forEach((participant, index) => {
                participant.originalIndex = index;
            });
            
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

            if (tiebreakerBreakerEntries && tiebreakerBreakerEntries.length > 0) {
                for (const participant of leaderboardParticipants) {
                    const entry = tiebreakerBreakerEntries.find(e => 
                        e.username === participant.username.toLowerCase()
                    );
                    
                    if (entry) {
                        participant.tiebreakerBreakerScore = entry.score;
                        participant.tiebreakerBreakerRank = entry.apiRank;
                        participant.hasTiebreakerBreaker = true;
                    } else {
                        participant.hasTiebreakerBreaker = false;
                    }
                }
            }
            
            this.assignRanks(leaderboardParticipants, tiebreakerEntries, tiebreakerBreakerEntries, tiebreaker);
            
            const winners = leaderboardParticipants
                .filter(p => p.displayRank <= 3)
                .map(p => ({
                    rank: p.displayRank,
                    username: p.username,
                    achievements: p.achievements,
                    percentage: p.percentage,
                    award: p.award,
                    points: p.points,
                    tiebreakerScore: p.tiebreakerScore || null,
                    tiebreakerBreakerScore: p.tiebreakerBreakerScore || null
                }));
            
            let shadowChallengeInfo = null;
            if (challenge.shadow_challange_gameid && challenge.shadow_challange_revealed) {
                let shadowGameTitle = challenge.shadow_game_title;
                let shadowGameImageUrl = challenge.shadow_game_icon_url;
                
                if (!shadowGameTitle || !shadowGameImageUrl) {
                    try {
                        const shadowGameInfo = await retroAPI.getGameInfo(challenge.shadow_challange_gameid);
                        shadowGameTitle = shadowGameInfo.title;
                        shadowGameImageUrl = shadowGameInfo.imageIcon;
                        
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
            
            await historicalLeaderboard.save();
            
            if (!interaction.guild) {
                await this.announceResults(null, historicalLeaderboard);
                return;
            }
            
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
            
            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000
            });
            
            collector.on('collect', async (i) => {
                await i.deferUpdate();
                
                if (i.customId === 'announce_results') {
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
            const announcementChannelId = config.discord.announcementChannelId;
            
            if (!announcementChannelId) {
                const errorMsg = 'Announcement channel ID is not configured. Please check your config.js file.';
                if (interaction) {
                    return interaction.editReply(errorMsg);
                }
                console.error(errorMsg);
                return;
            }
            
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
            
            const date = new Date(leaderboard.date);
            const monthName = date.toLocaleString('default', { month: 'long' });
            const year = date.getFullYear();
            
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${monthName} ${year} Challenge Results 🏆`)
                .setColor('#FFD700')
                .setDescription(`The results for the **${monthName} ${year}** monthly challenge are in! Congratulations to all participants who tackled **${leaderboard.gameTitle}**!`)
                .setThumbnail(`https://retroachievements.org${leaderboard.gameImageUrl}`);
                
            if (leaderboard.winners && leaderboard.winners.length > 0) {
                let winnersText = '';
                
                leaderboard.winners.forEach(winner => {
                    const medalEmoji = winner.rank === 1 ? '🥇' : (winner.rank === 2 ? '🥈' : '🥉');
                    winnersText += `${medalEmoji} **${winner.username}**: ${winner.achievements}/${leaderboard.totalAchievements} (${winner.percentage}%) ${winner.award}\n`;
                    
                    if (winner.tiebreakerScore) {
                        winnersText += `   ${TIEBREAKER_EMOJI} Tiebreaker: ${winner.tiebreakerScore}\n`;
                    }
                    
                    if (winner.tiebreakerBreakerScore) {
                        winnersText += `   ${TIEBREAKER_BREAKER_EMOJI} Tiebreaker-Breaker: ${winner.tiebreakerBreakerScore}\n`;
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
            
            embed.addFields({
                name: 'Participation',
                value: `A total of **${leaderboard.participants.length}** members participated in this challenge.`
            });
            
            if (leaderboard.shadowChallengeInfo && leaderboard.shadowChallengeInfo.wasRevealed) {
                embed.addFields({
                    name: 'Shadow Challenge',
                    value: `This month also featured a shadow challenge: **${leaderboard.shadowChallengeInfo.gameTitle}**`
                });
            }
            
            embed.addFields({
                name: 'View Complete Leaderboard',
                value: 'Use `/leaderboard` and click the "View Historical Leaderboards" button to see all participants.'
            });
            
            embed.setFooter({ text: 'Monthly Challenge • RetroAchievements' });
            embed.setTimestamp();
            
            await announcementChannel.send({ embeds: [embed] });
            
            leaderboard.resultsAnnounced = true;
            await leaderboard.save();
            
            try {
                const response = await fetch('https://select-start-api-production.up.railway.app/api/admin/force-update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': '0000'
                    },
                    body: JSON.stringify({ target: 'leaderboards' })
                });
            } catch (apiError) {
                console.error('Error notifying API:', apiError);
            }
            
            if (interaction) {
                return interaction.editReply(`Successfully announced the results for ${monthName} ${year} in ${announcementChannel}.`);
            }
            
        } catch (error) {
            console.error('Error announcing results:', error);
            if (interaction) {
                return interaction.editReply('An error occurred while announcing the results.');
            }
        }
    }
};
