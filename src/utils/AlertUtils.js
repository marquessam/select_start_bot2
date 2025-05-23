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

// Default channel IDs for each alert type
const DEFAULT_CHANNEL_IDS = {
    [ALERT_TYPES.ARCADE]: '1300941091335438471',    // Arcade alerts
    [ALERT_TYPES.ARENA]: '1373570850912997476',     // Arena alerts
    [ALERT_TYPES.MONTHLY]: '1313640664356880445',   // Monthly challenge updates
    [ALERT_TYPES.SHADOW]: '1300941091335438470',    // Shadow game updates
    [ALERT_TYPES.MASTERY]: '1362227906343997583',   // Mastery and Beaten achievements
    [ALERT_TYPES.ACHIEVEMENT]: null,                // Default achievement channel (configurable)
    [ALERT_TYPES.DEFAULT]: null                     // Global fallback
};

/**
 * Helper class for sending alerts to designated channels
 * Updated to support multiple alert channels per service
 */
export class AlertManager {
    constructor(client) {
        this.client = client;
        this.channelIds = { ...DEFAULT_CHANNEL_IDS };
    }
    
    setClient(client) {
        this.client = client;
        console.log('AlertUtils client configured');
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
        // Use config values if available, otherwise keep defaults
        try {
            this.channelIds = {
                ...DEFAULT_CHANNEL_IDS,
                [ALERT_TYPES.ARCADE]: config.discord.arcadeAlertsChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.ARCADE],
                [ALERT_TYPES.ARENA]: config.discord.arenaChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.ARENA],
                [ALERT_TYPES.MONTHLY]: config.discord.monthlyChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.MONTHLY],
                [ALERT_TYPES.SHADOW]: config.discord.shadowChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.SHADOW],
                [ALERT_TYPES.MASTERY]: config.discord.masteryChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.MASTERY],
                [ALERT_TYPES.ACHIEVEMENT]: config.discord.achievementChannelId || DEFAULT_CHANNEL_IDS[ALERT_TYPES.ACHIEVEMENT],
                [ALERT_TYPES.DEFAULT]: config.discord.defaultAlertsChannelId || this.channelIds[ALERT_TYPES.DEFAULT]
            };
            
            console.log('AlertUtils channels initialized from config');
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
        
        // Use override if provided
        if (overrideChannelId) {
            return this.getChannelById(overrideChannelId);
        }
        
        // Use the specified alert type's channel
        if (alertType && this.channelIds[alertType]) {
            return this.getChannelById(this.channelIds[alertType]);
        }
        
        // Fall back to default channel
        if (this.channelIds[ALERT_TYPES.DEFAULT]) {
            return this.getChannelById(this.channelIds[ALERT_TYPES.DEFAULT]);
        }
        
        console.warn(`No channel configured for alert type: ${alertType || 'default'}`);
        return null;
    }
    
    /**
     * Helper method to get a channel by ID
     * @private
     */
    async getChannelById(channelId) {
        if (!channelId) return null;
        
        try {
            const guild = await this.client.guilds.fetch(config.discord.guildId);
            if (!guild) return null;
            
            return await guild.channels.fetch(channelId);
        } catch (error) {
            console.error(`Error getting alerts channel ${channelId}:`, error);
            return null;
        }
    }
    
    /**
     * Send a standard alert for position/rank changes
     * @param {Object} options - Alert options
     * @param {string} alertType - The type of alert to send (determines channel)
     * @param {string} overrideChannelId - Optional specific channel ID to override default
     */
    async sendPositionChangeAlert(options, alertType = ALERT_TYPES.ARCADE, overrideChannelId = null) {
        const {
            title,
            description,
            changes = [],
            currentStandings = [],
            thumbnail = null,
            color = COLORS.WARNING,
            footer = null
        } = options;
        
        const channel = await this.getAlertsChannel(alertType, overrideChannelId);
        if (!channel) {
            console.log(`No alerts channel configured for type ${alertType}, skipping notification`);
            return;
        }
        
        // Create timestamp
        const timestamp = getDiscordTimestamp(new Date());
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor(color)
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
                
                changesText += `**@${change.username}** is now in ${rankEmoji} place!\n`;
            });
            
            embed.addFields({ 
                name: 'Position Changes', 
                value: changesText 
            });
        }
        
        // Add current standings if provided
        if (currentStandings && currentStandings.length > 0) {
            let standingsText = '';
            currentStandings.slice(0, 5).forEach(user => {
                const rankEmoji = user.rank <= 3 ? 
                    EMOJIS[`RANK_${user.rank}`] : 
                    `#${user.rank}`;
                
                standingsText += `${rankEmoji} **@${user.username}**: ${user.score || user.value}\n`;
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
        console.log(`Sent position change alert to ${channel.name} (${alertType}): "${title}"`);
    }
    
    /**
     * Send a standard alert for new achievements/awards
     * @param {Object} options - Alert options
     * @param {string} alertType - The type of alert to send (determines channel)
     * @param {string} overrideChannelId - Optional specific channel ID to override default
     */
    async sendAchievementAlert(options, alertType = null, overrideChannelId = null) {
        const {
            username,
            achievementTitle,
            achievementDescription,
            gameTitle,
            gameId,
            points = null,
            thumbnail = null,
            badgeUrl = null,
            color = COLORS.SUCCESS,
            isAward = false,
            isMastery = false,
            isBeaten = false
        } = options;
        
        // Determine the correct alert type based on the achievement properties
        let targetAlertType = alertType;
        
        if (!targetAlertType) {
            if (isMastery || isBeaten) {
                targetAlertType = ALERT_TYPES.MASTERY;
            } else if (isAward) {
                // Determine if it's a monthly or shadow award (would need additional context)
                targetAlertType = ALERT_TYPES.ACHIEVEMENT;
            } else {
                targetAlertType = ALERT_TYPES.ACHIEVEMENT;
            }
        }
        
        const channel = await this.getAlertsChannel(targetAlertType, overrideChannelId);
        if (!channel) {
            console.log(`No alerts channel configured for type ${targetAlertType}, skipping notification`);
            return;
        }
        
        // Create embed
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTimestamp();
        
        // Create title based on achievement or award
        if (isMastery) {
            embed.setTitle(`✨ ${username} Mastered a Game!`);
        } else if (isBeaten) {
            embed.setTitle(`⭐ ${username} Beaten a Game!`);
        } else if (isAward) {
            embed.setTitle(`🏆 ${username} earned an award!`);
        } else {
            embed.setTitle(`🎮 Achievement Unlocked!`);
        }
        
        // Create description
        const gameUrl = `https://retroachievements.org/game/${gameId}`;
        let description = '';
        
        if (isMastery) {
            description = `**${username}** has mastered **${gameTitle}**!\n` +
                         `They've earned every achievement in the game.`;
        } else if (isBeaten) {
            description = `**${username}** has beaten **${gameTitle}**!\n` +
                         `They've completed the core achievements.`;
        } else if (isAward) {
            description = `**${username}** has earned **${achievementTitle}**\n` +
                         `Game: [${gameTitle}](${gameUrl})`;
        } else {
            description = `**${username}** has unlocked **${achievementTitle}**\n` +
                         `Game: [${gameTitle}](${gameUrl})`;
        }
        
        embed.setDescription(description);
        
        // Add achievement description if available
        if (achievementDescription) {
            embed.addFields({ 
                name: 'Description', 
                value: `*${achievementDescription}*` 
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
        if (badgeUrl) {
            embed.setThumbnail(badgeUrl);
        } else if (thumbnail) {
            embed.setThumbnail(thumbnail);
        }
        
        // Send the alert
        await channel.send({ embeds: [embed] });
        console.log(`Sent ${targetAlertType} alert to ${channel.name} for ${username}: "${achievementTitle}"`);
    }
    
    /**
     * Send a mastery alert (convenience method)
     * @param {Object} options - Alert options
     * @param {string} overrideChannelId - Optional specific channel ID to override default
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
     * @param {Object} options - Alert options
     * @param {string} overrideChannelId - Optional specific channel ID to override default
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
     * @param {Object} options - Alert options
     * @param {string} overrideChannelId - Optional specific channel ID to override default
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
     * @param {Object} options - Alert options
     * @param {string} overrideChannelId - Optional specific channel ID to override default
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
