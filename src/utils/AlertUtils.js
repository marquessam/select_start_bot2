// src/utils/AlertUtils.js
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';
import { COLORS, EMOJIS, getDiscordTimestamp } from './FeedUtils.js';

// Alert type constants for different services
export const ALERT_TYPES = {
    ARCADE: 'arcade',
    ARENA: 'arena',
    MONTHLY: 'monthly',
    SHADOW: 'shadow',
    MASTERY: 'mastery',
    ACHIEVEMENT: 'achievement',
    DEFAULT: 'default'
};

// Color mapping for different alert types (matching achievement feed)
const ALERT_COLORS = {
    [ALERT_TYPES.ARCADE]: '#3498DB',    // Blue for arcade
    [ALERT_TYPES.ARENA]: '#FF5722',     // Red for arena  
    [ALERT_TYPES.MONTHLY]: '#9B59B6',   // Purple for monthly
    [ALERT_TYPES.SHADOW]: '#000000',    // Black for shadow
    [ALERT_TYPES.MASTERY]: '#FFD700',   // Gold for mastery
    [ALERT_TYPES.ACHIEVEMENT]: '#808080', // Grey for regular achievements
    [ALERT_TYPES.DEFAULT]: '#808080'    // Grey for default
};

// Default channel IDs for each alert type
const DEFAULT_CHANNEL_IDS = {
    [ALERT_TYPES.ARCADE]: '1300941091335438471',    // Arcade alerts
    [ALERT_TYPES.ARENA]: '1373570850912997476',     // Arena alerts  
    [ALERT_TYPES.MONTHLY]: '1313640664356880445',   // Monthly challenge updates
    [ALERT_TYPES.SHADOW]: '1300941091335438470',    // Shadow game updates
    [ALERT_TYPES.MASTERY]: '1362227906343997583',   // Mastery and Beaten achievements
    [ALERT_TYPES.ACHIEVEMENT]: '1362227906343997583', // Default achievement channel (same as mastery)
    [ALERT_TYPES.DEFAULT]: '1362227906343997583'    // Global fallback (same as mastery)
};

/**
 * Helper function to create user profile link
 */
function createUserProfileLink(username) {
    return `[${username}](https://retroachievements.org/user/${username})`;
}

/**
 * Helper function to create game link
 */
function createGameLink(gameTitle, gameId) {
    if (!gameId) return gameTitle;
    return `[${gameTitle}](https://retroachievements.org/game/${gameId})`;
}

/**
 * Helper class for sending alerts to designated channels
 * Updated to support multiple alert channels per service and proper color coding
 */
export class AlertManager {
    constructor(client) {
        this.client = client;
        this.channelIds = { ...DEFAULT_CHANNEL_IDS };
        
        console.log('AlertManager initialized with channels:', this.channelIds);
    }
    
    setClient(client) {
        this.client = client;
        console.log('AlertUtils client configured');
    }
    
    /**
     * Get the appropriate color for an alert type
     */
    getColorForAlertType(alertType) {
        return ALERT_COLORS[alertType] || ALERT_COLORS[ALERT_TYPES.DEFAULT];
    }
    
    /**
     * Legacy method for backward compatibility
     * @param {string} channelId - Channel ID to set as default
     */
    setAlertsChannel(channelId) {
        this.channelIds[ALERT_TYPES.DEFAULT] = channelId;
        console.log(`AlertUtils default channel set to ${channelId}`);
    }
    
    /**
     * Set a specific alert channel for a given type
     * @param {string} alertType - Type of alert (use ALERT_TYPES constants)
     * @param {string} channelId - Channel ID to use for this alert type
     */
    setChannelForAlertType(alertType, channelId) {
        if (!alertType) return;
        
        this.channelIds[alertType] = channelId;
        console.log(`AlertUtils channel for ${alertType} set to ${channelId}`);
    }
    
    /**
     * Set multiple alert channels at once
     * @param {Object} channelMapping - Mapping of alert types to channel IDs
     */
    setAlertChannels(channelMapping) {
        if (!channelMapping) return;
        
        for (const [type, id] of Object.entries(channelMapping)) {
            this.channelIds[type] = id;
        }
        console.log(`AlertUtils configured with ${Object.keys(channelMapping).length} channels`);
    }
    
    /**
     * Initialize alert channels from environment or config
     * This should be called once during bot startup
     */
    initializeFromConfig() {
        try {
            const originalChannels = { ...this.channelIds };
            
            this.channelIds = {
                ...DEFAULT_CHANNEL_IDS,
                [ALERT_TYPES.ARCADE]: config.discord.arcadeAlertsChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.ARCADE],
                [ALERT_TYPES.ARENA]: config.discord.arenaChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.ARENA],
                [ALERT_TYPES.MONTHLY]: config.discord.monthlyChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.MONTHLY],
                [ALERT_TYPES.SHADOW]: config.discord.shadowChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.SHADOW],
                [ALERT_TYPES.MASTERY]: config.discord.masteryChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.MASTERY],
                [ALERT_TYPES.ACHIEVEMENT]: config.discord.achievementChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.ACHIEVEMENT],
                [ALERT_TYPES.DEFAULT]: config.discord.defaultAlertsChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.DEFAULT]
            };
            
            console.log('AlertUtils channels initialized from config');
            console.log('Channel mappings:', this.channelIds);
        } catch (error) {
            console.error('Error initializing AlertUtils channels from config:', error);
        }
    }
    
    /**
     * Get the appropriate channel for an alert type
     * @param {string} alertType - Type of alert to get channel for
     * @param {string} overrideChannelId - Optional specific channel ID to override defaults
     * @returns {Promise<Discord.TextChannel|null>} - The channel object or null if not found
     */
    async getAlertsChannel(alertType = null, overrideChannelId = null) {
        if (!this.client) {
            console.error('AlertUtils: Discord client not set');
            return null;
        }
        
        let channelId = null;
        
        if (overrideChannelId) {
            channelId = overrideChannelId;
            console.log(`Using override channel: ${channelId}`);
        } else if (alertType && this.channelIds[alertType]) {
            channelId = this.channelIds[alertType];
            console.log(`Using ${alertType} channel: ${channelId}`);
        } else if (this.channelIds[ALERT_TYPES.DEFAULT]) {
            channelId = this.channelIds[ALERT_TYPES.DEFAULT];
            console.log(`Using default channel: ${channelId}`);
        }
        
        if (!channelId) {
            console.warn(`No channel configured for alert type: ${alertType || 'default'}`);
            return null;
        }
        
        return this.getChannelById(channelId);
    }
    
    /**
     * Helper method to get a channel by ID
     * @private
     */
    async getChannelById(channelId) {
        if (!channelId) return null;
        
        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) {
                console.error(`Guild not found: ${config.discord.guildId}`);
                return null;
            }
            
            const channel = await guild.channels.fetch(channelId);
            if (!channel) {
                console.error(`Channel not found: ${channelId}`);
                return null;
            }
            
            console.log(`Successfully fetched channel: ${channel.name} (${channelId})`);
            return channel;
        } catch (error) {
            console.error(`Error getting alerts channel ${channelId}:`, error);
            return null;
        }
    }
    
    /**
     * Send a standard alert for position/rank changes
     * @param {Object} options - Alert options
     * @param {string} alertType - The type of alert to send (determines channel and color)
     * @param {string} overrideChannelId - Optional specific channel ID to override default
     */
    async sendPositionChangeAlert(options, alertType = ALERT_TYPES.ARCADE, overrideChannelId = null) {
        try {
            console.log(`Sending position change alert - Type: ${alertType}, Override: ${overrideChannelId || 'none'}`);
            
            const {
                title,
                description,
                changes = [],
                currentStandings = [],
                thumbnail = null,
                color = null, // Will be overridden by alert type color
                footer = null
            } = options;
            
            const channel = await this.getAlertsChannel(alertType, overrideChannelId);
            if (!channel) {
                console.error(`No alerts channel found for type ${alertType}, skipping notification`);
                return;
            }
            
            console.log(`Sending position change alert to channel: ${channel.name} (${channel.id})`);
            
            // Use alert type specific color, or fallback to provided color
            const alertColor = this.getColorForAlertType(alertType);
            
            // Create timestamp
            const timestamp = getDiscordTimestamp(new Date());
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(alertColor)
                .setTitle(title)
                .setDescription(`${description}\n**Time:** ${timestamp}`)
                .setTimestamp();
            
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }
            
            // Add position changes if any exist
            if (changes && changes.length > 0) {
                let changesText = '';
                changes.forEach(change => {
                    let rankEmoji = '';
                    if (change.newRank && change.newRank <= 3) {
                        rankEmoji = EMOJIS[`RANK_${change.newRank}`];
                    } else {
                        rankEmoji = `#${change.newRank || ''}`;
                    }
                    
                    // UPDATED: Add user profile link
                    const userLink = createUserProfileLink(change.username);
                    changesText += `${userLink} is now in ${rankEmoji} place!\n`;
                });
                
                embed.addFields({ 
                    name: 'Position Changes', 
                    value: changesText 
                });
            }
            
            // Add current standings if provided - SORTED BY RANK
            if (currentStandings && currentStandings.length > 0) {
                // Sort by rank (lower is better)
                const sortedStandings = [...currentStandings]
                    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
                
                let standingsText = '';
                sortedStandings.slice(0, 5).forEach(user => {
                    const rankEmoji = user.rank <= 3 ? 
                        EMOJIS[`RANK_${user.rank}`] : 
                        `#${user.rank}`;
                    
                    // Show global rank in parentheses if available
                    const globalRank = user.globalRank ? ` (Global: #${user.globalRank})` : '';
                    
                    // Handle multi-line scores (like those with tiebreaker info)
                    const scoreLines = (user.score || user.value).split('\n');
                    const primaryScore = scoreLines[0];
                    const secondaryInfo = scoreLines.slice(1).join('\n');
                    
                    // UPDATED: Add user profile link
                    const userLink = createUserProfileLink(user.username);
                    standingsText += `${rankEmoji} ${userLink}: ${primaryScore}${globalRank}\n`;
                    
                    // Add secondary information (like tiebreaker) with proper indentation
                    if (secondaryInfo.trim()) {
                        // Indent the secondary information slightly
                        standingsText += `   ${secondaryInfo}\n`;
                    }
                });
                
                embed.addFields({ 
                    name: 'Current Top 5', 
                    value: standingsText 
                });
            }
                
            // Add footer if provided
            if (footer) {
                embed.setFooter(footer);
            } else {
                embed.setFooter({ 
                    text: 'Rankings update regularly. Check the feed channel for full standings.' 
                });
            }
            
            // Send the alert
            await channel.send({ embeds: [embed] });
            console.log(`Successfully sent position change alert to ${channel.name} (${alertType}): "${title}"`);
        } catch (error) {
            console.error(`Error sending position change alert (${alertType}):`, error);
        }
    }
        
    /**
     * FIXED: Send a standard alert for new achievements/awards with proper description handling
     * @param {Object} options - Alert options
     * @param {string} alertType - The type of alert to send (determines channel)
     * @param {string} overrideChannelId - Optional specific channel ID to override default
     */
    async sendAchievementAlert(options, alertType = null, overrideChannelId = null) {
        try {
            const {
                username,
                achievementTitle,
                achievementDescription, // This contains the GP info from gameAwardService!
                gameTitle,
                gameId,
                points = null,
                thumbnail = null,
                badgeUrl = null,
                color = null, // Will be overridden by alert type color
                isAward = false,
                isMastery = false,
                isBeaten = false
            } = options;
            
            // Determine the correct alert type based on explicit parameter first
            let targetAlertType = alertType;
            
            if (!targetAlertType) {
                if (isMastery || isBeaten) {
                    targetAlertType = ALERT_TYPES.MASTERY;
                } else if (isAward) {
                    targetAlertType = ALERT_TYPES.ACHIEVEMENT;
                } else {
                    targetAlertType = ALERT_TYPES.ACHIEVEMENT;
                }
            }
            
            console.log(`Sending achievement alert - Type: ${targetAlertType}, Override: ${overrideChannelId || 'none'}`);
            
            const channel = await this.getAlertsChannel(targetAlertType, overrideChannelId);
            if (!channel) {
                console.error(`No alerts channel found for type ${targetAlertType}, skipping notification`);
                return;
            }
            
            console.log(`Sending achievement alert to channel: ${channel.name} (${channel.id})`);
            
            // Use alert type specific color
            const alertColor = this.getColorForAlertType(targetAlertType);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor(alertColor)
                .setTimestamp();
            
            // Create title based on achievement or award with proper text
            if (isMastery) {
                embed.setTitle(`✨ ${username} has mastered a game!`);
            } else if (isBeaten) {
                embed.setTitle(`⭐ ${username} has beaten a game!`);
            } else if (isAward) {
                embed.setTitle(`🏆 ${username} earned an award!`);
            } else {
                embed.setTitle(`🎮 Achievement Unlocked!`);
            }
            
            // FIXED: Use the passed achievementDescription if provided (contains GP info),
            // otherwise create our own description
            let description = '';
            
            if (achievementDescription) {
                // Use the description passed from gameAwardService (includes GP info)
                description = achievementDescription;
            } else {
                // Fallback: create our own description for other cases
                const userLink = createUserProfileLink(username);
                const gameLink = createGameLink(gameTitle, gameId);
                
                if (isMastery) {
                    description = `${userLink} has mastered ${gameLink}!\n` +
                                 `They've earned every achievement in the game.`;
                } else if (isBeaten) {
                    description = `${userLink} has beaten ${gameLink}!\n` +
                                 `They've completed the core achievements.`;
                } else if (isAward) {
                    description = `${userLink} has earned **${achievementTitle}**\n` +
                                 `Game: ${gameLink}`;
                } else {
                    description = `${userLink} has unlocked **${achievementTitle}**\n` +
                                 `Game: ${gameLink}`;
                }
            }
            
            embed.setDescription(description);
            
            // Add achievement description if available (and not already used as main description)
            if (!achievementDescription && achievementTitle && !isAward && !isMastery && !isBeaten) {
                embed.addFields({ 
                    name: 'Description', 
                    value: `*${achievementTitle}*` 
                });
            }
            
            // Add points if available
            if (points) {
                embed.addFields({ 
                    name: 'Points', 
                    value: `${points}` 
                });
            }
            
            // Set thumbnail (game icon) or badge image
            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            } else if (badgeUrl) {
                embed.setThumbnail(badgeUrl);
            }
            
            // Send the alert
            await channel.send({ embeds: [embed] });
            console.log(`Successfully sent ${targetAlertType} alert to ${channel.name} for ${username}: "${achievementTitle}"`);
        } catch (error) {
            console.error(`Error sending achievement alert (${alertType}):`, error);
        }
    }
    
    /**
     * Send a mastery alert (convenience method)
     */
    async sendMasteryAlert(options, overrideChannelId = null) {
        return this.sendAchievementAlert(
            { ...options, isMastery: true },
            ALERT_TYPES.MASTERY,
            overrideChannelId
        );
    }
    
    /**
     * Send a beaten game alert (convenience method)
     */
    async sendBeatenAlert(options, overrideChannelId = null) {
        return this.sendAchievementAlert(
            { ...options, isBeaten: true },
            ALERT_TYPES.MASTERY,
            overrideChannelId
        );
    }
    
    /**
     * Send a monthly challenge award alert (convenience method)
     */
    async sendMonthlyAwardAlert(options, overrideChannelId = null) {
        return this.sendAchievementAlert(
            { ...options, isAward: true },
            ALERT_TYPES.MONTHLY,
            overrideChannelId
        );
    }
    
    /**
     * Send a shadow challenge award alert (convenience method)
     */
    async sendShadowAwardAlert(options, overrideChannelId = null) {
        return this.sendAchievementAlert(
            { ...options, isAward: true },
            ALERT_TYPES.SHADOW,
            overrideChannelId
        );
    }
}

// Create singleton instance
const alertManager = new AlertManager();

// Initialize channels from config when imported
alertManager.initializeFromConfig();

export default alertManager;
