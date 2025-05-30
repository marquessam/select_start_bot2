// src/commands/user/profile.js - COMPLETE FIXED VERSION WITH TROPHY EMOJIS
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js'; // ADDED FOR TROPHY CASE FIX
import { getTrophyEmoji, formatTrophyEmoji } from '../../config/trophyEmojis.js'; // NEW IMPORT
import retroAPI from '../../services/retroAPI.js';
import gachaService from '../../services/gachaService.js';
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
     * UPDATED: Trophy case with custom emoji support and Challenge document fallback
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

        // STEP 2: Generate trophies with Challenge document fallback AND custom emojis
        const trophies = [];

        // Process monthly challenges
        for (const [userDateKey, data] of user.monthlyChallenges.entries()) {
            if (data.progress > 0) {
                let awardLevel = 'participation';
                if (data.progress === 3) awardLevel = 'mastery';
                else if (data.progress === 2) awardLevel = 'beaten';

                // Convert user date key (YYYY-MM-DD) to month key (YYYY-MM)
                const monthKey = this.convertDateKeyToMonthKey(userDateKey);
                
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

                // UPDATED: Get custom emoji for this trophy
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

        // Process shadow challenges
        for (const [userDateKey, data] of user.shadowChallenges.entries()) {
            if (data.progress > 0) {
                let awardLevel = 'participation';
                if (data.progress === 2) awardLevel = 'beaten';

                // Convert user date key (YYYY-MM-DD) to month key (YYYY-MM)
                const monthKey = this.convertDateKeyToMonthKey(userDateKey);

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

                // UPDATED: Get custom emoji for this trophy
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

        // Process community awards
        const currentYear = new Date().getFullYear();
        const communityAwards = user.getCommunityAwardsForYear(currentYear);
        
        for (const award of communityAwards) {
            // UPDATED: Use custom emoji for community awards
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

        // Group and display trophies by challenge type (not award level)
        const groupedTrophies = {
            monthly: [],
            shadow: [],
            community: []
        };

        trophies.forEach(trophy => {
            if (groupedTrophies[trophy.challengeType]) {
                groupedTrophies[trophy.challengeType].push(trophy);
            }
        });

        const embed = new EmbedBuilder()
            .setTitle(`🏆 ${user.raUsername}'s Trophy Case`)
            .setColor(COLORS.GOLD)
            .setDescription(`**Achievement Trophies:** ${trophies.length}`)
            .setTimestamp();

        // Add fields for each challenge type in columns
        const challengeTypes = ['monthly', 'shadow', 'community'];
        
        challengeTypes.forEach(challengeType => {
            const challengeTrophies = groupedTrophies[challengeType];
            if (!challengeTrophies || challengeTrophies.length === 0) return;

            // Sort by award level (mastery first, then beaten, then participation)
            const sortOrder = { 'mastery': 1, 'beaten': 2, 'participation': 3, 'special': 4 };
            challengeTrophies.sort((a, b) => {
                const orderA = sortOrder[a.awardLevel] || 5;
                const orderB = sortOrder[b.awardLevel] || 5;
                if (orderA !== orderB) return orderA - orderB;
                // Within same award level, sort by date (most recent first)
                return new Date(b.earnedAt) - new Date(a.earnedAt);
            });

            // Create field name
            let typeName = challengeType.charAt(0).toUpperCase() + challengeType.slice(1);
            if (challengeType === 'community') typeName = 'Community Awards';
            else typeName += ' Challenges';

            const fieldName = `${this.getChallengeTypeEmoji(challengeType)} ${typeName} (${challengeTrophies.length})`;
            
            let fieldValue = '';
            challengeTrophies.slice(0, 12).forEach(trophy => {
                // UPDATED: Use the custom emoji with proper formatting, no date
                const trophyEmoji = formatTrophyEmoji(trophy.emojiId, trophy.emojiName);
                fieldValue += `${trophyEmoji} **${trophy.gameTitle}**\n`;
            });

            if (challengeTrophies.length > 12) {
                fieldValue += `*...and ${challengeTrophies.length - 12} more*\n`;
            }

            embed.addFields({ name: fieldName, value: fieldValue, inline: true });
        });

        embed.setFooter({ 
            text: 'Achievement trophies are earned by completing challenges and awards' 
        });

        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
    },

    async handleCollectionButton(interaction, user) {
        const collection = user.gachaCollection || [];
        
        if (collection.length === 0) {
            return interaction.editReply({
                content: '📦 Your collection is empty! \n\n' +
                         '**How to start collecting:**\n' +
                         '• Visit the gacha channel and use the machine\n' +
                         '• Single Pull: 10 GP for 1 item\n' +
                         '• Multi Pull: 100 GP for 11 items (better value!)\n' +
                         '• Earn GP through monthly challenges and community participation',
                ephemeral: true
            });
        }

        // Group items by rarity
        const rarityGroups = {
            legendary: [],
            epic: [],
            rare: [],
            uncommon: [],
            common: []
        };

        collection.forEach(item => {
            if (rarityGroups[item.rarity]) {
                rarityGroups[item.rarity].push(item);
            }
        });

        // Calculate totals
        const totalItems = collection.reduce((sum, item) => sum + (item.quantity || 1), 0);
        const uniqueItems = collection.length;

        const embed = new EmbedBuilder()
            .setTitle(`📦 ${user.raUsername}'s Collection`)
            .setColor(COLORS.INFO)
            .setDescription(`**Total Items:** ${totalItems} (${uniqueItems} unique)`)
            .setTimestamp();

        // Add rarity breakdown
        let rarityText = '';
        Object.entries(rarityGroups).forEach(([rarity, items]) => {
            if (items.length > 0) {
                const rarityEmoji = this.getRarityEmoji(rarity);
                const count = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
                rarityText += `${rarityEmoji} ${rarity}: ${count}\n`;
            }
        });

        if (rarityText) {
            embed.addFields({ name: 'By Rarity', value: rarityText, inline: true });
        }

        // Show recent items (top 10)
        const recentItems = [...collection]
            .sort((a, b) => new Date(b.obtainedAt) - new Date(a.obtainedAt))
            .slice(0, 10);

        if (recentItems.length > 0) {
            let recentText = '';
            recentItems.forEach(item => {
                const emoji = this.formatGachaEmoji(item.emojiId, item.emojiName);
                const rarityEmoji = this.getRarityEmoji(item.rarity);
                const quantity = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
                const date = new Date(item.obtainedAt).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                });
                recentText += `${rarityEmoji} ${emoji} **${item.itemName}**${quantity} - ${date}\n`;
            });

            embed.addFields({ name: 'Recent Items', value: recentText, inline: false });
        }

        embed.setFooter({ 
            text: 'Use /collection for detailed view with filters and pagination' 
        });

        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
    },

    // Helper method to get month key from date
    getMonthKey(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    },

    // Helper method: Convert date key to month key
    convertDateKeyToMonthKey(dateKey) {
        // Convert "2025-04-01" to "2025-04"
        // or if already in month format "2025-04", return as-is
        const parts = dateKey.split('-');
        if (parts.length >= 2) {
            return `${parts[0]}-${parts[1]}`;
        }
        return dateKey; // fallback
    },

    // Helper method to format short date for fallback titles
    formatShortDate(monthKey) {
        const dateParts = monthKey.split('-');
        const year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]);
        
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        const shortYear = year.toString().slice(-2);
        const monthName = monthNames[month - 1];
        
        return `${monthName} ${shortYear}`;
    },

    // Helper method to format gacha emoji
    formatGachaEmoji(emojiId, emojiName) {
        if (emojiId) {
            return `<:${emojiName}:${emojiId}>`;
        }
        return emojiName || '🎁';
    },

    // Helper method to get rarity emoji
    getRarityEmoji(rarity) {
        const rarityEmojis = {
            legendary: '🟡',
            epic: '🟣',
            rare: '🔵',
            uncommon: '🟢',
            common: '⚪'
        };
        return rarityEmojis[rarity] || '⚪';
    },

    // Helper method to get challenge type emoji
    getChallengeTypeEmoji(challengeType) {
        const typeEmojis = {
            monthly: '🎯',
            shadow: '👥', 
            community: '🏅'
        };
        return typeEmojis[challengeType] || '🏆';
    }
};
