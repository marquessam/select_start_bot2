// src/commands/user/profile.js - COMPLETE UPDATED VERSION with collection grid display
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import { getTrophyEmoji, formatTrophyEmoji } from '../../config/trophyEmojis.js';
import { formatGachaEmoji } from '../../config/gachaEmojis.js';
import retroAPI from '../../services/retroAPI.js';
import gachaService from '../../services/gachaService.js';
import combinationService from '../../services/combinationService.js';
import { COLORS, EMOJIS } from '../../utils/FeedUtils.js';

// Award points constants - matching yearlyLeaderboard.js exactly
const POINTS = {
    MASTERY: 7,          // Mastery (3+3+1)
    BEATEN: 4,           // Beaten (3+1)
    PARTICIPATION: 1     // Participation
};

// Shadow games are limited to beaten status maximum (4 points)
const SHADOW_MAX_POINTS = POINTS.BEATEN;

export default {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Display user profile summary')
        .addStringOption(option =>
            option.setName('username')
            .setDescription('RetroAchievements username (optional)')
            .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

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
                    raUsername: { $regex: new RegExp('^' + raUsername + '$', 'i') }
                });
                if (!user) {
                    return interaction.editReply('User not found. Please check the username or ask an admin to register this user.');
                }
            }

            // Get user's RA info
            const raUserInfo = await retroAPI.getUserInfo(raUsername);
            
            // Calculate points using the same method as yearlyLeaderboard
            const pointsData = this.calculateTotalPoints(user);
            
            // Get current year community awards
            const currentYear = new Date().getFullYear();
            const communityAwards = user.getCommunityAwardsForYear(currentYear);
            
            // Create the profile embed
            const profileEmbed = this.createProfileEmbed(user, raUserInfo, pointsData, communityAwards);
            
            // Create buttons for trophy case and collection
            const buttonRow = this.createProfileButtons(user);
            
            return interaction.editReply({ 
                embeds: [profileEmbed], 
                components: buttonRow ? [buttonRow] : []
            });

        } catch (error) {
            console.error('Error displaying profile:', error);
            return interaction.editReply('An error occurred while fetching the profile. Please try again.');
        }
    },
    
    calculateTotalPoints(user) {
        // Calculate totals for each category exactly like yearlyLeaderboard.js
        let challengePoints = 0;
        let masteryCount = 0;
        let beatenCount = 0;
        let participationCount = 0;
        let shadowBeatenCount = 0;
        let shadowParticipationCount = 0;
        
        // Process monthly challenges
        for (const [dateStr, data] of user.monthlyChallenges.entries()) {
            if (data.progress === 3) {
                // Mastery (7 points)
                masteryCount++;
                challengePoints += POINTS.MASTERY;
            } else if (data.progress === 2) {
                // Beaten (4 points)
                beatenCount++;
                challengePoints += POINTS.BEATEN;
            } else if (data.progress === 1) {
                // Participation (1 point)
                participationCount++;
                challengePoints += POINTS.PARTICIPATION;
            }
        }

        // Process shadow challenges
        for (const [dateStr, data] of user.shadowChallenges.entries()) {
            if (data.progress === 2) {
                // Beaten for shadow (4 points max)
                shadowBeatenCount++;
                challengePoints += SHADOW_MAX_POINTS;
            } else if (data.progress === 1) {
                // Participation (1 point)
                shadowParticipationCount++;
                challengePoints += POINTS.PARTICIPATION;
            }
        }

        // Get community awards points for current year
        const currentYear = new Date().getFullYear();
        const communityPoints = user.getCommunityPointsForYear(currentYear);

        return {
            totalPoints: challengePoints + communityPoints,
            challengePoints,
            communityPoints,
            stats: {
                mastery: masteryCount,
                beaten: beatenCount,
                participation: participationCount,
                shadowBeaten: shadowBeatenCount,
                shadowParticipation: shadowParticipationCount
            }
        };
    },
    
    createProfileEmbed(user, raUserInfo, pointsData, communityAwards) {
        const embed = new EmbedBuilder()
            .setTitle(`Profile: ${user.raUsername}`)
            .setURL(`https://retroachievements.org/user/${user.raUsername}`)
            .setColor('#0099ff');
            
        // Add RA profile image if available
        if (raUserInfo && raUserInfo.profileImageUrl) {
            embed.setThumbnail(raUserInfo.profileImageUrl);
        }
        
        // RetroAchievements Site Info
        let rankInfo = 'Not ranked';
        if (raUserInfo && raUserInfo.rank) {
            rankInfo = `#${raUserInfo.rank}`;
            
            // Add percentage if available
            if (raUserInfo.totalRanked) {
                const percentage = (raUserInfo.rank / raUserInfo.totalRanked * 100).toFixed(2);
                rankInfo += ` (Top ${percentage}%)`;
            }
        }
        
        embed.addFields({
            name: 'RetroAchievements',
            value: `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})\n` +
                   `**Rank:** ${rankInfo}`
        });
        
        // Community Stats with detailed point breakdown
        embed.addFields({
            name: 'Community Stats',
            value: `**Total Points:** ${pointsData.totalPoints}\n` + 
                   `• Challenge Points: ${pointsData.challengePoints}\n` +
                   `• Community Points: ${pointsData.communityPoints}\n` +
                   `**GP Balance:** ${(user.gpBalance || 0).toLocaleString()} GP`
        });
        
        // Point Breakdown
        const stats = pointsData.stats;
        embed.addFields({
            name: 'Point Details',
            value: `✨ Mastery: ${stats.mastery} (${stats.mastery * POINTS.MASTERY} pts)\n` +
                   `⭐ Beaten: ${stats.beaten} (${stats.beaten * POINTS.BEATEN} pts)\n` +
                   `🏁 Participation: ${stats.participation} (${stats.participation * POINTS.PARTICIPATION} pts)\n` +
                   `👥 Shadow Beaten: ${stats.shadowBeaten} (${stats.shadowBeaten * SHADOW_MAX_POINTS} pts)\n` +
                   `👥 Shadow Participation: ${stats.shadowParticipation} (${stats.shadowParticipation * POINTS.PARTICIPATION} pts)`
        });
        
        // Arena Stats (if available)
        if (user.arenaStats) {
            const arenaStats = user.arenaStats;
            const challengesIssued = arenaStats.challengesCreated || 0;
            const challengesAccepted = arenaStats.challengesParticipated - challengesIssued || 0;
            const challengesWon = arenaStats.challengesWon || 0;
            const betsPlaced = arenaStats.betsPlaced || 0;
            const betsWon = arenaStats.betsWon || 0;
            
            embed.addFields({
                name: 'Arena Stats',
                value: `**Challenges:** ${challengesIssued + challengesAccepted} (${challengesWon} wins)\n` +
                       `**Bets:** ${betsPlaced} (${betsWon} wins)`
            });
        }
        
        // Community Awards
        if (communityAwards && communityAwards.length > 0) {
            // Format awards neatly with emojis
            let awardsText = '';
            
            // Show up to 5 most recent awards to keep it manageable
            const recentAwards = communityAwards.slice(0, 5);
            
            recentAwards.forEach(award => {
                // Format date in a concise way
                const awardDate = new Date(award.awardedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });
                
                awardsText += `🏆 **${award.title}** (${award.points} pts) - ${awardDate}\n`;
            });
            
            // If there are more awards, show a count
            if (communityAwards.length > 5) {
                awardsText += `\n...and ${communityAwards.length - 5} more awards`;
            }
            
            embed.addFields({
                name: `Community Awards (${communityAwards.length})`,
                value: awardsText || 'No awards yet'
            });
        } else {
            embed.addFields({
                name: 'Community Awards',
                value: 'No awards yet'
            });
        }
        
        embed.setFooter({ text: 'Use /yearlyboard to see the full leaderboard • Click buttons below to explore more!' })
             .setTimestamp();
        
        return embed;
    },

    createProfileButtons(user) {
        // Trophy Case Button - for achievement trophies
        const trophyButton = new ButtonBuilder()
            .setCustomId(`profile_trophy_case_${user.raUsername}`)
            .setLabel('🏆 Trophy Case')
            .setStyle(ButtonStyle.Primary);

        // Collection Button - for gacha items
        const collectionButton = new ButtonBuilder()
            .setCustomId(`profile_collection_${user.raUsername}`)
            .setLabel('📦 Collection')
            .setStyle(ButtonStyle.Secondary);

        return new ActionRowBuilder().addComponents(trophyButton, collectionButton);
    },

    // Handle button interactions
    async handleButtonInteraction(interaction) {
        if (!interaction.customId.startsWith('profile_')) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            let username;
            let action;

            // Parse different button formats
            if (interaction.customId.includes('trophy_case_')) {
                // Format: profile_trophy_case_USERNAME
                username = interaction.customId.replace('profile_trophy_case_', '');
                action = 'trophy_case';
            } else if (interaction.customId.includes('collection_')) {
                // Format: profile_collection_USERNAME
                username = interaction.customId.replace('profile_collection_', '');
                action = 'collection';
            } else {
                console.error('Unknown profile button format:', interaction.customId);
                return;
            }

            // Find the user
            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp('^' + username + '$', 'i') }
            });

            if (!user) {
                return interaction.editReply({
                    content: '❌ User not found.',
                    ephemeral: true
                });
            }

            // Handle different actions
            switch (action) {
                case 'trophy_case':
                    await this.handleTrophyCaseButton(interaction, user);
                    break;
                case 'collection':
                    await this.handleCollectionButton(interaction, user);
                    break;
                default:
                    console.error('Unknown profile button action:', action);
                    return;
            }

        } catch (error) {
            console.error('Error handling profile button:', error);
            await interaction.editReply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    },

    /**
     * FIXED: Trophy case with custom emoji support, Challenge document fallback, and deduplication
     */
    async handleTrophyCaseButton(interaction, user) {
        // STEP 1: Get Challenge documents for title lookups
        const challenges = await Challenge.find({}).sort({ date: 1 });
        const challengeTitleMap = {};
        
        // Build a lookup map for game titles
        for (const challenge of challenges) {
            const monthKey = this.getMonthKey(challenge.date);
            challengeTitleMap[monthKey] = {
                monthly: challenge.monthly_game_title,
                shadow: challenge.shadow_game_title
            };
        }

        // STEP 2: Generate trophies with DEDUPLICATION and custom emojis
        const trophies = [];
        const seenTrophies = new Set(); // FIXED: Track seen trophies to prevent duplicates

        // FIXED: Process monthly challenges with deduplication
        const uniqueMonthlyEntries = this.deduplicateMapEntries(user.monthlyChallenges);
        for (const [userDateKey, data] of uniqueMonthlyEntries) {
            if (data.progress > 0) {
                let awardLevel = 'participation';
                if (data.progress === 3) awardLevel = 'mastery';
                else if (data.progress === 2) awardLevel = 'beaten';

                // FIXED: Use consistent month key normalization
                const monthKey = this.normalizeMonthKey(userDateKey);
                
                // FIXED: Create unique trophy identifier to prevent duplicates
                const trophyId = `monthly_${monthKey}_${awardLevel}`;
                if (seenTrophies.has(trophyId)) {
                    console.log(`Skipping duplicate monthly trophy: ${trophyId}`);
                    continue;
                }
                seenTrophies.add(trophyId);
                
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
                    gameTitle = `Monthly Challenge - ${this.formatShortDate(monthKey)}`; // Final fallback
                }

                // Get custom emoji for this trophy
                const emojiData = await getTrophyEmoji('monthly', monthKey, awardLevel);

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

        // FIXED: Process shadow challenges with deduplication
        const uniqueShadowEntries = this.deduplicateMapEntries(user.shadowChallenges);
        for (const [userDateKey, data] of uniqueShadowEntries) {
            if (data.progress > 0) {
                let awardLevel = 'participation';
                if (data.progress === 2) awardLevel = 'beaten';

                // FIXED: Use consistent month key normalization
                const monthKey = this.normalizeMonthKey(userDateKey);

                // FIXED: Create unique trophy identifier to prevent duplicates
                const trophyId = `shadow_${monthKey}_${awardLevel}`;
                if (seenTrophies.has(trophyId)) {
                    console.log(`Skipping duplicate shadow trophy: ${trophyId}`);
                    continue;
                }
                seenTrophies.add(trophyId);

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
                    gameTitle = `Shadow Challenge - ${this.formatShortDate(monthKey)}`; // Final fallback
                }

                // Get custom emoji for this trophy
                const emojiData = await getTrophyEmoji('shadow', monthKey, awardLevel);

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

        // Process community awards with deduplication
        const currentYear = new Date().getFullYear();
        const communityAwards = user.getCommunityAwardsForYear(currentYear);
        
        for (const award of communityAwards) {
            // FIXED: Create unique trophy identifier for community awards too
            const trophyId = `community_${award.title.replace(/\s+/g, '_').toLowerCase()}_${award.awardedAt.getTime()}`;
            if (seenTrophies.has(trophyId)) {
                console.log(`Skipping duplicate community award: ${trophyId}`);
                continue;
            }
            seenTrophies.add(trophyId);

            // Use custom emoji for community awards
            const emojiData = await getTrophyEmoji('community', null, 'special');
            
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

        // Group and display trophies by type and award level
        const groupedTrophies = {
            monthly: { mastery: [], beaten: [], participation: [] },
            shadow: { beaten: [], participation: [] }, // Shadow can't have mastery
            community: { special: [] }
        };

        trophies.forEach(trophy => {
            if (groupedTrophies[trophy.challengeType] && groupedTrophies[trophy.challengeType][trophy.awardLevel]) {
                groupedTrophies[trophy.challengeType][trophy.awardLevel].push(trophy);
            }
        });

        // UPDATED: Clean trophy case title - removed 🏆 emoji
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Trophy Case`)
            .setColor(COLORS.GOLD)
            .setDescription(`**Achievement Trophies:** ${trophies.length}`)
            .setTimestamp();

        // Add fields for each category and award level
        ['monthly', 'shadow', 'community'].forEach(challengeType => {
            const categoryTrophies = groupedTrophies[challengeType];
            if (!categoryTrophies) return;

            Object.keys(categoryTrophies).forEach(awardLevel => {
                const levelTrophies = categoryTrophies[awardLevel];
                if (levelTrophies.length === 0) return;

                // Sort by date (most recent first)
                levelTrophies.sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));

                // Get appropriate emoji and names
                let emoji = '🏆';
                let typeName = challengeType.charAt(0).toUpperCase() + challengeType.slice(1);
                let levelName = awardLevel.charAt(0).toUpperCase() + awardLevel.slice(1);

                if (awardLevel === 'mastery') emoji = '✨';
                else if (awardLevel === 'beaten') emoji = '⭐';
                else if (awardLevel === 'participation') emoji = '🏁';
                else if (awardLevel === 'special') emoji = '🎖️';

                // Special handling for community awards
                if (challengeType === 'community') {
                    typeName = 'Community';
                    levelName = 'Awards';
                }

                const fieldName = `${emoji} ${typeName} ${levelName} (${levelTrophies.length})`;
                
                let fieldValue = '';
                levelTrophies.slice(0, 10).forEach(trophy => {
                    // Use the custom emoji with proper formatting, no date
                    const trophyEmoji = formatTrophyEmoji(trophy.emojiId, trophy.emojiName);
                    fieldValue += `${trophyEmoji} **${trophy.gameTitle}**\n`;
                });

                if (levelTrophies.length > 10) {
                    fieldValue += `*...and ${levelTrophies.length - 10} more*\n`;
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
    },

    /**
     * UPDATED: Collection button now shows emoji grid like /collection command
     */
    async handleCollectionButton(interaction, user) {
        if (!user.gachaCollection || user.gachaCollection.length === 0) {
            return interaction.editReply({
                content: '📦 Your collection is empty! Visit the gacha channel to start collecting items.\n\n' +
                         '💡 **Tip:** All item combinations happen automatically when you get the right ingredients!',
                ephemeral: true
            });
        }

        // Use the same display logic as the collection command
        await this.showCollectionItemsPage(interaction, user, 'all', 0);
    },

    /**
     * NEW: Show collection items page with emoji grid (adapted from collection.js)
     */
    async showCollectionItemsPage(interaction, user, filter = 'all', page = 0) {
        const ITEMS_PER_PAGE = 25;
        
        // Filter items
        let filteredItems = filter === 'all' ? 
            user.gachaCollection : 
            user.gachaCollection.filter(item => item.seriesId === filter);

        const title = filter === 'all' ? 'All Items' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Series`;

        // Sort by rarity, then by name
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        filteredItems.sort((a, b) => {
            const aRarityIndex = rarityOrder.indexOf(a.rarity);
            const bRarityIndex = rarityOrder.indexOf(b.rarity);
            if (aRarityIndex !== bRarityIndex) return aRarityIndex - bRarityIndex;
            return a.itemName.localeCompare(b.itemName);
        });

        // Pagination
        const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
        const startIndex = page * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredItems.length);
        const pageItems = filteredItems.slice(startIndex, endIndex);

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Collection - ${title}`)
            .setColor(COLORS.INFO)
            .setTimestamp();

        if (pageItems.length === 0) {
            embed.setDescription('No items to display.');
        } else {
            // Group by rarity and create emoji grid
            const rarityGroups = {};
            pageItems.forEach(item => {
                if (!rarityGroups[item.rarity]) rarityGroups[item.rarity] = [];
                rarityGroups[item.rarity].push(item);
            });

            let description = '';
            for (const rarity of rarityOrder) {
                const rarityItems = rarityGroups[rarity];
                if (!rarityItems || rarityItems.length === 0) continue;

                const rarityEmoji = gachaService.getRarityEmoji(rarity);
                const rarityName = gachaService.getRarityDisplayName(rarity);
                description += `\n${rarityEmoji} **${rarityName}** (${rarityItems.length})\n`;
                
                // Create emoji grid (5 per row)
                let currentRow = '';
                for (let i = 0; i < rarityItems.length; i++) {
                    const item = rarityItems[i];
                    const emoji = formatGachaEmoji(item.emojiId, item.emojiName);
                    const quantity = (item.quantity || 1) > 1 ? `⁽${item.quantity}⁾` : '';
                    currentRow += `${emoji}${quantity} `;
                    
                    if ((i + 1) % 5 === 0 || i === rarityItems.length - 1) {
                        description += currentRow.trim() + '\n';
                        currentRow = '';
                    }
                }
            }
            embed.setDescription(description.trim());
        }

        // Get combination stats
        const combinationStats = combinationService.getCombinationStats(user);

        // Footer
        if (totalPages > 1) {
            embed.setFooter({ 
                text: `Page ${page + 1}/${totalPages} • ${startIndex + 1}-${endIndex} of ${filteredItems.length} items • ${combinationStats.totalCombined} from auto-combos`
            });
        } else {
            embed.setFooter({ 
                text: `${filteredItems.length} items • ${combinationStats.totalCombined} from auto-combinations • ⁽ⁿ⁾ = quantity • Use /collection for full interface`
            });
        }

        // Create components
        const components = [];

        // Series dropdown (if multiple series)
        const seriesOptions = this.getSeriesOptions(user);
        if (seriesOptions.length > 1) {
            const seriesMenu = new StringSelectMenuBuilder()
                .setCustomId(`profile_coll_series_${user.raUsername}`)
                .setPlaceholder('Choose a series to view...')
                .addOptions(seriesOptions);
            components.push(new ActionRowBuilder().addComponents(seriesMenu));
        }

        // Action buttons
        const actionRow = new ActionRowBuilder();
        
        // Pagination buttons (only if more than one page)
        if (totalPages > 1) {
            actionRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`profile_coll_prev_${user.raUsername}_${filter}`)
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('page_indicator')
                    .setLabel(`${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`profile_coll_next_${user.raUsername}_${filter}`)
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages - 1)
            );
        }

        // Main action button
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`profile_coll_full_${user.raUsername}`)
                .setLabel('🔗 Open Full Collection')
                .setStyle(ButtonStyle.Primary)
        );

        components.push(actionRow);

        await interaction.editReply({ embeds: [embed], components: components });
    },

    /**
     * NEW: Get series options for dropdown (adapted from collection.js)
     */
    getSeriesOptions(user) {
        const summary = gachaService.getUserCollectionSummary(user);
        const options = [
            { label: 'All Items', value: 'all', description: `View all ${summary.totalItems} items`, emoji: '📦' }
        ];

        Object.entries(summary.seriesBreakdown || {}).forEach(([seriesName, items]) => {
            const itemCount = items.length;
            const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
            
            if (seriesName === 'Individual Items') {
                options.push({
                    label: 'Individual Items',
                    value: 'individual',
                    description: `${itemCount} standalone items`,
                    emoji: '🔸'
                });
            } else {
                options.push({
                    label: `${seriesName.charAt(0).toUpperCase() + seriesName.slice(1)}`,
                    value: seriesName,
                    description: `${itemCount} types (${totalQuantity} total)`,
                    emoji: '🏷️'
                });
            }
        });

        return options.slice(0, 25); // Discord limit
    },

    /**
     * NEW: Handle collection interactions from profile view
     */
    async handleCollectionInteraction(interaction) {
        if (!interaction.customId.startsWith('profile_coll_')) return;

        try {
            await interaction.deferUpdate();

            const parts = interaction.customId.split('_');
            if (parts.length < 4) return;

            const action = parts[2]; // 'series', 'prev', 'next', 'full'
            const username = parts[3];

            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user) {
                return interaction.followUp({ 
                    content: '❌ User not found.', 
                    ephemeral: true 
                });
            }

            switch (action) {
                case 'series':
                    if (interaction.isStringSelectMenu()) {
                        const selectedSeries = interaction.values[0];
                        await this.showCollectionItemsPage(interaction, user, selectedSeries, 0);
                    }
                    break;

                case 'prev':
                    if (parts.length >= 5) {
                        const prevFilter = parts[4];
                        const currentPage = parseInt(interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/)?.[1] || '1') - 1;
                        await this.showCollectionItemsPage(interaction, user, prevFilter, Math.max(0, currentPage - 1));
                    }
                    break;

                case 'next':
                    if (parts.length >= 5) {
                        const nextFilter = parts[4];
                        const nextCurrentPage = parseInt(interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/)?.[1] || '1') - 1;
                        await this.showCollectionItemsPage(interaction, user, nextFilter, nextCurrentPage + 1);
                    }
                    break;

                case 'full':
                    // Provide instructions to use the full collection command
                    await interaction.followUp({
                        content: '💡 **Use `/collection` for the full collection interface!**\n\n' +
                                 'The full collection command includes:\n' +
                                 '• 🔍 **Item inspection** with detailed descriptions\n' +
                                 '• 🎁 **Give items** to other players\n' +
                                 '• 📊 **Collection statistics**\n' +
                                 '• ⚡ **Auto-combination tracking**\n\n' +
                                 'Just type `/collection` to access all features!',
                        ephemeral: true
                    });
                    break;
            }

        } catch (error) {
            console.error('Error handling collection interaction:', error);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: '❌ An error occurred while processing your request.', 
                        ephemeral: true 
                    });
                } else if (interaction.deferred) {
                    await interaction.editReply({ 
                        content: '❌ An error occurred while processing your request.' 
                    });
                } else {
                    await interaction.followUp({ 
                        content: '❌ An error occurred while processing your request.', 
                        ephemeral: true 
                    });
                }
            } catch (followUpError) {
                console.error('Error sending error follow-up:', followUpError);
            }
        }
    },

    /**
     * FIXED: Deduplicate Map entries by normalizing keys and keeping best progress
     */
    deduplicateMapEntries(challengeMap) {
        if (!challengeMap || challengeMap.size === 0) {
            return [];
        }

        const entries = Array.from(challengeMap.entries());
        const normalizedEntries = new Map();

        for (const [originalKey, data] of entries) {
            const normalizedKey = this.normalizeMonthKey(originalKey);
            
            if (normalizedEntries.has(normalizedKey)) {
                const existing = normalizedEntries.get(normalizedKey);
                
                // Keep the entry with higher progress, or more achievements if same progress
                if (data.progress > existing.data.progress || 
                    (data.progress === existing.data.progress && (data.achievements || 0) > (existing.data.achievements || 0))) {
                    console.log(`Replacing duplicate ${originalKey} -> ${normalizedKey} with better progress`);
                    normalizedEntries.set(normalizedKey, { key: normalizedKey, data });
                } else {
                    console.log(`Keeping existing ${normalizedKey} with better progress`);
                }
            } else {
                normalizedEntries.set(normalizedKey, { key: normalizedKey, data });
            }
        }

        // Return deduplicated entries
        return Array.from(normalizedEntries.values()).map(({ key, data }) => [key, data]);
    },

    /**
     * FIXED: Consistent month key normalization - same logic as stats service
     */
    normalizeMonthKey(dateKey) {
        if (!dateKey) return dateKey;
        
        const keyStr = String(dateKey).trim();
        
        // If already in YYYY-MM format, return as is
        if (/^\d{4}-\d{2}$/.test(keyStr)) {
            return keyStr;
        }
        
        // If in YYYY-MM-DD format, convert to YYYY-MM
        if (/^\d{4}-\d{2}-\d{2}$/.test(keyStr)) {
            return keyStr.substring(0, 7); // Takes "2024-12-01" -> "2024-12"
        }
        
        // If it's a Date object or date string, parse and format
        try {
            const date = new Date(keyStr);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                return `${year}-${month}`;
            }
        } catch (error) {
            console.warn(`Unable to parse date key: ${keyStr}`);
        }
        
        // Return original if we can't normalize
        return keyStr;
    },

    // Helper methods
    getMonthKey(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    },

    convertDateKeyToMonthKey(dateKey) {
        // FIXED: Use the same normalization logic
        return this.normalizeMonthKey(dateKey);
    },

    formatShortDate(monthKey) {
        const dateParts = monthKey.split('-');
        const year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]);
        
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        const shortYear = year.toString().slice(-2);
        const monthName = monthNames[month - 1];
        
        return `${monthName} ${shortYear}`;
    }
};
