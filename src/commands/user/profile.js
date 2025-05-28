// src/commands/user/profile.js
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { User } from '../../models/User.js';
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
                    raUsername: { $regex: new RegExp(`^${raUsername}$`, 'i') }
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
        const buttons = [];

        // Trophy Case Button - always show
        const trophyButton = new ButtonBuilder()
            .setCustomId(`profile_trophy_case_${user.raUsername}`)
            .setLabel('🏆 Trophy Case')
            .setStyle(ButtonStyle.Primary);
        
        buttons.push(trophyButton);

        // Collection Button - always show (will display empty message if no items)
        const collectionButton = new ButtonBuilder()
            .setCustomId(`profile_collection_${user.raUsername}`)
            .setLabel('📦 Collection')
            .setStyle(ButtonStyle.Secondary);
        
        buttons.push(collectionButton);

        // Return ActionRowBuilder with buttons, or null if no buttons
        if (buttons.length === 0) return null;
        return new ActionRowBuilder().addComponents(buttons);
    },

    // Handle button interactions
    async handleButtonInteraction(interaction) {
        if (!interaction.customId.startsWith('profile_')) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            // Parse the customId properly
            let action, username;
            
            if (interaction.customId.includes('trophy_case')) {
                action = 'trophy';
                username = interaction.customId.replace('profile_trophy_case_', '');
            } else if (interaction.customId.includes('collection')) {
                action = 'collection';
                username = interaction.customId.replace('profile_collection_', '');
            } else {
                console.error('Unknown profile button action:', interaction.customId);
                return;
            }

            // Find the user
            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user) {
                return interaction.editReply({
                    content: '❌ User not found.',
                    ephemeral: true
                });
            }

            if (action === 'trophy') {
                // Handle trophy case
                await this.handleTrophyCaseButton(interaction, user);
            } else if (action === 'collection') {
                // Handle collection
                await this.handleCollectionButton(interaction, user);
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
        const trophies = user.trophyCase || [];
        
        if (trophies.length === 0) {
            return interaction.editReply({
                content: '🏆 This trophy case is empty! \n\n' +
                         '**How to earn trophies:**\n' +
                         '• Complete monthly challenges (mastery, beaten, or participation)\n' +
                         '• Complete shadow challenges when they\'re revealed\n' +
                         '• Master or beat any RetroAchievements game\n\n' +
                         '💡 **Tip:** If you have existing achievements, ask an admin to run `/gacha-admin populate-trophies` to retroactively award trophies!',
                ephemeral: true
            });
        }

        // Group trophies by type and award level
        const groupedTrophies = {
            monthly: { mastery: [], beaten: [], participation: [] },
            shadow: { mastery: [], beaten: [], participation: [] }
        };

        trophies.forEach(trophy => {
            if (groupedTrophies[trophy.challengeType] && groupedTrophies[trophy.challengeType][trophy.awardLevel]) {
                groupedTrophies[trophy.challengeType][trophy.awardLevel].push(trophy);
            }
        });

        const embed = new EmbedBuilder()
            .setTitle(`🏆 ${user.raUsername}'s Trophy Case`)
            .setColor(COLORS.GOLD)
            .setDescription(`**Total Trophies:** ${trophies.length}`)
            .setTimestamp();

        // Add fields for each category
        ['monthly', 'shadow'].forEach(challengeType => {
            ['mastery', 'beaten', 'participation'].forEach(awardLevel => {
                const categoryTrophies = groupedTrophies[challengeType][awardLevel];
                if (categoryTrophies.length > 0) {
                    const emoji = awardLevel === 'mastery' ? '✨' : (awardLevel === 'beaten' ? '⭐' : '🏁');
                    const typeName = challengeType.charAt(0).toUpperCase() + challengeType.slice(1);
                    const levelName = awardLevel.charAt(0).toUpperCase() + awardLevel.slice(1);
                    const fieldName = `${emoji} ${typeName} ${levelName} (${categoryTrophies.length})`;
                    
                    let fieldValue = '';
                    categoryTrophies.slice(0, 10).forEach(trophy => {
                        const date = new Date(trophy.earnedAt).toLocaleDateString('en-US', { 
                            month: 'short', 
                            year: 'numeric' 
                        });
                        const trophyEmoji = trophy.emojiId ? 
                            `<:${trophy.emojiName}:${trophy.emojiId}>` : 
                            (trophy.emojiName || '🏆');
                        fieldValue += `${trophyEmoji} **${trophy.gameTitle}** - ${date}\n`;
                    });

                    if (categoryTrophies.length > 10) {
                        fieldValue += `*...and ${categoryTrophies.length - 10} more*\n`;
                    }

                    embed.addFields({ name: fieldName, value: fieldValue });
                }
            });
        });

        embed.setFooter({ 
            text: 'Trophies are earned by completing monthly and shadow challenges' 
        });

        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
    },

    async handleCollectionButton(interaction, user) {
        const summary = gachaService.getUserCollectionSummary(user);
        
        if (summary.totalItems === 0) {
            return interaction.editReply({
                content: '📦 This collection is empty! Visit the gacha machine to start collecting.\n\n' +
                         '💡 **Tip:** The gacha machine should be pinned in its designated channel. Use single pulls (10 GP) or multi pulls (100 GP) to collect items!',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`📦 ${user.raUsername}'s Collection Summary`)
            .setColor(COLORS.INFO)
            .setDescription(
                `**Total Items:** ${summary.totalItems} (${summary.uniqueItems} unique)\n\n` +
                '**By Rarity:**\n' +
                `🟡 Legendary: ${summary.rarityCount.legendary || 0}\n` +
                `🟣 Epic: ${summary.rarityCount.epic || 0}\n` +
                `🔵 Rare: ${summary.rarityCount.rare || 0}\n` +
                `🟢 Uncommon: ${summary.rarityCount.uncommon || 0}\n` +
                `⚪ Common: ${summary.rarityCount.common || 0}`
            )
            .setFooter({ text: 'Use /collection for detailed view with filters' })
            .setTimestamp();

        // Add recent items
        if (summary.recentItems.length > 0) {
            let recentText = '';
            summary.recentItems.slice(0, 8).forEach(item => {
                const emoji = gachaService.formatEmoji(item.emojiId, item.emojiName);
                const rarityEmoji = gachaService.getRarityEmoji(item.rarity);
                const stackInfo = (item.quantity || 1) > 1 ? ` x${item.quantity}` : '';
                recentText += `${rarityEmoji} ${emoji} **${item.itemName}**${stackInfo}\n`;
            });
            
            embed.addFields({ 
                name: 'Recent Items', 
                value: recentText
            });
        }

        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });
    }
};
