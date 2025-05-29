// src/commands/user/profile.js - COMPLETE FIXED VERSION
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js'; // ADDED FOR TROPHY CASE FIX
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

  async handleTrophyCaseButton(interaction, user) {
    console.log(`=== TROPHY CASE DEBUG FOR ${user.raUsername} ===`);
    
    // STEP 1: Get Challenge documents for title lookups
    console.log('STEP 1: Fetching Challenge documents...');
    const challenges = await Challenge.find({}).sort({ date: 1 });
    console.log(`Found ${challenges.length} Challenge documents`);
    
    const challengeTitleMap = {};
    
    // Build a lookup map for game titles
    for (const challenge of challenges) {
        const monthKey = this.getMonthKey(challenge.date);
        challengeTitleMap[monthKey] = {
            monthly: challenge.monthly_game_title,
            shadow: challenge.shadow_game_title
        };
        console.log(`Challenge ${monthKey}:`, {
            monthlyTitle: challenge.monthly_game_title || 'NULL',
            shadowTitle: challenge.shadow_game_title || 'NULL',
            monthlyId: challenge.monthly_challange_gameid,
            shadowId: challenge.shadow_challange_gameid
        });
    }

    console.log('Final challengeTitleMap:', challengeTitleMap);

    // STEP 2: Check user challenge data
    console.log('\nSTEP 2: Checking user challenge data...');
    console.log(`User has ${user.monthlyChallenges.size} monthly challenges`);
    console.log(`User has ${user.shadowChallenges.size} shadow challenges`);

    // Debug user monthly challenges
    for (const [monthKey, data] of user.monthlyChallenges.entries()) {
        console.log(`User monthly ${monthKey}:`, {
            progress: data.progress,
            userTitle: data.gameTitle || 'NULL',
            challengeTitle: challengeTitleMap[monthKey]?.monthly || 'NULL',
            achievements: data.achievements,
            totalAchievements: data.totalAchievements
        });
    }

    // Debug user shadow challenges
    for (const [monthKey, data] of user.shadowChallenges.entries()) {
        console.log(`User shadow ${monthKey}:`, {
            progress: data.progress,
            userTitle: data.gameTitle || 'NULL',
            challengeTitle: challengeTitleMap[monthKey]?.shadow || 'NULL',
            achievements: data.achievements,
            totalAchievements: data.totalAchievements
        });
    }

    // STEP 3: Generate trophies with extensive debugging
    console.log('\nSTEP 3: Generating trophies...');
    const trophies = [];

    // Process monthly challenges
    for (const [monthKey, data] of user.monthlyChallenges.entries()) {
        if (data.progress > 0) {
            console.log(`\nProcessing monthly trophy for ${monthKey}:`);
            
            let awardLevel = 'participation';
            if (data.progress === 3) awardLevel = 'mastery';
            else if (data.progress === 2) awardLevel = 'beaten';

            const dateParts = monthKey.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1;
            const trophyDate = new Date(year, month, 15);

            // Use Challenge document title as fallback
            let gameTitle = data.gameTitle; // User data first
            console.log(`  - User data title: "${gameTitle || 'NULL'}"`);
            
            if (!gameTitle && challengeTitleMap[monthKey]?.monthly) {
                gameTitle = challengeTitleMap[monthKey].monthly; // Challenge document fallback
                console.log(`  - Using Challenge document title: "${gameTitle}"`);
            } else if (!gameTitle) {
                console.log(`  - No Challenge document title found for ${monthKey}`);
            }
            
            if (!gameTitle) {
                gameTitle = `Monthly Challenge - ${this.formatShortDate(monthKey)}`; // Final fallback
                console.log(`  - Using final fallback: "${gameTitle}"`);
            }

            console.log(`  - FINAL TITLE: "${gameTitle}"`);

            trophies.push({
                gameId: `monthly_${monthKey}`,
                gameTitle: gameTitle,
                consoleName: 'Monthly Challenge',
                awardLevel: awardLevel,
                challengeType: 'monthly',
                emojiId: null,
                emojiName: this.getTrophyEmoji(awardLevel),
                earnedAt: trophyDate,
                monthKey: monthKey
            });
        }
    }

    // Process shadow challenges
    for (const [monthKey, data] of user.shadowChallenges.entries()) {
        if (data.progress > 0) {
            console.log(`\nProcessing shadow trophy for ${monthKey}:`);
            
            let awardLevel = 'participation';
            if (data.progress === 2) awardLevel = 'beaten';

            const dateParts = monthKey.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1;
            const trophyDate = new Date(year, month, 15);

            // Use Challenge document title as fallback
            let gameTitle = data.gameTitle; // User data first
            console.log(`  - User data title: "${gameTitle || 'NULL'}"`);
            
            if (!gameTitle && challengeTitleMap[monthKey]?.shadow) {
                gameTitle = challengeTitleMap[monthKey].shadow; // Challenge document fallback
                console.log(`  - Using Challenge document shadow title: "${gameTitle}"`);
            } else if (!gameTitle) {
                console.log(`  - No Challenge document shadow title found for ${monthKey}`);
            }
            
            if (!gameTitle) {
                gameTitle = `Shadow Challenge - ${this.formatShortDate(monthKey)}`; // Final fallback
                console.log(`  - Using final fallback: "${gameTitle}"`);
            }

            console.log(`  - FINAL TITLE: "${gameTitle}"`);

            trophies.push({
                gameId: `shadow_${monthKey}`,
                gameTitle: gameTitle,
                consoleName: 'Shadow Challenge',
                awardLevel: awardLevel,
                challengeType: 'shadow',
                emojiId: null,
                emojiName: this.getTrophyEmoji(awardLevel),
                earnedAt: trophyDate,
                monthKey: monthKey
            });
        }
    }

    console.log(`\nGenerated ${trophies.length} trophies total`);
    console.log('=== END TROPHY CASE DEBUG ===\n');

    // Rest of the method unchanged - just show the results
    if (trophies.length === 0) {
        return interaction.editReply({
            content: '🏆 This trophy case is empty! Check console for debug info.',
            ephemeral: true
        });
    }

    // Group and display trophies (simplified for debugging)
    const embed = new EmbedBuilder()
        .setTitle(`🏆 ${user.raUsername}'s Trophy Case (DEBUG)`)
        .setColor('#FFD700')
        .setDescription(`**Trophies Generated:** ${trophies.length}\n\nCheck console logs for detailed debug info.`)
        .setTimestamp();

    // Show first few trophies for verification
    let debugText = '';
    trophies.slice(0, 5).forEach(trophy => {
        debugText += `${trophy.challengeType} ${trophy.monthKey}: **${trophy.gameTitle}**\n`;
    });
    
    if (debugText) {
        embed.addFields({
            name: 'Sample Trophies',
            value: debugText
        });
    }

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

    // Helper method to get default trophy emoji based on award level
    getTrophyEmoji(awardLevel) {
        const emojiMap = {
            mastery: '✨',
            beaten: '⭐', 
            participation: '🏁'
        };
        return emojiMap[awardLevel] || '🏆';
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
    }
};
