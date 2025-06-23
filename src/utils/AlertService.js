// src/utils/AlertService.js - FIXED to match original achievement formatting
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';
import { COLORS, EMOJIS, getDiscordTimestamp } from './FeedUtils.js';

// Alert type constants - comprehensive coverage
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
    [ALERT_TYPES.NEW_CHALLENGE]: ['1304533467455012904', '1313640664356880445'], // Announcements + Monthly
    [ALERT_TYPES.NEW_ARCADE_BOARD]: ['1304533467455012904', '1300941091335438471'], // Announcements + Arcade
    [ALERT_TYPES.NEW_RACING_CHALLENGE]: ['1304533467455012904', '1300941091335438471'], // Announcements + Arcade
    [ALERT_TYPES.NEW_TIEBREAKER]: ['1304533467455012904', '1300941091335438471'], // Announcements + Arcade
    [ALERT_TYPES.NEW_ARENA_CHALLENGE]: '1373570850912997476', // Arena channel
    
    // Achievement Types - CORRECTLY ROUTED
    [ALERT_TYPES.ACHIEVEMENT]: '1326199972059680778',       // Regular achievements → achievement feed
    [ALERT_TYPES.MASTERY]: '1362227906343997583',           // Regular mastery/beaten → mastery channel
    [ALERT_TYPES.BEATEN]: '1362227906343997583',            // Regular mastery/beaten → mastery channel
    [ALERT_TYPES.MONTHLY_AWARD]: '1313640664356880445',     // Monthly mastery/beaten → monthly channel
    [ALERT_TYPES.SHADOW_AWARD]: '1300941091335438470',      // Shadow mastery/beaten → shadow channel
    [ALERT_TYPES.RACING_AWARD]: '1326199972059680778',      // Racing/arcade achievements → achievement feed (with styling)
    [ALERT_TYPES.ARCADE_AWARD]: '1326199972059680778',      // Arcade achievements → achievement feed (with styling)
    [ALERT_TYPES.ARENA_AWARD]: '1326199972059680778',       // Arena achievements → achievement feed (with styling)
    
    // System/Admin
    [ALERT_TYPES.ADMIN]: '1304533467455012904',             // Announcements
    [ALERT_TYPES.SYSTEM]: '1304533467455012904',            // Announcements  
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
    [ALERT_TYPES.BEATEN]: '#C0C0C0',              // Silver
    [ALERT_TYPES.MONTHLY_AWARD]: '#9B59B6',       // Purple
    [ALERT_TYPES.SHADOW_AWARD]: '#000000',        // Black
    [ALERT_TYPES.RACING_AWARD]: '#FF9900',        // Orange
    [ALERT_TYPES.ARCADE_AWARD]: '#3498DB',        // Blue
    [ALERT_TYPES.ARENA_AWARD]: '#FF5722',         // Red
    [ALERT_TYPES.ACHIEVEMENT]: '#808080',         // Grey
    
    [ALERT_TYPES.ADMIN]: '#95A5A6',               // Grey
    [ALERT_TYPES.SYSTEM]: '#95A5A6',              // Grey
    [ALERT_TYPES.DEFAULT]: '#808080'              // Grey
};

/**
 * Comprehensive link creation utilities
 */
export const LinkUtils = {
    /**
     * Create user profile link
     */
    createUserLink(username) {
        if (!username) return username;
        return `[${username}](https://retroachievements.org/user/${username})`;
    },
    
    /**
     * Create game link
     */
    createGameLink(gameTitle, gameId) {
        if (!gameId || !gameTitle) return gameTitle;
        return `[${gameTitle}](https://retroachievements.org/game/${gameId})`;
    },
    
    /**
     * Create leaderboard link
     */
    createLeaderboardLink(leaderboardTitle, leaderboardId) {
        if (!leaderboardId || !leaderboardTitle) return leaderboardTitle;
        return `[${leaderboardTitle}](https://retroachievements.org/leaderboardinfo.php?i=${leaderboardId})`;
    },
    
    /**
     * Create achievement link
     */
    createAchievementLink(achievementTitle, achievementId) {
        if (!achievementId || !achievementTitle) return achievementTitle;
        return `[${achievementTitle}](https://retroachievements.org/achievement/${achievementId})`;
    },
    
    /**
     * Auto-enhance description with links
     */
    enhanceDescription(description, context = {}) {
        if (!description) return description;
        
        let enhanced = description;
        
        // Replace usernames with links
        if (context.username) {
            const userLink = this.createUserLink(context.username);
            enhanced = enhanced.replace(new RegExp(`\\b${context.username}\\b`, 'g'), userLink);
        }
        
        // Replace game titles with links
        if (context.gameTitle && context.gameId) {
            const gameLink = this.createGameLink(context.gameTitle, context.gameId);
            enhanced = enhanced.replace(new RegExp(`\\b${context.gameTitle}\\b`, 'g'), gameLink);
        }
        
        return enhanced;
    }
};

/**
 * Comprehensive AlertService class
 */
export class AlertService {
    constructor(client = null) {
        this.client = client;
        this.channelCache = new Map();
        
        console.log('AlertService initialized with comprehensive alert management');
    }
    
    setClient(client) {
        this.client = client;
        this.channelCache.clear(); // Clear cache when client changes
        console.log('AlertService client configured');
    }
    
    /**
     * Get color for alert type
     */
    getAlertColor(alertType) {
        return ALERT_COLORS[alertType] || ALERT_COLORS[ALERT_TYPES.DEFAULT];
    }
    
    /**
     * Get channel(s) for alert type
     */
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
                // Use cache to avoid repeated fetches
                if (this.channelCache.has(channelId)) {
                    channels.push(this.channelCache.get(channelId));
                    continue;
                }
                
                const guild = await this.client.guilds.fetch(config.discord.guildId);
                const channel = await guild.channels.fetch(channelId);
                
                if (channel) {
                    this.channelCache.set(channelId, channel);
                    channels.push(channel);
                    console.log(`AlertService: Found channel ${channel.name} (${channelId})`);
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
     * Send position/rank change alert
     */
    async sendRankChangeAlert(options) {
        const {
            alertType,
            title,
            description,
            changes = [],
            currentStandings = [],
            gameTitle = null,
            gameId = null,
            leaderboardTitle = null,
            leaderboardId = null,
            thumbnail = null,
            footer = null
        } = options;
        
        try {
            console.log(`AlertService: Sending rank change alert - Type: ${alertType}`);
            
            const channels = await this.getChannelsForAlert(alertType);
            if (channels.length === 0) {
                console.error(`AlertService: No channels found for alert type ${alertType}`);
                return;
            }
            
            const color = this.getAlertColor(alertType);
            const timestamp = getDiscordTimestamp(new Date());
            
            // Create enhanced description with links
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
                .setDescription(`${enhancedDescription}\n**Time:** ${timestamp}`)
                .setTimestamp();
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            // Add position changes with user links
            if (changes && changes.length > 0) {
                let changesText = '';
                changes.forEach(change => {
                    const rankEmoji = change.newRank <= 3 ? 
                        EMOJIS[`RANK_${change.newRank}`] : `#${change.newRank}`;
                    const userLink = LinkUtils.createUserLink(change.username);
                    changesText += `${userLink} is now in ${rankEmoji} place!\n`;
                });
                
                embed.addFields({ 
                    name: 'Position Changes', 
                    value: changesText 
                });
            }
            
            // Add current standings with user links
            if (currentStandings && currentStandings.length > 0) {
                const sortedStandings = [...currentStandings]
                    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
                
                let standingsText = '';
                sortedStandings.slice(0, 5).forEach(user => {
                    const rankEmoji = user.rank <= 3 ? 
                        EMOJIS[`RANK_${user.rank}`] : `#${user.rank}`;
                    const globalRank = user.globalRank ? ` (Global: #${user.globalRank})` : '';
                    const userLink = LinkUtils.createUserLink(user.username);
                    
                    // Handle multi-line scores
                    const scoreLines = (user.score || user.value || '').split('\n');
                    const primaryScore = scoreLines[0];
                    const secondaryInfo = scoreLines.slice(1).join('\n');
                    
                    standingsText += `${rankEmoji} ${userLink}: ${primaryScore}${globalRank}\n`;
                    
                    // Add indented secondary info
                    if (secondaryInfo.trim()) {
                        standingsText += `   ${secondaryInfo}\n`;
                    }
                });
                
                embed.addFields({ 
                    name: 'Current Top 5', 
                    value: standingsText 
                });
            }
            
            // Add footer
            if (footer) {
                embed.setFooter(footer);
            } else {
                embed.setFooter({ 
                    text: 'Rankings update regularly. Check the feed channel for full standings.' 
                });
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
            
            // Create enhanced description with links
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
            
            // Add custom fields
            if (fields && fields.length > 0) {
                embed.addFields(fields);
            }
            
            // Add footer
            if (footer) {
                embed.setFooter(footer);
            } else {
                embed.setFooter({ 
                    text: 'Data provided by RetroAchievements' 
                });
            }
            
            // Send to all target channels
            for (const channel of channels) {
                await channel.send({ embeds: [embed] });
                console.log(`AlertService: Sent announcement alert to ${channel.name}`);
            }
            
        } catch (error) {
            console.error(`AlertService: Error sending announcement alert:`, error);
        }
    }
    
    /**
     * FIXED: Send achievement/award alert with ORIGINAL formatting
     */
    async sendAchievementAlert(options) {
        const {
            alertType,
            username,
            achievementTitle,
            achievementDescription = null,
            gameTitle = null,
            gameId = null,
            consoleName = null,
            points = null,
            thumbnail = null,
            userProfileImageUrl = null,
            customTitle = null,
            color = null
        } = options;
        
        try {
            console.log(`AlertService: Sending achievement alert - Type: ${alertType}`);
            
            const channels = await this.getChannelsForAlert(alertType);
            if (channels.length === 0) {
                console.error(`AlertService: No channels found for alert type ${alertType}`);
                return;
            }
            
            // Use custom color or default to alert type color
            const embedColor = color || this.getAlertColor(alertType);
            
            // Raw GitHub URL for logo (same as original)
            const logoUrl = 'https://raw.githubusercontent.com/marquessam/select_start_bot2/a58a4136ff0597217bb9fb181115de3f152b71e4/assets/logo_simple.png';
            
            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTimestamp();
            
            // FIXED: Set game name and platform as the title with clickable link to game page (ORIGINAL FORMAT)
            const platformText = consoleName ? ` • ${consoleName}` : '';
            embed.setTitle(`${gameTitle || 'Unknown Game'}${platformText}`);
            if (gameId) {
                embed.setURL(`https://retroachievements.org/game/${gameId}`);
            }
            
            // FIXED: Set author with appropriate icon based on achievement type (ORIGINAL FORMAT)
            let authorName = customTitle || 'Achievement Unlocked';
            let iconURL = null;
            
            // Determine icon based on achievement type
            if (alertType === ALERT_TYPES.MONTHLY_AWARD) {
                iconURL = logoUrl;
            } else if (alertType === ALERT_TYPES.SHADOW_AWARD) {
                iconURL = logoUrl;
            } else if (alertType === ALERT_TYPES.ARCADE_AWARD) {
                iconURL = logoUrl;
            } else if (alertType === ALERT_TYPES.ARENA_AWARD) {
                iconURL = logoUrl;
            } else if (gameTitle) {
                // For regular achievements, try to use game icon if available
                // Note: This would need gameInfo.imageIcon from the original data
                iconURL = null; // Will fallback to text-only author
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
            
            // FIXED: Set the thumbnail to ALWAYS be the achievement badge (ORIGINAL FORMAT)
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            // FIXED: Build description with user link and "earned" language (ORIGINAL FORMAT)
            const userLink = LinkUtils.createUserLink(username);
            let description = `${userLink} earned **${achievementTitle}**\n\n`;
            
            // FIXED: Add achievement description in italics if available (ORIGINAL FORMAT)
            if (achievementDescription) {
                description += `*${achievementDescription}*`;
            }
            
            embed.setDescription(description);
            
            // FIXED: Footer with points and user profile image (ORIGINAL FORMAT)
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
            
            // Send to all target channels
            for (const channel of channels) {
                await channel.send({ embeds: [embed] });
                console.log(`AlertService: Sent achievement alert to ${channel.name}`);
            }
            
        } catch (error) {
            console.error(`AlertService: Error sending achievement alert:`, error);
        }
    }
    
    /**
     * Convenience methods for common alert types
     */
    
    // Arcade rank changes
    async sendArcadeRankAlert(options) {
        return this.sendRankChangeAlert({
            alertType: ALERT_TYPES.ARCADE_RANKS,
            ...options
        });
    }
    
    // Arena rank changes  
    async sendArenaRankAlert(options) {
        return this.sendRankChangeAlert({
            alertType: ALERT_TYPES.ARENA_RANKS,
            ...options
        });
    }
    
    // Monthly challenge rank changes
    async sendMonthlyRankAlert(options) {
        return this.sendRankChangeAlert({
            alertType: ALERT_TYPES.MONTHLY_RANKS,
            ...options
        });
    }
    
    // New challenge announcements
    async sendNewChallengeAlert(options) {
        return this.sendAnnouncementAlert({
            alertType: ALERT_TYPES.NEW_CHALLENGE,
            ...options
        });
    }
    
    // New arcade board announcements
    async sendNewArcadeBoardAlert(options) {
        return this.sendAnnouncementAlert({
            alertType: ALERT_TYPES.NEW_ARCADE_BOARD,
            ...options
        });
    }
    
    // New racing challenge announcements
    async sendNewRacingChallengeAlert(options) {
        return this.sendAnnouncementAlert({
            alertType: ALERT_TYPES.NEW_RACING_CHALLENGE,
            ...options
        });
    }
    
    // New tiebreaker announcements
    async sendNewTiebreakerAlert(options) {
        return this.sendAnnouncementAlert({
            alertType: ALERT_TYPES.NEW_TIEBREAKER,
            ...options
        });
    }
    
    // New arena challenge announcements
    async sendNewArenaChallengeAlert(options) {
        return this.sendAnnouncementAlert({
            alertType: ALERT_TYPES.NEW_ARENA_CHALLENGE,
            ...options
        });
    }
    
    // Mastery alerts
    async sendMasteryAlert(options) {
        return this.sendAchievementAlert({
            alertType: ALERT_TYPES.MASTERY,
            ...options
        });
    }
    
    // Beaten game alerts
    async sendBeatenAlert(options) {
        return this.sendAchievementAlert({
            alertType: ALERT_TYPES.BEATEN,
            ...options
        });
    }
    
    // Monthly award alerts
    async sendMonthlyAwardAlert(options) {
        return this.sendAchievementAlert({
            alertType: ALERT_TYPES.MONTHLY_AWARD,
            ...options
        });
    }
    
    // Shadow award alerts
    async sendShadowAwardAlert(options) {
        return this.sendAchievementAlert({
            alertType: ALERT_TYPES.SHADOW_AWARD,
            ...options
        });
    }
    
    // Racing award alerts
    async sendRacingAwardAlert(options) {
        return this.sendAchievementAlert({
            alertType: ALERT_TYPES.RACING_AWARD,
            ...options
        });
    }
    
    // Arcade award alerts
    async sendArcadeAwardAlert(options) {
        return this.sendAchievementAlert({
            alertType: ALERT_TYPES.ARCADE_AWARD,
            ...options
        });
    }
    
    // Arena award alerts
    async sendArenaAwardAlert(options) {
        return this.sendAchievementAlert({
            alertType: ALERT_TYPES.ARENA_AWARD,
            ...options
        });
    }
}

// Create and export singleton instance
const alertService = new AlertService();
export default alertService;
