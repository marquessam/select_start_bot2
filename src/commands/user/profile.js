// src/commands/user/profile.js - Updated with Trophy Emoji Support
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import { getTrophyEmoji, formatTrophyEmoji } from '../../config/trophyEmojis.js';

const COLORS = {
    PRIMARY: '#0099ff',
    SUCCESS: '#00ff00',
    WARNING: '#ffff00',
    ERROR: '#ff0000',
    GOLD: '#ffd700',
    SILVER: '#c0c0c0',
    BRONZE: '#cd7f32'
};

export const data = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View a user\'s RetroAchievements profile and stats')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('Discord user to view profile for')
            .setRequired(false)
    );

export async function execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    await interaction.deferReply({ ephemeral: true });

    try {
        // Find user in database
        const user = await User.findByDiscordId(targetUser.id);
        
        if (!user) {
            return interaction.editReply({
                content: `❌ ${targetUser.username} is not registered. Use \`/register\` to get started!`,
                ephemeral: true
            });
        }

        // Calculate current year stats
        const currentYear = new Date().getFullYear();
        const yearStats = await calculateYearStats(user, currentYear);

        // Create main profile embed
        const profileEmbed = new EmbedBuilder()
            .setTitle(`🎮 ${user.raUsername}'s Profile`)
            .setColor(COLORS.PRIMARY)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        // Add basic stats
        profileEmbed.addFields(
            {
                name: '🏆 Trophy Summary',
                value: formatTrophySummary(user),
                inline: true
            },
            {
                name: '📊 Challenge Stats',
                value: formatChallengeStats(yearStats),
                inline: true
            },
            {
                name: '🎯 Current Progress',
                value: formatCurrentProgress(user),
                inline: true
            }
        );

        // Add mastery information if available
        const masteredCount = user.getMasteredGameCount();
        if (masteredCount > 0) {
            profileEmbed.addFields({
                name: '🌟 Mastered Games',
                value: `**${masteredCount}** games mastered`,
                inline: true
            });
        }

        // Add community awards summary
        const communityAwards = user.getCommunityAwardsForYear(currentYear);
        if (communityAwards.length > 0) {
            const totalPoints = communityAwards.reduce((sum, award) => sum + award.points, 0);
            profileEmbed.addFields({
                name: '🏅 Community Recognition',
                value: `**${communityAwards.length}** awards | **${totalPoints}** points`,
                inline: true
            });
        }

        // Create action buttons
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`trophy_case_${user._id}`)
                    .setLabel('🏆 Trophy Case')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`detailed_stats_${user._id}`)
                    .setLabel('📈 Detailed Stats')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`mastered_games_${user._id}`)
                    .setLabel('🌟 Mastered Games')
                    .setStyle(ButtonStyle.Secondary)
            );

        // Add GP balance if user has Arena stats
        if (user.gpBalance !== undefined && user.gpBalance > 0) {
            profileEmbed.addFields({
                name: '🎲 Arena Stats',
                value: `**${user.gpBalance}** GP | Win Rate: **${user.getGpWinRate()}%**`,
                inline: true
            });
        }

        profileEmbed.setFooter({ 
            text: `Data from RetroAchievements • Last updated: ${new Date().toLocaleDateString()}` 
        });

        await interaction.editReply({
            embeds: [profileEmbed],
            components: [actionRow],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in profile command:', error);
        await interaction.editReply({
            content: '❌ An error occurred while fetching the profile. Please try again.',
            ephemeral: true
        });
    }
}

// Button interaction handler
export async function handleButtonInteraction(interaction) {
    if (!interaction.customId.includes('_')) return;

    const [action, userId] = interaction.customId.split('_').slice(0, 2);
    
    await interaction.deferUpdate();

    try {
        const user = await User.findById(userId);
        
        if (!user) {
            return interaction.editReply({
                content: '❌ User not found.',
                ephemeral: true
            });
        }

        switch (action) {
            case 'trophy':
                if (interaction.customId.startsWith('trophy_case_')) {
                    await handleTrophyCaseButton(interaction, user);
                }
                break;
            case 'detailed':
                if (interaction.customId.startsWith('detailed_stats_')) {
                    await handleDetailedStatsButton(interaction, user);
                }
                break;
            case 'mastered':
                if (interaction.customId.startsWith('mastered_games_')) {
                    await handleMasteredGamesButton(interaction, user);
                }
                break;
        }
    } catch (error) {
        console.error('Error handling button interaction:', error);
        await interaction.followUp({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
        });
    }
}

/**
 * UPDATED: Trophy case with custom emoji support
 */
async function handleTrophyCaseButton(interaction, user) {
    // STEP 1: Get Challenge documents for title lookups
    const challenges = await Challenge.find({}).sort({ date: 1 });
    const challengeTitleMap = {};
    
    // Build a lookup map for game titles
    for (const challenge of challenges) {
        const monthKey = getMonthKey(challenge.date);
        challengeTitleMap[monthKey] = {
            monthly: challenge.monthly_game_title,
            shadow: challenge.shadow_game_title
        };
    }

    // STEP 2: Generate trophies with Challenge document fallback AND custom emojis
    const trophies = [];

    // Process monthly challenges
    for (const [userDateKey, data] of user.monthlyChallenges.entries()) {
        if (data.progress > 0) {
            let awardLevel = 'participation';
            if (data.progress === 3) awardLevel = 'mastery';
            else if (data.progress === 2) awardLevel = 'beaten';

            // Convert user date key (YYYY-MM-DD) to month key (YYYY-MM)
            const monthKey = convertDateKeyToMonthKey(userDateKey);
            
            const dateParts = monthKey.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1;
            const trophyDate = new Date(year, month, 15);

            // Use Challenge document title as fallback
            let gameTitle = data.gameTitle; // User data first
            
            if (!gameTitle && challengeTitleMap[monthKey]?.monthly) {
                gameTitle = challengeTitleMap[monthKey].monthly; // Challenge document fallback
                console.log(`Using Challenge document title for ${monthKey}: ${gameTitle}`);
            }
            
            if (!gameTitle) {
                gameTitle = `Monthly Challenge - ${formatShortDate(monthKey)}`; // Final fallback
            }

            // UPDATED: Get custom emoji for this trophy
            const emojiData = getTrophyEmoji('monthly', monthKey, awardLevel);

            trophies.push({
                gameId: `monthly_${monthKey}`,
                gameTitle: gameTitle,
                consoleName: 'Monthly Challenge',
                awardLevel: awardLevel,
                challengeType: 'monthly',
                emojiId: emojiData.emojiId,
                emojiName: emojiData.emojiName,
                earnedAt: trophyDate,
                monthKey: monthKey
            });
        }
    }

    // Process shadow challenges
    for (const [userDateKey, data] of user.shadowChallenges.entries()) {
        if (data.progress > 0) {
            let awardLevel = 'participation';
            if (data.progress === 2) awardLevel = 'beaten';

            // Convert user date key (YYYY-MM-DD) to month key (YYYY-MM)
            const monthKey = convertDateKeyToMonthKey(userDateKey);

            const dateParts = monthKey.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1;
            const trophyDate = new Date(year, month, 15);

            // Use Challenge document title as fallback
            let gameTitle = data.gameTitle; // User data first
            
            if (!gameTitle && challengeTitleMap[monthKey]?.shadow) {
                gameTitle = challengeTitleMap[monthKey].shadow; // Challenge document fallback
                console.log(`Using Challenge document shadow title for ${monthKey}: ${gameTitle}`);
            }
            
            if (!gameTitle) {
                gameTitle = `Shadow Challenge - ${formatShortDate(monthKey)}`; // Final fallback
            }

            // UPDATED: Get custom emoji for this trophy
            const emojiData = getTrophyEmoji('shadow', monthKey, awardLevel);

            trophies.push({
                gameId: `shadow_${monthKey}`,
                gameTitle: gameTitle,
                consoleName: 'Shadow Challenge',
                awardLevel: awardLevel,
                challengeType: 'shadow',
                emojiId: emojiData.emojiId,
                emojiName: emojiData.emojiName,
                earnedAt: trophyDate,
                monthKey: monthKey
            });
        }
    }

    // Process community awards (unchanged)
    const currentYear = new Date().getFullYear();
    const communityAwards = user.getCommunityAwardsForYear(currentYear);
    
    for (const award of communityAwards) {
        // Use special emoji for community awards
        const emojiData = getTrophyEmoji('community', null, 'special');
        
        trophies.push({
            gameId: `community_${award.title.replace(/\s+/g, '_').toLowerCase()}`,
            gameTitle: award.title,
            consoleName: 'Community',
            awardLevel: 'special',
            challengeType: 'community',
            emojiId: emojiData.emojiId,
            emojiName: emojiData.emojiName,
            earnedAt: award.awardedAt,
            monthKey: null
        });
    }

    // Sort by earned date (most recent first)
    trophies.sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));

    if (trophies.length === 0) {
        return interaction.editReply({
            content: '🏆 This trophy case is empty! \n\n' +
                     '**How to earn trophies:**\n' +
                     '• Complete monthly challenges (mastery, beaten, or participation)\n' +
                     '• Complete shadow challenges when they\'re revealed\n' +
                     '• Earn community awards\n\n' +
                     '💡 **Achievement trophies are automatically generated from your progress!**',
            ephemeral: true
        });
    }

    // Group and display trophies
    const groupedTrophies = {
        monthly: { mastery: [], beaten: [], participation: [] },
        shadow: { mastery: [], beaten: [], participation: [] },
        community: { special: [] }
    };

    trophies.forEach(trophy => {
        if (groupedTrophies[trophy.challengeType] && groupedTrophies[trophy.challengeType][trophy.awardLevel]) {
            groupedTrophies[trophy.challengeType][trophy.awardLevel].push(trophy);
        }
    });

    const embed = new EmbedBuilder()
        .setTitle(`🏆 ${user.raUsername}'s Trophy Case`)
        .setColor(COLORS.GOLD)
        .setDescription(`**Achievement Trophies:** ${trophies.length}`)
        .setTimestamp();

    // Add fields for each category
    ['monthly', 'shadow', 'community'].forEach(challengeType => {
        const categoryTrophies = groupedTrophies[challengeType];
        if (!categoryTrophies) return;

        Object.keys(categoryTrophies).forEach(awardLevel => {
            const levelTrophies = categoryTrophies[awardLevel];
            if (levelTrophies.length === 0) return;

            let emoji = '🏆';
            let typeName = challengeType;
            let levelName = awardLevel;

            if (awardLevel === 'mastery') emoji = '✨';
            else if (awardLevel === 'beaten') emoji = '⭐';
            else if (awardLevel === 'participation') emoji = '🏁';
            else if (awardLevel === 'special') emoji = '🎖️';

            typeName = challengeType.charAt(0).toUpperCase() + challengeType.slice(1);
            levelName = awardLevel.charAt(0).toUpperCase() + awardLevel.slice(1);

            const fieldName = `${emoji} ${typeName} ${levelName} (${levelTrophies.length})`;
            
            let fieldValue = '';
            levelTrophies.slice(0, 8).forEach(trophy => {
                const shortDate = formatShortDate(trophy.monthKey || '2025-01');
                
                // UPDATED: Use the custom emoji with proper formatting
                const trophyEmoji = formatTrophyEmoji(trophy.emojiId, trophy.emojiName);
                
                fieldValue += `${trophyEmoji} **${trophy.gameTitle}** - ${shortDate}\n`;
            });

            if (levelTrophies.length > 8) {
                fieldValue += `*...and ${levelTrophies.length - 8} more*\n`;
            }

            embed.addFields({ name: fieldName, value: fieldValue, inline: true });
        });
    });

    embed.setFooter({ 
        text: 'Achievement trophies are earned by completing challenges and awards' 
    });

    await interaction.editReply({
        embeds: [embed],
        ephemeral: true
    });
}

async function handleDetailedStatsButton(interaction, user) {
    const currentYear = new Date().getFullYear();
    const yearStats = await calculateYearStats(user, currentYear);

    const embed = new EmbedBuilder()
        .setTitle(`📈 ${user.raUsername}'s Detailed Stats`)
        .setColor(COLORS.PRIMARY)
        .setTimestamp();

    // Challenge participation
    embed.addFields({
        name: '🎯 Challenge Participation',
        value: `**Monthly Challenges:** ${yearStats.monthlyParticipation} participated\n` +
               `**Shadow Challenges:** ${yearStats.shadowParticipation} participated\n` +
               `**Total Points:** ${yearStats.totalPoints}`,
        inline: false
    });

    // Achievement breakdown
    embed.addFields({
        name: '🏆 Achievement Breakdown',
        value: `**Mastery Awards:** ${yearStats.masteryCount}\n` +
               `**Beaten Awards:** ${yearStats.beatenCount}\n` +
               `**Participation:** ${yearStats.participationCount}`,
        inline: true
    });

    // Community recognition
    const communityAwards = user.getCommunityAwardsForYear(currentYear);
    if (communityAwards.length > 0) {
        const totalCommunityPoints = communityAwards.reduce((sum, award) => sum + award.points, 0);
        embed.addFields({
            name: '🏅 Community Recognition',
            value: `**Awards Received:** ${communityAwards.length}\n` +
                   `**Community Points:** ${totalCommunityPoints}`,
            inline: true
        });
    }

    // Mastery information
    const masteredGames = user.getMasteredGames();
    if (masteredGames.length > 0) {
        const recentMasteries = masteredGames
            .sort((a, b) => new Date(b.masteredAt) - new Date(a.masteredAt))
            .slice(0, 5);

        let masteryText = `**Total Mastered:** ${masteredGames.length}\n\n**Recent Masteries:**\n`;
        recentMasteries.forEach(game => {
            const date = new Date(game.masteredAt).toLocaleDateString();
            masteryText += `• ${game.gameTitle} (${date})\n`;
        });

        embed.addFields({
            name: '🌟 Mastery Progress',
            value: masteryText,
            inline: false
        });
    }

    // Arena stats if available
    if (user.arenaStats && user.arenaStats.challengesParticipated > 0) {
        embed.addFields({
            name: '🎲 Arena Performance',
            value: `**GP Balance:** ${user.gpBalance}\n` +
                   `**Challenges Won:** ${user.arenaStats.challengesWon}/${user.arenaStats.challengesParticipated}\n` +
                   `**Win Rate:** ${user.getGpWinRate()}%\n` +
                   `**Bet Win Rate:** ${user.getBetWinRate()}%`,
            inline: true
        });
    }

    await interaction.editReply({
        embeds: [embed],
        ephemeral: true
    });
}

async function handleMasteredGamesButton(interaction, user) {
    const masteredGames = user.getMasteredGames();

    if (masteredGames.length === 0) {
        return interaction.editReply({
            content: '🌟 No mastered games yet!\n\n' +
                     'Games are automatically added to your mastery list when you achieve 100% completion.',
            ephemeral: true
        });
    }

    // Sort by mastery date (most recent first)
    const sortedGames = masteredGames.sort((a, b) => new Date(b.masteredAt) - new Date(a.masteredAt));

    const embed = new EmbedBuilder()
        .setTitle(`🌟 ${user.raUsername}'s Mastered Games`)
        .setColor(COLORS.GOLD)
        .setDescription(`**Total Mastered:** ${masteredGames.length} games`)
        .setTimestamp();

    // Group games by console for better organization
    const gamesByConsole = {};
    sortedGames.forEach(game => {
        if (!gamesByConsole[game.consoleName]) {
            gamesByConsole[game.consoleName] = [];
        }
        gamesByConsole[game.consoleName].push(game);
    });

    // Add fields for each console (limit to prevent embed overflow)
    let fieldCount = 0;
    const maxFields = 20; // Discord embed limit

    for (const [consoleName, games] of Object.entries(gamesByConsole)) {
        if (fieldCount >= maxFields) break;

        let gameList = '';
        const displayGames = games.slice(0, 10); // Limit games per console

        displayGames.forEach(game => {
            const date = new Date(game.masteredAt).toLocaleDateString();
            gameList += `• **${game.gameTitle}** (${date})\n`;
        });

        if (games.length > 10) {
            gameList += `*...and ${games.length - 10} more*\n`;
        }

        embed.addFields({
            name: `🎮 ${consoleName} (${games.length})`,
            value: gameList,
            inline: true
        });

        fieldCount++;
    }

    embed.setFooter({ 
        text: 'Games are automatically tracked when you achieve mastery (100% completion)' 
    });

    await interaction.editReply({
        embeds: [embed],
        ephemeral: true
    });
}

// Helper functions
function formatTrophySummary(user) {
    const trophyCount = user.getTrophyCount();
    return `**Total:** ${trophyCount.total}\n` +
           `Monthly: ${trophyCount.monthly}\n` +
           `Shadow: ${trophyCount.shadow}\n` +
           `Community: ${trophyCount.community}`;
}

function formatChallengeStats(yearStats) {
    return `**Total Points:** ${yearStats.totalPoints}\n` +
           `**Challenges:** ${yearStats.monthlyParticipation + yearStats.shadowParticipation}\n` +
           `**Awards:** ${yearStats.masteryCount + yearStats.beatenCount}`;
}

function formatCurrentProgress(user) {
    const currentDate = new Date();
    const currentDateKey = User.formatDateKey(currentDate);
    
    const monthlyProgress = user.monthlyChallenges.get(currentDateKey);
    const shadowProgress = user.shadowChallenges.get(currentDateKey);

    let progressText = '';
    
    if (monthlyProgress && monthlyProgress.progress > 0) {
        const percentage = monthlyProgress.percentage || 0;
        progressText += `**Monthly:** ${percentage.toFixed(1)}%\n`;
    } else {
        progressText += `**Monthly:** Not started\n`;
    }

    if (shadowProgress && shadowProgress.progress > 0) {
        const percentage = shadowProgress.percentage || 0;
        progressText += `**Shadow:** ${percentage.toFixed(1)}%\n`;
    } else {
        progressText += `**Shadow:** Not started\n`;
    }

    return progressText || 'No current progress';
}

async function calculateYearStats(user, year) {
    const stats = {
        totalPoints: 0,
        monthlyParticipation: 0,
        shadowParticipation: 0,
        masteryCount: 0,
        beatenCount: 0,
        participationCount: 0
    };

    // Calculate monthly challenge stats
    for (const [dateKey, data] of user.monthlyChallenges.entries()) {
        const challengeYear = parseInt(dateKey.split('-')[0]);
        if (challengeYear === year && data.progress > 0) {
            stats.monthlyParticipation++;
            
            if (data.progress === 3) {
                stats.masteryCount++;
                stats.totalPoints += 3;
            } else if (data.progress === 2) {
                stats.beatenCount++;
                stats.totalPoints += 2;
            } else if (data.progress === 1) {
                stats.participationCount++;
                stats.totalPoints += 1;
            }
        }
    }

    // Calculate shadow challenge stats
    for (const [dateKey, data] of user.shadowChallenges.entries()) {
        const challengeYear = parseInt(dateKey.split('-')[0]);
        if (challengeYear === year && data.progress > 0) {
            stats.shadowParticipation++;
            
            if (data.progress === 2) {
                stats.beatenCount++;
                stats.totalPoints += 2;
            } else if (data.progress === 1) {
                stats.participationCount++;
                stats.totalPoints += 1;
            }
        }
    }

    // Add community award points
    const communityPoints = user.getCommunityPointsForYear(year);
    stats.totalPoints += communityPoints;

    return stats;
}

function getMonthKey(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function convertDateKeyToMonthKey(dateKey) {
    // Convert YYYY-MM-DD to YYYY-MM
    return dateKey.substring(0, 7);
}

function formatShortDate(monthKey) {
    if (!monthKey) return 'Unknown';
    
    const [year, month] = monthKey.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const monthIndex = parseInt(month) - 1;
    const shortYear = year.slice(2);
    
    return `${monthNames[monthIndex]} ${shortYear}`;
}

// Export the command for Discord.js
export default {
    data,
    execute,
    handleButtonInteraction
};
