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
     * FIXED: Send position/rank change alert with ORIGINAL formatting
     */
    async sendRankChangeAlert(options) {
        const {
            alertType,
            gameTitle = null,
            gameId = null,
            leaderboardTitle = null,
            leaderboardId = null,
            changes = [],
            currentStandings = [],
            thumbnail = null,
            description = null,
            prizePool = null,
            challengeId = null,
            updateTime = null,
            monthName = null // NEW: For monthly challenge titles
        } = options;
        
        try {
            console.log(`AlertService: Sending rank change alert - Type: ${alertType}`);
            
            const channels = await this.getChannelsForAlert(alertType);
            if (channels.length === 0) {
                console.error(`AlertService: No channels found for alert type ${alertType}`);
                return;
            }
            
            const color = this.getAlertColor(alertType);
            const now = new Date();
            const timeString = updateTime || now.toLocaleString('en-US', {
                month: 'long',
                day: 'numeric', 
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            
            // FIXED: Set title based on alert type (ORIGINAL FORMAT)
            let title;
            let embedDescription;
            
            if (alertType === ALERT_TYPES.MONTHLY_RANKS) {
                // FIXED: Monthly challenge format (ORIGINAL FORMAT)
                const currentMonth = monthName || now.toLocaleString('en-US', { month: 'long' });
                title = `📊 ${currentMonth} Challenge Update!`;
                embedDescription = 'The leaderboard for **the monthly challenge** has been updated with enhanced tracking!';
            } else if (alertType === ALERT_TYPES.ARCADE_RANKS) {
                title = '🕹️ Arcade Alert!';
                if (gameTitle && gameId) {
                    const gameLink = LinkUtils.createGameLink(gameTitle, gameId);
                    embedDescription = `The leaderboard for ${gameLink} has been updated!`;
                } else {
                    embedDescription = 'The leaderboard has been updated!';
                }
            } else if (alertType === ALERT_TYPES.ARENA_RANKS) {
                title = '🏟️ Arena Alert!';
                if (leaderboardTitle && leaderboardId) {
                    const leaderboardLink = LinkUtils.createLeaderboardLink(leaderboardTitle, leaderboardId);
                    embedDescription = `The leaderboard for ${leaderboardLink} has been updated!`;
                } else if (gameTitle && gameId) {
                    const gameLink = LinkUtils.createGameLink(gameTitle, gameId);
                    embedDescription = `The leaderboard for ${gameLink} has been updated!`;
                } else {
                    embedDescription = 'The leaderboard has been updated!';
                }
            } else {
                title = 'Leaderboard Update!';
                embedDescription = 'The leaderboard has been updated!';
            }
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(embedDescription)
                .setTimestamp();
            
            // FIXED: Add time field (ORIGINAL FORMAT)
            embed.addFields({
                name: 'Time',
                value: timeString,
                inline: false
            });
            
            // FIXED: Arena-specific fields (ORIGINAL FORMAT)
            if (alertType === ALERT_TYPES.ARENA_RANKS) {
                if (description) {
                    embed.addFields({
                        name: 'Description',
                        value: description,
                        inline: false
                    });
                }
                
                if (prizePool) {
                    embed.addFields({
                        name: 'Prize Pool',
                        value: prizePool,
                        inline: false
                    });
                }
            }
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            // FIXED: Add position changes with proper emoji format (ORIGINAL FORMAT)
            if (changes && changes.length > 0) {
                let changesText = '';
                changes.forEach(change => {
                    const userLink = LinkUtils.createUserLink(change.username);
                    let rankEmoji;
                    if (change.newRank === 1) rankEmoji = '🥇';
                    else if (change.newRank === 2) rankEmoji = '🥈';
                    else if (change.newRank === 3) rankEmoji = '🥉';
                    else rankEmoji = `#${change.newRank}`;
                    
                    changesText += `${userLink} is now in ${rankEmoji} place!\n`;
                });
                
                embed.addFields({ 
                    name: 'Position Changes', 
                    value: changesText,
                    inline: false
                });
            }
            
            // FIXED: Add current standings with proper format (ORIGINAL FORMAT)
            if (currentStandings && currentStandings.length > 0) {
                const sortedStandings = [...currentStandings]
                    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
                
                let standingsText = '';
                sortedStandings.slice(0, 5).forEach((user, index) => {
                    let rankEmoji;
                    if (user.rank === 1) rankEmoji = '🥇';
                    else if (user.rank === 2) rankEmoji = '🥈';
                    else if (user.rank === 3) rankEmoji = '🥉';
                    else rankEmoji = `🔹`;
                    
                    const userLink = LinkUtils.createUserLink(user.username);
                    
                    // FIXED: Monthly challenge format shows achievements and tiebreakers (ORIGINAL FORMAT)
                    if (alertType === ALERT_TYPES.MONTHLY_RANKS) {
                        if (user.achievementCount && user.totalAchievements) {
                            const percentage = ((user.achievementCount / user.totalAchievements) * 100).toFixed(2);
                            standingsText += `${rankEmoji} ${userLink}: ${user.achievementCount}/${user.totalAchievements} achievements (${percentage}%)\n`;
                        } else {
                            standingsText += `${rankEmoji} ${userLink}: ${user.score || ''}\n`;
                        }
                        
                        // Add tiebreaker info if available
                        if (user.tiebreakerInfo) {
                            standingsText += `🥈 Tiebreaker: ${user.tiebreakerInfo}\n`;
                        }
                        
                        // Add ranking number for lower positions
                        if (user.rank > 3) {
                            standingsText += `#${index + 1} ${userLink}: ${user.score || ''}\n`;
                        }
                    } else {
                        // Regular format for arcade/arena
                        const globalRank = user.globalRank ? ` (Global: #${user.globalRank})` : '';
                        const score = user.score || user.value || '';
                        standingsText += `${rankEmoji} ${userLink}: ${score}${globalRank}\n`;
                    }
                });
                
                embed.addFields({ 
                    name: 'Current Top 5', 
                    value: standingsText,
                    inline: false
                });
            }
            
            // FIXED: Add footer based on alert type (ORIGINAL FORMAT)
            let footerText;
            if (alertType === ALERT_TYPES.MONTHLY_RANKS) {
                const shortDate = now.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric'
                });
                const shortTime = now.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                footerText = `Alerts sent hourly • Leaderboard updates every 15 minutes • Data from RetroAchievements • Today at ${shortTime}`;
            } else if (alertType === ALERT_TYPES.ARCADE_RANKS) {
                const shortDate = now.toLocaleDateString('en-US', {
                    month: 'numeric',
                    day: 'numeric',
                    year: 'numeric'
                });
                const shortTime = now.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                footerText = `Data provided by RetroAchievements • Rankings update hourly • ${shortDate} ${shortTime}`;
            } else if (alertType === ALERT_TYPES.ARENA_RANKS && challengeId) {
                const shortDate = now.toLocaleDateString('en-US', {
                    month: 'numeric',
                    day: 'numeric',
                    year: 'numeric'
                });
                const shortTime = now.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                footerText = `Challenge ID: ${challengeId} • Data from RetroAchievements.org • ${shortDate} ${shortTime}`;
            } else {
                footerText = 'Data provided by RetroAchievements';
            }
            
            embed.setFooter({ text: footerText });
            
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
            color = null,
            gpEarned = null // NEW: For mastery/beaten GP awards
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
            
            // FIXED: Handle mastery/beaten alerts differently (ORIGINAL FORMAT)
            if (alertType === ALERT_TYPES.MASTERY || alertType === ALERT_TYPES.BEATEN) {
                const gameLink = gameTitle && gameId ? 
                    LinkUtils.createGameLink(gameTitle, gameId) : gameTitle;
                const userLink = LinkUtils.createUserLink(username);
                
                const masteryTitle = alertType === ALERT_TYPES.MASTERY ? 
                    `✨ ${username} has mastered a game!` : 
                    `⭐ ${username} has beaten a game!`;
                
                const masteryDescription = alertType === ALERT_TYPES.MASTERY ?
                    `${userLink} has mastered ${gameLink}! They've earned every achievement in the game.` :
                    `${userLink} has beaten ${gameLink}! They've completed the core achievements.`;
                
                const embed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle(masteryTitle)
                    .setDescription(masteryDescription)
                    .setTimestamp();
                
                if (thumbnail) {
                    embed.setThumbnail(thumbnail);
                }
                
                // FIXED: Add divider and GP section (ORIGINAL FORMAT)
                if (gpEarned) {
                    embed.addFields({
                        name: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                        value: `🏆 +${gpEarned} GP earned!`,
                        inline: false
                    });
                }
                
                // FIXED: Add time at bottom (ORIGINAL FORMAT)
                const timeString = new Date().toLocaleString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                
                embed.addFields({
                    name: '\u200b', // Invisible character for spacing
                    value: `Today at ${timeString}`,
                    inline: false
                });
                
                // Send to all target channels
                for (const channel of channels) {
                    await channel.send({ embeds: [embed] });
                    console.log(`AlertService: Sent mastery/beaten alert to ${channel.name}`);
                }
                
                return;
            }
            
            // REGULAR ACHIEVEMENT FORMATTING (ORIGINAL FORMAT)
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
    
    // FIXED: Arcade rank changes with proper parameters
    async sendArcadeRankAlert(options) {
        return this.sendRankChangeAlert({
            alertType: ALERT_TYPES.ARCADE_RANKS,
            ...options
        });
    }
    
    // FIXED: Arena rank changes with proper parameters  
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
