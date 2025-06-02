// src/commands/user/profile.js - STREAMLINED VERSION
import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { User } from '../../models/User.js';
import { Challenge } from '../../models/Challenge.js';
import { getTrophyEmoji, formatTrophyEmoji } from '../../config/trophyEmojis.js';
import { formatGachaEmoji } from '../../config/gachaEmojis.js';
import retroAPI from '../../services/retroAPI.js';
import gachaService from '../../services/gachaService.js';
import combinationService from '../../services/combinationService.js';
import { COLORS } from '../../utils/FeedUtils.js';

const POINTS = {
    MASTERY: 7,
    BEATEN: 4,
    PARTICIPATION: 1
};

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
                user = await User.findOne({ discordId: interaction.user.id });
                if (!user) {
                    return interaction.editReply('You are not registered. Please ask an admin to register you first.');
                }
                raUsername = user.raUsername;
            } else {
                user = await User.findOne({ 
                    raUsername: { $regex: new RegExp('^' + raUsername + '$', 'i') }
                });
                if (!user) {
                    return interaction.editReply('User not found. Please check the username or ask an admin to register this user.');
                }
            }

            const raUserInfo = await retroAPI.getUserInfo(raUsername);
            const pointsData = this.calculatePoints(user);
            const currentYear = new Date().getFullYear();
            const communityAwards = user.getCommunityAwardsForYear(currentYear);
            
            const embed = this.createProfileEmbed(user, raUserInfo, pointsData, communityAwards);
            const buttons = this.createButtons(user);
            
            return interaction.editReply({ embeds: [embed], components: [buttons] });

        } catch (error) {
            console.error('Error displaying profile:', error);
            return interaction.editReply('An error occurred while fetching the profile. Please try again.');
        }
    },
    
    calculatePoints(user) {
        let challengePoints = 0;
        let stats = { mastery: 0, beaten: 0, participation: 0, shadowBeaten: 0, shadowParticipation: 0 };
        
        // Monthly challenges
        for (const [, data] of user.monthlyChallenges.entries()) {
            if (data.progress === 3) {
                stats.mastery++;
                challengePoints += POINTS.MASTERY;
            } else if (data.progress === 2) {
                stats.beaten++;
                challengePoints += POINTS.BEATEN;
            } else if (data.progress === 1) {
                stats.participation++;
                challengePoints += POINTS.PARTICIPATION;
            }
        }

        // Shadow challenges
        for (const [, data] of user.shadowChallenges.entries()) {
            if (data.progress === 2) {
                stats.shadowBeaten++;
                challengePoints += POINTS.BEATEN;
            } else if (data.progress === 1) {
                stats.shadowParticipation++;
                challengePoints += POINTS.PARTICIPATION;
            }
        }

        const currentYear = new Date().getFullYear();
        const communityPoints = user.getCommunityPointsForYear(currentYear);

        return {
            totalPoints: challengePoints + communityPoints,
            challengePoints,
            communityPoints,
            stats
        };
    },
    
    createProfileEmbed(user, raUserInfo, pointsData, communityAwards) {
        const embed = new EmbedBuilder()
            .setTitle(`Profile: ${user.raUsername}`)
            .setURL(`https://retroachievements.org/user/${user.raUsername}`)
            .setColor('#0099ff')
            .setTimestamp();
            
        if (raUserInfo?.profileImageUrl) {
            embed.setThumbnail(raUserInfo.profileImageUrl);
        }
        
        // RA Site Info
        let rankInfo = 'Not ranked';
        if (raUserInfo?.rank) {
            rankInfo = `#${raUserInfo.rank}`;
            if (raUserInfo.totalRanked) {
                const percentage = (raUserInfo.rank / raUserInfo.totalRanked * 100).toFixed(2);
                rankInfo += ` (Top ${percentage}%)`;
            }
        }
        
        embed.addFields(
            {
                name: 'RetroAchievements',
                value: `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})\n**Rank:** ${rankInfo}`
            },
            {
                name: 'Community Stats',
                value: `**Total Points:** ${pointsData.totalPoints}\n` + 
                       `• Challenge Points: ${pointsData.challengePoints}\n` +
                       `• Community Points: ${pointsData.communityPoints}\n` +
                       `**GP Balance:** ${(user.gpBalance || 0).toLocaleString()} GP`
            },
            {
                name: 'Point Details',
                value: `✨ Mastery: ${pointsData.stats.mastery} (${pointsData.stats.mastery * POINTS.MASTERY} pts)\n` +
                       `⭐ Beaten: ${pointsData.stats.beaten} (${pointsData.stats.beaten * POINTS.BEATEN} pts)\n` +
                       `🏁 Participation: ${pointsData.stats.participation} (${pointsData.stats.participation * POINTS.PARTICIPATION} pts)\n` +
                       `👥 Shadow Beaten: ${pointsData.stats.shadowBeaten} (${pointsData.stats.shadowBeaten * POINTS.BEATEN} pts)\n` +
                       `👥 Shadow Participation: ${pointsData.stats.shadowParticipation} (${pointsData.stats.shadowParticipation * POINTS.PARTICIPATION} pts)`
            }
        );
        
        // Arena Stats
        if (user.arenaStats) {
            const arena = user.arenaStats;
            embed.addFields({
                name: 'Arena Stats',
                value: `**Challenges:** ${(arena.challengesCreated || 0) + (arena.challengesParticipated - arena.challengesCreated || 0)} (${arena.challengesWon || 0} wins)\n` +
                       `**Bets:** ${arena.betsPlaced || 0} (${arena.betsWon || 0} wins)`
            });
        }
        
        // Community Awards
        let awardsText = 'No awards yet';
        if (communityAwards?.length > 0) {
            awardsText = '';
            communityAwards.slice(0, 5).forEach(award => {
                const awardDate = new Date(award.awardedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric'
                });
                awardsText += `🏆 **${award.title}** (${award.points} pts) - ${awardDate}\n`;
            });
            
            if (communityAwards.length > 5) {
                awardsText += `\n...and ${communityAwards.length - 5} more awards`;
            }
        }
        
        embed.addFields({
            name: `Community Awards (${communityAwards?.length || 0})`,
            value: awardsText
        });
        
        embed.setFooter({ text: 'Use /yearlyboard to see the full leaderboard • Click buttons below to explore more!' });
        
        return embed;
    },

    createButtons(user) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`profile_trophy_case_${user.raUsername}`)
                .setLabel('🏆 Trophy Case')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`profile_collection_${user.raUsername}`)
                .setLabel('📦 Collection')
                .setStyle(ButtonStyle.Secondary)
        );
    },

    async handleButtonInteraction(interaction) {
        if (!interaction.customId.startsWith('profile_')) return;

        // Handle collection pagination
        if (interaction.customId.startsWith('profile_coll_')) {
            return this.handleCollectionPagination(interaction);
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const username = interaction.customId.includes('trophy_case_') 
                ? interaction.customId.replace('profile_trophy_case_', '')
                : interaction.customId.replace('profile_collection_', '');

            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp('^' + username + '$', 'i') }
            });

            if (!user) {
                return interaction.editReply({ content: '❌ User not found.', ephemeral: true });
            }

            if (interaction.customId.includes('trophy_case_')) {
                await this.showTrophyCase(interaction, user);
            } else {
                await this.showCollection(interaction, user, 0);
            }

        } catch (error) {
            console.error('Error handling profile button:', error);
            await interaction.editReply({ content: '❌ An error occurred while processing your request.', ephemeral: true });
        }
    },

    async showTrophyCase(interaction, user) {
        const challenges = await Challenge.find({}).sort({ date: 1 });
        const challengeTitleMap = {};
        
        for (const challenge of challenges) {
            const monthKey = this.getMonthKey(challenge.date);
            challengeTitleMap[monthKey] = {
                monthly: challenge.monthly_game_title,
                shadow: challenge.shadow_game_title
            };
        }

        const trophies = [];
        const seenTrophies = new Set();

        // Process monthly challenges
        const uniqueMonthly = this.deduplicateEntries(user.monthlyChallenges);
        for (const [userDateKey, data] of uniqueMonthly) {
            if (data.progress > 0) {
                const awardLevel = data.progress === 3 ? 'mastery' : data.progress === 2 ? 'beaten' : 'participation';
                const monthKey = this.normalizeMonthKey(userDateKey);
                const trophyId = `monthly_${monthKey}_${awardLevel}`;
                
                if (seenTrophies.has(trophyId)) continue;
                seenTrophies.add(trophyId);
                
                const [year, month] = monthKey.split('-');
                const trophyDate = new Date(parseInt(year), parseInt(month) - 1, 15);
                
                let gameTitle = data.gameTitle || challengeTitleMap[monthKey]?.monthly || `Monthly Challenge - ${this.formatShortDate(monthKey)}`;
                const emojiData = await getTrophyEmoji('monthly', monthKey, awardLevel);

                trophies.push({
                    gameTitle, awardLevel, challengeType: 'monthly',
                    emojiId: emojiData.emojiId, emojiName: emojiData.emojiName,
                    earnedAt: trophyDate
                });
            }
        }

        // Process shadow challenges
        const uniqueShadow = this.deduplicateEntries(user.shadowChallenges);
        for (const [userDateKey, data] of uniqueShadow) {
            if (data.progress > 0) {
                const awardLevel = data.progress === 2 ? 'beaten' : 'participation';
                const monthKey = this.normalizeMonthKey(userDateKey);
                const trophyId = `shadow_${monthKey}_${awardLevel}`;
                
                if (seenTrophies.has(trophyId)) continue;
                seenTrophies.add(trophyId);
                
                const [year, month] = monthKey.split('-');
                const trophyDate = new Date(parseInt(year), parseInt(month) - 1, 15);
                
                let gameTitle = data.gameTitle || challengeTitleMap[monthKey]?.shadow || `Shadow Challenge - ${this.formatShortDate(monthKey)}`;
                const emojiData = await getTrophyEmoji('shadow', monthKey, awardLevel);

                trophies.push({
                    gameTitle, awardLevel, challengeType: 'shadow',
                    emojiId: emojiData.emojiId, emojiName: emojiData.emojiName,
                    earnedAt: trophyDate
                });
            }
        }

        // Process community awards
        const currentYear = new Date().getFullYear();
        const communityAwards = user.getCommunityAwardsForYear(currentYear);
        
        for (const award of communityAwards) {
            const trophyId = `community_${award.title.replace(/\s+/g, '_').toLowerCase()}_${award.awardedAt.getTime()}`;
            if (seenTrophies.has(trophyId)) continue;
            seenTrophies.add(trophyId);

            const emojiData = await getTrophyEmoji('community', null, 'special');
            
            trophies.push({
                gameTitle: award.title, awardLevel: 'special', challengeType: 'community',
                emojiId: emojiData.emojiId, emojiName: emojiData.emojiName,
                earnedAt: award.awardedAt
            });
        }

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

        // Group trophies
        const grouped = {
            monthly: { mastery: [], beaten: [], participation: [] },
            shadow: { beaten: [], participation: [] },
            community: { special: [] }
        };

        trophies.forEach(trophy => {
            if (grouped[trophy.challengeType]?.[trophy.awardLevel]) {
                grouped[trophy.challengeType][trophy.awardLevel].push(trophy);
            }
        });

        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Trophy Case`)
            .setColor(COLORS.GOLD)
            .setDescription(`**Achievement Trophies:** ${trophies.length}`)
            .setTimestamp();

        // Add fields for each category
        for (const [challengeType, categories] of Object.entries(grouped)) {
            for (const [awardLevel, levelTrophies] of Object.entries(categories)) {
                if (levelTrophies.length === 0) continue;

                levelTrophies.sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));

                const emojiMap = { mastery: '✨', beaten: '⭐', participation: '🏁', special: '🎖️' };
                const emoji = emojiMap[awardLevel] || '🏆';
                const typeName = challengeType.charAt(0).toUpperCase() + challengeType.slice(1);
                const levelName = challengeType === 'community' ? 'Awards' : awardLevel.charAt(0).toUpperCase() + awardLevel.slice(1);
                
                let fieldValue = '';
                levelTrophies.slice(0, 10).forEach(trophy => {
                    const trophyEmoji = formatTrophyEmoji(trophy.emojiId, trophy.emojiName);
                    fieldValue += `${trophyEmoji} **${trophy.gameTitle}**\n`;
                });

                if (levelTrophies.length > 10) {
                    fieldValue += `*...and ${levelTrophies.length - 10} more*\n`;
                }

                embed.addFields({ 
                    name: `${emoji} ${typeName} ${levelName} (${levelTrophies.length})`, 
                    value: fieldValue, 
                    inline: true 
                });
            }
        }

        embed.setFooter({ text: 'Achievement trophies are earned by completing challenges and awards' });
        await interaction.editReply({ embeds: [embed], ephemeral: true });
    },

    async showCollection(interaction, user, page = 0) {
        if (!user.gachaCollection?.length) {
            return interaction.editReply({
                content: '📦 Your collection is empty! Visit the gacha channel to start collecting items.\n\n' +
                         '💡 **Tip:** All item combinations happen automatically when you get the right ingredients!',
                ephemeral: true
            });
        }

        const ITEMS_PER_PAGE = 50;
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        
        // Sort items
        const allItems = [...user.gachaCollection].sort((a, b) => {
            const aIndex = rarityOrder.indexOf(a.rarity);
            const bIndex = rarityOrder.indexOf(b.rarity);
            if (aIndex !== bIndex) return aIndex - bIndex;
            return a.itemName.localeCompare(b.itemName);
        });

        // Pagination
        const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
        const startIndex = page * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, allItems.length);
        const pageItems = allItems.slice(startIndex, endIndex);

        // Group by rarity and create emoji grid
        const rarityGroups = {};
        pageItems.forEach(item => {
            if (!rarityGroups[item.rarity]) rarityGroups[item.rarity] = [];
            rarityGroups[item.rarity].push(item);
        });

        let description = '';
        for (const rarity of rarityOrder) {
            const items = rarityGroups[rarity];
            if (!items?.length) continue;

            const rarityEmoji = gachaService.getRarityEmoji(rarity);
            const rarityName = gachaService.getRarityDisplayName(rarity);
            description += `\n${rarityEmoji} **${rarityName}** (${items.length})\n`;
            
            // Create emoji grid (5 per row)
            let currentRow = '';
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const emoji = formatGachaEmoji(item.emojiId, item.emojiName);
                const quantity = (item.quantity || 1) > 1 ? `⁽${item.quantity}⁾` : '';
                currentRow += `${emoji}${quantity} `;
                
                if ((i + 1) % 5 === 0 || i === items.length - 1) {
                    description += currentRow.trim() + '\n';
                    currentRow = '';
                }
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Collection`)
            .setColor(COLORS.INFO)
            .setDescription(description.trim())
            .setTimestamp();

        // Footer
        const combinationStats = combinationService.getCombinationStats(user);
        let footerText = `${allItems.length} total items • ${combinationStats.totalCombined} from auto-combinations`;
        if (totalPages > 1) {
            footerText += ` • Page ${page + 1}/${totalPages} • ${startIndex + 1}-${endIndex} of ${allItems.length}`;
        }
        footerText += ` • ⁽ⁿ⁾ = quantity`;
        embed.setFooter({ text: footerText });

        // Create pagination buttons if needed
        const components = [];
        if (totalPages > 1) {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`profile_coll_prev_${user.raUsername}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('page_indicator')
                    .setLabel(`${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`profile_coll_next_${user.raUsername}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages - 1)
            ));
        }

        await interaction.editReply({ embeds: [embed], components });
    },

    async handleCollectionPagination(interaction) {
        try {
            await interaction.deferUpdate();

            const parts = interaction.customId.split('_');
            const action = parts[2];
            const username = parts[3];

            const user = await User.findOne({ 
                raUsername: { $regex: new RegExp(`^${username}$`, 'i') }
            });

            if (!user) {
                return interaction.followUp({ content: '❌ User not found.', ephemeral: true });
            }

            const currentPageMatch = interaction.message.embeds[0].footer?.text?.match(/Page (\d+)/);
            const currentPage = currentPageMatch ? parseInt(currentPageMatch[1]) - 1 : 0;

            const newPage = action === 'prev' ? Math.max(0, currentPage - 1) : currentPage + 1;
            await this.showCollection(interaction, user, newPage);

        } catch (error) {
            console.error('Error handling collection pagination:', error);
            await interaction.editReply?.({ content: '❌ An error occurred.' }) ||
                  interaction.followUp?.({ content: '❌ An error occurred.', ephemeral: true });
        }
    },

    // Helper methods
    deduplicateEntries(challengeMap) {
        if (!challengeMap?.size) return [];

        const entries = Array.from(challengeMap.entries());
        const normalized = new Map();

        for (const [originalKey, data] of entries) {
            const normalizedKey = this.normalizeMonthKey(originalKey);
            
            if (normalized.has(normalizedKey)) {
                const existing = normalized.get(normalizedKey);
                if (data.progress > existing.data.progress || 
                    (data.progress === existing.data.progress && (data.achievements || 0) > (existing.data.achievements || 0))) {
                    normalized.set(normalizedKey, { key: normalizedKey, data });
                }
            } else {
                normalized.set(normalizedKey, { key: normalizedKey, data });
            }
        }

        return Array.from(normalized.values()).map(({ key, data }) => [key, data]);
    },

    normalizeMonthKey(dateKey) {
        if (!dateKey) return dateKey;
        
        const keyStr = String(dateKey).trim();
        
        if (/^\d{4}-\d{2}$/.test(keyStr)) return keyStr;
        if (/^\d{4}-\d{2}-\d{2}$/.test(keyStr)) return keyStr.substring(0, 7);
        
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
        
        return keyStr;
    },

    getMonthKey(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    },

    formatShortDate(monthKey) {
        const [year, month] = monthKey.split('-');
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${monthNames[parseInt(month) - 1]} ${year.slice(-2)}`;
    }
};
