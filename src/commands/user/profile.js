// src/commands/user/profile.js - STREAMLINED VERSION following DRY principles
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
            const user = await this.resolveUser(interaction);
            if (!user) {
                return interaction.editReply(
                    interaction.options.getString('username') 
                        ? 'User not found. Please check the username or ask an admin to register this user.'
                        : 'You are not registered. Please ask an admin to register you first.'
                );
            }

            const [raUserInfo, pointsData, communityAwards] = await Promise.all([
                retroAPI.getUserInfo(user.raUsername),
                this.calculatePoints(user),
                Promise.resolve(user.getCommunityAwardsForYear(new Date().getFullYear()))
            ]);
            
            const embed = this.createProfileEmbed(user, raUserInfo, pointsData, communityAwards);
            const buttons = this.createButtons(user);
            
            return interaction.editReply({ embeds: [embed], components: [buttons] });

        } catch (error) {
            console.error('Error displaying profile:', error);
            return interaction.editReply('An error occurred while fetching the profile. Please try again.');
        }
    },

    async resolveUser(interaction) {
        const username = interaction.options.getString('username');
        
        if (!username) {
            return await User.findOne({ discordId: interaction.user.id });
        }
        
        return await User.findOne({ 
            raUsername: { $regex: new RegExp('^' + username + '$', 'i') }
        });
    },

    // Normalize and deduplicate month data to prevent double-counting
    normalizeMonthData(monthMap) {
        if (!monthMap || monthMap.size === 0) return new Map();
        
        const deduplicated = new Map();
        
        for (const [monthKey, data] of monthMap.entries()) {
            const normalizedKey = this.normalizeMonthKey(monthKey);
            if (!normalizedKey) continue;
            
            const existing = deduplicated.get(normalizedKey);
            if (!existing || (data.progress || 0) > (existing.progress || 0)) {
                deduplicated.set(normalizedKey, data);
            }
        }
        
        return deduplicated;
    },

    normalizeMonthKey(monthKey) {
        if (!monthKey) return null;
        
        const parts = monthKey.split('-');
        if (parts.length >= 2) {
            const year = parts[0];
            const month = parts[1].padStart(2, '0');
            return `${year}-${month}`;
        }
        
        return monthKey;
    },

    calculatePoints(user) {
        const stats = { mastery: 0, beaten: 0, participation: 0, shadowBeaten: 0, shadowParticipation: 0 };
        let challengePoints = 0;
        
        // Process monthly challenges
        challengePoints += this.processProgressMap(
            this.normalizeMonthData(user.monthlyChallenges), 
            stats, 
            'monthly'
        );
        
        // Process shadow challenges  
        challengePoints += this.processProgressMap(
            this.normalizeMonthData(user.shadowChallenges), 
            stats, 
            'shadow'
        );

        const communityPoints = user.getCommunityPointsForYear(new Date().getFullYear());

        return {
            totalPoints: challengePoints + communityPoints,
            challengePoints,
            communityPoints,
            stats
        };
    },

    processProgressMap(progressMap, stats, type) {
        let points = 0;
        
        for (const [, data] of progressMap.entries()) {
            const progress = data.progress || 0;
            
            if (type === 'monthly') {
                if (progress === 3) {
                    stats.mastery++;
                    points += POINTS.MASTERY;
                } else if (progress === 2) {
                    stats.beaten++;
                    points += POINTS.BEATEN;
                } else if (progress === 1) {
                    stats.participation++;
                    points += POINTS.PARTICIPATION;
                }
            } else if (type === 'shadow') {
                if (progress === 2) {
                    stats.shadowBeaten++;
                    points += POINTS.BEATEN;
                } else if (progress === 1) {
                    stats.shadowParticipation++;
                    points += POINTS.PARTICIPATION;
                }
            }
        }
        
        return points;
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
        
        embed.addFields(
            this.createRAInfoField(user, raUserInfo),
            this.createStatsField(pointsData, user),
            this.createPointDetailsField(pointsData),
            this.createArenaStatsField(user),
            this.createAwardsField(communityAwards)
        );
        
        embed.setFooter({ text: 'Use /yearlyboard to see the full leaderboard • Click buttons below to explore more!' });
        
        return embed;
    },

    createRAInfoField(user, raUserInfo) {
        let rankInfo = 'Not ranked';
        if (raUserInfo?.rank) {
            rankInfo = `#${raUserInfo.rank}`;
            if (raUserInfo.totalRanked) {
                const percentage = (raUserInfo.rank / raUserInfo.totalRanked * 100).toFixed(2);
                rankInfo += ` (Top ${percentage}%)`;
            }
        }
        
        return {
            name: 'RetroAchievements',
            value: `[${user.raUsername}](https://retroachievements.org/user/${user.raUsername})\n**Rank:** ${rankInfo}`
        };
    },

    createStatsField(pointsData, user) {
        return {
            name: 'Community Stats',
            value: `**Total Points:** ${pointsData.totalPoints}\n` + 
                   `• Challenge Points: ${pointsData.challengePoints}\n` +
                   `• Community Points: ${pointsData.communityPoints}\n` +
                   `**GP Balance:** ${(user.gpBalance || 0).toLocaleString()} GP`
        };
    },

    createPointDetailsField(pointsData) {
        const { stats } = pointsData;
        return {
            name: 'Point Details',
            value: `✨ Mastery: ${stats.mastery} (${stats.mastery * POINTS.MASTERY} pts)\n` +
                   `⭐ Beaten: ${stats.beaten} (${stats.beaten * POINTS.BEATEN} pts)\n` +
                   `🏁 Participation: ${stats.participation} (${stats.participation * POINTS.PARTICIPATION} pts)\n` +
                   `👥 Shadow Beaten: ${stats.shadowBeaten} (${stats.shadowBeaten * POINTS.BEATEN} pts)\n` +
                   `👥 Shadow Participation: ${stats.shadowParticipation} (${stats.shadowParticipation * POINTS.PARTICIPATION} pts)`
        };
    },

    createArenaStatsField(user) {
        if (!user.arenaStats) return null;
        
        const arena = user.arenaStats;
        return {
            name: 'Arena Stats',
            value: `**Challenges:** ${(arena.challengesCreated || 0) + (arena.challengesParticipated - arena.challengesCreated || 0)} (${arena.challengesWon || 0} wins)\n` +
                   `**Bets:** ${arena.betsPlaced || 0} (${arena.betsWon || 0} wins)`
        };
    },

    createAwardsField(communityAwards) {
        let awardsText = 'No awards yet';
        
        if (communityAwards?.length > 0) {
            awardsText = communityAwards.slice(0, 5).map(award => {
                const awardDate = new Date(award.awardedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric'
                });
                return `🏆 **${award.title}** (${award.points} pts) - ${awardDate}`;
            }).join('\n');
            
            if (communityAwards.length > 5) {
                awardsText += `\n\n...and ${communityAwards.length - 5} more awards`;
            }
        }
        
        return {
            name: `Community Awards (${communityAwards?.length || 0})`,
            value: awardsText
        };
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

        if (interaction.customId.startsWith('profile_coll_')) {
            return this.handleCollectionPagination(interaction);
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const username = this.extractUsernameFromCustomId(interaction.customId);
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

    extractUsernameFromCustomId(customId) {
        return customId.includes('trophy_case_') 
            ? customId.replace('profile_trophy_case_', '')
            : customId.replace('profile_collection_', '');
    },

    async showTrophyCase(interaction, user) {
        const challengeTitleMap = await this.buildChallengeTitleMap();
        const trophies = await this.collectAllTrophies(user, challengeTitleMap);

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

        const embed = this.createTrophyCaseEmbed(user, trophies);
        await interaction.editReply({ embeds: [embed], ephemeral: true });
    },

    async buildChallengeTitleMap() {
        const challenges = await Challenge.find({}).sort({ date: 1 });
        const challengeTitleMap = {};
        
        for (const challenge of challenges) {
            const monthKey = this.getMonthKey(challenge.date);
            challengeTitleMap[monthKey] = {
                monthly: challenge.monthly_game_title,
                shadow: challenge.shadow_game_title
            };
        }
        
        return challengeTitleMap;
    },

    async collectAllTrophies(user, challengeTitleMap) {
        const trophies = [];
        const seenTrophies = new Set();

        // Collect challenge trophies
        await this.collectChallengeTrophies(
            this.normalizeMonthData(user.monthlyChallenges), 
            'monthly', 
            challengeTitleMap, 
            trophies, 
            seenTrophies
        );
        
        await this.collectChallengeTrophies(
            this.normalizeMonthData(user.shadowChallenges), 
            'shadow', 
            challengeTitleMap, 
            trophies, 
            seenTrophies
        );

        // Collect community awards
        const communityAwards = user.getCommunityAwardsForYear(new Date().getFullYear());
        for (const award of communityAwards) {
            const trophyId = `community_${award.title.replace(/\s+/g, '_').toLowerCase()}_${award.awardedAt.getTime()}`;
            if (seenTrophies.has(trophyId)) continue;
            seenTrophies.add(trophyId);

            const emojiData = await getTrophyEmoji('community', null, 'special');
            
            trophies.push({
                gameTitle: award.title, 
                awardLevel: 'special', 
                challengeType: 'community',
                emojiId: emojiData.emojiId, 
                emojiName: emojiData.emojiName,
                earnedAt: award.awardedAt
            });
        }

        return trophies.sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));
    },

    async collectChallengeTrophies(progressMap, challengeType, challengeTitleMap, trophies, seenTrophies) {
        for (const [monthKey, data] of progressMap.entries()) {
            if (data.progress <= 0) continue;
            
            const awardLevel = this.getAwardLevel(data.progress, challengeType);
            const trophyId = `${challengeType}_${monthKey}_${awardLevel}`;
            
            if (seenTrophies.has(trophyId)) continue;
            seenTrophies.add(trophyId);
            
            const [year, month] = monthKey.split('-');
            const trophyDate = new Date(parseInt(year), parseInt(month) - 1, 15);
            
            const rawGameTitle = data.gameTitle || 
                                challengeTitleMap[monthKey]?.[challengeType] || 
                                `${challengeType.charAt(0).toUpperCase() + challengeType.slice(1)} Challenge - ${this.formatShortDate(monthKey)}`;
            
            const gameTitle = this.shortenGameTitle(rawGameTitle);
            const emojiData = await getTrophyEmoji(challengeType, monthKey, awardLevel);

            trophies.push({
                gameTitle, awardLevel, challengeType,
                emojiId: emojiData.emojiId, 
                emojiName: emojiData.emojiName,
                earnedAt: trophyDate
            });
        }
    },

    getAwardLevel(progress, challengeType) {
        if (challengeType === 'monthly') {
            return progress === 3 ? 'mastery' : progress === 2 ? 'beaten' : 'participation';
        } else {
            return progress === 2 ? 'beaten' : 'participation';
        }
    },

    shortenGameTitle(title) {
        if (!title) return title;
        
        // Common game title shortenings for better display
        const shortenings = {
            'Mario & Luigi: Superstar Saga': 'Superstar Saga',
            'Mario and Luigi: Superstar Saga': 'Superstar Saga',
            'The Legend of Zelda: A Link to the Past': 'A Link to the Past',
            'The Legend of Zelda: Link to the Past': 'A Link to the Past',
            'Super Mario Bros. 3': 'Super Mario Bros. 3',
            'Pokémon Red Version': 'Pokémon Red',
            'Pokémon Blue Version': 'Pokémon Blue',
            'Pokémon Yellow Version': 'Pokémon Yellow',
            'Final Fantasy VII': 'Final Fantasy VII',
            'Chrono Trigger': 'Chrono Trigger',
            'Secret of Mana': 'Secret of Mana'
        };
        
        // Check for exact matches first
        if (shortenings[title]) {
            return shortenings[title];
        }
        
        // Pattern-based shortenings
        let shortened = title;
        
        // Remove "The Legend of Zelda:" prefix
        shortened = shortened.replace(/^The Legend of Zelda:\s*/i, '');
        
        // Remove "Mario & Luigi:" or "Mario and Luigi:" prefix
        shortened = shortened.replace(/^Mario (&|and) Luigi:\s*/i, '');
        
        // Remove "Version" suffix from Pokemon games
        shortened = shortened.replace(/\s+Version$/i, '');
        
        // Limit to reasonable length (truncate if still too long)
        if (shortened.length > 25) {
            shortened = shortened.substring(0, 22) + '...';
        }
        
        return shortened;
    },

    createTrophyCaseEmbed(user, trophies) {
        const grouped = this.groupTrophiesByType(trophies);
        
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Trophy Case`)
            .setColor(COLORS.GOLD)
            .setDescription(`**Achievement Trophies:** ${trophies.length}`)
            .setTimestamp();

        this.addTrophyFields(embed, grouped);
        
        embed.setFooter({ text: 'Achievement trophies are earned by completing challenges and awards' });
        return embed;
    },

    groupTrophiesByType(trophies) {
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

        return grouped;
    },

    addTrophyFields(embed, grouped) {
        const emojiMap = { mastery: '✨', beaten: '⭐', participation: '🏁', special: '🎖️' };
        
        for (const [challengeType, categories] of Object.entries(grouped)) {
            for (const [awardLevel, levelTrophies] of Object.entries(categories)) {
                if (levelTrophies.length === 0) continue;

                levelTrophies.sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));

                const emoji = emojiMap[awardLevel] || '🏆';
                const typeName = challengeType.charAt(0).toUpperCase() + challengeType.slice(1);
                const levelName = challengeType === 'community' ? 'Awards' : awardLevel.charAt(0).toUpperCase() + awardLevel.slice(1);
                
                let fieldValue = levelTrophies.slice(0, 10).map(trophy => {
                    const trophyEmoji = formatTrophyEmoji(trophy.emojiId, trophy.emojiName);
                    return `${trophyEmoji} **${trophy.gameTitle}**`;
                }).join('\n');

                if (levelTrophies.length > 10) {
                    fieldValue += `\n*...and ${levelTrophies.length - 10} more*`;
                }

                embed.addFields({ 
                    name: `${emoji} ${typeName} ${levelName} (${levelTrophies.length})`, 
                    value: fieldValue, 
                    inline: true 
                });
            }
        }
    },

    async showCollection(interaction, user, page = 0) {
        if (!user.gachaCollection?.length) {
            return interaction.editReply({
                content: '📦 Your collection is empty! Visit the gacha channel to start collecting items.\n\n' +
                         '💡 **Tip:** All item combinations happen automatically when you get the right ingredients!',
                ephemeral: true
            });
        }

        const { embed, components } = this.createCollectionView(user, page);
        await interaction.editReply({ embeds: [embed], components });
    },

    createCollectionView(user, page) {
        const ITEMS_PER_PAGE = 50;
        const rarityOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
        
        const allItems = [...user.gachaCollection].sort((a, b) => {
            const aIndex = rarityOrder.indexOf(a.rarity);
            const bIndex = rarityOrder.indexOf(b.rarity);
            if (aIndex !== bIndex) return aIndex - bIndex;
            return a.itemName.localeCompare(b.itemName);
        });

        const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);
        const startIndex = page * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, allItems.length);
        const pageItems = allItems.slice(startIndex, endIndex);

        const description = this.buildCollectionDescription(pageItems, rarityOrder);
        const embed = this.createCollectionEmbed(user, description, allItems, page, totalPages, startIndex, endIndex);
        const components = this.createPaginationComponents(user, page, totalPages);

        return { embed, components };
    },

    buildCollectionDescription(pageItems, rarityOrder) {
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
            
            let currentRow = '';
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const emoji = formatGachaEmoji(item.emojiId, item.emojiName, item.isAnimated);
                const quantity = (item.quantity || 1) > 1 ? `⁽${item.quantity}⁾` : '';
                currentRow += `${emoji}${quantity} `;
                
                if ((i + 1) % 5 === 0 || i === items.length - 1) {
                    description += currentRow.trim() + '\n';
                    currentRow = '';
                }
            }
        }

        return description.trim();
    },

    createCollectionEmbed(user, description, allItems, page, totalPages, startIndex, endIndex) {
        const embed = new EmbedBuilder()
            .setTitle(`${user.raUsername}'s Collection`)
            .setColor(COLORS.INFO)
            .setDescription(description)
            .setTimestamp();

        const combinationStats = combinationService.getCombinationStats(user);
        const animatedCount = user.gachaCollection?.filter(item => item.isAnimated).length || 0;
        
        let footerText = `${allItems.length} total items • ${combinationStats.totalCombined} from auto-combinations`;
        if (animatedCount > 0) {
            footerText += ` • ${animatedCount} animated emojis`;
        }
        if (totalPages > 1) {
            footerText += ` • Page ${page + 1}/${totalPages} • ${startIndex + 1}-${endIndex} of ${allItems.length}`;
        }
        footerText += ` • ⁽ⁿ⁾ = quantity`;
        
        embed.setFooter({ text: footerText });
        return embed;
    },

    createPaginationComponents(user, page, totalPages) {
        if (totalPages <= 1) return [];
        
        return [new ActionRowBuilder().addComponents(
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
        )];
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
            
            const { embed, components } = this.createCollectionView(user, newPage);
            await interaction.editReply({ embeds: [embed], components });

        } catch (error) {
            console.error('Error handling collection pagination:', error);
            await interaction.editReply?.({ content: '❌ An error occurred.' }) ||
                  interaction.followUp?.({ content: '❌ An error occurred.', ephemeral: true });
        }
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
