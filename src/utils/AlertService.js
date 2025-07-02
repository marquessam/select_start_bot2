// src/utils/AlertService.js - COMPLETELY CENTRALIZED alert management
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';
import { COLORS, EMOJIS, getDiscordTimestamp } from './FeedUtils.js';

// Alert type constants - comprehensive coverage including combinations
export const ALERT_TYPES = {
    // Position/Rank Changes
    ARCADE_RANKS: 'arcade_ranks',
    ARENA_RANKS: 'arena_ranks', 
    MONTHLY_RANKS: 'monthly_ranks',
    YEARLY_RANKS: 'yearly_ranks',
    
    // New Content Announcements
    NEW_CHALLENGE: 'new_challenge',
    NEW_ARCADE_BOARD: 'new_arcade_board',
    NEW_RACING_CHALLENGE: 'new_racing_challenge',
    NEW_TIEBREAKER: 'new_tiebreaker',
    NEW_ARENA_CHALLENGE: 'new_arena_challenge',
    
    // Achievement/Award Alerts
    MASTERY: 'mastery',
    BEATEN: 'beaten',
    MONTHLY_AWARD: 'monthly_award',
    SHADOW_AWARD: 'shadow_award',
    RACING_AWARD: 'racing_award',
    ARCADE_AWARD: 'arcade_award',
    ARENA_AWARD: 'arena_award',
    ACHIEVEMENT: 'achievement',
    
    // Combination/Gacha Alerts
    COMBINATION_COMPLETE: 'combination_complete',
    COMBINATION_TRANSFER: 'combination_transfer', 
    COMBINATION_ADMIN_GIFT: 'combination_admin_gift',
    RECIPE_DISCOVERY: 'recipe_discovery',
    
    // System/Admin Alerts
    ADMIN: 'admin',
    SYSTEM: 'system',
    DEFAULT: 'default'
};

// Channel routing configuration
const CHANNEL_CONFIG = {
    // Position/Rank Changes
    [ALERT_TYPES.ARCADE_RANKS]: '1300941091335438471',      // Arcade channel
    [ALERT_TYPES.ARENA_RANKS]: '1373570850912997476',       // Arena channel
    [ALERT_TYPES.MONTHLY_RANKS]: '1313640664356880445',     // Monthly game channel
    [ALERT_TYPES.YEARLY_RANKS]: '1313640664356880445',      // Monthly game channel
    
    // New Content Announcements
    [ALERT_TYPES.NEW_CHALLENGE]: ['1360409399264416025', '1313640664356880445'], // Announcements + Monthly
    [ALERT_TYPES.NEW_ARCADE_BOARD]: ['1360409399264416025', '1300941091335438471'], // Announcements + Arcade
    [ALERT_TYPES.NEW_RACING_CHALLENGE]: ['1360409399264416025', '1300941091335438471'], // Announcements + Arcade
    [ALERT_TYPES.NEW_TIEBREAKER]: ['1360409399264416025', '1300941091335438471'], // Announcements + Arcade
    [ALERT_TYPES.NEW_ARENA_CHALLENGE]: '1373570850912997476', // Arena channel
    
    // Achievement Types
    [ALERT_TYPES.ACHIEVEMENT]: '1326199972059680778',       // Regular achievements → achievement feed
    [ALERT_TYPES.MASTERY]: '1362227906343997583',           // Regular mastery/beaten → mastery channel
    [ALERT_TYPES.BEATEN]: '1362227906343997583',            // Regular mastery/beaten → mastery channel
    [ALERT_TYPES.MONTHLY_AWARD]: '1313640664356880445',     // Monthly mastery/beaten → monthly channel
    [ALERT_TYPES.SHADOW_AWARD]: '1300941091335438470',      // Shadow mastery/beaten → shadow channel
    [ALERT_TYPES.RACING_AWARD]: '1326199972059680778',      // Racing/arcade achievements → achievement feed
    [ALERT_TYPES.ARCADE_AWARD]: '1326199972059680778',      // Arcade achievements → achievement feed
    [ALERT_TYPES.ARENA_AWARD]: '1326199972059680778',       // Arena achievements → achievement feed
    
    // Combination/Gacha Alerts
    [ALERT_TYPES.COMBINATION_COMPLETE]: '1379402075120730185', // gacha trade channel 
    [ALERT_TYPES.COMBINATION_TRANSFER]: '1379402075120730185', // gacha trade channel
    [ALERT_TYPES.COMBINATION_ADMIN_GIFT]: '1379402075120730185', // gacha trade channel
    [ALERT_TYPES.RECIPE_DISCOVERY]: '1379402075120730185', // gacha trade channel
    
    // System/Admin
    [ALERT_TYPES.ADMIN]: '1360409399264416025',             // Announcements
    [ALERT_TYPES.SYSTEM]: '1360409399264416025',            // Announcements  
    [ALERT_TYPES.DEFAULT]: '1326199972059680778'            // Fallback to achievements
};

// Color mapping for different alert types
const ALERT_COLORS = {
    [ALERT_TYPES.ARCADE_RANKS]: '#3498DB',        // Blue
    [ALERT_TYPES.ARENA_RANKS]: '#FF5722',         // Red
    [ALERT_TYPES.MONTHLY_RANKS]: '#9B59B6',       // Purple
    [ALERT_TYPES.YEARLY_RANKS]: '#9B59B6',        // Purple
    
    [ALERT_TYPES.NEW_CHALLENGE]: '#FFD700',       // Gold
    [ALERT_TYPES.NEW_ARCADE_BOARD]: '#3498DB',    // Blue
    [ALERT_TYPES.NEW_RACING_CHALLENGE]: '#FF9900', // Orange
    [ALERT_TYPES.NEW_TIEBREAKER]: '#FF0000',      // Red
    [ALERT_TYPES.NEW_ARENA_CHALLENGE]: '#FF5722', // Red
    
    [ALERT_TYPES.MASTERY]: '#FFD700',             // Gold
    [ALERT_TYPES.BEATEN]: '#FFD700',              // Gold
    [ALERT_TYPES.MONTHLY_AWARD]: '#9B59B6',       // Purple
    [ALERT_TYPES.SHADOW_AWARD]: '#000000',        // Black
    [ALERT_TYPES.RACING_AWARD]: '#FF9900',        // Orange
    [ALERT_TYPES.ARCADE_AWARD]: '#3498DB',        // Blue
    [ALERT_TYPES.ARENA_AWARD]: '#FF5722',         // Red
    [ALERT_TYPES.ACHIEVEMENT]: '#808080',         // Grey
    
    // Combination/Gacha Colors
    [ALERT_TYPES.COMBINATION_COMPLETE]: '#00FF00',     // Green
    [ALERT_TYPES.COMBINATION_TRANSFER]: '#FFD700',     // Gold
    [ALERT_TYPES.COMBINATION_ADMIN_GIFT]: '#FF69B4',   // Hot Pink
    [ALERT_TYPES.RECIPE_DISCOVERY]: '#9932CC',         // Dark Orchid
    
    [ALERT_TYPES.ADMIN]: '#95A5A6',               // Grey
    [ALERT_TYPES.SYSTEM]: '#95A5A6',              // Grey
    [ALERT_TYPES.DEFAULT]: '#808080'              // Grey
};

/**
 * Link creation utilities
 */
export const LinkUtils = {
    createUserLink(username) {
        if (!username) return username;
        return `[${username}](https://retroachievements.org/user/${username})`;
    },
    
    createGameLink(gameTitle, gameId) {
        if (!gameId || !gameTitle) return gameTitle;
        return `[${gameTitle}](https://retroachievements.org/game/${gameId})`;
    },
    
    createLeaderboardLink(leaderboardTitle, leaderboardId) {
        if (!leaderboardId || !leaderboardTitle) return leaderboardTitle;
        return `[${leaderboardTitle}](https://retroachievements.org/leaderboardinfo.php?i=${leaderboardId})`;
    },
    
    createAchievementLink(achievementTitle, achievementId) {
        if (!achievementId || !achievementTitle) return achievementTitle;
        return `[${achievementTitle}](https://retroachievements.org/achievement/${achievementId})`;
    }
};

/**
 * CENTRALIZED ranking display utilities - FIXED to eliminate duplicates
 */
export const RankingUtils = {
    /**
     * Get the proper rank emoji/text - FIXED to only return ONE representation
     */
    getRankDisplay(rank) {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`; // FIXED: Only show rank number for 4+, no blue diamonds
    },
    
    /**
     * Format standings for display - CENTRALIZED and FIXED
     */
    formatStandings(standings, alertType, options = {}) {
        const { showTiebreakers = false, maxEntries = 5 } = options;
        let standingsText = '';
        
        const sortedStandings = [...standings]
            .sort((a, b) => (a.rank || 999) - (b.rank || 999))
            .slice(0, maxEntries);
        
        for (const user of sortedStandings) {
            const rankDisplay = this.getRankDisplay(user.rank);
            const userLink = LinkUtils.createUserLink(user.username);
            
            // FIXED: Single line per user, no duplicates
            if (alertType === ALERT_TYPES.MONTHLY_RANKS) {
                // Monthly challenge format with achievements
                const score = user.score || '';
                standingsText += `${rankDisplay} ${userLink}: ${score}\n`;
                
                // Add tiebreaker info on separate lines if available and requested
                if (showTiebreakers && user.rank <= 5) {
                    if (user.tiebreakerInfo) {
                        standingsText += `   ⚔️ Tiebreaker: ${user.tiebreakerInfo}\n`;
                    }
                    if (user.tiebreakerBreakerInfo) {
                        standingsText += `   ⚡ TB-Breaker: ${user.tiebreakerBreakerInfo}\n`;
                    }
                }
            } else {
                // Arcade/Arena format
                const globalRank = user.globalRank ? ` (Global: #${user.globalRank})` : '';
                const score = user.score || user.value || '';
                standingsText += `${rankDisplay} ${userLink}: ${score}${globalRank}\n`;
            }
        }
        
        return standingsText;
    },
    
    /**
     * Format position changes for display
     */
    formatPositionChanges(changes) {
        let changesText = '';
        
        for (const change of changes) {
            const userLink = LinkUtils.createUserLink(change.username);
            const rankDisplay = this.getRankDisplay(change.newRank);
            
            if (change.type === 'newEntry') {
                changesText += `${userLink} entered the top 5 at ${rankDisplay}!\n`;
            } else if (change.type === 'overtake') {
                changesText += `${userLink} moved to ${rankDisplay}! ${change.reason || ''}\n`;
            } else {
                changesText += `${userLink} is now at ${rankDisplay}!\n`;
            }
        }
        
        return changesText;
    }
};

/**
 * COMPLETELY CENTRALIZED AlertService class
 */
export class AlertService {
    constructor(client = null) {
        this.client = client;
        this.channelCache = new Map();
        
        console.log('AlertService initialized with centralized alert management');
    }
    
    setClient(client) {
        this.client = client;
        this.channelCache.clear();
        console.log('AlertService client configured');
    }
    
    getAlertColor(alertType) {
        return ALERT_COLORS[alertType] || ALERT_COLORS[ALERT_TYPES.DEFAULT];
    }
    
    async getChannelsForAlert(alertType) {
        if (!this.client) {
            console.error('AlertService: Discord client not set');
            return [];
        }
        
        const channelIds = CHANNEL_CONFIG[alertType] || CHANNEL_CONFIG[ALERT_TYPES.DEFAULT];
        const targetIds = Array.isArray(channelIds) ? channelIds : [channelIds];
        
        const channels = [];
        for (const channelId of targetIds) {
            try {
                if (this.channelCache.has(channelId)) {
                    channels.push(this.channelCache.get(channelId));
                    continue;
                }
                
                const guild = await this.client.guilds.fetch(config.discord.guildId);
                const channel = await guild.channels.fetch(channelId);
                
                if (channel) {
                    this.channelCache.set(channelId, channel);
                    channels.push(channel);
                } else {
                    console.warn(`AlertService: Channel ${channelId} not found`);
                }
            } catch (error) {
                console.error(`AlertService: Error fetching channel ${channelId}:`, error);
            }
        }
        
        return channels;
    }
    
    /**
     * CENTRALIZED rank change alert - handles ALL ranking systems
     */
    async sendRankChangeAlert(options) {
        const {
            alertType,
            title = null,
            description = null,
            gameTitle = null,
            gameId = null,
            leaderboardTitle = null,
            leaderboardId = null,
            changes = [],
            currentStandings = [],
            thumbnail = null,
            challengeId = null,
            monthName = null,
            footer = null
        } = options;
        
        try {
            console.log(`AlertService: Sending centralized rank change alert - Type: ${alertType}`);
            
            const channels = await this.getChannelsForAlert(alertType);
            if (channels.length === 0) {
                console.error(`AlertService: No channels found for alert type ${alertType}`);
                return;
            }
            
            const color = this.getAlertColor(alertType);
            const now = new Date();
            
            // Determine title and description based on alert type
            let embedTitle = title;
            let embedDescription = description;
            
            if (!embedTitle) {
                if (alertType === ALERT_TYPES.MONTHLY_RANKS) {
                    const currentMonth = monthName || now.toLocaleString('en-US', { month: 'long' });
                    embedTitle = `📊 ${currentMonth} Challenge Update!`;
                } else if (alertType === ALERT_TYPES.ARCADE_RANKS) {
                    embedTitle = '🕹️ Arcade Alert!';
                } else if (alertType === ALERT_TYPES.ARENA_RANKS) {
                    embedTitle = '🏟️ Arena Alert!';
                } else {
                    embedTitle = 'Leaderboard Update!';
                }
            }
            
            if (!embedDescription) {
                if (gameTitle && gameId) {
                    const gameLink = LinkUtils.createGameLink(gameTitle, gameId);
                    embedDescription = `The leaderboard for ${gameLink} has been updated!`;
                } else if (leaderboardTitle && leaderboardId) {
                    const leaderboardLink = LinkUtils.createLeaderboardLink(leaderboardTitle, leaderboardId);
                    embedDescription = `The leaderboard for ${leaderboardLink} has been updated!`;
                } else {
                    embedDescription = 'The leaderboard has been updated!';
                }
            }
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(embedTitle)
                .setDescription(embedDescription)
                .setTimestamp();
            
            // Add time field
            embed.addFields({
                name: 'Time',
                value: now.toLocaleString('en-US', {
                    month: 'long',
                    day: 'numeric', 
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                }),
                inline: false
            });
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            // FIXED: Add position changes using centralized formatting
            if (changes && changes.length > 0) {
                const changesText = RankingUtils.formatPositionChanges(changes);
                embed.addFields({ 
                    name: 'Position Changes', 
                    value: changesText,
                    inline: false
                });
            }
            
            // FIXED: Add current standings using centralized formatting
            if (currentStandings && currentStandings.length > 0) {
                const standingsText = RankingUtils.formatStandings(currentStandings, alertType, {
                    showTiebreakers: alertType === ALERT_TYPES.MONTHLY_RANKS
                });
                
                embed.addFields({ 
                    name: 'Current Top 5', 
                    value: standingsText,
                    inline: false
                });
            }
            
            // Add footer
            if (footer) {
                embed.setFooter(footer);
            } else {
                let footerText = 'Data provided by RetroAchievements';
                if (challengeId) {
                    footerText = `Challenge ID: ${challengeId} • ${footerText}`;
                }
                embed.setFooter({ text: footerText });
            }
            
            // Send to all target channels
            for (const channel of channels) {
                await channel.send({ embeds: [embed] });
                console.log(`AlertService: Sent rank change alert to ${channel.name}`);
            }
            
        } catch (error) {
            console.error(`AlertService: Error sending rank change alert:`, error);
        }
    }
    
    /**
     * Send combination/gacha alert
     */
    async sendCombinationAlert(options) {
        // Previous combination alert code remains unchanged
        const {
            alertType,
            combinationType,
            ruleId,
            username,
            characterNames = [],
            resultCharacterName = null,
            thumbnail = null,
            isSuccess = true,
            isPlayerConfirmed = false,
            description = null,
            fields = []
        } = options;
        
        try {
            console.log(`AlertService: Sending combination alert - Type: ${alertType}`);
            
            const channels = await this.getChannelsForAlert(alertType);
            if (channels.length === 0) {
                console.error(`AlertService: No channels found for alert type ${alertType}`);
                return;
            }
            
            const color = this.getAlertColor(alertType);
            
            // Build embed based on combination type
            let title;
            let embedDescription;
            let emoji;
            
            switch (alertType) {
                case ALERT_TYPES.COMBINATION_COMPLETE:
                    emoji = isSuccess ? '✅' : '❌';
                    title = `${emoji} Combination ${isSuccess ? 'Successful' : 'Failed'}!`;
                    if (isSuccess) {
                        embedDescription = `**${username}** successfully combined **${characterNames.join(' + ')}** to create **${resultCharacterName}**!`;
                    } else {
                        embedDescription = `**${username}** attempted to combine **${characterNames.join(' + ')}** but it failed.`;
                    }
                    break;
                    
                case ALERT_TYPES.COMBINATION_TRANSFER:
                    emoji = '🔄';
                    title = `${emoji} Transfer Combination!`;
                    embedDescription = `**${username}** received **${resultCharacterName}** through a character transfer!`;
                    break;
                    
                case ALERT_TYPES.COMBINATION_ADMIN_GIFT:
                    emoji = '🎁';
                    title = `${emoji} Admin Gift Combination!`;
                    embedDescription = `**${username}** received **${resultCharacterName}** as an admin gift!`;
                    break;
                    
                case ALERT_TYPES.RECIPE_DISCOVERY:
                    emoji = '🧪';
                    title = `${emoji} New Recipe Discovered!`;
                    embedDescription = `**${username}** discovered a new combination recipe: **${characterNames.join(' + ')} = ${resultCharacterName}**!`;
                    break;
                    
                default:
                    emoji = '⚡';
                    title = `${emoji} Gacha Event!`;
                    embedDescription = description || `**${username}** triggered a gacha event!`;
            }
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(embedDescription)
                .setTimestamp();
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            // Add combination details as fields
            if (characterNames.length > 0) {
                embed.addFields({
                    name: 'Characters Used',
                    value: characterNames.map(name => `• ${name}`).join('\n'),
                    inline: true
                });
            }
            
            if (resultCharacterName) {
                embed.addFields({
                    name: 'Result',
                    value: `**${resultCharacterName}**`,
                    inline: true
                });
            }
            
            if (combinationType) {
                embed.addFields({
                    name: 'Combination Type',
                    value: combinationType,
                    inline: true
                });
            }
            
            // Add custom fields
            if (fields && fields.length > 0) {
                embed.addFields(fields);
            }
            
            // Add footer
            let footerText = '';
            if (ruleId) {
                footerText = `Combination ID: ${ruleId}`;
            }
            if (combinationType) {
                footerText += footerText ? ` • ${combinationType}` : combinationType;
            }
            if (isPlayerConfirmed && alertType === ALERT_TYPES.COMBINATION_COMPLETE) {
                footerText += footerText ? ' • Player confirmed' : 'Player confirmed';
            }
            
            if (footerText) {
                embed.setFooter({ text: footerText });
            }
            
            // Send to all target channels
            for (const channel of channels) {
                await channel.send({ embeds: [embed] });
                console.log(`AlertService: Sent combination alert to ${channel.name}`);
            }
            
        } catch (error) {
            console.error(`AlertService: Error sending combination alert:`, error);
        }
    }
    
    /**
     * Send achievement/award alert
     */
    async sendAchievementAlert(options) {
        const {
            alertType,
            username,
            achievementTitle = null,
            achievementDescription = null,
            gameTitle = null,
            gameId = null,
            consoleName = null,
            points = null,
            thumbnail = null,
            userProfileImageUrl = null,
            customTitle = null,
            color = null,
            gpEarned = null,
            awardType = null,
            systemType = null,
            gameIconUrl = null
        } = options;
        
        try {
            console.log(`AlertService: Sending achievement alert - Type: ${alertType}`);
            
            const channels = await this.getChannelsForAlert(alertType);
            if (channels.length === 0) {
                console.error(`AlertService: No channels found for alert type ${alertType}`);
                return;
            }
            
            const embedColor = color || this.getAlertColor(alertType);
            
            // Handle mastery/beaten alerts
            if (alertType === ALERT_TYPES.MASTERY || alertType === ALERT_TYPES.BEATEN || 
                alertType === ALERT_TYPES.MONTHLY_AWARD || alertType === ALERT_TYPES.SHADOW_AWARD) {
                
                const gameLink = gameTitle && gameId ? 
                    LinkUtils.createGameLink(gameTitle, gameId) : gameTitle;
                const userLink = LinkUtils.createUserLink(username);
                
                let embedTitle;
                let embedDescription;
                
                if (alertType === ALERT_TYPES.MASTERY || 
                    (alertType === ALERT_TYPES.MONTHLY_AWARD && awardType === 'mastery') ||
                    (alertType === ALERT_TYPES.SHADOW_AWARD && awardType === 'mastery')) {
                    
                    embedTitle = `✨ ${username} has mastered a game!`;
                    embedDescription = `${userLink} has mastered ${gameLink}! They've earned every achievement in the game.`;
                    
                } else if (alertType === ALERT_TYPES.BEATEN || 
                          (alertType === ALERT_TYPES.MONTHLY_AWARD && awardType === 'beaten') ||
                          (alertType === ALERT_TYPES.SHADOW_AWARD && awardType === 'beaten')) {
                    
                    embedTitle = `⭐ ${username} has beaten a game!`;
                    embedDescription = `${userLink} has beaten ${gameLink}! They've completed the core achievements.`;
                    
                } else if ((alertType === ALERT_TYPES.MONTHLY_AWARD && awardType === 'participation') ||
                          (alertType === ALERT_TYPES.SHADOW_AWARD && awardType === 'participation')) {
                    
                    const challengeType = systemType === 'shadow' ? 'Shadow' : 'Monthly';
                    embedTitle = `🏁 ${username} has participated in the ${challengeType} Challenge!`;
                    embedDescription = `${userLink} has participated in the ${challengeType} Challenge for ${gameLink}!`;
                    
                } else {
                    embedTitle = `🎮 ${username} earned an award!`;
                    embedDescription = `${userLink} earned an award for ${gameLink}!`;
                }
                
                const embed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle(embedTitle)
                    .setDescription(embedDescription)
                    .setTimestamp();
                
                if (thumbnail) {
                    embed.setThumbnail(thumbnail);
                }
                
                if (gpEarned) {
                    embed.addFields({
                        name: '━━━━━━━━━━━━━━━━━━━━━━━━━━',
                        value: `🏆 **+${gpEarned} GP** earned!`,
                        inline: false
                    });
                }
                
                for (const channel of channels) {
                    await channel.send({ embeds: [embed] });
                    console.log(`AlertService: Sent mastery/beaten alert to ${channel.name}`);
                }
                
                return;
            }
            
            // Regular achievement formatting
            const logoUrl = 'https://raw.githubusercontent.com/marquessam/select_start_bot2/a58a4136ff0597217bb9fb181115de3f152b71e4/assets/logo_simple.png';
            
            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTimestamp();
            
            const platformText = consoleName ? ` • ${consoleName}` : '';
            embed.setTitle(`${gameTitle || 'Unknown Game'}${platformText}`);
            if (gameId) {
                embed.setURL(`https://retroachievements.org/game/${gameId}`);
            }
            
            let authorName = customTitle || 'Achievement Unlocked';
            let iconURL = null;
            
            if ([ALERT_TYPES.MONTHLY_AWARD, ALERT_TYPES.SHADOW_AWARD, ALERT_TYPES.ARCADE_AWARD, ALERT_TYPES.ARENA_AWARD].includes(alertType)) {
                iconURL = logoUrl;
            } else {
                iconURL = gameIconUrl || null;
            }
            
            if (iconURL) {
                embed.setAuthor({
                    name: authorName,
                    iconURL: iconURL
                });
            } else {
                embed.setAuthor({
                    name: authorName
                });
            }
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            const userLink = LinkUtils.createUserLink(username);
            let description = `${userLink} earned **${achievementTitle}**\n\n`;
            
            if (achievementDescription) {
                description += `*${achievementDescription}*`;
            }
            
            embed.setDescription(description);
            
            let footerText = '';
            if (points) {
                footerText = `Points: ${points}`;
            }
            
            if (userProfileImageUrl) {
                embed.setFooter({
                    text: footerText,
                    iconURL: userProfileImageUrl
                });
            } else if (footerText) {
                embed.setFooter({
                    text: footerText
                });
            }
            
            for (const channel of channels) {
                await channel.send({ embeds: [embed] });
                console.log(`AlertService: Sent achievement alert to ${channel.name}`);
            }
            
        } catch (error) {
            console.error(`AlertService: Error sending achievement alert:`, error);
        }
    }
    
    /**
     * Send new content announcement
     */
    async sendAnnouncementAlert(options) {
        const {
            alertType,
            title,
            description,
            gameTitle = null,
            gameId = null,
            leaderboardTitle = null,
            leaderboardId = null,
            thumbnail = null,
            fields = [],
            footer = null
        } = options;
        
        try {
            console.log(`AlertService: Sending announcement alert - Type: ${alertType}`);
            
            const channels = await this.getChannelsForAlert(alertType);
            if (channels.length === 0) {
                console.error(`AlertService: No channels found for alert type ${alertType}`);
                return;
            }
            
            const color = this.getAlertColor(alertType);
            
            let enhancedDescription = description;
            if (gameTitle && gameId) {
                const gameLink = LinkUtils.createGameLink(gameTitle, gameId);
                enhancedDescription = enhancedDescription.replace(gameTitle, gameLink);
            }
            if (leaderboardTitle && leaderboardId) {
                const leaderboardLink = LinkUtils.createLeaderboardLink(leaderboardTitle, leaderboardId);
                enhancedDescription = enhancedDescription.replace(leaderboardTitle, leaderboardLink);
            }
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(enhancedDescription)
                .setTimestamp();
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            if (fields && fields.length > 0) {
                embed.addFields(fields);
            }
            
            if (footer) {
                embed.setFooter(footer);
            } else {
                embed.setFooter({ 
                    text: 'Data provided by RetroAchievements' 
                });
            }
            
            for (const channel of channels) {
                await channel.send({ embeds: [embed] });
                console.log(`AlertService: Sent announcement alert to ${channel.name}`);
            }
            
        } catch (error) {
            console.error(`AlertService: Error sending announcement alert:`, error);
        }
    }
    
    // CONVENIENCE METHODS - All alert types centralized here
    
    // Rank change alerts
    async sendArcadeRankAlert(options) {
        return this.sendRankChangeAlert({ alertType: ALERT_TYPES.ARCADE_RANKS, ...options });
    }
    
    async sendArenaRankAlert(options) {
        return this.sendRankChangeAlert({ alertType: ALERT_TYPES.ARENA_RANKS, ...options });
    }
    
    async sendMonthlyRankAlert(options) {
        return this.sendRankChangeAlert({ alertType: ALERT_TYPES.MONTHLY_RANKS, ...options });
    }
    
    // Announcement alerts
    async sendNewChallengeAlert(options) {
        return this.sendAnnouncementAlert({ alertType: ALERT_TYPES.NEW_CHALLENGE, ...options });
    }
    
    async sendNewArcadeBoardAlert(options) {
        return this.sendAnnouncementAlert({ alertType: ALERT_TYPES.NEW_ARCADE_BOARD, ...options });
    }
    
    async sendNewRacingChallengeAlert(options) {
        return this.sendAnnouncementAlert({ alertType: ALERT_TYPES.NEW_RACING_CHALLENGE, ...options });
    }
    
    async sendNewTiebreakerAlert(options) {
        return this.sendAnnouncementAlert({ alertType: ALERT_TYPES.NEW_TIEBREAKER, ...options });
    }
    
    async sendNewArenaChallengeAlert(options) {
        return this.sendAnnouncementAlert({ alertType: ALERT_TYPES.NEW_ARENA_CHALLENGE, ...options });
    }
    
    // Achievement alerts
    async sendMasteryAlert(options) {
        return this.sendAchievementAlert({ alertType: ALERT_TYPES.MASTERY, ...options });
    }
    
    async sendBeatenAlert(options) {
        return this.sendAchievementAlert({ alertType: ALERT_TYPES.BEATEN, ...options });
    }
    
    async sendMonthlyAwardAlert(options) {
        return this.sendAchievementAlert({ alertType: ALERT_TYPES.MONTHLY_AWARD, ...options });
    }
    
    async sendShadowAwardAlert(options) {
        return this.sendAchievementAlert({ alertType: ALERT_TYPES.SHADOW_AWARD, ...options });
    }
    
    async sendRacingAwardAlert(options) {
        return this.sendAchievementAlert({ alertType: ALERT_TYPES.RACING_AWARD, ...options });
    }
    
    async sendArcadeAwardAlert(options) {
        return this.sendAchievementAlert({ alertType: ALERT_TYPES.ARCADE_AWARD, ...options });
    }
    
    async sendArenaAwardAlert(options) {
        return this.sendAchievementAlert({ alertType: ALERT_TYPES.ARENA_AWARD, ...options });
    }
    
    // Combination alerts
    async sendCombinationCompleteAlert(options) {
        return this.sendCombinationAlert({ alertType: ALERT_TYPES.COMBINATION_COMPLETE, ...options });
    }
    
    async sendCombinationTransferAlert(options) {
        return this.sendCombinationAlert({ alertType: ALERT_TYPES.COMBINATION_TRANSFER, ...options });
    }
    
    async sendCombinationAdminGiftAlert(options) {
        return this.sendCombinationAlert({ alertType: ALERT_TYPES.COMBINATION_ADMIN_GIFT, ...options });
    }
    
    async sendRecipeDiscoveryAlert(options) {
        return this.sendCombinationAlert({ alertType: ALERT_TYPES.RECIPE_DISCOVERY, ...options });
    }
}

// Create and export singleton instance
const alertService = new AlertService();
export default alertService;
